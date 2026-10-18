/**
 * Authorship Shield — local writing-provenance log.
 *
 * A private, on-device record of how a document changed over time, so a student can export
 * evidence of their own writing process (steady growth, session pattern, where large blocks of
 * text were pasted in) if their work is ever wrongly flagged as AI-generated. Nothing here leaves
 * the device and nothing here is a detector — it never labels anything as AI, cheating, or
 * suspicious; it only describes what changed and when.
 *
 * Privacy/quota: only a rolling excerpt (first 200 chars) of each snapshot plus metrics are
 * persisted — never the full document text. To compute an accurate "what changed" diff between
 * calls within a session, the full text of the last *recorded* snapshot is kept in an in-memory
 * cache local to this factory instance (never written to storage). If that cache is empty (e.g.
 * the extension's background context restarted), the diff falls back to a length-only estimate.
 *
 * Fully unit-testable: storage and the clock are injected, so tests can supply an in-memory
 * storage stub and a deterministic clock instead of chrome.storage/Date.now().
 */

const STORAGE_KEY = 'authorshipProvenanceLog';
const EXCERPT_LENGTH = 200;
const MAX_SNAPSHOTS_PER_DOC = 200;
const MAX_DOCS = 50;
const SIGNIFICANT_CHAR_DELTA = 30;
const SIGNIFICANT_RATIO = 0.05;
const SESSION_GAP_MS = 30 * 60 * 1000; // a 30-minute gap starts a new writing session
const LARGE_INSERTION_THRESHOLD = 150; // chars — flagged neutrally in the report

/**
 * Compare two full texts with a simple common-prefix / common-suffix trim and report the size of
 * the single contiguous block that changed in between. Good enough to tell "typed a few characters"
 * from "a large block appeared at once" without a full diff library.
 * @param {string} prevText
 * @param {string} curText
 * @returns {{removed: number, inserted: number}}
 */
function computeDiff(prevText, curText) {
  const prevLen = prevText.length;
  const curLen = curText.length;
  const minLen = Math.min(prevLen, curLen);

  let prefix = 0;
  while (prefix < minLen && prevText.charCodeAt(prefix) === curText.charCodeAt(prefix)) {
    prefix++;
  }

  const maxSuffix = minLen - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    prevText.charCodeAt(prevLen - 1 - suffix) === curText.charCodeAt(curLen - 1 - suffix)
  ) {
    suffix++;
  }

  return {
    removed: Math.max(0, prevLen - prefix - suffix),
    inserted: Math.max(0, curLen - prefix - suffix),
  };
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/** Small, fast, non-cryptographic hash (FNV-1a). Only used as a content fingerprint, never to
 * reconstruct or verify text — safe to persist. */
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function isSignificantChange(deltaChars, baselineLength) {
  const absDelta = Math.abs(deltaChars);
  if (absDelta >= SIGNIFICANT_CHAR_DELTA) {
    return true;
  }
  if (baselineLength > 0 && absDelta / baselineLength >= SIGNIFICANT_RATIO) {
    return true;
  }
  if (baselineLength === 0 && absDelta > 0) {
    return true;
  }
  return false;
}

function formatDate(t) {
  return new Date(t).toISOString();
}

/** Group snapshots into writing sessions, splitting wherever the gap to the previous snapshot
 * exceeds SESSION_GAP_MS. Assumes snapshots are already ordered oldest-to-newest. */
function groupIntoSessions(snapshots, gapMs = SESSION_GAP_MS) {
  if (snapshots.length === 0) {
    return [];
  }
  const sessions = [[snapshots[0]]];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    if (cur.t - prev.t > gapMs) {
      sessions.push([cur]);
    } else {
      sessions[sessions.length - 1].push(cur);
    }
  }
  return sessions;
}

/**
 * @param {{storage: {get(key:string):Promise<any>, set(key:string, value:any):Promise<void>}, now: () => number}} deps
 */
export function createProvenanceLog({ storage, now }) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
    throw new Error('createProvenanceLog requires a storage adapter with get/set');
  }
  if (typeof now !== 'function') {
    throw new Error('createProvenanceLog requires a now() clock function');
  }

  // Last-recorded full text per docId, for accurate diffing within this session only.
  // Never persisted — see the module header for why.
  const memoryCache = new Map();

  // All mutations run through one promise chain: several watched fields share this log and their
  // debounce timers can fire together, so unserialized read-modify-write cycles would let the
  // later write silently clobber the earlier one's snapshot.
  let writeChain = Promise.resolve();
  function serialize(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function loadStore() {
    const raw = await storage.get(STORAGE_KEY);
    if (raw && typeof raw === 'object' && raw.docs) {
      return { docs: { ...raw.docs } };
    }
    return { docs: {} };
  }

  async function saveStore(store) {
    await storage.set(STORAGE_KEY, store);
  }

  function enforceDocCap(docs, justAddedDocId) {
    let ids = Object.keys(docs);
    while (ids.length > MAX_DOCS) {
      let victim = null;
      let victimTime = Infinity;
      for (const id of ids) {
        if (id === justAddedDocId) {
          continue;
        }
        const lastUpdated = docs[id].lastUpdated || 0;
        if (lastUpdated < victimTime) {
          victimTime = lastUpdated;
          victim = id;
        }
      }
      if (!victim) {
        break;
      }
      delete docs[victim];
      memoryCache.delete(victim);
      ids = Object.keys(docs);
    }
  }

  /**
   * Record a snapshot of a document's current text if it changed meaningfully since the last
   * recorded snapshot (>= 30 chars of change, or >= 5% length delta). Only a short excerpt and
   * metrics are persisted — never the full text.
   * @param {{docId: string, title?: string, text: string}} args
   * @returns {Promise<{recorded: boolean, reason?: string}>}
   */
  function recordSnapshot(args) {
    return serialize(() => recordSnapshotUnsafe(args));
  }

  async function recordSnapshotUnsafe({ docId, title, text }) {
    if (!docId) {
      throw new Error('recordSnapshot requires a docId');
    }
    const curText = typeof text === 'string' ? text : '';
    const timestamp = now();
    const curLength = curText.length;
    const wordCount = countWords(curText);

    const store = await loadStore();
    const docs = store.docs;
    const existing = docs[docId];
    const cachedPrevText = memoryCache.get(docId);

    let deltaChars;
    let largestInsertion;
    let baselineLength;

    if (!existing) {
      // First snapshot ever for this document — always recorded as the baseline.
      deltaChars = curLength;
      largestInsertion = curLength;
      baselineLength = 0;
    } else if (cachedPrevText !== undefined) {
      const diff = computeDiff(cachedPrevText, curText);
      deltaChars = curLength - cachedPrevText.length;
      largestInsertion = diff.inserted;
      baselineLength = cachedPrevText.length;
    } else {
      // No in-memory reference text available (fresh session or page re-navigation) — only the
      // length delta is knowable. largestInsertion stays 0: without the reference text there is
      // no way to tell one paste from an hour of typing, and this log must never mislabel
      // ordinary typing as a pasted block.
      const lastSnapshot = existing.snapshots[existing.snapshots.length - 1];
      baselineLength = lastSnapshot ? lastSnapshot.length : 0;
      deltaChars = curLength - baselineLength;
      largestInsertion = 0;
    }

    const significant = !existing || isSignificantChange(deltaChars, baselineLength);
    if (!significant) {
      return { recorded: false, reason: 'no-significant-change' };
    }

    const snapshot = {
      t: timestamp,
      length: curLength,
      wordCount,
      deltaChars,
      largestInsertion,
      hash: hashText(curText),
      excerpt: curText.slice(0, EXCERPT_LENGTH),
    };

    const doc = existing || { docId, title: title || '', snapshots: [] };
    if (title) {
      doc.title = title;
    }
    doc.snapshots = [...doc.snapshots, snapshot];
    if (doc.snapshots.length > MAX_SNAPSHOTS_PER_DOC) {
      doc.snapshots = doc.snapshots.slice(doc.snapshots.length - MAX_SNAPSHOTS_PER_DOC);
    }
    doc.lastUpdated = timestamp;
    docs[docId] = doc;

    enforceDocCap(docs, docId);
    memoryCache.set(docId, curText);

    await saveStore(store);

    return { recorded: true };
  }

  /**
   * @param {string} docId
   * @returns {Promise<Array<object>>} snapshots oldest-to-newest, [] if the document is unknown.
   */
  async function getTimeline(docId) {
    const store = await loadStore();
    const doc = store.docs[docId];
    return doc ? [...doc.snapshots] : [];
  }

  /**
   * @returns {Promise<Array<{docId: string, title: string, snapshots: number, lastUpdated: number}>>}
   * Summary list, newest-updated first. `snapshots` is a count — use getTimeline() for the full log.
   */
  async function listDocs() {
    const store = await loadStore();
    return Object.values(store.docs)
      .map(doc => ({
        docId: doc.docId,
        title: doc.title,
        snapshots: doc.snapshots.length,
        lastUpdated: doc.lastUpdated,
      }))
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  /**
   * Build a human-readable Markdown report a student can export as evidence of their writing
   * process. Deliberately neutral throughout — this is supporting evidence, not a verdict.
   * @param {string} docId
   * @param {{title?: string}} [opts]
   * @returns {Promise<string>}
   */
  async function buildReport(docId, opts = {}) {
    const store = await loadStore();
    const doc = store.docs[docId];
    const reportTitle = opts.title || doc?.title || 'Untitled document';
    const generatedAt = formatDate(now());

    const header = [
      `# Writing Provenance Report — ${reportTitle}`,
      '',
      `_Generated on ${generatedAt}_`,
      '',
      '## What this log can and cannot show',
      'This is a private, on-device record of how this document changed over time, kept only on ' +
        'your own computer. It can show the overall pattern of edits: how the document grew, ' +
        'roughly when you worked on it, and when a large block of text appeared at once. It ' +
        '**cannot** prove who typed the words, cannot tell your own writing apart from any other ' +
        'source, and is not a formal originality analysis. Treat it as one piece of supporting ' +
        'evidence about your writing process, not as proof on its own.',
      '',
    ].join('\n');

    if (!doc || doc.snapshots.length === 0) {
      return `${header}\n## Summary\nNo snapshots have been recorded for this document yet.\n`;
    }

    const snapshots = doc.snapshots;
    const sessions = groupIntoSessions(snapshots);
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    const summary = [
      '## Summary',
      `- Writing sessions recorded: ${sessions.length}`,
      `- Total snapshots: ${snapshots.length}`,
      `- First snapshot: ${formatDate(first.t)}`,
      `- Last snapshot: ${formatDate(last.t)}`,
      `- Document grew from ${first.length} characters to ${last.length} characters ` +
        `(${last.wordCount} words at the last snapshot)`,
      '',
    ].join('\n');

    const growthRows = snapshots
      .map(
        s =>
          `| ${formatDate(s.t)} | ${s.length} | ${s.wordCount} | ` +
          `${s.deltaChars >= 0 ? '+' : ''}${s.deltaChars} |`
      )
      .join('\n');
    const growth = [
      '## Growth over time',
      '| Time | Length (chars) | Words | Change |',
      '|---|---|---|---|',
      growthRows,
      '',
    ].join('\n');

    const largeInsertions = snapshots.filter(s => s.largestInsertion >= LARGE_INSERTION_THRESHOLD);
    const insertionsSection = ['## Notable large insertions'];
    if (largeInsertions.length === 0) {
      insertionsSection.push('No unusually large single insertions were recorded.');
    } else {
      for (const s of largeInsertions) {
        insertionsSection.push(
          `- On ${formatDate(s.t)}, a block of ${s.largestInsertion} characters appeared at once ` +
            '— e.g. pasted from your own notes or an editor.'
        );
      }
    }

    return [header, summary, growth, insertionsSection.join('\n')].join('\n');
  }

  /**
   * @param {string} docId
   */
  function clearDoc(docId) {
    return serialize(async () => {
      const store = await loadStore();
      delete store.docs[docId];
      memoryCache.delete(docId);
      await saveStore(store);
    });
  }

  function clearAll() {
    return serialize(async () => {
      memoryCache.clear();
      await saveStore({ docs: {} });
    });
  }

  return {
    recordSnapshot,
    getTimeline,
    listDocs,
    buildReport,
    clearDoc,
    clearAll,
  };
}
