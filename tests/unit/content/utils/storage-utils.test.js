/**
 * @jest-environment jsdom
 *
 * About ten self-initialising features call `initFeatureSettings` at module top level, so a
 * storage read that fails, or an `onInit` that throws on one of them, used to switch that feature
 * off for the whole page as an unhandled rejection: no console line, no message, and the student
 * simply never got the tool. These are the developer signals that failure now leaves behind.
 */

import {
  initFeatureSettings,
  onFeatureSettingsChange,
} from '../../../../src/content/utils/storage-utils.js';

let stored;
let changeListeners;

beforeEach(() => {
  stored = {};
  changeListeners = [];
  global.chrome = {
    storage: {
      local: {
        get: jest.fn((key, callback) => callback({ assist_settings: stored })),
        set: jest.fn((items, callback) => callback && callback()),
      },
      onChanged: {
        addListener: jest.fn(fn => changeListeners.push(fn)),
        removeListener: jest.fn(fn => {
          changeListeners = changeListeners.filter(other => other !== fn);
        }),
      },
    },
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

/** Let every pending promise in initFeatureSettings settle. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Fire a settings change at every registered listener. */
function emitChange(next) {
  for (const listener of [...changeListeners]) {
    listener({ assist_settings: { newValue: next } });
  }
}

describe('initFeatureSettings', () => {
  it('reports a failed storage read against the feature, once', async () => {
    chrome.storage.local.get = jest.fn(() => {
      throw new Error('storage gone');
    });

    initFeatureSettings('readingGuide', { enabled: true }, jest.fn(), jest.fn());
    await flush();

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/readingGuide/);
  });

  it('reports an onInit that throws, and still switches the next feature on', async () => {
    const second = jest.fn();
    initFeatureSettings(
      'readingGuide',
      { enabled: true },
      () => {
        throw new Error('onInit blew up');
      },
      jest.fn()
    );
    initFeatureSettings('focusMode', { enabled: true }, second, jest.fn());
    await flush();

    expect(second).toHaveBeenCalledWith({ enabled: true });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/readingGuide/);
  });
});

describe('onFeatureSettingsChange', () => {
  it('reports a callback that throws and leaves the other features listening', () => {
    const second = jest.fn();
    onFeatureSettingsChange('readingGuide', () => {
      throw new Error('onChange blew up');
    });
    onFeatureSettingsChange('focusMode', second);

    expect(() => emitChange({ readingGuide: { enabled: false }, focusMode: { enabled: true } })).not.toThrow();

    expect(second).toHaveBeenCalledWith({ enabled: true });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/readingGuide/);
  });
});
