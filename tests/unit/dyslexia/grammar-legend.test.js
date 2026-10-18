/**
 * @jest-environment jsdom
 *
 * The grammar colour key. Four tints and four underline styles mean nothing to a student until
 * something on the page says which is which, so while grammar colours are on a small labelled
 * region names each part of speech beside the exact cue it gets on the page. It can be folded
 * down to a single button, the choice is remembered, and it goes away with the colours.
 *
 * Driven through dyslexia_initialize() and the settings listener, the way the content script
 * runs it. Nothing here rests on layout: jsdom reports every box as 0x0, so placement is checked
 * through the inline position the rail writes, not through a measured rectangle.
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

const LEGEND_ID = 'assist-grammar-legend';
const CATEGORIES = ['noun', 'verb', 'adjective', 'adverb'];

let dyslexia;
let legendModule;
let storageUtils;
let corners;
let Z;

/** Let the apply timer fire and every promise chain behind it settle. */
async function settle() {
  jest.advanceTimersByTime(600);
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
}

function settingsFor(enabled, variant) {
  return {
    dyslexiaMode: {
      enabled,
      bionicReading: variant === 'bionic',
      syllableHighlighting: variant === 'syllable',
      grammarColors: variant === 'grammar',
    },
  };
}

async function enable(variant) {
  storageUtils.getSettings.mockResolvedValue(settingsFor(true, variant));
  await dyslexia.dyslexia_initialize();
  await settle();
}

/** Replay a settings change through the listener the feature registered. */
async function pushSettings(enabled, variant) {
  const onChange = storageUtils.onSettingsChange.mock.calls[0][0];
  onChange(settingsFor(enabled, variant));
  await settle();
}

const legend = () => document.getElementById(LEGEND_ID);
const toggle = () => legend().querySelector('button');
const list = () => legend().querySelector('ul');

function press(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const rgb = value => {
  const parsed = parseCssColor(value);
  return [parsed.r, parsed.g, parsed.b];
};

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);

  document.head.innerHTML = '';
  document.body.innerHTML = '<p id="para">The quick brown fox jumps over the lazy dog.</p>';
  document.body.removeAttribute('style');

  storageUtils = require('../../../src/content/utils/storage-utils.js');
  dyslexia = require('../../../src/content/features/dyslexia.js');
  legendModule = require('../../../src/content/features/dyslexia-grammar-legend.js');
  corners = require('../../../src/utils/corner-slots.js');
  ({ Z } = require('../../../src/utils/z-index.js'));
  corners.resetRails();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('when the key is on the page', () => {
  test('grammar colours on: the key appears as a labelled region, not a live region', async () => {
    await enable('grammar');

    const key = legend();
    expect(key).not.toBeNull();
    expect(key.tagName).toBe('SECTION');
    const labelId = key.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId).textContent.trim()).toBe('Grammar colours key');
    expect(key.hasAttribute('aria-live')).toBe(false);
    expect(key.getAttribute('role')).not.toBe('status');
    expect(key.getAttribute('role')).not.toBe('alert');
  });

  test('syllable highlighting on: there is no key', async () => {
    await enable('syllable');
    expect(legend()).toBeNull();
  });

  test('switching from grammar to syllables takes the key away', async () => {
    await enable('grammar');
    expect(legend()).not.toBeNull();

    await pushSettings(true, 'syllable');
    expect(document.querySelectorAll('.assist-syllable').length).toBeGreaterThan(0);
    expect(legend()).toBeNull();
  });

  test('turning dyslexia mode off takes the key away', async () => {
    await enable('grammar');
    await pushSettings(false, 'grammar');
    expect(legend()).toBeNull();
  });

  test('turned off before the remembered state has loaded, the key never appears', async () => {
    let release;
    chrome.storage.local.get.mockReturnValue(new Promise(resolve => (release = resolve)));
    storageUtils.getSettings.mockResolvedValue(settingsFor(true, 'grammar'));
    await dyslexia.dyslexia_initialize();
    await settle();

    const onChange = storageUtils.onSettingsChange.mock.calls[0][0];
    onChange(settingsFor(false, 'grammar'));
    release({});
    await settle();

    expect(legend()).toBeNull();
  });

  test('the key itself is never tagged as page text', async () => {
    await enable('grammar');
    expect(legend().querySelectorAll('.assist-grammar').length).toBe(0);
  });
});

describe('what the key says', () => {
  test('it names all four parts of speech in words', async () => {
    await enable('grammar');

    const text = list().textContent;
    ['Noun', 'Verb', 'Adjective', 'Adverb'].forEach(name => expect(text).toContain(name));
    expect(list().querySelectorAll('li')).toHaveLength(4);
  });

  test.each(CATEGORIES)(
    'the %s row shows the same tint and underline the page gets',
    async category => {
      await enable('grammar');
      const style = dyslexia.DYSLEXIA_GRAMMAR_STYLES.light[category];

      const row = list().querySelector(`li[data-category="${category}"]`);
      const sample = row.querySelector('.assist-grammar-legend__sample');
      expect(sample.style.backgroundColor).toBe(style.tint);
      expect(sample.style.borderBottomStyle).toBe(style.line);
      expect(sample.style.borderBottomWidth).toBe('3px');
      expect(sample.style.borderBottomColor).toBe(style.accent);
      // The line style is also said in words, for a student who cannot see the difference.
      expect(row.textContent).toContain(`${style.line} underline`);
    }
  );

  test('on a dark page the key shows the dark set on the dark surface', async () => {
    document.body.style.backgroundColor = 'rgb(18, 18, 18)';
    await enable('grammar');

    const sample = list().querySelector('li[data-category="noun"] .assist-grammar-legend__sample');
    expect(sample.style.backgroundColor).toBe(dyslexia.DYSLEXIA_GRAMMAR_STYLES.dark.noun.tint);
    expect(legend().dataset.surface).toBe('dark');
  });
});

describe('folding the key away', () => {
  test('Enter folds it to its button and Space opens it again, focus staying on the button', async () => {
    await enable('grammar');
    const button = toggle();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(list().id);
    button.focus();

    press(button, 'Enter');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(button);

    press(button, ' ');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(list().hidden).toBe(false);
  });

  test('a pointer press folds it too', async () => {
    await enable('grammar');

    toggle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  test('the choice is remembered', async () => {
    await enable('grammar');

    press(toggle(), 'Enter');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [legendModule.GRAMMAR_LEGEND_COLLAPSED_KEY]: true,
    });
  });

  test('a remembered fold is how the key comes back', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [legendModule.GRAMMAR_LEGEND_COLLAPSED_KEY]: true,
    });
    await enable('grammar');

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(list().hidden).toBe(true);
  });

  test('the button is a real button a keyboard can reach', async () => {
    await enable('grammar');
    expect(toggle().getAttribute('type')).toBe('button');
    expect(toggle().tabIndex).toBe(0);
  });
});

describe('where the key sits', () => {
  test('on the bottom-right rail, above the text statistics badge, from the shared layers', async () => {
    await enable('grammar');

    const slot = corners.SLOTS['grammar-legend'];
    expect(slot.corner).toBe(corners.CORNER.BOTTOM_RIGHT);
    expect(slot.index).toBeGreaterThan(corners.SLOTS['text-stats-badge'].index);
    expect(slot.index).toBeLessThan(corners.SLOTS['companion-card-lane'].index);

    expect(legend().style.position).toBe('fixed');
    expect(legend().style.right).toBe(`${corners.EDGE_INSET}px`);
    expect(legend().style.zIndex).toBe(String(Z.CONTROLS));
  });

  test('leaving the page gives its place on the rail back', async () => {
    await enable('grammar');
    await pushSettings(false, 'grammar');

    const probe = document.createElement('div');
    document.body.appendChild(probe);
    corners.placeInRail(probe, 'text-stats-badge');
    // With the key gone, the corner's extent is the badge alone.
    expect(corners.railExtent(corners.CORNER.BOTTOM_RIGHT)).toBe(
      corners.EDGE_INSET + corners.MIN_SLOT_SIZE + corners.SLOT_GAP
    );
  });
});

describe('the key is readable on either kind of page', () => {
  test.each([['light'], ['dark']])(
    '%s surface: text at 4.5:1, border and focus ring at 3:1',
    variant => {
      const surface = legendModule.GRAMMAR_LEGEND_SURFACES[variant];
      expect(contrastRatio(rgb(surface.text), rgb(surface.background))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(rgb(surface.border), rgb(surface.background))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(rgb(surface.focus), rgb(surface.background))).toBeGreaterThanOrEqual(3);
    }
  );

  test.each(
    CATEGORIES.flatMap(category => [
      ['light', category],
      ['dark', category],
    ])
  )('%s surface: the %s sample label reads at 4.5:1 on its tint', (variant, category) => {
    const surface = legendModule.GRAMMAR_LEGEND_SURFACES[variant];
    const { tint } = require('../../../src/content/features/dyslexia.js').DYSLEXIA_GRAMMAR_STYLES[
      variant
    ][category];
    expect(contrastRatio(rgb(surface.text), rgb(tint))).toBeGreaterThanOrEqual(4.5);
  });

  test('the stylesheet lets a student override text spacing (SC 1.4.12)', async () => {
    await enable('grammar');

    const css = document.getElementById(`${LEGEND_ID}-styles`).textContent;
    expect(css).not.toMatch(/!important/);
    // No fixed height anywhere, so wider spacing grows the box instead of clipping the words.
    expect(css).not.toMatch(/(^|[^-])height\s*:/m);
    expect(css).not.toMatch(/overflow\s*:\s*hidden/);
  });
});
