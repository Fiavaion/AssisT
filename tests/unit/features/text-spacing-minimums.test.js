/**
 * @jest-environment jsdom
 *
 * WCAG 2.2 SC 1.4.12 is a floor, not a setting. The feature shipped it as
 * `body * { line-height: 1.5 !important }`, which took Wikipedia's 26 px paragraph
 * leading (1.625) down to 24 px and, through `font-family: inherit !important`, flattened
 * the serif headline to the body sans-serif — a student who asked for more spacing got
 * less, and a typeface they never chose.
 *
 * So: measure first and only raise what is below the minimum, leave the page's font alone
 * unless a font was chosen, and leave nothing behind when the feature is switched off.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));
jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: jest.fn(),
}));

import { initFeatureSettings } from '../../../src/content/utils/storage-utils.js';

const ON = {
  enabled: true,
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

const SPACING_CLASSES = [
  'assist-spacing-line',
  'assist-spacing-letter',
  'assist-spacing-word',
  'assist-spacing-paragraph',
];

let feature;

/**
 * Each load is its own module instance watching the same document, so every one has to
 * be switched off again: an instance left enabled keeps measuring the next test's DOM.
 * @type {Array<Object>}
 */
const loadedInstances = [];

function loadFeature() {
  let loaded;
  jest.isolateModules(() => {
    loaded = require('../../../src/features/textCustomization/textCustomization.js');
  });
  const [, , onInit, onChange] = initFeatureSettings.mock.calls.at(-1);
  const instance = { ...loaded, onInit, onChange };
  loadedInstances.push(instance);
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  global.chrome = { runtime: { getURL: path => `chrome-extension://test/${path}` } };
});

afterEach(() => {
  loadedInstances.forEach(instance => instance.onChange({ ...ON, enabled: false }));
  loadedInstances.length = 0;
  jest.restoreAllMocks();
});

describe('the spacing decision, measured against the page', () => {
  beforeEach(() => {
    feature = loadFeature();
  });

  test('raises only what sits below the 1.4.12 minimum', () => {
    const gaps = feature.textCustomization_spacingGaps(
      { fontSize: '16px', lineHeight: '19px', letterSpacing: 'normal', wordSpacing: 'normal' },
      ON
    );
    expect(gaps).toEqual(
      expect.arrayContaining([
        'assist-spacing-line',
        'assist-spacing-letter',
        'assist-spacing-word',
      ])
    );
  });

  test('leaves generous existing spacing alone', () => {
    const gaps = feature.textCustomization_spacingGaps(
      { fontSize: '16px', lineHeight: '26px', letterSpacing: '4px', wordSpacing: '5px' },
      ON
    );
    expect(gaps).toEqual([]);
  });

  test('treats an unreadable line height as needing the minimum', () => {
    const gaps = feature.textCustomization_spacingGaps(
      { fontSize: '16px', lineHeight: 'normal', letterSpacing: '4px', wordSpacing: '5px' },
      ON
    );
    expect(gaps).toEqual(['assist-spacing-line']);
  });

  test('a value exactly at the minimum is not touched', () => {
    const gaps = feature.textCustomization_spacingGaps(
      { fontSize: '16px', lineHeight: '24px', letterSpacing: '1.92px', wordSpacing: '2.56px' },
      ON
    );
    expect(gaps).toEqual([]);
  });

  test('a paragraph keeps a margin larger than the minimum', () => {
    expect(
      feature.textCustomization_spacingGaps(
        {
          fontSize: '16px',
          lineHeight: '26px',
          letterSpacing: '4px',
          wordSpacing: '5px',
          marginBottom: '40px',
        },
        ON,
        true
      )
    ).toEqual([]);
    expect(
      feature.textCustomization_spacingGaps(
        {
          fontSize: '16px',
          lineHeight: '26px',
          letterSpacing: '4px',
          wordSpacing: '5px',
          marginBottom: '8px',
        },
        ON,
        true
      )
    ).toEqual(['assist-spacing-paragraph']);
  });
});

describe('applying it to a page', () => {
  beforeEach(() => {
    document.body.innerHTML = [
      '<article>',
      '<h1 id="headline" style="font-size:32px; line-height:40px; font-family:Georgia, serif">',
      'Dyslexia</h1>',
      '<p id="loose" style="font-size:16px; line-height:26px; letter-spacing:4px;',
      ' word-spacing:5px; margin-bottom:40px">Already generous leading.</p>',
      '<p id="tight" style="font-size:16px; line-height:18px; margin-bottom:4px">Cramped.</p>',
      '<button id="control" style="font-size:16px; line-height:16px">',
      '<span id="control-label" style="font-size:16px; line-height:16px">Save</span></button>',
      '</article>',
    ].join('');
    feature = loadFeature();
  });

  test('boosts the cramped paragraph and leaves the generous one untouched', () => {
    feature.onInit(ON);

    const tight = document.getElementById('tight');
    expect(tight.classList.contains('assist-spacing-line')).toBe(true);
    expect(tight.classList.contains('assist-spacing-paragraph')).toBe(true);

    const loose = document.getElementById('loose');
    expect(loose.classList.contains('assist-spacing-line')).toBe(false);
    expect(loose.classList.contains('assist-spacing-letter')).toBe(false);
    expect(loose.classList.contains('assist-spacing-word')).toBe(false);
    expect(loose.classList.contains('assist-spacing-paragraph')).toBe(false);
  });

  test('never lowers a heading, and never restyles a control', () => {
    feature.onInit(ON);

    // 40px on a 32px headline is 1.25 — below 1.5, so the line height is raised...
    expect(document.getElementById('headline').classList.contains('assist-spacing-line')).toBe(
      true
    );
    // ...but the typeface the page chose is the page's business.
    expect(feature.textCustomization_generateCSS()).not.toMatch(/font-family/);
    expect(document.getElementById('control').className).toBe('');
    // The label inside the control is part of the control, not part of the prose.
    expect(document.getElementById('control-label').className).toBe('');
  });

  test('a chosen font is applied, and only then', () => {
    feature.onInit({ ...ON, fontFamily: 'lexend' });
    const css = feature.textCustomization_generateCSS();
    expect(css).toMatch(/font-family:\s*"Lexend"/);
    expect(document.getElementById('assist-lexend-font')).not.toBeNull();
  });

  test('the injected rules carry the minimums, not a fixed value', () => {
    feature.onInit(ON);
    const css = document.getElementById('assist-text-customization').textContent;
    expect(css).toMatch(/\.assist-spacing-line\s*\{[^}]*line-height:\s*1\.5\s*!important/);
    expect(css).toMatch(/\.assist-spacing-letter\s*\{[^}]*letter-spacing:\s*0\.12em\s*!important/);
    expect(css).toMatch(/\.assist-spacing-word\s*\{[^}]*word-spacing:\s*0\.16em\s*!important/);
    expect(css).toMatch(/\.assist-spacing-paragraph\s*\{[^}]*margin-bottom:\s*2em\s*!important/);
  });

  test('lowering the setting again re-measures against the page, not against our own boost', () => {
    feature.onInit({ ...ON, lineSpacing: 2.5 });
    expect(document.getElementById('loose').classList.contains('assist-spacing-line')).toBe(true);

    feature.onChange(ON);
    // 26px is 1.625 on a 16px paragraph: above 1.5, so the boost must be dropped again
    // rather than pinned at a value below what the page already had.
    expect(document.getElementById('loose').classList.contains('assist-spacing-line')).toBe(false);
  });
});

describe('content the page adds after the first pass', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="module"></div>';
    feature = loadFeature();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('is measured too, and stops being measured once the feature is off', async () => {
    feature.onInit(ON);

    document.getElementById('module').innerHTML =
      '<p id="late" style="font-size:16px; line-height:18px">Loaded with the module.</p>';
    await Promise.resolve();
    jest.advanceTimersByTime(400);

    expect(document.getElementById('late').classList.contains('assist-spacing-line')).toBe(true);

    feature.onChange({ ...ON, enabled: false });
    document.getElementById('module').innerHTML =
      '<p id="later" style="font-size:16px; line-height:18px">After the switch-off.</p>';
    await Promise.resolve();
    jest.advanceTimersByTime(400);

    expect(document.getElementById('later').className).toBe('');
  });
});

describe('switching it off leaves nothing behind', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<p id="tight" style="font-size:16px; line-height:18px">Cramped.</p>' +
      '<p id="kept" class="mw-body" style="font-size:16px; line-height:18px">Kept.</p>';
    feature = loadFeature();
  });

  test('the font faces it injected go with it', () => {
    feature.onInit({ ...ON, fontFamily: 'lexend' });
    feature.onChange({ ...ON, fontFamily: 'opendyslexic' });
    expect(document.getElementById('assist-lexend-font')).not.toBeNull();
    expect(document.getElementById('assist-opendyslexic-font')).not.toBeNull();

    feature.onChange({ ...ON, enabled: false });

    expect(document.getElementById('assist-text-customization')).toBeNull();
    expect(document.getElementById('assist-lexend-font')).toBeNull();
    expect(document.getElementById('assist-opendyslexic-font')).toBeNull();
  });

  test('the classes go, and so does a class attribute the page never had', () => {
    feature.onInit(ON);
    expect(document.getElementById('tight').classList.length).toBeGreaterThan(0);

    feature.onChange({ ...ON, enabled: false });

    SPACING_CLASSES.forEach(name => {
      expect(document.querySelectorAll(`.${name}`).length).toBe(0);
    });
    expect(document.getElementById('tight').hasAttribute('class')).toBe(false);
    expect(document.getElementById('kept').getAttribute('class')).toBe('mw-body');
  });
});
