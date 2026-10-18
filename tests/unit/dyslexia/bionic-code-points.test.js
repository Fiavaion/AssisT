/**
 * @jest-environment jsdom
 *
 * Bionic reading bolds the start of each word by slicing the string. `substring(0, 3)`
 * counts UTF-16 code units, so it cut emoji in half and the page rendered "👍" as two
 * replacement characters. It also walked AssisT's own injected panels, rewriting the
 * extension's UI text along with the student's page.
 *
 * Words are split on whole code points (grapheme clusters where Intl.Segmenter exists),
 * AssisT's own UI and editable fields are never touched, and turning the mode off puts
 * the page back exactly as it was.
 */

jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
}));
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));

const THUMBS_UP = '\u{1F44D}'; // 👍 — one grapheme, two UTF-16 code units
const CAP = '\u{1F393}'; // 🎓
const FLAG = '\u{1F1EE}\u{1F1EA}'; // 🇮🇪 — two code points, one grapheme

let dyslexia;
let storageUtils;

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  storageUtils = require('../../../src/content/utils/storage-utils.js');
  dyslexia = require('../../../src/content/features/dyslexia.js');
});

describe('bionic split — whole code points, never half an emoji', () => {
  test('keeps an emoji whole instead of splitting its surrogate pair', () => {
    const { bold, rest } = dyslexia.dyslexia_splitWordForBionic(THUMBS_UP);

    expect(bold).toBe(THUMBS_UP);
    expect(rest).toBe('');
    expect(bold + rest).toBe(THUMBS_UP);
    expect(bold).not.toContain('�');
    expect(bold.codePointAt(0)).toBe(THUMBS_UP.codePointAt(0));
  });

  test('never produces a lone surrogate for a word that mixes emoji and letters', () => {
    const word = `${CAP}ready`;
    const { bold, rest } = dyslexia.dyslexia_splitWordForBionic(word);

    expect(bold + rest).toBe(word);
    for (const half of [bold, rest]) {
      for (let i = 0; i < half.length; i++) {
        const code = half.charCodeAt(i);
        const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
        const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
        if (isHighSurrogate) {
          const next = half.charCodeAt(i + 1);
          expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
          i++;
        } else {
          expect(isLowSurrogate).toBe(false);
        }
      }
    }
  });

  test('a multi-code-point flag stays one unit', () => {
    const { bold, rest } = dyslexia.dyslexia_splitWordForBionic(FLAG);

    expect(bold).toBe(FLAG);
    expect(rest).toBe('');
  });

  test('plain words keep the established 1 / 2 / 3 character prefixes', () => {
    expect(dyslexia.dyslexia_splitWordForBionic('the')).toEqual({ bold: 't', rest: 'he' });
    expect(dyslexia.dyslexia_splitWordForBionic('reading')).toEqual({ bold: 're', rest: 'ading' });
    expect(dyslexia.dyslexia_splitWordForBionic('comprehension')).toEqual({
      bold: 'com',
      rest: 'prehension',
    });
  });

  test('the DOM it writes carries no replacement characters', () => {
    const p = document.createElement('p');
    p.textContent = `Well done ${THUMBS_UP} and good luck ${CAP} with the reading`;
    document.body.appendChild(p);
    const original = p.textContent;

    dyslexia.dyslexia_applyBionicReading(p);

    expect(p.querySelectorAll('.assist-bionic').length).toBeGreaterThan(0);
    expect(p.textContent).toBe(original);
    expect(p.textContent).not.toContain('�');
  });
});

describe('bionic reading leaves what is not the student page alone', () => {
  /** @returns {HTMLElement} a paragraph at the deepest point of the given wrapper markup */
  function paragraphInside(wrapperHTML) {
    document.body.innerHTML = `${wrapperHTML}`;
    let target = document.body.firstElementChild;
    while (target.lastElementChild) {
      target = target.lastElementChild;
    }
    const p = document.createElement('p');
    p.textContent = 'Summarize the reading for me';
    target.appendChild(p);
    return p;
  }

  test.each([
    ['an AssisT panel by id', '<div id="assist-companion-panel"></div>'],
    ['an AssisT panel by class', '<div class="assist-annotation-sidebar"></div>'],
    [
      'a section nested two levels inside an AssisT panel',
      '<div class="assist-annotation-sidebar"><section class="items"></section></div>',
    ],
    ['an editable field', '<div contenteditable="true"></div>'],
  ])('refuses %s', (_label, wrapper) => {
    const p = paragraphInside(wrapper);

    expect(dyslexia.dyslexia_isExcludedElement(p)).toBe(true);

    dyslexia.dyslexia_applyBionicReading(p);
    expect(p.querySelectorAll('.assist-bionic').length).toBe(0);
  });

  test('refuses a shadow host, whose light DOM belongs to a component', () => {
    document.body.innerHTML = '<div id="widget-host"></div>';
    const host = document.getElementById('widget-host');
    host.attachShadow({ mode: 'open' });
    const p = document.createElement('p');
    p.textContent = 'Summarize the reading for me';
    host.appendChild(p);

    expect(dyslexia.dyslexia_isExcludedElement(p)).toBe(true);
  });

  test('still processes ordinary page content', () => {
    document.body.innerHTML = '<article><p>Working memory holds a little</p></article>';
    const p = document.querySelector('p');

    expect(dyslexia.dyslexia_isExcludedElement(p)).toBe(false);

    dyslexia.dyslexia_applyBionicReading(p);
    expect(p.querySelectorAll('.assist-bionic').length).toBeGreaterThan(0);
  });

  test('skips script, style and input text inside a processed element', () => {
    document.body.innerHTML = `
      <div id="wrap">
        <p>Working memory</p>
        <script>var trap = 'code';</script>
        <style>.trap { color: red; }</style>
        <textarea>draft answer</textarea>
      </div>`;
    const wrap = document.getElementById('wrap');
    const scriptText = wrap.querySelector('script').textContent;
    const styleText = wrap.querySelector('style').textContent;
    const draft = wrap.querySelector('textarea').value;

    dyslexia.dyslexia_applyBionicReading(wrap);

    expect(wrap.querySelector('script').textContent).toBe(scriptText);
    expect(wrap.querySelector('style').textContent).toBe(styleText);
    expect(wrap.querySelector('textarea').value).toBe(draft);
    expect(wrap.querySelector('p').querySelectorAll('.assist-bionic').length).toBeGreaterThan(0);
  });
});

describe('bionic reading end to end — apply and restore through the feature', () => {
  /** Turn the feature on with bionic selected and let its startup timer fire. */
  async function enableBionic() {
    storageUtils.getSettings.mockResolvedValue({
      dyslexiaMode: { enabled: true, bionicReading: true, syllableHighlighting: false },
    });
    await dyslexia.dyslexia_initialize();
    jest.advanceTimersByTime(600);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `
      <article><p id="page">Well done ${THUMBS_UP} and good luck ${CAP}</p></article>
      <div id="assist-first-run-hint"><p id="own">${THUMBS_UP} Summarize this page</p></div>`;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rewrites the page but not AssisT’s own hint panel', async () => {
    const own = document.getElementById('own');
    const ownHTML = own.innerHTML;

    await enableBionic();

    expect(
      document.getElementById('page').querySelectorAll('.assist-bionic').length
    ).toBeGreaterThan(0);
    expect(own.querySelectorAll('.assist-bionic').length).toBe(0);
    expect(own.innerHTML).toBe(ownHTML);
  });

  test('turning it off restores the page text exactly', async () => {
    const page = document.getElementById('page');
    const originalHTML = page.innerHTML;
    const originalText = page.textContent;

    await enableBionic();
    expect(page.textContent).toBe(originalText);

    // The feature listens for settings changes; replay a disable through that listener.
    const onChange = storageUtils.onSettingsChange.mock.calls[0][0];
    onChange({ dyslexiaMode: { enabled: false, bionicReading: true } });

    const restored = document.getElementById('page');
    expect(restored.querySelectorAll('.assist-bionic').length).toBe(0);
    expect(restored.innerHTML).toBe(originalHTML);
    expect(restored.textContent).toBe(originalText);
    expect(restored.textContent).not.toContain('�');
  });
});
