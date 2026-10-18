/**
 * Opening another map without leaving the one you are in.
 *
 * The only route between two maps used to be out to the library and back in, which is two page
 * loads and a lost place for a student checking one note against another. This is the same list,
 * one keystroke away, over the map they are working in.
 *
 * A list of buttons rather than a listbox: every row is a thing that happens when it is pressed,
 * so Tab and the arrow keys behave the way they do everywhere else on this page and there is no
 * second roving-focus contract to get wrong. Renaming and deleting stay in the library, which is
 * one press away at the bottom of the dialog.
 *
 * @module pages/mind-map/open-map-dialog
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { createDialogShell } from './dialog-shell.js';

/**
 * @param {number} updatedAt - epoch ms
 * @returns {string} the date a student would read, or '' when there is none
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
 * Mount the open-a-map dialog.
 *
 * @param {HTMLElement} host - the dialog is appended to it.
 * @param {Object} options
 * @param {() => Promise<Array<{id: string, title: string, updatedAt: number, nodeCount: number}>>} options.listMaps
 * @param {string} options.currentMapId - marked in the list, and never re-opened over itself.
 * @param {(id: string) => void} options.onOpen
 * @param {() => void} options.onGoToLibrary
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean, destroy: () => void }}
 */
export function mountOpenMapDialog(host, { listMaps, currentMapId, onOpen, onGoToLibrary }) {
  const doc = host.ownerDocument;
  const shell = createDialogShell(host, { name: 'open', title: 'Open a map' });
  const cleanups = [];
  /** Handlers on the rows, torn down and rebuilt with the rows they belong to. */
  let rowCleanups = [];
  /** @type {Array<Object>} */
  let summaries = [];
  /** Set when the maps could not be read at all, which is a different thing from having none. */
  let failure = null;
  /** True between opening and the list arriving; an empty list is not the same as no answer yet. */
  let loading = false;
  let query = '';
  /** Bumped on every open, so a list that arrives after the student has gone is dropped. */
  let generation = 0;

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

  const filterLabel = el('label', 'assist-mm-field__label', 'Filter by title');
  filterLabel.htmlFor = 'assist-mm-open-filter';
  const filter = doc.createElement('input');
  filter.type = 'search';
  filter.id = 'assist-mm-open-filter';
  filter.className = 'assist-mm-field__input';
  filter.placeholder = 'Filter by title';

  const list = el('ul', 'assist-mm-open__list');
  list.setAttribute('aria-label', 'Your mind maps');

  // One paragraph for every state that is not a list: nothing stored, nothing matching, or a
  // database that would not answer. A dialog that shows an empty box says nothing to anyone.
  const message = el('p', 'assist-mm-open__message');
  message.setAttribute('role', 'status');

  const actions = el('div', 'assist-mm-dialog__actions');
  const library = el('button', 'assist-mm-button', 'Go to the library');
  library.type = 'button';
  library.dataset.command = 'library';
  const cancel = el('button', 'assist-mm-button', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.command = 'cancel';
  cancel.dataset.action = 'cancel';
  actions.append(library, cancel);

  shell.element.append(filterLabel, filter, message, list, actions);

  /** @returns {Array<Object>} the maps matching the filter box */
  function matching() {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return summaries;
    }
    return summaries.filter(summary => summary.title.toLowerCase().includes(needle));
  }

  /** @param {Object} summary @returns {HTMLElement} */
  function buildRow(summary) {
    const row = el('li', 'assist-mm-open__row');
    const button = el('button', 'assist-mm-open__map');
    button.type = 'button';
    button.dataset.id = summary.id;

    button.appendChild(el('span', 'assist-mm-open__name', summary.title));

    const parts = [`${summary.nodeCount} ${summary.nodeCount === 1 ? 'node' : 'nodes'}`];
    const when = whenOf(summary.updatedAt);
    if (when) {
      parts.push(`Updated ${when}`);
    }
    if (summary.id === currentMapId) {
      // In words, not in colour: a student who cannot see the row, or cannot tell the two shades
      // apart, still hears which map they are already in (SC 1.4.1).
      parts.push('Open now');
    }
    button.appendChild(el('span', 'assist-mm-open__meta', parts.join(' · ')));

    rowCleanups.push(
      attachAccessibleHandler(button, `Open map ${summary.title}`, () => {
        shell.close();
        // Re-opening the map already on screen would throw away unsaved work to show the same
        // thing; pressing it is simply a way out of the dialog.
        if (summary.id !== currentMapId) {
          onOpen(summary.id);
        }
      })
    );

    row.appendChild(button);
    return row;
  }

  function render() {
    for (const cleanup of rowCleanups) {
      cleanup();
    }
    rowCleanups = [];
    list.textContent = '';

    if (failure) {
      message.textContent = `Your maps could not be read: ${failure}`;
      return;
    }
    if (loading) {
      message.textContent = 'Reading your maps…';
      return;
    }

    const shown = matching();
    for (const summary of shown) {
      list.appendChild(buildRow(summary));
    }

    if (shown.length > 0) {
      message.textContent = '';
      return;
    }
    message.textContent = summaries.length
      ? `No map matches "${query.trim()}". Clear the box to see them all.`
      : 'You have no other maps yet. New map… starts one.';
  }

  const onFilterInput = () => {
    query = filter.value;
    render();
  };
  filter.addEventListener('input', onFilterInput);

  cleanups.push(
    attachAccessibleHandler(cancel, 'Cancel open map', () => shell.close()),
    attachAccessibleHandler(library, 'Go to the map library', () => {
      shell.close();
      onGoToLibrary();
    })
  );

  return {
    /** Show the dialog and read the maps again: another tab may have added one since. */
    open() {
      if (shell.isOpen()) {
        // A second press must not clear a filter the student is part way through.
        filter.focus();
        return;
      }
      generation += 1;
      const mine = generation;
      query = '';
      filter.value = '';
      failure = null;
      loading = true;
      summaries = [];
      render();
      shell.open(filter);

      Promise.resolve()
        .then(listMaps)
        .then(
          found => {
            if (mine !== generation || !shell.isOpen()) {
              return;
            }
            loading = false;
            summaries = found;
            render();
          },
          problem => {
            if (mine !== generation || !shell.isOpen()) {
              return;
            }
            loading = false;
            failure = problem?.message || 'something went wrong.';
            render();
          }
        );
    },

    close: shell.close,
    isOpen: shell.isOpen,

    destroy() {
      generation += 1;
      filter.removeEventListener('input', onFilterInput);
      for (const cleanup of [...cleanups, ...rowCleanups]) {
        cleanup();
      }
      rowCleanups = [];
      shell.destroy();
    },
  };
}
