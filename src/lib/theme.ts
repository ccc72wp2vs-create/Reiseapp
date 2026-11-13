/** Theme preference (per device): dark is the default. */
export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'travio.theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const resolved = pref === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = resolved;
  syncThemeColor();
}

/**
 * Pages with a dark hero image at the top set `dark` while the hero is
 * visible, so the iOS status bar area (and its blur effect) stays dark.
 */
export function setStatusBarOverHero(overHero: boolean) {
  if (overHero) document.documentElement.dataset.statusbar = 'hero';
  else delete document.documentElement.dataset.statusbar;
  syncThemeColor();
}

function syncThemeColor() {
  const root = document.documentElement;
  const color = root.dataset.statusbar === 'hero' ? '#101B33' : root.dataset.theme === 'light' ? '#F5F9FC' : '#101B33';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}
