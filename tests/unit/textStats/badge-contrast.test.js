/**
 * @jest-environment jsdom
 *
 * The text statistics badge is injected into somebody else's page, so every ratio it depends on has
 * to come from its own values. Overnight release testing measured what the hand-picked colours were
 * worth: the "Text Stats" heading 3.28:1, "View Details" 3.29:1, and "⚡ Speed Read" white on a
 * gradient whose light end gave 3.66:1 — all three under the 4.5:1 SC 1.4.3 asks for at 12-13px.
 *
 * Every ratio below is computed from the shipped constants, the gradient's lightest stop included,
 * with the same contrast maths the annotation palette is graded by. The badge renders in two
 * flavours, light and dark, and both are graded: the badge paints its own surface, so a dark host
 * page does not change the numbers.
 */

import {
  compositeOver,
  contrastRatio,
  parseCssColor,
} from '../../../src/features/annotations/annotation-colors.js';
import { BADGE_COLORS } from '../../../src/features/textStats/textStats-ui.js';

const AA_TEXT = 4.5;

/** A CSS colour as an opaque triple, painted over the page beneath it when it has alpha. */
const opaque = (value, backdrop = [255, 255, 255]) => {
  const parsed = parseCssColor(value);
  return parsed.a === 1 ? [parsed.r, parsed.g, parsed.b] : compositeOver(parsed, backdrop);
};

const ratio = (fg, bg) => contrastRatio(opaque(fg), opaque(bg));

describe.each([
  ['the light badge', BADGE_COLORS.light],
  ['the dark badge', BADGE_COLORS.dark],
])('%s', (_label, palette) => {
  test('the "Text Stats" heading clears AA on the badge surface', () => {
    expect(ratio(palette.accent, palette.opaqueSurface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the "Words"/"Reading" labels clear AA', () => {
    expect(ratio(palette.secondary, palette.opaqueSurface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the figures and the close button clear AA', () => {
    expect(ratio(palette.text, palette.opaqueSurface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the "View Details" label clears AA on its own accent background', () => {
    expect(ratio(palette.ink, palette.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('the Speed Read gradient', () => {
  test('its label clears AA on every stop, the lightest included', () => {
    for (const stop of BADGE_COLORS.speedReadGradient) {
      expect(ratio(BADGE_COLORS.speedReadInk, stop)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('is graded at both stops, not just the one that happens to be darker', () => {
    expect(BADGE_COLORS.speedReadGradient).toHaveLength(2);
    const [from, to] = BADGE_COLORS.speedReadGradient.map(stop => ratio('#ffffff', stop));
    expect(Math.min(from, to)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('the values the badge actually renders', () => {
  /**
   * The rendered markup is the thing a student sees, so the colours are read back out of it: a
   * palette that passes while the markup keeps a hard-coded blue is no use.
   */
  const renderBadge = async dark => {
    document.body.innerHTML = '';
    document.body.classList.toggle('dark-mode', dark);
    const { TextStatsUI } = await import('../../../src/features/textStats/textStats-ui.js');
    const ui = new TextStatsUI();
    ui.createBadge();
    return ui.badge;
  };

  test.each([
    ['a light host page', false, BADGE_COLORS.light],
    ['a dark host page', true, BADGE_COLORS.dark],
  ])('on %s the heading and buttons use the graded palette', async (_label, dark, palette) => {
    const badge = await renderBadge(dark);

    const heading = badge.querySelector('strong');
    const details = badge.querySelector('#assist-textstats-details');
    const speedRead = badge.querySelector('#assist-textstats-speed-read-badge');

    expect(heading.style.color).toBe(parseToStyle(palette.accent));
    expect(details.style.backgroundColor).toBe(parseToStyle(palette.accent));
    expect(details.style.color).toBe(parseToStyle(palette.ink));
    for (const stop of BADGE_COLORS.speedReadGradient) {
      expect(speedRead.getAttribute('style')).toContain(stop);
    }
  });
});

/** jsdom reports a style colour as rgb(), so compare in its terms. */
function parseToStyle(value) {
  const { r, g, b } = parseCssColor(value);
  return `rgb(${r}, ${g}, ${b})`;
}
