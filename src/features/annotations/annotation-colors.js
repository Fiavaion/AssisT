/**
 * @fileoverview Highlight palette for inline annotations, and the contrast maths
 * that decides which variant a given piece of page gets.
 *
 * Two cues per colour, because one cannot do both jobs:
 *
 * - `fill` is the recognition cue. It is a tinted wash so the page's own text keeps
 *   its contrast (SC 1.4.3); a fill dark enough to reach 3:1 against white would put
 *   mid-grey body text below the 4.5:1 line.
 * - `border` is the conformant indicator. It sits under the text rather than behind
 *   it, so it can be fully saturated: every one clears 3:1 against the page and
 *   against its own fill, which is what SC 1.4.11 asks of a visual indicator.
 *
 * That reasoning assumed a white page, and inverts on a dark one. A light wash
 * composited behind the near-white text of a dark theme leaves light on light — the
 * highlight destroys the legibility of the words it is meant to emphasise, which is
 * worse than not highlighting them. So there are two palettes, not one: the dark
 * variant darkens the fill to stay close to the ground it sits on, and lightens the
 * underline so the indicator still clears 3:1. Both halves of the original argument
 * survive; only the direction flips.
 *
 * Matching the fill to the ground is also what keeps the page's own colours intact.
 * A link, a code token or a coloured heading inside a highlight contrasts with the
 * page background by the author's design, so a fill that stays near that background's
 * luminance leaves that contrast roughly where it was — which no forced text colour
 * could do, since a page's `a { color }` rule outranks anything we inherit onto a
 * span. `resolveAnnotationTheme` therefore only names a text colour in the one case
 * the palette cannot cover on its own: page text that would drop below 4.5:1 on the
 * fill. That is a backstop, applied to the highlight span alone, so descendants that
 * carry their own colour keep it (SC 1.4.1).
 *
 * Every ratio here is asserted in tests/unit/annotations/annotation-colors.test.js
 * from the shipped values — change one and the gate tells you whether it still holds.
 *
 * @module features/annotations/annotation-colors
 */

/**
 * @typedef {Object} AnnotationTheme
 * @property {string} fill - Highlight wash, as an rgba() string.
 * @property {string} border - Underline colour, as a hex string.
 */

/**
 * @typedef {Object} ResolvedAnnotationTheme
 * @property {string} fill - Highlight wash for this surface, as an rgba() string.
 * @property {string} border - Underline colour for this surface, as a hex string.
 * @property {string|null} textColor - Colour to force on the span, or null to leave
 *   the page's own text colour untouched (the usual case).
 */

/** @type {Readonly<Record<string, AnnotationTheme>>} Palette for a light page. */
export const ANNOTATION_COLORS = Object.freeze({
  yellow: Object.freeze({ fill: 'rgba(252, 211, 77, 0.85)', border: '#a16207' }),
  blue: Object.freeze({ fill: 'rgba(147, 197, 253, 0.85)', border: '#1d4ed8' }),
  green: Object.freeze({ fill: 'rgba(134, 239, 172, 0.85)', border: '#15803d' }),
  pink: Object.freeze({ fill: 'rgba(249, 168, 212, 0.85)', border: '#be185d' }),
  purple: Object.freeze({ fill: 'rgba(216, 180, 254, 0.85)', border: '#7e22ce' }),
});

/**
 * Palette for a dark page. The fills are deep enough that even a dark theme running
 * its body text close to the SC 1.4.3 line — slate-400 on slate-800, 5.30:1, with
 * almost nothing to spare — still clears 4.5:1 once the wash is behind it. The
 * underlines are the light palette's own fill hues at full strength, which is what
 * gives them their 8:1-plus against these grounds.
 *
 * @type {Readonly<Record<string, AnnotationTheme>>}
 */
export const ANNOTATION_COLORS_DARK = Object.freeze({
  yellow: Object.freeze({ fill: 'rgba(90, 50, 16, 0.85)', border: '#fcd34d' }),
  blue: Object.freeze({ fill: 'rgba(28, 53, 128, 0.85)', border: '#93c5fd' }),
  green: Object.freeze({ fill: 'rgba(16, 67, 36, 0.85)', border: '#86efac' }),
  pink: Object.freeze({ fill: 'rgba(115, 21, 60, 0.85)', border: '#f9a8d4' }),
  purple: Object.freeze({ fill: 'rgba(86, 27, 132, 0.85)', border: '#d8b4fe' }),
});

/** @type {string} Colour used when none is stored, or an unrecognised one is. */
export const DEFAULT_ANNOTATION_COLOR = 'yellow';

/** Smallest ratio the page's own text may have against the fill (SC 1.4.3). */
const TEXT_CONTRAST_MIN = 4.5;

/**
 * The two surfaces a highlight can land on. `backdrop` is only used when the page's
 * real background could not be read, and `text` is the backstop colour — each one is
 * asserted against every fill in its own palette.
 */
const LIGHT_SURFACE = Object.freeze({
  colors: ANNOTATION_COLORS,
  backdrop: Object.freeze([255, 255, 255]),
  text: '#111827',
});

const DARK_SURFACE = Object.freeze({
  colors: ANNOTATION_COLORS_DARK,
  backdrop: Object.freeze([18, 18, 18]),
  text: '#f8fafc',
});

/**
 * Parse a CSS colour into channels plus alpha.
 * Handles what `getComputedStyle` returns in a browser (`rgb()`, `rgba()`) and in
 * jsdom (the bare `transparent` keyword, or an empty string for anything unset),
 * plus hex, so the palette's own values can be measured with the same function.
 *
 * @param {string} [value] - CSS colour.
 * @returns {{r: number, g: number, b: number, a: number}|null} Channels, or null when
 *   the value is absent or in a form we cannot read back.
 */
export function parseCssColor(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim().toLowerCase();
  if (!text || text === 'none') {
    return null;
  }
  if (text === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hex = text.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    const expand = digits.length <= 4 ? digits.replace(/./g, d => d + d) : digits;
    if (expand.length !== 6 && expand.length !== 8) {
      return null;
    }
    const channel = i => parseInt(expand.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: expand.length === 8 ? channel(6) / 255 : 1,
    };
  }

  // `rgb(0 0 0 / 50%)` and `rgba(0, 0, 0, 0.5)` differ only in separators.
  const rgb = text.match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) {
    return null;
  }
  const parts = rgb[1]
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const number = part => (part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part));
  const [r, g, b] = parts.slice(0, 3).map(number);
  if ([r, g, b].some(Number.isNaN)) {
    return null;
  }
  let a = 1;
  if (parts.length > 3) {
    a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (Number.isNaN(a)) {
      return null;
    }
  }
  return { r, g, b, a };
}

/**
 * WCAG relative luminance of an opaque colour.
 * @param {Array<number>} rgb - Channels, 0-255.
 * @returns {number} Relative luminance, 0-1.
 */
export function relativeLuminance([r, g, b]) {
  const linear = channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG contrast ratio between two opaque colours.
 * @param {Array<number>} a - First colour.
 * @param {Array<number>} b - Second colour.
 * @returns {number} Ratio, 1-21.
 */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Paint a colour over an opaque backdrop, as the browser would.
 * @param {{r: number, g: number, b: number, a: number}} color - Colour with alpha.
 * @param {Array<number>} backdrop - Opaque colour beneath it.
 * @returns {Array<number>} The composited colour.
 */
export function compositeOver(color, backdrop) {
  return [color.r, color.g, color.b].map((channel, i) =>
    Math.round(channel * color.a + backdrop[i] * (1 - color.a))
  );
}

/**
 * True when this colour is a dark surface — one that white text would read better on
 * than black. Threshold-free: it asks the question directly instead of picking a
 * luminance cut-off, and lands where one would anyway (L ≈ 0.179).
 *
 * @param {Array<number>} rgb - Opaque colour.
 * @returns {boolean} Whether the surface is dark.
 */
export function isDarkSurface(rgb) {
  return contrastRatio(rgb, [255, 255, 255]) >= contrastRatio(rgb, [0, 0, 0]);
}

/**
 * Resolve a stored colour name to its theme.
 * @param {string} [name] - Colour name from the annotation record.
 * @param {Record<string, AnnotationTheme>} [palette] - Palette to look in.
 * @returns {AnnotationTheme} The matching theme, or the default.
 */
export function getAnnotationTheme(name, palette = ANNOTATION_COLORS) {
  return palette[name] || palette[DEFAULT_ANNOTATION_COLOR];
}

/**
 * An opaque rgb triple, or null when the value carries no usable reading.
 * A partly transparent colour is not a reading: the caller composites layers before
 * it gets here, so anything still translucent means the ground is genuinely unknown.
 *
 * @param {string|Array<number>} [value] - CSS colour or rgb triple.
 * @returns {Array<number>|null} Opaque channels, or null.
 */
function toOpaqueRgb(value) {
  if (Array.isArray(value)) {
    return value.length >= 3 ? value.slice(0, 3) : null;
  }
  const parsed = parseCssColor(value);
  return parsed && parsed.a >= 1 ? [parsed.r, parsed.g, parsed.b] : null;
}

/**
 * Choose the palette for the surface a highlight is landing on.
 *
 * The background is the better signal because it is what we composite against, but
 * it is not always readable — an image or gradient cannot be sampled, and a chain of
 * transparent ancestors says nothing. The page's own text colour survives both, and
 * it answers the question that actually matters: light text means a dark ground,
 * whatever is painting it. With neither signal the light palette is the safe default,
 * because it is what shipped and a page with no colours set at all is a white one.
 *
 * @param {Array<number>|null} backdrop - Resolved page background, if readable.
 * @param {Array<number>|null} pageText - The page's own text colour, if readable.
 * @returns {typeof LIGHT_SURFACE} The surface descriptor.
 */
function pickSurface(backdrop, pageText) {
  if (backdrop) {
    return isDarkSurface(backdrop) ? DARK_SURFACE : LIGHT_SURFACE;
  }
  if (pageText) {
    return isDarkSurface(pageText) ? LIGHT_SURFACE : DARK_SURFACE;
  }
  return LIGHT_SURFACE;
}

/**
 * Resolve the colours to paint a highlight with, for the surface it sits on.
 *
 * @param {string} [name] - Palette colour name from the annotation record.
 * @param {Object} [surface] - What was read off the page.
 * @param {string|Array<number>|null} [surface.backdrop] - Effective page background
 *   behind the highlight, already flattened to an opaque colour, or null if unreadable.
 * @param {string|null} [surface.textColor] - The page's own text colour there.
 * @returns {ResolvedAnnotationTheme} Fill, underline, and a text colour only when the
 *   page's own would be unreadable on the fill.
 */
export function resolveAnnotationTheme(name, surface = {}) {
  const backdrop = toOpaqueRgb(surface.backdrop);
  const pageText = toOpaqueRgb(surface.textColor);
  const chosen = pickSurface(backdrop, pageText);
  const theme = getAnnotationTheme(name, chosen.colors);

  const fill = compositeOver(parseCssColor(theme.fill), backdrop || chosen.backdrop);
  const textFails = Boolean(pageText) && contrastRatio(pageText, fill) < TEXT_CONTRAST_MIN;

  return { fill: theme.fill, border: theme.border, textColor: textFails ? chosen.text : null };
}
