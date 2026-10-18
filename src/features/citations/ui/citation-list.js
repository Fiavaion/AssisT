/**
 * Citation List Component
 *
 * Renders an ordered list of citation cards with an INCREMENTAL DIFFED reconcile.
 * Surviving cards keep their exact DOM node identity across setCitations() calls —
 * no full rebuild, no innerHTML stomping, no focus or scroll destruction.
 *
 * Public API:
 *   createCitationList(options) -> { el, setCitations(citations, options),
 *                                    setSelected(idSet), destroy() }
 *
 * Design principles:
 *   - Reconcile is keyed by String(citation.id); citations without an id fall back
 *     to a positional key ('__pos_0', '__pos_1', …) so they still render without crash.
 *     Positional keys are NOT stable across re-renders — callers should always provide
 *     a real id if node identity across updates matters.
 *   - Reordering moves ONLY the nodes whose position changed: a card already sitting where the
 *     incoming order wants it is not touched at all, so a reconcile that changes nothing performs
 *     zero DOM operations. Re-inserting a node blurs anything focused inside it in Chrome, so
 *     "touch nothing" is what keeps a keyboard student's place in the list.
 *   - Stale cards (ids absent from the next list) are destroyed before reorder so
 *     the map stays clean and destroy() runs their cleanup callbacks.
 *   - The empty state is a sibling <div> inside a wrapper <div>. el is the wrapper,
 *     so callers have a single root to mount; the <ul> and empty <div> are hidden /
 *     shown via the hidden attribute (no display hacks needed).
 *   - All user-derived strings reach the DOM through createCitationCard's textContent
 *     paths; the emptyMessage is set via textContent here.
 *   - No dead code; no TODOs.
 */

import { createCitationCard } from './citation-card.js';

/** Default message shown when the citations array is empty. */
const DEFAULT_EMPTY_MESSAGE = 'No citations to display.';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive a stable map key for a citation.
 * Real id is always preferred. When absent, fall back to a positional sentinel so
 * the citation still renders; note that positional keys are unstable across
 * setCitations calls with different lengths.
 *
 * @param {Object} citation
 * @param {number} index - position in the incoming array (fallback only)
 * @returns {string}
 */
function keyFor(citation, index) {
  const raw = citation.id;
  if (raw !== undefined && raw !== null && String(raw).length > 0) {
    return String(raw);
  }
  return `__pos_${index}`;
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a citation list component.
 *
 * @param {Object} [options]
 * @param {string} [options.style='harvard']    - citation formatting style id
 * @param {Function} [options.onInsert]         - passed to each card
 * @param {Function} [options.onEdit]           - passed to each card
 * @param {Function} [options.onRemove]         - passed to each card
 * @param {string} [options.emptyMessage]       - text shown when list is empty
 * @returns {{ el: HTMLDivElement, setCitations: Function, setSelected: Function,
 *             destroy: Function }}
 */
export function createCitationList(options = {}) {
  /** Live options — merged in place on each setCitations call. */
  let opts = {
    style: 'harvard',
    emptyMessage: DEFAULT_EMPTY_MESSAGE,
    ...options,
  };

  /**
   * Card registry keyed by the citation's string id.
   * Each value is the object returned by createCitationCard().
   * @type {Map<string, { id: string, el: HTMLLIElement, update: Function, destroy: Function }>}
   */
  const cards = new Map();

  // ── DOM skeleton ───────────────────────────────────────────────────────────

  const wrapper = document.createElement('div');
  wrapper.className = 'assist-cite-list-wrapper';

  const ul = document.createElement('ul');
  ul.className = 'assist-cite-list';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'assist-cite-empty';
  emptyEl.textContent = opts.emptyMessage;

  // Start hidden until setCitations is called; <ul> is visible by default.
  emptyEl.hidden = true;

  wrapper.appendChild(ul);
  wrapper.appendChild(emptyEl);

  // ── setCitations ───────────────────────────────────────────────────────────

  /**
   * Incrementally reconcile the displayed list against the incoming array.
   *
   * Algorithm:
   *   1. Merge nextOptions into stored options.
   *   2. Build an ordered key array from the incoming citations.
   *   3. For each incoming citation: reuse the existing card (card.update) if the
   *      key is already in the map, otherwise create a fresh card and register it.
   *   4. Destroy and deregister any card whose key is absent from the incoming set.
   *   5. Put the <ul>'s children in the incoming order, moving only the nodes whose position
   *      actually changed (insertBefore MOVES an already-attached node without cloning, so the
   *      node reference is unchanged).
   *   6. Toggle the empty state.
   *
   * @param {Object[]} citations - ordered array of citation objects to display
   * @param {Object} [nextOptions] - option overrides (style, callbacks, emptyMessage)
   */
  function setCitations(citations, nextOptions = {}) {
    // 1. Merge options — only provided keys override.
    opts = { ...opts, ...nextOptions };

    // Keep the emptyMessage in sync in case it was updated.
    emptyEl.textContent = opts.emptyMessage;

    // 2. Build an ordered array of { key, citation }.
    const incoming = citations.map((citation, index) => ({
      key: keyFor(citation, index),
      citation,
    }));

    // Build a set of incoming keys for O(1) stale-check.
    const incomingKeys = new Set(incoming.map(({ key }) => key));

    // 3. Create or update cards for every incoming citation.
    for (const { key, citation } of incoming) {
      if (cards.has(key)) {
        // Existing card — patch in place (node identity preserved).
        cards.get(key).update(citation, opts);
      } else {
        // New citation — create a fresh card and register it.
        const card = createCitationCard(citation, opts);
        cards.set(key, card);
      }
    }

    // 4. Destroy stale cards (ids present in the map but absent from incoming).
    for (const [key, card] of cards) {
      if (!incomingKeys.has(key)) {
        card.destroy();
        cards.delete(key);
      }
    }

    // 5. Put the <ul>'s children in the incoming order, moving ONLY the nodes whose position
    //    actually changed. `expected` walks the children the list already has: a card that is
    //    already there is stepped over and never touched, and anything else is inserted in front
    //    of it. A reconcile that changes no order therefore performs no DOM operation at all.
    //
    //    That matters far more than the work it saves. Re-inserting a node that contains
    //    document.activeElement blurs it to <body> in Chrome, so the old unconditional
    //    appendChild() loop took a keyboard student's place in the list on every storage echo —
    //    ~200 ms after the right element had been focused. jsdom does not model that blur, which
    //    is why it was invisible in the unit tests.
    let expected = ul.firstChild;
    for (const { key } of incoming) {
      const node = cards.get(key).el;
      if (node === expected) {
        expected = expected.nextSibling;
        continue;
      }
      // insertBefore(node, null) appends, which is what a new card at the end needs.
      ul.insertBefore(node, expected);
    }

    // 6. Toggle empty state.
    const isEmpty = incoming.length === 0;
    ul.hidden = isEmpty;
    emptyEl.hidden = !isEmpty;
  }

  // ── setSelected ────────────────────────────────────────────────────────────

  /**
   * Apply the view's selection to the cards on screen. The selection belongs to the view, not to
   * the cards: this is the one path that ticks them, so a card created by a later reconcile is
   * given its state by the next call rather than remembering one of its own.
   *
   * @param {Set<string>} selectedIds - citation ids (as strings) that are currently selected
   */
  function setSelected(selectedIds) {
    for (const [key, card] of cards) {
      card.setSelected(selectedIds.has(key));
    }
  }

  // ── destroy ────────────────────────────────────────────────────────────────

  /**
   * Destroy all child cards and clear the registry.
   * The wrapper element is left in place for the caller to remove.
   */
  function destroy() {
    for (const card of cards.values()) {
      card.destroy();
    }
    cards.clear();
  }

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    /** Wrapper <div> containing the <ul> and the empty-state <div>. */
    el: wrapper,
    setCitations,
    setSelected,
    destroy,
  };
}
