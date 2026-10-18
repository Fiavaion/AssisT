/**
 * A map already in the store can be deeper than any import would now allow, and it still has to
 * open, draw and export. Nothing in `core/` may recurse per level, so this chain is built directly,
 * twenty thousand deep, and sent through every traversal there is.
 */

import { createNode, validateMap } from '../../../../../src/features/mindMap/core/map-model.js';
import {
  moveNode,
  nodeCount,
  pathTo,
  removeNode,
  subtreeIds,
  visibleOrder,
  walk,
} from '../../../../../src/features/mindMap/core/map-ops.js';
import { layoutMap } from '../../../../../src/features/mindMap/core/layout.js';
import { colourResolver } from '../../../../../src/features/mindMap/core/palette.js';
import { toFreeMind } from '../../../../../src/features/mindMap/core/serialisers/freemind.js';
import { toJSON } from '../../../../../src/features/mindMap/core/serialisers/json.js';
import {
  fromMarkdown,
  toMarkdown,
} from '../../../../../src/features/mindMap/core/serialisers/markdown.js';
import { toOPML } from '../../../../../src/features/mindMap/core/serialisers/opml.js';
import { toSVG } from '../../../../../src/features/mindMap/core/serialisers/svg.js';
import { idSource, sampleMap } from './fixtures.js';

const DEPTH = 20000;

function chain(levels) {
  const nodes = {};
  for (let at = 0; at < levels; at += 1) {
    nodes[`d${at}`] = createNode({
      id: `d${at}`,
      text: `level ${at}`,
      parentId: at === 0 ? null : `d${at - 1}`,
      children: at + 1 < levels ? [`d${at + 1}`] : [],
      colour: at === 0 ? 0 : null,
    });
  }
  return {
    schema: 'assist-mindmap/1',
    id: 'deep',
    title: 'Deep',
    rootId: 'd0',
    nodes,
    links: [],
    source: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('a map twenty thousand levels deep', () => {
  const map = chain(DEPTH);

  it('is a valid map', () => {
    expect(validateMap(map)).toEqual([]);
  });

  it('is walked, counted and listed to the bottom', () => {
    let deepest = -1;
    let last = null;
    walk(map, (node, depth, parent) => {
      expect(parent === null ? -1 : depth - 1).toBe(deepest);
      deepest = depth;
      last = node.id;
    });
    expect([deepest, last]).toEqual([DEPTH - 1, `d${DEPTH - 1}`]);
    expect(nodeCount(map)).toBe(DEPTH);
    expect(visibleOrder(map)).toHaveLength(DEPTH);
    expect(subtreeIds(map, 'd1')).toHaveLength(DEPTH - 1);
    expect(pathTo(map, `d${DEPTH - 1}`)).toHaveLength(DEPTH);
  });

  it('can still be edited: a branch moved and a branch removed', () => {
    expect(() => moveNode(map, { id: 'd5', newParentId: 'd9' })).toThrow(
      expect.objectContaining({ code: 'CYCLE' })
    );
    expect(Object.keys(removeNode(map, { id: 'd1' }).nodes)).toEqual(['d0']);
  });

  it.each(['map', 'tree'])('is laid out in %s mode, a box per node', mode => {
    const layout = layoutMap(map, { mode });
    expect(layout.nodes).toHaveLength(DEPTH);
    expect(layout.edges).toHaveLength(DEPTH - 1);
    expect(layout.nodes[DEPTH - 1].depth).toBe(DEPTH - 1);
    expect(Number.isFinite(layout.bounds.maxX)).toBe(true);
  });

  it('is written by every exporter, none of them by the megabyte per level', () => {
    const layout = layoutMap(map);
    const written = {
      json: toJSON(map),
      markdown: toMarkdown(map),
      opml: toOPML(map),
      freemind: toFreeMind(map),
      svg: toSVG(map, layout),
    };
    for (const [format, text] of Object.entries(written)) {
      expect([format, text.includes(`level ${DEPTH - 1}`)]).toEqual([format, true]);
      // Indentation that grew with every level made this 400 MB; a flat cost per node is the point.
      expect([format, text.length < DEPTH * 800]).toEqual([format, true]);
    }
    const colourFor = colourResolver(map);
    expect(colourFor(`d${DEPTH - 1}`)).toBe(colourFor('d0'));
  });
});

describe('indentation stops where an import would', () => {
  it('writes Markdown no deeper than a hundred levels, so the file it wrote can be opened again', () => {
    const text = toMarkdown(chain(150));
    const widest = Math.max(...text.split('\n').map(line => line.match(/^ */)[0].length));
    expect(widest).toBe(99 * 2);
    const back = fromMarkdown(text, { ids: idSource() });
    expect(Object.keys(back.nodes)).toHaveLength(150);
  });

  it('and leaves a map of ordinary depth exactly as it was written before', () => {
    const lines = toMarkdown(sampleMap()).split('\n');
    expect(lines.filter(line => line.startsWith('    - '))).toHaveLength(3);
    expect(toOPML(chain(3))).toContain('\n        <outline text="level 2"/>');
    expect(toFreeMind(chain(3))).toContain('\n      <node ID="ID_2" TEXT="level 2"/>');
  });
});
