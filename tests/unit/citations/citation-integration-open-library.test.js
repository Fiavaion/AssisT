/**
 * @jest-environment jsdom
 *
 * openLibrary() routing: the full-page library is the only citation library surface, so opening it
 * is an unconditional hand-off to the service worker. The retired in-page overlay, and the gate
 * that used to choose between them, are gone.
 *
 * NOTE: jest.config.cjs sets resetMocks:true, which wipes factory-provided implementations before
 * every test — so all mock return values are (re)established in beforeEach, not in the factories.
 */

import { openLibrary } from '../../../src/features/citations/citation-integration.js';
import { CitationMigrationRPC } from '../../../src/features/citations/citation-rpc.js';
import { showMigrationPrompt } from '../../../src/features/citations/ui/migration-prompt.js';

jest.mock('../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: {},
  ProjectStorageRPC: {},
  CitationMigrationRPC: { getStatus: jest.fn() },
}));
jest.mock('../../../src/features/citations/ui/migration-prompt.js', () => ({
  showMigrationPrompt: jest.fn(),
}));
// The store touches IndexedDB; stub it so the test exercises only the routing.
jest.mock('../../../src/features/citations/citation-store.js', () => ({
  createCitationStore: jest.fn(() => ({ init: jest.fn(), getState: () => ({ style: 'harvard' }) })),
}));
jest.mock('../../../src/features/citations/citation-index.js', () => ({
  initCitationIndex: jest.fn(),
}));

beforeEach(() => {
  CitationMigrationRPC.getStatus.mockResolvedValue({ done: true });
  showMigrationPrompt.mockResolvedValue(undefined);
  global.chrome = {
    ...(global.chrome || {}),
    runtime: { ...(global.chrome?.runtime || {}), sendMessage: jest.fn() },
  };
});

describe('openLibrary()', () => {
  test('asks the service worker to open the full-page library', async () => {
    await openLibrary();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_CITATION_LIBRARY' });
  });

  test('offers the migration choice first when it has not been made yet', async () => {
    CitationMigrationRPC.getStatus.mockResolvedValue({ done: false });

    await openLibrary();

    expect(showMigrationPrompt).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_CITATION_LIBRARY' });
  });

  test('still opens the library when the migration check fails', async () => {
    CitationMigrationRPC.getStatus.mockRejectedValue(new Error('offscreen unavailable'));

    await openLibrary();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_CITATION_LIBRARY' });
  });
});
