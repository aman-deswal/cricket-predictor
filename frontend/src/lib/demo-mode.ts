const DEMO_MODE_STORAGE_KEY = 'sixsense-demo-mode';

export function getStoredDemoMode(): boolean | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(DEMO_MODE_STORAGE_KEY);
  if (value === null) return null;
  return value === 'true';
}

export function setStoredDemoMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(enabled));
}

