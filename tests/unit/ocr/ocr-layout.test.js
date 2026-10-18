/**
 * Tests for the OCR layout reconstruction (Phase 5, B1).
 *
 * Pure, geometry-driven: turns a normalized line model (text + bbox per line) into structured
 * Markdown — paragraphs from vertical gaps, headings from relative line height, reading order with
 * basic column detection. No Tesseract, no DOM, no network.
 */

import {
  reconstructLayout,
  linesFromTesseract,
} from '../../../src/features/ocr/ocr-layout.js';

/** Build a normalized line. bbox is {x0,y0,x1,y1}. */
const line = (text, x0, y0, x1, y1, extra = {}) => ({
  text,
  bbox: { x0, y0, x1, y1 },
  ...extra,
});

describe('reconstructLayout', () => {
  it('returns empty output for no usable lines', () => {
    expect(reconstructLayout({ lines: [] })).toEqual({ markdown: '', blocks: [] });
    expect(reconstructLayout({})).toEqual({ markdown: '', blocks: [] });
    expect(reconstructLayout({ lines: [line('   ', 0, 0, 10, 20)] })).toEqual({
      markdown: '',
      blocks: [],
    });
  });

  it('joins closely-spaced lines into a single paragraph', () => {
    const result = reconstructLayout({
      lines: [
        line('Hello', 0, 0, 100, 20),
        line('world this', 0, 24, 100, 44),
        line('continues.', 0, 48, 80, 68),
      ],
    });
    expect(result.blocks).toEqual([
      { type: 'paragraph', text: 'Hello world this continues.' },
    ]);
    expect(result.markdown).toBe('Hello world this continues.');
  });

  it('splits paragraphs on a large vertical gap', () => {
    const result = reconstructLayout({
      lines: [
        line('First para', 0, 0, 100, 20),
        line('still first', 0, 24, 100, 44),
        line('Second para', 0, 100, 100, 120), // gap 56 > 1.5 * 20
      ],
    });
    expect(result.blocks).toEqual([
      { type: 'paragraph', text: 'First para still first' },
      { type: 'paragraph', text: 'Second para' },
    ]);
    expect(result.markdown).toBe('First para still first\n\nSecond para');
  });

  it('detects a level-1 heading from a much taller line', () => {
    const result = reconstructLayout({
      lines: [
        line('Document Title', 0, 0, 200, 40), // height 40 >= 1.8 * body(20)
        line('Body text here', 0, 50, 200, 70),
        line('more body', 0, 74, 200, 94),
      ],
    });
    expect(result.blocks[0]).toEqual({ type: 'heading', level: 1, text: 'Document Title' });
    expect(result.blocks[1]).toEqual({ type: 'paragraph', text: 'Body text here more body' });
    expect(result.markdown).toBe('# Document Title\n\nBody text here more body');
  });

  it('detects a level-2 heading from a moderately taller line', () => {
    const result = reconstructLayout({
      lines: [
        line('Subsection', 0, 0, 200, 28), // 28 >= 1.35*20 and < 1.8*20
        line('Body text here', 0, 40, 200, 60),
        line('more body', 0, 64, 200, 84),
      ],
    });
    expect(result.blocks[0]).toEqual({ type: 'heading', level: 2, text: 'Subsection' });
    expect(result.markdown.startsWith('## Subsection\n\n')).toBe(true);
  });

  it('orders two columns left-to-right, each top-to-bottom', () => {
    const result = reconstructLayout({
      lines: [
        line('Left one', 0, 0, 90, 20),
        line('left two', 0, 24, 90, 44),
        line('Right one', 140, 0, 230, 20),
        line('right two', 140, 24, 230, 44),
      ],
    });
    expect(result.blocks).toEqual([
      { type: 'paragraph', text: 'Left one left two' },
      { type: 'paragraph', text: 'Right one right two' },
    ]);
    expect(result.markdown).toBe('Left one left two\n\nRight one right two');
  });

  it('treats a single column (overlapping x-ranges) as one reading flow', () => {
    const result = reconstructLayout({
      lines: [
        line('A line', 0, 0, 200, 20),
        line('indented line', 20, 24, 180, 44),
        line('short', 0, 48, 60, 68),
      ],
    });
    expect(result.blocks).toEqual([
      { type: 'paragraph', text: 'A line indented line short' },
    ]);
  });

  it('collapses internal whitespace and trims line text', () => {
    const result = reconstructLayout({
      lines: [line('  Hello    world  ', 0, 0, 100, 20)],
    });
    expect(result.blocks).toEqual([{ type: 'paragraph', text: 'Hello world' }]);
  });

  it('falls back to a single joined paragraph when bbox geometry is missing', () => {
    const result = reconstructLayout({
      lines: [{ text: 'one' }, { text: 'two' }, { text: '' }],
    });
    expect(result.blocks).toEqual([{ type: 'paragraph', text: 'one two' }]);
    expect(result.markdown).toBe('one two');
  });
});

describe('linesFromTesseract', () => {
  it('returns [] for missing or geometry-less data', () => {
    expect(linesFromTesseract(null)).toEqual([]);
    expect(linesFromTesseract({})).toEqual([]);
    expect(linesFromTesseract({ text: 'plain', lines: null, blocks: null })).toEqual([]);
  });

  it('reads the flat lines array (v5 with { blocks: true })', () => {
    const data = {
      lines: [
        { text: 'Hello', bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }, confidence: 95 },
        { text: 'world', bbox: { x0: 0, y0: 24, x1: 50, y1: 44 } },
      ],
    };
    expect(linesFromTesseract(data)).toEqual([
      { text: 'Hello', bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
      { text: 'world', bbox: { x0: 0, y0: 24, x1: 50, y1: 44 } },
    ]);
  });

  it('walks the nested blocks tree when no flat lines are present', () => {
    const data = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                { text: 'Nested', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } },
                { text: 'no bbox skipped' }, // no bbox → filtered out
              ],
            },
          ],
        },
      ],
    };
    expect(linesFromTesseract(data)).toEqual([
      { text: 'Nested', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } },
    ]);
  });

  it('feeds reconstructLayout end-to-end', () => {
    const data = {
      lines: [
        { text: 'Title', bbox: { x0: 0, y0: 0, x1: 200, y1: 40 } },
        { text: 'Body', bbox: { x0: 0, y0: 50, x1: 200, y1: 70 } },
        { text: 'text', bbox: { x0: 0, y0: 74, x1: 200, y1: 94 } },
      ],
    };
    const result = reconstructLayout({ lines: linesFromTesseract(data) });
    expect(result.markdown).toBe('# Title\n\nBody text');
  });
});
