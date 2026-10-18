/**
 * @jest-environment jsdom
 *
 * Service-worker mind map handlers.
 *
 * `fake-indexeddb/auto` comes first so Dexie has a database to open, and jsdom's missing
 * BroadcastChannel is stubbed because every save announces itself to the other tabs.
 */

import 'fake-indexeddb/auto';

class TestBroadcastChannel {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
}

global.BroadcastChannel = TestBroadcastChannel;

const { handleMindMapMessage } = require('../../../src/background/mindmap-handlers.js');
const {
  deleteMap,
  getMap,
  listMaps,
  saveMap
} = require('../../../src/features/mindMap/mindmap-db.js');
const { createMap } = require('../../../src/features/mindMap/core/map-model.js');

const EDITOR_URL = 'chrome-extension://test-id/src/pages/mind-map/mindmap.html';

/** Deterministic ids, `id1`, `id2`, … */
function idSource() {
  let seen = 0;
  return () => `id${++seen}`;
}

/** Options every handler call gets, so ids and timestamps are fixed. */
function options() {
  return { ids: idSource(), now: () => 1000 };
}

/**
 * Dispatch a message and resolve with the handler's response.
 * @returns {Promise<Object>}
 */
function send(message, opts = options()) {
  return new Promise((resolve, reject) => {
    const handled = handleMindMapMessage(message, {}, resolve, opts);
    if (!handled) {
      reject(new Error(`handleMindMapMessage refused ${message.type}`));
    }
  });
}

beforeEach(() => {
  // jest resetMocks wipes the implementations tests/setup.js gave chrome.*, so they are restored
  // here rather than assumed.
  chrome.runtime.getURL.mockImplementation(path => `chrome-extension://test-id/${path}`);
  chrome.tabs.query.mockResolvedValue([]);
  chrome.tabs.create = jest.fn().mockResolvedValue({ id: 42 });
  chrome.tabs.update = jest.fn().mockResolvedValue({ id: 7 });
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
});

afterEach(async () => {
  for (const summary of await listMaps()) {
    await deleteMap(summary.id);
  }
});

describe('handleMindMapMessage', () => {
  it('leaves a message it does not own alone', () => {
    const sendResponse = jest.fn();
    expect(handleMindMapMessage({ type: 'OPEN_CITATION_GUIDE' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('OPEN_MIND_MAP', () => {
  it('opens the editor in a new tab', async () => {
    expect(await send({ type: 'OPEN_MIND_MAP' })).toEqual({ success: true, tabId: 42 });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: EDITOR_URL });
  });

  it('opens one map by id', async () => {
    await send({ type: 'OPEN_MIND_MAP', mapId: 'm 1' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${EDITOR_URL}?map=m%201` });
  });

  it('reuses the tab already showing the editor, navigating it only when given a map', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 7 }]);

    expect(await send({ type: 'OPEN_MIND_MAP', mapId: 'm1' })).toEqual({ success: true, tabId: 7 });
    expect(chrome.tabs.query).toHaveBeenCalledWith({ url: `${EDITOR_URL}*` });
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, {
      active: true,
      url: `${EDITOR_URL}?map=m1`
    });

    await send({ type: 'OPEN_MIND_MAP' });
    expect(chrome.tabs.update).toHaveBeenLastCalledWith(7, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe('MINDMAP_ADD_NODE', () => {
  it('appends a captured highlight to the inbox when no target is chosen', async () => {
    const response = await send({
      type: 'MINDMAP_ADD_NODE',
      text: 'Working memory is limited',
      quote: 'Working memory is limited',
      url: 'https://example.test/page',
      title: 'Cognitive load'
    });

    expect(response).toEqual({
      success: true,
      mapId: 'inbox',
      mapTitle: 'Inbox',
      nodeId: 'id1'
    });

    const inbox = await getMap('inbox');
    expect(inbox.nodes[inbox.rootId].children).toEqual(['id1']);
    expect(inbox.nodes.id1).toMatchObject({
      text: 'Working memory is limited',
      source: {
        url: 'https://example.test/page',
        quote: 'Working memory is limited',
        title: 'Cognitive load'
      }
    });
    expect(inbox.updatedAt).toBe(1000);
  });

  it('appends to the map named in the message', async () => {
    await saveMap(createMap({ id: 'essay', title: 'Essay' }), { now: () => 1 });

    const response = await send({ type: 'MINDMAP_ADD_NODE', text: 'A point', mapId: 'essay' });

    expect(response).toEqual({ success: true, mapId: 'essay', mapTitle: 'Essay', nodeId: 'id1' });
    expect((await getMap('essay')).nodes.id1.source).toBeNull();
  });

  it('appends to the chosen target map', async () => {
    await saveMap(createMap({ id: 'chosen', title: 'Chosen' }), { now: () => 1 });
    chrome.storage.local.get.mockResolvedValue({ mindMapTarget: 'chosen' });

    expect(await send({ type: 'MINDMAP_ADD_NODE', text: 'A point' })).toEqual({
      success: true,
      mapId: 'chosen',
      mapTitle: 'Chosen',
      nodeId: 'id1'
    });
  });

  it('keeps both captures when two arrive at once', async () => {
    // Two highlights sent before either save lands. Whichever order the writes settle in, the
    // student must end up with both branches, not one that quietly overwrote the other.
    const shared = options();

    const [first, second] = await Promise.all([
      send({ type: 'MINDMAP_ADD_NODE', text: 'First point' }, shared),
      send({ type: 'MINDMAP_ADD_NODE', text: 'Second point' }, shared)
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const inbox = await getMap('inbox');
    expect(inbox.nodes[inbox.rootId].children.slice().sort()).toEqual(['id1', 'id2']);
  });

  it('answers with the reason when the map is gone', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await send({ type: 'MINDMAP_ADD_NODE', text: 'A point', mapId: 'ghost' });

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/ghost/);
  });
});

describe('MINDMAP_MAP_PAGE', () => {
  /**
   * The outline a page's headings became, as nested texts: h1 and h2 are branches of the root, h3
   * hangs off the heading above it, and a page with no usable headings still gets somewhere to
   * write. Read back off the stored map, because that is where a student meets it.
   *
   * @param {Array<{level: number, text: string}>} headings
   * @returns {Promise<Array<{text: string, children: Array}>>}
   */
  async function outlineOf(headings) {
    await send({
      type: 'MINDMAP_MAP_PAGE',
      url: 'https://example.test/p',
      title: 'Page',
      headings
    });
    const map = await getMap('id1');
    const shape = id =>
      map.nodes[id].children.map(childId => ({
        text: map.nodes[childId].text,
        children: shape(childId)
      }));
    return shape(map.rootId);
  }

  it('makes h1 and h2 branches and nests h3 under the heading above it', async () => {
    expect(
      await outlineOf([
        { level: 1, text: 'Essay' },
        { level: 2, text: 'Method' },
        { level: 3, text: 'Sampling' },
        { level: 3, text: 'Analysis' },
        { level: 2, text: 'Results' }
      ])
    ).toEqual([
      { text: 'Essay', children: [] },
      {
        text: 'Method',
        children: [
          { text: 'Sampling', children: [] },
          { text: 'Analysis', children: [] }
        ]
      },
      { text: 'Results', children: [] }
    ]);
  });

  it('keeps an h3 that has nothing above it as a branch of its own', async () => {
    expect(
      await outlineOf([
        { level: 3, text: 'Orphan' },
        { level: 3, text: 'Also orphan' }
      ])
    ).toEqual([
      { text: 'Orphan', children: [] },
      { text: 'Also orphan', children: [] }
    ]);
  });

  it('gives a page with nothing but blank headings one place to write', async () => {
    expect(await outlineOf([{ level: 2, text: '   ' }])).toEqual([
      { text: 'Notes', children: [] }
    ]);
  });

  it('trims heading text and stops at 200 nodes', async () => {
    const many = Array.from({ length: 400 }, (unused, index) => ({
      level: 2,
      text: `  H${index}  `
    }));

    const outline = await outlineOf(many);

    expect(outline).toHaveLength(200);
    expect(outline[0].text).toBe('H0');
  });

  it('builds the same outline from the same page every time', async () => {
    const headings = [
      { level: 1, text: 'A' },
      { level: 3, text: 'B' }
    ];

    expect(await outlineOf(headings)).toEqual(await outlineOf(headings));
  });

  it('builds a map from the page headings and opens it', async () => {
    const response = await send({
      type: 'MINDMAP_MAP_PAGE',
      url: 'https://example.test/lecture',
      title: 'Lecture 4',
      text: 'Body text',
      headings: [
        { level: 2, text: 'Definitions' },
        { level: 3, text: 'Load' }
      ]
    });

    expect(response).toEqual({ success: true, mapId: 'id1', tabId: 42 });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${EDITOR_URL}?map=id1&from=page` });

    const map = await getMap('id1');
    expect(map.title).toBe('Lecture 4');
    expect(map.nodes[map.rootId].text).toBe('Lecture 4');
    expect(map.nodes[map.rootId].children).toEqual(['id2']);
    expect(map.nodes.id2).toMatchObject({ text: 'Definitions', children: ['id3'] });
    expect(map.nodes.id3.text).toBe('Load');
    expect(map.source).toEqual({
      url: 'https://example.test/lecture',
      title: 'Lecture 4',
      text: 'Body text',
      headings: [
        { level: 2, text: 'Definitions' },
        { level: 3, text: 'Load' }
      ]
    });
  });

  it('caps the stored page text at 12000 characters', async () => {
    await send({
      type: 'MINDMAP_MAP_PAGE',
      url: 'https://example.test/long',
      title: 'Long',
      text: 'x'.repeat(20000),
      headings: []
    });

    expect((await getMap('id1')).source.text).toHaveLength(12000);
  });

  it('falls back to the page URL when the page has no title', async () => {
    await send({ type: 'MINDMAP_MAP_PAGE', url: 'https://example.test/untitled' });

    const map = await getMap('id1');
    expect(map.title).toBe('https://example.test/untitled');
    expect(map.nodes[map.nodes[map.rootId].children[0]].text).toBe('Notes');
  });
});

describe('MINDMAP_LIST', () => {
  it('answers with a summary of every map, newest first', async () => {
    await saveMap(createMap({ id: 'a', title: 'A' }), { now: () => 10 });
    await saveMap(createMap({ id: 'b', title: 'B' }), { now: () => 20 });

    expect(await send({ type: 'MINDMAP_LIST' })).toEqual({
      success: true,
      maps: [
        { id: 'b', title: 'B', updatedAt: 20, nodeCount: 1, sourceUrl: null },
        { id: 'a', title: 'A', updatedAt: 10, nodeCount: 1, sourceUrl: null }
      ]
    });
  });
});
