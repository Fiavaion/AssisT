/**
 * @jest-environment jsdom
 *
 * Speed Read (RSVP) covers the whole page and takes over Space and the arrow keys, but it
 * shipped as a plain <div>: no role, no accessible name, and focus left on the page behind
 * it. A keyboard user tabbed through the page underneath instead of the overlay's own
 * Slower / Play / Faster / Close controls, and a screen-reader user was told nothing.
 *
 * It must be a labelled modal dialog: focus moves in on open, Tab stays inside, Escape and
 * Close put focus back where it was. The word itself must not be announced word by word —
 * only the play/pause and speed state, politely.
 */

import { RSVPUI } from '../../../src/features/rsvp/rsvp-ui.js';

let ui;

beforeEach(() => {
  document.body.innerHTML = '<button id="page-button">Speed read this</button>';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  ui = new RSVPUI();
});

afterEach(() => {
  ui.cleanup();
});

function overlay() {
  return document.getElementById('assist-rsvp-overlay');
}

function controls() {
  return Array.from(overlay().querySelectorAll('button'));
}

function pressKey(key, init = {}) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

describe('RSVP overlay — a labelled modal dialog', () => {
  test('announces itself as a modal dialog with a name', () => {
    ui.show();

    expect(overlay().getAttribute('role')).toBe('dialog');
    expect(overlay().getAttribute('aria-modal')).toBe('true');
    expect(overlay().getAttribute('aria-label')).toBeTruthy();
  });

  test('moves focus to its first control on open', () => {
    document.getElementById('page-button').focus();
    ui.show();

    expect(overlay().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(controls()[0]);
  });

  test('Tab from the last control wraps to the first, not out to the page', () => {
    ui.show();
    const buttons = controls();
    buttons[buttons.length - 1].focus();

    pressKey('Tab');

    expect(document.activeElement).toBe(buttons[0]);
  });

  test('Shift+Tab from the first control wraps to the last', () => {
    ui.show();
    const buttons = controls();
    buttons[0].focus();

    pressKey('Tab', { shiftKey: true });

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  test('Tab from somewhere on the page behind pulls focus back into the dialog', () => {
    ui.show();
    document.getElementById('page-button').focus();

    pressKey('Tab');

    expect(overlay().contains(document.activeElement)).toBe(true);
  });

  test('Escape closes and focus goes back to where it came from', () => {
    const opener = document.getElementById('page-button');
    opener.focus();
    ui.onClose = () => ui.cleanup();

    ui.show();
    expect(document.activeElement).not.toBe(opener);

    pressKey('Escape');

    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test('the Close button returns focus the same way', () => {
    const opener = document.getElementById('page-button');
    opener.focus();
    ui.onClose = () => ui.cleanup();

    ui.show();
    overlay()
      .querySelector('#assist-rsvp-close')
      .dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

    expect(overlay()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test('closing does not steal focus when the opener has gone from the page', () => {
    const opener = document.getElementById('page-button');
    opener.focus();
    ui.show();
    opener.remove();

    expect(() => ui.cleanup()).not.toThrow();
    expect(overlay()).toBeNull();
  });

  test('focus goes to the selected text when the opener was the highlight menu', () => {
    // The highlight menu activates on mousedown and is removed before the overlay exists, so
    // the remembered opener is a detached button. Focus must land on the words the student
    // selected, not at the top of the page (SC 2.4.3).
    document.body.innerHTML =
      '<p id="para">Working memory holds a little</p>' +
      '<button id="menu-button">Speed Read</button>';
    const menuButton = document.getElementById('menu-button');
    const selection = document.getElementById('para');
    menuButton.focus();

    ui.show({ returnFocus: selection });
    menuButton.remove();
    ui.cleanup();

    expect(document.activeElement).toBe(selection);
    expect(selection.getAttribute('tabindex')).toBe('-1');
  });

  test('focus goes to the selected text when nothing was focused at all', () => {
    document.body.innerHTML = '<p id="para">Working memory holds a little</p>';
    const selection = document.getElementById('para');

    ui.show({ returnFocus: selection });
    ui.cleanup();

    expect(document.activeElement).toBe(selection);
  });

  test('a real opener still wins over the fallback', () => {
    const opener = document.getElementById('page-button');
    const selection = document.createElement('p');
    selection.textContent = 'Working memory holds a little';
    document.body.appendChild(selection);
    opener.focus();

    ui.show({ returnFocus: selection });
    ui.cleanup();

    expect(document.activeElement).toBe(opener);
  });
});

describe('RSVP overlay — what is announced', () => {
  test('the word display is not a live region', () => {
    ui.show();
    const word = overlay().querySelector('#assist-rsvp-word');

    expect(word.getAttribute('aria-live')).toBeNull();
    expect(word.getAttribute('role')).toBeNull();
    expect(word.closest('[aria-live]')).toBeNull();
  });

  test('advancing a word writes nothing to the status region', () => {
    ui.show();
    const status = overlay().querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');

    const before = status.textContent;
    ui.updateWord({ word: 'memory', orp: { before: 'me', orp: 'm', after: 'ory' } });
    ui.updateProgress({ current: 4, total: 40, percentage: 10 });

    expect(overlay().querySelector('.orp-character').textContent).toBe('m');
    expect(status.textContent).toBe(before);
  });

  test('play, pause and speed are announced politely', () => {
    ui.show();
    const status = overlay().querySelector('[role="status"]');

    ui.updatePlayPauseButton(true);
    expect(status.textContent.toLowerCase()).toContain('playing');

    ui.updatePlayPauseButton(false);
    expect(status.textContent.toLowerCase()).toContain('paused');

    ui.updateSpeed(325);
    expect(status.textContent).toContain('325');
  });
});

describe('RSVP overlay — keys do one thing at a time', () => {
  test('Space on a focused control does not also fire the global play/pause', () => {
    const onPlayPause = jest.fn();
    ui.onPlayPause = onPlayPause;
    ui.show();

    const slower = overlay().querySelector('#assist-rsvp-slower');
    const onSpeedChange = jest.fn();
    ui.onSpeedChange = onSpeedChange;
    slower.focus();

    slower.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(onSpeedChange).toHaveBeenCalledTimes(1);
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  test('Space with focus on the dialog itself still toggles play/pause', () => {
    const onPlayPause = jest.fn();
    ui.onPlayPause = onPlayPause;
    ui.show();
    overlay().focus();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });
});
