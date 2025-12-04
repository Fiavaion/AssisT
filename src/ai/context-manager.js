/**
 * Context Manager for AssisT LLM Edition
 *
 * Manages rolling context windows for:
 * - Reading partner conversations
 * - Socratic tutoring sessions
 * - Document understanding
 * - Cross-session memory (cognitive profile)
 *
 * @module ai/context-manager
 */

// Maximum context sizes (in characters) for different purposes
const CONTEXT_LIMITS = {
  conversation: 8000,   // Chat/tutoring context
  document: 16000,      // Current document understanding
  summary: 4000,        // Condensed context
  profile: 2000         // User profile context
};

/**
 * Individual context window
 */
class ContextWindow {
  constructor(maxSize = 8000) {
    this.maxSize = maxSize;
    this.entries = [];
    this.metadata = {};
  }

  /**
   * Add entry to context
   * @param {string} role - 'user', 'assistant', 'system', or 'document'
   * @param {string} content - The content
   * @param {Object} meta - Optional metadata
   */
  add(role, content, meta = {}) {
    this.entries.push({
      role,
      content,
      timestamp: Date.now(),
      ...meta
    });

    this._trimToSize();
  }

  /**
   * Get formatted context for LLM prompt
   * @returns {string}
   */
  getFormatted() {
    return this.entries.map(e => {
      const prefix = {
        user: 'User',
        assistant: 'Assistant',
        system: 'Context',
        document: 'Document'
      }[e.role] || e.role;

      return `${prefix}: ${e.content}`;
    }).join('\n\n');
  }

  /**
   * Get entries as array
   * @returns {Array}
   */
  getEntries() {
    return [...this.entries];
  }

  /**
   * Get current size in characters
   * @returns {number}
   */
  getSize() {
    return this.entries.reduce((sum, e) => sum + e.content.length, 0);
  }

  /**
   * Trim context to fit within size limit
   * @private
   */
  _trimToSize() {
    while (this.getSize() > this.maxSize && this.entries.length > 1) {
      // Remove oldest non-system entries first
      const idx = this.entries.findIndex(e => e.role !== 'system');
      if (idx >= 0) {
        this.entries.splice(idx, 1);
      } else {
        // If only system entries, remove oldest
        this.entries.shift();
      }
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries = [];
    this.metadata = {};
  }

  /**
   * Set metadata
   * @param {string} key
   * @param {any} value
   */
  setMeta(key, value) {
    this.metadata[key] = value;
  }

  /**
   * Get metadata
   * @param {string} key
   * @returns {any}
   */
  getMeta(key) {
    return this.metadata[key];
  }
}

/**
 * Context Manager for managing multiple context windows
 */
export class ContextManager {
  constructor() {
    this.windows = new Map();
    this.globalContext = new ContextWindow(CONTEXT_LIMITS.profile);
  }

  /**
   * Get or create a context window
   * @param {string} windowId - Unique identifier for the context
   * @param {string} type - Type of context (conversation, document, summary)
   * @returns {ContextWindow}
   */
  getWindow(windowId, type = 'conversation') {
    if (!this.windows.has(windowId)) {
      const maxSize = CONTEXT_LIMITS[type] || CONTEXT_LIMITS.conversation;
      this.windows.set(windowId, new ContextWindow(maxSize));
    }
    return this.windows.get(windowId);
  }

  /**
   * Add to a context window
   * @param {string} windowId
   * @param {string} role
   * @param {string} content
   * @param {Object} meta
   */
  addToWindow(windowId, role, content, meta = {}) {
    const window = this.getWindow(windowId);
    window.add(role, content, meta);
  }

  /**
   * Get formatted context for a window
   * @param {string} windowId
   * @returns {string}
   */
  getFormattedContext(windowId) {
    const window = this.windows.get(windowId);
    return window ? window.getFormatted() : '';
  }

  /**
   * Build a complete prompt with context
   * @param {string} windowId - Context window to use
   * @param {string} systemPrompt - System instructions
   * @param {string} userMessage - Current user message
   * @returns {string}
   */
  buildPrompt(windowId, systemPrompt, userMessage) {
    const context = this.getFormattedContext(windowId);
    const globalCtx = this.globalContext.getFormatted();

    let prompt = '';

    if (systemPrompt) {
      prompt += `System: ${systemPrompt}\n\n`;
    }

    if (globalCtx) {
      prompt += `User Profile:\n${globalCtx}\n\n`;
    }

    if (context) {
      prompt += `Conversation History:\n${context}\n\n`;
    }

    prompt += `User: ${userMessage}\n\nAssistant:`;

    return prompt;
  }

  /**
   * Add to global context (user profile, preferences)
   * @param {string} key
   * @param {string} value
   */
  setGlobalContext(key, value) {
    this.globalContext.setMeta(key, value);
    this.globalContext.add('system', `${key}: ${value}`);
  }

  /**
   * Clear a specific context window
   * @param {string} windowId
   */
  clearWindow(windowId) {
    if (this.windows.has(windowId)) {
      this.windows.get(windowId).clear();
    }
  }

  /**
   * Clear all context windows
   */
  clearAll() {
    this.windows.clear();
  }

  /**
   * Clear everything including global context
   */
  reset() {
    this.clearAll();
    this.globalContext.clear();
  }

  /**
   * Get list of active context windows
   * @returns {Array}
   */
  getActiveWindows() {
    return Array.from(this.windows.entries()).map(([id, window]) => ({
      id,
      size: window.getSize(),
      entries: window.entries.length,
      metadata: window.metadata
    }));
  }

  /**
   * Create a document context from page content
   * @param {string} windowId
   * @param {string} content
   * @param {Object} meta - Document metadata (title, url, etc.)
   */
  setDocumentContext(windowId, content, meta = {}) {
    const window = this.getWindow(windowId, 'document');
    window.clear();
    window.metadata = meta;

    // Split large documents into chunks
    if (content.length > CONTEXT_LIMITS.document) {
      // Store truncated version with note
      window.add('document', content.slice(0, CONTEXT_LIMITS.document - 100));
      window.add('system', '[Document truncated for context limit]');
    } else {
      window.add('document', content);
    }
  }

  /**
   * Summarize and compress a context window
   * @param {string} windowId
   * @param {function} summarizer - Async function to summarize text
   * @returns {Promise<void>}
   */
  async compressContext(windowId, summarizer) {
    const window = this.windows.get(windowId);
    if (!window || window.entries.length < 5) return;

    // Get all entries except the last 2
    const toSummarize = window.entries.slice(0, -2);
    const toKeep = window.entries.slice(-2);

    if (toSummarize.length === 0) return;

    const textToSummarize = toSummarize
      .map(e => `${e.role}: ${e.content}`)
      .join('\n');

    try {
      const summary = await summarizer(textToSummarize);

      window.entries = [
        { role: 'system', content: `Previous context summary: ${summary}`, timestamp: Date.now() },
        ...toKeep
      ];

      console.log(`[ContextManager] Compressed ${windowId}: ${toSummarize.length} entries → 1 summary`);
    } catch (error) {
      console.error('[ContextManager] Compression failed:', error);
    }
  }

  /**
   * Export context for persistence
   * @returns {Object}
   */
  export() {
    const exported = {
      global: {
        entries: this.globalContext.entries,
        metadata: this.globalContext.metadata
      },
      windows: {}
    };

    for (const [id, window] of this.windows) {
      exported.windows[id] = {
        entries: window.entries,
        metadata: window.metadata
      };
    }

    return exported;
  }

  /**
   * Import context from persistence
   * @param {Object} data
   */
  import(data) {
    if (data.global) {
      this.globalContext.entries = data.global.entries || [];
      this.globalContext.metadata = data.global.metadata || {};
    }

    if (data.windows) {
      for (const [id, windowData] of Object.entries(data.windows)) {
        const window = this.getWindow(id);
        window.entries = windowData.entries || [];
        window.metadata = windowData.metadata || {};
      }
    }
  }
}

// Singleton instance
let managerInstance = null;

/**
 * Get the context manager singleton
 * @returns {ContextManager}
 */
export function getContextManager() {
  if (!managerInstance) {
    managerInstance = new ContextManager();
  }
  return managerInstance;
}

export { ContextWindow, CONTEXT_LIMITS };
export default ContextManager;
