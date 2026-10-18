/**
 * OCR preprocessing.
 *
 * Pure pixel transforms that lift recognition accuracy before Tesseract runs: grayscale, Otsu
 * thresholding + binarization, contrast normalization, and an upscale-factor heuristic. They operate
 * on a plain { data: Uint8ClampedArray, width, height } shape (ImageData-compatible), so they need no
 * canvas and are fully unit-testable. ocr.js wires them to a real canvas (getImageData / putImageData
 * and drawImage for the upscale).
 */

/** ITU-R BT.601 luma. */
function luma(r, g, b) {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/** Allocate an output image of the same size as `image`. */
function emptyLike(image) {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data.length),
  };
}

/**
 * Convert to grayscale (R=G=B=luma), preserving alpha.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function toGrayscale(image) {
  const out = emptyLike(image);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2]);
    out.data[i] = y;
    out.data[i + 1] = y;
    out.data[i + 2] = y;
    out.data[i + 3] = data[i + 3];
  }
  return out;
}

/**
 * Build a 256-bin luminance histogram.
 * @param {{data: Uint8ClampedArray}} image
 * @returns {number[]} counts indexed by luminance 0–255
 */
export function computeHistogram(image) {
  const hist = new Array(256).fill(0);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    hist[luma(data[i], data[i + 1], data[i + 2])]++;
  }
  return hist;
}

/**
 * Otsu's method: the luminance threshold that maximizes between-class variance.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @returns {number} threshold 0–255
 */
export function otsuThreshold(image) {
  const hist = computeHistogram(image);
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return 127;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * hist[i];
  }

  let sumB = 0;
  let weightB = 0;
  let maxVariance = -1;
  let threshold = 0;

  for (let i = 0; i < 256; i++) {
    weightB += hist[i];
    if (weightB === 0) {
      continue;
    }
    const weightF = total - weightB;
    if (weightF === 0) {
      break;
    }
    sumB += i * hist[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * Binarize to pure black/white around a threshold (luminance > threshold → white), preserving alpha.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {number} threshold
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function binarize(image, threshold) {
  const out = emptyLike(image);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i], data[i + 1], data[i + 2]) > threshold ? 255 : 0;
    out.data[i] = value;
    out.data[i + 1] = value;
    out.data[i + 2] = value;
    out.data[i + 3] = data[i + 3];
  }
  return out;
}

/**
 * Linear contrast stretch: map the darkest luminance present to 0 and the brightest to 255. A flat
 * image (min === max) is returned unchanged.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function normalizeContrast(image) {
  const { data } = image;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2]);
    if (y < min) {
      min = y;
    }
    if (y > max) {
      max = y;
    }
  }

  const out = emptyLike(image);
  const range = max - min;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out.data[i + c] = range === 0 ? data[i + c] : ((data[i + c] - min) * 255) / range;
    }
    out.data[i + 3] = data[i + 3];
  }
  return out;
}

/**
 * Decide how much to upscale so the smaller dimension reaches `minDimension`, capped at `maxScale`.
 * Tesseract reads small text far better at ~300dpi-equivalent sizes. Never downscales.
 * @param {number} width
 * @param {number} height
 * @param {Object} [options]
 * @param {number} [options.minDimension=1000]
 * @param {number} [options.maxScale=4]
 * @returns {number} scale factor >= 1
 */
export function computeUpscaleFactor(width, height, { minDimension = 1000, maxScale = 4 } = {}) {
  const smaller = Math.min(width, height);
  if (smaller <= 0 || smaller >= minDimension) {
    return 1;
  }
  return Math.min(maxScale, Math.ceil(minDimension / smaller));
}

export default {
  toGrayscale,
  computeHistogram,
  otsuThreshold,
  binarize,
  normalizeContrast,
  computeUpscaleFactor,
};
