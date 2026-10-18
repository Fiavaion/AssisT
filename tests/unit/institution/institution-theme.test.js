/**
 * Institution theme derivation — WCAG contrast math + AA-safe palette.
 *
 * The contract under test: whatever accent an institution key carries, the derived palette NEVER
 * fails WCAG 2.2 AA where the library page uses it — white button text on the accent, and the accent
 * as text/borders on the page's light surfaces. A key can choose the hue; it cannot break contrast.
 */

import {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  contrastRatio,
  darkenToContrast,
  deriveInstitutionPalette,
  onAccentFor,
  LIBRARY_SURFACES,
} from '../../../src/features/institution/institution-theme.js';

describe('hexToRgb / rgbToHex', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#4e6f78')).toEqual({ r: 78, g: 111, b: 120 });
  });

  it('parses 3-digit shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#a1c')).toEqual({ r: 170, g: 17, b: 204 });
  });

  it('returns null for junk', () => {
    expect(hexToRgb('red')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb(null)).toBeNull();
    expect(hexToRgb('#gggggg')).toBeNull();
  });

  it('round-trips', () => {
    expect(rgbToHex(hexToRgb('#5d7d86'))).toBe('#5d7d86');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('white is 1, black is 0', () => {
    expect(relativeLuminance(hexToRgb('#ffffff'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb('#000000'))).toBeCloseTo(0, 5);
  });

  it('black on white is 21:1, same colour is 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#4e6f78', '#4e6f78')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#5d7d86', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#5d7d86'), 6);
  });

  it("confirms the page's shipped accent passes AA on white (sanity anchor)", () => {
    expect(contrastRatio('#4e6f78', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('throws nowhere on invalid input — returns NaN-free 1 fallback', () => {
    expect(contrastRatio('junk', '#ffffff')).toBe(1);
  });
});

describe('darkenToContrast', () => {
  const surfaces = ['#ffffff', '#faf9f4', '#eef0ea'];

  it('returns the input unchanged when it already meets the target on every surface', () => {
    expect(darkenToContrast('#4e6f78', surfaces, 4.5)).toBe('#4e6f78');
  });

  it('darkens a failing mid-tone until it passes on every surface', () => {
    const out = darkenToContrast('#5d7d86', surfaces, 4.5);
    for (const bg of surfaces) {
      expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('handles extreme light input (bright yellow) without looping forever', () => {
    const out = darkenToContrast('#ffee00', surfaces, 4.5);
    for (const bg of surfaces) {
      expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserves hue while darkening (stays recognisably the brand colour)', () => {
    const out = darkenToContrast('#5d7d86', surfaces, 4.5);
    const inRgb = hexToRgb('#5d7d86');
    const outRgb = hexToRgb(out);
    // Blue-leaning teal in, blue-leaning teal out: channel ordering preserved.
    expect(inRgb.b).toBeGreaterThan(inRgb.r);
    expect(outRgb.b).toBeGreaterThan(outRgb.r);
  });

  it('is deterministic', () => {
    expect(darkenToContrast('#ffee00', surfaces, 4.5)).toBe(darkenToContrast('#ffee00', surfaces, 4.5));
  });

  it('returns null on invalid colour', () => {
    expect(darkenToContrast('nope', surfaces, 4.5)).toBeNull();
  });
});

describe('deriveInstitutionPalette', () => {
  it('returns null when branding carries no accent (generic build untouched)', () => {
    expect(deriveInstitutionPalette(null)).toBeNull();
    expect(deriveInstitutionPalette({})).toBeNull();
    expect(deriveInstitutionPalette({ name: 'NCAD', accent: null })).toBeNull();
  });

  it('returns null for a malformed accent (defence-in-depth behind normaliseBranding)', () => {
    expect(deriveInstitutionPalette({ accent: 'url(evil)' })).toBeNull();
  });

  it('produces an AA-safe accent on every library surface, whatever the key held', () => {
    for (const accent of ['#ffee00', '#5d7d86', '#e91e63', '#00ff99', '#123456']) {
      const palette = deriveInstitutionPalette({ accent });
      expect(palette).not.toBeNull();
      for (const bg of LIBRARY_SURFACES) {
        expect(contrastRatio(palette.accent, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.accentSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps an already-AA accent byte-identical (no needless mutation of a careful brand)', () => {
    const palette = deriveInstitutionPalette({ accent: '#4e6f78' });
    expect(palette.accent).toBe('#4e6f78');
  });

  it('derives the secondary from accentSecondary when present, else reuses the accent', () => {
    const both = deriveInstitutionPalette({ accent: '#4e6f78', accentSecondary: '#4f6f58' });
    expect(both.accentSecondary).toBe('#4f6f58');
    const single = deriveInstitutionPalette({ accent: '#4e6f78' });
    expect(single.accentSecondary).toBe('#4e6f78');
  });

  it('emits a 12% alpha soft tint of the SAFE accent for hover washes', () => {
    const palette = deriveInstitutionPalette({ accent: '#4e6f78' });
    expect(palette.accentSoft).toBe('rgba(78, 111, 120, 0.12)');
  });
});

// The ink for text ON the accent belongs to the accent, not to the colour scheme. An institution
// accent is set INLINE on :root, so it outranks both palettes — and the dark palette's own
// --on-accent is near-black, which the page would then have painted onto a key's dark accent.
describe('onAccent — the ink that goes with the accent', () => {
  it('pairs every AA-safe accent with an ink that reads on it', () => {
    for (const accent of ['#ffee00', '#5d7d86', '#e91e63', '#00ff99', '#123456', '#000000']) {
      const palette = deriveInstitutionPalette({ accent });
      expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.onAccent, palette.accentSecondary)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never leaves the near-black dark-mode ink on a dark accent', () => {
    const palette = deriveInstitutionPalette({ accent: '#123456' });
    expect(palette.onAccent).toBe('#ffffff');
  });

  it('is chosen from the accent’s own luminance, not from the colour scheme', () => {
    // A pale accent takes the dark ink; the light ink would be unreadable on it.
    expect(onAccentFor(['#ffee00'])).toBe('#10201f');
    // A dark one takes the light ink — and both accents are weighed, because the primary button and
    // the logo mark are painted with the gradient of the two. (The palette has already darkened
    // both to AA against white by then, so in practice the light ink is what a key ends up with.)
    expect(onAccentFor(['#123456', '#1b3a2a'])).toBe('#ffffff');
  });
});
