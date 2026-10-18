/**
 * Collections + tags rail for the full-page citation library.
 *
 * A navigation landmark holding one real list of filters: "All citations", then every collection
 * with its live count, then the tags in use. Selecting a collection filters the library by project;
 * selecting a tag drives the text filter (which also matches tags); "All citations" clears both.
 * Each collection row also carries its own rename and delete controls, and the rail always offers
 * "New collection" — including when there are none yet, so the first one is never unreachable.
 *
 * Accessibility notes, since this is the product's whole point:
 *   - The filters are `<button>`s inside a `<ul>`, and the active one is marked with `aria-current`
 *     — exactly one at a time. A visible tick sits alongside it, so the active collection is never
 *     signalled by colour alone (SC 1.4.1).
 *   - Pressing a filter here is announced through a `role="status"` region with the resulting
 *     count, so a screen-reader user learns the list changed and by how much. Only the rail's own
 *     presses are announced: the search box changes the filter on every keystroke, and narrating
 *     that would talk over the person typing.
 *   - Re-rendering rebuilds the rows, which would otherwise drop focus onto <body> the moment a
 *     student pressed a filter. Every control carries a stable key, and focus is put back on the
 *     matching control afterwards.
 *   - Pure DOM construction (textContent only), so a collection or tag named after a `<script>` tag
 *     is text, not markup.
 *
 * `update(snapshot, options)` re-renders from a store snapshot; `options.visibleCount` is how many
 * citations the library is actually showing (the store knows, having applied both filters).
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

/** The tick shown beside the active filter — the non-colour half of the active indication. */
const ACTIVE_MARK = '✓';

/**
 * Build a filter button: a mark slot plus its label, so the active state can be shown without
 * rebuilding the button's text.
 * @param {Object} spec
 * @returns {HTMLButtonElement}
 */
function makeFilterButton({ className, text, accessibleName, active }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;

  const mark = document.createElement('span');
  mark.className = 'assist-lib-sidebar__mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = active ? ACTIVE_MARK : '';
  button.appendChild(mark);

  const label = document.createElement('span');
  label.className = 'assist-lib-sidebar__label';
  label.textContent = text;
  button.appendChild(label);

  if (active) {
    button.setAttribute('aria-current', 'true');
  }
  if (accessibleName) {
    button.setAttribute('aria-label', accessibleName);
  }
  return button;
}

function makeHeading(text, id) {
  const heading = document.createElement('h2');
  heading.className = 'assist-lib-sidebar__heading';
  heading.id = id;
  heading.textContent = text;
  return heading;
}

/**
 * @param {Object} opts
 * @param {() => void} [opts.onAll] - clear all filters (show every citation)
 * @param {() => void} [opts.onTrash] - open the trash (Recently removed)
 * @param {(projectId: string) => void} [opts.onProject] - filter by a collection
 * @param {(tag: string) => void} [opts.onTag] - filter by a tag
 * @param {() => void} [opts.onNewCollection] - make a new collection
 * @param {(project: Object) => void} [opts.onRenameCollection] - rename an existing one
 * @param {(project: Object) => void} [opts.onDeleteCollection] - delete an existing one
 * @returns {{ el: HTMLElement, update: Function, focusControl: Function, destroy: Function }}
 */
export function createLibrarySidebar({
  onAll,
  onTrash,
  onProject,
  onTag,
  onNewCollection,
  onRenameCollection,
  onDeleteCollection,
} = {}) {
  const el = document.createElement('nav');
  el.className = 'assist-cite-root assist-lib-sidebar';
  el.setAttribute('aria-label', 'Collections and tags');

  // ── Collections ───────────────────────────────────────────────────────────

  const collHead = document.createElement('div');
  collHead.className = 'assist-lib-sidebar__collhead';
  collHead.appendChild(makeHeading('Collections', 'assist-lib-sidebar-collections'));

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'assist-lib-sidebar__new';
  newBtn.textContent = 'New collection';
  newBtn.dataset.railKey = 'new';
  collHead.appendChild(newBtn);
  el.appendChild(collHead);

  const collList = document.createElement('ul');
  collList.className = 'assist-lib-sidebar__list';
  collList.setAttribute('aria-labelledby', 'assist-lib-sidebar-collections');
  el.appendChild(collList);

  const emptyNote = document.createElement('p');
  emptyNote.className = 'assist-lib-sidebar__empty';
  emptyNote.textContent =
    'No collections yet. Make one for an assignment or module, then file sources into it.';
  emptyNote.hidden = true;
  el.appendChild(emptyNote);

  // ── Recently removed ──────────────────────────────────────────────────────
  // Its own list rather than a row in the collections list, because a student with no collections
  // still has a trash — and that is exactly the moment they most need to find it.

  const trashList = document.createElement('ul');
  trashList.className = 'assist-lib-sidebar__list assist-lib-sidebar__trashlist';
  trashList.setAttribute('aria-label', 'Removed citations');
  el.appendChild(trashList);

  // ── Tags ──────────────────────────────────────────────────────────────────

  const tagHeading = makeHeading('Tags', 'assist-lib-sidebar-tags');
  const tagList = document.createElement('ul');
  tagList.className = 'assist-lib-sidebar__list assist-lib-sidebar__tags';
  tagList.setAttribute('aria-labelledby', 'assist-lib-sidebar-tags');
  el.appendChild(tagHeading);
  el.appendChild(tagList);

  // ── The announcement ──────────────────────────────────────────────────────

  const statusEl = document.createElement('p');
  statusEl.className = 'assist-cite-sr-only';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  el.appendChild(statusEl);

  // ── Handler bookkeeping ───────────────────────────────────────────────────

  /** Cleanups for the handlers on the rows, released and re-made on every render. */
  let rowCleanups = [];

  /**
   * What the student last pressed on the rail, held until the resulting re-render announces it.
   * Announcing off the snapshot alone would talk over someone typing in the search box, since the
   * text filter changes on every keystroke; only a filter the rail itself changed is news.
   * @type {{kind: 'all'|'project'|'tag'|'trash', value?: string, searchCleared?: boolean}|null}
   */
  let pendingAnnouncement = null;

  /**
   * The removed count as it was last rendered, so a change can be announced. Null until the first
   * render, because "you have 0 removed citations" is not news to anyone opening the library.
   * @type {number|null}
   */
  let lastTrashCount = null;

  /** The text filter the rail last rendered under: "All citations" clears it, and says so. */
  let shownFilter = '';
  const newBtnCleanup = attachAccessibleHandler(newBtn, 'Create a new collection', () => {
    if (typeof onNewCollection === 'function') {
      onNewCollection();
    }
  });

  /**
   * Wire a button and remember how to unwire it.
   * @param {HTMLButtonElement} button
   * @param {string} label
   * @param {Function} handler
   */
  function wireRow(button, label, handler) {
    rowCleanups.push(attachAccessibleHandler(button, label, handler));
  }

  /**
   * A small icon-only control on a collection row. The glyph is decorative — the accessible name
   * says which collection it acts on, so a screen-reader user hears "Rename collection Essay"
   * rather than a row of identical pencils.
   * @param {Object} spec
   * @returns {HTMLButtonElement}
   */
  function makeRowButton({ glyph, accessibleName, key }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'assist-lib-sidebar__rowbtn';
    button.setAttribute('aria-label', accessibleName);
    button.title = accessibleName;
    button.dataset.railKey = key;

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = glyph;
    button.appendChild(icon);
    return button;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderCollections(projects, citations, activeProjectId, inTrash) {
    collList.replaceChildren();
    emptyNote.hidden = projects.length > 0;

    // "All citations" is here with or without collections: it is also how a tag filter is cleared,
    // and a student who has not made a collection yet still filters by tag.
    const allItem = document.createElement('li');
    const allBtn = makeFilterButton({
      className: 'assist-lib-sidebar__all',
      text: `All citations (${citations.length})`,
      // While the trash is open the library is not what is on screen, so nothing here is current.
      active: !activeProjectId && !inTrash,
    });
    allBtn.dataset.railKey = 'all';
    wireRow(allBtn, 'Show all citations', () => {
      pendingAnnouncement = { kind: 'all', searchCleared: shownFilter.trim() !== '' };
      if (onAll) {
        onAll();
      }
    });
    allItem.appendChild(allBtn);
    collList.appendChild(allItem);

    for (const project of projects) {
      const pid = String(project.id);
      const count = citations.filter(c => String(c.projectId) === pid).length;

      const row = document.createElement('li');
      row.className = 'assist-lib-sidebar__row';

      const filterBtn = makeFilterButton({
        className: 'assist-lib-sidebar__item',
        text: `${project.name} (${count})`,
        active: !inTrash && String(activeProjectId) === pid,
      });
      filterBtn.dataset.railKey = `project:${pid}`;
      wireRow(filterBtn, `Collection ${project.name}`, () => {
        pendingAnnouncement = { kind: 'project', value: pid };
        if (onProject) {
          onProject(pid);
        }
      });
      row.appendChild(filterBtn);

      const renameBtn = makeRowButton({
        glyph: '✎',
        accessibleName: `Rename collection ${project.name}`,
        key: `rename:${pid}`,
      });
      wireRow(renameBtn, `Rename collection ${project.name}`, () => {
        if (typeof onRenameCollection === 'function') {
          onRenameCollection(project);
        }
      });
      row.appendChild(renameBtn);

      const deleteBtn = makeRowButton({
        glyph: '✕',
        accessibleName: `Delete collection ${project.name}`,
        key: `delete:${pid}`,
      });
      wireRow(deleteBtn, `Delete collection ${project.name}`, () => {
        if (typeof onDeleteCollection === 'function') {
          onDeleteCollection(project);
        }
      });
      row.appendChild(deleteBtn);

      collList.appendChild(row);
    }
  }

  /**
   * The one row that is always here, collections or no collections: the way into the trash, with
   * how much is in it.
   * @param {number} count - how many citations are in the trash
   * @param {boolean} inTrash - whether the trash is the list currently on screen
   */
  function renderTrash(count, inTrash) {
    trashList.replaceChildren();

    const item = document.createElement('li');
    const button = makeFilterButton({
      className: 'assist-lib-sidebar__trash',
      text: `Recently removed (${count})`,
      active: inTrash,
    });
    button.dataset.railKey = 'trash';
    wireRow(button, 'Show recently removed citations', () => {
      pendingAnnouncement = { kind: 'trash' };
      if (typeof onTrash === 'function') {
        onTrash();
      }
    });
    item.appendChild(button);
    trashList.appendChild(item);
  }

  function renderTags(citations) {
    const tags = [...new Set(citations.flatMap(c => c.tags || []))].sort();
    tagList.replaceChildren();
    const has = tags.length > 0;
    tagHeading.hidden = !has;
    tagList.hidden = !has;

    for (const tag of tags) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'assist-cite-chip assist-lib-sidebar__tag';
      button.textContent = tag;
      button.dataset.railKey = `tag:${tag}`;
      wireRow(button, `Tag ${tag}`, () => {
        pendingAnnouncement = { kind: 'tag', value: tag };
        if (onTag) {
          onTag(tag);
        }
      });
      item.appendChild(button);
      tagList.appendChild(item);
    }
  }

  // ── Announcing ────────────────────────────────────────────────────────────

  /**
   * Say what the list now shows. Two things gate it, and both matter:
   *   - only a filter the RAIL changed is announced, so typing in the search box (which changes the
   *     filter on every keystroke) never talks over the student;
   *   - a filter that lands on what was already showing is not news, so a re-render under an
   *     unchanged filter stays silent.
   * @param {Object} snapshot
   * @param {number} visibleCount
   * @param {number} totalCount
   */
  function announceFilter(snapshot, visibleCount, totalCount, trashCount) {
    const action = pendingAnnouncement;
    pendingAnnouncement = null;

    if (!action) {
      // Nothing was pressed here, but the trash may have changed under the student — a removal
      // from the library, a restore, an auto-purge. The count IS the news, so it is announced
      // rather than silently repainted. The first render sets the baseline and says nothing.
      const changed = lastTrashCount !== null && lastTrashCount !== trashCount;
      lastTrashCount = trashCount;
      if (changed) {
        statusEl.textContent = `Recently removed: ${trashCount} citation${
          trashCount === 1 ? '' : 's'
        }.`;
      }
      return;
    }
    lastTrashCount = trashCount;

    const shown = `Showing ${visibleCount} of ${totalCount} citations.`;

    if (action.kind === 'trash') {
      statusEl.textContent = `Showing ${trashCount} recently removed citation${
        trashCount === 1 ? '' : 's'
      }.`;
      return;
    }
    if (action.kind === 'project') {
      const project = (snapshot.projects || []).find(p => String(p.id) === String(action.value));
      statusEl.textContent = project ? `Filtered to ${project.name}. ${shown}` : shown;
      return;
    }
    if (action.kind === 'tag') {
      statusEl.textContent = `Filtered to ${action.value}. ${shown}`;
      return;
    }
    const cleared = action.searchCleared ? 'Search cleared. ' : '';
    statusEl.textContent = `${cleared}Showing all ${totalCount} citations.`;
  }

  // ── update ────────────────────────────────────────────────────────────────

  /**
   * Re-render from a store snapshot.
   * @param {{citations?: Array, projects?: Array, trashed?: Array, activeProjectId?: string,
   *          filter?: string, view?: string}} snapshot
   * @param {{visibleCount?: number}} [options] - how many citations the library is showing; falls
   *        back to the collection count when the caller has not applied a text filter of its own.
   */
  function update(snapshot, options = {}) {
    const citations = (snapshot && snapshot.citations) || [];
    const projects = (snapshot && snapshot.projects) || [];
    const activeProjectId = snapshot && snapshot.activeProjectId;
    const trashed = (snapshot && snapshot.trashed) || [];
    const inTrash = !!snapshot && snapshot.view === 'trash';
    shownFilter = (snapshot && snapshot.filter) || '';

    // The rows are about to be replaced, so remember which control the student was on, and which
    // collection row it sat in, in case that row is about to go.
    const focusedKey =
      document.activeElement && el.contains(document.activeElement)
        ? document.activeElement.dataset.railKey
        : undefined;
    const focusedRow = focusedKey
      ? [...collList.querySelectorAll('.assist-lib-sidebar__row')].findIndex(row =>
          row.contains(document.activeElement)
        )
      : -1;

    for (const cleanup of rowCleanups) {
      cleanup();
    }
    rowCleanups = [];

    renderCollections(projects, citations, activeProjectId, inTrash);
    renderTrash(trashed.length, inTrash);
    renderTags(citations);

    if (focusedKey && !focusControl(focusedKey) && focusedRow >= 0) {
      // The collection the focus was on has gone (deleted here or in another tab). Its place in the
      // list goes to the next collection, else the one before it, else All citations, so the
      // student is not dropped onto <body> at the top of the page.
      const rows = collList.querySelectorAll('.assist-lib-sidebar__row .assist-lib-sidebar__item');
      const neighbour = rows[Math.min(focusedRow, rows.length - 1)];
      (neighbour || collList.querySelector('.assist-lib-sidebar__all')).focus();
    }

    const visibleCount =
      typeof options.visibleCount === 'number'
        ? options.visibleCount
        : activeProjectId
          ? citations.filter(c => String(c.projectId) === String(activeProjectId)).length
          : citations.length;
    announceFilter(snapshot || {}, visibleCount, citations.length, trashed.length);
  }

  /**
   * Put the focus on the rail control with this key (e.g. `rename:<id>` for a collection's rename
   * button). Matched by scanning rather than by selector: a tag can be named anything at all, and
   * building a selector out of a student's own word is how injection bugs start.
   * @param {string} key
   * @returns {boolean} whether a control with that key was there to focus
   */
  function focusControl(key) {
    const control = [...el.querySelectorAll('[data-rail-key]')].find(
      button => button.dataset.railKey === key
    );
    if (control) {
      control.focus();
    }
    return !!control;
  }

  /** Release every handler this rail attached. The element is the caller's to remove. */
  function destroy() {
    for (const cleanup of rowCleanups) {
      cleanup();
    }
    rowCleanups = [];
    newBtnCleanup();
  }

  return { el, update, focusControl, destroy };
}

export default { createLibrarySidebar };
