/**
 * SVG snapshot of the canvas — a picture of the map that can be dropped into a document or an
 * assignment, and the source the PNG export rasterises.
 *
 * The file is self-contained: no stylesheet, no font file, no script, nothing to fetch. It is built
 * as a string rather than through the DOM because core carries no DOM (ADR 0001), which also means
 * every value that reaches the markup is escaped by hand, with the escape every XML writer shares:
 * it leaves out the characters XML 1.0 forbids, and a browser refuses to draw, and so to rasterise,
 * a picture that holds one.
 *
 * Named by `<title>` and pointed at by `aria-labelledby`, so an embedded map announces itself. The
 * node groups are `role="presentation"`: the accessible content of a mind map is its outline, and
 * a screen reader crawling a picture of boxes would only get in the way of that.
 */

import { wrapText } from '../layout.js';
import { colourResolver } from '../palette.js';
import { escapeXml } from './xml-scan.js';

/** Matches the layout's box geometry. */
const CORNER_RADIUS = 8;
const LINE_HEIGHT = 18;
const PADDING = 24;

/** Edges and node text take their colour from the branch, so a theme only sets the ground. */
const THEMES = {
  light: { background: '#ffffff' },
  dark: { background: '#111111' },
};

const TITLE_ID = 'mindmap-title';

/**
 * Render a laid-out map as one SVG document.
 *
 * @param {Object} map
 * @param {{nodes: Array<Object>, edges: Array<Object>, bounds: Object}} layout - from layoutMap.
 * @param {Object} [options]
 * @param {'light'|'dark'} [options.theme='light']
 * @returns {string} a complete `<svg>` element.
 */
export function toSVG(map, layout, options = {}) {
  const theme = THEMES[options.theme] || THEMES.light;
  const { bounds } = layout;
  const minX = bounds.minX - PADDING;
  const minY = bounds.minY - PADDING;
  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" ` +
      `width="${width}" height="${height}" role="img" aria-labelledby="${TITLE_ID}">`,
    `<title id="${TITLE_ID}">${escapeXml(map.title)}</title>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${theme.background}"/>`,
  ];

  const colourOf = colourResolver(map);

  for (const edge of layout.edges) {
    const stroke = colourOf(edge.to).fill;
    parts.push(`<path d="${edge.path}" fill="none" stroke="${stroke}" stroke-width="2"/>`);
  }

  for (const node of layout.nodes) {
    const colour = colourOf(node.id);
    const lines = wrapText(map.nodes[node.id].text, 28);
    // First baseline sits so the block of lines is centred in the box.
    const firstBaseline = node.y + node.h / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2 + 5;
    const centreX = node.x + node.w / 2;

    parts.push('<g role="presentation">');
    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${CORNER_RADIUS}" ` +
        `fill="${colour.fill}" stroke="${theme.background}" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${centreX}" y="${firstBaseline}" fill="${colour.ink}" font-family="system-ui, sans-serif" ` +
        `font-size="14" text-anchor="middle">` +
        lines
          .map(
            (line, at) =>
              `<tspan x="${centreX}" dy="${at === 0 ? 0 : LINE_HEIGHT}">${escapeXml(line)}</tspan>`
          )
          .join('') +
        '</text>'
    );
    parts.push('</g>');
  }

  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}
