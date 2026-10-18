/**
 * @jest-environment jsdom
 *
 * The microphone button's hint must name the key the student actually has.
 *
 * Remapping or clearing the dictation shortcut in Settings used to leave the button still
 * promising the shipped default, because the wording was built from DEFAULT_SHORTCUTS at import
 * time. These tests hold the button to the saved binding: it reads storage once, follows a remap
 * live through chrome.storage.onChanged, says no key at all when the binding is cleared, falls
 * back to the default when storage cannot be read, and leaves no listener behind when destroyed.
 *
 * Module state (the binding, the shared listener) lives at module scope, so each test loads the
 * module afresh with jest.isolateModules after installing its own chrome stub.
 */

/**
 * Install a chrome stub whose storage answers with the given saved shortcuts.
 * @param {Object} [opts]
 * @param {Object|null} [opts.shortcuts] - saved keyboardShortcuts map, or null for none saved
 * @param {boolean} [opts.failGet] - make the storage read throw, as an unreadable realm does
 * @returns {{listeners: Set<Function>, get: jest.Mock}}
 */
function installChrome({ shortcuts = null, failGet = false } = {}) {
  const listeners = new Set();
  const get = jest.fn((key, callback) => {
    if (failGet) {
      throw new Error('storage unavailable');
    }
    callback({ assist_settings: shortcuts ? { keyboardShortcuts: shortcuts } : {} });
  });
  global.chrome = {
    storage: {
      local: { get },
      onChanged: {
        addListener: fn => listeners.add(fn),
        removeListener: fn => listeners.delete(fn),
      },
    },
  };
  return { listeners, get };
}

/** Load a fresh copy of the module, so its module-level binding starts from the default. */
function loadMicrophoneButton() {
  let MicrophoneButton;
  jest.isolateModules(() => {
    ({ MicrophoneButton } = require('../../../src/ui/components/microphone-button.js'));
  });
  return MicrophoneButton;
}

/** Let the not-awaited storage read settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Announce a settings write the way chrome.storage does. */
function broadcast(listeners, keyboardShortcuts) {
  listeners.forEach(fn =>
    fn({ assist_settings: { oldValue: {}, newValue: { keyboardShortcuts } } }, 'local')
  );
}

describe('microphone button shortcut hint', () => {
  let mic;

  afterEach(() => {
    if (mic && mic.button) {
      mic.destroy();
    }
    mic = null;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('names the saved binding rather than the shipped default', async () => {
    installChrome({ shortcuts: { stt_dictate: 'Alt+Shift+K' } });
    mic = new (loadMicrophoneButton())();
    await settle();

    expect(mic.button.getAttribute('title')).toBe('Start voice typing (Alt+Shift+K)');
  });

  it('follows a remap without a page reload', async () => {
    const { listeners } = installChrome({ shortcuts: { stt_dictate: 'Alt+Shift+K' } });
    mic = new (loadMicrophoneButton())();
    await settle();

    broadcast(listeners, { stt_dictate: 'Ctrl+Alt+9' });

    expect(mic.button.getAttribute('title')).toBe('Start voice typing (Ctrl+Alt+9)');
    mic.showTooltip();
    expect(mic.tooltip.textContent).toBe('Click to start voice typing (Ctrl+Alt+9)');
  });

  it('names no key at all once the binding is cleared', async () => {
    const { listeners } = installChrome({ shortcuts: { stt_dictate: 'Alt+Shift+K' } });
    mic = new (loadMicrophoneButton())();
    await settle();

    broadcast(listeners, { stt_dictate: '' });

    expect(mic.button.getAttribute('title')).toBe('Start voice typing');
    mic.showTooltip();
    expect(mic.tooltip.textContent).toBe('Click to start voice typing');
    expect(mic.button.getAttribute('title')).not.toMatch(/undefined|\(\)/);
  });

  it('honours a binding cleared before this page loaded', async () => {
    installChrome({ shortcuts: { stt_dictate: '' } });
    mic = new (loadMicrophoneButton())();
    await settle();

    expect(mic.button.getAttribute('title')).toBe('Start voice typing');
  });

  it('falls back to the default, and says the default, when storage cannot be read', async () => {
    installChrome({ failGet: true });
    mic = new (loadMicrophoneButton())();
    await settle();

    expect(mic.button.getAttribute('title')).toBe('Start voice typing (Alt+Shift+V)');
  });

  it('reads storage once per realm, however many buttons are made', async () => {
    const { get } = installChrome({ shortcuts: { stt_dictate: 'Alt+Shift+K' } });
    const MicrophoneButton = loadMicrophoneButton();
    mic = new MicrophoneButton();
    const second = new MicrophoneButton();
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
    expect(second.button.getAttribute('title')).toBe('Start voice typing (Alt+Shift+K)');
    second.destroy();
  });

  it('leaves no storage listener behind once the last button is destroyed', async () => {
    const { listeners } = installChrome({ shortcuts: { stt_dictate: 'Alt+Shift+K' } });
    const MicrophoneButton = loadMicrophoneButton();
    mic = new MicrophoneButton();
    const second = new MicrophoneButton();
    await settle();
    expect(listeners.size).toBe(1);

    second.destroy();
    expect(listeners.size).toBe(1);

    mic.destroy();
    expect(listeners.size).toBe(0);
  });

  it('keeps the default in a realm with no chrome.storage at all', async () => {
    delete global.chrome;
    mic = new (loadMicrophoneButton())();
    await settle();

    expect(mic.button.getAttribute('title')).toBe('Start voice typing (Alt+Shift+V)');
  });
});
