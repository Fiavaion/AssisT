/**
 * Citation messaging contract — single source of truth for the message-type strings used by the
 * canonical citation store.
 *
 * Why this exists: the `AssistCitations` Dexie DB now lives in ONE shared extension-origin offscreen
 * document instead of in each visited page's origin (which siloed citations per website). Content
 * scripts and the popup no longer touch Dexie directly — they call the RPC client
 * (`citation-rpc.js`), which sends `CITATION_DB_OP` to the service worker; the SW relays it to the
 * offscreen document and returns the reply.
 *
 * Flow:
 *   caller (content/popup)            SW                         offscreen doc (extension origin)
 *   ── { type: CITATION_DB_OP,  ──▶  relays as  ── { target: OFFSCREEN_TARGET_CITATIONS,
 *        op, args }                              action: op, requestId, args } ──▶ runs Dexie op
 *   ◀── { ok, result?, error? } ◀──  matches requestId ◀── { action: CITATION_OFFSCREEN_RESPONSE,
 *                                                            requestId, ok, result?, error? }
 *
 * The WebLLM offscreen path uses inline string literals; we deliberately centralise here instead
 * (zero-debt). Keep this the only place these strings are defined.
 */

/** Caller → service worker: a single envelope carrying one citation-DB operation. */
export const CITATION_DB_OP = 'CITATION_DB_OP';

/**
 * How long a removed citation waits in the trash before it is purged for good.
 *
 * It lives here rather than in the storage module because both realms need it: the offscreen
 * document enforces it, and the library page has to TELL the student the number. Importing
 * citation-storage.js into a UI realm would open a second Dexie connection to the canonical DB,
 * which is the bug the RPC seam exists to prevent — so the shared constant travels through the
 * shared contract instead.
 */
export const TRASH_RETENTION_DAYS = 30;

/** Service worker → offscreen document: routes a message to the citation handler. */
export const OFFSCREEN_TARGET_CITATIONS = 'offscreen-citations';

/** Offscreen document → service worker: a reply matched back to a pending request by `requestId`. */
export const CITATION_OFFSCREEN_RESPONSE = 'CITATION_OFFSCREEN_RESPONSE';

/**
 * Offscreen document → service worker: "my listener is registered, send away". Sent once, after
 * `onMessage` is bound. `chrome.offscreen.createDocument` resolves before the document's module
 * script has run, so without this the first request after creation lands on nobody.
 */
export const OFFSCREEN_READY = 'OFFSCREEN_READY';

/**
 * Offscreen document → service worker: the storage bridge.
 *
 * An offscreen document is NOT a normal extension page. `Object.keys(chrome)` inside the live
 * document is `loadTimes, csi, runtime` — there is no `chrome.storage` at all, so every direct
 * `chrome.storage.local` call from that realm throws "Cannot read properties of undefined". That is
 * why the `citationIndex` projection was never written and the library never refreshed after a save.
 *
 * The document therefore asks the service worker, which does have storage, to read and write on its
 * behalf. The worker answers `{ ok, result?, error? }` and serves only the keys listed below, only
 * for a message that really came from the offscreen document.
 */
export const OFFSCREEN_STORAGE_GET = 'OFFSCREEN_STORAGE_GET';

/** Offscreen document → service worker: write the given items to `chrome.storage.local`. */
export const OFFSCREEN_STORAGE_SET = 'OFFSCREEN_STORAGE_SET';

/** `target:` value routing a storage request to the service worker. */
export const OFFSCREEN_STORAGE_TARGET = 'service-worker';

/**
 * The only keys the bridge will read or write. The offscreen document owns exactly four pieces of
 * `chrome.storage.local` state; anything else it asks for is a bug or an attempt to widen the seam,
 * and is refused. Least privilege applies inside the extension too.
 */
export const OFFSCREEN_STORAGE_ALLOWED_KEYS = Object.freeze([
  'citationIndex',
  'citationMigration',
  'webllmModel',
  'webllmCachedModels',
]);

/**
 * Extension-relative path of the shared offscreen document. The service worker creates the document
 * from it and recognises the document as a message sender by it — one string, so the storage gate
 * cannot drift away from the page it is meant to admit.
 */
export const OFFSCREEN_DOCUMENT_PATH = 'src/pages/assist-offscreen/offscreen.html';

/**
 * Operation codes (the `op` / `action` value). Mirror the `CitationStorage` / `ProjectStorage`
 * surfaces so the RPC client can present an identical interface to existing consumers.
 */
export const CIT = Object.freeze({
  // CitationStorage
  ADD: 'CIT_ADD',
  GET: 'CIT_GET',
  GET_ALL: 'CIT_GET_ALL',
  GET_BY_URL: 'CIT_GET_BY_URL',
  UPDATE: 'CIT_UPDATE',
  DELETE: 'CIT_DELETE',
  EXISTS: 'CIT_EXISTS',

  // Trash. DELETE is the soft delete; these are the ways out of the trash — back to the library,
  // or gone for good.
  GET_TRASHED: 'CIT_GET_TRASHED',
  RESTORE: 'CIT_RESTORE',
  PURGE: 'CIT_PURGE',
  EMPTY_TRASH: 'CIT_EMPTY_TRASH',
  PURGE_EXPIRED: 'CIT_PURGE_EXPIRED',

  // ProjectStorage
  PROJECT_CREATE: 'CIT_PROJECT_CREATE',
  PROJECT_GET_ALL: 'CIT_PROJECT_GET_ALL',
  PROJECT_GET: 'CIT_PROJECT_GET',
  PROJECT_UPDATE: 'CIT_PROJECT_UPDATE',
  PROJECT_DELETE: 'CIT_PROJECT_DELETE',

  // Migration (first run after the canonical-store upgrade)
  MIGRATE_GET_STATUS: 'CIT_MIGRATE_GET_STATUS',
  MIGRATE_START_FRESH: 'CIT_MIGRATE_START_FRESH',
  MIGRATE_BEST_EFFORT: 'CIT_MIGRATE_BEST_EFFORT',
});
