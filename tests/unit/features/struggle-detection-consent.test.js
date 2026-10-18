/**
 * @jest-environment jsdom
 *
 * Struggle detection watches scrolling, dwell time and how often a student reaches for simpler
 * text. That is a record of someone's difficulty reading, so it may only run on request.
 *
 * Before 1.0.0 it defaulted to on, started itself from the content script, and had no control in
 * the popup at all. These tests hold it to: off by default, no signals gathered while off, and
 * switching it off in an open tab both stops it and discards what it had gathered.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const fs = require('fs');
const path = require('path');

const FEATURE = '../../../src/features/struggleDetection/struggleDetection.js';
const SETTINGS_KEY = 'struggleDetectionSettings';

let changeListeners = [];

function fireSettingsChange(newValue, area = 'local') {
  for (const listener of changeListeners) {
    listener({ [SETTINGS_KEY]: { newValue } }, area);
  }
}

async function loadFeature() {
  const mod = await import(FEATURE);
  await mod.struggle_initialize();
  return mod;
}

beforeEach(() => {
  jest.resetModules();
  changeListeners = [];
  delete window.assistFeatures;
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  chrome.storage.onChanged = {
    addListener: jest.fn(listener => changeListeners.push(listener)),
    removeListener: jest.fn(),
  };
  chrome.storage.local.get.mockResolvedValue({});
});

afterEach(() => {
  delete chrome.storage.onChanged;
  delete global.IntersectionObserver;
});

describe('off unless the student opts in', () => {
  test('the feature ships off', async () => {
    const mod = await loadFeature();
    expect(mod.struggle_settings.enabled).toBe(false);
  });

  test('no signal is gathered while off', async () => {
    const mod = await loadFeature();

    mod.struggle_trackToolUsage('dictionary');
    mod.struggle_trackToolUsage('simplify');

    const metrics = mod.struggle_getMetrics();
    expect(metrics.dictionaryLookups).toBe(0);
    expect(metrics.simplificationRequests).toBe(0);
    expect(metrics.score).toBe(0);
  });

  test('nothing about the student is written to storage', async () => {
    const mod = await loadFeature();
    mod.struggle_trackToolUsage('dictionary');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('the popup registry declares it off by default', async () => {
    const { toolById } = await import('../../../src/popup/registry/tool-registry.js');
    const tool = toolById('struggle-detection');
    expect(tool).toBeDefined();
    expect(tool.state).toEqual(
      expect.objectContaining({ store: 'local', default: false, path: `${SETTINGS_KEY}.enabled` })
    );
  });
});

describe('opting in, then out', () => {
  test('an opted-in student is watched, and switching off stops it and clears what was gathered', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();

    mod.struggle_trackToolUsage('dictionary');
    expect(mod.struggle_getMetrics().dictionaryLookups).toBe(1);

    fireSettingsChange({ enabled: false });

    const after = mod.struggle_getMetrics();
    expect(after.dictionaryLookups).toBe(0);
    expect(after.difficultConcepts).toEqual([]);
    expect(after.score).toBe(0);

    mod.struggle_trackToolUsage('dictionary');
    expect(mod.struggle_getMetrics().dictionaryLookups).toBe(0);
  });

  test('switching it back on watches again', async () => {
    const mod = await loadFeature();
    fireSettingsChange({ enabled: true });

    mod.struggle_trackToolUsage('dictionary');

    expect(mod.struggle_getMetrics().dictionaryLookups).toBe(1);
  });

  test('a change in another storage area is not an opt-in', async () => {
    const mod = await loadFeature();
    fireSettingsChange({ enabled: true }, 'sync');

    mod.struggle_trackToolUsage('dictionary');

    expect(mod.struggle_getMetrics().dictionaryLookups).toBe(0);
  });
});

describe('one switch', () => {
  test('offering help depends only on its own switch, not a second companion toggle', () => {
    // A companion "Stuck-reader rescue" switch once had to be on as well, and nothing linked the
    // two, so a student who switched this on could still never be offered help.
    const source = fs.readFileSync(path.join(__dirname, FEATURE), 'utf8');
    expect(source).not.toMatch(/stuckReader|companion-settings/);
  });
});
