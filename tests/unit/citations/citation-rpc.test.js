/**
 * Unit tests for the citation RPC client.
 *
 * The RPC client presents the SAME async interface as CitationStorage / ProjectStorage but routes
 * every call through chrome.runtime.sendMessage → service worker → offscreen document. These tests
 * assert the wire envelope (type/op/args), the unwrapping of { ok, result, error } replies, and the
 * error behaviour — without any real Dexie or offscreen document.
 */

import {
  CitationStorageRPC,
  ProjectStorageRPC,
  CitationMigrationRPC,
} from '../../../src/features/citations/citation-rpc.js';
import { CITATION_DB_OP, CIT } from '../../../src/config/citation-messages.js';

/** Make chrome.runtime.sendMessage resolve with a fixed reply and capture the sent envelope. */
function mockReply(reply) {
  const sent = [];
  chrome.runtime.sendMessage.mockImplementation(async msg => {
    sent.push(msg);
    return reply;
  });
  return sent;
}

describe('CitationStorageRPC — wire envelope', () => {
  it('sends CITATION_DB_OP with the op and positional args, and unwraps result', async () => {
    const sent = mockReply({ ok: true, result: 'new-id-42' });

    const id = await CitationStorageRPC.add({ title: 'T', url: 'https://x', authors: ['A'] });

    expect(id).toBe('new-id-42');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: CITATION_DB_OP,
      op: CIT.ADD,
      args: [{ title: 'T', url: 'https://x', authors: ['A'] }],
    });
  });

  it('passes multiple args positionally (update id + updates)', async () => {
    const sent = mockReply({ ok: true, result: undefined });

    await CitationStorageRPC.update('7', { title: 'New' });

    expect(sent[0].op).toBe(CIT.UPDATE);
    expect(sent[0].args).toEqual(['7', { title: 'New' }]);
  });

  it('getAll with no options sends an empty options object', async () => {
    const sent = mockReply({ ok: true, result: [] });

    await CitationStorageRPC.getAll();

    expect(sent[0].op).toBe(CIT.GET_ALL);
    expect(sent[0].args).toEqual([{}]);
  });

  it('returns the result array for reads', async () => {
    mockReply({ ok: true, result: [{ id: '1' }, { id: '2' }] });
    const rows = await CitationStorageRPC.getByURL('https://x');
    expect(rows).toEqual([{ id: '1' }, { id: '2' }]);
  });
});

describe('CitationStorageRPC — error handling', () => {
  it('throws with the offscreen error message when ok is false', async () => {
    mockReply({ ok: false, error: 'Invalid citation: title is required' });
    await expect(CitationStorageRPC.add({})).rejects.toThrow(
      'Invalid citation: title is required'
    );
  });

  it('throws a generic message when the reply is malformed (no ok)', async () => {
    mockReply(undefined);
    await expect(CitationStorageRPC.getAll()).rejects.toThrow(/Citation RPC failed: CIT_GET_ALL/);
  });

  it('propagates a rejected sendMessage (no offscreen / channel closed)', async () => {
    chrome.runtime.sendMessage.mockRejectedValue(new Error('Could not establish connection'));
    await expect(CitationStorageRPC.getAll()).rejects.toThrow('Could not establish connection');
  });

  it('rejects with a timeout when the offscreen reply never settles', async () => {
    jest.useFakeTimers();
    // A never-settling reply simulates an idle SW / missing offscreen document.
    chrome.runtime.sendMessage.mockReturnValue(new Promise(() => {}));
    const pending = CitationStorageRPC.getAll();
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await jest.advanceTimersByTimeAsync(10000);
    await assertion;
    jest.useRealTimers();
  });
});

describe('ProjectStorageRPC — wire envelope', () => {
  it('maps project ops to the PROJECT_* codes', async () => {
    const sent = mockReply({ ok: true, result: 'p1' });
    await ProjectStorageRPC.create('My Project', 'desc');
    expect(sent[0]).toEqual({
      type: CITATION_DB_OP,
      op: CIT.PROJECT_CREATE,
      args: ['My Project', 'desc'],
    });
  });

  it('create defaults description to empty string', async () => {
    const sent = mockReply({ ok: true, result: 'p1' });
    await ProjectStorageRPC.create('Solo');
    expect(sent[0].args).toEqual(['Solo', '']);
  });

  it('getAll projects sends no args', async () => {
    const sent = mockReply({ ok: true, result: [] });
    await ProjectStorageRPC.getAll();
    expect(sent[0].op).toBe(CIT.PROJECT_GET_ALL);
    expect(sent[0].args).toEqual([]);
  });
});

describe('CitationMigrationRPC', () => {
  it('maps the migration ops and unwraps results', async () => {
    const sent = mockReply({ ok: true, result: { done: false, mode: null } });
    const status = await CitationMigrationRPC.getStatus();
    expect(status).toEqual({ done: false, mode: null });
    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.MIGRATE_GET_STATUS, args: [] });
  });

  it('startFresh and bestEffortImport send the right ops', async () => {
    const sent = mockReply({ ok: true, result: { mode: 'import', imported: 2, skipped: 1 } });
    await CitationMigrationRPC.startFresh();
    const r = await CitationMigrationRPC.bestEffortImport();
    expect(sent[0].op).toBe(CIT.MIGRATE_START_FRESH);
    expect(sent[1].op).toBe(CIT.MIGRATE_BEST_EFFORT);
    expect(r).toEqual({ mode: 'import', imported: 2, skipped: 1 });
  });
});

describe('CitationStorageRPC — trash operations', () => {
  it('getTrashed sends CIT_GET_TRASHED with no args and returns the rows', async () => {
    const sent = mockReply({ ok: true, result: [{ id: '1', deletedAt: '2026-09-01T00:00:00Z' }] });

    const rows = await CitationStorageRPC.getTrashed();

    expect(rows).toEqual([{ id: '1', deletedAt: '2026-09-01T00:00:00Z' }]);
    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.GET_TRASHED, args: [] });
  });

  it('restore sends CIT_RESTORE with the id', async () => {
    const sent = mockReply({ ok: true, result: true });

    await CitationStorageRPC.restore('7');

    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.RESTORE, args: ['7'] });
  });

  it('purge sends CIT_PURGE with the id', async () => {
    const sent = mockReply({ ok: true, result: undefined });

    await CitationStorageRPC.purge('7');

    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.PURGE, args: ['7'] });
  });

  it('emptyTrash sends CIT_EMPTY_TRASH and returns the purged count', async () => {
    const sent = mockReply({ ok: true, result: 4 });

    expect(await CitationStorageRPC.emptyTrash()).toBe(4);
    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.EMPTY_TRASH, args: [] });
  });

  it('purgeExpired sends CIT_PURGE_EXPIRED and returns the purged count', async () => {
    const sent = mockReply({ ok: true, result: 2 });

    expect(await CitationStorageRPC.purgeExpired()).toBe(2);
    expect(sent[0]).toEqual({ type: CITATION_DB_OP, op: CIT.PURGE_EXPIRED, args: [] });
  });

  it('surfaces a failed restore as an error the caller can show', async () => {
    mockReply({ ok: false, error: 'db closed' });

    await expect(CitationStorageRPC.restore('7')).rejects.toThrow('db closed');
  });
});
