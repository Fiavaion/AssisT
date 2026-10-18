/**
 * A selection that ends at the edge of a block must still resolve to the text it covers.
 *
 * Triple-clicking a paragraph is how most people select one, and Chrome does not end that selection
 * inside the paragraph. It ends it at the START of whatever comes next: the end container is the NEXT
 * element and the offset is 0. The end resolver only ever looked backwards among that container's own
 * children, so at offset 0 there were no children to look at and it returned null. Nothing resolved,
 * so nothing was highlighted and nothing could be anchored.
 *
 * What a student saw: triple-click a paragraph, choose Add Annotation, type a comment, press Save. The
 * dialog closed as though it had worked. No highlight, nothing in the sidebar, nothing after a reload,
 * and the comment gone. A record was stored that pointed at nothing.
 *
 * It had no browser test to catch it between November 2025 and today.
 */

import { resolveBoundary } from '../../../src/features/annotations/annotation-range.js';

describe('resolving a selection boundary that sits at the edge of a block', () => {
  let first;
  let second;

  beforeEach(() => {
    document.body.innerHTML = `
      <article id="host">
        <p id="a">First paragraph.</p>
        <p id="b">Second paragraph.</p>
      </article>`;
    first = document.getElementById('a');
    second = document.getElementById('b');
  });

  it('ends on the last character of the paragraph the student actually selected', () => {
    // Exactly what Chrome hands over for a triple-click on the first paragraph.
    const resolved = resolveBoundary(second, 0, false);

    expect(resolved).not.toBeNull();
    expect(resolved.node).toBe(first.firstChild);
    expect(resolved.offset).toBe('First paragraph.'.length);
  });

  it('still resolves when the next block is nested deeper', () => {
    document.body.innerHTML = `
      <article><p id="a">First paragraph.</p><section><p id="b">Second.</p></section></article>`;
    const nested = document.getElementById('b');

    const resolved = resolveBoundary(nested, 0, false);

    expect(resolved.node).toBe(document.getElementById('a').firstChild);
    expect(resolved.offset).toBe('First paragraph.'.length);
  });

  it('gives up honestly when there is genuinely no text before the boundary', () => {
    document.body.innerHTML = '<article><p id="b">Only paragraph.</p></article>';

    expect(resolveBoundary(document.getElementById('b'), 0, false)).toBeNull();
  });

  it('resolves a start boundary sitting past the last child, the mirror case', () => {
    const resolved = resolveBoundary(first, first.childNodes.length, true);

    expect(resolved).not.toBeNull();
    expect(resolved.node).toBe(second.firstChild);
    expect(resolved.offset).toBe(0);
  });

  it('still does the ordinary thing: a text container is returned as it is', () => {
    const resolved = resolveBoundary(first.firstChild, 5, false);

    expect(resolved).toEqual({ node: first.firstChild, offset: 5 });
  });

  it('still resolves an end boundary that does sit inside its own container', () => {
    const resolved = resolveBoundary(first, 1, false);

    expect(resolved.node).toBe(first.firstChild);
    expect(resolved.offset).toBe('First paragraph.'.length);
  });
});
