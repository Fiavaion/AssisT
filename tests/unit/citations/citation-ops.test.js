/**
 * Unit tests for the shared citation op dispatcher (the single op→method contract used by both the
 * offscreen handler and the test RPC bridge).
 */

import { createCitationDispatcher } from '../../../src/features/citations/citation-ops.js';
import { CIT } from '../../../src/config/citation-messages.js';

function fakes() {
  const storage = {
    add: jest.fn(async () => 'id1'),
    getAll: jest.fn(async () => [{ id: 'id1' }]),
    update: jest.fn(async () => undefined),
  };
  const projects = {
    create: jest.fn(async () => 'p1'),
    getAll: jest.fn(async () => []),
  };
  const migration = {
    getStatus: jest.fn(async () => ({ done: false, mode: null })),
    startFresh: jest.fn(async () => ({ mode: 'fresh' })),
    bestEffortImport: jest.fn(async () => ({ mode: 'import' })),
  };
  return { storage, projects, migration };
}

describe('createCitationDispatcher', () => {
  it('routes a storage op with positional args and returns its result', async () => {
    const { storage, projects, migration } = fakes();
    const dispatch = createCitationDispatcher({ storage, projects, migration });

    const id = await dispatch(CIT.ADD, [{ title: 'T' }]);
    expect(id).toBe('id1');
    expect(storage.add).toHaveBeenCalledWith({ title: 'T' });
  });

  it('routes update with two positional args', async () => {
    const { storage, projects, migration } = fakes();
    const dispatch = createCitationDispatcher({ storage, projects, migration });
    await dispatch(CIT.UPDATE, ['7', { title: 'New' }]);
    expect(storage.update).toHaveBeenCalledWith('7', { title: 'New' });
  });

  it('routes a project op', async () => {
    const { storage, projects, migration } = fakes();
    const dispatch = createCitationDispatcher({ storage, projects, migration });
    const pid = await dispatch(CIT.PROJECT_CREATE, ['Proj', 'd']);
    expect(pid).toBe('p1');
    expect(projects.create).toHaveBeenCalledWith('Proj', 'd');
  });

  it('routes the migration ops', async () => {
    const { storage, projects, migration } = fakes();
    const dispatch = createCitationDispatcher({ storage, projects, migration });
    expect(await dispatch(CIT.MIGRATE_START_FRESH, [])).toEqual({ mode: 'fresh' });
    expect(migration.startFresh).toHaveBeenCalled();
  });

  it('rejects an unknown op', async () => {
    const { storage, projects, migration } = fakes();
    const dispatch = createCitationDispatcher({ storage, projects, migration });
    await expect(dispatch('CIT_BOGUS', [])).rejects.toThrow(/Unknown citation op: CIT_BOGUS/);
  });

  it('propagates a storage rejection', async () => {
    const { projects, migration } = fakes();
    const storage = { getAll: jest.fn(async () => { throw new Error('db down'); }) };
    const dispatch = createCitationDispatcher({ storage, projects, migration });
    await expect(dispatch(CIT.GET_ALL, [{}])).rejects.toThrow('db down');
  });
});

describe('createCitationDispatcher — trash ops', () => {
  function trashFakes() {
    return {
      storage: {
        delete: jest.fn(async () => undefined),
        getTrashed: jest.fn(async () => [{ id: '9', deletedAt: '2026-09-01T00:00:00.000Z' }]),
        restore: jest.fn(async () => true),
        purge: jest.fn(async () => undefined),
        emptyTrash: jest.fn(async () => 3),
        purgeExpiredTrash: jest.fn(async () => 1),
      },
      projects: {},
      migration: {},
    };
  }

  it('routes every trash operation to its storage method', async () => {
    const deps = trashFakes();
    const dispatch = createCitationDispatcher(deps);

    expect(await dispatch(CIT.GET_TRASHED, [])).toEqual([
      { id: '9', deletedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(await dispatch(CIT.RESTORE, ['9'])).toBe(true);
    expect(deps.storage.restore).toHaveBeenCalledWith('9');

    await dispatch(CIT.PURGE, ['9']);
    expect(deps.storage.purge).toHaveBeenCalledWith('9');

    expect(await dispatch(CIT.EMPTY_TRASH, [])).toBe(3);
    expect(await dispatch(CIT.PURGE_EXPIRED, [])).toBe(1);
  });

  it('DELETE is the soft delete — it routes to storage.delete, not purge', async () => {
    const deps = trashFakes();
    const dispatch = createCitationDispatcher(deps);

    await dispatch(CIT.DELETE, ['9']);

    expect(deps.storage.delete).toHaveBeenCalledWith('9');
    expect(deps.storage.purge).not.toHaveBeenCalled();
  });
});
