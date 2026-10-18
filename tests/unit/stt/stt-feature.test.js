/**
 * Unit tests for the STT feature module's page wiring.
 *
 * Covers the keyboard route to dictation (Alt+Shift+V), and the "Show Microphone Button"
 * setting taking effect on an open page without an error in the console.
 *
 * Dictation asks its consent question first (ADR 0006; covered in dictation-consent.test.js); here
 * the answer is set per test, and a keyboard start is awaited because the question comes first.
 *
 * @file stt-feature.test.js
 */

let mockDictationAnswer = true;
const mockConsentAsked = [];
jest.mock('../../../src/utils/dictation-consent.js', () => ({
  allowDictation: options => {
    mockConsentAsked.push(options);
    return Promise.resolve(mockDictationAnswer);
  },
  onDictationWithdrawn: () => () => {},
}));

/** The dictation question is answered before anything starts. */
async function answered() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.maxAlternatives = 1;
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    if (this.onstart) {
      this.onstart();
    }
  }

  stop() {
    if (this.onend) {
      this.onend();
    }
  }

  abort() {
    if (this.onend) {
      this.onend();
    }
  }
}
MockSpeechRecognition.instances = [];

/**
 * Load the self-initializing STT module with a given stt settings object in storage.
 * @param {Object} sttSettings
 * @param {Object} [keyboardShortcuts] - Stored bindings, as the shortcut registry reads them.
 */
async function loadStt(sttSettings, keyboardShortcuts) {
  jest.resetModules();
  mockDictationAnswer = true;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete window.assistFeatures;
  MockSpeechRecognition.instances = [];

  global.webkitSpeechRecognition = MockSpeechRecognition;
  window.webkitSpeechRecognition = MockSpeechRecognition;
  navigator.mediaDevices = { getUserMedia: () => Promise.reject(new Error('no mic in jsdom')) };

  const changeListeners = [];
  global.chrome.storage.local.get = jest.fn((key, callback) => {
    const result = { assist_settings: { stt: sttSettings, keyboardShortcuts } };
    if (typeof callback === 'function') {
      callback(result);
      return undefined;
    }
    return Promise.resolve(result);
  });
  global.chrome.storage.local.set = jest.fn((value, callback) => {
    if (typeof callback === 'function') {
      callback();
    }
    return Promise.resolve();
  });
  global.chrome.storage.onChanged = {
    addListener: listener => changeListeners.push(listener),
    removeListener: jest.fn(),
  };

  await import('../../../src/features/stt/stt.js');
  // The shortcut registry reads the student's bindings from storage before it binds, so the
  // page's listeners are only in place after the promise chain has drained.
  await new Promise(resolve => setTimeout(resolve, 0));

  return {
    fireSettingsChange: next => {
      changeListeners.forEach(listener =>
        listener({ assist_settings: { newValue: { stt: next } } })
      );
    },
  };
}

function dictationShortcut(key = 'V', code = 'KeyV') {
  return new KeyboardEvent('keydown', {
    key,
    code,
    altKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
}

function addTextarea() {
  const field = document.createElement('textarea');
  document.body.appendChild(field);
  field.getBoundingClientRect = () => ({
    left: 20,
    top: 40,
    width: 400,
    height: 120,
    right: 420,
    bottom: 160,
    x: 20,
    y: 40,
    toJSON: () => {},
  });
  return field;
}

const micElement = () => document.querySelector('.assist-stt-mic-button');

describe('STT feature wiring', () => {
  afterEach(() => {
    if (window.assistFeatures && window.assistFeatures.stt) {
      window.assistFeatures.stt.cleanup();
    }
    delete global.webkitSpeechRecognition;
  });

  it('starts dictation from the keyboard with Alt+Shift+V', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');

    const event = dictationShortcut();
    document.dispatchEvent(event);
    await answered();

    expect(event.defaultPrevented).toBe(true);
    expect(startSpy).toHaveBeenCalledWith(field);
  });

  it('starts nothing from the keyboard when the student says no to the dictation question', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    mockDictationAnswer = false;
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');
    document.dispatchEvent(dictationShortcut());
    await answered();

    expect(startSpy).not.toHaveBeenCalled();
    expect(controller.isRecording).toBe(false);
    // A no is never met with silence: the student hears what did not happen and how to ask again.
    const toast = document.getElementById('assist-toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.textContent).toBe(
      'Nothing was recorded or sent. Press the microphone to be asked again.'
    );
  });

  it('says so after a no when the microphone button is off and the shortcut asked', async () => {
    await loadStt({ enabled: true, floatingButton: false });
    mockDictationAnswer = false;
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');
    document.dispatchEvent(dictationShortcut());
    await answered();

    expect(startSpy).not.toHaveBeenCalled();
    const toast = document.getElementById('assist-toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.textContent).toBe(
      'Nothing was recorded or sent. Press the voice typing shortcut to be asked again.'
    );
  });

  it('stops dictation when the shortcut is pressed again', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    document.dispatchEvent(dictationShortcut());
    await answered();
    const stopSpy = jest.spyOn(controller, 'stopListening');
    document.dispatchEvent(dictationShortcut());

    expect(stopSpy).toHaveBeenCalled();
  });

  it('hides an existing button live when Show Microphone Button is turned off', async () => {
    const { fireSettingsChange } = await loadStt({ enabled: true, floatingButton: true });
    const field = addTextarea();
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(micElement()).not.toBeNull();

    fireSettingsChange({ enabled: true, floatingButton: false });

    expect(micElement()).toBeNull();
    expect(window.assistFeatures.stt.micButton).toBeNull();
  });

  it('takes the binding from the shortcut registry, so a remap works', async () => {
    await loadStt({ enabled: true, floatingButton: true }, { stt_dictate: 'Alt+Shift+K' });
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');

    document.dispatchEvent(dictationShortcut());
    expect(startSpy).not.toHaveBeenCalled();

    document.dispatchEvent(dictationShortcut('K', 'KeyK'));
    await answered();
    expect(startSpy).toHaveBeenCalledWith(field);
  });

  it('leaves the key alone when the student cleared the binding', async () => {
    await loadStt({ enabled: true, floatingButton: true }, { stt_dictate: '' });
    const field = addTextarea();
    field.focus();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');

    const event = dictationShortcut();
    document.dispatchEvent(event);

    expect(startSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('logs no error and keeps dictation reachable when the button is off', async () => {
    await loadStt({ enabled: true, floatingButton: false });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const field = addTextarea();
    field.focus();
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(micElement()).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');
    document.dispatchEvent(dictationShortcut());
    await answered();

    expect(startSpy).toHaveBeenCalledWith(field);
    errorSpy.mockRestore();
  });

  it('leaves the key alone when voice typing is turned off while its shortcut is being read', async () => {
    const { fireSettingsChange } = await loadStt({ enabled: false, floatingButton: true });
    // Hold the shortcut registry's read of the student's bindings until voice typing is off again.
    const readStorage = global.chrome.storage.local.get;
    const heldReads = [];
    global.chrome.storage.local.get = jest.fn((key, callback) =>
      typeof callback === 'function' ? heldReads.push(() => readStorage(key, callback)) : readStorage(key)
    );

    fireSettingsChange({ enabled: true, floatingButton: true });
    await answered();
    expect(heldReads.length).toBeGreaterThan(0);
    fireSettingsChange({ enabled: false, floatingButton: true });
    heldReads.forEach(release => release());
    await new Promise(resolve => setTimeout(resolve, 0));

    const event = dictationShortcut();
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("STT in Canvas's Rich Content Editor (a same-origin editor iframe)", () => {
  /** The TinyMCE shape: an iframe whose body is the student's essay. */
  function addEditor() {
    const frame = document.createElement('iframe');
    frame.title = 'Rich Content Editor';
    document.body.appendChild(frame);
    const body = frame.contentDocument.body;
    body.className = 'mce-content-body';
    body.setAttribute('contenteditable', 'true');
    frame.getBoundingClientRect = () => ({
      left: 20,
      top: 200,
      width: 600,
      height: 300,
      right: 620,
      bottom: 500,
      x: 20,
      y: 200,
      toJSON: () => {},
    });
    return { frame, body, doc: frame.contentDocument };
  }

  function focusEditor({ doc, body }) {
    body.dispatchEvent(new doc.defaultView.FocusEvent('focusin', { bubbles: true }));
  }

  function shortcutIn(doc) {
    const event = new doc.defaultView.KeyboardEvent('keydown', {
      key: 'V',
      code: 'KeyV',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    doc.body.dispatchEvent(event);
    return event;
  }

  afterEach(() => {
    if (window.assistFeatures && window.assistFeatures.stt) {
      window.assistFeatures.stt.cleanup();
    }
    delete global.webkitSpeechRecognition;
  });

  it('shows the microphone for the editor when the student clicks into it', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();

    focusEditor(editor);

    expect(micElement()).not.toBeNull();
    expect(micElement().ownerDocument).toBe(document);
    expect(window.assistFeatures.stt.micButton.targetField).toBe(editor.body);
  });

  it('moves the microphone from a textarea to the editor, and back', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const field = addTextarea();
    const editor = addEditor();
    await answered();

    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(window.assistFeatures.stt.micButton.targetField).toBe(field);

    focusEditor(editor);
    expect(window.assistFeatures.stt.micButton.targetField).toBe(editor.body);

    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(window.assistFeatures.stt.micButton.targetField).toBe(field);
  });

  it('starts dictation into the editor from the shortcut pressed inside it', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    addTextarea();
    const editor = addEditor();
    await answered();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');
    const event = shortcutIn(editor.doc);
    await answered();

    expect(event.defaultPrevented).toBe(true);
    expect(startSpy).toHaveBeenCalledWith(editor.body);
  });

  it('starts dictation into the editor from the shortcut when the button is off', async () => {
    await loadStt({ enabled: true, floatingButton: false });
    const editor = addEditor();
    await answered();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');
    shortcutIn(editor.doc);
    await answered();

    expect(startSpy).toHaveBeenCalledWith(editor.body);
  });

  it('serves an editor Canvas mounts after the page has loaded', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();
    await new Promise(resolve => setTimeout(resolve, 0));

    focusEditor(editor);

    expect(window.assistFeatures.stt.micButton.targetField).toBe(editor.body);
  });

  it('lets the editor go when voice typing is turned off', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();
    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');

    window.assistFeatures.stt.cleanup();
    const event = shortcutIn(editor.doc);
    await answered();

    expect(event.defaultPrevented).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('takes the microphone away when the editor leaves the page', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();
    focusEditor(editor);
    expect(window.assistFeatures.stt.micButton.targetField).toBe(editor.body);

    editor.frame.remove();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.assistFeatures.stt.micButton.targetField).toBeNull();
  });

  it('returns focus through the iframe after the dictation question, the part of it in this page', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();
    mockConsentAsked.length = 0;

    shortcutIn(editor.doc);
    await answered();

    expect(mockConsentAsked[0].returnFocus).toBe(editor.frame);
  });

  it('honours a shortcut remapped while the page is open, in the editor and in its message', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();

    // The student remaps the key in the popup; the content script reloads the shortcut registry
    // on that settings change (content-simple.js onSettingsChanged -> reloadShortcuts).
    const stored = {
      assist_settings: {
        stt: { enabled: true, floatingButton: true },
        keyboardShortcuts: { stt_dictate: 'Alt+Shift+K' },
      },
    };
    global.chrome.storage.local.get = jest.fn((key, callback) => {
      if (typeof callback === 'function') {
        callback(stored);
        return undefined;
      }
      return Promise.resolve(stored);
    });
    const { reloadShortcuts } = await import('../../../src/utils/keyboard-shortcuts.js');
    await reloadShortcuts();

    const controller = window.assistFeatures.stt.controller;
    const startSpy = jest.spyOn(controller, 'startListening');

    const oldKey = shortcutIn(editor.doc);
    await answered();
    expect(oldKey.defaultPrevented).toBe(false);
    expect(startSpy).not.toHaveBeenCalled();

    const newKey = new editor.doc.defaultView.KeyboardEvent('keydown', {
      key: 'K',
      code: 'KeyK',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.doc.body.dispatchEvent(newKey);
    await answered();
    expect(newKey.defaultPrevented).toBe(true);
    expect(startSpy).toHaveBeenCalledWith(editor.body);

    // With no field under the caret, the message names the key the student chose.
    controller.stopListening();
    window.assistFeatures.stt.micButton.stopRecording();
    editor.frame.remove();
    await new Promise(resolve => setTimeout(resolve, 0));
    document.dispatchEvent(dictationShortcut('K', 'KeyK'));
    expect(document.getElementById('assist-toast').textContent).toBe(
      'Put the cursor in a text box first, then press Alt+Shift+K to dictate.'
    );
  });

  it('puts nothing into the editor document', async () => {
    await loadStt({ enabled: true, floatingButton: true });
    const editor = addEditor();
    await answered();

    focusEditor(editor);
    shortcutIn(editor.doc);
    await answered();

    expect(editor.doc.querySelector('[id^="assist-"], [class*="assist-"]')).toBeNull();
    expect(editor.body.innerHTML).toBe('');
  });
});
