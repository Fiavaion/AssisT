/**
 * @jest-environment jsdom
 *
 * Integration test for the offscreen citation handler — the realm that owns the canonical DB.
 * Drives handleCitationMessage against the REAL CitationStorage (fake-indexeddb) and asserts the
 * reply envelope sent back over chrome.runtime (action / requestId / ok / result).
 */

import 'fake-indexeddb/auto';
import { handleCitationMessage } from '../../../src/pages/assist-offscreen/citation-handler.js';
import { clearCitations } from './helpers/clear-citations.js';
import { CIT, CITATION_OFFSCREEN_RESPONSE } from '../../../src/config/citation-messages.js';

// jest.config resetMocks:true wipes implementations each test, so sendMessage would return undefined
// (the handler calls `.catch` on it). Restore a promise-returning impl per test.
beforeEach(() => {
  chrome.runtime.sendMessage.mockResolvedValue(undefined);
});

/** Capture the reply chrome.runtime.sendMessage the handler emits for a given requestId. */
async function call(action, args, requestId = 'r1') {
  await handleCitationMessage({ action, args, requestId });
  // The handler may emit the reply on a microtask after its await chain; flush.
  await Promise.resolve();
  const reply = chrome.runtime.sendMessage.mock.calls
    .map(c => c[0])
    .find(m => m && m.action === CITATION_OFFSCREEN_RESPONSE && m.requestId === requestId);
  return reply;
}

afterEach(async () => {
  await clearCitations();
});

describe('handleCitationMessage', () => {
  it('adds a citation and replies ok with the new id', async () => {
    const reply = await call(CIT.ADD, [
      { title: 'Hello', url: 'https://x', authors: ['A'] },
    ]);
    expect(reply).toMatchObject({ ok: true });
    expect(typeof reply.result).toBe('string');
  });

  it('round-trips: add then getAll returns the stored row', async () => {
    await call(CIT.ADD, [{ title: 'Stored', url: 'https://y', authors: ['B'] }], 'add1');
    const reply = await call(CIT.GET_ALL, [{}], 'all1');
    expect(reply.ok).toBe(true);
    expect(reply.result).toHaveLength(1);
    expect(reply.result[0].title).toBe('Stored');
  });

  it('replies ok:false with the validation message on a bad add', async () => {
    const reply = await call(CIT.ADD, [{ title: '' }]); // missing url/authors/title
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatch(/Invalid citation|required/i);
  });

  it('replies ok:false for an unknown op', async () => {
    const reply = await call('CIT_NOPE', []);
    expect(reply).toMatchObject({ ok: false });
    expect(reply.error).toMatch(/Unknown citation op/);
  });
});
