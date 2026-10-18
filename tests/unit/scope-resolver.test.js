/**
 * Tests for src/core/dom/scope-resolver.js
 *
 * Verifies that resolveReadingTarget(clickedEl, scope) returns the right
 * { element, text, leaves } shape for paragraph / section / page scopes,
 * with correct handling of nested leaves, editable subtrees, and
 * navigation/sidebar exclusion in page mode.
 */

import {
  resolveReadingTarget,
  resolveSelectionTarget,
  leafText,
} from '../../src/core/dom/scope-resolver.js';

function setBody(html) {
  document.body.innerHTML = html;
}

describe('resolveReadingTarget — paragraph scope', () => {
  test('reads the clicked paragraph element', () => {
    setBody('<p id="target">Hello world this is a paragraph.</p>');
    const p = document.getElementById('target');
    const result = resolveReadingTarget(p, 'paragraph');
    expect(result).not.toBeNull();
    expect(result.element).toBe(p);
    expect(result.text).toBe('Hello world this is a paragraph.');
    expect(result.leaves).toEqual([p]);
  });

  test('walks up from a clicked text node ancestor (e.g., span inside p)', () => {
    setBody('<p id="t">Hello <span id="inner">world</span> goodbye.</p>');
    const p = document.getElementById('t');
    const inner = document.getElementById('inner');
    const result = resolveReadingTarget(inner, 'paragraph');
    expect(result.element).toBe(p);
    expect(result.text).toBe('Hello world goodbye.');
  });

  test('treats a div with direct text as a leaf when no descendant paragraphs', () => {
    setBody('<div id="d">Just a div with some text.</div>');
    const d = document.getElementById('d');
    const result = resolveReadingTarget(d, 'paragraph');
    expect(result).not.toBeNull();
    expect(result.element).toBe(d);
    expect(result.text).toBe('Just a div with some text.');
    expect(result.leaves).toEqual([d]);
  });

  test('reads the full container text when div has nested paragraphs (no leaf carving)', () => {
    setBody('<div id="d">Intro text. <p id="p">More text inside paragraph.</p></div>');
    const d = document.getElementById('d');
    const result = resolveReadingTarget(d, 'paragraph');
    // Paragraph mode treats the resolved element as ONE leaf — captures
    // both direct text and nested paragraph text via textContent.
    expect(result.element).toBe(d);
    expect(result.text).toContain('Intro text');
    expect(result.text).toContain('More text inside paragraph');
    expect(result.leaves).toEqual([d]);
  });

  test('returns null when text is shorter than 10 chars', () => {
    setBody('<p>Hi.</p>');
    const p = document.querySelector('p');
    const result = resolveReadingTarget(p, 'paragraph');
    expect(result).toBeNull();
  });

  test('returns null when contenteditable on the resolved leaf', () => {
    setBody('<p id="t" contenteditable="true">Editable paragraph content here.</p>');
    const p = document.getElementById('t');
    const result = resolveReadingTarget(p, 'paragraph');
    expect(result).toBeNull();
  });
});

describe('resolveReadingTarget — section scope', () => {
  test('walks up to article and collects all leaf paragraphs with \\n\\n separators', () => {
    setBody(
      '<article id="a">' +
        '<h2>Title heading text</h2>' +
        '<p>First paragraph here.</p>' +
        '<p>Second paragraph here.</p>' +
      '</article>'
    );
    const inner = document.querySelector('p');
    const result = resolveReadingTarget(inner, 'section');
    expect(result.element).toBe(document.getElementById('a'));
    expect(result.text).toBe(
      'Title heading text\n\nFirst paragraph here.\n\nSecond paragraph here.'
    );
    expect(result.leaves).toHaveLength(3);
  });

  test('falls back to paragraph mode if no section/article ancestor', () => {
    setBody('<p id="t">A standalone paragraph with text.</p>');
    const p = document.getElementById('t');
    const result = resolveReadingTarget(p, 'section');
    expect(result.element).toBe(p);
    expect(result.text).toBe('A standalone paragraph with text.');
  });

  test('leafmost filter drops outer when inner is also a leaf', () => {
    setBody(
      '<article id="a">' +
        '<blockquote><p id="inner">Quoted paragraph text content.</p></blockquote>' +
      '</article>'
    );
    const result = resolveReadingTarget(document.querySelector('article'), 'section');
    // blockquote contains p — only p (leafmost) survives
    expect(result.leaves).toHaveLength(1);
    expect(result.leaves[0]).toBe(document.getElementById('inner'));
  });

  test('drops editable leaves from candidates', () => {
    setBody(
      '<article>' +
        '<p>Normal paragraph text here.</p>' +
        '<p contenteditable="true">Edit this paragraph please.</p>' +
        '<p>Another normal paragraph.</p>' +
      '</article>'
    );
    const result = resolveReadingTarget(document.querySelector('article'), 'section');
    expect(result.leaves).toHaveLength(2);
    expect(result.text).toBe('Normal paragraph text here.\n\nAnother normal paragraph.');
  });
});

describe('resolveReadingTarget — page scope', () => {
  test('skips nav, header, footer, aside, and role-based landmarks', () => {
    setBody(
      '<nav><p>Should not be read nav text.</p></nav>' +
        '<header><p>Should not be read header.</p></header>' +
        '<main>' +
          '<p>Main content paragraph one.</p>' +
          '<p>Main content paragraph two.</p>' +
        '</main>' +
        '<aside><p>Should not be read aside text.</p></aside>' +
        '<footer><p>Should not be read footer.</p></footer>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    expect(result.text).toBe('Main content paragraph one.\n\nMain content paragraph two.');
    expect(result.leaves).toHaveLength(2);
  });

  test('skips elements inside [role="navigation"] and [role="complementary"]', () => {
    setBody(
      '<div role="navigation"><p>Nav role text content here.</p></div>' +
        '<div role="main">' +
          '<p>Main role paragraph one.</p>' +
        '</div>' +
        '<div role="complementary"><p>Complementary text content here.</p></div>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    expect(result.text).toBe('Main role paragraph one.');
  });

  test('skips elements with class .nav, .menu, .sidebar, .footer', () => {
    setBody(
      '<div class="sidebar"><p>Sidebar paragraph text content.</p></div>' +
        '<main>' +
          '<p>Real main content paragraph.</p>' +
        '</main>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    expect(result.text).toBe('Real main content paragraph.');
  });

  test('falls back to body when no <main> element exists', () => {
    setBody(
      '<div><p>First paragraph in plain div.</p></div>' +
        '<div><p>Second paragraph in plain div.</p></div>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    expect(result.leaves.length).toBeGreaterThanOrEqual(2);
    expect(result.text).toContain('First paragraph');
    expect(result.text).toContain('Second paragraph');
  });

  test('skips [aria-hidden="true"] subtrees', () => {
    setBody(
      '<main>' +
        '<p>Visible paragraph one here.</p>' +
        '<div aria-hidden="true"><p>Hidden paragraph here.</p></div>' +
        '<p>Visible paragraph two here.</p>' +
      '</main>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    expect(result.text).toBe('Visible paragraph one here.\n\nVisible paragraph two here.');
  });
});

describe('resolveReadingTarget — invariant: text matches joined leaf textContent', () => {
  test('paragraph scope: text equals leaf textContent.trim()', () => {
    setBody('<p id="t">Hello world goodbye world.</p>');
    const p = document.getElementById('t');
    const result = resolveReadingTarget(p, 'paragraph');
    expect(result.text).toBe(p.textContent.trim());
  });

  test('section scope: text equals leaves.map(textContent.trim).join(\\n\\n)', () => {
    setBody(
      '<article>' +
        '<p>One paragraph here is.</p>' +
        '<p>Two paragraph here is.</p>' +
        '<p>Three paragraph here is.</p>' +
      '</article>'
    );
    const result = resolveReadingTarget(document.querySelector('article'), 'section');
    const expected = result.leaves.map(l => l.textContent.trim()).join('\n\n');
    expect(result.text).toBe(expected);
  });

  test('page scope: text equals leaves joined with \\n\\n', () => {
    setBody(
      '<main>' +
        '<h1>Heading text content here.</h1>' +
        '<p>First paragraph content here.</p>' +
        '<p>Second paragraph content here.</p>' +
      '</main>'
    );
    const result = resolveReadingTarget(document.body, 'page');
    const expected = result.leaves.map(l => l.textContent.trim()).join('\n\n');
    expect(result.text).toBe(expected);
  });
});

describe('resolveSelectionTarget — reading a selection', () => {
  function rangeOver(startNode, startOffset, endNode, endOffset) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  test('a triple-click (range ends at offset 0 of the next block) reads only that paragraph', () => {
    setBody(
      '<section id="s">' +
        '<p id="a">First paragraph the student wants read.</p>' +
        '<div id="glance"><h3>At a glance</h3><p>Box text that must stay silent.</p></div>' +
      '</section>'
    );
    const a = document.getElementById('a');
    const glance = document.getElementById('glance');
    const result = resolveSelectionTarget(rangeOver(a.firstChild, 0, glance, 0));
    expect(result.text).toBe('First paragraph the student wants read.');
    expect(result.element).toBe(a);
    expect(result.leaves).toHaveLength(1);
    expect(result.leaves[0].element).toBe(a);
  });

  test('a drag across part of a sentence reads exactly the selected words', () => {
    setBody('<p id="a">The quick brown fox jumps over the lazy dog.</p>');
    const text = document.getElementById('a').firstChild;
    const result = resolveSelectionTarget(rangeOver(text, 4, text, 19));
    expect(result.text).toBe('quick brown fox');
    expect(result.element).toBe(document.getElementById('a'));
    expect(result.leaves.map(leafText)).toEqual(['quick brown fox']);
  });

  test('a selection crossing inline markup keeps the words in between', () => {
    setBody('<p id="a">Start <strong id="b">bold words</strong> and the end.</p>');
    const p = document.getElementById('a');
    const result = resolveSelectionTarget(rangeOver(p.firstChild, 2, p.lastChild, 8));
    expect(result.text).toBe('art bold words and the');
    expect(result.element).toBe(p);
  });

  test('a selection across two paragraphs reads both, in order, one leaf each', () => {
    setBody(
      '<article id="art">' +
        '<p id="a">Alpha paragraph text here.</p>' +
        '<p id="b">Beta paragraph text here.</p>' +
        '<p id="c">Gamma paragraph is not selected.</p>' +
      '</article>'
    );
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const result = resolveSelectionTarget(rangeOver(a.firstChild, 6, b.firstChild, 14));
    expect(result.text).toBe('paragraph text here.\n\nBeta paragraph');
    expect(result.leaves.map(l => l.element)).toEqual([a, b]);
    expect(result.element).toBe(document.getElementById('art'));
    expect(result.text).toBe(result.leaves.map(leafText).join('\n\n'));
  });

  test('indentation between paragraphs does not merge them into their container', () => {
    setBody(
      '<article id="art">\n  <p id="a">Alpha paragraph text here.</p>\n' +
        '  <p id="b">Beta paragraph text here.</p>\n</article>'
    );
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const result = resolveSelectionTarget(rangeOver(a.firstChild, 0, b.firstChild, 4));
    expect(result.leaves.map(l => l.element)).toEqual([a, b]);
    expect(result.text).toBe('Alpha paragraph text here.\n\nBeta');
  });

  test('leaf offsets index the element textContent so they survive word wrapping', () => {
    setBody('<p id="a">  Leading space then words.</p>');
    const text = document.getElementById('a').firstChild;
    const result = resolveSelectionTarget(rangeOver(text, 2, text, 15));
    const leaf = result.leaves[0];
    expect(leaf.element.textContent.slice(leaf.start, leaf.end)).toBe('Leading space');
  });

  test('a whole element is its own leaf with its trimmed text', () => {
    setBody('<p id="a">  Whole paragraph.  </p>');
    expect(leafText(document.getElementById('a'))).toBe('Whole paragraph.');
  });

  test('returns null for a collapsed range', () => {
    setBody('<p id="a">Some text here.</p>');
    const text = document.getElementById('a').firstChild;
    expect(resolveSelectionTarget(rangeOver(text, 3, text, 3))).toBeNull();
  });

  test('an editable region is read without word leaves, so the editor is never rewrapped', () => {
    setBody('<div contenteditable="true"><p id="a">Draft the student is writing.</p></div>');
    const p = document.getElementById('a');
    const result = resolveSelectionTarget(rangeOver(p.firstChild, 0, p.firstChild, 9));
    expect(result.text).toBe('Draft the');
    expect(result.element).toBe(p);
    expect(result.leaves).toBeNull();
  });
});
