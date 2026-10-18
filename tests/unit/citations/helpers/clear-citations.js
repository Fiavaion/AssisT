/**
 * Test teardown: empty the citations table (live and trashed rows alike) so each test starts from
 * nothing. Product code has no reason to wipe a student's library, so this lives with the tests.
 */

import citationStorage from '../../../../src/features/citations/citation-storage.js';

export async function clearCitations() {
  await citationStorage.db.citations.clear();
}
