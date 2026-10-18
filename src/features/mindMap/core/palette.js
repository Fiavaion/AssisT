/**
 * Branch colours.
 *
 * Colour on a mind map carries meaning — it is how a student tells one branch from another at a
 * glance — so every pair has to survive the accessibility floor rather than merely look right:
 *
 *  - the ink reads on its own fill at 4.5:1 or better (WCAG 2.2 SC 1.4.3);
 *  - the fill itself separates from a white page and from the dark theme's #111 at 3:1 or better
 *    (SC 1.4.11), so a filled node is still a distinct object on either ground.
 *
 * These were searched for against those three ratios rather than picked by eye; the suite in
 * tests/unit/features/mindMap/core/palette.test.js recomputes them from the WCAG formula, so a
 * "nicer" colour that fails cannot land. Measured margins: ink 5.30-5.35:1, white 5.30-5.35:1,
 * dark 3.53-3.56:1.
 *
 * The order alternates warm and cool so that neighbouring branches, which take consecutive indexes,
 * differ in hue as well as in ratio. Colour is never the only signal: the outline carries the same
 * structure as text.
 */

/** @type {ReadonlyArray<{name: string, fill: string, ink: string}>} */
export const BRANCH_COLOURS = Object.freeze([
  Object.freeze({ name: 'Blue', fill: '#0b68d3', ink: '#ffffff' }),
  Object.freeze({ name: 'Orange', fill: '#ad510b', ink: '#ffffff' }),
  Object.freeze({ name: 'Violet', fill: '#8d34f4', ink: '#ffffff' }),
  Object.freeze({ name: 'Green', fill: '#087d0c', ink: '#ffffff' }),
  Object.freeze({ name: 'Magenta', fill: '#cb0b85', ink: '#ffffff' }),
  Object.freeze({ name: 'Teal', fill: '#087874', ink: '#ffffff' }),
  Object.freeze({ name: 'Red', fill: '#d31b0d', ink: '#ffffff' }),
  Object.freeze({ name: 'Amber', fill: '#816908', ink: '#ffffff' }),
]);

/**
 * A colour this close to grey carries no branch meaning (black body text, a grey default border),
 * so it is left to inherit rather than snapped to whichever palette entry happens to be nearest.
 */
const NEUTRAL_CHROMA = 40;

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as three channels; null for anything else. */
function parseHex(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const digits = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(digits)) {
    return null;
  }
  if (digits.length === 3) {
    return [0, 1, 2].map(at => parseInt(digits[at] + digits[at], 16));
  }
  if (digits.length === 6 || digits.length === 8) {
    return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16));
  }
  return null;
}

/**
 * The branch colour a colour from another tool becomes, so an imported map keeps the student's
 * grouping while every node still meets the contrast this palette was searched for.
 *
 * @param {*} hex - `#rgb`, `#rrggbb` or `#rrggbbaa`, as another tool wrote it.
 * @returns {number|null} an index into BRANCH_COLOURS, or null to inherit from the branch: for a
 *   grey, and for anything that is not a hex colour.
 */
export function nearestBranchColour(hex) {
  const rgb = parseHex(hex);
  if (!rgb || Math.max(...rgb) - Math.min(...rgb) < NEUTRAL_CHROMA) {
    return null;
  }
  let nearest = null;
  let best = Infinity;
  BRANCH_COLOURS.forEach((colour, index) => {
    const target = parseHex(colour.fill);
    const distance =
      (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest;
}

/**
 * The colours of one map's nodes, for a caller that wants many of them.
 *
 * A node draws with its own colour when it has one and otherwise with the nearest ancestor's, which
 * is what makes a whole branch share a colour after one edit at its head. Every answer is kept,
 * along with the answer for each ancestor passed on the way to it, so colouring every node of a map
 * costs one step per node rather than one climb to the root per node. An unknown node, and a map
 * where nothing sets a colour, get the first.
 *
 * @param {Object} map - the resolver is for this map object and no later version of it.
 * @returns {(nodeId: string) => {name: string, fill: string, ink: string}}
 */
export function colourResolver(map) {
  // Own keys only: `map-model.js` imports this module, so its `nodeAt` cannot be imported here.
  const own = id => (typeof id === 'string' && Object.hasOwn(map.nodes, id) ? map.nodes[id] : null);
  const known = new Map();

  return nodeId => {
    const climbed = new Set();
    let index = 0;
    let node = own(nodeId);
    while (node && !climbed.has(node.id)) {
      if (known.has(node.id)) {
        index = known.get(node.id);
        break;
      }
      if (
        Number.isInteger(node.colour) &&
        node.colour >= 0 &&
        node.colour < BRANCH_COLOURS.length
      ) {
        index = node.colour;
        break;
      }
      climbed.add(node.id);
      node = own(node.parentId);
    }
    for (const id of climbed) {
      known.set(id, index);
    }
    return BRANCH_COLOURS[index];
  };
}
