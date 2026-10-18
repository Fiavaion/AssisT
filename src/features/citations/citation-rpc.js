/**
 * Citation RPC client.
 *
 * Presents the SAME async interface as `CitationStorage` / `ProjectStorage` (citation-storage.js),
 * but instead of touching Dexie directly it forwards every call to the canonical store that now
 * lives in a shared extension-origin offscreen document. This is the one seam that fixes the
 * per-website siloing bug: consumers that ran in a page origin (content script) used to create the
 * DB there; now they go through messaging and read/write the single canonical DB.
 *
 * Drop-in for consumers: method names, argument order, and return shapes match citation-storage.js,
 * and every method was already async — so swapping an import from `citation-storage.js` to this file
 * requires no call-site changes. The DB-owning realm (the offscreen document) imports the REAL
 * citation-storage.js; this client must NEVER import it (that would re-create the DB in the caller's
 * origin and reintroduce the bug).
 *
 * The in-realm `onCitationsChanged` signal is intentionally NOT exposed here — cross-context change
 * notification is delivered by the canonical `citationIndex` projection via chrome.storage.onChanged
 * (see citation-index.js / citation-store.js), which the offscreen document keeps up to date.
 */

import { CITATION_DB_OP, CIT } from '../../config/citation-messages.js';

/** Max time to wait for the offscreen document to answer before failing the op. */
const RPC_TIMEOUT_MS = 10000;

/**
 * Forward one operation to the service worker, which relays it to the offscreen document.
 * Races the message against a timeout so a never-settling reply (idle SW / missing offscreen
 * document) surfaces as an error the caller can handle, rather than hanging the UI forever.
 * @param {string} op - one of the CIT.* operation codes
 * @param {Array<any>} [args] - positional arguments, mirroring the storage method signature
 * @returns {Promise<any>} the operation's result
 * @throws {Error} when the offscreen op failed (ok:false), timed out, or the channel is unavailable
 */
async function call(op, args = []) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Citation RPC timed out: ${op}`)), RPC_TIMEOUT_MS);
  });
  try {
    const reply = await Promise.race([
      chrome.runtime.sendMessage({ type: CITATION_DB_OP, op, args }),
      timeout,
    ]);
    if (!reply || reply.ok !== true) {
      throw new Error(reply?.error || `Citation RPC failed: ${op}`);
    }
    return reply.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * RPC mirror of `CitationStorage`. Same signatures, same return shapes.
 * @see citation-storage.js
 */
export const CitationStorageRPC = {
  add: citationData => call(CIT.ADD, [citationData]),
  get: id => call(CIT.GET, [id]),
  getAll: (options = {}) => call(CIT.GET_ALL, [options]),
  getByURL: url => call(CIT.GET_BY_URL, [url]),
  update: (id, updates) => call(CIT.UPDATE, [id, updates]),
  delete: id => call(CIT.DELETE, [id]),
  exists: url => call(CIT.EXISTS, [url]),

  // Trash. `delete` above is the soft delete; `purge`, `emptyTrash` and `purgeExpired` are the
  // only calls in this client that destroy anything.
  getTrashed: () => call(CIT.GET_TRASHED, []),
  restore: id => call(CIT.RESTORE, [id]),
  purge: id => call(CIT.PURGE, [id]),
  emptyTrash: () => call(CIT.EMPTY_TRASH, []),
  purgeExpired: () => call(CIT.PURGE_EXPIRED, []),
};

/**
 * RPC mirror of `ProjectStorage`. Same signatures, same return shapes.
 * @see citation-storage.js
 */
export const ProjectStorageRPC = {
  create: (name, description = '') => call(CIT.PROJECT_CREATE, [name, description]),
  getAll: () => call(CIT.PROJECT_GET_ALL, []),
  get: id => call(CIT.PROJECT_GET, [id]),
  update: (id, updates) => call(CIT.PROJECT_UPDATE, [id, updates]),
  delete: id => call(CIT.PROJECT_DELETE, [id]),
};

/**
 * RPC client for the first-run store migration (offered once when the canonical store comes online).
 * @see citation-migration.js
 */
export const CitationMigrationRPC = {
  getStatus: () => call(CIT.MIGRATE_GET_STATUS, []),
  startFresh: () => call(CIT.MIGRATE_START_FRESH, []),
  bestEffortImport: () => call(CIT.MIGRATE_BEST_EFFORT, []),
};

export default {
  CitationStorageRPC,
  ProjectStorageRPC,
  CitationMigrationRPC,
};
