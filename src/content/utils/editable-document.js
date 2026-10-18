/**
 * Is this document itself a writing surface?
 *
 * The manifest injects with `all_frames: true`, so the content script also runs inside the
 * iframe a rich-text editor uses for its editing area. In that frame the whole `<body>` IS the
 * student's essay field: anything appended to it becomes part of what they wrote. Overnight
 * release testing on the TinyMCE shape (`<body class="mce-content-body" contenteditable>`)
 * found the sidebar, the text-statistics badge, the citation bar, the companion chips, the
 * first-run hint and the microphone button all sitting inside the field, so its text read
 * "Annotations (0) … Cite this source Voice capture ✍️ history 🎙️ lecture … Typed OK."
 * That is a data-integrity defect, not a layout one: the student's work is altered.
 *
 * So AssisT treats an editable document as off limits and injects nothing into it. The features
 * that must serve such an editor (dictation, the authorship log) are driven from the parent
 * frame, which is where they already run.
 *
 * @module content/utils/editable-document
 */

/**
 * Body classes editors put on their editing document. Checked as well as `contenteditable`
 * because an editor may set the attribute a moment after load while the class is present from
 * the first paint.
 */
const EDITOR_BODY_CLASSES = [
  'mce-content-body', // TinyMCE (Canvas RCE)
  'cke_editable', // CKEditor 4
  'ck-editor__editable', // CKEditor 5
  'note-editable', // Summernote
  'ql-editor', // Quill
  'fr-element', // Froala
];

/** Attribute values of `contenteditable` that do NOT make an element editable. */
const NOT_EDITABLE = new Set(['false', 'inherit']);

function elementIsEditable(el) {
  if (!el) {
    return false;
  }
  if (el.isContentEditable === true) {
    return true;
  }
  // jsdom and older engines do not implement isContentEditable, and an editor may have set the
  // attribute before the engine reflected it — read the attribute as well.
  const attr = el.getAttribute?.('contenteditable');
  if (typeof attr === 'string' && !NOT_EDITABLE.has(attr.toLowerCase())) {
    return true;
  }
  return EDITOR_BODY_CLASSES.some(name => el.classList?.contains(name));
}

/**
 * Whether this document is a writing surface AssisT must not touch.
 *
 * @param {Document} [doc=document]
 * @returns {boolean}
 */
export function isEditableDocument(doc = document) {
  try {
    if (!doc) {
      return false;
    }
    if (typeof doc.designMode === 'string' && doc.designMode.toLowerCase() === 'on') {
      return true;
    }
    return elementIsEditable(doc.documentElement) || elementIsEditable(doc.body);
  } catch {
    // A document we cannot inspect is not a document we should inject into either.
    return true;
  }
}

/** When to re-check for `designMode`, which no observer reports. */
const DESIGN_MODE_CHECKS_MS = [0, 250, 1000, 3000];

/**
 * Watch for a document that becomes editable after load — editors routinely set
 * `contenteditable` once their own scripts have run — and call back exactly once when it does.
 *
 * Calls back synchronously if the document is already editable, so a single call site covers
 * both orders.
 *
 * @param {() => void} onEditable
 * @returns {() => void} stop watching (safe to call more than once)
 */
export function watchForEditableDocument(onEditable) {
  let stopped = false;
  let observer = null;
  const timers = [];

  const stop = () => {
    stopped = true;
    observer?.disconnect();
    observer = null;
    for (const id of timers) {
      clearTimeout(id);
    }
    timers.length = 0;
  };

  const check = () => {
    if (stopped || !isEditableDocument()) {
      return;
    }
    stop();
    onEditable();
  };

  if (isEditableDocument()) {
    onEditable();
    return () => {};
  }

  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(check);
    // Only the two elements that can make the whole document editable, and only the two
    // attributes that can do it — a subtree attribute watch on a busy page would fire constantly.
    const options = { attributes: true, attributeFilter: ['contenteditable', 'class'] };
    if (document.documentElement) {
      observer.observe(document.documentElement, { ...options, childList: true });
    }
    if (document.body) {
      observer.observe(document.body, options);
    }
  }

  for (const delay of DESIGN_MODE_CHECKS_MS) {
    timers.push(setTimeout(check, delay));
  }

  return stop;
}

/**
 * Take AssisT's own injected surfaces back off a document that has just become editable.
 *
 * Only direct children of `<body>` and `<head>` are swept: those are the containers AssisT
 * appends, and confining the sweep there means a highlight wrapper nested inside the student's
 * own text can never be mistaken for AssisT UI and taken away with the words inside it.
 *
 * @param {Document} [doc=document]
 * @returns {number} how many nodes were removed
 */
export function removeInjectedAssistUI(doc = document) {
  let removed = 0;
  for (const parent of [doc.head, doc.body]) {
    if (!parent) {
      continue;
    }
    for (const node of Array.from(parent.children)) {
      const id = node.id || '';
      const className = typeof node.className === 'string' ? node.className : '';
      if (id.startsWith('assist-') || className.includes('assist-')) {
        node.remove();
        removed += 1;
      }
    }
  }
  return removed;
}
