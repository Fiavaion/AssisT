/**
 * @jest-environment jsdom
 *
 * The action tray's shortcut must be the student's, not the shipped default.
 *
 * The binding used to be read once per realm and never again, so after a remap in Settings both
 * the hint line AND the key onTrayKeydown matched stayed stale until the page was reloaded. These
 * tests hold the tray to the saved binding: the hint names it, the same key moves focus, a remap is
 * followed live, a cleared binding leaves no hint and no promise, an unreadable storage read falls
 * back to the default, and no listener outlives the tray.
 *
 * Module state (the binding, the listener, the tray on screen) is module-scoped, so each test
 * loads the module afresh with jest.isolateModules after installing its own chrome stub.
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

/** Load a fresh copy of the tray module, so its binding starts from the registry default. */
function loadTray() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../../../src/utils/action-tray.js');
  });
  return mod;
}

/** Let the not-awaited storage read settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Announce a settings write the way chrome.storage does. */
function broadcast(listeners, keyboardShortcuts) {
  listeners.forEach(fn =>
    fn({ assist_settings: { oldValue: {}, newValue: { keyboardShortcuts } } }, 'local')
  );
}

/** Press a chord on the document, the way a student does from wherever they are. */
function press(shortcut) {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: key.length === 1 ? key.toLowerCase() : key,
      code: /^[A-Za-z]$/.test(key) ? `Key${key.toUpperCase()}` : undefined,
      ctrlKey: parts.includes('Ctrl'),
      altKey: parts.includes('Alt'),
      shiftKey: parts.includes('Shift'),
      bubbles: true,
      cancelable: true,
    })
  );
}

const trayEl = () => document.querySelector('.assist-action-tray');
const hintText = () => {
  const hint = document.querySelector('.assist-action-tray-hint');
  return hint ? hint.textContent : null;
};
const undoButton = () =>
  Array.from(document.querySelectorAll('.assist-action-tray-btn')).find(
    b => b.dataset.trayAction === 'undo'
  );

beforeEach(() => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  jest.useRealTimers();
});

describe('action tray shortcut', () => {
  it('names the saved binding in the hint, not the shipped default', async () => {
    installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'T', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();

    expect(hintText()).toBe('Press Alt+Shift+J to reach Undo');
    hideTray();
  });

  it('follows a remap live: the hint and the key that moves focus both change', async () => {
    const { listeners } = installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'T', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();

    broadcast(listeners, { action_tray_focus: 'Alt+Shift+B' });

    expect(hintText()).toBe('Press Alt+Shift+B to reach Undo');

    press('Alt+Shift+J');
    expect(document.activeElement).not.toBe(undoButton());

    press('Alt+Shift+B');
    expect(document.activeElement).toBe(undoButton());
    hideTray();
  });

  it('promises nothing once the binding is cleared', async () => {
    const { listeners } = installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'T', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();

    broadcast(listeners, { action_tray_focus: '' });

    expect(hintText()).toBeNull();
    expect(trayEl().textContent).not.toMatch(/undefined|Press\s+to/);
    press('Alt+Shift+J');
    expect(document.activeElement).not.toBe(undoButton());
    hideTray();
  });

  it('falls back to the default, and says the default, when storage cannot be read', async () => {
    installChrome({ failGet: true });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'T', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();

    expect(hintText()).toBe('Press Alt+Shift+U to reach Undo');
    press('Alt+Shift+U');
    expect(document.activeElement).toBe(undoButton());
    hideTray();
  });

  it('reads storage once per realm, however many trays appear', async () => {
    const { get } = installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'One', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();
    showSaveTray({ title: 'Two', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
    expect(hintText()).toBe('Press Alt+Shift+J to reach Undo');
    hideTray();
  });

  it('leaves no storage listener behind when the tray goes', async () => {
    const { listeners } = installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showSaveTray, hideTray } = loadTray();

    showSaveTray({ title: 'T', projectName: 'P', onUndo: () => {}, duration: 0 });
    await settle();
    expect(listeners.size).toBe(1);

    hideTray();
    expect(listeners.size).toBe(0);
  });

  it('carries no hint when the tray has no action to reach', async () => {
    installChrome({ shortcuts: { action_tray_focus: 'Alt+Shift+J' } });
    const { showInfoTray, hideTray } = loadTray();

    showInfoTray({ message: 'Already saved', duration: 0 });
    await settle();

    expect(hintText()).toBeNull();
    hideTray();
  });
});
