import {
  BRANCH_COLOURS,
  colourResolver,
  nearestBranchColour
} from '../../../../../src/features/mindMap/core/palette.js';
import { setColour } from '../../../../../src/features/mindMap/core/map-ops.js';
import { sampleMap } from './fixtures.js';

/**
 * WCAG 2.2 relative luminance and contrast, implemented here rather than imported, so the palette
 * is graded against the specification instead of against the extension's own helper.
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
function channel(value) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const int = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)
  );
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('the contrast maths this suite grades with', () => {
  it('reproduces the known WCAG values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('BRANCH_COLOURS', () => {
  it('offers eight named pairs', () => {
    expect(BRANCH_COLOURS).toHaveLength(8);
    const names = BRANCH_COLOURS.map(colour => colour.name);
    expect(new Set(names).size).toBe(8);
    const fills = BRANCH_COLOURS.map(colour => colour.fill);
    expect(new Set(fills).size).toBe(8);
    for (const colour of BRANCH_COLOURS) {
      expect(colour.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(colour.ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof colour.name).toBe('string');
    }
  });

  it('reads its ink at 4.5:1 or better on its own fill', () => {
    const failures = BRANCH_COLOURS
      .filter(colour => contrast(colour.ink, colour.fill) < 4.5)
      .map(colour => `${colour.name} ${contrast(colour.ink, colour.fill).toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });

  it('stands out at 3:1 or better against a white page and a dark one', () => {
    const failures = BRANCH_COLOURS
      .filter(colour => contrast(colour.fill, '#ffffff') < 3 || contrast(colour.fill, '#111111') < 3)
      .map(
        colour =>
          `${colour.name} white ${contrast(colour.fill, '#ffffff').toFixed(2)}:1 ` +
          `dark ${contrast(colour.fill, '#111111').toFixed(2)}:1`
      );
    expect(failures).toEqual([]);
  });
});

/**
 * `colourResolver` is the whole of the surface: the outline swatch, the canvas fill and the SVG
 * all ask it, and none of them can see the index behind it.
 */
describe('colourResolver', () => {
  it('gives the root the first colour by default', () => {
    const map = sampleMap();
    expect(colourResolver(map)(map.rootId)).toBe(BRANCH_COLOURS[0]);
  });

  it('inherits from the nearest coloured ancestor', () => {
    const map = setColour(sampleMap(), { id: 'n2', colour: 3 });
    expect(colourResolver(map)('n2')).toBe(BRANCH_COLOURS[3]);
    expect(colourResolver(map)('n3')).toBe(BRANCH_COLOURS[3]);
    expect(colourResolver(map)('n5')).toBe(BRANCH_COLOURS[0]);
  });

  it('prefers a colour set on the node over an inherited one', () => {
    let map = setColour(sampleMap(), { id: 'n2', colour: 3 });
    map = setColour(map, { id: 'n3', colour: 6 });
    expect(colourResolver(map)('n3')).toBe(BRANCH_COLOURS[6]);
  });

  it('falls back to the first colour for a node it cannot find', () => {
    expect(colourResolver(sampleMap())('ghost')).toBe(BRANCH_COLOURS[0]);
  });
});

describe('nearestBranchColour', () => {
  it('finds every palette fill exactly, in any case and any hex length', () => {
    BRANCH_COLOURS.forEach((colour, index) => {
      expect(nearestBranchColour(colour.fill)).toBe(index);
      expect(nearestBranchColour(colour.fill.toUpperCase())).toBe(index);
      expect(nearestBranchColour(`  ${colour.fill}80 `)).toBe(index);
    });
    expect(nearestBranchColour('#06c')).toBe(0);
  });

  it('snaps a foreign colour to the nearest fill', () => {
    expect(nearestBranchColour('#0a66cc')).toBe(0);
    expect(nearestBranchColour('#0a7d0c')).toBe(3);
    expect(nearestBranchColour('#ff0000')).toBe(6);
  });

  it('leaves a colour with no hue to inherit, because grey names no branch', () => {
    for (const grey of ['#000000', '#ffffff', '#9a9a9a', '#333', '#808890']) {
      expect(nearestBranchColour(grey)).toBeNull();
    }
  });

  it('reads anything that is not a hex colour as nothing', () => {
    for (const value of ['', 'red', '#12', '#12345', '#gggggg', 'constructor', null, undefined, 7, {}]) {
      expect(nearestBranchColour(value)).toBeNull();
    }
  });
});
