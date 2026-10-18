/**
 * @jest-environment jsdom
 *
 * The popup's two consent controls, driven the way a student drives them.
 *
 * Both had the same shape of defect. The opt-in wrote to storage and never looked at the result, so
 * a failed write left the box showing "off" while the content script carried on recording — the one
 * outcome the control exists to prevent. And the destructive delete asked with `confirm()`, three
 * times over, in a popup that traps focus: a native dialog opened from inside a trap freezes the
 * tab. It now asks in a dialog the popup draws itself.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

const PROFILE_KEY = 'cognitiveProfileSettings';

jest.mock('../../../src/features/cognitiveProfile/profile-storage.js', () => ({
  PROFILE_SETTINGS_KEY: 'cognitiveProfileSettings',
  PROFILE_KEY: 'assist_cognitive_profile',
  eraseProfileData: jest.fn(async () => ['assist_cognitive_profile']),
  isProfileEnabled: jest.fn(async () => false),
}));

let PopupController;
let eraseProfileData;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
  ({ eraseProfileData } = await import(
    '../../../src/features/cognitiveProfile/profile-storage.js'
  ));
});

const el = id => document.getElementById(id);
const status = () => el('learning-profile-delete-status').textContent;
const deleteButton = () => el('btn-delete-learning-data');

function press(button) {
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function flip(checkbox, checked) {
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function mount() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const popup = new PopupController();
  popup.settings = {};
  popup.setupLearningDataControls();
  return popup;
}

beforeEach(() => {
  jest.clearAllMocks();
  eraseProfileData.mockResolvedValue(['assist_cognitive_profile']);
  chrome.storage.local.get.mockResolvedValue({ [PROFILE_KEY]: { enabled: false } });
  chrome.storage.local.set.mockResolvedValue(undefined);
  window.confirm = jest.fn(() => true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the opt-in when the write fails', () => {
  test('switching recording OFF and failing puts the tick back and says so', async () => {
    mount();
    await flush();
    const toggle = el('learning-profile-enabled');
    toggle.checked = true;
    chrome.storage.local.set.mockRejectedValue(new Error('quota'));

    flip(toggle, false);
    await flush();

    expect(toggle.checked).toBe(true);
    expect(status()).toMatch(/did not save/i);
    expect(status()).toMatch(/still recording/i);
  });

  test('switching recording ON and failing leaves it unticked and says so', async () => {
    mount();
    await flush();
    const toggle = el('learning-profile-enabled');
    chrome.storage.local.set.mockRejectedValue(new Error('quota'));

    flip(toggle, true);
    await flush();

    expect(toggle.checked).toBe(false);
    expect(status()).toMatch(/did not save/i);
    expect(status()).toMatch(/nothing is being recorded/i);
  });

  test('a write that works says what changed, and what is still stored', async () => {
    mount();
    await flush();
    const toggle = el('learning-profile-enabled');

    flip(toggle, false);
    await flush();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [PROFILE_KEY]: { enabled: false },
    });
    expect(status()).toMatch(/nothing new will be recorded/i);
    expect(status()).toMatch(/delete this record/i);
  });

  test('the same is true of the struggle-detection opt-in', async () => {
    mount();
    await flush();
    const toggle = el('struggle-detection-enabled');
    chrome.storage.local.set.mockRejectedValue(new Error('quota'));

    flip(toggle, true);
    await flush();

    expect(toggle.checked).toBe(false);
    expect(status()).toMatch(/did not save/i);
  });

  test('failing to read the stored state says so rather than guessing', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('no storage'));
    mount();
    await flush();

    expect(el('learning-profile-enabled').checked).toBe(false);
    expect(status()).toMatch(/could not read/i);
  });
});

describe('deleting the record', () => {
  /**
   * Flat draws this button and proxies each press to the real one, which sits in the hidden
   * accordion. The old two-press arming kept its warning in that hidden accordion and was disarmed
   * only by the real button losing focus, which it never had: two presses on Flat's copy deleted
   * the record with nothing seen or heard in between. So the question is a dialog of the popup's
   * own, on top of everything, with its own Delete button.
   */
  const dialog = () =>
    [...document.querySelectorAll('[role="dialog"]')].find(
      node =>
        document.getElementById(node.getAttribute('aria-labelledby'))?.textContent ===
        'Delete the record of how you work?'
    ) || null;
  const button = name =>
    [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === name);

  test('one press asks, visibly, and deletes nothing', async () => {
    mount();
    await flush();

    press(deleteButton());
    await flush();

    expect(eraseProfileData).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog().getAttribute('aria-labelledby'));
    expect(title.textContent).toBe('Delete the record of how you work?');
    const body = document.getElementById(dialog().getAttribute('aria-describedby'));
    expect(body.textContent).toContain(
      'Deleting removes it from this device straight away. It cannot be undone.'
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  test('a second press on the same button still deletes nothing', async () => {
    mount();
    await flush();

    press(deleteButton());
    press(deleteButton());
    await flush();

    expect(eraseProfileData).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#delete-learning-record-dialog')).toHaveLength(1);
  });

  test('the keyboard starts on Cancel, the safe answer', async () => {
    jest.useFakeTimers();
    mount();
    press(deleteButton());
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(document.activeElement).toBe(button('Cancel'));
  });

  test('Delete this record in the dialog deletes it, closes, and says so', async () => {
    mount();
    await flush();

    press(deleteButton());
    press(button('Delete this record'));
    await flush();

    expect(eraseProfileData).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(status()).toMatch(/deleted/i);
  });

  test('Cancel keeps the record', async () => {
    mount();
    await flush();

    press(deleteButton());
    press(button('Cancel'));
    await flush();

    expect(eraseProfileData).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  test('Escape keeps the record', async () => {
    mount();
    await flush();

    press(deleteButton());
    dialog().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await flush();

    expect(eraseProfileData).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  test('the keyboard goes back to the button the student pressed in Flat', async () => {
    mount();
    await flush();
    // Flat's copy of the button, as the popup draws it: the real one is hidden and cannot take focus.
    const copy = document.createElement('button');
    copy.id = 'flat-btn-delete-learning-data';
    document.body.appendChild(copy);

    press(deleteButton());
    press(button('Cancel'));

    expect(document.activeElement).toBe(copy);
  });

  test('a delete that fails says the record is still there', async () => {
    mount();
    await flush();
    eraseProfileData.mockRejectedValue(new Error('locked'));

    press(deleteButton());
    press(button('Delete this record'));
    await flush();

    expect(status()).toMatch(/still here/i);
  });
});
