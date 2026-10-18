/**
 * @jest-environment jsdom
 *
 * Dyslexia mode styles the page's words, so it must only ever touch the page's text
 * nodes. Restoring through `innerHTML` (and a sanitizer allowlist on the way back)
 * re-serialised every processed element instead: on the Wikipedia "Dyslexia" article
 * turning a mode off destroyed 358 host elements — reference `<cite>`, `<abbr title>`
 * expansions, `<bdi>`, `<q>`, deduplicated `<link>` and `<meta>` — and with them every
 * listener the page had bound.
 *
 * So: applying a mode wraps text nodes and leaves every element identical, and turning
 * it off puts the original text nodes back, node for node.
 */

jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
}));
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));

const THUMBS_UP = '\u{1F44D}';
const ARABIC = 'العربية';

/**
 * The shapes the article actually uses: an abbreviation with its expansion, a link, an
 * inline quotation, a bidirectional isolate, a reference cite with nested markup, and
 * the link / meta pair MediaWiki emits inside a reference list item.
 */
const FIXTURE = [
  '<article id="page">',
  '<p id="lead">Dyslexia, also called <abbr id="abbr" title="specific learning difficulty">SLD</abbr>,',
  'affects <a id="link" href="/wiki/Reading" class="mw-redirect">reading</a> and writing',
  '<q id="quote" cite="https://example.org/source">in many writing systems</q>',
  '<bdi id="bdi" dir="rtl">' + ARABIC + '</bdi> and works well ' + THUMBS_UP + '.</p>',
  '<ol><li id="ref"><cite id="cite" class="citation journal">Snell, J. (2024).',
  '<i id="italic">Acta Psychologica</i>, 251.</cite>',
  '<link id="ref-link" rel="mw-deduplicated-inline-style" href="#style-1">',
  '<meta id="ref-meta" itemprop="position" content="1"></li></ol>',
  '</article>',
].join('\n');

const HOST_IDS = [
  'lead',
  'abbr',
  'link',
  'quote',
  'bdi',
  'ref',
  'cite',
  'italic',
  'ref-link',
  'ref-meta',
];

let dyslexia;
let storageUtils;

/** Every tag inside the article, counted, so a lost element cannot hide in the total. */
function tagCounts() {
  const counts = {};
  document.querySelectorAll('#page, #page *').forEach(el => {
    counts[el.tagName] = (counts[el.tagName] || 0) + 1;
  });
  return counts;
}

/**
 * An element's attributes as a comparable string. The processed marker is left out: it
 * is ours, it is deliberate while a mode is on, and its removal has its own test.
 */
function attrsOf(el) {
  return Array.from(el.attributes)
    .filter(a => a.name !== 'data-assist-dyslexia-processed')
    .map(a => `${a.name}=${a.value}`)
    .sort()
    .join('|');
}

function hostSnapshot() {
  const snapshot = {};
  HOST_IDS.forEach(id => {
    const el = document.getElementById(id);
    snapshot[id] = { node: el, attrs: attrsOf(el) };
  });
  return snapshot;
}

/** Turn the feature on with one variant selected and let its startup timer fire. */
async function enable(variant) {
  storageUtils.getSettings.mockResolvedValue({
    dyslexiaMode: {
      enabled: true,
      bionicReading: variant === 'bionic',
      syllableHighlighting: variant === 'syllable',
      grammarColors: variant === 'grammar',
    },
  });
  await dyslexia.dyslexia_initialize();
  jest.advanceTimersByTime(600);
}

/** Replay a settings change through the listener the feature registered. */
function pushSettings(enabled, variant) {
  const onChange = storageUtils.onSettingsChange.mock.calls[0][0];
  onChange({
    dyslexiaMode: {
      enabled,
      bionicReading: variant === 'bionic',
      syllableHighlighting: variant === 'syllable',
      grammarColors: variant === 'grammar',
    },
  });
}

const STYLED = '.assist-bionic, .assist-syllable, .assist-grammar';

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = FIXTURE;

  storageUtils = require('../../../src/content/utils/storage-utils.js');
  dyslexia = require('../../../src/content/features/dyslexia.js');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each([['syllable'], ['grammar'], ['bionic']])('%s mode keeps the host page', variant => {
  test('applying it discards no element, attribute or character', async () => {
    const before = {
      counts: tagCounts(),
      hosts: hostSnapshot(),
      text: document.getElementById('page').textContent,
    };

    await enable(variant);

    expect(document.querySelectorAll(STYLED).length).toBeGreaterThan(0);
    const after = tagCounts();
    Object.keys(before.counts).forEach(tag => {
      expect(after[tag]).toBe(before.counts[tag]);
    });
    HOST_IDS.forEach(id => {
      // The same object, not a re-parsed copy: a replaced element loses its listeners.
      expect(document.getElementById(id)).toBe(before.hosts[id].node);
      expect(attrsOf(document.getElementById(id))).toBe(before.hosts[id].attrs);
    });
    expect(document.getElementById('page').textContent).toBe(before.text);
    expect(document.getElementById('page').textContent).not.toContain('�');
  });

  test('turning it off puts the page back element for element', async () => {
    const page = document.getElementById('page');
    const before = {
      counts: tagCounts(),
      hosts: hostSnapshot(),
      text: page.textContent,
      html: page.innerHTML,
    };

    await enable(variant);
    pushSettings(false, variant);

    expect(document.querySelectorAll(STYLED).length).toBe(0);
    expect(tagCounts()).toEqual(before.counts);
    HOST_IDS.forEach(id => {
      expect(document.getElementById(id)).toBe(before.hosts[id].node);
      expect(attrsOf(document.getElementById(id))).toBe(before.hosts[id].attrs);
    });
    expect(page.textContent).toBe(before.text);
    expect(page.innerHTML).toBe(before.html);
    expect(document.getElementById('abbr').getAttribute('title')).toBe(
      'specific learning difficulty'
    );
    expect(document.getElementById('link').getAttribute('href')).toBe('/wiki/Reading');
    expect(document.getElementById('quote').getAttribute('cite')).toBe(
      'https://example.org/source'
    );
  });

  test('a listener the page bound on a link still fires afterwards', async () => {
    const clicked = jest.fn();
    document.getElementById('link').addEventListener('click', clicked);

    await enable(variant);
    pushSettings(false, variant);

    document.getElementById('link').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  test('no processed marker is left on the page', async () => {
    await enable(variant);
    expect(document.querySelectorAll('[data-assist-dyslexia-processed]').length).toBeGreaterThan(0);

    pushSettings(false, variant);
    expect(document.querySelectorAll('[data-assist-dyslexia-processed]').length).toBe(0);
  });
});

describe('a second apply after a restore', () => {
  test('re-applies and restores again without scrambling the text', async () => {
    const page = document.getElementById('page');
    const originalText = page.textContent;
    const originalHTML = page.innerHTML;

    await enable('syllable');
    pushSettings(false, 'syllable');

    pushSettings(true, 'syllable');
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    expect(page.textContent).toBe(originalText);
    expect(document.querySelectorAll('.assist-syllable').length).toBeGreaterThan(0);

    pushSettings(false, 'syllable');
    expect(page.innerHTML).toBe(originalHTML);
  });
});
