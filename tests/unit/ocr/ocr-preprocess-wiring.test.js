/**
 * Tests for wiring the Phase 5 B1 offline-accuracy preprocessing pipeline (ocr-preprocess.js) into
 * the live OCR recognition path (ocr.js), behind an explicit, default-OFF opt-in setting
 * (assist_settings.ocr.offlineAccuracy).
 *
 * Covers:
 *  (a) setting off/absent -> ocr_recognizeText passes the image straight through; the preprocess
 *      transforms are never invoked (byte-identical passthrough, today's behaviour).
 *  (b) setting explicitly on -> the transforms run in order (grayscale -> contrast -> Otsu ->
 *      binarize -> adaptive upscale) and recognize() receives the processed image, not the original.
 *  (c) a preprocessing step throwing falls back to the original, unprocessed image — preprocessing
 *      must never be able to break OCR.
 *
 * Tesseract and the pure preprocess transforms are both mocked; canvas/Image are stubbed since
 * jsdom does not implement real 2D canvas rendering.
 */

jest.mock('../../../src/features/ocr/ocr-preprocess.js', () => ({
  toGrayscale: jest.fn(image => image),
  normalizeContrast: jest.fn(image => image),
  otsuThreshold: jest.fn(() => 128),
  binarize: jest.fn(image => image),
  computeUpscaleFactor: jest.fn(() => 1),
}));

const mockWorker = {
  setParameters: jest.fn().mockResolvedValue(undefined),
  recognize: jest.fn(),
  terminate: jest.fn().mockResolvedValue(undefined),
};
const mockCreateWorker = jest.fn().mockResolvedValue(mockWorker);

jest.mock('tesseract.js', () => ({
  createWorker: (...args) => mockCreateWorker(...args),
  PSM: { AUTO: 3 },
  OEM: { LSTM_ONLY: 1 },
}));

const {
  toGrayscale,
  normalizeContrast,
  otsuThreshold,
  binarize,
  computeUpscaleFactor,
} = require('../../../src/features/ocr/ocr-preprocess.js');

const { ocr_recognizeText, ocr_prepareCanvas } = require('../../../src/features/ocr/ocr.js');

const ORIGINAL_IMAGE = 'data:image/png;base64,ORIGINAL';

/** Fake, minimal Tesseract result — enough for ocr_recognizeText's post-processing to run cleanly. */
const fakeTesseractResult = () => ({
  data: {
    text: 'hello world',
    confidence: 90,
    words: [
      { text: 'hello', confidence: 95 },
      { text: 'world', confidence: 92 },
    ],
    lines: [],
  },
});

const OriginalImage = global.Image;
const OriginalCreateElement = document.createElement.bind(document);

/** Replaces global.Image with one whose onload fires asynchronously (jsdom does not decode images). */
function installImageMock({ width = 100, height = 100 } = {}) {
  class FakeImage {
    constructor() {
      this.width = width;
      this.height = height;
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this._src = value;
      Promise.resolve().then(() => {
        if (this.onload) {
          this.onload();
        }
      });
    }

    get src() {
      return this._src;
    }
  }
  global.Image = FakeImage;
}

/**
 * Stubs document.createElement('canvas') with a fake canvas (jsdom's getContext('2d') returns null
 * without the optional `canvas` native package, which this project does not depend on). Each created
 * canvas gets a distinct, inspectable toDataURL() output so tests can tell which canvas produced the
 * final image.
 */
function installCanvasMock() {
  let counter = 0;
  jest.spyOn(document, 'createElement').mockImplementation(tag => {
    if (tag !== 'canvas') {
      return OriginalCreateElement(tag);
    }
    const id = `canvas-${counter++}`;
    const ctx = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: new Uint8ClampedArray(4),
        width: 10,
        height: 10,
      })),
      putImageData: jest.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
    };
    return {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ctx),
      toDataURL: jest.fn(() => `data:image/png;base64,${id}`),
    };
  });
}

afterEach(() => {
  global.Image = OriginalImage;
});

// NOTE: jest.config.cjs sets resetMocks:true, which wipes mock implementations (including the
// jest.mock() factory defaults above and anything assigned at module scope) before EVERY test — so
// defaults must be (re)installed in a beforeEach, not the factory or module scope.
beforeEach(() => {
  mockCreateWorker.mockResolvedValue(mockWorker);
  mockWorker.setParameters.mockResolvedValue(undefined);
  mockWorker.terminate.mockResolvedValue(undefined);
  toGrayscale.mockImplementation(image => image);
  normalizeContrast.mockImplementation(image => image);
  otsuThreshold.mockImplementation(() => 128);
  binarize.mockImplementation(image => image);
  computeUpscaleFactor.mockImplementation(() => 1);
});

describe('ocr_prepareCanvas — offline-accuracy preprocessing gate', () => {
  it('(a) is a byte-identical passthrough when the setting is absent', async () => {
    chrome.storage.local.get.mockResolvedValue({});

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).toBe(ORIGINAL_IMAGE);
    expect(toGrayscale).not.toHaveBeenCalled();
    expect(normalizeContrast).not.toHaveBeenCalled();
    expect(otsuThreshold).not.toHaveBeenCalled();
    expect(binarize).not.toHaveBeenCalled();
  });

  it('(a) is a byte-identical passthrough when the setting is explicitly false', async () => {
    chrome.storage.local.get.mockResolvedValue({ assist_settings: { ocr: { offlineAccuracy: false } } });

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).toBe(ORIGINAL_IMAGE);
    expect(toGrayscale).not.toHaveBeenCalled();
  });

  it('(a) treats a settings-read failure as disabled — no exception escapes', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('storage unavailable'));

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).toBe(ORIGINAL_IMAGE);
    expect(toGrayscale).not.toHaveBeenCalled();
  });

  it('(b) runs grayscale -> contrast -> Otsu -> binarize -> upscale in order when enabled', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installCanvasMock();
    installImageMock({ width: 100, height: 100 });

    const callOrder = [];
    toGrayscale.mockImplementation(image => {
      callOrder.push('grayscale');
      return image;
    });
    normalizeContrast.mockImplementation(image => {
      callOrder.push('contrast');
      return image;
    });
    otsuThreshold.mockImplementation(() => {
      callOrder.push('otsu');
      return 100;
    });
    binarize.mockImplementation((image, threshold) => {
      callOrder.push('binarize');
      expect(threshold).toBe(100);
      return image;
    });
    computeUpscaleFactor.mockImplementation(() => {
      callOrder.push('upscale-check');
      return 2;
    });

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(callOrder).toEqual(['grayscale', 'contrast', 'otsu', 'binarize', 'upscale-check']);
    expect(result).not.toBe(ORIGINAL_IMAGE);
    expect(result).toMatch(/^data:image\/png;base64,canvas-\d+$/);
  });

  it('(b) skips the upscale canvas when computeUpscaleFactor returns 1 (source already large enough)', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installCanvasMock();
    installImageMock({ width: 2000, height: 2000 });
    computeUpscaleFactor.mockReturnValue(1);

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).not.toBe(ORIGINAL_IMAGE);
    expect(result).toBe('data:image/png;base64,canvas-1'); // processed canvas, not a 3rd upscaled one
  });

  it('(c) falls back to the original image when a preprocessing step throws', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installCanvasMock();
    installImageMock({ width: 100, height: 100 });
    toGrayscale.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).toBe(ORIGINAL_IMAGE);
  });

  it('(c) falls back to the original image when the canvas/image pipeline is unavailable', async () => {
    // No installCanvasMock() — jsdom's real getContext('2d') returns null, so drawImage() throws.
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installImageMock({ width: 100, height: 100 });

    const result = await ocr_prepareCanvas(ORIGINAL_IMAGE);

    expect(result).toBe(ORIGINAL_IMAGE);
    expect(toGrayscale).not.toHaveBeenCalled();
  });
});

describe('ocr_recognizeText — offline-accuracy wiring into the live recognize() path', () => {
  beforeEach(() => {
    mockWorker.recognize.mockResolvedValue(fakeTesseractResult());
    computeUpscaleFactor.mockReturnValue(1);
  });

  it('(a) passes the original image straight to recognize() when the setting is off', async () => {
    chrome.storage.local.get.mockResolvedValue({});

    await ocr_recognizeText(ORIGINAL_IMAGE, { skipUpscaling: true });

    expect(mockWorker.recognize).toHaveBeenCalledWith(ORIGINAL_IMAGE, {}, { blocks: true });
    expect(toGrayscale).not.toHaveBeenCalled();
  });

  it('(b) passes the preprocessed image to recognize() when the setting is on', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installCanvasMock();
    installImageMock({ width: 100, height: 100 });

    await ocr_recognizeText(ORIGINAL_IMAGE, { skipUpscaling: true });

    expect(toGrayscale).toHaveBeenCalledTimes(1);
    const [passedImage] = mockWorker.recognize.mock.calls[0];
    expect(passedImage).not.toBe(ORIGINAL_IMAGE);
    expect(passedImage).toMatch(/^data:image\/png;base64,canvas-\d+$/);
  });

  it('(c) still recognizes successfully (with the original image) if preprocessing throws', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ocr: { offlineAccuracy: true } },
    });
    installCanvasMock();
    installImageMock({ width: 100, height: 100 });
    toGrayscale.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await ocr_recognizeText(ORIGINAL_IMAGE, { skipUpscaling: true });

    expect(mockWorker.recognize).toHaveBeenCalledWith(ORIGINAL_IMAGE, {}, { blocks: true });
    expect(result.text).toContain('hello');
  });
});
