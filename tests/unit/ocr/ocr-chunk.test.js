/**
 * Tests for OCR text chunking (Phase 5 — "Read entire page" local-AI cleanup).
 *
 * Pure helpers that break large OCR text into model-sized pieces, size the pieces by *measured*
 * latency (the only signal available — VRAM can't be read from the browser, and the 30s message
 * timeout is the real limit), and recombine the cleaned pieces back into one continuous text.
 */

import {
  splitIntoUnits,
  takeChunk,
  adaptChunkChars,
  dedupeRepeatedLines,
  combineChunks,
  stripAiCommentary,
} from '../../../src/features/ocr/ocr-chunk.js';

describe('splitIntoUnits', () => {
  it('splits text into line units', () => {
    expect(splitIntoUnits('one\ntwo\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('breaks an over-long line into sentence units', () => {
    const long = `${'a'.repeat(420)}. ${'b'.repeat(420)}.`;
    const units = splitIntoUnits(long);
    expect(units.length).toBeGreaterThan(1);
    expect(units.every(u => u.length <= 450)).toBe(true);
  });

  it('returns [] for empty input', () => {
    expect(splitIntoUnits('')).toEqual([]);
    expect(splitIntoUnits(null)).toEqual([]);
  });
});

describe('takeChunk', () => {
  const units = ['alpha', 'beta', 'gamma', 'delta'];

  it('packs units up to the char budget and reports the next index', () => {
    // "alpha\nbeta" = 10 chars; "gamma" would push to 16 > 12
    const { chunk, next } = takeChunk(units, 0, 12);
    expect(chunk).toBe('alpha\nbeta');
    expect(next).toBe(2);
  });

  it('always takes at least one unit even if it exceeds the budget', () => {
    const { chunk, next } = takeChunk(['enormoussingleunit'], 0, 5);
    expect(chunk).toBe('enormoussingleunit');
    expect(next).toBe(1);
  });

  it('continues from a start index', () => {
    const { chunk } = takeChunk(units, 2, 100);
    expect(chunk).toBe('gamma\ndelta');
  });
});

describe('adaptChunkChars', () => {
  const opts = { min: 600, max: 8000, targetMs: 20000 };

  it('grows the chunk when the model responded well under target', () => {
    expect(adaptChunkChars(5000, 1200, opts)).toBeGreaterThan(1200);
  });

  it('shrinks the chunk when the model went over target', () => {
    expect(adaptChunkChars(26000, 2000, opts)).toBeLessThan(2000);
  });

  it('holds steady in the comfortable band', () => {
    expect(adaptChunkChars(15000, 1500, opts)).toBe(1500);
  });

  it('respects min and max bounds', () => {
    expect(adaptChunkChars(2000, 7000, opts)).toBeLessThanOrEqual(8000);
    expect(adaptChunkChars(29000, 700, opts)).toBeGreaterThanOrEqual(600);
  });
});

describe('dedupeRepeatedLines', () => {
  it('removes lines that repeat 3+ times, keeping the first', () => {
    const text = 'Contents\nReal sentence one.\nContents\nReal sentence two.\nContents';
    const out = dedupeRepeatedLines(text, 3);
    expect(out.split('\n').filter(l => l === 'Contents')).toHaveLength(1);
    expect(out).toContain('Real sentence one.');
    expect(out).toContain('Real sentence two.');
  });

  it('leaves lines that appear once or twice (e.g. a heading echoed in a TOC)', () => {
    const text = 'Causes\nbody\nCauses';
    expect(dedupeRepeatedLines(text, 3)).toBe(text);
  });
});

describe('combineChunks', () => {
  it('joins cleaned chunks, collapses blank runs, and dedupes repeated noise', () => {
    const out = combineChunks(['Nav\nPart one.', 'Nav\nPart two.', 'Nav\nPart three.']);
    expect(out.split('\n').filter(l => l === 'Nav')).toHaveLength(1);
    expect(out).toContain('Part one.');
    expect(out).toContain('Part three.');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('drops empty chunks', () => {
    expect(combineChunks(['one', '', null, 'two'])).toBe('one\n\ntwo');
  });
});

describe('stripAiCommentary', () => {
  it('removes leading "Here is the cleaned Markdown:" framing', () => {
    expect(stripAiCommentary('Here is the cleaned Markdown:\n\nReal content.')).toBe('Real content.');
  });

  it('removes "Note:" disclaimer lines', () => {
    const text = 'Real content.\nNote: I removed most of the OCR errors, but some may remain.';
    expect(stripAiCommentary(text)).toBe('Real content.');
  });

  it('removes an "I removed the following:" header and the bullet list it introduces', () => {
    const text =
      'Body text.\nI removed the following:\n* Interface text\n* Menus and breadcrumbs\n\nMore body.';
    const out = stripAiCommentary(text);
    expect(out).toContain('Body text.');
    expect(out).toContain('More body.');
    expect(out).not.toContain('Interface text');
    expect(out).not.toContain('I removed the following');
  });

  it('removes first-person meta lines and code fences', () => {
    const text = '```markdown\nReal content.\nI also corrected some OCR errors and rejoined lines.\nI hope this helps!\n```';
    expect(stripAiCommentary(text)).toBe('Real content.');
  });

  it('keeps genuine content, including third-person sentences and real bullet lists', () => {
    const text =
      'This article was submitted to WikiJournal of Medicine.\n\n- First real point\n- Second real point';
    expect(stripAiCommentary(text)).toBe(text);
  });

  it('returns empty when the input is only commentary', () => {
    expect(stripAiCommentary('Here is the cleaned text:\nI hope this helps!')).toBe('');
  });
});
