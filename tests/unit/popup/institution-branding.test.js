/**
 * @jest-environment jsdom
 *
 * Institution branding, as a student meets it in Advanced Options → Preferences.
 *
 * The paste field is gone for 1.0.0: entering a key was a user-facing path whose signature check
 * had never been exercised in CI, so the owner's decision is to ship no way in through the popup.
 * What must remain is the way OUT — a student whose machine already carries an institution's
 * colours has to be able to go back to the standard appearance, or hiding the entry point would
 * have trapped them in someone else's skin. So the section is a removal control and nothing else:
 * absent unless branding is actually applied from a locally stored key, and never a word about a
 * key, a token or pasting.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

jest.mock('../../../src/features/institution/institution-resolver.js', () => ({
  INSTITUTION_KEY_STORAGE: 'institutionKey',
  getStoredInstitutionKey: jest.fn(),
  clearInstitutionKey: jest.fn(),
  resolveBrandingFromToken: jest.fn(),
}));

let PopupController;
let getStoredInstitutionKey;
let clearInstitutionKey;
let resolveBrandingFromToken;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
  ({ getStoredInstitutionKey, clearInstitutionKey, resolveBrandingFromToken } = await import(
    '../../../src/features/institution/institution-resolver.js'
  ));
});

const NCAD = {
  institutionId: 'ncad',
  name: 'National College of Art and Design',
  accent: '#4e6f78',
  accentSecondary: null,
  logo: null,
  lmsDomain: 'canvas.ncad.ie',
};

const GENERIC = {
  institutionId: null,
  name: null,
  accent: null,
  accentSecondary: null,
  logo: null,
  lmsDomain: null,
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Mount the popup and open Advanced Options on the Preferences tab. */
async function openPreferences() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const popup = new PopupController();
  popup.settings = {};
  popup.showAdvancedOptions('preferences');
  await flush();
  return { popup, modal: document.getElementById('advanced-options-modal') };
}

const section = () => document.getElementById('institution-branding');
const removeButton = () => document.getElementById('institution-branding-remove');

beforeEach(() => {
  // resetMocks wipes the factory implementations, so every run sets its own.
  getStoredInstitutionKey.mockResolvedValue(null);
  clearInstitutionKey.mockResolvedValue(undefined);
  resolveBrandingFromToken.mockResolvedValue({ ...GENERIC });
});

describe('with no institution branding on the machine', () => {
  it('offers no way to enter a key, and leaves no dead control behind', async () => {
    const { modal } = await openPreferences();
    for (const id of [
      'institution-key-input',
      'institution-key-apply',
      'institution-key-clear',
      'institution-key-status',
    ]) {
      expect(document.getElementById(id)).toBeNull();
    }
    expect(modal.querySelector('textarea[placeholder*="key" i]')).toBeNull();
  });

  it('says nothing about an institution key anywhere in Preferences', async () => {
    await openPreferences();
    // The settings-backup copy legitimately mentions API keys, so this is the institution wording:
    // nothing that invites a student to paste an institution key or token.
    const preferences = document.getElementById('tab-preferences');
    expect(preferences.textContent).not.toMatch(/institution\s+(?:key|token)/i);
    expect(preferences.textContent).not.toMatch(/customization key|paste/i);
  });

  it('hides the branding section entirely', async () => {
    await openPreferences();
    expect(section().hidden).toBe(true);
    expect(getStoredInstitutionKey).toHaveBeenCalled();
    expect(resolveBrandingFromToken).not.toHaveBeenCalled();
  });
});

describe('when a stored key is applying an institution skin', () => {
  beforeEach(() => {
    getStoredInstitutionKey.mockResolvedValue('payload.signature');
    resolveBrandingFromToken.mockResolvedValue({ ...NCAD });
  });

  it('names the institution and offers the way back, without mentioning a key', async () => {
    await openPreferences();
    expect(section().hidden).toBe(false);
    expect(section().textContent).toContain('National College of Art and Design');
    expect(section().textContent).not.toMatch(/\bkeys?\b|\btokens?\b|paste/i);
    expect(removeButton()).not.toBeNull();
  });

  it('removes the branding from the keyboard alone (SC 2.1.1)', async () => {
    await openPreferences();
    removeButton().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await flush();
    expect(clearInstitutionKey).toHaveBeenCalledTimes(1);
    // The button retires; the section stays so the confirmation is still on screen to read.
    expect(removeButton().hidden).toBe(true);
    expect(section().hidden).toBe(false);
  });

  it('removes it on a pointer press too, and confirms in a live region', async () => {
    await openPreferences();
    const status = document.getElementById('institution-branding-status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    removeButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flush();
    expect(clearInstitutionKey).toHaveBeenCalledTimes(1);
    expect(status.textContent).toMatch(/removed/i);
    expect(section().textContent).toMatch(/standard appearance/i);
  });

  it('is gone the next time Preferences opens, with nothing stored', async () => {
    await openPreferences();
    removeButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flush();
    getStoredInstitutionKey.mockResolvedValue(null);
    await openPreferences();
    expect(section().hidden).toBe(true);
  });
});

describe('when a stored key applies nothing', () => {
  it('stays hidden for an unverified key — no branding, so nothing to remove', async () => {
    getStoredInstitutionKey.mockResolvedValue('bogus.key');
    resolveBrandingFromToken.mockResolvedValue({ ...GENERIC });
    await openPreferences();
    expect(section().hidden).toBe(true);
  });

  it('stays hidden when the read throws', async () => {
    getStoredInstitutionKey.mockRejectedValue(new Error('storage unavailable'));
    await openPreferences();
    expect(section().hidden).toBe(true);
  });
});
