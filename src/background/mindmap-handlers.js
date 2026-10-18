/**
 * Mind map message handlers for the service worker.
 *
 * Maps are free-standing, so a capture made on any page has to reach the one database on the
 * extension origin. Content scripts never open it: they send one of these messages and the worker
 * writes. The message names are string literals on purpose — the reachability gate in
 * tests/unit/architecture reads them as text, and a constants object would hide them.
 */

import { createMap, createNode } from '../features/mindMap/core/map-model.js';
import { addChild } from '../features/mindMap/core/map-ops.js';
import { appendNode, getTargetMap, listMaps, saveMap } from '../features/mindMap/mindmap-db.js';

/** The editor page, opened in its own tab. */
const EDITOR_PAGE = 'src/pages/mind-map/mindmap.html';

/** Page text kept on source.text for the editor's AI panel to work from. */
const MAX_SOURCE_TEXT = 12000;

/** A heading list long enough to overwhelm the outline is cut here. */
const MAX_OUTLINE_NODES = 200;

/**
 * Turn a page's headings into a first-level outline.
 *
 * h1 and h2 are branches of the root; h3 hangs off the heading above it. An h3 that appears before
 * any h1 or h2 has nothing to hang from, so it becomes a branch of its own. A page with no usable
 * headings still gets somewhere to write.
 *
 * Pure and deterministic: the same headings and the same id source give the same outline.
 *
 * @param {Array<{level: number, text: string}>} headings - in document order
 * @param {() => string} ids - id source
 * @returns {Array<{id: string, text: string, children: Array}>} nested outline entries
 */
function outlineFromHeadings(headings, ids) {
  const outline = [];
  let branch = null;
  let made = 0;

  for (const heading of headings || []) {
    if (made >= MAX_OUTLINE_NODES) {
      break;
    }
    const text = String(heading?.text || '').trim();
    if (!text) {
      continue;
    }
    const entry = { id: ids(), text, children: [] };
    made += 1;

    if (Number(heading.level) >= 3 && branch) {
      branch.children.push(entry);
    } else {
      outline.push(entry);
      branch = Number(heading.level) <= 2 ? entry : branch;
    }
  }

  if (outline.length === 0) {
    outline.push({ id: ids(), text: 'Notes', children: [] });
  }
  return outline;
}

/**
 * Add an outline to a map under one parent, depth first.
 * @param {Object} map
 * @param {string} parentId
 * @param {Array<{id: string, text: string, children: Array}>} entries
 * @returns {Object} the new map
 */
function addOutline(map, parentId, entries) {
  let next = map;
  for (const entry of entries) {
    next = addChild(next, { parentId, node: createNode({ id: entry.id, text: entry.text }) });
    next = addOutline(next, entry.id, entry.children);
  }
  return next;
}

/**
 * Open the editor, reusing the tab already showing it.
 * @param {string} [mapId]
 * @param {string} [extraQuery] - appended after `?map=<id>`
 * @returns {Promise<{tabId: number|null}>}
 */
async function openEditor(mapId, extraQuery = '') {
  const base = chrome.runtime.getURL(EDITOR_PAGE);
  const url = mapId ? `${base}?map=${encodeURIComponent(mapId)}${extraQuery}` : base;

  const [existing] = (await chrome.tabs.query({ url: `${base}*` })) || [];
  if (existing) {
    // Without a map to show there is nothing to navigate to, so the open tab is simply focused.
    await chrome.tabs.update(existing.id, mapId ? { active: true, url } : { active: true });
    return { tabId: existing.id };
  }

  const created = await chrome.tabs.create({ url });
  return { tabId: created?.id ?? null };
}

/**
 * Append a captured highlight to the target map's root.
 * @param {{text?: string, url?: string, title?: string, quote?: string, mapId?: string}} message
 * @param {{ids: () => string, now: () => number}} options
 * @returns {Promise<{mapId: string, mapTitle: string, nodeId: string}>}
 */
async function addCapturedNode(message, { ids, now }) {
  // Only the id is resolved here: appendNode re-reads the map inside its own transaction, so two
  // captures in flight at once cannot each write over the other's node.
  const mapId = message.mapId || (await getTargetMap({ now })).id;

  const nodeId = ids();
  const quote = message.quote || message.text || '';
  const node = createNode({
    id: nodeId,
    text: String(message.text || quote).trim(),
    source: message.url ? { url: message.url, quote, title: message.title || '' } : null,
  });

  const saved = await appendNode(mapId, node, { now });
  // The title travels back so the toast on the page can name the map the capture landed in.
  return { mapId: saved.id, mapTitle: saved.title, nodeId };
}

/**
 * Build a map from a page: the heading outline deterministically, the page text kept on the map so
 * the editor can offer AI generation later. The AI never runs here.
 * @param {{url?: string, title?: string, text?: string, headings?: Array}} message
 * @param {{ids: () => string, now: () => number}} options
 * @returns {Promise<{mapId: string, tabId: number|null}>}
 */
async function mapPage(message, { ids, now }) {
  const title = String(message.title || message.url || 'Untitled page').trim();
  const headings = Array.isArray(message.headings) ? message.headings : [];

  const map = createMap({
    id: ids(),
    title,
    now: now(),
    source: {
      url: message.url || '',
      title,
      text: String(message.text || '').slice(0, MAX_SOURCE_TEXT),
      headings,
    },
  });

  const saved = await saveMap(addOutline(map, map.rootId, outlineFromHeadings(headings, ids)), {
    now,
  });
  const opened = await openEditor(saved.id, '&from=page');
  return { mapId: saved.id, ...opened };
}

/**
 * Answer with the result of the work, or with the reason it failed.
 * @param {Promise<Object>} work
 * @param {(response: Object) => void} sendResponse
 */
function answer(work, sendResponse) {
  work
    .then(result => sendResponse({ success: true, ...result }))
    .catch(error => {
      console.error('[AssisT] Mind map request failed:', error);
      sendResponse({ success: false, error: error?.message || String(error) });
    });
}

/**
 * Handle a mind map message.
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response: Object) => void} sendResponse
 * @param {{ids?: () => string, now?: () => number}} [options] - injected in tests
 * @returns {boolean} true when this module took the message (and will answer asynchronously)
 */
export function handleMindMapMessage(message, _sender, sendResponse, options = {}) {
  const { ids = () => crypto.randomUUID(), now = Date.now } = options;

  if (message.type === 'OPEN_MIND_MAP') {
    answer(openEditor(message.mapId), sendResponse);
    return true;
  }

  if (message.type === 'MINDMAP_ADD_NODE') {
    answer(addCapturedNode(message, { ids, now }), sendResponse);
    return true;
  }

  if (message.type === 'MINDMAP_MAP_PAGE') {
    answer(mapPage(message, { ids, now }), sendResponse);
    return true;
  }

  if (message.type === 'MINDMAP_LIST') {
    answer(
      listMaps().then(maps => ({ maps })),
      sendResponse
    );
    return true;
  }

  return false;
}
