/**
 * Citation popup index.
 *
 * A cheap projection of the citation library into `chrome.storage.local` under `citationIndex`.
 * It serves two purposes:
 *   1. Cross-context change signal — IndexedDB changes do NOT broadcast across extension contexts,
 *      so a citation saved from a content script can't otherwise reach an open popup. Writing this
 *      projection on every mutation fires `chrome.storage.onChanged` in every context.
 *   2. Cheap popup render — the popup can show the list from this small projection without opening
 *      the full Dexie database.
 *
 * One-way dependency: this module imports storage; storage never imports it (no cycle). The
 * subscription that drives rebuilds (`initCitationIndex`) is created per writing context — wired in
 * M6 alongside the UI; the module logic here is complete and tested independently.
 *
 * Where the projection is written is injected (`configureIndexStorage`). The realm that owns the DB
 * is the offscreen document, and an offscreen document has no `chrome.storage` object at all — it
 * hands in a bridge to the service worker. Page contexts inject nothing and get `chrome.storage.local`.
 */

import { CitationStorage, onCitationsChanged } from './citation-storage.js';
import { normalizeCitation } from './citation-types.js';
import { getYear, parseAuthor, markOrganisations } from './citation-styles/shared.js';

/** chrome.storage.local key holding the projection array. */
export const INDEX_KEY = 'citationIndex';

/** Debounce window for coalescing bursts of mutations into one projection write. */
const DEBOUNCE_MS = 250;

/**
 * Where the projection is kept. Injected, because the realm that owns the citation DB — the
 * offscreen document — has no `chrome.storage` object at all and must go through the service
 * worker. Page contexts that import this module (the citation store) keep the direct object.
 */
let injectedStorage = null;

/**
 * Point the projection at a storage adapter. Called once by the offscreen citation handler with the
 * service-worker bridge; pass `null` to fall back to `chrome.storage.local`.
 * @param {{get: Function, set: Function}|null} adapter
 */
export function configureIndexStorage(adapter) {
  injectedStorage = adapter || null;
}

/** The adapter for this realm: whatever was injected, else `chrome.storage.local`. */
function storage() {
  if (injectedStorage) {
    return injectedStorage;
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  throw new Error('[citation-index] no storage: call configureIndexStorage() in this realm');
}

/**
 * Project a full citation record down to the small shape the popup list needs.
 * @param {Object} record - stored citation (with Dexie `id`)
 * @returns {{id:string, title:string, firstAuthor:string, year:string, assistType:string, projectId:(string|null), sentinelState:(string|null)}}
 */
export function projectCitation(record) {
  const c = normalizeCitation(record) || {};
  const first = (c.authors && c.authors[0]) || '';
  // An organisation author reads whole ("World Health Organization"), as the styles print it.
  const marked = c.authors ? markOrganisations(c).authors[0] : '';
  return {
    id: record && record.id !== undefined && record.id !== null ? String(record.id) : '',
    title: c.title || '',
    firstAuthor: parseAuthor(marked).family || first || '',
    // Undated is "n.d.", exactly as the styles print it — never the year the student read it.
    year: getYear(c),
    assistType: c.type,
    projectId: c.projectId ?? null,
    sentinelState: (c.extra && c.extra.sentinel && c.extra.sentinel.state) || null,
  };
}

/**
 * Build (but do not persist) the projection for the whole library.
 * @returns {Promise<Array>}
 */
export async function buildIndex() {
  const all = await CitationStorage.export();
  return all.map(projectCitation);
}

/**
 * Build the projection and write it to this realm's storage.
 * @returns {Promise<Array>} the projection written
 */
export async function rebuildIndex() {
  const projection = await buildIndex();
  await storage().set({ [INDEX_KEY]: projection });
  return projection;
}

/**
 * Read the current projection (empty array when unset).
 * @returns {Promise<Array>}
 */
export async function readIndex() {
  const result = await storage().get(INDEX_KEY);
  return (result && result[INDEX_KEY]) || [];
}

let _timer = null;

/** Debounced projection rebuild — coalesces a burst of mutations into one write. */
export function scheduleRebuild() {
  if (_timer) {
    clearTimeout(_timer);
  }
  _timer = setTimeout(() => {
    _timer = null;
    rebuildIndex().catch(error => console.error('[citation-index] rebuild failed:', error));
  }, DEBOUNCE_MS);
}

/**
 * Subscribe the projection to in-realm citation mutations. Call once per context that writes
 * citations (popup + content script). Returns an unsubscribe function.
 * @returns {() => void}
 */
export function initCitationIndex() {
  return onCitationsChanged(scheduleRebuild);
}

export default {
  INDEX_KEY,
  configureIndexStorage,
  projectCitation,
  buildIndex,
  rebuildIndex,
  readIndex,
  scheduleRebuild,
  initCitationIndex,
};
