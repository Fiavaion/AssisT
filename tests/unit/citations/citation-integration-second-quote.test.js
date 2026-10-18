/**
 * @jest-environment jsdom
 *
 * A second quote from a page that is already saved.
 *
 * W5 finding: selecting new words and pressing Alt+C on a page already in the library showed
 * "Already saved for this page" and threw the selection away — a student who highlighted a
 * paragraph to quote it got nothing, with no way to keep a second quote except by hand. The tray
 * now offers to add those words to the source that is already there, and never creates a duplicate.
 *
 * NOTE: jest.config.cjs sets resetMocks:true, which wipes factory-provided implementations before
 * every test — so all mock return values are (re)established in beforeEach, not in the factories.
 */

import { saveCitationFromCurrentPage } from '../../../src/features/citations/citation-integration.js';
import { CitationStorageRPC } from '../../../src/features/citations/citation-rpc.js';
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

const EXISTING = {
  id: '7',
  type: 'website',
  title: 'Dyslexia',
  authors: ['Anon.'],
  publicationDate: '2024-01-01',
  url: 'https://example.test/dyslexia',
  quote: '',
};

const NEW_WORDS = 'Phonological awareness predicts later reading fluency.';

beforeEach(() => {
  isPDF.mockReturnValue(false);
  extractMetadata.mockReturnValue({});
  mergeMetadata.mockReturnValue({ ...EXISTING, id: undefined });
  CitationStorageRPC.getByURL.mockResolvedValue([EXISTING]);
  CitationStorageRPC.update.mockResolvedValue(undefined);
});

/** The tray options from the nth showInfoTray call. */
function trayCall(n = 0) {
  return showInfoTray.mock.calls[n][0];
}

describe('a second quote from an already-saved page', () => {
  test('offers to add the highlighted words instead of only Edit', async () => {
    await saveCitationFromCurrentPage(NEW_WORDS);

    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
    const opts = trayCall();
    expect(opts.actionLabel).toBe('Add quote');
    expect(typeof opts.onAction).toBe('function');
  });

  test('the action stores the words as the source own words on the saved record', async () => {
    await saveCitationFromCurrentPage(NEW_WORDS);
    await trayCall().onAction();

    expect(CitationStorageRPC.update).toHaveBeenCalledWith('7', { quote: NEW_WORDS });
    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
  });

  test('confirms in words that the quote was kept', async () => {
    await saveCitationFromCurrentPage(NEW_WORDS);
    await trayCall().onAction();

    const confirmation = trayCall(1).message;
    expect(confirmation.toLowerCase()).toContain('quote');
    expect(confirmation.toLowerCase()).not.toContain('error');
  });

  test('keeps a quote the student already had and adds the new words to it', async () => {
    CitationStorageRPC.getByURL.mockResolvedValue([{ ...EXISTING, quote: 'First quote.' }]);

    await saveCitationFromCurrentPage(NEW_WORDS);
    await trayCall().onAction();

    const [, updates] = CitationStorageRPC.update.mock.calls[0];
    expect(updates.quote).toContain('First quote.');
    expect(updates.quote).toContain(NEW_WORDS);
  });

  test('the same words twice neither duplicates the quote nor writes again', async () => {
    CitationStorageRPC.getByURL.mockResolvedValue([{ ...EXISTING, quote: NEW_WORDS }]);

    await saveCitationFromCurrentPage(NEW_WORDS);
    await trayCall().onAction();

    expect(CitationStorageRPC.update).not.toHaveBeenCalled();
    expect(trayCall(1).message.toLowerCase()).toContain('already');
  });

  test('with nothing selected the tray still offers Edit', async () => {
    await saveCitationFromCurrentPage('');

    expect(trayCall().actionLabel).toBe('Edit');
    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
  });

  test('a failed update says so in words and never adds a second source', async () => {
    CitationStorageRPC.update.mockRejectedValue(new Error('offline'));

    await saveCitationFromCurrentPage(NEW_WORDS);
    await trayCall().onAction();

    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
    expect(showErrorToast).toHaveBeenCalled();
    expect(showErrorToast.mock.calls[0][0].toLowerCase()).toContain('quote');
  });
});
