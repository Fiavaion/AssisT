/**
 * Read from Images runs only code that shipped in the package (ADR 0008).
 *
 * Given no paths, tesseract.js 5 fetches its worker script and its WebAssembly core from
 * cdn.jsdelivr.net and runs them, which Manifest V3 and the Chrome Web Store forbid, and fetches the
 * language model from there too, from the visited page's origin and with no consent asked. These
 * tests pin what the recognition worker is actually given, so that a call without paths fails here
 * rather than in store review.
 *
 * @jest-environment jsdom
 */

const mockWorker = {
  setParameters: jest.fn(),
  recognize: jest.fn(),
  terminate: jest.fn(),
};
const mockCreateWorker = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: (...args) => mockCreateWorker(...args),
  PSM: { AUTO: 3 },
  OEM: { LSTM_ONLY: 1 },
}));

const { ocr_recognizeText } = require('../../../src/features/ocr/ocr.js');

const IMAGE = 'data:image/png;base64,ORIGINAL';
const EXTENSION = 'chrome-extension://test-id/';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  // resetMocks wipes the setup file's implementation before every test.
  chrome.runtime.getURL.mockImplementation(path => `${EXTENSION}${path}`);
  chrome.storage.local.get.mockResolvedValue({});
  mockCreateWorker.mockResolvedValue(mockWorker);
  mockWorker.setParameters.mockResolvedValue(undefined);
  mockWorker.terminate.mockResolvedValue(undefined);
  mockWorker.recognize.mockResolvedValue({
    data: { text: 'Photosynthesis', confidence: 90, words: [], lines: [] },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The worker built for the language a caller gives no other: English, from the package. */
async function workerOptionsFor() {
  await ocr_recognizeText(IMAGE, { upscaleFactor: 1.0 });
  expect(mockCreateWorker).toHaveBeenCalledTimes(1);
  return mockCreateWorker.mock.calls[0];
}

describe('the recognition worker is built from the package', () => {
  test('the worker script is the copy shipped with the extension', async () => {
    const [, , options] = await workerOptionsFor();
    expect(options.workerPath).toBe(`${EXTENSION}node_modules/tesseract.js/dist/worker.min.js`);
  });

  test('the WebAssembly core comes from the shipped directory, so tesseract still picks SIMD', async () => {
    const [, , options] = await workerOptionsFor();
    expect(options.corePath).toBe(`${EXTENSION}node_modules/tesseract.js-core`);
  });

  test('the English model is read from the package', async () => {
    const [lang, , options] = await workerOptionsFor();
    expect(lang).toBe('eng');
    expect(options.langPath).toBe(`${EXTENSION}node_modules/@tesseract.js-data/eng/4.0.0_best_int`);
  });

  test('nothing is cached in the visited site’s IndexedDB', async () => {
    // The default cache writes the model into the page origin's IndexedDB, leaving the host site a
    // record that the student used the extension. The file is on disk already.
    const [, , options] = await workerOptionsFor();
    expect(options.cacheMethod).toBe('none');
  });

  test('the engine runs LSTM only, the mode the shipped cores are built for', async () => {
    const [, oem] = await workerOptionsFor();
    expect(oem).toBe(1);
  });

  test('every path handed to the worker is inside the extension', async () => {
    const [, , options] = await workerOptionsFor();
    for (const key of ['workerPath', 'corePath', 'langPath']) {
      expect(options[key].startsWith(EXTENSION)).toBe(true);
    }
  });
});

// Another language's file is downloaded on request: ocr-language-on-request.test.js.
