/**
 * Citation Storage Module
 *
 * Manages citation persistence using Dexie.js (IndexedDB wrapper)
 * Follows the storage adapter pattern established in Feature 5 (Annotations)
 *
 * Features:
 * - IndexedDB for unlimited storage (better than chrome.storage.local 5MB limit)
 * - Indexed fields: url, authors, publicationDate, projectId, tags
 * - Full-text search across title, authors, publisher
 * - Project organization
 * - Export/import functionality
 */

import Dexie from 'dexie';
import { createCitation, validateCitation } from './citation-model.js';

/**
 * Initialize Dexie database for citations
 */
class CitationDatabase extends Dexie {
  constructor() {
    super('AssistCitations');

    this.version(1).stores({
      citations: '++id, url, *authors, publicationDate, projectId, *tags, createdAt',
      projects: '++id, name, createdAt',
    });

    this.citations = this.table('citations');
    this.projects = this.table('projects');
  }
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
    const citation = createCitation(citationData);
    const validation = validateCitation(citation);

    if (!validation.valid) {
      throw new Error(`Invalid citation: ${validation.errors.join(', ')}`);
    }

    const id = await db.citations.add(citation);
    return String(id);
  },

  /**
   * Get citation by ID
   * @param {string} id
   * @returns {Promise<CitationMetadata|null>}
   */
  async get(id) {
    const citation = await db.citations.get(Number(id));
    return citation || null;
  },

  /**
   * Get all citations
   * @param {Object} options - Query options
   * @param {string} options.projectId - Filter by project
   * @param {Array<string>} options.tags - Filter by tags
   * @param {string} options.sortBy - Sort field (createdAt, title, author, date)
   * @param {string} options.sortOrder - asc or desc
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getAll(options = {}) {
    let collection = db.citations.toCollection();

    // Filter by project
    if (options.projectId) {
      collection = db.citations.where('projectId').equals(options.projectId);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      collection = collection.filter(citation =>
        options.tags.some(tag => citation.tags.includes(tag))
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
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'author':
          aVal = a.authors[0]?.toLowerCase() || '';
          bVal = b.authors[0]?.toLowerCase() || '';
          break;
        case 'date':
          aVal = a.publicationDate || a.accessDate;
          bVal = b.publicationDate || b.accessDate;
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
    return await db.citations.where('url').equals(url).toArray();
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

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const validation = validateCitation(updated);
    if (!validation.valid) {
      throw new Error(`Invalid citation: ${validation.errors.join(', ')}`);
    }

    await db.citations.update(Number(id), updated);
  },

  /**
   * Delete citation
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    await db.citations.delete(Number(id));
  },

  /**
   * Search citations by text query
   * Searches across: title, authors, publisher, notes
   * @param {string} query
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async search(query) {
    const lowerQuery = query.toLowerCase();
    const allCitations = await db.citations.toArray();

    return allCitations.filter(citation => {
      return (
        citation.title.toLowerCase().includes(lowerQuery) ||
        citation.authors.some(author => author.toLowerCase().includes(lowerQuery)) ||
        citation.publisher?.toLowerCase().includes(lowerQuery) ||
        citation.notes?.toLowerCase().includes(lowerQuery)
      );
    });
  },

  /**
   * Get all unique tags
   * @returns {Promise<Array<string>>}
   */
  async getAllTags() {
    const citations = await db.citations.toArray();
    const tagSet = new Set();

    citations.forEach(citation => {
      citation.tags.forEach(tag => tagSet.add(tag));
    });

    return Array.from(tagSet).sort();
  },

  /**
   * Count total citations
   * @returns {Promise<number>}
   */
  async count() {
    return await db.citations.count();
  },

  /**
   * Clear all citations
   * @returns {Promise<void>}
   */
  async clear() {
    await db.citations.clear();
  },

  /**
   * Export all citations as JSON
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async export() {
    return await db.citations.toArray();
  },

  /**
   * Import citations from JSON array
   * @param {Array<CitationMetadata>} citations
   * @param {boolean} replace - Replace existing citations (default: false)
   * @returns {Promise<number>} - Count of imported citations
   */
  async import(citations, replace = false) {
    if (replace) {
      await this.clear();
    }

    // Regenerate IDs to avoid conflicts
    const citationsWithoutIds = citations.map(citation => {
      // eslint-disable-next-line no-unused-vars
      const { id, ...rest } = citation;
      return rest;
    });

    await db.citations.bulkAdd(citationsWithoutIds);
    return citationsWithoutIds.length;
  },

  /**
   * Check if citation with URL already exists
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async exists(url) {
    const count = await db.citations.where('url').equals(url).count();
    return count > 0;
  },
};

/**
 * Project Management API
 */
export const ProjectStorage = {
  /**
   * Create a new project
   * @param {string} name - Project name
   * @param {string} description - Project description
   * @returns {Promise<string>} - Project ID
   */
  async create(name, description = '') {
    const project = {
      name,
      description,
      createdAt: Date.now(),
    };

    const id = await db.projects.add(project);
    return String(id);
  },

  /**
   * Get all projects
   * @returns {Promise<Array<Object>>}
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
   * Delete project
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    // Remove project association from citations
    const citations = await db.citations.where('projectId').equals(id).toArray();
    for (const citation of citations) {
      await db.citations.update(citation.id, { projectId: null });
    }

    await db.projects.delete(Number(id));
  },

  /**
   * Get citations for a project
   * @param {string} projectId
   * @returns {Promise<Array<CitationMetadata>>}
   */
  async getCitations(projectId) {
    return await db.citations.where('projectId').equals(projectId).toArray();
  },

  /**
   * Count citations in project
   * @param {string} projectId
   * @returns {Promise<number>}
   */
  async countCitations(projectId) {
    return await db.citations.where('projectId').equals(projectId).count();
  },
};

export default {
  CitationStorage,
  ProjectStorage,
  db,
};
