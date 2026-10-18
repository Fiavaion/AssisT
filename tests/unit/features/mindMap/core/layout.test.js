import { layoutMap, wrapText } from '../../../../../src/features/mindMap/core/layout.js';
import { toggleCollapsed } from '../../../../../src/features/mindMap/core/map-ops.js';
import { buildMap, randomMap, sampleMap } from './fixtures.js';

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Assert that not one pair of node boxes intersects. */
function expectNoOverlaps(nodes) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlaps(nodes[i], nodes[j])) {
        throw new Error(
          `${nodes[i].id} (${nodes[i].x},${nodes[i].y},${nodes[i].w}x${nodes[i].h}) overlaps ` +
            `${nodes[j].id} (${nodes[j].x},${nodes[j].y},${nodes[j].w}x${nodes[j].h})`
        );
      }
    }
  }
}

/** Forty nodes at mixed depths: wide shallow branches beside a deep narrow one. */
function fortyNodeMap() {
  const child = (text, children) => ({ text, children });
  const chain = (prefix, depth) =>
    depth === 0 ? [] : [child(`${prefix} ${depth}`, chain(prefix, depth - 1))];
  return buildMap({
    text: 'Dissertation plan',
    children: [
      child('Introduction', [
        child('Context and why this matters right now', []),
        child('Research question', [child('Sub question one', []), child('Sub question two', [])]),
        child('Scope', [child('In scope', []), child('Out of scope', [])])
      ]),
      child('Literature', chain('Deep strand', 8)),
      child('Method', [
        child('Participants', [child('Recruitment', []), child('Consent', []), child('Access needs', [])]),
        child('Materials', [child('Screen reader test rig', [])]),
        child('Procedure', [])
      ]),
      child('Results', [
        child('Quantitative', [child('Task completion', []), child('Time on task', [])]),
        child('Qualitative', [child('Themes', [child('Frustration', []), child('Relief', [])])])
      ]),
      child('Discussion', [child('Limitations', []), child('Future work', [])]),
      child('Conclusion', []),
      child('Appendix A the very long title that has to wrap over several lines', []),
      child('Appendix B', [])
    ]
  });
}

describe('wrapText', () => {
  it('returns one line when the text fits', () => {
    expect(wrapText('Short enough', 28)).toEqual(['Short enough']);
  });

  it('wraps on word boundaries at the limit', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog again', 28);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(28);
    }
    expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog again');
  });

  it('breaks a single word that cannot fit', () => {
    const lines = wrapText('antidisestablishmentarianismandthensome', 28);
    expect(lines[0].length).toBe(28);
    expect(lines.join('')).toBe('antidisestablishmentarianismandthensome');
  });

  it('collapses runs of whitespace and always returns at least one line', () => {
    expect(wrapText('  spaced   out  ', 28)).toEqual(['spaced out']);
    expect(wrapText('', 28)).toEqual(['']);
  });
});

describe('layoutMap', () => {
  it('returns a box for every visible node, with edges and bounds', () => {
    const result = layoutMap(sampleMap(), { mode: 'tree' });
    expect(result.nodes.map(node => node.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
    expect(result.edges).toHaveLength(5);
    expect(result.bounds).toEqual({
      minX: expect.any(Number),
      minY: expect.any(Number),
      maxX: expect.any(Number),
      maxY: expect.any(Number)
    });
    for (const node of result.nodes) {
      expect(node.w).toBeGreaterThanOrEqual(80);
      expect(node.w).toBeLessThanOrEqual(260);
      expect(node.h).toBeGreaterThanOrEqual(36);
    }
  });

  it('sizes a node from its text per the contract', () => {
    const map = buildMap({ text: 'ab', children: [{ text: 'x'.repeat(20) }] });
    const [root, child] = layoutMap(map, { mode: 'tree' }).nodes;
    expect(root.w).toBe(80);
    expect(root.h).toBe(36);
    expect(child.w).toBe(8 * 20 + 24);
  });

  it('grows the height by one line for every wrapped line', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const map = buildMap({ text: long, children: [] });
    const [root] = layoutMap(map, { mode: 'tree' }).nodes;
    expect(root.h).toBe(36 + 18 * (wrapText(long, 28).length - 1));
    expect(root.w).toBe(260);
  });

  it('skips a collapsed subtree in both modes', () => {
    const map = toggleCollapsed(sampleMap(), { id: 'n2' });
    for (const mode of ['map', 'tree']) {
      const result = layoutMap(map, { mode });
      expect(result.nodes.map(node => node.id)).toEqual(['n1', 'n2', 'n5', 'n6']);
      expect(result.edges.some(edge => edge.to === 'n3')).toBe(false);
    }
  });

  it('is deterministic', () => {
    const map = fortyNodeMap();
    expect(layoutMap(map, { mode: 'map' })).toEqual(layoutMap(map, { mode: 'map' }));
    expect(layoutMap(map, { mode: 'tree' })).toEqual(layoutMap(map, { mode: 'tree' }));
  });

  it('defaults to map mode and rejects a mode it does not know', () => {
    const map = sampleMap();
    expect(layoutMap(map)).toEqual(layoutMap(map, { mode: 'map' }));
    expect(() => layoutMap(map, { mode: 'radial' })).toThrow(/radial/);
  });

  it('tiers left to right in tree mode, with every child right of its parent', () => {
    const { nodes } = layoutMap(fortyNodeMap(), { mode: 'tree' });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const byDepth = new Map();
    for (const node of nodes) {
      expect(byDepth.get(node.depth) ?? node.x).toBe(node.x);
      byDepth.set(node.depth, node.x);
    }
    for (const node of nodes) {
      if (node.depth > 0) {
        expect(node.x).toBeGreaterThan(byDepth.get(node.depth - 1));
      }
    }
    expect(byId.get('n1').depth).toBe(0);
  });

  it('centres the root and alternates the first level right then left in map mode', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }, { text: 'Four' }]
    });
    const { nodes } = layoutMap(map, { mode: 'map' });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const root = byId.get('n1');
    expect(root.side).toBe('root');
    expect(byId.get('n2').side).toBe('right');
    expect(byId.get('n3').side).toBe('left');
    expect(byId.get('n4').side).toBe('right');
    expect(byId.get('n5').side).toBe('left');
    expect(byId.get('n2').x).toBeGreaterThan(root.x + root.w);
    expect(byId.get('n3').x + byId.get('n3').w).toBeLessThan(root.x);
  });

  it('gives a descendant the side of its first-level ancestor', () => {
    const { nodes } = layoutMap(fortyNodeMap(), { mode: 'map' });
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
      if (node.depth >= 2) {
        expect(['left', 'right']).toContain(node.side);
      }
    }
    expect(byId.get('n2').side).toBe('right');
  });

  it('never overlaps two node boxes, in either mode', () => {
    const map = fortyNodeMap();
    expect(layoutMap(map, { mode: 'tree' }).nodes).toHaveLength(40);
    expectNoOverlaps(layoutMap(map, { mode: 'tree' }).nodes);
    expectNoOverlaps(layoutMap(map, { mode: 'map' }).nodes);
  });

  it('never overlaps on randomly shaped maps either', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = randomMap(seed, { nodes: 30 });
      expectNoOverlaps(layoutMap(map, { mode: 'tree' }).nodes);
      expectNoOverlaps(layoutMap(map, { mode: 'map' }).nodes);
    }
  });

  it('draws every edge as a cubic bezier between the two boxes', () => {
    const { nodes, edges } = layoutMap(sampleMap(), { mode: 'map' });
    const byId = new Map(nodes.map(node => [node.id, node]));
    expect(edges).toHaveLength(5);
    for (const edge of edges) {
      expect(byId.has(edge.from)).toBe(true);
      expect(byId.has(edge.to)).toBe(true);
      expect(edge.path).toMatch(/^M -?[\d.]+ -?[\d.]+ C /);
      expect(edge.path.split('C')).toHaveLength(2);
      expect(edge.path).not.toMatch(/NaN|Infinity/);
    }
  });

  it('reports bounds that contain every box', () => {
    const { nodes, bounds } = layoutMap(fortyNodeMap(), { mode: 'map' });
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(node.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(node.x + node.w).toBeLessThanOrEqual(bounds.maxX);
      expect(node.y + node.h).toBeLessThanOrEqual(bounds.maxY);
    }
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });

  it('lays out a single-node map', () => {
    const map = buildMap({ text: 'Alone', children: [] });
    const result = layoutMap(map, { mode: 'map' });
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
    expect(result.bounds.maxX - result.bounds.minX).toBe(result.nodes[0].w);
  });
});
