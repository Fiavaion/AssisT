import { fromJSON, toJSON } from '../../../../../../src/features/mindMap/core/serialisers/json.js';
import { MindMapError } from '../../../../../../src/features/mindMap/core/map-model.js';
import { randomMap, sampleMap } from '../fixtures.js';

const codeOf = run => {
  try {
    run();
  } catch (error) {
    return error.code;
  }
  return null;
};

describe('toJSON', () => {
  it('writes indented JSON that parses back to the same object', () => {
    const map = sampleMap();
    const text = toJSON(map);
    expect(text).toContain('\n  ');
    expect(JSON.parse(text)).toEqual(map);
  });
});

describe('fromJSON', () => {
  it('round-trips every field, including links and timestamps', () => {
    const map = {
      ...sampleMap(),
      links: [{ id: 'l1', from: 'n3', to: 'n6', label: 'compare' }],
      source: { url: 'https://example.org/a', title: 'A' },
      createdAt: 5,
      updatedAt: 9
    };
    expect(fromJSON(toJSON(map))).toEqual(map);
  });

  it('round-trips generated maps', () => {
    for (const seed of [51, 52, 53]) {
      const map = randomMap(seed, { nodes: 20 });
      expect(fromJSON(toJSON(map))).toEqual(map);
    }
  });

  it('fills fields an older file left out', () => {
    const map = sampleMap();
    const thin = JSON.parse(toJSON(map));
    delete thin.nodes.n3.done;
    delete thin.nodes.n3.symbol;
    delete thin.links;
    expect(fromJSON(JSON.stringify(thin)).nodes.n3).toMatchObject({ done: false, symbol: null });
    expect(fromJSON(JSON.stringify(thin)).links).toEqual([]);
  });

  it('rejects text that is not JSON', () => {
    expect(codeOf(() => fromJSON('{ not json'))).toBe('BAD_JSON');
    expect(() => fromJSON('')).toThrow(MindMapError);
  });

  it('rejects JSON that is not a map object', () => {
    expect(codeOf(() => fromJSON('[]'))).toBe('BAD_SCHEMA');
    expect(codeOf(() => fromJSON('42'))).toBe('BAD_SCHEMA');
  });

  it('rejects a schema it does not know', () => {
    const wrong = { ...sampleMap(), schema: 'assist-mindmap/2' };
    expect(codeOf(() => fromJSON(JSON.stringify(wrong)))).toBe('BAD_SCHEMA');
  });

  it('rejects a structurally broken map and says what is wrong', () => {
    const broken = { ...sampleMap(), rootId: 'ghost' };
    let thrown = null;
    try {
      fromJSON(JSON.stringify(broken));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MindMapError);
    expect(thrown.code).toBe('INVALID_MAP');
    expect(Array.isArray(thrown.problems)).toBe(true);
    expect(thrown.problems.map(problem => problem.code)).toContain('BAD_ROOT');
    expect(thrown.message).toMatch(/root/i);
  });
});
