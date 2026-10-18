/**
 * Profile prompt addendum — one place where the cognitive profile reaches every AI feature.
 *
 * Returns a short natural-language instruction derived from the learner's cognitive profile
 * (dominant learning style + preferred complexity), or an empty string when the personalisedAi
 * companion toggle is off, the profile is unavailable, or adaptation is disabled in the profile
 * itself. Callers simply append the result to their prompt.
 *
 * @module features/companion/profile-addendum
 */

import { isCompanionEnabled } from './companion-settings.js';

export async function getProfileAddendum() {
  try {
    if (!(await isCompanionEnabled('personalisedAi'))) {
      return '';
    }
    const profile =
      typeof window !== 'undefined' &&
      window.assistFeatures &&
      window.assistFeatures.cognitiveProfile;
    const modifiers = (profile && profile.getPromptModifiers && profile.getPromptModifiers()) || {};
    const parts = [modifiers.style, modifiers.complexity].filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    return `\n\nAdapt the response to this learner: ${parts.join(' ')}`;
  } catch {
    return '';
  }
}
