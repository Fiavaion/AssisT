import {
  MAP_SCHEMA,
  MindMapError,
  createMap,
  createNode,
  validateMap
} from '../../../../../src/features/mindMap/core/map-model.js';
import { sampleMap } from './fixtures.js';

describe('createNode', () => {
  it('fills every field in the v1 contract', () => {
    expect(createNode({ id: 'a' })).toEqual({
      id: 'a',
      text: '',
      notes: '',
      children: [],
      parentId: null,
      collapsed: false,
      colour: null,
      symbol: null,
      source: null,
      citationId: null,
      done: false
    });
  });

  it('keeps supplied values and copies the children array', () => {
    const children = ['b'];
    const node = createNode({ id: 'a', text: 'Hi', notes: 'n', children, done: true, colour: 3 });
    expect(node).toMatchObject({ text: 'Hi', notes: 'n', done: true, colour: 3 });
    expect(node.children).toEqual(['b']);
    expect(node.children).not.toBe(children);
  });

  it('rejects a missing or non-string id', () => {
    expect(() => createNode({})).toThrow(MindMapError);
    expect(() => createNode({ id: 7 })).toThrow(/id/i);
    try {
      createNode({ id: '' });
    } catch (error) {
      expect(error.code).toBe('INVALID_ID');
    }
  });
});

describe('createMap', () => {
  it('creates a schema-tagged map with one root', () => {
    const map = createMap({ id: 'm1', title: 'Essay', rootId: 'r', rootText: 'Thesis' });
    expect(map.schema).toBe(MAP_SCHEMA);
    expect(map.id).toBe('m1');
    expect(map.title).toBe('Essay');
    expect(map.rootId).toBe('r');
    expect(map.nodes.r).toMatchObject({ text: 'Thesis', parentId: null, colour: 0 });
    expect(map.links).toEqual([]);
    expect(map.source).toBeNull();
    expect(validateMap(map)).toEqual([]);
  });

  it('derives a root id and root text when none is given', () => {
    const map = createMap({ id: 'm1', title: 'Essay' });
    expect(map.rootId).toBe('m1-root');
    expect(map.nodes[map.rootId].text).toBe('Essay');
  });

  it('stamps timestamps from the caller, never from the clock', () => {
    const map = createMap({ id: 'm1', title: 'T' });
    expect(map.createdAt).toBe(0);
    expect(map.updatedAt).toBe(0);
    expect(createMap({ id: 'm1', title: 'T', now: 1234 }).createdAt).toBe(1234);
  });

  it('rejects a missing id', () => {
    expect(() => createMap({ title: 'T' })).toThrow(MindMapError);
  });
});

describe('MindMapError', () => {
  it('carries a machine-readable code', () => {
    const error = new MindMapError('UNKNOWN_NODE', 'no such node');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MindMapError');
    expect(error.code).toBe('UNKNOWN_NODE');
    expect(error.message).toBe('no such node');
  });
});

describe('validateMap', () => {
  const codesOf = map => validateMap(map).map(problem => problem.code);

  it('passes a well-formed map', () => {
    expect(validateMap(sampleMap())).toEqual([]);
  });

  it('reports a map that is not an object', () => {
    expect(codesOf(null)).toContain('NOT_A_MAP');
    expect(codesOf('{}')).toContain('NOT_A_MAP');
  });

  it('reports the wrong schema', () => {
    expect(codesOf({ ...sampleMap(), schema: 'assist-mindmap/9' })).toContain('BAD_SCHEMA');
  });

  it('reports a rootId that names no node', () => {
    expect(codesOf({ ...sampleMap(), rootId: 'ghost' })).toContain('BAD_ROOT');
  });

  it('reports a root that claims a parent', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: { ...map.nodes, [map.rootId]: { ...map.nodes[map.rootId], parentId: 'n2' } }
    };
    expect(codesOf(broken)).toContain('ROOT_HAS_PARENT');
  });

  it('reports a child id nothing defines', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: { ...map.nodes, n2: { ...map.nodes.n2, children: [...map.nodes.n2.children, 'ghost'] } }
    };
    expect(codesOf(broken)).toContain('MISSING_CHILD');
  });

  it('reports a parentId nothing defines', () => {
    const map = sampleMap();
    const broken = { ...map, nodes: { ...map.nodes, n3: { ...map.nodes.n3, parentId: 'ghost' } } };
    expect(codesOf(broken)).toContain('MISSING_PARENT');
  });

  it('reports a node claimed by two parents', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: { ...map.nodes, n5: { ...map.nodes.n5, children: ['n3'] } }
    };
    expect(codesOf(broken)).toContain('DUPLICATE_CHILD');
  });

  it('reports a node listed twice by the same parent', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: { ...map.nodes, [map.rootId]: { ...map.nodes[map.rootId], children: ['n2', 'n2', 'n5'] } }
    };
    expect(codesOf(broken)).toContain('DUPLICATE_CHILD');
  });

  it('reports a node unreachable from the root', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: { ...map.nodes, orphan: createNode({ id: 'orphan', text: 'lost', parentId: null }) }
    };
    expect(codesOf(broken)).toContain('ORPHAN');
  });

  it('reports a cycle in the child links', () => {
    const map = sampleMap();
    const broken = {
      ...map,
      nodes: {
        ...map.nodes,
        n3: { ...map.nodes.n3, children: [map.rootId] }
      }
    };
    expect(codesOf(broken)).toContain('CYCLE');
  });

  it('reports a link that points at an unknown node', () => {
    const map = sampleMap();
    const broken = { ...map, links: [{ id: 'l1', from: 'n2', to: 'ghost', label: '' }] };
    expect(codesOf(broken)).toContain('UNKNOWN_LINK_ENDPOINT');
  });

  describe('node fields, because every importer ends here', () => {
    const withField = (field, value) => {
      const map = sampleMap();
      return { ...map, nodes: { ...map.nodes, n2: { ...map.nodes.n2, [field]: value } } };
    };

    it.each([
      ['symbol', () => 'x'],
      ['symbol', 7],
      ['symbol', {}],
      ['colour', 8],
      ['colour', -1],
      ['colour', 1.5],
      ['colour', '3'],
      ['done', 'yes'],
      ['collapsed', 1],
      ['collapsed', null],
      ['text', 7],
      ['notes', null]
    ])('reports a %s of %p', (field, value) => {
      const problems = validateMap(withField(field, value));
      expect(problems.map(problem => problem.code)).toEqual(['BAD_FIELD']);
      expect(problems[0].id).toBe('n2');
      expect(problems[0].message).toContain(field);
    });

    it.each([
      ['symbol', null],
      ['symbol', '⭐'],
      ['colour', null],
      ['colour', 0],
      ['colour', 7],
      ['done', true],
      ['collapsed', true],
      // A map stored before a field existed has no such key, and must still save.
      ['symbol', undefined],
      ['colour', undefined],
      ['done', undefined]
    ])('accepts a %s of %p', (field, value) => {
      expect(validateMap(withField(field, value))).toEqual([]);
    });

    it('refuses the function a prototype lookup hands an importer, before the store tries to clone it', () => {
      const map = withField('symbol', {}.constructor);
      expect(() => structuredClone(map)).toThrow();
      expect(codesOf(map)).toContain('BAD_FIELD');
    });
  });

  it('gives every problem a readable message', () => {
    const problems = validateMap({ ...sampleMap(), rootId: 'ghost' });
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(typeof problem.message).toBe('string');
      expect(problem.message.length).toBeGreaterThan(5);
    }
  });
});
