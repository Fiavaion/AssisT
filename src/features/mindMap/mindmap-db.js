/**
 * Mind map storage — the Dexie database `AssistMindMaps`.
 *
 * Maps are free-standing: a student reaches one from the popup, from the highlight menu on any
 * page, or from a keyboard shortcut, so every write has to land in one database owned by the
 * extension origin. The editor page and the service worker open it directly, the way the
 * annotation store already does. Content scripts never open it; they message the service worker.
 *
 * See docs/adr/0001-mind-map-outline-first.md.
 */

import Dexie from 'dexie';
import { isBranchView } from './core/branch-view.js';
import { MindMapError, createMap, validateMap } from './core/map-model.js';
import { addChild, nodeCount } from './core/map-ops.js';
import { INBOX_ID, TARGET_KEY, readTargetId } from './mindmap-keys.js';

const DB_NAME = 'AssistMindMaps';

/** Channel that lets two tabs showing the same map hear each other's saves. */
const CHANNEL_NAME = 'assist-mindmap';

export { INBOX_ID, TARGET_KEY };

let db = null;
let channel;

/**
 * Open (once) the mind map database.
 *
 * The connection is this module's own: every read and write in the extension goes through the
 * functions below, so nothing outside has to know Dexie is here at all.
 *
 * @returns {Dexie} the shared connection
 */
function openMindMapDb() {
  if (!db) {
    db = new Dexie(DB_NAME);
    // The whole map object is the record. `sourceUrl` is a denormalised copy of source.url, which
    // `listMaps` hands to the library in each summary. Nothing queries the index on it yet, and
    // `listMaps` reads every record; the index stays because taking it out is a schema version for
    // every database already written, which is not a change to make for tidiness.
    db.version(1).stores({ maps: 'id, title, updatedAt, sourceUrl' });
  }
  return db;
}

/**
 * The BroadcastChannel, opened on first use.
 * A context without one (jsdom under test) still saves; it simply hears nothing.
 * @returns {BroadcastChannel|null}
 */
function mapsChannel() {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  }
  return channel;
}

/**
 * Tell the other tabs that a map changed.
 * @param {string} mapId
 * @param {number} updatedAt
 */
function announce(mapId, updatedAt) {
  mapsChannel()?.postMessage({ mapId, updatedAt });
}

/**
 * Listen for saves and deletions made in another tab or in the service worker.
 * @param {(change: {mapId: string, updatedAt: number}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onMapsChanged(listener) {
  const open = mapsChannel();
  if (!open) {
    return () => {};
  }
  const handler = event => listener(event.data);
  open.addEventListener('message', handler);
  return () => open.removeEventListener('message', handler);
}

/** @param {Object} map @returns {Object} the stored record */
function toRecord(map) {
  return { ...map, sourceUrl: map.source?.url || null };
}

/** @param {Object} record @returns {Object} the map, without the denormalised index field */
function fromRecord(record) {
  const { sourceUrl: _sourceUrl, ...map } = record;
  return map;
}

/**
 * Every map, newest first, as summaries for the library and the target-map picker.
 * @returns {Promise<Array<{id: string, title: string, updatedAt: number, nodeCount: number, sourceUrl: string|null}>>}
 */
export async function listMaps() {
  const records = await openMindMapDb().maps.orderBy('updatedAt').reverse().toArray();
  return records.map(record => ({
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    nodeCount: nodeCount(record),
    sourceUrl: record.sourceUrl || null,
  }));
}

/**
 * @param {string} id
 * @returns {Promise<Object|null>} the map, or null when nothing is stored under that id
 */
export async function getMap(id) {
  const record = await openMindMapDb().maps.get(id);
  return record ? fromRecord(record) : null;
}

/**
 * Stamp and store a map. An invalid map is refused rather than written: a broken tree in the
 * database would take the editor down on open, and the caller can still recover in memory.
 *
 * A derived VIEW is refused too, and that one matters more than it looks. Focus mode shows one branch
 * as a map of its own, carrying the same id as the map it was cut from (`branchOf`, slice E2), and it
 * is a valid map — so storing one would quietly replace the student's whole map with one branch of
 * it. Nothing does that today: the autosave and every export hold the real history. This is here so
 * that nothing can start to.
 *
 * @param {Object} map
 * @param {{now?: () => number}} [options]
 * @returns {Promise<Object>} the map as stored, with its new updatedAt
 * @throws {MindMapError} NOT_A_WHOLE_MAP for a derived view, INVALID_MAP for a broken tree.
 */
export async function saveMap(map, { now = Date.now } = {}) {
  if (isBranchView(map)) {
    throw new MindMapError(
      'NOT_A_WHOLE_MAP',
      'Refusing to save one branch of a mind map over the whole map.'
    );
  }
  const problems = validateMap(map);
  if (problems.length > 0) {
    throw new MindMapError(
      'INVALID_MAP',
      `Refusing to save an invalid mind map: ${problems.map(problem => problem.code).join(', ')}`
    );
  }
  const stored = { ...map, updatedAt: now() };
  await openMindMapDb().maps.put(toRecord(stored));
  announce(stored.id, stored.updatedAt);
  return stored;
}

/**
 * Add a node under a map's root, reading and writing inside one transaction.
 *
 * Two highlights captured moments apart are two messages in flight at once. Reading the map,
 * adding to it and writing it back across separate awaits lets the second write build on the map
 * as it was before the first, so one capture disappears while both report success. IndexedDB runs
 * overlapping read-write transactions on a store one at a time, so doing the whole read-modify-
 * write inside one is what makes the second capture see the first.
 *
 * Only Dexie promises are awaited inside the transaction; anything else would let it commit early.
 *
 * @param {string} mapId
 * @param {Object} node - a node from `createNode`.
 * @param {{now?: () => number}} [options]
 * @returns {Promise<Object>} the map as stored, with the node in it
 */
export async function appendNode(mapId, node, { now = Date.now } = {}) {
  const connection = openMindMapDb();

  const stored = await connection.transaction('rw', connection.maps, () =>
    connection.maps.get(mapId).then(record => {
      if (!record) {
        throw new MindMapError('NO_SUCH_MAP', `No mind map with id ${mapId}`);
      }
      const map = addChild(fromRecord(record), { parentId: record.rootId, node });
      const next = { ...map, updatedAt: now() };
      return connection.maps.put(toRecord(next)).then(() => next);
    })
  );

  announce(stored.id, stored.updatedAt);
  return stored;
}

/**
 * @param {string} id
 * @param {{now?: () => number}} [options]
 * @returns {Promise<void>}
 */
export async function deleteMap(id, { now = Date.now } = {}) {
  await openMindMapDb().maps.delete(id);
  announce(id, now());
}

/**
 * The inbox map, created on demand. Reached through `getTargetMap`, which is what a capture asks.
 * @param {{now?: () => number}} [options]
 * @returns {Promise<Object>}
 */
async function getInbox({ now = Date.now } = {}) {
  const connection = openMindMapDb();
  let made = false;

  // Create-or-get in one transaction: two captures arriving together would otherwise both find
  // nothing and both write a fresh Inbox, the second one empty and over the first.
  const inbox = await connection.transaction('rw', connection.maps, () =>
    connection.maps.get(INBOX_ID).then(record => {
      if (record) {
        return fromRecord(record);
      }
      made = true;
      const fresh = createMap({ id: INBOX_ID, title: 'Inbox', now: now() });
      return connection.maps.put(toRecord(fresh)).then(() => fresh);
    })
  );

  if (made) {
    announce(inbox.id, inbox.updatedAt);
  }
  return inbox;
}

/**
 * The map a capture should land in: the student's chosen target, or the inbox when they have not
 * chosen one or the map they chose has since been deleted.
 * @param {{now?: () => number}} [options]
 * @returns {Promise<Object>}
 */
export async function getTargetMap({ now = Date.now } = {}) {
  const targetId = await readTargetId();
  if (targetId) {
    const target = await getMap(targetId);
    if (target) {
      return target;
    }
  }
  return getInbox({ now });
}
