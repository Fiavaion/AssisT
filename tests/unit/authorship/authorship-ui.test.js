/**
 * @jest-environment jsdom
 *
 * Authorship Shield UI — watches writing surfaces, records a debounced snapshot, and renders a
 * small floating indicator + "your writing history" card with a copy-report action.
 */

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-settings.js'),
  isCompanionEnabled: jest.fn(),
}));

jest.mock('../../../src/features/companion/companion-ui.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-ui.js'),
  isLmsHost: jest.fn(() => true),
}));

import { init, cleanup } from '../../../src/features/authorship/authorship-ui.js';
import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { isLmsHost } from '../../../src/features/companion/companion-ui.js';
import { createProvenanceLog } from '../../../src/features/authorship/provenance-log.js';

const INDICATOR_SELECTOR = '[aria-label="Writing history — Authorship Shield"]';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** Flush pending microtasks (promise chains not gated behind a timer). */
async function flush() {
  for (let i = 0; i < 6; i++) {
     
    await Promise.resolve();
  }
}

/** A stateful chrome.storage.local mock, shared with a fresh log instance for verification. */
function statefulStorage() {
  const store = {};
  chrome.storage.local.get.mockImplementation(async key => {
    const k = typeof key === 'string' ? key : key[0];
    return k in store ? { [k]: store[k] } : {};
  });
  chrome.storage.local.set.mockImplementation(async obj => {
    Object.assign(store, obj);
  });
}

/** Reads the log through the SAME chrome.storage.local mock the UI module writes to. */
function readLog() {
  return createProvenanceLog({
    storage: {
      get: async key => (await chrome.storage.local.get(key))[key],
      set: async (key, value) => chrome.storage.local.set({ [key]: value }),
    },
    now: () => Date.now(),
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  statefulStorage();
  isCompanionEnabled.mockResolvedValue(true);
  isLmsHost.mockReturnValue(true);
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  } else {
    navigator.clipboard.writeText = jest.fn().mockResolvedValue(undefined);
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('init() — gating', () => {
  test('does nothing when the companion feature is disabled', async () => {
    isCompanionEnabled.mockResolvedValue(false);
    document.body.innerHTML = '<textarea id="essay"></textarea>';

    await init();

    expect(document.querySelector(INDICATOR_SELECTOR)).toBeNull();
  });

  test('does nothing off a Canvas host', async () => {
    isLmsHost.mockReturnValue(false);
    document.body.innerHTML = '<textarea id="essay"></textarea>';

    await init();

    expect(document.querySelector(INDICATOR_SELECTOR)).toBeNull();
  });

  test('is idempotent — calling init() twice does not attach a second listener', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');
    const addSpy = jest.spyOn(el, 'addEventListener');

    await init();
    await init();

    expect(addSpy).toHaveBeenCalledTimes(1);
  });
});

describe('watching + recording', () => {
  test('shows the floating indicator once a writing surface exists on the page', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';

    await init();

    const indicator = document.querySelector(INDICATOR_SELECTOR);
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toBe('✍️ history');
  });

  test('does not show the indicator when no writing surface is present', async () => {
    document.body.innerHTML = '<p>Nothing to write in here.</p>';

    await init();

    expect(document.querySelector(INDICATOR_SELECTOR)).toBeNull();
  });

  test('records a snapshot 4s after the last input once text reaches 30+ chars', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');

    await init();

    el.value = 'This is a long enough sentence to count as a real snapshot.';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    await jest.advanceTimersByTimeAsync(4000);
    await flush();

    const docId = `${location.pathname}#essay`;
    const docs = await readLog().listDocs();
    expect(docs.some(d => d.docId === docId)).toBe(true);
  });

  test('does not record a snapshot for text shorter than 30 chars', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');

    await init();

    el.value = 'too short';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    await jest.advanceTimersByTimeAsync(4000);
    await flush();

    const docs = await readLog().listDocs();
    expect(docs).toHaveLength(0);
  });
});

describe("an essay written in Canvas's Rich Content Editor (a same-origin editor iframe)", () => {
  /** The TinyMCE shape: an iframe, named after its textarea, whose body is the student's essay. */
  function addEditor({ id = 'essay_ifr', editable = true } = {}) {
    const frame = document.createElement('iframe');
    frame.id = id;
    frame.title = 'Rich Content Editor';
    document.body.appendChild(frame);
    if (editable) {
      makeEditable(frame.contentDocument.body);
    }
    return frame;
  }

  function makeEditable(body) {
    body.className = 'mce-content-body';
    body.setAttribute('contenteditable', 'true');
  }

  /** What typing does: the editor's text changes, then an input event fires in its document. */
  function typeInto(frame, text) {
    const body = frame.contentDocument.body;
    body.textContent = text;
    body.dispatchEvent(new frame.contentWindow.InputEvent('input', { bubbles: true }));
  }

  const ESSAY = 'This essay was typed straight into the Canvas editor, not a textarea.';
  const docId = frame => `${location.pathname}#${frame.id}`;

  test('records the writing, under an id taken from the iframe', async () => {
    const frame = addEditor();
    await init();

    typeInto(frame, ESSAY);
    await jest.advanceTimersByTimeAsync(4000);
    await flush();

    const timeline = await readLog().getTimeline(docId(frame));
    expect(timeline).toHaveLength(1);
    expect(timeline[0].excerpt).toBe(ESSAY);
  });

  test('records an editor whose body is made editable after the log started', async () => {
    const frame = addEditor({ editable: false });
    await init();
    makeEditable(frame.contentDocument.body);

    typeInto(frame, ESSAY);
    await jest.advanceTimersByTimeAsync(4000);
    await flush();

    expect(await readLog().getTimeline(docId(frame))).toHaveLength(1);
  });

  test('keeps the last words typed before the editor is replaced, and carries on in the new one', async () => {
    const first = addEditor();
    await init();

    typeInto(first, ESSAY);
    first.remove();
    await flush();

    const second = addEditor();
    await flush();
    typeInto(second, `${ESSAY} And then the student kept on writing after Canvas remounted it.`);
    await jest.advanceTimersByTimeAsync(4000);
    await flush();

    expect(docId(second)).toBe(docId(first));
    expect(await readLog().getTimeline(docId(first))).toHaveLength(2);
  });

  test('shows the indicator in the page and adds nothing to the editor document', async () => {
    const frame = addEditor();
    const before = frame.contentDocument.documentElement.outerHTML;
    await init();

    frame.contentDocument.body.dispatchEvent(
      new frame.contentWindow.FocusEvent('focusin', { bubbles: true })
    );

    expect(document.querySelector(INDICATOR_SELECTOR)).not.toBeNull();
    expect(frame.contentDocument.documentElement.outerHTML).toBe(before);
  });

  test('stops listening to the editor on cleanup', async () => {
    const frame = addEditor();
    const removeSpy = jest.spyOn(frame.contentDocument, 'removeEventListener');
    await init();
    cleanup();

    expect(removeSpy.mock.calls.map(([type]) => type)).toContain('input');
  });
});

describe('the "your writing history" card', () => {
  async function typeAndRecord(el, text) {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await jest.advanceTimersByTimeAsync(4000);
    await flush();
  }

  test('lists a recorded document with its title and a copy-report action', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');
    await init();
    await typeAndRecord(el, 'This is a long enough sentence to count as a real snapshot.');

    const indicator = document.querySelector(INDICATOR_SELECTOR);
    fireMousedown(indicator);
    await flush();

    const card = document.getElementById('assist-companion-authorship');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('1 snapshot');

    const copyBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Copy report')
    );
    expect(copyBtn).toBeDefined();
  });

  test('copying a report writes the honesty header to the clipboard and confirms it', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');
    await init();
    await typeAndRecord(el, 'This is a long enough sentence to count as a real snapshot.');

    fireMousedown(document.querySelector(INDICATOR_SELECTOR));
    await flush();
    const card = document.getElementById('assist-companion-authorship');
    const copyBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Copy report')
    );
    fireMousedown(copyBtn);
    await flush();

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const [report] = navigator.clipboard.writeText.mock.calls[0];
    expect(report).toMatch(/cannot\W*prove/i);

    const status = card.querySelector('[role="status"]');
    expect(status.textContent).toBe('Report copied — keep it somewhere safe');
  });

  test('carries the honest device-only paragraph', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    await init();

    fireMousedown(document.querySelector(INDICATOR_SELECTOR));
    await flush();
    const card = document.getElementById('assist-companion-authorship');
    expect(card.textContent).toContain(
      'Recorded on this device only. Nothing is uploaded. This is YOUR evidence of how your work grew.'
    );
  });
});

describe('cleanup()', () => {
  test('removes the indicator and detaches the input listener', async () => {
    document.body.innerHTML = '<textarea id="essay"></textarea>';
    const el = document.getElementById('essay');

    await init();
    expect(document.querySelector(INDICATOR_SELECTOR)).not.toBeNull();

    cleanup();

    expect(document.querySelector(INDICATOR_SELECTOR)).toBeNull();

    const removeSpy = jest.spyOn(el, 'removeEventListener');
    // cleanup() again should be a harmless no-op (nothing left to detach)
    cleanup();
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
