/**
 * Where the canvas may put things: plain arithmetic, no DOM.
 *
 * Below 900px a dock is a sheet laid over the canvas, so the canvas has to work out what is left of
 * its own view and keep the node the student is working on inside that. jsdom has no layout, so
 * the pane's tests can only show that the numbers are used; these show that they are right.
 */

import {
  centreOn,
  fitInto,
  isClearOf,
  uncoveredRegion,
} from '../../../../src/pages/mind-map/view-geometry.js';

const VIEW = { w: 800, h: 600 };

describe('uncoveredRegion', () => {
  it('is the whole view when nothing covers it', () => {
    expect(uncoveredRegion(VIEW, null)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it('is what lies to the left of a sheet on the right', () => {
    expect(uncoveredRegion(VIEW, { x: 440, y: 0, w: 360, h: 600 })).toEqual({
      x: 0,
      y: 0,
      w: 440,
      h: 600,
    });
  });

  it('is what lies to the right of a sheet on the left', () => {
    expect(uncoveredRegion(VIEW, { x: 0, y: 0, w: 360, h: 600 })).toEqual({
      x: 360,
      y: 0,
      w: 440,
      h: 600,
    });
  });

  it('is what lies above a sheet along the bottom', () => {
    expect(uncoveredRegion(VIEW, { x: 0, y: 400, w: 800, h: 200 })).toEqual({
      x: 0,
      y: 0,
      w: 800,
      h: 400,
    });
  });

  it('takes the larger side of something in the middle', () => {
    expect(uncoveredRegion(VIEW, { x: 100, y: 0, w: 200, h: 600 })).toEqual({
      x: 300,
      y: 0,
      w: 500,
      h: 600,
    });
  });

  it('counts only the part of the sheet that is over the view', () => {
    // A sheet that starts left of the canvas and runs past its bottom edge.
    expect(uncoveredRegion(VIEW, { x: -200, y: -50, w: 500, h: 900 })).toEqual({
      x: 300,
      y: 0,
      w: 500,
      h: 600,
    });
  });

  it('ignores something that does not touch the view at all', () => {
    const whole = { x: 0, y: 0, w: 800, h: 600 };
    expect(uncoveredRegion(VIEW, { x: 900, y: 0, w: 360, h: 600 })).toEqual(whole);
    expect(uncoveredRegion(VIEW, { x: -500, y: 0, w: 360, h: 600 })).toEqual(whole);
    expect(uncoveredRegion(VIEW, { x: 0, y: -900, w: 800, h: 300 })).toEqual(whole);
    expect(uncoveredRegion(VIEW, { x: 0, y: 700, w: 800, h: 300 })).toEqual(whole);
  });

  // At 320px a 360px sheet covers the canvas whole. There is nowhere to move anything to, and a
  // pan the student cannot see is worse than none.
  it('gives the whole view back when the sheet covers it all', () => {
    expect(uncoveredRegion({ w: 320, h: 500 }, { x: 0, y: 0, w: 360, h: 500 })).toEqual({
      x: 0,
      y: 0,
      w: 320,
      h: 500,
    });
  });

  it('gives the whole view back when what is left is too thin to show a node in', () => {
    const sliver = { x: 0, y: 0, w: 760, h: 600 };
    expect(uncoveredRegion(VIEW, sliver, 96)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(uncoveredRegion(VIEW, sliver, 40)).toEqual({ x: 760, y: 0, w: 40, h: 600 });
  });
});

describe('isClearOf', () => {
  const region = { x: 360, y: 0, w: 440, h: 600 };

  it('is true for a box inside the region with the margin to spare', () => {
    expect(isClearOf({ left: 400, top: 100, right: 500, bottom: 140 }, region, 24)).toBe(true);
  });

  it('is false for a box under the sheet, or only partly out from under it', () => {
    expect(isClearOf({ left: 100, top: 100, right: 200, bottom: 140 }, region, 24)).toBe(false);
    expect(isClearOf({ left: 340, top: 100, right: 440, bottom: 140 }, region, 24)).toBe(false);
  });

  it('is false for a box closer to the edge than the margin', () => {
    expect(isClearOf({ left: 370, top: 100, right: 470, bottom: 140 }, region, 24)).toBe(false);
    expect(isClearOf({ left: 384, top: 24, right: 776, bottom: 576 }, region, 24)).toBe(true);
    expect(isClearOf({ left: 384, top: 24, right: 777, bottom: 576 }, region, 24)).toBe(false);
  });
});

describe('centreOn', () => {
  it('gives the translation that puts a layout point in the middle of the region', () => {
    const region = { x: 360, y: 0, w: 440, h: 600 };
    const move = centreOn(region, { x: 100, y: -40 }, 2);

    // Where the point lands on screen: translate + scale * point.
    expect(move.x + 2 * 100).toBe(580);
    expect(move.y + 2 * -40).toBe(300);
  });
});

describe('fitInto', () => {
  const limits = { padding: 32, minScale: 0.2, maxScale: 3 };

  it('centres the bounds in the region without magnifying a small map', () => {
    const region = { x: 360, y: 0, w: 440, h: 600 };
    const bounds = { minX: -50, minY: -20, maxX: 50, maxY: 20 };

    const fit = fitInto(region, bounds, limits);

    expect(fit.k).toBe(1);
    expect(fit.x).toBe(580);
    expect(fit.y).toBe(300);
  });

  it('shrinks a map that is wider than the region, padding included', () => {
    const region = { x: 0, y: 0, w: 440, h: 600 };
    const bounds = { minX: 0, minY: 0, maxX: 816, maxY: 100 };

    const fit = fitInto(region, bounds, limits);

    expect(fit.k).toBe(0.5);
    // The left and right edges of the map land inside the region, with the padding outside them.
    expect(fit.x + fit.k * bounds.minX).toBe(16);
    expect(fit.x + fit.k * bounds.maxX).toBe(424);
  });

  it('never goes below the smallest scale the canvas allows', () => {
    const fit = fitInto(
      { x: 0, y: 0, w: 100, h: 100 },
      { minX: 0, minY: 0, maxX: 10000, maxY: 10 },
      limits
    );

    expect(fit.k).toBe(0.2);
  });
});
