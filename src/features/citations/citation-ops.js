/**
 * Citation operation dispatcher — the single source of truth mapping each CIT_* op code to a
 * CitationStorage / ProjectStorage / migration call.
 *
 * Used by the offscreen citation handler (which owns the canonical DB and wraps this with the
 * chrome.runtime reply envelope) and, in tests, by an RPC bridge that simulates the offscreen end.
 * Keeping the mapping here means the wire contract is defined once, not duplicated per consumer.
 */

import { CIT } from '../../config/citation-messages.js';

/**
 * Build a dispatcher bound to its collaborators.
 * @param {Object} deps
 * @param {Object} deps.storage  - CitationStorage (or a compatible stand-in)
 * @param {Object} deps.projects - ProjectStorage (or a compatible stand-in)
 * @param {Object} [deps.migration] - migration runner (getStatus / startFresh / bestEffortImport)
 * @returns {(op: string, args?: Array) => Promise<any>} dispatch — resolves with the op's result,
 *          rejects on an unknown op or a failing call.
 */
export function createCitationDispatcher({ storage, projects, migration }) {
  const handlers = {
    // CitationStorage
    [CIT.ADD]: a => storage.add(a[0]),
    [CIT.GET]: a => storage.get(a[0]),
    [CIT.GET_ALL]: a => storage.getAll(a[0]),
    [CIT.GET_BY_URL]: a => storage.getByURL(a[0]),
    [CIT.UPDATE]: a => storage.update(a[0], a[1]),
    [CIT.DELETE]: a => storage.delete(a[0]),
    [CIT.EXISTS]: a => storage.exists(a[0]),

    // Trash — DELETE above is the soft delete; these are the ways out of it.
    [CIT.GET_TRASHED]: () => storage.getTrashed(),
    [CIT.RESTORE]: a => storage.restore(a[0]),
    [CIT.PURGE]: a => storage.purge(a[0]),
    [CIT.EMPTY_TRASH]: () => storage.emptyTrash(),
    [CIT.PURGE_EXPIRED]: () => storage.purgeExpiredTrash(),

    // ProjectStorage
    [CIT.PROJECT_CREATE]: a => projects.create(a[0], a[1]),
    [CIT.PROJECT_GET_ALL]: () => projects.getAll(),
    [CIT.PROJECT_GET]: a => projects.get(a[0]),
    [CIT.PROJECT_UPDATE]: a => projects.update(a[0], a[1]),
    [CIT.PROJECT_DELETE]: a => projects.delete(a[0]),

    // Migration
    [CIT.MIGRATE_GET_STATUS]: () => migration.getStatus(),
    [CIT.MIGRATE_START_FRESH]: () => migration.startFresh(),
    [CIT.MIGRATE_BEST_EFFORT]: () => migration.bestEffortImport(),
  };

  return function dispatch(op, args = []) {
    const fn = handlers[op];
    if (!fn) {
      return Promise.reject(new Error(`Unknown citation op: ${op}`));
    }
    return Promise.resolve(fn(args));
  };
}
