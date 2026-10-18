/**
 * Citation store tests — initial load, the CRUD intents, subscriber notification, and the
 * in-memory project/text view filter.
 */

import 'fake-indexeddb/auto';
import {
  CitationStorage,
  ProjectStorage,
} from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';
import { createCitationStore } from '../../../src/features/citations/citation-store.js';
import { installCitationRpcBridge } from './helpers/rpc-bridge.js';

let store = null;

// The store now reads/writes through the RPC client; route it to the real (fake-indexeddb) storage,
// simulating the service-worker → offscreen relay. Re-installed each test (setup.js clears mocks).
beforeEach(() => {
  installCitationRpcBridge();
});

afterEach(async () => {
  if (store) {
    store.destroy();
    store = null;
  }
  await clearCitations();
  for (const project of await ProjectStorage.getAll()) {
    await ProjectStorage.delete(project.id);
  }
});

function makeData(overrides = {}) {
  return {
    title: 'T',
    url: `https://example.test/${Math.random().toString(36).slice(2)}`,
    authors: ['Smith, J.'],
    ...overrides,
  };
}

describe('createCitationStore', () => {
  it('init loads existing citations and projects', async () => {
    await CitationStorage.add(makeData({ title: 'Pre-existing' }));

    store = createCitationStore();
    await store.init();

    const s = store.getState();
    expect(s.citations).toHaveLength(1);
    expect(s.citations[0].title).toBe('Pre-existing');
    expect(s.loading).toBe(false);
  });

  it('add() persists, updates state, and notifies subscribers', async () => {
    store = createCitationStore();
    await store.init();

    const seen = [];
    store.subscribe(s => seen.push(s.citations.length));

    await store.add(makeData({ title: 'New' }));

    expect(store.getState().citations.map(c => c.title)).toContain('New');
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('update() and remove() reflect in state', async () => {
    store = createCitationStore();
    await store.init();

    const id = await store.add(makeData({ title: 'Editable' }));
    await store.update(id, { title: 'Edited' });
    expect(store.getState().citations[0].title).toBe('Edited');

    await store.remove(id);
    expect(store.getState().citations).toHaveLength(0);
  });

  it('setFilter + getVisibleCitations filters the loaded list', async () => {
    store = createCitationStore();
    await store.init();
    await store.add(makeData({ title: 'Working Memory' }));
    await store.add(makeData({ title: 'Unrelated' }));

    store.setFilter('memory');
    const vis = store.getVisibleCitations();
    expect(vis).toHaveLength(1);
    expect(vis[0].title).toBe('Working Memory');
  });

  it('setActiveProject filters by project', async () => {
    store = createCitationStore();
    await store.init();
    await store.add(makeData({ title: 'P1', projectId: 'proj-1' }));
    await store.add(makeData({ title: 'P2', projectId: 'proj-2' }));

    store.setActiveProject('proj-1');
    expect(store.getVisibleCitations().map(c => c.title)).toEqual(['P1']);
  });

  it('the text filter also matches a tag (so a sidebar tag chip can filter)', async () => {
    store = createCitationStore();
    await store.init();
    await store.add(makeData({ title: 'Has tag', tags: ['neuroscience'] }));
    await store.add(makeData({ title: 'No tag', tags: [] }));

    store.setFilter('neuroscience');
    const vis = store.getVisibleCitations();
    expect(vis.map(c => c.title)).toEqual(['Has tag']);
  });

  it('subscribe returns a working unsubscribe', async () => {
    store = createCitationStore();
    await store.init();

    let count = 0;
    const unsub = store.subscribe(() => {
      count += 1;
    });
    store.setStyle('apa7');
    const after = count;
    unsub();
    store.setStyle('mla9');
    expect(count).toBe(after);
  });
});

describe('refresh()', () => {
  it('an awaited refresh reflects data written after it was called, even mid-refresh', async () => {
    store = createCitationStore();
    await store.init();

    // Hold the in-flight refresh's read open after it has read the table.
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    const realGetAll = CitationStorage.getAll.bind(CitationStorage);
    jest.spyOn(CitationStorage, 'getAll').mockImplementationOnce(async (...args) => {
      const rows = await realGetAll(...args);
      await gate;
      return rows;
    });

    const first = store.refresh();
    await CitationStorage.add(makeData({ title: 'Written later' }));
    const second = store.refresh();
    release();
    await second;

    expect(store.getState().citations.map(c => c.title)).toContain('Written later');
    await first;
  });
});

describe('collection (project) intents', () => {
  it('createProject persists a collection and puts it in state', async () => {
    store = createCitationStore();
    await store.init();

    const id = await store.createProject('Essay 1', 'Memory and rehearsal');

    const projects = store.getState().projects;
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Essay 1');
    expect(projects[0].description).toBe('Memory and rehearsal');
    expect(String(projects[0].id)).toBe(String(id));
  });

  it('updateProject renames a collection', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.createProject('Draft name');

    await store.updateProject(id, { name: 'Final name' });

    expect(store.getState().projects[0].name).toBe('Final name');
  });

  it('assignToProject files a citation, and an empty choice unfiles it', async () => {
    store = createCitationStore();
    await store.init();
    const projectId = await store.createProject('Essay 1');
    const citationId = await store.add(makeData({ title: 'Filed later' }));

    await store.assignToProject(citationId, projectId);
    expect(String(store.getState().citations[0].projectId)).toBe(String(projectId));

    await store.assignToProject(citationId, '');
    expect(store.getState().citations[0].projectId).toBeNull();
  });

  it('deleteProject keeps the citations, unfiles them, and reports what it touched', async () => {
    store = createCitationStore();
    await store.init();
    const projectId = await store.createProject('Doomed');
    const a = await store.add(makeData({ title: 'A' }));
    const b = await store.add(makeData({ title: 'B' }));
    await store.assignToProject(a, projectId);
    await store.assignToProject(b, projectId);

    const result = await store.deleteProject(projectId);

    expect(store.getState().projects).toHaveLength(0);
    expect(store.getState().citations).toHaveLength(2);
    expect(result.unfiled).toBe(2);
    expect(result.citationIds.map(String).sort()).toEqual([a, b].map(String).sort());
    expect(result.project.name).toBe('Doomed');
  });

  it('deleteProject clears the filter when the deleted collection was the active one', async () => {
    store = createCitationStore();
    await store.init();
    const projectId = await store.createProject('Active');
    store.setActiveProject(projectId);

    await store.deleteProject(projectId);

    expect(store.getState().activeProjectId).toBeNull();
  });

  it('refileCitations puts an undone deletion back together', async () => {
    store = createCitationStore();
    await store.init();
    const projectId = await store.createProject('Doomed');
    const a = await store.add(makeData({ title: 'A' }));
    await store.assignToProject(a, projectId);

    const { citationIds, project } = await store.deleteProject(projectId);
    const restoredId = await store.createProject(project.name, project.description);
    await store.refileCitations(citationIds, restoredId);

    store.setActiveProject(restoredId);
    expect(store.getVisibleCitations().map(c => c.title)).toEqual(['A']);
  });

  it('matches the active collection whether the id is stored as text or a number', async () => {
    store = createCitationStore();
    await store.init();
    await store.add(makeData({ title: 'Numeric', projectId: 7 }));

    store.setActiveProject('7');
    expect(store.getVisibleCitations().map(c => c.title)).toEqual(['Numeric']);
  });
});

describe('createCitationStore — the trash', () => {
  it('init() loads the trash alongside the library', async () => {
    const id = await CitationStorage.add(makeData({ title: 'Gone' }));
    await CitationStorage.add(makeData({ title: 'Here' }));
    await CitationStorage.delete(id);

    store = createCitationStore();
    await store.init();

    const s = store.getState();
    expect(s.citations.map(c => c.title)).toEqual(['Here']);
    expect(s.trashed.map(c => c.title)).toEqual(['Gone']);
  });

  it('remove() moves the citation into the trash rather than destroying it', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData({ title: 'Second thoughts' }));

    await store.remove(id);

    const s = store.getState();
    expect(s.citations).toHaveLength(0);
    expect(s.trashed.map(c => c.title)).toEqual(['Second thoughts']);
  });

  it('restore() brings a trashed citation back and notifies subscribers', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData({ title: 'Back again' }));
    await store.remove(id);

    const seen = [];
    store.subscribe(s => seen.push(s.citations.length));
    await store.restore(id);

    const s = store.getState();
    expect(s.citations.map(c => c.title)).toEqual(['Back again']);
    expect(s.trashed).toHaveLength(0);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('restore() reports whether the citation actually came back', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData({ title: 'Recoverable' }));
    await store.remove(id);

    expect(await store.restore(id)).toBe(true);

    // Gone for good — restoring it can only fail, and the caller has to be able to say so.
    await store.remove(id);
    await store.purge(id);
    expect(await store.restore(id)).toBe(false);
  });

  it('purge() removes one citation from the trash for good', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData());
    await store.remove(id);

    await store.purge(id);

    expect(store.getState().trashed).toHaveLength(0);
    await store.restore(id);
    expect(store.getState().citations).toHaveLength(0);
  });

  it('emptyTrash() clears the trash and leaves the library alone', async () => {
    store = createCitationStore();
    await store.init();
    const a = await store.add(makeData());
    await store.add(makeData({ title: 'Keeper' }));
    await store.remove(a);

    const purged = await store.emptyTrash();

    expect(purged).toBe(1);
    expect(store.getState().trashed).toHaveLength(0);
    expect(store.getState().citations.map(c => c.title)).toEqual(['Keeper']);
  });

  it('purgeExpiredTrash() leaves a just-removed citation alone', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData());
    await store.remove(id);

    const purged = await store.purgeExpiredTrash();

    expect(purged).toBe(0);
    expect(store.getState().trashed).toHaveLength(1);
  });

  it('setView() switches between the library and the trash, and emits', async () => {
    store = createCitationStore();
    await store.init();
    expect(store.getState().view).toBe('library');

    const seen = [];
    store.subscribe(s => seen.push(s.view));
    store.setView('trash');

    expect(store.getState().view).toBe('trash');
    expect(seen).toEqual(['trash']);
  });

  it('the trash never leaks into the filtered library list', async () => {
    store = createCitationStore();
    await store.init();
    const id = await store.add(makeData({ title: 'Findable' }));
    await store.remove(id);

    store.setFilter('Findable');

    expect(store.getVisibleCitations()).toHaveLength(0);
  });
});
