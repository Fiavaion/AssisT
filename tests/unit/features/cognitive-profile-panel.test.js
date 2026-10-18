/**
 * @jest-environment jsdom
 *
 * A record a student cannot look at is not one they can meaningfully consent to. The panel that
 * shows what has been recorded existed but nothing could open it — `profile_show()` was reachable
 * only through `window.assistFeatures.cognitiveProfile.show`, which nothing in the codebase called,
 * and the popup offered only "Delete this record".
 *
 * So: the popup asks the page to open it, the panel is a real dialog (labelled, focus moved in,
 * Tab kept inside, Escape closes, focus returned), and it says in plain words what each number
 * means rather than showing a grid of developer counters.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(async () => true),
  COMPANION_STORAGE_KEY: 'companionFeatures',
}));

const FEATURE = '../../../src/features/cognitiveProfile/cognitiveProfile.js';
const SETTINGS_KEY = 'cognitiveProfileSettings';
const PROFILE_KEY = 'assist_cognitive_profile';
const SHOW_MESSAGE = 'COGNITIVE_PROFILE_SHOW';

let messageListeners;
let changeListeners;

/** What a student who has used AssisT for a while has stored. */
function recordedProfile() {
  return {
    complexity: { summarization: 'simple' },
    reading: { preferredSpeed: 1.2, preferredVoice: null },
    learningStyle: { visual: 6, stepByStep: 1, conceptual: 0, examples: 0 },
    subjects: {},
    stats: {
      totalInteractions: 21,
      summarizationsUsed: 9,
      simplificationsUsed: 7,
      breakdownsUsed: 3,
      tutorQuestionsAsked: 2,
      imagesDescribed: 0,
      wordsRead: 12400,
      lastActiveDate: new Date().toISOString().slice(0, 10),
      streakDays: 4,
    },
    feedback: {
      positiveResponses: 0,
      negativeResponses: 0,
      regenerateRequests: 0,
      complexityIncreases: 0,
      complexityDecreases: 5,
    },
    preferences: {},
    meta: { version: 1, createdAt: null, lastUpdated: null },
  };
}

async function loadFeature() {
  const mod = await import(FEATURE);
  await mod.profile_initialize();
  return mod;
}

/** Deliver the message the popup sends, and hand back what the page answered. */
function sendShow() {
  let answer;
  for (const listener of messageListeners) {
    listener({ type: SHOW_MESSAGE }, { id: 'popup' }, value => {
      answer = value;
    });
  }
  return answer;
}

function panel() {
  return document.getElementById('assist-profile-panel');
}

function words() {
  return panel().textContent.replace(/\s+/g, ' ');
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  jest.resetModules();
  messageListeners = [];
  changeListeners = [];
  document.body.innerHTML = '';
  delete window.assistFeatures;
  chrome.storage.onChanged = {
    addListener: jest.fn(l => changeListeners.push(l)),
    removeListener: jest.fn(),
  };
  chrome.runtime.onMessage = { addListener: jest.fn(l => messageListeners.push(l)) };
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
});

afterEach(() => {
  delete chrome.storage.onChanged;
  panel()?.remove();
});

describe('opening it from the popup control', () => {
  test('the page answers the popup and the panel appears', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();

    expect(sendShow()).toEqual({ success: true });
    expect(panel()).toBeTruthy();
  });

  test('it is a labelled modal dialog', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();

    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('true');
    expect(panel().getAttribute('aria-label')).toMatch(/record/i);
  });

  // The sanitiser drops a <style> that leads its markup, which left the panel as loose text at the
  // foot of the page, wider than the screen.
  test('it keeps its stylesheet, so it opens fixed over the page', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();

    const css = Array.from(panel().querySelectorAll('style'))
      .map(style => style.textContent)
      .join('\n');
    expect(css).toMatch(/#assist-profile-panel\s*\{[^}]*position:\s*fixed/);
    expect(panel().querySelector('.assist-profile-header')).toBeTruthy();
  });

  test('nothing opens while the record is switched off, and the popup is told why', async () => {
    await loadFeature();

    const answer = sendShow();

    expect(answer.success).toBe(false);
    expect(typeof answer.reason).toBe('string');
    expect(panel()).toBeNull();
  });
});

describe('keyboard and focus', () => {
  beforeEach(async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    document.body.innerHTML = '<button id="before">elsewhere</button>';
    document.getElementById('before').focus();
    await loadFeature();
  });

  test('focus moves into the panel when it opens', async () => {
    sendShow();
    await flush();

    expect(panel().contains(document.activeElement)).toBe(true);
  });

  // jsdom reports offsetParent as null for everything, so the trap sees a one-element focusable
  // list here; what this locks is that Tab is intercepted and focus cannot leave the panel. The
  // real wrap order is a browser check.
  test('Tab is intercepted, so focus cannot leave the panel (SC 2.1.2)', async () => {
    sendShow();
    await flush();

    const focusable = Array.from(panel().querySelectorAll('button'));
    const last = focusable[focusable.length - 1];
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  test('Escape closes it and focus goes back where it was', async () => {
    sendShow();
    await flush();

    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(panel().style.display).toBe('none');
    expect(document.activeElement.id).toBe('before');
  });

  test('the close button also returns focus', async () => {
    sendShow();
    await flush();

    const close = panel().querySelector('[data-testid="profile-panel-close"]');
    close.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(panel().style.display).toBe('none');
    expect(document.activeElement.id).toBe('before');
  });

  test('closing and reopening traps focus again', async () => {
    sendShow();
    await flush();
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    sendShow();
    await flush();

    expect(panel().contains(document.activeElement)).toBe(true);
  });
});

describe('it says what the numbers mean', () => {
  test('each count is a sentence a student can read', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();

    const text = words();
    // The counts themselves, each next to what it counts rather than under a bare label.
    expect(text).toMatch(/9 times you asked for a summary/i);
    expect(text).toMatch(/7 times you asked for simpler wording/i);
    expect(text).toMatch(/12,400 words were read aloud to you/i);
    expect(text).toMatch(/4 days in a row/i);
    // And what AssisT does with it, in the same plain words.
    expect(text).toMatch(/shorter, simpler answers/i);
    expect(text).toMatch(/this device/i);
  });

  /**
   * The panel says "this is everything AssisT has noticed". It was not: the feedback counts, the
   * learning-style tally and the level last chosen per tool were all recorded and listed nowhere,
   * under a sentence claiming the list was complete.
   */
  test('the counts that shape an AI answer are listed too, not just the tool tallies', async () => {
    const profile = recordedProfile();
    profile.feedback.negativeResponses = 3;
    profile.feedback.regenerateRequests = 2;
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: profile,
    });
    await loadFeature();
    sendShow();

    const text = words();
    expect(text).toMatch(/3 times you said an answer did not help/i);
    expect(text).toMatch(/2 times you asked for an answer to be written again/i);
    expect(text).toMatch(/5 times you asked for something simpler/i);
    // The learning-style tally, as counts rather than as a label pinned on the student.
    expect(text).toMatch(/6 times a picture was the way in/i);
    expect(text).toMatch(/1 hint you took in a step-by-step walk-through/i);
    // And the level it will offer next time.
    expect(text).toMatch(/you last chose "simple" for summaries/i);
  });

  /**
   * "Never sent anywhere" was false: with Personalised AI on, `profile-addendum.js` puts a
   * characterisation of this student into every cloud AI prompt. The panel has to say so.
   */
  test('it admits that a line about the student goes to the AI', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();

    const text = words();
    expect(text).not.toMatch(/never sent anywhere/i);
    expect(text).toMatch(/personalised ai/i);
    expect(text).toMatch(/is sent with your question/i);
    // Still says what does stay put, so the honest version is not just a scare.
    expect(text).toMatch(/nothing you read, typed or dictated/i);
  });

  test('no developer labels survive', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();

    const text = words();
    for (const jargon of [
      'Total Interactions',
      'Usage Statistics',
      'Simplifications',
      'Breakdowns',
      'Tutor Sessions',
      'Words Processed',
      'Complexity Level',
      'Learning Style',
    ]) {
      expect(text).not.toContain(jargon);
    }
  });

  test('a record with nothing in it yet says so', async () => {
    const empty = recordedProfile();
    empty.stats = { ...empty.stats, totalInteractions: 0, wordsRead: 0, streakDays: 0 };
    empty.stats.summarizationsUsed = 0;
    empty.stats.simplificationsUsed = 0;
    empty.stats.breakdownsUsed = 0;
    empty.stats.tutorQuestionsAsked = 0;
    empty.stats.imagesDescribed = 0;
    empty.reading = { preferredSpeed: 1, preferredVoice: null };
    // Empty means empty everywhere: the feedback counts, the style tally and the levels last chosen
    // are part of the record too, and each has its own line in the panel now.
    empty.feedback = {
      positiveResponses: 0,
      negativeResponses: 0,
      regenerateRequests: 0,
      complexityIncreases: 0,
      complexityDecreases: 0,
    };
    empty.learningStyle = { visual: 0, stepByStep: 0, conceptual: 0, examples: 0 };
    empty.complexity = { summarization: 'moderate', simplification: 'moderate' };
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: empty,
    });
    await loadFeature();
    sendShow();

    expect(words()).toMatch(/nothing has been recorded yet/i);
  });

  test('switching the record off while the panel is open takes the panel with it', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [SETTINGS_KEY]: { enabled: true },
      [PROFILE_KEY]: recordedProfile(),
    });
    await loadFeature();
    sendShow();
    expect(panel()).toBeTruthy();

    for (const listener of changeListeners) {
      listener({ [SETTINGS_KEY]: { newValue: { enabled: false } } }, 'local');
    }
    await flush();

    expect(panel()).toBeNull();
  });

  test('asked while it is off, the student is told in words rather than shown nothing', async () => {
    await loadFeature();
    // jest.resetModules() gives the feature a fresh copy of the mocked toast, so the assertion
    // has to read that copy rather than one imported before the reset.
    const { showToast } = await import('../../../src/core/ui/toast.js');

    sendShow();

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/off/i));
  });
});
