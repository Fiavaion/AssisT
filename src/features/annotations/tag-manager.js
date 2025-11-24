/**
 * @fileoverview Tag Manager for Annotations
 *
 * Provides tag management functionality for annotations and sticky notes:
 * - Tag input with autocomplete from existing tags
 * - Tag persistence in chrome.storage.local
 * - Tag rendering as colored pills
 * - Tag filtering support
 *
 * FEATURES:
 * - Autocomplete dropdown for existing tags
 * - Color assignment based on tag name hash
 * - Keyboard accessible (Enter to add tag, Backspace to remove)
 * - WCAG 2.2 Level AA compliant
 *
 * @module features/annotations/tag-manager
 */

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Tag color palette
 * Colors cycle based on tag name hash for consistency
 */
const TAG_COLORS = [
  { name: 'blue', bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  { name: 'green', bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  { name: 'orange', bg: '#fed7aa', border: '#f97316', text: '#9a3412' },
  { name: 'purple', bg: '#e9d5ff', border: '#a855f7', text: '#6b21a8' },
  { name: 'pink', bg: '#fce7f3', border: '#ec4899', text: '#9f1239' },
];

/** Storage key for tag list */
const TAG_STORAGE_KEY = 'assist_annotation_tags';

// ============================================================
// TAG STORAGE (PERSISTENCE)
// ============================================================

/**
 * Get existing tags from storage
 * @returns {Promise<Array<string>>} Array of tag names
 */
export async function getExistingTags() {
  return new Promise(resolve => {
    chrome.storage.local.get([TAG_STORAGE_KEY], result => {
      const tags = result[TAG_STORAGE_KEY] || [];
      resolve(tags);
    });
  });
}

/**
 * Save a tag to persistent storage
 * @param {string} tagName - Tag name to save
 * @returns {Promise<void>}
 */
export async function saveTag(tagName) {
  try {
    const existingTags = await getExistingTags();

    // Normalize tag name (lowercase, trim)
    const normalizedTag = tagName.toLowerCase().trim();

    // Don't add duplicates
    if (!existingTags.includes(normalizedTag)) {
      existingTags.push(normalizedTag);

      // Save updated list
      await new Promise(resolve => {
        chrome.storage.local.set({ [TAG_STORAGE_KEY]: existingTags }, resolve);
      });

      console.log('[TagManager] Saved new tag:', normalizedTag);
    }
  } catch (error) {
    console.error('[TagManager] Error saving tag:', error);
  }
}

/**
 * Delete a tag from persistent storage
 * @param {string} tagName - Tag name to delete
 * @returns {Promise<void>}
 */
export async function deleteTag(tagName) {
  try {
    const existingTags = await getExistingTags();
    const normalizedTag = tagName.toLowerCase().trim();

    const filtered = existingTags.filter(tag => tag !== normalizedTag);

    await new Promise(resolve => {
      chrome.storage.local.set({ [TAG_STORAGE_KEY]: filtered }, resolve);
    });

    console.log('[TagManager] Deleted tag:', normalizedTag);
  } catch (error) {
    console.error('[TagManager] Error deleting tag:', error);
  }
}

// ============================================================
// TAG COLOR ASSIGNMENT
// ============================================================

/**
 * Get color theme for a tag based on its name hash
 * @param {string} tagName - Tag name
 * @returns {Object} Color theme object
 */
export function getTagColor(tagName) {
  // Hash the tag name to get consistent color
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = (hash << 5) - hash + tagName.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Get color from palette using hash
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

// ============================================================
// TAG INPUT UI (WITH AUTOCOMPLETE)
// ============================================================

/**
 * Create a tag input component with autocomplete
 * @param {HTMLElement} container - Container element to attach input to
 * @param {Array<string>} initialTags - Initial tags to display
 * @param {Function} onChange - Callback when tags change (receives array of tag names)
 * @returns {Object} API object with getTags() method
 */
export function createTagInput(container, initialTags = [], onChange = null) {
  // Normalize initial tags
  const currentTags = initialTags.map(tag => tag.toLowerCase().trim()).filter(tag => tag);

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'assist-tag-input-wrapper';
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', 'Tag input');

  // Create tag display container
  const tagDisplay = document.createElement('div');
  tagDisplay.className = 'assist-tag-display';
  tagDisplay.setAttribute('aria-live', 'polite');

  // Create input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'assist-tag-input';
  input.placeholder = 'Add tags (comma-separated)...';
  input.setAttribute('aria-label', 'Add tags');
  input.setAttribute('autocomplete', 'off');

  // Create autocomplete dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'assist-tag-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', 'Tag suggestions');
  dropdown.style.display = 'none';

  // Assemble wrapper
  wrapper.appendChild(tagDisplay);
  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);
  container.appendChild(wrapper);

  // Render initial tags
  renderTags();

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  /**
   * Render tag pills in display container
   */
  function renderTags() {
    tagDisplay.innerHTML = '';

    currentTags.forEach(tagName => {
      const pill = createTagPill(tagName, () => {
        removeTag(tagName);
      });
      tagDisplay.appendChild(pill);
    });
  }

  /**
   * Add a tag
   * @param {string} tagName - Tag name to add
   */
  function addTag(tagName) {
    const normalized = tagName.toLowerCase().trim();

    if (!normalized) {
      return;
    }

    // Don't add duplicates
    if (currentTags.includes(normalized)) {
      return;
    }

    // Add to current tags
    currentTags.push(normalized);

    // Save to persistent storage
    saveTag(normalized);

    // Re-render
    renderTags();

    // Trigger onChange callback
    if (onChange) {
      onChange(currentTags);
    }

    console.log('[TagInput] Added tag:', normalized);
  }

  /**
   * Remove a tag
   * @param {string} tagName - Tag name to remove
   */
  function removeTag(tagName) {
    const index = currentTags.indexOf(tagName);
    if (index !== -1) {
      currentTags.splice(index, 1);
      renderTags();

      // Trigger onChange callback
      if (onChange) {
        onChange(currentTags);
      }

      console.log('[TagInput] Removed tag:', tagName);
    }
  }

  /**
   * Show autocomplete dropdown
   * @param {Array<string>} suggestions - Tag suggestions
   */
  async function showAutocomplete(query) {
    const existingTags = await getExistingTags();

    // Filter tags based on query
    const lowerQuery = query.toLowerCase().trim();
    const suggestions = existingTags.filter(tag => {
      return tag.includes(lowerQuery) && !currentTags.includes(tag);
    });

    if (suggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    // Render suggestions
    dropdown.innerHTML = '';
    suggestions.forEach(tagName => {
      const option = document.createElement('div');
      option.className = 'assist-tag-option';
      option.textContent = tagName;
      option.setAttribute('role', 'option');
      option.setAttribute('tabindex', '0');

      // Click to select
      option.addEventListener('click', () => {
        addTag(tagName);
        input.value = '';
        dropdown.style.display = 'none';
        input.focus();
      });

      // Keyboard navigation
      option.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addTag(tagName);
          input.value = '';
          dropdown.style.display = 'none';
          input.focus();
        }
      });

      dropdown.appendChild(option);
    });

    dropdown.style.display = 'block';
  }

  /**
   * Hide autocomplete dropdown
   */
  function hideAutocomplete() {
    dropdown.style.display = 'none';
  }

  // ============================================================
  // INPUT EVENT LISTENERS
  // ============================================================

  // Handle input changes (trigger autocomplete)
  input.addEventListener('input', e => {
    const value = e.target.value;

    if (value.trim()) {
      showAutocomplete(value);
    } else {
      hideAutocomplete();
    }
  });

  // Handle Enter key (add tag)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const value = input.value.trim();

      if (value) {
        // Check if value contains commas (multiple tags)
        if (value.includes(',')) {
          const tags = value.split(',').map(t => t.trim()).filter(t => t);
          tags.forEach(tag => addTag(tag));
        } else {
          addTag(value);
        }

        input.value = '';
        hideAutocomplete();
      }
    } else if (e.key === 'Backspace' && input.value === '') {
      // Backspace on empty input removes last tag
      if (currentTags.length > 0) {
        removeTag(currentTags[currentTags.length - 1]);
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  // Handle blur (add tag if input has value)
  input.addEventListener('blur', () => {
    setTimeout(() => {
      const value = input.value.trim();
      if (value) {
        // Check if value contains commas (multiple tags)
        if (value.includes(',')) {
          const tags = value.split(',').map(t => t.trim()).filter(t => t);
          tags.forEach(tag => addTag(tag));
        } else {
          addTag(value);
        }
        input.value = '';
      }
      hideAutocomplete();
    }, 200); // Delay to allow clicking dropdown options
  });

  // Hide dropdown on focus loss
  input.addEventListener('focusout', () => {
    setTimeout(() => {
      hideAutocomplete();
    }, 200);
  });

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    /**
     * Get current tags
     * @returns {Array<string>} Array of tag names
     */
    getTags() {
      return [...currentTags];
    },

    /**
     * Set tags programmatically
     * @param {Array<string>} tags - Array of tag names
     */
    setTags(tags) {
      currentTags.length = 0;
      tags.forEach(tag => currentTags.push(tag.toLowerCase().trim()));
      renderTags();

      if (onChange) {
        onChange(currentTags);
      }
    },

    /**
     * Destroy the tag input (cleanup)
     */
    destroy() {
      wrapper.remove();
    },
  };
}

// ============================================================
// TAG PILL RENDERING
// ============================================================

/**
 * Create a tag pill element
 * @param {string} tagName - Tag name
 * @param {Function} onRemove - Callback when remove button is clicked
 * @returns {HTMLElement} Tag pill element
 */
export function createTagPill(tagName, onRemove = null) {
  const color = getTagColor(tagName);

  const pill = document.createElement('span');
  pill.className = 'assist-tag-pill';
  pill.setAttribute('role', 'button');
  pill.setAttribute('aria-label', `Tag: ${tagName}`);

  // Apply color theme
  pill.style.backgroundColor = color.bg;
  pill.style.borderColor = color.border;
  pill.style.color = color.text;

  // Tag text
  const text = document.createElement('span');
  text.className = 'assist-tag-text';
  text.textContent = tagName;

  pill.appendChild(text);

  // Remove button (if callback provided)
  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'assist-tag-remove';
    removeBtn.innerHTML = '×';
    removeBtn.setAttribute('aria-label', `Remove tag ${tagName}`);
    removeBtn.setAttribute('type', 'button');

    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      onRemove();
    });

    pill.appendChild(removeBtn);
  }

  return pill;
}

/**
 * Render tags as pills in a container
 * @param {Array<string>} tags - Array of tag names
 * @param {HTMLElement} container - Container element
 */
export function renderTagPills(tags, container) {
  // Clear container
  container.innerHTML = '';

  if (!tags || tags.length === 0) {
    return;
  }

  // Create pills
  tags.forEach(tagName => {
    const pill = createTagPill(tagName);
    container.appendChild(pill);
  });
}

// ============================================================
// TAG FILTERING
// ============================================================

/**
 * Filter annotations by tag
 * @param {Array<Object>} annotations - Array of annotation objects
 * @param {string} tagName - Tag name to filter by
 * @returns {Array<Object>} Filtered annotations
 */
export function filterByTag(annotations, tagName) {
  const normalized = tagName.toLowerCase().trim();

  return annotations.filter(ann => {
    const tags = ann.tags || [];
    return tags.includes(normalized);
  });
}

/**
 * Get all unique tags from annotations
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {Array<string>} Array of unique tag names
 */
export function getUniqueTags(annotations) {
  const tagSet = new Set();

  annotations.forEach(ann => {
    const tags = ann.tags || [];
    tags.forEach(tag => tagSet.add(tag));
  });

  return Array.from(tagSet).sort();
}

/**
 * Get tag frequency map (tag -> count)
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {Map<string, number>} Map of tag names to usage count
 */
export function getTagFrequency(annotations) {
  const frequency = new Map();

  annotations.forEach(ann => {
    const tags = ann.tags || [];
    tags.forEach(tag => {
      frequency.set(tag, (frequency.get(tag) || 0) + 1);
    });
  });

  return frequency;
}

// ============================================================
// STYLES (INJECTED INTO PAGE)
// ============================================================

/**
 * Inject tag manager CSS into page
 */
export function injectTagStyles() {
  const styleId = 'assist-tag-manager-styles';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .assist-tag-input-wrapper {
      position: relative;
      width: 100%;
    }

    .assist-tag-display {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
      min-height: 24px;
    }

    .assist-tag-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 12px;
      border: 1px solid;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
      transition: all 0.15s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .assist-tag-pill:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .assist-tag-text {
      user-select: none;
    }

    .assist-tag-remove {
      background: transparent;
      border: none;
      font-size: 16px;
      font-weight: bold;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.15s;
      color: inherit;
      opacity: 0.7;
    }

    .assist-tag-remove:hover {
      background: rgba(0, 0, 0, 0.1);
      opacity: 1;
    }

    .assist-tag-remove:focus {
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }

    .assist-tag-input {
      width: 100%;
      padding: 8px 12px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
      transition: border-color 0.2s;
    }

    .assist-tag-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .assist-tag-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 4px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
    }

    .assist-tag-option {
      padding: 8px 12px;
      font-size: 14px;
      color: #374151;
      cursor: pointer;
      transition: background 0.15s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .assist-tag-option:hover {
      background: #f3f4f6;
    }

    .assist-tag-option:focus {
      outline: none;
      background: #e5e7eb;
    }

    /* Scrollbar styling for dropdown */
    .assist-tag-dropdown::-webkit-scrollbar {
      width: 6px;
    }

    .assist-tag-dropdown::-webkit-scrollbar-thumb {
      background-color: #d1d5db;
      border-radius: 3px;
    }

    .assist-tag-dropdown::-webkit-scrollbar-thumb:hover {
      background-color: #9ca3af;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// AUTO-INITIALIZATION
// ============================================================

// Inject styles when module loads
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectTagStyles);
  } else {
    injectTagStyles();
  }
}
