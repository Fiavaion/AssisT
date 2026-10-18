/**
 * The consent window's page (ADR 0009).
 *
 * Opened by the service worker (`background/consent-window.js`) when a feature in a web page first
 * needs an outside service that comes with a Chrome host permission. It asks the same question as
 * the in-page panel, in the same words (`describeConsentQuestion`), and its Allow asks Chrome for
 * the host before anything is awaited, so the press that says yes is the gesture Chrome needs. The
 * answer goes to the worker, which records it only if the question is still open; a refused Chrome
 * prompt is a no.
 *
 * The window belongs to the extension, so a page cannot cover, restyle or click it, and none of the
 * in-page panel's defences are needed. Page text arrives through `chrome.storage.session`, never
 * the address, and is shown with textContent only.
 *
 * @module pages/consent
 */

import { describeConsentQuestion } from '../../utils/consent.js';
import { originsFor, requestHostPermissions } from '../../utils/host-permissions.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { consentWindowKey } from '../../background/consent-window.js';

function paragraph(doc, text, className) {
  const node = doc.createElement('p');
  if (className) {
    node.className = className;
  }
  node.textContent = text;
  return node;
}

function makeButton(doc, label, primary) {
  const node = doc.createElement('button');
  node.type = 'button';
  node.className = primary ? 'consent-btn consent-btn--primary' : 'consent-btn';
  node.textContent = label;
  return node;
}

/**
 * Whether an event is a press that answers, as in the in-page panel: the primary mouse button, or
 * a key that is not being held down. A right-click or a repeating key says nothing.
 * @param {Event} [event]
 * @returns {boolean}
 */
function isAnswerPress(event) {
  if (!event) {
    return true;
  }
  if (event.type === 'mousedown' || event.type === 'click') {
    return event.button === 0;
  }
  return !event.repeat;
}

function showClosed(doc) {
  doc.title = 'AssisT: question closed';
  doc.getElementById('consent-title').textContent = 'This question is no longer open';
  doc
    .getElementById('consent-body')
    .appendChild(paragraph(doc, 'Nothing was sent. Use the tool again and AssisT will ask again.'));
  const close = makeButton(doc, 'Close', true);
  attachAccessibleHandler(close, 'Close consent window', () => window.close());
  doc.getElementById('consent-actions').appendChild(close);
  close.focus();
}

/**
 * Draw the question named in the address and wire its answers.
 *
 * @param {Document} [doc]
 * @param {string} [search] - the page's query string, `?request=<id>`
 * @returns {Promise<void>}
 */
export async function initConsentWindow(doc = document, search = window.location.search) {
  const request = new URLSearchParams(search).get('request') || '';
  const key = consentWindowKey(request);
  let entry = null;
  try {
    entry = (await chrome.storage.session.get(key))[key] || null;
  } catch {
    entry = null;
  }
  const question = entry && describeConsentQuestion(entry.destination, entry);
  if (!question) {
    showClosed(doc);
    return;
  }

  const { destination } = entry;
  doc.title = `AssisT: ${question.title.charAt(0).toLowerCase()}${question.title.slice(1)}`;
  doc.getElementById('consent-title').textContent = question.title;

  const body = doc.getElementById('consent-body');
  if (question.earlier) {
    body.appendChild(paragraph(doc, question.earlier));
  }
  body.appendChild(paragraph(doc, question.purpose));
  if (question.note) {
    body.appendChild(paragraph(doc, question.note));
  }
  if (question.detail) {
    const what = paragraph(doc, question.detailLabel);
    const quoted = doc.createElement('span');
    quoted.className = 'consent-detail';
    quoted.textContent = question.detail;
    what.appendChild(quoted);
    body.appendChild(what);
  }
  body.appendChild(paragraph(doc, question.reassurance, 'consent-muted'));

  const allow = makeButton(doc, 'Allow', true);
  const notNow = makeButton(doc, 'Not now', false);
  const actions = doc.getElementById('consent-actions');
  actions.append(allow, notNow);
  const status = doc.getElementById('consent-status');

  let answering = false;

  // The worker records the answer, once it has checked the question is still open, and closes
  // this window. If the question had already closed, nothing was recorded, and this says so.
  async function answer(granted) {
    let reply = null;
    try {
      reply = await chrome.runtime.sendMessage({
        type: 'CONSENT_WINDOW_ANSWERED',
        request,
        answer: granted ? 'granted' : 'declined',
      });
    } catch {
      reply = null;
    }
    if (reply?.success !== true) {
      status.textContent =
        'This question was already closed, so nothing was recorded. You can close this window.';
      const close = makeButton(doc, 'Close', true);
      attachAccessibleHandler(close, 'Close consent window', () => window.close());
      actions.replaceChildren(close);
      close.focus();
    }
  }

  // A right-click or a key held down is not an answer, as in the in-page panel.
  attachAccessibleHandler(allow, `Consent window Allow (${destination})`, event => {
    if (answering || !isAnswerPress(event)) {
      return;
    }
    answering = true;
    // Chrome is asked in this press, before anything is awaited: a gesture does not survive an
    // await. A refused prompt is a no.
    const access = requestHostPermissions(originsFor([destination]));
    status.textContent = 'Asking Chrome for access…';
    access.then(granted => answer(granted));
  });

  const decline = event => {
    if (answering || !isAnswerPress(event)) {
      return;
    }
    answering = true;
    answer(false);
  };
  attachAccessibleHandler(notNow, `Consent window Not now (${destination})`, decline);
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      decline(event);
    }
  });

  // Focus starts on the answer that sends nothing, as in the in-page panel.
  notNow.focus();
}

if (typeof document !== 'undefined' && document.getElementById('consent-main')) {
  initConsentWindow();
}
