/**
 * @jest-environment jsdom
 *
 * A shut accordion section has to be shut to the keyboard and to a screen reader, not only to the
 * eye.
 *
 * Overnight release testing walked the popup with Tab alone: from the Reading header it took forty
 * presses to reach the next header the student could see, through about seventy switches, selects
 * and buttons sitting inside boxes of no height, with no focus ring visible anywhere. Space on one
 * of those stops switched Speech-to-Text on with the section still shut — a setting changed that
 * the student could neither see nor find (SC 2.4.3, 2.4.7, 2.4.11).
 *
 * The other half of the bargain is in flat-mount's tests: Flat drives these very controls while
 * they are hidden, so `inert` must not stop a dispatched event or a programmatic click reaching
 * them.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/** @param {boolean} [reduceMotion] */
function mountPopup(reduceMotion = false) {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  localStorage.clear();
  window.matchMedia = jest.fn(query => ({
    matches: reduceMotion && query.includes('reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  }));
  const popup = new PopupController();
  popup.settings = {};
  popup.setupAccordions();
  return popup;
}

/** @param {string} id @returns {{header: HTMLElement, content: HTMLElement}} */
function section(id) {
  const element = document.querySelector(`.accordion-section[data-section="${id}"]`);
  return {
    header: element.querySelector('.accordion-header'),
    content: element.querySelector('.accordion-content'),
  };
}

/** @param {HTMLElement} element @param {string} key */
function pressKey(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('a section that starts shut', () => {
  it('is inert from the first paint, with no wait', () => {
    mountPopup();
    const { content } = section('writing');
    expect(content.hasAttribute('inert')).toBe(true);
    expect(content.classList.contains('accordion-content--shut')).toBe(true);
  });

  it('holds no tab stops a focus trap would find', () => {
    mountPopup();
    const { content } = section('writing');
    // The switch the overnight walk landed on, with the section closed.
    expect(content.querySelector('#stt-enabled')).not.toBeNull();
    expect(content.closest('[inert]')).toBe(content);
  });

  it('leaves the default-open section alone', () => {
    mountPopup();
    const { header, content } = section('reading');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('inert')).toBe(false);
    expect(content.classList.contains('accordion-content--shut')).toBe(false);
  });
});

describe('opening and shutting a section', () => {
  it('gives the content back the moment it opens', () => {
    mountPopup();
    const { header, content } = section('writing');
    pressKey(header, 'Enter');
    expect(content.hasAttribute('inert')).toBe(false);
    expect(content.classList.contains('accordion-content--shut')).toBe(false);
  });

  it('waits for the collapse before taking it away again', () => {
    mountPopup();
    const { header, content } = section('writing');
    pressKey(header, 'Enter');
    pressKey(header, 'Enter');

    // Still on screen while it shrinks: taking it out mid-animation makes it vanish.
    expect(content.hasAttribute('inert')).toBe(false);
    jest.advanceTimersByTime(300);
    expect(content.hasAttribute('inert')).toBe(true);
    expect(content.classList.contains('accordion-content--shut')).toBe(true);
  });

  it('cancels the pending shutting when the section is opened again first', () => {
    mountPopup();
    const { header, content } = section('writing');
    pressKey(header, 'Enter');
    pressKey(header, 'Enter');
    pressKey(header, 'Enter');
    jest.advanceTimersByTime(600);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('inert')).toBe(false);
  });

  it('shuts at once for a student who has asked for less movement', () => {
    mountPopup(true);
    const { header, content } = section('writing');
    pressKey(header, 'Enter');
    pressKey(header, 'Enter');
    expect(content.hasAttribute('inert')).toBe(true);
  });
});
