/**
 * A panel fixed to a side of the page must fit a 320px screen (WCAG 2.2 SC 1.4.10).
 *
 * For a fixed box, 100vw includes the page's vertical scrollbar, while right: 20px is measured from
 * inside it. The citation analyser capped itself at calc(100vw - 32px) and still started 3px off the
 * left edge of a 320px screen in Chrome; its padding, outside a content-box cap, made it worse.
 * 100% of a fixed box is the viewport without the scrollbar, and border-box keeps padding and border
 * inside the cap.
 *
 * The cap is caught however it is written: `calc(100vw - 32px)` on its own, or wrapped as
 * `min(18rem, calc(100vw - 32px))`, on `width` or `max-width`. A full-bleed `width: 100vw` with no
 * arithmetic is not a cap on a panel and is not matched.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../../src');

/**
 * Declarations allowed to keep a 100vw cap, each with the reason it is not a side panel's width.
 * Matched by file and by the declaration's text, so a new cap in the same file is still caught.
 */
const EXCEPTIONS = [
  {
    // The chip row is a flex item inside the dock, not a fixed box: the dock's own cap (100% of the
    // viewport) bounds it, and the row shrinks inside the dock rather than past it.
    file: 'features/companion/chip-dock.js',
    declaration: 'max-width: calc(100vw - ${EDGE_INSET * 2 + 56}px)',
  },
];

/** A width or max-width declaration whose value does arithmetic on 100vw. */
const VIEWPORT_CAP = /(?<![-\w])(?:max-)?width\s*:\s*[^;\n]*calc\([^;\n]*100vw[^;\n]*/g;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.(js|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function viewportCaps(source) {
  return (source.match(VIEWPORT_CAP) || []).map(match => match.trim());
}

test('no side-anchored panel caps its width with 100vw, however the cap is wrapped', () => {
  const offenders = sourceFiles(ROOT).flatMap(file => {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    return viewportCaps(fs.readFileSync(file, 'utf8'))
      .filter(
        found =>
          !EXCEPTIONS.some(({ file: f, declaration }) => f === rel && found.startsWith(declaration))
      )
      .map(found => `${rel}: ${found}`);
  });
  expect(offenders).toEqual([]);
});

test('the gate sees a cap wrapped in min(), and leaves full-bleed and min-width alone', () => {
  expect(viewportCaps('max-width: calc(100vw - 32px);')).toHaveLength(1);
  expect(viewportCaps('  max-width: min(18rem, calc(100vw - 32px));')).toHaveLength(1);
  expect(viewportCaps('width: min(360px, calc(100vw - ${EDGE_INSET * 2}px));')).toHaveLength(1);
  expect(viewportCaps('width: 100vw;')).toHaveLength(0);
  expect(viewportCaps('min-width: calc(100vw - 32px);')).toHaveLength(0);
  expect(viewportCaps('max-width: min(18rem, calc(100% - 32px));')).toHaveLength(0);
});

test('every exception still names a declaration that exists', () => {
  for (const { file, declaration } of EXCEPTIONS) {
    const found = viewportCaps(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    expect(found.some(cap => cap.startsWith(declaration))).toBe(true);
  }
});
