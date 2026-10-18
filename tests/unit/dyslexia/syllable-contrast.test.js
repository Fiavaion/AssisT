/**
 * @jest-environment jsdom
 *
 * Syllable highlighting tinted the background behind the page's own words, so the tint
 * decides whether those words still pass SC 1.4.3. The shipped washes were translucent
 * (alpha 0.58), which made the result depend on whatever the page painted underneath:
 * on Wikipedia a default link, rgb(51, 102, 204), came out at 3.43:1 on the blue wash
 * and 4.37:1 on the yellow — every link in the article under the 4.5:1 line.
 *
 * The tints are therefore opaque, so the ratio is a property of the shipped values and
 * not of the page, and there are two sets: a light page keeps dark text on pale tints,
 * a dark page keeps light text on deep ones. Every ratio below is computed from the
 * shipped constants with the same contrast maths the annotation palette is graded by.
 *
 * Grammar colour-coding tinted the same page text and was worse: translucent washes at
 * alpha 0.48 left that same link at 3.15:1. It is graded here too, and because a pale
 * tint alone can no longer carry four categories, each one also has a 3px underline in a
 * saturated version of its colour — a second cue that survives colour blindness and a
 * monochrome display (SC 1.4.1), and which must itself be visible against its tint
 * (SC 1.4.11).
 */

jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
}));
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));

import {
  contrastRatio,
  parseCssColor,
} from '../../../src/features/annotations/annotation-colors.js';
import {
  DYSLEXIA_GRAMMAR_STYLES,
  DYSLEXIA_SYLLABLE_TINTS,
  dyslexia_resolveGrammarStyles,
  dyslexia_resolveSyllableTints,
} from '../../../src/content/features/dyslexia.js';

/** The colours a student's words actually arrive in on a light page. */
const LIGHT_PAGE_TEXT = {
  'a default link': 'rgb(51, 102, 204)',
  'Wikipedia body text': 'rgb(32, 33, 34)',
  'black body text': '#000000',
};

/** ...and on a dark one. */
const DARK_PAGE_TEXT = {
  'a dark-theme link': 'rgb(102, 153, 255)',
  'dark-theme body text': '#eaecf0',
};

const rgb = value => {
  const parsed = parseCssColor(value);
  return [parsed.r, parsed.g, parsed.b];
};

const AA_TEXT = 4.5;

describe('syllable tints are opaque, so their contrast is not the page s to decide', () => {
  test.each([...DYSLEXIA_SYLLABLE_TINTS.light, ...DYSLEXIA_SYLLABLE_TINTS.dark])(
    '%s carries no alpha',
    tint => {
      expect(parseCssColor(tint).a).toBe(1);
    }
  );
});

describe('light-page tints keep page text at 4.5:1', () => {
  const cases = DYSLEXIA_SYLLABLE_TINTS.light.flatMap(tint =>
    Object.entries(LIGHT_PAGE_TEXT).map(([label, color]) => [tint, label, color])
  );

  test.each(cases)('%s under %s', (tint, _label, color) => {
    expect(contrastRatio(rgb(color), rgb(tint))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('dark-page tints keep page text at 4.5:1', () => {
  const cases = DYSLEXIA_SYLLABLE_TINTS.dark.flatMap(tint =>
    Object.entries(DARK_PAGE_TEXT).map(([label, color]) => [tint, label, color])
  );

  test.each(cases)('%s under %s', (tint, _label, color) => {
    expect(contrastRatio(rgb(color), rgb(tint))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('the two tints in a pair stay distinguishable from each other', () => {
  test.each([['light'], ['dark']])('%s pair differs in hue and luminance', variant => {
    const [first, second] = DYSLEXIA_SYLLABLE_TINTS[variant].map(rgb);
    expect(first).not.toEqual(second);
    expect(contrastRatio(first, second)).toBeGreaterThan(1.05);
  });
});

describe('which pair a page gets', () => {
  test('a white page gets the light pair', () => {
    expect(dyslexia_resolveSyllableTints({ backgroundColor: 'rgb(255, 255, 255)' })).toBe(
      DYSLEXIA_SYLLABLE_TINTS.light
    );
  });

  test('a dark page gets the dark pair', () => {
    expect(dyslexia_resolveSyllableTints({ backgroundColor: 'rgb(16, 20, 24)' })).toBe(
      DYSLEXIA_SYLLABLE_TINTS.dark
    );
  });

  test('an unreadable background falls back to the text colour: light text means a dark page', () => {
    expect(
      dyslexia_resolveSyllableTints({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        textColor: 'rgb(240, 240, 240)',
      })
    ).toBe(DYSLEXIA_SYLLABLE_TINTS.dark);
  });

  test('with nothing readable it stays on the light pair', () => {
    expect(dyslexia_resolveSyllableTints()).toBe(DYSLEXIA_SYLLABLE_TINTS.light);
  });
});

const AA_NON_TEXT = 3;

const GRAMMAR_CATEGORIES = ['noun', 'verb', 'adjective', 'adverb'];

describe('grammar tints are opaque, like the syllable ones', () => {
  test.each(
    GRAMMAR_CATEGORIES.flatMap(category => [
      [`light ${category}`, DYSLEXIA_GRAMMAR_STYLES.light[category]],
      [`dark ${category}`, DYSLEXIA_GRAMMAR_STYLES.dark[category]],
    ])
  )('%s carries no alpha', (_label, style) => {
    expect(parseCssColor(style.tint).a).toBe(1);
    expect(parseCssColor(style.accent).a).toBe(1);
  });
});

describe('light-page grammar tints keep page text at 4.5:1', () => {
  const cases = GRAMMAR_CATEGORIES.flatMap(category =>
    Object.entries(LIGHT_PAGE_TEXT).map(([label, color]) => [category, label, color])
  );

  test.each(cases)('%s tint under %s', (category, _label, color) => {
    const { tint } = DYSLEXIA_GRAMMAR_STYLES.light[category];
    expect(contrastRatio(rgb(color), rgb(tint))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('dark-page grammar tints keep page text at 4.5:1', () => {
  const cases = GRAMMAR_CATEGORIES.flatMap(category =>
    Object.entries(DARK_PAGE_TEXT).map(([label, color]) => [category, label, color])
  );

  test.each(cases)('%s tint under %s', (category, _label, color) => {
    const { tint } = DYSLEXIA_GRAMMAR_STYLES.dark[category];
    expect(contrastRatio(rgb(color), rgb(tint))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('the underline that carries the category is visible on its own tint', () => {
  test.each(
    GRAMMAR_CATEGORIES.flatMap(category => [
      ['light', category],
      ['dark', category],
    ])
  )('%s %s accent against its tint', (variant, category) => {
    const { tint, accent } = DYSLEXIA_GRAMMAR_STYLES[variant][category];
    expect(contrastRatio(rgb(accent), rgb(tint))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe('colour is not the only cue', () => {
  test.each([['light'], ['dark']])('%s: every category has its own underline style', variant => {
    const lines = GRAMMAR_CATEGORIES.map(
      category => DYSLEXIA_GRAMMAR_STYLES[variant][category].line
    );
    expect(new Set(lines).size).toBe(GRAMMAR_CATEGORIES.length);
    lines.forEach(line => expect(typeof line).toBe('string'));
  });

  test('the four categories are four different tints', () => {
    const tints = GRAMMAR_CATEGORIES.map(category => DYSLEXIA_GRAMMAR_STYLES.light[category].tint);
    expect(new Set(tints).size).toBe(GRAMMAR_CATEGORIES.length);
  });
});

describe('which grammar set a page gets — the same resolver as the syllable tints', () => {
  test('a white page gets the light set', () => {
    expect(dyslexia_resolveGrammarStyles({ backgroundColor: 'rgb(255, 255, 255)' })).toBe(
      DYSLEXIA_GRAMMAR_STYLES.light
    );
  });

  test('a dark page gets the dark set', () => {
    expect(dyslexia_resolveGrammarStyles({ backgroundColor: 'rgb(16, 20, 24)' })).toBe(
      DYSLEXIA_GRAMMAR_STYLES.dark
    );
  });

  test('an unreadable background falls back to the text colour', () => {
    expect(
      dyslexia_resolveGrammarStyles({
        backgroundColor: 'rgba(0, 0, 0, 0)',
        textColor: 'rgb(240, 240, 240)',
      })
    ).toBe(DYSLEXIA_GRAMMAR_STYLES.dark);
  });

  test('with nothing readable it stays on the light set', () => {
    expect(dyslexia_resolveGrammarStyles()).toBe(DYSLEXIA_GRAMMAR_STYLES.light);
  });
});
