import { generateSelectorSet } from '../shared/selector';
import type { SelectorSet } from '../shared/types';

let overlay: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let highlightEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let barEl: HTMLDivElement | null = null;
let currentTarget: Element | null = null;

function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = '__macro-clicker-picker-host__';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;';
  shadowRoot = overlay.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .highlight {
      position: fixed;
      border: 2px solid #e94560;
      background: rgba(233, 69, 96, 0.08);
      pointer-events: none;
      transition: all 0.05s ease;
      border-radius: 3px;
      z-index: 1;
    }
    .tooltip {
      position: fixed;
      background: #e94560;
      color: #fff;
      font-size: 11px;
      font-family: monospace;
      padding: 3px 8px;
      border-radius: 3px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 2;
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: rgba(233, 69, 96, 0.95);
      color: #fff;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      pointer-events: auto;
      z-index: 3;
      backdrop-filter: blur(4px);
    }
    .bar button {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .bar button:hover { background: rgba(255,255,255,0.3); }
    .click-layer {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      cursor: crosshair;
      pointer-events: auto;
      z-index: 0;
    }
  `;
  shadowRoot.appendChild(style);

  // Click capture layer
  const clickLayer = document.createElement('div');
  clickLayer.className = 'click-layer';
  shadowRoot.appendChild(clickLayer);

  // Highlight box
  highlightEl = document.createElement('div');
  highlightEl.className = 'highlight';
  highlightEl.style.display = 'none';
  shadowRoot.appendChild(highlightEl);

  // Tooltip
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  tooltipEl.style.display = 'none';
  shadowRoot.appendChild(tooltipEl);

  // Top bar
  barEl = document.createElement('div');
  barEl.className = 'bar';
  barEl.innerHTML = `
    <span>🎯 Pick an element to click</span>
    <button id="cancel-btn">Cancel</button>
  `;
  shadowRoot.appendChild(barEl);

  document.documentElement.appendChild(overlay);

  // Event listeners
  clickLayer.addEventListener('mousemove', onMouseMove);
  clickLayer.addEventListener('click', onClick);
  barEl.querySelector('#cancel-btn')!.addEventListener('click', cancel);
  document.addEventListener('keydown', onKeyDown);
}

function onMouseMove(e: MouseEvent) {
  // Temporarily hide overlay to get element underneath
  if (overlay) overlay.style.display = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (overlay) overlay.style.display = '';

  if (!target || target === document.documentElement || target === document.body) {
    if (highlightEl) highlightEl.style.display = 'none';
    if (tooltipEl) tooltipEl.style.display = 'none';
    currentTarget = null;
    return;
  }

  currentTarget = target;
  const rect = target.getBoundingClientRect();

  if (highlightEl) {
    highlightEl.style.display = 'block';
    highlightEl.style.top = rect.top + 'px';
    highlightEl.style.left = rect.left + 'px';
    highlightEl.style.width = rect.width + 'px';
    highlightEl.style.height = rect.height + 'px';
  }

  if (tooltipEl) {
    const selectorPreview = generateCssSelectorPreview(target);
    tooltipEl.textContent = selectorPreview;
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = rect.left + 'px';
    tooltipEl.style.top = Math.max(0, rect.top - 24) + 'px';
  }
}

function onClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  if (!currentTarget) return;

  const selectorSet = generateSelectorSet(currentTarget);
  const url = window.location.href;

  // Send to service worker
  chrome.runtime.sendMessage({
    type: 'ELEMENT_PICKED',
    selectorSet,
    url,
  });

  destroy();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancel();
  }
}

function cancel() {
  chrome.runtime.sendMessage({ type: 'CANCEL_PICKING' });
  destroy();
}

function destroy() {
  document.removeEventListener('keydown', onKeyDown);
  if (overlay) {
    overlay.remove();
    overlay = null;
    shadowRoot = null;
    highlightEl = null;
    tooltipEl = null;
    barEl = null;
  }
  currentTarget = null;
}

function generateCssSelectorPreview(el: Element): string {
  let preview = el.tagName.toLowerCase();
  if (el.id) preview += `#${el.id}`;
  const classes = Array.from(el.classList).slice(0, 3);
  if (classes.length) preview += '.' + classes.join('.');
  return preview;
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_PICKING') {
    if (!overlay) createOverlay();
  } else if (msg.type === 'CANCEL_PICKING') {
    destroy();
  }
});
