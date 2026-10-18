/**
 * @jest-environment jsdom
 *
 * Storage tests for the mind map database.
 *
 * `fake-indexeddb/auto` MUST be imported before the module under test so Dexie finds a global
 * indexedDB when it opens `AssistMindMaps`. jsdom has no BroadcastChannel, so the suite installs a
 * small one that delivers to the other channels on the same name — the real cross-tab semantics,
 * which is what onMapsChanged has to survive.
 */

import 'fake-indexeddb/auto';

const channels = [];

class TestBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    this.posted = [];
    channels.push(this);
  }

  postMessage(data) {
    this.posted.push(data);
    for (const other of channels) {
      if (other !== this && other.name === this.name) {
        for (const listener of other.listeners) {
          listener({ data });
        }
      }
    }
  }

  addEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }
}

global.BroadcastChannel = TestBroadcastChannel;

const {
  createMap,
  createNode,
  validateMap
} = require('../../../../src/features/mindMap/core/map-model.js');
const { addChild } = require('../../../../src/features/mindMap/core/map-ops.js');
const { branchView } = require('../../../../src/features/mindMap/core/branch-view.js');
const {
  INBOX_ID,
  TARGET_KEY,
  appendNode,
  deleteMap,
  getMap,
  getTargetMap,
  listMaps,
  onMapsChanged,
  saveMap
} = require('../../../../src/features/mindMap/mindmap-db.js');

/** A minimal valid map. */
function makeMap({ id = 'm1', title = 'Essay plan', source = null } = {}) {
  return { ...createMap({ id, title }), source };
}

/** A fixed clock, so every assertion on updatedAt is exact. */
const clockAt = value => () => value;

/** Leave the store as the next test expects to find it, through the surface the page uses. */
afterEach(async () => {
  for (const summary of await listMaps()) {
    await deleteMap(summary.id);
  }
});

describe('saveMap / getMap', () => {
  it('round-trips a map and stamps updatedAt from the clock it is given', async () => {
    const stored = await saveMap(makeMap(), { now: clockAt(1000) });

    expect(stored.updatedAt).toBe(1000);
    expect(await getMap('m1')).toEqual(stored);
  });

  it('denormalises source.url into the index without leaking it into the map', async () => {
    await saveMap(makeMap({ source: { url: 'https://example.test/a', title: 'A' } }), {
      now: clockAt(1)
    });

    // `listMaps` reads every record and hands the copy on, so the library can show where a map
    // came from without unpacking `source`.
    expect((await listMaps())[0].sourceUrl).toBe('https://example.test/a');

    expect(await getMap('m1')).not.toHaveProperty('sourceUrl');
  });

  // Nothing in the extension queries by source page yet, but the index is part of the schema every
  // student's database already has, and taking it out is a version bump rather than a tidy-up. So
  // it is held to working. The database is opened here the way a second connection would open it:
  // by name, with no schema of its own, reading the one the module under test declared.
  it('keeps source.url findable through the index the schema declares', async () => {
    await saveMap(makeMap({ source: { url: 'https://example.test/a', title: 'A' } }), {
      now: clockAt(1)
    });
    await saveMap(makeMap({ id: 'm2' }), { now: clockAt(2) });

    const Dexie = require('dexie').default;
    const stored = await new Dexie('AssistMindMaps').open();
    try {
      const maps = stored.table('maps');
      expect(maps.schema.indexes.map(index => index.name)).toContain('sourceUrl');
      const found = await maps.where('sourceUrl').equals('https://example.test/a').toArray();
      expect(found.map(row => row.id)).toEqual(['m1']);
    } finally {
      stored.close();
    }
  });

  it('returns null for a map that was never stored', async () => {
    expect(await getMap('nothing')).toBeNull();
  });

  it('refuses to persist an invalid map', async () => {
    const broken = { ...makeMap(), rootId: 'ghost' };

    await expect(saveMap(broken)).rejects.toMatchObject({ code: 'INVALID_MAP' });
    expect(await getMap('m1')).toBeNull();
  });

  it('refuses one branch of a map, so a view can never be stored over the whole map', async () => {
    const map = await saveMap(
      addChild(makeMap(), { parentId: 'm1-root', node: createNode({ id: 'arg', text: 'Argument' }) })
    );
    const branch = branchView(map, 'arg');

    // It is a VALID map carrying the same id, which is exactly why this has to be refused: storing
    // it would replace the student's whole map with one branch of it.
    expect(validateMap(branch)).toEqual([]);
    expect(branch.id).toBe(map.id);
    await expect(saveMap(branch)).rejects.toMatchObject({ code: 'NOT_A_WHOLE_MAP' });

    // And the map on disk is untouched.
    const stored = await getMap(map.id);
    expect(Object.keys(stored.nodes)).toEqual(Object.keys(map.nodes));
  });
});

describe('listMaps', () => {
  it('summarises every map, newest first', async () => {
    await saveMap(makeMap({ id: 'old', title: 'Older' }), { now: clockAt(100) });
    const withChild = addChild(makeMap({ id: 'new', title: 'Newer' }), {
      parentId: 'new-root',
      node: createNode({ id: 'c1', text: 'Point one' })
    });
    await saveMap({ ...withChild, source: { url: 'https://example.test/b' } }, { now: clockAt(200) });

    expect(await listMaps()).toEqual([
      { id: 'new', title: 'Newer', updatedAt: 200, nodeCount: 2, sourceUrl: 'https://example.test/b' },
      { id: 'old', title: 'Older', updatedAt: 100, nodeCount: 1, sourceUrl: null }
    ]);
  });

  it('is empty when nothing is stored', async () => {
    expect(await listMaps()).toEqual([]);
  });
});

describe('deleteMap', () => {
  it('removes the map', async () => {
    await saveMap(makeMap(), { now: clockAt(1) });

    await deleteMap('m1', { now: clockAt(2) });

    expect(await getMap('m1')).toBeNull();
  });
});

describe('appendNode', () => {
  it('appends under the root and stamps updatedAt', async () => {
    await saveMap(makeMap(), { now: clockAt(1) });

    const stored = await appendNode('m1', createNode({ id: 'k1', text: 'A quote' }), {
      now: clockAt(2)
    });

    expect(stored.updatedAt).toBe(2);
    expect(stored.nodes[stored.rootId].children).toEqual(['k1']);
    expect((await getMap('m1')).nodes.k1.text).toBe('A quote');
  });

  it('keeps both nodes when two captures land at the same moment', async () => {
    // The failure this guards: read-modify-write across an await, where the second write is built
    // on the map as it was before the first and silently drops it. Both captures report success,
    // and the student loses one.
    await saveMap(makeMap(), { now: clockAt(1) });

    await Promise.all([
      appendNode('m1', createNode({ id: 'first', text: 'First' }), { now: clockAt(2) }),
      appendNode('m1', createNode({ id: 'second', text: 'Second' }), { now: clockAt(3) })
    ]);

    const map = await getMap('m1');
    expect(map.nodes[map.rootId].children.sort()).toEqual(['first', 'second']);
  });

  it('refuses a map that is not there', async () => {
    await expect(appendNode('ghost', createNode({ id: 'k1', text: 'A' }))).rejects.toMatchObject({
      code: 'NO_SUCH_MAP'
    });
  });
});

/**
 * The inbox is where a capture lands when the student has chosen no map of their own, so it is
 * asked for through `getTargetMap` — the one thing a capture ever calls.
 */
describe('the inbox', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  it('is created on demand', async () => {
    const inbox = await getTargetMap({ now: clockAt(5) });

    expect(inbox.id).toBe(INBOX_ID);
    expect(inbox.title).toBe('Inbox');
    expect(inbox.updatedAt).toBe(5);
  });

  it('is created once when two captures ask for it at the same moment', async () => {
    const [one, two] = await Promise.all([
      getTargetMap({ now: clockAt(5) }),
      getTargetMap({ now: clockAt(6) })
    ]);

    expect(one.rootId).toBe(two.rootId);
    expect(await listMaps()).toHaveLength(1);
  });

  it('comes back as it was stored rather than as a fresh one', async () => {
    const inbox = await getTargetMap({ now: clockAt(5) });
    const filled = addChild(inbox, {
      parentId: inbox.rootId,
      node: createNode({ id: 'k1', text: 'A quote' })
    });
    await saveMap(filled, { now: clockAt(6) });

    const again = await getTargetMap({ now: clockAt(7) });
    expect(Object.keys(again.nodes)).toContain('k1');
    expect(again.updatedAt).toBe(6);
  });
});

describe('getTargetMap', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  it('falls back to the inbox when no target is set', async () => {
    expect((await getTargetMap({ now: clockAt(1) })).id).toBe(INBOX_ID);
  });

  it('returns the chosen map', async () => {
    await saveMap(makeMap({ id: 'chosen', title: 'Chosen' }), { now: clockAt(1) });
    chrome.storage.local.get.mockResolvedValue({ [TARGET_KEY]: 'chosen' });

    expect((await getTargetMap({ now: clockAt(2) })).id).toBe('chosen');
  });

  it('falls back to the inbox when the chosen map has been deleted', async () => {
    chrome.storage.local.get.mockResolvedValue({ [TARGET_KEY]: 'gone' });

    expect((await getTargetMap({ now: clockAt(3) })).id).toBe(INBOX_ID);
  });
});

describe('onMapsChanged', () => {
  it('announces a save and a delete to the other tabs', async () => {
    const other = new TestBroadcastChannel('assist-mindmap');
    const heard = [];
    other.addEventListener('message', event => heard.push(event.data));

    await saveMap(makeMap(), { now: clockAt(11) });
    await deleteMap('m1', { now: clockAt(12) });

    expect(heard).toEqual([
      { mapId: 'm1', updatedAt: 11 },
      { mapId: 'm1', updatedAt: 12 }
    ]);
  });

  it('delivers a save made in another tab, and stops on unsubscribe', async () => {
    const heard = [];
    const unsubscribe = onMapsChanged(change => heard.push(change));
    const other = new TestBroadcastChannel('assist-mindmap');

    other.postMessage({ mapId: 'm1', updatedAt: 21 });
    unsubscribe();
    other.postMessage({ mapId: 'm1', updatedAt: 22 });

    expect(heard).toEqual([{ mapId: 'm1', updatedAt: 21 }]);
  });
});
