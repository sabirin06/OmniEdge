export interface SupportWorkspace {
  id: number;
  expires_at: string;
  label: string;
}

const key = 'omniedge.supportWorkspace';
export function currentSupportWorkspace(): SupportWorkspace | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    return Number.isInteger(value?.id) && typeof value.expires_at === 'string' && typeof value.label === 'string' ? value : null;
  } catch { return null; }
}

export function storeSupportWorkspace(workspace: SupportWorkspace) {
  sessionStorage.setItem(key, JSON.stringify(workspace));
}

export function clearSupportWorkspace() {
  sessionStorage.removeItem(key);
}
