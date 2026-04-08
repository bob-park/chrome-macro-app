import { ActiveState, DEFAULT_ACTIVE_STATE, MacroConfig } from './types';

const ACTIVE_STATE_KEY = 'activeState';
const CONFIG_PREFIX = 'config-';

export async function getActiveState(): Promise<ActiveState> {
  const result = await chrome.storage.local.get(ACTIVE_STATE_KEY);
  const stored = result[ACTIVE_STATE_KEY] as Partial<ActiveState> | undefined;
  return stored ? { ...DEFAULT_ACTIVE_STATE, ...stored } : { ...DEFAULT_ACTIVE_STATE };
}

export async function setActiveState(state: Partial<ActiveState>): Promise<ActiveState> {
  const current = await getActiveState();
  const updated = { ...current, ...state };
  await chrome.storage.local.set({ [ACTIVE_STATE_KEY]: updated });
  return updated;
}

export async function clearActiveState(): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_STATE_KEY]: { ...DEFAULT_ACTIVE_STATE } });
}

export async function saveConfig(config: MacroConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_PREFIX + config.id]: config });
}

export async function getConfig(id: string): Promise<MacroConfig | null> {
  const result = await chrome.storage.local.get(CONFIG_PREFIX + id);
  return result[CONFIG_PREFIX + id] ?? null;
}

export async function getAllConfigs(): Promise<MacroConfig[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(CONFIG_PREFIX))
    .map(([, value]) => value as MacroConfig)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteConfig(id: string): Promise<void> {
  await chrome.storage.local.remove(CONFIG_PREFIX + id);
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
