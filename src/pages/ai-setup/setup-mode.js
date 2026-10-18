/**
 * AI-setup mode resolution.
 *
 * The wizard pre-selects a recommended mode so the Configure screen has a panel to show. That
 * pre-selection is presentation, NOT a choice — a student who skips the wizard has opted out of
 * AI, so the mode they never picked must never be persisted. Only an explicit commitment
 * (choosing a mode, continuing past Configure, verifying a key, downloading a model, or a mode
 * already stored from a previous run) counts.
 */

/** The mode persisted when the student has not committed to one. */
export const UNCONFIRMED_MODE = 'off';

/**
 * Resolve the AI mode to persist.
 *
 * @param {Object} state
 * @param {string|null} [state.selectedMode] - the mode currently shown in the wizard
 * @param {boolean} [state.modeConfirmed]    - true once the student has committed to it
 * @returns {string} the mode to write to storage
 */
export function resolveAiMode({ selectedMode, modeConfirmed } = {}) {
  if (!modeConfirmed) {
    return UNCONFIRMED_MODE;
  }
  return selectedMode || UNCONFIRMED_MODE;
}
