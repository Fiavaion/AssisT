/**
 * @jest-environment jsdom
 *
 * The popup reading the note the worker left it.
 *
 * When a student presses Open Settings on an AI panel, the worker opens the popup and records
 * which settings they asked for. The popup has to act on that as it mounts, and act on it once:
 * a note that survived would drag the Advanced Options modal open every time the popup was
 * opened afterwards.
 */

import fs from 'fs';
import path from 'path';
import { POPUP_OPEN_REQUEST_KEY } from '../../../src/utils/popup-open-request.js';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  chrome.storage.sync.get.mockResolvedValue({});
  chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.instructure.com/' }]);
  // loadSettings asks the worker for the settings and refuses to carry on without them.
  chrome.runtime.sendMessage.mockResolvedValue({ success: true, data: { ui_visibility: {} } });
  chrome.storage.session = {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
});

/**
 * A controller with its settings already loaded, as it is by the time the note is read.
 * @returns {Object} PopupController
 */
function mountedPopup() {
  const popup = new PopupController();
  popup.settings = { ui_visibility: {} };
  return popup;
}
/** @param {string|undefined} surface - what the worker asked for, if anything. */
function noteSaying(surface) {
  chrome.storage.session.get.mockResolvedValue(surface ? { [POPUP_OPEN_REQUEST_KEY]: surface } : {});
}

describe('a popup opened by the Open Settings button', () => {
  it('comes up on the AI tab of Advanced Options', async () => {
    noteSaying('ai');

    await mountedPopup().honourPendingOpenRequest();

    const modal = document.getElementById('advanced-options-modal');
    expect(modal).not.toBeNull();
    expect(modal.querySelector('#tab-ai').classList.contains('active')).toBe(true);
    expect(modal.querySelector('.modal-tab[data-tab="ai"]').classList.contains('active')).toBe(
      true
    );
    expect(modal.querySelector('#tab-features').classList.contains('active')).toBe(false);
  });

  it('spends the note, so the next opening is the plain popup', async () => {
    noteSaying('ai');

    await mountedPopup().honourPendingOpenRequest();

    expect(chrome.storage.session.remove).toHaveBeenCalledWith(POPUP_OPEN_REQUEST_KEY);
  });
});

describe('a popup opened any other way', () => {
  it('opens no modal when there is no note', async () => {
    noteSaying(undefined);

    await mountedPopup().honourPendingOpenRequest();

    expect(document.getElementById('advanced-options-modal')).toBeNull();
    expect(chrome.storage.session.remove).not.toHaveBeenCalled();
  });

  it('opens no modal for a request it does not understand', async () => {
    noteSaying('something-else');

    await mountedPopup().honourPendingOpenRequest();

    expect(document.getElementById('advanced-options-modal')).toBeNull();
  });

  it('survives a storage area that will not answer', async () => {
    chrome.storage.session.get.mockRejectedValue(new Error('no storage'));

    await expect(mountedPopup().honourPendingOpenRequest()).resolves.toBeUndefined();
    expect(document.getElementById('advanced-options-modal')).toBeNull();
  });
});

describe('the popup mount', () => {
  it('reads the note as part of initialising', async () => {
    const popup = new PopupController();
    const honour = jest.spyOn(popup, 'honourPendingOpenRequest').mockResolvedValue(undefined);

    await popup.initialize();

    expect(honour).toHaveBeenCalled();
  });
});
