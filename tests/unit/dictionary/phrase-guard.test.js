/**
 * @jest-environment jsdom
 *
 * A student selected a twenty-word sentence and chose Dictionary Lookup. The whole sentence
 * went to the dictionary API, which timed out, and the dialog sat on "Looking up ..." with no
 * label, no focus and no way out but the mouse.
 *
 * A dictionary looks up words. Anything longer is answered in the dialog, with no network call.
 */

const SENTENCE =
  'Dyslexia, also known as word blindness, is a learning disability that affects either reading, writing';

let lookup;

/** The worker's reply to a THIRD_PARTY_REQUEST, as the dictionary now receives it. */
function workerReplies(reply) {
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue(reply);
}

function modal() {
  return document.getElementById('assist-dictionary-modal');
}

function press(key) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  (document.activeElement || document.body).dispatchEvent(event);
  return event;
}

beforeAll(() => {
  chrome.storage.local.get = jest.fn((keys, callback) => {
    if (typeof callback === 'function') {
      callback({});
      return undefined;
    }
    return Promise.resolve({});
  });
  require('../../../src/features/dictionary/dictionary.js');
  lookup = window.assistFeatures.dictionary.lookup;
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn();
  chrome.runtime.sendMessage = jest.fn();
  document.body.innerHTML = '<p id="para">Dyslexia is a learning disability</p>';
});

afterEach(() => {
  window.assistFeatures.dictionary.hide();
  jest.useRealTimers();
});

describe('dictionary — a sentence is not a word', () => {
  test('a long selection is answered without a network call', async () => {
    await lookup(SENTENCE);
    jest.advanceTimersByTime(200);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(modal()).not.toBeNull();
    expect(modal().textContent).toMatch(/one word or a short phrase/i);
  });

  test('that answer is a labelled dialog the keyboard can leave', async () => {
    const para = document.getElementById('para');
    await lookup(SENTENCE, { returnFocus: para });
    jest.advanceTimersByTime(200);

    expect(modal().getAttribute('role')).toBe('dialog');
    expect(modal().getAttribute('aria-modal')).toBe('true');
    expect(modal().contains(document.activeElement)).toBe(true);

    press('Escape');

    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(para);
  });

  test('a short phrase of three words still gets looked up', async () => {
    workerReplies({
      success: true,
      data: [{ word: 'working memory', phonetics: [], meanings: [] }],
    });

    await lookup('working memory span');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'THIRD_PARTY_REQUEST',
      destination: 'dictionary',
      params: { word: 'working memory span' },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a lookup that times out gets one plain sentence, not a raw error', async () => {
    workerReplies({ success: false, code: 'timeout', error: 'Request timed out — try again' });

    await lookup('dyslexia');
    jest.advanceTimersByTime(200);

    expect(modal().textContent).toMatch(/could not reach the dictionary/i);
    expect(modal().textContent).not.toMatch(/timed out/);
    expect(modal().getAttribute('role')).toBe('dialog');
    expect(modal().contains(document.activeElement)).toBe(true);
  });

  test('the definition dialog is labelled and traps the keyboard', async () => {
    workerReplies({
      success: true,
      data: [
        {
          word: 'dyslexia',
          phonetics: [],
          meanings: [
            { partOfSpeech: 'noun', definitions: [{ definition: 'A reading difficulty' }] },
          ],
        },
      ],
    });

    const para = document.getElementById('para');
    await lookup('dyslexia', { returnFocus: para });
    jest.advanceTimersByTime(200);

    expect(modal().getAttribute('role')).toBe('dialog');
    expect(modal().querySelector('#assist-dictionary-title')).not.toBeNull();
    expect(modal().contains(document.activeElement)).toBe(true);

    press('Escape');

    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(para);
  });
});
