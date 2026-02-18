const LEGACY_KEY = "djinn-sportsbook-prefs";

function prefsKey(address: string): string {
  return `djinn-sportsbook-prefs:${address.toLowerCase()}`;
}

export function getSportsbookPrefs(address?: string): string[] {
  if (!address) return [];
  try {
    const key = prefsKey(address);
    let stored = localStorage.getItem(key);

    // Lazy migration: move legacy non-namespaced data to namespaced key
    if (!stored) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(LEGACY_KEY);
        stored = legacy;
      }
    }

    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function setSportsbookPrefs(address: string, prefs: string[]): void {
  try {
    localStorage.setItem(prefsKey(address), JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in private browsing mode
  }
}
