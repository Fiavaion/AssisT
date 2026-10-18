/**
 * Reassurance Panel Component
 *
 * The "Is this right?" anxiety-reducing verdict shown in the wizard's CHECK step.
 * Reusable standalone — takes a citation, assesses it via the reassurance engine,
 * and renders a green / amber / red panel with plain-language reasons and
 * keyboard-operable "Fix the …" deep-links to the right wizard step.
 *
 * Public API:
 *   createReassurancePanel(options) -> { el, update(citation), destroy() }
 *
 * Design principles:
 *   - Colour + icon + word together — never colour alone (SC 1.4.1).
 *   - Plain-language reason messages via textContent — no error codes (SC 3.3.1 / 3.3.3).
 *   - Fix buttons wired with attachAccessibleHandler: mousedown-first PLUS Enter/Space
 *     keyboard activation (SC 2.1.1).
 *   - update() patches in place; destroys previous fix-button handlers before rebuilding.
 *   - destroy() runs all current fix-button cleanups; no leaked listeners.
 *   - aria-live="polite" on the container so screen readers announce updates in the wizard.
 */

import { assessCitation, FIELDS } from '../reassurance-engine.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Icon + heading word for each verdict level. Never colour alone (SC 1.4.1) — the word is
 * what the screen reader conveys; the colour is decorative reinforcement only.
 * @type {Record<string, {icon: string, word: string}>}
 */
const LEVEL_CONFIG = Object.freeze({
  green: { icon: '✓', word: 'This looks right' },
  amber: { icon: '!', word: 'Worth a check' },
  red: { icon: '✕', word: "Let's fix this" },
});

/**
 * Maps each fixable FIELD to a human-readable label and its wizard step ID.
 * "Fix the {label}" — the label finishes the sentence.
 * `none` is the positive (green) field and is never fixable.
 * @type {Record<string, {label: string, step: string}>}
 */
const FIELD_FIX_MAP = Object.freeze({
  [FIELDS.TITLE]: { label: 'title', step: 'what' },
  [FIELDS.AUTHOR]: { label: 'author', step: 'who' },
  [FIELDS.YEAR]: { label: 'year', step: 'when' },
  [FIELDS.LINK]: { label: 'link or DOI', step: 'where' },
  [FIELDS.CONTAINER]: { label: 'journal name', step: 'where' },
});

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Swap the level modifier class on the container in place.
 * @param {HTMLElement} el
 * @param {string} nextLevel - 'green' | 'amber' | 'red'
 */
function applyLevel(el, nextLevel) {
  for (const lvl of ['green', 'amber', 'red']) {
    el.classList.remove(`assist-cite-reassure--${lvl}`);
  }
  el.classList.add(`assist-cite-reassure--${nextLevel}`);
}

/**
 * Patch the head element's icon and word in place.
 * @param {HTMLElement} iconEl
 * @param {HTMLElement} wordEl
 * @param {string} level
 */
function applyHead(iconEl, wordEl, level) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.amber;
  iconEl.textContent = cfg.icon;
  wordEl.textContent = cfg.word;
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a reassurance panel component.
 *
 * @param {Object} [options]
 * @param {string} [options.style] - the student's citation style, for the capitals hint
 * @param {Function} [options.onFix] - called with a wizard step ID string
 *   ('what' | 'who' | 'when' | 'where') when the user activates a "Fix the …" button.
 *   When omitted, no fix buttons are rendered.
 * @returns {{ el: HTMLDivElement, update: Function, destroy: Function }}
 */
export function createReassurancePanel(options = {}) {
  const { onFix, style } = options;

  // Tracks the current set of fix buttons and their cleanup functions.
  /** @type {Array<{btn: HTMLButtonElement, cleanup: Function}>} */
  let fixEntries = [];

  // ── Build the skeleton ──────────────────────────────────────────────────────

  const el = document.createElement('div');
  el.className = 'assist-cite-reassure assist-cite-reassure--green';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  // Head — icon + heading word (both required for SC 1.4.1).
  const head = document.createElement('div');
  head.className = 'assist-cite-reassure__head';

  const iconEl = document.createElement('span');
  iconEl.className = 'assist-cite-reassure__icon';
  iconEl.setAttribute('aria-hidden', 'true');

  const wordEl = document.createElement('span');

  head.appendChild(iconEl);
  head.appendChild(wordEl);
  el.appendChild(head);

  // Reason list — rebuilt on every update.
  const listEl = document.createElement('ul');
  listEl.className = 'assist-cite-reassure__list';
  el.appendChild(listEl);

  // ── Internal render ─────────────────────────────────────────────────────────

  /**
   * Tear down existing fix-button handlers, then rebuild the reason list and
   * fix buttons from the provided assessment result.
   * @param {{ level: string, reasons: Array<{level: string, field: string, message: string}> }} assessment
   */
  function renderAssessment(assessment) {
    const { level, reasons } = assessment;

    // 1. Clean up previous fix-button handlers and remove their elements.
    fixEntries.forEach(({ btn, cleanup }) => {
      cleanup();
      btn.remove();
    });
    fixEntries = [];

    // 2. Swap level class and patch icon + word.
    applyLevel(el, level);
    applyHead(iconEl, wordEl, level);

    // 3. Rebuild the reason list.
    listEl.textContent = '';
    for (const reason of reasons) {
      const li = document.createElement('li');
      li.textContent = reason.message;
      listEl.appendChild(li);
    }

    // 4. Render fix buttons — one per distinct fixable field.
    //    Only rendered when onFix is provided.
    if (onFix) {
      const seenFields = new Set();
      for (const reason of reasons) {
        const fix = FIELD_FIX_MAP[reason.field];
        if (!fix || seenFields.has(reason.field)) {
          continue;
        }
        seenFields.add(reason.field);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'assist-cite-reassure__fix';
        btn.textContent = `Fix the ${fix.label}`;

        // attachAccessibleHandler: mousedown-first (race-safe) + Enter/Space keyboard
        // activation — these are primary affordances and MUST be keyboard-operable (SC 2.1.1).
        const cleanup = attachAccessibleHandler(btn, `Fix the ${fix.label}`, () => onFix(fix.step));
        fixEntries.push({ btn, cleanup });
        el.appendChild(btn);
      }
    }
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Re-assess the citation and re-render the panel in place.
   * Does NOT replace el.
   * @param {Object} citation - raw or normalised citation
   */
  function update(citation) {
    renderAssessment(assessCitation(citation, { style }));
  }

  /**
   * Run all current fix-button cleanup functions.
   * Call when the panel is removed from the DOM.
   */
  function destroy() {
    fixEntries.forEach(({ cleanup }) => cleanup());
    fixEntries = [];
  }

  // ── Return the component interface ─────────────────────────────────────────

  return { el, update, destroy };
}
