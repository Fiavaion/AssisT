/**
 * @fileoverview Sticky Note Component
 *
 * ARCHITECTURAL PATTERN: Self-Initializing Feature Module
 *
 * Provides draggable sticky notes that persist position and content
 * across page reloads using the storage adapter system.
 *
 * FEATURES:
 * - Draggable sticky notes with mouse events
 * - Position persistence (x, y coordinates)
 * - URL-based filtering (notes appear only on their creation page)
 * - Storage adapter integration (IndexedDB or chrome.storage.local)
 * - WCAG 2.2 Level AA compliant (keyboard accessible, ARIA labels)
 *
 * DEPENDENCIES:
 * - storage-adapter.js (DexieStorageAdapter or LocalStorageAdapter)
 * - settings-manager.js (for storage mode selection)
 *
 * @module features/annotations/sticky-note
 * @see {@link storage-adapter.js} - Storage backend
 */

import { getStorageAdapter } from './storage-adapter.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {BaseStorageAdapter} Current storage adapter instance */
let storageAdapter = null;

/** @type {string} Current storage mode ('local' or 'indexeddb') */
let storageMode = 'local';

/** @type {Map<number, HTMLElement>} Map of note ID to DOM element */
const activeNotes = new Map();

/** @type {Object|null} Currently dragging note state */
let dragState = null;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the sticky note system
 * - Load storage adapter based on settings
 * - Load existing notes for current URL
 * - Set up Chrome message listeners
 */
async function initializeStickyNotes() {
  console.log('[StickyNotes] Initializing...');

  try {
    // Load storage mode from settings
    await loadStorageMode();

    // Initialize storage adapter
    storageAdapter = getStorageAdapter(storageMode);
    console.log(`[StickyNotes] Using storage mode: ${storageMode}`);

    // Load existing notes for current page
    await loadNotesForCurrentPage();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);

    // Listen for storage mode changes
    chrome.storage.local.onChanged.addListener(handleStorageChange);

    console.log('[StickyNotes] Initialized successfully');
  } catch (error) {
    console.error('[StickyNotes] Initialization failed:', error);
  }
}

/**
 * Load storage mode from settings
 */
async function loadStorageMode() {
  return new Promise(resolve => {
    chrome.storage.local.get(['annotationStorageMode'], result => {
      storageMode = result.annotationStorageMode || 'local';
      resolve();
    });
  });
}

/**
 * Load all notes for the current page URL
 */
async function loadNotesForCurrentPage() {
  try {
    const currentUrl = window.location.href;
    const notes = await storageAdapter.getByUrl(currentUrl);

    console.log(`[StickyNotes] Loaded ${notes.length} notes for current page`);

    // Render each note
    for (const note of notes) {
      if (note.type === 'note') {
        renderStickyNote(note);
      }
    }
  } catch (error) {
    console.error('[StickyNotes] Error loading notes:', error);
  }
}

// ============================================================
// STICKY NOTE CREATION & RENDERING
// ============================================================

/**
 * Create a new sticky note
 * @param {Object} options - Note options
 * @param {number} options.x - X position in pixels
 * @param {number} options.y - Y position in pixels
 * @param {string} [options.content=''] - Initial content
 * @param {string} [options.color='yellow'] - Note color
 * @returns {Promise<Object>} Created note data
 */
export async function createStickyNote({ x, y, content = '', color = 'yellow' }) {
  try {
    const noteData = {
      type: 'note',
      url: window.location.href,
      x,
      y,
      content,
      color,
      width: 200, // Default width
      height: 200, // Default height
    };

    // Save to storage
    const savedNote = await storageAdapter.create(noteData);
    console.log('[StickyNotes] Created note:', savedNote.id);

    // Render on page
    renderStickyNote(savedNote);

    return savedNote;
  } catch (error) {
    console.error('[StickyNotes] Error creating note:', error);
    throw error;
  }
}

/**
 * Render a sticky note on the page
 * @param {Object} note - Note data from storage
 */
function renderStickyNote(note) {
  // Don't render duplicates
  if (activeNotes.has(note.id)) {
    return;
  }

  // Create sticky note container
  const noteElement = document.createElement('div');
  noteElement.className = 'assist-sticky-note';
  noteElement.dataset.noteId = note.id;
  noteElement.style.left = `${note.x}px`;
  noteElement.style.top = `${note.y}px`;
  noteElement.style.width = `${note.width}px`;
  noteElement.style.height = `${note.height}px`;
  noteElement.setAttribute('role', 'article');
  noteElement.setAttribute('aria-label', 'Sticky note');
  noteElement.setAttribute('tabindex', '0');

  // Apply color theme
  applyNoteColor(noteElement, note.color);

  // Create header (drag handle)
  const header = document.createElement('div');
  header.className = 'assist-sticky-note-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-label', 'Drag to move note');
  header.setAttribute('tabindex', '0');

  // Color picker button
  const colorBtn = document.createElement('button');
  colorBtn.className = 'assist-sticky-note-color-btn';
  colorBtn.innerHTML = '🎨';
  colorBtn.setAttribute('aria-label', 'Change note color');
  colorBtn.setAttribute('title', 'Change color');
  colorBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleColorPicker(note.id, colorBtn);
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'assist-sticky-note-delete';
  deleteBtn.innerHTML = '×';
  deleteBtn.setAttribute('aria-label', 'Delete note');
  deleteBtn.setAttribute('title', 'Delete note');
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteStickyNote(note.id);
  });

  header.appendChild(colorBtn);
  header.appendChild(deleteBtn);

  // Create rich text toolbar
  const toolbar = createRichTextToolbar(note.id);

  // Create content area (contentEditable with HTML support)
  const content = document.createElement('div');
  content.className = 'assist-sticky-note-content';
  content.contentEditable = 'true';
  content.innerHTML = note.content || '';
  content.setAttribute('role', 'textbox');
  content.setAttribute('aria-label', 'Note content');
  content.setAttribute('aria-multiline', 'true');

  // Save content on blur (now saves HTML)
  content.addEventListener('blur', () => {
    saveNoteContent(note.id, content.innerHTML);
  });

  // Handle keyboard shortcuts for formatting
  content.addEventListener('keydown', e => {
    handleFormattingShortcuts(e);
  });

  // Show/hide toolbar on focus/blur
  content.addEventListener('focus', () => {
    toolbar.classList.add('visible');
  });

  // Create resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'assist-sticky-note-resize-handle';
  resizeHandle.setAttribute('role', 'button');
  resizeHandle.setAttribute('aria-label', 'Resize note');
  resizeHandle.setAttribute('title', 'Drag to resize');
  resizeHandle.setAttribute('tabindex', '0');

  // Assemble note
  noteElement.appendChild(header);
  noteElement.appendChild(toolbar);
  noteElement.appendChild(content);
  noteElement.appendChild(resizeHandle);

  // Add drag event listeners
  attachDragListeners(noteElement, header, note.id);

  // Add resize event listeners
  attachResizeListeners(noteElement, resizeHandle, note.id);

  // Add to DOM
  document.body.appendChild(noteElement);

  // Track active note
  activeNotes.set(note.id, noteElement);

  console.log('[StickyNotes] Rendered note:', note.id);
}

/**
 * Apply color theme to sticky note
 * @param {HTMLElement} noteElement - Note element
 * @param {string} color - Color name
 */
function applyNoteColor(noteElement, color) {
  const colorMap = {
    yellow: { bg: '#fef3c7', border: '#fbbf24' },
    blue: { bg: '#dbeafe', border: '#3b82f6' },
    green: { bg: '#d1fae5', border: '#10b981' },
    pink: { bg: '#fce7f3', border: '#ec4899' },
    purple: { bg: '#e9d5ff', border: '#a855f7' },
  };

  const theme = colorMap[color] || colorMap.yellow;
  noteElement.style.backgroundColor = theme.bg;
  noteElement.style.borderColor = theme.border;
}

/**
 * Create rich text formatting toolbar
 * @param {number} noteId - Note ID
 * @returns {HTMLElement} Toolbar element
 */
function createRichTextToolbar(noteId) {
  const toolbar = document.createElement('div');
  toolbar.className = 'assist-sticky-note-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text formatting');

  // Formatting buttons
  const buttons = [
    { command: 'bold', icon: '<b>B</b>', title: 'Bold (Ctrl+B)', ariaLabel: 'Bold' },
    { command: 'italic', icon: '<i>I</i>', title: 'Italic (Ctrl+I)', ariaLabel: 'Italic' },
    {
      command: 'underline',
      icon: '<u>U</u>',
      title: 'Underline (Ctrl+U)',
      ariaLabel: 'Underline',
    },
    {
      command: 'insertUnorderedList',
      icon: '•',
      title: 'Bullet list',
      ariaLabel: 'Bullet list',
    },
    {
      command: 'insertOrderedList',
      icon: '1.',
      title: 'Numbered list',
      ariaLabel: 'Numbered list',
    },
  ];

  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = 'assist-toolbar-btn';
    button.innerHTML = btn.icon;
    button.title = btn.title;
    button.setAttribute('aria-label', btn.ariaLabel);
    button.setAttribute('type', 'button');
    button.dataset.command = btn.command;

    button.addEventListener('mousedown', e => {
      // Prevent blur on content area
      e.preventDefault();
    });

    button.addEventListener('click', () => {
      executeFormatCommand(btn.command);
    });

    toolbar.appendChild(button);
  });

  return toolbar;
}

/**
 * Execute a formatting command
 * @param {string} command - Command name (bold, italic, etc.)
 */
function executeFormatCommand(command) {
  try {
    document.execCommand(command, false, null);
  } catch (error) {
    console.error('[StickyNotes] Format command error:', error);
  }
}

/**
 * Handle keyboard shortcuts for formatting
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleFormattingShortcuts(e) {
  // Check for Ctrl/Cmd + key combinations
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  if (!modKey) return;

  const shortcuts = {
    b: 'bold',
    i: 'italic',
    u: 'underline',
  };

  const command = shortcuts[e.key.toLowerCase()];
  if (command) {
    e.preventDefault();
    executeFormatCommand(command);
  }
}

// ============================================================
// COLOR PICKER FUNCTIONALITY
// ============================================================

/**
 * Toggle color picker dropdown for a sticky note
 * @param {number} noteId - Note ID
 * @param {HTMLElement} colorBtn - Color button element
 */
function toggleColorPicker(noteId, colorBtn) {
  // Check if picker already exists
  const existingPicker = document.getElementById(`color-picker-${noteId}`);
  if (existingPicker) {
    existingPicker.remove();
    return;
  }

  // Create color picker dropdown
  const picker = document.createElement('div');
  picker.id = `color-picker-${noteId}`;
  picker.className = 'assist-color-picker';
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', 'Choose note color');

  // Define available colors
  const colors = [
    { name: 'yellow', label: 'Yellow', emoji: '💛' },
    { name: 'blue', label: 'Blue', emoji: '💙' },
    { name: 'green', label: 'Green', emoji: '💚' },
    { name: 'pink', label: 'Pink', emoji: '💗' },
    { name: 'purple', label: 'Purple', emoji: '💜' },
  ];

  // Create color option buttons
  colors.forEach(color => {
    const option = document.createElement('button');
    option.className = 'assist-color-option';
    option.innerHTML = `${color.emoji} ${color.label}`;
    option.setAttribute('aria-label', `Change to ${color.label}`);
    option.setAttribute('role', 'menuitem');
    option.dataset.color = color.name;

    option.addEventListener('click', async e => {
      e.stopPropagation();
      await changeNoteColor(noteId, color.name);
      picker.remove();
    });

    picker.appendChild(option);
  });

  // Position picker below the color button
  const rect = colorBtn.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = `${rect.bottom + 5}px`;
  picker.style.left = `${rect.left}px`;

  // Add to body
  document.body.appendChild(picker);

  // Close picker when clicking outside
  const closeHandler = e => {
    if (!picker.contains(e.target) && e.target !== colorBtn) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);

  console.log('[StickyNotes] Color picker opened for note:', noteId);
}

/**
 * Change the color of a sticky note
 * @param {number} noteId - Note ID
 * @param {string} color - New color name
 */
async function changeNoteColor(noteId, color) {
  try {
    // Update in storage
    await storageAdapter.update(noteId, { color });

    // Update in DOM
    const noteElement = activeNotes.get(noteId);
    if (noteElement) {
      applyNoteColor(noteElement, color);
    }

    console.log(`[StickyNotes] Changed color for note ${noteId} to ${color}`);
  } catch (error) {
    console.error('[StickyNotes] Error changing color:', error);
  }
}

// ============================================================
// DRAG & DROP FUNCTIONALITY
// ============================================================

/**
 * Attach drag event listeners to a sticky note
 * @param {HTMLElement} noteElement - Note element
 * @param {HTMLElement} dragHandle - Element that initiates drag (header)
 * @param {number} noteId - Note ID
 */
function attachDragListeners(noteElement, dragHandle, noteId) {
  let startX, startY, initialLeft, initialTop;

  const onMouseDown = e => {
    // Only drag from header, not from content area
    if (e.target !== dragHandle && !dragHandle.contains(e.target)) {
      return;
    }

    // Prevent text selection during drag
    e.preventDefault();

    // Record initial positions
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = noteElement.offsetLeft;
    initialTop = noteElement.offsetTop;

    // Set drag state
    dragState = {
      noteId,
      noteElement,
      startX,
      startY,
      initialLeft,
      initialTop,
    };

    // Add dragging class
    noteElement.classList.add('assist-dragging');

    // Attach move and up listeners to document
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('[StickyNotes] Drag started:', noteId);
  };

  const onMouseMove = e => {
    if (!dragState) return;

    // Calculate new position
    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;
    const newLeft = dragState.initialLeft + deltaX;
    const newTop = dragState.initialTop + deltaY;

    // Update position (constrain to viewport)
    const maxX = window.innerWidth - noteElement.offsetWidth;
    const maxY = window.innerHeight - noteElement.offsetHeight;

    noteElement.style.left = `${Math.max(0, Math.min(newLeft, maxX))}px`;
    noteElement.style.top = `${Math.max(0, Math.min(newTop, maxY))}px`;
  };

  const onMouseUp = () => {
    if (!dragState) return;

    // Remove dragging class
    noteElement.classList.remove('assist-dragging');

    // Save new position to storage
    const newX = parseInt(noteElement.style.left, 10);
    const newY = parseInt(noteElement.style.top, 10);
    saveNotePosition(noteId, newX, newY);

    // Clean up
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    dragState = null;

    console.log('[StickyNotes] Drag ended:', noteId, { x: newX, y: newY });
  };

  // Attach mousedown listener to header
  dragHandle.addEventListener('mousedown', onMouseDown);

  // Keyboard accessibility: Arrow keys to move
  noteElement.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      return;
    }

    e.preventDefault();
    const step = e.shiftKey ? 10 : 1; // Shift = faster movement

    let newLeft = parseInt(noteElement.style.left, 10);
    let newTop = parseInt(noteElement.style.top, 10);

    switch (e.key) {
      case 'ArrowLeft':
        newLeft = Math.max(0, newLeft - step);
        break;
      case 'ArrowRight':
        newLeft = Math.min(window.innerWidth - noteElement.offsetWidth, newLeft + step);
        break;
      case 'ArrowUp':
        newTop = Math.max(0, newTop - step);
        break;
      case 'ArrowDown':
        newTop = Math.min(window.innerHeight - noteElement.offsetHeight, newTop + step);
        break;
    }

    noteElement.style.left = `${newLeft}px`;
    noteElement.style.top = `${newTop}px`;

    // Save position (debounced)
    saveNotePosition(noteId, newLeft, newTop);
  });
}

// ============================================================
// RESIZE FUNCTIONALITY
// ============================================================

/**
 * Attach resize event listeners to a sticky note
 * @param {HTMLElement} noteElement - Note element
 * @param {HTMLElement} resizeHandle - Resize handle element
 * @param {number} noteId - Note ID
 */
function attachResizeListeners(noteElement, resizeHandle, noteId) {
  let startX, startY, initialWidth, initialHeight;
  let resizeState = null;

  const onMouseDown = e => {
    // Prevent text selection during resize
    e.preventDefault();
    e.stopPropagation();

    // Record initial positions and dimensions
    startX = e.clientX;
    startY = e.clientY;
    initialWidth = noteElement.offsetWidth;
    initialHeight = noteElement.offsetHeight;

    // Set resize state
    resizeState = {
      noteId,
      noteElement,
      startX,
      startY,
      initialWidth,
      initialHeight,
    };

    // Add resizing class
    noteElement.classList.add('assist-resizing');

    // Attach move and up listeners to document
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('[StickyNotes] Resize started:', noteId);
  };

  const onMouseMove = e => {
    if (!resizeState) return;

    // Calculate new dimensions
    const deltaX = e.clientX - resizeState.startX;
    const deltaY = e.clientY - resizeState.startY;
    const newWidth = Math.max(150, resizeState.initialWidth + deltaX); // Min width 150px
    const newHeight = Math.max(100, resizeState.initialHeight + deltaY); // Min height 100px

    // Apply new dimensions
    noteElement.style.width = `${newWidth}px`;
    noteElement.style.height = `${newHeight}px`;
  };

  const onMouseUp = () => {
    if (!resizeState) return;

    // Remove resizing class
    noteElement.classList.remove('assist-resizing');

    // Save new dimensions to storage
    const newWidth = parseInt(noteElement.style.width, 10);
    const newHeight = parseInt(noteElement.style.height, 10);
    saveNoteDimensions(noteId, newWidth, newHeight);

    // Clean up
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    resizeState = null;

    console.log('[StickyNotes] Resize ended:', noteId, { width: newWidth, height: newHeight });
  };

  // Attach mousedown listener to resize handle
  resizeHandle.addEventListener('mousedown', onMouseDown);

  // Keyboard accessibility: +/- keys to resize
  resizeHandle.addEventListener('keydown', e => {
    if (!['+', '=', '-', '_'].includes(e.key)) {
      return;
    }

    e.preventDefault();
    const step = e.shiftKey ? 20 : 10; // Shift = larger resize

    let newWidth = parseInt(noteElement.style.width, 10);
    let newHeight = parseInt(noteElement.style.height, 10);

    if (e.key === '+' || e.key === '=') {
      // Increase size
      newWidth += step;
      newHeight += step;
    } else if (e.key === '-' || e.key === '_') {
      // Decrease size
      newWidth = Math.max(150, newWidth - step);
      newHeight = Math.max(100, newHeight - step);
    }

    noteElement.style.width = `${newWidth}px`;
    noteElement.style.height = `${newHeight}px`;

    // Save dimensions
    saveNoteDimensions(noteId, newWidth, newHeight);
  });
}

// ============================================================
// PERSISTENCE (STORAGE)
// ============================================================

/**
 * Save note position to storage
 * @param {number} noteId - Note ID
 * @param {number} x - X position
 * @param {number} y - Y position
 */
async function saveNotePosition(noteId, x, y) {
  try {
    await storageAdapter.update(noteId, { x, y });
    console.log(`[StickyNotes] Saved position for note ${noteId}:`, { x, y });
  } catch (error) {
    console.error('[StickyNotes] Error saving position:', error);
  }
}

/**
 * Save note dimensions to storage
 * @param {number} noteId - Note ID
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 */
async function saveNoteDimensions(noteId, width, height) {
  try {
    await storageAdapter.update(noteId, { width, height });
    console.log(`[StickyNotes] Saved dimensions for note ${noteId}:`, { width, height });
  } catch (error) {
    console.error('[StickyNotes] Error saving dimensions:', error);
  }
}

/**
 * Save note content to storage
 * @param {number} noteId - Note ID
 * @param {string} content - Note content
 */
async function saveNoteContent(noteId, content) {
  try {
    await storageAdapter.update(noteId, { content });
    console.log(`[StickyNotes] Saved content for note ${noteId}`);
  } catch (error) {
    console.error('[StickyNotes] Error saving content:', error);
  }
}

/**
 * Delete a sticky note
 * @param {number} noteId - Note ID
 */
async function deleteStickyNote(noteId) {
  try {
    // Remove from storage
    await storageAdapter.delete(noteId);

    // Remove from DOM
    const noteElement = activeNotes.get(noteId);
    if (noteElement) {
      noteElement.remove();
      activeNotes.delete(noteId);
    }

    console.log('[StickyNotes] Deleted note:', noteId);
  } catch (error) {
    console.error('[StickyNotes] Error deleting note:', error);
  }
}

// ============================================================
// MESSAGE HANDLERS
// ============================================================

/**
 * Handle messages from popup or background script
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 * @param {Function} sendResponse - Response callback
 */
function handleMessage(message, sender, sendResponse) {
  if (message.action === 'createStickyNote') {
    // Create note at specified position or center of viewport
    const x = message.x || window.innerWidth / 2 - 100;
    const y = message.y || window.innerHeight / 2 - 100;

    createStickyNote({ x, y, content: message.content || '', color: message.color || 'yellow' })
      .then(note => {
        sendResponse({ success: true, noteId: note.id });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }

  if (message.action === 'deleteStickyNote') {
    deleteStickyNote(message.noteId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }

  if (message.action === 'reloadNotes') {
    loadNotesForCurrentPage()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }
}

/**
 * Handle storage changes (storage mode switch)
 * @param {Object} changes - Changed keys
 */
function handleStorageChange(changes) {
  if (changes.annotationStorageMode) {
    const newMode = changes.annotationStorageMode.newValue;
    console.log(`[StickyNotes] Storage mode changed to: ${newMode}`);

    // Reload with new adapter
    storageMode = newMode;
    storageAdapter = getStorageAdapter(storageMode);

    // Clear existing notes and reload
    activeNotes.forEach(noteElement => noteElement.remove());
    activeNotes.clear();
    loadNotesForCurrentPage();
  }
}

// ============================================================
// STYLES (INJECTED INTO PAGE)
// ============================================================

/**
 * Inject sticky note CSS into page
 */
function injectStyles() {
  const styleId = 'assist-sticky-note-styles';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .assist-sticky-note {
      position: fixed;
      width: 200px;
      height: 200px;
      background-color: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 4px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: box-shadow 0.2s;
    }

    .assist-sticky-note:hover {
      box-shadow: 0 10px 15px rgba(0, 0, 0, 0.15);
    }

    .assist-sticky-note.assist-dragging {
      cursor: move;
      opacity: 0.9;
    }

    .assist-sticky-note.assist-resizing {
      cursor: nwse-resize;
      opacity: 0.9;
    }

    .assist-sticky-note-resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.2) 50%);
      border-bottom-right-radius: 4px;
      transition: background 0.2s;
    }

    .assist-sticky-note-resize-handle:hover {
      background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.4) 50%);
    }

    .assist-sticky-note-resize-handle:focus {
      outline: 2px solid #3b82f6;
      outline-offset: -2px;
    }

    .assist-sticky-note-header {
      padding: 8px;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      cursor: move;
      display: flex;
      justify-content: flex-end;
      gap: 4px;
      user-select: none;
    }

    .assist-sticky-note-color-btn,
    .assist-sticky-note-delete {
      background: transparent;
      border: none;
      font-size: 16px;
      font-weight: bold;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      color: #6b7280;
      transition: all 0.2s;
    }

    .assist-sticky-note-delete {
      font-size: 20px;
    }

    .assist-sticky-note-color-btn:hover,
    .assist-sticky-note-delete:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }

    .assist-sticky-note-delete:hover {
      color: #dc2626;
    }

    .assist-sticky-note-color-btn:focus,
    .assist-sticky-note-delete:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    /* Color Picker Dropdown */
    .assist-color-picker {
      position: fixed;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      padding: 8px;
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 140px;
    }

    .assist-color-option {
      background: transparent;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s;
      color: #374151;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .assist-color-option:hover {
      background-color: #f3f4f6;
      border-color: #d1d5db;
      transform: translateX(2px);
    }

    .assist-color-option:active {
      transform: translateX(0);
    }

    .assist-color-option:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-sticky-note-toolbar {
      display: flex;
      gap: 2px;
      padding: 4px;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      opacity: 0;
      max-height: 0;
      overflow: hidden;
      transition: opacity 0.2s, max-height 0.2s;
    }

    .assist-sticky-note-toolbar.visible {
      opacity: 1;
      max-height: 40px;
    }

    .assist-toolbar-btn {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.15s;
      color: #374151;
      min-width: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .assist-toolbar-btn:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(0, 0, 0, 0.2);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .assist-toolbar-btn:active {
      transform: translateY(1px);
      box-shadow: none;
    }

    .assist-toolbar-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-sticky-note-content {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.5;
      color: #374151;
      outline: none;
    }

    .assist-sticky-note-content:focus {
      background-color: rgba(255, 255, 255, 0.5);
    }

    .assist-sticky-note-content:empty:before {
      content: 'Click to add note...';
      color: #9ca3af;
      font-style: italic;
    }

    /* Rich text formatting styles */
    .assist-sticky-note-content b,
    .assist-sticky-note-content strong {
      font-weight: bold;
    }

    .assist-sticky-note-content i,
    .assist-sticky-note-content em {
      font-style: italic;
    }

    .assist-sticky-note-content u {
      text-decoration: underline;
    }

    .assist-sticky-note-content ul,
    .assist-sticky-note-content ol {
      margin: 8px 0;
      padding-left: 20px;
    }

    .assist-sticky-note-content li {
      margin: 4px 0;
    }

    /* Scrollbar styling */
    .assist-sticky-note-content::-webkit-scrollbar {
      width: 6px;
    }

    .assist-sticky-note-content::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }

    .assist-sticky-note-content::-webkit-scrollbar-thumb:hover {
      background-color: rgba(0, 0, 0, 0.3);
    }

    /* Focus indicator for keyboard navigation */
    .assist-sticky-note:focus {
      outline: 3px solid #3b82f6;
      outline-offset: 3px;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// AUTO-INITIALIZATION
// ============================================================

// Self-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    initializeStickyNotes();
  });
} else {
  injectStyles();
  initializeStickyNotes();
}

// Export for testing
export { initializeStickyNotes, deleteStickyNote };
