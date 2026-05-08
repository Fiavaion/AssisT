/**
 * AssisT DOM Highlighting Module
 * Provides text and element highlighting for TTS playback.
 *
 * Word-by-word highlighting uses a hybrid scheduler:
 *   - Primary signal: utterance.onboundary (fires per word for local voices)
 *   - Backup tick:    chained setTimeout weighted by word.length * msPerChar
 *                     (covers Chrome network voices that never fire onboundary)
 *   - Drift correction: each boundary recomputes msPerChar from observed pacing
 *   - Pause/resume:   timer halts on onpause, continues from active word on onresume
 *   - Auto-scroll:    when settings.autoScroll, scrollIntoView when active word
 *                     leaves the viewport
 *
 * Per-leaf, per-text-node wrapping: each text node within a text-bearing leaf
 * (P/LI/Hn/BLOCKQUOTE) is replaced with a fragment of <span class="assist-word">
 * elements + whitespace text nodes. Surrounding inline elements (<a>, <strong>,
 * <button>, <iframe>, <input>, etc.) and their event listeners stay intact.
 * Cleanup unwraps each span back to a text node and normalizes — no innerHTML
 * round-trip means no DOM destruction.
 */

import { hexToRgba } from '../utils/color.js';

let currentHighlight = null;

// Word-by-word scheduler state (single-utterance at a time).
let wordHighlightTimeout = null;
let watchdogTimeout = null;
let activeIndex = -1;
let boundaryIndex = -1;
let boundaryFired = false;
let startTs = 0;
let pausedAt = 0;
let pauseAccum = 0;
let wordSpans = [];
let charRanges = [];
let msPerChar = 60; // updated per-utterance from rate
let autoScrollEnabled = false;
let activeUtterance = null;
let wrappedLeaves = []; // leaves we wrapped this run; restored on cleanup

function resetSchedulerState() {
  if (wordHighlightTimeout) {
    clearTimeout(wordHighlightTimeout);
    wordHighlightTimeout = null;
  }
  if (watchdogTimeout) {
    clearTimeout(watchdogTimeout);
    watchdogTimeout = null;
  }
  activeIndex = -1;
  boundaryIndex = -1;
  boundaryFired = false;
  startTs = 0;
  pausedAt = 0;
  pauseAccum = 0;
  wordSpans = [];
  charRanges = [];
  autoScrollEnabled = false;
  activeUtterance = null;
}

// Tags whose text content must NOT be wrapped — wrapping would break script
// execution, CSS, SVG rendering, or form input handling.
const NON_READABLE_PARENTS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'TEXTAREA',
  'SVG',
]);

function isEditable(el) {
  if (!el) {
    return false;
  }
  if (el.isContentEditable === true) {
    return true;
  }
  if (typeof el.getAttribute === 'function') {
    const attr = el.getAttribute('contenteditable');
    if (attr === 'true' || attr === '') {
      return true;
    }
  }
  return false;
}

function shouldWrapTextNode(node, leaf) {
  if (!node.textContent || !/\S/.test(node.textContent)) {
    return false;
  }
  let p = node.parentElement;
  while (p && p !== leaf.parentElement) {
    if (NON_READABLE_PARENTS.has(p.tagName)) {
      return false;
    }
    if (isEditable(p)) {
      return false;
    }
    if (p === leaf) {
      break;
    }
    p = p.parentElement;
  }
  return true;
}

/**
 * Walk every text node under `leaf` in document order, tracking each node's
 * cumulative offset within `leaf.textContent`. Wrap each non-whitespace token
 * in a wrappable text node into a <span class="assist-word">; skip text inside
 * <script>/<style>/<svg>/<textarea> and contenteditable subtrees so we don't
 * corrupt them. Returns spans + each span's position in the untrimmed leaf
 * textContent — callers adjust for trim and concatenation.
 */
function wrapLeafTextNodes(leaf) {
  if (isEditable(leaf)) {
    return { spans: [], positions: [] };
  }

  // First pass: collect ALL text nodes (so cursor math accounts for unwrappable
  // text — e.g., a contenteditable inside a paragraph still occupies char
  // positions in the speech-engine's view).
  const allWalker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT, null);
  const visit = [];
  let n;
  while ((n = allWalker.nextNode())) {
    visit.push(n);
  }

  const spans = [];
  const positions = [];
  let cursor = 0;

  for (const textNode of visit) {
    const text = textNode.textContent;
    if (shouldWrapTextNode(textNode, leaf)) {
      const parent = textNode.parentNode;
      if (parent) {
        const fragment = document.createDocumentFragment();
        const tokenRegex = /(\s+)|(\S+)/g;
        let m;
        while ((m = tokenRegex.exec(text)) !== null) {
          if (m[1]) {
            fragment.appendChild(document.createTextNode(m[1]));
          } else if (m[2]) {
            const span = document.createElement('span');
            span.className = 'assist-word';
            span.textContent = m[2];
            fragment.appendChild(span);
            spans.push(span);
            positions.push({
              start: cursor + m.index,
              end: cursor + m.index + m[2].length,
            });
          }
        }
        parent.replaceChild(fragment, textNode);
      }
    }
    cursor += text.length;
  }
  return { spans, positions };
}

/**
 * Unwrap every <span class="assist-word"> inside `leaf`, replacing each with
 * its text content. Then normalize() to merge adjacent text nodes.
 */
function unwrapLeafSpans(leaf) {
  if (!leaf || !leaf.querySelectorAll) {
    return;
  }
  const spans = leaf.querySelectorAll('.assist-word');
  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) {
      continue;
    }
    parent.replaceChild(document.createTextNode(span.textContent), span);
  }
  if (typeof leaf.normalize === 'function') {
    leaf.normalize();
  }
}

function restoreWrappedLeaves() {
  for (const leaf of wrappedLeaves) {
    unwrapLeafSpans(leaf);
  }
  wrappedLeaves = [];
}

export function removeHighlight() {
  if (currentHighlight) {
    const parent = currentHighlight.parentNode;
    if (parent) {
      const text = document.createTextNode(currentHighlight.textContent);
      parent.replaceChild(text, currentHighlight);
      parent.normalize();
    }
    currentHighlight = null;
  }

  document.querySelectorAll('.assist-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      const text = document.createTextNode(el.textContent);
      parent.replaceChild(text, el);
      parent.normalize();
    }
  });
}

export function highlightElement(element, settings) {
  removeHighlight();
  if (settings.highlightEnabled) {
    const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);
    element.style.backgroundColor = bgColor;
    element.style.transition = 'background-color 0.2s';
  }
}

export function removeElementHighlight(element) {
  if (element) {
    element.style.backgroundColor = '';
  }
}

/**
 * Hybrid word-by-word highlighter driven by onboundary + char-weighted prediction.
 *
 * INVARIANT: `text` MUST equal `leaves.map(l => l.textContent.trim()).join('\n\n')`
 * — the boundary event's charIndex maps into this concatenated string, and the
 * scheduler depends on word ordering matching exactly. Callers that produce
 * `text` and `leaves` independently (e.g., AI-generated summaries) MUST NOT
 * use this function; gate them on `leaves` being scope-resolver output.
 *
 * @param {HTMLElement} element  - container (used only for cleanup tracking)
 * @param {string} text          - exact text passed to the SpeechSynthesisUtterance
 * @param {SpeechSynthesisUtterance} utterance - utterance whose events drive sync
 * @param {Object} settings      - highlight + scroll config
 * @param {string} settings.highlightColor
 * @param {number} settings.highlightOpacity
 * @param {boolean} [settings.autoScroll] - scroll active word into view when off-screen
 * @param {HTMLElement[]} [leaves] - text-leaf elements to wrap; defaults to [element]
 */
export function highlightWordByWord(element, text, utterance, settings, leaves) {
  // Defensive: if a previous run left leaves wrapped, restore them first.
  restoreWrappedLeaves();
  resetSchedulerState();
  removeHighlight();

  const targetLeaves = leaves && leaves.length ? leaves : [element];
  const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);

  const spans = [];
  const ranges = [];
  let charCursor = 0;

  for (let li = 0; li < targetLeaves.length; li++) {
    const leaf = targetLeaves[li];
    if (!leaf) {
      continue;
    }

    const fullText = leaf.textContent;
    const leafText = fullText?.trim();
    if (!leafText) {
      continue;
    }

    // Defensive: if this leaf carries spans from a stale run, unwrap first.
    if (leaf.querySelector && leaf.querySelector('.assist-word')) {
      unwrapLeafSpans(leaf);
    }

    const leadingWs = fullText.length - fullText.trimStart().length;
    const { spans: leafSpans, positions: leafPositions } = wrapLeafTextNodes(leaf);

    if (leafSpans.length > 0) {
      wrappedLeaves.push(leaf);
      for (let k = 0; k < leafSpans.length; k++) {
        const pos = leafPositions[k];
        const trimmedStart = pos.start - leadingWs;
        const trimmedEnd = pos.end - leadingWs;
        // Drop any word that falls outside the trimmed text (shouldn't happen
        // because we only wrap non-whitespace, but defends against weird DOM).
        if (trimmedStart < 0 || trimmedEnd > leafText.length) {
          continue;
        }
        ranges.push({
          start: charCursor + trimmedStart,
          end: charCursor + trimmedEnd,
        });
        spans.push(leafSpans[k]);
      }
    }
    // ALWAYS advance cursor — even leaves with zero wrappable spans contribute
    // to the speech text (e.g., a paragraph entirely inside a contenteditable
    // span). Skipping them would desync all subsequent leaves' charRanges.
    charCursor += leafText.length;
    if (li < targetLeaves.length - 1) {
      charCursor += 2;
    } // "\n\n" separator
  }

  if (spans.length === 0) {
    return;
  }

  // English speech ~13 chars/sec at 1x; per-char ms scales inversely with rate.
  const rate = utterance.rate || 1;
  const initialMsPerChar = 1000 / (13 * rate);

  wordSpans = spans;
  charRanges = ranges;
  msPerChar = initialMsPerChar;
  autoScrollEnabled = !!settings.autoScroll;
  activeUtterance = utterance;

  function activate(i) {
    if (i < 0 || i >= wordSpans.length) {
      return;
    }
    if (activeIndex >= 0 && activeIndex < wordSpans.length && wordSpans[activeIndex]) {
      wordSpans[activeIndex].style.backgroundColor = '';
    }
    const span = wordSpans[i];
    if (!span) {
      return;
    }
    span.style.backgroundColor = bgColor;
    span.style.transition = 'background-color 0.1s';
    activeIndex = i;

    if (autoScrollEnabled) {
      const rect = span.getBoundingClientRect();
      const margin = 80;
      if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function scheduleNext(i) {
    if (i >= wordSpans.length) {
      return;
    }
    // Always clear any previously-pending timer first so callers like
    // onresume/onboundary can't leak a parallel chain by overwriting the id.
    if (wordHighlightTimeout) {
      clearTimeout(wordHighlightTimeout);
      wordHighlightTimeout = null;
    }
    // Anchor each activation to the word's char position in the speech text,
    // not its sequential span index — otherwise unwrappable text between
    // wrapped words (e.g., contenteditable subtree, skipped script content)
    // would cause the next span to fire too early.
    const targetTime = charRanges[i].start * msPerChar;
    const elapsed = performance.now() - startTs - pauseAccum;
    const delay = Math.max(40, targetTime - elapsed);
    wordHighlightTimeout = setTimeout(() => {
      if (activeUtterance !== utterance) {
        return;
      }
      if (i > boundaryIndex) {
        activate(i);
      }
      scheduleNext(i + 1);
    }, delay);
  }

  utterance.onstart = () => {
    if (activeUtterance !== utterance) {
      return;
    } // stale
    startTs = performance.now();
    // Don't activate(0) directly — schedule it. If charRanges[0].start > 0
    // (leading speech text was unwrappable), activating immediately would
    // highlight the first wrapped word before the synth reaches it.
    scheduleNext(0);
    watchdogTimeout = setTimeout(() => {
      if (activeUtterance !== utterance) {
        return;
      }
      if (!boundaryFired) {
        console.warn('[AssisT] onboundary unsupported by this voice — running on prediction');
      }
    }, 750);
  };

  utterance.onboundary = event => {
    if (activeUtterance !== utterance) {
      return;
    } // stale
    if (event.name !== 'word') {
      return;
    }
    boundaryFired = true;
    const idx = charRanges.findIndex(r => event.charIndex >= r.start && event.charIndex < r.end);
    if (idx === -1 || idx >= wordSpans.length) {
      return;
    }

    if (idx > activeIndex) {
      // When boundary fires for word `idx`, Chrome is starting that word.
      // Use the word's char position in the speech text as the expected anchor —
      // this counts spaces, punctuation, and unwrappable interleaved text the
      // synth is speaking between our wrapped words.
      const charsBefore = charRanges[idx].start;
      const expected = charsBefore * msPerChar;
      const actual = performance.now() - startTs - pauseAccum;
      if (expected > 0 && actual > 0) {
        const ratio = Math.max(0.5, Math.min(2.0, actual / expected));
        msPerChar = msPerChar * ratio;
      }
      activate(idx);
      boundaryIndex = idx;
      scheduleNext(idx + 1); // scheduleNext clears any pending timer
    }
    // Late boundary (idx <= activeIndex): ignore, never go backward.
  };

  utterance.onpause = () => {
    if (activeUtterance !== utterance) {
      return;
    } // stale
    if (wordHighlightTimeout) {
      clearTimeout(wordHighlightTimeout);
      wordHighlightTimeout = null;
    }
    pausedAt = performance.now();
  };

  utterance.onresume = () => {
    if (activeUtterance !== utterance) {
      return;
    } // stale
    if (pausedAt > 0) {
      pauseAccum += performance.now() - pausedAt;
      pausedAt = 0;
    }
    scheduleNext(activeIndex + 1);
  };
}

/**
 * Restore all leaves wrapped by highlightWordByWord and reset scheduler state.
 * The `_element` param is accepted for backward compatibility but ignored —
 * cleanup operates on the leaves the highlighter actually mutated.
 */
export function cleanupWordByWord(_element) {
  resetSchedulerState();
  restoreWrappedLeaves();
}
