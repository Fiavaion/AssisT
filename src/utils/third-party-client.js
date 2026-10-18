/**
 * How a content script or an extension page asks for something from an outside service
 * (ADR 0006). It never fetches: it asks the service worker, which owns every third-party request
 * (`background/third-party-requests.js`), and it is where the first-use question is asked.
 *
 *   - Unanswered destination, or one whose host Chrome does not hold (ADR 0009): the question is
 *     asked (the panel, or from a page the consent window). Allow completes the request the
 *     student made; Not now sends nothing and comes back as consent-declined.
 *   - Recorded no: comes straight back as consent-declined, with no panel, so nobody is nagged.
 *   - `ask: false`, for lookups the student did not start (a badge checking itself on render):
 *     never opens the panel.
 *
 * Replies are the worker's { success, data } / { success: false, code, error } shape, and this
 * function never throws.
 *
 * @module utils/third-party-client
 */

import { askForConsent } from './consent-panel.js';

/** Longer than the slowest request the worker makes, so the worker's own timeout wins. */
const ROUND_TRIP_TIMEOUT_MS = 90000;

/** Worker refusals that mean "not asked yet": no answer, or a yes whose host Chrome does not hold. */
const NEEDS_ASKING = ['consent-unasked', 'permission-missing'];

async function askWorker(destination, params) {
  let timer;
  try {
    const reply = await Promise.race([
      chrome.runtime.sendMessage({ type: 'THIRD_PARTY_REQUEST', destination, params }),
      new Promise(resolve => {
        timer = setTimeout(
          () =>
            resolve({ success: false, code: 'timeout', error: 'Request timed out — try again' }),
          ROUND_TRIP_TIMEOUT_MS
        );
      }),
    ]);
    if (!reply || typeof reply !== 'object') {
      return { success: false, code: 'unavailable', error: 'AssisT could not be reached' };
    }
    return reply;
  } catch (error) {
    console.error('[AssisT] Could not reach the service worker:', error);
    return { success: false, code: 'unavailable', error: 'AssisT could not be reached' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} destination - dictionary, translation, pageTranslation, citations,
 *   citationVerification
 * @param {Object} params - that destination's parameters (see the worker's request builders)
 * @param {Object} [options]
 * @param {boolean} [options.ask=true] - false for lookups the student did not start
 * @param {string} [options.detail] - what is being sent, shown in the panel
 * @param {HTMLElement} [options.returnFocus] - where focus goes after the panel
 * @returns {Promise<Object>} the worker's reply
 */
export async function requestThirdParty(destination, params, options = {}) {
  const { ask = true, ...panelOptions } = options;
  const reply = await askWorker(destination, params);
  // A host Chrome does not hold is no consent (ADR 0009): the question asks for both.
  if (!NEEDS_ASKING.includes(reply.code) || !ask) {
    return reply;
  }

  const answer = await askForConsent(destination, panelOptions);
  if (answer !== 'granted') {
    return {
      success: false,
      code: 'consent-declined',
      destination,
      error: 'The student has not allowed this service',
    };
  }
  return askWorker(destination, params);
}
