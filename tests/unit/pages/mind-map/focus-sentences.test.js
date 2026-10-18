/**
 * The words focus mode says.
 *
 * Graded here rather than through the page, because these are the sentences a student who cannot see
 * the canvas has instead of the canvas: what they are looking at, how to get back, and — the one a
 * view can otherwise hide — that a key they pressed did something they cannot see.
 */

import {
  FOCUS_IS_THE_WHOLE_MAP,
  OUTSIDE_BRANCH_NOW,
  WHOLE_MAP_SHOWN,
  branchGoneSentence,
  findCountSentence,
  focusedSentence,
  inThisBranchSuffix,
  keptOutsideBranchSentence,
  leftBranchSentence,
  outsideBranchSentence,
  selectionShrunkSentence,
} from '../../../../src/pages/mind-map/focus-sentences.js';
import { SELECT_A_NODE_FIRST } from '../../../../src/pages/mind-map/node-edits.js';
import { branchView } from '../../../../src/features/mindMap/core/branch-view.js';
import { createMap } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild } from '../../../../src/features/mindMap/core/map-ops.js';

describe('entering and leaving', () => {
  it('names the branch, counts it, and says the way out', () => {
    expect(focusedSentence('Argument 2', 12)).toBe(
      "Focused on 'Argument 2': 12 nodes. Press Escape to see the whole map."
    );
    expect(focusedSentence('Evidence', 1)).toBe(
      "Focused on 'Evidence': 1 node. Press Escape to see the whole map."
    );
  });

  it('never quotes a node that has no name yet', () => {
    expect(focusedSentence('   ', 3)).toBe(
      "Focused on '(untitled)': 3 nodes. Press Escape to see the whole map."
    );
  });

  it('says what is on screen when focus mode is left', () => {
    expect(WHOLE_MAP_SHOWN).toBe('Showing the whole map.');
  });

  it('says why the toolbar cannot act, in words', () => {
    // One home for the one sentence every control that needs a node says.
    expect(SELECT_A_NODE_FIRST).toBe('Select a node first.');
    expect(FOCUS_IS_THE_WHOLE_MAP).toBe(
      'Focusing the centre would show the whole map, which is what you are looking at.'
    );
  });

  it('says what entering a branch did to a selection that was wider than it', () => {
    expect(selectionShrunkSentence(3, 1)).toBe('3 nodes were selected. 1 is in this branch.');
    expect(selectionShrunkSentence(5, 2)).toBe('5 nodes were selected. 2 are in this branch.');
  });
});

describe('a branch the map has lost', () => {
  it('says the branch has gone and that this is the whole map', () => {
    expect(branchGoneSentence('Argument 2')).toBe(
      "'Argument 2' is no longer here, so this is the whole map again."
    );
  });
});

describe('a node that has left the branch', () => {
  it('names where an outdent put it', () => {
    expect(leftBranchSentence({ count: 1, text: 'Point', targetText: 'Argument 2', after: true })).toBe(
      "Moved 'Point' out of this branch, after 'Argument 2'."
    );
  });

  it('names the new parent when it did not land beside the branch', () => {
    expect(leftBranchSentence({ count: 1, text: 'Point', targetText: 'Body', after: false })).toBe(
      "Moved 'Point' out of this branch, under 'Body'."
    );
  });

  it('counts instead of naming when several went', () => {
    expect(leftBranchSentence({ count: 3, text: 'Point', targetText: 'Body', after: false })).toBe(
      "Moved 3 nodes out of this branch, under 'Body'."
    );
  });
});

describe('a change the student cannot see', () => {
  it('says that undo and redo did something outside the branch', () => {
    expect(outsideBranchSentence(true)).toBe('Undone: a change outside this branch.');
    expect(outsideBranchSentence(false)).toBe('Redone: a change outside this branch.');
  });
});

describe('the find count', () => {
  it('counts the whole map as it always did', () => {
    expect(findCountSentence({ term: 'evi', here: 1, elsewhere: 0, branch: false })).toBe(
      '1 match for "evi". Press Enter to go to it.'
    );
    expect(findCountSentence({ term: 'ce', here: 3, elsewhere: 0, branch: false })).toBe(
      '3 matches for "ce". Press Enter to go to the first.'
    );
    expect(findCountSentence({ term: 'zzz', here: 0, elsewhere: 0, branch: false })).toBe(
      'No node matches "zzz".'
    );
  });

  it('says the count is of this branch, and how many are outside it', () => {
    expect(findCountSentence({ term: 'evi', here: 3, elsewhere: 2, branch: true })).toBe(
      '3 matches for "evi" in this branch. Press Enter to go to the first. 2 more are outside it: ' +
        'press Escape to see the whole map.'
    );
    expect(findCountSentence({ term: 'evi', here: 3, elsewhere: 0, branch: true })).toBe(
      '3 matches for "evi" in this branch. Press Enter to go to the first.'
    );
  });

  it('offers the rest of the map when the branch holds no match at all', () => {
    expect(findCountSentence({ term: 'sources', here: 0, elsewhere: 1, branch: true })).toBe(
      'No node in this branch matches "sources". 1 more is outside it: press Escape to see the ' +
        'whole map.'
    );
    expect(findCountSentence({ term: 'zzz', here: 0, elsewhere: 0, branch: true })).toBe(
      'No node in this branch matches "zzz".'
    );
  });
});

describe('the tools that work from the selection outwards', () => {
  /** A map with one branch, so a view of it can be derived. */
  function sample() {
    let map = createMap({ id: 'm1', title: 'Essay', rootId: 'root', rootText: 'Essay' });
    map = addChild(map, { parentId: 'root', node: { id: 'body', text: 'Body' } });
    return map;
  }

  it('say the branch when that is all they cover, and nothing when it is the whole map', () => {
    const map = sample();

    expect(inThisBranchSuffix(map)).toBe('');
    expect(inThisBranchSuffix(branchView(map, 'body'))).toBe(', in this branch');
  });
});

describe('the canvas field when the node leaves the branch', () => {
  it('says the name was kept, not that the node was removed', () => {
    expect(keptOutsideBranchSentence('Point')).toBe(
      "Kept 'Point'. It is outside this branch now."
    );
    expect(keptOutsideBranchSentence('  ')).toBe(
      "Kept '(untitled)'. It is outside this branch now."
    );
    expect(OUTSIDE_BRANCH_NOW).toBe('The node you were naming is outside this branch now.');
  });
});
