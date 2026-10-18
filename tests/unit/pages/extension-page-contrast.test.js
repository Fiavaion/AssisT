/**
 * Contrast on the extension's own pages, computed from the CSS rather than trusted.
 *
 * Overnight release testing ran axe over every extension page and found four serious colour-contrast
 * failures, each of them a token doing two jobs at once: the Discovery quiz's "Start" button white
 * on #60a5fa (2.54:1), the popup's shortcut hints #90939a on #363a48 (3.67:1), the popup's `.active`
 * controls white on #6b8dd6 (3.27:1), and the demo page's "Due" badge white on the page's own grey
 * (1.09:1 - its background named a variable the page never defined, so the browser dropped the
 * declaration). The fixes are in the tokens, so the tokens are what is graded here.
 *
 * A light accent cannot carry white text and also read as text on a dark surface, which is why each
 * of those palettes now names the ink that goes ON its accent. These tests hold both halves: the ink
 * clears AA on the accent, and no rule goes back to putting white on it.
 */

import fs from 'fs';
import path from 'path';

import {
  compositeOver,
  contrastRatio,
  parseCssColor,
} from '../../../src/features/annotations/annotation-colors.js';

const ROOT = path.join(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const POPUP_CSS = read('src/popup/popup.css');
const DISCOVERY_CSS = read('src/pages/discovery/discovery.css');
const DEMO_CSS = read('src/pages/demo/demo.css');
const HELP_HTML = read('src/pages/help/help.html');

const AA_TEXT = 4.5;

/** The value a custom property is declared with. */
function token(css, name) {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css);
  if (!match) {
    throw new Error(`${name} is not declared`);
  }
  return match[1].trim();
}

const rgb = value => {
  const parsed = parseCssColor(value);
  if (!parsed) {
    throw new Error(`not a colour: ${value}`);
  }
  return parsed.a === 1 ? [parsed.r, parsed.g, parsed.b] : null;
};

const ratio = (fg, bg) => contrastRatio(rgb(fg), rgb(bg));

/** One declaration out of one rule, e.g. the colour of `.info-badge.deadline`. */
function declaration(css, selector, property) {
  const block = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const found = block.exec(css);
  if (!found) {
    throw new Error(`no rule for ${selector}`);
  }
  const value = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(found[1]);
  if (!value) {
    throw new Error(`${selector} does not set ${property}`);
  }
  return value[1].trim();
}

/** Every rule block in a stylesheet, as { selector, body }. */
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    body: m[2],
  }));
}

describe('the popup in dark mode', () => {
  const accent = token(POPUP_CSS, '--dm-accent');
  const ink = token(POPUP_CSS, '--dm-accent-ink');

  test('text on the accent clears AA', () => {
    expect(ratio(ink, accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the accent still reads as text on every dark surface it is used on', () => {
    for (const surface of ['--dm-bg-primary', '--dm-bg-secondary', '--dm-bg-surface']) {
      expect(ratio(accent, token(POPUP_CSS, surface))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('no rule puts white text on the accent again', () => {
    const offenders = rules(POPUP_CSS)
      .filter(rule => /background(-color)?:\s*var\(--dm-accent\)/.test(rule.body))
      .filter(rule => /color:\s*(white|#fff(fff)?)\s*;/i.test(rule.body))
      .map(rule => rule.selector);
    expect(offenders).toEqual([]);
  });

  test('the shortcut chip clears AA on the lightest surface it sits over', () => {
    const chipText = token(POPUP_CSS, '--dm-chip-text');
    // A chip's own background is white at 8% over whichever dark surface is behind it; the
    // lightest of those is the worst case, and the one axe measured at 3.67:1.
    const chipBackground = compositeOver(
      parseCssColor('rgba(255, 255, 255, 0.08)'),
      rgb(token(POPUP_CSS, '--dm-bg-tertiary'))
    );
    expect(contrastRatio(rgb(chipText), chipBackground)).toBeGreaterThanOrEqual(AA_TEXT);

    expect(declaration(POPUP_CSS, '.popup-container.dark-mode .shortcut-badge', 'color')).toBe(
      'var(--dm-chip-text)'
    );
  });
});

describe('the Discovery quiz', () => {
  const primary = token(DISCOVERY_CSS, '--color-primary');
  const ink = token(DISCOVERY_CSS, '--color-on-primary');

  test('the Start button label clears AA on the primary colour, hover shade included', () => {
    expect(ratio(ink, primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(ink, token(DISCOVERY_CSS, '--color-primary-hover'))).toBeGreaterThanOrEqual(
      AA_TEXT
    );
  });

  test('.btn-primary takes the ink, not white', () => {
    expect(declaration(DISCOVERY_CSS, '.btn-primary', 'color')).toBe('var(--color-on-primary)');
  });

  test('no rule puts white text on the primary colour again', () => {
    const offenders = rules(DISCOVERY_CSS)
      .filter(rule => /background(-color)?:\s*var\(--color-primary\)/.test(rule.body))
      .filter(rule => /color:\s*(white|#fff(fff)?)\s*;/i.test(rule.body))
      .map(rule => rule.selector);
    expect(offenders).toEqual([]);
  });

  test('every custom property the page uses is one the page defines', () => {
    expect(undefinedTokens(DISCOVERY_CSS)).toEqual([]);
  });
});

describe('the demo page', () => {
  test('the "Due" badge clears AA', () => {
    const background = declaration(DEMO_CSS, '.info-badge.deadline', 'background');
    const colour = declaration(DEMO_CSS, '.info-badge.deadline', 'color');
    const resolve = value => token(DEMO_CSS, /^var\((--[a-z0-9-]+)\)$/.exec(value)[1]);
    expect(ratio(resolve(colour), resolve(background))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the accent used as text clears AA on the page ground and on a card', () => {
    const accentText = token(DEMO_CSS, '--brand-accent-text');
    expect(ratio(accentText, token(DEMO_CSS, '--brand-bg'))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(accentText, token(DEMO_CSS, '--brand-white'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('the focus ring is visible against both grounds (SC 1.4.11)', () => {
    const ring = declaration(DEMO_CSS, ':focus-visible', 'outline').split(' ').pop();
    const colour = token(DEMO_CSS, /^var\((--[a-z0-9-]+)\)$/.exec(ring)[1]);
    expect(ratio(colour, token(DEMO_CSS, '--brand-bg'))).toBeGreaterThanOrEqual(3);
    expect(ratio(colour, token(DEMO_CSS, '--brand-white'))).toBeGreaterThanOrEqual(3);
  });

  test('every custom property the page uses is one the page defines', () => {
    // --brand-orange was used ten times and defined nowhere, so the browser dropped every one of
    // those declarations: no badge background, and no focus ring at all.
    expect(undefinedTokens(DEMO_CSS)).toEqual([]);
  });
});

describe('the Help page', () => {
  test('the shortcut labels clear AA on their own panel', () => {
    expect(
      ratio(
        declaration(HELP_HTML, '.shortcut-list dt', 'color'),
        declaration(HELP_HTML, '.shortcut-list', 'background')
      )
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/** Custom properties a stylesheet reads with no fallback and never declares. */
function undefinedTokens(css) {
  const declared = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]));
  return [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)]
    .map(m => m[1])
    .filter(name => !declared.has(name))
    .filter((name, index, all) => all.indexOf(name) === index);
}
