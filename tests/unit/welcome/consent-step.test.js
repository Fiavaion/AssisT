/**
 * @jest-environment jsdom
 *
 * The wizard's consent step (ADR 0006): the one place a student who goes through the welcome page
 * is asked about sending anything off the device.
 *
 * What it must get right:
 *   - it lists only the services the student's choices would actually reach, by then;
 *   - each is allowed or declined on its own, and one left alone stays "not asked";
 *   - where a service needs an optional Chrome permission, every one of them is requested in ONE
 *     call, in the same tick as the click that confirmed the step (Chrome only prompts inside a
 *     user gesture), and a refused prompt is recorded as a no;
 *   - confirming sends nothing anywhere; it only records answers.
 */

import {
  CONSENT_STEP_ID,
  withConsentStep,
  destinationsForChoices,
  createConsentPanel,
  confirmConsentChoices,
} from '../../../src/pages/welcome/consent-step.js';
import { cleanWrites } from '../../../src/pages/onboarding/clean-setup.js';
import { planWrites } from '../../../src/utils/setting-writes.js';
import { consentStorageKey, DESTINATIONS, getConsent } from '../../../src/utils/consent.js';

let stored;

beforeEach(() => {
  stored = {};
  chrome.storage.local.get = jest.fn(async key => {
    const keys = key === null ? Object.keys(stored) : Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) {
      if (k in stored) {
        out[k] = JSON.parse(JSON.stringify(stored[k]));
      }
    }
    return out;
  });
  chrome.storage.local.set = jest.fn(async values => {
    Object.assign(stored, JSON.parse(JSON.stringify(values)));
  });
  chrome.permissions = {
    request: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
  };
  global.fetch = jest.fn();
});

afterAll(() => {
  delete chrome.permissions;
});

describe('the step in the queue', () => {
  it('comes last, after every guide that could change what is switched on', () => {
    const queue = withConsentStep([
      { trackId: 'ai-setup', status: 'pending' },
      { trackId: 'discover', status: 'pending' },
    ]);
    expect(queue.map(step => step.trackId)).toEqual(['ai-setup', 'discover', CONSENT_STEP_ID]);
    expect(queue[2]).toMatchObject({ kind: 'inline', status: 'pending' });
  });

  it('is there even when no guide was picked, and never twice', () => {
    expect(withConsentStep([]).map(step => step.trackId)).toEqual([CONSENT_STEP_ID]);
    expect(withConsentStep(withConsentStep([])).length).toBe(1);
  });
});

describe('which services the step asks about', () => {
  // The lecture companion is on by default, and it is its own question (it hears the whole room).
  it('asks a default install about the dictionary, translation, Translate Page, Crossref and lecture capture, and nothing else', () => {
    expect(destinationsForChoices({ settings: {}, local: {} })).toEqual([
      'dictionary',
      'translation',
      'pageTranslation',
      'citations',
      'lectureCapture',
    ]);
  });

  it('asks about lecture capture only while the lecture companion is on', () => {
    expect(
      destinationsForChoices({ settings: {}, local: { companionFeatures: { lecture: true } } })
    ).toContain('lectureCapture');
    expect(
      destinationsForChoices({ settings: {}, local: { companionFeatures: { lecture: false } } })
    ).not.toContain('lectureCapture');
    expect(
      destinationsForChoices({ settings: {}, local: { companionFeatures: { flashcards: false } } })
    ).toContain('lectureCapture');
  });

  it('asks about dictation, which sends the voice to Google, only when dictation is on', () => {
    expect(destinationsForChoices({ settings: { stt: { enabled: true } } })).toContain('dictation');
    expect(destinationsForChoices({ settings: { stt: { enabled: false } } })).not.toContain(
      'dictation'
    );
    expect(destinationsForChoices({ settings: {} })).not.toContain('dictation');
  });

  it('asks about jsDelivr only when OCR reads in a language that is downloaded (ADR 0008)', () => {
    expect(destinationsForChoices({ settings: {} })).not.toContain('ocrLanguages');
    expect(destinationsForChoices({ settings: { ocr: { language: 'eng' } } })).not.toContain(
      'ocrLanguages'
    );
    expect(destinationsForChoices({ settings: { ocr: { language: 'spa' } } })).toContain(
      'ocrLanguages'
    );
    expect(
      destinationsForChoices({ settings: { ocr: { enabled: false, language: 'spa' } } })
    ).not.toContain('ocrLanguages');
  });

  it('adds Semantic Scholar only when online citation checking is on', () => {
    const on = destinationsForChoices({ settings: { citation: { verifyOnline: true } } });
    expect(on).toContain('citationVerification');
    const off = destinationsForChoices({ settings: { citation: { verifyOnline: false } } });
    expect(off).not.toContain('citationVerification');
  });

  it('adds the cloud AI provider the student chose, and only that one', () => {
    const chosen = destinationsForChoices({
      settings: {},
      local: { aiMode: 'cloud', cloudProvider: 'openai' },
    });
    expect(chosen).toContain('openai');
    expect(chosen).not.toContain('anthropic');
  });

  it('uses the router default provider when cloud AI is on and none was chosen', () => {
    expect(destinationsForChoices({ local: { aiMode: 'cloud' } })).toContain('anthropic');
  });

  it('asks about no cloud AI when AI runs on the device or is off', () => {
    for (const aiMode of ['off', 'local', 'webllm']) {
      const list = destinationsForChoices({ local: { aiMode, cloudProvider: 'anthropic' } });
      expect(list).not.toContain('anthropic');
    }
  });

  it('drops the dictionary when its button is switched off', () => {
    const list = destinationsForChoices({ settings: { highlightMenu: { showDictionary: false } } });
    expect(list).not.toContain('dictionary');
  });

  // A clean setup switches off the popup's tools and the lecture companion, so the microphone is
  // not asked about.
  it('after a clean setup asks only about Translate Page, which stays a button in the popup', () => {
    const { assist_settings: settings, ...local } = planWrites(cleanWrites(), {});
    expect(destinationsForChoices({ settings, local })).toEqual(['pageTranslation']);
  });

  it('asks about nothing when nothing switched on sends anything', () => {
    const { assist_settings: settings, ...local } = planWrites(cleanWrites(), {});
    settings.ui_visibility = { show_translation: false };
    expect(destinationsForChoices({ settings, local })).toEqual([]);
  });
});

/** @param {string[]} destinations */
function choicesFor(destinations) {
  return destinations.map(destination => ({
    destination,
    state: 'unasked',
    ...DESTINATIONS[destination],
  }));
}

function choose(panel, destination, allow) {
  const radio = panel.querySelector(
    `input[type="radio"][name="consent-${destination}"][value="${allow ? 'allow' : 'decline'}"]`
  );
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('the panel', () => {
  it('names each service and says what is sent, one group per service', () => {
    const panel = createConsentPanel(choicesFor(['dictionary', 'openai']), {});
    const groups = [...panel.querySelectorAll('fieldset')];
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('legend').textContent).toContain('Free Dictionary');
    expect(groups[0].textContent).toContain(DESTINATIONS.dictionary.sends);
    expect(groups[1].querySelector('legend').textContent).toContain('OpenAI');
  });

  // MyMemory and Google speech recognition each answer two questions; titled by service alone,
  // the two cards looked like the same question asked twice.
  it('titles each card with the service and what it is used for, so no two titles match', () => {
    const panel = createConsentPanel(
      choicesFor(['translation', 'pageTranslation', 'dictation', 'lectureCapture']),
      {}
    );
    const titles = [...panel.querySelectorAll('legend')].map(legend => legend.textContent);
    expect(titles[1]).toBe('MyMemory: translate the whole page');
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('offers Allow and Don’t allow for each service, with neither chosen for one never asked', () => {
    const panel = createConsentPanel(choicesFor(['dictionary']), {});
    const radios = [...panel.querySelectorAll('input[type="radio"]')];
    expect(radios.map(r => r.labels[0].textContent)).toEqual(['Allow', 'Don’t allow']);
    expect(radios.some(r => r.checked)).toBe(false);
  });

  it('shows an answer already given as already chosen', () => {
    const [choice] = choicesFor(['dictionary']);
    const panel = createConsentPanel([{ ...choice, state: 'declined' }], {});
    expect(panel.querySelector('input[value="decline"]').checked).toBe(true);
    expect(panel.querySelector('input[value="allow"]').checked).toBe(false);
  });

  // One press fills in every answer; the save still decides what is recorded and asked of Chrome.
  describe('Allow all and Don’t allow any', () => {
    const three = () => choicesFor(['dictionary', 'translation', 'citations']);
    const bulk = panel => panel.querySelector('[role="group"].consent-step__bulk');
    const bulkButton = (panel, text) =>
      [...bulk(panel).querySelectorAll('button')].find(b => b.textContent === text);
    const mousedown = button =>
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const answersIn = panel =>
      [...panel.querySelectorAll('fieldset')].map(
        f => f.querySelector('input:checked')?.value ?? null
      );

    it('sits in a labelled group under the introduction and above the first question', () => {
      const panel = createConsentPanel(three(), {});
      const group = bulk(panel);
      expect(group).not.toBeNull();
      expect(group.getAttribute('aria-label')).toBeTruthy();
      const buttons = [...group.querySelectorAll('button')];
      expect(buttons.map(b => b.textContent)).toEqual(['Allow all', 'Don’t allow any']);
      expect(buttons.every(b => b.type === 'button')).toBe(true);
      const intros = panel.querySelectorAll('.consent-step__intro');
      expect(intros[intros.length - 1].nextElementSibling).toBe(group);
      const first = panel.querySelector('fieldset');
      expect(group.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('Allow all sets every question to Allow and says so politely, without saving', () => {
      const onSave = jest.fn();
      const panel = createConsentPanel(three(), { onSave });
      mousedown(bulkButton(panel, 'Allow all'));
      expect(answersIn(panel)).toEqual(['allow', 'allow', 'allow']);
      const status = panel.querySelector('.consent-step__bulk-status');
      expect(status.getAttribute('role')).toBe('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent).toBe('All 3 set to Allow. Press Save my choices to keep them.');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('Don’t allow any works from the keyboard and overrides earlier answers', () => {
      const panel = createConsentPanel(three(), {});
      choose(panel, 'dictionary', true);
      bulkButton(panel, 'Don’t allow any').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
      expect(answersIn(panel)).toEqual(['decline', 'decline', 'decline']);
      expect(panel.querySelector('.consent-step__bulk-status').textContent).toBe(
        'All 3 set to Don’t allow. Press Save my choices to keep them.'
      );
    });

    it('records nothing and asks Chrome for nothing until Save my choices is pressed', () => {
      const panel = createConsentPanel(three(), {});
      mousedown(bulkButton(panel, 'Allow all'));
      expect(chrome.permissions.request).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('leaves each answer changeable, and the save hands over what is chosen then', () => {
      const onSave = jest.fn();
      const panel = createConsentPanel(three(), { onSave });
      mousedown(bulkButton(panel, 'Allow all'));
      choose(panel, 'translation', false);
      mousedown(panel.querySelector('.btn-save-consent'));
      expect(onSave).toHaveBeenCalledWith({
        dictionary: true,
        translation: false,
        citations: true,
      });
    });

    it('clears the status once a single answer is changed, since it is no longer true', () => {
      const panel = createConsentPanel(three(), {});
      mousedown(bulkButton(panel, 'Allow all'));
      const status = panel.querySelector('.consent-step__bulk-status');
      expect(status.textContent).not.toBe('');
      choose(panel, 'translation', false);
      expect(status.textContent).toBe('');
    });

    it('is not offered for a single question, nor when there is nothing to ask', () => {
      expect(bulk(createConsentPanel(choicesFor(['dictionary']), {}))).toBeNull();
      expect(bulk(createConsentPanel([], {}))).toBeNull();
    });
  });

  it('hands the answers given, and only those, to onSave', () => {
    const onSave = jest.fn();
    const panel = createConsentPanel(choicesFor(['dictionary', 'translation', 'citations']), {
      onSave,
    });
    choose(panel, 'dictionary', true);
    choose(panel, 'translation', false);
    panel
      .querySelector('.btn-save-consent')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onSave).toHaveBeenCalledWith({ dictionary: true, translation: false });
  });

  it('is operable from the keyboard: Enter on the save button saves', () => {
    const onSave = jest.fn();
    const panel = createConsentPanel(choicesFor(['dictionary']), { onSave });
    choose(panel, 'dictionary', true);
    panel
      .querySelector('.btn-save-consent')
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    expect(onSave).toHaveBeenCalledWith({ dictionary: true });
  });

  it('says where to change the answers, in words that match the popup', () => {
    const panel = createConsentPanel(choicesFor(['dictionary']));
    expect(panel.textContent).toMatch(/Advanced options \(the gear button\), then Your data/);
    expect(panel.textContent).not.toMatch(/Settings, then/);
  });

  it('says plainly that nothing is sent when there is nothing to ask', () => {
    const onSave = jest.fn();
    const panel = createConsentPanel([], { onSave });
    expect(panel.textContent).toMatch(/nothing you have switched on sends anything/i);
    expect(panel.querySelectorAll('fieldset')).toHaveLength(0);
    panel
      .querySelector('.btn-save-consent')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onSave).toHaveBeenCalledWith({});
  });
});

describe('confirming the step', () => {
  it('records each answer, and leaves a service with no answer unasked', async () => {
    await confirmConsentChoices({ dictionary: true, translation: false });
    await expect(getConsent('dictionary')).resolves.toBe('granted');
    await expect(getConsent('translation')).resolves.toBe('declined');
    await expect(getConsent('citations')).resolves.toBe('unasked');
  });

  it('shows no Chrome prompt when nothing allowed needs an optional permission', async () => {
    // Dictation goes through Chrome's own speech service, so AssisT needs no host for it.
    await confirmConsentChoices({ dictation: true, lectureCapture: true });
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('asks for the dictionary, MyMemory and Crossref hosts with their answers (ADR 0009)', () => {
    confirmConsentChoices({
      dictionary: true,
      translation: true,
      pageTranslation: true,
      citations: true,
    });
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: [
        'https://api.dictionaryapi.dev/*',
        'https://api.mymemory.translated.net/*',
        'https://api.crossref.org/*',
      ],
    });
  });

  it('asks Chrome for the Google Gemini host when Gemini is allowed (ADR 0007)', async () => {
    const done = confirmConsentChoices({ dictation: true, google: true });
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
    await done;
    await expect(getConsent('google')).resolves.toBe('granted');
  });

  it('asks Chrome once, in the same tick, for exactly the optional hosts of the allowed services', async () => {
    const done = confirmConsentChoices({
      dictation: true,
      citationVerification: true,
      anthropic: true,
    });
    // Before anything is awaited: a later call would have lost the click's user gesture.
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.semanticscholar.org/*', 'https://api.anthropic.com/*'],
    });
    await done;
    await expect(getConsent('citationVerification')).resolves.toBe('granted');
    await expect(getConsent('anthropic')).resolves.toBe('granted');
  });

  it('does not ask Chrome for the host of a service the student declined', async () => {
    await confirmConsentChoices({ citationVerification: false });
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    await expect(getConsent('citationVerification')).resolves.toBe('declined');
  });

  it('records a no for the service whose Chrome prompt was refused, and keeps the other answers', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    const result = await confirmConsentChoices({ dictation: true, citationVerification: true });
    await expect(getConsent('citationVerification')).resolves.toBe('declined');
    await expect(getConsent('dictation')).resolves.toBe('granted');
    expect(result.permissionRefused).toBe(true);
  });

  it('sends nothing anywhere: confirming only records answers', async () => {
    await confirmConsentChoices({ dictionary: true, translation: true });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(Object.keys(stored).sort()).toEqual(
      [consentStorageKey('dictionary'), consentStorageKey('translation')].sort()
    );
  });
});
