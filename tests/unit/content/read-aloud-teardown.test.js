/**
 * Read-aloud teardown: one cleanup path, and Escape stops the voice.
 *
 * Overnight release testing of read-aloud (the release Success Metric) found three defects in the
 * orchestrator's teardown:
 *   - an in-page navigation mid-read cancelled the speech but left the <span class="assist-word">
 *     wrappers and the paragraph highlight on the page until reload;
 *   - clicking a plain #hash anchor while listening counted as a navigation and tore the content
 *     script down;
 *   - Escape did nothing at all while reading, and a normal stop left the paragraph carrying
 *     style="" or a leftover `transition: background-color 0.2s`.
 *
 * These tests drive the real content script against the real highlighting module, so they assert
 * the DOM a student is left with.
 */

/** The content script's chrome.runtime.onMessage handler, captured at load. */
let messageListener;

/** Stand-in for window.speechSynthesis. Plain object — jest's resetMocks would wipe mock impls. */
const synth = {
  speaking: false,
  paused: false,
  pending: false,
  cancelCount: 0,
  spoken: [],
  getVoices: () => [],
  speak(utterance) {
    this.spoken.push(utterance);
    this.speaking = true;
  },
  cancel() {
    this.cancelCount += 1;
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

/** The utterance currently being spoken, i.e. the one whose events the content script listens to. */
function lastUtterance() {
  return synth.spoken[synth.spoken.length - 1];
}

/** readText defers speaking by 100 ms so Chrome can settle after cancel(). */
function afterSpeechStarts() {
  return new Promise(resolve => setTimeout(resolve, 200));
}

/**
 * The orchestrator is not the only module that registers a runtime message listener, so pick it
 * out by the one message only it answers: PING replies {loaded: true}.
 */
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

/** Put one readable paragraph on the page and return it. */
function givenParagraph(text, style) {
  document.body.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.id = 'p1';
  paragraph.textContent = text;
  if (style) {
    paragraph.setAttribute('style', style);
  }
  document.body.appendChild(paragraph);
  return paragraph;
}

async function readAloud(paragraph) {
  window.readText(paragraph.textContent, paragraph, [paragraph]);
  await afterSpeechStarts();
}

/** A same-document route change, as Canvas performs it. */
function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('popstate'));
}

function pressKey(key, target = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
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

  sendTtsCommand('enable');
  sendTtsCommand('setHighlighting', { enabled: true });
});

beforeEach(() => {
  synth.speaking = false;
  synth.paused = false;
  synth.cancelCount = 0;
  synth.spoken = [];
  // A real route change, so the content script's own idea of the current URL is in step.
  navigateTo('/courses/1/pages/one');
  sendTtsCommand('setWordByWord', { enabled: false });
});

afterEach(() => {
  // Leave no read running into the next test.
  pressKey('Escape');
  document.body.innerHTML = '';
});

describe('word-by-word read torn down by an in-page navigation', () => {
  test('removes every word wrapper, the highlight and the outline', async () => {
    sendTtsCommand('setWordByWord', { enabled: true });
    const paragraph = givenParagraph('Working memory holds only a little at a time.');

    await readAloud(paragraph);
    expect(paragraph.querySelectorAll('.assist-word').length).toBeGreaterThan(0);

    navigateTo('/courses/1/pages/two');

    expect(document.querySelectorAll('.assist-word')).toHaveLength(0);
    expect(paragraph.getAttribute('style')).toBeNull();
    expect(synth.cancelCount).toBeGreaterThan(0);
  });

  test('the late "canceled" error does not put the styling back', async () => {
    sendTtsCommand('setWordByWord', { enabled: true });
    const paragraph = givenParagraph('Working memory holds only a little at a time.');

    await readAloud(paragraph);
    const utterance = lastUtterance();
    navigateTo('/courses/1/pages/two');

    // Chrome delivers cancel as an async onerror against the utterance that was cancelled.
    utterance.onerror({ error: 'canceled' });

    expect(document.querySelectorAll('.assist-word')).toHaveLength(0);
    expect(paragraph.getAttribute('style')).toBeNull();
  });
});

describe('whole-paragraph read torn down by an in-page navigation', () => {
  test('removes the yellow background and the reading outline', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');

    await readAloud(paragraph);
    expect(paragraph.style.backgroundColor).not.toBe('');
    expect(paragraph.style.outline).not.toBe('');

    navigateTo('/courses/1/pages/two');

    expect(paragraph.getAttribute('style')).toBeNull();
  });
});

describe('a pure hash change is not a navigation', () => {
  test('clicking an anchor on the same page keeps the voice and the highlight', async () => {
    sendTtsCommand('setWordByWord', { enabled: true });
    const paragraph = givenParagraph('Working memory holds only a little at a time.');

    await readAloud(paragraph);
    const wrappers = paragraph.querySelectorAll('.assist-word').length;

    navigateTo('/courses/1/pages/one#section-2');

    expect(synth.cancelCount).toBe(0);
    expect(paragraph.querySelectorAll('.assist-word')).toHaveLength(wrappers);
  });
});

describe('Escape stops read-aloud', () => {
  test('stops the voice and clears the page while speech is active', async () => {
    sendTtsCommand('setWordByWord', { enabled: true });
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);

    const event = pressKey('Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(synth.cancelCount).toBe(1);
    expect(document.querySelectorAll('.assist-word')).toHaveLength(0);
    expect(paragraph.getAttribute('style')).toBeNull();
  });

  test('stops a paused read too', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    pressKey(' ');
    expect(synth.paused).toBe(true);

    pressKey('Escape');

    expect(synth.cancelCount).toBe(1);
    expect(paragraph.getAttribute('style')).toBeNull();
  });

  test('is left alone when nothing is being read', () => {
    givenParagraph('Working memory holds only a little at a time.');

    const event = pressKey('Escape');

    expect(event.defaultPrevented).toBe(false);
    expect(synth.cancelCount).toBe(0);
  });

  test('belongs to an AssisT dialog while one is open', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    const dialog = document.createElement('div');
    dialog.id = 'assist-translation-modal';
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    const event = pressKey('Escape');

    expect(event.defaultPrevented).toBe(false);
    expect(synth.cancelCount).toBe(0);
    expect(paragraph.style.backgroundColor).not.toBe('');
  });

  test('belongs to the AssisT panel the student is focused in', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    const sidebar = document.createElement('aside');
    sidebar.id = 'assist-annotation-sidebar';
    const closeButton = document.createElement('button');
    sidebar.appendChild(closeButton);
    document.body.appendChild(sidebar);
    closeButton.focus();

    const event = pressKey('Escape', closeButton);

    expect(event.defaultPrevented).toBe(false);
    expect(synth.cancelCount).toBe(0);
  });

  test('is never taken from a student who is typing', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = pressKey('Escape', input);

    expect(event.defaultPrevented).toBe(false);
    expect(synth.cancelCount).toBe(0);
  });
});

/**
 * News sites leave cookie and sign-up dialogs in the page: closed but still in the DOM, or open
 * and ignored. A page dialog only owns Escape while the student is in it; otherwise Escape is the
 * one key that stops a read, and a dialog merely being there took it away.
 */
describe("Escape and the host page's own dialogs", () => {
  function addPageDialog(attributes) {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.className = 'cookie-consent';
    Object.entries(attributes).forEach(([name, value]) => dialog.setAttribute(name, value));
    const accept = document.createElement('button');
    accept.textContent = 'Accept cookies';
    dialog.appendChild(accept);
    document.body.appendChild(dialog);
    return dialog;
  }

  test.each([
    ['closed with display: none', { style: 'display: none;' }],
    [
      'faded out and hidden from assistive technology',
      { style: 'opacity: 0;', 'aria-hidden': 'true' },
    ],
    ['visible but not focused', { 'aria-modal': 'false' }],
  ])('a page dialog %s does not stop Escape ending the read', async (_name, attributes) => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    addPageDialog(attributes);

    const event = pressKey('Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(synth.cancelCount).toBe(1);
    expect(paragraph.getAttribute('style')).toBeNull();
  });

  test('a page dialog the student is working in keeps its Escape', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    const accept = addPageDialog({}).querySelector('button');
    accept.focus();

    const event = pressKey('Escape', accept);

    expect(event.defaultPrevented).toBe(false);
    expect(synth.cancelCount).toBe(0);
  });
});

describe('Space pauses reading only when no control owns the key (SC 2.1.1, 2.1.4)', () => {
  test('Space on the page pauses the read', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);

    const event = pressKey(' ');

    expect(event.defaultPrevented).toBe(true);
    expect(synth.paused).toBe(true);
  });

  test.each([
    ['a button', '<button>Read Aloud</button>'],
    ['a link', '<a href="/next">Next</a>'],
    ['an ARIA button', '<div role="button" tabindex="0">Go</div>'],
  ])('Space on %s is left to that control', async (_name, html) => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);
    const holder = document.createElement('div');
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const control = holder.firstElementChild;
    control.focus();

    const event = pressKey(' ', control);

    expect(event.defaultPrevented).toBe(false);
    expect(synth.paused).toBe(false);
  });
});

describe('a normal stop restores the paragraph exactly', () => {
  test('leaves no style attribute where the page had none', async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);

    sendTtsCommand('stop');

    expect(paragraph.getAttribute('style')).toBeNull();
  });

  test('gives the page back its own inline style, untouched', async () => {
    const paragraph = givenParagraph('Working memory holds only a little.', 'color: red;');
    await readAloud(paragraph);

    sendTtsCommand('stop');

    expect(paragraph.getAttribute('style')).toBe('color: red;');
  });

  test('leaves nothing behind when the read finishes on its own', async () => {
    sendTtsCommand('setWordByWord', { enabled: true });
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    await readAloud(paragraph);

    lastUtterance().onend();

    expect(document.querySelectorAll('.assist-word')).toHaveLength(0);
    expect(paragraph.getAttribute('style')).toBeNull();
  });
});
