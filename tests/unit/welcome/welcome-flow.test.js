/**
 * @jest-environment jsdom
 *
 * The welcome page end to end, in jsdom: tick some guides, press Continue, work down the list.
 *
 * The builders are covered next door; what is here is the behaviour that only shows up once the
 * page is running — that picking nothing finishes cleanly, that a clean setup actually writes the
 * off state, that a refused import changes nothing and leaves the step open, and that the resume
 * protocol still lands where the two external guides send it.
 */

// The page is re-imported for each test (see `mountPage`), which rebuilds the module registry and
// with it any mock the factory creates. Delegating to one long-lived spy keeps the handle the tests
// configure and the function the page calls the same object.
const mockImportSettingsFromFile = jest.fn();
jest.mock('../../../src/utils/settings-portability.js', () => ({
  importSettingsFromFile: (...args) => mockImportSettingsFromFile(...args),
}));

const PAGE = `
  <div id="welcome-status" role="status" aria-live="polite"></div>
  <section id="view-intent">
    <h1 id="intent-heading" tabindex="-1">Welcome to AssisT</h1>
    <fieldset>
      <legend>Which guides would you like to complete?</legend>
      <div id="track-choices"></div>
      <p id="selection-warning" hidden></p>
    </fieldset>
    <button id="btn-continue" type="button">Continue</button>
  </section>
  <section id="view-hub" hidden>
    <h1 id="hub-heading" tabindex="-1">Your setup checklist</h1>
    <ol id="hub-checklist"></ol>
    <div id="hub-complete" hidden><button id="btn-finish" type="button">Open AssisT</button></div>
  </section>
`;

/** Let the page's async handlers settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Mount the page fresh, with an optional query string, and return once it has booted.
 * @param {string} [search]
 */
async function mountPage(search = '') {
  jest.resetModules();
  document.body.innerHTML = PAGE;
  window.history.replaceState({}, '', `/welcome.html${search}`);
  await import('../../../src/pages/welcome/welcome.js');
  await settle();
}

function tick(trackId) {
  const input = document.getElementById(`track-${trackId}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

async function pressContinue() {
  press(document.getElementById('btn-continue'));
  await settle();
}

/** The <li> for a track. */
function row(trackId) {
  return document.querySelector(`#hub-checklist li[data-track-id="${trackId}"]`);
}

/** The stored value of a key across every set() the page has made. */
function lastWrite(key) {
  const calls = chrome.storage.local.set.mock.calls.filter(([payload]) => key in payload);
  return calls.length ? calls[calls.length - 1][0][key] : undefined;
}

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  mockImportSettingsFromFile.mockResolvedValue({
    ok: false,
    code: 'no-file',
    message: 'No file was chosen.',
  });
});

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

describe('the picker', () => {
  it('offers one checkbox per guide, in queue order', async () => {
    await mountPage();
    const ids = Array.from(document.querySelectorAll('#track-choices input[type="checkbox"]')).map(
      input => input.value
    );
    expect(ids).toEqual(['clean', 'import', 'ai-setup', 'discover']);
  });

  it('says nothing about the selection until it contradicts itself', async () => {
    await mountPage();
    const note = document.getElementById('selection-warning');
    tick('clean');
    expect(note.hasAttribute('hidden')).toBe(true);
    tick('import');
    expect(note.hasAttribute('hidden')).toBe(false);
    expect(note.textContent).toContain('switch everything off first');
  });

  it('takes the note back down when the contradiction is resolved', async () => {
    await mountPage();
    tick('clean');
    tick('import');
    const input = document.getElementById('track-import');
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('selection-warning').hasAttribute('hidden')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Picking nothing
// ---------------------------------------------------------------------------

describe('picking nothing', () => {
  it('is allowed — Continue is never disabled', async () => {
    await mountPage();
    expect(document.getElementById('btn-continue').disabled).toBe(false);
  });

  it('leaves one step, the question about online services, and finishes once it is answered', async () => {
    await mountPage();
    await pressContinue();
    const ids = Array.from(document.querySelectorAll('#hub-checklist li')).map(
      li => li.dataset.trackId
    );
    expect(ids).toEqual(['consent']);
    expect(document.getElementById('hub-complete').hasAttribute('hidden')).toBe(true);

    press(row('consent').querySelector('.btn-save-consent'));
    await settle();
    await settle();
    expect(document.getElementById('hub-complete').hasAttribute('hidden')).toBe(false);
    expect(lastWrite('onboardingComplete')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clean setup
// ---------------------------------------------------------------------------

describe('the clean setup step', () => {
  it('writes nothing until the student presses the button', async () => {
    await mountPage();
    tick('clean');
    await pressContinue();
    expect(row('clean').textContent).toContain('switches off every AssisT feature');
    expect(lastWrite('assist_settings')).toBeUndefined();
  });

  it('switches every registry tool off when pressed, and marks itself done', async () => {
    await mountPage();
    tick('clean');
    await pressContinue();
    press(row('clean').querySelector('button'));
    await settle();

    const settings = lastWrite('assist_settings');
    expect(settings.tts.enabled).toBe(false);
    expect(settings.citation.enabled).toBe(false);
    expect(lastWrite('aiMode')).toBe('off');
    expect(row('clean').className).toContain('hub-step--done');
  });
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

describe('the import step', () => {
  async function startImportOnly() {
    await mountPage();
    tick('import');
    await pressContinue();
  }

  function chooseFile() {
    const input = row('import').querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', {
      value: [new File(['{}'], 'assist-settings.json', { type: 'application/json' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return settle();
  }

  it('hands the chosen file to the portability module', async () => {
    await startImportOnly();
    await chooseFile();
    expect(mockImportSettingsFromFile).toHaveBeenCalledTimes(1);
    expect(mockImportSettingsFromFile.mock.calls[0][0].name).toBe('assist-settings.json');
  });

  it('leaves the step open and changes nothing when the file is refused', async () => {
    mockImportSettingsFromFile.mockResolvedValue({
      ok: false,
      code: 'file-too-new',
      message: 'That file was saved by a newer version of AssisT.',
    });
    await startImportOnly();
    await chooseFile();

    expect(document.getElementById('import-result').textContent).toContain(
      'That file was saved by a newer version of AssisT.'
    );
    expect(row('import').className).not.toContain('hub-step--done');
    expect(row('import').querySelector('input[type="file"]')).not.toBeNull();
  });

  it('marks itself done and offers an undo when the file is applied', async () => {
    mockImportSettingsFromFile.mockResolvedValue({
      ok: true,
      applied: ['assist_settings', 'aiMode'],
      ignored: [],
      meta: { schemaVersion: 1, extensionVersion: '0.10.0', exportedAt: '' },
      undo: jest.fn().mockResolvedValue(undefined),
    });
    await startImportOnly();
    await chooseFile();

    expect(row('import').className).toContain('hub-step--done');
    expect(document.getElementById('import-result').textContent).toContain('2 settings applied');
    expect(document.querySelector('.btn-undo')).not.toBeNull();
  });

  it('re-opens the step when the import is undone, so another file can be tried', async () => {
    const undo = jest.fn().mockResolvedValue(undefined);
    mockImportSettingsFromFile.mockResolvedValue({
      ok: true,
      applied: ['aiMode'],
      ignored: [],
      meta: {},
      undo,
    });
    await startImportOnly();
    await chooseFile();

    press(document.querySelector('.btn-undo'));
    await settle();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(row('import').className).not.toContain('hub-step--done');
    expect(row('import').querySelector('input[type="file"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ordering, including the contradictory pair
// ---------------------------------------------------------------------------

describe('the order steps run in', () => {
  it('runs clean setup before import, and holds import until it is finished', async () => {
    await mountPage();
    tick('import');
    tick('clean');
    await pressContinue();

    const ids = Array.from(document.querySelectorAll('#hub-checklist li')).map(
      li => li.dataset.trackId
    );
    expect(ids).toEqual(['clean', 'import', 'consent']);
    expect(row('import').querySelector('input[type="file"]')).toBeNull();
    expect(row('import').textContent).toContain('Available once the step above is finished');

    press(row('clean').querySelector('button'));
    await settle();
    expect(row('import').querySelector('input[type="file"]')).not.toBeNull();
  });

  it('hands focus to the newly available control, not back to the top of the page', async () => {
    await mountPage();
    tick('clean');
    tick('import');
    await pressContinue();

    press(row('clean').querySelector('button'));
    await settle();
    expect(document.activeElement).toBe(row('import').querySelector('input[type="file"]'));
  });

  it('holds the discovery quiz until a clean setup that would wipe it has run', async () => {
    await mountPage();
    tick('discover');
    tick('clean');
    await pressContinue();

    expect(row('discover').querySelector('button')).toBeNull();
    press(row('clean').querySelector('button'));
    await settle();
    expect(row('discover').querySelector('button')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

describe('resuming after an external guide', () => {
  it('marks the track the guide names done and shows the checklist', async () => {
    chrome.storage.local.get.mockImplementation(async keys => {
      if (keys === 'onboardingQueue') {
        return {
          onboardingQueue: [
            {
              trackId: 'ai-setup',
              kind: 'external',
              label: 'AI setup',
              requiresAI: true,
              status: 'pending',
              url: 'src/pages/ai-setup/ai-setup.html',
            },
            {
              trackId: 'discover',
              kind: 'external',
              label: 'Discover your tools',
              requiresAI: false,
              status: 'pending',
              url: 'src/pages/discovery/discovery.html',
            },
          ],
        };
      }
      return {};
    });

    await mountPage('?resume=1&done=ai-setup');

    expect(document.getElementById('view-hub').hasAttribute('hidden')).toBe(false);
    expect(row('ai-setup').className).toContain('hub-step--done');
    expect(row('discover').querySelector('button')).not.toBeNull();
  });

  it('falls back to the picker when there is no queue to resume', async () => {
    await mountPage('?resume=1&done=discover');
    expect(document.getElementById('view-intent').hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('view-hub').hasAttribute('hidden')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Keyboard operability (WCAG 2.2 SC 2.1.1)
// ---------------------------------------------------------------------------

describe('working the page without a mouse', () => {
  // A native button never emits mousedown from the keyboard: Enter and Space produce a click.
  // `press` above therefore proves nothing about the keyboard, and a page wired to mousedown alone
  // passes every test in this file while leaving a keyboard user stuck on the first screen.
  const pressKey = (el, key) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('moves on from the picker when Continue is pressed with Enter', async () => {
    await mountPage();
    pressKey(document.getElementById('btn-continue'), 'Enter');
    await settle();
    expect(document.getElementById('view-hub').hasAttribute('hidden')).toBe(false);
    expect(row('consent')).not.toBeNull();
  });

  it('saves the answers about online services with Enter', async () => {
    await mountPage();
    await pressContinue();
    pressKey(row('consent').querySelector('.btn-save-consent'), 'Enter');
    await settle();
    await settle();
    expect(lastWrite('onboardingComplete')).toBe(true);
  });

  it('moves on from the picker when Continue is pressed with Space', async () => {
    await mountPage();
    pressKey(document.getElementById('btn-continue'), ' ');
    await settle();
    expect(document.getElementById('view-hub').hasAttribute('hidden')).toBe(false);
  });

  it('closes the tab when Open AssisT is pressed with Enter', async () => {
    await mountPage();
    const close = jest.spyOn(window, 'close').mockImplementation(() => {});
    await pressContinue();
    pressKey(document.getElementById('btn-finish'), 'Enter');
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Skip and Back (WCAG 2.2 SC 2.1.1 / SC 2.4.3 — no step may be a dead end)
// ---------------------------------------------------------------------------

describe('skipping a step', () => {
  /** The nav button with this class on a track's row. */
  const navButton = (trackId, cls) => row(trackId).querySelector(`.${cls}`);

  it('offers a skip on the step in hand', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    expect(navButton('import', 'btn-skip-step')).not.toBeNull();
  });

  it('lets a student with no settings file past the import and on to the next guide', async () => {
    await mountPage();
    tick('import');
    tick('ai-setup');
    await pressContinue();

    expect(row('ai-setup').textContent).toContain('Available once the step above is finished');

    press(navButton('import', 'btn-skip-step'));
    await settle();

    expect(row('import').querySelector('input[type="file"]')).toBeNull();
    expect(row('ai-setup').querySelector('button')).not.toBeNull();
  });

  it('says the step was skipped rather than done', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    press(navButton('import', 'btn-skip-step'));
    await settle();

    expect(row('import').textContent).toContain('(skipped)');
    expect(row('import').className).toContain('hub-step--skipped');
  });

  it('finishes the run when the last remaining step is skipped', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    press(navButton('import', 'btn-skip-step'));
    await settle();
    expect(document.getElementById('hub-complete').hasAttribute('hidden')).toBe(true);

    press(navButton('consent', 'btn-skip-step'));
    await settle();

    expect(document.getElementById('hub-complete').hasAttribute('hidden')).toBe(false);
    expect(lastWrite('onboardingComplete')).toBe(true);
  });

  it('skips from the keyboard, not the mouse alone', async () => {
    await mountPage();
    tick('import');
    tick('ai-setup');
    await pressContinue();

    navButton('import', 'btn-skip-step').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    await settle();

    expect(row('ai-setup').querySelector('button')).not.toBeNull();
  });

  it('changes no settings — skipping is not importing an empty file', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    press(navButton('import', 'btn-skip-step'));
    await settle();

    expect(mockImportSettingsFromFile).not.toHaveBeenCalled();
    expect(lastWrite('assist_settings')).toBeUndefined();
  });
});

describe('going back', () => {
  const navButton = (trackId, cls) => row(trackId).querySelector(`.${cls}`);

  it('returns to the picker from the first step', async () => {
    await mountPage();
    tick('import');
    await pressContinue();

    press(navButton('import', 'btn-back-step'));
    await settle();

    expect(document.getElementById('view-intent').hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('view-hub').hasAttribute('hidden')).toBe(true);
  });

  it('re-opens the previous step instead, once there is one', async () => {
    await mountPage();
    tick('clean');
    tick('import');
    await pressContinue();

    press(row('clean').querySelector('.btn-destructive'));
    await settle();
    expect(row('import').querySelector('input[type="file"]')).not.toBeNull();

    press(navButton('import', 'btn-back-step'));
    await settle();

    expect(row('clean').querySelector('.btn-destructive')).not.toBeNull();
    expect(row('import').querySelector('input[type="file"]')).toBeNull();
  });

  it('names where Back goes, so it is not a mystery button', async () => {
    await mountPage();
    tick('clean');
    tick('import');
    await pressContinue();

    expect(navButton('clean', 'btn-back-step').getAttribute('aria-label')).toContain(
      'guide picker'
    );

    press(row('clean').querySelector('.btn-destructive'));
    await settle();
    expect(navButton('import', 'btn-back-step').getAttribute('aria-label')).toContain(
      'Clean setup'
    );
  });
});

// ---------------------------------------------------------------------------
// Focus when the page swaps one view for another (WCAG 2.2 SC 2.4.3)
// ---------------------------------------------------------------------------

describe('where focus lands when the view changes', () => {
  it('moves to the checklist heading when the picker is replaced', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    expect(document.activeElement).toBe(document.getElementById('hub-heading'));
  });

  it('moves to the picker heading when Back returns to it', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    press(row('import').querySelector('.btn-back-step'));
    await settle();
    expect(document.activeElement).toBe(document.getElementById('intent-heading'));
  });

  it('does not steal focus on first paint', async () => {
    await mountPage();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves the checklist heading out of the tab order once focused', async () => {
    await mountPage();
    await pressContinue();
    expect(document.getElementById('hub-heading').getAttribute('tabindex')).toBe('-1');
  });
});

// ---------------------------------------------------------------------------
// The question about online services (ADR 0006)
// ---------------------------------------------------------------------------

describe('the step that asks about online services', () => {
  let stored;

  beforeEach(() => {
    stored = {};
    chrome.storage.local.get.mockImplementation(async key => {
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) {
        if (k in stored) {
          out[k] = JSON.parse(JSON.stringify(stored[k]));
        }
      }
      return out;
    });
    chrome.storage.local.set.mockImplementation(async values => {
      Object.assign(stored, JSON.parse(JSON.stringify(values)));
    });
    chrome.permissions = {
      request: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(true),
      contains: jest.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    delete chrome.permissions;
  });

  const services = () =>
    Array.from(row('consent').querySelectorAll('fieldset')).map(f => f.dataset.destination);

  function choose(destination, allow) {
    const input = row('consent').querySelector(
      `input[name="consent-${destination}"][value="${allow ? 'allow' : 'decline'}"]`
    );
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('lists only what a default install would reach', async () => {
    await mountPage();
    await pressContinue();
    expect(services()).toEqual([
      'dictionary',
      'translation',
      'pageTranslation',
      'citations',
      'lectureCapture',
    ]);
  });

  it('works the list out when it is reached, after the steps before it changed things', async () => {
    await mountPage();
    tick('clean');
    await pressContinue();
    expect(row('consent').querySelector('fieldset')).toBeNull();

    press(row('clean').querySelector('button'));
    await settle();
    // Clean setup switched the dictionary, the menu, citations and the lecture companion off;
    // Translate Page stays, because it is a button in the popup.
    expect(services()).toEqual(['pageTranslation']);
    expect(stored.companionFeatures).toMatchObject({ lecture: false });
  });

  it('adds the cloud AI provider AI setup chose', async () => {
    stored.aiMode = 'cloud';
    stored.cloudProvider = 'google';
    await mountPage();
    await pressContinue();
    expect(services()).toEqual([
      'dictionary',
      'translation',
      'pageTranslation',
      'citations',
      'lectureCapture',
      'google',
    ]);
  });

  it('records the ones allowed and the ones declined, and leaves the rest unasked', async () => {
    await mountPage();
    await pressContinue();
    choose('dictionary', true);
    choose('translation', false);
    press(row('consent').querySelector('.btn-save-consent'));
    await settle();
    await settle();

    expect(stored.assist_consent_dictionary.granted).toBe(true);
    expect(stored.assist_consent_translation.granted).toBe(false);
    expect(stored.assist_consent_citations).toBeUndefined();
    expect(row('consent').className).toContain('hub-step--done');
    // Only the host of the service allowed is asked for (ADR 0009).
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.dictionaryapi.dev/*'],
    });
  });

  it('asks Chrome once, from the save press itself, for the hosts of what was allowed', async () => {
    stored.assist_settings = { citation: { verifyOnline: true } };
    await mountPage();
    await pressContinue();
    choose('citationVerification', true);
    choose('dictionary', true);
    press(row('consent').querySelector('.btn-save-consent'));

    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.dictionaryapi.dev/*', 'https://api.semanticscholar.org/*'],
    });
    await settle();
    await settle();
    expect(stored.assist_consent_citationVerification.granted).toBe(true);
  });

  it('records nothing when skipped, so the first-use question takes over', async () => {
    await mountPage();
    await pressContinue();
    choose('dictionary', true);
    press(row('consent').querySelector('.btn-skip-step'));
    await settle();

    expect(Object.keys(stored).filter(key => key.startsWith('assist_consent'))).toEqual([]);
    expect(row('consent').className).toContain('hub-step--skipped');
  });

  it('puts the keyboard on the first question when it becomes the step in hand', async () => {
    await mountPage();
    tick('import');
    await pressContinue();
    press(row('import').querySelector('.btn-skip-step'));
    await settle();
    expect(document.activeElement).toBe(
      row('consent').querySelector('input[name="consent-dictionary"]')
    );
  });
});
