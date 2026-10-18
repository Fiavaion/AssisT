/**
 * Citation wizard modal adapter.
 *
 * Wraps the EF step-rail wizard in the modal overlay and exposes a promise-based call that
 * replaces the retired showCitationEditModal: it resolves with the finished citation when the
 * student saves, or null when they cancel / dismiss. No confirm dialogs — dismissal is always
 * safe (the caller's save tray offers Undo).
 *
 * Pass `onSave` to have the dialog stay open until the record is actually stored: the overlay
 * closes only once it has resolved, so a failed write can never take the dialog (and the source
 * with it) away. Without it the promise resolves as soon as the student saves and storing is the
 * caller's own next step.
 *
 * Public API:
 *   showCitationWizard(draft, { style, projects, initialStep, onSave }) -> Promise<Object|null>
 */

import { openOverlay } from './citation-overlay.js';
import { createStepRailWizard } from './wizard/step-rail-wizard.js';

/**
 * Open the capture/edit wizard and resolve with the result.
 * @param {Object} [draft] - prefilled citation (capture result or existing citation to edit)
 * @param {{style?: string, initialStep?: string, projects?: Array, referencePool?: Array,
 *          onSave?: (citation: Object) => Promise<any>}} [options] - `projects` are the student's
 *        collections, offered on the NOTES step so a source can be filed as it is saved;
 *        `referencePool` is every saved citation, so the preview carries its year letter; `onSave`
 *        stores the citation, and the dialog stays open until it succeeds.
 * @returns {Promise<Object|null>} the saved citation, or null if cancelled
 */
export function showCitationWizard(draft = {}, options = {}) {
  return new Promise(resolve => {
    let settled = false;
    let overlay = null;

    const finish = result => {
      if (settled) {
        return;
      }
      settled = true;
      wizard.destroy();
      if (overlay) {
        overlay.close();
      }
      resolve(result);
    };

    const wizard = createStepRailWizard({
      draft,
      style: options.style,
      initialStep: options.initialStep,
      projects: options.projects,
      referencePool: options.referencePool,
      onSave: options.onSave,
      onComplete: citation => finish(citation),
      onCancel: () => finish(null),
    });

    overlay = openOverlay({
      content: wizard.el,
      label: draft && draft._isEdit ? 'Edit citation' : 'Add a citation',
      // A notice that no passage was captured is the first thing a screen reader should hear.
      describedBy: wizard.noticeId || undefined,
      onClose: () => finish(null),
    });
  });
}

export default { showCitationWizard };
