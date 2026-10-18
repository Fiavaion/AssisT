/**
 * The student's yes to dictation (ADR 0006).
 *
 * Dictation uses Chrome's own speech recognition, which is a Google service: the sound of the
 * student's voice is sent there to be turned into text. AssisT makes no request itself, so there is
 * nothing for the service worker to refuse; instead every place that starts speech recognition
 * asks here first, and starts nothing without a yes.
 *
 *   - Not asked yet: the consent panel asks, once.
 *   - A no: remembered. Pressing the microphone again is the student asking, so the panel comes
 *     back saying the earlier answer was no and nothing was sent, with Allow in it.
 *   - A yes withdrawn in the popup stops dictation that is running, at once (`onDictationWithdrawn`).
 *
 * @module utils/dictation-consent
 */

import { consentStorageKey, getConsent } from './consent.js';
import { askForConsent } from './consent-panel.js';

/**
 * Whether dictation may start now, asking the student if it is theirs to answer.
 * @param {Object} [options]
 * @param {HTMLElement} [options.returnFocus] - where focus goes after the question, if nowhere
 * @param {'dictation'|'lectureCapture'} [options.destination] - lecture capture hears the whole
 *   room, not the student alone, so it has its own question and its own answer
 * @returns {Promise<boolean>}
 */
export async function allowDictation({ returnFocus, destination = 'dictation' } = {}) {
  const state = await getConsent(destination);
  if (state === 'granted') {
    return true;
  }
  const answer = await askForConsent(destination, {
    returnFocus,
    declinedBefore: state === 'declined',
  });
  return answer === 'granted';
}

/**
 * Call `stop` when the yes to dictation stops being a yes, wherever that happened.
 * @param {() => void} stop
 * @param {'dictation'|'lectureCapture'} [destination]
 * @returns {() => void} unsubscribe
 */
export function onDictationWithdrawn(stop, destination = 'dictation') {
  const events = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : null;
  if (!events) {
    return () => {};
  }
  const key = consentStorageKey(destination);
  const listener = (changes, area) => {
    if (area === 'local' && changes[key] && changes[key].newValue?.granted !== true) {
      stop();
    }
  };
  events.addListener(listener);
  return () => events.removeListener(listener);
}
