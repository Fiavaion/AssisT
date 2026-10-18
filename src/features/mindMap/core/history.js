/**
 * Undo history for one map.
 *
 * ADR 0001 makes the outline and the canvas two views of one model, so undo has to live under both
 * rather than in either. Everything an editing surface does goes through `apply`, and both panes
 * re-render from the same `subscribe` callback — there is no second state to keep in step.
 *
 * The stack holds whole maps rather than inverse operations. Ops share structure, so a snapshot
 * costs a few objects, and restoring one cannot drift the way a hand-written inverse can.
 */

import { MindMapError } from './map-model.js';
import {
  addChild,
  addLink,
  addSibling,
  indent,
  moveDown,
  moveNode,
  moveNodes,
  moveUp,
  outdent,
  removeLink,
  removeNode,
  setCitation,
  setColour,
  setDone,
  setNotes,
  setSource,
  setSymbol,
  setText,
  setTitle,
  toggleCollapsed,
} from './map-ops.js';

/**
 * The operations `apply` will run by name. Listed rather than taken from the module's exports, so
 * that a helper such as `walk` can never be applied as though it returned a map.
 */
const OPS = {
  addChild,
  addLink,
  addSibling,
  indent,
  moveDown,
  moveNode,
  moveNodes,
  moveUp,
  outdent,
  removeLink,
  removeNode,
  setCitation,
  setColour,
  setDone,
  setNotes,
  setSource,
  setSymbol,
  setText,
  setTitle,
  toggleCollapsed,
};

/** Typing produces one op per keystroke; anything closer together than this is one undo step. */
const COALESCE_MS = 800;

/** Entries kept before the oldest is forgotten. */
const MAX_ENTRIES = 200;

/**
 * Create a history over a starting map.
 *
 * @param {Object} map - the map as loaded.
 * @param {Object} [options]
 * @param {() => number} [options.now] - clock in epoch ms; injected so tests drive coalescing
 *   without sleeping, and so core never reads the real clock.
 * @param {number} [options.limit=200] - entries kept.
 * @param {number} [options.coalesceMs=800] - window in which consecutive setText on one node merge.
 * @returns {{
 *   apply: (op: string|Function, args: Object, options?: {mark?: symbol}) => Object,
 *   applyBatch: (steps: Array<{op: string|Function, args: Object}>,
 *     options?: {name?: string, mark?: symbol}) => Object,
 *   undo: () => Object, redo: () => Object, current: () => Object,
 *   canUndo: () => boolean, canRedo: () => boolean,
 *   mark: () => symbol, rewindTo: (mark: symbol, options?: {name?: string}) => boolean,
 *   squashSince: (mark: symbol, options?: {name?: string}) => boolean,
 *   subscribe: (listener: (map: Object, opName: string) => void) => () => void
 * }}
 */
export function createHistory(map, options = {}) {
  const { now = () => 0, limit = MAX_ENTRIES, coalesceMs = COALESCE_MS } = options;

  /** Each entry is the map as it stood after that step; entry 0 is the map as loaded. */
  const entries = [{ map, opName: null, targetId: null, at: now() }];
  let index = 0;
  const listeners = new Set();

  // Both panes render from this one callback, so a listener that throws on a node it cannot draw
  // used to stop the other pane redrawing for that edit, undo or redo — the editor simply looked
  // frozen, with nothing in the console. Each listener now fails alone, and says so. A copy, so a
  // listener that unsubscribes itself while being called cannot cut the round short.
  const announce = opName => {
    for (const listener of [...listeners]) {
      try {
        listener(entries[index].map, opName);
      } catch (error) {
        console.error(`[mind map history] subscriber failed on ${opName}:`, error);
      }
    }
  };

  /**
   * Note that a step is being recorded under a mark. The marked entry remembers that its owner
   * stamps its steps, which is what lets `rewindTo` tell that owner's steps from anyone else's.
   *
   * @param {*} mark - from the caller's options; anything but a symbol is no mark at all.
   * @returns {symbol|null} what to stamp the new entry with.
   */
  const claim = mark => {
    if (typeof mark !== 'symbol') {
      return null;
    }
    const owner = entries.find(entry => entry.marks && entry.marks.has(mark));
    if (owner) {
      owner.marks.set(mark, true);
    }
    return mark;
  };

  const resolve = op => {
    if (typeof op === 'function') {
      return op;
    }
    const found = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
    if (typeof found !== 'function') {
      throw new MindMapError('UNKNOWN_OP', `No map operation named ${String(op)}.`);
    }
    return found;
  };

  return {
    /**
     * Run an operation and record it.
     *
     * @param {string|Function} op - a name exported by map-ops, or the function itself.
     * @param {Object} args - the operation's argument object.
     * @param {Object} [options]
     * @param {symbol} [options.mark] - a mark from `mark()` that this step belongs to: work its
     *   caller may yet abandon with `rewindTo`.
     * @returns {Object} the map after the operation.
     */
    apply(op, args, options = {}) {
      const run = resolve(op);
      const opName = typeof op === 'string' ? op : op.name;
      const next = run(entries[index].map, args);

      // An op that changed nothing (Tab at the top of a list, an edit that retyped the same word)
      // must not cost the student an undo step.
      if (next === entries[index].map) {
        return next;
      }

      const at = now();
      const under = claim(options.mark);
      const previous = entries[index];
      const targetId = args && typeof args.id === 'string' ? args.id : null;
      const coalesces =
        index > 0 &&
        opName === 'setText' &&
        previous.opName === 'setText' &&
        previous.targetId === targetId &&
        targetId !== null &&
        at - previous.at <= coalesceMs &&
        // Never into an entry somebody has taken a mark at. A mark names the state a caller means to
        // be able to come back to; coalescing into that entry moves the state out from under it, and
        // `squashSince` then finds its mark ON the entry the student is standing on and refuses —
        // which left a half-finished edit on the stack as two steps instead of one.
        previous.marks === undefined;

      // Either way the future is gone: typing after an undo replaces what redo was holding, and a
      // coalesced keystroke is still a keystroke that happened instead of it.
      entries.length = index + 1;

      if (coalesces) {
        // Replaced rather than amended, so everything the stack files on an entry is carried over.
        // `under` is deliberately the NEW step's owner: a keystroke from another pane coalescing into
        // this entry makes the entry theirs as much as anyone's, which is what stops it being folded
        // away under somebody else's name.
        entries[index] = { ...previous, map: next, opName, targetId, at, under };
      } else {
        entries.push({ map: next, opName, targetId, at, under });
        index += 1;
        if (entries.length > limit + 1) {
          entries.splice(0, entries.length - (limit + 1));
          index = entries.length - 1;
        }
      }

      announce(opName);
      return next;
    },

    /**
     * Run several operations and record them as ONE undo step.
     *
     * A generated tree arrives as dozens of `addChild` ops. Recording each of them would leave a
     * student pressing Ctrl+Z forty times to get rid of something they never asked for, so the
     * whole tree has to come and go in one press. The stack holds whole maps, so a batch is one
     * snapshot: nothing about undo changes except how many entries the work costs.
     *
     * Every step runs against the map the previous step returned, and the entry is only pushed once
     * they all succeed — a step that throws leaves the stack exactly as it was.
     *
     * @param {Array<{op: string|Function, args: Object}>} steps
     * @param {Object} [options]
     * @param {string} [options.name='batch'] - what subscribers are told changed.
     * @param {symbol} [options.mark] - as for `apply`.
     * @returns {Object} the map after every step.
     */
    applyBatch(steps, { name = 'batch', mark } = {}) {
      if (!Array.isArray(steps)) {
        throw new MindMapError('BAD_BATCH', 'applyBatch wants a list of steps.');
      }

      const before = entries[index].map;
      let next = before;
      for (const step of steps) {
        next = resolve(step && step.op)(next, step && step.args);
      }

      // A batch that changed nothing must not cost the student an undo step, exactly as a single
      // op that changed nothing does not.
      if (next === before) {
        return next;
      }

      entries.length = index + 1;
      entries.push({ map: next, opName: name, targetId: null, at: now(), under: claim(mark) });
      index += 1;
      if (entries.length > limit + 1) {
        entries.splice(0, entries.length - (limit + 1));
        index = entries.length - 1;
      }

      announce(name);
      return next;
    },

    /** @returns {Object} the map one step back, or the current map when there is nothing to undo. */
    undo() {
      if (index > 0) {
        index -= 1;
        announce('undo');
      }
      return entries[index].map;
    },

    /** @returns {Object} the map one step forward, or the current map when there is no redo. */
    redo() {
      if (index < entries.length - 1) {
        index += 1;
        announce('redo');
      }
      return entries[index].map;
    },

    /** @returns {Object} the map as it stands. */
    current() {
      return entries[index].map;
    },

    /** @returns {boolean} */
    canUndo() {
      return index > 0;
    },

    /** @returns {boolean} */
    canRedo() {
      return index < entries.length - 1;
    },

    /**
     * Remember where the stack stands now, so work that is later abandoned can be taken back off it.
     *
     * Every call returns a mark of its own, even for the same entry, so two panes that start work
     * at the same moment cannot rewind each other.
     *
     * @returns {symbol} a token for the current entry, good for `rewindTo` and for the `mark`
     *   option of `apply` and `applyBatch`, and nothing else.
     */
    mark() {
      const entry = entries[index];
      if (!entry.marks) {
        entry.marks = new Map();
      }
      const mark = Symbol('history mark');
      // False until a step is applied under it; see `claim`.
      entry.marks.set(mark, false);
      return mark;
    },

    /**
     * Go back to a marked entry and forget everything after it.
     *
     * For an edit the student abandoned — a new node they never named. `undo` would leave the
     * abandoned work one Ctrl+Y away, and an op that reverses it would leave it one Ctrl+Z away;
     * this leaves the stack as though the work had never been started.
     *
     * The mark is refused, and nothing changes, when its entry is no longer behind the student: it
     * fell off the far end of the stack, coalesced typing wrote over it, or an undo has since gone
     * back past it. The caller then has to do the honest thing instead, which is an ordinary op.
     *
     * It is refused as well, and nothing changes, whenever an entry after the marked one belongs
     * to somebody else. Rewinding another pane's half-named node is not recoverable by any key the
     * student has, so this holds whether or not this mark was ever stamped:
     *  - a caller that applies its steps under the mark (`apply(op, args, { mark })`) owns the
     *    entries carrying that mark and no others, so any entry applied without it, or under
     *    another mark, refuses the rewind — another pane's op or batch, wherever in the run it
     *    falls, or another pane's typing that coalesced into one of this caller's entries. Such a
     *    caller is also refused when the student does not stand on the newest entry, which means
     *    an undo happened in between and a redo is still owed to whoever made it;
     *  - a caller that has stamped nothing owns only steps nobody claimed, so any entry applied
     *    under a mark refuses it. Two panes can take a mark at the same entry, and the one that
     *    has written nothing must not be able to throw away the one that has.
     *
     * @param {symbol} mark - from `mark()`.
     * @param {Object} [options]
     * @param {string} [options.name='rewind'] - what subscribers are told changed.
     * @returns {boolean} true when the stack now ends on the marked entry.
     */
    rewindTo(mark, { name = 'rewind' } = {}) {
      const at =
        typeof mark === 'symbol'
          ? entries.findIndex(entry => entry.marks !== undefined && entry.marks.has(mark))
          : -1;
      if (at === -1 || at > index) {
        return false;
      }
      const stamped = entries[at].marks.get(mark);
      const after = entries.slice(at + 1);
      // A caller that has stamped a step owns only the steps carrying its own mark. One that has
      // stamped nothing owns only steps nobody claimed: a mark taken beside another caller's, at
      // the same entry, must not take that caller's work with it.
      const foreign = stamped
        ? after.some(entry => entry.under !== mark)
        : after.some(entry => Boolean(entry.under));
      if (foreign || (stamped && index !== entries.length - 1)) {
        return false;
      }
      // A dropped future changes no map, but it does change what Redo can do, and the toolbar
      // learns that the same way it learns everything else.
      const changed = at !== index || entries.length > at + 1;
      entries.length = at + 1;
      index = at;
      if (changed) {
        announce(name);
      }
      return true;
    },

    /**
     * Fold every step made under a mark into one entry, named for what the student did.
     *
     * Making a node and naming it is two operations and one thing the student did. Left as two
     * entries, the first Ctrl+Z after naming a new node takes the name off and leaves an empty box
     * on the map \u2014 the very thing every editor on this page refuses to write. This is how "add a
     * node" costs one press back and one press forward.
     *
     * Refused, changing nothing, in exactly the cases `rewindTo` refuses: the marked entry is no
     * longer behind the student, an entry after it belongs to somebody else, or a redo is still
     * owed to whoever made it. Folding another pane's step into this caller's entry would put their
     * work behind a name that is not theirs and take it away with one press of the student's undo.
     *
     * No map changes, and the stack ends where it began, so subscribers are told nothing: there is
     * nothing to redraw and nothing to save.
     *
     * @param {symbol} mark - from `mark()`.
     * @param {Object} [options]
     * @param {string} [options.name='batch'] - the name the folded entry carries.
     * @returns {boolean} true when the steps were folded.
     */
    squashSince(mark, { name = 'batch' } = {}) {
      const at =
        typeof mark === 'symbol'
          ? entries.findIndex(entry => entry.marks !== undefined && entry.marks.has(mark))
          : -1;
      // Nothing behind the student to fold to, nothing on top of it to fold, or a redo still owed.
      if (at === -1 || at >= index || index !== entries.length - 1) {
        return false;
      }
      const folded = entries.slice(at + 1);
      if (folded.some(entry => entry.under !== mark)) {
        return false;
      }
      entries.length = at + 1;
      entries.push({
        map: folded[folded.length - 1].map,
        opName: name,
        targetId: null,
        at: now(),
        under: mark,
      });
      index = at + 1;
      return true;
    },

    /**
     * @param {(map: Object, opName: string) => void} listener - called after every change, with the
     *   map as it now stands and the name of what changed ('undo' and 'redo' included).
     * @returns {() => void} unsubscribe.
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
