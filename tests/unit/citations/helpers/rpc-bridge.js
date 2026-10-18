/**
 * Test bridge: routes the citation RPC client through the REAL CitationStorage / ProjectStorage,
 * simulating the service-worker → offscreen relay in a single jsdom realm.
 *
 * Install this in suites that exercise a module which now talks to the canonical store via
 * citation-rpc.js (citation-store, citation-integration, citation-export). It makes
 * chrome.runtime.sendMessage resolve CITATION_DB_OP envelopes by dispatching to fake-indexeddb-backed
 * storage, so the test can seed via CitationStorage and read back through the module under test.
 *
 * Uses the SAME dispatcher (citation-ops.js) as the production offscreen handler, so there is no
 * second copy of the op→method mapping to drift.
 */

import { CitationStorage, ProjectStorage } from '../../../../src/features/citations/citation-storage.js';
import { createCitationDispatcher } from '../../../../src/features/citations/citation-ops.js';
import { CITATION_DB_OP } from '../../../../src/config/citation-messages.js';

const dispatch = createCitationDispatcher({
  storage: CitationStorage,
  projects: ProjectStorage,
  // Migration ops aren't exercised through the store/UI consumers; left undefined.
  migration: undefined,
});

/**
 * Point chrome.runtime.sendMessage at the real storage for CITATION_DB_OP envelopes.
 * Non-citation messages resolve to `{}` (matching the default mock), so unrelated calls are inert.
 */
export function installCitationRpcBridge() {
  chrome.runtime.sendMessage.mockImplementation(async msg => {
    if (msg?.type !== CITATION_DB_OP) {
      return {};
    }
    try {
      const result = await dispatch(msg.op, msg.args || []);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}
