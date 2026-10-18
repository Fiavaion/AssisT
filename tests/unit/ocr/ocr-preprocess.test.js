/**
 * Tests for OCR preprocessing (Phase 5, B1).
 *
 * Pure pixel transforms that improve recognition accuracy: grayscale, Otsu threshold + binarization,
 * contrast normalization, and an upscale-factor heuristic. They operate on a plain
 * { data: Uint8ClampedArray, width, height } shape (ImageData-compatible) so they need no canvas.
 */

import {
  toGrayscale,
  computeHistogram,
  otsuThreshold,
  binarize,
  normalizeContrast,
  computeUpscaleFactor,
} from '../../../src/features/ocr/ocr-preprocess.js';

/** Build an ImageData-like object from an array of [r,g,b,a] pixels. */
const img = (width, height, pixels) => ({
  width,
  height,
  data: new Uint8ClampedArray(pixels.flat()),
});

describe('toGrayscale', () => {
  it('replaces RGB with luminance and preserves alpha', () => {
    const out = toGrayscale(
      img(2, 1, [
        [255, 0, 0, 255], // red → luma 76
        [255, 255, 255, 128], // white → luma 255
      ])
    );
    expect([out.data[0], out.data[1], out.data[2], out.data[3]]).toEqual([76, 76, 76, 255]);
    expect([out.data[4], out.data[5], out.data[6], out.data[7]]).toEqual([255, 255, 255, 128]);
  });
});

describe('computeHistogram', () => {
  it('counts luminance values into 256 bins', () => {
    const hist = computeHistogram(
      img(3, 1, [
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [255, 255, 255, 255],
      ])
    );
    expect(hist.length).toBe(256);
    expect(hist[0]).toBe(2);
    expect(hist[255]).toBe(1);
  });
});

describe('otsuThreshold', () => {
  it('finds a threshold between two luminance clusters', () => {
    const pixels = [];
    for (let i = 0; i < 10; i++) {
      pixels.push([50, 50, 50, 255]);
    }
    for (let i = 0; i < 10; i++) {
      pixels.push([200, 200, 200, 255]);
    }
    const t = otsuThreshold(img(20, 1, pixels));
    expect(t).toBeGreaterThanOrEqual(50);
    expect(t).toBeLessThan(200);
  });
});

describe('binarize', () => {
  it('maps pixels to black or white around the threshold', () => {
    const out = binarize(
      img(2, 1, [
        [50, 50, 50, 255],
        [200, 200, 200, 255],
      ]),
      128
    );
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([0, 0, 0]);
    expect([out.data[4], out.data[5], out.data[6]]).toEqual([255, 255, 255]);
    expect(out.data[3]).toBe(255); // alpha preserved
  });
});

describe('normalizeContrast', () => {
  it('stretches a compressed luminance range to the full 0–255 span', () => {
    const out = normalizeContrast(
      img(3, 1, [
        [100, 100, 100, 255],
        [125, 125, 125, 255],
        [150, 150, 150, 255],
      ])
    );
    expect(out.data[0]).toBe(0); // min → 0
    expect(out.data[8]).toBe(255); // max → 255
    expect(out.data[4]).toBeGreaterThan(100); // midpoint stretched upward
    expect(out.data[4]).toBeLessThan(160);
  });

  it('is a no-op when the image is a single flat colour', () => {
    const out = normalizeContrast(
      img(2, 1, [
        [120, 120, 120, 255],
        [120, 120, 120, 255],
      ])
    );
    expect(out.data[0]).toBe(120);
    expect(out.data[4]).toBe(120);
  });
});

describe('computeUpscaleFactor', () => {
  it('upscales small images toward the minimum dimension, capped', () => {
    expect(computeUpscaleFactor(200, 100, { minDimension: 1000, maxScale: 4 })).toBe(4);
    expect(computeUpscaleFactor(500, 500, { minDimension: 1000, maxScale: 4 })).toBe(2);
  });

  it('does not upscale images already at or above the minimum', () => {
    expect(computeUpscaleFactor(2000, 1500, { minDimension: 1000 })).toBe(1);
  });
});
