/**
 * Consent to send something off the device, one answer per destination (ADR 0006).
 *
 * The rules that matter are the ones a shortcut would break: a missing or unreadable answer is not
 * a yes, a withdrawal counts from the very next read, and nothing is remembered anywhere but in
 * storage, so the popup, the worker and a content script all see the same answer.
 */

import {
  CONSENT_STORAGE_KEYS,
  consentStorageKey,
  describeCloudConsent,
  DESTINATIONS,
  getConsent,
  hasConsent,
  recordConsent,
  withdrawConsent,
  listConsents,
} from '../../../src/utils/consent.js';

let stored;

beforeEach(() => {
  stored = {};
  chrome.storage.local.get = jest.fn(async key => {
    const keys = Array.isArray(key) ? key : [key];
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
});

describe('the destinations a student can be asked about', () => {
  it('names dictionary, translation, Crossref and Semantic Scholar', () => {
    expect(Object.keys(DESTINATIONS)).toEqual(
      expect.arrayContaining(['dictionary', 'translation', 'citations', 'citationVerification'])
    );
  });

  it('describes each one in words a student can act on: a service name and what is sent', () => {
    for (const destination of Object.values(DESTINATIONS)) {
      expect(destination.service).toEqual(expect.any(String));
      expect(destination.service.length).toBeGreaterThan(2);
      expect(destination.sends).toEqual(expect.any(String));
      expect(destination.action).toEqual(expect.any(String));
      // Only what a screen shows: nothing reads a field that is not there. `note` is the one
      // optional line, shown by the panel and the consent window when a service has one.
      expect(Object.keys(destination).filter(key => key !== 'note').sort()).toEqual([
        'action',
        'sends',
        'service',
      ]);
    }
  });

  it('says that dictation sends the student’s voice to Google', () => {
    expect(DESTINATIONS.dictation.service).toMatch(/Google/);
    expect(DESTINATIONS.dictation.sends).toMatch(/voice/);
    expect(`${DESTINATIONS.dictation.service} ${DESTINATIONS.dictation.sends}`).toMatch(
      /Chrome/
    );
  });

  // Lecture capture listens to the room, not to the student alone: the lecturer and classmates are
  // heard and sent too, so it cannot borrow dictation's "the sound of your voice".
  it('says that lecture capture sends the sound of the room, other people included, to Google', () => {
    const lecture = DESTINATIONS.lectureCapture;
    expect(lecture.service).toBe(DESTINATIONS.dictation.service);
    expect(lecture.sends).toMatch(/room/);
    expect(lecture.sends).toMatch(/other people/);
    expect(lecture.sends).toMatch(/lecture capture is on/);
    expect(lecture.sends).not.toMatch(/your voice while dictation/);
  });

  it('says that Translate Page sends the whole page, names on it included', () => {
    const page = DESTINATIONS.pageTranslation;
    expect(page.service).toBe(DESTINATIONS.translation.service);
    expect(page.sends).toMatch(/whole page/);
    expect(page.sends).toMatch(/names/);
    expect(DESTINATIONS.translation.sends).not.toMatch(/whole page/);
  });

  it('points to a place the popup really has', () => {
    const words = describeCloudConsent('anthropic');
    expect(words).toMatch(/Advanced options \(the gear button\), then Your data/);
    expect(words).not.toMatch(/Settings/);
  });
});

describe('reading an answer', () => {
  it('treats a destination nobody has answered as not asked, and not as consent', async () => {
    await expect(getConsent('dictionary')).resolves.toBe('unasked');
    await expect(hasConsent('dictionary')).resolves.toBe(false);
  });

  it('treats storage that cannot be read as not asked', async () => {
    chrome.storage.local.get = jest.fn().mockRejectedValue(new Error('storage is gone'));
    await expect(getConsent('dictionary')).resolves.toBe('unasked');
    await expect(hasConsent('dictionary')).resolves.toBe(false);
  });

  it.each([
    ['a string', 'yes'],
    ['a truthy string in the flag', { granted: 'true' }],
    ['a number', { granted: 1 }],
    ['an array', [true]],
    ['null', null],
  ])('treats a malformed answer (%s) as not asked', async (_label, value) => {
    stored[consentStorageKey('dictionary')] = value;
    await expect(getConsent('dictionary')).resolves.toBe('unasked');
    await expect(hasConsent('dictionary')).resolves.toBe(false);
  });

  it('is never consent for a destination this build does not know', async () => {
    stored.assist_consent_somewhereElse = { granted: true, at: 'x' };
    await expect(hasConsent('somewhereElse')).resolves.toBe(false);
  });

  it('ignores the single-object shape an unreleased build wrote', async () => {
    stored.assist_consent = { dictionary: { granted: true, at: 'x' } };
    await expect(hasConsent('dictionary')).resolves.toBe(false);
  });
});

describe('recording an answer', () => {
  it('records a yes with the time it was given', async () => {
    const now = new Date('2026-09-25T10:00:00Z');
    await recordConsent('translation', true, now);
    expect(stored[consentStorageKey('translation')]).toEqual({
      granted: true,
      at: '2026-09-25T10:00:00.000Z',
    });
    await expect(getConsent('translation')).resolves.toBe('granted');
  });

  it('records a no, which is remembered as a no rather than as never asked', async () => {
    await recordConsent('dictionary', false);
    await expect(getConsent('dictionary')).resolves.toBe('declined');
  });

  it('keeps the answers for other destinations', async () => {
    await recordConsent('dictionary', true);
    await recordConsent('citations', false);
    await expect(getConsent('dictionary')).resolves.toBe('granted');
    await expect(getConsent('citations')).resolves.toBe('declined');
  });

  it('does not lose an answer when two are recorded at once', async () => {
    await Promise.all([recordConsent('dictionary', true), recordConsent('translation', true)]);
    await expect(getConsent('dictionary')).resolves.toBe('granted');
    await expect(getConsent('translation')).resolves.toBe('granted');
  });

  it('stores each destination under its own key, so two realms cannot overwrite each other', async () => {
    // The popup reads before it writes; between its read and its write, the content script records
    // an answer for another service. Writing one whole object would put the stale copy back.
    let interleaved = false;
    const realSet = chrome.storage.local.set;
    chrome.storage.local.set = jest.fn(async values => {
      if (!interleaved) {
        interleaved = true;
        stored[consentStorageKey('translation')] = { granted: true, at: '2026-09-25T10:00:00.000Z' };
      }
      return realSet(values);
    });

    await recordConsent('dictionary', true);

    await expect(getConsent('translation')).resolves.toBe('granted');
    await expect(getConsent('dictionary')).resolves.toBe('granted');
    for (const key of Object.keys(stored)) {
      expect(CONSENT_STORAGE_KEYS).toContain(key);
    }
  });

  it('writes in the same tick it is called, so a popup closing straight after loses nothing', () => {
    recordConsent('dictionary', true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [consentStorageKey('dictionary')]: { granted: true, at: expect.any(String) },
    });
  });

  it('refuses to record an answer for a destination this build does not know', async () => {
    await expect(recordConsent('anywhere', true)).rejects.toThrow(/unknown destination/i);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('only a real boolean true is recorded as a yes', async () => {
    await recordConsent('dictionary', 'yes');
    await expect(getConsent('dictionary')).resolves.toBe('declined');
  });
});

describe('withdrawing', () => {
  it('takes effect on the very next read, with nothing cached in between', async () => {
    await recordConsent('dictionary', true);
    await expect(hasConsent('dictionary')).resolves.toBe(true);
    await withdrawConsent('dictionary');
    await expect(hasConsent('dictionary')).resolves.toBe(false);
    await expect(getConsent('dictionary')).resolves.toBe('declined');
  });

  it('sees a change written by another part of the extension straight away', async () => {
    await recordConsent('dictionary', true);
    await expect(hasConsent('dictionary')).resolves.toBe(true);
    // The popup withdrew it; this realm never called anything.
    stored[consentStorageKey('dictionary')] = { granted: false, at: 'now' };
    await expect(hasConsent('dictionary')).resolves.toBe(false);
  });
});

describe('listing', () => {
  it('lists every destination with its state, answered or not', async () => {
    await recordConsent('citations', true, new Date('2026-09-25T10:00:00Z'));
    const list = await listConsents();
    const byName = Object.fromEntries(list.map(entry => [entry.destination, entry]));
    expect(Object.keys(byName).sort()).toEqual(Object.keys(DESTINATIONS).sort());
    expect(byName.citations).toMatchObject({
      state: 'granted',
      at: '2026-09-25T10:00:00.000Z',
      service: DESTINATIONS.citations.service,
    });
    expect(byName.dictionary).toMatchObject({ state: 'unasked', at: null });
  });
});
