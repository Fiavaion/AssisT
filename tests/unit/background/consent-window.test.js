/**
 * The consent window (ADR 0009).
 *
 * A content script cannot ask Chrome for a host permission, so when a page feature first needs a
 * service that comes with one, the worker opens a small extension window that asks the question and
 * the permission in one press. The worker's part is bookkeeping: open the window for a known
 * question, remember which tab and frame asked, pass the answer back, and say "no answer" when the
 * window is closed without one. It never records consent itself: the window does, in the press.
 */

import {
  handleConsentWindowMessage,
  handleConsentWindowClosed,
} from '../../../src/background/consent-window.js';

const PAGE = 'chrome-extension://test-id/src/pages/consent/consent.html';
let session;
let local;

function reply(message, sender) {
  return new Promise(resolve => {
    const handled = handleConsentWindowMessage(message, sender, resolve);
    if (!handled) {
      resolve('not handled');
    }
  });
}

const FROM_TAB = { id: 'test-extension-id', tab: { id: 7 }, frameId: 3, url: 'https://x.edu/' };
const FROM_WINDOW = {
  id: 'test-extension-id',
  url: `${PAGE}?request=r1`,
  tab: { id: 99, windowId: 42 },
};

beforeEach(() => {
  session = {};
  chrome.runtime.getURL.mockImplementation(path => `chrome-extension://test-id/${path}`);
  chrome.storage.session = {
    get: jest.fn(async key => {
      if (key === null) {
        return { ...session };
      }
      const keys = [].concat(key);
      return Object.fromEntries(keys.filter(k => k in session).map(k => [k, session[k]]));
    }),
    set: jest.fn(async values => Object.assign(session, values)),
    remove: jest.fn(async key => {
      [].concat(key).forEach(k => delete session[k]);
    }),
  };
  chrome.windows = {
    create: jest.fn().mockResolvedValue({ id: 42 }),
    get: jest.fn().mockResolvedValue({ id: 42 }),
    update: jest.fn().mockResolvedValue({ id: 42 }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  chrome.tabs.sendMessage = jest.fn().mockResolvedValue(undefined);
  local = {};
  chrome.storage.local.set = jest.fn(async values => Object.assign(local, values));
  // jsdom has no randomUUID; the service worker does.
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => 'r1', configurable: true });
});

afterEach(() => {
  delete globalThis.crypto.randomUUID;
  delete chrome.windows;
  delete chrome.storage.session;
  jest.restoreAllMocks();
});

describe('opening the window', () => {
  it('opens the question for the tab and frame that asked, and remembers them', async () => {
    const answer = await reply(
      { type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary', detail: 'dyslexia' },
      FROM_TAB
    );

    expect(answer).toEqual({ success: true, request: 'r1' });
    expect(chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${PAGE}?request=r1`, type: 'popup', focused: true })
    );
    // The question is written once and never rewritten, so nothing can bring it back; which
    // window shows it is a key of its own.
    expect(session).toEqual({
      assist_consent_window_r1: {
        destination: 'dictionary',
        detail: 'dyslexia',
        detailLabel: '',
        declinedBefore: false,
        tabId: 7,
        frameId: 3,
      },
      assist_consent_windowid_42: 'r1',
    });
  });

  it('keeps the page text out of the window address', async () => {
    await reply(
      { type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary', detail: 'private words' },
      FROM_TAB
    );
    expect(chrome.windows.create.mock.calls[0][0].url).not.toMatch(/private/);
  });

  it.each([
    ['an unknown service', { destination: 'ghost' }, FROM_TAB],
    ['a service with no host to ask for', { destination: 'dictation' }, FROM_TAB],
    ['a sender that is not a tab', { destination: 'dictionary' }, { id: 'test-extension-id' }],
  ])('opens nothing for %s', async (_, fields, sender) => {
    const answer = await reply({ type: 'CONSENT_WINDOW_OPEN', ...fields }, sender);
    expect(answer).toEqual({ success: false });
    expect(chrome.windows.create).not.toHaveBeenCalled();
    expect(session).toEqual({});
  });

  it('a question answered before its window was recorded is not brought back, and its window goes', async () => {
    // The window can answer, and the worker forget the question, before windows.create returns.
    chrome.windows.create.mockImplementation(async () => {
      session = {};
      return { id: 42 };
    });
    await reply({ type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary' }, FROM_TAB);
    expect(session).toEqual({});
    expect(chrome.windows.remove).toHaveBeenCalledWith(42);
  });

  it('a window closed before it was recorded still tells the page "no answer"', async () => {
    // windows.onRemoved found no question for it, so the page would wait for ever.
    chrome.windows.get.mockRejectedValue(new Error('No window with id: 42'));
    await reply({ type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary' }, FROM_TAB);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      { type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' },
      { frameId: 3 }
    );
    expect(session).toEqual({});
  });

  it('reports a window Chrome would not open as a failure, and forgets the question', async () => {
    chrome.windows.create.mockRejectedValue(new Error('no'));
    const answer = await reply({ type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary' }, FROM_TAB);
    expect(answer).toEqual({ success: false });
    expect(session).toEqual({});
  });
});

describe('passing the answer back', () => {
  beforeEach(async () => {
    await reply({ type: 'CONSENT_WINDOW_OPEN', destination: 'dictionary' }, FROM_TAB);
  });

  it('sends the window’s answer to the frame that asked, then closes the window', async () => {
    const answer = await reply(
      { type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'granted' },
      FROM_WINDOW
    );

    expect(answer).toEqual({ success: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      { type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'granted' },
      { frameId: 3 }
    );
    expect(session).toEqual({});
    expect(chrome.windows.remove).toHaveBeenCalledWith(42);
  });

  it('closes the window the answer came from, even before its id was kept', async () => {
    delete session.assist_consent_windowid_42;
    const fromAnotherWindow = { ...FROM_WINDOW, tab: { id: 99, windowId: 77 } };
    await reply(
      { type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'granted' },
      fromAnotherWindow
    );
    expect(chrome.windows.remove).toHaveBeenCalledWith(77);
  });

  it('records the answer itself, only for a question it still holds', async () => {
    // Validate and record in one place: a window whose question is gone records nothing.
    await reply({ type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'granted' }, FROM_WINDOW);
    expect(local.assist_consent_dictionary).toEqual({ granted: true, at: expect.any(String) });

    local = {};
    const late = await reply(
      { type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'granted' },
      FROM_WINDOW
    );
    expect(late).toEqual({ success: false });
    expect(local).toEqual({});
  });

  it('records a no as a no', async () => {
    await reply({ type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'declined' }, FROM_WINDOW);
    expect(local.assist_consent_dictionary.granted).toBe(false);
  });

  it('brings the open window forward when the page asks again', async () => {
    const answer = await reply({ type: 'CONSENT_WINDOW_FOCUS', request: 'r1' }, FROM_TAB);
    expect(answer).toEqual({ success: true });
    expect(chrome.windows.update).toHaveBeenCalledWith(42, { focused: true, drawAttention: true });
  });

  it('brings nothing forward for another tab, or a question it does not hold', async () => {
    const otherTab = { ...FROM_TAB, tab: { id: 8 } };
    expect(await reply({ type: 'CONSENT_WINDOW_FOCUS', request: 'r1' }, otherTab)).toEqual({
      success: false,
    });
    expect(await reply({ type: 'CONSENT_WINDOW_FOCUS', request: 'gone' }, FROM_TAB)).toEqual({
      success: false,
    });
    expect(chrome.windows.update).not.toHaveBeenCalled();
  });

  it('passes on only a yes or a no', async () => {
    await reply({ type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'yes!' }, FROM_WINDOW);
    expect(chrome.tabs.sendMessage.mock.calls[0][1].answer).toBe('declined');
  });

  it('ignores an answer that does not come from the consent window', async () => {
    const answer = await reply(
      { type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'granted' },
      FROM_TAB
    );
    expect(answer).toEqual({ success: false });
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('says "no answer" when the window is closed without one', async () => {
    await handleConsentWindowClosed(42);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      { type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' },
      { frameId: 3 }
    );
    expect(session).toEqual({});
  });

  it('says nothing more once the window has answered', async () => {
    await reply({ type: 'CONSENT_WINDOW_ANSWERED', request: 'r1', answer: 'declined' }, FROM_WINDOW);
    chrome.tabs.sendMessage.mockClear();
    await handleConsentWindowClosed(42);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('a tab that has gone away is not an error', async () => {
    chrome.tabs.sendMessage.mockRejectedValue(new Error('No tab'));
    await expect(handleConsentWindowClosed(42)).resolves.toBeUndefined();
  });
});

it('leaves every other message alone', () => {
  expect(handleConsentWindowMessage({ type: 'THIRD_PARTY_REQUEST' }, FROM_TAB, jest.fn())).toBe(
    false
  );
});
