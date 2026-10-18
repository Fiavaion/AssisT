/**
 * What focus mode says.
 *
 * A sibling of `node-edits.js` rather than part of it: that module is named for, and documented as,
 * the rules three EDITORS share — what happens to a node the student never named, how a block of
 * siblings moves. None of that is true of these. Focus mode changes nothing about the map; every
 * sentence here is about what the student is being SHOWN, and about the one thing a view can leave
 * them wondering — why a key they pressed appeared to do nothing.
 *
 * They live in one module for the same reason the edit sentences do: a sentence written twice is
 * written differently the second time, and a student who has learnt what one of them means has
 * learnt what all of them mean.
 *
 * Nothing here touches the DOM or the map. Every node is named through `nameOf`, so a node with no
 * name yet is never quoted as an empty pair of quotes.
 *
 * @module pages/mind-map/focus-sentences
 */

import { isBranchView } from '../../features/mindMap/core/branch-view.js';

import { nameOf } from './node-edits.js';

const nodeWord = count => (count === 1 ? '1 node' : `${count} nodes`);

/**
 * ", in this branch" when the map in hand is one branch of a larger one, and nothing otherwise.
 *
 * For the tools that work from the selection outwards — read aloud walks a subtree, study mode
 * practises one — where the news is not that focus mode exists but that the thing about to happen
 * covers less of the map than the student may think.
 *
 * @param {Object} map - the map the tool is working from.
 * @returns {string}
 */
export const inThisBranchSuffix = map => (isBranchView(map) ? ', in this branch' : '');

/** What it says when the centre is selected: a branch from the centre is the whole map. */
export const FOCUS_IS_THE_WHOLE_MAP =
  'Focusing the centre would show the whole map, which is what you are looking at.';

/**
 * What entering a branch says about the selection it had to shrink.
 *
 * Narrowing the view drops whatever was selected outside the branch — a pane cannot ring a node it
 * is not drawing. A student who had five nodes marked and now has two needs telling, or the next act
 * on "everything selected" is an act on less than they think.
 *
 * @param {number} was - how many were selected.
 * @param {number} now - how many of them are in the branch.
 * @returns {string}
 */
export const selectionShrunkSentence = (was, now) =>
  `${was} nodes were selected. ${now} ${now === 1 ? 'is' : 'are'} in this branch.`;

/** What leaving focus mode says, however it was left. */
export const WHOLE_MAP_SHOWN = 'Showing the whole map.';

/**
 * What entering focus mode says.
 *
 * The way out is part of the sentence. A student who has just lost sight of most of their map needs
 * it in the same breath as the news, and it is the one keystroke that undoes the whole change.
 *
 * @param {string} text - the node focused on.
 * @param {number} count - nodes in the branch, the focused one included, folded ones counted.
 * @returns {string}
 */
export const focusedSentence = (text, count) =>
  `Focused on '${nameOf(text)}': ${nodeWord(count)}. Press Escape to see the whole map.`;

/**
 * What it says when the branch a student was focused on is no longer on the map — an undo, an
 * import that replaced the map, a delete from another pane.
 *
 * Focus mode is left rather than moved to the nearest ancestor: the branch the student chose is gone,
 * and choosing a different one for them would be a guess they did not make.
 *
 * @param {string} text - the branch that has gone.
 * @returns {string}
 */
export const branchGoneSentence = text =>
  `'${nameOf(text)}' is no longer here, so this is the whole map again.`;

/**
 * What it says when a node the student moved has left the branch they are looking at.
 *
 * Outdenting the first level of a focused branch is a real edit and it is allowed, but the node then
 * goes somewhere the student cannot see. Saying nothing would look exactly like a delete.
 *
 * @param {Object} args
 * @param {number} args.count - nodes that left, counting only the tops of what moved.
 * @param {string} args.text - the node's name, when exactly one left.
 * @param {string} args.targetText - the node it now sits under, or the one it now sits after.
 * @param {boolean} args.after - true when it landed immediately after `targetText` among its
 *   siblings, which is where an outdent out of a branch puts it.
 * @returns {string}
 */
export function leftBranchSentence({ count, text, targetText, after }) {
  const subject = count === 1 ? `'${nameOf(text)}'` : nodeWord(count);
  const where = after ? 'after' : 'under';
  return `Moved ${subject} out of this branch, ${where} '${nameOf(targetText)}'.`;
}

/**
 * What an undo or a redo says when what it changed is outside the branch on screen.
 *
 * The whole point of it: the map really did change, the picture really did not, and a student left to
 * work that out for themselves presses Ctrl+Z again.
 *
 * @param {boolean} undone - true for undo, false for redo.
 * @returns {string}
 */
export const outsideBranchSentence = undone =>
  `${undone ? 'Undone' : 'Redone'}: a change outside this branch.`;

/**
 * What the canvas's inline editor says when the node being named has left the branch on screen.
 *
 * A move out of the branch is a real edit, and the name the student had typed is theirs: it is
 * written before the field goes, exactly as it is when a fold closes over the node. What must not
 * happen is the node being reported as removed — it is still on their map.
 *
 * @param {string} text - the name that was kept.
 * @returns {string}
 */
export const keptOutsideBranchSentence = text =>
  `Kept '${nameOf(text)}'. It is outside this branch now.`;

/** What it says when there was nothing typed to keep. */
export const OUTSIDE_BRANCH_NOW = 'The node you were naming is outside this branch now.';

/**
 * What the find box says about what it counted.
 *
 * Find searches what is on screen, so in focus mode it searches the branch and says so. Matches
 * outside the branch are counted too and named as such — it is the one thing a student needs to know
 * before concluding the word is not in their map, and Escape is how they widen the search.
 *
 * @param {Object} args
 * @param {string} args.term - what was typed.
 * @param {number} args.here - matches in what is on screen.
 * @param {number} args.elsewhere - matches on the rest of the map; 0 when the whole map is shown.
 * @param {boolean} args.branch - true when only a branch is on screen.
 * @returns {string}
 */
export function findCountSentence({ term, here, elsewhere, branch }) {
  const rest =
    elsewhere === 0
      ? ''
      : ` ${elsewhere === 1 ? '1 more is' : `${elsewhere} more are`} outside it: ` +
        'press Escape to see the whole map.';
  if (here === 0) {
    return branch
      ? `No node in this branch matches "${term}".${rest}`
      : `No node matches "${term}".`;
  }
  const what = here === 1 ? '1 match' : `${here} matches`;
  const where = branch ? ' in this branch' : '';
  return `${what} for "${term}"${where}. Press Enter to go to ${here === 1 ? 'it' : 'the first'}.${rest}`;
}
