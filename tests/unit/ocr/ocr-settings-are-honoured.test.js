/**
 * OCR's settings, tested on what they do rather than on whether their switch clicks.
 *
 * The suite that once covered this area only drove the popup: it set a slider and read the
 * label back. That proves the popup can change its own mind, not that a capture recognises
 * Spanish, discards a word the engine was not sure of, or zooms the image before reading it.
 * This file follows each setting from the store the popup writes into the call the engine
 * receives, and for auto-play, what the student hears once recognition finishes.
 *
 * Node, not jsdom for the reachability check, and jsdom for the recognition path because
 * ocr_recognizeText builds canvases. Tesseract, Image and canvas are mocked for the same
 * reason the sibling wiring test mocks them: jsdom decodes no images and has no 2D context.
 *
 * @jest-environment jsdom
 */

import fs from 'fs';
import path from 'path';

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

const { ocr_performOCR, ocr_recognizeText } = require('../../../src/features/ocr/ocr.js');

const SRC = path.join(__dirname, '../../../src');
const IMAGE = 'data:image/png;base64,ORIGINAL';

/**
 * A Tesseract result with words of known, differing confidence, so a threshold has something
 * to bite on.
 */
function resultWithConfidences() {
  return {
    data: {
      text: 'Photosynthesis\nrnakes glucose',
      confidence: 71,
      words: [
        { text: 'Photosynthesis', confidence: 96 },
        { text: 'rnakes', confidence: 32 },
        { text: 'glucose', confidence: 88 },
      ],
      lines: [],
    },
  };
}

const OriginalImage = global.Image;
const OriginalCreateElement = document.createElement.bind(document);

/** jsdom does not decode images, so Image is replaced with one whose onload fires. */
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
      Promise.resolve().then(() => this.onload && this.onload());
    }

    get src() {
      return this._src;
    }
  }
  global.Image = FakeImage;
}

/**
 * Stubs canvas creation, recording the size each canvas was set to so the upscale factor is
 * observable. jsdom's getContext('2d') returns null without the native canvas package.
 *
 * @returns {Array<{width: number, height: number}>} The canvases created, in order.
 */
function installCanvasMock() {
  const created = [];
  let counter = 0;
  jest.spyOn(document, 'createElement').mockImplementation(tag => {
    if (tag !== 'canvas') {
      return OriginalCreateElement(tag);
    }
    const id = `canvas-${counter++}`;
    const ctx = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4), width: 10, height: 10 })),
      putImageData: jest.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: '',
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ctx),
      toDataURL: jest.fn(() => `data:image/png;base64,${id}`),
    };
    created.push(canvas);
    return canvas;
  });
  return created;
}

// jest.config.cjs sets resetMocks: true, which wipes the factory implementations above before
// every test, so they are installed here rather than at module scope.
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCreateWorker.mockResolvedValue(mockWorker);
  mockWorker.setParameters.mockResolvedValue(undefined);
  mockWorker.terminate.mockResolvedValue(undefined);
  mockWorker.recognize.mockResolvedValue(resultWithConfidences());
  chrome.storage.local.get.mockResolvedValue({});
});

afterEach(() => {
  global.Image = OriginalImage;
  jest.restoreAllMocks();
});

/** The worker's reply to a language-file request: a few gzip bytes, as base64. */
const LANGUAGE_FILE = { success: true, data: { base64: btoa('\x1f\x8b\x08\x00') } };

describe('language', () => {
  test('English is the fallback when no language is given', async () => {
    await ocr_recognizeText(IMAGE, { upscaleFactor: 1.0 });

    expect(mockCreateWorker.mock.calls[0][0]).toBe('eng');
  });

  test('the popup offers every language the engine can read: English and the 13 on request', () => {
    // English ships in the package and the others are downloaded on request (ADR 0008).
    const { TOOLS } = require('../../../src/popup/registry/tool-registry.js');
    const { OCR_LANGUAGES } = require('../../../src/features/ocr/ocr-engine-files.js');
    const control = TOOLS.find(tool => tool.id === 'ocr').controls.find(c => c.id === 'ocr-language');

    expect(OCR_LANGUAGES).toHaveLength(14);
    expect(control.options.map(option => option.value)).toEqual(OCR_LANGUAGES);
  });

  test('every language the popup offers is a code the engine is asked for verbatim', async () => {
    // The popup's list and the engine's argument must be the same vocabulary. A label-to-code
    // mismatch would look like a recognition failure rather than a wiring one.
    const { TOOLS } = require('../../../src/popup/registry/tool-registry.js');
    const { prepareOcrLanguage } = require('../../../src/features/ocr/ocr-language-data.js');
    const control = TOOLS.find(tool => tool.id === 'ocr').controls.find(c => c.id === 'ocr-language');
    chrome.runtime.sendMessage.mockResolvedValue(LANGUAGE_FILE);
    URL.createObjectURL = jest.fn(() => 'blob:https://page.example/1');
    URL.revokeObjectURL = jest.fn();

    for (const option of control.options) {
      mockCreateWorker.mockClear();
      const { language } = await prepareOcrLanguage(option.value);
      await ocr_recognizeText(IMAGE, { language, upscaleFactor: 1.0 });
      expect(mockCreateWorker.mock.calls[0][0]).toBe(option.value);
    }
  });
});

describe('confidence threshold', () => {
  test('a word the engine was unsure of is dropped from the text', async () => {
    // "rnakes" is the classic rn/m misread. At 32% confidence a threshold of 60 should keep it
    // out of what gets read aloud, rather than have TTS pronounce a word that was never there.
    const { text } = await ocr_recognizeText(IMAGE, { confidenceThreshold: 60, upscaleFactor: 1.0 });

    expect(text).toContain('Photosynthesis');
    expect(text).toContain('glucose');
    expect(text).not.toContain('rnakes');
  });

  test('a lower threshold keeps the word the higher one discarded', async () => {
    // Proves the number is used, not that some fixed filter happens to match it.
    const { text } = await ocr_recognizeText(IMAGE, { confidenceThreshold: 30, upscaleFactor: 1.0 });

    expect(text).toContain('rnakes');
  });

  test('a threshold of zero returns the engine’s text untouched', async () => {
    // The bottom of the slider means "show me everything", including the line breaks the word
    // list loses — which is why the fixture's raw text is not simply its words joined by spaces.
    const { text } = await ocr_recognizeText(IMAGE, { confidenceThreshold: 0, upscaleFactor: 1.0 });

    expect(text).toBe('Photosynthesis\nrnakes glucose');
  });

  test('the original text is returned alongside the filtered one, whatever the threshold', async () => {
    // Filtering is not destructive: the unfiltered text stays available for the layout and for a
    // student who wants to check what was thrown away.
    const result = await ocr_recognizeText(IMAGE, {
      confidenceThreshold: 90,
      upscaleFactor: 1.0,
    });

    expect(result.text).not.toContain('glucose');
    expect(result.originalText).toBe('Photosynthesis\nrnakes glucose');
  });
});

describe('upscale factor', () => {
  test('a factor above one enlarges the image by that factor before recognition', async () => {
    // Small text on a lecture slide is the case this exists for: the engine reads a 2x image far
    // better than the original, so the number must reach the canvas.
    installImageMock({ width: 300, height: 200 });
    const canvases = installCanvasMock();

    await ocr_recognizeText(IMAGE, { upscaleFactor: 2.0 });

    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases[0].width).toBe(600);
    expect(canvases[0].height).toBe(400);
    expect(mockWorker.recognize.mock.calls[0][0]).not.toBe(IMAGE);
  });

  test('a different factor gives a different size, so the setting is not a constant', async () => {
    installImageMock({ width: 300, height: 200 });
    const canvases = installCanvasMock();

    await ocr_recognizeText(IMAGE, { upscaleFactor: 1.5 });

    expect(canvases[0].width).toBe(450);
    expect(canvases[0].height).toBe(300);
  });

  test('a factor of one leaves the image exactly as captured', async () => {
    installImageMock({ width: 300, height: 200 });
    const canvases = installCanvasMock();

    await ocr_recognizeText(IMAGE, { upscaleFactor: 1.0 });

    expect(canvases).toHaveLength(0);
    expect(mockWorker.recognize.mock.calls[0][0]).toBe(IMAGE);
  });

  test('skipUpscaling wins over the factor, for an image that is already sharp', async () => {
    installImageMock({ width: 300, height: 200 });
    const canvases = installCanvasMock();

    await ocr_recognizeText(IMAGE, { upscaleFactor: 3.0, skipUpscaling: true });

    expect(canvases).toHaveLength(0);
    expect(mockWorker.recognize.mock.calls[0][0]).toBe(IMAGE);
  });
});

describe('auto-activate reading mode, and auto-TTS', () => {
  /**
   * The OCR feature's own source, concatenated. A setting the popup writes into
   * assist_settings.ocr has to be read here, in the capture path, or the switch in front of the
   * student is decoration. The popup and the defaults table in storage-manager.js only ever write
   * the key, so neither counts as a reader and neither is scanned.
   *
   * @returns {string} Every .js file under src/features/ocr.
   */
  function ocrFeatureSource() {
    const dir = path.join(SRC, 'features/ocr');
    return fs
      .readdirSync(dir)
      .filter(name => name.endsWith('.js'))
      .map(name => fs.readFileSync(path.join(dir, name), 'utf8'))
      .join('\n');
  }

  test('autoActivateReadingMode is read by the capture path, not only written by the popup', () => {
    // Turning it off means "capture the page as it is"; leaving it on means reading mode opens
    // first so the capture gets the stripped-back article. Either way something has to read it.
    expect(ocrFeatureSource()).toMatch(/\bautoActivateReadingMode\b/);
  });

  test('autoTTS is read by the capture path, not only written by the popup', () => {
    expect(ocrFeatureSource()).toMatch(/\bautoTTS\b/);
  });
});

describe('auto-play of the recognised text', () => {
  const VOICES = [
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Aria', lang: 'en-US' },
  ];
  const SAVED_TTS = { voice: 'Aria', rate: 1.35, pitch: 0.9, volume: 0.8 };
  const originalSynth = window.speechSynthesis;
  let stored;

  /** Polls until `check` returns something truthy; the capture flow has real timers in it. */
  async function waitFor(check, ms = 3000) {
    const started = Date.now();
    while (!check()) {
      if (Date.now() - started > ms) {
        throw new Error('timed out waiting');
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return check();
  }

  function press(element) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  /**
   * Starts a capture, picks "Visible Area Only" (or Cancel), and waits for the result dialog.
   *
   * @returns {Promise<{done: Promise<Object|null>}>}
   */
  async function capture({ cancel = false } = {}) {
    const done = ocr_performOCR();
    await waitFor(() => document.getElementById('assist-ocr-visible'));
    if (cancel) {
      press(document.getElementById('assist-ocr-cancel'));
      return { done };
    }
    press(document.getElementById('assist-ocr-visible'));
    await waitFor(() => document.getElementById('assist-ocr-layout-modal'));
    // Give anything the dialog starts on open a chance to run before asserting it did not.
    await new Promise(resolve => setTimeout(resolve, 50));
    return { done };
  }

  function closeDialog() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  beforeEach(() => {
    stored = {
      ocr: { autoTTS: true, autoActivateReadingMode: false, upscaleFactor: 1.0 },
      tts: { ...SAVED_TTS },
    };
    // Both call forms: the capture path awaits the promise, the speech path passes a callback.
    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      const result = { assist_settings: stored, aiMode: 'off' };
      if (typeof callback === 'function') {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    });
    chrome.runtime.sendMessage.mockResolvedValue({ dataUrl: IMAGE });
    window.speechSynthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      getVoices: jest.fn(() => VOICES),
    };
    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    window.assistFeatures = window.assistFeatures || {};
    delete window.assistFeatures.readingMode;
  });

  afterEach(() => {
    closeDialog();
    document.body.innerHTML = '';
    window.speechSynthesis = originalSynth;
    delete global.SpeechSynthesisUtterance;
    delete window.assistFeatures.readingMode;
  });

  test('the saved language is the one the recognition worker is created for', async () => {
    // A handout read with the engine loaded for another language comes back as nonsense, and
    // nothing in the UI would say why. Spanish is downloaded on request, through the worker.
    stored.ocr.language = 'spa';
    chrome.runtime.sendMessage.mockImplementation(message =>
      Promise.resolve(
        message?.type === 'THIRD_PARTY_REQUEST' ? LANGUAGE_FILE : { dataUrl: IMAGE }
      )
    );
    URL.createObjectURL = jest.fn(() => 'blob:https://page.example/1');
    URL.revokeObjectURL = jest.fn();

    const { done } = await capture();
    closeDialog();
    await done;

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'THIRD_PARTY_REQUEST',
      destination: 'ocrLanguages',
      params: { lang: 'spa' },
    });
    expect(mockCreateWorker.mock.calls[0][0]).toBe('spa');
    expect(mockCreateWorker.mock.calls[0][2].langPath).toBe('blob:https://page.example/1#');
    // The page's copy of the file is let go once recognition is over.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://page.example/1');
  });

  test('a language the student declined is explained in the result, with Allow in place', async () => {
    stored.ocr.language = 'spa';
    chrome.runtime.sendMessage.mockImplementation(message =>
      Promise.resolve(
        message?.type === 'THIRD_PARTY_REQUEST'
          ? { success: false, code: 'consent-declined' }
          : { dataUrl: IMAGE }
      )
    );

    const { done } = await capture();

    const modal = document.getElementById('assist-ocr-layout-modal');
    expect(modal.textContent).toMatch(/Spanish/);
    expect(modal.textContent).toMatch(/read as English/);
    const notice = modal.querySelector('[data-assist-consent-notice="ocrLanguages"]');
    expect(notice.querySelector('button').textContent).toBe('Allow jsDelivr');
    closeDialog();
    await done;
  });

  test('an Allow that lands after the dialog was closed starts nothing', async () => {
    // The consent window can be answered long after the student closed the OCR result; a capture
    // appearing out of nowhere then would be a surprise (SC 3.2.2).
    stored.ocr.language = 'spa';
    let windowAnswer;
    chrome.runtime.onMessage.addListener.mockImplementation(listener => {
      windowAnswer = listener;
    });
    chrome.runtime.sendMessage.mockImplementation(message => {
      if (message?.type === 'THIRD_PARTY_REQUEST') {
        return Promise.resolve({ success: false, code: 'consent-declined' });
      }
      if (message?.type === 'CONSENT_WINDOW_OPEN') {
        return Promise.resolve({ success: true, request: 'r1' });
      }
      return Promise.resolve({ dataUrl: IMAGE });
    });

    const { done } = await capture();
    const allow = document.querySelector('[data-assist-consent-notice="ocrLanguages"] button');
    press(allow);
    await waitFor(() => windowAnswer);
    closeDialog();
    await done;

    windowAnswer({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'granted' });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(document.getElementById('assist-ocr-visible')).toBeNull();
  });

  test('with the setting on, the recognised text is read aloud once the dialog opens', async () => {
    const { done } = await capture();

    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak.mock.calls[0][0].text).toContain('Photosynthesis');

    closeDialog();
    await done;
  });

  test('it speaks in the saved voice, rate, pitch and volume', async () => {
    const { done } = await capture();

    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice.name).toBe('Aria');
    expect(utterance.rate).toBe(1.35);
    expect(utterance.pitch).toBe(0.9);
    expect(utterance.volume).toBe(0.8);

    closeDialog();
    await done;
  });

  test('with no voice chosen, it speaks in a device voice, not the Google network voice', async () => {
    const onDevice = { name: 'Microsoft Hazel', lang: 'en-GB', localService: true };
    window.speechSynthesis.getVoices = jest.fn(() => [
      { name: 'Google UK English Female', lang: 'en-GB', localService: false },
      onDevice,
    ]);
    stored.tts.voice = 'default';

    const { done } = await capture();

    expect(window.speechSynthesis.speak.mock.calls[0][0].voice).toBe(onDevice);
    closeDialog();
    await done;
  });

  test('a saved volume of 0 is honoured, as the popup slider shows it', async () => {
    stored.tts.volume = 0;

    const { done } = await capture();

    expect(window.speechSynthesis.speak.mock.calls[0][0].volume).toBe(0);
    closeDialog();
    await done;
  });

  test('with the setting off, nothing is spoken', async () => {
    stored.ocr.autoTTS = false;

    const { done } = await capture();

    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    closeDialog();
    await done;
  });

  test('with the setting never chosen, nothing is spoken: auto-play is off by default', async () => {
    delete stored.ocr.autoTTS;

    const { done } = await capture();

    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    closeDialog();
    await done;
  });

  test('a recognition that found no text says nothing', async () => {
    mockWorker.recognize.mockResolvedValue({
      data: { text: '', confidence: 0, words: [], lines: [] },
    });

    const { done } = await capture();

    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    closeDialog();
    await done;
  });

  test('a cancelled capture says nothing and opens no dialog', async () => {
    const { done } = await capture({ cancel: true });

    await expect(done).resolves.toBeNull();
    expect(document.getElementById('assist-ocr-layout-modal')).toBeNull();
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  test('closing the dialog stops the reading', async () => {
    const { done } = await capture();

    closeDialog();
    await done;

    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

  test('with reading mode also on, it reads over reading mode and stops before leaving it', async () => {
    // Reading mode is entered for the capture and left when the dialog closes. The voice belongs to
    // the dialog, so it starts while reading mode is still up and is stopped before reading mode
    // goes, never the other way round.
    stored.ocr.autoActivateReadingMode = true;
    let active = false;
    window.assistFeatures.readingMode = {
      isActive: jest.fn(() => active),
      enter: jest.fn(async () => {
        active = true;
      }),
      exit: jest.fn(() => {
        active = false;
      }),
    };

    const { done } = await capture();

    expect(window.assistFeatures.readingMode.enter).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(window.assistFeatures.readingMode.exit).not.toHaveBeenCalled();

    closeDialog();
    await done;

    expect(window.assistFeatures.readingMode.exit).toHaveBeenCalledTimes(1);
    expect(window.speechSynthesis.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      window.assistFeatures.readingMode.exit.mock.invocationCallOrder[0]
    );
  });
});

describe('auto-play is off unless the student turns it on', () => {
  const { StorageManager } = require('../../../src/utils/storage-manager.js');

  test('the settings defaults declare it off', () => {
    expect(StorageManager.DEFAULT_SETTINGS.ocr.autoTTS).toBe(false);
  });

  test('the registry declares it off', () => {
    const { TOOLS } = require('../../../src/popup/registry/tool-registry.js');
    const control = TOOLS.find(tool => tool.id === 'ocr').controls.find(c => c.id === 'ocr-auto-tts');

    expect(control.default).toBe(false);
  });

  test('the popup markup ships the switch unchecked', () => {
    const html = fs.readFileSync(path.join(SRC, 'popup/popup.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.getElementById('ocr-auto-tts').hasAttribute('checked')).toBe(false);
  });

  test('a student who switched it on keeps it on', () => {
    expect(StorageManager.withDefaults({ ocr: { autoTTS: true } }).ocr.autoTTS).toBe(true);
  });
});
