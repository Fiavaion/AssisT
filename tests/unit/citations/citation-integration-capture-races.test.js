/**
 * @jest-environment jsdom
 *
 * Two routes into saving from a course page that went wrong quietly.
 *
 * - Two quick presses of "Cite this source" each ran the by-URL duplicate check before either had
 *   stored anything, so both passed and the page was saved twice.
 * - A voice capture with no passage to quote opened the wizard with an empty quote box and no word
 *   about why, as if the passage had been taken.
 *
 * resetMocks:true wipes factory implementations, so every mock is armed in beforeEach.
 */


import { saveCitationFromCurrentPage } from '../../../src/features/citations/citation-integration.js';
import { CitationStorageRPC, ProjectStorageRPC } from '../../../src/features/citations/citation-rpc.js';
import { showInfoTray } from '../../../src/utils/action-tray.js';
import { showErrorToast } from '../../../src/features/citations/citation-toast.js';
import {
  extractMetadata,
  mergeMetadata,
  isPDF,
} from '../../../src/features/citations/metadata-extractor.js';

jest.mock('../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: {
    getByURL: jest.fn(),
    add: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    purge: jest.fn(),
  },
  ProjectStorageRPC: { get: jest.fn() },
  CitationMigrationRPC: { getStatus: jest.fn() },
}));
jest.mock('../../../src/features/citations/metadata-extractor.js', () => ({
  extractMetadata: jest.fn(),
  mergeMetadata: jest.fn(),
  isPDF: jest.fn(),
  extractPDFMetadata: jest.fn(),
}));
jest.mock('../../../src/utils/action-tray.js', () => ({
  showSaveTray: jest.fn(),
  showInfoTray: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-toast.js', () => ({
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
}));
jest.mock('../../../src/features/citations/crossref-api.js', () => ({
  enrichMetadataWithDOI: jest.fn(async data => data),
}));
jest.mock('../../../src/features/citations/ui/citation-wizard-modal.js', () => ({
  showCitationWizard: jest.fn(),
}));
jest.mock('../../../src/features/citations/ui/migration-prompt.js', () => ({
  showMigrationPrompt: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-store.js', () => ({
  createCitationStore: jest.fn(() => ({ init: jest.fn() })),
}));
jest.mock('../../../src/features/citations/capture/citation-voice-trigger.js', () => ({
  createCitationVoiceTrigger: jest.fn(),
}));
jest.mock('../../../src/features/citations/capture/citation-capture-buttons.js', () => ({
  createCaptureButtons: jest.fn(),
}));

import { getVoiceTrigger } from '../../../src/features/citations/citation-integration.js';
import { showCitationWizard } from '../../../src/features/citations/ui/citation-wizard-modal.js';
import { createCitationVoiceTrigger } from '../../../src/features/citations/capture/citation-voice-trigger.js';

const PAGE = {
  type: 'website',
  title: 'Dyslexia',
  authors: ['Anon.'],
  publicationDate: '2024-01-01',
  url: 'https://example.test/dyslexia',
};

let stored;

beforeEach(() => {
  stored = [];
  isPDF.mockReturnValue(false);
  extractMetadata.mockReturnValue({});
  mergeMetadata.mockImplementation(() => ({ ...PAGE }));
  CitationStorageRPC.getByURL.mockImplementation(async url => stored.filter(c => c.url === url));
  CitationStorageRPC.add.mockImplementation(async record => {
    // A real write takes a round trip through the service worker and the offscreen document.
    await new Promise(r => setTimeout(r, 5));
    const id = String(stored.length + 1);
    stored.push({ ...record, id });
    return id;
  });
  CitationStorageRPC.get.mockImplementation(async id => stored.find(c => c.id === id) || null);
  ProjectStorageRPC.get.mockResolvedValue(null);
  createCitationVoiceTrigger.mockReturnValue({ onCitationTrigger: () => true });
  showCitationWizard.mockResolvedValue(null);
});

describe('two quick presses of Cite this source', () => {
  test('store the page once, and the second is told it is already saved', async () => {
    await Promise.all([saveCitationFromCurrentPage(''), saveCitationFromCurrentPage('')]);

    expect(CitationStorageRPC.add).toHaveBeenCalledTimes(1);
    expect(stored).toHaveLength(1);
    expect(showInfoTray.mock.calls.map(([opts]) => opts.message)).toContain(
      'Already saved for this page'
    );
  });

  test('a save that fails does not stop the next press from saving', async () => {
    CitationStorageRPC.add.mockRejectedValueOnce(new Error('offscreen restarted'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const first = saveCitationFromCurrentPage('');
    const second = saveCitationFromCurrentPage('');
    await expect(first).rejects.toThrow('offscreen restarted');
    await second;

    expect(stored).toHaveLength(1);
    expect(showErrorToast).toHaveBeenCalledTimes(1);
  });
});

/**
 * Review mode opens the wizard before anything is stored. Its duplicate check used to run, and
 * return, before the wizard opened, so a second press passed the same empty check and a second
 * wizard stored a second record for the page.
 */
describe('two quick presses in review mode', () => {
  test('store the page once, and the second is told it is already saved', async () => {
    showCitationWizard.mockImplementation(async (draft, { onSave }) => {
      await onSave({});
      return draft;
    });

    await Promise.all([
      saveCitationFromCurrentPage('', { mode: 'review' }),
      saveCitationFromCurrentPage('', { mode: 'review' }),
    ]);

    expect(CitationStorageRPC.add).toHaveBeenCalledTimes(1);
    expect(stored).toHaveLength(1);
    expect(showInfoTray.mock.calls.map(([opts]) => opts.message)).toContain(
      'Already saved for this page'
    );
  });

  test('a cancelled review leaves the next press free to save', async () => {
    showCitationWizard.mockResolvedValueOnce(null).mockImplementationOnce(async (draft, { onSave }) => {
      await onSave({});
      return draft;
    });

    await Promise.all([
      saveCitationFromCurrentPage('', { mode: 'review' }),
      saveCitationFromCurrentPage('', { mode: 'review' }),
    ]);

    expect(stored).toHaveLength(1);
  });
});

describe('a voice capture with no passage', () => {
  function draftHandler() {
    getVoiceTrigger();
    return createCitationVoiceTrigger.mock.calls.at(-1)[0].onDraft;
  }

  test('opens the wizard told that no passage was captured', async () => {
    await draftHandler()({
      source: 'voice',
      url: PAGE.url,
      title: 'Dyslexia - Canvas',
      paragraph: '',
      quotedText: '',
      passageMissing: true,
    });

    const [prefill] = showCitationWizard.mock.calls[0];
    expect(prefill).toMatchObject({ url: PAGE.url, passageMissing: true });
    expect(prefill.quote).toBeUndefined();
  });

  test('says nothing of the kind when the passage was captured', async () => {
    await draftHandler()({
      source: 'voice',
      url: PAGE.url,
      title: 'Dyslexia - Canvas',
      paragraph: 'Words.',
      quotedText: 'Words.',
      passageMissing: false,
    });

    const [prefill] = showCitationWizard.mock.calls[0];
    expect(prefill.passageMissing).toBeUndefined();
    expect(prefill.quote).toBe('Words.');
  });
});
