/**
 * The editor's boundary colours, graded against WCAG 2.2 SC 1.4.11 (non-text contrast).
 *
 * `--mm-line-strong` is not decoration: it is the only edge a button, a select, a text input and
 * the find box have against the pane behind them. If it drops below 3:1 those controls stop having
 * a visible boundary, which is precisely what SC 1.4.11 is about — and the failure is invisible to
 * every other test in this suite, because the markup and the ARIA are perfectly correct either way.
 *
 * The separator between the outline and the canvas is the same argument with a pointer on it: it is
 * a drag handle, so it needs a boundary a student can see before they can grab it.
 *
 * The maths is written out here rather than imported so the palette is graded against the
 * specification and not against the extension's own helper — the same reasoning, and the same
 * implementation, as tests/unit/features/mindMap/core/palette.test.js.
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */

const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
  path.join(__dirname, '../../../../src/pages/mind-map/mindmap.css'),
  'utf8'
);

function channel(value) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const int = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)
  );
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * The custom properties declared in one rule, read out of the stylesheet text.
 *
 * A regex over the source rather than a CSS parser: the two theme blocks are flat lists of
 * `--name: value;` declarations, and a parser would be a second thing to keep correct.
 *
 * @param {string} selector - the rule's selector, exactly as written in the file.
 * @returns {Object<string, string>} declared custom properties, `--` prefix included.
 */
function tokensOf(selector) {
  const at = CSS.indexOf(`${selector} {`);
  if (at === -1) {
    throw new Error(`mindmap.css has no rule for ${selector}`);
  }
  const body = CSS.slice(at + selector.length + 2, CSS.indexOf('}', at));
  const tokens = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const THEMES = [
  ['light', tokensOf(':root')],
  ['dark', tokensOf(":root[data-assist-mm-theme='dark']")],
];

describe('the contrast maths this suite grades with', () => {
  it('reproduces the known WCAG values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('mindmap.css theme tokens', () => {
  it.each(THEMES)('%s declares both grounds and both boundary colours as hex', (_name, tokens) => {
    for (const token of ['--mm-bg', '--mm-surface', '--mm-line-strong', '--mm-separator']) {
      expect(tokens[token]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(THEMES)(
    '%s draws control boundaries at 3:1 or better on both grounds (SC 1.4.11)',
    (_name, tokens) => {
      const failures = [];
      for (const token of ['--mm-line-strong', '--mm-separator']) {
        for (const ground of ['--mm-surface', '--mm-bg']) {
          const ratio = contrast(tokens[token], tokens[ground]);
          if (ratio < 3) {
            failures.push(`${token} on ${ground}: ${ratio.toFixed(2)}:1`);
          }
        }
      }
      expect(failures).toEqual([]);
    }
  );
});

describe('the separator', () => {
  it('is painted with its own token rather than the hairline one', () => {
    const at = CSS.indexOf('.assist-mm-separator {');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('var(--mm-separator)');
  });
});
