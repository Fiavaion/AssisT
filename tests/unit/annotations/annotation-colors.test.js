/**
 * Unit tests for the annotation highlight palette.
 *
 * These are contrast tests, not colour-preference tests. An annotation highlight is
 * a visual indicator that conveys information, so WCAG 2.2 SC 1.4.11 (Non-text
 * Contrast) applies: it needs 3:1 against what sits next to it. The fill alone can
 * never carry that — a fill dark enough to reach 3:1 against a white page would
 * start eating the page's own text contrast (SC 1.4.3) — so the underline is the
 * conformant indicator and the fill is the recognition cue. Both are asserted here.
 *
 * The same argument runs in reverse on a dark page, which is why there are two
 * palettes. A light wash behind the near-white text of a dark theme destroys the
 * legibility of the very words it is meant to emphasise, so the dark palette
 * darkens the fill and lightens the underline. Every ratio below is computed from
 * the shipped values rather than asserted by eye.
 */

import {
  ANNOTATION_COLORS,
  ANNOTATION_COLORS_DARK,
  DEFAULT_ANNOTATION_COLOR,
  getAnnotationTheme,
  resolveAnnotationTheme,
} from '../../../src/features/annotations/annotation-colors.js';

const WHITE = [255, 255, 255];

/** sRGB channel to linear light. */
function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two rgb triples. */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseHex(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

/** Composite an `rgba(r, g, b, a)` string over an opaque backdrop. */
function composite(rgbaString, backdrop) {
  const parts = rgbaString.match(/rgba?\(([^)]+)\)/);
  const [r, g, b, a = '1'] = parts[1].split(',').map(v => v.trim());
  const alpha = parseFloat(a);
  return [r, g, b].map((channel, i) =>
    Math.round(parseFloat(channel) * alpha + backdrop[i] * (1 - alpha))
  );
}

/**
 * CIELAB coordinates, for measuring whether two fills read as different colours.
 * Contrast cannot answer that question: two hues of the same lightness sit at ~1:1
 * against each other however different they look.
 */
function lab(rgb) {
  const [rl, gl, bl] = rgb.map(toLinear);
  const white = [0.95047, 1, 1.08883];
  const xyz = [
    [0.4124, 0.3576, 0.1805],
    [0.2126, 0.7152, 0.0722],
    [0.0193, 0.1192, 0.9505],
  ].map((row, i) => (row[0] * rl + row[1] * gl + row[2] * bl) / white[i]);
  const [fx, fy, fz] = xyz.map(t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. */
function deltaE(a, b) {
  const [la, aa, ba] = lab(a);
  const [lb, ab, bb] = lab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

/**
 * Dark grounds real sites actually use: pure black, GitHub, Material, a plain
 * near-black, Tailwind gray-900, and Tailwind slate-800 — the lightest thing that
 * still reads as a dark theme, and therefore the hardest case for the fill.
 */
const DARK_BACKDROPS = ['#000000', '#0d1117', '#121212', '#1a1a1a', '#111827', '#1e293b'];

/**
 * Body-text colours those themes pair with the grounds above. `#94a3b8` on
 * `#1e293b` is the deliberately harsh one: it clears SC 1.4.3 on the page by only
 * 5.30:1, so it has almost no contrast to spare for anything we paint underneath.
 */
const DARK_PAGE_TEXTS = ['#ffffff', '#e5e7eb', '#d1d5db', '#cbd5e1', '#9ca3af', '#94a3b8'];

/** The dark ground quoted in the report; every dark-page ratio is also swept over the panel. */
const REPRESENTATIVE_DARK = parseHex('#121212');

describe('annotation palette', () => {
  const names = Object.keys(ANNOTATION_COLORS);

  test('offers the five documented highlight colours', () => {
    expect(names).toEqual(['yellow', 'blue', 'green', 'pink', 'purple']);
  });

  test('offers the same five colours on a dark page', () => {
    expect(Object.keys(ANNOTATION_COLORS_DARK)).toEqual(names);
  });

  test('falls back to the default colour for an unknown name', () => {
    expect(getAnnotationTheme('chartreuse')).toBe(ANNOTATION_COLORS[DEFAULT_ANNOTATION_COLOR]);
    expect(getAnnotationTheme(undefined)).toBe(ANNOTATION_COLORS[DEFAULT_ANNOTATION_COLOR]);
  });

  describe.each(names)('%s', name => {
    const theme = ANNOTATION_COLORS[name];

    test('underline meets SC 1.4.11 against a white page', () => {
      expect(contrast(parseHex(theme.border), WHITE)).toBeGreaterThanOrEqual(3);
    });

    test('underline meets SC 1.4.11 against its own fill', () => {
      const fill = composite(theme.fill, WHITE);
      expect(contrast(parseHex(theme.border), fill)).toBeGreaterThanOrEqual(3);
    });

    test('fill is a perceptible tint, not a near-white wash', () => {
      // The shipped 0.5-alpha pastels sat at 1.05-1.16:1 against white, below the
      // point where a highlight registers at all. 1.3:1 is the floor this palette holds.
      const fill = composite(theme.fill, WHITE);
      expect(contrast(fill, WHITE)).toBeGreaterThanOrEqual(1.3);
    });

    test('fill keeps black page text far above SC 1.4.3', () => {
      const fill = composite(theme.fill, WHITE);
      expect(contrast([0, 0, 0], fill)).toBeGreaterThanOrEqual(7);
    });
  });

  describe.each(names)('%s on a dark page', name => {
    const theme = ANNOTATION_COLORS_DARK[name];

    test('fill keeps the page’s own text above SC 1.4.3 on every dark ground', () => {
      DARK_BACKDROPS.forEach(background => {
        const fill = composite(theme.fill, parseHex(background));
        DARK_PAGE_TEXTS.forEach(text => {
          expect(contrast(parseHex(text), fill)).toBeGreaterThanOrEqual(4.5);
        });
      });
    });

    test('underline meets SC 1.4.11 against every dark ground', () => {
      DARK_BACKDROPS.forEach(background => {
        expect(contrast(parseHex(theme.border), parseHex(background))).toBeGreaterThanOrEqual(3);
      });
    });

    test('underline meets SC 1.4.11 against its own fill', () => {
      DARK_BACKDROPS.forEach(background => {
        const fill = composite(theme.fill, parseHex(background));
        expect(contrast(parseHex(theme.border), fill)).toBeGreaterThanOrEqual(3);
      });
    });

    test('fill is a perceptible tint against the ground it sits on', () => {
      DARK_BACKDROPS.forEach(background => {
        const ground = parseHex(background);
        expect(contrast(composite(theme.fill, ground), ground)).toBeGreaterThanOrEqual(1.2);
      });
    });
  });

  describe('the five colours stay tellable apart', () => {
    // Contrast is the wrong instrument here — the dark fills sit within 1.2:1 of each
    // other by design. CIE76 is. The floor is not a round number picked to pass: it is
    // the tightest pair the shipped light palette already holds (pink/purple, 19.96),
    // so the dark palette has to be at least as tellable apart as the one in use.
    // Its own tightest pair is blue/purple at 24.0.
    const MIN_SEPARATION = 19.9;
    const pairs = names.flatMap((a, i) => names.slice(i + 1).map(b => [a, b]));

    test.each(pairs)('light page: %s and %s', (a, b) => {
      const fill = n => composite(ANNOTATION_COLORS[n].fill, WHITE);
      expect(deltaE(fill(a), fill(b))).toBeGreaterThanOrEqual(MIN_SEPARATION);
    });

    test.each(pairs)('dark page: %s and %s', (a, b) => {
      const fill = n => composite(ANNOTATION_COLORS_DARK[n].fill, REPRESENTATIVE_DARK);
      expect(deltaE(fill(a), fill(b))).toBeGreaterThanOrEqual(MIN_SEPARATION);
    });
  });

  describe('resolveAnnotationTheme picks the palette for the surface', () => {
    test('a light backdrop keeps the light palette', () => {
      const theme = resolveAnnotationTheme('green', {
        backdrop: 'rgb(255, 255, 255)',
        textColor: 'rgb(17, 24, 39)',
      });
      expect(theme.fill).toBe(ANNOTATION_COLORS.green.fill);
      expect(theme.border).toBe(ANNOTATION_COLORS.green.border);
      expect(theme.textColor).toBeNull();
    });

    test('a dark backdrop switches to the dark palette', () => {
      const theme = resolveAnnotationTheme('green', {
        backdrop: 'rgb(18, 18, 18)',
        textColor: 'rgb(229, 231, 235)',
      });
      expect(theme.fill).toBe(ANNOTATION_COLORS_DARK.green.fill);
      expect(theme.border).toBe(ANNOTATION_COLORS_DARK.green.border);
      expect(theme.textColor).toBeNull();
    });

    test('an unknown colour name still resolves, on either surface', () => {
      expect(resolveAnnotationTheme('chartreuse', { backdrop: 'rgb(255, 255, 255)' }).fill).toBe(
        ANNOTATION_COLORS[DEFAULT_ANNOTATION_COLOR].fill
      );
      expect(resolveAnnotationTheme(undefined, { backdrop: 'rgb(18, 18, 18)' }).fill).toBe(
        ANNOTATION_COLORS_DARK[DEFAULT_ANNOTATION_COLOR].fill
      );
    });

    test('accepts a backdrop as an rgb triple as well as a string', () => {
      expect(resolveAnnotationTheme('blue', { backdrop: [18, 18, 18] }).fill).toBe(
        ANNOTATION_COLORS_DARK.blue.fill
      );
    });
  });

  describe('resolveAnnotationTheme falls back when the backdrop cannot be sampled', () => {
    // A picture or a gradient behind the text cannot be read back, and neither can a
    // chain of transparent ancestors. The page's own text colour is the signal that
    // survives both: light text means a dark ground, whatever is painting it.
    test('light page text implies a dark ground', () => {
      const theme = resolveAnnotationTheme('pink', {
        backdrop: null,
        textColor: 'rgb(229, 231, 235)',
      });
      expect(theme.fill).toBe(ANNOTATION_COLORS_DARK.pink.fill);
    });

    test('dark page text implies a light ground', () => {
      const theme = resolveAnnotationTheme('pink', { backdrop: null, textColor: 'rgb(31, 41, 55)' });
      expect(theme.fill).toBe(ANNOTATION_COLORS.pink.fill);
    });

    test('a fully transparent backdrop is not treated as a reading', () => {
      const theme = resolveAnnotationTheme('pink', {
        backdrop: 'rgba(0, 0, 0, 0)',
        textColor: 'rgb(229, 231, 235)',
      });
      expect(theme.fill).toBe(ANNOTATION_COLORS_DARK.pink.fill);
    });

    test('no signal at all keeps today’s light behaviour', () => {
      expect(resolveAnnotationTheme('yellow', {}).fill).toBe(ANNOTATION_COLORS.yellow.fill);
      expect(resolveAnnotationTheme('yellow').fill).toBe(ANNOTATION_COLORS.yellow.fill);
    });
  });

  describe('the forced text colour is a backstop, not the default', () => {
    test('page text that already clears 4.5:1 on the fill is left alone', () => {
      names.forEach(name => {
        expect(
          resolveAnnotationTheme(name, {
            backdrop: 'rgb(255, 255, 255)',
            textColor: 'rgb(0, 0, 0)',
          }).textColor
        ).toBeNull();
        expect(
          resolveAnnotationTheme(name, {
            backdrop: 'rgb(18, 18, 18)',
            textColor: 'rgb(229, 231, 235)',
          }).textColor
        ).toBeNull();
      });
    });

    test('page text that would fail on the fill is overridden', () => {
      // Pale grey on white: legible on the page, illegible once a tint goes behind it.
      const theme = resolveAnnotationTheme('yellow', {
        backdrop: 'rgb(255, 255, 255)',
        textColor: 'rgb(190, 190, 190)',
      });
      expect(theme.textColor).not.toBeNull();
    });

    test('the colour it forces clears 4.5:1 on every fill it can be paired with', () => {
      names.forEach(name => {
        const light = resolveAnnotationTheme(name, {
          backdrop: 'rgb(255, 255, 255)',
          textColor: 'rgb(190, 190, 190)',
        });
        expect(
          contrast(parseHex(light.textColor), composite(light.fill, WHITE))
        ).toBeGreaterThanOrEqual(4.5);

        const dark = resolveAnnotationTheme(name, {
          backdrop: 'rgb(18, 18, 18)',
          textColor: 'rgb(70, 70, 70)',
        });
        expect(
          contrast(parseHex(dark.textColor), composite(dark.fill, REPRESENTATIVE_DARK))
        ).toBeGreaterThanOrEqual(4.5);
      });
    });
  });
});
