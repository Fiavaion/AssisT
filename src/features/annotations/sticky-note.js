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
import { createTagInput, renderTagPills } from './tag-manager.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { registerShortcut } from '../../utils/keyboard-shortcuts.js';

/** @type {BaseStorageAdapter} Current storage adapter instance */
let storageAdapter = null;

/** @type {string} Current storage mode ('local' or 'indexeddb') */
let storageMode = 'local';

/** @type {Map<number, HTMLElement>} Map of note ID to DOM element */
const activeNotes = new Map();

/** @type {Object|null} Currently dragging note state */
let dragState = null;

/** @type {Object} Annotation settings */
let annotationSettings = {
  defaultColor: 'yellow',
  defaultNoteSize: 'medium',
  autoSave: true,
  showBadge: true,
  sidebarAutoOpen: true,
};

/** @type {Object} TTS settings from extension */
const ttsSettings = {
  voice: null,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/**
 * Default size mappings for notes
 * @type {Object<string, {width: number, height: number}>}
 */
const noteSizeMap = {
  small: { width: 150, height: 100 },
  medium: { width: 200, height: 200 },
  large: { width: 300, height: 250 },
};

/**
 * Initialize the sticky note system
 * - Load storage adapter based on settings
 * - Load annotation settings
 * - Load existing notes for current URL
 * - Set up Chrome message listeners
 */
async function initializeStickyNotes() {
  console.log('[StickyNotes] Initializing...');

  try {
    await loadAnnotationSettings();
    await loadTTSSettings();
    await loadStorageMode();

    storageAdapter = getStorageAdapter(storageMode);
    console.log(`[StickyNotes] Using storage mode: ${storageMode}`);

    await loadNotesForCurrentPage();

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    await registerStickyNoteShortcut();

    console.log('[StickyNotes] Initialized successfully with settings:', annotationSettings);
  } catch (error) {
    console.error('[StickyNotes] Initialization failed:', error);
  }
}

/**
 * Load annotation settings from chrome.storage.local
 */
async function loadAnnotationSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['annotations'], result => {
      if (result.annotations) {
        annotationSettings = {
          defaultColor: result.annotations.defaultColor || 'yellow',
          defaultNoteSize: result.annotations.defaultNoteSize || 'medium',
          autoSave: result.annotations.autoSave !== false,
          showBadge: result.annotations.showBadge !== false,
          sidebarAutoOpen: result.annotations.sidebarAutoOpen !== false,
        };
      }
      console.log('[StickyNotes] Loaded annotation settings:', annotationSettings);
      resolve();
    });
  });
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
 * Load TTS settings from extension settings
 * Properly waits for voices to be available before resolving
 */
async function loadTTSSettings() {
  // First, ensure voices are loaded
  await ensureVoicesLoaded();

  return new Promise(resolve => {
    chrome.storage.local.get(['assist_settings'], result => {
      const tts = result.assist_settings?.tts;
      if (tts) {
        ttsSettings.rate = tts.rate || 1.0;
        ttsSettings.pitch = tts.pitch || 1.0;
        ttsSettings.volume = tts.volume || 1.0;

        if (tts.voice && tts.voice !== 'default') {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(v => v.name === tts.voice);
          if (voice) {
            ttsSettings.voice = voice;
            console.log('[StickyNotes] Loaded TTS voice:', voice.name);
          } else {
            console.warn('[StickyNotes] Voice not found:', tts.voice);
          }
        }

        console.log('[StickyNotes] Loaded TTS settings:', {
          rate: ttsSettings.rate,
          pitch: ttsSettings.pitch,
          volume: ttsSettings.volume,
          voice: ttsSettings.voice?.name || 'default',
        });
      }
      resolve();
    });
  });
}

/**
 * Ensure speech synthesis voices are loaded
 * @returns {Promise<SpeechSynthesisVoice[]>} Available voices
 */
function ensureVoicesLoaded() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
    } else {
      const onVoicesChanged = () => {
        const loadedVoices = window.speechSynthesis.getVoices();
        if (loadedVoices.length > 0) {
          window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
          resolve(loadedVoices);
        }
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);

      // Fallback timeout in case voices never load
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 2000);
    }
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

    for (const note of notes) {
      if (note.type === 'note') {
        renderStickyNote(note);
      }
    }
  } catch (error) {
    console.error('[StickyNotes] Error loading notes:', error);
  }
}

/**
 * Create a new sticky note
 * @param {Object} options - Note options
 * @param {number} options.x - X position in pixels
 * @param {number} options.y - Y position in pixels
 * @param {string} [options.content=''] - Initial content
 * @param {string} [options.color] - Note color (uses default from settings if not provided)
 * @param {Array<string>} [options.tags=[]] - Tags for the note
 * @returns {Promise<Object>} Created note data
 */
export async function createStickyNote({ x, y, content = '', color = null, tags = [] }) {
  try {
    const noteColor = color || annotationSettings.defaultColor || 'yellow';
    const sizeName = annotationSettings.defaultNoteSize || 'medium';
    const sizeDimensions = noteSizeMap[sizeName] || noteSizeMap.medium;

    const noteData = {
      type: 'note',
      url: window.location.href,
      x,
      y,
      content,
      color: noteColor,
      width: sizeDimensions.width,
      height: sizeDimensions.height,
      tags: tags || [],
    };

    const savedNote = await storageAdapter.create(noteData);
    console.log('[StickyNotes] Created note:', savedNote.id, {
      color: noteColor,
      size: sizeName,
      dimensions: sizeDimensions,
      tags: tags,
    });

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
  if (activeNotes.has(note.id)) {
    return;
  }

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

  applyNoteColor(noteElement, note.color);

  const header = document.createElement('div');
  header.className = 'assist-sticky-note-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-label', 'Drag to move note');
  header.setAttribute('tabindex', '0');

  const colorBtn = document.createElement('button');
  colorBtn.className = 'assist-sticky-note-color-btn';
  colorBtn.innerHTML = sanitizeHTML('🎨');
  colorBtn.setAttribute('aria-label', 'Change note color');
  colorBtn.setAttribute('title', 'Change color');
  attachInteractiveHandler(colorBtn, 'Sticky Note Color', () => {
    toggleColorPicker(note.id, colorBtn);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'assist-sticky-note-delete';
  deleteBtn.innerHTML = sanitizeHTML('×');
  deleteBtn.setAttribute('aria-label', 'Delete note');
  deleteBtn.setAttribute('title', 'Delete note');
  attachInteractiveHandler(deleteBtn, 'Sticky Note Delete', () => {
    deleteStickyNote(note.id);
  });

  header.appendChild(colorBtn);
  header.appendChild(deleteBtn);

  const toolbar = createRichTextToolbar(note.id);

  const content = document.createElement('div');
  content.className = 'assist-sticky-note-content';
  content.contentEditable = 'true';
  content.innerHTML = sanitizeHTML(note.content || '');
  content.setAttribute('role', 'textbox');
  content.setAttribute('aria-label', 'Note content');
  content.setAttribute('aria-multiline', 'true');

  content.addEventListener('blur', () => {
    saveNoteContent(note.id, content.innerHTML);
  });

  content.addEventListener('keydown', e => {
    handleFormattingShortcuts(e);
  });

  content.addEventListener('focus', () => {
    toolbar.classList.add('visible');
  });

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'assist-sticky-note-tags';
  tagsContainer.setAttribute('role', 'group');
  tagsContainer.setAttribute('aria-label', 'Note tags');

  if (note.tags && note.tags.length > 0) {
    renderTagPills(note.tags, tagsContainer);
  }

  attachInteractiveHandler(tagsContainer, 'Sticky Note Tags', () => {
    openTagEditModal(note.id, note.tags || []);
  });

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'assist-sticky-note-resize-handle';
  resizeHandle.setAttribute('role', 'button');
  resizeHandle.setAttribute('aria-label', 'Resize note');
  resizeHandle.setAttribute('title', 'Drag to resize');
  resizeHandle.setAttribute('tabindex', '0');

  noteElement.appendChild(header);
  noteElement.appendChild(toolbar);
  noteElement.appendChild(content);
  noteElement.appendChild(tagsContainer);
  noteElement.appendChild(resizeHandle);

  attachDragListeners(noteElement, header, note.id);
  attachResizeListeners(noteElement, resizeHandle, note.id);

  document.body.appendChild(noteElement);
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
    button.innerHTML = sanitizeHTML(btn.icon);
    button.title = btn.title;
    button.setAttribute('aria-label', btn.ariaLabel);
    button.setAttribute('type', 'button');
    button.dataset.command = btn.command;

    attachInteractiveHandler(button, `Format ${btn.command}`, () => {
      executeFormatCommand(btn.command);
    });

    toolbar.appendChild(button);
  });

  const separator = document.createElement('span');
  separator.className = 'assist-toolbar-separator';
  separator.setAttribute('aria-hidden', 'true');
  toolbar.appendChild(separator);

  const ttsBtn = document.createElement('button');
  ttsBtn.className = 'assist-toolbar-btn assist-toolbar-btn-tts';
  ttsBtn.innerHTML = sanitizeHTML('🔊');
  ttsBtn.title = 'Read note aloud';
  ttsBtn.setAttribute('aria-label', 'Read note aloud');
  ttsBtn.setAttribute('type', 'button');
  ttsBtn.dataset.noteId = noteId;

  attachInteractiveHandler(ttsBtn, 'Note TTS', () => {
    speakNoteContent(noteId, ttsBtn);
  });

  toolbar.appendChild(ttsBtn);

  const sttBtn = document.createElement('button');
  sttBtn.className = 'assist-toolbar-btn assist-toolbar-btn-stt';
  sttBtn.innerHTML = sanitizeHTML('🎤');
  sttBtn.title = 'Voice input';
  sttBtn.setAttribute('aria-label', 'Voice input - dictate into note');
  sttBtn.setAttribute('type', 'button');
  sttBtn.dataset.noteId = noteId;

  attachInteractiveHandler(sttBtn, 'Note STT', () => {
    startNoteDictation(noteId, sttBtn);
  });

  toolbar.appendChild(sttBtn);

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
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? e.metaKey : e.ctrlKey;

  if (!modKey) {
    return;
  }

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

/** @type {SpeechSynthesisUtterance|null} Current TTS utterance */
let currentUtterance = null;

/** @type {number|null} Currently speaking note ID */
let speakingNoteId = null;

/**
 * Speak the content of a sticky note using TTS
 * @param {number} noteId - Note ID
 * @param {HTMLElement} button - TTS button element
 */
function speakNoteContent(noteId, button) {
  if (speakingNoteId === noteId && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    speakingNoteId = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🔊');
    button.title = 'Read note aloud';
    console.log('[StickyNotes] TTS stopped for note:', noteId);
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.assist-toolbar-btn-tts.assist-toolbar-btn-active').forEach(btn => {
      btn.classList.remove('assist-toolbar-btn-active');
      btn.innerHTML = sanitizeHTML('🔊');
      btn.title = 'Read note aloud';
    });
  }

  const noteElement = activeNotes.get(noteId);
  if (!noteElement) {
    console.error('[StickyNotes] Note not found:', noteId);
    return;
  }

  const contentElement = noteElement.querySelector('.assist-sticky-note-content');
  if (!contentElement) {
    console.error('[StickyNotes] Content element not found for note:', noteId);
    return;
  }

  const text = contentElement.textContent.trim();
  if (!text) {
    console.log('[StickyNotes] Note is empty, nothing to read');
    return;
  }

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = ttsSettings.rate;
  currentUtterance.pitch = ttsSettings.pitch;
  currentUtterance.volume = ttsSettings.volume;
  if (ttsSettings.voice) {
    currentUtterance.voice = ttsSettings.voice;
  }
  speakingNoteId = noteId;

  button.classList.add('assist-toolbar-btn-active');
  button.innerHTML = sanitizeHTML('⏹️');
  button.title = 'Stop reading';

  console.log('[StickyNotes] TTS using settings:', {
    rate: currentUtterance.rate,
    pitch: currentUtterance.pitch,
    volume: currentUtterance.volume,
    voice: currentUtterance.voice?.name || 'default',
  });

  currentUtterance.onend = () => {
    speakingNoteId = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🔊');
    button.title = 'Read note aloud';
    console.log('[StickyNotes] TTS finished for note:', noteId);
  };

  currentUtterance.onerror = error => {
    console.error('[StickyNotes] TTS error:', error);
    speakingNoteId = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🔊');
    button.title = 'Read note aloud';
  };

  window.speechSynthesis.speak(currentUtterance);
  console.log('[StickyNotes] TTS started for note:', noteId);
}

/** @type {SpeechRecognition|null} Current STT recognition instance */
let currentRecognition = null;

/** @type {number|null} Currently recording note ID */
let recordingNoteId = null;

/**
 * Start speech-to-text dictation for a sticky note
 * @param {number} noteId - Note ID
 * @param {HTMLElement} button - STT button element
 */
function startNoteDictation(noteId, button) {
  if (recordingNoteId === noteId && currentRecognition) {
    currentRecognition.stop();
    return;
  }

  if (currentRecognition) {
    currentRecognition.stop();
    document.querySelectorAll('.assist-toolbar-btn-stt.assist-toolbar-btn-active').forEach(btn => {
      btn.classList.remove('assist-toolbar-btn-active');
      btn.innerHTML = sanitizeHTML('🎤');
      btn.title = 'Voice input';
    });
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('[StickyNotes] Speech Recognition not supported');
    alert('Speech recognition is not supported in this browser.');
    return;
  }

  const noteElement = activeNotes.get(noteId);
  if (!noteElement) {
    console.error('[StickyNotes] Note not found:', noteId);
    return;
  }

  const contentElement = noteElement.querySelector('.assist-sticky-note-content');
  if (!contentElement) {
    console.error('[StickyNotes] Content element not found for note:', noteId);
    return;
  }

  currentRecognition = new SpeechRecognition();
  currentRecognition.continuous = true;
  currentRecognition.interimResults = true;
  currentRecognition.lang = 'en-US';

  recordingNoteId = noteId;

  button.classList.add('assist-toolbar-btn-active');
  button.innerHTML = sanitizeHTML('⏹️');
  button.title = 'Stop recording';

  let finalTranscript = '';

  currentRecognition.onresult = event => {
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    console.log('[StickyNotes] STT interim:', interimTranscript);
    console.log('[StickyNotes] STT final:', finalTranscript);
  };

  currentRecognition.onend = () => {
    if (finalTranscript.trim()) {
      appendToNoteContent(noteId, contentElement, finalTranscript.trim());
    }

    recordingNoteId = null;
    currentRecognition = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🎤');
    button.title = 'Voice input';
    console.log('[StickyNotes] STT ended for note:', noteId);
  };

  currentRecognition.onerror = event => {
    console.error('[StickyNotes] STT error:', event.error);

    if (event.error === 'not-allowed') {
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    } else if (event.error !== 'aborted') {
      console.error('[StickyNotes] Speech recognition error:', event.error);
    }

    recordingNoteId = null;
    currentRecognition = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🎤');
    button.title = 'Voice input';
  };

  try {
    currentRecognition.start();
    console.log('[StickyNotes] STT started for note:', noteId);
  } catch (error) {
    console.error('[StickyNotes] Failed to start STT:', error);
    recordingNoteId = null;
    currentRecognition = null;
    button.classList.remove('assist-toolbar-btn-active');
    button.innerHTML = sanitizeHTML('🎤');
    button.title = 'Voice input';
  }
}

/**
 * Append dictated text to note content
 * If note has existing content, add text on a new line matching the formatting
 * @param {number} noteId - Note ID
 * @param {HTMLElement} contentElement - Content div element
 * @param {string} text - Text to append
 */
function appendToNoteContent(noteId, contentElement, text) {
  const currentText = contentElement.textContent.trim();

  if (currentText) {
    const formatting = detectTextFormatting(contentElement);
    const formattedText = applyFormatting(escapeHtml(text), formatting);
    contentElement.innerHTML += sanitizeHTML('<br>' + formattedText);
  } else {
    contentElement.innerHTML = sanitizeHTML(escapeHtml(text));
  }

  saveNoteContent(noteId, contentElement.innerHTML);
  console.log('[StickyNotes] Appended dictated text to note:', noteId);
}

/**
 * Detect text formatting from the last text node in contentElement
 * @param {HTMLElement} contentElement - Content element
 * @returns {Object} Formatting state { bold, italic, underline }
 */
function detectTextFormatting(contentElement) {
  const formatting = { bold: false, italic: false, underline: false };

  const innerHTML = contentElement.innerHTML;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizeHTML(innerHTML);

  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
  let lastTextNode = null;
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.trim()) {
      lastTextNode = node;
    }
  }

  if (lastTextNode) {
    let parent = lastTextNode.parentElement;
    while (parent && parent !== tempDiv) {
      const tagName = parent.tagName.toLowerCase();
      if (tagName === 'b' || tagName === 'strong') {
        formatting.bold = true;
      }
      if (tagName === 'i' || tagName === 'em') {
        formatting.italic = true;
      }
      if (tagName === 'u') {
        formatting.underline = true;
      }
      parent = parent.parentElement;
    }
  }

  return formatting;
}

/**
 * Apply formatting to text
 * @param {string} text - Text to format
 * @param {Object} formatting - Formatting to apply { bold, italic, underline }
 * @returns {string} Formatted HTML
 */
function applyFormatting(text, formatting) {
  let result = text;

  if (formatting.bold) {
    result = `<b>${result}</b>`;
  }
  if (formatting.italic) {
    result = `<i>${result}</i>`;
  }
  if (formatting.underline) {
    result = `<u>${result}</u>`;
  }

  return result;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Toggle color picker dropdown for a sticky note
 * @param {number} noteId - Note ID
 * @param {HTMLElement} colorBtn - Color button element
 */
function toggleColorPicker(noteId, colorBtn) {
  const existingPicker = document.getElementById(`color-picker-${noteId}`);
  if (existingPicker) {
    existingPicker.remove();
    return;
  }

  const picker = document.createElement('div');
  picker.id = `color-picker-${noteId}`;
  picker.className = 'assist-color-picker';
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', 'Choose note color');

  const colors = [
    { name: 'yellow', label: 'Yellow', emoji: '💛' },
    { name: 'blue', label: 'Blue', emoji: '💙' },
    { name: 'green', label: 'Green', emoji: '💚' },
    { name: 'pink', label: 'Pink', emoji: '💗' },
    { name: 'purple', label: 'Purple', emoji: '💜' },
  ];

  colors.forEach(color => {
    const option = document.createElement('button');
    option.className = 'assist-color-option';
    option.innerHTML = sanitizeHTML(`${color.emoji} ${color.label}`);
    option.setAttribute('aria-label', `Change to ${color.label}`);
    option.setAttribute('role', 'menuitem');
    option.dataset.color = color.name;

    attachInteractiveHandler(option, `Color ${color.name}`, async () => {
      await changeNoteColor(noteId, color.name);
      picker.remove();
    });

    picker.appendChild(option);
  });

  const rect = colorBtn.getBoundingClientRect();
  picker.style.position = 'fixed';
  picker.style.top = `${rect.bottom + 5}px`;
  picker.style.left = `${rect.left}px`;

  document.body.appendChild(picker);

  const closeHandler = e => {
    if (!picker.contains(e.target) && e.target !== colorBtn) {
      picker.remove();
      document.removeEventListener('click', closeHandler);
    }
  };

  setTimeout(() => {
    attachInteractiveHandler(document, 'Sticky Note Color Picker Backdrop', closeHandler);
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
    await storageAdapter.update(noteId, { color });

    const noteElement = activeNotes.get(noteId);
    if (noteElement) {
      applyNoteColor(noteElement, color);
    }

    console.log(`[StickyNotes] Changed color for note ${noteId} to ${color}`);
  } catch (error) {
    console.error('[StickyNotes] Error changing color:', error);
  }
}

/**
 * Attach drag event listeners to a sticky note
 * @param {HTMLElement} noteElement - Note element
 * @param {HTMLElement} dragHandle - Element that initiates drag (header)
 * @param {number} noteId - Note ID
 */
function attachDragListeners(noteElement, dragHandle, noteId) {
  let startX, startY, initialLeft, initialTop;

  const onMouseDown = e => {
    if (e.target !== dragHandle && !dragHandle.contains(e.target)) {
      return;
    }

    e.preventDefault();

    startX = e.clientX;
    startY = e.clientY;
    initialLeft = noteElement.offsetLeft;
    initialTop = noteElement.offsetTop;

    dragState = {
      noteId,
      noteElement,
      startX,
      startY,
      initialLeft,
      initialTop,
    };

    noteElement.classList.add('assist-dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('[StickyNotes] Drag started:', noteId);
  };

  const onMouseMove = e => {
    if (!dragState) {
      return;
    }

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;
    const newLeft = dragState.initialLeft + deltaX;
    const newTop = dragState.initialTop + deltaY;

    const maxX = window.innerWidth - noteElement.offsetWidth;
    const maxY = window.innerHeight - noteElement.offsetHeight;

    noteElement.style.left = `${Math.max(0, Math.min(newLeft, maxX))}px`;
    noteElement.style.top = `${Math.max(0, Math.min(newTop, maxY))}px`;
  };

  const onMouseUp = () => {
    if (!dragState) {
      return;
    }

    noteElement.classList.remove('assist-dragging');

    const newX = parseInt(noteElement.style.left, 10);
    const newY = parseInt(noteElement.style.top, 10);
    saveNotePosition(noteId, newX, newY);

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    dragState = null;

    console.log('[StickyNotes] Drag ended:', noteId, { x: newX, y: newY });
  };

  dragHandle.addEventListener('mousedown', onMouseDown);

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

    saveNotePosition(noteId, newLeft, newTop);
  });
}

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
    e.preventDefault();
    e.stopPropagation();

    startX = e.clientX;
    startY = e.clientY;
    initialWidth = noteElement.offsetWidth;
    initialHeight = noteElement.offsetHeight;

    resizeState = {
      noteId,
      noteElement,
      startX,
      startY,
      initialWidth,
      initialHeight,
    };

    noteElement.classList.add('assist-resizing');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    console.log('[StickyNotes] Resize started:', noteId);
  };

  const onMouseMove = e => {
    if (!resizeState) {
      return;
    }

    const deltaX = e.clientX - resizeState.startX;
    const deltaY = e.clientY - resizeState.startY;
    const newWidth = Math.max(150, resizeState.initialWidth + deltaX); // Min width 150px
    const newHeight = Math.max(100, resizeState.initialHeight + deltaY); // Min height 100px

    noteElement.style.width = `${newWidth}px`;
    noteElement.style.height = `${newHeight}px`;
  };

  const onMouseUp = () => {
    if (!resizeState) {
      return;
    }

    noteElement.classList.remove('assist-resizing');

    const newWidth = parseInt(noteElement.style.width, 10);
    const newHeight = parseInt(noteElement.style.height, 10);
    saveNoteDimensions(noteId, newWidth, newHeight);

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    resizeState = null;

    console.log('[StickyNotes] Resize ended:', noteId, { width: newWidth, height: newHeight });
  };

  resizeHandle.addEventListener('mousedown', onMouseDown);

  resizeHandle.addEventListener('keydown', e => {
    if (!['+', '=', '-', '_'].includes(e.key)) {
      return;
    }

    e.preventDefault();
    const step = e.shiftKey ? 20 : 10; // Shift = larger resize

    let newWidth = parseInt(noteElement.style.width, 10);
    let newHeight = parseInt(noteElement.style.height, 10);

    if (e.key === '+' || e.key === '=') {
      newWidth += step;
      newHeight += step;
    } else if (e.key === '-' || e.key === '_') {
      newWidth = Math.max(150, newWidth - step);
      newHeight = Math.max(100, newHeight - step);
    }

    noteElement.style.width = `${newWidth}px`;
    noteElement.style.height = `${newHeight}px`;

    saveNoteDimensions(noteId, newWidth, newHeight);
  });
}

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
    await storageAdapter.delete(noteId);

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

/**
 * Open modal to edit tags for a note
 * @param {number} noteId - Note ID
 * @param {Array<string>} currentTags - Current tags
 */
function openTagEditModal(noteId, currentTags = []) {
  const existingModal = document.getElementById('assist-tag-edit-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'assist-tag-edit-modal';
  modal.className = 'assist-tag-edit-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'tag-modal-title');

  modal.innerHTML = sanitizeHTML(`
    <div class="assist-tag-edit-modal" role="document">
      <div class="assist-tag-edit-modal-header">
        <h3 id="tag-modal-title">Edit Tags</h3>
        <button class="assist-tag-edit-modal-close" aria-label="Close modal">×</button>
      </div>
      <div class="assist-tag-edit-modal-body">
        <label class="assist-tag-edit-label">Tags:</label>
        <div id="tag-input-container"></div>
        <p class="assist-tag-edit-help">Press Enter or comma to add tags. Backspace to remove last tag.</p>
      </div>
      <div class="assist-tag-edit-modal-footer">
        <button class="assist-tag-edit-btn assist-tag-edit-btn-cancel" aria-label="Cancel">Cancel</button>
        <button class="assist-tag-edit-btn assist-tag-edit-btn-save" aria-label="Save tags">Save</button>
      </div>
    </div>
  `);

  const closeBtn = modal.querySelector('.assist-tag-edit-modal-close');
  const cancelBtn = modal.querySelector('.assist-tag-edit-btn-cancel');
  const saveBtn = modal.querySelector('.assist-tag-edit-btn-save');

  const tagInputContainer = modal.querySelector('#tag-input-container');
  const tagInput = createTagInput(tagInputContainer, currentTags);

  attachInteractiveHandler(closeBtn, 'Tag Modal Close', () => modal.remove());
  attachInteractiveHandler(cancelBtn, 'Tag Modal Cancel', () => modal.remove());

  attachInteractiveHandler(saveBtn, 'Tag Modal Save', async () => {
    const newTags = tagInput.getTags();
    try {
      await storageAdapter.update(noteId, { tags: newTags });

      const noteElement = activeNotes.get(noteId);
      if (noteElement) {
        const tagsContainer = noteElement.querySelector('.assist-sticky-note-tags');
        if (tagsContainer) {
          tagsContainer.innerHTML = sanitizeHTML('');
          if (newTags.length > 0) {
            renderTagPills(newTags, tagsContainer);
          }
        }
      }

      modal.remove();
      console.log('[StickyNotes] Updated tags for note:', noteId, newTags);
    } catch (error) {
      console.error('[StickyNotes] Error updating tags:', error);
      alert('Failed to save tags. Please try again.');
    }
  });

  attachInteractiveHandler(modal, 'Sticky Note Delete Modal Backdrop', e => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      modal.remove();
    }
  });

  document.body.appendChild(modal);

  console.log('[StickyNotes] Tag edit modal opened');
}

/**
 * Handle messages from popup or background script
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 * @param {Function} sendResponse - Response callback
 */
/**
 * Register the Alt+N keyboard shortcut for sticky note creation.
 * Only triggers when the annotations feature is enabled in popup settings.
 * Reads enabled state from assist_settings.annotations.enabled.
 */
async function registerStickyNoteShortcut() {
  await registerShortcut('sticky_note_create', async () => {
    console.log('[StickyNotes] Alt+N shortcut triggered');

    const result = await chrome.storage.local.get('assist_settings');
    const annotationsEnabled = result.assist_settings?.annotations?.enabled;

    if (!annotationsEnabled) {
      console.log('[StickyNotes] Shortcut blocked: annotations feature is disabled');
      return;
    }

    const x = window.innerWidth / 2 - 100;
    const y = window.innerHeight / 2 - 100;

    try {
      await createStickyNote({ x, y, content: '', color: null });
      console.log('[StickyNotes] Note created via Alt+N shortcut');
    } catch (error) {
      console.error('[StickyNotes] Error creating note via shortcut:', error);
    }
  });

  console.log('[StickyNotes] Alt+N shortcut registered');
}

function handleMessage(message, sender, sendResponse) {
  // SECURITY: Validate sender is from this extension
  if (sender.id !== chrome.runtime.id) {
    console.warn('[StickyNotes Security] Rejected message from untrusted sender');
    return false;
  }

  if (message.action === 'createStickyNote') {
    const x = message.x || window.innerWidth / 2 - 100;
    const y = message.y || window.innerHeight / 2 - 100;
    const color = message.color || null;

    createStickyNote({ x, y, content: message.content || '', color })
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
 * Handle storage changes (storage mode switch, annotation settings, or TTS settings change)
 * @param {Object} changes - Changed keys
 */
function handleStorageChange(changes) {
  if (changes.annotationStorageMode) {
    const newMode = changes.annotationStorageMode.newValue;
    console.log(`[StickyNotes] Storage mode changed to: ${newMode}`);

    storageMode = newMode;
    storageAdapter = getStorageAdapter(storageMode);

    activeNotes.forEach(noteElement => noteElement.remove());
    activeNotes.clear();
    loadNotesForCurrentPage();
  }

  if (changes.annotations) {
    const newSettings = changes.annotations.newValue;
    console.log('[StickyNotes] Annotation settings changed:', newSettings);

    if (newSettings) {
      annotationSettings = {
        defaultColor: newSettings.defaultColor || 'yellow',
        defaultNoteSize: newSettings.defaultNoteSize || 'medium',
        autoSave: newSettings.autoSave !== false,
        showBadge: newSettings.showBadge !== false,
        sidebarAutoOpen: newSettings.sidebarAutoOpen !== false,
      };

      console.log('[StickyNotes] Updated annotation settings:', annotationSettings);
    }
  }

  if (changes.assist_settings) {
    const newSettings = changes.assist_settings.newValue;
    const tts = newSettings?.tts;
    if (tts) {
      ttsSettings.rate = tts.rate || 1.0;
      ttsSettings.pitch = tts.pitch || 1.0;
      ttsSettings.volume = tts.volume || 1.0;

      if (tts.voice && tts.voice !== 'default') {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === tts.voice);
        if (voice) {
          ttsSettings.voice = voice;
          console.log('[StickyNotes] Updated TTS voice:', voice.name);
        }
      } else {
        ttsSettings.voice = null;
      }

      console.log('[StickyNotes] Updated TTS settings:', {
        rate: ttsSettings.rate,
        pitch: ttsSettings.pitch,
        volume: ttsSettings.volume,
        voice: ttsSettings.voice?.name || 'default',
      });
    }
  }
}

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
      width: 280px;
      height: 280px;
      background-color: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 100200; /* Z.FLOATING — see src/utils/z-index.js */
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: box-shadow 0.2s;
    }

    .assist-sticky-note:hover {
      box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2);
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
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, rgba(0, 0, 0, 0.2) 50%);
      border-bottom-right-radius: 8px;
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
      padding: 10px 12px;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      cursor: move;
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      user-select: none;
    }

    .assist-sticky-note-color-btn,
    .assist-sticky-note-delete {
      background: transparent;
      border: none;
      font-size: 20px;
      font-weight: bold;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      color: #6b7280;
      transition: all 0.2s;
    }

    .assist-sticky-note-delete {
      font-size: 24px;
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
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      padding: 10px;
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 160px;
    }

    .assist-color-option {
      background: transparent;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
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
      gap: 4px;
      padding: 8px 10px;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      opacity: 0;
      max-height: 0;
      overflow: hidden;
      transition: opacity 0.2s, max-height 0.2s;
    }

    .assist-sticky-note-toolbar.visible {
      opacity: 1;
      max-height: 50px;
    }

    .assist-toolbar-btn {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      padding: 6px 10px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.15s;
      color: #374151;
      min-width: 34px;
      height: 34px;
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

    /* Toolbar separator */
    .assist-toolbar-separator {
      width: 1px;
      height: 26px;
      background: rgba(0, 0, 0, 0.15);
      margin: 0 6px;
      align-self: center;
    }

    /* TTS/STT button active states */
    .assist-toolbar-btn-active {
      background: #3b82f6 !important;
      color: white !important;
      border-color: #2563eb !important;
    }

    .assist-toolbar-btn-active:hover {
      background: #2563eb !important;
    }

    /* TTS button specific */
    .assist-toolbar-btn-tts {
      font-size: 16px;
    }

    /* STT button specific */
    .assist-toolbar-btn-stt {
      font-size: 16px;
    }

    /* STT button specific - recording animation */
    .assist-toolbar-btn-stt.assist-toolbar-btn-active {
      animation: assist-pulse-recording 1.5s ease-in-out infinite;
    }

    @keyframes assist-pulse-recording {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5);
      }
      50% {
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0);
      }
    }

    .assist-sticky-note-content {
      flex: 1;
      padding: 14px 16px;
      overflow-y: auto;
      font-size: 16px;
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

    /* Tags container */
    .assist-sticky-note-tags {
      padding: 10px 14px;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 38px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .assist-sticky-note-tags:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .assist-sticky-note-tags:empty:before {
      content: 'Click to add tags...';
      color: #9ca3af;
      font-size: 14px;
      font-style: italic;
    }

    /* Tag edit modal */
    .assist-tag-edit-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: assist-modal-fade-in 0.2s ease-out;
    }

    .assist-tag-edit-modal {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 450px;
      animation: assist-modal-slide-in 0.3s ease-out;
    }

    .assist-tag-edit-modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .assist-tag-edit-modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .assist-tag-edit-modal-close {
      background: transparent;
      border: none;
      font-size: 28px;
      font-weight: 300;
      color: #6b7280;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
      line-height: 1;
      padding: 0;
    }

    .assist-tag-edit-modal-close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .assist-tag-edit-modal-close:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-tag-edit-modal-body {
      padding: 24px;
    }

    .assist-tag-edit-label {
      display: block;
      font-weight: 600;
      font-size: 14px;
      color: #374151;
      margin-bottom: 8px;
    }

    .assist-tag-edit-help {
      margin: 8px 0 0;
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
    }

    .assist-tag-edit-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .assist-tag-edit-btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      font-family: inherit;
    }

    .assist-tag-edit-btn-cancel {
      background: white;
      color: #374151;
      border: 2px solid #e5e7eb;
    }

    .assist-tag-edit-btn-cancel:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }

    .assist-tag-edit-btn-save {
      background: #3b82f6;
      color: white;
    }

    .assist-tag-edit-btn-save:hover {
      background: #2563eb;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .assist-tag-edit-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
  `;

  document.head.appendChild(style);
}

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
