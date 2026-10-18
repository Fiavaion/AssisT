/**
 * Authorship Shield UI — the visible half of the writing-provenance log.
 *
 * Watches textareas and contenteditable writing surfaces on Canvas pages and, after a quiet
 * 4-second pause in typing, records a private on-device snapshot via provenance-log.js. Canvas's
 * Rich Content Editor keeps the essay in the body of its own iframe, where AssisT adds nothing;
 * that writing is recorded from this frame by listening to the iframe's document
 * (features/stt/editor-frames.js). A small,
 * unobtrusive floating indicator appears only while at least one writing surface is present, and
 * opens a card listing recorded documents with a one-click "copy report" the student can keep as
 * their own evidence. Nothing here labels anything as AI, cheating, or suspicious, and nothing
 * here leaves the device — the tone throughout is protective, not surveillance-like.
 *
 * @module features/authorship/authorship-ui
 */

import { createProvenanceLog } from './provenance-log.js';
import { isCompanionEnabled } from '../companion/companion-settings.js';
import {
  createCompanionCard,
  companionButton,
  companionStatusRegion,
  isLmsHost,
} from '../companion/companion-ui.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';
import { dockChip, undockChip } from '../companion/chip-dock.js';
import { watchEditorFrames } from '../stt/editor-frames.js';

const CARD_ID = 'assist-companion-authorship';
const INDICATOR_ID = 'assist-authorship-indicator';
const INDICATOR_STYLE_ID = 'assist-authorship-indicator-styles';
const WRITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"]';
const DEBOUNCE_MS = 4000;
const MIN_TEXT_LENGTH = 30;

let provenanceLog = null;
let mutationObserver = null;
let indicatorBtn = null;
let initialized = false;

/** element -> { docId, listener, timerId } */
const watchedElements = new Map();
/** editor iframe -> { docId, text, timerId }, for an essay written in an editor's own document */
const watchedFrames = new Map();
let stopEditorFrames = null;
let nextElementIndex = 0;

function createStorageAdapter() {
  return {
    get: async key => (await chrome.storage.local.get(key))[key],
    set: async (key, value) => chrome.storage.local.set({ [key]: value }),
  };
}

function readElementText(el) {
  if (el.tagName === 'TEXTAREA') {
    return el.value || '';
  }
  return el.textContent || '';
}

function buildDocId(el, index) {
  const key = el.id || el.name || String(index);
  return `${location.pathname}#${key}`;
}

function ensureIndicatorStyles() {
  if (document.getElementById(INDICATOR_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = INDICATOR_STYLE_ID;
  style.textContent = `
    /* Placement comes from the shared corner rail - see src/utils/corner-slots.js. */
    .assist-authorship-indicator {
      z-index: ${Z.CONTROLS};
      border: 1px solid #4e6f78;
      background: #ffffff;
      color: #33525b;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(31, 41, 51, 0.18);
    }
    .assist-authorship-indicator:focus-visible {
      outline: 3px solid #1f6feb;
      outline-offset: 2px;
    }
    @media (forced-colors: active) {
      .assist-authorship-indicator { border: 1px solid ButtonText; }
    }
  `;
  document.head.appendChild(style);
}

function showIndicator() {
  if (indicatorBtn) {
    return;
  }
  ensureIndicatorStyles();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = INDICATOR_ID;
  btn.className = 'assist-authorship-indicator';
  btn.textContent = '✍️ history';
  btn.setAttribute('aria-label', 'Writing history — Authorship Shield');
  attachAccessibleHandler(btn, 'Writing history — Authorship Shield', () => {
    openCard();
  });
  // The chip dock owns where the small chips sit (see src/features/companion/chip-dock.js).
  dockChip('authorship-indicator', btn);
  indicatorBtn = btn;
}

function hideIndicator() {
  undockChip('authorship-indicator');
  indicatorBtn?.remove();
  indicatorBtn = null;
}

function updateIndicator() {
  if (watchedElements.size > 0 || watchedFrames.size > 0) {
    showIndicator();
  } else {
    hideIndicator();
  }
}

function renderDocRow(list, doc, statusRegion) {
  const row = document.createElement('div');
  row.className = 'assist-authorship-doc';
  row.style.margin = '10px 0';
  row.style.paddingBottom = '10px';
  row.style.borderBottom = '1px solid #c9d4d2';

  const label = document.createElement('p');
  const snapshotWord = doc.snapshots === 1 ? 'snapshot' : 'snapshots';
  const lastUpdated = doc.lastUpdated ? new Date(doc.lastUpdated).toLocaleString() : 'unknown';
  label.textContent = `${doc.title || 'Untitled document'} — ${doc.snapshots} ${snapshotWord} — last updated ${lastUpdated}`;
  row.appendChild(label);

  const copyBtn = companionButton(
    '📄 Copy report',
    async () => {
      try {
        const report = await provenanceLog.buildReport(doc.docId, { title: doc.title });
        await navigator.clipboard.writeText(report);
        statusRegion.textContent = 'Report copied — keep it somewhere safe';
      } catch {
        statusRegion.textContent = "Couldn't copy the report — please try again.";
      }
    },
    { secondary: true }
  );
  row.appendChild(copyBtn);

  list.appendChild(row);
}

/**
 * Open the floating "Your writing history" card, listing every recorded document with a
 * one-click copy-report action.
 */
async function openCard() {
  const { root, body } = createCompanionCard({
    id: CARD_ID,
    title: '✍️ Your writing history',
    floating: true,
  });

  const intro = document.createElement('p');
  intro.textContent =
    'Recorded on this device only. Nothing is uploaded. This is YOUR evidence of how your work grew.';
  body.appendChild(intro);

  const list = document.createElement('div');
  body.appendChild(list);

  const statusRegion = companionStatusRegion(body);

  // Mount immediately (synchronously, before the listDocs() await below) so the card exists in
  // the DOM as soon as the click handler runs, then fill it in once the docs are read.
  document.body.appendChild(root);

  const docs = await provenanceLog.listDocs();
  if (docs.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No writing history recorded yet — it appears here once you start typing.';
    list.appendChild(empty);
  } else {
    docs.forEach(doc => renderDocRow(list, doc, statusRegion));
  }
}

function recordNow(docId, text) {
  if (text.length < MIN_TEXT_LENGTH) {
    return;
  }
  provenanceLog?.recordSnapshot({ docId, title: document.title, text });
}

/** Record once typing has paused for DEBOUNCE_MS, restarting the wait on every change. */
function scheduleSnapshot(entry, readText) {
  if (entry.timerId) {
    clearTimeout(entry.timerId);
  }
  entry.timerId = setTimeout(() => {
    entry.timerId = null;
    recordNow(entry.docId, readText());
  }, DEBOUNCE_MS);
}

/**
 * Attach the debounced snapshot listener to a single writing-surface element, if not already
 * watched. Safe to call repeatedly for the same element.
 * @param {Element} el
 */
function watchElement(el) {
  if (!el || watchedElements.has(el)) {
    return;
  }

  const entry = { docId: buildDocId(el, nextElementIndex++), listener: null, timerId: null };
  entry.listener = () => scheduleSnapshot(entry, () => readElementText(el));

  el.addEventListener('input', entry.listener);
  watchedElements.set(el, entry);
  updateIndicator();
}

/**
 * The record kept for an editor iframe, made the first time the student is in it. Its id comes
 * from the iframe the way a textarea's comes from the textarea, so an editor Canvas remounts with
 * the same id goes on adding to the same history.
 * @param {HTMLIFrameElement} frame
 */
function watchedFrame(frame) {
  let entry = watchedFrames.get(frame);
  if (!entry) {
    entry = { docId: buildDocId(frame, nextElementIndex++), text: '', timerId: null };
    watchedFrames.set(frame, entry);
    updateIndicator();
  }
  return entry;
}

/**
 * The editor's text as of its latest change. Read on every change rather than when the snapshot
 * is due, because an editor taken off the page may take its document's content with it.
 */
function onEditorInput(event, body, frame) {
  const entry = watchedFrame(frame);
  entry.text = readElementText(body);
  scheduleSnapshot(entry, () => entry.text);
}

/** An editor left the page: keep what was typed since the last snapshot, then let it go. */
function forgetFrame(frame) {
  const entry = watchedFrames.get(frame);
  if (!entry) {
    return;
  }
  if (entry.timerId) {
    clearTimeout(entry.timerId);
    entry.timerId = null;
    recordNow(entry.docId, entry.text);
  }
  watchedFrames.delete(frame);
  updateIndicator();
}

/** Listen to editors that keep the essay in their own iframe; nothing is added to that document. */
function watchEditors() {
  stopEditorFrames = watchEditorFrames({
    onFocus: (body, frame) => watchedFrame(frame),
    onInput: onEditorInput,
    onGone: forgetFrame,
  });
}

function scanForWritingSurfaces(root) {
  if (root.matches?.(WRITING_SURFACE_SELECTOR)) {
    watchElement(root);
  }
  root.querySelectorAll?.(WRITING_SURFACE_SELECTOR).forEach(watchElement);
}

/** Watch for writing surfaces added after the initial scan (e.g. Canvas's RCE loads late). */
function startObserving() {
  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        scanForWritingSurfaces(node);
      });
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

/**
 * Gate on the Authorship Shield companion toggle + a Canvas host, then start watching writing
 * surfaces on the page. No-op when disabled, not on a Canvas host, or already initialized.
 * @returns {Promise<void>}
 */
export async function init() {
  if (initialized) {
    return;
  }

  const enabled = await isCompanionEnabled('authorship');
  if (!enabled || !isLmsHost()) {
    return;
  }

  initialized = true;
  provenanceLog = createProvenanceLog({ storage: createStorageAdapter(), now: () => Date.now() });

  scanForWritingSurfaces(document.body);
  startObserving();
  watchEditors();
  updateIndicator();
}

/**
 * Remove the indicator and any open card, disconnect the observers, and detach every input
 * listener, the editor iframes' included. Idempotent.
 */
export function cleanup() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  watchedElements.forEach((entry, el) => {
    el.removeEventListener('input', entry.listener);
    if (entry.timerId) {
      clearTimeout(entry.timerId);
    }
  });
  watchedElements.clear();

  stopEditorFrames?.();
  stopEditorFrames = null;
  watchedFrames.forEach(entry => clearTimeout(entry.timerId));
  watchedFrames.clear();
  nextElementIndex = 0;

  hideIndicator();
  document.getElementById(CARD_ID)?.remove();
  document.getElementById(INDICATOR_STYLE_ID)?.remove();

  provenanceLog = null;
  initialized = false;
}
