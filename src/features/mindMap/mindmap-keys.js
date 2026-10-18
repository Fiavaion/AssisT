/**
 * The two identifiers the mind map feature shares across realms.
 *
 * They live apart from `mindmap-db.js` because the popup needs the strings but must not pull Dexie
 * — and everything the database module imports — into its bundle. `mindmap-db.js` re-exports both,
 * so storage callers still have one place to look.
 */

/** The map a highlight capture lands in until the student chooses a different target. */
export const INBOX_ID = 'inbox';

/** chrome.storage.local key holding the id of the student's chosen target map. */
export const TARGET_KEY = 'mindMapTarget';

/**
 * The map the student has chosen for highlight captures.
 *
 * Reading and writing the key live here beside the key itself so there is exactly one place that
 * knows the shape of the record. `mindmap-db.js` uses these; so does the popup, which cannot
 * import the database module at all.
 *
 * @returns {Promise<string|null>} the stored map id, or null when nothing has been chosen.
 */
export async function readTargetId() {
  const stored = await chrome.storage.local.get(TARGET_KEY);
  return stored?.[TARGET_KEY] || null;
}

/**
 * Remember which map captures land in.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function writeTargetId(id) {
  await chrome.storage.local.set({ [TARGET_KEY]: id });
}
