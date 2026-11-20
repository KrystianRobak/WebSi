import type { AppMode, CampaignRole } from '../types/vault';

const APP_MODE_STORAGE_KEY = 'aethelgard_app_mode';

/**
 * Parses `#/studio` or `#/play` (or `#studio` / `#play`) from the URL hash.
 */
export function parseAppModeFromHash(hash?: string): AppMode | null {
  const raw = (
    hash !== undefined
      ? hash
      : typeof window !== 'undefined'
      ? window.location.hash
      : ''
  )
    .trim()
    .toLowerCase();

  if (raw === '#/play' || raw.startsWith('#/play/') || raw.startsWith('#/play?') || raw === '#play') {
    return 'play';
  }
  if (
    raw === '#/studio' ||
    raw.startsWith('#/studio/') ||
    raw.startsWith('#/studio?') ||
    raw === '#studio'
  ) {
    return 'studio';
  }
  return null;
}

export function readStoredAppMode(): AppMode | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const val = sessionStorage.getItem(APP_MODE_STORAGE_KEY);
    return val === 'play' || val === 'studio' ? val : null;
  } catch {
    return null;
  }
}

export function storeAppMode(mode: AppMode): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

/**
 * Resolves the effective mode based on user role in the active campaign.
 * Plain players are strictly restricted to Play Mode (`'play'`).
 */
export function resolveEffectiveAppMode(
  requested: AppMode,
  role: CampaignRole | null
): AppMode {
  if (role === 'player') return 'play';
  return requested;
}

export function getInitialAppMode(): AppMode {
  const fromHash = parseAppModeFromHash();
  if (fromHash) return fromHash;
  const fromStorage = readStoredAppMode();
  if (fromStorage) return fromStorage;
  return 'studio';
}

/**
 * Updates `window.location.hash` to `#/studio` or `#/play` while preserving `window.location.search`
 * (e.g. `?invite=CODE` for GitHub Pages invite links).
 */
export function setUrlAppMode(mode: AppMode, replace = false): void {
  if (typeof window === 'undefined') return;
  const targetHash = `#/${mode}`;
  if (window.location.hash === targetHash) return;
  const nextUrl = `${window.location.pathname}${window.location.search}${targetHash}`;
  try {
    if (replace) {
      window.history.replaceState(null, '', nextUrl);
    } else {
      window.history.pushState(null, '', nextUrl);
    }
  } catch {
    window.location.hash = targetHash;
  }
}

/**
 * Builds an absolute URL to open either sub-site in a separate browser tab.
 */
export function getSubSiteUrl(mode: AppMode): string {
  if (typeof window === 'undefined') return `#/${mode}`;
  return `${window.location.origin}${window.location.pathname}${window.location.search}#/${mode}`;
}
