/**
 * The shape a highlight takes on its way into a map.
 *
 * A selection off a web page arrives with the page's line breaks in it. The branch label is one
 * line of text — a newline in it breaks the markdown export, where a bullet is a line — while the
 * quote is the student's own words and keeps its paragraphs.
 */

import { captureFromSelection } from '../../../../src/features/mindMap/capture.js';

describe('captureFromSelection', () => {
  it('folds the label onto one line', () => {
    const { text } = captureFromSelection('Working memory\n\n  is  limited\tin span');

    expect(text).toBe('Working memory is limited in span');
  });

  it('cuts the label at 200 characters, after folding', () => {
    const { text } = captureFromSelection('word\n'.repeat(100));

    expect(text).toHaveLength(200);
    expect(text).not.toMatch(/\s\s|\n/);
  });

  it('keeps the quote readable, with its paragraph breaks', () => {
    const { quote } = captureFromSelection('First paragraph.\n\nSecond paragraph.');

    expect(quote).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('closes up the empty space a page leaves between paragraphs', () => {
    const { quote } = captureFromSelection('First.\n \n\n  \nSecond.');

    expect(quote).toBe('First.\n\nSecond.');
  });

  it('cuts the quote at 1000 characters', () => {
    expect(captureFromSelection('a'.repeat(1500)).quote).toHaveLength(1000);
  });

  it('answers with empty strings for an empty selection', () => {
    expect(captureFromSelection('   \n  ')).toEqual({ text: '', quote: '' });
  });
});
