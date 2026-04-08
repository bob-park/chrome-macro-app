import type { ActiveState, MacroConfig, SelectorSet, Message } from '../shared/types';
import { DEFAULT_ACTIVE_STATE } from '../shared/types';
import { getAllConfigs, saveConfig, deleteConfig, generateId } from '../shared/storage';

// ---- State ----

let state: ActiveState = { ...DEFAULT_ACTIVE_STATE };
let currentTab: 'setup' | 'saved' = 'setup';
let savedConfigs: MacroConfig[] = [];

// Settings (local to popup, synced on start/save)
let clickIntervalMs = 500;
let refreshIntervalSec = 30;
let refreshEnabled = false;
let repeatCount = 0;

// ---- Init ----

async function init() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (resp?.state) {
    state = resp.state;
    clickIntervalMs = state.clickIntervalMs || 500;
    refreshIntervalSec = state.refreshIntervalSec || 30;
    refreshEnabled = state.refreshEnabled || false;
    repeatCount = state.repeatCount || 0;
  }
  savedConfigs = await getAllConfigs();
  render();

  // Listen for state updates from service worker
  chrome.runtime.onMessage.addListener((msg: Message) => {
    if (msg.type === 'STATE_UPDATE') {
      state = msg.state;
      render();
    }
  });

  // Update timer every second when running
  setInterval(() => {
    if (state.running && state.startedAt) {
      render();
    }
  }, 1000);
}

// ---- Render ----

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  // Header
  app.appendChild(renderHeader());

  // Tabs
  app.appendChild(renderTabs());

  // Body
  if (currentTab === 'setup') {
    app.appendChild(renderSetupTab());
  } else {
    app.appendChild(renderSavedTab());
  }

  // Action area
  app.appendChild(renderActionArea());

  // Bind events
  bindEvents();
}

function renderHeader(): HTMLElement {
  const header = el('div', 'header');
  const left = el('div', 'header-left');
  left.innerHTML = `<span class="logo">M</span><h1>Macro Clicker</h1>`;

  const statusClass = state.running ? 'running' : (state.selectorSet ? 'ready' : 'idle');
  const statusText = state.running ? '● Running' : (state.selectorSet ? 'Ready' : 'Idle');
  const badge = el('span', `status-badge ${statusClass}`);
  badge.textContent = statusText;

  header.appendChild(left);
  header.appendChild(badge);
  return header;
}

function renderTabs(): HTMLElement {
  const tabs = el('div', 'tabs');

  const setupTab = el('button', `tab ${currentTab === 'setup' ? 'active' : ''}`);
  setupTab.textContent = 'Setup';
  setupTab.dataset.tab = 'setup';

  const savedTab = el('button', `tab ${currentTab === 'saved' ? 'active' : ''}`);
  savedTab.textContent = `Saved (${savedConfigs.length})`;
  savedTab.dataset.tab = 'saved';

  tabs.appendChild(setupTab);
  tabs.appendChild(savedTab);
  return tabs;
}

function renderSetupTab(): HTMLElement {
  const body = el('div', 'body');

  if (state.running) {
    // Running state
    body.appendChild(renderRunningStats());
    body.appendChild(renderSettingsReadonly());
  } else {
    // Setup state
    body.appendChild(renderSelectorSection());
    body.appendChild(renderSettingsSection());
  }

  return body;
}

function renderSelectorSection(): HTMLElement {
  const section = el('div', 'section');
  const title = el('div', 'section-title');
  title.textContent = 'Target Element';
  section.appendChild(title);

  const box = el('div', `selector-box ${state.selectorSet ? 'selected' : ''}`);

  if (state.selectorSet) {
    const preview = el('div', 'el-preview');
    const tag = el('span', 'el-tag');
    tag.textContent = state.selectorSet.tagName;
    preview.appendChild(tag);
    const text = document.createTextNode(
      state.selectorSet.textContent?.slice(0, 30) || state.selectorSet.css.split(' > ').pop() || ''
    );
    preview.appendChild(text);

    const path = el('div', 'selector-path');
    path.textContent = state.selectorSet.css;

    const actions = el('div', 'selector-actions');
    const repickBtn = el('button', 're-pick');
    repickBtn.textContent = '🎯 Re-pick';
    repickBtn.id = 'repick-btn';
    const testBtn = el('button', '');
    testBtn.textContent = 'Test Click';
    testBtn.id = 'test-click-btn';
    actions.appendChild(repickBtn);
    actions.appendChild(testBtn);

    box.appendChild(preview);
    box.appendChild(path);
    box.appendChild(actions);
  } else {
    const label = el('div', 'pick-label');
    label.textContent = '🎯 Click to pick an element on the page';
    box.appendChild(label);
  }

  box.id = 'selector-box';
  section.appendChild(box);
  return section;
}

function renderSettingsSection(): HTMLElement {
  const section = el('div', 'section');
  const title = el('div', 'section-title');
  title.textContent = 'Settings';
  section.appendChild(title);

  // Click interval
  section.appendChild(settingRow(
    'Click Interval', '클릭 주기',
    `<input type="number" id="click-interval" value="${clickIntervalMs}" min="10" step="10">
     <span class="unit">ms</span>`
  ));

  // Refresh interval
  section.appendChild(settingRow(
    'Page Refresh', '새로고침 주기',
    `<input type="number" id="refresh-interval" value="${refreshIntervalSec}" min="1">
     <span class="unit">sec</span>
     <button id="refresh-toggle" class="toggle ${refreshEnabled ? 'on' : ''}"></button>`
  ));

  // Repeat count
  section.appendChild(settingRow(
    'Repeat Count', '반복 횟수 (0 = 무제한)',
    `<input type="number" id="repeat-count" value="${repeatCount}" min="0">
     <span class="unit">times</span>`
  ));

  return section;
}

function renderSettingsReadonly(): HTMLElement {
  const section = el('div', 'section');

  section.appendChild(settingRow('Click Interval', '', `<span class="unit" style="color:#333;font-weight:500">every ${state.clickIntervalMs} ms</span>`));
  section.appendChild(settingRow('Page Refresh', '', `<span class="unit" style="color:#333;font-weight:500">${state.refreshEnabled ? `every ${state.refreshIntervalSec} sec` : 'Off'}</span>`));
  section.appendChild(settingRow('Repeat', '', `<span class="unit" style="color:#333;font-weight:500">${state.repeatCount > 0 ? `${state.repeatCount} times` : 'Unlimited'}</span>`));

  return section;
}

function renderRunningStats(): HTMLElement {
  const stats = el('div', 'run-stats');

  const target = state.selectorSet
    ? `${state.selectorSet.tagName}${state.selectorSet.textContent ? ` "${state.selectorSet.textContent.slice(0, 20)}"` : ''}`
    : '-';

  const elapsed = state.startedAt ? formatDuration(Date.now() - state.startedAt) : '-';

  stats.innerHTML = `
    <div class="stat-row"><span>Target</span><span class="stat-value">${escapeHtml(target)}</span></div>
    <div class="stat-row"><span>Clicks performed</span><span class="stat-value">${state.clickCount}</span></div>
    <div class="stat-row"><span>Page refreshes</span><span class="stat-value">${state.refreshCount}</span></div>
    <div class="stat-row"><span>Running for</span><span class="stat-value">${elapsed}</span></div>
  `;

  return stats;
}

function renderSavedTab(): HTMLElement {
  const body = el('div', 'body');

  if (savedConfigs.length === 0) {
    const empty = el('div', 'empty-state');
    empty.textContent = 'No saved macros yet. Set up a macro and save it.';
    body.appendChild(empty);
  } else {
    for (const config of savedConfigs) {
      const item = el('div', 'saved-macro');

      const info = el('div', '');
      const name = el('div', 'name');
      name.textContent = config.name;
      const meta = el('div', 'meta');
      const parts: string[] = [];
      try { parts.push(new URL(config.targetUrl).hostname); } catch { parts.push(config.targetUrl); }
      if (config.refreshEnabled) parts.push(`refresh ${config.refreshIntervalSec}s`);
      parts.push(`click ${config.clickIntervalMs}ms`);
      if (config.repeatCount > 0) parts.push(`${config.repeatCount}x`);
      meta.textContent = parts.join(' · ');
      info.appendChild(name);
      info.appendChild(meta);

      const actions = el('div', 'actions');
      const loadBtn = el('button', 'load-btn');
      loadBtn.textContent = 'Load';
      loadBtn.dataset.configId = config.id;
      const delBtn = el('button', '');
      delBtn.textContent = '🗑';
      delBtn.dataset.deleteId = config.id;
      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(info);
      item.appendChild(actions);
      body.appendChild(item);
    }
  }

  return body;
}

function renderActionArea(): HTMLElement {
  const area = el('div', 'action-area');

  if (state.running) {
    const btn = el('button', 'btn-stop');
    btn.id = 'stop-btn';
    btn.textContent = '■ Stop Macro';
    area.appendChild(btn);
  } else if (currentTab === 'setup') {
    if (state.selectorSet) {
      const btn = el('button', 'btn-primary');
      btn.id = 'start-btn';
      btn.textContent = '▶ Start Macro';
      area.appendChild(btn);
    } else {
      const btn = el('button', 'btn-primary');
      btn.disabled = true;
      btn.textContent = '▶ Start — pick an element first';
      area.appendChild(btn);
    }
  } else {
    // Saved tab
    if (state.selectorSet) {
      const btn = el('button', 'btn-secondary');
      btn.id = 'save-btn';
      btn.textContent = '💾 Save Current Setup';
      area.appendChild(btn);
    }
  }

  return area;
}

// ---- Event Binding ----

function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = (tab as HTMLElement).dataset.tab as 'setup' | 'saved';
      render();
    });
  });

  // Selector box click (pick element)
  const selectorBox = document.getElementById('selector-box');
  if (selectorBox && !state.selectorSet) {
    selectorBox.addEventListener('click', startPicking);
  }

  // Re-pick
  document.getElementById('repick-btn')?.addEventListener('click', startPicking);

  // Test click
  document.getElementById('test-click-btn')?.addEventListener('click', async () => {
    if (!state.selectorSet) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Content script already injected via manifest
    await chrome.tabs.sendMessage(tab.id, {
      type: 'START_MACRO',
      config: { selectorSet: state.selectorSet, clickIntervalMs: 0, repeatCount: 1 },
    });
  });

  // Settings inputs
  document.getElementById('click-interval')?.addEventListener('change', (e) => {
    clickIntervalMs = Math.max(10, parseInt((e.target as HTMLInputElement).value) || 500);
  });
  document.getElementById('refresh-interval')?.addEventListener('change', (e) => {
    refreshIntervalSec = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 30);
  });
  document.getElementById('repeat-count')?.addEventListener('change', (e) => {
    repeatCount = Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0);
  });
  document.getElementById('refresh-toggle')?.addEventListener('click', (e) => {
    refreshEnabled = !refreshEnabled;
    (e.target as HTMLElement).classList.toggle('on', refreshEnabled);
  });

  // Start
  document.getElementById('start-btn')?.addEventListener('click', () => {
    if (!state.selectorSet) return;
    chrome.runtime.sendMessage({
      type: 'START_MACRO',
      config: {
        selectorSet: state.selectorSet,
        clickIntervalMs,
        refreshIntervalSec,
        refreshEnabled,
        repeatCount,
        targetUrl: state.targetUrl,
      },
    });
  });

  // Stop
  document.getElementById('stop-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_MACRO' });
  });

  // Save
  document.getElementById('save-btn')?.addEventListener('click', async () => {
    if (!state.selectorSet) return;
    const name = prompt('Macro name:', `Macro on ${new URL(state.targetUrl).hostname}`);
    if (!name) return;

    const config: MacroConfig = {
      id: generateId(),
      name,
      selectorSet: state.selectorSet,
      clickIntervalMs,
      refreshIntervalSec,
      refreshEnabled,
      repeatCount,
      targetUrl: state.targetUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveConfig(config);
    savedConfigs = await getAllConfigs();
    render();
  });

  // Load saved config
  document.querySelectorAll('[data-config-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.configId!;
      const config = savedConfigs.find(c => c.id === id);
      if (!config) return;

      state = {
        ...state,
        selectorSet: config.selectorSet,
        targetUrl: config.targetUrl,
      };
      clickIntervalMs = config.clickIntervalMs;
      refreshIntervalSec = config.refreshIntervalSec;
      refreshEnabled = config.refreshEnabled;
      repeatCount = config.repeatCount;

      await chrome.runtime.sendMessage({
        type: 'ELEMENT_PICKED',
        selectorSet: config.selectorSet,
        url: config.targetUrl,
      });

      currentTab = 'setup';
      render();
    });
  });

  // Delete saved config
  document.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.deleteId!;
      await deleteConfig(id);
      savedConfigs = await getAllConfigs();
      render();
    });
  });
}

// ---- Actions ----

async function startPicking() {
  await chrome.runtime.sendMessage({ type: 'START_PICKING' });
  window.close(); // Popup must close so user can interact with page
}

// ---- Helpers ----

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function settingRow(label: string, hint: string, inputHtml: string): HTMLElement {
  const row = el('div', 'setting-row');
  row.innerHTML = `
    <div class="setting-label">${escapeHtml(label)}${hint ? `<span class="setting-hint">${escapeHtml(hint)}</span>` : ''}</div>
    <div class="setting-input">${inputHtml}</div>
  `;
  return row;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m ${sec % 60}s`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Start ----
init();
