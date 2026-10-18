/**
 * A `.json` map is a file like any other: it is held to the caps every importer shares, and no
 * node comes out of it without a name.
 */

import { fromJSON, toJSON } from '../../../../../../src/features/mindMap/core/serialisers/json.js';
import { validateMap } from '../../../../../../src/features/mindMap/core/map-model.js';
import { describeImportCaps } from './import-caps.js';

const node = (id, parentId, children, text = id) => ({
  id,
  text,
  notes: '',
  children,
  parentId,
  collapsed: false,
  colour: null,
  symbol: null,
  source: null,
  citationId: null,
  done: false,
});

const fileOf = nodes =>
  JSON.stringify({
    schema: 'assist-mindmap/1',
    id: 'm',
    title: 'T',
    rootId: 'n0',
    nodes,
    links: [],
    source: null,
    createdAt: 0,
    updatedAt: 0,
  });

/** `count` nodes, all but the first under the first. */
const flat = count => {
  const ids = Array.from({ length: count }, (_unused, at) => `n${at}`);
  const nodes = { n0: node('n0', null, ids.slice(1)) };
  for (const id of ids.slice(1)) {
    nodes[id] = node(id, 'n0', []);
  }
  return fileOf(nodes);
};

/** `levels` nodes, each inside the last. */
const nested = levels => {
  const nodes = {};
  for (let at = 0; at < levels; at += 1) {
    nodes[`n${at}`] = node(
      `n${at}`,
      at === 0 ? null : `n${at - 1}`,
      at + 1 < levels ? [`n${at + 1}`] : []
    );
  }
  return fileOf(nodes);
};

describe('fromJSON, by the thousand', () => {
  describeImportCaps({
    read: (text, options) => fromJSON(text, options),
    flat,
    nested,
    farTooDeep: 'TOO_MANY_NODES',
    unnamed: () =>
      fileOf({
        n0: node('n0', null, ['a', 'b'], ''),
        a: node('a', 'n0', [], '   '),
        b: node('b', 'n0', [], '\n\t'),
      }),
  });

  it('refuses two hundred thousand nodes before building one of them', () => {
    const text = flat(200001);
    const started = performance.now();
    let code = null;
    try {
      fromJSON(text);
    } catch (error) {
      code = error.code;
    }
    expect(code).toBe('TOO_MANY_NODES');
    // Parsing the text is the whole cost, about a second here; the budget is loose because a busy
    // machine is slow, and the code above is what shows that nothing was built or validated.
    expect(performance.now() - started).toBeLessThan(5000);
  });

  it('refuses four thousand levels for their depth, without running out of stack', () => {
    let code = null;
    try {
      fromJSON(nested(4000));
    } catch (error) {
      code = error.code;
    }
    expect(code).toBe('TOO_DEEP');
  });

  it('names the centre after the map and any other blank node with the placeholder', () => {
    const map = fromJSON(fileOf({ n0: node('n0', null, ['a'], ' '), a: node('a', 'n0', [], '') }));
    expect(map.nodes.n0.text).toBe('T');
    expect(map.nodes.a.text).toBe('(untitled)');
    expect(validateMap(map)).toEqual([]);
  });

  it.each([[5], ['abc'], [{ length: 2 }], [null], [true]])(
    'says what is wrong with children written as %p, rather than throwing a TypeError',
    children => {
      let thrown = null;
      try {
        fromJSON(fileOf({ n0: { ...node('n0', null, []), children } }));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ name: 'MindMapError', code: 'INVALID_MAP' });
      expect(thrown.problems.map(problem => problem.code)).toContain('NOT_A_NODE');
    }
  );

  it('leaves validateMap out of it: a stored map with a blank node still saves', () => {
    const stored = JSON.parse(fileOf({ n0: node('n0', null, ['a']), a: node('a', 'n0', [], '') }));
    expect(validateMap(stored)).toEqual([]);
    expect(JSON.parse(toJSON(stored)).nodes.a.text).toBe('');
  });
});
