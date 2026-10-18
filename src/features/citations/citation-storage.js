/**
 * Citation Storage Module
 *
 * Manages citation persistence using Dexie.js (IndexedDB wrapper)
 * Follows the storage adapter pattern established in Feature 5 (Annotations)
 *
 * Features:
 * - IndexedDB for unlimited storage (better than chrome.storage.local 5MB limit)
 * - Indexed fields: url, authors, publicationDate, projectId, tags, deletedAt
 * - Full-text search across title, authors, publisher
 * - Project organization
 * - Export/import functionality
 * - A trash: `delete()` is a soft delete, every library read hides removed records, and only
 *   `purge()` / `emptyTrash()` / the retention sweep destroy anything.
 *
 * No Chrome APIs live here — the Safari port reuses this core, and the extension-only plumbing
 * (RPC, offscreen document) stays at the edges.
 */

import Dexie from 'dexie';
import { createCitation, validateCitation } from './citation-model.js';
import { normalizeCitation } from './citation-types.js';
import { TRASH_RETENTION_DAYS } from '../../config/citation-messages.js';

/** Milliseconds in a day — the retention window is expressed in days, enforced in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a stored row is part of the library (as opposed to sitting in the trash).
 * `deletedAt` is null on a live record and an ISO timestamp on a removed one.
 * @param {Object} row
 * @returns {boolean}
 */
function isLive(row) {
  return !row || !row.deletedAt;
}

/**
 * Tokenise free text into deduped, lowercased word tokens for the prefix-search index.
 * @param {...(string|string[])} parts
 * @returns {string[]}
 */
export function tokenize(...parts) {
  const text = parts.flat().filter(Boolean).join(' ').toLowerCase();
  return [...new Set(text.split(/[^a-z0-9]+/i).filter(Boolean))];
}

/**
 * Build the `searchTokens` index array for a citation record (title, authors, publisher,
 * siteName, notes). Normalises first so legacy/malformed rows still index cleanly.
 * @param {Object} record
 * @returns {string[]}
 */
export function tokenizeRecord(record) {
  const c = normalizeCitation(record) || {};
  return tokenize(c.title, c.authors, c.publisher, c.siteName, c.notes);
}

// ---------------------------------------------------------------------------
// In-realm change signal. IndexedDB has no cross-context change event, so mutations notify
// same-realm listeners synchronously; citation-index.js turns this into the cross-context
// chrome.storage projection. Storage never imports its listeners — no circular dependency.
// ---------------------------------------------------------------------------
const _changeListeners = new Set();

/**
 * Subscribe to citation mutations in this JS realm (add/update/delete/import).
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onCitationsChanged(listener) {
  _changeListeners.add(listener);
  return () => _changeListeners.delete(listener);
}

function notifyChanged() {
  for (const fn of _changeListeners) {
    try {
      fn();
    } catch (error) {
      console.error('[citation-storage] change listener failed:', error);
    }
  }
}

/** The one database every extension realm shares. */
const DB_NAME = 'AssistCitations';

/**
 * Initialize Dexie database for citations
 */
class CitationDatabase extends Dexie {
  /**
   * @param {string} [name] - database name; only the migration tests pass anything else, so the
   *                          upgrade path they exercise is the one a student's install runs.
   */
  constructor(name = DB_NAME) {
    super(name);

    // v1 — original schema (retained so existing installs upgrade cleanly to v2).
    this.version(1).stores({
      citations: '++id, url, *authors, publicationDate, projectId, *tags, createdAt',
      projects: '++id, name, createdAt',
    });

    // v2 — add the multi-entry `searchTokens` index for index-backed prefix search, and backfill
    // it on existing rows. Idempotent: re-running the backfill produces identical tokens.
    this.version(2)
      .stores({
        citations:
          '++id, url, *authors, publicationDate, projectId, *tags, createdAt, *searchTokens',
        projects: '++id, name, createdAt',
      })
      .upgrade(tx =>
        tx
          .table('citations')
          .toCollection()
          .modify(row => {
            row.searchTokens = tokenizeRecord(row);
          })
      );

    // v3 — add the `deletedAt` index behind the trash. Removing a citation now stamps the record
    // instead of destroying it, so every read has to know which rows are live; the backfill states
    // the obvious for existing rows (`null` = in the library) rather than leaving the field absent.
    // Idempotent: a row that already carries a value keeps it, so re-running changes nothing.
    // IndexedDB cannot index null, so this index holds the trash and nothing else — which is
    // exactly the collection getTrashed()/purgeExpiredTrash() need to walk.
    this.version(3)
      .stores({
        citations:
          '++id, url, *authors, publicationDate, projectId, *tags, createdAt, *searchTokens, deletedAt',
        projects: '++id, name, createdAt',
      })
      .upgrade(tx =>
        tx
          .table('citations')
          .toCollection()
          .modify(row => {
            row.deletedAt = row.deletedAt === undefined ? null : row.deletedAt;
          })
      );

    this.citations = this.table('citations');
    this.projects = this.table('projects');
  }
}

/**
 * Open a citation database, schema and upgrades included.
 *
 * The singleton below is the only one the extension opens. The seam exists so the migration tests
 * can point the REAL class at a throwaway database instead of writing the upgrade out a second
 * time — a test that re-declares the migration proves only that it agrees with itself.
 * @param {Object} [options]
 * @param {string} [options.name] - database name (defaults to the shared one)
 * @returns {Dexie} an unopened Dexie instance carrying the citation schema
 */
export function openCitationDatabase({ name = DB_NAME } = {}) {
  return new CitationDatabase(name);
}

// Singleton instance
const db = new CitationDatabase();

/**
 * Citation Storage API
 */
export const CitationStorage = {
  /**
   * Add a new citation
   * @param {Partial<CitationMetadata>} citationData
   * @returns {Promise<string>} - Citation ID
   */
  async add(citationData) {
    // createCitation builds the record from CITATION_FIELDS — the one field list update() merges
    // over too, so a field a capture fills in cannot be dropped on the way in and then reappear
    // the first time the student edits the record.
    const citation = createCitation(citationData);
    const validation = validateCitation(citation);

    if (!validation.valid) {
      throw new Error(`Invalid citation: ${validation.errors.join(', ')}`);
    }

    // Let Dexie assign the numeric auto-increment key. The model's UUID `id` would otherwise
    // be used as an inbound key, breaking the Number(id) lookups in get/update/delete.
    const { id: _modelId, ...record } = citation;
    record.searchTokens = tokenizeRecord(record);
    // A record being added is in the library, whatever the caller handed us. Restoring a backup or
    // importing a file must never drop a citation straight into the trash, where the student would
    // have no reason to look for it.
    record.deletedAt = null;
    const id = await db.citations.add(record);
    notifyChanged();
    return String(id);
  },

  /**
   * Get citation by ID. A trashed citation reads as absent — it is out of the library until it is
   * restored, and every caller here is asking about the library.
   * @param {string} id
   * @returns {Promise<CitationMetadata|null>}
   */
  async get(id) {
    const citation = await db.citations.get(Number(id));
    return citation && isLive(citation) ? citation : null;
  },

  /**
   * Get all citations
   * @param {Object} options - Query options
   * @param {string} options.projectId - Filter by project
   * @param {Array<string>} options.tags - Filter by tags
   * @param {string} options.sortBy - Sort field (createdAt, title, author, date)
   * @param {string} options.sortOrder - asc or desc
   * @param {boolean} options.includeTrashed - include removed citations (default: false)
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getAll(options = {}) {
    let collection = db.citations.toCollection();

    // Filter by project
    if (options.projectId) {
      collection = db.citations.where('projectId').equals(options.projectId);
    }

    // The trash is out of the library unless it is asked for by name.
    if (!options.includeTrashed) {
      collection = collection.filter(isLive);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      collection = collection.filter(citation =>
        options.tags.some(tag => (citation.tags || []).includes(tag))
      );
    }

    // Get all citations
    const citations = await collection.toArray();

    // Sort
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    citations.sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'title':
          aVal = (a.title || '').toLowerCase();
          bVal = (b.title || '').toLowerCase();
          break;
        case 'author':
          aVal = (a.authors && a.authors[0] ? a.authors[0] : '').toLowerCase();
          bVal = (b.authors && b.authors[0] ? b.authors[0] : '').toLowerCase();
          break;
        case 'date':
          aVal = a.publicationDate || a.accessDate || '';
          bVal = b.publicationDate || b.accessDate || '';
          break;
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return citations;
  },

  /**
   * Get citations for a specific URL
   * @param {string} url
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getByURL(url) {
    return await db.citations.where('url').equals(url).filter(isLive).toArray();
  },

  /**
   * Update citation
   * @param {string} id
   * @param {Partial<CitationMetadata>} updates
   * @returns {Promise<void>}
   */
  async update(id, updates) {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Citation ${id} not found`);
    }

    // Merging over the stored record means every field of CITATION_FIELDS survives an update
    // whether the caller mentioned it or not — no second field list to fall behind the first.
    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const validation = validateCitation(updated);
    if (!validation.valid) {
      throw new Error(`Invalid citation: ${validation.errors.join(', ')}`);
    }

    updated.searchTokens = tokenizeRecord(updated);
    await db.citations.update(Number(id), updated);
    notifyChanged();
  },

  /**
   * Remove a citation: a SOFT delete into the trash, not a destruction.
   *
   * A student mid-dissertation cannot afford a Remove that is final. The record is stamped with the
   * moment it left the library and disappears from every library read; `restore()` puts it back
   * exactly as it was (same id, same collection, same tags), and only `purge()`, `emptyTrash()` or
   * the retention sweep destroy anything.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    await db.citations.update(Number(id), {
      deletedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    });
    notifyChanged();
  },

  /**
   * The trash, most recently removed first.
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getTrashed() {
    // IndexedDB cannot index null, so this index contains removed rows and nothing else.
    const trashed = await db.citations.where('deletedAt').above('').toArray();
    return trashed.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  },

  /**
   * Put a removed citation back into the library.
   * @param {string} id
   * @returns {Promise<boolean>} false when there was nothing at that id to restore
   */
  async restore(id) {
    const updated = await db.citations.update(Number(id), {
      deletedAt: null,
      updatedAt: Date.now(),
    });
    notifyChanged();
    return updated > 0;
  },

  /**
   * Destroy one citation for good. There is no way back from here.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async purge(id) {
    await db.citations.delete(Number(id));
    notifyChanged();
  },

  /**
   * Destroy everything in the trash.
   * @returns {Promise<number>} how many citations were destroyed
   */
  async emptyTrash() {
    const purged = await db.citations.where('deletedAt').above('').delete();
    notifyChanged();
    return purged;
  },

  /**
   * Destroy the citations that have sat in the trash longer than the retention window. Called when
   * the library opens, so the trash cannot grow without bound — and so the promise the trash view
   * makes to the student ("kept for 30 days") is one the storage actually keeps.
   * @param {Object} [options]
   * @param {number} [options.now] - current time in ms (injectable so the boundary is testable)
   * @param {number} [options.retentionDays] - override the retention window
   * @returns {Promise<number>} how many citations were destroyed
   */
  async purgeExpiredTrash({ now = Date.now(), retentionDays = TRASH_RETENTION_DAYS } = {}) {
    const cutoff = new Date(now - retentionDays * DAY_MS).toISOString();
    // Strictly below the cutoff: a citation removed exactly `retentionDays` ago still has its day.
    const purged = await db.citations.where('deletedAt').below(cutoff).delete();
    if (purged > 0) {
      notifyChanged();
    }
    return purged;
  },

  /**
   * Search citations by text query (index-backed, token-prefix AND-match).
   *
   * The query is tokenised; a citation matches when, for EVERY query token, one of its indexed
   * tokens (from title/authors/publisher/siteName/notes) starts with that query token. The first
   * token is resolved through the `searchTokens` index (narrowing the candidate set); the rest are
   * AND-filtered in memory. This is word-boundary aware — it does not match mid-word substrings.
   * @param {string} query
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async search(query) {
    const tokens = tokenize(query);
    if (tokens.length === 0) {
      return [];
    }
    const [first, ...rest] = tokens;
    const candidates = await db.citations
      .where('searchTokens')
      .startsWith(first)
      .distinct()
      .filter(isLive)
      .toArray();
    if (rest.length === 0) {
      return candidates;
    }
    return candidates.filter(c => {
      const ct = c.searchTokens && c.searchTokens.length ? c.searchTokens : tokenizeRecord(c);
      return rest.every(qt => ct.some(t => t.startsWith(qt)));
    });
  },

  /**
   * Get all unique tags
   * @returns {Promise<Array<string>>}
   */
  async getAllTags() {
    const citations = await db.citations.filter(isLive).toArray();
    const tagSet = new Set();

    citations.forEach(citation => {
      citation.tags.forEach(tag => tagSet.add(tag));
    });

    return Array.from(tagSet).sort();
  },

  /**
   * Count the citations in the library (the trash is not part of it).
   * @returns {Promise<number>}
   */
  async count() {
    return await db.citations.filter(isLive).count();
  },

  /**
   * Export the library as JSON. Removed citations are left out — a backup restores what the student
   * has, not what they threw away — unless they are asked for explicitly.
   * @param {Object} [options]
   * @param {boolean} [options.includeTrashed=false]
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async export({ includeTrashed = false } = {}) {
    const rows = includeTrashed
      ? await db.citations.toArray()
      : await db.citations.filter(isLive).toArray();
    // Strip the internal search index from user-facing backups.
    return rows.map(row => {
      // eslint-disable-next-line no-unused-vars
      const { searchTokens, ...rest } = row;
      return rest;
    });
  },

  /**
   * Check if citation with URL already exists
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async exists(url) {
    // A removed citation does not count as saved — otherwise the capture bar would tell a student
    // this page is already in a library they can no longer see it in.
    const count = await db.citations.where('url').equals(url).filter(isLive).count();
    return count > 0;
  },
};

/**
 * Project Management API - Enhanced with annotation linking (Task 5.15)
 */
export const ProjectStorage = {
  /**
   * Create a new project
   */
  async create(name, description = '') {
    const project = { name, description, createdAt: Date.now() };
    const id = await db.projects.add(project);
    return String(id);
  },

  /**
   * Get all projects
   */
  async getAll() {
    return await db.projects.toArray();
  },

  /**
   * Get project by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async get(id) {
    const project = await db.projects.get(Number(id));
    return project || null;
  },

  /**
   * Update project
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async update(id, updates) {
    await db.projects.update(Number(id), updates);
  },

  /**
   * Delete a project (collection).
   *
   * Deleting a collection must NEVER delete the sources filed in it — a student who tidies up
   * their collections has not asked to lose their research. Every filed citation is unfiled
   * (its `projectId` cleared) and stays in the library; the count is returned so the caller can
   * say plainly what happened.
   *
   * `projectId` is written as a string by `create()`, but a record imported or hand-edited
   * elsewhere may carry the numeric key, so both are swept — a citation left pointing at a
   * collection that no longer exists would be invisible to every filter.
   *
   * @param {string} id
   * @returns {Promise<{ unfiled: number }>} how many citations were returned to the library
   */
  async delete(id) {
    const keys = [String(id)];
    const numericKey = Number(id);
    if (Number.isFinite(numericKey)) {
      keys.push(numericKey);
    }

    let unfiled = 0;
    let changed = 0;
    for (const key of keys) {
      const filed = await db.citations.where('projectId').equals(key).toArray();
      for (const citation of filed) {
        await db.citations.update(citation.id, { projectId: null, updatedAt: Date.now() });
        changed += 1;
        // Trashed citations are unfiled too — one restored later must not point at a collection
        // that no longer exists — but they are not counted, because the student is being told how
        // many sources came back to the library they can see.
        if (isLive(citation)) {
          unfiled += 1;
        }
      }
    }

    await db.projects.delete(Number(id));

    // Unfiling edits citations, so the cross-context projection must be rebuilt; without this an
    // open popup would keep showing them filed under a collection that is gone.
    if (changed > 0) {
      notifyChanged();
    }

    return { unfiled };
  },

  /**
   * Get citations for a project
   * @param {string} projectId
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getCitations(projectId) {
    return await db.citations.where('projectId').equals(projectId).filter(isLive).toArray();
  },

  /**
   * Count citations in project
   * @param {string} projectId
   * @returns {Promise<number>}
   */
  async countCitations(projectId) {
    return await db.citations.where('projectId').equals(projectId).filter(isLive).count();
  },
};

export default {
  CitationStorage,
  ProjectStorage,
  db,
};
