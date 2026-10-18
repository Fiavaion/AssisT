/**
 * Citation store — the single state container for the citation UI.
 *
 * Holds the loaded citations/projects, the trash, plus view state (text filter, active project,
 * style, and whether the library or the trash is on screen) and is
 * the only thing the UI components read from or mutate through. It wraps CitationStorage so no
 * component touches IndexedDB directly, and it refreshes when citations change in this realm (the
 * popup's own edits) or in another (a content-script save, seen via the `citationIndex` projection).
 *
 * State / render separation: components call `getState()` and `subscribe(fn)`; they never read
 * storage. Cross-context wiring is guarded so the store also works where `chrome.storage.onChanged`
 * is unavailable (tests, restricted pages).
 */

import {
  CitationStorageRPC as CitationStorage,
  ProjectStorageRPC as ProjectStorage,
} from './citation-rpc.js';
import { normalizeCitation } from './citation-types.js';
import { INDEX_KEY } from './citation-index.js';

/** chrome.storage.local key persisting the chosen citation style across sessions and surfaces. */
export const STYLE_KEY = 'citationStyle';

/**
 * Create an isolated citation store instance.
 * @returns {Object} store API
 */
export function createCitationStore() {
  const state = {
    citations: [],
    projects: [],
    // Removed citations, most recently removed first. They are NOT part of `citations`: nothing
    // that reads the library — filters, counts, bibliographies, export — can see them.
    trashed: [],
    filter: '',
    activeProjectId: null,
    style: 'harvard',
    loading: false,
    /** Which list the library surface is showing: 'library' or 'trash'. */
    view: 'library',
  };

  const listeners = new Set();
  let storageChangedHandler = null;

  function getState() {
    return {
      ...state,
      citations: [...state.citations],
      projects: [...state.projects],
      trashed: [...state.trashed],
    };
  }

  function emit() {
    const snapshot = getState();
    for (const fn of listeners) {
      try {
        fn(snapshot);
      } catch (error) {
        console.error('[citation-store] subscriber failed:', error);
      }
    }
  }

  /**
   * Subscribe to state changes.
   * @param {(state: Object) => void} fn
   * @returns {() => void} unsubscribe
   */
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Coalescing reload — concurrent refresh() calls collapse into at most one trailing reload, so
  // an own-edit plus its echoing onChanged event don't stampede the database. A call made while a
  // reload is running gets that run's promise, and the run reads again before it settles, so an
  // awaited refresh() always reflects data at least as fresh as the moment it was called.
  let _inflight = null;
  let _again = false;
  function refresh() {
    if (_inflight) {
      _again = true;
      return _inflight;
    }
    _inflight = (async () => {
      try {
        do {
          _again = false;
          const [citations, projects, trashed] = await Promise.all([
            CitationStorage.getAll(),
            ProjectStorage.getAll(),
            CitationStorage.getTrashed(),
          ]);
          state.citations = citations.map(normalizeCitation);
          state.projects = projects;
          state.trashed = trashed.map(normalizeCitation);
        } while (_again);
      } finally {
        _inflight = null;
      }
      emit();
    })();
    return _inflight;
  }

  /** Load initial data and start listening for cross-context changes. */
  async function init() {
    state.loading = true;
    emit();
    await refresh();
    state.loading = false;

    // Restore the student's chosen citation style — their department's style is a per-course
    // fact, not a per-session choice; resetting to Harvard each open was silently wrong for
    // every APA/MLA student.
    try {
      const stored = await chrome.storage.local.get(STYLE_KEY);
      if (typeof stored?.[STYLE_KEY] === 'string' && stored[STYLE_KEY]) {
        state.style = stored[STYLE_KEY];
      }
    } catch {
      // Storage unavailable — keep the default.
    }

    if (chrome?.storage?.onChanged?.addListener) {
      storageChangedHandler = (changes, area) => {
        if (area === 'local' && changes[INDEX_KEY]) {
          refresh();
        }
      };
      chrome.storage.onChanged.addListener(storageChangedHandler);
    }
    emit();
  }

  /** Tear down listeners. */
  function destroy() {
    if (storageChangedHandler && chrome?.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(storageChangedHandler);
    }
    storageChangedHandler = null;
    listeners.clear();
  }

  // ─── Intents (the only write path the UI uses) ────────────────────────────
  async function add(data) {
    const id = await CitationStorage.add(data);
    await refresh();
    return id;
  }
  async function update(id, updates) {
    await CitationStorage.update(id, updates);
    await refresh();
  }
  /**
   * Remove a citation. This is a soft delete: the record moves to the trash, where `restore()` can
   * bring it back for the retention window. Nothing here destroys data.
   * @param {string} id
   */
  async function remove(id) {
    await CitationStorage.delete(id);
    await refresh();
  }

  /**
   * Put a removed citation back into the library.
   *
   * The answer travels back to the caller because a restore can fail: the row may have been purged
   * in another tab, or by Empty trash, inside the undo window. Swallowing that leaves the student
   * looking at an "Undo" that did nothing and no way to know.
   * @param {string} id
   * @returns {Promise<boolean>} false when there was nothing at that id to restore
   */
  async function restore(id) {
    const restored = await CitationStorage.restore(id);
    await refresh();
    return restored !== false;
  }

  /**
   * Destroy one removed citation for good.
   * @param {string} id
   */
  async function purge(id) {
    await CitationStorage.purge(id);
    await refresh();
  }

  /**
   * Destroy everything in the trash.
   * @returns {Promise<number>} how many citations were destroyed
   */
  async function emptyTrash() {
    const purged = await CitationStorage.emptyTrash();
    await refresh();
    return purged;
  }

  /**
   * Destroy the citations that have outstayed the retention window. Called when the library opens.
   * @returns {Promise<number>} how many citations were destroyed
   */
  async function purgeExpiredTrash() {
    const purged = await CitationStorage.purgeExpired();
    // Reload only when the sweep actually took something; on almost every open it takes nothing,
    // and a second full read for no change would be a wasted round trip on the page's critical path.
    if (purged > 0) {
      await refresh();
    }
    return purged;
  }

  /**
   * Show the library or the trash.
   * @param {'library'|'trash'} next
   */
  function setView(next) {
    const view = next === 'trash' ? 'trash' : 'library';
    if (view === state.view) {
      return;
    }
    state.view = view;
    emit();
  }

  function setFilter(query) {
    state.filter = String(query || '');
    emit();
  }
  function setActiveProject(projectId) {
    state.activeProjectId = projectId ?? null;
    emit();
  }

  // ─── Collection (project) intents ─────────────────────────────────────────
  // Collections go through the same RPC client as citations, so the offscreen document stays the
  // one writer. The view calls these; it never talks to storage itself.

  /**
   * Create a collection.
   * @param {string} name
   * @param {string} [description]
   * @returns {Promise<string>} the new collection's id
   */
  async function createProject(name, description = '') {
    const id = await ProjectStorage.create(name, description);
    await refresh();
    return id;
  }

  /**
   * Rename a collection (or edit its description).
   * @param {string} id
   * @param {{name?: string, description?: string}} updates
   */
  async function updateProject(id, updates) {
    await ProjectStorage.update(id, updates);
    await refresh();
  }

  /**
   * Delete a collection. The citations filed in it are NOT deleted — storage unfiles them — and
   * the ids come back so an undo can put the collection back together exactly as it was.
   * @param {string} id
   * @returns {Promise<{unfiled: number, citationIds: Array, project: Object|null}>}
   */
  async function deleteProject(id) {
    const key = String(id);
    const project = state.projects.find(p => String(p.id) === key) || null;
    const citationIds = state.citations.filter(c => String(c.projectId) === key).map(c => c.id);

    const { unfiled } = (await ProjectStorage.delete(id)) || { unfiled: 0 };

    // A filter pointing at a collection that no longer exists would show an empty library with no
    // hint why, so the view falls back to everything.
    if (String(state.activeProjectId) === key) {
      state.activeProjectId = null;
    }
    await refresh();
    return { unfiled, citationIds, project };
  }

  /**
   * File one citation into a collection. An empty/absent id unfiles it (back to the library).
   * @param {string} citationId
   * @param {string} [projectId]
   */
  async function assignToProject(citationId, projectId) {
    await CitationStorage.update(citationId, { projectId: projectId || null });
    await refresh();
  }

  /**
   * File several citations at once, refreshing once at the end. Used by the undo of a deleted
   * collection, which has to put every unfiled citation back.
   * @param {Array} citationIds
   * @param {string} [projectId]
   */
  async function refileCitations(citationIds, projectId) {
    for (const citationId of citationIds || []) {
      await CitationStorage.update(citationId, { projectId: projectId || null });
    }
    await refresh();
  }
  function setStyle(style) {
    state.style = style;
    try {
      chrome?.storage?.local?.set?.({ [STYLE_KEY]: style });
    } catch {
      // Best-effort persistence — the in-memory state is already correct.
    }
    emit();
  }

  /**
   * The citations visible under the current project + text filter. Filters the already-loaded
   * in-memory list (instant, no DB round-trip) by token-prefix-free substring across the visible
   * fields — the deep index-backed search lives in CitationStorage.search for library-wide queries.
   * @returns {Array}
   */
  function getVisibleCitations() {
    let list = state.citations;
    if (state.activeProjectId) {
      // Compared as text: Dexie hands back the auto-increment key as a number, while a saved
      // citation carries the string form, and a strict comparison would silently show nothing.
      const active = String(state.activeProjectId);
      list = list.filter(c => String(c.projectId) === active);
    }
    const f = state.filter.trim().toLowerCase();
    if (f) {
      const tokens = f.split(/\s+/).filter(Boolean);
      list = list.filter(c => {
        const hay =
          `${c.title} ${(c.authors || []).join(' ')} ${c.siteName} ${c.publisher} ${(c.tags || []).join(' ')}`.toLowerCase();
        return tokens.every(t => hay.includes(t));
      });
    }
    return list;
  }

  return {
    init,
    destroy,
    subscribe,
    getState,
    refresh,
    add,
    update,
    remove,
    restore,
    purge,
    emptyTrash,
    purgeExpiredTrash,
    setView,
    setFilter,
    setActiveProject,
    setStyle,
    getVisibleCitations,
    createProject,
    updateProject,
    deleteProject,
    assignToProject,
    refileCitations,
  };
}

export default { createCitationStore };
