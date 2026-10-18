/**
 * @jest-environment jsdom
 *
 * The capture bar's Voice capture button, end to end inside the content script:
 * - the press goes to a voice-capture session (which starts listening by itself), and the
 *   session's state is what the button and its status line show;
 * - a citation captured by voice and saved tells the student where it went, with a way to open
 *   the library; a cancelled wizard says nothing was saved.
 *
 * resetMocks:true wipes factory implementations, so every mock is armed in beforeEach.
 */

jest.mock('../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: { getAll: jest.fn() },
  ProjectStorageRPC: {},
  CitationMigrationRPC: { getStatus: jest.fn() },
}));
jest.mock('../../../src/utils/action-tray.js', () => ({
  showSaveTray: jest.fn(),
  showInfoTray: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-toast.js', () => ({
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
}));
jest.mock('../../../src/features/citations/ui/citation-wizard-modal.js', () => ({
  showCitationWizard: jest.fn(),
}));
jest.mock('../../../src/features/citations/ui/migration-prompt.js', () => ({
  showMigrationPrompt: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-store.js', () => ({
  createCitationStore: jest.fn(),
  STYLE_KEY: 'citationStyle',
}));
jest.mock('../../../src/features/citations/capture/citation-voice-trigger.js', () => ({
  createCitationVoiceTrigger: jest.fn(),
}));
jest.mock('../../../src/features/citations/capture/citation-capture-buttons.js', () => ({
  createCaptureButtons: jest.fn(),
}));
jest.mock('../../../src/features/citations/capture/voice-capture-session.js', () => ({
  createVoiceCaptureSession: jest.fn(),
}));

import {
  getVoiceTrigger,
  initCitation,
} from '../../../src/features/citations/citation-integration.js';
import { CitationStorageRPC, CitationMigrationRPC } from '../../../src/features/citations/citation-rpc.js';
import { showInfoTray } from '../../../src/utils/action-tray.js';
import { showCitationWizard } from '../../../src/features/citations/ui/citation-wizard-modal.js';
import { createCitationStore } from '../../../src/features/citations/citation-store.js';
import { createCitationVoiceTrigger } from '../../../src/features/citations/capture/citation-voice-trigger.js';
import { createCaptureButtons } from '../../../src/features/citations/capture/citation-capture-buttons.js';
import { createVoiceCaptureSession } from '../../../src/features/citations/capture/voice-capture-session.js';

const DRAFT = { source: 'voice', url: 'https://example.test/a', title: 'A', paragraph: 'Words.' };

let store;
let buttons;
let session;
let settingsListener;

beforeEach(() => {
  store = { init: jest.fn(), add: jest.fn().mockResolvedValue('1') };
  createCitationStore.mockReturnValue(store);
  CitationStorageRPC.getAll.mockResolvedValue([]);
  CitationMigrationRPC.getStatus.mockResolvedValue({ done: true });
  createCitationVoiceTrigger.mockReturnValue({ onCitationTrigger: jest.fn(() => true) });
  buttons = { el: document.createElement('div'), setVoiceActive: jest.fn(), setVoiceStatus: jest.fn(), destroy: jest.fn() };
  createCaptureButtons.mockReturnValue(buttons);
  session = { toggle: jest.fn(), stop: jest.fn(), state: 'off' };
  createVoiceCaptureSession.mockReturnValue(session);
  settingsListener = null;
  global.chrome = {
    runtime: { sendMessage: jest.fn() },
    storage: {
      local: {
        get: jest.fn((key, cb) => {
          if (typeof cb === 'function') {
            cb({});
            return undefined;
          }
          return Promise.resolve({});
        }),
      },
      onChanged: { addListener: jest.fn(fn => (settingsListener = fn)) },
    },
  };
});

function draftHandler() {
  getVoiceTrigger();
  return createCitationVoiceTrigger.mock.calls.at(-1)[0].onDraft;
}

describe('a citation captured by voice', () => {
  test('saved: the student is told it is in the library and can open it from the keyboard', async () => {
    showCitationWizard.mockImplementation(async (draft, { onSave }) => {
      await onSave(draft);
      return { ...draft, id: '1' };
    });

    await draftHandler()(DRAFT);

    expect(store.add).toHaveBeenCalledTimes(1);
    const [opts] = showInfoTray.mock.calls.at(-1);
    expect(opts.message).toBe('Saved to your citation library');
    expect(opts.actionLabel).toBe('Open library');

    await opts.onAction();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_CITATION_LIBRARY' });
  });

  test('cancelled: the student is told nothing was saved', async () => {
    showCitationWizard.mockResolvedValue(null);

    await draftHandler()(DRAFT);

    expect(store.add).not.toHaveBeenCalled();
    const [opts] = showInfoTray.mock.calls.at(-1);
    expect(opts.message).toMatch(/nothing was saved/i);
    expect(opts.actionLabel).toBeUndefined();
  });
});

describe('the Voice capture button', () => {
  const turnCitationsOff = () =>
    settingsListener({ assist_settings: { newValue: { citation: { enabled: false } } } }, 'local');

  beforeEach(() => {
    initCitation();
  });

  // The bar is mounted once per page; take it down so each test mounts its own.
  afterEach(() => {
    turnCitationsOff();
  });

  test('a press goes to the voice-capture session', () => {
    const { onToggleVoice } = createCaptureButtons.mock.calls.at(-1)[0];
    onToggleVoice();

    expect(session.toggle).toHaveBeenCalledTimes(1);
  });

  test('the session listens on the page dictation controller when there is one', () => {
    const controller = { isRecording: true };
    window.assistFeatures.stt = { controller };
    const { getDictation } = createVoiceCaptureSession.mock.calls.at(-1)[0];

    expect(getDictation()).toBe(controller);
  });

  test('what the session reports is what the button and its status line show', () => {
    const { onChange } = createVoiceCaptureSession.mock.calls.at(-1)[0];
    onChange({ listening: true, message: 'Listening.' });

    expect(buttons.setVoiceActive).toHaveBeenLastCalledWith(true);
    expect(buttons.setVoiceStatus).toHaveBeenLastCalledWith('Listening.');
  });

  test('turning citations off stops voice capture with the bar', () => {
    turnCitationsOff();

    expect(session.stop).toHaveBeenCalled();
    expect(buttons.destroy).toHaveBeenCalled();
  });
});
