/**
 * Pure DOM helpers for locating and extracting MathML from a page subtree.
 *
 * No Speech Rule Engine dependency — this module is safe to import anywhere and is unit-testable in
 * jsdom. The SRE-backed conversion lives in `math-speech.js` (lazy-loaded).
 *
 * Two math shapes are supported:
 *   - native MathML: a `<math>` element (its own markup is already MathML)
 *   - MathJax: a `<mjx-container>` whose hidden `<mjx-assistive-mml>` holds a MathML copy
 * TeX-only pages (no rendered MathML / assistive-MML disabled) yield no MathML here and degrade to
 * the caller's normal text path.
 */

export const MATH_SELECTOR = 'math, mjx-container';

/** Tags whose text content must never be spoken (or double-read) during a math-aware walk. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'MJX-ASSISTIVE-MML']);

/** @param {Element} el @returns {boolean} whether the element is a math root we extract whole. */
function isMathNode(el) {
  const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
  return tag === 'math' || tag === 'mjx-container';
}

/**
 * True if `root` contains any MathML or MathJax math.
 * @param {Element} root
 * @returns {boolean}
 */
export function hasMath(root) {
  return !!(root && typeof root.querySelector === 'function' && root.querySelector(MATH_SELECTOR));
}

/**
 * Return a MathML string for a math node, or null if none can be recovered.
 * @param {Element} el
 * @returns {string|null}
 */
export function getMathML(el) {
  if (!el || !el.tagName) {
    return null;
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'math') {
    return el.outerHTML;
  }
  if (tag === 'mjx-container') {
    const mml = el.querySelector('mjx-assistive-mml math') || el.querySelector('math');
    return mml ? mml.outerHTML : null;
  }
  return null;
}

/**
 * Walk `root` in document order and return ordered readable segments:
 *   - `{ text }`  a run of readable text
 *   - `{ math, fallback }`  a MathML string (fallback = the node's raw text, used if speech fails)
 * Text inside a math node is not emitted separately — the math node is captured whole. Script/style
 * and aria-hidden/hidden subtrees are skipped so they are never spoken.
 * @param {Element} root
 * @returns {Array<{text?: string, math?: string, fallback?: string}>}
 */
export function collectReadableSegments(root) {
  const segments = [];
  if (!root) {
    return segments;
  }
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  const visit = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === TEXT_NODE) {
        const t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) {
          segments.push({ text: t });
        }
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) {
        continue;
      }
      const tag = child.tagName ? child.tagName.toUpperCase() : '';
      if (SKIP_TAGS.has(tag)) {
        continue;
      }
      if (
        child.getAttribute &&
        (child.getAttribute('aria-hidden') === 'true' || child.hasAttribute('hidden'))
      ) {
        continue;
      }
      if (isMathNode(child)) {
        segments.push({ math: getMathML(child) || '', fallback: (child.textContent || '').trim() });
      } else {
        visit(child);
      }
    }
  };

  visit(root);
  return segments;
}

export default { MATH_SELECTOR, hasMath, getMathML, collectReadableSegments };
