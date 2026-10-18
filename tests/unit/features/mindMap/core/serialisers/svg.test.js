import { toSVG } from '../../../../../../src/features/mindMap/core/serialisers/svg.js';
import { layoutMap } from '../../../../../../src/features/mindMap/core/layout.js';
import { BRANCH_COLOURS } from '../../../../../../src/features/mindMap/core/palette.js';
import { setColour } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { buildMap, sampleMap } from '../fixtures.js';

const render = (map, options) => toSVG(map, layoutMap(map, { mode: 'map' }), options);

describe('toSVG', () => {
  it('emits one self-contained svg element with no external reference', () => {
    const svg = render(sampleMap());
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/viewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/);
    expect(svg).not.toMatch(/<script|href=|xlink|url\(/);
  });

  it('names itself for assistive technology', () => {
    const svg = render(sampleMap());
    expect(svg).toMatch(/<title id="([^"]+)">Map<\/title>/);
    const id = svg.match(/<title id="([^"]+)">/)[1];
    expect(svg).toContain(`aria-labelledby="${id}"`);
    expect(svg).toContain('role="img"');
  });

  it('draws one presentation group per node, each with a rounded rect and its text', () => {
    const svg = render(sampleMap());
    const groups = svg.match(/<g role="presentation">/g);
    expect(groups).toHaveLength(6);
    expect(svg.match(/<rect /g).length).toBeGreaterThanOrEqual(6);
    expect(svg).toContain('rx="8"');
    expect(svg).toContain('>Alpha one</tspan>');
  });

  it('wraps long text into one tspan per line', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const svg = render(buildMap({ text: long, children: [] }));
    const tspans = svg.match(/<tspan /g);
    expect(tspans.length).toBeGreaterThan(1);
    expect(svg).toContain('one two three four five six');
  });

  it('draws one path per edge', () => {
    const svg = render(sampleMap());
    expect(svg.match(/<path /g)).toHaveLength(5);
    expect(svg).toContain('fill="none"');
  });

  it('paints from the palette, inheriting a branch colour down the subtree', () => {
    const map = setColour(sampleMap(), { id: 'n2', colour: 3 });
    const svg = render(map);
    expect(svg).toContain(`fill="${BRANCH_COLOURS[3].fill}"`);
    expect(svg).toContain(`fill="${BRANCH_COLOURS[0].fill}"`);
    expect(svg).toContain(`fill="${BRANCH_COLOURS[3].ink}"`);
  });

  it('paints a background that matches the theme it is asked for', () => {
    expect(render(sampleMap(), { theme: 'light' })).toContain('#ffffff');
    expect(render(sampleMap(), { theme: 'dark' })).toContain('#111111');
    expect(render(sampleMap())).toBe(render(sampleMap(), { theme: 'light' }));
  });

  it('escapes text rather than letting it become markup', () => {
    const map = buildMap({ text: 'Fish & <chips> "best"', children: [] }, { title: 'A & <B>' });
    const svg = render(map);
    expect(svg).toContain('<title id="mindmap-title">A &amp; &lt;B&gt;</title>');
    expect(svg).toContain('Fish &amp; &lt;chips&gt;');
    expect(svg).not.toContain('<chips>');
  });

  it('is deterministic', () => {
    const map = sampleMap();
    expect(render(map)).toBe(render(map));
  });
});
