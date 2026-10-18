/**
 * Citation handler — runs inside the shared AssisT offscreen document.
 *
 * THIS is the realm that owns the canonical `AssistCitations` Dexie DB. Because the offscreen
 * document is an extension page, importing `citation-storage.js` here creates the DB in the stable
 * `chrome-extension://<id>` origin — one shared store, instead of the per-website silos the content
 * script used to create. Content scripts and the popup reach it only through the RPC client →
 * service worker → this handler.
 *
 * Responsibilities:
 *  - Dispatch each CIT_* operation to CitationStorage / ProjectStorage and reply with { ok, result }.
 *  - Keep the cross-context `citationIndex` projection in sync (initCitationIndex + a startup rebuild)
 *    so an open popup / content store refreshes via chrome.storage.onChanged after any mutation.
 *  - Expose the first-run migration ops (status / start-fresh / best-effort import).
 *
 * Loaded eagerly by the offscreen host (lightweight: Dexie only, no WebGPU/WebLLM).
 */

import { CitationStorage, ProjectStorage } from '../../features/citations/citation-storage.js';
import {
  configureIndexStorage,
  initCitationIndex,
  rebuildIndex,
  readIndex,
} from '../../features/citations/citation-index.js';
import { getOffscreenStorage } from './offscreen-storage.js';
import {
  createMigrationRunner,
  MIGRATION_FLAG_KEY,
} from '../../features/citations/citation-migration.js';
import { createCitationDispatcher } from '../../features/citations/citation-ops.js';
import { CITATION_OFFSCREEN_RESPONSE } from '../../config/citation-messages.js';

// This realm has no chrome.storage — everything below reaches it through the service worker. The
// worker's listener is registered at its top level, so it can answer from the first message on.
const offscreenStorage = getOffscreenStorage();
configureIndexStorage(offscreenStorage);

// Drive the canonical projection from this realm (where the DB + its in-realm change events live).
initCitationIndex();
// Make the projection reflect the DB at startup (the doc may have been torn down since last write).
rebuildIndex().catch(err => console.error('[citation-handler] initial index rebuild failed:', err));

const migration = createMigrationRunner({
  storage: CitationStorage,
  readIndex,
  getFlag: async () => {
    const r = await offscreenStorage.get([MIGRATION_FLAG_KEY]);
    return r[MIGRATION_FLAG_KEY] || null;
  },
  setFlag: async flag => offscreenStorage.set({ [MIGRATION_FLAG_KEY]: flag }),
});

// The op→method mapping lives in citation-ops.js (shared with the test bridge — single contract).
const dispatch = createCitationDispatcher({
  storage: CitationStorage,
  projects: ProjectStorage,
  migration,
});

/**
 * Dispatch one `offscreen-citations` message and reply over chrome.runtime with the matched
 * requestId. Called by the offscreen host's single listener.
 * @param {Object} message - { action, requestId, args }
 */
export async function handleCitationMessage(message) {
  const { action, requestId, args = [] } = message;
  let payload;
  try {
    const result = await dispatch(action, args);
    payload = { ok: true, result };
  } catch (err) {
    payload = { ok: false, error: err?.message || String(err) };
  }

  chrome.runtime
    .sendMessage({ action: CITATION_OFFSCREEN_RESPONSE, requestId, ...payload })
    .catch(() => {});
}
