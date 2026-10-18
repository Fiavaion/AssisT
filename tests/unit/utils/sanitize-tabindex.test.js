/**
 * @jest-environment jsdom
 *
 * `tabindex` is allowed through sanitizeHTML so that keyboard-operable markup the
 * extension renders with innerHTML keeps its tab stops (SC 2.1.1) — the roving citation
 * cards, the citation panel's view tabs, the annotation sidebar's role="button" items and
 * the assignment breakdown's role="checkbox" steps were all mouse-only without it.
 *
 * An allowlist admits the attribute NAME and says nothing about its value, and some of
 * that markup carries text captured from a host page. A positive tabindex in that text
 * would jump ahead of the entire document's tab order, which is a focus-order failure
 * (SC 2.4.3). These tests pin the clamp that stops it, and pin that the two stricter
 * configs still strip the attribute outright.
 */

import { sanitizeHTML, sanitizeUserContent, sanitizeText } from '../../../src/utils/sanitize.js';

/** The tabindex values of every element in a sanitized fragment, in document order. */
function tabindexes(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return Array.from(host.querySelectorAll('[tabindex]')).map(el => el.getAttribute('tabindex'));
}

describe('sanitizeHTML — tabindex is allowed but clamped', () => {
  test('keeps the two roving values untouched', () => {
    expect(tabindexes(sanitizeHTML('<div tabindex="0">a</div>'))).toEqual(['0']);
    expect(tabindexes(sanitizeHTML('<div tabindex="-1">a</div>'))).toEqual(['-1']);
  });

  test('rewrites a positive tabindex to 0 rather than letting it jump the tab order', () => {
    expect(tabindexes(sanitizeHTML('<a href="#" tabindex="1">jump</a>'))).toEqual(['0']);
    expect(tabindexes(sanitizeHTML('<div tabindex="5">jump</div>'))).toEqual(['0']);
    expect(tabindexes(sanitizeHTML('<div tabindex="32767">jump</div>'))).toEqual(['0']);
  });

  test('rewrites any other value, including a non-numeric one', () => {
    expect(tabindexes(sanitizeHTML('<div tabindex="-2">a</div>'))).toEqual(['0']);
    expect(tabindexes(sanitizeHTML('<div tabindex="abc">a</div>'))).toEqual(['0']);
    expect(tabindexes(sanitizeHTML('<div tabindex=" 1 ">a</div>'))).toEqual(['0']);
  });

  test('clamps every element in the fragment, not just the first', () => {
    const html = sanitizeHTML(
      '<div tabindex="3"><span tabindex="-1">a</span><button tabindex="7">b</button></div>'
    );
    expect(tabindexes(html)).toEqual(['0', '-1', '0']);
  });

  test('the real markup the citation list renders survives intact', () => {
    const html = sanitizeHTML('<div class="citation-card" role="listitem" tabindex="0">x</div>');
    expect(tabindexes(html)).toEqual(['0']);
    expect(html).toContain('role="listitem"');
  });

  test('the clamp hook does not leak into later calls', () => {
    sanitizeHTML('<div tabindex="9">a</div>');
    // sanitizeUserContent allows no tabindex at all; a hook left registered would have
    // rewritten rather than removed it.
    expect(tabindexes(sanitizeUserContent('<span tabindex="9">a</span>'))).toEqual([]);
    expect(tabindexes(sanitizeHTML('<div tabindex="-1">a</div>'))).toEqual(['-1']);
  });
});

describe('the stricter configs still strip tabindex outright', () => {
  test('sanitizeUserContent drops it', () => {
    expect(tabindexes(sanitizeUserContent('<span tabindex="0">a</span>'))).toEqual([]);
    expect(tabindexes(sanitizeUserContent('<span tabindex="1">a</span>'))).toEqual([]);
  });

  test('sanitizeText drops it along with every tag', () => {
    const out = sanitizeText('<span tabindex="1">a</span>');
    expect(out).not.toContain('tabindex');
    expect(out).toContain('a');
  });
});
