/**
 * Unit tests for reaching a rich-text editor's iframe from the parent frame.
 *
 * Canvas's Rich Content Editor is TinyMCE: its editing area is a same-origin iframe whose
 * `<body contenteditable>` IS the student's essay. The content script injects nothing into that
 * document (editable-document-guard.js), so dictation is served from the parent frame, which can
 * only listen to the iframe's document, never add to it.
 *
 * jsdom gives an appended iframe a live same-origin about:blank document, which is the shape
 * TinyMCE uses. It has no srcdoc loading and no real focus movement between frames, so a
 * replaced document is simulated by redefining `contentDocument`, and focus entering the frame by
 * the events the parent would see.
 *
 * @file editor-frames.test.js
 */

import {
  editorBodyOf,
  frameHolding,
  watchEditorFrames,
} from '../../../src/features/stt/editor-frames.js';

/** A Canvas-shaped editor iframe: same origin, body made editable the way TinyMCE does it. */
function addEditorFrame({ editable = true } = {}) {
  const frame = document.createElement('iframe');
  frame.title = 'Rich Content Editor';
  document.body.appendChild(frame);
  if (editable) {
    makeEditable(frame.contentDocument);
  }
  return frame;
}

function makeEditable(doc) {
  doc.body.className = 'mce-content-body';
  doc.body.setAttribute('contenteditable', 'true');
}

/** A frame whose document the parent cannot read, as a cross-origin frame answers. */
function addCrossOriginFrame({ throws = false } = {}) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  Object.defineProperty(frame, 'contentDocument', {
    configurable: true,
    get() {
      if (throws) {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.');
      }
      return null;
    },
  });
  return frame;
}

function focusInto(doc) {
  const View = doc.defaultView;
  doc.body.dispatchEvent(new View.FocusEvent('focusin', { bubbles: true }));
}

function keyIn(doc, init) {
  const View = doc.defaultView;
  const event = new View.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  doc.body.dispatchEvent(event);
  return event;
}

/** MutationObserver callbacks are microtasks. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('editorBodyOf', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it("returns the editing body of a same-origin editor iframe", () => {
    const frame = addEditorFrame();
    expect(editorBodyOf(frame)).toBe(frame.contentDocument.body);
  });

  it('returns null for an iframe whose document is not a writing surface', () => {
    const frame = addEditorFrame({ editable: false });
    expect(editorBodyOf(frame)).toBeNull();
  });

  it('returns null, without throwing, for a frame it cannot read', () => {
    expect(editorBodyOf(addCrossOriginFrame())).toBeNull();
    expect(() => editorBodyOf(addCrossOriginFrame({ throws: true }))).not.toThrow();
    expect(editorBodyOf(addCrossOriginFrame({ throws: true }))).toBeNull();
  });

  it('returns null for anything that is not an iframe', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    expect(editorBodyOf(div)).toBeNull();
    expect(editorBodyOf(null)).toBeNull();
  });
});

describe('frameHolding', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('names the iframe that holds an editor body', () => {
    const frame = addEditorFrame();
    expect(frameHolding(frame.contentDocument.body)).toBe(frame);
  });

  it("is null for a field in the page's own document, and for nothing", () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    expect(frameHolding(field)).toBeNull();
    expect(frameHolding(null)).toBeNull();
  });
});

describe('watchEditorFrames', () => {
  let stop;
  let calls;

  function start() {
    calls = { focus: [], key: [], gone: [] };
    stop = watchEditorFrames({
      onFocus: (body, frame) => calls.focus.push({ body, frame }),
      onKeydown: (event, body, frame) => calls.key.push({ event, body, frame }),
      onGone: frame => calls.gone.push(frame),
    });
  }

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
  });

  it('reports focus entering an editor that was on the page from the start', () => {
    const frame = addEditorFrame();
    start();

    focusInto(frame.contentDocument);

    expect(calls.focus).toHaveLength(1);
    expect(calls.focus[0].body).toBe(frame.contentDocument.body);
    expect(calls.focus[0].frame).toBe(frame);
  });

  it('passes keys typed in the editor to the parent, for the dictation shortcut', () => {
    const frame = addEditorFrame();
    start();

    keyIn(frame.contentDocument, { key: 'V', code: 'KeyV', altKey: true, shiftKey: true });

    expect(calls.key).toHaveLength(1);
    expect(calls.key[0].body).toBe(frame.contentDocument.body);
    expect(calls.key[0].event.key).toBe('V');
  });

  it('ignores a same-origin iframe that is not a writing surface', () => {
    const frame = addEditorFrame({ editable: false });
    start();

    focusInto(frame.contentDocument);
    keyIn(frame.contentDocument, { key: 'a' });

    expect(calls.focus).toHaveLength(0);
    expect(calls.key).toHaveLength(0);
  });

  it('serves an editor whose body becomes editable after the watch began', () => {
    const frame = addEditorFrame({ editable: false });
    start();
    makeEditable(frame.contentDocument);

    focusInto(frame.contentDocument);

    expect(calls.focus).toHaveLength(1);
  });

  it('finds an editor iframe mounted after load, as Canvas mounts its editor', async () => {
    start();
    const frame = addEditorFrame();
    await settle();

    focusInto(frame.contentDocument);

    expect(calls.focus).toHaveLength(1);
    expect(calls.focus[0].frame).toBe(frame);
  });

  it('finds an editor iframe nested inside a mounted container', async () => {
    start();
    const wrapper = document.createElement('div');
    const frame = document.createElement('iframe');
    wrapper.appendChild(frame);
    document.body.appendChild(wrapper);
    makeEditable(frame.contentDocument);
    await settle();

    focusInto(frame.contentDocument);

    expect(calls.focus).toHaveLength(1);
  });

  it('lets go of an editor that is removed, and says it has gone', async () => {
    const frame = addEditorFrame();
    const doc = frame.contentDocument;
    const removeSpy = jest.spyOn(doc, 'removeEventListener');
    start();

    frame.remove();
    await settle();

    expect(calls.gone).toEqual([frame]);
    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(['focusin', 'keydown']));
  });

  it('follows the editor into its new document when the iframe loads again', () => {
    const frame = addEditorFrame();
    const oldDoc = frame.contentDocument;
    start();

    // A second same-origin document, standing in for the one a reload puts in the frame.
    const other = addEditorFrame();
    const newDoc = other.contentDocument;
    Object.defineProperty(frame, 'contentDocument', { configurable: true, get: () => newDoc });
    frame.dispatchEvent(new Event('load'));

    focusInto(oldDoc);
    expect(calls.focus.filter(c => c.frame === frame)).toHaveLength(0);

    focusInto(newDoc);
    expect(calls.focus.some(c => c.frame === frame && c.body === newDoc.body)).toBe(true);
  });

  it('picks up focus arriving in an editor through the parent window losing focus', () => {
    jest.useFakeTimers();
    try {
      const frame = addEditorFrame();
      start();
      const active = jest.spyOn(document, 'activeElement', 'get').mockReturnValue(frame);

      window.dispatchEvent(new FocusEvent('blur'));
      jest.runOnlyPendingTimers();

      expect(calls.focus).toHaveLength(1);
      expect(calls.focus[0].body).toBe(frame.contentDocument.body);
      active.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does nothing, and throws nothing, for a cross-origin iframe', async () => {
    start();
    expect(() => addCrossOriginFrame({ throws: true })).not.toThrow();
    await settle();
    expect(calls.focus).toHaveLength(0);
  });

  it('removes every listener it added when stopped', () => {
    const frame = addEditorFrame();
    start();
    stop();
    stop = null;

    focusInto(frame.contentDocument);
    keyIn(frame.contentDocument, { key: 'V', altKey: true, shiftKey: true });

    expect(calls.focus).toHaveLength(0);
    expect(calls.key).toHaveLength(0);
  });

  it('passes writing in the editor to the parent, for the authorship log', () => {
    const frame = addEditorFrame();
    const input = [];
    stop = watchEditorFrames({ onInput: (event, body, from) => input.push({ event, body, from }) });

    const View = frame.contentWindow;
    frame.contentDocument.body.dispatchEvent(new View.InputEvent('input', { bubbles: true }));

    expect(input).toHaveLength(1);
    expect(input[0].body).toBe(frame.contentDocument.body);
    expect(input[0].from).toBe(frame);
  });

  it('listens only for what the watcher asked for, and lets go of it on removal', async () => {
    const frame = addEditorFrame();
    const doc = frame.contentDocument;
    const addSpy = jest.spyOn(doc, 'addEventListener');
    const removeSpy = jest.spyOn(doc, 'removeEventListener');
    stop = watchEditorFrames({ onInput: () => {} });

    expect(addSpy.mock.calls.map(([type]) => type)).toEqual(['input']);

    frame.remove();
    await settle();

    expect(removeSpy.mock.calls.map(([type]) => type)).toEqual(['input']);
  });

  it('adds nothing to the editor document', () => {
    const frame = addEditorFrame();
    const before = frame.contentDocument.documentElement.outerHTML;
    start();
    focusInto(frame.contentDocument);
    keyIn(frame.contentDocument, { key: 'a' });

    expect(frame.contentDocument.documentElement.outerHTML).toBe(before);
  });
});
