/**
 * Unit tests for the Range → highlight-span wrapper shared by both annotation paths.
 */

import {
  wrapRangeInHighlights,
  labelHighlightGroup,
  unwrapHighlights,
  applyAnnotationColor,
} from '../../../src/features/annotations/annotation-range.js';
import {
  ANNOTATION_COLORS,
  ANNOTATION_COLORS_DARK,
} from '../../../src/features/annotations/annotation-colors.js';

function rangeOver(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

describe('wrapRangeInHighlights', () => {
  test('wraps a partial run inside one text node, splitting at both ends', () => {
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 4, text, 9), { comment: 'note' });

    expect(spans).toHaveLength(1);
    expect(spans[0].textContent).toBe('quick');
    expect(document.getElementById('p').textContent).toBe('The quick brown fox.');
  });

  test('a multi-block range produces one span per block, never a span holding elements', () => {
    document.body.innerHTML = '<div id="c"><p id="a">First para.</p><p id="b">Second para.</p></div>';
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 6, b, 6), { comment: 'note' });

    expect(spans).toHaveLength(2);
    expect(spans.map(s => s.textContent)).toEqual(['para.', 'Second']);
    spans.forEach(span => expect(span.children).toHaveLength(0));
    expect(document.getElementById('a').firstElementChild).toBe(spans[0]);
    expect(document.getElementById('b').firstElementChild).toBe(spans[1]);
  });

  test('keeps document order across three blocks, including whole middle runs', () => {
    document.body.innerHTML =
      '<div id="c"><p id="a">alpha</p><p id="b">bravo</p><p id="d">charlie</p></div>';
    const a = document.getElementById('a').firstChild;
    const d = document.getElementById('d').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 2, d, 4), {});

    expect(spans.map(s => s.textContent)).toEqual(['pha', 'bravo', 'char']);
  });

  test('paints fill and underline on every span', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 0, b, 5), { color: 'green' });

    spans.forEach(span => {
      expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS.green.fill);
      expect(span.style.borderBottom).toContain(ANNOTATION_COLORS.green.border);
      expect(span.getAttribute('role')).toBe('mark');
    });
  });

  test('stamps the annotation id on every span when one is known', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 0, b, 5), { annotationId: 12 });

    spans.forEach(span => expect(span.dataset.annotationId).toBe('12'));
  });

  test('never wraps script, style or noscript text', () => {
    document.body.innerHTML =
      '<div id="c"><p id="a">alpha</p><script>var x = 1;</script><style>p{color:red}</style><p id="b">bravo</p></div>';
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 0, b, 5), {});

    expect(spans.map(s => s.textContent)).toEqual(['alpha', 'bravo']);
    expect(document.querySelector('script').children).toHaveLength(0);
    expect(document.querySelector('style').children).toHaveLength(0);
  });

  test('never nests one annotation inside another', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const first = wrapRangeInHighlights(
      rangeOver(
        document.getElementById('a').firstChild,
        0,
        document.getElementById('a').firstChild,
        5
      ),
      {}
    );
    expect(first).toHaveLength(1);

    const second = wrapRangeInHighlights(
      rangeOver(
        document.getElementById('c'),
        0,
        document.getElementById('b').firstChild,
        5
      ),
      {}
    );

    expect(second.map(s => s.textContent)).toEqual(['bravo']);
    expect(first[0].querySelector('.assist-inline-annotation')).toBeNull();
  });

  test('skips whitespace-only runs between blocks', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p>\n   \n<p id="b">bravo</p></div>';
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(a, 0, b, 5), {});

    expect(spans).toHaveLength(2);
    expect(spans.map(s => s.textContent)).toEqual(['alpha', 'bravo']);
  });

  test('resolves element-container boundaries to text nodes', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const container = document.getElementById('c');

    const spans = wrapRangeInHighlights(rangeOver(container, 0, container, 2), {});

    expect(spans.map(s => s.textContent)).toEqual(['alpha', 'bravo']);
  });

  test('returns nothing for a collapsed or missing range', () => {
    document.body.innerHTML = '<p id="p">alpha</p>';
    const text = document.getElementById('p').firstChild;

    expect(wrapRangeInHighlights(rangeOver(text, 2, text, 2), {})).toEqual([]);
    expect(wrapRangeInHighlights(null, {})).toEqual([]);
    expect(document.querySelectorAll('.assist-inline-annotation')).toHaveLength(0);
  });
});

describe('labelHighlightGroup', () => {
  test('names and tab-stops only the first span, so one annotation reads as one thing', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const spans = wrapRangeInHighlights(
      rangeOver(document.getElementById('a').firstChild, 0, document.getElementById('b').firstChild, 5),
      { comment: 'Look here' }
    );

    expect(spans[0].getAttribute('aria-label')).toBe('Annotation: Look here');
    expect(spans[0].getAttribute('tabindex')).toBe('0');
    expect(spans[1].hasAttribute('aria-label')).toBe(false);
    expect(spans[1].getAttribute('tabindex')).toBe('-1');
    // The continuation text must still be readable — never hidden from the accessibility tree.
    expect(spans[1].hasAttribute('aria-hidden')).toBe(false);
  });

  test('falls back to a plain name when there is no comment', () => {
    document.body.innerHTML = '<p id="p">alpha</p>';
    const spans = wrapRangeInHighlights(
      rangeOver(document.getElementById('p').firstChild, 0, document.getElementById('p').firstChild, 5),
      {}
    );

    expect(spans[0].getAttribute('aria-label')).toBe('Annotation: No comment');
  });

  test('re-labels an existing group after an edit', () => {
    document.body.innerHTML = '<div id="c"><p id="a">alpha</p><p id="b">bravo</p></div>';
    const spans = wrapRangeInHighlights(
      rangeOver(document.getElementById('a').firstChild, 0, document.getElementById('b').firstChild, 5),
      { comment: 'First' }
    );

    labelHighlightGroup(spans, 'Revised');

    expect(spans[0].getAttribute('aria-label')).toBe('Annotation: Revised');
    expect(spans[1].hasAttribute('aria-label')).toBe(false);
  });
});

describe('unwrapHighlights', () => {
  test('restores the page text exactly, with no fragmentation left behind', () => {
    document.body.innerHTML = '<p id="p">The quick brown fox.</p>';
    const text = document.getElementById('p').firstChild;
    const spans = wrapRangeInHighlights(rangeOver(text, 4, text, 9), {});

    unwrapHighlights(spans);

    const paragraph = document.getElementById('p');
    expect(paragraph.textContent).toBe('The quick brown fox.');
    expect(paragraph.querySelector('.assist-inline-annotation')).toBeNull();
    expect(paragraph.childNodes).toHaveLength(1);
  });

  test('unwraps every span of a multi-block annotation', () => {
    document.body.innerHTML = '<div id="c"><p id="a">First para.</p><p id="b">Second para.</p></div>';
    const spans = wrapRangeInHighlights(
      rangeOver(document.getElementById('a').firstChild, 6, document.getElementById('b').firstChild, 6),
      {}
    );

    unwrapHighlights(spans);

    expect(document.querySelectorAll('.assist-inline-annotation')).toHaveLength(0);
    expect(document.getElementById('a').textContent).toBe('First para.');
    expect(document.getElementById('b').textContent).toBe('Second para.');
    expect(document.getElementById('a').childNodes).toHaveLength(1);
  });

  test('tolerates a detached or empty list', () => {
    expect(() => unwrapHighlights([])).not.toThrow();
    expect(() => unwrapHighlights(undefined)).not.toThrow();
    expect(() => unwrapHighlights([document.createElement('span')])).not.toThrow();
  });
});

describe('painting against the surface the span actually sits on', () => {
  test('a dark ancestor background switches the span to the dark palette', () => {
    document.body.innerHTML =
      '<div style="background-color:#121212"><p id="p" style="color:#e5e7eb">alpha bravo</p></div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'green' });

    expect(spans[0].style.backgroundColor).toBe(ANNOTATION_COLORS_DARK.green.fill);
    expect(spans[0].style.borderBottom).toContain(ANNOTATION_COLORS_DARK.green.border);
  });

  test('the nearest background wins, so a light panel on a dark page stays light', () => {
    document.body.innerHTML =
      '<div style="background-color:#121212">' +
      '<div style="background-color:#ffffff"><p id="p" style="color:#1f2937">alpha bravo</p></div>' +
      '</div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'green' });

    expect(spans[0].style.backgroundColor).toBe(ANNOTATION_COLORS.green.fill);
  });

  test('a background image cannot be sampled, so the page text colour decides', () => {
    document.body.innerHTML =
      '<div style="background-image:url(hero.png)"><p id="p" style="color:#e5e7eb">alpha bravo</p></div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'blue' });

    expect(spans[0].style.backgroundColor).toBe(ANNOTATION_COLORS_DARK.blue.fill);
  });

  test('a translucent layer is composited over what sits beneath it', () => {
    document.body.innerHTML =
      '<div style="background-color:#ffffff">' +
      '<div style="background-color:rgba(0, 0, 0, 0.9)"><p id="p" style="color:#e5e7eb">alpha bravo</p></div>' +
      '</div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'pink' });

    expect(spans[0].style.backgroundColor).toBe(ANNOTATION_COLORS_DARK.pink.fill);
  });

  test('every span of a multi-block annotation is painted for its own ground', () => {
    document.body.innerHTML =
      '<div style="background-color:#121212">' +
      '<p id="a" style="color:#e5e7eb">First para.</p><p id="b" style="color:#e5e7eb">Second para.</p>' +
      '</div>';
    const spans = wrapRangeInHighlights(
      rangeOver(
        document.getElementById('a').firstChild,
        0,
        document.getElementById('b').firstChild,
        6
      ),
      { color: 'purple' }
    );

    expect(spans).toHaveLength(2);
    spans.forEach(span => {
      expect(span.style.backgroundColor).toBe(ANNOTATION_COLORS_DARK.purple.fill);
      expect(span.style.borderBottom).toContain(ANNOTATION_COLORS_DARK.purple.border);
    });
  });

  test('leaves the page’s own text colour alone when it is already readable', () => {
    document.body.innerHTML =
      '<div style="background-color:#121212"><p id="p" style="color:#e5e7eb">alpha bravo</p></div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'yellow' });

    expect(spans[0].style.color).toBe('');
  });

  test('forces a readable text colour only when the page’s own would fail', () => {
    document.body.innerHTML =
      '<div style="background-color:#ffffff"><p id="p" style="color:#bebebe">alpha bravo</p></div>';
    const text = document.getElementById('p').firstChild;

    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'yellow' });

    expect(spans[0].style.color).not.toBe('');
  });

  test('re-painting an existing span re-reads the surface rather than its own colour', () => {
    document.body.innerHTML =
      '<div style="background-color:#121212"><p id="p" style="color:#e5e7eb">alpha bravo</p></div>';
    const text = document.getElementById('p').firstChild;
    const spans = wrapRangeInHighlights(rangeOver(text, 0, text, 5), { color: 'yellow' });

    applyAnnotationColor(spans[0], 'blue');

    expect(spans[0].style.backgroundColor).toBe(ANNOTATION_COLORS_DARK.blue.fill);
  });
});
