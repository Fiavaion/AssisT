/**
 * @fileoverview Finding an annotation's text again on a page that has moved underneath it.
 *
 * The original anchor was an index-based XPath (`div[3]/p[2]`) plus character offsets into
 * that container. Every one of those indices is a bet that nothing above or before the
 * annotated text will change — and on a news page something always does: an ad slot fills
 * in, a consent banner mounts, a lazy section arrives, an SPA re-renders. When the bet
 * loses, the annotation restores onto the wrong sentence, silently.
 *
 * So this module stores what the W3C Web Annotation Data Model calls a selector set, and
 * tries each selector in turn:
 *
 *   1. TextQuoteSelector  — the quoted text plus the characters either side of it. Survives
 *                           any restructuring that leaves the words themselves alone, which
 *                           is nearly all of it.
 *   2. TextPositionSelector — character offsets into the page's text. Breaks the tie when the
 *                           same quote appears twice, and can still place an annotation whose
 *                           quoted words were edited but whose surroundings are intact.
 *   3. The legacy XPath   — kept so annotations saved by earlier builds, which carry nothing
 *                           else, restore exactly as they always did.
 *
 * Two rules run through the whole file.
 *
 * **Never guess.** A highlight on the wrong sentence is a worse failure than a missing one:
 * it tells a student their own past reading said something it did not. So when the quote
 * turns up in several places and neither the surrounding context nor the stored offset
 * singles one out, this module anchors nothing and says so. It does not fall through to a
 * weaker selector either — ambiguity is positive evidence that guessing is unsafe.
 *
 * **The page is read as text, not as a tree.** Everything is done against one normalised
 * string built from the document, so the shape of the tree above the words does not matter.
 *
 * @module features/annotations/annotation-anchor
 */

import { HIGHLIGHT_CLASS, resolveBoundary } from './annotation-range.js';

/**
 * Characters of context kept either side of the quote.
 *
 * 32 is the Web Annotation convention (and what Hypothesis ships). It is long enough to tell
 * two occurrences of a repeated heading or boilerplate phrase apart, and short enough that an
 * edit a sentence away does not destroy it.
 */
export const CONTEXT_LENGTH = 32;

/**
 * How far the document text may shift before a stored offset stops being evidence.
 *
 * Only consulted when the context is genuinely identical around two candidates, i.e. the page
 * really does repeat itself. An injected ad slot or banner moves the text by a few dozen to a
 * few hundred characters and stays trustworthy; a wholesale re-render moves it much further,
 * and at that point "nearest to where it used to be" means nothing.
 */
const POSITION_DRIFT_TOLERANCE = 500;

/** Beyond this many occurrences the quote is too common to place. Fail rather than guess. */
const MAX_QUOTE_CANDIDATES = 500;

/** Elements whose text is never page prose. */
const NON_PROSE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
  'TITLE',
  'IFRAME',
  'OBJECT',
]);

/**
 * Elements that force a line break, so their edges read as a space.
 *
 * A tag-name list rather than a computed style: it gives the same answer during capture and
 * during restore even when the stylesheet has not loaded, and it is the same answer under
 * jsdom, so the behaviour is testable.
 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'BR',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TD',
  'TH',
  'TR',
  'UL',
]);

/**
 * AssisT spans that wrap PAGE text rather than adding text of their own.
 *
 * The walk below skips AssisT's own interface — a sidebar, a sticky note or an open modal is
 * not part of the article, and counting it would move every offset after it. But several
 * features wrap the page's own words in `assist-`-prefixed spans, and those words ARE the
 * page. Skipping them would delete real text from the middle of the document; including them
 * costs nothing, because wrapping a word changes the tree without changing a character.
 *
 * That is also what makes overlapping annotations work: by the time a second annotation
 * restores, the first one's `.assist-inline-annotation` spans are in the DOM, splitting text
 * nodes that were whole at capture. Read as text, the document is byte-for-byte what it was.
 *
 * Anything added here must be a wrapper around existing page text. A new AssisT surface that
 * ADDS text must NOT be listed.
 */
const TRANSPARENT_ASSIST_CLASSES = new Set([
  HIGHLIGHT_CLASS,
  'assist-tts-highlight-active',
  'assist-bionic',
  'assist-syllable',
  'assist-grammar',
]);

const WHITESPACE = /\s/;

/** @returns {Element} The subtree the document text is read from. */
function defaultRoot() {
  return document.body || document.documentElement;
}

/**
 * True for AssisT's own interface, which is not page text.
 * @param {Element} element - Candidate element.
 * @returns {boolean} Whether to skip this subtree.
 */
function isAssistChrome(element) {
  const classes = element.classList;
  let named = false;
  // Read straight off the live list: this runs on every element of the page, once per
  // annotation being restored.
  for (let i = 0; classes && i < classes.length; i++) {
    const name = classes[i];
    if (!name.startsWith('assist-')) {
      continue;
    }
    if (TRANSPARENT_ASSIST_CLASSES.has(name)) {
      return false;
    }
    named = true;
  }
  if (named) {
    return true;
  }
  return typeof element.id === 'string' && element.id.startsWith('assist-');
}

/**
 * True when this element contributes no page prose.
 * @param {Element} element - Candidate element.
 * @returns {boolean} Whether to skip this subtree.
 */
function isExcluded(element) {
  const tag = (element.tagName || '').toUpperCase();
  if (NON_PROSE_TAGS.has(tag)) {
    return true;
  }
  if (typeof element.hasAttribute === 'function' && element.hasAttribute('hidden')) {
    return true;
  }
  return isAssistChrome(element);
}

/**
 * Read the whole subtree as one normalised string, remembering where every character came from.
 *
 * Normalisation is the part that has to be right, because it runs twice — once when the
 * annotation is made and once, on a differently-serialised page, when it is restored. Every
 * run of whitespace becomes a single space, and every block edge counts as a run of
 * whitespace. So `<p>a</p><p>b</p>` and a pretty-printed `<p>a</p>\n  <p>b</p>` both read as
 * `a b`, and an annotation spanning the two paragraphs matches either. Leading whitespace
 * produces no character at all, so the string cannot start with a space that a re-render
 * might drop.
 *
 * A collapsed space is attributed to the first whitespace character of the run it stands for,
 * so a boundary landing on it maps back to a real place in a real text node. A space standing
 * only for a block edge has no whitespace of its own, and borrows the position of the
 * character that follows it.
 *
 * @param {Element} root - Subtree to read.
 * @returns {{text: string, nodes: Array<Text>, offsets: Array<number>, spans: Map<Text, {from: number, to: number}>}}
 *   The normalised text, the source (node, offset) of each of its characters, and the slice of
 *   the string each text node produced.
 */
function buildTextMap(root) {
  const chars = [];
  const nodes = [];
  const offsets = [];
  const spans = new Map();

  // Starts true so whitespace before the first character never becomes a character.
  let pendingSpace = true;
  let pendingNode = null;
  let pendingOffset = -1;

  function markBoundary() {
    if (!pendingSpace) {
      pendingSpace = true;
      pendingNode = null;
      pendingOffset = -1;
    }
  }

  function emit(char, node, offset) {
    chars.push(char);
    nodes.push(node);
    offsets.push(offset);
  }

  function flushSpace(node, offset) {
    if (!pendingSpace) {
      return;
    }
    pendingSpace = false;
    if (chars.length === 0) {
      pendingNode = null;
      return;
    }
    emit(' ', pendingNode || node, pendingNode ? pendingOffset : offset);
    pendingNode = null;
  }

  function readText(node) {
    const from = chars.length;
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      if (WHITESPACE.test(char)) {
        if (!pendingSpace) {
          pendingSpace = true;
          pendingNode = node;
          pendingOffset = i;
        }
        continue;
      }
      flushSpace(node, i);
      emit(char, node, i);
    }
    spans.set(node, { from, to: chars.length });
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      readText(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || isExcluded(node)) {
      return;
    }
    const block = BLOCK_TAGS.has((node.tagName || '').toUpperCase());
    if (block) {
      markBoundary();
    }
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      walk(children[i]);
    }
    if (block) {
      markBoundary();
    }
  }

  if (root) {
    walk(root);
  }

  return { text: chars.join(''), nodes, offsets, spans };
}

/**
 * Index into the normalised text for a range START sitting at (node, offset).
 *
 * A space standing for a block edge borrows the position of the character after it, so it
 * shares a (node, offset) with that character. A selection starting there means the
 * character, not the separator — the separator is not in the page's source at all — so the
 * scan steps past any entry the following one duplicates.
 *
 * @param {Object} map - Text map.
 * @param {Text} node - Boundary text node.
 * @param {number} offset - Character offset within the node.
 * @returns {number|null} Index, or null when the node produced no text at all.
 */
function indexForStart(map, node, offset) {
  const span = map.spans.get(node);
  if (!span) {
    return null;
  }
  for (let i = span.from; i < span.to; i++) {
    if (map.nodes[i] !== node || map.offsets[i] < offset) {
      continue;
    }
    let index = i;
    while (
      index + 1 < span.to &&
      map.nodes[index + 1] === node &&
      map.offsets[index + 1] === map.offsets[index]
    ) {
      index++;
    }
    return index;
  }
  return span.to;
}

/**
 * Index into the normalised text for a range END sitting at (node, offset). Exclusive.
 * @param {Object} map - Text map.
 * @param {Text} node - Boundary text node.
 * @param {number} offset - Character offset within the node.
 * @returns {number|null} Index, or null when the node produced no text at all.
 */
function indexForEnd(map, node, offset) {
  const span = map.spans.get(node);
  if (!span) {
    return null;
  }
  for (let i = span.to - 1; i >= span.from; i--) {
    if (map.nodes[i] === node && map.offsets[i] < offset) {
      return i + 1;
    }
  }
  return span.from;
}

/**
 * Turn a pair of normalised-text indices back into a live Range.
 * @param {Object} map - Text map.
 * @param {number} startIndex - Inclusive start.
 * @param {number} endIndex - Exclusive end.
 * @returns {Range|null} The range, or null when it cannot be built.
 */
function rangeForIndices(map, startIndex, endIndex) {
  if (startIndex < 0 || endIndex > map.nodes.length || endIndex <= startIndex) {
    return null;
  }
  const startNode = map.nodes[startIndex];
  const endNode = map.nodes[endIndex - 1];
  if (!startNode || !endNode) {
    return null;
  }
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.min(map.offsets[startIndex], startNode.length));
    range.setEnd(endNode, Math.min(map.offsets[endIndex - 1] + 1, endNode.length));
    return range.collapsed ? null : range;
  } catch (error) {
    console.warn('[AnnotationAnchor] Could not build a range from text offsets:', error);
    return null;
  }
}

/**
 * How many characters two strings share, read from their ends.
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Shared trailing length.
 */
function commonSuffixLength(a, b) {
  let count = 0;
  while (
    count < a.length &&
    count < b.length &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  ) {
    count++;
  }
  return count;
}

/**
 * How many characters two strings share, read from their starts.
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Shared leading length.
 */
function commonPrefixLength(a, b) {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) {
    count++;
  }
  return count;
}

/**
 * How well the text around a candidate matches the context recorded at capture.
 * @param {string} text - The whole normalised document text.
 * @param {number} at - Candidate start index.
 * @param {number} length - Quote length.
 * @param {string} prefix - Stored preceding context.
 * @param {string} suffix - Stored following context.
 * @returns {number} Characters of agreement, counted outwards from the quote.
 */
function contextScore(text, at, length, prefix, suffix) {
  const before = text.slice(Math.max(0, at - prefix.length), at);
  const after = text.slice(at + length, at + length + suffix.length);
  return commonSuffixLength(prefix, before) + commonPrefixLength(suffix, after);
}

/**
 * Every place the quote appears, up to the point where it is too common to be an anchor.
 * @param {string} text - Normalised document text.
 * @param {string} exact - Quoted text.
 * @returns {Array<number>|null} Start indices, or null when there are too many.
 */
function findOccurrences(text, exact) {
  const found = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(exact, from);
    if (at === -1) {
      return found;
    }
    found.push(at);
    if (found.length > MAX_QUOTE_CANDIDATES) {
      return null;
    }
    from = at + 1;
  }
}

/**
 * Place the annotation by its quoted text.
 *
 * One occurrence is the answer. Several occurrences are scored on how much of the stored
 * prefix and suffix still surrounds them, and a single best-scoring candidate wins. Only when
 * two candidates are equally well surrounded — the page genuinely repeats itself — is the
 * stored offset consulted, and then only to pick a clear nearest that has not drifted further
 * than an anchor can survive.
 *
 * When none of that produces a single answer the result is reported as ambiguous, which the
 * caller treats as "do not anchor" rather than "try something weaker".
 *
 * @param {Object} position - Stored position record.
 * @param {Object} map - Text map for the current page.
 * @returns {{range: Range|null, ambiguous: boolean}} Outcome.
 */
function resolveByQuote(position, map) {
  const { exact, prefix = '', suffix = '' } = position.quote;
  if (typeof exact !== 'string' || !exact.trim()) {
    return { range: null, ambiguous: false };
  }

  const occurrences = findOccurrences(map.text, exact);
  if (occurrences === null) {
    return { range: null, ambiguous: true };
  }
  if (occurrences.length === 0) {
    return { range: null, ambiguous: false };
  }

  let chosen = occurrences[0];

  if (occurrences.length > 1) {
    const scored = occurrences.map(at => ({
      at,
      score: contextScore(map.text, at, exact.length, prefix, suffix),
    }));
    const best = scored.reduce((top, candidate) => Math.max(top, candidate.score), 0);

    // No resemblance to what surrounded the quote, and no single occurrence: the page these
    // words came from is not the page in front of us.
    if (best === 0 && (prefix || suffix)) {
      return { range: null, ambiguous: true };
    }

    const contenders = scored.filter(candidate => candidate.score === best);
    if (contenders.length === 1) {
      chosen = contenders[0].at;
    } else {
      const anchor = position.textPosition ? position.textPosition.start : null;
      if (!Number.isInteger(anchor)) {
        return { range: null, ambiguous: true };
      }
      const distance = candidate => Math.abs(candidate.at - anchor);
      const nearest = contenders.reduce((a, b) => (distance(b) < distance(a) ? b : a));
      const tied = contenders.filter(candidate => distance(candidate) === distance(nearest));
      if (tied.length > 1 || distance(nearest) > POSITION_DRIFT_TOLERANCE) {
        return { range: null, ambiguous: true };
      }
      chosen = nearest.at;
    }
  }

  return { range: rangeForIndices(map, chosen, chosen + exact.length), ambiguous: false };
}

/**
 * Place the annotation at the character offsets recorded at capture.
 *
 * Reached only when the quoted words are no longer on the page — someone fixed a typo, or a
 * dash became a hyphen. Raw offsets on a page that has also moved would land anywhere, so
 * they are trusted only when the text still sitting either side of them is the text that was
 * there before. That is the difference between "the words were edited" and "this is a
 * different page".
 *
 * @param {Object} position - Stored position record.
 * @param {Object} map - Text map for the current page.
 * @returns {Range|null} The range, or null when the offsets cannot be trusted.
 */
function resolveByPosition(position, map) {
  const { start, end } = position.textPosition;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    return null;
  }
  if (end > map.text.length) {
    return null;
  }

  const quote = position.quote || {};
  const prefix = typeof quote.prefix === 'string' ? quote.prefix : '';
  const suffix = typeof quote.suffix === 'string' ? quote.suffix : '';
  if (!prefix && !suffix) {
    return null;
  }

  const score = contextScore(map.text, start, end - start, prefix, suffix);
  if (score < Math.ceil((prefix.length + suffix.length) / 2)) {
    return null;
  }
  return rangeForIndices(map, start, end);
}

/**
 * Find an element by XPath.
 * @param {string} xpath - XPath expression.
 * @returns {Element|null} Found element.
 */
function getElementByXPath(xpath) {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}

/**
 * Text nodes as the legacy anchor counted them — whitespace-only nodes excluded.
 *
 * This walk defines what the stored `startOffset`/`endOffset` of every already-saved
 * annotation mean, so it must keep counting exactly the way it always has.
 *
 * @param {Element} element - Container element.
 * @returns {Array<Text>} Text nodes in document order.
 */
function legacyTextNodesIn(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.trim()) {
      textNodes.push(node);
    }
  }

  return textNodes;
}

/**
 * XPath for an element, by id where there is one and by sibling index otherwise.
 * @param {Element} element - Element to describe.
 * @returns {string} XPath expression.
 */
function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  if (element === document.body || !element.parentNode) {
    return '/html/body';
  }

  let index = 0;
  const siblings = element.parentNode.childNodes;

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return `${getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${index + 1}]`;
    }
    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
      index++;
    }
  }

  return getXPath(element.parentNode);
}

/**
 * Place the annotation the way every build before this one did.
 *
 * The only selector an already-saved annotation has, so this is the migration path: it is
 * left exactly as it was, offsets counted over the same text nodes against the same XPath.
 *
 * @param {Object} position - Stored position record.
 * @returns {Range|null} The range, or null when the container is gone.
 */
function resolveByXPath(position) {
  const { startOffset, endOffset, containerXPath } = position;
  if (typeof containerXPath !== 'string' || !containerXPath) {
    return null;
  }

  let container;
  try {
    container = getElementByXPath(containerXPath);
  } catch (error) {
    console.warn('[AnnotationAnchor] Stored XPath could not be evaluated:', containerXPath, error);
    return null;
  }
  if (!container) {
    return null;
  }

  let cursor = 0;
  let startNode = null;
  let startNodeOffset = 0;
  let endNode = null;
  let endNodeOffset = 0;

  for (const node of legacyTextNodesIn(container)) {
    const nodeStart = cursor;
    const nodeEnd = cursor + node.textContent.length;

    if (startNode === null && startOffset >= nodeStart && startOffset < nodeEnd) {
      startNode = node;
      startNodeOffset = startOffset - nodeStart;
    }
    if (endOffset > nodeStart && endOffset <= nodeEnd) {
      endNode = node;
      endNodeOffset = endOffset - nodeStart;
      break;
    }

    cursor = nodeEnd;
  }

  if (!startNode || !endNode) {
    return null;
  }

  try {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    return range.collapsed ? null : range;
  } catch (error) {
    console.warn('[AnnotationAnchor] Could not rebuild the legacy range:', error);
    return null;
  }
}

/**
 * Describe a live Range so it can be found again later.
 *
 * Returns the legacy `startOffset`/`endOffset`/`containerXPath` a previous build would have
 * written, plus the quote and text-position selectors that make the anchor survive a moving
 * page. Both are stored: the legacy fields keep an older build able to read the record, and
 * the selectors are what this build actually anchors with.
 *
 * @param {Range} range - Live range from the selection.
 * @param {Element} [root] - Subtree the text position is measured against.
 * @returns {{startOffset: number, endOffset: number, containerXPath: string,
 *   quote?: {exact: string, prefix: string, suffix: string},
 *   textPosition?: {start: number, end: number}}|null} Position record, or null for a range
 *   that describes no text.
 */
export function describeRange(range, root = defaultRoot()) {
  if (!range || range.collapsed) {
    return null;
  }

  let start;
  let end;
  try {
    start = resolveBoundary(range.startContainer, range.startOffset, true);
    end = resolveBoundary(range.endContainer, range.endOffset, false);
  } catch (error) {
    console.warn('[AnnotationAnchor] Could not resolve the selection boundaries:', error);
    return null;
  }
  if (!start || !end) {
    return null;
  }

  const position = describeLegacyPosition(range, start, end);
  const selectors = describeSelectors(start, end, root);
  return selectors ? { ...position, ...selectors } : position;
}

/**
 * The legacy half of the record.
 *
 * Both offsets are measured from the boundaries RESOLVED to text nodes, which is the fix for
 * the original defect: a Range boundary given against an element carries a child index, not a
 * character offset, so the old loop — which compared text nodes to `range.startContainer` —
 * never matched, left the offset at its initial 0, and anchored the highlight at the start of
 * the container instead of where the selection actually began.
 *
 * @param {Range} range - The range being described.
 * @param {{node: Text, offset: number}} start - Resolved start boundary.
 * @param {{node: Text, offset: number}} end - Resolved end boundary.
 * @returns {{startOffset: number, endOffset: number, containerXPath: string}} Legacy fields.
 */
function describeLegacyPosition(range, start, end) {
  const ancestor = range.commonAncestorContainer;
  const container = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentElement : ancestor;

  let startOffset = 0;
  let endOffset = 0;
  let cursor = 0;

  for (const node of legacyTextNodesIn(container)) {
    if (node === start.node) {
      startOffset = cursor + start.offset;
    }
    if (node === end.node) {
      endOffset = cursor + end.offset;
      break;
    }
    cursor += node.textContent.length;
  }

  return { startOffset, endOffset, containerXPath: getXPath(container) };
}

/**
 * The quote and text-position selectors for a resolved pair of boundaries.
 * @param {{node: Text, offset: number}} start - Resolved start boundary.
 * @param {{node: Text, offset: number}} end - Resolved end boundary.
 * @param {Element} root - Subtree to measure against.
 * @returns {{quote: Object, textPosition: Object}|null} Selectors, or null when the range
 *   covers no readable text.
 */
function describeSelectors(start, end, root) {
  const map = buildTextMap(root);
  const startIndex = indexForStart(map, start.node, start.offset);
  const endIndex = indexForEnd(map, end.node, end.offset);
  if (startIndex === null || endIndex === null || endIndex <= startIndex) {
    return null;
  }

  const exact = map.text.slice(startIndex, endIndex);
  if (!exact.trim()) {
    return null;
  }

  return {
    quote: {
      exact,
      prefix: map.text.slice(Math.max(0, startIndex - CONTEXT_LENGTH), startIndex),
      suffix: map.text.slice(endIndex, endIndex + CONTEXT_LENGTH),
    },
    textPosition: { start: startIndex, end: endIndex },
  };
}

/**
 * Find the text a stored annotation was made on.
 *
 * Quote first, then text position, then the legacy XPath — except that a quote which turns up
 * in several indistinguishable places stops the search outright. Falling through to a weaker
 * selector there would be guessing with extra steps, and the one thing this must not do is
 * put a highlight on a sentence the reader never marked.
 *
 * Returning null means "not on this page right now", never "delete this". The record stays in
 * storage: pages change back, and an annotation that cannot be shown today may anchor
 * perfectly tomorrow.
 *
 * @param {Object} position - Stored position record, old shape or new.
 * @param {Element} [root] - Subtree to search.
 * @returns {{range: Range, strategy: 'quote'|'position'|'xpath'}|null} The resolved range and
 *   which selector found it.
 */
export function resolveAnchor(position, root = defaultRoot()) {
  if (!position || typeof position !== 'object') {
    return null;
  }

  const needsText = Boolean(position.quote || position.textPosition);
  const map = needsText ? buildTextMap(root) : null;

  if (position.quote) {
    const outcome = resolveByQuote(position, map);
    if (outcome.range) {
      return { range: outcome.range, strategy: 'quote' };
    }
    if (outcome.ambiguous) {
      console.warn(
        '[AnnotationAnchor] The annotated text appears in more than one place and none of ' +
          'them can be trusted — leaving this annotation unanchored rather than guessing.'
      );
      return null;
    }
  }

  if (position.textPosition) {
    const range = resolveByPosition(position, map);
    if (range) {
      return { range, strategy: 'position' };
    }
  }

  const range = resolveByXPath(position);
  return range ? { range, strategy: 'xpath' } : null;
}
