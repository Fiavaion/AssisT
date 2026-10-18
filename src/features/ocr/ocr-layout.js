/**
 * OCR layout reconstruction.
 *
 * Turns recognised text geometry into structured, format-preserving Markdown instead of a flat blob.
 * Pure and deterministic: it consumes a normalized line model (text + bbox per line) — decoupled from
 * Tesseract's exact result shape so it is unit-testable — and rebuilds reading order (with basic
 * column detection), paragraphs (from vertical gaps) and headings (from relative line height).
 *
 * Input model:
 *   { lines: [ { text: string, bbox: { x0, y0, x1, y1 } } ] }
 * Output:
 *   { markdown: string, blocks: [ { type: 'paragraph', text } | { type: 'heading', level, text } ] }
 *
 * ocr.js adapts Tesseract's words/lines/paragraphs into this model; richer signals (font weight,
 * tables) can extend the model later without changing this contract.
 */

/** Collapse runs of whitespace and trim. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Median of a numeric array (0 for empty). */
function median(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const lineHeight = line => line.bbox.y1 - line.bbox.y0;
const byTop = (a, b) => a.bbox.y0 - b.bbox.y0;

/**
 * Split lines into reading-order columns. Lines whose horizontal spans are separated by a gutter
 * wider than `columnGutterFrac` of the page width become separate columns (left to right); otherwise
 * everything is one column. Conservative by design — most captures are single-column.
 *
 * @param {Array} lines - lines with bbox (assumed non-empty)
 * @param {Object} [options]
 * @returns {Array<Array>} columns, each an array of lines sorted top-to-bottom
 */
function detectColumns(lines, { columnGutterFrac = 0.1 } = {}) {
  const minX = Math.min(...lines.map(l => l.bbox.x0));
  const maxX = Math.max(...lines.map(l => l.bbox.x1));
  const pageWidth = maxX - minX || 1;

  // Merge overlapping horizontal spans into covered bands.
  const spans = lines.map(l => [l.bbox.x0, l.bbox.x1]).sort((a, b) => a[0] - b[0]);
  const bands = [];
  for (const [start, end] of spans) {
    const last = bands[bands.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      bands.push([start, end]);
    }
  }

  // Bands separated by a sub-threshold gap belong to the same column.
  const minGutter = columnGutterFrac * pageWidth;
  const columns = [];
  for (const [start, end] of bands) {
    const last = columns[columns.length - 1];
    if (last && start - last.end < minGutter) {
      last.end = Math.max(last.end, end);
    } else {
      columns.push({ start, end });
    }
  }

  if (columns.length <= 1) {
    return [[...lines].sort(byTop)];
  }

  const buckets = columns.map(() => []);
  for (const line of lines) {
    const centre = (line.bbox.x0 + line.bbox.x1) / 2;
    let idx = columns.findIndex(c => centre >= c.start && centre <= c.end);
    if (idx === -1) {
      // Line straddles a gutter (e.g. a full-width element): assign to the nearest column centre.
      idx = columns.reduce((best, c, i) => {
        const dist = Math.abs(centre - (c.start + c.end) / 2);
        const bestDist = Math.abs(centre - (columns[best].start + columns[best].end) / 2);
        return dist < bestDist ? i : best;
      }, 0);
    }
    buckets[idx].push(line);
  }
  return buckets.map(bucket => bucket.sort(byTop));
}

/**
 * Group a column's lines (top-to-bottom) into heading and paragraph blocks.
 *
 * @param {Array} lines - one column's lines, sorted top-to-bottom
 * @param {number} bodyHeight - median line height of the whole page (the body-text baseline)
 * @param {Object} [options]
 * @returns {Array} blocks
 */
function groupBlocks(
  lines,
  bodyHeight,
  { paragraphGapFactor = 1.5, headingFactor = 1.35, h1Factor = 1.8 } = {}
) {
  const blocks = [];
  let paragraph = null;
  let prev = null;

  const flush = () => {
    if (paragraph) {
      blocks.push(paragraph);
      paragraph = null;
    }
  };

  for (const line of lines) {
    const text = clean(line.text);
    if (!text) {
      prev = line;
      continue;
    }
    const height = lineHeight(line);
    const isHeading = height >= headingFactor * bodyHeight;
    const gap = prev ? line.bbox.y0 - prev.bbox.y1 : 0;
    const paragraphBreak = prev && gap > paragraphGapFactor * bodyHeight;

    if (isHeading) {
      flush();
      blocks.push({
        type: 'heading',
        level: height >= h1Factor * bodyHeight ? 1 : 2,
        text,
      });
    } else if (!paragraph || paragraphBreak) {
      flush();
      paragraph = { type: 'paragraph', text };
    } else {
      paragraph.text += ` ${text}`;
    }
    prev = line;
  }
  flush();
  return blocks;
}

/** Render structured blocks to Markdown. */
function blocksToMarkdown(blocks) {
  return blocks
    .map(block =>
      block.type === 'heading' ? `${'#'.repeat(block.level)} ${block.text}` : block.text
    )
    .join('\n\n');
}

/**
 * Adapt a Tesseract.js v5 result `data` into the normalized line model `reconstructLayout` consumes.
 * Prefers the flat `data.lines` array (populated when recognize is called with `{ blocks: true }`)
 * and falls back to walking the nested blocks → paragraphs → lines tree. Returns [] when no geometry
 * is present, so reconstruction degrades gracefully to a joined paragraph.
 *
 * @param {Object} data - Tesseract result `data`
 * @returns {Array<{text: string, bbox: {x0:number,y0:number,x1:number,y1:number}}>}
 */
export function linesFromTesseract(data) {
  if (!data) {
    return [];
  }
  let lines = Array.isArray(data.lines) ? data.lines : null;
  if (!lines && Array.isArray(data.blocks)) {
    lines = [];
    for (const block of data.blocks) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          lines.push(line);
        }
      }
    }
  }
  if (!lines) {
    return [];
  }
  return lines
    .filter(line => line && line.bbox && typeof line.text === 'string')
    .map(line => ({
      text: line.text,
      bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
    }));
}

/**
 * Reconstruct format-preserving Markdown from recognised line geometry.
 *
 * @param {Object} ocrData - { lines: [{ text, bbox }] }
 * @param {Object} [options] - tuning factors (see detectColumns / groupBlocks)
 * @returns {{ markdown: string, blocks: Array }}
 */
export function reconstructLayout(ocrData, options = {}) {
  const allLines = (ocrData && Array.isArray(ocrData.lines) ? ocrData.lines : []).filter(
    l => l && typeof l.text === 'string' && l.text.trim() !== ''
  );

  if (allLines.length === 0) {
    return { markdown: '', blocks: [] };
  }

  // Without geometry we cannot reconstruct layout — degrade to a single joined paragraph rather than
  // losing the text.
  const haveGeometry = allLines.every(
    l => l.bbox && [l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1].every(n => typeof n === 'number')
  );
  if (!haveGeometry) {
    const text = allLines.map(l => clean(l.text)).join(' ');
    return { markdown: text, blocks: [{ type: 'paragraph', text }] };
  }

  const bodyHeight = median(allLines.map(lineHeight)) || 1;
  const columns = detectColumns(allLines, options);
  const blocks = [];
  for (const column of columns) {
    blocks.push(...groupBlocks(column, bodyHeight, options));
  }

  return { markdown: blocksToMarkdown(blocks), blocks };
}

export default { reconstructLayout, linesFromTesseract };
