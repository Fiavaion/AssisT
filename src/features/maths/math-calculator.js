/**
 * On-page calculator + scratchpad overlay for the Maths Support feature.
 *
 * A floating action button (FAB) opens a NON-MODAL panel so a neurodivergent / dyscalculic student
 * can do arithmetic and jot working WITHOUT context-switching out of their Canvas page. Because the
 * panel is non-modal, the student keeps full access to the page behind it — so there is deliberately
 * NO focus trap and NO `aria-modal`. Instead the panel is `role="dialog"` with an accessible name,
 * and Escape (when focus is inside) returns focus to the FAB.
 *
 * Accessibility contract (the release bar):
 *   - FAB is a real <button>, ≥ 44×44px (WCAG 2.5.8), keyboard-operable via attachAccessibleHandler.
 *   - Keypad buttons use roving tabindex + arrow-key navigation; on-screen order matches a physical
 *     calculator (7-8-9 / 4-5-6 / 1-2-3 / 0 . =).
 *   - Full physical-keyboard input (digits, + - * / ( ) %, Enter/=, Backspace, Escape).
 *   - The display is `role="status" aria-live="polite"` so results are announced; a separate
 *     visually-hidden live region announces transient feedback ("Copied").
 *   - Every user-visible string is set via textContent (no innerHTML with dynamic data).
 *   - Errors surface as friendly text in the display — never thrown to the console.
 *   - Visible :focus-visible outlines, prefers-reduced-motion respected, forced-colors survivable,
 *     text-spacing-safe (no fixed heights that clip at 1.5 line-height).
 *
 * @module features/maths/math-calculator
 */

import { Z } from '../../utils/z-index.js';
import {
  CORNER,
  EDGE_INSET,
  placeInRail,
  railExtent,
  releaseFromRail,
} from '../../utils/corner-slots.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { evaluateExpression } from './math-expression.js';

const ROOT_ID = 'assist-mathcalc-root';
const STYLE_ID = 'assist-mathcalc-styles';
const PANEL_ID = 'assist-mathcalc-panel';

/** chrome.storage.local key the scratchpad persists to. */
export const SCRATCHPAD_STORAGE_KEY = 'assist_maths_scratchpad';

const SCRATCH_DEBOUNCE_MS = 500;
const KEYPAD_COLUMNS = 4;

/**
 * Keypad layout (row-major, 4 columns). `kind` drives the action; `value` is the ASCII fed to the
 * expression evaluator. Visible glyphs (÷ × −) map to ASCII operators (/ * -).
 */
const KEYPAD = [
  { text: 'C', aria: 'Clear', kind: 'clear' },
  { text: '(', aria: 'Open bracket', kind: 'char', value: '(' },
  { text: ')', aria: 'Close bracket', kind: 'char', value: ')' },
  { text: '÷', aria: 'Divide', kind: 'char', value: '/' },
  { text: '7', aria: '7', kind: 'char', value: '7' },
  { text: '8', aria: '8', kind: 'char', value: '8' },
  { text: '9', aria: '9', kind: 'char', value: '9' },
  { text: '×', aria: 'Multiply', kind: 'char', value: '*' },
  { text: '4', aria: '4', kind: 'char', value: '4' },
  { text: '5', aria: '5', kind: 'char', value: '5' },
  { text: '6', aria: '6', kind: 'char', value: '6' },
  { text: '−', aria: 'Minus', kind: 'char', value: '-' },
  { text: '1', aria: '1', kind: 'char', value: '1' },
  { text: '2', aria: '2', kind: 'char', value: '2' },
  { text: '3', aria: '3', kind: 'char', value: '3' },
  { text: '+', aria: 'Plus', kind: 'char', value: '+' },
  { text: '0', aria: '0', kind: 'char', value: '0' },
  { text: '.', aria: 'Decimal point', kind: 'char', value: '.' },
  { text: '%', aria: 'Percent', kind: 'char', value: '%' },
  { text: '=', aria: 'Equals', kind: 'equals' },
];

/** The single live instance, or null. Module-level so mount/unmount are idempotent. */
let instance = null;

/**
 * In-memory scratchpad fallback for contexts where chrome.storage is unavailable (e.g. tests or a
 * page where the storage API is not injected). Survives unmount/remount within the same page.
 */
let inMemoryScratch = '';

function hasChromeStorage() {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    !!chrome.storage.local &&
    typeof chrome.storage.local.set === 'function'
  );
}

/**
 * The scoped stylesheet. Injected once as a <style> (not a bundled .css asset) to avoid touching
 * manifest `web_accessible_resources` — matching the citation UI pattern. Every rule is scoped under
 * `.assist-mathcalc` so it cannot collide with the host LMS page.
 */
const MATHCALC_CSS = `
  .assist-mathcalc {
    --mc-surface: #ffffff;
    --mc-sunken: #f3f4f6;
    --mc-text: #1f2937;
    --mc-text-muted: #4b5563;
    --mc-border: #9ca3af;
    --mc-accent: #1d4ed8;
    --mc-accent-text: #ffffff;
    --mc-focus: #1d4ed8;
    --mc-key: #f8fafc;
    --mc-key-text: #111827;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
    box-sizing: border-box;
  }
  .assist-mathcalc *,
  .assist-mathcalc *::before,
  .assist-mathcalc *::after { box-sizing: border-box; }

  .assist-mathcalc :focus-visible {
    outline: 3px solid var(--mc-focus);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .assist-mathcalc__sr-only {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0);
    white-space: nowrap; border: 0;
  }

  /* ── Floating action button ──────────────────────────────────────────── */
  /* Placement (position, left, bottom) comes from the shared corner rail - see
     src/utils/corner-slots.js - so the FAB never lands under another feature's control. */
  .assist-mathcalc__fab {
    z-index: ${Z.CONTROLS};
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 44px;
    min-height: 44px;
    padding: 10px 14px;
    border: 2px solid var(--mc-accent);
    border-radius: 28px;
    background: var(--mc-accent);
    color: var(--mc-accent-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
    transition: background 0.15s ease, max-width 0.15s ease;
  }
  .assist-mathcalc__fab:hover { background: #1e40af; }
  .assist-mathcalc__fab-icon { font-size: 22px; line-height: 1; }
  /* Label is available to AT via aria-label; visually it appears on hover/focus. */
  .assist-mathcalc__fab-label {
    max-width: 0;
    overflow: hidden;
    white-space: nowrap;
    transition: max-width 0.15s ease;
  }
  .assist-mathcalc__fab:hover .assist-mathcalc__fab-label,
  .assist-mathcalc__fab:focus-visible .assist-mathcalc__fab-label {
    max-width: 160px;
  }

  /* ── Panel ───────────────────────────────────────────────────────────── */
  /* Opens above every control on the bottom-left rail; its offset and height cap are set
     on open, once the rail's height is known. */
  .assist-mathcalc__panel {
    position: fixed;
    left: ${EDGE_INSET}px;
    z-index: ${Z.FLOATING};
    width: 300px;
    max-width: calc(100% - ${EDGE_INSET * 2}px);
    overflow-y: auto;
    padding: 14px;
    background: var(--mc-surface);
    color: var(--mc-text);
    border: 2px solid var(--mc-border);
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
  }
  .assist-mathcalc__panel[hidden] { display: none; }

  .assist-mathcalc__display {
    min-height: 44px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: var(--mc-sunken);
    border: 1px solid var(--mc-border);
    border-radius: 8px;
    color: var(--mc-text);
    font-size: 20px;
    font-weight: 600;
    text-align: right;
    word-break: break-all;
    overflow-wrap: anywhere;
  }

  .assist-mathcalc__keys {
    display: grid;
    grid-template-columns: repeat(${KEYPAD_COLUMNS}, 1fr);
    gap: 8px;
  }
  .assist-mathcalc__key {
    min-height: 44px;
    padding: 10px 0;
    border: 1px solid var(--mc-border);
    border-radius: 8px;
    background: var(--mc-key);
    color: var(--mc-key-text);
    font: inherit;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
  }
  .assist-mathcalc__key:hover { background: #e5e7eb; }
  .assist-mathcalc__key--op { background: #e0e7ff; color: #1e3a8a; }
  .assist-mathcalc__key--op:hover { background: #c7d2fe; }
  .assist-mathcalc__key--equals { background: var(--mc-accent); color: var(--mc-accent-text); border-color: var(--mc-accent); }
  .assist-mathcalc__key--equals:hover { background: #1e40af; }

  .assist-mathcalc__actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .assist-mathcalc__btn {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--mc-border);
    border-radius: 8px;
    background: var(--mc-key);
    color: var(--mc-key-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .assist-mathcalc__btn:hover { background: #e5e7eb; }

  .assist-mathcalc__scratch-label {
    display: block;
    margin: 12px 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--mc-text-muted);
  }
  .assist-mathcalc__scratch {
    display: block;
    width: 100%;
    min-height: 72px;
    padding: 8px 10px;
    border: 1px solid var(--mc-border);
    border-radius: 8px;
    background: var(--mc-surface);
    color: var(--mc-text);
    font: inherit;
    line-height: 1.5;
    resize: vertical;
  }

  @media (prefers-reduced-motion: reduce) {
    .assist-mathcalc * { transition: none !important; animation: none !important; }
    .assist-mathcalc__fab-label { max-width: 160px; }
  }
  @media (prefers-contrast: more) {
    .assist-mathcalc__panel,
    .assist-mathcalc__key,
    .assist-mathcalc__btn,
    .assist-mathcalc__display { border-width: 2px; }
  }
  @media (forced-colors: active) {
    .assist-mathcalc__fab,
    .assist-mathcalc__panel,
    .assist-mathcalc__display,
    .assist-mathcalc__key,
    .assist-mathcalc__btn,
    .assist-mathcalc__scratch { border: 1px solid ButtonText; }
    .assist-mathcalc__key--equals,
    .assist-mathcalc__fab { border: 1px solid ButtonText; }
  }
`;

/**
 * Inject the scoped stylesheet once. Idempotent.
 * @param {Document} doc
 */
function injectStyles(doc) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = MATHCALC_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * Mount the calculator FAB + panel. Idempotent: a second call while already mounted returns the
 * existing handle without creating duplicate DOM.
 *
 * @param {{doc?: Document, container?: HTMLElement}} [opts]
 * @returns {{open: Function, close: Function, isOpen: Function}|null} a handle, or null if no DOM.
 */
export function mountMathCalculator(opts = {}) {
  if (instance) {
    return instance.handle;
  }

  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.body) {
    return null;
  }
  const container = opts.container || doc.body;

  injectStyles(doc);

  const cleanups = [];
  let saveTimer = null;

  // ── Session state ──────────────────────────────────────────────────────
  const state = {
    expr: '', // the expression being built
    errored: false, // true when the display shows an error (next input starts fresh)
    activeKeyIndex: 0, // roving tabindex position on the keypad
  };

  // ── Root container (holds both FAB and panel) ──────────────────────────
  const root = doc.createElement('div');
  root.className = 'assist-mathcalc';
  root.id = ROOT_ID;

  // ── FAB ────────────────────────────────────────────────────────────────
  const fab = doc.createElement('button');
  fab.type = 'button';
  fab.className = 'assist-mathcalc__fab';
  fab.setAttribute('aria-label', 'Maths tools');
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-controls', PANEL_ID);

  const fabIcon = doc.createElement('span');
  fabIcon.className = 'assist-mathcalc__fab-icon';
  fabIcon.setAttribute('aria-hidden', 'true');
  fabIcon.textContent = '🧮';
  const fabLabel = doc.createElement('span');
  fabLabel.className = 'assist-mathcalc__fab-label';
  fabLabel.textContent = 'Maths tools';
  fab.appendChild(fabIcon);
  fab.appendChild(fabLabel);

  // ── Panel ──────────────────────────────────────────────────────────────
  const panel = doc.createElement('div');
  panel.className = 'assist-mathcalc__panel';
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Calculator and scratchpad');
  // Focusable as a group so opening moves focus into the dialog and physical-keyboard input
  // (digits, operators, Enter) resolves on the panel — not on a roving-focused keypad button,
  // whose own Enter handler would otherwise swallow the evaluate.
  panel.tabIndex = -1;
  panel.hidden = true;

  const display = doc.createElement('div');
  display.className = 'assist-mathcalc__display';
  display.setAttribute('role', 'status');
  display.setAttribute('aria-live', 'polite');
  display.setAttribute('aria-label', 'Calculator display');
  display.textContent = '0';

  const keys = doc.createElement('div');
  keys.className = 'assist-mathcalc__keys';
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', 'Calculator keypad');

  const keyButtons = [];

  // ── Actions on the expression ──────────────────────────────────────────
  function renderExpr() {
    display.textContent = state.expr === '' ? '0' : state.expr;
  }
  function appendToExpr(ch) {
    if (state.errored) {
      state.expr = '';
      state.errored = false;
    }
    state.expr += ch;
    renderExpr();
  }
  function clearEntry() {
    state.expr = '';
    state.errored = false;
    renderExpr();
  }
  function backspace() {
    if (state.errored) {
      clearEntry();
      return;
    }
    state.expr = state.expr.slice(0, -1);
    renderExpr();
  }
  function evaluate() {
    const result = evaluateExpression(state.expr);
    if (result.ok) {
      state.expr = String(result.value);
      state.errored = false;
      display.textContent = String(result.value);
    } else {
      state.expr = '';
      state.errored = true;
      display.textContent = result.error;
    }
  }

  // ── Build keypad ───────────────────────────────────────────────────────
  KEYPAD.forEach((def, index) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'assist-mathcalc__key';
    if (def.kind === 'equals') {
      btn.classList.add('assist-mathcalc__key--equals');
    } else if (def.kind === 'char' && '+-*/'.includes(def.value)) {
      btn.classList.add('assist-mathcalc__key--op');
    }
    btn.textContent = def.text;
    btn.setAttribute('aria-label', def.aria);
    btn.tabIndex = index === 0 ? 0 : -1;
    keys.appendChild(btn);
    keyButtons.push(btn);

    cleanups.push(
      attachAccessibleHandler(btn, `Calc key ${def.aria}`, () => {
        setActiveKey(index);
        if (def.kind === 'clear') {
          clearEntry();
        } else if (def.kind === 'equals') {
          evaluate();
        } else {
          appendToExpr(def.value);
        }
      })
    );
  });

  function setActiveKey(index) {
    if (index < 0 || index >= keyButtons.length) {
      return;
    }
    keyButtons.forEach((b, j) => {
      b.tabIndex = j === index ? 0 : -1;
    });
    state.activeKeyIndex = index;
    keyButtons[index].focus();
  }

  /**
   * Move roving focus with the arrow keys. Left/right clamp within the current row; up/down clamp
   * within the current column. Returns true if the key was an arrow (and was handled).
   */
  function handleArrow(e, btn) {
    const idx = keyButtons.indexOf(btn);
    if (idx < 0) {
      return false;
    }
    const rows = Math.ceil(keyButtons.length / KEYPAD_COLUMNS);
    let row = Math.floor(idx / KEYPAD_COLUMNS);
    let col = idx % KEYPAD_COLUMNS;
    switch (e.key) {
      case 'ArrowRight':
        col = Math.min(col + 1, KEYPAD_COLUMNS - 1);
        break;
      case 'ArrowLeft':
        col = Math.max(col - 1, 0);
        break;
      case 'ArrowDown':
        row = Math.min(row + 1, rows - 1);
        break;
      case 'ArrowUp':
        row = Math.max(row - 1, 0);
        break;
      default:
        return false;
    }
    e.preventDefault();
    let next = row * KEYPAD_COLUMNS + col;
    if (next >= keyButtons.length) {
      next = keyButtons.length - 1;
    }
    setActiveKey(next);
    return true;
  }

  // ── Copy result ────────────────────────────────────────────────────────
  const actions = doc.createElement('div');
  actions.className = 'assist-mathcalc__actions';

  const copyBtn = doc.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'assist-mathcalc__btn';
  copyBtn.textContent = 'Copy result';
  copyBtn.setAttribute('aria-label', 'Copy result');
  actions.appendChild(copyBtn);

  const announcer = doc.createElement('div');
  announcer.className = 'assist-mathcalc__sr-only';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');

  function announce(message) {
    // Clear first so an identical repeat message is still announced by AT.
    announcer.textContent = '';
    announcer.textContent = message;
  }

  function fallbackCopy(text) {
    try {
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('aria-hidden', 'true');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.focus();
      ta.select();
      if (typeof doc.execCommand === 'function') {
        doc.execCommand('copy');
      }
      doc.body.removeChild(ta);
      announce('Copied');
    } catch {
      announce('Could not copy — select the result to copy it.');
    }
  }

  function copyResult() {
    const text = display.textContent || '';
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        navigator.clipboard
          .writeText(text)
          .then(() => announce('Copied'))
          .catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }
  }

  cleanups.push(attachAccessibleHandler(copyBtn, 'Copy result', copyResult));

  // ── Scratchpad ─────────────────────────────────────────────────────────
  const scratchLabel = doc.createElement('label');
  scratchLabel.className = 'assist-mathcalc__scratch-label';
  scratchLabel.textContent = 'Scratchpad';
  const scratchId = 'assist-mathcalc-scratch';
  scratchLabel.setAttribute('for', scratchId);

  const scratch = doc.createElement('textarea');
  scratch.className = 'assist-mathcalc__scratch';
  scratch.id = scratchId;
  scratch.setAttribute('aria-label', 'Scratchpad');
  scratch.rows = 3;

  function persistScratch(value) {
    inMemoryScratch = value;
    if (hasChromeStorage()) {
      try {
        const result = chrome.storage.local.set({ [SCRATCHPAD_STORAGE_KEY]: value });
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch {
        /* storage unavailable — the in-memory copy still holds the value */
      }
    }
  }

  function onScratchInput() {
    const value = scratch.value;
    inMemoryScratch = value;
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => persistScratch(value), SCRATCH_DEBOUNCE_MS);
  }
  scratch.addEventListener('input', onScratchInput);
  cleanups.push(() => scratch.removeEventListener('input', onScratchInput));

  function loadScratch() {
    if (hasChromeStorage() && typeof chrome.storage.local.get === 'function') {
      try {
        const result = chrome.storage.local.get(SCRATCHPAD_STORAGE_KEY);
        if (result && typeof result.then === 'function') {
          result
            .then(data => {
              const stored = data && data[SCRATCHPAD_STORAGE_KEY];
              if (typeof stored === 'string') {
                scratch.value = stored;
                inMemoryScratch = stored;
              }
            })
            .catch(() => {});
          return;
        }
      } catch {
        /* fall through to in-memory */
      }
    }
    scratch.value = inMemoryScratch;
  }

  // ── Panel keyboard handling (scoped to the panel — the page keeps working) ──
  function onPanelKeydown(e) {
    const target = e.target;
    const inScratch = target === scratch;

    if (e.key === 'Escape') {
      e.preventDefault();
      // The key is the calculator's now. On the live Canvas login page the page's own Escape
      // handler moved focus to the body, so the second press never reached the calculator.
      e.stopPropagation();
      if (inScratch) {
        close();
        return;
      }
      // First press clears a non-empty entry; a second press (empty) closes.
      if (state.expr !== '' && !state.errored) {
        clearEntry();
      } else {
        close();
      }
      return;
    }

    // Inside the scratchpad, let the textarea handle all other keys normally.
    if (inScratch) {
      return;
    }

    // Arrow-key roving navigation on the keypad.
    if (target.classList && target.classList.contains('assist-mathcalc__key')) {
      if (handleArrow(e, target)) {
        return;
      }
    }

    const k = e.key;
    // Let a focused <button> activate itself on Enter/Space (its own handler runs).
    const onButton = target.tagName === 'BUTTON';
    if (k === 'Enter' || k === '=') {
      if (onButton && k === 'Enter') {
        return;
      }
      e.preventDefault();
      evaluate();
      return;
    }
    if ((k >= '0' && k <= '9') || k === '.') {
      e.preventDefault();
      appendToExpr(k);
      return;
    }
    if (k === '+' || k === '-' || k === '*' || k === '/' || k === '(' || k === ')' || k === '%') {
      e.preventDefault();
      appendToExpr(k);
      return;
    }
    if (k === 'Backspace') {
      e.preventDefault();
      backspace();
    }
  }
  panel.addEventListener('keydown', onPanelKeydown);
  cleanups.push(() => panel.removeEventListener('keydown', onPanelKeydown));

  // ── Assemble ───────────────────────────────────────────────────────────
  panel.appendChild(display);
  panel.appendChild(keys);
  panel.appendChild(actions);
  panel.appendChild(scratchLabel);
  panel.appendChild(scratch);
  panel.appendChild(announcer);
  root.appendChild(fab);
  root.appendChild(panel);
  container.appendChild(root);
  placeInRail(fab, 'maths-fab');

  // ── Open / close ───────────────────────────────────────────────────────
  function open() {
    if (!panel.hidden) {
      return;
    }
    panel.hidden = false;
    // Sit above every control on the rail, and never taller than the space that leaves.
    const railTop = railExtent(CORNER.BOTTOM_LEFT);
    panel.style.bottom = `${railTop}px`;
    panel.style.maxHeight = `calc(100vh - ${railTop + EDGE_INSET}px)`;
    fab.setAttribute('aria-expanded', 'true');
    // Prime roving tabindex without stealing focus onto a keypad key, then move focus to the
    // dialog group so keyboard entry lands on the panel handler.
    keyButtons.forEach((b, j) => {
      b.tabIndex = j === state.activeKeyIndex ? 0 : -1;
    });
    panel.focus();
  }
  function close() {
    if (panel.hidden) {
      return;
    }
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }
  function toggle() {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  }

  cleanups.push(attachAccessibleHandler(fab, 'Maths tools', toggle));

  loadScratch();

  const handle = {
    open,
    close,
    isOpen: () => !panel.hidden,
  };

  instance = {
    root,
    handle,
    teardown() {
      releaseFromRail('maths-fab');
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      cleanups.forEach(fn => {
        try {
          fn();
        } catch {
          /* ignore individual cleanup errors */
        }
      });
      if (root.parentElement) {
        root.parentElement.removeChild(root);
      }
      const style = doc.getElementById(STYLE_ID);
      if (style && style.parentElement) {
        style.parentElement.removeChild(style);
      }
    },
  };

  return handle;
}

/**
 * Remove the calculator FAB + panel and all its listeners. Idempotent (no-op if not mounted).
 */
export function unmountMathCalculator() {
  if (!instance) {
    return;
  }
  instance.teardown();
  instance = null;
}

/**
 * @returns {boolean} whether the calculator is currently mounted.
 */
export function isMathCalculatorMounted() {
  return instance !== null;
}

export default {
  mountMathCalculator,
  unmountMathCalculator,
  isMathCalculatorMounted,
  SCRATCHPAD_STORAGE_KEY,
};
