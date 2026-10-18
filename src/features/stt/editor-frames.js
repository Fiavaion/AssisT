/**
 * Reach a rich-text editor's iframe from the parent frame, without touching its document.
 *
 * Canvas's Rich Content Editor is TinyMCE, whose editing area is a same-origin iframe whose
 * `<body contenteditable>` IS the student's essay. AssisT injects nothing into that document (see
 * content/editable-document-guard.js), so the parent frame serves it: it may LISTEN to the
 * iframe's document (for focus and the dictation key, and for the writing the authorship log
 * records) but never add a node to it.
 *
 * Listeners are attached to every same-origin iframe, and editability is checked when an event
 * arrives rather than when the frame is found, because TinyMCE makes its body editable only after
 * its own scripts have run. A cross-origin frame answers `contentDocument` with null (or a throw in
 * some embeddings) and is simply left alone.
 *
 * @module features/stt/editor-frames
 */

import { isEditableDocument } from '../../content/utils/editable-document.js';

/**
 * The editing body of a same-origin editor iframe, or null.
 *
 * @param {Element|null} frame
 * @returns {HTMLElement|null}
 */
export function editorBodyOf(frame) {
  if (!frame || frame.tagName !== 'IFRAME') {
    return null;
  }
  try {
    const doc = frame.contentDocument;
    if (!doc || !doc.body || !isEditableDocument(doc)) {
      return null;
    }
    return doc.body;
  } catch {
    return null;
  }
}

/**
 * The iframe in this page that holds a field, when the field lives in a frame's document rather
 * than the page's own (the body of an editor iframe), else null. Whatever AssisT shows for such a
 * field stays in the page, so it is placed against, ordered after and focused through the iframe.
 *
 * @param {Node|null} field
 * @returns {HTMLIFrameElement|null}
 */
export function frameHolding(field) {
  const doc = field && field.ownerDocument;
  if (!doc || doc === document) {
    return null;
  }
  try {
    return doc.defaultView?.frameElement || null;
  } catch {
    return null;
  }
}

/** The document inside a frame, or null when the parent may not read it. */
function readDocument(frame) {
  try {
    return frame.contentDocument || null;
  } catch {
    return null;
  }
}

/**
 * Watch the page's iframes for an editor the student is writing in.
 *
 * Every hook is optional, and only the events a hook was given for are listened to:
 *
 * - `onFocus(body, frame)`: focus entered an editor's document.
 * - `onKeydown(event, body, frame)`: a key was pressed in an editor (capture phase, so the editor
 *   cannot swallow the dictation shortcut first).
 * - `onInput(event, body, frame)`: the student changed the editor's text (capture phase too).
 * - `onGone(frame)`: a watched iframe left the page (an SPA route change, the editor remounting).
 *
 * Editors mounted after load are found with a MutationObserver; a frame that loads a new document
 * is followed into it. Focus arriving from the parent's side is caught on the parent window's blur,
 * which also re-attaches the listeners in case the editor wrote its document with
 * `document.open()`, which erases every listener on it.
 *
 * @param {{onFocus?: Function, onKeydown?: Function, onInput?: Function, onGone?: Function}} hooks
 * @returns {() => void} stop watching and remove every listener (safe to call more than once)
 */
export function watchEditorFrames({ onFocus, onKeydown, onInput, onGone }) {
  /** iframe -> { doc, onLoad, listeners: [type, listener][] } */
  const frames = new Map();
  let observer = null;
  let blurTimer = null;
  let stopped = false;

  function unlistenDocument(entry) {
    if (!entry.doc) {
      return;
    }
    try {
      for (const [type, listener] of entry.listeners) {
        entry.doc.removeEventListener(type, listener, true);
      }
    } catch {
      /* a discarded document has nothing left to remove */
    }
    entry.doc = null;
  }

  /** Attach to whatever document the frame holds now. Adding the same listener twice is a no-op. */
  function listen(frame) {
    const entry = frames.get(frame);
    if (!entry) {
      return;
    }
    const doc = readDocument(frame);
    if (entry.doc && entry.doc !== doc) {
      unlistenDocument(entry);
    }
    if (!doc) {
      return;
    }
    try {
      for (const [type, listener] of entry.listeners) {
        doc.addEventListener(type, listener, true);
      }
      entry.doc = doc;
    } catch {
      entry.doc = null;
    }
  }

  /** A document listener that passes the event on only while the frame holds an editor. */
  function forEditor(frame, hook) {
    return event => {
      const body = editorBodyOf(frame);
      if (body) {
        hook(event, body, frame);
      }
    };
  }

  function track(frame) {
    if (frames.has(frame)) {
      return;
    }
    const listeners = [];
    if (onFocus) {
      listeners.push(['focusin', forEditor(frame, (event, body) => onFocus(body, frame))]);
    }
    if (onKeydown) {
      listeners.push(['keydown', forEditor(frame, onKeydown)]);
    }
    if (onInput) {
      listeners.push(['input', forEditor(frame, onInput)]);
    }
    const entry = { doc: null, onLoad: () => listen(frame), listeners };
    frames.set(frame, entry);
    frame.addEventListener('load', entry.onLoad);
    listen(frame);
  }

  function untrack(frame, { report }) {
    const entry = frames.get(frame);
    if (!entry) {
      return;
    }
    frame.removeEventListener('load', entry.onLoad);
    unlistenDocument(entry);
    frames.delete(frame);
    if (report) {
      onGone?.(frame);
    }
  }

  function scan(root) {
    if (root.tagName === 'IFRAME') {
      track(root);
    }
    root.querySelectorAll?.('iframe').forEach(track);
  }

  const onWindowBlur = () => {
    clearTimeout(blurTimer);
    // activeElement names the iframe only once the blur has finished.
    blurTimer = setTimeout(() => {
      blurTimer = null;
      const active = document.activeElement;
      if (stopped || !active || active.tagName !== 'IFRAME') {
        return;
      }
      if (frames.has(active)) {
        listen(active);
      } else {
        track(active);
      }
      const body = editorBodyOf(active);
      if (body) {
        onFocus?.(body, active);
      }
    }, 0);
  };

  scan(document);

  if (typeof MutationObserver === 'function' && document.documentElement) {
    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scan(node);
          }
        });
      }
      for (const frame of Array.from(frames.keys())) {
        if (!frame.isConnected) {
          untrack(frame, { report: true });
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('blur', onWindowBlur);

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    observer?.disconnect();
    observer = null;
    clearTimeout(blurTimer);
    blurTimer = null;
    window.removeEventListener('blur', onWindowBlur);
    for (const frame of Array.from(frames.keys())) {
      untrack(frame, { report: false });
    }
  };
}
