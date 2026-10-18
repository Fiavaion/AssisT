/**
 * Tests for the shared settings writer.
 *
 * Two callers depend on this merge being exactly right — the discovery quiz switching supports on
 * and the onboarding clean setup switching them off — so the cases that matter are the ones where
 * a careless merge would quietly drop a student's other settings.
 */

import {
  applyNestedPath,
  localRoots,
  planWrites,
  applySettingWrites,
  changedSettingWrites,
} from '../../../src/utils/setting-writes.js';

describe('applyNestedPath()', () => {
  it('sets a top-level key', () => {
    const target = {};
    applyNestedPath(target, 'enabled', true);
    expect(target).toEqual({ enabled: true });
  });

  it('creates the branches it needs', () => {
    const target = {};
    applyNestedPath(target, 'tts.highlight.enabled', false);
    expect(target).toEqual({ tts: { highlight: { enabled: false } } });
  });

  it('keeps the siblings of the key it sets', () => {
    const target = { tts: { enabled: true, rate: 1.4 } };
    applyNestedPath(target, 'tts.enabled', false);
    expect(target).toEqual({ tts: { enabled: false, rate: 1.4 } });
  });

  it('replaces a non-object standing where a branch should be', () => {
    const target = { tts: 'on' };
    applyNestedPath(target, 'tts.enabled', false);
    expect(target).toEqual({ tts: { enabled: false } });
  });
});

describe('localRoots()', () => {
  it('lists the top-level local keys, deduped', () => {
    expect(
      localRoots([
        { store: 'local', path: 'aiMode', value: 'off' },
        { store: 'local', path: 'companionFeatures.focus', value: false },
        { store: 'local', path: 'companionFeatures.quiz', value: false },
        { store: 'settings', path: 'tts.enabled', value: false },
      ])
    ).toEqual(['aiMode', 'companionFeatures']);
  });

  it('is empty for settings-only writes, and for nothing at all', () => {
    expect(localRoots([{ store: 'settings', path: 'tts.enabled', value: false }])).toEqual([]);
    expect(localRoots(undefined)).toEqual([]);
  });
});

describe('planWrites()', () => {
  it('merges settings paths into the stored object', () => {
    const payload = planWrites([{ store: 'settings', path: 'tts.enabled', value: false }], {
      assist_settings: { tts: { enabled: true, rate: 1.4 }, ocr: { enabled: true } },
    });
    expect(payload.assist_settings).toEqual({
      tts: { enabled: false, rate: 1.4 },
      ocr: { enabled: true },
    });
  });

  it('puts a bare local path at the top level of the payload', () => {
    const payload = planWrites([{ store: 'local', path: 'aiMode', value: 'off' }], {});
    expect(payload.aiMode).toBe('off');
    expect(payload.assist_settings).toEqual({});
  });

  it('merges a nested local path into its stored root', () => {
    const payload = planWrites([{ store: 'local', path: 'companionFeatures.focus', value: false }], {
      companionFeatures: { focus: true, quiz: true },
    });
    expect(payload.companionFeatures).toEqual({ focus: false, quiz: true });
  });

  it('carries the extra keys through', () => {
    const payload = planWrites([], {}, { discoveryProfile: { id: 'p1' } });
    expect(payload.discoveryProfile).toEqual({ id: 'p1' });
  });

  it('defaults an absent settings object rather than throwing', () => {
    expect(planWrites([{ store: 'settings', path: 'tts.enabled', value: false }]).assist_settings)
      .toEqual({ tts: { enabled: false } });
  });
});

describe('applySettingWrites()', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  it('reads assist_settings and every local root it is about to touch', async () => {
    await applySettingWrites([
      { store: 'settings', path: 'tts.enabled', value: false },
      { store: 'local', path: 'aiMode', value: 'off' },
    ]);
    expect(chrome.storage.local.get).toHaveBeenCalledWith(['assist_settings', 'aiMode']);
  });

  it('stores everything in one write', async () => {
    await applySettingWrites([
      { store: 'settings', path: 'tts.enabled', value: false },
      { store: 'local', path: 'aiMode', value: 'off' },
    ]);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.assist_settings.tts.enabled).toBe(false);
    expect(payload.aiMode).toBe('off');
  });

  it('does nothing outside an extension context', async () => {
    const saved = global.chrome;
    global.chrome = undefined;
    await expect(
      applySettingWrites([{ store: 'settings', path: 'tts.enabled', value: false }])
    ).resolves.toBeUndefined();
    global.chrome = saved;
  });
});

describe('changedSettingWrites()', () => {
  it('finds nothing when the two copies match', () => {
    const settings = { tts: { rate: 1, voice: 'Ada' }, ui_visibility: { show_ocr: true } };
    expect(changedSettingWrites(settings, structuredClone(settings))).toEqual([]);
  });

  it('reports the deepest path that changed, not its parent', () => {
    expect(
      changedSettingWrites({ tts: { rate: 1, voice: 'Ada' } }, { tts: { rate: 2, voice: 'Ada' } })
    ).toEqual([{ path: 'tts.rate', value: 2 }]);
  });

  it('reports a value set back to a falsy default', () => {
    expect(changedSettingWrites({ tts: { enabled: true } }, { tts: { enabled: false } })).toEqual([
      { path: 'tts.enabled', value: false },
    ]);
    expect(
      changedSettingWrites({ readingGuide: { lineOpacity: 0.7 } }, { readingGuide: { lineOpacity: 0 } })
    ).toEqual([{ path: 'readingGuide.lineOpacity', value: 0 }]);
    expect(changedSettingWrites({ stt: { language: 'en-IE' } }, { stt: { language: '' } })).toEqual([
      { path: 'stt.language', value: '' },
    ]);
  });

  it('reports a whole branch the pristine copy never had', () => {
    expect(changedSettingWrites({}, { stt: { vocabulary: { autoLearn: true } } })).toEqual([
      { path: 'stt', value: { vocabulary: { autoLearn: true } } },
    ]);
  });

  it('reports a branch that replaced a plain value', () => {
    expect(changedSettingWrites({ tts: 'on' }, { tts: { enabled: true } })).toEqual([
      { path: 'tts', value: { enabled: true } },
    ]);
  });

  it('treats an array as a value and writes it whole', () => {
    expect(changedSettingWrites({ list: ['a', 'b'] }, { list: ['a'] })).toEqual([
      { path: 'list', value: ['a'] },
    ]);
    expect(changedSettingWrites({ list: ['a'] }, { list: [] })).toEqual([
      { path: 'list', value: [] },
    ]);
    expect(changedSettingWrites({ list: ['a'] }, { list: ['a'] })).toEqual([]);
  });

  it('reports a removed key as a write of undefined', () => {
    expect(changedSettingWrites({ tts: { rate: 1, voice: 'Ada' } }, { tts: { rate: 1 } })).toEqual([
      { path: 'tts.voice', value: undefined },
    ]);
  });

  it('treats a non-object pristine copy as empty', () => {
    expect(changedSettingWrites(null, { tts: { rate: 1 } })).toEqual([
      { path: 'tts', value: { rate: 1 } },
    ]);
  });

  it('finds nothing when the current copy is not an object', () => {
    expect(changedSettingWrites({ tts: { rate: 1 } }, null)).toEqual([]);
  });
});

describe('applyNestedPath() removing a key', () => {
  it('deletes the key when the value is undefined', () => {
    const target = { tts: { rate: 1, voice: 'Ada' } };
    applyNestedPath(target, 'tts.voice', undefined);
    expect('voice' in target.tts).toBe(false);
    expect(target.tts.rate).toBe(1);
  });

  it('leaves a branch alone when the key was never there', () => {
    const target = { tts: { rate: 1 } };
    applyNestedPath(target, 'stt.language', undefined);
    expect(target).toEqual({ tts: { rate: 1 }, stt: {} });
  });
});
