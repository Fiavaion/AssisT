/**
 * `map.nodes` is an object keyed by ids, and an id can come from a file. Every name on
 * `Object.prototype` answers a plain `nodes[id]` lookup with something truthy, so a file that names
 * a child `constructor` used to pass validation, save, and then crash every walk. These tests put
 * each of those names through each place an id can appear.
 */

import {
  MindMapError,
  createMap,
  createNode,
  validateMap,
} from '../../../../../src/features/mindMap/core/map-model.js';
import {
  addChild,
  addLink,
  nodeCount,
  pathTo,
  subtreeIds,
  walk,
} from '../../../../../src/features/mindMap/core/map-ops.js';
import { layoutMap } from '../../../../../src/features/mindMap/core/layout.js';
import { colourResolver } from '../../../../../src/features/mindMap/core/palette.js';
import { createHistory } from '../../../../../src/features/mindMap/core/history.js';
import { fromJSON } from '../../../../../src/features/mindMap/core/serialisers/json.js';
import { toMarkdown } from '../../../../../src/features/mindMap/core/serialisers/markdown.js';
import { toOPML } from '../../../../../src/features/mindMap/core/serialisers/opml.js';
import { toFreeMind } from '../../../../../src/features/mindMap/core/serialisers/freemind.js';
import { toSVG } from '../../../../../src/features/mindMap/core/serialisers/svg.js';
import { TEMPLATES } from '../../../../../src/features/mindMap/core/templates.js';
import { idSource } from './fixtures.js';

/** Every name an object inherits, asked of the runtime rather than listed from memory. */
const INHERITED = Object.getOwnPropertyNames(Object.prototype);

const SCHEMA = 'assist-mindmap/1';

const node = (id, fields = {}) => ({
  id,
  text: id,
  notes: '',
  children: [],
  parentId: null,
  collapsed: false,
  colour: null,
  symbol: null,
  source: null,
  citationId: null,
  done: false,
  ...fields,
});

/** A sound two-node map as a file would hold it, for one fault to be written into. */
const fileWith = change => {
  const raw = {
    schema: SCHEMA,
    id: 'm',
    title: 'T',
    rootId: 'r',
    nodes: { r: node('r', { children: ['c'], colour: 0 }), c: node('c', { parentId: 'r' }) },
    links: [],
    source: null,
    createdAt: 0,
    updatedAt: 0,
  };
  change(raw);
  return raw;
};

const codesOf = map => validateMap(map).map(problem => problem.code);

const refusalOf = text => {
  try {
    fromJSON(text);
  } catch (error) {
    expect(error).toBeInstanceOf(MindMapError);
    return error;
  }
  return { code: null, problems: [] };
};

describe('an id that is only an inherited property name', () => {
  it('covers the names the defect was reported with', () => {
    expect(INHERITED).toEqual(
      expect.arrayContaining([
        'constructor',
        'toString',
        'hasOwnProperty',
        'valueOf',
        '__proto__',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
      ])
    );
  });

  describe.each(INHERITED)('%s', name => {
    it('is a missing child, to validateMap and to fromJSON', () => {
      const raw = fileWith(map => map.nodes.r.children.push(name));
      expect(codesOf(raw)).toContain('MISSING_CHILD');
      expect(refusalOf(JSON.stringify(raw)).code).toBe('INVALID_MAP');
    });

    it('is a missing parent', () => {
      const raw = fileWith(map => {
        map.nodes.c.parentId = name;
      });
      expect(codesOf(raw)).toContain('MISSING_PARENT');
      expect(refusalOf(JSON.stringify(raw)).code).toBe('INVALID_MAP');
    });

    it.each(['from', 'to'])('is an unknown link endpoint as the %s end', end => {
      const raw = fileWith(map => {
        map.links.push({ id: 'l', from: 'r', to: 'c', label: '', [end]: name });
      });
      expect(codesOf(raw)).toContain('UNKNOWN_LINK_ENDPOINT');
      expect(refusalOf(JSON.stringify(raw)).code).toBe('INVALID_MAP');
    });

    it('is a bad root', () => {
      const raw = fileWith(map => {
        map.rootId = name;
      });
      expect(codesOf(raw)).toContain('BAD_ROOT');
      expect(refusalOf(JSON.stringify(raw)).code).toBe('INVALID_MAP');
    });

    it('is refused as the id of a node that really is in the file', () => {
      // Written as text, because `{"__proto__": x}` in a file is an own key and in source is not.
      const text = JSON.stringify(
        fileWith(map => {
          map.nodes.r.children = ['c', 'PLACEHOLDER'];
          map.nodes.PLACEHOLDER = node('PLACEHOLDER', { parentId: 'r' });
        })
      ).replaceAll('PLACEHOLDER', name);
      const error = refusalOf(text);
      expect(error.code).toBe('INVALID_MAP');
      expect(error.problems.map(problem => problem.code)).toContain('BAD_ID');
      // Reading the file must not have reached the prototype every other object shares.
      expect({}.text).toBeUndefined();
      expect({}.children).toBeUndefined();
    });

    it('cannot be minted, and is unknown to every op and lookup', () => {
      const map = createMap({ id: 'm', title: 'T', rootId: 'r' });
      const thrownBy = run => {
        try {
          run();
        } catch (error) {
          return error.code;
        }
        return null;
      };
      expect(thrownBy(() => createNode({ id: name }))).toBe('INVALID_ID');
      expect(thrownBy(() => addChild(map, { parentId: 'r', node: { id: name, text: 'x' } }))).toBe(
        'INVALID_ID'
      );
      expect(thrownBy(() => addChild(map, { parentId: name, node: { id: 'x' } }))).toBe(
        'UNKNOWN_NODE'
      );
      expect(thrownBy(() => addLink(map, { from: 'r', to: name }))).toBe('UNKNOWN_NODE');
      expect(thrownBy(() => subtreeIds(map, name))).toBe('UNKNOWN_NODE');
      expect(thrownBy(() => pathTo(map, name))).toBe('UNKNOWN_NODE');
      expect(thrownBy(() => createHistory(map).apply(name, {}))).toBe('UNKNOWN_OP');
      const colourFor = colourResolver(map);
      expect(colourFor(name)).toBe(colourFor('no-such-node'));
    });

    it('is stepped over by every traversal when a stored map already lists it', () => {
      // A map saved before validation learned the rule has to open, not crash.
      const stored = fileWith(map => map.nodes.r.children.push(name));
      const seen = [];
      expect(() => walk(stored, visited => seen.push(visited.id))).not.toThrow();
      expect(seen).toEqual(['r', 'c']);
      expect(nodeCount(stored)).toBe(2);
      for (const mode of ['map', 'tree']) {
        const layout = layoutMap(stored, { mode });
        expect(layout.nodes.map(box => box.id)).toEqual(['r', 'c']);
        expect(() => toSVG(stored, layout)).not.toThrow();
      }
      expect(() => [toMarkdown(stored), toOPML(stored), toFreeMind(stored)]).not.toThrow();
    });
  });
});

describe('the reported file', () => {
  it('is refused: a root listing the child "constructor"', () => {
    const text =
      '{"schema":"assist-mindmap/1","id":"m","title":"T","rootId":"r","links":[],' +
      '"nodes":{"r":{"id":"r","text":"R","children":["constructor"],"parentId":null}}}';
    const error = refusalOf(text);
    expect(error.code).toBe('INVALID_MAP');
    expect(error.problems.map(problem => problem.code)).toEqual(['MISSING_CHILD']);
  });
});

describe('an id that is not a string', () => {
  it.each([[5], [null], [{}], [['5']], [true]])(
    '%p is not a child or a link end, even beside a node filed under "5"',
    id => {
      const withNumberedNode = change =>
        fileWith(map => {
          map.nodes['5'] = node('5', { parentId: 'r' });
          map.nodes.r.children.push('5');
          change(map);
        });
      expect(codesOf(withNumberedNode(() => {}))).toEqual([]);
      expect(codesOf(withNumberedNode(map => map.nodes.c.children.push(id)))).toContain(
        'MISSING_CHILD'
      );
      expect(
        codesOf(withNumberedNode(map => map.links.push({ id: 'l', from: id, to: 'c' })))
      ).toContain('UNKNOWN_LINK_ENDPOINT');
    }
  );
});

describe('ids the editor mints', () => {
  it.each([
    ['a UUID', '3b241101-e2bb-4255-8caf-4136c566a962'],
    ['the import fallback', 'mm-import-lq1x2y-7'],
    ['a default root', 'map-1-root'],
    ['an importer default', 'imported-12'],
    ['a test counter', 'n1'],
    ['a number as text', '5'],
    ['words with spaces and an accent', 'caf\u00e9 plan'],
  ])('%s is accepted', (_label, id) => {
    expect(createNode({ id }).id).toBe(id);
    expect(validateMap(createMap({ id: 'm', rootId: id }))).toEqual([]);
  });

  it.each([
    ['a control character', 'a\u0000b'],
    ['a line break', 'a\nb'],
    ['DEL', 'a\u007fb'],
  ])('%s is refused', (_label, id) => {
    expect(() => createNode({ id })).toThrow(expect.objectContaining({ code: 'INVALID_ID' }));
    const raw = fileWith(map => {
      map.nodes.r.children.push(id);
      map.nodes[id] = node(id, { parentId: 'r' });
    });
    expect(codesOf(raw)).toContain('BAD_ID');
  });

  it('every template builds from ids that pass', () => {
    for (const template of TEMPLATES) {
      expect(validateMap(template.build('Title', idSource()))).toEqual([]);
    }
  });
});
