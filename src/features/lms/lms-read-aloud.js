/**
 * @fileoverview The one read-aloud path every LMS integration uses.
 * @module features/lms/lms-read-aloud
 *
 * Canvas, Moodle and Google Classroom all want the same thing: the TTS `readText` function and the
 * student's live TTS settings, both of which live in the content script. Canvas was handed them
 * explicitly; Moodle and Classroom read `window.assistSettings` and `window.assistReadText`, which
 * nothing ever set, so read-aloud on those two platforms could not work at all. A content script's
 * `window` is shared with the host page and with every other extension on it, so the fix is not to
 * start setting those globals — it is to inject the dependency once, here, and let all three
 * platforms ask this module.
 *
 * The content script calls {@link initializeLmsReadAloud} at start-up; the platform modules call
 * {@link readAloud} when the student activates a reader.
 */

import { showToast } from '../../core/ui/toast.js';

/** What the student is told when read-aloud is off. The same sentence on every platform. */
export const READ_ALOUD_OFF_MESSAGE =
  'Read aloud is switched off. Turn it on in the AssisT popup, then try again.';

/** What the student is told when the page holds nothing worth speaking. */
export const NOTHING_TO_READ_MESSAGE = 'There is nothing here for AssisT to read aloud.';

/** What the student is told when the content script never handed over its TTS function. */
export const READ_ALOUD_UNAVAILABLE_MESSAGE =
  'AssisT could not start read aloud on this page. Reload the page and try again.';

/**
 * The TTS function from the content script.
 * @type {Function|null}
 */
let readTextFunction = null;

/**
 * The student's live TTS settings object from the content script. Held by reference, not copied, so
 * a toggle flipped after the page loaded is seen on the next activation.
 * @type {Object|null}
 */
let settingsObject = null;

/**
 * Hand the LMS integrations their TTS dependencies. Called once by the content script.
 *
 * @param {Function} readText - the content script's TTS entry point, `(text, element) => void`
 * @param {Object} settings - the live TTS settings object, whose `enabled` is the master toggle
 * @returns {void}
 */
export function initializeLmsReadAloud(readText, settings) {
  readTextFunction = readText;
  settingsObject = settings;
  console.log('[LMS] Read aloud wired for Canvas, Moodle and Google Classroom');
}

/**
 * Speak some coursework, or say plainly why it cannot be spoken.
 *
 * Every refusal is checked before the announcement, so the student never sees "Reading: ..." from a
 * reading that then fails in silence — the exact way Google Classroom failed before this existed.
 *
 * @param {Object} request
 * @param {string} request.text - the text to speak
 * @param {HTMLElement|null} [request.element] - the element to highlight while speaking
 * @param {string} request.announcement - what to tell the student when reading does start
 * @returns {boolean} true if reading started
 */
export function readAloud({ text, element = null, announcement }) {
  if (!settingsObject || !settingsObject.enabled) {
    showToast(READ_ALOUD_OFF_MESSAGE);
    return false;
  }

  // Punctuation and separators alone are not content: joining three empty posts yields ". . ", and
  // speaking that tells the student nothing.
  if (typeof text !== 'string' || !/[\p{L}\p{N}]/u.test(text)) {
    showToast(NOTHING_TO_READ_MESSAGE);
    return false;
  }

  if (typeof readTextFunction !== 'function') {
    console.error('[LMS] Read aloud requested before the content script wired readText');
    showToast(READ_ALOUD_UNAVAILABLE_MESSAGE);
    return false;
  }

  showToast(announcement);
  readTextFunction(text, element);
  return true;
}

/**
 * Join the parts of a piece of coursework into one spoken sentence, dropping the parts the page did
 * not supply so a missing description does not become a stray full stop.
 *
 * @param {Array<string|null|undefined>} parts
 * @returns {string}
 */
export function joinForSpeech(parts) {
  return parts
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('. ');
}
