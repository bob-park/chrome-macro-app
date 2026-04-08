import { getActiveState, setActiveState, clearActiveState } from '../shared/storage';
import type { ActiveState, Message } from '../shared/types';

const REFRESH_ALARM = 'macro-refresh';

// ---- Message handling ----

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // async response
});

async function handleMessage(msg: Message, sender: chrome.runtime.MessageSender) {
  switch (msg.type) {
    case 'START_PICKING': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // Content scripts are already injected via manifest.
      // Tell picker to activate.
      await chrome.tabs.sendMessage(tab.id, { type: 'START_PICKING' });
      return { ok: true };
    }

    case 'ELEMENT_PICKED': {
      // Store picked element in active state
      await setActiveState({
        selectorSet: msg.selectorSet,
        targetUrl: msg.url,
      });
      // Broadcast to popup
      broadcastStateUpdate();
      return { ok: true };
    }

    case 'CANCEL_PICKING': {
      return { ok: true };
    }

    case 'START_MACRO': {
      const config = msg.config;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { ok: false, error: 'No active tab' };

      // Update active state
      await setActiveState({
        configId: null,
        tabId: tab.id,
        running: true,
        clickCount: 0,
        refreshCount: 0,
        startedAt: Date.now(),
        selectorSet: config.selectorSet,
        clickIntervalMs: config.clickIntervalMs,
        refreshIntervalSec: config.refreshIntervalSec,
        refreshEnabled: config.refreshEnabled,
        repeatCount: config.repeatCount,
        targetUrl: config.targetUrl,
      });

      // Inject clicker and start
      await injectAndStartClicker(tab.id, config);

      // Set up refresh alarm if enabled
      if (config.refreshEnabled && config.refreshIntervalSec > 0) {
        await chrome.alarms.create(REFRESH_ALARM, {
          periodInMinutes: config.refreshIntervalSec / 60,
        });
      }

      broadcastStateUpdate();
      return { ok: true };
    }

    case 'STOP_MACRO': {
      await stopMacro();
      return { ok: true };
    }

    case 'CLICK_UPDATE': {
      await setActiveState({ clickCount: msg.clickCount });
      broadcastStateUpdate();
      return { ok: true };
    }

    case 'MACRO_STOPPED': {
      await setActiveState({ running: false });
      await chrome.alarms.clear(REFRESH_ALARM);
      broadcastStateUpdate();
      return { ok: true };
    }

    case 'STEP_FAILED': {
      await setActiveState({ running: false });
      await chrome.alarms.clear(REFRESH_ALARM);
      // Set badge to indicate error
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
      broadcastStateUpdate();
      return { ok: true };
    }

    case 'GET_STATE': {
      const state = await getActiveState();
      return { state };
    }

    default:
      return { ok: false };
  }
}

// ---- Clicker injection ----

async function injectAndStartClicker(
  tabId: number,
  config: { selectorSet: any; clickIntervalMs: number; repeatCount: number }
) {
  // Content scripts are already injected via manifest.
  // Send start message to clicker.
  await chrome.tabs.sendMessage(tabId, {
    type: 'START_MACRO',
    config: {
      selectorSet: config.selectorSet,
      clickIntervalMs: config.clickIntervalMs,
      repeatCount: config.repeatCount,
    },
  });

  // Set running badge
  chrome.action.setBadgeText({ text: '▶' });
  chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
}

// ---- Stop macro ----

async function stopMacro() {
  const state = await getActiveState();

  if (state.tabId) {
    try {
      await chrome.tabs.sendMessage(state.tabId, { type: 'STOP_MACRO' });
    } catch {
      // Tab may have been closed
    }
  }

  await chrome.alarms.clear(REFRESH_ALARM);
  await setActiveState({ running: false });

  chrome.action.setBadgeText({ text: '' });
  broadcastStateUpdate();
}

// ---- Refresh alarm ----

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM) return;

  const state = await getActiveState();
  if (!state.running || !state.tabId || !state.refreshEnabled) {
    await chrome.alarms.clear(REFRESH_ALARM);
    return;
  }

  // Increment refresh count
  await setActiveState({ refreshCount: state.refreshCount + 1 });

  // Reload the tab
  await chrome.tabs.reload(state.tabId);
});

// ---- Re-start clicker after page load (post-refresh) ----
// The content script (clicker.ts) self-starts by reading storage on load.
// This listener is a backup: if the self-start didn't happen (e.g. script
// loaded before storage was written), we send the message with retries.

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;

  const state = await getActiveState();
  if (!state.running || state.tabId !== tabId || !state.selectorSet) return;

  const config = {
    selectorSet: state.selectorSet,
    clickIntervalMs: state.clickIntervalMs,
    repeatCount: state.repeatCount > 0
      ? Math.max(0, state.repeatCount - state.clickCount)
      : 0,
  };

  // Retry with delay — content script may not be ready yet
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Check if clicker already running (self-started from storage)
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'GET_CLICK_COUNT' });
      if (resp?.running) {
        // Already self-started, just update badge
        chrome.action.setBadgeText({ text: '▶' });
        chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
        return;
      }
      // Not running — send start command
      await chrome.tabs.sendMessage(tabId, { type: 'START_MACRO', config });
      chrome.action.setBadgeText({ text: '▶' });
      chrome.action.setBadgeBackgroundColor({ color: '#2e7d32' });
      return;
    } catch {
      // Content script not ready yet, wait and retry
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
});

// ---- Service worker startup: check for interrupted macro ----

async function onStartup() {
  const state = await getActiveState();
  if (state.running && state.tabId && state.selectorSet) {
    // Try to resume
    try {
      const tab = await chrome.tabs.get(state.tabId);
      if (tab) {
        await injectAndStartClicker(state.tabId, {
          selectorSet: state.selectorSet,
          clickIntervalMs: state.clickIntervalMs,
          repeatCount: state.repeatCount > 0
            ? Math.max(0, state.repeatCount - state.clickCount)
            : 0,
        });

        if (state.refreshEnabled && state.refreshIntervalSec > 0) {
          await chrome.alarms.create(REFRESH_ALARM, {
            periodInMinutes: state.refreshIntervalSec / 60,
          });
        }
      }
    } catch {
      // Tab was closed or not accessible, clear state
      await clearActiveState();
      chrome.action.setBadgeText({ text: '' });
    }
  }
}

// ---- Broadcast state to popup ----

async function broadcastStateUpdate() {
  const state = await getActiveState();
  try {
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state });
  } catch {
    // Popup may not be open
  }
}

// Run startup check
onStartup();
