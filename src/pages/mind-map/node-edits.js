/**
 * The rules and the words three editors share.
 *
 * The outline's row editor, the canvas's inline editor and the inspector's Text field each had
 * their own copy of "a node needs a name", and the outline alone knew how to throw away a node an
 * edit had created. The canvas's quick-add handles made a fourth caller for both, and four copies
 * of a sentence is four chances to word it differently — so the decisions and the sentences live
 * here and the panes say them.
 *
 * Nothing here touches the DOM: it is the history and plain strings, which is what lets the same
 * rule be graded once instead of once per pane.
 *
 * @module pages/mind-map/node-edits
 */

import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { walk } from '../../features/mindMap/core/map-ops.js';

/** What every editor says about a node it made and the student never named. */
export const NEW_NODE_DISCARDED = 'New node discarded';

/** What every control says when it needs a node and has not been given one. */
export const SELECT_A_NODE_FIRST = 'Select a node first.';

/**
 * What an editor says when a step back has put the student in front of a node they were part way
 * through making. The field is open again, so it says what to do with it.
 */
export const NAMING_AGAIN =
  'Back to naming this node. Type a name, or press Escape to be rid of it.';

/**
 * The whole map behind a history, which may be more than its caller is DRAWING.
 *
 * A pane can be handed a history whose `current()` is one branch of the map, so that focusing on a
 * branch needs no pane to know focus mode exists. Anything deciding what to WRITE has to ask about
 * the map it is writing to: a node that has merely left the part on screen is still the student's
 * node, and treating it as gone leaves it on the map with no name and nobody editing it — which is
 * exactly what the seeded key run caught. A plain history is its own whole map.
 *
 * @param {Object} history - a `createHistory` instance, or a view over one.
 * @returns {Object}
 */
export const wholeMapOf = history =>
  typeof history.real === 'function' ? history.real() : history.current();

/** "1 node" / "3 nodes" — said often enough that one spelling of it is worth having. */
const nodeWord = count => (count === 1 ? '1 node' : `${count} nodes`);

/** "1 child" / "2 children", as the outline says it. */
const childWord = count => (count === 1 ? '1 child' : `${count} children`);

/**
 * The map's own top node cannot be deleted or moved, and every refusal has to name the thing the
 * student is actually looking at.
 *
 * Focus mode (slice E2) shows one branch as a map of its own, and inside it the top of that branch
 * is the node these rules fall on. Told "the centre of the map cannot be deleted" about a node they
 * can see is not the centre, a student has been told something false and given nothing to do about
 * it — so each of these takes whether the map in hand is a branch (`isBranchView`) and says the way
 * out. The whole-map wording is unchanged.
 */

/** What a set that held the top node is told about it: it is never deleted and never moves. */
export const centreStaysSentence = (branch = false) =>
  branch ? 'The top of this branch stays where it is.' : 'The centre stays where it is.';

/** What every delete says when the top node is the whole of what was asked for. */
export const centreNotDeletedSentence = (branch = false) =>
  branch
    ? 'The top of this branch cannot be deleted from inside it. Press Escape to see the whole map.'
    : 'The centre of the map cannot be deleted.';

/** What every move says when the top node is the whole of what was asked for. */
export const centreNotMovedSentence = (branch = false) =>
  branch
    ? 'The top of this branch cannot be moved from inside it. Press Escape to see the whole map.'
    : 'The centre of the map cannot be moved.';

/** What the toolbar says when a new sibling is asked for beside a map's own top node. */
export const noSiblingsSentence = (branch = false) =>
  branch
    ? 'The top of this branch has no siblings here, so add a child instead.'
    : 'The centre of the map has no siblings, so add a child instead.';

/**
 * What Ctrl+A says when it has taken everything on screen.
 *
 * "The whole outline" is only true of the whole map; in focus mode what it took is the branch.
 *
 * @param {number} count
 * @param {boolean} [branch]
 * @returns {string}
 */
export const selectedEverythingSentence = (count, branch = false) =>
  `${nodeWord(count)} selected: the whole ${branch ? 'branch' : 'outline'}.`;

/**
 * A node as a sentence can name it.
 *
 * A node has no name between being made and being named, and quoting that as `''` says nothing to
 * anybody: the live region reads "1 node selected: ." and a screen reader reads a pair of quotes.
 * Every sentence that names a node goes through here.
 *
 * @param {string} text - the node's text.
 * @returns {string}
 */
export const nameOf = text =>
  typeof text === 'string' && text.trim() !== '' ? text : '(untitled)';

/**
 * What an act on one node says about the set it just dropped.
 *
 * Adding a node and renaming one are about the node the student is standing on, so they leave the
 * rest of a selection behind. Said, because a set going quiet is the kind of change a student who
 * cannot see four marked rows has no other way to notice.
 *
 * @param {number} count - how many OTHER nodes were selected.
 * @returns {string}
 */
export const droppedSetSentence = count =>
  `The other ${count === 1 ? 'node is' : `${count} nodes are`} no longer selected.`;

/**
 * What every editor says when an emptied name is put back.
 *
 * @param {string} text - the name the node keeps.
 * @returns {string}
 */
export const keptNameSentence = text => `A node needs a name. Kept '${text}'.`;

/**
 * What every editor says when the student cancels the naming of a node they have just made and
 * already given a name to. The node stays \u2014 they changed their mind about the naming, not about
 * the node \u2014 so the sentence says how to be rid of it after all.
 *
 * @param {string} text - the name that was kept.
 * @returns {string}
 */
export const keptNewNodeSentence = text => `Kept '${text}'. Press Delete to remove it.`;

/**
 * What every move refuses with when the student aims a node at its own branch.
 *
 * @param {string} text - the node that cannot go there.
 * @returns {string}
 */
export const cannotMoveIntoOwnBranchSentence = text => `'${text}' cannot move into its own branch.`;

/**
 * What a move says when it would put a node exactly where it already is.
 *
 * Nothing changed, which is precisely why it has to be said: the student aimed at a gap between two
 * siblings and let go, and silence is indistinguishable from a move they cannot see.
 *
 * @param {string} text - the node that stayed put.
 * @returns {string}
 */
export const alreadyThereSentence = text => `'${text}' is already there.`;

/** What a move says when it was let go where nothing can land, and so did nothing at all. */
export const NOTHING_MOVED = 'Nothing moved.';

/**
 * Throw away a node this edit created, along with the step that created it.
 *
 * Rewinding the history rather than applying `removeNode` is the point: a removal would be an undo
 * step of its own, and the first Ctrl+Z after it would put the empty node the student had just
 * discarded straight back on the map. The rewind forgets the creation and the typing on top of it
 * altogether.
 *
 * That is only honest while the creation is still on the stack with nothing but this edit's own
 * work above it. Once it is not — the stack is finite, and another pane may have written meanwhile —
 * there are two things left to try, in this order.
 *
 * The node may already be gone: the student pressed the toolbar's Undo with the mouse, which never
 * takes the caret out of the field, so the undo landed while the editor was still open. There is
 * nothing to discard, and `removeNode` would throw — which is how this reached the console with the
 * pane's own tidying up left half done.
 *
 * Or the student has undone part of this edit — the toolbar's Undo, pressed with the mouse, which
 * never takes the caret out of the field. The mark is then no longer the newest thing on the stack,
 * and the rewind above refuses rather than drop a step forward somebody may be owed. Removing the
 * node UNDER THE MARK is what makes that possible: it puts the student back on the newest entry and
 * the removal becomes this edit's own work, so the second rewind forgets the creation, the typing and
 * the removal together. Nothing is left on the map and nothing on the stack — which matters, because
 * a plain removal leaves the nameless node one Ctrl+Z away, and a bare step backwards leaves it one
 * Ctrl+Y away.
 *
 * Only when somebody ELSE has written in between does the removal stay: an ordinary step the student
 * can undo, which is honest because it is the only thing left that does not take their work with it.
 *
 * @param {Object} history - a `createHistory` instance.
 * @param {{id: string, mark: symbol}} edit - the edit record the creation was made under.
 * @returns {boolean} true when the node is gone with nothing about it left on the stack, false when
 *   it was removed as an ordinary step the student can undo.
 */
export function discardCreatedNode(history, { id, mark }) {
  if (!hasNode(wholeMapOf(history), id)) {
    return true;
  }
  if (history.rewindTo(mark, { name: 'discardNew' })) {
    return true;
  }
  history.apply('removeNode', { id }, { mark });
  return history.rewindTo(mark, { name: 'discardNew' });
}

/**
 * Where a block of nodes lands when it is put beside a named sibling.
 *
 * Counted in the list the block is moving *into*, which is the list without ANY of the moving nodes:
 * a node already among those siblings is lifted out before it is put back, and `moveNodes` splices
 * into that same list. One function, so the canvas's drop zones and the inspector's
 * "before / after" choice cannot drift a place apart, whether one node is moving or five.
 *
 * @param {Object} map
 * @param {Object} args
 * @param {string[]} args.ids - the nodes being moved.
 * @param {string} args.parentId - the parent they are moving into.
 * @param {string} args.siblingId - a child of that parent to sit beside.
 * @param {boolean} args.after - true for the place after the sibling, false for the place before it.
 * @returns {number} the index to hand `moveNodes`.
 */
export function siblingIndexForBlock(map, { ids, parentId, siblingId, after }) {
  const moving = new Set(ids);
  const children = nodeAt(map, parentId).children.filter(childId => !moving.has(childId));
  const at = children.indexOf(siblingId);
  return after ? at + 1 : at;
}

/**
 * The nodes a structural act on a selection really applies to.
 *
 * A student who has selected a heading and two of its points has said "this branch" twice over. The
 * ancestor carries what is under it — deleting it deletes them, moving it moves them — so a
 * descendant of anything else in the set is dropped, and the act runs once per branch instead of
 * once per selected node. Attribute acts (colour, symbol, done, collapse) do NOT use this: those
 * change each node in its own right.
 *
 * Handed back in outline order, whatever order the set was built up in, so a block keeps the order
 * the student reads it in. Collapsed branches are walked: a node hidden under a fold is still on the
 * map and still selected.
 *
 * @param {Object} map
 * @param {string[]} ids - the selection, in any order; ids the map no longer holds are stepped over.
 * @returns {string[]}
 */
export function effectiveSet(map, ids) {
  const chosen = new Set(ids.filter(id => hasNode(map, id)));
  const kept = [];
  walk(map, node => {
    if (!chosen.has(node.id)) {
      return;
    }
    let parentId = node.parentId;
    while (parentId) {
      if (chosen.has(parentId)) {
        return;
      }
      parentId = nodeAt(map, parentId)?.parentId || null;
    }
    kept.push(node.id);
  });
  return kept;
}

/**
 * The runs of contiguous siblings in an effective set, in outline order.
 *
 * What makes indent, outdent and Alt+Up mean something for several nodes at once. Five points under
 * one heading are one thing to move, and moving them one at a time reverses them or leaves them
 * interleaved with the siblings they were meant to pass. A set that is not contiguous — or spread
 * over several parents — is simply several runs, each moved on its own, which is what every outliner
 * does and the only rule that stays predictable.
 *
 * Two selected siblings are only in the same run when their indices are adjacent, so a run can never
 * straddle an unselected node. Nothing can fall between them in outline order either: anything that
 * did would be inside the first one's own branch, and `effectiveSet` has already dropped that.
 *
 * @param {Object} map
 * @param {string[]} ordered - an effective set in outline order, with the root taken out.
 * @returns {Array<{parentId: string, from: number, to: number, ids: string[]}>}
 */
function runsOf(map, ordered) {
  const runs = [];
  for (const id of ordered) {
    const parentId = nodeAt(map, id).parentId;
    const at = nodeAt(map, parentId).children.indexOf(id);
    const last = runs[runs.length - 1];
    if (last && last.parentId === parentId && last.to === at - 1) {
      last.ids.push(id);
      last.to = at;
      continue;
    }
    runs.push({ parentId, from: at, to: at, ids: [id] });
  }
  return runs;
}

/**
 * What each act does to one run, or null when that run cannot move.
 *
 * @param {Object} map
 * @param {'indent'|'outdent'|'up'|'down'} act
 * @param {{parentId: string, from: number, to: number, ids: string[]}} run
 * @returns {Array<{op: string, args: Object}>|null}
 */
function runSteps(map, act, run) {
  const parent = nodeAt(map, run.parentId);
  const siblings = parent.children;

  if (act === 'indent') {
    if (run.from === 0) {
      return null;
    }
    const above = nodeAt(map, siblings[run.from - 1]);
    const steps = [
      {
        op: 'moveNodes',
        args: { ids: run.ids, newParentId: above.id, index: above.children.length },
      },
    ];
    // Indenting under a shut branch would take the rows out of sight, so the branch opens with the
    // move, as one step — exactly as it does for one node.
    if (above.collapsed) {
      steps.push({ op: 'toggleCollapsed', args: { id: above.id } });
    }
    return steps;
  }

  if (act === 'outdent') {
    if (parent.id === map.rootId) {
      return null;
    }
    const grandparent = nodeAt(map, parent.parentId);
    return [
      {
        op: 'moveNodes',
        args: {
          ids: run.ids,
          newParentId: grandparent.id,
          index: grandparent.children.indexOf(parent.id) + 1,
        },
      },
    ];
  }

  if (act === 'up') {
    if (run.from === 0) {
      return null;
    }
    // Counted in the list without the run, where every place before it keeps its number.
    return [
      { op: 'moveNodes', args: { ids: run.ids, newParentId: parent.id, index: run.from - 1 } },
    ];
  }

  if (run.to === siblings.length - 1) {
    return null;
  }
  return [{ op: 'moveNodes', args: { ids: run.ids, newParentId: parent.id, index: run.from + 1 } }];
}

/**
 * Every run of an act taken together: the steps for one undo entry, and what to say about them.
 *
 * Outdent alone is walked in reverse. Two runs out of the same parent are both aimed at the place
 * just after that parent, so doing the first one first would put the second one in front of it;
 * placing the last run first leaves the earlier ones landing ahead of it, in the order the student
 * reads them. Every other act places each run among its own siblings, at or beside where it already
 * was, and runs are separated by at least one node that is not moving — so no run can shift the
 * place another was counted against, and the order they are walked in makes no difference.
 *
 * The centre is never in the result. It cannot be moved, and it is not counted as a node that
 * stayed either — the caller says the centre stays in its own words.
 *
 * @param {Object} map
 * @param {Object} args
 * @param {string[]} args.ids - the selection, in any order.
 * @param {'indent'|'outdent'|'up'|'down'} args.act
 * @returns {{steps: Array<{op: string, args: Object}>, moved: number, stayed: number}} no steps at
 *   all when nothing can move, so `applyBatch` records no undo entry.
 */
export function blockMoveSteps(map, { ids, act }) {
  // The centre goes first and the effective set is taken of what is left, so a student who selected
  // the whole outline still moves its branches rather than being told the centre cannot move.
  const ordered = effectiveSet(
    map,
    ids.filter(id => id !== map.rootId)
  );
  const runs = runsOf(map, ordered);
  const order = act === 'outdent' ? [...runs].reverse() : runs;

  const steps = [];
  let moved = 0;
  let stayed = 0;
  for (const run of order) {
    const runsSteps = runSteps(map, act, run);
    if (runsSteps === null) {
      stayed += run.ids.length;
      continue;
    }
    steps.push(...runsSteps);
    moved += run.ids.length;
  }
  return { steps, moved, stayed };
}

/**
 * What a move says it did.
 *
 * The same sentence for a drag, for "Move to…" and for anything later that moves a node, because a
 * student who has learnt what one of them says has learnt what all of them say.
 *
 * @param {Object} args
 * @param {string} args.text - the node that moved.
 * @param {'into'|'before'|'after'} args.where
 * @param {string} args.targetText - the node it went into, or the sibling it went beside.
 * @param {string|null} [args.expanded] - the branch the move had to open, when it opened one.
 * @returns {string}
 */
export function movedSentence({ text, where, targetText, expanded = null }) {
  return movedPhrase(`'${nameOf(text)}'`, { where, targetText, expanded });
}

/**
 * What a move of several nodes says it did — the same sentence, counting instead of naming.
 *
 * @param {Object} args
 * @param {number} args.count
 * @param {'into'|'before'|'after'} args.where
 * @param {string} args.targetText
 * @param {string|null} [args.expanded]
 * @returns {string}
 */
export function movedNodesSentence({ count, where, targetText, expanded = null }) {
  return movedPhrase(nodeWord(count), { where, targetText, expanded });
}

const movedPhrase = (subject, { where, targetText, expanded }) => {
  const opened = !expanded
    ? ''
    : expanded === targetText
      ? ' and expanded it'
      : ` and expanded '${expanded}'`;
  return `Moved ${subject} ${where} '${nameOf(targetText)}'${opened}.`;
};

/** What each act is called once it has happened, and why a run could not make it. */
const ACT_WORDS = Object.freeze({
  indent: {
    did: count => `Indented ${nodeWord(count)}.`,
    why: one =>
      one
        ? 'there is nothing above it to move it under'
        : 'there is nothing above them to move them under',
  },
  outdent: {
    did: count => `Moved ${nodeWord(count)} out one level.`,
    why: one => (one ? 'it is already at the top level' : 'they are already at the top level'),
  },
  up: {
    did: count => `Moved ${nodeWord(count)} up.`,
    why: one => (one ? 'it is already first here' : 'they are already first here'),
  },
  down: {
    did: count => `Moved ${nodeWord(count)} down.`,
    why: one => (one ? 'it is already last here' : 'they are already last here'),
  },
});

/**
 * What an indent, an outdent or a reorder of a set says it did.
 *
 * One sentence whether or not every node could move, because two would be read as two things
 * happening. A set where nothing could move says only why, and the caller will have made no undo
 * step for it.
 *
 * @param {Object} args
 * @param {'indent'|'outdent'|'up'|'down'} args.act
 * @param {number} args.moved
 * @param {number} args.stayed
 * @param {boolean} [args.hadCentre] - true when the top node was in the selection.
 * @param {boolean} [args.branch] - true when the map in hand is one branch of a larger one, so the
 *   node that stayed is the top of that branch rather than the centre of the map.
 * @returns {string}
 */
export function reorderedSetSentence({ act, moved, stayed, hadCentre = false, branch = false }) {
  const words = ACT_WORDS[act];
  const centre = hadCentre ? ` ${centreStaysSentence(branch)}` : '';
  if (moved === 0) {
    return `Nothing moved: ${words.why(stayed === 1)}.${centre}`;
  }
  if (stayed === 0) {
    return `${words.did(moved)}${centre}`;
  }
  const kept = stayed === 1 ? '1 stayed where it was' : `${stayed} stayed where they were`;
  return `${words.did(moved)} ${kept}: ${words.why(stayed === 1)}.${centre}`;
}

/**
 * What a delete says it did: the node by name when one went, the count when several did.
 *
 * One sentence for both, because a student who has learnt what a delete of one node says has learnt
 * what a delete of four says. The centre is named whenever it was selected, whatever else went with
 * it: a student who included it is owed the fact that it is still there.
 *
 * @param {Object} args
 * @param {number} args.count - nodes the student had selected and that went.
 * @param {number} args.buried - nodes that went with them because they were inside them.
 * @param {boolean} args.hadCentre - true when the top node was in the selection and stayed.
 * @param {string|null} [args.text] - the node's name, when exactly one went.
 * @param {boolean} [args.branch] - true when the map in hand is one branch of a larger one.
 * @returns {string}
 */
export function deletedNodesSentence({ count, buried, hadCentre, text = null, branch = false }) {
  const subject = count === 1 && text !== null ? `'${nameOf(text)}'` : nodeWord(count);
  const withChildren = buried > 0 ? ` and ${childWord(buried)}` : '';
  const centre = hadCentre ? ` ${centreStaysSentence(branch)}` : '';
  return `Deleted ${subject}${withChildren}.${centre} Press Ctrl+Z to undo`;
}

/**
 * What a whole block refuses with when it is aimed at its own branch.
 *
 * @param {number} count
 * @returns {string}
 */
export const cannotMoveSetIntoOwnBranchSentence = count =>
  `${nodeWord(count)} cannot move into their own branch.`;

/**
 * @param {number} count
 * @param {boolean} done
 * @returns {string}
 */
export const markedDoneSetSentence = (count, done) =>
  `Marked ${nodeWord(count)} ${done ? 'done' : 'not done'}.`;

/**
 * @param {string|null} name - the colour's name, or null for "inherit".
 * @param {number} count
 * @returns {string}
 */
export const colourSetSentence = (name, count) =>
  `Branch colour ${name === null ? 'inherited' : name} on ${nodeWord(count)}.`;

/**
 * @param {string|null} glyph - the symbol, or null when it was cleared.
 * @param {number} count
 * @returns {string}
 */
export const symbolSetSentence = (glyph, count) =>
  `Symbol ${glyph === null ? 'cleared' : glyph} on ${nodeWord(count)}.`;

/**
 * What a collapse or an expand of a set says it did.
 *
 * A leaf has nothing to fold, so it is counted separately rather than silently left out: a student
 * who selected six nodes and folded four needs to know the other two were not ignored by mistake.
 *
 * @param {boolean} collapse - true for collapse, false for expand.
 * @param {{changed: number, childless: number}} counts
 * @returns {string}
 */
export function collapsedSetSentence(collapse, { changed, childless }) {
  const word = collapse ? 'Collapsed' : 'Expanded';
  if (changed === 0) {
    return `Nothing to ${collapse ? 'collapse' : 'expand'} here.`;
  }
  if (childless === 0) {
    return `${word} ${nodeWord(changed)}.`;
  }
  const empty =
    childless === 1
      ? '1 node has nothing inside it'
      : `${childless} nodes have nothing inside them`;
  return `${word} ${nodeWord(changed)}. ${empty}.`;
}
