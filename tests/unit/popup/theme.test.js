/**
 * @jest-environment jsdom
 *
 * Tests for the popup's theme.
 *
 * Two states now, dark by default. The behaviours pinned here: an unrecognised or absent
 * preference resolves to dark, a stored 'system' value (from before this migration) is resolved
 * ONCE against the OS so nobody's popup changes colour on upgrade, an old explicit light/dark
 * choice and the legacy boolean both survive exactly, and `color-scheme` must be set — without it
 * the browser paints selects and scrollbars to the system preference while the CSS paints
 * everything else to ours, which is the half-light, half-dark interface this replaces.
 */

import {
  THEME_KEY,
  LEGACY_DARK_KEY,
  resolveTheme,
  preferenceFrom,
  systemPrefersDark,
  applyTheme,
  loadAndApplyTheme,
  setThemePreference,
} from '../../../src/popup/theme.js';

/** A window whose system preference we control. */
function viewWithSystem(dark, listeners = []) {
  return {
    matchMedia: () => ({
      matches: dark,
      addEventListener: (_type, handler) => listeners.push(handler),
      removeEventListener: (_type, handler) => {
        const index = listeners.indexOf(handler);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      },
    }),
  };
}

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.style.colorScheme = '';
  document.body.innerHTML = '<div class="popup-container"></div>';
  document.body.className = '';
});

describe('resolveTheme', () => {
  it('returns an explicit choice unchanged', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('treats anything unrecognised, including the retired system state, as dark', () => {
    expect(resolveTheme(undefined)).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
    expect(resolveTheme('midnight')).toBe('dark');
  });
});

describe('preferenceFrom', () => {
  it('keeps a stored light/dark preference exactly', () => {
    expect(preferenceFrom({ [THEME_KEY]: 'dark' }, false)).toBe('dark');
    expect(preferenceFrom({ [THEME_KEY]: 'light' }, true)).toBe('light');
  });

  it('resolves an old system preference once against the OS, in both directions', () => {
    // A student who was following the system must not see their popup change colour on upgrade.
    expect(preferenceFrom({ [THEME_KEY]: 'system' }, true)).toBe('dark');
    expect(preferenceFrom({ [THEME_KEY]: 'system' }, false)).toBe('light');
  });

  it('keeps an old explicit legacy choice exactly as it was', () => {
    expect(preferenceFrom({ [LEGACY_DARK_KEY]: true }, false)).toBe('dark');
    expect(preferenceFrom({ [LEGACY_DARK_KEY]: false }, true)).toBe('light');
  });

  it('defaults a fresh install to dark, regardless of the OS', () => {
    expect(preferenceFrom({}, false)).toBe('dark');
    expect(preferenceFrom({}, true)).toBe('dark');
  });

  it('prefers the new key when both are present', () => {
    expect(preferenceFrom({ [THEME_KEY]: 'light', [LEGACY_DARK_KEY]: true }, false)).toBe('light');
  });
});

describe('systemPrefersDark', () => {
  it('reports what the system asks for', () => {
    expect(systemPrefersDark(viewWithSystem(true))).toBe(true);
    expect(systemPrefersDark(viewWithSystem(false))).toBe(false);
  });

  it('says light where the browser cannot answer', () => {
    expect(systemPrefersDark({})).toBe(false);
    expect(systemPrefersDark(undefined)).toBe(false);
  });
});

describe('applyTheme', () => {
  it('marks the popup dark and tells the browser to paint dark too', () => {
    applyTheme(document, 'dark');
    expect(document.querySelector('.popup-container').classList.contains('dark-mode')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    // Without this the browser draws its own selects, sliders and scrollbars to the SYSTEM
    // preference, regardless of the CSS — the exact mismatch this replaces.
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('clears it again for light', () => {
    applyTheme(document, 'dark');
    applyTheme(document, 'light');
    expect(document.body.classList.contains('dark-mode')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('never leaves the choice open to the system', () => {
    // `light dark` would hand the widgets back to the OS and reintroduce the split interface.
    applyTheme(document, 'light');
    expect(document.documentElement.style.colorScheme).not.toContain(' ');
  });
});

describe('loadAndApplyTheme', () => {
  it('defaults fresh installs to dark, regardless of the OS', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await loadAndApplyTheme({ doc: document, view: viewWithSystem(false) });
    expect(result).toEqual({ preference: 'dark', theme: 'dark' });
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('paints light for a student who asked for light', async () => {
    chrome.storage.local.get.mockResolvedValue({ [THEME_KEY]: 'light' });
    const result = await loadAndApplyTheme({ doc: document, view: viewWithSystem(true) });
    expect(result.theme).toBe('light');
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('resolves a stored system preference against the OS once, on the way in', async () => {
    chrome.storage.local.get.mockResolvedValue({ [THEME_KEY]: 'system' });
    const result = await loadAndApplyTheme({ doc: document, view: viewWithSystem(false) });
    expect(result).toEqual({ preference: 'light', theme: 'light' });
  });

  it('falls back to dark rather than throwing when storage is unavailable', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('no storage'));
    const result = await loadAndApplyTheme({ doc: document, view: viewWithSystem(false) });
    expect(result.theme).toBe('dark');
  });
});

describe('setThemePreference', () => {
  it('stores the choice and paints it', async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.remove.mockResolvedValue(undefined);

    const theme = await setThemePreference('dark', { doc: document });

    expect(theme).toBe('dark');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [THEME_KEY]: 'dark' });
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('stores light exactly as chosen', async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.remove.mockResolvedValue(undefined);

    const theme = await setThemePreference('light', { doc: document });

    expect(theme).toBe('light');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [THEME_KEY]: 'light' });
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('clears the legacy boolean so nothing can read a stale answer', async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await setThemePreference('dark', { doc: document });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(LEGACY_DARK_KEY);
  });

  it('paints even when the write fails', async () => {
    chrome.storage.local.set.mockRejectedValue(new Error('quota'));
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await setThemePreference('dark', { doc: document });
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });
});
