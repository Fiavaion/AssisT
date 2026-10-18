import {
  MindMapError,
  createMap,
  createNode,
  validateMap
} from '../../../../../src/features/mindMap/core/map-model.js';
import {
  addChild,
  addLink,
  addSibling,
  indent,
  moveDown,
  moveNode,
  moveNodes,
  moveUp,
  nodeCount,
  outdent,
  pathTo,
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
  subtreeIds,
  toggleCollapsed,
  visibleOrder,
  walk
} from '../../../../../src/features/mindMap/core/map-ops.js';
import { sampleMap } from './fixtures.js';

/** Deep snapshot used to prove an op never mutated its input. */
const frozen = map => JSON.stringify(map);

const codeOf = run => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};

describe('purity', () => {
  it('leaves the input map untouched and returns a new object', () => {
    const map = sampleMap();
    const before = frozen(map);
    const next = setText(map, { id: 'n3', text: 'Changed' });
    expect(frozen(map)).toBe(before);
    expect(next).not.toBe(map);
    expect(next.nodes.n3.text).toBe('Changed');
    expect(next.nodes.n5).toBe(map.nodes.n5);
  });

  it('leaves the input untouched for every structural op', () => {
    const map = sampleMap();
    const before = frozen(map);
    addChild(map, { parentId: 'n2', node: createNode({ id: 'x' }) });
    addSibling(map, { siblingId: 'n3', node: createNode({ id: 'x' }) });
    removeNode(map, { id: 'n2' });
    moveNode(map, { id: 'n3', newParentId: 'n5', index: 0 });
    indent(map, { id: 'n4' });
    outdent(map, { id: 'n3' });
    moveUp(map, { id: 'n5' });
    moveDown(map, { id: 'n2' });
    toggleCollapsed(map, { id: 'n2' });
    addLink(map, { from: 'n3', to: 'n6', label: 'see also' });
    expect(frozen(map)).toBe(before);
  });
});

describe('addChild', () => {
  it('appends by default and keeps the map valid', () => {
    const next = addChild(sampleMap(), { parentId: 'n2', node: createNode({ id: 'x', text: 'New' }) });
    expect(next.nodes.n2.children).toEqual(['n3', 'n4', 'x']);
    expect(next.nodes.x.parentId).toBe('n2');
    expect(validateMap(next)).toEqual([]);
  });

  it('inserts at an index', () => {
    const next = addChild(sampleMap(), { parentId: 'n2', node: createNode({ id: 'x' }), index: 0 });
    expect(next.nodes.n2.children).toEqual(['x', 'n3', 'n4']);
  });

  it('accepts a bare object and fills the node defaults', () => {
    const next = addChild(sampleMap(), { parentId: 'n2', node: { id: 'x', text: 'Bare' } });
    expect(next.nodes.x).toMatchObject({ text: 'Bare', collapsed: false, done: false, children: [] });
  });

  it('rejects an unknown parent and a duplicate id', () => {
    expect(codeOf(() => addChild(sampleMap(), { parentId: 'ghost', node: { id: 'x' } }))).toBe('UNKNOWN_NODE');
    expect(codeOf(() => addChild(sampleMap(), { parentId: 'n2', node: { id: 'n3' } }))).toBe('DUPLICATE_ID');
    expect(() => addChild(sampleMap(), { parentId: 'n2', node: null })).toThrow(MindMapError);
  });
});

describe('addSibling', () => {
  it('inserts after the sibling by default and before it when asked', () => {
    expect(addSibling(sampleMap(), { siblingId: 'n3', node: { id: 'x' } }).nodes.n2.children)
      .toEqual(['n3', 'x', 'n4']);
    expect(addSibling(sampleMap(), { siblingId: 'n3', node: { id: 'x' }, after: false }).nodes.n2.children)
      .toEqual(['x', 'n3', 'n4']);
  });

  it('refuses a sibling for the root', () => {
    const map = sampleMap();
    expect(codeOf(() => addSibling(map, { siblingId: map.rootId, node: { id: 'x' } }))).toBe('ROOT_IMMOVABLE');
  });
});

describe('removeNode', () => {
  it('removes the whole subtree and detaches it from the parent', () => {
    const next = removeNode(sampleMap(), { id: 'n2' });
    expect(Object.keys(next.nodes).sort()).toEqual(['n1', 'n5', 'n6']);
    expect(next.nodes.n1.children).toEqual(['n5']);
    expect(validateMap(next)).toEqual([]);
  });

  it('drops links that touch anything removed', () => {
    const map = addLink(sampleMap(), { from: 'n3', to: 'n6', label: 'x' });
    expect(removeNode(map, { id: 'n2' }).links).toEqual([]);
  });

  it('refuses to remove the root', () => {
    const map = sampleMap();
    expect(codeOf(() => removeNode(map, { id: map.rootId }))).toBe('ROOT_IMMOVABLE');
  });

  it('rejects an unknown id', () => {
    expect(codeOf(() => removeNode(sampleMap(), { id: 'ghost' }))).toBe('UNKNOWN_NODE');
  });
});

describe('field setters', () => {
  it('set each field and validate its type', () => {
    const map = sampleMap();
    expect(setNotes(map, { id: 'n3', notes: 'why' }).nodes.n3.notes).toBe('why');
    expect(setColour(map, { id: 'n3', colour: 4 }).nodes.n3.colour).toBe(4);
    expect(setColour(map, { id: 'n3', colour: null }).nodes.n3.colour).toBeNull();
    expect(setSymbol(map, { id: 'n3', symbol: 'star' }).nodes.n3.symbol).toBe('star');
    expect(setSource(map, { id: 'n3', source: { url: 'https://a.example', quote: 'q', title: 't' } }).nodes.n3.source)
      .toEqual({ url: 'https://a.example', quote: 'q', title: 't' });
    expect(setCitation(map, { id: 'n3', citationId: 'c1' }).nodes.n3.citationId).toBe('c1');
    expect(setDone(map, { id: 'n3', done: true }).nodes.n3.done).toBe(true);
    expect(setTitle(map, { title: 'Renamed' }).title).toBe('Renamed');
  });

  it('rejects a colour index outside the palette', () => {
    expect(codeOf(() => setColour(sampleMap(), { id: 'n3', colour: 8 }))).toBe('INVALID_COLOUR');
    expect(codeOf(() => setColour(sampleMap(), { id: 'n3', colour: -1 }))).toBe('INVALID_COLOUR');
  });

  it('rejects a non-string text and an unknown id', () => {
    expect(codeOf(() => setText(sampleMap(), { id: 'n3', text: 5 }))).toBe('INVALID_VALUE');
    expect(codeOf(() => setText(sampleMap(), { id: 'ghost', text: 'x' }))).toBe('UNKNOWN_NODE');
    expect(codeOf(() => setTitle(sampleMap(), { title: null }))).toBe('INVALID_VALUE');
  });

  it('returns the same map when nothing changes', () => {
    const map = sampleMap();
    expect(setText(map, { id: 'n3', text: map.nodes.n3.text })).toBe(map);
  });
});

describe('toggleCollapsed', () => {
  it('flips the flag', () => {
    const once = toggleCollapsed(sampleMap(), { id: 'n2' });
    expect(once.nodes.n2.collapsed).toBe(true);
    expect(toggleCollapsed(once, { id: 'n2' }).nodes.n2.collapsed).toBe(false);
  });
});

describe('moveNode', () => {
  it('re-parents at the given index', () => {
    const next = moveNode(sampleMap(), { id: 'n3', newParentId: 'n5', index: 0 });
    expect(next.nodes.n5.children).toEqual(['n3', 'n6']);
    expect(next.nodes.n2.children).toEqual(['n4']);
    expect(next.nodes.n3.parentId).toBe('n5');
    expect(validateMap(next)).toEqual([]);
  });

  it('reorders within the same parent', () => {
    const next = moveNode(sampleMap(), { id: 'n4', newParentId: 'n2', index: 0 });
    expect(next.nodes.n2.children).toEqual(['n4', 'n3']);
  });

  it('clamps an index past the end', () => {
    const next = moveNode(sampleMap(), { id: 'n3', newParentId: 'n5', index: 99 });
    expect(next.nodes.n5.children).toEqual(['n6', 'n3']);
  });

  it('refuses to move a node into its own subtree', () => {
    expect(codeOf(() => moveNode(sampleMap(), { id: 'n2', newParentId: 'n3', index: 0 }))).toBe('CYCLE');
    expect(codeOf(() => moveNode(sampleMap(), { id: 'n2', newParentId: 'n2', index: 0 }))).toBe('CYCLE');
  });

  it('refuses to move the root', () => {
    const map = sampleMap();
    expect(codeOf(() => moveNode(map, { id: map.rootId, newParentId: 'n2', index: 0 }))).toBe('ROOT_IMMOVABLE');
  });
});

describe('indent and outdent', () => {
  it('indent makes the node the last child of its previous sibling', () => {
    const next = indent(sampleMap(), { id: 'n5' });
    expect(next.nodes.n1.children).toEqual(['n2']);
    expect(next.nodes.n2.children).toEqual(['n3', 'n4', 'n5']);
    expect(next.nodes.n5.parentId).toBe('n2');
    expect(validateMap(next)).toEqual([]);
  });

  it('indent does nothing without a previous sibling', () => {
    const map = sampleMap();
    expect(indent(map, { id: 'n2' })).toBe(map);
  });

  it('outdent makes the node the next sibling of its parent', () => {
    const next = outdent(sampleMap(), { id: 'n3' });
    expect(next.nodes.n1.children).toEqual(['n2', 'n3', 'n5']);
    expect(next.nodes.n2.children).toEqual(['n4']);
    expect(validateMap(next)).toEqual([]);
  });

  it('outdent does nothing for a first-level node', () => {
    const map = sampleMap();
    expect(outdent(map, { id: 'n2' })).toBe(map);
  });

  it('refuses to indent or outdent the root', () => {
    const map = sampleMap();
    expect(codeOf(() => indent(map, { id: map.rootId }))).toBe('ROOT_IMMOVABLE');
    expect(codeOf(() => outdent(map, { id: map.rootId }))).toBe('ROOT_IMMOVABLE');
  });
});

describe('moveUp and moveDown', () => {
  it('swap with the neighbouring sibling', () => {
    expect(moveUp(sampleMap(), { id: 'n5' }).nodes.n1.children).toEqual(['n5', 'n2']);
    expect(moveDown(sampleMap(), { id: 'n2' }).nodes.n1.children).toEqual(['n5', 'n2']);
  });

  it('do nothing at either edge', () => {
    const map = sampleMap();
    expect(moveUp(map, { id: 'n2' })).toBe(map);
    expect(moveDown(map, { id: 'n5' })).toBe(map);
  });
});

describe('links', () => {
  it('adds a cross-link with a derived id and removes it again', () => {
    const withLink = addLink(sampleMap(), { from: 'n3', to: 'n6', label: 'compare' });
    expect(withLink.links).toEqual([{ id: 'n3->n6', from: 'n3', to: 'n6', label: 'compare' }]);
    expect(removeLink(withLink, { id: 'n3->n6' }).links).toEqual([]);
  });

  it('accepts an explicit id', () => {
    expect(addLink(sampleMap(), { id: 'L', from: 'n3', to: 'n6' }).links[0].id).toBe('L');
  });

  it('rejects unknown endpoints, self links and duplicates', () => {
    expect(codeOf(() => addLink(sampleMap(), { from: 'n3', to: 'ghost' }))).toBe('UNKNOWN_NODE');
    expect(codeOf(() => addLink(sampleMap(), { from: 'n3', to: 'n3' }))).toBe('INVALID_LINK');
    const once = addLink(sampleMap(), { from: 'n3', to: 'n6' });
    expect(codeOf(() => addLink(once, { from: 'n3', to: 'n6' }))).toBe('DUPLICATE_ID');
    expect(codeOf(() => removeLink(sampleMap(), { id: 'nope' }))).toBe('UNKNOWN_LINK');
  });
});

describe('helpers', () => {
  it('walk visits depth-first in outline order with the depth', () => {
    const seen = [];
    walk(sampleMap(), (node, depth) => seen.push(`${node.id}@${depth}`));
    expect(seen).toEqual(['n1@0', 'n2@1', 'n3@2', 'n4@2', 'n5@1', 'n6@2']);
  });

  it('walk skips collapsed subtrees when asked', () => {
    const map = toggleCollapsed(sampleMap(), { id: 'n2' });
    const seen = [];
    walk(map, node => seen.push(node.id), { includeCollapsed: false });
    expect(seen).toEqual(['n1', 'n2', 'n5', 'n6']);
  });

  it('subtreeIds includes the node itself', () => {
    expect(subtreeIds(sampleMap(), 'n2')).toEqual(['n2', 'n3', 'n4']);
    expect(subtreeIds(sampleMap(), 'n6')).toEqual(['n6']);
  });

  it('pathTo runs from the root to the node', () => {
    expect(pathTo(sampleMap(), 'n4')).toEqual(['n1', 'n2', 'n4']);
    expect(pathTo(sampleMap(), 'n1')).toEqual(['n1']);
    expect(codeOf(() => pathTo(sampleMap(), 'ghost'))).toBe('UNKNOWN_NODE');
  });

  it('visibleOrder hides the children of a collapsed node', () => {
    expect(visibleOrder(sampleMap())).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(visibleOrder(toggleCollapsed(sampleMap(), { id: 'n2' }))).toEqual(['n1', 'n2', 'n5', 'n6']);
  });

  it('nodeCount counts every node in the tree, collapsed or not', () => {
    expect(nodeCount(sampleMap())).toBe(6);
    expect(nodeCount(toggleCollapsed(sampleMap(), { id: 'n2' }))).toBe(6);
  });
});

describe('moveNodes', () => {
  /** A root with two five-child branches: P holds c0..c4, Q holds d0..d4. */
  const blockMap = () => {
    let map = createMap({ id: 'm1', title: 'Block', rootId: 'root', rootText: 'Root' });
    map = addChild(map, { parentId: 'root', node: createNode({ id: 'P', text: 'P' }) });
    map = addChild(map, { parentId: 'root', node: createNode({ id: 'Q', text: 'Q' }) });
    for (let at = 0; at < 5; at += 1) {
      map = addChild(map, { parentId: 'P', node: createNode({ id: `c${at}`, text: `c${at}` }) });
      map = addChild(map, { parentId: 'Q', node: createNode({ id: `d${at}`, text: `d${at}` }) });
    }
    return map;
  };

  /** Every subset of 0..4 of the given size, as sorted index lists. */
  const combinations = size => {
    const out = [];
    const walkOn = (start, taken) => {
      if (taken.length === size) {
        out.push([...taken]);
        return;
      }
      for (let at = start; at < 5; at += 1) {
        taken.push(at);
        walkOn(at + 1, taken);
        taken.pop();
      }
    };
    walkOn(0, []);
    return out;
  };

  it('leaves the input map untouched', () => {
    const map = blockMap();
    const before = frozen(map);
    moveNodes(map, { ids: ['c1', 'c3'], newParentId: 'Q', index: 2 });
    expect(frozen(map)).toBe(before);
  });

  for (const size of [2, 3]) {
    it(`puts ${size} of one parent's children at every index of that same parent`, () => {
      for (const picked of combinations(size)) {
        const map = blockMap();
        const ids = picked.map(at => `c${at}`);
        const rest = [0, 1, 2, 3, 4].filter(at => !picked.includes(at)).map(at => `c${at}`);
        for (let index = 0; index <= rest.length; index += 1) {
          const next = moveNodes(map, { ids, newParentId: 'P', index });
          const wanted = [...rest.slice(0, index), ...ids, ...rest.slice(index)];
          expect({ picked, index, got: next.nodes.P.children }).toEqual({
            picked,
            index,
            got: wanted
          });
          expect(validateMap(next)).toEqual([]);
          for (const id of ids) {
            expect(next.nodes[id].parentId).toBe('P');
          }
        }
      }
    });

    it(`puts ${size} of one parent's children at every index of another parent`, () => {
      const destination = ['d0', 'd1', 'd2', 'd3', 'd4'];
      for (const picked of combinations(size)) {
        const map = blockMap();
        const ids = picked.map(at => `c${at}`);
        const rest = [0, 1, 2, 3, 4].filter(at => !picked.includes(at)).map(at => `c${at}`);
        for (let index = 0; index <= destination.length; index += 1) {
          const next = moveNodes(map, { ids, newParentId: 'Q', index });
          const wanted = [...destination.slice(0, index), ...ids, ...destination.slice(index)];
          expect({ picked, index, got: next.nodes.Q.children }).toEqual({
            picked,
            index,
            got: wanted
          });
          expect(next.nodes.P.children).toEqual(rest);
          expect(validateMap(next)).toEqual([]);
          for (const id of ids) {
            expect(next.nodes[id].parentId).toBe('Q');
          }
        }
      }
    });
  }

  it('keeps the order it is given, not the order the parent had', () => {
    const next = moveNodes(blockMap(), { ids: ['c3', 'c0'], newParentId: 'Q', index: 0 });
    expect(next.nodes.Q.children.slice(0, 2)).toEqual(['c3', 'c0']);
  });

  it('gathers children of different parents into one block', () => {
    const next = moveNodes(blockMap(), { ids: ['c1', 'd2'], newParentId: 'root', index: 0 });
    expect(next.nodes.root.children).toEqual(['c1', 'd2', 'P', 'Q']);
    expect(next.nodes.P.children).toEqual(['c0', 'c2', 'c3', 'c4']);
    expect(next.nodes.Q.children).toEqual(['d0', 'd1', 'd3', 'd4']);
  });

  it('clamps an index past the end, and appends when none is given', () => {
    const map = blockMap();
    expect(moveNodes(map, { ids: ['c0'], newParentId: 'Q', index: 99 }).nodes.Q.children).toEqual([
      'd0',
      'd1',
      'd2',
      'd3',
      'd4',
      'c0'
    ]);
    expect(moveNodes(map, { ids: ['c0'], newParentId: 'Q' }).nodes.Q.children.at(-1)).toBe('c0');
    expect(moveNodes(map, { ids: ['c0'], newParentId: 'Q', index: -3 }).nodes.Q.children[0]).toBe(
      'c0'
    );
  });

  it('returns the same map when every node is already there in that order', () => {
    const map = blockMap();
    expect(moveNodes(map, { ids: ['c1', 'c2'], newParentId: 'P', index: 1 })).toBe(map);
    expect(moveNodes(map, { ids: ['c3', 'c4'], newParentId: 'P' })).toBe(map);
  });

  it('refuses a move that would eat its own tail, the root, a repeat, and a nested pair', () => {
    const map = blockMap();
    expect(codeOf(() => moveNodes(map, { ids: ['P'], newParentId: 'c1' }))).toBe('CYCLE');
    expect(codeOf(() => moveNodes(map, { ids: ['c1'], newParentId: 'c1' }))).toBe('CYCLE');
    expect(codeOf(() => moveNodes(map, { ids: ['P', 'c1'], newParentId: 'Q' }))).toBe('CYCLE');
    expect(codeOf(() => moveNodes(map, { ids: ['root'], newParentId: 'P' }))).toBe('ROOT_IMMOVABLE');
    expect(codeOf(() => moveNodes(map, { ids: ['c1', 'c1'], newParentId: 'Q' }))).toBe(
      'DUPLICATE_ID'
    );
    expect(codeOf(() => moveNodes(map, { ids: ['nope'], newParentId: 'Q' }))).toBe('UNKNOWN_NODE');
    expect(codeOf(() => moveNodes(map, { ids: [], newParentId: 'Q' }))).toBe('INVALID_VALUE');
    expect(codeOf(() => moveNodes(map, { newParentId: 'Q' }))).toBe('INVALID_VALUE');
  });
});
