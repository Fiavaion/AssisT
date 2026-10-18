/**
 * The consent window: the first-use question, asked from an extension window (ADR 0009).
 *
 * Every outside service but dictation needs a Chrome host permission, asked for in the same press
 * as the consent. A content script has no `chrome.permissions`, so when a page feature asks first,
 * `utils/consent-panel.js` sends CONSENT_WINDOW_OPEN here and this module opens
 * `pages/consent/consent.html` in a small popup window. The window asks Chrome for the host in the
 * student's press, then sends CONSENT_WINDOW_ANSWERED; this module records the answer, only for a
 * question it still holds, passes it to the frame that asked and closes the window. A window closed
 * without an answer is passed on as "dismissed": nothing was recorded. A page that asks again while
 * its window is open sends CONSENT_WINDOW_FOCUS, and the window is brought forward.
 *
 * The question (which service, the word or passage it concerns, who asked) waits in
 * `chrome.storage.session`, which content scripts cannot read and which outlives a worker restart.
 * The page text never goes into the window's address.
 *
 * @module background/consent-window
 */

import { DESTINATIONS, recordConsent } from '../utils/consent.js';
import { OPTIONAL_HOST_ORIGINS } from './third-party-requests.js';

const PAGE = 'src/pages/consent/consent.html';
const KEY_PREFIX = 'assist_consent_window_';
const WINDOW_KEY_PREFIX = 'assist_consent_windowid_';

/** Room for the question at the default text size and with text spacing increased (SC 1.4.12). */
const WINDOW_SIZE = Object.freeze({ width: 520, height: 560 });

/**
 * The session key a question is kept under, for the window to read.
 * @param {string} request
 * @returns {string}
 */
export function consentWindowKey(request) {
  return `${KEY_PREFIX}${request}`;
}

function needsWindow(destination) {
  return (
    typeof destination === 'string' &&
    Object.hasOwn(DESTINATIONS, destination) &&
    Object.hasOwn(OPTIONAL_HOST_ORIGINS, destination)
  );
}

function fromConsentPage(sender) {
  const page = chrome.runtime.getURL(PAGE);
  return (
    sender?.id === chrome.runtime.id &&
    typeof sender.url === 'string' &&
    (sender.url === page || sender.url.startsWith(`${page}?`))
  );
}

/**
 * The session key that says which question a window shows. A key of its own, written after the
 * window opens, so the question itself is written once and never again: an answer that removes
 * it cannot be undone by a late write.
 * @param {number} windowId
 * @returns {string}
 */
function windowQuestionKey(windowId) {
  return `${WINDOW_KEY_PREFIX}${windowId}`;
}

async function questionFor(request) {
  const key = consentWindowKey(request);
  return (await chrome.storage.session.get(key))[key] || null;
}

async function openWindow(message, sender) {
  if (!needsWindow(message.destination) || typeof sender?.tab?.id !== 'number') {
    return { success: false };
  }
  const request = crypto.randomUUID();
  const key = consentWindowKey(request);
  const question = {
    destination: message.destination,
    detail: typeof message.detail === 'string' ? message.detail : '',
    detailLabel: typeof message.detailLabel === 'string' ? message.detailLabel : '',
    declinedBefore: message.declinedBefore === true,
    tabId: sender.tab.id,
    frameId: typeof sender.frameId === 'number' ? sender.frameId : 0,
  };
  let created;
  try {
    // Kept before the window opens, so the window always finds its question.
    await chrome.storage.session.set({ [key]: question });
    created = await chrome.windows.create({
      url: `${chrome.runtime.getURL(PAGE)}?request=${request}`,
      type: 'popup',
      focused: true,
      ...WINDOW_SIZE,
    });
  } catch (error) {
    console.error('[AssisT] Could not open the consent window:', error);
    await chrome.storage.session.remove(key).catch(() => {});
    return { success: false };
  }

  await chrome.storage.session.set({ [windowQuestionKey(created.id)]: request });
  // Answered before the window was known: the answer could not close it, so close it here.
  if (!(await questionFor(request))) {
    await chrome.storage.session.remove(windowQuestionKey(created.id));
    await chrome.windows.remove(created.id).catch(() => {});
    return { success: true, request };
  }
  // Closed before the window was known: windows.onRemoved found nothing, so say it now.
  const stillOpen = await chrome.windows.get(created.id).then(
    () => true,
    () => false
  );
  if (!stillOpen) {
    await handleConsentWindowClosed(created.id);
  }
  return { success: true, request };
}

/** Tell the frame that asked, and forget the question. A tab that has gone is not an error. */
async function settle(request, question, answer) {
  await chrome.storage.session.remove(consentWindowKey(request));
  try {
    await chrome.tabs.sendMessage(
      question.tabId,
      { type: 'CONSENT_WINDOW_ANSWER', request, answer },
      { frameId: question.frameId }
    );
  } catch {
    // The page that asked was closed or navigated away; nobody is waiting.
  }
}

async function answered(message, sender) {
  if (!fromConsentPage(sender) || typeof message.request !== 'string') {
    return { success: false };
  }
  const question = await questionFor(message.request);
  if (!question) {
    return { success: false };
  }
  // Recorded here, for a question this worker still holds, so a window whose question has closed
  // can never record an answer nobody asked for.
  const granted = message.answer === 'granted';
  await recordConsent(question.destination, granted);
  await settle(message.request, question, granted ? 'granted' : 'declined');
  // The window the answer came from, which Chrome names whether or not its id was kept yet.
  const windowId = sender.tab?.windowId;
  if (typeof windowId === 'number') {
    await chrome.storage.session.remove(windowQuestionKey(windowId));
    await chrome.windows.remove(windowId).catch(() => {});
  }
  return { success: true };
}

/** The page asked again while its window is open: bring the window forward. */
async function focusWindow(message, sender) {
  if (typeof message.request !== 'string') {
    return { success: false };
  }
  const question = await questionFor(message.request);
  if (!question || question.tabId !== sender?.tab?.id) {
    return { success: false };
  }
  const all = await chrome.storage.session.get(null);
  const windowKey = Object.keys(all || {}).find(
    key => key.startsWith(WINDOW_KEY_PREFIX) && all[key] === message.request
  );
  if (!windowKey) {
    return { success: false };
  }
  try {
    await chrome.windows.update(Number(windowKey.slice(WINDOW_KEY_PREFIX.length)), {
      focused: true,
      drawAttention: true,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * The worker's handler for CONSENT_WINDOW_OPEN and CONSENT_WINDOW_FOCUS (from a content script)
 * and CONSENT_WINDOW_ANSWERED (from the consent window).
 *
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {boolean} true when the message was this handler's (the reply is asynchronous)
 */
export function handleConsentWindowMessage(message, sender, sendResponse) {
  if (message?.type === 'CONSENT_WINDOW_OPEN') {
    openWindow(message, sender).then(sendResponse);
    return true;
  }
  if (message?.type === 'CONSENT_WINDOW_ANSWERED') {
    answered(message, sender).then(sendResponse);
    return true;
  }
  if (message?.type === 'CONSENT_WINDOW_FOCUS') {
    focusWindow(message, sender).then(sendResponse);
    return true;
  }
  return false;
}

/**
 * A window closed. If it was a consent window still waiting for an answer, the frame that asked
 * hears "dismissed": the student gave no answer, so nothing was recorded or sent.
 *
 * @param {number} windowId
 * @returns {Promise<void>}
 */
export async function handleConsentWindowClosed(windowId) {
  const windowKey = windowQuestionKey(windowId);
  const request = (await chrome.storage.session.get(windowKey))[windowKey];
  if (typeof request !== 'string') {
    return;
  }
  await chrome.storage.session.remove(windowKey);
  const question = await questionFor(request);
  if (question) {
    await settle(request, question, 'dismissed');
  }
}
