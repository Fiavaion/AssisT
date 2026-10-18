/**
 * highlightWordByWord with selection slices: a leaf can be a slice
 * { element, start, end } of a block's textContent, so a selection is
 * highlighted word by word without timing the words the student did not select.
 */

import { highlightWordByWord, cleanupWordByWord } from '../../src/core/dom/highlighting.js';

const settings = { highlightColor: '#ffff00', highlightOpacity: 0.5 };

function activeWords(root) {
  return Array.from(root.querySelectorAll('.assist-word'))
    .filter(span => span.style.backgroundColor)
    .map(span => span.textContent);
}

afterEach(() => {
  cleanupWordByWord();
  document.body.innerHTML = '';
});

test('the first spoken word of a slice is the first selected word', () => {
  document.body.innerHTML = '<p id="a">Alpha beta gamma delta.</p>';
  const p = document.getElementById('a');
  const utterance = { rate: 1 };
  highlightWordByWord(p, 'beta gamma', utterance, settings, [{ element: p, start: 6, end: 16 }]);
  utterance.onstart();
  expect(activeWords(p)).toEqual(['beta']);
});

test('boundary char indexes are relative to the slice text', () => {
  document.body.innerHTML = '<p id="a">Alpha beta gamma delta.</p>';
  const p = document.getElementById('a');
  const utterance = { rate: 1 };
  highlightWordByWord(p, 'beta gamma', utterance, settings, [{ element: p, start: 6, end: 16 }]);
  utterance.onstart();
  utterance.onboundary({ name: 'word', charIndex: 5 });
  expect(activeWords(p)).toEqual(['gamma']);
});

test('slices in two blocks continue across the \\n\\n separator', () => {
  document.body.innerHTML = '<p id="a">One two three.</p><p id="b">Four five six.</p>';
  const a = document.getElementById('a');
  const b = document.getElementById('b');
  const utterance = { rate: 1 };
  const text = 'three.\n\nFour';
  highlightWordByWord(document.body, text, utterance, settings, [
    { element: a, start: 8, end: 14 },
    { element: b, start: 0, end: 4 },
  ]);
  utterance.onstart();
  expect(activeWords(document.body)).toEqual(['three.']);
  utterance.onboundary({ name: 'word', charIndex: text.indexOf('Four') });
  expect(activeWords(document.body)).toEqual(['Four']);
});

test('cleanup restores the block markup exactly', () => {
  document.body.innerHTML = '<p id="a">Alpha <em>beta</em> gamma.</p>';
  const p = document.getElementById('a');
  const before = p.innerHTML;
  highlightWordByWord(p, 'beta', { rate: 1 }, settings, [{ element: p, start: 6, end: 10 }]);
  cleanupWordByWord();
  expect(p.innerHTML).toBe(before);
});
