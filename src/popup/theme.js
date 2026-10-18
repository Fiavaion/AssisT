/**
 * The popup's own theme.
 *
 * Two states, dark by default:
 *
 *   light — always light
 *   dark  — always dark (the default)
 *
 * There is no "follow the system" state. An explicit choice is exactly what shows, with no OS
 * preference standing behind it to fall back to or repaint against.
 *
 * Two things this fixes, both of which were real:
 *
 *   1. The old setting was a boolean that defaulted to "light", so a student running a dark
 *      desktop opened a white popup and had to go and find a switch. Dark is now the default.
 *   2. Nothing declared `color-scheme`, so the browser drew the native parts — selects, sliders,
 *      scrollbars — to the SYSTEM preference while our CSS drew everything else to ours. On a dark
 *      desktop with a light popup that produced a half-dark, half-light interface with unreadable
 *      contrast where the two met. Declaring it is what keeps the browser's own painting in step.
 *
 * A student who was previously following the system (the old three-state 'system' value) is
 * migrated ONCE against their OS preference at read time, so their popup does not change colour
 * out from under them just because this shipped.
 */

/** Storage key for the preference. */
export const THEME_KEY = 'popupTheme';

/** The legacy boolean this replaces. Kept for migration only. */
export const LEGACY_DARK_KEY = 'popup_dark_mode';

/** Preferences a student can choose. */
export const THEMES = ['light', 'dark'];

/** What each choice is called in the interface. */
export const THEME_LABELS = { light: 'Light', dark: 'Dark' };

/**
 * Resolve a preference to the theme actually being shown.
 *
 * With no system state to consult, a preference IS the theme. Anything not 'light' or 'dark' —
 * including the retired 'system' value on a raw read — resolves to 'dark'.
 *
 * @param {string} preference - 'light' | 'dark'; anything else resolves to 'dark'
 * @returns {'light'|'dark'}
 */
export function resolveTheme(preference) {
  return preference === 'light' ? 'light' : 'dark';
}

/**
 * Read the stored preference, migrating the legacy states.
 *
 * Precedence:
 *   1. A stored 'light' or 'dark' preference is kept exactly.
 *   2. A stored 'system' preference (from before this migration) is resolved ONCE against the
 *      current OS preference, so a student who was following the system does not see their popup
 *      change colour on upgrade.
 *   3. The legacy boolean: true → 'dark', false → 'light'.
 *   4. Nothing stored at all (fresh install) → 'dark'.
 *
 * @param {Object} stored - the raw values from chrome.storage.local
 * @param {boolean} systemPrefersDarkNow - the OS preference right now, for the one-time
 *   'system' migration in step 2
 * @returns {'light'|'dark'}
 */
export function preferenceFrom(stored, systemPrefersDarkNow) {
  const value = stored && stored[THEME_KEY];
  if (value === 'light' || value === 'dark') {
    return value;
  }
  if (value === 'system') {
    return systemPrefersDarkNow ? 'dark' : 'light';
  }
  const legacy = stored && stored[LEGACY_DARK_KEY];
  if (legacy === true) {
    return 'dark';
  }
  if (legacy === false) {
    return 'light';
  }
  return 'dark';
}

/**
 * Whether the system is asking for dark. Safe where matchMedia is unavailable.
 *
 * Only needed for the one-time 'system' migration in {@link preferenceFrom} — there is no live
 * system-following state left to track.
 *
 * @param {Window} [view]
 * @returns {boolean}
 */
export function systemPrefersDark(view = typeof window === 'undefined' ? undefined : window) {
  if (!view || typeof view.matchMedia !== 'function') {
    return false;
  }
  try {
    return view.matchMedia('(prefers-color-scheme: dark)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Paint a resolved theme onto the document.
 *
 * `color-scheme` is the load-bearing half. Without it the browser paints its own widgets — the
 * selects, the range thumbs, the scrollbars — to the system preference regardless of what the CSS
 * says, which is how a light popup ends up with dark form controls in it.
 *
 * @param {Document} doc
 * @param {'light'|'dark'} theme
 */
export function applyTheme(doc, theme) {
  if (!doc) {
    return;
  }
  const dark = theme === 'dark';

  const container = doc.querySelector('.popup-container');
  if (container) {
    container.classList.toggle('dark-mode', dark);
  }
  if (doc.body) {
    doc.body.classList.toggle('dark-mode', dark);
  }
  if (doc.documentElement) {
    doc.documentElement.classList.toggle('dark-mode', dark);
    // Tell the browser which scheme its own painting should use. Only one, never `light dark`:
    // the popup has a resolved answer, so leaving the choice open would put the widgets back
    // under the system's control and reintroduce the mismatch.
    doc.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }
}

/**
 * Read the preference from storage, resolve it, and paint it.
 * @param {Object} [options]
 * @param {Document} [options.doc]
 * @param {Window} [options.view]
 * @returns {Promise<{preference:string, theme:'light'|'dark'}>}
 */
export async function loadAndApplyTheme({ doc, view } = {}) {
  const document_ = doc || (typeof document === 'undefined' ? null : document);
  let stored = {};
  try {
    stored = (await chrome.storage.local.get([THEME_KEY, LEGACY_DARK_KEY])) || {};
  } catch {
    stored = {};
  }
  const preference = preferenceFrom(stored, systemPrefersDark(view));
  const theme = resolveTheme(preference);
  applyTheme(document_, theme);
  return { preference, theme };
}

/**
 * Store a preference and paint it.
 * @param {'light'|'dark'} preference
 * @param {Object} [options]
 * @param {Document} [options.doc]
 * @returns {Promise<'light'|'dark'>} the theme now showing
 */
export async function setThemePreference(preference, { doc } = {}) {
  const theme = resolveTheme(preference);
  applyTheme(doc || (typeof document === 'undefined' ? null : document), theme);
  try {
    // The legacy boolean goes with it, so nothing can read a stale answer and repaint.
    await chrome.storage.local.set({ [THEME_KEY]: theme });
    await chrome.storage.local.remove(LEGACY_DARK_KEY);
  } catch {
    // Painting already happened; a failed write is not worth throwing the popup away for.
  }
  return theme;
}
