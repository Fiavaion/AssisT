/**
 * @jest-environment jsdom
 *
 * Undo on the save tray means "I did not mean to save this".
 *
 * A soft delete would leave the record sitting in Recently removed for the whole retention window —
 * a citation the student never wanted, in a list they will have to clear by hand. The capture undo
 * therefore destroys the record outright. (Remove from the library is the opposite case, and stays
 * a soft delete: that student HAD the citation and may want it back.)
 *
 * NOTE: jest.config.cjs sets resetMocks:true, which wipes factory-provided implementations before
 * every test — so all mock return values are (re)established in beforeEach, not in the factories.
 */

import { saveCitationFromCurrentPage } from '../../../src/features/citations/citation-integration.js';
import { CitationStorageRPC } from '../../../src/features/citations/citation-rpc.js';
import { showSaveTray } from '../../../src/utils/action-tray.js';
import { extractMetadata, mergeMetadata, isPDF } from '../../../src/features/citations/metadata-extractor.js';

jest.mock('../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: {
    getByURL: jest.fn(),
    add: jest.fn(),
    get: jest.fn(),
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
// The store touches IndexedDB; the capture path never needs it here.
jest.mock('../../../src/features/citations/citation-store.js', () => ({
  createCitationStore: jest.fn(() => ({ init: jest.fn(), getState: () => ({ style: 'harvard' }) })),
}));
jest.mock('../../../src/features/citations/capture/citation-voice-trigger.js', () => ({
  createCitationVoiceTrigger: jest.fn(),
}));
jest.mock('../../../src/features/citations/capture/citation-capture-buttons.js', () => ({
  createCaptureButtons: jest.fn(),
}));

const SAVED = {
  id: '7',
  type: 'journal',
  title: 'Working Memory',
  authors: ['Okonkwo, A.'],
  publicationDate: '2021',
  url: 'https://example.test/wm',
  projectId: null,
};

beforeEach(() => {
  isPDF.mockReturnValue(false);
  extractMetadata.mockReturnValue({});
  mergeMetadata.mockReturnValue({ ...SAVED, id: undefined });
  CitationStorageRPC.getByURL.mockResolvedValue([]);
  CitationStorageRPC.add.mockResolvedValue('7');
  CitationStorageRPC.get.mockResolvedValue(SAVED);
  CitationStorageRPC.delete.mockResolvedValue(undefined);
  CitationStorageRPC.purge.mockResolvedValue(undefined);
});

describe('save-tray Undo after a capture', () => {
  test('destroys the record rather than leaving it in Recently removed', async () => {
    await saveCitationFromCurrentPage();

    expect(showSaveTray).toHaveBeenCalledTimes(1);
    await showSaveTray.mock.calls[0][0].onUndo();

    expect(CitationStorageRPC.purge).toHaveBeenCalledWith('7');
    expect(CitationStorageRPC.delete).not.toHaveBeenCalled();
  });
});
