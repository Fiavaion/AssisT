/**
 * Unit tests for the DOM wiring of the number-formatter accommodation.
 */

import {
  DEFAULT_MIN_DIGITS,
  findNumberNodes,
  wrapNumber,
  applyNumberFormatting,
  removeNumberFormatting,
} from '../../../src/features/maths/math-format-dom.js';

function frag(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('DEFAULT_MIN_DIGITS', () => {
  it('defaults to 5 (so 4-digit years/PINs are left alone)', () => {
    expect(DEFAULT_MIN_DIGITS).toBe(5);
  });
});

describe('findNumberNodes', () => {
  it('finds a plain 5-digit token', () => {
    const root = frag('<p>There are 30000 students.</p>');
    const matches = findNumberNodes(root);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('30000');
  });

  it('finds a comma-grouped token', () => {
    const root = frag('<p>Population: 1,234,567 people.</p>');
    const matches = findNumberNodes(root);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('1,234,567');
  });

  it('finds a space-grouped token (regular and thin space)', () => {
    const root1 = frag('<p>30 000 kg</p>');
    expect(findNumberNodes(root1)).toHaveLength(1);

    const root2 = frag('<p>30 000 kg</p>'); // thin space U+2009
    expect(findNumberNodes(root2)).toHaveLength(1);
  });

  it('does NOT match a 4-digit year by default (minDigits=5)', () => {
    const root = frag('<p>Copyright 2026 AssisT.</p>');
    expect(findNumberNodes(root)).toHaveLength(0);
  });

  it('does NOT match a 4-digit grouped number ("1,234") by default', () => {
    const root = frag('<p>Total: 1,234 items.</p>');
    expect(findNumberNodes(root)).toHaveLength(0);
  });

  it('matches a 4-digit number when minDigits is opted down to 4', () => {
    const root = frag('<p>Copyright 2026 AssisT.</p>');
    const matches = findNumberNodes(root, { minDigits: 4 });
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('2026');
  });

  it('does not count decimal digits toward minDigits (pi is not wrapped)', () => {
    const root = frag('<p>Pi is about 3.14159265358979 in this course.</p>');
    expect(findNumberNodes(root)).toHaveLength(0);
  });

  it('finds multiple tokens in the same text node, in document order', () => {
    const root = frag('<p>From 10000 to 20000 in one step.</p>');
    const matches = findNumberNodes(root);
    expect(matches.map(m => m.text)).toEqual(['10000', '20000']);
  });

  it('finds tokens across multiple elements', () => {
    const root = frag('<p>First 10000</p><p>Second 20000</p>');
    const matches = findNumberNodes(root);
    expect(matches.map(m => m.text)).toEqual(['10000', '20000']);
  });

  it('skips script, style, input and textarea content', () => {
    const root = frag(
      '<script>var big = 123456;</script>' +
        '<style>.x::after{content:"123456"}</style>' +
        '<input value="123456">' +
        '<textarea>123456</textarea>' +
        '<p>real 123456</p>'
    );
    const matches = findNumberNodes(root);
    expect(matches).toHaveLength(1);
  });

  it('skips contenteditable regions', () => {
    const root = frag('<div contenteditable="true">123456</div><p>123456</p>');
    const matches = findNumberNodes(root);
    expect(matches).toHaveLength(1);
  });

  it('treats contenteditable="false" as NOT excluded', () => {
    const root = frag('<div contenteditable="false">123456</div>');
    expect(findNumberNodes(root)).toHaveLength(1);
  });

  it('skips text already inside AssisT UI (any assist-* class)', () => {
    const root = frag('<div class="assist-toolbar">123456</div><p>123456</p>');
    const matches = findNumberNodes(root);
    expect(matches).toHaveLength(1);
  });

  it('is empty for a null root and does not throw', () => {
    expect(findNumberNodes(null)).toEqual([]);
  });

  it('is empty for a root with no qualifying numbers', () => {
    const root = frag('<p>No big numbers here, just 42.</p>');
    expect(findNumberNodes(root)).toEqual([]);
  });
});

describe('wrapNumber', () => {
  function firstMatch(html) {
    const root = frag(html);
    return { root, match: findNumberNodes(root)[0] };
  }

  it('replaces the matched text with an accessible span', () => {
    const { root, match } = firstMatch('<p>Total: 30000 students</p>');
    const span = wrapNumber(match);
    expect(span).not.toBeNull();
    expect(span.tagName).toBe('SPAN');
    expect(span.className).toBe('assist-mathfmt');
    expect(span.getAttribute('role')).toBe('text');
    expect(root.querySelector('p').textContent).toBe('Total: 30,000 students');
  });

  it('sets an aria-label with the words form', () => {
    const { match } = firstMatch('<p>30000</p>');
    const span = wrapNumber(match);
    expect(span.getAttribute('aria-label')).toBe('thirty thousand');
  });

  it('stores the original raw text for restoration', () => {
    const { match } = firstMatch('<p>30 000</p>');
    const span = wrapNumber(match);
    expect(span.getAttribute('data-assist-raw')).toBe('30 000');
  });

  it('keeps the visible text selectable/copyable as the grouped display (default comma)', () => {
    const { match } = firstMatch('<p>1234567</p>');
    const span = wrapNumber(match);
    expect(span.textContent).toBe('1,234,567');
  });

  it('groups with spaces when opts.grouping is "space"', () => {
    const { match } = firstMatch('<p>1234567</p>');
    const span = wrapNumber(match, { grouping: 'space' });
    expect(span.textContent).toBe('1 234 567');
  });

  it('builds per-digit-group child spans (classes only, no inline colour) when placeValue is set', () => {
    const { match } = firstMatch('<p>1234567</p>');
    const span = wrapNumber(match, { placeValue: true });
    const groups = span.querySelectorAll('span');
    expect(groups).toHaveLength(3);
    // group 0 = rightmost (ones/hundreds/tens) group, increasing left-to-right index from the right
    expect(groups[2].className).toBe('assist-mathfmt-group-0');
    expect(groups[2].textContent).toBe('567');
    expect(groups[1].className).toBe('assist-mathfmt-group-1');
    expect(groups[1].textContent).toBe('234');
    expect(groups[0].className).toBe('assist-mathfmt-group-2');
    expect(groups[0].textContent).toBe('1');
    expect(span.textContent).toBe('1,234,567');
    // no inline colour anywhere — styling is CSS-class-only, left to the consumer stylesheet
    expect(span.querySelector('[style]')).toBeNull();
  });

  it('handles a negative number in place-value mode', () => {
    const { match } = firstMatch('<p>-123456</p>');
    const span = wrapNumber(match, { placeValue: true });
    expect(span.textContent).toBe('-123,456');
  });

  it('handles a decimal number in place-value mode (fraction left unwrapped, appended as-is)', () => {
    const { match } = firstMatch('<p>123456.75</p>');
    const span = wrapNumber(match, { placeValue: true });
    expect(span.textContent).toBe('123,456.75');
  });

  it('returns null and does not throw for a match with a detached node', () => {
    const detached = document.createTextNode('30000');
    expect(wrapNumber({ node: detached, start: 0, end: 5, text: '30000' })).toBeNull();
    expect(wrapNumber(null)).toBeNull();
    expect(wrapNumber(undefined)).toBeNull();
  });
});

describe('applyNumberFormatting / removeNumberFormatting', () => {
  it('wraps every qualifying number under root', () => {
    const root = frag('<p>From 10000 to 20000, and 2026 stays untouched.</p>');
    const spans = applyNumberFormatting(root);
    expect(spans).toHaveLength(2);
    expect(root.querySelectorAll('.assist-mathfmt')).toHaveLength(2);
    expect(root.textContent).toContain('2026');
  });

  it('correctly wraps multiple numbers in the SAME text node without corrupting either one', () => {
    const root = frag('<p>From 10000 to 20000 in one step.</p>');
    applyNumberFormatting(root);
    const spans = root.querySelectorAll('.assist-mathfmt');
    expect(spans).toHaveLength(2);
    expect(spans[0].getAttribute('data-assist-raw')).toBe('10000');
    expect(spans[1].getAttribute('data-assist-raw')).toBe('20000');
    expect(root.querySelector('p').textContent).toBe('From 10,000 to 20,000 in one step.');
  });

  it('is idempotent — calling it twice does not double-wrap', () => {
    const root = frag('<p>Total: 30000 students</p>');
    applyNumberFormatting(root);
    applyNumberFormatting(root);
    expect(root.querySelectorAll('.assist-mathfmt')).toHaveLength(1);
  });

  it('respects opts (minDigits, grouping, placeValue) end to end', () => {
    const root = frag('<p>Year 2026, count 1234567</p>');
    const spans = applyNumberFormatting(root, { minDigits: 4, grouping: 'space', placeValue: true });
    expect(spans).toHaveLength(2);
    expect(root.querySelectorAll('.assist-mathfmt-group-0').length).toBeGreaterThan(0);
    expect(root.textContent).toContain('1 234 567');
  });

  it('fully restores the original text', () => {
    const root = frag('<p>From 10000 to 20000 in one step.</p>');
    const original = root.querySelector('p').textContent;
    applyNumberFormatting(root);
    removeNumberFormatting(root);
    expect(root.querySelectorAll('.assist-mathfmt')).toHaveLength(0);
    expect(root.querySelector('p').textContent).toBe(original);
  });

  it('restore-then-apply again works (round trip is repeatable)', () => {
    const root = frag('<p>Total: 30000 students</p>');
    applyNumberFormatting(root);
    removeNumberFormatting(root);
    const spans = applyNumberFormatting(root);
    expect(spans).toHaveLength(1);
    expect(root.querySelectorAll('.assist-mathfmt')).toHaveLength(1);
  });

  it('applyNumberFormatting never throws on a null root', () => {
    expect(applyNumberFormatting(null)).toEqual([]);
  });

  it('removeNumberFormatting never throws on a null root or a root with nothing to restore', () => {
    expect(() => removeNumberFormatting(null)).not.toThrow();
    const root = frag('<p>nothing to restore here</p>');
    expect(() => removeNumberFormatting(root)).not.toThrow();
  });

  it('removeNumberFormatting falls back to the span textContent if data-assist-raw is missing', () => {
    const root = frag('<p>before</p>');
    const span = document.createElement('span');
    span.className = 'assist-mathfmt';
    span.textContent = 'fallback-text';
    root.querySelector('p').appendChild(span);
    removeNumberFormatting(root);
    expect(root.querySelector('.assist-mathfmt')).toBeNull();
    expect(root.querySelector('p').textContent).toBe('beforefallback-text');
  });
});
