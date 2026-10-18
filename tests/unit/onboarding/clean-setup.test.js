/**
 * Tests for the clean-setup onboarding track.
 *
 * "All features off" has to mean every tool the extension actually has, which is why this module
 * reads the popup's tool registry rather than keeping a list. These tests hold it to that: the
 * plan is derived from whatever the registry declares, it honours the two stores and the mirrored
 * keys, and applying it leaves everything it was not asked to touch alone.
 */

import {
  offValueFor,
  cleanWrites,
  applyCleanSetup,
} from '../../../src/pages/onboarding/clean-setup.js';
import { TOOLS, toolById } from '../../../src/popup/registry/tool-registry.js';
import { COMPANION_FEATURES } from '../../../src/features/companion/companion-settings.js';

/** The write for one store/path, or undefined. */
function writeFor(writes, store, path) {
  return writes.find(write => write.store === store && write.path === path);
}

describe('offValueFor()', () => {
  it('is false for an ordinary boolean switch', () => {
    expect(offValueFor(toolById('tts'))).toBe(false);
  });

  it('is the declared offValue for a tool whose state is a mode string', () => {
    expect(offValueFor(toolById('ai'))).toBe('off');
  });
});

describe('cleanWrites()', () => {
  const writes = cleanWrites();

  it('covers every tool in the registry that has a switch', () => {
    const switchable = TOOLS.filter(tool => tool.actionOnly !== true && tool.state);
    expect(switchable.length).toBeGreaterThan(20);
    switchable.forEach(tool => {
      const store = tool.state.store || 'settings';
      expect(writeFor(writes, store, tool.state.path)).toBeDefined();
    });
  });

  it('skips action-only tools, which have nothing to switch off', () => {
    const actionOnly = TOOLS.filter(tool => tool.actionOnly === true);
    expect(actionOnly.length).toBeGreaterThan(0);
    // Translate Page is a button, not a switch — inventing a flag for it would write a key
    // nothing reads.
    expect(actionOnly.some(tool => tool.id === 'translation')).toBe(true);
  });

  it('writes false to a boolean tool that ships on', () => {
    // Citations defaults to on, so a clean setup has to say so explicitly.
    expect(writeFor(writes, 'settings', 'citation.enabled')).toEqual({
      store: 'settings',
      path: 'citation.enabled',
      value: false,
    });
  });

  it("writes AI Assist's off mode to its top-level local key, not to assist_settings", () => {
    expect(writeFor(writes, 'local', 'aiMode')).toEqual({
      store: 'local',
      path: 'aiMode',
      value: 'off',
    });
    expect(writeFor(writes, 'settings', 'aiMode')).toBeUndefined();
  });

  it("includes a tool's mirrored keys, in the stores they live in", () => {
    // Show Text Stats is one switch over four keys: two in assist_settings and two top-level
    // local keys the content script watches.
    expect(writeFor(writes, 'settings', 'ui_overlay.show_text_stats_badge').value).toBe(false);
    expect(writeFor(writes, 'settings', 'ui_overlay.show_text_stats_notifications').value).toBe(
      false
    );
    expect(writeFor(writes, 'local', 'textStatsBadgeVisible').value).toBe(false);
    expect(writeFor(writes, 'local', 'textStatsNotificationsEnabled').value).toBe(false);
  });

  it('names each store/path once', () => {
    const seen = writes.map(write => `${write.store}:${write.path}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('switches every companion feature off, the lecture companion and its microphone included', () => {
    // Each companion feature has its own switch in the popup, so "everything off" includes them.
    COMPANION_FEATURES.forEach(feature => {
      expect(writeFor(writes, 'local', `companionFeatures.${feature.key}`)).toEqual({
        store: 'local',
        path: `companionFeatures.${feature.key}`,
        value: false,
      });
    });
  });

  it('works from a supplied tool list, so it is testable in isolation', () => {
    const only = cleanWrites([
      {
        id: 'made-up',
        actionOnly: false,
        state: { store: 'settings', path: 'madeUp.enabled', default: true },
      },
    ]);
    expect(only).toEqual([{ store: 'settings', path: 'madeUp.enabled', value: false }]);
  });
});

describe('applyCleanSetup()', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  it('writes once, so a half-applied clean setup is not possible', async () => {
    await applyCleanSetup();
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('switches off every registry tool inside assist_settings', async () => {
    await applyCleanSetup();
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.assist_settings.tts.enabled).toBe(false);
    expect(payload.assist_settings.citation.enabled).toBe(false);
    expect(payload.assist_settings.ocr.enabled).toBe(false);
  });

  it('sets the top-level local keys as well', async () => {
    await applyCleanSetup();
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.aiMode).toBe('off');
    expect(payload.textStatsBadgeVisible).toBe(false);
    expect(payload.textStatsNotificationsEnabled).toBe(false);
  });

  it('switches every companion feature off', async () => {
    chrome.storage.local.get.mockResolvedValue({
      companionFeatures: { flashcards: false, lecture: true },
    });
    await applyCleanSetup();
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.companionFeatures).toEqual(
      Object.fromEntries(COMPANION_FEATURES.map(feature => [feature.key, false]))
    );
  });

  it('merges into the stored settings rather than replacing them', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: {
        tts: { enabled: true, rate: 1.4, voice: 'Daniel' },
        ui_visibility: { show_citations: true },
      },
    });
    await applyCleanSetup();
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.assist_settings.tts.enabled).toBe(false);
    expect(payload.assist_settings.tts.rate).toBe(1.4);
    expect(payload.assist_settings.tts.voice).toBe('Daniel');
  });

  it('leaves ui_visibility alone — a hidden switch cannot be switched back on', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { ui_visibility: { show_citations: true, show_ocr: false } },
    });
    await applyCleanSetup();
    const [payload] = chrome.storage.local.set.mock.calls[0];
    expect(payload.assist_settings.ui_visibility).toEqual({
      show_citations: true,
      show_ocr: false,
    });
  });

  it('reports how many tools it switched off', async () => {
    const result = await applyCleanSetup();
    expect(result.toolsOff).toBe(TOOLS.filter(t => t.actionOnly !== true && t.state).length);
  });

  it('does nothing at all outside an extension context', async () => {
    const saved = global.chrome;
    global.chrome = undefined;
    await expect(applyCleanSetup()).resolves.toEqual({ toolsOff: 0 });
    global.chrome = saved;
  });
});
