/**
 * The branch view: one branch of a map, derived as a map of its own.
 *
 * Focus mode is a VIEW (slice E2), so this derivation is the whole of the honesty of it. Four
 * properties are asserted here rather than left to review, because each one is a way the feature
 * could quietly become an edit:
 *
 *  1. the source map is never touched, and an op applied to the view never reaches back into it;
 *  2. `validateMap` passes on the view, so the panes are drawing a real map rather than one with a
 *     dangling parent in it;
 *  3. ids are unchanged, so the selection, the history and every announcement still line up;
 *  4. it is fast, because the view is derived again on every change to the map.
 */

import {
  branchView,
  isBranchView,
  sameBranchView,
} from '../../../../../src/features/mindMap/core/branch-view.js';
import {
  addChild,
  addLink,
  moveNodes,
  removeNode,
  setText,
  subtreeIds,
  toggleCollapsed,
  visibleOrder,
} from '../../../../../src/features/mindMap/core/map-ops.js';
import {
  createMap,
  createNode,
  validateMap,
} from '../../../../../src/features/mindMap/core/map-model.js';

/**
 * Root "Essay"
 *   Introduction
 *   Body
 *     Argument 1
 *     Argument 2
 *       Evidence
 *   Conclusion
 *
 * @returns {Object} the map under test
 */
function sampleMap() {
  let map = createMap({ id: 'm1', title: 'Essay', rootId: 'root', rootText: 'Essay' });
  map = addChild(map, { parentId: 'root', node: { id: 'intro', text: 'Introduction' } });
  map = addChild(map, { parentId: 'root', node: { id: 'body', text: 'Body' } });
  map = addChild(map, { parentId: 'body', node: { id: 'a1', text: 'Argument 1' } });
  map = addChild(map, { parentId: 'body', node: { id: 'a2', text: 'Argument 2' } });
  map = addChild(map, { parentId: 'a2', node: { id: 'ev', text: 'Evidence' } });
  map = addChild(map, { parentId: 'root', node: { id: 'conc', text: 'Conclusion' } });
  return map;
}

describe('branchView', () => {
  it('holds the branch and nothing else, re-rooted', () => {
    const view = branchView(sampleMap(), 'a2');

    expect(view.rootId).toBe('a2');
    expect(Object.keys(view.nodes).sort()).toEqual(['a2', 'ev']);
    expect(view.nodes.a2.parentId).toBeNull();
    expect(view.nodes.ev.parentId).toBe('a2');
    expect(visibleOrder(view)).toEqual(['a2', 'ev']);
  });

  it('keeps every id, so a selection and the history still line up', () => {
    const map = sampleMap();
    const view = branchView(map, 'body');

    expect(subtreeIds(view, 'body')).toEqual(subtreeIds(map, 'body'));
    // Shared by reference, deliberately: it is what lets `sameBranchView` tell a change inside the
    // branch from one outside it with a handful of comparisons.
    expect(view.nodes.a2).toBe(map.nodes.a2);
  });

  it('gives the top of the branch a children array of its own', () => {
    const map = sampleMap();
    const view = branchView(map, 'body');

    expect(view.nodes.body).not.toBe(map.nodes.body);
    expect(view.nodes.body.children).not.toBe(map.nodes.body.children);
    expect(view.nodes.body.children).toEqual(['a1', 'a2']);
  });

  it('carries the map it was cut from, and the whole map is not a branch view', () => {
    const map = sampleMap();

    expect(isBranchView(branchView(map, 'body'))).toBe(true);
    expect(branchView(map, 'body').branchOf).toBe('root');
    expect(isBranchView(map)).toBe(false);
  });

  it('is the map itself when the branch asked for is the whole map', () => {
    const map = sampleMap();

    expect(branchView(map, 'root')).toBe(map);
    expect(isBranchView(branchView(map, 'root'))).toBe(false);
  });

  it('keeps the nodes a fold is hiding: they are in the branch, not on screen', () => {
    const map = toggleCollapsed(sampleMap(), { id: 'a2' });
    const view = branchView(map, 'body');

    expect(Object.keys(view.nodes).sort()).toEqual(['a1', 'a2', 'body', 'ev']);
    expect(visibleOrder(view)).toEqual(['body', 'a1', 'a2']);
  });

  it('draws no cross-link with one end outside the branch', () => {
    let map = sampleMap();
    map = addLink(map, { id: 'inside', from: 'a2', to: 'ev' });
    map = addLink(map, { id: 'crossing', from: 'a2', to: 'intro' });

    expect(branchView(map, 'a2').links.map(link => link.id)).toEqual(['inside']);
    expect(branchView(map, 'body').links.map(link => link.id)).toEqual(['inside']);
  });

  it('keeps the links array itself when every link is inside the branch', () => {
    const map = addLink(sampleMap(), { id: 'inside', from: 'a2', to: 'ev' });

    // Nothing downstream then sees a change: `sameBranchView` compares the arrays by identity first.
    expect(branchView(map, 'body').links).toBe(map.links);
    const plain = sampleMap();
    expect(branchView(plain, 'body').links).toBe(plain.links);
  });

  it('passes validateMap, so the panes are drawing a real map', () => {
    const map = sampleMap();

    expect(validateMap(branchView(map, 'body'))).toEqual([]);
    expect(validateMap(branchView(map, 'ev'))).toEqual([]);
  });

  it('refuses a node the map does not hold', () => {
    expect(() => branchView(sampleMap(), 'nope')).toThrow(/nope/);
  });

  it('leaves the source map exactly as it was, whatever is done to the view', () => {
    const map = sampleMap();
    const before = JSON.stringify(map);
    const view = branchView(map, 'body');

    const edits = [
      () => setText(view, { id: 'a2', text: 'Changed' }),
      () => addChild(view, { parentId: 'a1', node: { id: 'fresh', text: 'Fresh' } }),
      () => removeNode(view, { id: 'a1' }),
      () => moveNodes(view, { ids: ['a1'], newParentId: 'a2', index: 0 }),
      () => toggleCollapsed(view, { id: 'a2' }),
    ];
    for (const edit of edits) {
      edit();
    }

    expect(JSON.stringify(map)).toBe(before);
    expect(map.nodes.a2.text).toBe('Argument 2');
    expect(map.nodes.body.children).toEqual(['a1', 'a2']);
  });

  it('is a map an op can be applied to, and the result is still only the branch', () => {
    const map = sampleMap();
    const edited = setText(branchView(map, 'body'), { id: 'a2', text: 'Changed' });

    expect(edited.nodes.a2.text).toBe('Changed');
    expect(Object.keys(edited.nodes).sort()).toEqual(['a1', 'a2', 'body', 'ev']);
    expect(validateMap(edited)).toEqual([]);
  });
});

describe('sameBranchView', () => {
  it('is true for the same object', () => {
    const view = branchView(sampleMap(), 'body');

    expect(sameBranchView(view, view)).toBe(true);
  });

  it('is true when the change landed outside the branch', () => {
    const map = sampleMap();
    const after = setText(map, { id: 'intro', text: 'Opening' });

    expect(sameBranchView(branchView(map, 'body'), branchView(after, 'body'))).toBe(true);
  });

  it('is false when the branch itself changed', () => {
    const map = sampleMap();

    expect(
      sameBranchView(
        branchView(map, 'body'),
        branchView(setText(map, { id: 'a1', text: 'One' }), 'body')
      )
    ).toBe(false);
    expect(
      sameBranchView(
        branchView(map, 'body'),
        branchView(addChild(map, { parentId: 'a1', node: { id: 'new', text: 'New' } }), 'body')
      )
    ).toBe(false);
  });

  it('is false when the branch lost a node', () => {
    const map = addChild(sampleMap(), { parentId: 'a1', node: { id: 'extra', text: 'Extra' } });

    expect(sameBranchView(branchView(map, 'body'), branchView(map, 'a1'))).toBe(false);
  });

  it('is false when the title changed, because the page shows it', () => {
    const map = sampleMap();
    const renamed = { ...map, title: 'Another essay' };

    expect(sameBranchView(branchView(map, 'body'), branchView(renamed, 'body'))).toBe(false);
  });

  it('is false when a cross-link was added inside the branch', () => {
    const map = sampleMap();
    const linked = addLink(map, { id: 'l1', from: 'a1', to: 'a2' });

    expect(sameBranchView(branchView(map, 'body'), branchView(linked, 'body'))).toBe(false);
  });

  it('takes nothing for one side missing', () => {
    expect(sameBranchView(null, branchView(sampleMap(), 'body'))).toBe(false);
    expect(sameBranchView(branchView(sampleMap(), 'body'), null)).toBe(false);
  });
});

describe('a map of 5,000 nodes', () => {
  /**
   * A wide, shallow map: 50 branches of 100, which is the shape a long essay plan really has.
   *
   * Assembled rather than built with `addChild`, which copies the node table per call and would
   * spend seconds of this suite proving nothing. `validateMap` below is what says it is a real map.
   *
   * @param {number} [branches]
   * @param {number} [leaves]
   * @returns {Object}
   */
  function bigMap(branches = 50, leaves = 99) {
    const map = createMap({ id: 'big', title: 'Big', rootId: 'root', rootText: 'Big' });
    const nodes = { ...map.nodes };
    const top = [];
    for (let branch = 0; branch < branches; branch += 1) {
      const branchId = `b${branch}`;
      const children = [];
      for (let leaf = 0; leaf < leaves; leaf += 1) {
        const id = `${branchId}-${leaf}`;
        children.push(id);
        nodes[id] = createNode({ id, text: `Leaf ${leaf}`, parentId: branchId });
      }
      top.push(branchId);
      nodes[branchId] = createNode({
        id: branchId,
        text: `Branch ${branch}`,
        parentId: 'root',
        children,
      });
    }
    nodes.root = { ...nodes.root, children: top };
    return { ...map, nodes };
  }

  it('is a real map, so the timings below are about a map the editor could open', () => {
    expect(validateMap(bigMap())).toEqual([]);
  });

  it('derives a branch and compares it twenty times over inside a fraction of a second', () => {
    const map = bigMap();
    expect(Object.keys(map.nodes)).toHaveLength(5001);

    const started = Date.now();
    let view = null;
    for (let run = 0; run < 20; run += 1) {
      const next = branchView(map, 'b0');
      sameBranchView(view, next);
      view = next;
    }
    const spent = Date.now() - started;

    expect(Object.keys(view.nodes)).toHaveLength(100);
    // Generous on purpose: what matters is that this is not seconds. A CI box under load must not
    // fail a correctness suite, and 16ms for one derivation is already far too slow.
    expect(spent).toBeLessThan(320);
  });

  it('derives the biggest branch there is — one holding the whole map — just as fast', () => {
    // One branch of 4,999 nodes, so the view is the whole map less the centre.
    const map = bigMap(1, 4998);

    const started = Date.now();
    let view = null;
    for (let run = 0; run < 20; run += 1) {
      const next = branchView(map, 'b0');
      sameBranchView(view, next);
      view = next;
    }
    const spent = Date.now() - started;

    expect(Object.keys(view.nodes)).toHaveLength(4999);
    expect(spent).toBeLessThan(1200);
  });
});
