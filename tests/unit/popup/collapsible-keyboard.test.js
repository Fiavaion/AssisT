/**
 * @jest-environment jsdom
 *
 * The popup's accordion headers, driven the way a keyboard-only student drives them.
 *
 * Overnight release testing found both dead or half-dead from the keyboard. The accordion headers
 * carried TWO activation paths — the popup's own helper binds Enter/Space, and setupAccordions
 * added a second keydown toggle — so every press toggled twice and `aria-expanded` never moved off
 * `false`; a student could not reach Speech-to-Text at all.
 *
 * These are one-toggle-per-press assertions for that reason: a test that only checks the end state
 * after a single press passes just as happily on a control that fires twice.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  // popup.js registers a storage listener as it loads; the shared setup mock has no onChanged.
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/** The real popup body with a controller wired to it. @returns {Object} */
function mountPopup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  localStorage.clear();
  const popup = new PopupController();
  popup.settings = {};
  return popup;
}

/** @param {HTMLElement} element @param {string} key @returns {KeyboardEvent} */
function pressKey(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** @param {HTMLElement} element */
function pressPointer(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('an accordion section header', () => {
  /** @returns {{header: HTMLElement, content: HTMLElement}} */
  function writingSection() {
    const popup = mountPopup();
    popup.setupAccordions();
    const section = document.querySelector('.accordion-section[data-section="writing"]');
    return {
      header: section.querySelector('.accordion-header'),
      content: section.querySelector('.accordion-content'),
    };
  }

  it('starts collapsed, so there is a closed state to open', () => {
    const { header, content } = writingSection();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('data-expanded')).toBe('false');
  });

  it('opens on Enter and closes on the next Enter — one toggle per press', () => {
    const { header, content } = writingSection();

    pressKey(header, 'Enter');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('data-expanded')).toBe('true');

    pressKey(header, 'Enter');
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on Space and closes on the next Space', () => {
    const { header } = writingSection();

    pressKey(header, ' ');
    expect(header.getAttribute('aria-expanded')).toBe('true');

    pressKey(header, ' ');
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on a pointer press', () => {
    const { header } = writingSection();
    pressPointer(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('cancels the default so Space does not scroll the popup', () => {
    const { header } = writingSection();
    expect(pressKey(header, ' ').defaultPrevented).toBe(true);
  });

  it('saves the state a keyboard press produced, not the one before it', () => {
    const { header } = writingSection();
    pressKey(header, 'Enter');
    expect(JSON.parse(localStorage.getItem('assist_accordion_state')).writing).toBe(true);
  });
});
