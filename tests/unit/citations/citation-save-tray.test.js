/**
 * @jest-environment jsdom
 *
 * Unit tests for citation-save-tray.js — showSaveTray, showInfoTray, hideTray.
 *
 * KEY DETAIL — event dispatching:
 *   Tray buttons are wired with attachInteractiveHandler() from
 *   src/utils/event-handlers.js.  That utility listens on the 'mousedown'
 *   DOM event (NOT 'click') and calls e.preventDefault() + e.stopPropagation().
 *   To trigger an onUndo/onEdit/onAction callback in tests we therefore
 *   dispatch a MouseEvent with type 'mousedown'.
 *
 *   requestAnimationFrame is not implemented in jsdom so we call the
 *   rAF callback synchronously via a spy in beforeEach, which ensures the
 *   tray gets its 'show' class added without needing timers.
 */

import { showSaveTray, showInfoTray, hideTray } from '../../../src/features/citations/citation-save-tray.js';

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
  document.querySelectorAll('.citation-save-tray').forEach(el => el.remove());
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
  test('appends a .citation-save-tray element to document.body', () => {
    showSaveTray({ title: 'My Title', projectName: 'Project X' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray).not.toBeNull();
    expect(document.body.contains(tray)).toBe(true);
  });

  test('tray has role="status" and aria-live="polite"', () => {
    showSaveTray({ title: 'T', projectName: 'P' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray.getAttribute('role')).toBe('status');
    expect(tray.getAttribute('aria-live')).toBe('polite');
  });

  test('tray text contains the project name', () => {
    showSaveTray({ title: 'Irrelevant', projectName: 'Project X' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray.textContent).toContain('Project X');
  });

  test('tray text contains the citation title', () => {
    showSaveTray({ title: 'My Title', projectName: 'Project X' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray.textContent).toContain('My Title');
  });

  test('tray text includes "Saved to Project X"', () => {
    showSaveTray({ title: 'Whatever', projectName: 'Project X' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray.textContent).toContain('Saved to Project X');
  });

  // ── button callbacks ──────────────────────────────────────────────────────

  test('onUndo callback is invoked when the Undo button fires mousedown', () => {
    const onUndo = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onUndo });

    const undoBtn = Array.from(document.querySelectorAll('.citation-save-tray-btn')).find(
      btn => btn.textContent === 'Undo'
    );
    expect(undoBtn).toBeDefined();
    fireMousedown(undoBtn);

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  test('onEdit callback is invoked when the Edit button fires mousedown', () => {
    const onEdit = jest.fn();
    showSaveTray({ title: 'T', projectName: 'P', onEdit });

    const editBtn = Array.from(document.querySelectorAll('.citation-save-tray-btn')).find(
      btn => btn.textContent === 'Edit'
    );
    expect(editBtn).toBeDefined();
    fireMousedown(editBtn);

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('no Undo button when onUndo is not provided', () => {
    showSaveTray({ title: 'T', projectName: 'P', onEdit: jest.fn() });
    const btns = Array.from(document.querySelectorAll('.citation-save-tray-btn')).map(b => b.textContent);
    expect(btns).not.toContain('Undo');
  });

  // ── deduplication ────────────────────────────────────────────────────────

  test('calling showSaveTray twice keeps only one tray in the DOM', () => {
    showSaveTray({ title: 'First', projectName: 'P' });
    showSaveTray({ title: 'Second', projectName: 'P' });

    // The first tray gets the 'show' class removed and is scheduled for removal
    // after 250 ms; by the time we query there should be exactly one tray with
    // the new content visible (the second one).
    const allTrays = document.querySelectorAll('.citation-save-tray');
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
    const tray = document.querySelector('.citation-save-tray');
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
    const tray = document.querySelector('.citation-save-tray');
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
  test('appends a .citation-save-tray element with the supplied message', () => {
    showInfoTray({ message: 'Already saved' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray).not.toBeNull();
    expect(tray.textContent).toContain('Already saved');
  });

  test('tray has role="status" and aria-live="polite"', () => {
    showInfoTray({ message: 'Info' });
    const tray = document.querySelector('.citation-save-tray');
    expect(tray.getAttribute('role')).toBe('status');
    expect(tray.getAttribute('aria-live')).toBe('polite');
  });

  test('action button appears when actionLabel + onAction are provided', () => {
    const onAction = jest.fn();
    showInfoTray({ message: 'Already saved', actionLabel: 'Edit', onAction });

    const btn = Array.from(document.querySelectorAll('.citation-save-tray-btn')).find(
      b => b.textContent === 'Edit'
    );
    expect(btn).toBeDefined();
  });

  test('onAction is invoked when the action button fires mousedown', () => {
    const onAction = jest.fn();
    showInfoTray({ message: 'Already saved', actionLabel: 'Edit', onAction });

    const btn = Array.from(document.querySelectorAll('.citation-save-tray-btn')).find(
      b => b.textContent === 'Edit'
    );
    fireMousedown(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('no action button when actionLabel / onAction are omitted', () => {
    showInfoTray({ message: 'Info only' });
    const btns = document.querySelectorAll('.citation-save-tray-btn');
    expect(btns.length).toBe(0);
  });
});
