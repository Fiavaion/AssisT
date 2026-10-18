/**
 * OCR text chunking for "Read entire page" local-AI cleanup.
 *
 * A full-page capture produces far more text than a small local model can process within Chrome's
 * 30-second message timeout. These pure helpers break the text into model-sized pieces, let the
 * caller size pieces by *measured* latency (the browser can't read VRAM, and the timeout — not
 * context size — is the real limit), and recombine the cleaned pieces into one continuous text.
 *
 * The orchestration loop (in ocr.js) calls the local AI per chunk and adapts the next chunk size
 * from how long the last one took.
 */

const MAX_UNIT_CHARS = 400;

/**
 * Break text into small units (lines; over-long lines further split into sentences) so chunks can be
 * packed to a character budget without splitting mid-sentence.
 * @param {string} text
 * @returns {string[]}
 */
export function splitIntoUnits(text) {
  const source = String(text === null || text === undefined ? '' : text);
  if (!source.trim()) {
    return [];
  }
  const units = [];
  for (const line of source.split('\n')) {
    if (line.length <= MAX_UNIT_CHARS) {
      units.push(line);
    } else {
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        units.push(sentence);
      }
    }
  }
  return units;
}

/**
 * Pack units into one chunk up to `maxChars`, always taking at least one unit.
 * @param {string[]} units
 * @param {number} start - index to start from
 * @param {number} maxChars - character budget for this chunk
 * @returns {{ chunk: string, next: number }}
 */
export function takeChunk(units, start, maxChars) {
  let chunk = '';
  let i = start;
  while (i < units.length) {
    const addition = (chunk ? '\n' : '') + units[i];
    if (chunk && chunk.length + addition.length > maxChars) {
      break;
    }
    chunk += addition;
    i++;
  }
  if (chunk === '' && i < units.length) {
    chunk = units[i]; // single unit larger than the budget — take it anyway
    i++;
  }
  return { chunk, next: i };
}

/**
 * Choose the next chunk size from the last chunk's latency. Grows when the model responded well under
 * target, shrinks when it ran over, holds steady in between — self-tuning to the actual machine.
 * @param {number} elapsedMs - how long the last chunk took
 * @param {number} currentChars - the size used for the last chunk
 * @param {Object} [opts]
 * @param {number} [opts.min=600]
 * @param {number} [opts.max=8000]
 * @param {number} [opts.targetMs=20000]
 * @returns {number}
 */
export function adaptChunkChars(
  elapsedMs,
  currentChars,
  { min = 600, max = 8000, targetMs = 20000 } = {}
) {
  if (!elapsedMs || elapsedMs <= 0) {
    return currentChars;
  }
  if (elapsedMs < targetMs * 0.6) {
    return Math.min(max, Math.round(currentChars * 1.5));
  }
  if (elapsedMs > targetMs) {
    return Math.max(min, Math.round(currentChars * 0.6));
  }
  return currentChars;
}

/**
 * Remove lines that repeat `minRepeats`+ times (keeping the first), to strip page furniture that a
 * stitched full-page capture duplicates (sticky sidebars, repeated table-of-contents). Lines that
 * appear once or twice — e.g. a heading echoed once in a contents list — are left alone.
 * @param {string} text
 * @param {number} [minRepeats=3]
 * @returns {string}
 */
export function dedupeRepeatedLines(text, minRepeats = 3) {
  const lines = String(text === null || text === undefined ? '' : text).split('\n');
  const counts = new Map();
  for (const line of lines) {
    const key = line.trim();
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const emitted = new Set();
  const out = [];
  for (const line of lines) {
    const key = line.trim();
    if (key && (counts.get(key) || 0) >= minRepeats) {
      if (emitted.has(key)) {
        continue;
      }
      emitted.add(key);
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Recombine cleaned chunks into one continuous text: drop empty chunks, join with paragraph breaks,
 * collapse blank runs, and dedupe repeated noise.
 * @param {string[]} chunks
 * @returns {string}
 */
export function combineChunks(chunks) {
  const joined = (Array.isArray(chunks) ? chunks : [])
    .map(c => String(c === null || c === undefined ? '' : c).trim())
    .filter(Boolean)
    .join('\n\n');
  return dedupeRepeatedLines(joined.replace(/\n{3,}/g, '\n\n').trim());
}

// Lines that are AI framing/commentary rather than content. Kept tight to avoid eating real text:
// encyclopedic content is third-person, so first-person "I removed/corrected/hope…" is almost always
// the model talking about its own work.
const META_LINE =
  /^(here['’]?s?\b.*\b(cleaned|corrected|formatted|markdown|text|version)\b.*:?|note\s*[:—-].*|disclaimer\s*[:—-].*|i\s+(have\s+)?(removed|corrected|cleaned|rejoined|kept|left|also|hope|did|made)\b.*|the following\s+(was|were|has been|are|is)\b.*|i made the following\b.*|sure[,!.].*|certainly[,!.].*|of course[,!.].*|here you go[,!.:].*|```.*)$/i;
// Meta lines that introduce a bullet list of "what I removed" — strip the list that follows too.
const META_LIST_INTRO = /^(i\s+(have\s+)?(removed|made)|the following)\b/i;

/**
 * Remove AI commentary the model leaks despite "return only the Markdown" — "Here is the cleaned
 * Markdown:", "Note: I removed…", "I removed the following:" + its bullet list, code fences, etc.
 * Local models ignore the instruction per chunk, so this is enforced deterministically. Tight by
 * design: only clear first-person/framing lines are removed, not genuine content.
 * @param {string} text
 * @returns {string}
 */
export function stripAiCommentary(text) {
  const lines = String(text === null || text === undefined ? '' : text).split('\n');
  const out = [];
  let skippingList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (skippingList) {
      if (trimmed === '' || /^[-*•]\s+/.test(trimmed)) {
        continue; // still inside the "what I removed" list
      }
      skippingList = false;
    }
    if (META_LINE.test(trimmed)) {
      if (META_LIST_INTRO.test(trimmed)) {
        skippingList = true;
      }
      continue;
    }
    out.push(line);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default {
  splitIntoUnits,
  takeChunk,
  adaptChunkChars,
  dedupeRepeatedLines,
  combineChunks,
  stripAiCommentary,
};
