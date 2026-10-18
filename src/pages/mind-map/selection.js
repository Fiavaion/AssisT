/**
 * The selected nodes, shared by every pane on the mind map page.
 *
 * ADR 0001 makes the outline and the canvas two views of one model. Undo already lives in the
 * history for that reason; selection is the other piece of state both panes need, and it cannot
 * live inside either of them without the other having to reach in.
 *
 * Every change carries the source that made it, which is what stops the panes chasing each other:
 * the outline moves focus for a selection made on the canvas, but never for its own.
 *
 * The store holds an ordered SET, not one id, because restructuring an essay plan is the thing
 * students come to a mind map for and moving five points under a new heading one at a time is five
 * moves. Three ideas keep the set honest:
 *
 *  - the PRIMARY is what `get()` returns and what every caller written for one node already means:
 *    the node the inspector edits, the node read-aloud and study mode start from, the node the
 *    quick-add handles belong to. There is always exactly one, and it is always in the set;
 *  - the ANCHOR is where a Shift range started, so extending twice shrinks the range rather than
 *    growing it;
 *  - `set(id)` replaces the whole selection with one node, so single selection behaves exactly as it
 *    did before the set existed.
 *
 * The set is pruned against the map after every history change — an undo, an import, a delete made
 * in another pane — so no pane can ever be handed an id the map no longer holds. A selection that
 * was empty stays empty; the store never invents one.
 */

import { hasNode } from '../../features/mindMap/core/map-model.js';
import { pathTo } from '../../features/mindMap/core/map-ops.js';

/**
 * Create a selection store.
 *
 * @param {string|null} [initialId] - the node selected to begin with.
 * @param {Object} [options]
 * @param {Object} [options.history] - a `createHistory` instance. With one, the store prunes itself
 *   after every change to the map; without one, the caller prunes by handing `reconcile` a map.
 * @returns {{
 *   get: () => string|null,
 *   ids: () => string[],
 *   has: (id: string) => boolean,
 *   set: (id: string|null, meta?: {source?: string}) => void,
 *   toggle: (id: string, meta?: {source?: string}) => void,
 *   extendTo: (id: string, orderedIds: string[], meta?: {source?: string}) => void,
 *   selectAll: (ids: string[], meta?: {source?: string}) => void,
 *   clearToPrimary: (meta?: {source?: string}) => void,
 *   reconcile: (map: Object, meta?: {source?: string}) => void,
 *   subscribe: (listener: (id: string|null, meta: {source: string}) => void) => () => void,
 *   destroy: () => void
 * }}
 */
export function createSelection(initialId = null, { history = null } = {}) {
  /** The set, in the order it was built up: a Shift range in range order, a Ctrl+click appended. */
  let currentIds = initialId === null ? [] : [initialId];
  let primaryId = initialId;
  let anchorId = initialId;

  /**
   * The path from the root to the primary, as of the last time a map was in hand.
   *
   * Kept so that a primary the map takes away can be replaced by the nearest thing that is still
   * there. Once the node is gone there is nothing left to ask about its ancestry, so the answer has
   * to have been written down before the change arrived.
   */
  let primaryPath = [];

  const listeners = new Set();

  const same = (a, b) => a.length === b.length && a.every((id, at) => id === b[at]);

  const rememberPath = map => {
    if (!map || primaryId === null || !hasNode(map, primaryId)) {
      return;
    }
    primaryPath = pathTo(map, primaryId);
  };

  const currentMap = () => (history ? history.current() : null);

  /**
   * Take the next state, and tell everybody once if it is a different state.
   *
   * @param {string[]} nextIds
   * @param {string|null} nextPrimary
   * @param {string|null} nextAnchor
   * @param {{source?: string, said?: boolean}} meta - `said` when the caller has already announced
   *   something more specific than the count, so the page does not say it twice.
   * @param {Object|null} [map] - the map this state was worked out against, when there is one.
   */
  function commit(nextIds, nextPrimary, nextAnchor, meta, map = currentMap()) {
    anchorId = nextAnchor;
    if (nextPrimary === primaryId && same(nextIds, currentIds)) {
      rememberPath(map);
      return;
    }
    currentIds = nextIds;
    primaryId = nextPrimary;
    rememberPath(map);
    const detail = { source: meta.source || 'program', said: Boolean(meta.said) };
    // A copy, so a listener that unsubscribes itself while being called cannot cut the round short.
    // Each listener fails alone as well: the inspector throwing must not leave the outline
    // highlighting a node that is no longer selected, silently, for the rest of the session.
    for (const listener of [...listeners]) {
      try {
        listener(primaryId, detail);
      } catch (error) {
        console.error(`[mind map selection] listener failed (source ${detail.source}):`, error);
      }
    }
  }

  const store = {
    /** @returns {string|null} the primary: the focused node, and what one-node callers mean. */
    get() {
      return primaryId;
    },

    /** @returns {string[]} every selected node, in the order the set was built up. */
    ids() {
      return [...currentIds];
    },

    /** @param {string} id @returns {boolean} */
    has(id) {
      return currentIds.includes(id);
    },

    /**
     * Select one node, replacing whatever was selected. Selecting the node that is already the
     * whole selection changes nothing and tells nobody, so a pane may set the selection freely
     * while reacting to someone else's.
     *
     * @param {string|null} id
     * @param {{source?: string}} [meta] - who made the change; 'program' when nobody says.
     */
    set(id, meta = {}) {
      commit(id === null ? [] : [id], id, id, meta);
    },

    /**
     * Add a node to the set, or take it out again — the outline's Ctrl+Space and the canvas's
     * Ctrl+click. A node added becomes the primary and the anchor, because that is where the
     * student now is; a primary taken out hands the job to whatever is left.
     *
     * Taking out the last node is refused: an empty selection leaves the inspector, the toolbar and
     * every act with nothing to talk about, and Ctrl+Space is not how a student asks for that.
     *
     * @param {string} id
     * @param {{source?: string}} [meta]
     */
    toggle(id, meta = {}) {
      if (!currentIds.includes(id)) {
        commit([...currentIds, id], id, id, meta);
        return;
      }
      if (currentIds.length === 1) {
        return;
      }
      const nextIds = currentIds.filter(other => other !== id);
      const nextPrimary = id === primaryId ? nextIds[nextIds.length - 1] : primaryId;
      commit(nextIds, nextPrimary, nextPrimary, meta);
    },

    /**
     * Select everything from the anchor to a node, through an order the caller supplies — the rows
     * the outline is showing, which is the only order "the nodes between these two" can mean.
     *
     * The anchor stays where it was, so Shift+Down four times and then Shift+Up once leaves three
     * nodes selected rather than five.
     *
     * @param {string} id - the far end, which becomes the primary.
     * @param {string[]} orderedIds
     * @param {{source?: string}} [meta]
     */
    extendTo(id, orderedIds, meta = {}) {
      const from = anchorId === null ? primaryId : anchorId;
      const start = orderedIds.indexOf(from);
      const end = orderedIds.indexOf(id);
      if (start === -1 || end === -1) {
        // One end is not on screen, so there is no range to speak of; the node asked for is.
        commit(id === null ? [] : [id], id, id, meta);
        return;
      }
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      commit(orderedIds.slice(low, high + 1), id, from, meta);
    },

    /**
     * Select exactly this list — the outline's Ctrl+A. The primary stays where it is when it is one
     * of them, so the inspector does not jump to another node under the student's hand.
     *
     * @param {string[]} ids
     * @param {{source?: string}} [meta]
     */
    selectAll(ids, meta = {}) {
      const nextIds = [...new Set(ids)];
      if (nextIds.length === 0) {
        return;
      }
      const nextPrimary = nextIds.includes(primaryId) ? primaryId : nextIds[0];
      commit(nextIds, nextPrimary, nextPrimary, meta);
    },

    /**
     * Drop everything but the primary — Escape, and a plain click.
     *
     * @param {{source?: string}} [meta]
     */
    clearToPrimary(meta = {}) {
      if (currentIds.length <= 1) {
        return;
      }
      commit([primaryId], primaryId, primaryId, meta);
    },

    /**
     * Bring the set back into agreement with a map that has changed under it.
     *
     * Wired to the history when the store was given one, so no pane can be handed an id the map no
     * longer holds however the change arrived — an undo, an import, a delete in another pane.
     *
     * A primary that has gone is replaced by the nearest thing that is still there: whatever else
     * the student had selected, then the closest surviving ancestor it hung from, then the centre of
     * the map. A selection that was empty is left empty.
     *
     * @param {Object} map
     * @param {{source?: string}} [meta]
     */
    reconcile(map, meta = {}) {
      if (primaryId === null && currentIds.length === 0) {
        return;
      }
      const survivors = currentIds.filter(id => hasNode(map, id));
      if (primaryId !== null && hasNode(map, primaryId)) {
        commit(survivors, primaryId, hasNode(map, anchorId) ? anchorId : primaryId, meta, map);
        return;
      }
      const ancestor = [...primaryPath].reverse().find(id => id !== primaryId && hasNode(map, id));
      const nextPrimary = survivors[0] || ancestor || map.rootId;
      const nextIds = survivors.includes(nextPrimary) ? survivors : [...survivors, nextPrimary];
      commit(nextIds, nextPrimary, nextPrimary, meta, map);
    },

    /**
     * @param {(id: string|null, meta: {source: string}) => void} listener
     * @returns {() => void} unsubscribe.
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Stop watching the history. The page takes its panes down in one place, and this with them. */
    destroy() {
      if (unsubscribeHistory) {
        unsubscribeHistory();
        unsubscribeHistory = null;
      }
      listeners.clear();
    },
  };

  let unsubscribeHistory = history
    ? history.subscribe(map => store.reconcile(map, { source: 'program' }))
    : null;

  rememberPath(currentMap());

  return store;
}
