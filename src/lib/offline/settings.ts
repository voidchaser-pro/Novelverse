const STORAGE_KEY = 'nv-offline-settings';

export interface OfflineSettings {
  wifiOnly: boolean;
}

const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = { wifiOnly: false };

export function loadOfflineSettings(): OfflineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OFFLINE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<OfflineSettings>;
    return { wifiOnly: parsed.wifiOnly === true };
  } catch {
    return DEFAULT_OFFLINE_SETTINGS;
  }
}

export function saveOfflineSettings(settings: OfflineSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
