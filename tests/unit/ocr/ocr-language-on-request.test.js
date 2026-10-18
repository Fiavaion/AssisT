/**
 * @jest-environment jsdom
 *
 * Reading in a language other than English (ADR 0008). English ships in the package and is read
 * from it. Any other language's file is asked of the service worker, the one route off the device,
 * which asks the student first; the file comes back as bytes, and the engine reads them from a
 * blob: URL made in the page, never from the network. A no, or no connection, reads the image as
 * English and says why, so the button always does something.
 */

import fs from 'fs';
import path from 'path';

jest.mock('../../../src/utils/third-party-client.js', () => ({
  requestThirdParty: jest.fn(),
}));

const mockWorker = { setParameters: jest.fn(), recognize: jest.fn(), terminate: jest.fn() };
const mockCreateWorker = jest.fn();
jest.mock('tesseract.js', () => ({
  createWorker: (...args) => mockCreateWorker(...args),
  PSM: { AUTO: 3 },
  OEM: { LSTM_ONLY: 1 },
}));

const { requestThirdParty } = require('../../../src/utils/third-party-client.js');
const { prepareOcrLanguage } = require('../../../src/features/ocr/ocr-language-data.js');
const { ocr_recognizeText } = require('../../../src/features/ocr/ocr.js');

const EXTENSION = 'chrome-extension://test-id/';
const ENGLISH_PATH = `${EXTENSION}node_modules/@tesseract.js-data/eng/4.0.0_best_int`;
const GZIP_BYTES = [31, 139, 8, 0, 9, 9];
const GZIP_BASE64 = btoa(String.fromCharCode(...GZIP_BYTES));

function blobBytes(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve([...new Uint8Array(reader.result)]);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  chrome.runtime.getURL.mockImplementation(p => `${EXTENSION}${p}`);
  chrome.storage.local.get.mockResolvedValue({});
  URL.createObjectURL = jest.fn(() => 'blob:https://canvas.example/abc');
  URL.revokeObjectURL = jest.fn();
  mockCreateWorker.mockResolvedValue(mockWorker);
  mockWorker.setParameters.mockResolvedValue(undefined);
  mockWorker.terminate.mockResolvedValue(undefined);
  mockWorker.recognize.mockResolvedValue({
    data: { text: 'Hola', confidence: 90, words: [], lines: [] },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('English', () => {
  test('is read from the package, with nothing asked of the worker', async () => {
    const prepared = await prepareOcrLanguage('eng');
    expect(requestThirdParty).not.toHaveBeenCalled();
    expect(prepared.language).toEqual({ code: 'eng', langPath: ENGLISH_PATH });
    expect(prepared.notice).toBeNull();
  });
});

describe('another language', () => {
  test('is asked of the worker by name, with the language shown in the question', async () => {
    requestThirdParty.mockResolvedValue({ success: true, data: { lang: 'spa', base64: GZIP_BASE64 } });

    await prepareOcrLanguage('spa');

    expect(requestThirdParty).toHaveBeenCalledWith(
      'ocrLanguages',
      { lang: 'spa' },
      { detail: 'Spanish', detailLabel: 'The language is:' }
    );
  });

  test('is handed to the engine from a blob: URL of exactly the bytes the worker sent', async () => {
    requestThirdParty.mockResolvedValue({ success: true, data: { lang: 'spa', base64: GZIP_BASE64 } });

    const prepared = await prepareOcrLanguage('spa');

    expect(prepared.notice).toBeNull();
    // tesseract.js appends "/spa.traineddata.gz"; after "#" that is a fragment a fetch ignores.
    expect(prepared.language).toEqual({
      code: 'spa',
      langPath: 'blob:https://canvas.example/abc#',
    });
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(await blobBytes(blob)).toEqual(GZIP_BYTES);

    prepared.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://canvas.example/abc');
  });

  test('the engine is created for that language, from that blob', async () => {
    requestThirdParty.mockResolvedValue({ success: true, data: { lang: 'spa', base64: GZIP_BASE64 } });
    const { language } = await prepareOcrLanguage('spa');

    await ocr_recognizeText('data:image/png;base64,AAAA', { language, upscaleFactor: 1.0 });

    const [lang, oem, options] = mockCreateWorker.mock.calls[0];
    expect(lang).toBe('spa');
    expect(oem).toBe(1);
    expect(options.langPath).toBe('blob:https://canvas.example/abc#');
    expect(options.workerPath.startsWith(EXTENSION)).toBe(true);
    expect(options.corePath.startsWith(EXTENSION)).toBe(true);
    expect(options.cacheMethod).toBe('none');
  });

  test('a no reads the image as English, says why, and is marked for an in-place Allow', async () => {
    requestThirdParty.mockResolvedValue({ success: false, code: 'consent-declined' });

    const prepared = await prepareOcrLanguage('spa');

    expect(prepared.language).toEqual({ code: 'eng', langPath: ENGLISH_PATH });
    expect(prepared.declined).toBe(true);
    expect(prepared.notice).toMatch(/Spanish/);
    expect(prepared.notice).toMatch(/read as English/);
    // The way to allow it is the notice's own Allow button, not directions to the popup.
    expect(prepared.notice).not.toMatch(/Your data|Advanced options/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('no connection reads the image as English and says the file could not be downloaded', async () => {
    requestThirdParty.mockResolvedValue({ success: false, code: 'network' });

    const prepared = await prepareOcrLanguage('jpn');

    expect(prepared.language.code).toBe('eng');
    expect(prepared.declined).toBe(false);
    expect(prepared.notice).toMatch(/Japanese/);
    expect(prepared.notice).toMatch(/could not be downloaded/);
  });

  test('a code nobody offers is read as English without asking anything', async () => {
    const prepared = await prepareOcrLanguage('xyz');
    expect(requestThirdParty).not.toHaveBeenCalled();
    expect(prepared.language.code).toBe('eng');
  });
});

describe('the hand-over depends on how tesseract.js builds the language URL', () => {
  // If an upgrade changes this, the "#" trick stops working: fail here, not in a student's OCR.
  const source = fs.readFileSync(
    path.join(__dirname, '../../../node_modules/tesseract.js/src/worker-script/index.js'),
    'utf8'
  );

  test('it strips only a trailing slash from langPath', () => {
    expect(source).toContain("path = langPathDownload.replace(/\\/$/, '');");
  });

  test('it appends "/<lang>.traineddata.gz" and fetches that', () => {
    expect(source).toContain("const fetchUrl = `${path}/${lang}.traineddata${gzip ? '.gz' : ''}`;");
  });
});
