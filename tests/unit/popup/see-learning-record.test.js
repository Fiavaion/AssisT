/**
 * @jest-environment jsdom
 *
 * The popup's learning-profile control offered "Delete this record" and nothing else: a student
 * could be recorded, and could erase the record, but could never look at it. This is the route
 * that was missing — declared in the registry, drawn in popup.html, and wired to the page.
 */

import fs from 'fs';
import path from 'path';

import { toolById } from '../../../src/popup/registry/tool-registry.js';
import {
  initSeeRecordButton,
  openRecordedProfile,
} from '../../../src/features/cognitiveProfile/profile-record-button.js';

const BUTTON_ID = 'btn-see-learning-record';
const POPUP_HTML = path.join(__dirname, '../../../src/popup/popup.html');

function markup() {
  document.body.innerHTML = `
    <button id="${BUTTON_ID}">See what is recorded</button>
    <p id="learning-profile-delete-status" role="status"></p>
  `;
}

function status() {
  return document.getElementById('learning-profile-delete-status').textContent;
}

function press() {
  document
    .getElementById(BUTTON_ID)
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  chrome.tabs = {
    query: jest.fn(async () => [{ id: 7 }]),
    sendMessage: jest.fn(async () => ({ success: true })),
  };
  window.close = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  markup();
});

describe('the control the popup draws', () => {
  test('the registry declares it, ahead of deleting the record', () => {
    const tool = toolById('learning-profile');
    const ids = tool.actions.map(action => action.id);

    expect(ids).toEqual([BUTTON_ID, 'btn-delete-learning-data']);
  });

  test('popup.html carries the button, labelled in plain words', () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');

    expect(html).toContain(`id="${BUTTON_ID}"`);
    expect(html).toMatch(/aria-label="See what is recorded about how I work"/);
  });

  /**
   * SC 2.5.3: the accessible name has to contain the visible label, so a student saying "delete this
   * record" out loud names the control they can see. The delete button's name was "Delete the record
   * of how I work" over the words "Delete this record" — one word out, and the speech user is stuck.
   */
  test('both buttons are named with the words they show (SC 2.5.3)', () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');

    for (const [visible, name] of [
      ['See what is recorded', /aria-label="See what is recorded about how I work"/],
      ['Delete this record', /aria-label="Delete this record of how I work"/],
    ]) {
      const match = html.match(name);
      expect(match).not.toBeNull();
      expect(match[0].toLowerCase()).toContain(visible.toLowerCase());
      expect(html).toContain(`<span>${visible}</span>`);
    }
  });

  /**
   * A role="status" is for what just happened. The standing warning was shipped inside it, so the
   * first message either button wrote replaced the warning for good, and a screen reader also
   * announced the warning on open as though it were news. The warning now lives in the dialog the
   * delete button opens (learning-data-controls.test.js).
   */
  test('the live region ships empty', () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');

    const live = html.match(/id="learning-profile-delete-status"[\s\S]{0,80}?<\/p>/);
    expect(live).not.toBeNull();
    expect(live[0].replace(/\s+/g, ' ')).toMatch(/> ?<\/p>$/);
  });

  test('popup.html loads the module that wires it', () => {
    const html = fs.readFileSync(POPUP_HTML, 'utf8');

    expect(html).toContain('cognitiveProfile/profile-record-button.js');
  });
});

describe('asking the page to open the record', () => {
  test('a keyboard press asks the active tab and closes the popup', async () => {
    initSeeRecordButton();

    document
      .getElementById(BUTTON_ID)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'COGNITIVE_PROFILE_SHOW' });
    expect(window.close).toHaveBeenCalled();
  });

  test('a mouse press does the same', async () => {
    initSeeRecordButton();

    press();
    await flush();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'COGNITIVE_PROFILE_SHOW' });
  });

  test('the page saying no is passed on in its own words, and the popup stays open', async () => {
    chrome.tabs.sendMessage.mockResolvedValue({
      success: false,
      reason: 'The record is switched off, so there is nothing to show.',
    });
    initSeeRecordButton();

    press();
    await flush();

    expect(status()).toMatch(/switched off/i);
    expect(window.close).not.toHaveBeenCalled();
  });

  test('a page with no content script is a sentence, not an error', async () => {
    chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

    await expect(openRecordedProfile(jest.fn())).resolves.toBe(false);

    const say = jest.fn();
    await openRecordedProfile(say);
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/open a web page/i));
  });

  test('no active tab is handled too', async () => {
    chrome.tabs.query.mockResolvedValue([]);
    const say = jest.fn();

    await expect(openRecordedProfile(say)).resolves.toBe(false);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/open a web page/i));
  });

  test('a document without the button is left alone', () => {
    document.body.innerHTML = '';
    expect(() => initSeeRecordButton()).not.toThrow();
  });
});
