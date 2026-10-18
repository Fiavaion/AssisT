/**
 * Storage bridge for the shared AssisT offscreen document.
 *
 * An offscreen document is not a normal extension page. Attach a debugger to the live document and
 * `Object.keys(chrome)` is `loadTimes, csi, runtime` — `chrome.storage` simply is not there. Every
 * direct `chrome.storage.local` call from that realm threw, silently in most paths: the
 * `citationIndex` projection was never written, so `chrome.storage.onChanged` never fired and an
 * open library never learned about a citation saved somewhere else; the migration flag could be
 * neither read nor written; the remembered WebLLM model was lost on every reload.
 *
 * The document has `chrome.runtime`, so it asks the service worker — which does have storage — to
 * read and write the four keys it owns. Two halves live here:
 *   - `createOffscreenStorage` — the client the offscreen document calls; a `{ get, set }` pair
 *     shaped like `chrome.storage.local` so callers need no special case.
 *   - `authorizeOffscreenStorageRequest` — the pure gate the service worker applies before it
 *     touches storage on the document's behalf. It lives here, next to the client it polices, so
 *     the wire format and its rules cannot drift apart.
 */

import {
  OFFSCREEN_STORAGE_GET,
  OFFSCREEN_STORAGE_SET,
  OFFSCREEN_STORAGE_TARGET,
  OFFSCREEN_STORAGE_ALLOWED_KEYS,
} from '../../config/citation-messages.js';

/** Accept the shapes `chrome.storage.local.get` accepts, and hand the worker a plain array. */
function toKeyArray(keys) {
  if (typeof keys === 'string') {
    return [keys];
  }
  return Array.isArray(keys) ? keys.slice() : [];
}

/** Turn the worker's `{ ok, result?, error? }` envelope into a value or a throw. */
function unwrap(reply, what) {
  if (!reply) {
    return Promise.reject(
      new Error(`offscreen storage: no reply to the ${what} — is the service worker awake?`)
    );
  }
  if (reply.ok !== true) {
    return Promise.reject(new Error(reply.error || `offscreen storage: the ${what} was refused`));
  }
  return Promise.resolve(reply.result);
}

/**
 * Build the offscreen document's view of `chrome.storage.local`.
 * @param {{runtime: {sendMessage: Function}}} deps - the document's `chrome.runtime`
 * @returns {{get: (keys: string|string[]) => Promise<Object>, set: (items: Object) => Promise<void>}}
 */
export function createOffscreenStorage({ runtime }) {
  return {
    async get(keys) {
      const reply = await runtime.sendMessage({
        target: OFFSCREEN_STORAGE_TARGET,
        action: OFFSCREEN_STORAGE_GET,
        keys: toKeyArray(keys),
      });
      return (await unwrap(reply, 'read')) || {};
    },

    async set(items) {
      const reply = await runtime.sendMessage({
        target: OFFSCREEN_STORAGE_TARGET,
        action: OFFSCREEN_STORAGE_SET,
        items,
      });
      await unwrap(reply, 'write');
    },
  };
}

let sharedStorage = null;

/**
 * The one bridge this offscreen document uses. The citation handler is eager and the WebLLM handler
 * is lazy-imported, so they cannot share an instance by import order alone — they share this.
 * @returns {{get: Function, set: Function}}
 */
export function getOffscreenStorage() {
  if (!sharedStorage) {
    sharedStorage = createOffscreenStorage({ runtime: chrome.runtime });
  }
  return sharedStorage;
}

const refuse = error => ({ ok: false, error: `offscreen storage: ${error}` });

/**
 * Decide whether the service worker may serve one storage request, and say what it asks for.
 *
 * Two independent gates. The sender must really be our offscreen document — not another extension,
 * not a content script (which page XSS can reach), not another page of our own. And the keys must
 * be the four the document owns; least privilege applies inside the extension too, so a bridge that
 * exists for a projection and a migration flag cannot be talked into reading an API key.
 *
 * @param {Object} message - `{ target, action, keys | items }` as sent by `createOffscreenStorage`
 * @param {Object} sender - the `chrome.runtime.MessageSender` for that message
 * @param {{extensionId: string, offscreenUrl: string}} context - our own id, and the extension-
 *        relative path of the offscreen document
 * @returns {{ok: true, action: string, keys: string[], items: (Object|null)}|{ok: false, error: string}}
 */
export function authorizeOffscreenStorageRequest(message, sender, { extensionId, offscreenUrl }) {
  const fromOffscreenDocument =
    sender &&
    sender.id === extensionId &&
    !sender.tab &&
    typeof sender.url === 'string' &&
    sender.url.endsWith(`/${offscreenUrl}`);
  if (!fromOffscreenDocument) {
    return refuse('the sender is not this extension’s offscreen document');
  }

  if (message.target !== OFFSCREEN_STORAGE_TARGET) {
    return refuse(`not addressed to the service worker (target ${message.target})`);
  }

  const isWrite = message.action === OFFSCREEN_STORAGE_SET;
  if (!isWrite && message.action !== OFFSCREEN_STORAGE_GET) {
    return refuse(`unknown action ${message.action}`);
  }

  const items =
    isWrite && message.items && typeof message.items === 'object' ? message.items : null;
  const keys = isWrite ? Object.keys(items || {}) : toKeyArray(message.keys);
  if (!keys.length) {
    return refuse(isWrite ? 'a write with nothing to store' : 'a read with no keys');
  }

  const forbidden = keys.filter(key => !OFFSCREEN_STORAGE_ALLOWED_KEYS.includes(key));
  if (forbidden.length) {
    return refuse(`key not permitted: ${forbidden.join(', ')}`);
  }

  return { ok: true, action: message.action, keys, items };
}
