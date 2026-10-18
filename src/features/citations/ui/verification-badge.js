/**
 * Verification Badge Component
 *
 * A leaf UI component that gates editing of a verified citation. When a citation
 * has been marked verified (by an external process — NOT this component), the badge
 * displays a padlock and sets every controlled form element to `readOnly`. The user
 * must explicitly activate the badge to unlock editing (SC 3.3.4 — error prevention).
 *
 * CRITICAL: This component performs NO verification itself and makes no network calls.
 * It only reflects the `verified` flag passed in and toggles the lock state. This is
 * the architectural guarantee that prevents the re-check loop found in the old code.
 *
 * Public API:
 *   createVerificationBadge(options) -> {
 *     el,             // <button type="button" class="assist-cite-verify">
 *     setVerified(bool),
 *     isVerified(), isLocked(),
 *     lock(), unlock(),
 *     destroy(),
 *   }
 *
 * Design principles:
 *   - Three states each combine icon + word + aria — never colour alone (SC 1.4.1).
 *   - Consistent `assist-cite-verify` class identifier across all states (SC 3.2.4).
 *   - Keyboard operable via attachAccessibleHandler (mousedown + Enter/Space, SC 2.1.1).
 *   - Re-entrancy guard: lock() when already locked and unlock() when already unlocked
 *     are strict no-ops — callbacks are NOT fired — eliminating re-check loops.
 *   - All text via textContent; aria via setAttribute. No innerHTML with user data.
 *
 * @module features/citations/ui/verification-badge
 */

import { attachAccessibleHandler } from '../../../utils/event-handlers.js';

// ── State configuration ───────────────────────────────────────────────────────

/**
 * Visible label configuration for each logical state.
 * Every entry pairs an icon with a word — never colour alone (SC 1.4.1).
 */
const STATE_CONFIG = Object.freeze({
  unverified: {
    icon: '○',
    word: 'Not verified',
    ariaLabel: 'Not verified. Activating this badge has no effect.',
    ariaPressed: 'false',
    locked: false,
  },
  verified_locked: {
    icon: '🔒',
    word: 'Verified',
    ariaLabel: 'Verified and locked. Activate to unlock for editing.',
    ariaPressed: 'true',
    locked: true,
  },
  verified_unlocked: {
    icon: '🔓',
    word: 'Verified · editing',
    ariaLabel: 'Verified but unlocked. Activate to lock and prevent accidental edits.',
    ariaPressed: 'false',
    locked: false,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply a state to the badge element and its controlled form elements.
 * @param {HTMLButtonElement} el - the badge button
 * @param {HTMLElement[]} controls - controlled form elements
 * @param {'unverified'|'verified_locked'|'verified_unlocked'} key
 */
function applyState(el, controls, key) {
  const cfg = STATE_CONFIG[key];

  // Update icon text (aria-hidden span, so not announced twice by AT).
  const iconEl = el.querySelector('.assist-cite-verify__icon');
  if (iconEl) {
    iconEl.textContent = cfg.icon;
  }

  // Update the word span.
  const wordEl = el.querySelector('.assist-cite-verify__word');
  if (wordEl) {
    wordEl.textContent = cfg.word;
  }

  // Update aria on the button itself.
  el.setAttribute('aria-label', cfg.ariaLabel);
  el.setAttribute('aria-pressed', cfg.ariaPressed);

  // Toggle the --locked modifier class.
  if (cfg.locked) {
    el.classList.add('assist-cite-verify--locked');
  } else {
    el.classList.remove('assist-cite-verify--locked');
  }

  // Flip readOnly on every controlled form element.
  for (const ctrl of controls) {
    ctrl.readOnly = cfg.locked;
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a verification badge component.
 *
 * @param {Object} [options]
 * @param {boolean} [options.verified=false] - initial verification state
 * @param {HTMLElement[]} [options.controls=[]] - form elements whose readOnly is managed
 * @param {Function} [options.onLock] - called when the badge transitions to locked
 * @param {Function} [options.onUnlock] - called when the badge transitions to unlocked
 * @returns {{
 *   el: HTMLButtonElement,
 *   setVerified: (bool: boolean) => void,
 *   isVerified: () => boolean,
 *   isLocked: () => boolean,
 *   lock: () => void,
 *   unlock: () => void,
 *   destroy: () => void,
 * }}
 */
export function createVerificationBadge(options = {}) {
  const { verified: initialVerified = false, controls = [], onLock, onUnlock } = options;

  // ── Internal state ────────────────────────────────────────────────────────

  let _verified = false;
  let _locked = false;

  // ── Build the element ─────────────────────────────────────────────────────

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'assist-cite-verify';

  const iconEl = document.createElement('span');
  iconEl.className = 'assist-cite-verify__icon';
  iconEl.setAttribute('aria-hidden', 'true');
  el.appendChild(iconEl);

  const wordEl = document.createElement('span');
  wordEl.className = 'assist-cite-verify__word';
  el.appendChild(wordEl);

  // Apply initial (unverified) state before wiring handler.
  applyState(el, controls, 'unverified');

  // ── Lock / unlock logic ───────────────────────────────────────────────────

  /**
   * Transition to locked state. Only acts when verified. No-op when already locked
   * (re-entrancy guard — this is the loop prevention guarantee).
   */
  function lock() {
    if (!_verified || _locked) {
      return;
    }
    _locked = true;
    applyState(el, controls, 'verified_locked');
    if (typeof onLock === 'function') {
      onLock();
    }
  }

  /**
   * Transition to unlocked state. Only acts when verified. No-op when already unlocked.
   */
  function unlock() {
    if (!_verified || !_locked) {
      return;
    }
    _locked = false;
    applyState(el, controls, 'verified_unlocked');
    if (typeof onUnlock === 'function') {
      onUnlock();
    }
  }

  // ── Badge activation handler ──────────────────────────────────────────────

  /**
   * Toggle the lock when the badge is activated by the user.
   * When not verified, activation is a deliberate no-op (the badge is informational only).
   */
  function handleActivate() {
    if (!_verified) {
      return;
    }
    if (_locked) {
      unlock();
    } else {
      lock();
    }
  }

  // Wire via attachAccessibleHandler: mousedown (race-safe) + Enter/Space (SC 2.1.1).
  const cleanup = attachAccessibleHandler(el, 'Verification lock', handleActivate);

  // ── Public methods ────────────────────────────────────────────────────────

  /**
   * Set the verified state. `setVerified(true)` locks by default.
   * `setVerified(false)` resets to unverified + unlocked and makes controls editable.
   * @param {boolean} bool
   */
  function setVerified(bool) {
    _verified = Boolean(bool);
    if (!_verified) {
      _locked = false;
      applyState(el, controls, 'unverified');
    } else {
      // Verified defaults to locked.
      _locked = true;
      applyState(el, controls, 'verified_locked');
    }
  }

  /** @returns {boolean} */
  function isVerified() {
    return _verified;
  }

  /** @returns {boolean} */
  function isLocked() {
    return _locked;
  }

  /**
   * Remove all event handlers. Subsequent user activation has no effect.
   */
  function destroy() {
    cleanup();
  }

  // ── Apply initial verified state if provided ──────────────────────────────

  if (initialVerified) {
    setVerified(true);
  }

  // ── Return the component interface ────────────────────────────────────────

  return {
    el,
    setVerified,
    isVerified,
    isLocked,
    lock,
    unlock,
    destroy,
  };
}
