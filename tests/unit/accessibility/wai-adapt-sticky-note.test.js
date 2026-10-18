/**
 * @jest-environment jsdom
 *
 * WAI-Adapt semantics on the sticky note AssisT injects into a host page.
 *
 * Same vocabulary and the same scope limit as the popup's marks (see
 * wai-adapt-semantics.test.js and ADR 0005): the Content Module's `data-action`, emitted only
 * where the draft enumerates a token that genuinely matches. This note is built with
 * createElement and setAttribute rather than rendered from a string, so the sanitizer never
 * sees these attributes — which is precisely why they are asserted on the real element the
 * feature puts in the page, not on any source text.
 *
 * The note's dictation microphone is deliberately bare. The nearest token is `voice-commands`,
 * which the draft defines as activating voice commands, and this extension has a separate
 * voice-commands feature; pointing the same token at dictation would be confidently wrong.
 */

import {
  createStickyNote,
  initializeStickyNotes,
} from '../../../src/features/annotations/sticky-note.js';
import * as storageAdapter from '../../../src/features/annotations/storage-adapter.js';

jest.mock('../../../src/features/annotations/storage-adapter.js');
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  createTagInput: jest.fn(() => ({ getTags: jest.fn(() => []) })),
  renderTagPills: jest.fn(),
}));

describe('a sticky note declares the purpose of its own controls', () => {
  let note;
  // The module keeps a live map of rendered notes and skips one it has already drawn, so each
  // test needs an id of its own rather than re-rendering note 1 four times.
  let nextId = 1;

  beforeEach(async () => {
    // jest.config sets resetMocks, which wipes every factory implementation between tests, so
    // all of these are re-established here rather than at module scope.
    document.body.innerHTML = '';

    global.chrome.storage.local.onChanged ??= { addListener: jest.fn() };
    global.chrome.runtime.onMessage ??= { addListener: jest.fn() };

    const adapter = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getByUrl: jest.fn().mockResolvedValue([]),
    };
    storageAdapter.getStorageAdapter.mockReturnValue(adapter);

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({
        annotations: { defaultColor: 'yellow', defaultNoteSize: 'medium', autoSave: true },
        annotationStorageMode: 'local',
      });
    });

    await initializeStickyNotes();

    adapter.create.mockResolvedValue({
      id: nextId++,
      type: 'note',
      url: 'https://example.com',
      x: 10,
      y: 20,
      content: '',
      color: 'yellow',
      width: 200,
      height: 200,
      tags: [],
    });

    await createStickyNote({ x: 10, y: 20 });
    note = document.querySelector('.assist-sticky-note');
    expect(note).not.toBeNull();
  });

  test('the colour button declares a colour change', () => {
    expect(note.querySelector('.assist-sticky-note-color-btn').getAttribute('data-action')).toBe(
      'color'
    );
  });

  test('the delete button declares a delete', () => {
    expect(note.querySelector('.assist-sticky-note-delete').getAttribute('data-action')).toBe(
      'delete'
    );
  });

  test('the read-aloud button declares playback', () => {
    expect(note.querySelector('.assist-toolbar-btn-tts').getAttribute('data-action')).toBe('play');
  });

  test('the dictation button is left unmarked on purpose', () => {
    expect(note.querySelector('.assist-toolbar-btn-stt').hasAttribute('data-action')).toBe(false);
  });
});
