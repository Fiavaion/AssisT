/**
 * Institution theme derivation — pure WCAG contrast math (no chrome, no DOM).
 *
 * An institution key may carry accent colours, but the key must never be able to break WCAG 2.2 AA:
 * the library paints white text on the accent and uses the accent as text/borders on its light
 * surfaces, so an arbitrary hue could otherwise ship an unreadable skin. `deriveInstitutionPalette`
 * is the guarantee: whatever hex the key holds, the emitted palette meets >= 4.5:1 on every surface
 * the page uses it against — the key chooses the hue, the code owns the contrast.
 */

import { isHexColour } from './institution-config.js';

/**
 * The light surfaces the library page renders the accent against (white button text is covered by
 * '#ffffff'; the card and page backgrounds cover accent-as-text/border usage). Keep in sync with the
 * `:root` tokens in src/pages/citation-library/library.css.
 */
export const LIBRARY_SURFACES = Object.freeze(['#ffffff', '#faf9f4', '#eef0ea']);

/** WCAG AA contrast for normal text — the bar every derived colour must clear. */
const AA_TARGET = 4.5;

/**
 * The two inks the page has for text sitting ON the accent (primary button, logo mark): the light
 * one from the light palette's `--on-accent`, the near-black one from the dark palette's.
 *
 * Which of them is right depends on the accent, not on the colour scheme — and an institution
 * accent is applied INLINE on :root, so it outranks both palettes. Dark mode therefore used to pair
 * a key's dark accent with the dark palette's near-black ink and print black on black. `onAccent`
 * settles it from the accent's own luminance instead.
 */
const ACCENT_INKS = Object.freeze(['#ffffff', '#10201f']);

/**
 * Parse a #rgb / #rrggbb colour to channels.
 * @param {string} hex
 * @returns {{r:number,g:number,b:number}|null}
 */
export function hexToRgb(hex) {
  if (!isHexColour(hex)) {
    return null;
  }
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Channels back to a 6-digit hex string.
 * @param {{r:number,g:number,b:number}} rgb
 * @returns {string}
 */
export function rgbToHex({ r, g, b }) {
  const to2 = n =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * WCAG 2.x relative luminance.
 * @param {{r:number,g:number,b:number}} rgb
 * @returns {number} 0 (black) .. 1 (white)
 */
export function relativeLuminance({ r, g, b }) {
  const lin = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG contrast ratio between two hex colours. Invalid input degrades to 1 (worst) rather than
 * throwing, so callers can treat "can't parse" and "fails AA" identically.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number} 1 .. 21
 */
export function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) {
    return 1;
  }
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---- HSL helpers (internal — only what darkening needs) -------------------------------------------

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) / 6;
  } else {
    h = ((rn - gn) / d + 4) / 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) {
      tt += 1;
    }
    if (tt > 1) {
      tt -= 1;
    }
    if (tt < 1 / 6) {
      return p + (q - p) * 6 * tt;
    }
    if (tt < 1 / 2) {
      return q;
    }
    if (tt < 2 / 3) {
      return p + (q - p) * (2 / 3 - tt) * 6;
    }
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

/**
 * Darken a colour (fixed hue/saturation, stepped lightness) until it meets `target` contrast against
 * EVERY background in `surfaces`. Deterministic; returns the input unchanged when it already passes,
 * null when the input can't be parsed. Black always passes 4.5:1 on light surfaces, so the loop is
 * guaranteed to terminate.
 * @param {string} hex
 * @param {string[]} surfaces
 * @param {number} [target]
 * @returns {string|null}
 */
export function darkenToContrast(hex, surfaces, target = AA_TARGET) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return null;
  }
  const passes = candidate => surfaces.every(bg => contrastRatio(candidate, bg) >= target);
  if (passes(hex)) {
    return hex;
  }
  const hsl = rgbToHsl(rgb);
  for (let l = hsl.l; l >= 0; l -= 0.01) {
    const candidate = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l }));
    if (passes(candidate)) {
      return candidate;
    }
  }
  return '#000000';
}

/**
 * The ink for text sitting ON the accent: whichever of the page's two inks reads best against the
 * accent AND its gradient partner, since the primary button and the logo mark are painted with both.
 * @param {string[]} accents - the derived accent colours the ink has to sit on
 * @returns {string} one of ACCENT_INKS
 */
export function onAccentFor(accents) {
  const worst = ink => Math.min(...accents.map(bg => contrastRatio(ink, bg)));
  return ACCENT_INKS.reduce((best, ink) => (worst(ink) > worst(best) ? ink : best));
}

/**
 * Derive the AA-safe CSS palette for a verified branding object.
 * @param {{ accent?: string|null, accentSecondary?: string|null }|null} branding
 * @returns {{ accent: string, accentSecondary: string, accentSoft: string, onAccent: string }|null}
 *   null when the branding carries no usable accent — the caller leaves the default theme alone.
 */
export function deriveInstitutionPalette(branding) {
  if (!branding || !isHexColour(branding.accent)) {
    return null;
  }
  const accent = darkenToContrast(branding.accent, LIBRARY_SURFACES);
  const secondarySource = isHexColour(branding.accentSecondary)
    ? branding.accentSecondary
    : branding.accent;
  const accentSecondary = darkenToContrast(secondarySource, LIBRARY_SURFACES);
  const { r, g, b } = hexToRgb(accent);
  return {
    accent,
    accentSecondary,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    onAccent: onAccentFor([accent, accentSecondary]),
  };
}
