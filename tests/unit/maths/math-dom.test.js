/**
 * Unit tests for the pure math-DOM helpers (no SRE).
 */

import {
  hasMath,
  getMathML,
  collectReadableSegments,
} from '../../../src/features/maths/math-dom.js';

function frag(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('hasMath', () => {
  it('detects native MathML', () => {
    expect(hasMath(frag('<p>hi</p><math><mi>x</mi></math>'))).toBe(true);
  });
  it('detects MathJax containers', () => {
    expect(hasMath(frag('<mjx-container><mjx-math></mjx-math></mjx-container>'))).toBe(true);
  });
  it('is false with no math and null-safe', () => {
    expect(hasMath(frag('<p>just text</p>'))).toBe(false);
    expect(hasMath(null)).toBe(false);
  });
});

describe('getMathML', () => {
  it('returns the native <math> markup', () => {
    const el = frag('<math><mi>x</mi></math>').querySelector('math');
    expect(getMathML(el)).toContain('<math');
    expect(getMathML(el)).toContain('<mi>x</mi>');
  });

  it('extracts the assistive MathML from a MathJax container', () => {
    const el = frag(
      '<mjx-container><mjx-math>visual</mjx-math>' +
        '<mjx-assistive-mml><math><msup><mi>x</mi><mn>2</mn></msup></math></mjx-assistive-mml>' +
        '</mjx-container>'
    ).querySelector('mjx-container');
    const mml = getMathML(el);
    expect(mml).toContain('<math');
    expect(mml).toContain('msup');
  });

  it('returns null for a MathJax container with no MathML copy', () => {
    const el = frag('<mjx-container><mjx-math>x</mjx-math></mjx-container>').querySelector(
      'mjx-container'
    );
    expect(getMathML(el)).toBeNull();
  });

  it('returns null for non-math elements and nullish input', () => {
    expect(getMathML(frag('<p>x</p>').querySelector('p'))).toBeNull();
    expect(getMathML(null)).toBeNull();
  });
});

describe('collectReadableSegments', () => {
  it('interleaves text and math in document order', () => {
    const root = frag(
      '<p>The area is</p><math><msup><mi>r</mi><mn>2</mn></msup></math><p>square units</p>'
    );
    const segs = collectReadableSegments(root);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ text: 'The area is' });
    expect(segs[1].math).toContain('msup');
    expect(segs[2]).toEqual({ text: 'square units' });
  });

  it('does not emit the text inside a math node separately', () => {
    const root = frag('<math><mi>x</mi><mo>+</mo><mn>1</mn></math>');
    const segs = collectReadableSegments(root);
    expect(segs).toHaveLength(1);
    expect(segs[0].math).toContain('<math');
    expect(segs.some(s => s.text === 'x')).toBe(false);
  });

  it('skips script, style and hidden subtrees', () => {
    const root = frag(
      '<script>var a=1;</script><style>.x{}</style>' +
        '<span aria-hidden="true">decor</span><span hidden>gone</span>' +
        '<p>real text</p>'
    );
    const segs = collectReadableSegments(root);
    expect(segs).toEqual([{ text: 'real text' }]);
  });

  it('is empty for a null root', () => {
    expect(collectReadableSegments(null)).toEqual([]);
  });
});
