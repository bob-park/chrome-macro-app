export interface SelectorSet {
  css: string;
  xpath: string;
  textContent: string | null;
  ariaLabel: string | null;
  ariaRole: string | null;
  testId: string | null;
  elementId: string | null;
  tagName: string;
  siblingIndex: number;
}

export interface MacroConfig {
  id: string;
  name: string;
  selectorSet: SelectorSet;
  clickIntervalMs: number;
  clickEnabled: boolean;
  refreshIntervalSec: number;
  refreshEnabled: boolean;
  repeatCount: number;
  targetUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveState {
  configId: string | null;
  tabId: number | null;
  running: boolean;
  clickCount: number;
  refreshCount: number;
  startedAt: number | null;
  selectorSet: SelectorSet | null;
  clickIntervalMs: number;
  clickEnabled: boolean;
  refreshIntervalSec: number;
  refreshEnabled: boolean;
  repeatCount: number;
  targetUrl: string;
}

export const DEFAULT_ACTIVE_STATE: ActiveState = {
  configId: null,
  tabId: null,
  running: false,
  clickCount: 0,
  refreshCount: 0,
  startedAt: null,
  selectorSet: null,
  clickIntervalMs: 500,
  clickEnabled: true,
  refreshIntervalSec: 30,
  refreshEnabled: false,
  repeatCount: 0,
  targetUrl: '',
};

// Messages between popup <-> service worker <-> content scripts
export type Message =
  | { type: 'START_PICKING' }
  | { type: 'CANCEL_PICKING' }
  | { type: 'ELEMENT_PICKED'; selectorSet: SelectorSet; url: string }
  | { type: 'START_MACRO'; config: Pick<ActiveState, 'selectorSet' | 'clickIntervalMs' | 'clickEnabled' | 'refreshIntervalSec' | 'refreshEnabled' | 'repeatCount' | 'targetUrl'> }
  | { type: 'STOP_MACRO' }
  | { type: 'MACRO_STATUS'; clickCount: number; running: boolean }
  | { type: 'MACRO_STOPPED' }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; state: ActiveState }
  | { type: 'CLICK_UPDATE'; clickCount: number }
  | { type: 'STEP_FAILED'; reason: string };
