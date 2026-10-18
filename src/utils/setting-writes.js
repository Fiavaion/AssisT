/**
 * Writing a list of settings the popup's tool registry produced.
 *
 * The registry says where every tool's state lives: a dotted path inside `assist_settings` for
 * almost everything, and a top-level `chrome.storage.local` key for the few that the content
 * script watches directly — `aiMode`, the text-stats badge. Anything that switches tools on or off
 * in bulk therefore has the same small, fiddly job: merge the settings paths into the stored
 * object without flattening it, and set the local keys beside it, in one write.
 *
 * The discovery quiz did that job for switching on; the onboarding clean setup needs it for
 * switching off. Two copies of a merge this particular is two chances to lose a student's other
 * settings, so it lives here once.
 *
 * A write is `{ store: 'settings'|'local', path, value }` — exactly what the registry helpers in
 * `src/popup/registry/` emit.
 *
 * @module utils/setting-writes
 */

/**
 * Set a dotted path on an object, creating the branches it needs.
 *
 * A `value` of `undefined` removes the key instead of storing it. `chrome.storage` drops an
 * undefined value on the way to disk anyway, so storing one would leave the old value in place; a
 * setting the student cleared has to actually go.
 *
 * @param {Object} target - mutated in place
 * @param {string} path
 * @param {*} value
 */
export function applyNestedPath(target, path, value) {
  const keys = path.split('.');
  let node = target;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]] || typeof node[keys[i]] !== 'object') {
      node[keys[i]] = {};
    }
    node = node[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    delete node[last];
    return;
  }
  node[last] = value;
}

/**
 * Is this a plain object — something with branches to walk into, rather than a value to write whole?
 * @param {*} value
 * @returns {boolean}
 */
function isBranch(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The writes that turn `pristine` into `current`: one per dotted path whose value actually differs.
 *
 * This is how a caller that holds a whole settings object in memory — the popup, whose ~160
 * handlers mutate `this.settings` — can still write like a caller that changes one setting. Diff
 * against the copy taken when the object was read, write only those paths through
 * `applySettingWrites`, and everything another realm stored in the meantime survives, because
 * nothing outside the changed paths is written at all.
 *
 * Values are compared, never truthiness: `false`, `0` and `''` are settings a student chose, and a
 * value deliberately put back to its default is still a change. Arrays are values, so a changed list
 * is written whole rather than merged entry by entry. A key that is gone from `current` is reported
 * as a write of `undefined`, which `applyNestedPath` removes.
 *
 * @param {Object} pristine - the settings as they were read
 * @param {Object} current - the settings as they are now
 * @param {string} [prefix] - internal, the dotted path of the branch being walked
 * @returns {Array<{path: string, value: *}>} empty when nothing changed
 */
export function changedSettingWrites(pristine, current, prefix = '') {
  if (!isBranch(current)) {
    return [];
  }
  const was = isBranch(pristine) ? pristine : {};
  const writes = [];
  const at = key => (prefix ? `${prefix}.${key}` : key);

  Object.keys(current).forEach(key => {
    const before = was[key];
    const after = current[key];
    if (isBranch(after) && isBranch(before)) {
      writes.push(...changedSettingWrites(before, after, at(key)));
      return;
    }
    // Everything else is one value against another: a branch replacing a value or an absent key, an
    // array, a primitive. JSON comparison keeps `false`, `0` and `''` distinct from a missing key.
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      writes.push({ path: at(key), value: after });
    }
  });

  Object.keys(was).forEach(key => {
    if (!(key in current)) {
      writes.push({ path: at(key), value: undefined });
    }
  });

  return writes;
}

/**
 * The top-level `chrome.storage.local` keys a set of writes touches, so a caller knows what to
 * read before merging into it.
 *
 * @param {Array<{store?:string, path:string}>} writes
 * @returns {string[]}
 */
export function localRoots(writes) {
  return [
    ...new Set(
      (writes || []).filter(write => write.store === 'local').map(write => write.path.split('.')[0])
    ),
  ];
}

/**
 * Work out the single `chrome.storage.local.set` payload a set of writes needs. Pure — the caller
 * supplies the storage snapshot, which makes the merge testable without a browser.
 *
 * @param {Array<{store?:string, path:string, value:*}>} writes
 * @param {Object} stored - a snapshot holding `assist_settings` and every root from `localRoots`
 * @param {Object} [extra] - anything else to store in the same write
 * @returns {Object} the payload to set
 */
export function planWrites(writes, stored = {}, extra = {}) {
  const settings = stored.assist_settings || {};
  const payload = { ...extra, assist_settings: settings };

  (writes || []).forEach(write => {
    if (write.store !== 'local') {
      applyNestedPath(settings, write.path, write.value);
      return;
    }
    const [root, ...rest] = write.path.split('.');
    if (rest.length === 0) {
      payload[root] = write.value;
      return;
    }
    const holder = payload[root] || stored[root] || {};
    applyNestedPath(holder, rest.join('.'), write.value);
    payload[root] = holder;
  });

  return payload;
}

/**
 * Read what these writes will merge into, apply them, and store the result in one write.
 *
 * One write matters: a student left half switched on and half off, because a second `set` failed,
 * is worse off than one that never ran.
 *
 * @param {Array<{store?:string, path:string, value:*}>} writes
 * @param {Object} [extra] - anything else to store alongside
 * @returns {Promise<void>}
 */
export async function applySettingWrites(writes, extra = {}) {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }
  const stored = await chrome.storage.local.get(['assist_settings', ...localRoots(writes)]);
  await chrome.storage.local.set(planWrites(writes, stored, extra));
}
