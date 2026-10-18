/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/verification-badge.js — createVerificationBadge().
 *
 * EVENT DISPATCH NOTE:
 *   attachAccessibleHandler() wires mousedown (race-safe) and keydown (Enter/Space).
 *   Trigger the badge by dispatching a MouseEvent('mousedown') or KeyboardEvent('keydown').
 *
 * SC 2.1.1 — keyboard operable (Enter/Space activate the badge).
 * SC 1.4.1 — never colour alone: each state shows an icon AND a word.
 * SC 3.2.4 — consistent identifier: the badge class is always 'assist-cite-verify'.
 * SC 3.3.4 — error prevention: explicit unlock is required before editing a verified citation.
 */

import { createVerificationBadge } from '../../../../src/features/citations/ui/verification-badge.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function fireEnter(el) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function makeInput() {
  return document.createElement('input');
}

// ── Default state (verified: false) ──────────────────────────────────────────

describe('createVerificationBadge() — default (verified: false)', () => {
  test('returns el, setVerified, isVerified, isLocked, lock, unlock, destroy', () => {
    const badge = createVerificationBadge();
    expect(badge.el).toBeInstanceOf(HTMLButtonElement);
    expect(typeof badge.setVerified).toBe('function');
    expect(typeof badge.isVerified).toBe('function');
    expect(typeof badge.isLocked).toBe('function');
    expect(typeof badge.lock).toBe('function');
    expect(typeof badge.unlock).toBe('function');
    expect(typeof badge.destroy).toBe('function');
  });

  test('el has class assist-cite-verify and type="button"', () => {
    const { el } = createVerificationBadge();
    expect(el.classList.contains('assist-cite-verify')).toBe(true);
    expect(el.getAttribute('type')).toBe('button');
  });

  test('not verified by default: word is "Not verified"', () => {
    const { el } = createVerificationBadge();
    expect(el.textContent).toContain('Not verified');
  });

  test('not verified by default: icon is aria-hidden, shows neutral glyph', () => {
    const { el } = createVerificationBadge();
    const icon = el.querySelector('.assist-cite-verify__icon');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('not verified: isVerified() and isLocked() are both false', () => {
    const badge = createVerificationBadge();
    expect(badge.isVerified()).toBe(false);
    expect(badge.isLocked()).toBe(false);
  });

  test('not verified: does NOT add --locked class', () => {
    const { el } = createVerificationBadge();
    expect(el.classList.contains('assist-cite-verify--locked')).toBe(false);
  });

  test('not verified: a passed control has readOnly false', () => {
    const ctrl = makeInput();
    createVerificationBadge({ controls: [ctrl] });
    expect(ctrl.readOnly).toBe(false);
  });

  test('not verified: activating the badge (mousedown) does nothing — no lock change', () => {
    const onLock = jest.fn();
    const onUnlock = jest.fn();
    const badge = createVerificationBadge({ onLock, onUnlock });
    fireMousedown(badge.el);
    expect(onLock).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(badge.isLocked()).toBe(false);
  });
});

// ── setVerified(true) → locked by default ─────────────────────────────────────

describe('createVerificationBadge() — setVerified(true)', () => {
  test('isVerified() returns true after setVerified(true)', () => {
    const badge = createVerificationBadge();
    badge.setVerified(true);
    expect(badge.isVerified()).toBe(true);
  });

  test('isLocked() returns true after setVerified(true)', () => {
    const badge = createVerificationBadge();
    badge.setVerified(true);
    expect(badge.isLocked()).toBe(true);
  });

  test('adds --locked class after setVerified(true)', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    expect(el.classList.contains('assist-cite-verify--locked')).toBe(true);
  });

  test('shows lock icon 🔒 when verified + locked', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    const icon = el.querySelector('.assist-cite-verify__icon');
    expect(icon.textContent).toBe('🔒');
  });

  test('word reads "Verified" when verified + locked', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    expect(el.textContent).toContain('Verified');
  });

  test('passed control has readOnly true after setVerified(true)', () => {
    const ctrl = makeInput();
    const badge = createVerificationBadge({ controls: [ctrl] });
    badge.setVerified(true);
    expect(ctrl.readOnly).toBe(true);
  });

  test('aria-pressed reflects locked state (true when locked)', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    expect(el.getAttribute('aria-pressed')).toBe('true');
  });

  test('aria-label describes the locked state', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    expect(el.getAttribute('aria-label')).toMatch(/locked/i);
  });
});

// ── Toggling lock via mousedown ───────────────────────────────────────────────

describe('createVerificationBadge() — mousedown toggles lock when verified', () => {
  test('activating a locked verified badge unlocks it', () => {
    const badge = createVerificationBadge({ verified: true });
    fireMousedown(badge.el);
    expect(badge.isLocked()).toBe(false);
  });

  test('unlocking makes control.readOnly false', () => {
    const ctrl = makeInput();
    const badge = createVerificationBadge({ verified: true, controls: [ctrl] });
    fireMousedown(badge.el);
    expect(ctrl.readOnly).toBe(false);
  });

  test('unlocking shows open-lock icon 🔓', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    fireMousedown(el);
    const icon = el.querySelector('.assist-cite-verify__icon');
    expect(icon.textContent).toBe('🔓');
  });

  test('unlocking word reads "Verified · editing"', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    fireMousedown(el);
    expect(el.textContent).toContain('Verified · editing');
  });

  test('unlocking removes --locked class', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    fireMousedown(el);
    expect(el.classList.contains('assist-cite-verify--locked')).toBe(false);
  });

  test('unlocking calls onUnlock once', () => {
    const onUnlock = jest.fn();
    const badge = createVerificationBadge({ verified: true, onUnlock });
    fireMousedown(badge.el);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  test('aria-pressed is false when unlocked-but-verified', () => {
    const { el, setVerified } = createVerificationBadge();
    setVerified(true);
    fireMousedown(el);
    expect(el.getAttribute('aria-pressed')).toBe('false');
  });

  test('activating an unlocked verified badge re-locks it', () => {
    const badge = createVerificationBadge({ verified: true });
    fireMousedown(badge.el); // unlock
    fireMousedown(badge.el); // re-lock
    expect(badge.isLocked()).toBe(true);
  });

  test('re-locking restores control.readOnly true', () => {
    const ctrl = makeInput();
    const badge = createVerificationBadge({ verified: true, controls: [ctrl] });
    fireMousedown(badge.el); // unlock
    fireMousedown(badge.el); // re-lock
    expect(ctrl.readOnly).toBe(true);
  });

  test('re-locking calls onLock once', () => {
    const onLock = jest.fn();
    const badge = createVerificationBadge({ verified: true, onLock });
    fireMousedown(badge.el); // unlock (no onLock call expected here)
    fireMousedown(badge.el); // re-lock
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});

// ── Keyboard activation (SC 2.1.1) ───────────────────────────────────────────

describe('createVerificationBadge() — keyboard activation (Enter)', () => {
  test('Enter unlocks a locked verified badge', () => {
    const badge = createVerificationBadge({ verified: true });
    fireEnter(badge.el);
    expect(badge.isLocked()).toBe(false);
  });

  test('Enter re-locks when unlocked-verified', () => {
    const badge = createVerificationBadge({ verified: true });
    fireEnter(badge.el); // unlock
    fireEnter(badge.el); // re-lock
    expect(badge.isLocked()).toBe(true);
  });

  test('Enter does nothing when not verified', () => {
    const badge = createVerificationBadge();
    fireEnter(badge.el);
    expect(badge.isLocked()).toBe(false);
  });
});

// ── No re-fire loop guard ──────────────────────────────────────────────────────

describe('createVerificationBadge() — no-re-fire (loop prevention)', () => {
  test('lock() when already locked does NOT call onLock again', () => {
    const onLock = jest.fn();
    const badge = createVerificationBadge({ verified: true, onLock });
    // Already locked after setVerified(true) — calling lock() again is a no-op.
    badge.lock();
    expect(onLock).not.toHaveBeenCalled();
  });

  test('unlock() when already unlocked does NOT call onUnlock again', () => {
    const onUnlock = jest.fn();
    const badge = createVerificationBadge({ verified: true, onUnlock });
    badge.unlock(); // first unlock — fires once
    const callsAfterFirst = onUnlock.mock.calls.length;
    badge.unlock(); // second unlock — must be no-op
    expect(onUnlock.mock.calls.length).toBe(callsAfterFirst); // no additional call
  });
});

// ── Explicit lock()/unlock() API ──────────────────────────────────────────────

describe('createVerificationBadge() — explicit lock() / unlock() API', () => {
  test('lock() when not verified is a no-op', () => {
    const badge = createVerificationBadge();
    badge.lock();
    expect(badge.isLocked()).toBe(false);
  });

  test('unlock() when not verified is a no-op', () => {
    const badge = createVerificationBadge();
    badge.unlock();
    expect(badge.isLocked()).toBe(false);
  });

  test('unlock() when verified transitions to unlocked state', () => {
    const badge = createVerificationBadge({ verified: true });
    badge.unlock();
    expect(badge.isLocked()).toBe(false);
  });

  test('lock() after unlock() re-locks', () => {
    const badge = createVerificationBadge({ verified: true });
    badge.unlock();
    badge.lock();
    expect(badge.isLocked()).toBe(true);
  });
});

// ── Multiple controls ─────────────────────────────────────────────────────────

describe('createVerificationBadge() — multiple controls', () => {
  test('all controls flip to readOnly on setVerified(true)', () => {
    const inputs = [makeInput(), makeInput(), makeInput()];
    const badge = createVerificationBadge({ controls: inputs });
    badge.setVerified(true);
    expect(inputs.every(i => i.readOnly)).toBe(true);
  });

  test('all controls flip back to editable on unlock', () => {
    const inputs = [makeInput(), makeInput(), makeInput()];
    const badge = createVerificationBadge({ verified: true, controls: inputs });
    badge.unlock();
    expect(inputs.every(i => !i.readOnly)).toBe(true);
  });
});

// ── setVerified(false) — returns to unverified state ─────────────────────────

describe('createVerificationBadge() — setVerified(false)', () => {
  test('setVerified(false) after true resets to unverified, unlocked', () => {
    const badge = createVerificationBadge({ verified: true });
    badge.setVerified(false);
    expect(badge.isVerified()).toBe(false);
    expect(badge.isLocked()).toBe(false);
  });

  test('setVerified(false) removes --locked class', () => {
    const { el, setVerified } = createVerificationBadge({ verified: true });
    setVerified(false);
    expect(el.classList.contains('assist-cite-verify--locked')).toBe(false);
  });

  test('setVerified(false) makes controls editable', () => {
    const ctrl = makeInput();
    const badge = createVerificationBadge({ verified: true, controls: [ctrl] });
    badge.setVerified(false);
    expect(ctrl.readOnly).toBe(false);
  });

  test('setVerified(false) word returns to "Not verified"', () => {
    const { el, setVerified } = createVerificationBadge({ verified: true });
    setVerified(false);
    expect(el.textContent).toContain('Not verified');
  });
});

// ── destroy() ────────────────────────────────────────────────────────────────

describe('createVerificationBadge() — destroy()', () => {
  test('mousedown after destroy() does not toggle state', () => {
    const badge = createVerificationBadge({ verified: true });
    badge.destroy();
    fireMousedown(badge.el);
    // Still locked — the handler is gone so the click had no effect.
    expect(badge.isLocked()).toBe(true);
  });
});
