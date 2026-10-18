/**
 * @fileoverview Turning a Range into annotation highlight spans.
 *
 * A single span around a multi-block selection cannot be seen. An inline box that contains
 * block-level children is broken apart by the browser, and `background-color` paints only
 * on the (empty) inline fragments — so the highlight silently disappears on any selection
 * crossing a paragraph boundary. The fix is structural: wrap one span per text run, so
 * every span stays inside a single block and paints normally.
 *
 * Both entry points in inline-annotations.js — the synchronous create path and the
 * restore-from-storage path — go through `wrapRangeInHighlights`; there is no second
 * implementation to drift.
 *
 * @module features/annotations/annotation-range
 */

import { compositeOver, parseCssColor, resolveAnnotationTheme } from './annotation-colors.js';

/** Class every highlight span carries. */
export const HIGHLIGHT_CLASS = 'assist-inline-annotation';

/** Elements whose text is never user-visible prose. */
const OPAQUE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

/** Ancestors to inspect before giving up on reading the surface. */
const MAX_SURFACE_WALK = 40;

/**
 * Read the surface a highlight span is sitting on.
 *
 * Walks outwards for two things: the nearest background that actually paints, and the
 * text colour in force. The nearest one wins, so a light card on a dark page is read
 * as light. Translucent layers are collected and composited over whatever opaque
 * colour is found beneath them. A background image or gradient ends the background
 * search unresolved rather than guessing at its average — the text colour then
 * decides, which is the reading that cannot be wrong about which way round the page is.
 *
 * The text colour is walked for too, rather than read once off the parent: a browser
 * hands back the inherited value immediately, but jsdom reports only what an element
 * declares, so the walk is what makes this testable as well as correct.
 *
 * @param {HTMLElement} element - Highlight span, already in the document.
 * @returns {{backdrop: Array<number>|null, textColor: string|null}} What could be read.
 */
function readSurface(element) {
  const view = element.ownerDocument && element.ownerDocument.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') {
    return { backdrop: null, textColor: null };
  }

  const layers = [];
  let backdrop = null;
  let textColor = null;
  let resolvedBackdrop = false;
  let node = element.parentElement;

  for (let step = 0; node && step < MAX_SURFACE_WALK; step++, node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (!style) {
      break;
    }
    if (!textColor && style.color) {
      textColor = style.color;
    }
    if (!resolvedBackdrop) {
      const image = style.backgroundImage;
      if (image && image !== 'none') {
        resolvedBackdrop = true;
      } else {
        const paint = parseCssColor(style.backgroundColor);
        if (paint && paint.a >= 1) {
          backdrop = layers.reduceRight(
            (base, layer) => compositeOver(layer, base),
            [paint.r, paint.g, paint.b]
          );
          resolvedBackdrop = true;
        } else if (paint && paint.a > 0) {
          layers.push(paint);
        }
      }
    }
    if (resolvedBackdrop && textColor) {
      break;
    }
  }

  return { backdrop, textColor };
}

/**
 * Paint an annotation colour onto a highlight span, for the surface it sits on.
 *
 * The span must already be in the document — the surface is read from its ancestors,
 * and a detached span has none. Each span of a multi-block annotation is painted
 * against its own ground for that reason: the rule is the same everywhere, but a
 * highlight crossing from a dark page into a light code block should stay readable in
 * both halves rather than pick one and lose the other.
 *
 * @param {HTMLElement} element - Highlight span.
 * @param {string} color - Palette name.
 */
export function applyAnnotationColor(element, color) {
  const theme = resolveAnnotationTheme(color, readSurface(element));
  element.style.backgroundColor = theme.fill;
  element.style.borderBottom = `3px solid ${theme.border}`;
  // Cleared rather than left in place, so re-painting cannot strand an override from
  // a surface the span no longer sits on. Forced colours still win: the injected sheet
  // declares MarkText with !important, which outranks an inline declaration.
  element.style.color = theme.textColor || '';
}

/**
 * Name a highlight group for assistive technology.
 *
 * One annotation is one thing, however many paragraphs it crosses, so only the FIRST span
 * carries the accessible name and a place in the tab order. The continuation spans keep
 * `role="mark"` — their text really is highlighted and a screen-reader user should be told
 * so — but they are unnamed and `tabindex="-1"`, so the annotation is announced once and
 * tabbed to once instead of N times. They are never `aria-hidden`: the text inside them
 * must still be read.
 *
 * @param {Array<HTMLElement>} elements - Spans of one annotation, in document order.
 * @param {string} comment - The annotation comment.
 */
export function labelHighlightGroup(elements, comment) {
  elements.forEach((element, index) => {
    if (index === 0) {
      element.setAttribute('aria-label', `Annotation: ${comment || 'No comment'}`);
      element.setAttribute('tabindex', '0');
      return;
    }
    element.removeAttribute('aria-label');
    element.setAttribute('tabindex', '-1');
  });
}

/**
 * Remove highlight spans, lifting their text back into the page.
 * `normalize()` re-joins the text nodes the wrap split apart, so repeated
 * annotate/delete cycles cannot leave the page fragmented.
 *
 * @param {Array<HTMLElement>} elements - Spans to unwrap.
 */
export function unwrapHighlights(elements) {
  (elements || []).forEach(element => {
    const parent = element.parentNode;
    if (!parent) {
      return;
    }
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    element.remove();
    parent.normalize();
  });
}

/**
 * True when this element's text may be wrapped.
 * @param {Element} element - Candidate element.
 * @returns {boolean} False for opaque tags and existing highlights.
 */
function isWrappableElement(element) {
  return (
    !OPAQUE_TAGS.has(element.tagName) &&
    !(element.classList && element.classList.contains(HIGHLIGHT_CLASS))
  );
}

/**
 * First or last text node inside a subtree, honouring the same exclusions.
 * @param {Node} node - Subtree root.
 * @param {boolean} wantLast - Search from the end instead of the start.
 * @returns {Text|null} The edge text node.
 */
function edgeTextNode(node, wantLast) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || !isWrappableElement(node)) {
    return null;
  }
  const children = Array.from(node.childNodes);
  if (wantLast) {
    children.reverse();
  }
  for (const child of children) {
    const found = edgeTextNode(child, wantLast);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Resolve a Range boundary to a text node and a character offset.
 * A boundary given against an element container carries a CHILD INDEX, not a character
 * offset, so it is resolved to the nearest text node on the correct side.
 *
 * @param {Node} container - Boundary container.
 * @param {number} offset - Character offset, or child index for an element container.
 * @param {boolean} isStart - Resolve forwards (start) rather than backwards (end).
 * @returns {{node: Text, offset: number}|null} Resolved boundary.
 */
/**
 * Step out of a container and keep going, in document order, until text turns up.
 *
 * A boundary can sit at the very edge of an element: before its first child, or after its last. The
 * text it means is then OUTSIDE that element, in whatever comes before or after it, so looking only
 * among the container's own children finds nothing.
 *
 * @param {Node} from - Container to leave.
 * @param {boolean} backwards - Look before `from` rather than after it.
 * @returns {Text|null} Nearest wrappable text node, or null when there is genuinely none.
 */
function textBeyond(from, backwards) {
  let node = from;
  while (node && node !== document.body && node !== document.documentElement) {
    let sibling = backwards ? node.previousSibling : node.nextSibling;
    while (sibling) {
      const found = edgeContentText(sibling, backwards);
      if (found) {
        return found;
      }
      sibling = backwards ? sibling.previousSibling : sibling.nextSibling;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Like `edgeTextNode`, but skips text that is only the whitespace between blocks.
 *
 * Markup is usually indented, so two paragraphs have a newline and some spaces between them. Stepping
 * out of a block to find the text a boundary meant must not stop on that: the student selected words,
 * not the gap between them. Kept separate from `edgeTextNode`, whose callers scan inside one container
 * where that whitespace is part of the content.
 *
 * @param {Node} node - Subtree root.
 * @param {boolean} wantLast - Search from the end instead of the start.
 * @returns {Text|null} Nearest text node holding something other than whitespace.
 */
function edgeContentText(node, wantLast) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.data.trim() ? node : null;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || !isWrappableElement(node)) {
    return null;
  }
  const children = Array.from(node.childNodes);
  if (wantLast) {
    children.reverse();
  }
  for (const child of children) {
    const found = edgeContentText(child, wantLast);
    if (found) {
      return found;
    }
  }
  return null;
}

export function resolveBoundary(container, offset, isStart) {
  if (container.nodeType === Node.TEXT_NODE) {
    return { node: container, offset };
  }
  const children = Array.from(container.childNodes || []);
  if (isStart) {
    for (let i = offset; i < children.length; i++) {
      const node = edgeTextNode(children[i], false);
      if (node) {
        return { node, offset: 0 };
      }
    }
    // Past the last child: the text this boundary means starts after this element.
    const after = textBeyond(container, false);
    return after ? { node: after, offset: 0 } : null;
  }
  for (let i = Math.min(offset, children.length) - 1; i >= 0; i--) {
    const node = edgeTextNode(children[i], true);
    if (node) {
      return { node, offset: node.length };
    }
  }
  // Offset 0, or nothing but empty children before it: the text ends before this element begins.
  // This is the ordinary shape of a triple-click, which Chrome ends at the start of the NEXT block,
  // so getting it wrong meant losing the commonest selection a student makes.
  const before = textBeyond(container, true);
  return before ? { node: before, offset: before.length } : null;
}

/**
 * True when `a` comes strictly before `b` in document order.
 * @param {Node} a - First node.
 * @param {Node} b - Second node.
 * @returns {boolean} Whether a precedes b.
 */
function precedes(a, b) {
  if (a === b) {
    return false;
  }
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * Every text node from `startNode` to `endNode` inclusive, in document order, skipping
 * script/style/noscript subtrees and any existing highlight (annotations never nest).
 *
 * The walk is done on node identity and document order rather than on the live Range, so
 * it stays correct once the splitting below starts mutating the DOM.
 *
 * @param {Text} startNode - First text node of the range.
 * @param {Text} endNode - Last text node of the range.
 * @param {Node} ancestor - The range common ancestor.
 * @returns {Array<Text>} Text nodes in document order.
 */
function textNodesBetween(startNode, endNode, ancestor) {
  if (startNode === endNode) {
    return [startNode];
  }
  const root = ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode : ancestor;
  if (!root) {
    return [];
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return isWrappableElement(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (precedes(node, startNode)) {
      continue;
    }
    if (precedes(endNode, node)) {
      break;
    }
    nodes.push(node);
  }
  return nodes;
}

/**
 * Wrap one whole text node in a highlight span.
 * @param {Text} textNode - Node to wrap.
 * @param {{color: string, annotationId: (number|string|null)}} options - Span options.
 * @returns {HTMLElement} The span now containing the text node.
 */
function wrapTextNode(textNode, { color, annotationId }) {
  const span = document.createElement('span');
  span.className = HIGHLIGHT_CLASS;
  span.setAttribute('role', 'mark');
  if (annotationId !== null && annotationId !== undefined) {
    span.dataset.annotationId = String(annotationId);
  }
  // Insert first: the colour is chosen from the surface the span sits on, which a span
  // still detached from the document cannot be asked about.
  textNode.parentNode.insertBefore(span, textNode);
  span.appendChild(textNode);
  applyAnnotationColor(span, color);
  return span;
}

/**
 * Wrap every text run a Range touches in its own highlight span.
 *
 * @param {Range} range - Live range. Consumed immediately; the caller must not await first.
 * @param {Object} [options] - Wrapping options.
 * @param {string} [options.color='yellow'] - Palette name.
 * @param {string} [options.comment=''] - Comment, used for the accessible name.
 * @param {number|string|null} [options.annotationId=null] - Stored id, when known.
 * @returns {Array<HTMLElement>} Spans in document order (empty when nothing was wrapped).
 */
export function wrapRangeInHighlights(range, options = {}) {
  const { color = 'yellow', comment = '', annotationId = null } = options;

  if (!range || range.collapsed) {
    return [];
  }

  let start;
  let end;
  try {
    start = resolveBoundary(range.startContainer, range.startOffset, true);
    end = resolveBoundary(range.endContainer, range.endOffset, false);
  } catch (error) {
    console.warn('[InlineAnnotations] Could not resolve range boundaries:', error);
    return [];
  }
  if (!start || !end || precedes(end.node, start.node)) {
    return [];
  }

  const nodes = textNodesBetween(start.node, end.node, range.commonAncestorContainer);
  if (nodes.length === 0) {
    return [];
  }

  // A boundary sitting at the very edge of its text node contributes no characters.
  if (end.offset === 0 && nodes[nodes.length - 1] === end.node) {
    nodes.pop();
  }
  if (nodes.length && start.offset >= start.node.length && nodes[0] === start.node) {
    nodes.shift();
  }
  if (nodes.length === 0) {
    return [];
  }

  // Trim the partial end FIRST: when the selection begins and ends in the same text node,
  // splitting the start first would move the end boundary out from under us.
  const last = nodes[nodes.length - 1];
  if (last === end.node && end.offset > 0 && end.offset < last.length) {
    last.splitText(end.offset);
  }
  const first = nodes[0];
  if (first === start.node && start.offset > 0 && start.offset < first.length) {
    nodes[0] = first.splitText(start.offset);
  }

  const spans = [];
  for (const node of nodes) {
    // Whitespace between blocks belongs to nobody's highlight.
    if (!node.data.trim() || !node.parentNode) {
      continue;
    }
    spans.push(wrapTextNode(node, { color, annotationId }));
  }

  labelHighlightGroup(spans, comment);
  return spans;
}

export default {
  wrapRangeInHighlights,
  applyAnnotationColor,
  labelHighlightGroup,
  unwrapHighlights,
};
