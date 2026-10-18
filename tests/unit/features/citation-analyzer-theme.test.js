/**
 * @jest-environment jsdom
 *
 * The citation analyser panel in both themes and on a narrow screen.
 *
 * SC 1.4.3 Contrast: messages used to set their greys inline (`color:#666` and friends), which the
 * panel's dark-mode rules cannot override, so on the dark panel they fell to about 3:1. Their
 * colours now live in classes that both themes set; the contrast of each is checked here, as
 * numbers, against the panel's own background in each theme.
 *
 * SC 1.4.10 Reflow: the panel was a fixed 420px wide with nothing to stop it overflowing a 320px
 * viewport. jsdom has no layout, so this checks the rule; the browser case is in the E2E suite.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
}));

const aiClient = require('../../../src/features/shared/ai-feature-client.js');

const LIGHT_BG = '#ffffff';
const DARK_BG = '#1e1e1e';

let mod;

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function styles() {
  return document.getElementById('assist-citation-styles').textContent;
}

/** Split the injected sheet into its light part and its dark-mode block. */
function themes() {
  const css = styles();
  const at = css.indexOf('@media (prefers-color-scheme: dark)');
  return { light: css.slice(0, at), dark: css.slice(at) };
}

/** The `color:` a rule for exactly this selector sets in a block of CSS, or null. */
function colorOf(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`));
  const color = rule && rule[1].match(/(?:^|[\s;])color:\s*(#[0-9a-fA-F]{3,6})/);
  return color ? color[1] : null;
}

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  }
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every element in the panel body that sets a text colour inline, other than a button. */
function inlineColours() {
  const content = document.querySelector('#assist-citation-panel .assist-citation-content');
  return Array.from(content.querySelectorAll('[style]')).filter(
    el => el.tagName !== 'BUTTON' && /(^|;)\s*color\s*:/.test(el.getAttribute('style'))
  );
}

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mod = await import('../../../src/features/citationAnalyzer/citationAnalyzer.js');
});

beforeEach(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  aiClient.getAIMode.mockResolvedValue({ isOff: false, mode: 'cloud' });
  aiClient.checkAIAvailable.mockResolvedValue({ available: false, needsApiKey: true });
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  await mod.citation_show();
  await settle();
});

afterEach(() => {
  mod.citation_hide();
});

describe('reflow at a narrow viewport (SC 1.4.10)', () => {
  test('the panel is capped to the viewport minus a margin', () => {
    const panelRule = styles().match(/#assist-citation-panel\s*\{([^}]*)\}/)[1];
    // 100%, not 100vw: for a fixed box 100vw includes the scrollbar while right: 20px is measured
    // from inside it, which put the panel 3px off the left edge of a 320px screen in Chrome.
    expect(panelRule).toMatch(/max-width:\s*calc\(100% - \d+px\)/);
    expect(panelRule).not.toMatch(/max-width:\s*calc\(100vw/);
    // Without border-box the cap would apply to the content box alone.
    expect(panelRule).toMatch(/box-sizing:\s*border-box/);
  });
});

describe('message text follows the theme (SC 1.4.3)', () => {
  test('the API-key message sets no text colour inline', async () => {
    await mod.citation_runAnalysis('Smith, J. (2020). A title. Journal.');
    await settle();
    expect(document.querySelector('.citation-open-settings')).not.toBeNull();
    expect(inlineColours()).toEqual([]);
  });

  test('the "now using local AI" message sets no text colour inline', async () => {
    await mod.citation_runAnalysis('Smith, J. (2020). A title. Journal.');
    await settle();
    const useLocal = document.querySelector('.citation-use-local');
    useLocal.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('.assist-citation-content').textContent).toMatch(
      /Now using Local AI mode/
    );
    expect(inlineColours()).toEqual([]);
  });

  test('the online-check result sets no text colour inline, found or not', async () => {
    chrome.runtime.sendMessage = jest.fn(async message =>
      message.type === 'THIRD_PARTY_REQUEST'
        ? {
            success: true,
            data: {
              work: {
                title: ['Attention Is All You Need'],
                author: [{ given: 'Ashish', family: 'Vaswani' }],
                published: { 'date-parts': [[2017]] },
                'container-title': ['NeurIPS'],
                DOI: '10.1000/xyz123',
              },
            },
          }
        : {}
    );
    await mod.citation_startVerification('Vaswani (2017). https://doi.org/10.1000/xyz123');
    expect(document.getElementById('citation-verify-slot').textContent).toMatch(/Found on CrossRef/);
    expect(inlineColours()).toEqual([]);

    document.getElementById('citation-verify-slot').remove();
    chrome.runtime.sendMessage = jest.fn(async () => ({ success: false, code: 'not-found' }));
    await mod.citation_startVerification('Nobody (1999). Nothing.');
    expect(document.getElementById('citation-verify-slot').textContent).toMatch(/Not found/);
    expect(inlineColours()).toEqual([]);
  });

  test.each([
    '.assist-citation-message-title',
    '.assist-citation-muted',
    '.assist-citation-verify-found',
    '.assist-citation-verify-link',
    // The result: its band (colour is paired with an icon and words, never alone), the note on
    // how it was worked out, and the evidence lists.
    '.assist-citation-band-reliable',
    '.assist-citation-band-check',
    '.assist-citation-band-unclear',
    '.assist-citation-disclosure',
    '.assist-citation-list li',
  ])('%s reaches 4.5:1 on the light and the dark panel', selector => {
    const { light, dark } = themes();
    const lightColour = colorOf(light, selector);
    const darkColour = colorOf(dark, selector);
    expect(lightColour).not.toBeNull();
    expect(darkColour).not.toBeNull();
    expect(contrast(lightColour, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColour, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
