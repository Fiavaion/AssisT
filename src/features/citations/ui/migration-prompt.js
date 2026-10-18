/**
 * First-run citation migration prompt.
 *
 * Shown once, the first time the student opens the citation library after the canonical
 * extension-origin store comes online. Offers the two locked choices with honest framing:
 *   - **Start fresh** (default, recommended) — nothing to do; the new shared library begins clean.
 *   - **Import what we can** — reconstruct review-flagged stubs from the old projection.
 *
 * Honest, non-alarming: citations saved while browsing other websites can't be moved here (browser
 * origin isolation) but are NOT deleted. All copy is plain-language; the dialog is keyboard-operable
 * and screen-reader friendly (role=status live region for the outcome; no timed auto-dismiss).
 *
 * Split into a pure content builder (testable without the overlay) and a thin `showMigrationPrompt`
 * that mounts it in the shared accessible overlay and resolves with the migration result (or null if
 * the student dismissed without choosing — in which case it is offered again next time).
 */

import { openOverlay } from './citation-overlay.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';

/**
 * Build the prompt content element and wire its buttons to the migration runner.
 * @param {Object} opts
 * @param {{ startFresh: Function, bestEffortImport: Function }} opts.migration - RPC migration client
 * @param {(result: Object) => void} opts.onResolved - called when the student has chosen and seen any
 *        outcome and the dialog should close (receives the migration result)
 * @returns {{ root: HTMLElement, freshBtn: HTMLElement, importBtn: HTMLElement, status: HTMLElement }}
 */
export function createMigrationPromptContent({ migration, onResolved }) {
  const root = document.createElement('div');
  root.className = 'assist-cite-root assist-cite-migration';

  const title = document.createElement('h2');
  title.className = 'assist-cite-migration__title';
  title.id = 'assist-cite-migration-title';
  title.textContent = 'Set up your citation library';
  root.appendChild(title);

  const intro = document.createElement('p');
  intro.className = 'assist-cite-migration__intro';
  intro.textContent =
    'AssisT now keeps all your citations together in one library, shared across every website. ' +
    'How would you like to start?';
  root.appendChild(intro);

  const actions = document.createElement('div');
  actions.className = 'assist-cite-migration__actions';

  const freshBtn = document.createElement('button');
  freshBtn.type = 'button';
  freshBtn.className = 'assist-cite-btn assist-cite-btn--primary';
  freshBtn.textContent = 'Start fresh';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'assist-cite-btn assist-cite-btn--ghost';
  importBtn.textContent = 'Import what we can';

  actions.appendChild(freshBtn);
  actions.appendChild(importBtn);
  root.appendChild(actions);

  const note = document.createElement('p');
  note.className = 'assist-cite-migration__note';
  note.textContent =
    "Citations you saved while browsing other websites can't be moved here — your browser keeps each " +
    "site's data separate for your privacy. They aren't deleted, just not shown in this library.";
  root.appendChild(note);

  // Outcome live region (announced to screen readers).
  const status = document.createElement('div');
  status.className = 'assist-cite-reassure';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  root.appendChild(status);

  let busy = false;

  /** Replace the two choices with a single "Continue to library" button that finishes. */
  function showContinue(result) {
    actions.textContent = '';
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.className = 'assist-cite-btn assist-cite-btn--primary';
    cont.textContent = 'Continue to library';
    actions.appendChild(cont);
    attachAccessibleHandler(cont, 'Continue to library', () => onResolved?.(result));
    cont.focus();
  }

  async function run(kind) {
    if (busy) {
      return;
    }
    busy = true;
    freshBtn.disabled = true;
    importBtn.disabled = true;
    importBtn.setAttribute('aria-busy', 'true');
    try {
      if (kind === 'fresh') {
        const result = await migration.startFresh();
        onResolved?.(result); // nothing to report — close straight to the (clean) library
        return;
      }
      const result = await migration.bestEffortImport();
      const { imported = 0, skipped = 0 } = result || {};
      status.hidden = false;
      status.className =
        'assist-cite-reassure ' +
        (imported > 0 ? 'assist-cite-reassure--green' : 'assist-cite-reassure--amber');
      status.textContent =
        imported > 0
          ? `Recovered ${imported} citation${imported === 1 ? '' : 's'} to review` +
            (skipped > 0 ? `; ${skipped} couldn't be recovered.` : '.')
          : "We couldn't recover any citations automatically — you can add them as you go.";
      showContinue(result);
    } catch (err) {
      status.hidden = false;
      status.className = 'assist-cite-reassure assist-cite-reassure--amber';
      status.textContent = `Couldn't finish that just now: ${err?.message || 'please try again.'}`;
      busy = false;
      freshBtn.disabled = false;
      importBtn.disabled = false;
      importBtn.removeAttribute('aria-busy');
    }
  }

  attachAccessibleHandler(freshBtn, 'Start fresh', () => run('fresh'));
  attachAccessibleHandler(importBtn, 'Import what we can', () => run('import'));

  return { root, freshBtn, importBtn, status };
}

/**
 * Mount the migration prompt in the shared accessible overlay.
 * @param {Object} opts
 * @param {{ startFresh: Function, bestEffortImport: Function }} opts.migration
 * @returns {Promise<Object|null>} the migration result, or null if dismissed without choosing
 */
export function showMigrationPrompt({ migration } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    let overlay = null;
    const { root, freshBtn } = createMigrationPromptContent({
      migration,
      onResolved: result => {
        overlay?.close();
        finish(result);
      },
    });

    overlay = openOverlay({
      content: root,
      label: 'Set up your citation library',
      initialFocus: freshBtn,
      // Dismissed (Escape / backdrop) without choosing → offer again next time.
      onClose: () => finish(null),
    });
  });
}

export default { createMigrationPromptContent, showMigrationPrompt };
