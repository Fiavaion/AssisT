/**
 * Consent to be watched must not arrive in somebody else's settings file.
 *
 * Two features record how much a student struggles: the learning profile counts how they work, and
 * struggle detection watches for scrolling back and re-reading. Both are off until the student turns
 * them on. Settings files get passed around — a support worker sets a student up, a class shares a
 * starting point — so if those keys were exportable, one student's yes would become another's
 * without asking. The keys are deliberately absent from the export list, and this is the guard that
 * keeps them absent.
 */

import {
  EXPORTED_KEYS,
  buildExportPayload,
  planImport,
  FILE_KIND,
  SCHEMA_VERSION,
} from '../../../src/utils/settings-portability.js';

const CONSENT_KEYS = ['struggleDetectionSettings', 'cognitiveProfileSettings'];

describe('what an exported settings file may carry', () => {
  it.each(CONSENT_KEYS)('leaves %s out, so consent is never imported', key => {
    expect(EXPORTED_KEYS).not.toContain(key);
  });

  it('still carries the ordinary preferences, so the list has not simply been emptied', () => {
    expect(EXPORTED_KEYS.length).toBeGreaterThan(10);
    expect(EXPORTED_KEYS).toContain('assist_settings');
  });

  // "Profile" in this codebase means a saved set of preferences a student chose — a preset — and
  // those are exactly what an export is for. The words to watch are the ones that mean AssisT
  // watched the student: struggle, and the cognitive record.
  it('names nothing that means AssisT was watching, rather than something the student chose', () => {
    const looksLikeARecord = EXPORTED_KEYS.filter(key => /struggle|cognitive/i.test(key));
    expect(looksLikeARecord).toEqual([]);
  });
});

/**
 * Debug mode is the switch that lets `debugLog()` print the student's own words, so it is consent of
 * the same kind: it cannot arrive in a file. `assist_settings` as a whole IS exportable — it holds
 * every ordinary preference — which is precisely why this one field inside it has to be removed on
 * the way out and on the way in.
 */
describe('debug mode cannot arrive in a settings file', () => {
  const fileWith = debugMode => ({
    kind: FILE_KIND,
    schemaVersion: SCHEMA_VERSION,
    settings: {
      assist_settings: {
        appearance: { theme: 'dark', debug_mode: debugMode },
        tts: { rate: 1.2 },
      },
    },
  });

  it('drops debug_mode from an imported file and keeps the rest of appearance', () => {
    const plan = planImport(fileWith(true), {});
    expect(plan.values.assist_settings.appearance.debug_mode).toBeUndefined();
    expect(plan.values.assist_settings.appearance.theme).toBe('dark');
    expect(plan.values.assist_settings.tts.rate).toBe(1.2);
  });

  it("leaves the student's own debug_mode exactly as they set it", () => {
    const current = { assist_settings: { appearance: { debug_mode: true } } };
    const plan = planImport(fileWith(false), current);
    expect(plan.values.assist_settings.appearance.debug_mode).toBe(true);
    expect(current.assist_settings.appearance.debug_mode).toBe(true);
  });

  it('never writes debug_mode into an exported file', () => {
    const payload = buildExportPayload({
      assist_settings: { appearance: { theme: 'dark', debug_mode: true } },
    });
    expect(payload.settings.assist_settings.appearance).toEqual({ theme: 'dark' });
  });
});

/**
 * A student's yes or no to sending text to an outside service (ADR 0006) is the plainest consent of
 * all. Each answer lives under its own storage key on the device where it was given; a settings
 * file must never carry one out, and an imported file must never write one in.
 */
describe('consent to outside services stays on the device it was given on', () => {
  const { CONSENT_STORAGE_KEYS, DESTINATIONS } = require('../../../src/utils/consent.js');

  it('has one key per destination, and none of them is an exported key', () => {
    expect(CONSENT_STORAGE_KEYS).toHaveLength(Object.keys(DESTINATIONS).length);
    for (const key of CONSENT_STORAGE_KEYS) {
      expect(EXPORTED_KEYS).not.toContain(key);
    }
  });

  it('is left out of an export even when storage holds every answer', () => {
    const everything = Object.fromEntries(
      CONSENT_STORAGE_KEYS.map(key => [key, { granted: true, at: '2026-09-25T10:00:00.000Z' }])
    );
    const payload = buildExportPayload({
      assist_settings: { appearance: { theme: 'dark' } },
      ...everything,
    });
    for (const key of CONSENT_STORAGE_KEYS) {
      expect(payload.settings[key]).toBeUndefined();
    }
    expect(JSON.stringify(payload)).not.toMatch(/granted/);
  });

  it('is ignored when a file carries it in', () => {
    const carried = Object.fromEntries(
      CONSENT_STORAGE_KEYS.map(key => [key, { granted: true, at: 'x' }])
    );
    const plan = planImport(
      {
        kind: FILE_KIND,
        schemaVersion: SCHEMA_VERSION,
        settings: { assist_settings: { tts: { rate: 1 } }, ...carried },
      },
      {}
    );
    for (const key of CONSENT_STORAGE_KEYS) {
      expect(plan.values[key]).toBeUndefined();
      expect(plan.ignored).toContain(key);
    }
  });
});
