/**
 * The mind map library — what the page shows when no map is named in the URL.
 *
 * Maps are free-standing (ADR 0001): a student starts one from the popup, from a highlight on any
 * page, or from a keyboard shortcut, so they need somewhere to find the one they want. That makes
 * this the page's front door, and the only place a map can be destroyed — there is no trash for
 * maps — which is why deleting asks first and says afterwards.
 *
 * Nothing here touches the database or the model. The page hands in the four things this view
 * cannot do for itself (list, delete, rename, build) so the same view can be driven by a test with
 * no Dexie in the room.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { createDialogShell } from './dialog-shell.js';
import { IMPORT_ACCEPT, createImportFlow } from './import-flow.js';
import { mountNewMapDialog } from './new-map-dialog.js';

/** Quiet time before the map count is rewritten, so a search says its answer once. */
const COUNT_DELAY_MS = 250;

/**
 * The site a map started from, in the short form a student would recognise.
 * @param {string|null} url
 * @returns {string} '' when there is no usable source
 */
function siteOf(url) {
  if (!url) {
    return '';
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * @param {number} updatedAt - epoch ms
 * @returns {string} the date a student would read
 */
function whenOf(updatedAt) {
  if (!updatedAt) {
    return '';
  }
  return new Date(updatedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Mount the library.
 *
 * @param {HTMLElement} host
 * @param {Object} options
 * @param {() => Promise<Array<{id: string, title: string, updatedAt: number, nodeCount: number, sourceUrl: string|null}>>} options.listMaps
 * @param {(id: string) => Promise<void>} options.deleteMap
 * @param {(id: string, title: string) => Promise<void>} options.renameMap
 * @param {(templateId: string, title: string) => Promise<string>} options.createFromTemplate - resolves with the new map id.
 * @param {(map: Object, sentence: string) => Promise<void>} options.onImport - store the map a file
 *   became and open it. The same function the editor's File menu is given, so a file picked here
 *   and a file picked there arrive the same way, said in the same words (see `import-flow.js`).
 * @param {(id: string) => void} options.onOpen
 * @param {(text: string) => void} [options.announce]
 * @param {(text: string, kind?: 'info'|'error') => void} [options.notify] - the page's `showToast`,
 *   which writes the toast AND the live region. Everything the import says goes through it.
 * @param {(listener: (change: {mapId: string}) => void) => (() => void)} [options.subscribeMapsChanged]
 *   - `onMapsChanged` from mindmap-db.js. A map saved in another tab, or by a highlight capture
 *   while this one is open, has to show up here without the student reloading the page.
 * @returns {{ refresh: () => Promise<void>, destroy: () => void }}
 */
export function mountLibraryView(host, options = {}) {
  const {
    listMaps,
    deleteMap,
    renameMap,
    createFromTemplate,
    onImport,
    onOpen,
    announce = () => {},
    notify = () => {},
    subscribeMapsChanged = null,
    decompressionStream,
  } = options;

  const doc = host.ownerDocument;
  const cleanups = [];
  /** Handlers on the cards, torn down and rebuilt with the cards they belong to. */
  let cardCleanups = [];
  /** @type {Array<Object>} */
  let summaries = [];
  let query = '';
  /** The map a dialog is currently about. */
  let subject = null;

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };

  const root = el('div', 'assist-mm-library');

  // ── The bar: search, and the two ways to start a map ──────────────────────
  const bar = el('div', 'assist-mm-library__bar');
  const searchLabel = el('label', 'assist-mm-library__search-label', 'Search your maps');
  searchLabel.htmlFor = 'assist-mm-library-search';
  const search = doc.createElement('input');
  search.type = 'search';
  search.id = 'assist-mm-library-search';
  search.className = 'assist-mm-library__search';
  search.placeholder = 'Search by title';

  const newButton = el(
    'button',
    'assist-mm-button assist-mm-button--primary assist-mm-library__new',
    'New map'
  );
  newButton.type = 'button';
  const importButton = el('button', 'assist-mm-button assist-mm-library__import', 'Import');
  importButton.type = 'button';
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'assist-mm-library__file';
  // The same list the editor's Import offers: one place decides what a mind map file is.
  fileInput.accept = IMPORT_ACCEPT;
  fileInput.hidden = true;
  fileInput.dataset.testid = 'library-import-file';

  bar.append(searchLabel, search, newButton, importButton, fileInput);

  const count = el('p', 'assist-mm-library__count');
  count.setAttribute('role', 'status');

  const error = el('p', 'assist-mm-library__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const list = el('ul', 'assist-mm-library__list');
  list.setAttribute('aria-label', 'Your mind maps');

  const empty = el('p', 'assist-mm-library__empty');
  empty.dataset.testid = 'library-empty';
  empty.hidden = true;

  root.append(bar, count, error, list, empty);

  // ── Dialogs ───────────────────────────────────────────────────────────────
  // Both are built on the page's dialog shell, which restores focus from the element's own `close`
  // event: Escape is the exit a student is most likely to take and the one no button can catch.
  const deleteShell = createDialogShell(root, { name: 'delete', title: 'Delete this map?' });
  const deleteBody = el('p', 'assist-mm-dialog__body');
  const deleteActions = el('div', 'assist-mm-dialog__actions');
  const deleteCancel = el('button', 'assist-mm-button', 'Keep it');
  deleteCancel.type = 'button';
  deleteCancel.dataset.command = 'cancel';
  deleteCancel.dataset.action = 'cancel';
  const deleteConfirm = el(
    'button',
    'assist-mm-button assist-mm-button--danger',
    'Delete for good'
  );
  deleteConfirm.type = 'button';
  deleteConfirm.dataset.command = 'confirm-delete';
  deleteActions.append(deleteCancel, deleteConfirm);
  deleteShell.element.append(deleteBody, deleteActions);

  const renameShell = createDialogShell(root, { name: 'rename', title: 'Rename this map' });
  const renameForm = doc.createElement('form');
  const renameLabel = el('label', 'assist-mm-field__label', 'Title');
  renameLabel.htmlFor = 'assist-mm-rename-input';
  const renameInput = doc.createElement('input');
  renameInput.type = 'text';
  renameInput.id = 'assist-mm-rename-input';
  renameInput.className = 'assist-mm-field__input';
  // No `required`: the handler owns the refusal, so an empty box and a box holding two spaces are
  // answered in the same words, in a hint the box points at rather than in a browser bubble.
  const renameError = el('p', 'assist-mm-dialog__hint');
  renameError.id = 'assist-mm-rename-hint';
  renameError.setAttribute('role', 'status');
  renameInput.setAttribute('aria-describedby', renameError.id);
  const renameActions = el('div', 'assist-mm-dialog__actions');
  const renameCancel = el('button', 'assist-mm-button', 'Cancel');
  renameCancel.type = 'button';
  renameCancel.dataset.command = 'cancel';
  renameCancel.dataset.action = 'cancel';
  const renameSave = el('button', 'assist-mm-button assist-mm-button--primary', 'Save title');
  renameSave.type = 'submit';
  renameActions.append(renameCancel, renameSave);
  renameForm.append(renameLabel, renameInput, renameError, renameActions);
  renameShell.element.appendChild(renameForm);

  // Starting a map is the same dialog here and in the editor's File menu, so it is one module
  // mounted by whichever view is on screen rather than two copies drifting apart.
  const newMapDialog = mountNewMapDialog(root, {
    onCreate: async (templateId, title) => {
      const id = await createFromTemplate(templateId, title);
      announce(`Created ${title}.`);
      onOpen(id);
    },
  });

  host.appendChild(root);

  /**
   * @param {Error} problem @param {string} whileDoing
   *
   * Shown before it is written: a `role="alert"` written while the element is still hidden is out
   * of the accessibility tree, so the words appear and nothing is ever announced.
   */
  function showError(problem, whileDoing) {
    error.hidden = false;
    error.textContent = `${whileDoing}: ${problem?.message || 'something went wrong.'}`;
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
  }

  /** @returns {Array<Object>} the maps matching the search box */
  function matching() {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return summaries;
    }
    return summaries.filter(summary => summary.title.toLowerCase().includes(needle));
  }

  /** @param {Object} summary @returns {HTMLElement} */
  function buildCard(summary) {
    const card = el('li', 'assist-mm-card');
    card.dataset.id = summary.id;
    card.dataset.testid = 'map-card';

    const title = el('h2', 'assist-mm-card__title', summary.title);
    title.dataset.testid = 'map-card-title';
    card.appendChild(title);

    const parts = [`${summary.nodeCount} ${summary.nodeCount === 1 ? 'node' : 'nodes'}`];
    const when = whenOf(summary.updatedAt);
    if (when) {
      parts.push(`Updated ${when}`);
    }
    const site = siteOf(summary.sourceUrl);
    if (site) {
      parts.push(site);
    }
    const meta = el('p', 'assist-mm-card__meta', parts.join(' · '));
    meta.dataset.testid = 'map-card-meta';
    card.appendChild(meta);

    const actions = el('div', 'assist-mm-card__actions');
    // The third column is the WAI-Adapt purpose; Rename has no token in the draft, so it has none.
    for (const [action, label, purpose] of [
      ['open', 'Open', 'open'],
      ['rename', 'Rename', null],
      ['delete', 'Delete', 'delete'],
    ]) {
      const button = el('button', `assist-mm-button assist-mm-button--${action}`, label);
      button.type = 'button';
      button.dataset.command = action;
      if (purpose) {
        button.dataset.action = purpose;
      }
      // The visible word starts the accessible name, so speech input still reaches it (SC 2.5.3).
      button.setAttribute('aria-label', `${label} ${summary.title}`);
      actions.appendChild(button);
      // Bound per card rather than delegated from the list: a delegated mousedown handler answers
      // the pointer only, and Open, Rename and Delete are the whole of what this page does.
      cardCleanups.push(
        attachAccessibleHandler(button, `Map ${action}`, () => runCardAction(summary, action))
      );
    }
    card.appendChild(actions);
    return card;
  }

  /** @param {Object} summary @param {string} action - 'open', 'rename' or 'delete' */
  function runCardAction(summary, action) {
    if (action === 'open') {
      onOpen(summary.id);
      return;
    }
    subject = summary;
    if (action === 'rename') {
      renameError.textContent = '';
      renameInput.value = summary.title;
      renameShell.open(renameInput);
      return;
    }
    deleteBody.textContent = `${summary.title} will be deleted for good. There is no trash for maps, so this cannot be undone.`;
    deleteShell.open(deleteCancel);
  }

  function renderList() {
    const shown = matching();
    for (const cleanup of cardCleanups) {
      cleanup();
    }
    cardCleanups = [];
    list.textContent = '';
    for (const summary of shown) {
      list.appendChild(buildCard(summary));
    }

    announceCount(shown.length);

    if (shown.length > 0) {
      empty.hidden = true;
      return;
    }
    empty.hidden = false;
    empty.textContent = summaries.length
      ? `No map matches "${query.trim()}". Clear the search to see them all.`
      : 'You have no mind maps yet. New map starts one from a template, or Import brings in an outline you already have.';
  }

  /**
   * The count is a live region, so every rewrite interrupts a screen reader. Typing "lecture" would
   * otherwise queue seven readings of a number the student is still changing; this speaks the
   * answer once the typing stops. The list itself is never delayed.
   */
  let countTimer = null;

  /** @param {number} shown */
  function announceCount(shown) {
    const text = summaries.length
      ? `${shown} of ${summaries.length} ${summaries.length === 1 ? 'map' : 'maps'}`
      : '';
    if (countTimer !== null) {
      clearTimeout(countTimer);
    }
    countTimer = setTimeout(() => {
      countTimer = null;
      count.textContent = text;
    }, COUNT_DELAY_MS);
  }

  /** Read the maps again and redraw. @returns {Promise<void>} */
  async function refresh() {
    try {
      summaries = await listMaps();
      clearError();
    } catch (problem) {
      summaries = [];
      showError(problem, 'Your maps could not be read');
    }
    renderList();
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  search.addEventListener('input', () => {
    query = search.value;
    renderList();
  });

  // The editor's File menu runs exactly this. Both surfaces get the progress sentence, the busy
  // state, the refusal for a second pick while one is still being read, and the one sentence
  // saying what came in — there is no second, quieter import path any more.
  const importFlow = createImportFlow({
    input: fileInput,
    control: importButton,
    notify,
    onImport,
    setBusy: busy => {
      if (busy) {
        root.setAttribute('aria-busy', 'true');
        importButton.setAttribute('aria-disabled', 'true');
      } else {
        root.removeAttribute('aria-busy');
        importButton.removeAttribute('aria-disabled');
      }
    },
    decompressionStream,
  });
  cleanups.push(() => importFlow.destroy());

  cleanups.push(
    attachAccessibleHandler(newButton, 'New map', () => newMapDialog.open()),
    attachAccessibleHandler(importButton, 'Import map', () => importFlow.pick()),
    attachAccessibleHandler(deleteCancel, 'Keep map', () => deleteShell.close()),
    attachAccessibleHandler(renameCancel, 'Cancel rename', () => renameShell.close()),
    attachAccessibleHandler(deleteConfirm, 'Delete map', async () => {
      const target = subject;
      deleteShell.close();
      if (!target) {
        return;
      }
      try {
        await deleteMap(target.id);
        announce(`Deleted the map ${target.title}.`);
        await refresh();
      } catch (problem) {
        showError(problem, `${target.title} could not be deleted`);
      }
    })
  );

  const onRenameSubmit = async event => {
    event.preventDefault();
    const title = renameInput.value.trim();
    if (!title) {
      renameError.textContent = 'A map needs a title.';
      renameInput.focus();
      return;
    }
    const target = subject;
    try {
      await renameMap(target.id, title);
      renameShell.close();
      announce(`Renamed to ${title}.`);
      await refresh();
    } catch (problem) {
      renameError.textContent = problem?.message || 'The title could not be saved.';
    }
  };
  renameForm.addEventListener('submit', onRenameSubmit);

  // A capture from a page, or an edit in another tab, writes to the same database this list came
  // from. Without this the library would sit there showing an answer that is already out of date.
  const unsubscribeMaps =
    typeof subscribeMapsChanged === 'function' ? subscribeMapsChanged(() => refresh()) : null;

  refresh();

  return {
    refresh,

    /** Remove the library and every listener it added. */
    destroy() {
      if (countTimer !== null) {
        clearTimeout(countTimer);
        countTimer = null;
      }
      if (unsubscribeMaps) {
        unsubscribeMaps();
      }
      for (const cleanup of [...cleanups, ...cardCleanups]) {
        cleanup();
      }
      cardCleanups = [];
      renameForm.removeEventListener('submit', onRenameSubmit);
      newMapDialog.destroy();
      deleteShell.destroy();
      renameShell.destroy();
      root.remove();
    },
  };
}
