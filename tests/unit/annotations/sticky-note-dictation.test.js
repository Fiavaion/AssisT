/**
 * @jest-environment jsdom
 *
 * A sticky note's microphone dictates into the note with Chrome's speech recognition, which sends
 * the voice to Google. It asks the dictation question first (ADR 0006) and starts nothing without a
 * yes; stopping a note that is recording needs no question.
 */

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: jest.fn(() => []) })),
  renderTagPills: jest.fn(),
}));
jest.mock('../../../src/utils/dictation-consent.js', () => ({
  allowDictation: jest.fn(),
  onDictationWithdrawn: jest.fn(),
}));

import {
  createStickyNote,
  initializeStickyNotes,
} from '../../../src/features/annotations/sticky-note.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';
import { allowDictation, onDictationWithdrawn } from '../../../src/utils/dictation-consent.js';

class FakeRecognition {
  constructor() {
    this.start = jest.fn();
    this.stop = jest.fn(() => this.onend && this.onend());
    FakeRecognition.instances.push(this);
  }
}
FakeRecognition.instances = [];

let nextId = 0;

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

beforeEach(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  document.body.innerHTML = '<div id="test-container"></div>';
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  chrome.runtime.onMessage = { addListener: jest.fn() };
  chrome.storage.local.onChanged = { addListener: jest.fn() };
  chrome.storage.local.get.mockImplementation((keys, callback) => {
    const answer = { annotations: { defaultColor: 'yellow' }, annotationStorageMode: 'local' };
    return callback ? callback(answer) : Promise.resolve(answer);
  });
  storageAdapter.getStorageAdapter.mockReturnValue({
    create: jest.fn(async note => ({ id: ++nextId, ...note })),
    update: jest.fn(),
    delete: jest.fn(),
    getByUrl: jest.fn().mockResolvedValue([]),
  });
  onDictationWithdrawn.mockReturnValue(() => {});
  FakeRecognition.instances = [];
  window.SpeechRecognition = FakeRecognition;
  await initializeStickyNotes();
});

afterEach(() => {
  delete window.SpeechRecognition;
});

async function pressMic() {
  await createStickyNote({ x: 10, y: 10, content: 'Notes' });
  const mic = document.querySelector('.assist-toolbar-btn-stt');
  mic.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await flush();
  return mic;
}

test('asks first, and starts nothing after a no', async () => {
  allowDictation.mockResolvedValue(false);
  await pressMic();
  expect(allowDictation).toHaveBeenCalledTimes(1);
  expect(FakeRecognition.instances).toHaveLength(0);
  // A no is never met with silence.
  const toast = document.getElementById('assist-toast');
  expect(toast.getAttribute('role')).toBe('status');
  expect(toast.textContent).toBe(
    'Nothing was recorded or sent. Press the note’s microphone to be asked again.'
  );
});

test('starts dictating into the note after a yes, and stops without asking again', async () => {
  allowDictation.mockResolvedValue(true);
  const mic = await pressMic();
  expect(FakeRecognition.instances).toHaveLength(1);
  expect(FakeRecognition.instances[0].start).toHaveBeenCalled();

  mic.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await flush();
  expect(allowDictation).toHaveBeenCalledTimes(1);
  expect(FakeRecognition.instances[0].stop).toHaveBeenCalled();
});
