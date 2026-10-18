/**
 * Read Aloud from the highlight menu reads the selected words, whether or not the student has
 * switched the Read Aloud feature on.
 *
 * With the feature off, the menu's Read Aloud painted the reading outline and the yellow
 * highlight over the whole article holding the selection. Nothing on the page is the student's
 * to see in that mode: the voice reads, and the page stays exactly as it was. With the feature
 * on, the selection is highlighted word by word as their settings ask, and taken off again.
 *
 * A read that is stopped, or replaced, before its voice has started must not start later: a
 * second read begun inside that settling window used to snapshot the first read's outline and
 * highlight as the page's own style, and put them back for good when it ended.
 */

/** The content script's chrome.runtime.onMessage handler, captured at load. */
let messageListener;

/** Stand-in for window.speechSynthesis. Plain object — jest's resetMocks would wipe mock impls. */
const synth = {
  speaking: false,
  paused: false,
  pending: false,
  spoken: [],
  getVoices: () => [],
  speak(utterance) {
    this.spoken.push(utterance);
    this.speaking = true;
  },
  cancel() {
    this.speaking = false;
    this.paused = false;
  },
  pause() {
    this.paused = true;
  },
  resume() {
    this.paused = false;
  },
  addEventListener() {},
  removeEventListener() {},
};

function lastUtterance() {
  return synth.spoken[synth.spoken.length - 1];
}

/** readText defers speaking by 100 ms so Chrome can settle after cancel(). */
function afterSpeechStarts() {
  return new Promise(resolve => setTimeout(resolve, 200));
}

function findContentScriptListener() {
  const listeners = global.chrome.runtime.onMessage.addListener.mock.calls.map(call => call[0]);
  return listeners.find(listener => {
    let response = null;
    try {
      listener({ type: 'PING' }, { id: chrome.runtime.id }, reply => {
        response = reply;
      });
    } catch {
      return false;
    }
    return Boolean(response && response.loaded);
  });
}

function sendTtsCommand(command, data = {}) {
  messageListener(
    { type: 'TTS_COMMAND', data: { command, ...data } },
    { id: chrome.runtime.id },
    () => {}
  );
}

function pressKey(key) {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
}

/** A news article, its own inline style included, as a student would find it. */
function givenArticle() {
  document.body.innerHTML =
    '<article id="story" style="color: rgb(20, 20, 20);">' +
    '<p id="p1">First paragraph of the news story.</p>' +
    '<p id="p2" style="margin: 0px;">Second paragraph follows here.</p>' +
    '</article>';
  return document.getElementById('story');
}

/** "paragraph of the news story." through "Second", across both paragraphs. */
function selectAcrossParagraphs() {
  const range = document.createRange();
  range.setStart(document.getElementById('p1').firstChild, 6);
  range.setEnd(document.getElementById('p2').firstChild, 6);
  return range;
}

beforeAll(async () => {
  global.chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  global.window.speechSynthesis = synth;
  global.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.rate = 1;
    }
  };
  global.window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance;
  global.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  await import('../../../src/content/content-simple.js');
  messageListener = findContentScriptListener();
  expect(messageListener).toBeDefined();
});

beforeEach(() => {
  synth.speaking = false;
  synth.paused = false;
  synth.spoken = [];
  sendTtsCommand('setHighlighting', { enabled: true });
  sendTtsCommand('setWordByWord', { enabled: true });
  sendTtsCommand('setRate', { rate: 1.4 });
});

afterEach(() => {
  sendTtsCommand('stop');
  document.body.innerHTML = '';
});

describe('with the Read Aloud feature switched off', () => {
  beforeEach(() => sendTtsCommand('disable'));

  test('reads exactly the selected words, at the saved rate', async () => {
    givenArticle();

    expect(window.readSelection(selectAcrossParagraphs())).toBe(true);
    await afterSpeechStarts();

    expect(synth.spoken).toHaveLength(1);
    expect(lastUtterance().text).toBe('paragraph of the news story.\n\nSecond');
    expect(lastUtterance().rate).toBe(1.4);
  });

  test.each([
    ['word by word', true],
    ['whole block', false],
  ])('puts nothing on the page while reading (%s highlighting)', async (_mode, wordByWord) => {
    sendTtsCommand('setWordByWord', { enabled: wordByWord });
    const article = givenArticle();
    const before = article.outerHTML;

    window.readSelection(selectAcrossParagraphs());
    await afterSpeechStarts();

    expect(article.outerHTML).toBe(before);
    lastUtterance().onend();
    expect(article.outerHTML).toBe(before);
  });

  test('a speed change mid-read restarts the voice and still paints nothing', async () => {
    const article = givenArticle();
    const before = article.outerHTML;
    window.readSelection(selectAcrossParagraphs());
    await afterSpeechStarts();

    pressKey('+');
    await afterSpeechStarts();
    await afterSpeechStarts();

    expect(synth.spoken.length).toBeGreaterThan(1);
    expect(article.outerHTML).toBe(before);
  });
});

describe('with the Read Aloud feature switched on', () => {
  beforeEach(() => sendTtsCommand('enable'));

  test('highlights the selection word by word, and restores the page when done', async () => {
    const article = givenArticle();
    const before = article.outerHTML;

    window.readSelection(selectAcrossParagraphs());
    await afterSpeechStarts();

    expect(article.querySelectorAll('.assist-word').length).toBeGreaterThan(0);
    lastUtterance().onend();
    expect(article.outerHTML).toBe(before);
  });
});

describe('a read stopped before its voice starts', () => {
  beforeEach(() => sendTtsCommand('enable'));

  test('never starts', async () => {
    const article = givenArticle();
    const before = article.outerHTML;

    window.readSelection(selectAcrossParagraphs());
    sendTtsCommand('stop');
    await afterSpeechStarts();

    expect(synth.spoken).toHaveLength(0);
    expect(article.outerHTML).toBe(before);
  });

  test('replaced by a second read, leaves the page as it was once that one ends', async () => {
    const article = givenArticle();
    const before = article.outerHTML;

    window.readSelection(selectAcrossParagraphs());
    window.readSelection(selectAcrossParagraphs());
    await afterSpeechStarts();

    expect(synth.spoken).toHaveLength(1);
    lastUtterance().onend();
    expect(article.outerHTML).toBe(before);
  });
});
