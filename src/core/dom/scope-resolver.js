/**
 * Reading Scope Resolver
 *
 * Resolves the click target to a readable text payload based on the user's
 * chosen reading scope (paragraph / section / page).
 *
 * Returns { element, text, leaves }:
 *   - element: the host container (used for outline + cleanup tracking)
 *   - text:    the speech-utterance text (leaf texts joined with "\n\n")
 *   - leaves:  the individual text-block elements that will be word-wrapped.
 *              Per-leaf wrapping preserves the surrounding DOM (links, images,
 *              framework state) — only leaf innerHTML is mutated.
 *
 * @module core/dom/scope-resolver
 */

const TEXT_LEAF_TAGS = ['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
const TEXT_LEAF_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote';

const PARAGRAPH_ANCESTOR_TAGS = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'div',
  'article',
  'section',
];

const SECTION_TAGS = ['main', 'article', 'section'];

const PAGE_EXCLUDE_SELECTOR =
  'nav, header, footer, aside, ' +
  '[role="navigation"], [role="banner"], [role="complementary"], [role="contentinfo"], ' +
  '.nav, .navbar, .menu, .sidebar, .header, .footer, ' +
  '[aria-hidden="true"]';

function isTextLeaf(el) {
  return !!el && TEXT_LEAF_TAGS.includes(el.tagName);
}

/**
 * Gather the text-bearing leaves under (or equal to) `container`, optionally
 * excluding any matching `excludeFn`. If the container is itself a leaf, it
 * is the only leaf returned.
 *
 * Returns LEAFMOST leaves only — any element that contains another candidate
 * is filtered out. This prevents the highlighter from wrapping the same text
 * twice (once via the outer leaf, once via the inner). E.g.
 * `<blockquote><p>...</p></blockquote>` resolves to [p], not [blockquote, p].
 */
function isEditableElement(el) {
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

function gatherLeaves(container, excludeFn) {
  let candidates;
  if (isTextLeaf(container)) {
    candidates = [container];
  } else {
    candidates = Array.from(container.querySelectorAll(TEXT_LEAF_SELECTOR));
    // Fallback: container has no text-leaf descendants (e.g., <div>Hello</div>).
    // Treat the container itself as the leaf so direct text still gets read.
    if (candidates.length === 0 && container.textContent?.trim()) {
      candidates = [container];
    }
  }

  // Drop editable leaves — wrapping them would corrupt rich-text editors,
  // and the highlighter would silently desync if they're spoken but unwrapped.
  candidates = candidates.filter(el => !isEditableElement(el));

  // Leafmost filter: drop any candidate that contains ANOTHER candidate
  // (i.e., keep only the innermost text-leaves). Without this, processing
  // <blockquote><p>...</p></blockquote> would wrap blockquote AND p — the
  // p-wrap would unwrap+rewrap and leave detached spans in wordSpans.
  // Optimisation: precompute the set of "contains-another-candidate"
  // ancestors once via a single upward walk per candidate. O(n × depth).
  const containsAnother = new Set();
  for (const el of candidates) {
    let p = el.parentElement;
    while (p) {
      containsAnother.add(p);
      p = p.parentElement;
    }
  }
  const leafmost = candidates.filter(el => !containsAnother.has(el));

  return excludeFn ? leafmost.filter(l => !excludeFn(l)) : leafmost;
}

/**
 * Build the { element, text, leaves } payload for the given container.
 * Returns null if no readable text is found.
 */
function buildPayload(container, excludeFn) {
  const leaves = gatherLeaves(container, excludeFn).filter(leaf => {
    const t = leaf.textContent?.trim();
    return t && t.length > 0;
  });
  if (leaves.length === 0) {
    return null;
  }

  const blocks = leaves.map(leaf => leaf.textContent.trim());
  const text = blocks.join('\n\n');
  if (text.length < 10) {
    return null;
  }

  return { element: container, text, leaves };
}

/**
 * Walk up from `start` to the nearest ancestor matching one of `tagNames`
 * whose trimmed textContent is at least `minLength` chars.
 */
function findAncestor(start, tagNames, minLength = 10) {
  let target = start;
  while (target && target !== document.body) {
    const tag = target.tagName?.toLowerCase();
    if (tag && tagNames.includes(tag)) {
      const text = target.textContent?.trim();
      if (text && text.length > minLength) {
        return target;
      }
    }
    target = target.parentElement;
  }
  return null;
}

function findParagraph(clickedEl) {
  const target = findAncestor(clickedEl, PARAGRAPH_ANCESTOR_TAGS, 10);
  if (!target) {
    return null;
  }
  // Paragraph scope reads the resolved element as a single unit — wrap its
  // full textContent (including any nested blocks) so direct text mixed with
  // child paragraphs (e.g., <div>intro <p>more</p></div>) gets read.
  // Section/page scopes still use buildPayload for natural per-block pauses.
  return buildSingleLeafPayload(target);
}

function buildSingleLeafPayload(leaf) {
  if (isEditableElement(leaf)) {
    return null;
  }
  const text = leaf.textContent?.trim();
  if (!text || text.length < 10) {
    return null;
  }
  return { element: leaf, text, leaves: [leaf] };
}

function findSection(clickedEl) {
  const target = findAncestor(clickedEl, SECTION_TAGS, 10);
  if (target) {
    const payload = buildPayload(target);
    if (payload) {
      return payload;
    }
  }
  return findParagraph(clickedEl);
}

function collectPageText() {
  const excludeRoots = Array.from(document.querySelectorAll(PAGE_EXCLUDE_SELECTOR));
  const isExcluded = el => excludeRoots.some(ex => ex.contains(el));

  const main = document.querySelector('main, [role="main"]');
  const host = main || document.body;

  return buildPayload(host, isExcluded);
}

/**
 * Resolve the clicked element to a readable target based on scope.
 *
 * @param {HTMLElement} clickedEl - the element the user clicked
 * @param {'paragraph'|'section'|'page'} scope
 * @returns {{element: HTMLElement, text: string, leaves: HTMLElement[]} | null}
 */
export function resolveReadingTarget(clickedEl, scope) {
  if (scope === 'page') {
    return collectPageText() || findParagraph(clickedEl);
  }
  if (scope === 'section') {
    return findSection(clickedEl);
  }
  return findParagraph(clickedEl);
}
