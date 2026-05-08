/**
 * Tests for src/core/dom/scope-resolver.js
 *
 * Verifies that resolveReadingTarget(clickedEl, scope) returns the right
 * { element, text, leaves } shape for paragraph / section / page scopes,
 * with correct handling of nested leaves, editable subtrees, and
 * navigation/sidebar exclusion in page mode.
 */

import { resolveReadingTarget } from '../../src/core/dom/scope-resolver.js';

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
