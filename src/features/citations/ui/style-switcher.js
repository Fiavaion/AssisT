/**
 * Style Switcher Component
 *
 * A 4-option ARIA radiogroup for switching between citation styles (APA 7 / MLA 9 /
 * Chicago 17 / Harvard) with a live formatted-reference preview. The preview highlights,
 * in amber, the region of the reference that changed between the previous and the current
 * style using a word-granularity common-prefix / common-suffix diff.
 *
 * Public API:
 *   createStyleSwitcher(options) -> { el, setCitation, setStyle, getStyle, destroy }
 *
 * Design principles:
 *   - The reference is the one part that is not plain text: it carries the style's italics and is
 *     painted through the shared reference-html helper (<em>/<i> only, no attributes, and the
 *     formatter has already escaped the record's own metadata). Every other string is textContent.
 *   - Pointer + Enter/Space activation via attachAccessibleHandler (mousedown-first, race-safe).
 *   - ArrowRight/ArrowLeft/ArrowDown/ArrowUp/Home/End navigation handled with a dedicated
 *     keydown listener on the radiogroup container; stored for removal in destroy().
 *   - Roving tabindex: the selected option has tabindex="0", all others tabindex="-1".
 *   - Preview is aria-live="polite" so style changes are announced (SC 4.1.3).
 *   - No fixed height or overflow clipping on preview — Text-Spacing must wrap freely (SC 1.4.12).
 *   - prefers-reduced-motion and forced-colors handled in citation-styles.js; no animation here.
 */

import { STYLES, formatReference } from '../citation-styles/index.js';
import { sanitizeReferenceHtml } from './reference-html.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';

// ── Diff helpers ──────────────────────────────────────────────────────────────

/**
 * Tokenise a reference into an array that alternates between word-runs and whitespace-runs,
 * preserving every character so that the token array can be joined back to the original.
 *
 * e.g. "Smith, J. (2022). Title." → ["Smith,", " ", "J.", " ", "(2022).", " ", "Title."]
 *
 * An italic run (<em>…</em>) is ONE token however many words it holds, so every diff boundary falls
 * between whole tags: each fragment the diff hands back is then valid HTML on its own, and a style
 * change can never split an <em> and drop the italics it was showing.
 *
 * @param {string} str - a reference in HTML form
 * @returns {string[]}
 */
function tokenise(str) {
  const tokens = [];
  // The text between italic runs is split on whitespace; each run is kept whole.
  const italicRun = /<em>[\s\S]*?<\/em>/g;
  let cursor = 0;
  let match = italicRun.exec(str);
  while (match) {
    tokens.push(...str.slice(cursor, match.index).split(/(\s+)/));
    tokens.push(match[0]);
    cursor = match.index + match[0].length;
    match = italicRun.exec(str);
  }
  tokens.push(...str.slice(cursor).split(/(\s+)/));
  return tokens.filter(t => t.length > 0);
}

/**
 * Compute a word-granularity diff between two reference strings.
 *
 * Algorithm (deterministic, common-prefix + common-suffix):
 *   1. Tokenise prev and next (whitespace-preserving split).
 *   2. Count equal leading tokens (prefix length p).
 *   3. Count equal trailing tokens (suffix length s), not overlapping the prefix.
 *   4. The changed region is next[p .. next.length - s).
 *
 * Returns { prefix, changed, suffix } where all three parts are strings and
 * prefix + changed + suffix === next (lossless).
 *
 * If prev === next or prev is null (first render), returns { prefix: next, changed: '', suffix: '' }
 * so no diff span is rendered.
 *
 * @param {string|null} prev
 * @param {string} next
 * @returns {{ prefix: string, changed: string, suffix: string }}
 */
function computeDiff(prev, next) {
  if (prev === null || prev === next) {
    return { prefix: next, changed: '', suffix: '' };
  }

  const pToks = tokenise(prev);
  const nToks = tokenise(next);

  // Common prefix.
  let p = 0;
  while (p < pToks.length && p < nToks.length && pToks[p] === nToks[p]) {
    p++;
  }

  // Common suffix — do not overlap the prefix.
  let s = 0;
  while (
    s < pToks.length - p &&
    s < nToks.length - p &&
    pToks[pToks.length - 1 - s] === nToks[nToks.length - 1 - s]
  ) {
    s++;
  }

  const prefix = nToks.slice(0, p).join('');
  const suffix = s > 0 ? nToks.slice(nToks.length - s).join('') : '';
  const changed = nToks.slice(p, s > 0 ? nToks.length - s : nToks.length).join('');

  return { prefix, changed, suffix };
}

// ── Preview rendering ─────────────────────────────────────────────────────────

const PLACEHOLDER = 'Select a source to preview its reference.';

/**
 * One fragment of the diffed reference, sanitised so only its italics survive.
 * @param {string} html - a fragment of reference HTML
 * @param {string} [className] - marks the changed region
 * @returns {HTMLSpanElement}
 */
function fragmentSpan(html, className) {
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.innerHTML = sanitizeReferenceHtml(html);
  return span;
}

/**
 * Render the preview element from a diff result. Each fragment is sanitised reference HTML, so the
 * student sees the italics their reference list will carry and nothing else can get through.
 *
 * @param {HTMLParagraphElement} previewEl
 * @param {{ prefix: string, changed: string, suffix: string }} diff
 */
function renderPreview(previewEl, diff) {
  // Clear existing children without innerHTML.
  while (previewEl.firstChild) {
    previewEl.removeChild(previewEl.firstChild);
  }

  const { prefix, changed, suffix } = diff;

  if (prefix) {
    previewEl.appendChild(fragmentSpan(prefix));
  }

  if (changed) {
    previewEl.appendChild(fragmentSpan(changed, 'assist-cite-switcher__diff'));
  }

  if (suffix) {
    previewEl.appendChild(fragmentSpan(suffix));
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a citation style switcher component.
 *
 * @param {Object} [options]
 * @param {Object|null} [options.citation=null] - initial citation to preview
 * @param {string} [options.style='harvard'] - initially selected style id
 * @param {Function} [options.onChange] - called with styleId when the USER selects a style
 * @returns {{ el: HTMLDivElement, setCitation: Function, setStyle: Function, getStyle: Function, destroy: Function }}
 */
export function createStyleSwitcher(options = {}) {
  const { citation: initialCitation = null, style: initialStyle = 'harvard', onChange } = options;

  /** Currently previewed citation (null = no citation). */
  let currentCitation = initialCitation;

  /** The reference list the previewed citation belongs to (see setCitation). */
  let currentSet = [];

  /** Currently selected style id. */
  let currentStyle = STYLES.some(s => s.id === initialStyle) ? initialStyle : 'harvard';

  /** The formatted string shown in the preview on the PREVIOUS render (null on first render). */
  let prevPreviewText = null;

  // ── Build the container ───────────────────────────────────────────────────

  const el = document.createElement('div');
  el.className = 'assist-cite-switcher';

  // ── Build the radiogroup ──────────────────────────────────────────────────

  const radiogroup = document.createElement('div');
  radiogroup.setAttribute('role', 'radiogroup');
  radiogroup.setAttribute('aria-label', 'Citation style');
  radiogroup.className = 'assist-cite-switcher__options';

  /** Map from styleId → button element for quick lookup. */
  const optionButtons = new Map();

  /** Cleanup functions from attachAccessibleHandler, one per button. */
  const optionCleanups = [];

  STYLES.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.className = 'assist-cite-switcher__option';
    btn.setAttribute('data-style', id);
    btn.textContent = label;

    const isSelected = id === currentStyle;
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    btn.tabIndex = isSelected ? 0 : -1;

    optionButtons.set(id, btn);
    radiogroup.appendChild(btn);
  });

  // Wire pointer + Enter/Space activation for each option.
  optionButtons.forEach((btn, id) => {
    const cleanup = attachAccessibleHandler(btn, `Citation style: ${id}`, () => {
      if (id !== currentStyle) {
        selectStyle(id, true);
      }
    });
    optionCleanups.push(cleanup);
  });

  // ── Arrow / Home / End keyboard navigation on the radiogroup container ────

  /**
   * Handle keyboard navigation within the radiogroup.
   * Selection follows focus per the ARIA radiogroup pattern.
   */
  const arrowKeydownHandler = e => {
    const ids = STYLES.map(s => s.id);
    const idx = ids.indexOf(currentStyle);

    let nextIdx = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = (idx + 1) % ids.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = (idx - 1 + ids.length) % ids.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIdx = ids.length - 1;
    }

    if (nextIdx !== -1) {
      selectStyle(ids[nextIdx], true);
      optionButtons.get(ids[nextIdx]).focus();
    }
  };

  radiogroup.addEventListener('keydown', arrowKeydownHandler);
  el.appendChild(radiogroup);

  // ── Build the preview paragraph ───────────────────────────────────────────

  const previewEl = document.createElement('p');
  previewEl.className = 'assist-cite-switcher__preview';
  previewEl.setAttribute('aria-live', 'polite');

  el.appendChild(previewEl);

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Update roving tabindex so that `selectedId` has tabindex="0" and all others "-1".
   * Also update aria-checked.
   *
   * @param {string} selectedId
   */
  function applyRovingTabindex(selectedId) {
    optionButtons.forEach((btn, id) => {
      const checked = id === selectedId;
      btn.setAttribute('aria-checked', checked ? 'true' : 'false');
      btn.tabIndex = checked ? 0 : -1;
    });
  }

  /**
   * Re-render the preview for `currentCitation` and `currentStyle`, computing the diff
   * against `prevPreviewText`, then storing the new text as the next prev.
   */
  function refreshPreview() {
    while (previewEl.firstChild) {
      previewEl.removeChild(previewEl.firstChild);
    }

    if (!currentCitation) {
      previewEl.appendChild(document.createTextNode(PLACEHOLDER));
      prevPreviewText = null;
      return;
    }

    const next = formatReference(currentCitation, currentStyle, { html: true, set: currentSet });
    const diff = computeDiff(prevPreviewText, next);
    renderPreview(previewEl, diff);
    prevPreviewText = next;
  }

  /**
   * Select a style, update the DOM, refresh the preview, and optionally fire onChange.
   *
   * @param {string} styleId
   * @param {boolean} userInitiated - true when triggered by a user gesture (fires onChange)
   */
  function selectStyle(styleId, userInitiated) {
    // For a programmatic same-style call, still re-render preview (citation may have changed).
    const changed = styleId !== currentStyle;
    currentStyle = styleId;
    applyRovingTabindex(styleId);
    refreshPreview();

    if (userInitiated && changed && typeof onChange === 'function') {
      onChange(styleId);
    }
  }

  // ── Initial render ────────────────────────────────────────────────────────

  refreshPreview();

  // ── Public interface ──────────────────────────────────────────────────────

  /**
   * Set or replace the previewed citation. Re-renders the preview for the current style.
   * Passing null shows the neutral placeholder and clears the diff history.
   *
   * @param {Object|null} citation
   * @param {Object[]} [set] - the reference list it belongs to, so the preview shows its letter
   */
  function setCitation(citation, set = []) {
    currentCitation = citation;
    currentSet = set;
    // Reset prev so the first render after a citation change shows no diff (SC 1.4.1 — the
    // entire reference is new; highlighting nothing is correct).
    prevPreviewText = null;
    refreshPreview();
  }

  /**
   * Programmatically select a style. Updates radios + preview + diff. Does NOT fire onChange.
   *
   * @param {string} styleId
   */
  function setStyle(styleId) {
    if (!STYLES.some(s => s.id === styleId)) {
      return;
    }
    // Setting the same style resets prevPreviewText so no diff is shown (prev===next → no span).
    if (styleId === currentStyle) {
      // Force a re-render with no diff: set prev to the current output so computeDiff returns empty.
      if (currentCitation) {
        prevPreviewText = formatReference(currentCitation, currentStyle, {
          html: true,
          set: currentSet,
        });
      }
      refreshPreview();
      return;
    }
    selectStyle(styleId, false);
  }

  /**
   * Return the currently selected style id.
   * @returns {string}
   */
  function getStyle() {
    return currentStyle;
  }

  /**
   * Remove all event listeners and detach el from its parent.
   */
  function destroy() {
    optionCleanups.forEach(fn => fn());
    radiogroup.removeEventListener('keydown', arrowKeydownHandler);
    el.remove();
  }

  return { el, setCitation, setStyle, getStyle, destroy };
}
