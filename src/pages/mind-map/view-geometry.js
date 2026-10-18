/**
 * Where the canvas may put things, as arithmetic.
 *
 * At full width a dock is a column beside the canvas, and the canvas simply gets narrower. Below
 * 900px a dock is a sheet laid over it: the canvas keeps its size and loses part of its view, and
 * nothing the browser reports says so. The page tells the pane what is covered, and these functions
 * turn that into the rectangle that is left and the moves that keep a node inside it.
 *
 * No DOM and no d3 in here, so that the numbers can be tested where there is no layout engine.
 *
 * @module pages/mind-map/view-geometry
 */

/**
 * @typedef {{x: number, y: number, w: number, h: number}} Rect
 */

/**
 * The largest rectangle of the view that a covering sheet leaves free.
 *
 * A sheet comes in from one edge, so what it leaves is one of four strips: to its left, to its
 * right, above it or below it. The largest wins. When that is nothing, or too thin to show a node
 * in, the whole view is returned instead: there is nowhere better to move anything, and a pan the
 * student cannot see the result of is worse than no pan.
 *
 * @param {{w: number, h: number}} view - the canvas's own size.
 * @param {Rect|null} covered - the sheet, in the canvas's coordinates; null when nothing is open.
 * @param {number} [minimum=0] - the narrowest strip worth moving into, in pixels.
 * @returns {Rect}
 */
export function uncoveredRegion(view, covered, minimum = 0) {
  const whole = { x: 0, y: 0, w: view.w, h: view.h };
  if (!covered) {
    return whole;
  }

  const left = Math.max(covered.x, 0);
  const top = Math.max(covered.y, 0);
  const right = Math.min(covered.x + covered.w, view.w);
  const bottom = Math.min(covered.y + covered.h, view.h);
  if (right <= left || bottom <= top) {
    return whole;
  }

  const strips = [
    { x: 0, y: 0, w: left, h: view.h },
    { x: right, y: 0, w: view.w - right, h: view.h },
    { x: 0, y: 0, w: view.w, h: top },
    { x: 0, y: bottom, w: view.w, h: view.h - bottom },
  ];
  const best = strips.reduce((widest, strip) =>
    strip.w * strip.h > widest.w * widest.h ? strip : widest
  );
  const usable = best.w > 0 && best.h > 0 && best.w >= minimum && best.h >= minimum;
  return usable ? best : whole;
}

/**
 * @param {{left: number, top: number, right: number, bottom: number}} box - on screen.
 * @param {Rect} region
 * @param {number} margin - how close to the region's edge still counts as comfortably in view.
 * @returns {boolean} true when the whole box is inside the region with the margin to spare.
 */
export function isClearOf(box, region, margin) {
  return (
    box.left >= region.x + margin &&
    box.top >= region.y + margin &&
    box.right <= region.x + region.w - margin &&
    box.bottom <= region.y + region.h - margin
  );
}

/**
 * @param {Rect} region
 * @param {{x: number, y: number}} point - in layout coordinates.
 * @param {number} k - the scale the view is at, which the move keeps.
 * @returns {{x: number, y: number}} the translation that puts the point in the region's middle.
 */
export function centreOn(region, point, k) {
  return {
    x: region.x + region.w / 2 - k * point.x,
    y: region.y + region.h / 2 - k * point.y,
  };
}

/**
 * The view that shows all of `bounds` inside a region.
 *
 * @param {Rect} region
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds - layout coordinates.
 * @param {{padding: number, minScale: number, maxScale: number}} limits
 * @returns {{x: number, y: number, k: number}} a translation and a scale.
 */
export function fitInto(region, bounds, { padding, minScale, maxScale }) {
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  // Never magnify past life size: a two-node map blown up to 3x is disorienting, not helpful.
  const k = Math.min(
    Math.max(Math.min(region.w / width, region.h / height, 1), minScale),
    maxScale
  );
  const middle = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  return { ...centreOn(region, middle, k), k };
}
