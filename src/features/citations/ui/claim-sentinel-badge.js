/**
 * Claim Sentinel Badge Component
 *
 * A render-only status badge for the (M7) AI Claim Sentinel feature. It displays
 * one of four states it is told — it contains NO AI logic, NO network calls, and
 * NO storage access. It is purely presentational.
 *
 * CRITICAL product rule: the badge is rendered ONLY when AI is available. When AI
 * is off, nothing is created in the DOM — no stub, no placeholder. Consumers check
 * `b.el !== null` before mounting.
 *
 * Public API:
 *   createClaimSentinelBadge(options) -> { el, setState(state), getState(), destroy() }
 *
 * Design principles:
 *   - Every state pairs an icon with a visible word — never colour alone (SC 1.4.1).
 *   - aria-label describes the state; aria-busy="true" set only during 'checking'.
 *   - All text via textContent; aria via setAttribute. No innerHTML.
 *   - setState patches in place — never rebuilds el. Invalid states are silently ignored.
 *   - Not interactive; not focusable. Do NOT wire event handlers here.
 */

// ── State catalogue ───────────────────────────────────────────────────────────

/**
 * All valid sentinel states. Exported for consumers that need to reference them
 * (e.g. wizard CHECK step, future AI controller).
 * @type {readonly string[]}
 */
export const SENTINEL_STATES = Object.freeze(['unchecked', 'checking', 'supported', 'unsupported']);

// ── State configuration ───────────────────────────────────────────────────────

/**
 * Icon + word pair and aria label for each sentinel state.
 * Never colour alone — icon + word ensure SC 1.4.1 compliance.
 * @type {Record<string, {icon: string, word: string, aria: string, modifier: string|null, busy: boolean}>}
 */
const STATE_CONFIG = Object.freeze({
  unchecked: {
    icon: '○',
    word: 'Not checked',
    aria: 'Claim sentinel: not checked',
    modifier: null,
    busy: false,
  },
  checking: {
    icon: '…',
    word: 'Checking…',
    aria: 'Claim sentinel: checking',
    modifier: 'checking',
    busy: true,
  },
  supported: {
    icon: '✓',
    word: 'Source supports this',
    aria: 'Claim sentinel: source supports this claim',
    modifier: 'supported',
    busy: false,
  },
  unsupported: {
    icon: '⚠',
    word: 'Source may not support this',
    aria: 'Claim sentinel: source may not support this claim',
    modifier: 'unsupported',
    busy: false,
  },
});

// ── All valid modifier suffixes — used to sweep the class list on setState ────
const ALL_MODIFIERS = ['checking', 'supported', 'unsupported'];

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a Claim Sentinel badge.
 *
 * @param {Object}  [options]
 * @param {string}  [options.state='unchecked'] - initial state
 * @param {boolean} [options.available=true]    - when false, nothing is created in the DOM
 * @returns {{ el: HTMLElement|null, setState(state: string): void, getState(): string|null, destroy(): void }}
 */
export function createClaimSentinelBadge(options = {}) {
  const { state: initialState = 'unchecked', available = true } = options;

  // ── No-stub guarantee: when AI is off, return an inert object with no DOM ──
  if (!available) {
    return {
      el: null,
      setState: () => {},
      getState: () => null,
      destroy: () => {},
    };
  }

  // ── Build the badge element ───────────────────────────────────────────────

  const el = document.createElement('span');
  el.className = 'assist-cite-sentinel';

  const iconEl = document.createElement('span');
  iconEl.className = 'assist-cite-sentinel__icon';
  iconEl.setAttribute('aria-hidden', 'true');

  const wordEl = document.createElement('span');
  wordEl.className = 'assist-cite-sentinel__word';

  el.appendChild(iconEl);
  el.appendChild(wordEl);

  // Apply the initial state (validates; falls back to 'unchecked' if invalid).
  const safeInitial = SENTINEL_STATES.includes(initialState) ? initialState : 'unchecked';
  let currentState = safeInitial;
  applyState(el, iconEl, wordEl, safeInitial);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Transition the badge to a new state. Patches el in place.
   * Silently ignores unknown/invalid state strings.
   * @param {string} state
   */
  function setState(state) {
    if (!SENTINEL_STATES.includes(state)) {
      return; // guard: unknown state — keep previous valid state
    }
    currentState = state;
    applyState(el, iconEl, wordEl, state);
  }

  /** @returns {string} current state string */
  function getState() {
    return currentState;
  }

  /** Remove the badge from the DOM if it is mounted. */
  function destroy() {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  return { el, setState, getState, destroy };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Patch the badge element in place for the given state.
 * Swaps the modifier class, icon, word, aria-label, and aria-busy.
 * Never rebuilds el or uses innerHTML.
 *
 * @param {HTMLElement} el     - the root badge <span>
 * @param {HTMLElement} iconEl - the icon child <span>
 * @param {HTMLElement} wordEl - the word child <span>
 * @param {string}      state  - a valid SENTINEL_STATE value
 */
function applyState(el, iconEl, wordEl, state) {
  const cfg = STATE_CONFIG[state];

  // Swap modifier class: remove all state modifiers then add the current one.
  for (const mod of ALL_MODIFIERS) {
    el.classList.remove(`assist-cite-sentinel--${mod}`);
  }
  if (cfg.modifier) {
    el.classList.add(`assist-cite-sentinel--${cfg.modifier}`);
  }

  // Patch text content in place.
  iconEl.textContent = cfg.icon;
  wordEl.textContent = cfg.word;

  // Patch aria attributes.
  el.setAttribute('aria-label', cfg.aria);
  if (cfg.busy) {
    el.setAttribute('aria-busy', 'true');
  } else {
    el.removeAttribute('aria-busy');
  }
}
