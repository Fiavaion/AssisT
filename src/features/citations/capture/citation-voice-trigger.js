/**
 * Citation voice-trigger glue.
 *
 * Produces the `onCitationTrigger` callback that the STT controller consults on every final
 * transcript. The decision to SUPPRESS the phrase from dictation must be synchronous (the controller
 * inserts text immediately), so this returns a boolean straight away from a synchronous trigger
 * match; the actual draft snapshot (which awaits page context) runs fire-and-forget and hands the
 * finished draft to `onDraft`.
 *
 * Public API:
 *   createCitationVoiceTrigger({ getContext, onDraft, triggers })
 *     -> { onCitationTrigger(text) -> boolean, voiceCapture }
 */

import { createVoiceCapture, matchesTrigger, DEFAULT_TRIGGERS } from './voice-capture.js';

/**
 * @param {Object} [options]
 * @param {Function} [options.getContext] - returns `{ url, title, paragraph }` for the reading spot
 * @param {Function} [options.onDraft] - called with the captured draft once snapshotted
 * @param {RegExp[]} [options.triggers] - trigger phrases (defaults to the standard set)
 * @returns {{ onCitationTrigger: (text: string) => boolean, voiceCapture: Object }}
 */
export function createCitationVoiceTrigger(options = {}) {
  const triggers = options.triggers || DEFAULT_TRIGGERS;
  const onDraft = typeof options.onDraft === 'function' ? options.onDraft : null;
  const voiceCapture = createVoiceCapture({ triggers, getContext: options.getContext });

  /**
   * Decide synchronously whether a final transcript is a citation trigger (so the controller can
   * suppress it), and asynchronously snapshot the draft.
   * @param {string} text
   * @returns {boolean} true when the phrase was a trigger and should NOT be inserted as text
   */
  function onCitationTrigger(text) {
    if (!matchesTrigger(text, triggers)) {
      return false;
    }
    // Fire-and-forget the draft snapshot; suppression is already decided.
    Promise.resolve(voiceCapture.handleResult(text))
      .then(draft => {
        if (draft && onDraft) {
          onDraft(draft);
        }
      })
      .catch(err => console.error('[Citation] Voice capture failed:', err));
    return true;
  }

  return { onCitationTrigger, voiceCapture };
}

export default { createCitationVoiceTrigger };
