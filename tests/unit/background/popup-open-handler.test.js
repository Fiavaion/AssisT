/**
 * @jest-environment jsdom
 *
 * The worker's answer to "open my AI settings".
 *
 * Eight AI features draw an Open Settings button when no provider is configured, and the AI setup
 * wizard offers to hand back to the popup when it finishes. All nine sent a message no listener
 * answered, so every one of those buttons did nothing at all. A content script cannot open the
 * popup itself, and the popup does not exist to be told anything until the browser draws it, so
 * the worker opens it and leaves a note behind for it to read on the way up.
 */

import { handlePopupOpenMessage } from '../../../src/background/popup-open-handler.js';
import { POPUP_OPEN_REQUEST_KEY } from '../../../src/utils/popup-open-request.js';

const POPUP_URL = 'chrome-extension://test-id/src/popup/popup.html';

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  chrome.storage.session = {
    get: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  chrome.action = { openPopup: jest.fn().mockResolvedValue(undefined) };
  chrome.tabs.create = jest.fn().mockResolvedValue({ id: 2 });
  chrome.runtime.getURL = jest.fn(p => `chrome-extension://test-id/${p}`);
});

/**
 * Dispatch a message and resolve with the handler's response.
 * @param {Object} message
 * @returns {Promise<Object>}
 */
function send(message) {
  return new Promise((resolve, reject) => {
    if (!handlePopupOpenMessage(message, resolve)) {
      reject(new Error(`handlePopupOpenMessage refused ${message.action}`));
    }
  });
}

describe('which messages the handler claims', () => {
  it('claims the AI panels’ Open Settings message', () => {
    expect(handlePopupOpenMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' }, () => {})).toBe(true);
  });

  it('claims the setup wizard’s hand-off message', () => {
    expect(handlePopupOpenMessage({ action: 'OPEN_POPUP' }, () => {})).toBe(true);
  });

  it('leaves every other message to the rest of the worker', () => {
    expect(handlePopupOpenMessage({ action: 'OPEN_AI_SETUP' }, () => {})).toBe(false);
    expect(handlePopupOpenMessage({ type: 'OPEN_POPUP' }, () => {})).toBe(false);
    expect(handlePopupOpenMessage({}, () => {})).toBe(false);
  });
});

describe('opening the popup', () => {
  it('asks the browser for the real popup first', async () => {
    const response = await send({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
    expect(chrome.action.openPopup).toHaveBeenCalled();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(response).toEqual({ success: true, surface: 'popup' });
  });

  it('falls back to a tab when the browser refuses to open the popup', async () => {
    chrome.action.openPopup.mockRejectedValue(new Error('not in a user gesture'));

    const response = await send({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: POPUP_URL });
    expect(response).toEqual({ success: true, surface: 'tab' });
  });

  it('falls back to a tab on a browser with no openPopup at all', async () => {
    chrome.action = {};

    const response = await send({ action: 'OPEN_POPUP' });

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: POPUP_URL });
    expect(response).toEqual({ success: true, surface: 'tab' });
  });

  it('reports a failure rather than claiming a popup nobody saw', async () => {
    chrome.action.openPopup.mockRejectedValue(new Error('no window'));
    chrome.tabs.create.mockRejectedValue(new Error('no window either'));

    const response = await send({ action: 'OPEN_POPUP' });

    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });
});

describe('the note left for the popup', () => {
  it('asks for the AI settings, before the popup is opened', async () => {
    const order = [];
    chrome.storage.session.set.mockImplementation(async () => {
      order.push('note');
    });
    chrome.action.openPopup.mockImplementation(async () => {
      order.push('open');
    });

    await send({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });

    expect(chrome.storage.session.set).toHaveBeenCalledWith({ [POPUP_OPEN_REQUEST_KEY]: 'ai' });
    expect(order).toEqual(['note', 'open']);
  });

  it('leaves no note for the wizard’s plain hand-off', async () => {
    await send({ action: 'OPEN_POPUP' });
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('uses local storage where the browser has no session area', async () => {
    delete chrome.storage.session;

    await send({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [POPUP_OPEN_REQUEST_KEY]: 'ai' });
  });
});
