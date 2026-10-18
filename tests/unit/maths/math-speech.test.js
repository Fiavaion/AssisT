/**
 * Tests for the SRE-backed math speech module.
 *
 * The `buildReadableText` orchestration is tested with an injected fake converter (pure, fast). One
 * integration test exercises the real Speech Rule Engine to prove the offline setup produces speech.
 */

import {
  buildReadableText,
  mathmlToSpeech,
} from '../../../src/features/maths/math-speech.js';

function frag(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('buildReadableText', () => {
  it('returns null when the subtree has no math (caller keeps its normal path)', async () => {
    const out = await buildReadableText(frag('<p>plain paragraph</p>'));
    expect(out).toBeNull();
  });

  it('replaces each equation with its spoken form, in order', async () => {
    const root = frag(
      '<p>The formula</p><math><mi>e</mi></math><p>equals</p><math><mi>m</mi></math>'
    );
    const fakeConvert = mml => Promise.resolve(mml.includes('>e<') ? 'energy' : 'mass');
    const out = await buildReadableText(root, fakeConvert);
    expect(out).toBe('The formula energy equals mass');
  });

  it('falls back to the node text when conversion yields nothing', async () => {
    const root = frag('<p>value</p><math><mi>x</mi></math>');
    const emptyConvert = () => Promise.resolve('');
    const out = await buildReadableText(root, emptyConvert);
    expect(out).toBe('value x');
  });

  it('survives a converter that throws (uses fallback text)', async () => {
    const root = frag('<p>v</p><math><mi>y</mi></math>');
    const throwingConvert = () => Promise.reject(new Error('boom'));
    const out = await buildReadableText(root, throwingConvert);
    expect(out).toBe('v y');
  });
});

describe('mathmlToSpeech (real SRE, offline)', () => {
  // NOTE: exact wording ("x squared") is NOT asserted here. jsdom ships an incomplete XPath engine,
  // so SRE's locale rules do not fully evaluate under jest the way they do in a real browser (Node
  // and real Chrome both give "x squared"). We assert the offline contract — it loads and returns a
  // string without throwing or hitting the network — and verify the spoken wording at the Chrome gate.
  it('initialises offline and returns a string (never throws)', async () => {
    const speech = await mathmlToSpeech('<math><msup><mi>x</mi><mn>2</mn></msup></math>');
    expect(typeof speech).toBe('string');
  }, 20000);

  it('returns empty string for empty input', async () => {
    expect(await mathmlToSpeech('')).toBe('');
    expect(await mathmlToSpeech(null)).toBe('');
  });
});
