/**
 * @jest-environment jsdom
 *
 * The accordion's companion checkboxes: what they show on open, and what they store.
 *
 * Flat draws a switch per companion feature and drives the accordion checkbox of the same id, so
 * that checkbox has to carry the stored state when the popup opens and write the student's change
 * to `companionFeatures` the moment it happens. Content scripts watch that key and start or stop the
 * feature in open tabs (companion-init.js).
 */

import { bindCompanionSwitches } from '../../../src/popup/companion-switches.js';
import { COMPANION_FEATURES } from '../../../src/features/companion/companion-settings.js';
import { READING_LEVELS } from '../../../src/features/companion/reading-level.js';

let store;

function markup() {
  document.body.innerHTML = `
    ${COMPANION_FEATURES.map(f => `<input type="checkbox" id="companion-${f.key}" />`).join('')}
    <select id="companion-reading-level"></select>
  `;
}

beforeEach(() => {
  store = {};
  chrome.storage.local.get.mockImplementation(async key => {
    const k = typeof key === 'string' ? key : key[0];
    return k in store ? { [k]: store[k] } : {};
  });
  chrome.storage.local.set.mockImplementation(async obj => {
    Object.assign(store, obj);
  });
  markup();
});

const box = key => document.getElementById(`companion-${key}`);

describe('bindCompanionSwitches', () => {
  it('shows what is stored, and on for anything never touched', async () => {
    store.companionFeatures = { flashcards: false, lecture: false };
    await bindCompanionSwitches(document);

    COMPANION_FEATURES.forEach(f => {
      expect(box(f.key).checked).toBe(!['flashcards', 'lecture'].includes(f.key));
    });
  });

  it('stores a switch the moment it changes, leaving the others alone', async () => {
    store.companionFeatures = { flashcards: false };
    await bindCompanionSwitches(document);

    box('authorship').checked = false;
    box('authorship').dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(store.companionFeatures).toEqual({ flashcards: false, authorship: false });
  });

  it('fills the reading-level dial, shows the stored level and stores a new one', async () => {
    store.companionReadingLevel = 'plain';
    await bindCompanionSwitches(document);

    const dial = document.getElementById('companion-reading-level');
    expect([...dial.options].map(o => o.value)).toEqual(READING_LEVELS.map(l => l.id));
    expect(dial.value).toBe('plain');

    dial.value = 'very-plain';
    dial.dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(store.companionReadingLevel).toBe('very-plain');
  });

  it('does nothing when the markup is absent', async () => {
    document.body.innerHTML = '';
    await expect(bindCompanionSwitches(document)).resolves.toBeUndefined();
  });
});

/**
 * "Start lecture captions": the popup's way to the lecture-notes card. Before it, the only way in
 * was a chip drawn on LMS hosts alone, so on Panopto, YouTube or Teams in the browser the switch
 * was on and nothing anywhere said how to use it.
 */
describe('Start lecture captions', () => {
  let close;

  function launcherMarkup() {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<button id="btn-open-lecture-notes" type="button">Start lecture captions</button>
       <p id="lecture-launch-status" role="status"></p>`
    );
  }

  const status = () => document.getElementById('lecture-launch-status').textContent;

  async function press() {
    document
      .getElementById('btn-open-lecture-notes')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  }

  function activeTab(tab) {
    chrome.tabs.query.mockResolvedValue(tab ? [tab] : []);
  }

  beforeEach(async () => {
    launcherMarkup();
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
    jest.useFakeTimers();
    await bindCompanionSwitches(document);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks the active tab to open the lecture notes, says so, and closes the popup', async () => {
    activeTab({ id: 7, url: 'https://panopto.example.edu/Panopto/Pages/Viewer.aspx' });
    chrome.tabs.sendMessage.mockResolvedValue({ success: true });

    await press();

    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'OPEN_LECTURE_NOTES' });
    expect(status()).toMatch(/lecture notes are open/i);
    jest.runAllTimers();
    expect(close).toHaveBeenCalled();
  });

  it('works from the keyboard', async () => {
    activeTab({ id: 7, url: 'https://www.youtube.com/watch?v=x' });
    chrome.tabs.sendMessage.mockResolvedValue({ success: true });

    document
      .getElementById('btn-open-lecture-notes')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'OPEN_LECTURE_NOTES' });
  });

  it.each([
    ['a browser page', 'chrome://settings/'],
    ['the extensions page', 'chrome://extensions/'],
    ['a blank new tab', 'about:blank'],
    ['another extension', 'chrome-extension://abc/page.html'],
    ['the Chrome Web Store', 'https://chromewebstore.google.com/detail/x/abc'],
    ['the old Web Store', 'https://chrome.google.com/webstore/detail/abc'],
    ['a page source view', 'view-source:https://example.com/'],
  ])('on %s says Chrome does not allow it, sends nothing, stays open', async (_name, url) => {
    activeTab({ id: 3, url });

    await press();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(status()).toMatch(/chrome does not let/i);
    jest.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });

  it('says AssisT is not running on a page with no content script, and how to fix it', async () => {
    activeTab({ id: 4, url: 'https://teams.microsoft.com/' });
    chrome.tabs.sendMessage.mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.')
    );

    await press();

    expect(status()).toMatch(/not running on this page/i);
    expect(status()).toMatch(/reload/i);
    jest.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });

  it('says so when the page could not open the card', async () => {
    activeTab({ id: 5, url: 'https://canvas.instructure.com/courses/1' });
    chrome.tabs.sendMessage.mockResolvedValue({ success: false, error: 'off' });

    await press();

    expect(status()).toMatch(/could not open/i);
    jest.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });

  it('says the feature is off, and how to turn it on, when the page reports the switch off', async () => {
    activeTab({ id: 5, url: 'https://canvas.instructure.com/courses/1' });
    chrome.tabs.sendMessage.mockResolvedValue({ success: false, error: 'Lecture companion is off' });

    await press();

    expect(status()).toMatch(/switched off/i);
    expect(status()).toMatch(/turn on/i);
    expect(status()).not.toMatch(/reload/i);
  });

  it('says so when there is no tab to open it on', async () => {
    activeTab(null);

    await press();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(status()).not.toBe('');
  });
});
