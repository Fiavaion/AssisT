/**
 * @jest-environment jsdom
 *
 * Unit tests for action-tray.js — showSaveTray, showInfoTray, hideTray.
 *
 * KEY DETAIL — event dispatching:
 *   Tray buttons are wired with attachAccessibleHandler() from
 *   src/utils/event-handlers.js.  That utility activates on the 'mousedown'
 *   DOM event (NOT 'click') and calls e.preventDefault() + e.stopPropagation(),
 *   and separately on Enter and Space. So a pointer press is a MouseEvent of type
 *   'mousedown', and a keyboard press is a real KeyboardEvent — see the last block.
 *
 *   requestAnimationFrame is not implemented in jsdom so we call the
 *   rAF callback synchronously via a spy in beforeEach, which ensures the
 *   tray gets its 'show' class added without needing timers.
 */

import { showSaveTray, showInfoTray, hideTray } from '../../../src/utils/action-tray.js';

// ---------------------------------------------------------------------------
// jsdom shims
// ---------------------------------------------------------------------------

// requestAnimationFrame — invoke the callback synchronously so 'show' is added
// without needing fake timer advancement.
beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  // Remove any tray left in the DOM between tests.
  document.querySelectorAll('.assist-action-tray').forEach(el => el.remove());
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: fire a mousedown event on an element
// ---------------------------------------------------------------------------

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// showSaveTray — structure & ARIA
// ---------------------------------------------------------------------------

describe('showSaveTray()', () => {
  test('appends a .assist-action-tray element to document.body', () => {
    showSaveTray({ title: 'My Title', projectName: 'Project X' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray).not.toBeNull();
    expect(document.body.contains(tray)).toBe(true);
  });

  test('tray has role="status" and aria-live="polite"', () => {
    showSaveTray({ title: 'T', projectName: 'P' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.getAttribute('role')).toBe('status');
    expect(tray.getAttribute('aria-live')).toBe('polite');
  });

  test('tray text contains the project name', () => {
    showSaveTray({ title: 'Irrelevant', projectName: 'Project X' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.textContent).toContain('Project X');
  });

  test('tray text contains the citation title', () => {
    showSaveTray({ title: 'My Title', projectName: 'Project X' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.textContent).toContain('My Title');
  });

  test('tray text includes "Saved to Project X"', () => {
    showSaveTray({ title: 'Whatever', projectName: 'Project X' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.textContent).toContain('Saved to Project X');
  });

  // ── button callbacks ──────────────────────────────────────────────────────

  test('onUndo callback is invoked when the Undo button fires mousedown', () => {
    const onUndo = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onUndo });

    const undoBtn = Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
      btn => btn.textContent === 'Undo'
    );
    expect(undoBtn).toBeDefined();
    fireMousedown(undoBtn);

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('onEdit callback is invoked when the Edit button fires mousedown', () => {
    const onEdit = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onEdit });

    const editBtn = Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
      btn => btn.textContent === 'Edit'
    );
    expect(editBtn).toBeDefined();
    fireMousedown(editBtn);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('no Undo button when onUndo is not provided', () => {
    showSaveTray({ title: 'T', projectName: 'P', onEdit: jest.fn() });
    const btns = Array.from(document.querySelectorAll('.assist-action-tray-btn')).map(b => b.textContent);
    expect(btns).not.toContain('Undo');
  });

  // ── deduplication ────────────────────────────────────────────────────────

  test('calling showSaveTray twice keeps only one tray in the DOM', () => {
    showSaveTray({ title: 'First', projectName: 'P' });
    showSaveTray({ title: 'Second', projectName: 'P' });

    // The first tray gets the 'show' class removed and is scheduled for removal
    // after 250 ms; by the time we query there should be exactly one tray with
    // the new content visible (the second one).
    const allTrays = document.querySelectorAll('.assist-action-tray');
    // At most two exist briefly (old one fading out + new one); the active one
    // must show the new title.
    const visible = Array.from(allTrays).filter(t => t.classList.contains('show'));
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('Second');
  });
});

// ---------------------------------------------------------------------------
// hideTray()
// ---------------------------------------------------------------------------

describe('hideTray()', () => {
  test('removes the "show" class from the active tray immediately', () => {
    showSaveTray({ title: 'T', projectName: 'P', duration: 0 });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.classList.contains('show')).toBe(true);

    hideTray();
    expect(tray.classList.contains('show')).toBe(false);
  });

  test('removes the tray element from the DOM after the 250 ms transition', () => {
    jest.useFakeTimers();
    showSaveTray({ title: 'T', projectName: 'P', duration: 0 });

    hideTray();
    // Before the timeout fires, the element still exists (removing 'show' is instant,
    // but the DOM removal is deferred 250 ms).
    jest.advanceTimersByTime(300);
    const tray = document.querySelector('.assist-action-tray');
    expect(tray).toBeNull();
  });

  test('calling hideTray() when no tray is active does not throw', () => {
    expect(() => hideTray()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// showInfoTray()
// ---------------------------------------------------------------------------

describe('showInfoTray()', () => {
  test('appends a .assist-action-tray element with the supplied message', () => {
    showInfoTray({ message: 'Already saved' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray).not.toBeNull();
    expect(tray.textContent).toContain('Already saved');
  });

  test('tray has role="status" and aria-live="polite"', () => {
    showInfoTray({ message: 'Info' });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.getAttribute('role')).toBe('status');
    expect(tray.getAttribute('aria-live')).toBe('polite');
  });

  test('action button appears when actionLabel + onAction are provided', () => {
    const onAction = jest.fn();
    showInfoTray({ message: 'Already saved', actionLabel: 'Edit', onAction });

    const btn = Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
      b => b.textContent === 'Edit'
    );
    expect(btn).toBeDefined();
  });

  test('onAction is invoked when the action button fires mousedown', () => {
    const onAction = jest.fn();
    showInfoTray({ message: 'Already saved', actionLabel: 'Edit', onAction });

    const btn = Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
      b => b.textContent === 'Edit'
    );
    fireMousedown(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('no action button when actionLabel / onAction are omitted', () => {
    showInfoTray({ message: 'Info only' });
    const btns = document.querySelectorAll('.assist-action-tray-btn');
    expect(btns.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Keyboard operability (WCAG 2.2 SC 2.1.1)
// ---------------------------------------------------------------------------

/**
 * A native button never emits mousedown from the keyboard: Enter and Space produce a click.
 * These press the key itself rather than going through fireMousedown, which is the whole point —
 * a tray wired to mousedown alone passes every test above and is still dead to a keyboard.
 */
function pressEnter(el) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function pressSpace(el) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
}

function trayButton(label) {
  return Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
    b => b.textContent === label
  );
}

describe('tray buttons from the keyboard', () => {
  test('Undo answers Enter', () => {
    const onUndo = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onUndo });
    pressEnter(trayButton('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('Undo answers Space', () => {
    const onUndo = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onUndo });
    pressSpace(trayButton('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('Edit answers Enter', () => {
    const onEdit = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onEdit });
    pressEnter(trayButton('Edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('the info tray action answers Enter', () => {
    const onAction = jest.fn();
    showInfoTray({ message: 'Already saved', actionLabel: 'Edit', onAction });
    pressEnter(trayButton('Edit'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Reaching the tray by keyboard (SC 2.1.1) and its time limit (SC 2.2.1)
// ---------------------------------------------------------------------------

/**
 * W5 finding: the tray is appended at the end of <body>, so Undo sat 10-24 Tab presses away and
 * was gone (8 s) before a keyboard student could reach it. The tray now names a shortcut in its
 * own announcement, that shortcut moves focus into it, and the same key (or Escape) hands focus
 * back to whatever the student was using.
 */
const TRAY_KEY = { key: 'U', code: 'KeyU', altKey: true, shiftKey: true };

function pressTrayKey(target = document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { ...TRAY_KEY, bubbles: true, cancelable: true }));
}

function pressEscape(target = document) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
}

/** A focusable stand-in for whatever the student was using when the tray appeared. */
function focusedInput() {
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  return input;
}

describe('reaching the tray by keyboard', () => {
  test('the announcement names the shortcut and the action it reaches', () => {
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    const tray = document.querySelector('.assist-action-tray');
    expect(tray.textContent).toContain('Alt+Shift+U');
    expect(tray.textContent).toContain('Undo');
  });

  test('showing the tray does not steal focus from what the student is typing in', () => {
    const input = focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    expect(document.activeElement).toBe(input);
  });

  test('the shortcut moves focus onto Undo', () => {
    focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onEdit: jest.fn(), onUndo: jest.fn() });
    pressTrayKey();
    expect(document.activeElement).toBe(trayButton('Undo'));
  });

  test('the shortcut reaches the only action when there is no Undo', () => {
    focusedInput();
    showInfoTray({ message: 'Already saved', actionLabel: 'Add quote', onAction: jest.fn() });
    pressTrayKey();
    expect(document.activeElement).toBe(trayButton('Add quote'));
  });

  test('pressing the shortcut again returns focus to where it was', () => {
    const input = focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    pressTrayKey();
    pressTrayKey(document.activeElement);
    expect(document.activeElement).toBe(input);
  });

  test('Escape inside the tray returns focus to where it was', () => {
    const input = focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    pressTrayKey();
    pressEscape(document.activeElement);
    expect(document.activeElement).toBe(input);
  });

  test('the shortcut does nothing once the tray has gone', () => {
    const input = focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    hideTray();
    pressTrayKey();
    expect(document.activeElement).toBe(input);
  });

  test('focus is never left on BODY after the tray closes', () => {
    const input = focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn() });
    pressTrayKey();
    pressEnter(trayButton('Undo'));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(input);
  });
});

describe('the tray time limit (SC 2.2.1)', () => {
  test('a tray holding Undo lasts at least 20 seconds even when asked for 8', () => {
    jest.useFakeTimers();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn(), duration: 8000 });
    jest.advanceTimersByTime(19000);
    expect(document.querySelector('.assist-action-tray')).not.toBeNull();
  });

  test('the timer does not run while focus is inside the tray', () => {
    focusedInput();
    showSaveTray({ title: 'T', projectName: 'P', onUndo: jest.fn(), duration: 8000 });
    jest.useFakeTimers();
    pressTrayKey();
    jest.advanceTimersByTime(120000);
    expect(document.querySelector('.assist-action-tray')).not.toBeNull();
  });

  test('a tray with no action keeps its short duration', () => {
    jest.useFakeTimers();
    showInfoTray({ message: 'Citation removed', duration: 5000 });
    jest.advanceTimersByTime(5600);
    expect(document.querySelector('.assist-action-tray')).toBeNull();
  });
});
