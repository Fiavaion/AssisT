/**
 * Voice palette — binds the grammar to the STT controller hook and dispatches to features.
 */
jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(),
}));
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));
jest.mock('../../../src/utils/speech-voice.js', () => ({
  createSavedUtterance: jest.fn(),
}));

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { showToast } from '../../../src/core/ui/toast.js';
import { createSavedUtterance } from '../../../src/utils/speech-voice.js';
import {
  init,
  cleanup,
  handleTranscript,
} from '../../../src/features/companion/voice-palette-ui.js';

beforeEach(() => {
  document.body.innerHTML = '';
  isCompanionEnabled.mockResolvedValue(true);
  window.assistFeatures = {
    stt: { controller: { onAssistCommand: () => false } },
    citation: { captureFromSelection: jest.fn(), openLibrary: jest.fn() },
  };
});

afterEach(() => {
  cleanup();
  delete window.assistFeatures;
});

test('init binds the palette onto the live STT controller', async () => {
  await init();
  expect(window.assistFeatures.stt.controller.onAssistCommand).toBe(handleTranscript);
});

test('init leaves the controller untouched when the toggle is off', async () => {
  isCompanionEnabled.mockResolvedValue(false);
  const before = window.assistFeatures.stt.controller.onAssistCommand;
  await init();
  expect(window.assistFeatures.stt.controller.onAssistCommand).toBe(before);
});

test('a spoken command is consumed and dispatched', () => {
  expect(handleTranscript('save citation')).toBe(true);
  expect(window.assistFeatures.citation.captureFromSelection).toHaveBeenCalled();
});

test('ordinary dictation is never consumed', () => {
  expect(handleTranscript('the library was closed today so I studied at home')).toBe(false);
  expect(window.assistFeatures.citation.openLibrary).not.toHaveBeenCalled();
});

test('help opens the things-you-can-say card', () => {
  expect(handleTranscript('what can I say')).toBe(true);
  const card = document.getElementById('assist-companion-voice-help');
  expect(card).not.toBeNull();
  expect(card.textContent).toContain('read');
});

test('cleanup unbinds the hook and removes the help card', async () => {
  await init();
  handleTranscript('what can I say');
  cleanup();
  expect(window.assistFeatures.stt.controller.onAssistCommand('read this page')).toBe(false);
  expect(document.getElementById('assist-companion-voice-help')).toBeNull();
});

test('open calculator opens the Maths Support calculator when it is on', () => {
  window.assistFeatures.maths = { openCalculator: jest.fn() };
  expect(handleTranscript('open calculator')).toBe(true);
  expect(window.assistFeatures.maths.openCalculator).toHaveBeenCalledTimes(1);
  expect(showToast).not.toHaveBeenCalled();
});

test('open calculator asks for Maths Support when it is off', () => {
  expect(handleTranscript('open the calculator')).toBe(true);
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast.mock.calls[0][0]).toContain('Turn on Maths Support');
  expect(showToast.mock.calls[0][0]).not.toContain('Calculator & scratchpad');
});

test('open calculator names the calculator switch when Maths Support is on but the calculator is off', () => {
  window.assistFeatures.maths = {};
  expect(handleTranscript('open calculator')).toBe(true);
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast.mock.calls[0][0]).toContain('Calculator & scratchpad');
  expect(showToast.mock.calls[0][0]).not.toContain('Turn on Maths Support');
});

test('the help card lists no due-date or focus-session command', () => {
  handleTranscript('what can I say');
  const text = document.getElementById('assist-companion-voice-help').textContent;
  expect(text).not.toMatch(/due|focus/i);
});

test('due-date and focus phrases are left as dictation', () => {
  expect(handleTranscript("what's due this week")).toBe(false);
  expect(handleTranscript('start a focus session for 25 minutes')).toBe(false);
  expect(showToast).not.toHaveBeenCalled();
});

describe('summarize and simplify pass text to their features', () => {
  const PAGE_TEXT = 'Photosynthesis turns light energy into chemical energy in plants.';
  let selectionSpy;

  function selectText(text) {
    selectionSpy = jest.spyOn(window, 'getSelection').mockReturnValue({ toString: () => text });
  }

  beforeEach(() => {
    document.body.innerHTML = `<main><p>${PAGE_TEXT}</p></main>`;
    window.assistFeatures.summarization = { start: jest.fn() };
    window.assistFeatures.textSimplification = { start: jest.fn() };
  });

  afterEach(() => {
    selectionSpy?.mockRestore();
    selectionSpy = undefined;
  });

  test('summarize this page sends the selection when there is one', () => {
    selectText('the selected sentence');
    expect(handleTranscript('summarize this page')).toBe(true);
    expect(window.assistFeatures.summarization.start).toHaveBeenCalledWith('the selected sentence');
  });

  test('summarize this page sends the main page content when nothing is selected', () => {
    selectText('');
    handleTranscript('summarize this page');
    expect(window.assistFeatures.summarization.start).toHaveBeenCalledWith(PAGE_TEXT);
    expect(showToast).not.toHaveBeenCalled();
  });

  test('simplify this sends the selection', () => {
    selectText('a hard sentence to read');
    handleTranscript('simplify this');
    expect(window.assistFeatures.textSimplification.start).toHaveBeenCalledWith(
      'a hard sentence to read'
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  test('simplify this with nothing selected shows the hint and does not start', () => {
    selectText('   ');
    handleTranscript('simplify this');
    expect(window.assistFeatures.textSimplification.start).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Select some text first'));
  });
});

test('the help card and the read-page toast use no em-dashes', async () => {
  handleTranscript('what can I say');
  expect(document.getElementById('assist-companion-voice-help').textContent).not.toContain('—');

  document.body.innerHTML = '<main><p>Some text to read aloud on this page.</p></main>';
  window.speechSynthesis = { cancel: jest.fn(), speak: jest.fn() };
  createSavedUtterance.mockResolvedValue({});
  handleTranscript('read this page');
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast.mock.calls[0][0]).not.toContain('—');
  delete window.speechSynthesis;
});
