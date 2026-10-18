/**
 * DOM wiring for the number-formatter accommodation: find large-number text tokens on a page, and
 * (on demand) wrap each one in an accessible, restorable `<span>` — digit-grouped, screen-reader-
 * labelled, and optionally place-value colour-coded via CSS classes only.
 *
 * jsdom-testable — no chrome APIs. The Speech Rule Engine / any AI plane is intentionally not
 * involved: this is a deterministic, offline accommodation (see `math-format.js` header).
 */

import {
  GROUPING_CHARS,
  formatForScreenReader,
  groupDigits,
  parseNumericString,
} from './math-format.js';

/** Elements a number token is never pulled from, even if it contains matching text. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA']);

/**
 * Default minimum count of INTEGER digits (the part before any decimal point) a token needs before
 * it is treated as "a large number worth formatting". Kept deliberately conservative (5) so 4-digit
 * years ("2026"), PINs, and small IDs are left alone by default; pass `{ minDigits: 4 }` to opt in to
 * matching those too.
 */
export const DEFAULT_MIN_DIGITS = 5;

/** A grouped-or-plain integer token, with an optional decimal tail and an optional leading minus. */
const NUMBER_TOKEN_RE = /-?\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

/** @param {string} token a raw regex match @returns {number} count of digits before any decimal point */
function countIntegerDigits(token) {
  const noSign = token.replace(/^-/, '');
  const intPart = noSign.split('.')[0];
  return intPart.replace(/[,\s]/g, '').length;
}

/**
 * True if `el` (or any ancestor) means text inside it must never be touched: script/style/form
 * controls, an editable region, or AssisT's own injected UI (any element carrying an `assist-*` class,
 * which includes `.assist-mathfmt` itself — so an already-wrapped number is never re-matched).
 * @param {Element} el
 * @returns {boolean}
 */
function isExcludedAncestor(el) {
  let node = el;
  while (node && node.nodeType === 1) {
    if (SKIP_TAGS.has(node.tagName)) {
      return true;
    }
    if (
      node.hasAttribute &&
      node.hasAttribute('contenteditable') &&
      node.getAttribute('contenteditable') !== 'false'
    ) {
      return true;
    }
    if (node.classList) {
      for (const cls of node.classList) {
        if (cls.startsWith('assist-')) {
          return true;
        }
      }
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Walk `root` in document order and return every large-number token found in its text, with the text
 * node and character offsets needed to replace just that token. Never throws.
 * @param {Element} root
 * @param {{minDigits?: number}} [opts] `minDigits` — see {@link DEFAULT_MIN_DIGITS}.
 * @returns {Array<{node: Text, start: number, end: number, text: string}>}
 */
export function findNumberNodes(root, opts = {}) {
  const matches = [];
  if (!root || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') {
    return matches;
  }
  const minDigits = Number.isFinite(opts.minDigits) ? opts.minDigits : DEFAULT_MIN_DIGITS;

  let walker;
  try {
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return !node.parentElement || isExcludedAncestor(node.parentElement)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
  } catch {
    return matches;
  }

  let current = walker.nextNode();
  while (current) {
    const text = current.textContent || '';
    NUMBER_TOKEN_RE.lastIndex = 0;
    let m = NUMBER_TOKEN_RE.exec(text);
    while (m) {
      const tokenText = m[0];
      if (countIntegerDigits(tokenText) >= minDigits) {
        matches.push({
          node: current,
          start: m.index,
          end: m.index + tokenText.length,
          text: tokenText,
        });
      }
      m = NUMBER_TOKEN_RE.exec(text);
    }
    current = walker.nextNode();
  }
  return matches;
}

/**
 * Build the digit-group child spans for place-value colour-coding (classes only — no inline colour;
 * the consumer stylesheet owns the palette + WCAG contrast).
 * @param {HTMLSpanElement} span the outer `.assist-mathfmt` span to append into
 * @param {string} rawText the original matched text
 * @param {string} grouping `'comma'|'space'` — which separator to render between groups
 */
function appendPlaceValueGroups(span, rawText, grouping) {
  const parsed = parseNumericString(rawText);
  if (!parsed) {
    span.textContent = rawText;
    return;
  }
  if (parsed.negative) {
    span.appendChild(document.createTextNode('-'));
  }
  const digits = parsed.integerDigits;
  const groups = [];
  for (let i = digits.length; i > 0; i -= 3) {
    groups.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  const sep = GROUPING_CHARS[grouping] || GROUPING_CHARS.comma;
  groups.forEach((g, idx) => {
    if (idx > 0) {
      span.appendChild(document.createTextNode(sep));
    }
    const groupIndexFromRight = groups.length - 1 - idx;
    const groupSpan = document.createElement('span');
    groupSpan.className = `assist-mathfmt-group-${groupIndexFromRight}`;
    groupSpan.textContent = g;
    span.appendChild(groupSpan);
  });
  if (parsed.fractionDigits) {
    span.appendChild(document.createTextNode(`.${parsed.fractionDigits}`));
  }
}

/**
 * Build the replacement `<span class="assist-mathfmt" role="text">` for a matched token: grouped
 * display text (kept selectable/copyable as ordinary text content), an `aria-label` carrying the full
 * words form, and `data-assist-raw` holding the original text so it can be restored later.
 * @param {string} text the original matched token text
 * @param {{grouping?: 'comma'|'space', placeValue?: boolean}} opts
 * @returns {HTMLSpanElement}
 */
function buildReplacementSpan(text, opts) {
  const span = document.createElement('span');
  span.className = 'assist-mathfmt';
  span.setAttribute('role', 'text');
  span.setAttribute('data-assist-raw', text);

  const words = formatForScreenReader(text);
  if (words) {
    span.setAttribute('aria-label', words);
  }

  const grouping = opts.grouping || 'comma';
  if (opts.placeValue) {
    appendPlaceValueGroups(span, text, grouping);
  } else {
    const grouped = groupDigits(text, { grouping });
    span.textContent = grouped !== null ? grouped : text;
  }
  return span;
}

/**
 * Replace a single matched token (as found by {@link findNumberNodes}) in the live DOM with an
 * accessible `.assist-mathfmt` span. Never throws — returns `null` if the DOM has changed underneath
 * the match (e.g. the node was already removed) instead of throwing.
 * @param {{node: Text, start: number, end: number, text: string}} match
 * @param {{grouping?: 'comma'|'space', placeValue?: boolean}} [opts]
 * @returns {HTMLSpanElement|null} the inserted span, or `null` on failure
 */
export function wrapNumber(match, opts = {}) {
  if (!match || !match.node || !match.node.parentNode) {
    return null;
  }
  const { node, start, end, text } = match;
  try {
    const afterNode = node.splitText(start);
    afterNode.splitText(end - start);
    const span = buildReplacementSpan(text, opts);
    afterNode.parentNode.insertBefore(span, afterNode);
    afterNode.parentNode.removeChild(afterNode);
    return span;
  } catch {
    return null;
  }
}

/**
 * Find and wrap every qualifying number token under `root`. Idempotent: an element already wrapped in
 * a previous call is `.assist-*`-classed and therefore excluded from the next call's search, so
 * calling this repeatedly does not double-wrap. Never throws.
 * @param {Element} root
 * @param {{minDigits?: number, grouping?: 'comma'|'space', placeValue?: boolean}} [opts]
 * @returns {HTMLSpanElement[]} the spans inserted by this call
 */
export function applyNumberFormatting(root, opts = {}) {
  const spans = [];
  if (!root) {
    return spans;
  }
  let matches;
  try {
    matches = findNumberNodes(root, opts);
  } catch {
    return spans;
  }

  const byNode = new Map();
  for (const m of matches) {
    if (!byNode.has(m.node)) {
      byNode.set(m.node, []);
    }
    byNode.get(m.node).push(m);
  }

  // Process each text node's matches from right to left so splitting the DOM for one match never
  // invalidates the still-pending offsets of an earlier match in the same original node.
  for (const list of byNode.values()) {
    list.sort((a, b) => b.start - a.start);
    for (const m of list) {
      const span = wrapNumber(m, opts);
      if (span) {
        spans.push(span);
      }
    }
  }
  return spans;
}

/**
 * Fully restore every `.assist-mathfmt` span under `root` back to its original text, using the
 * `data-assist-raw` value recorded when it was wrapped. Never throws.
 * @param {Element} root
 * @returns {void}
 */
export function removeNumberFormatting(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return;
  }
  let spans;
  try {
    spans = Array.from(root.querySelectorAll('.assist-mathfmt'));
  } catch {
    return;
  }
  for (const span of spans) {
    try {
      const parent = span.parentNode;
      if (!parent) {
        continue;
      }
      const raw = span.getAttribute('data-assist-raw');
      const textNode = document.createTextNode(raw !== null ? raw : span.textContent);
      parent.replaceChild(textNode, span);
      if (typeof parent.normalize === 'function') {
        parent.normalize();
      }
    } catch {
      // Best-effort restore — skip this span and keep restoring the rest.
    }
  }
}

export default {
  DEFAULT_MIN_DIGITS,
  findNumberNodes,
  wrapNumber,
  applyNumberFormatting,
  removeNumberFormatting,
};
