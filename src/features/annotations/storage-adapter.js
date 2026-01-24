/**
 * Storage Adapter for Annotations
 *
 * Provides a unified interface for storing annotations in either:
 * - chrome.storage.local (faster, limited capacity ~5MB)
 * - IndexedDB via Dexie (unlimited, supports large collections)
 *
 * Adapters implement CRUD operations with a consistent API.
 */

import Dexie from 'dexie';

/**
 * Base Storage Adapter Interface
 * All storage implementations must implement these methods
 */
class BaseStorageAdapter {
  /**
   * Get all annotations
   * @returns {Promise<Array>} Array of annotation objects
   */
  async getAll() {
    throw new Error('getAll() must be implemented');
  }

  /**
   * Get a single annotation by ID
   * @param {string} id - Annotation ID
   * @returns {Promise<Object|null>} Annotation object or null if not found
   */
  async getById(_id) {
    throw new Error('getById() must be implemented');
  }

  /**
   * Get annotations for a specific URL
   * @param {string} _url - Page URL
   * @returns {Promise<Array>} Array of annotations for the URL
   */
  async getByUrl(_url) {
    throw new Error('getByUrl() must be implemented');
  }

  /**
   * Create a new annotation
   * @param {Object} _annotation - Annotation data
   * @returns {Promise<Object>} Created annotation with ID
   */
  async create(_annotation) {
    throw new Error('create() must be implemented');
  }

  /**
   * Update an existing annotation
   * @param {string} _id - Annotation ID
   * @param {Object} _updates - Updated fields
   * @returns {Promise<Object>} Updated annotation
   */
  async update(_id, _updates) {
    throw new Error('update() must be implemented');
  }

  /**
   * Delete an annotation
   * @param {string} _id - Annotation ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(_id) {
    throw new Error('delete() must be implemented');
  }

  /**
   * Search annotations by query
   * @param {string} _query - Search query
   * @returns {Promise<Array>} Matching annotations
   */
  async search(_query) {
    throw new Error('search() must be implemented');
  }

  /**
   * Filter annotations by criteria
   * @param {Object} _filters - Filter criteria (tags, color, dateRange, etc.)
   * @returns {Promise<Array>} Filtered annotations
   */
  async filter(_filters) {
    throw new Error('filter() must be implemented');
  }

  /**
   * Get total count of annotations
   * @returns {Promise<number>} Total count
   */
  async count() {
    throw new Error('count() must be implemented');
  }

  /**
   * Clear all annotations (dangerous!)
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('clear() must be implemented');
  }

  /**
   * Export all annotations
   * @returns {Promise<Array>} All annotations
   */
  async export() {
    return this.getAll();
  }

  /**
   * Import annotations (replaces existing)
   * @param {Array} annotations - Annotations to import
   * @returns {Promise<number>} Number of annotations imported
   */
  async import(_annotations) {
    throw new Error('import() must be implemented');
  }
}

/**
 * Dexie (IndexedDB) Storage Adapter
 * Supports unlimited annotations with efficient querying
 */
class DexieStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super();

    // Initialize Dexie database
    this.db = new Dexie('AssistAnnotations');

    // Define schema (version 1)
    this.db.version(1).stores({
      annotations: '++id, url, type, createdAt, updatedAt, *tags, color',
    });

    // Version 2: Add projectIds for linking annotations to citation projects (Task 5.15)
    this.db.version(2).stores({
      annotations: '++id, url, type, createdAt, updatedAt, *tags, color, *projectIds',
    });
  }

  /**
   * Get annotations linked to a specific project (Task 5.15)
   */
  async getByProjectId(projectId) {
    try {
      return await this.db.annotations.where('projectIds').equals(projectId).toArray();
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotations for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Link an annotation to a citation project (Task 5.15)
   */
  async linkToProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = annotation.projectIds || [];
      if (!projectIds.includes(projectId)) {
        projectIds.push(projectId);
        return await this.update(annotationId, { projectIds });
      }
      return annotation;
    } catch (error) {
      console.error(`[DexieAdapter] Error linking annotation:`, error);
      throw error;
    }
  }

  /**
   * Unlink an annotation from a citation project (Task 5.15)
   */
  async unlinkFromProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = (annotation.projectIds || []).filter(id => id !== projectId);
      return await this.update(annotationId, { projectIds });
    } catch (error) {
      console.error(`[DexieAdapter] Error unlinking annotation:`, error);
      throw error;
    }
  }

  async getAll() {
    try {
      const annotations = await this.db.annotations.toArray();
      return annotations;
    } catch (error) {
      console.error('[DexieAdapter] Error getting all annotations:', error);
      throw error;
    }
  }

  async getById(id) {
    try {
      const annotation = await this.db.annotations.get(parseInt(id));
      return annotation || null;
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotation ${id}:`, error);
      throw error;
    }
  }

  async getByUrl(url) {
    try {
      const annotations = await this.db.annotations.where('url').equals(url).toArray();
      return annotations;
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotations for URL ${url}:`, error);
      throw error;
    }
  }

  async create(annotation) {
    try {
      const now = Date.now();
      const newAnnotation = {
        ...annotation,
        createdAt: now,
        updatedAt: now,
        tags: annotation.tags || [],
        color: annotation.color || 'yellow',
      };

      const id = await this.db.annotations.add(newAnnotation);
      const created = await this.getById(id);
      return created;
    } catch (error) {
      console.error('[DexieAdapter] Error creating annotation:', error);
      throw error;
    }
  }

  async update(id, updates) {
    try {
      const updatedData = {
        ...updates,
        updatedAt: Date.now(),
      };

      await this.db.annotations.update(parseInt(id), updatedData);
      const updated = await this.getById(id);
      return updated;
    } catch (error) {
      console.error(`[DexieAdapter] Error updating annotation ${id}:`, error);
      throw error;
    }
  }

  async delete(id) {
    try {
      await this.db.annotations.delete(parseInt(id));
      return true;
    } catch (error) {
      console.error(`[DexieAdapter] Error deleting annotation ${id}:`, error);
      return false;
    }
  }

  async search(query) {
    try {
      const lowerQuery = query.toLowerCase();
      const annotations = await this.db.annotations
        .filter(ann => {
          // Search in content, title, and tags
          const content = (ann.content || '').toLowerCase();
          const title = (ann.title || '').toLowerCase();
          const tags = (ann.tags || []).join(' ').toLowerCase();

          return (
            content.includes(lowerQuery) || title.includes(lowerQuery) || tags.includes(lowerQuery)
          );
        })
        .toArray();

      return annotations;
    } catch (error) {
      console.error('[DexieAdapter] Error searching annotations:', error);
      throw error;
    }
  }

  async filter(filters) {
    try {
      let collection = this.db.annotations;

      // Filter by URL
      if (filters.url) {
        collection = collection.where('url').equals(filters.url);
      }

      // Filter by tags (match any tag)
      if (filters.tags && filters.tags.length > 0) {
        collection = collection.where('tags').anyOf(filters.tags);
      }

      // Filter by color
      if (filters.color) {
        collection = collection.where('color').equals(filters.color);
      }

      // Filter by date range
      if (filters.startDate || filters.endDate) {
        collection = collection.filter(ann => {
          if (filters.startDate && ann.createdAt < filters.startDate) {
            return false;
          }
          if (filters.endDate && ann.createdAt > filters.endDate) {
            return false;
          }
          return true;
        });
      }

      const annotations = await collection.toArray();
      return annotations;
    } catch (error) {
      console.error('[DexieAdapter] Error filtering annotations:', error);
      throw error;
    }
  }

  async count() {
    try {
      const total = await this.db.annotations.count();
      return total;
    } catch (error) {
      console.error('[DexieAdapter] Error counting annotations:', error);
      throw error;
    }
  }

  async clear() {
    try {
      await this.db.annotations.clear();
    } catch (error) {
      console.error('[DexieAdapter] Error clearing annotations:', error);
      throw error;
    }
  }

  async import(annotations) {
    try {
      await this.db.annotations.bulkAdd(annotations);
      return annotations.length;
    } catch (error) {
      console.error('[DexieAdapter] Error importing annotations:', error);
      throw error;
    }
  }
}

/**
 * Chrome Local Storage Adapter
 * Faster but limited to ~5MB (approx 100-200 annotations)
 */
class LocalStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super();
    this.STORAGE_KEY = 'assist_annotations';
    this.nextId = 1;
  }

  /**
   * Get annotations from chrome.storage.local
   * @private
   */
  async _getStorage() {
    return new Promise(resolve => {
      chrome.storage.local.get(this.STORAGE_KEY, result => {
        const data = result[this.STORAGE_KEY] || { annotations: [], nextId: 1 };
        this.nextId = data.nextId || 1;
        resolve(data.annotations || []);
      });
    });
  }

  /**
   * Save annotations to chrome.storage.local
   * @private
   */
  async _saveStorage(annotations) {
    return new Promise((resolve, reject) => {
      const data = {
        annotations,
        nextId: this.nextId,
      };
      chrome.storage.local.set({ [this.STORAGE_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async getAll() {
    try {
      const annotations = await this._getStorage();
      return annotations;
    } catch (error) {
      console.error('[LocalAdapter] Error getting all annotations:', error);
      throw error;
    }
  }

  async getById(id) {
    try {
      const annotations = await this._getStorage();
      const annotation = annotations.find(ann => ann.id === parseInt(id));
      return annotation || null;
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotation ${id}:`, error);
      throw error;
    }
  }

  async getByUrl(url) {
    try {
      const annotations = await this._getStorage();
      const filtered = annotations.filter(ann => ann.url === url);
      return filtered;
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotations for URL ${url}:`, error);
      throw error;
    }
  }

  async create(annotation) {
    try {
      const annotations = await this._getStorage();
      const now = Date.now();

      const newAnnotation = {
        ...annotation,
        id: this.nextId++,
        createdAt: now,
        updatedAt: now,
        tags: annotation.tags || [],
        color: annotation.color || 'yellow',
      };

      annotations.push(newAnnotation);
      await this._saveStorage(annotations);

      return newAnnotation;
    } catch (error) {
      console.error('[LocalAdapter] Error creating annotation:', error);
      throw error;
    }
  }

  async update(id, updates) {
    try {
      const annotations = await this._getStorage();
      const index = annotations.findIndex(ann => ann.id === parseInt(id));

      if (index === -1) {
        throw new Error(`Annotation ${id} not found`);
      }

      annotations[index] = {
        ...annotations[index],
        ...updates,
        updatedAt: Date.now(),
      };

      await this._saveStorage(annotations);
      return annotations[index];
    } catch (error) {
      console.error(`[LocalAdapter] Error updating annotation ${id}:`, error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const annotations = await this._getStorage();
      const filtered = annotations.filter(ann => ann.id !== parseInt(id));

      if (filtered.length === annotations.length) {
        return false;
      }

      await this._saveStorage(filtered);
      return true;
    } catch (error) {
      console.error(`[LocalAdapter] Error deleting annotation ${id}:`, error);
      return false;
    }
  }

  async search(query) {
    try {
      const annotations = await this._getStorage();
      const lowerQuery = query.toLowerCase();

      const results = annotations.filter(ann => {
        const content = (ann.content || '').toLowerCase();
        const title = (ann.title || '').toLowerCase();
        const tags = (ann.tags || []).join(' ').toLowerCase();

        return (
          content.includes(lowerQuery) || title.includes(lowerQuery) || tags.includes(lowerQuery)
        );
      });

      return results;
    } catch (error) {
      console.error('[LocalAdapter] Error searching annotations:', error);
      throw error;
    }
  }

  async filter(filters) {
    try {
      const annotations = await this._getStorage();

      const results = annotations.filter(ann => {
        // Filter by URL
        if (filters.url && ann.url !== filters.url) {
          return false;
        }

        // Filter by tags (match any tag)
        if (filters.tags && filters.tags.length > 0) {
          const hasTags = filters.tags.some(tag => (ann.tags || []).includes(tag));
          if (!hasTags) {
            return false;
          }
        }

        // Filter by color
        if (filters.color && ann.color !== filters.color) {
          return false;
        }

        // Filter by date range
        if (filters.startDate && ann.createdAt < filters.startDate) {
          return false;
        }
        if (filters.endDate && ann.createdAt > filters.endDate) {
          return false;
        }

        return true;
      });

      return results;
    } catch (error) {
      console.error('[LocalAdapter] Error filtering annotations:', error);
      throw error;
    }
  }

  async count() {
    try {
      const annotations = await this._getStorage();
      return annotations.length;
    } catch (error) {
      console.error('[LocalAdapter] Error counting annotations:', error);
      throw error;
    }
  }

  async clear() {
    try {
      await this._saveStorage([]);
    } catch (error) {
      console.error('[LocalAdapter] Error clearing annotations:', error);
      throw error;
    }
  }

  async import(annotations) {
    try {
      // Assign new IDs to imported annotations
      const withIds = annotations.map(ann => ({
        ...ann,
        id: this.nextId++,
      }));

      await this._saveStorage(withIds);
      return withIds.length;
    } catch (error) {
      console.error('[LocalAdapter] Error importing annotations:', error);
      throw error;
    }
  }

  /** Get annotations linked to a specific project (Task 5.15) */
  async getByProjectId(projectId) {
    try {
      const annotations = await this._getStorage();
      return annotations.filter(ann => (ann.projectIds || []).includes(projectId));
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotations for project:`, error);
      throw error;
    }
  }

  /** Link an annotation to a citation project (Task 5.15) */
  async linkToProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = annotation.projectIds || [];
      if (!projectIds.includes(projectId)) {
        projectIds.push(projectId);
        return await this.update(annotationId, { projectIds });
      }
      return annotation;
    } catch (error) {
      console.error(`[LocalAdapter] Error linking annotation:`, error);
      throw error;
    }
  }

  /** Unlink an annotation from a citation project (Task 5.15) */
  async unlinkFromProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = (annotation.projectIds || []).filter(id => id !== projectId);
      return await this.update(annotationId, { projectIds });
    } catch (error) {
      console.error(`[LocalAdapter] Error unlinking annotation:`, error);
      throw error;
    }
  }
}

/**
 * Factory function to get the appropriate storage adapter
 * based on current settings
 *
 * @param {string} mode - 'local' or 'indexeddb'
 * @returns {BaseStorageAdapter} Storage adapter instance
 */
export function getStorageAdapter(mode = 'local') {
  if (mode === 'indexeddb') {
    return new DexieStorageAdapter();
  } else {
    return new LocalStorageAdapter();
  }
}

export { BaseStorageAdapter, DexieStorageAdapter, LocalStorageAdapter };
