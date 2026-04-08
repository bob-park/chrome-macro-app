import { resolveElement } from '../shared/selector';
import type { SelectorSet } from '../shared/types';

let intervalId: ReturnType<typeof setInterval> | null = null;
let clickCount = 0;
let maxClicks = 0; // 0 = unlimited

function startClicking(selectorSet: SelectorSet, intervalMs: number, repeatCount: number) {
  stopClicking();
  clickCount = 0;
  maxClicks = repeatCount;

  const doClick = () => {
    const result = resolveElement(selectorSet);

    if (!result) {
      chrome.runtime.sendMessage({
        type: 'STEP_FAILED',
        reason: 'Element not found on page',
      });
      stopClicking();
      return;
    }

    const el = result.element;

    // Scroll into view if needed
    el.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Dispatch synthetic event sequence
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const commonInit: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
    };

    el.dispatchEvent(new PointerEvent('pointerdown', { ...commonInit, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', commonInit));
    el.dispatchEvent(new PointerEvent('pointerup', { ...commonInit, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', commonInit));
    el.dispatchEvent(new MouseEvent('click', commonInit));

    clickCount++;

    // Report progress
    chrome.runtime.sendMessage({
      type: 'CLICK_UPDATE',
      clickCount,
    });

    // Check repeat limit
    if (maxClicks > 0 && clickCount >= maxClicks) {
      stopClicking();
      chrome.runtime.sendMessage({ type: 'MACRO_STOPPED' });
    }
  };

  // First click immediately
  doClick();

  // Then repeat at interval
  intervalId = setInterval(doClick, intervalMs);
}

function stopClicking() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'START_MACRO') {
    const { selectorSet, clickIntervalMs, repeatCount } = msg.config;
    startClicking(selectorSet, clickIntervalMs, repeatCount);
    sendResponse({ ok: true });
  } else if (msg.type === 'STOP_MACRO') {
    stopClicking();
    sendResponse({ ok: true, clickCount });
  } else if (msg.type === 'GET_CLICK_COUNT') {
    sendResponse({ clickCount, running: intervalId !== null });
  }
  return true;
});

// Self-start on load: check storage for active macro state.
// This handles page reload — content script is freshly injected and
// the service worker's sendMessage may arrive before we're ready (race condition).
// By reading storage directly, we don't depend on message timing.
(async () => {
  try {
    const result = await chrome.storage.local.get('activeState');
    const state = result.activeState;
    if (state?.running && state.selectorSet) {
      // Calculate remaining clicks if repeat count is set
      const remaining = state.repeatCount > 0
        ? Math.max(0, state.repeatCount - (state.clickCount || 0))
        : 0;

      // Don't start if all repeats already done
      if (state.repeatCount > 0 && remaining <= 0) return;

      startClicking(state.selectorSet, state.clickIntervalMs, remaining);
    }
  } catch {
    // Storage read failed, skip self-start
  }
})();
