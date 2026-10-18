/**
 * The Flat view's logic, with no DOM in it.
 *
 * Flat puts every support on one screen, grouped, with a filter that collapses the list to what is
 * switched on. The three rules below came out of using the prototype and are the reason this is a
 * module rather than a few lines inside a render function — each one is a behaviour that is easy
 * to lose by accident and impossible to notice in a screenshot.
 *
 *   1. The filter SNAPSHOTS the visible set when it is pressed. If it recomputed on every change,
 *      switching a support off while filtering would make its row vanish from under the pointer —
 *      the student's finger is on it. The view refreshes on the next press instead.
 *   2. The count is always shown. Hiding everything that is off also hides the means of switching
 *      anything on, so the student has to be able to see that things are hidden and get them back
 *      in one tap.
 *   3. A group's jump button only exists while that group has something in it. A jump to an empty
 *      heading is a dead control.
 *   4. The SEARCH is live — the exact opposite of rule 1, and for the same reason. A student
 *      pressing the filter has their finger on a row and must not have it moved; a student typing
 *      is looking at the field, not the list, and expects the list to narrow as they go. Nothing
 *      they are touching is in the list, so there is nothing to protect. It narrows whatever is
 *      currently shown, so it composes with the filter rather than replacing it.
 *
 * A support that declares `dependsOn` is NOT a row of its group: it belongs to the support it
 * depends on, and `childRowsOf` hands it over so the view can draw it inside that support. Which
 * is why "in use" here means on AND able to act — Highlight While Reading stored as on while Read
 * Aloud is off is not in use, and counting it would let the filter capture a row whose only way
 * on screen had just been hidden.
 */

import { GROUPS } from '../registry/tool-schema.js';
import { TOOLS } from '../registry/tool-registry.js';
import { readToolStates } from '../registry/tool-state.js';
import { searchTools } from './flat-search.js';

/**
 * @typedef {Object} FlatRow
 * @property {Object} tool
 * @property {boolean} on
 * @property {boolean} available - false while the tool it depends on is off
 * @property {*} value - the stored state itself, for a tool whose state is not a boolean
 */

/**
 * Build the model.
 *
 * @param {Object} [sources]
 * @param {Object} [sources.settings] - the `assist_settings` object
 * @param {Object} [sources.local] - top-level chrome.storage.local values, for `aiMode`
 * @param {Object} [sources.visibility] - the `ui_visibility` block
 * @param {Object[]} [sources.tools] - defaults to the whole registry
 * @returns {Object}
 */
export function createFlatModel(sources = {}) {
  let state = { ...sources };
  // null means "showing everything". A Set means "filtering", and holds the ids captured when the
  // filter was pressed — not a live query.
  let snapshot = null;
  // What the student has typed in the search field. Live, unlike the snapshot above — rule 4.
  let queryText = '';

  /**
   * Every tool the student has not hidden, in registry order.
   *
   * `isOn` may be supplied to answer "is this switched on?" from somewhere other than the settings
   * object — the popup passes one that reads the live control, so a row can never disagree with
   * the switch it mirrors, whatever order a handler happens to write storage in.
   */
  function rows() {
    const list = Array.isArray(state.tools) ? state.tools : TOOLS;
    const states = readToolStates({ ...state, tools: list }).filter(entry => entry.visible);

    if (typeof state.isOn !== 'function') {
      return states.map(entry => ({
        tool: entry.tool,
        on: entry.on,
        available: entry.available,
        value: entry.value,
      }));
    }

    // `isOn` answers from the live control, which is the truest answer there is — but only for a
    // tool that HAS one. AI Assist has no checkbox, so it answers `undefined`, and reading that as
    // "off" had the row claim AI was off whatever mode the student was in. Where the live read
    // cannot answer, the settings are still the answer.
    const onById = new Map(
      states.map(entry => {
        const live = state.isOn(entry.tool);
        return [entry.tool.id, live === undefined ? entry.on : live === true];
      })
    );
    return states.map(entry => ({
      tool: entry.tool,
      on: onById.get(entry.tool.id),
      // A support depending on one that is not on screen stays available: there is nothing here
      // saying otherwise, and greying it out on a guess would be worse than leaving it alone.
      available: !entry.tool.dependsOn || onById.get(entry.tool.dependsOn) !== false,
      value: entry.value,
    }));
  }

  /**
   * On, and able to do something about it. A dependent stored as on while its parent is off is
   * inert, and it is drawn inside the parent, so treating it as in use would have the filter
   * capture a row it has no way to show.
   *
   * @param {FlatRow} row
   * @returns {boolean}
   */
  function inUse(row) {
    return row.on === true && row.available !== false;
  }

  /** The rows a view draws at the top level: everything not nested inside another support. */
  function topLevel(list) {
    return list.filter(row => !row.tool.dependsOn);
  }

  /** Whether there is a query narrowing the list. */
  function searching() {
    return queryText.trim() !== '';
  }

  /**
   * Narrow a list of rows to the ones the query is asking for.
   *
   * Nesting makes this run BOTH WAYS, and the direction that is easy to forget is the second one:
   *
   *   - a matching DEPENDENT brings its parent, because Highlight While Reading is drawn inside Read
   *     Aloud and returning the child alone would leave the view nowhere to put it;
   *   - a matching PARENT brings what it holds, because the nested group is built from `childRowsOf`
   *     alone — so "read aloud" matching only the parent took two supports out of the popup with
   *     nothing on screen saying where they had gone.
   *
   * Expansion follows the query's own hits, never the rows added by it: a parent pulled in by one of
   * its children must not then pull in the other, or "karaoke" would answer with Word by Word too.
   *
   * And what comes back is only what a view can draw. A dependent whose parent is off is inert and
   * is drawn nowhere, so counting it would have the line say "2 supports match" over one row — the
   * same mistake the filter guards against in `visibleRows`. The parent still surfaces, and its own
   * row says in words what switching it on brings back.
   *
   * @param {FlatRow[]} shown - what would be visible without a query
   * @returns {FlatRow[]}
   */
  function matching(shown) {
    const ranked = searchTools(
      queryText,
      shown.map(row => row.tool)
    );
    const hits = new Set(ranked.map(hit => hit.id));
    // Where each tool came in the ranking. The search already weighs a hit in a support's NAME
    // above one in its keywords and a keyword above the group it sits in — "read to me" scores
    // Read Aloud far above everything with "Reading" in its group — and returning the rows in
    // registry order threw all of that away. Fifteen supports came back for "read to me" with Show
    // Text Stats at the top and Read Aloud second.
    const rank = new Map(ranked.map((hit, at) => [hit.id, at]));

    const found = new Set(hits);
    shown.forEach(row => {
      if (hits.has(row.tool.id) && row.tool.dependsOn) {
        found.add(row.tool.dependsOn);
      }
      if (row.tool.dependsOn && hits.has(row.tool.dependsOn)) {
        found.add(row.tool.id);
      }
    });

    const order = new Map(shown.map((row, at) => [row.tool.id, at]));
    return shown
      .filter(row => found.has(row.tool.id) && row.available !== false)
      .sort((left, right) => {
        // A row pulled in by its parent or its child was not itself a hit, and has no rank of its
        // own; it keeps its place in registry order behind everything the query actually found.
        const a = rank.has(left.tool.id) ? rank.get(left.tool.id) : Number.MAX_SAFE_INTEGER;
        const b = rank.has(right.tool.id) ? rank.get(right.tool.id) : Number.MAX_SAFE_INTEGER;
        return a - b || order.get(left.tool.id) - order.get(right.tool.id);
      });
  }

  return {
    /** Whether the filter is on. */
    isFiltering() {
      return snapshot !== null;
    },

    /** What the student has typed, so a redraw can put it back in the field. */
    query() {
      return queryText;
    },

    /**
     * Take what the student has typed. Applied at once, not on a press — rule 4.
     * @param {string} next
     */
    setQuery(next) {
      queryText = typeof next === 'string' ? next : '';
    },

    /**
     * Turn the filter on or off. Turning it on captures what is in use right now; turning it off
     * discards the capture.
     * @returns {boolean} whether the filter is now on
     */
    toggleFilter() {
      snapshot =
        snapshot === null
          ? new Set(
              rows()
                .filter(inUse)
                .map(row => row.tool.id)
            )
          : null;
      return snapshot !== null;
    },

    /**
     * Replace the state the model reads from — after a setting changes, or on a storage event.
     * The snapshot deliberately survives: a row captured by the filter stays put until the filter
     * is pressed again.
     * @param {Object} next
     */
    update(next = {}) {
      state = { ...state, ...next };
    },

    /** Every visible tool with its state, ignoring the filter. */
    allRows: rows,

    /**
     * The rows to draw: everything, or — while filtering — only what the snapshot captured, and
     * then, while there is a query, only the ones it matches.
     *
     * The two narrow in that order so they compose: the filter answers "what am I using?" and the
     * search answers "which of those is it?". A search that ignored the filter would quietly undo
     * a press the student made a moment ago.
     *
     * @returns {FlatRow[]}
     */
    visibleRows() {
      const all = rows();
      // A captured row stays put even once it is switched off — rule 1. A captured DEPENDENT is
      // the exception, and not really an exception: it is drawn inside its parent, so once the
      // parent goes off there is nowhere for it to be, and counting it would claim a row the
      // view cannot draw.
      const shown =
        snapshot === null
          ? all
          : all.filter(row => snapshot.has(row.tool.id) && row.available !== false);
      return searching() ? matching(shown) : shown;
    },

    /**
     * The top-level rows of one group, in registry order. A dependent is not among them — it is
     * drawn inside the support it depends on, and `childRowsOf` is how the view asks for it.
     * @param {string} group
     * @returns {FlatRow[]}
     */
    rowsInGroup(group) {
      return topLevel(this.visibleRows()).filter(row => row.tool.group === group);
    },

    /**
     * The rows that belong inside one support, in registry order.
     * @param {string} toolId
     * @returns {FlatRow[]}
     */
    childRowsOf(toolId) {
      return this.visibleRows().filter(row => row.tool.dependsOn === toolId);
    },

    /**
     * The names of everything drawn inside one support, whatever its state — so a support that is
     * off can say in words what switching it on brings with it. Without that, two supports simply
     * would not be on the screen and nothing would say where they went.
     * @param {string} toolId
     * @returns {string[]}
     */
    childNamesOf(toolId) {
      return rows()
        .filter(row => row.tool.dependsOn === toolId)
        .map(row => row.tool.name);
    },

    /**
     * The groups that currently have something to show. Judged on top-level rows alone: a
     * dependent reaches the screen through its parent, so it can never be the reason a heading
     * exists, and a jump button to an empty heading is a control that does nothing.
     * @returns {string[]}
     */
    liveGroups() {
      const shown = topLevel(this.visibleRows());
      return GROUPS.filter(group => shown.some(row => row.tool.group === group));
    },

    /**
     * Counts for the line beside the filter. `hidden` is what the filter is holding back, not what
     * the student has hidden in settings — those are not shown at all and are counted nowhere.
     * @returns {{shown:number, inUse:number, total:number, hidden:number}}
     */
    counts() {
      const all = rows();
      const shown = this.visibleRows().length;
      return {
        shown,
        inUse: all.filter(inUse).length,
        total: all.length,
        hidden: all.length - shown,
      };
    },

    /**
     * The line that is always shown. It must state how much is hidden, because hiding what is off
     * also hides the way to switch anything on.
     *
     * A query takes over the line. It is the narrowing the student made most recently and the one
     * they are watching, and the count is how the result of a keystroke reaches a screen reader —
     * the field points at this line, so what it says is what gets announced.
     *
     * @returns {string}
     */
    summary() {
      const { shown, total, hidden } = this.counts();
      if (total === 0) {
        return 'No supports to show';
      }
      if (searching()) {
        if (shown === 0) {
          return 'Nothing matches';
        }
        return shown === 1 ? '1 support matches' : `${shown} supports match`;
      }
      if (snapshot === null) {
        return `All ${total} supports`;
      }
      if (shown === 0) {
        return `Nothing in use — all ${total} hidden`;
      }
      return `Showing ${shown} in use — ${hidden} hidden`;
    },

    /**
     * Every wording `summary()` can produce, for the bar to hold space for all at once.
     *
     * Pressing the filter rewrites the line, and a line sized to what it currently says changes
     * size when it changes wording — which shoved the rest of the bar sideways and, once the
     * longer wording wrapped, pushed the list down too. The bar draws all of these invisibly so
     * its size is settled by the longest, and the press only changes which one shows.
     *
     * The counts are the total in every slot rather than the live figures: the live figures move
     * as supports are switched, and a slot wide enough for the total is wide enough for any of
     * them. Built here from the same sentences as `summary()`, so the two cannot drift apart.
     *
     * @returns {string[]}
     */
    summaryVariants() {
      const { total } = this.counts();
      if (total === 0) {
        return ['No supports to show'];
      }
      return [
        `All ${total} supports`,
        `Showing ${total} in use — ${total} hidden`,
        `Nothing in use — all ${total} hidden`,
        // The search rewrites the same line on every keystroke, so its wordings are reserved here
        // too. Without them the bar would resize as the student typed.
        `${total} supports match`,
        '1 support matches',
        'Nothing matches',
      ];
    },

    /**
     * The filter button's own accessible name, which has to say what pressing it will do rather
     * than what the current state is.
     * @returns {string}
     */
    filterLabel() {
      const { inUse, total } = this.counts();
      return snapshot === null
        ? `Show only the ${inUse} supports in use`
        : `Show all ${total} supports`;
    },

    /**
     * What to say when the list is empty. An empty list with no explanation reads as a broken popup.
     *
     * A query that found nothing gets a different sentence, and it teaches rather than apologises:
     * the search is for describing a problem, so the examples show that being done. "Dyslexia Mode"
     * as an example would undo the whole point of the field.
     *
     * @returns {string}
     */
    emptyMessage() {
      if (searching()) {
        return 'Nothing matches that. Try describing what you want to do — “read to me”, or “can’t focus”.';
      }
      return 'Nothing is switched on yet. Choose “Show all” to see everything you can turn on.';
    },
  };
}
