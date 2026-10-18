/**
 * @jest-environment jsdom
 *
 * The rules three editors share.
 *
 * The outline's row editor, the canvas's inline editor and the inspector's Text field all had their
 * own copy of "a node needs a name" and of what happens to a node the student never named. One
 * copy per pane is three chances to word it differently, and the canvas's quick-add handles made a
 * fourth caller — so the sentences and the discard live here, and the panes say them.
 */

import { createMap } from '../../../../src/features/mindMap/core/map-model.js';
import {
  addChild,
  moveNodes,
  toggleCollapsed,
} from '../../../../src/features/mindMap/core/map-ops.js';
import {
  NEW_NODE_DISCARDED,
  blockMoveSteps,
  cannotMoveIntoOwnBranchSentence,
  cannotMoveSetIntoOwnBranchSentence,
  centreNotDeletedSentence,
  centreNotMovedSentence,
  centreStaysSentence,
  collapsedSetSentence,
  colourSetSentence,
  deletedNodesSentence,
  discardCreatedNode,
  droppedSetSentence,
  effectiveSet,
  keptNameSentence,
  keptNewNodeSentence,
  noSiblingsSentence,
  selectedEverythingSentence,
  markedDoneSetSentence,
  movedNodesSentence,
  movedSentence,
  nameOf,
  reorderedSetSentence,
  siblingIndexForBlock,
  symbolSetSentence,
} from '../../../../src/pages/mind-map/node-edits.js';

import { makeHistory, makeMap } from './pane-fixtures.js';

describe('the sentences every editor says', () => {
  it('names a node that has to keep the name it had', () => {
    expect(keptNameSentence('Evidence')).toBe("A node needs a name. Kept 'Evidence'.");
  });

  it('says the same thing about a discarded new node wherever it was being typed', () => {
    expect(NEW_NODE_DISCARDED).toBe('New node discarded');
  });
});

describe('the sentences every editor says, continued', () => {
  it('says what a cancelled naming kept, and how to be rid of the node after all', () => {
    expect(keptNewNodeSentence('Method')).toBe("Kept 'Method'. Press Delete to remove it.");
  });

  it('refuses a move into the node\u2019s own branch in the same voice as the moves', () => {
    expect(cannotMoveIntoOwnBranchSentence('Argument')).toBe(
      "'Argument' cannot move into its own branch."
    );
  });
});

describe('discarding a node an edit created', () => {
  it('forgets the creation rather than undoing it, so Ctrl+Z cannot resurrect it', () => {
    const history = makeHistory();
    const mark = history.mark();
    history.apply('addChild', { parentId: 'arg', node: { id: 'fresh', text: '' } }, { mark });

    expect(discardCreatedNode(history, { id: 'fresh', mark })).toBe(true);

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('does nothing, and does not throw, when the node has already gone', () => {
    const history = makeHistory();
    const mark = history.mark();
    history.apply('addChild', { parentId: 'arg', node: { id: 'fresh', text: '' } }, { mark });
    // The toolbar's Undo, pressed with the mouse: the caret never leaves the field, so the step lands
    // while the editor is still open on a node that is now gone. `removeNode` would throw here — and
    // did, leaving the pane's own tidying up half done and the error in the console.
    history.undo();
    const before = history.current();

    expect(discardCreatedNode(history, { id: 'fresh', mark })).toBe(true);

    expect(history.current()).toBe(before);
    expect(history.current().nodes.fresh).toBeUndefined();
  });

  it('forgets the creation even when the student has undone part of it', () => {
    const history = makeHistory();
    const mark = history.mark();
    history.apply('addChild', { parentId: 'arg', node: { id: 'fresh', text: '' } }, { mark });
    history.apply('setText', { id: 'fresh', text: 'Half' }, { mark });
    // Their own Undo, so the stack is no longer standing on the newest entry and a plain rewind is
    // refused rather than drop a step forward somebody may be owed.
    history.undo();

    expect(discardCreatedNode(history, { id: 'fresh', mark })).toBe(true);

    // Nothing about it left on the map, and nothing on the stack for either key to walk back into.
    expect(history.current().nodes.fresh).toBeUndefined();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('removes the node as an ordinary step when the rewind is refused', () => {
    const history = makeHistory();
    const mark = history.mark();
    history.apply('addChild', { parentId: 'arg', node: { id: 'fresh', text: '' } }, { mark });
    // Somebody else's work on top of it: the rewind would take theirs with it, so it is refused.
    history.apply('setText', { id: 'src', text: 'Reading list' });

    expect(discardCreatedNode(history, { id: 'fresh', mark })).toBe(false);

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(history.canUndo()).toBe(true);
  });
});

describe('where a node lands beside a named sibling', () => {
  const map = addChild(makeMap(), { parentId: 'arg', node: { id: 'third', text: 'Third' } });

  it('counts positions in the list the node is moving into', () => {
    expect(
      siblingIndexForBlock(map, {
        ids: ['src'],
        parentId: 'arg',
        siblingId: 'counter',
        after: false,
      })
    ).toBe(1);
    expect(
      siblingIndexForBlock(map, {
        ids: ['src'],
        parentId: 'arg',
        siblingId: 'counter',
        after: true,
      })
    ).toBe(2);
  });

  it('counts them in the list without the node when it is already a child there', () => {
    // ['ev', 'counter', 'third']; moving 'ev' after 'counter' is index 1 of ['counter', 'third'].
    expect(
      siblingIndexForBlock(map, { ids: ['ev'], parentId: 'arg', siblingId: 'counter', after: true })
    ).toBe(1);
    expect(
      siblingIndexForBlock(map, { ids: ['ev'], parentId: 'arg', siblingId: 'third', after: false })
    ).toBe(1);
  });
});

describe('what a move says it did', () => {
  it('says which side of a sibling the node landed on', () => {
    expect(movedSentence({ text: 'Evidence', where: 'before', targetText: 'Counterpoint' })).toBe(
      "Moved 'Evidence' before 'Counterpoint'."
    );
    expect(movedSentence({ text: 'Evidence', where: 'after', targetText: 'Counterpoint' })).toBe(
      "Moved 'Evidence' after 'Counterpoint'."
    );
  });

  it('says when the node went inside another', () => {
    expect(movedSentence({ text: 'Evidence', where: 'into', targetText: 'Sources' })).toBe(
      "Moved 'Evidence' into 'Sources'."
    );
  });

  it('says that a shut branch was opened, naming it only when it is not the target', () => {
    expect(
      movedSentence({
        text: 'Evidence',
        where: 'into',
        targetText: 'Sources',
        expanded: 'Sources',
      })
    ).toBe("Moved 'Evidence' into 'Sources' and expanded it.");
    expect(
      movedSentence({
        text: 'Evidence',
        where: 'before',
        targetText: 'A book',
        expanded: 'Sources',
      })
    ).toBe("Moved 'Evidence' before 'A book' and expanded 'Sources'.");
  });
});

describe('the effective set', () => {
  /**
   * Root
   *   P → c0, c1, c2, c3, c4  (c1 has a grandchild)
   *   Q → d0, d1
   * @returns {Object} a map wide enough to have non-contiguous siblings in it
   */
  const wideMap = () => {
    let map = createMap({ id: 'm2', title: 'Wide', rootId: 'root', rootText: 'Root' });
    map = addChild(map, { parentId: 'root', node: { id: 'P', text: 'P' } });
    map = addChild(map, { parentId: 'root', node: { id: 'Q', text: 'Q' } });
    for (let at = 0; at < 5; at += 1) {
      map = addChild(map, { parentId: 'P', node: { id: `c${at}`, text: `c${at}` } });
    }
    map = addChild(map, { parentId: 'Q', node: { id: 'd0', text: 'd0' } });
    map = addChild(map, { parentId: 'Q', node: { id: 'd1', text: 'd1' } });
    map = addChild(map, { parentId: 'c1', node: { id: 'g', text: 'grandchild' } });
    return map;
  };

  it('drops a node whose ancestor is selected too, so a branch is carried once', () => {
    expect(effectiveSet(wideMap(), ['c1', 'g'])).toEqual(['c1']);
    expect(effectiveSet(wideMap(), ['g', 'c1'])).toEqual(['c1']);
    expect(effectiveSet(wideMap(), ['root', 'c1', 'g'])).toEqual(['root']);
  });

  it('keeps a descendant whose ancestor is not selected', () => {
    expect(effectiveSet(wideMap(), ['g', 'c2'])).toEqual(['g', 'c2']);
  });

  it('hands the set back in outline order, whatever order it was built in', () => {
    expect(effectiveSet(wideMap(), ['d0', 'c3', 'c0'])).toEqual(['c0', 'c3', 'd0']);
  });

  it('steps over an id the map no longer holds', () => {
    expect(effectiveSet(wideMap(), ['c0', 'gone'])).toEqual(['c0']);
  });

  it('counts a collapsed branch, because a collapsed node is still selected', () => {
    const map = toggleCollapsed(wideMap(), { id: 'c1' });
    expect(effectiveSet(map, ['c1', 'g'])).toEqual(['c1']);
    expect(effectiveSet(map, ['g'])).toEqual(['g']);
  });
});

describe('moving a set', () => {
  const wideMap = () => {
    let map = createMap({ id: 'm2', title: 'Wide', rootId: 'root', rootText: 'Root' });
    map = addChild(map, { parentId: 'root', node: { id: 'P', text: 'P' } });
    map = addChild(map, { parentId: 'root', node: { id: 'Q', text: 'Q' } });
    for (let at = 0; at < 5; at += 1) {
      map = addChild(map, { parentId: 'P', node: { id: `c${at}`, text: `c${at}` } });
      map = addChild(map, { parentId: 'Q', node: { id: `d${at}`, text: `d${at}` } });
    }
    return map;
  };

  const OPS = { moveNodes, toggleCollapsed };

  /** Run the steps against a map, the way `applyBatch` does. */
  const run = (map, steps) => {
    let next = map;
    for (const step of steps) {
      next = OPS[step.op](next, step.args);
    }
    return next;
  };

  it('indents contiguous siblings as one block, in order, under the node above them', () => {
    const map = wideMap();
    const { steps, moved, stayed } = blockMoveSteps(map, { ids: ['c1', 'c2'], act: 'indent' });
    expect({ moved, stayed }).toEqual({ moved: 2, stayed: 0 });
    const next = run(map, steps);
    expect(next.nodes.c0.children).toEqual(['c1', 'c2']);
    expect(next.nodes.P.children).toEqual(['c0', 'c3', 'c4']);
  });

  it('indents a non-contiguous set node by node, each under its own neighbour', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c3'], act: 'indent' }).steps);
    expect(next.nodes.c0.children).toEqual(['c1']);
    expect(next.nodes.c2.children).toEqual(['c3']);
    expect(next.nodes.P.children).toEqual(['c0', 'c2', 'c4']);
  });

  it('opens a shut branch it indents into, as part of the same step', () => {
    const map = toggleCollapsed(wideMap(), { id: 'c0' });
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c2'], act: 'indent' }).steps);
    expect(next.nodes.c0.collapsed).toBe(false);
  });

  it('skips the run that has nothing above it, and counts what stayed', () => {
    const map = wideMap();
    const { steps, moved, stayed } = blockMoveSteps(map, {
      ids: ['c0', 'c1', 'c3'],
      act: 'indent',
    });
    // c0 and c1 are one run starting at the top, so neither can move; c3 goes under c2.
    expect({ moved, stayed }).toEqual({ moved: 1, stayed: 2 });
    expect(run(map, steps).nodes.c2.children).toEqual(['c3']);
  });

  it('makes no step at all when no node in the set can move', () => {
    const map = wideMap();
    expect(blockMoveSteps(map, { ids: ['c0'], act: 'indent' })).toEqual({
      steps: [],
      moved: 0,
      stayed: 1,
    });
  });

  it('outdents a block to sit straight after the parent it came out of', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c2'], act: 'outdent' }).steps);
    expect(next.nodes.root.children).toEqual(['P', 'c1', 'c2', 'Q']);
    expect(next.nodes.P.children).toEqual(['c0', 'c3', 'c4']);
  });

  it('keeps the outline order of a non-contiguous set it outdents', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c0', 'c2', 'c4'], act: 'outdent' }).steps);
    expect(next.nodes.root.children).toEqual(['P', 'c0', 'c2', 'c4', 'Q']);
  });

  it('keeps the order of two runs outdenting out of two parents under one grandparent', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'd1'], act: 'outdent' }).steps);
    expect(next.nodes.root.children).toEqual(['P', 'c1', 'Q', 'd1']);
  });

  it('will not outdent a first-level node, and says how many stayed', () => {
    const map = wideMap();
    expect(blockMoveSteps(map, { ids: ['P', 'Q'], act: 'outdent' })).toEqual({
      steps: [],
      moved: 0,
      stayed: 2,
    });
  });

  it('moves a block up one place among its siblings', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c2'], act: 'up' }).steps);
    expect(next.nodes.P.children).toEqual(['c1', 'c2', 'c0', 'c3', 'c4']);
  });

  it('moves a block down one place among its siblings', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c2'], act: 'down' }).steps);
    expect(next.nodes.P.children).toEqual(['c0', 'c3', 'c1', 'c2', 'c4']);
  });

  it('moves every run of a non-contiguous set up, each past its own neighbour', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c3'], act: 'up' }).steps);
    expect(next.nodes.P.children).toEqual(['c1', 'c0', 'c3', 'c2', 'c4']);
  });

  it('moves every run of a non-contiguous set down, each past its own neighbour', () => {
    const map = wideMap();
    const next = run(map, blockMoveSteps(map, { ids: ['c1', 'c3'], act: 'down' }).steps);
    expect(next.nodes.P.children).toEqual(['c0', 'c2', 'c1', 'c4', 'c3']);
  });

  it('leaves the run at the end where it is, and moves the rest', () => {
    const map = wideMap();
    expect(blockMoveSteps(map, { ids: ['c0', 'c2'], act: 'up' }).moved).toBe(1);
    expect(blockMoveSteps(map, { ids: ['c2', 'c4'], act: 'down' }).moved).toBe(1);
  });

  it('never moves the centre, however the set was built', () => {
    const map = wideMap();
    for (const act of ['indent', 'outdent', 'up', 'down']) {
      expect(blockMoveSteps(map, { ids: ['root'], act })).toEqual({
        steps: [],
        moved: 0,
        stayed: 0,
      });
    }
  });

  it('counts a node once when an ancestor of it is selected as well', () => {
    const map = addChild(wideMap(), { parentId: 'c1', node: { id: 'g', text: 'g' } });
    expect(blockMoveSteps(map, { ids: ['c1', 'g'], act: 'up' }).moved).toBe(1);
  });
});

describe('where a block lands beside a named sibling', () => {
  const wideMap = () => {
    let map = createMap({ id: 'm2', title: 'Wide', rootId: 'root', rootText: 'Root' });
    map = addChild(map, { parentId: 'root', node: { id: 'P', text: 'P' } });
    for (let at = 0; at < 5; at += 1) {
      map = addChild(map, { parentId: 'P', node: { id: `c${at}`, text: `c${at}` } });
    }
    return map;
  };

  it('counts in the list the block is moving into, which is the list without the block', () => {
    const map = wideMap();
    expect(
      siblingIndexForBlock(map, { ids: ['c0', 'c1'], parentId: 'P', siblingId: 'c3', after: false })
    ).toBe(1);
    expect(
      siblingIndexForBlock(map, { ids: ['c0', 'c1'], parentId: 'P', siblingId: 'c3', after: true })
    ).toBe(2);
  });

  it('answers the same as the one-node form when the block holds one node', () => {
    const map = wideMap();
    for (const after of [true, false]) {
      expect(
        siblingIndexForBlock(map, { ids: ['c0'], parentId: 'P', siblingId: 'c3', after })
      ).toBe(siblingIndexForBlock(map, { ids: ['c0'], parentId: 'P', siblingId: 'c3', after }));
    }
  });
});

describe('what a set says it did', () => {
  it('counts the nodes a delete took, and the children that went with them', () => {
    expect(deletedNodesSentence({ count: 3, buried: 0, hadCentre: false })).toBe(
      'Deleted 3 nodes. Press Ctrl+Z to undo'
    );
    expect(deletedNodesSentence({ count: 3, buried: 4, hadCentre: false })).toBe(
      'Deleted 3 nodes and 4 children. Press Ctrl+Z to undo'
    );
    expect(deletedNodesSentence({ count: 2, buried: 1, hadCentre: true })).toBe(
      'Deleted 2 nodes and 1 child. The centre stays where it is. Press Ctrl+Z to undo'
    );
    expect(deletedNodesSentence({ count: 1, buried: 0, hadCentre: false, text: 'Evidence' })).toBe(
      "Deleted 'Evidence'. Press Ctrl+Z to undo"
    );
    expect(deletedNodesSentence({ count: 1, buried: 2, hadCentre: true, text: 'Argument' })).toBe(
      "Deleted 'Argument' and 2 children. The centre stays where it is. Press Ctrl+Z to undo"
    );
  });

  it('names the move and the number of nodes that made it', () => {
    expect(reorderedSetSentence({ act: 'indent', moved: 3, stayed: 0 })).toBe('Indented 3 nodes.');
    expect(reorderedSetSentence({ act: 'outdent', moved: 3, stayed: 0 })).toBe(
      'Moved 3 nodes out one level.'
    );
    expect(reorderedSetSentence({ act: 'up', moved: 2, stayed: 0 })).toBe('Moved 2 nodes up.');
    expect(reorderedSetSentence({ act: 'down', moved: 1, stayed: 0 })).toBe('Moved 1 node down.');
  });

  it('says in one sentence how many could not move, and why', () => {
    expect(reorderedSetSentence({ act: 'indent', moved: 2, stayed: 1 })).toBe(
      'Indented 2 nodes. 1 stayed where it was: there is nothing above it to move it under.'
    );
    expect(reorderedSetSentence({ act: 'up', moved: 1, stayed: 2 })).toBe(
      'Moved 1 node up. 2 stayed where they were: they are already first here.'
    );
    expect(reorderedSetSentence({ act: 'down', moved: 0, stayed: 3 })).toBe(
      'Nothing moved: they are already last here.'
    );
    expect(reorderedSetSentence({ act: 'outdent', moved: 0, stayed: 1 })).toBe(
      'Nothing moved: it is already at the top level.'
    );
  });

  it('adds the centre to a sentence about a set that held it', () => {
    expect(reorderedSetSentence({ act: 'up', moved: 2, stayed: 0, hadCentre: true })).toBe(
      'Moved 2 nodes up. The centre stays where it is.'
    );
  });

  it('says where a whole block went, in the same words one node uses', () => {
    expect(movedNodesSentence({ count: 3, where: 'into', targetText: 'Sources' })).toBe(
      "Moved 3 nodes into 'Sources'."
    );
    expect(
      movedNodesSentence({ count: 2, where: 'before', targetText: 'Method', expanded: 'Body' })
    ).toBe("Moved 2 nodes before 'Method' and expanded 'Body'.");
  });

  it('refuses a whole block that was aimed at its own branch', () => {
    expect(cannotMoveSetIntoOwnBranchSentence(3)).toBe(
      '3 nodes cannot move into their own branch.'
    );
  });

  it('says what a tick, a colour and a symbol did to the set', () => {
    expect(markedDoneSetSentence(3, true)).toBe('Marked 3 nodes done.');
    expect(markedDoneSetSentence(2, false)).toBe('Marked 2 nodes not done.');
    expect(colourSetSentence('Teal', 3)).toBe('Branch colour Teal on 3 nodes.');
    expect(colourSetSentence(null, 2)).toBe('Branch colour inherited on 2 nodes.');
    expect(symbolSetSentence('⭐', 3)).toBe('Symbol ⭐ on 3 nodes.');
    expect(symbolSetSentence(null, 3)).toBe('Symbol cleared on 3 nodes.');
  });

  it('says what a collapse did, including the nodes with nothing inside them', () => {
    expect(collapsedSetSentence(true, { changed: 3, childless: 0 })).toBe('Collapsed 3 nodes.');
    expect(collapsedSetSentence(false, { changed: 2, childless: 1 })).toBe(
      'Expanded 2 nodes. 1 node has nothing inside it.'
    );
    expect(collapsedSetSentence(true, { changed: 1, childless: 2 })).toBe(
      'Collapsed 1 node. 2 nodes have nothing inside them.'
    );
    expect(collapsedSetSentence(false, { changed: 0, childless: 3 })).toBe(
      'Nothing to expand here.'
    );
  });
});

describe('no sentence quotes a name nobody typed', () => {
  it('calls a node with no name "(untitled)"', () => {
    expect(nameOf('')).toBe('(untitled)');
    expect(nameOf('   ')).toBe('(untitled)');
    expect(nameOf(undefined)).toBe('(untitled)');
    expect(nameOf(null)).toBe('(untitled)');
    expect(nameOf('Evidence')).toBe('Evidence');
  });

  it('uses it wherever a sentence names a node', () => {
    expect(deletedNodesSentence({ count: 1, buried: 0, hadCentre: false, text: '' })).toBe(
      "Deleted '(untitled)'. Press Ctrl+Z to undo"
    );
    expect(movedSentence({ text: '', where: 'into', targetText: '' })).toBe(
      "Moved '(untitled)' into '(untitled)'."
    );
  });

  it('says what an act on one node did to the set it left behind', () => {
    expect(droppedSetSentence(1)).toBe('The other node is no longer selected.');
    expect(droppedSetSentence(3)).toBe('The other 3 nodes are no longer selected.');
  });
});

describe('a map that is one branch of a larger one', () => {
  it('never calls the top of a branch the centre of the map', () => {
    expect(centreNotDeletedSentence(false)).toBe('The centre of the map cannot be deleted.');
    expect(centreNotDeletedSentence(true)).toBe(
      'The top of this branch cannot be deleted from inside it. Press Escape to see the whole map.'
    );
    expect(centreNotMovedSentence(false)).toBe('The centre of the map cannot be moved.');
    expect(centreNotMovedSentence(true)).toBe(
      'The top of this branch cannot be moved from inside it. Press Escape to see the whole map.'
    );
    expect(centreStaysSentence(false)).toBe('The centre stays where it is.');
    expect(centreStaysSentence(true)).toBe('The top of this branch stays where it is.');
    expect(noSiblingsSentence(false)).toBe(
      'The centre of the map has no siblings, so add a child instead.'
    );
    expect(noSiblingsSentence(true)).toBe(
      'The top of this branch has no siblings here, so add a child instead.'
    );
  });

  it('carries that through the sentences that mention what stayed', () => {
    expect(deletedNodesSentence({ count: 2, buried: 0, hadCentre: true, branch: true })).toBe(
      'Deleted 2 nodes. The top of this branch stays where it is. Press Ctrl+Z to undo'
    );
    expect(
      reorderedSetSentence({ act: 'up', moved: 2, stayed: 0, hadCentre: true, branch: true })
    ).toBe('Moved 2 nodes up. The top of this branch stays where it is.');
  });

  it('says what Ctrl+A took, and calls it what it is', () => {
    expect(selectedEverythingSentence(6, false)).toBe('6 nodes selected: the whole outline.');
    expect(selectedEverythingSentence(3, true)).toBe('3 nodes selected: the whole branch.');
    expect(selectedEverythingSentence(1, true)).toBe('1 node selected: the whole branch.');
  });
});
