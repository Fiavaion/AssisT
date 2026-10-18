/**
 * @jest-environment jsdom
 *
 * Advanced Options, driven the way a keyboard-only student drives it.
 *
 * It was a `div` over the popup: no role, no name, no trap. A screen reader announced nothing on
 * the way in, fourteen Tab presses walked out into the controls behind it, Escape left it open,
 * and focus never went back to the gear (SC 2.1.2, 2.4.3, 4.1.2). Its four tabs were four buttons
 * with a class on the chosen one — nothing said they were tabs, nothing said which was selected,
 * all four were tab stops and the arrow keys did nothing (SC 4.1.2).
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

/** @param {string} [tabId] @returns {{popup: Object, modal: HTMLElement, gear: HTMLElement}} */
function openModal(tabId) {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const popup = new PopupController();
  popup.settings = {};
  // The compact header's gear: the classic header is hidden with the accordion, so its gear can
  // never take the keyboard back.
  const gear = document.getElementById('btn-options-compact');
  popup.showAdvancedOptions(tabId);
  return { popup, modal: document.getElementById('advanced-options-modal'), gear };
}

/** @param {HTMLElement} element @param {string} key @returns {KeyboardEvent} */
function pressKey(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

const tabs = modal => [...modal.querySelectorAll('.modal-tab')];

describe('the Advanced Options panel', () => {
  it('is a named modal dialog', () => {
    const { modal } = openModal();
    const dialog = modal.querySelector('.modal-content');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe(
      'Advanced Options'
    );
  });

  it('puts the keyboard inside it', () => {
    jest.useFakeTimers();
    const { modal } = openModal();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    expect(modal.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and gives the gear back the keyboard', () => {
    const { modal, gear } = openModal();
    const event = pressKey(modal.querySelector('.modal-content'), 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(document.getElementById('advanced-options-modal')).toBeNull();
    expect(document.activeElement).toBe(gear);
  });

  it('closes the same way from the Close button', () => {
    const { modal, gear } = openModal();
    modal
      .querySelector('#modal-close')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(document.getElementById('advanced-options-modal')).toBeNull();
    expect(document.activeElement).toBe(gear);
  });

  it('keeps Tab inside the dialog', () => {
    const { modal } = openModal();
    const dialog = modal.querySelector('.modal-content');
    // Tabbing off the end of the dialog is the press that used to walk out into the popup behind
    // it. jsdom lays nothing out, so the trap sees the focused control as both first and last —
    // which is exactly the case that has to be cancelled rather than let through.
    modal.querySelector('#modal-save').focus();
    const event = pressKey(dialog, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe('its tabs', () => {
  it('are a tablist, with the panels they control', () => {
    const { modal } = openModal();
    expect(modal.querySelector('.modal-tabs').getAttribute('role')).toBe('tablist');
    tabs(modal).forEach(tab => {
      expect(tab.getAttribute('role')).toBe('tab');
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      expect(panel).not.toBeNull();
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    });
  });

  it('marks exactly one selected, and only that one is a tab stop', () => {
    const { modal } = openModal();
    const selected = tabs(modal).filter(tab => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('data-tab')).toBe('features');
    expect(selected[0].hasAttribute('tabindex')).toBe(false);
    tabs(modal)
      .filter(tab => tab !== selected[0])
      .forEach(tab => expect(tab.getAttribute('tabindex')).toBe('-1'));
  });

  it('moves along the strip with the arrow keys, showing each panel as it goes', () => {
    const { modal } = openModal();
    const [features, keyboard] = tabs(modal);
    features.focus();
    const event = pressKey(features, 'ArrowRight');

    expect(event.defaultPrevented).toBe(true);
    expect(keyboard.getAttribute('aria-selected')).toBe('true');
    expect(features.getAttribute('aria-selected')).toBe('false');
    expect(document.activeElement).toBe(keyboard);
    expect(document.getElementById('tab-keyboard').classList.contains('active')).toBe(true);
    expect(document.getElementById('tab-features').classList.contains('active')).toBe(false);
  });

  it('wraps round the ends and jumps with Home and End', () => {
    const { modal } = openModal();
    const all = tabs(modal);
    all[0].focus();
    pressKey(all[0], 'ArrowLeft');
    expect(all[all.length - 1].getAttribute('aria-selected')).toBe('true');

    pressKey(all[all.length - 1], 'Home');
    expect(all[0].getAttribute('aria-selected')).toBe('true');

    pressKey(all[0], 'End');
    expect(all[all.length - 1].getAttribute('aria-selected')).toBe('true');
  });

  it('is still openable by name, for the AI panel that asks for its own screen', () => {
    const { popup, modal } = openModal();
    popup.openModalTab('ai');
    const ai = modal.querySelector('.modal-tab[data-tab="ai"]');
    expect(ai.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-ai').classList.contains('active')).toBe(true);
  });

  it('lands the keyboard on the tab it was asked to open, not the first one', () => {
    // The dialog's initial focus fires a tick after it opens. A caller that opened the panel and
    // then switched tabs had its choice undone by that, so the tab is chosen before it opens.
    jest.useFakeTimers();
    const { modal } = openModal('ai');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(modal.querySelector('.modal-tab[data-tab="ai"]').getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(document.activeElement).toBe(modal.querySelector('#tab-btn-ai'));
  });
});
