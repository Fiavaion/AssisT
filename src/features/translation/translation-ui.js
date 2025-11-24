/**
 * Translation UI Module
 *
 * Provides translation modal UI with:
 * - Side-by-side original and translated text display
 * - Language selectors (source and target)
 * - TTS integration for both original and translated text
 * - Copy to clipboard functionality
 * - Recently used languages tracking
 * - Full language list with flag emojis (30+ languages)
 *
 * Features:
 * - Auto-detect source language option
 * - Recently used languages shown at top of dropdowns
 * - Searchable language dropdowns with flag emojis
 * - TTS speaker icons for original and translated text
 * - Copy button for translated text
 * - Keyboard shortcuts (Escape to close)
 * - Accessible modal with WCAG 2.2 AA compliance
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - All functions prefixed with 'translationUI_' to avoid naming conflicts
 * - Uses translation API via window.assistFeatures.translation
 * - Uses TTS controller via window.assistFeatures.tts or window.readText
 *
 * @module features/translation/translation-ui
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let translationUI_modal = null;
let translationUI_recentLanguages = [];
let translationUI_currentSourceLang = 'auto';
let translationUI_currentTargetLang = 'en';

// ============================================================================
// LANGUAGE LIST (30+ languages with flag emojis)
// ============================================================================

const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect', emoji: '🌐' },
  { code: 'en', name: 'English', emoji: '🇬🇧' },
  { code: 'es', name: 'Spanish', emoji: '🇪🇸' },
  { code: 'fr', name: 'French', emoji: '🇫🇷' },
  { code: 'de', name: 'German', emoji: '🇩🇪' },
  { code: 'it', name: 'Italian', emoji: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', emoji: '🇵🇹' },
  { code: 'nl', name: 'Dutch', emoji: '🇳🇱' },
  { code: 'pl', name: 'Polish', emoji: '🇵🇱' },
  { code: 'ru', name: 'Russian', emoji: '🇷🇺' },
  { code: 'zh', name: 'Chinese', emoji: '🇨🇳' },
  { code: 'ja', name: 'Japanese', emoji: '🇯🇵' },
  { code: 'ko', name: 'Korean', emoji: '🇰🇷' },
  { code: 'ar', name: 'Arabic', emoji: '🇸🇦' },
  { code: 'hi', name: 'Hindi', emoji: '🇮🇳' },
  { code: 'tr', name: 'Turkish', emoji: '🇹🇷' },
  { code: 'vi', name: 'Vietnamese', emoji: '🇻🇳' },
  { code: 'th', name: 'Thai', emoji: '🇹🇭' },
  { code: 'cs', name: 'Czech', emoji: '🇨🇿' },
  { code: 'da', name: 'Danish', emoji: '🇩🇰' },
  { code: 'fi', name: 'Finnish', emoji: '🇫🇮' },
  { code: 'el', name: 'Greek', emoji: '🇬🇷' },
  { code: 'he', name: 'Hebrew', emoji: '🇮🇱' },
  { code: 'hu', name: 'Hungarian', emoji: '🇭🇺' },
  { code: 'id', name: 'Indonesian', emoji: '🇮🇩' },
  { code: 'ms', name: 'Malay', emoji: '🇲🇾' },
  { code: 'no', name: 'Norwegian', emoji: '🇳🇴' },
  { code: 'ro', name: 'Romanian', emoji: '🇷🇴' },
  { code: 'sk', name: 'Slovak', emoji: '🇸🇰' },
  { code: 'sv', name: 'Swedish', emoji: '🇸🇪' },
  { code: 'uk', name: 'Ukrainian', emoji: '🇺🇦' },
  { code: 'bg', name: 'Bulgarian', emoji: '🇧🇬' },
  { code: 'ca', name: 'Catalan', emoji: '🏴' },
  { code: 'hr', name: 'Croatian', emoji: '🇭🇷' },
  { code: 'et', name: 'Estonian', emoji: '🇪🇪' },
  { code: 'lv', name: 'Latvian', emoji: '🇱🇻' },
  { code: 'lt', name: 'Lithuanian', emoji: '🇱🇹' },
  { code: 'sl', name: 'Slovenian', emoji: '🇸🇮' },
];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the translation UI feature
 * Loads recent languages from Chrome storage
 *
 * @returns {Promise<void>}
 */
async function translationUI_init() {
  console.log('[TranslationUI] Initializing...');

  try {
    // Load recent languages from storage
    const result = await chrome.storage.local.get(['translationRecentLanguages']);

    if (result.translationRecentLanguages) {
      translationUI_recentLanguages = result.translationRecentLanguages;
      console.log('[TranslationUI] Recent languages loaded:', translationUI_recentLanguages);
    }

    console.log('[TranslationUI] Initialized successfully');
  } catch (error) {
    console.error('[TranslationUI] Initialization failed:', error);
  }
}

// ============================================================================
// MODAL UI
// ============================================================================

/**
 * Creates the translation modal DOM structure
 *
 * @param {string} originalText - Original text to translate
 * @param {string} translatedText - Translated text (if already translated)
 * @returns {HTMLElement} Modal element
 */
function translationUI_createModal(originalText, translatedText = '') {
  const modal = document.createElement('div');
  modal.id = 'assist-translation-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-labelledby', 'translation-modal-title');
  modal.setAttribute('aria-modal', 'true');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    width: 600px;
    max-width: 90vw;
    height: 400px;
    max-height: 80vh;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
    background: #f5f5f5;
  `;

  const title = document.createElement('h2');
  title.id = 'translation-modal-title';
  title.textContent = 'Translation';
  title.style.cssText = `
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #333;
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.setAttribute('aria-label', 'Close translation modal');
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 28px;
    color: #666;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  `;
  closeButton.onmouseenter = () => (closeButton.style.background = '#e0e0e0');
  closeButton.onmouseleave = () => (closeButton.style.background = 'none');
  closeButton.onclick = () => translationUI_closeModal();

  header.appendChild(title);
  header.appendChild(closeButton);

  // Body (2 columns)
  const body = document.createElement('div');
  body.style.cssText = `
    display: flex;
    flex: 1;
    overflow: hidden;
  `;

  // Original column
  const originalColumn = translationUI_createColumn(
    'Original',
    originalText,
    'original',
    translationUI_currentSourceLang
  );

  // Translated column
  const translatedColumn = translationUI_createColumn(
    'Translated',
    translatedText,
    'translated',
    translationUI_currentTargetLang
  );

  body.appendChild(originalColumn);
  body.appendChild(translatedColumn);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-top: 1px solid #e0e0e0;
    background: #f5f5f5;
    gap: 12px;
  `;

  // Source language selector
  const sourceContainer = document.createElement('div');
  sourceContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
  const sourceLabel = document.createElement('label');
  sourceLabel.textContent = 'From:';
  sourceLabel.style.cssText = 'font-size: 12px; color: #666; font-weight: 500;';
  const sourceSelect = translationUI_createLanguageSelector(
    'source',
    translationUI_currentSourceLang,
    true
  );
  sourceContainer.appendChild(sourceLabel);
  sourceContainer.appendChild(sourceSelect);

  // Arrow
  const arrow = document.createElement('div');
  arrow.textContent = '→';
  arrow.style.cssText = 'font-size: 24px; color: #666; margin-top: 16px;';

  // Target language selector
  const targetContainer = document.createElement('div');
  targetContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
  const targetLabel = document.createElement('label');
  targetLabel.textContent = 'To:';
  targetLabel.style.cssText = 'font-size: 12px; color: #666; font-weight: 500;';
  const targetSelect = translationUI_createLanguageSelector(
    'target',
    translationUI_currentTargetLang,
    false
  );
  targetContainer.appendChild(targetLabel);
  targetContainer.appendChild(targetSelect);

  // Translate button
  const translateButton = document.createElement('button');
  translateButton.textContent = 'Translate';
  translateButton.id = 'assist-translation-translate-btn';
  translateButton.setAttribute('aria-label', 'Translate text');
  translateButton.style.cssText = `
    background: #3b82f6;
    color: white;
    border: none;
    padding: 10px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 16px;
  `;
  translateButton.onmouseenter = () => (translateButton.style.background = '#2563eb');
  translateButton.onmouseleave = () => (translateButton.style.background = '#3b82f6');
  translateButton.onclick = () => translationUI_handleTranslate();

  footer.appendChild(sourceContainer);
  footer.appendChild(arrow);
  footer.appendChild(targetContainer);
  footer.appendChild(translateButton);

  modalContent.appendChild(header);
  modalContent.appendChild(body);
  modalContent.appendChild(footer);
  modal.appendChild(modalContent);

  return modal;
}

/**
 * Creates a column for original or translated text
 *
 * @param {string} label - Column label (Original or Translated)
 * @param {string} text - Text content
 * @param {string} type - Column type ('original' or 'translated')
 * @param {string} langCode - Language code
 * @returns {HTMLElement} Column element
 */
function translationUI_createColumn(label, text, type, langCode) {
  const column = document.createElement('div');
  column.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
    ${type === 'translated' ? 'border-left: 1px solid #e0e0e0;' : ''}
  `;

  // Column header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  `;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.cssText = 'font-size: 14px; font-weight: 600; color: #333;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 8px;';

  // TTS button
  const ttsButton = document.createElement('button');
  ttsButton.innerHTML = '🔊';
  ttsButton.setAttribute('aria-label', `Read ${label.toLowerCase()} text aloud`);
  ttsButton.style.cssText = `
    background: none;
    border: 1px solid #ddd;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  ttsButton.onmouseenter = () => {
    ttsButton.style.background = '#f0f0f0';
    ttsButton.style.transform = 'scale(1.1)';
  };
  ttsButton.onmouseleave = () => {
    ttsButton.style.background = 'none';
    ttsButton.style.transform = 'scale(1)';
  };
  ttsButton.onclick = () => translationUI_speakText(text, langCode);

  actions.appendChild(ttsButton);

  // Copy button (only for translated text)
  if (type === 'translated') {
    const copyButton = document.createElement('button');
    copyButton.innerHTML = '📋';
    copyButton.setAttribute('aria-label', 'Copy translated text');
    copyButton.style.cssText = `
      background: none;
      border: 1px solid #ddd;
      width: 32px;
      height: 32px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    `;
    copyButton.onmouseenter = () => {
      copyButton.style.background = '#f0f0f0';
      copyButton.style.transform = 'scale(1.1)';
    };
    copyButton.onmouseleave = () => {
      copyButton.style.background = 'none';
      copyButton.style.transform = 'scale(1)';
    };
    copyButton.onclick = () => translationUI_copyToClipboard(text);

    actions.appendChild(copyButton);
  }

  header.appendChild(labelEl);
  header.appendChild(actions);

  // Text area
  const textarea = document.createElement('div');
  textarea.id = `assist-translation-${type}-text`;
  textarea.textContent = text || (type === 'translated' ? 'Click Translate to see result...' : '');
  textarea.style.cssText = `
    flex: 1;
    padding: 12px;
    background: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.6;
    color: ${text ? '#333' : '#999'};
    overflow-y: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  `;

  column.appendChild(header);
  column.appendChild(textarea);

  return column;
}

/**
 * Creates a language selector dropdown with recent languages at top
 *
 * @param {string} id - Selector ID ('source' or 'target')
 * @param {string} selectedLang - Currently selected language code
 * @param {boolean} includeAutoDetect - Include auto-detect option
 * @returns {HTMLElement} Select element
 */
function translationUI_createLanguageSelector(id, selectedLang, includeAutoDetect) {
  const select = document.createElement('select');
  select.id = `assist-translation-${id}-lang`;
  select.setAttribute('aria-label', `Select ${id} language`);
  select.style.cssText = `
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    cursor: pointer;
    transition: border 0.2s;
  `;
  select.onfocus = () => (select.style.borderColor = '#3b82f6');
  select.onblur = () => (select.style.borderColor = '#ddd');

  // Add recent languages group (if any)
  if (translationUI_recentLanguages.length > 0) {
    const recentGroup = document.createElement('optgroup');
    recentGroup.label = 'Recently Used';

    translationUI_recentLanguages.forEach(langCode => {
      const lang = LANGUAGES.find(l => l.code === langCode);
      if (lang && (includeAutoDetect || lang.code !== 'auto')) {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = `${lang.emoji} ${lang.name}`;
        if (lang.code === selectedLang) {
          option.selected = true;
        }
        recentGroup.appendChild(option);
      }
    });

    select.appendChild(recentGroup);
  }

  // Add all languages group
  const allGroup = document.createElement('optgroup');
  allGroup.label = 'All Languages';

  LANGUAGES.forEach(lang => {
    if (includeAutoDetect || lang.code !== 'auto') {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = `${lang.emoji} ${lang.name}`;
      if (lang.code === selectedLang) {
        option.selected = true;
      }
      allGroup.appendChild(option);
    }
  });

  select.appendChild(allGroup);

  return select;
}

/**
 * Opens the translation modal
 *
 * @param {string} selectedText - Text to translate
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @param {string} targetLang - Target language code (default: 'en')
 * @returns {void}
 */
function translationUI_openModal(selectedText, sourceLang = 'auto', targetLang = 'en') {
  console.log('[TranslationUI] Opening modal');

  // Close existing modal if any
  if (translationUI_modal) {
    translationUI_closeModal();
  }

  // Update current languages
  translationUI_currentSourceLang = sourceLang;
  translationUI_currentTargetLang = targetLang;

  // Create modal
  translationUI_modal = translationUI_createModal(selectedText, '');
  document.body.appendChild(translationUI_modal);

  // Auto-translate if source language is not auto-detect
  if (sourceLang !== 'auto') {
    setTimeout(() => translationUI_handleTranslate(), 100);
  }

  // Add keyboard listener for Escape key
  document.addEventListener('keydown', translationUI_handleKeydown);
}

/**
 * Closes the translation modal
 *
 * @returns {void}
 */
function translationUI_closeModal() {
  console.log('[TranslationUI] Closing modal');

  if (translationUI_modal) {
    translationUI_modal.remove();
    translationUI_modal = null;
  }

  // Remove keyboard listener
  document.removeEventListener('keydown', translationUI_handleKeydown);
}

/**
 * Handles keyboard events in modal
 *
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {void}
 */
function translationUI_handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    translationUI_closeModal();
  }
}

// ============================================================================
// TRANSLATION LOGIC
// ============================================================================

/**
 * Handles translate button click
 *
 * @returns {Promise<void>}
 */
async function translationUI_handleTranslate() {
  console.log('[TranslationUI] Translate button clicked');

  // Get values from modal
  const originalTextEl = document.getElementById('assist-translation-original-text');
  const translatedTextEl = document.getElementById('assist-translation-translated-text');
  const sourceSelect = document.getElementById('assist-translation-source-lang');
  const targetSelect = document.getElementById('assist-translation-target-lang');
  const translateButton = document.getElementById('assist-translation-translate-btn');

  if (!originalTextEl || !translatedTextEl || !sourceSelect || !targetSelect || !translateButton) {
    console.error('[TranslationUI] Modal elements not found');
    return;
  }

  const originalText = originalTextEl.textContent.trim();
  const sourceLang = sourceSelect.value;
  const targetLang = targetSelect.value;

  if (!originalText) {
    translatedTextEl.textContent = 'No text to translate';
    translatedTextEl.style.color = '#999';
    return;
  }

  // Update current languages
  translationUI_currentSourceLang = sourceLang;
  translationUI_currentTargetLang = targetLang;

  // Disable button and show loading
  translateButton.disabled = true;
  translateButton.style.opacity = '0.5';
  translateButton.style.cursor = 'not-allowed';
  translatedTextEl.textContent = 'Translating...';
  translatedTextEl.style.color = '#3b82f6';

  try {
    // Call translation API
    const translationAPI = window.assistFeatures?.translation;
    if (!translationAPI) {
      throw new Error('Translation API not available');
    }

    const result = await translationAPI.translate(originalText, targetLang, sourceLang);

    if (result.error) {
      translatedTextEl.textContent = `Error: ${result.error}`;
      translatedTextEl.style.color = '#ef4444';
    } else if (result.translatedText) {
      translatedTextEl.textContent = result.translatedText;
      translatedTextEl.style.color = '#333';

      // Add to recent languages
      translationUI_addToRecentLanguages(targetLang);
    } else {
      translatedTextEl.textContent = 'Translation failed';
      translatedTextEl.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('[TranslationUI] Translation error:', error);
    translatedTextEl.textContent = `Error: ${error.message}`;
    translatedTextEl.style.color = '#ef4444';
  } finally {
    // Re-enable button
    translateButton.disabled = false;
    translateButton.style.opacity = '1';
    translateButton.style.cursor = 'pointer';
  }
}

/**
 * Adds a language to recent languages list
 *
 * @param {string} langCode - Language code to add
 * @returns {Promise<void>}
 */
async function translationUI_addToRecentLanguages(langCode) {
  // Remove if already in list
  translationUI_recentLanguages = translationUI_recentLanguages.filter(code => code !== langCode);

  // Add to front
  translationUI_recentLanguages.unshift(langCode);

  // Keep only last 5
  translationUI_recentLanguages = translationUI_recentLanguages.slice(0, 5);

  // Save to storage
  try {
    await chrome.storage.local.set({ translationRecentLanguages: translationUI_recentLanguages });
    console.log('[TranslationUI] Recent languages saved:', translationUI_recentLanguages);
  } catch (error) {
    console.error('[TranslationUI] Failed to save recent languages:', error);
  }
}

// ============================================================================
// TTS INTEGRATION
// ============================================================================

/**
 * Speaks text using TTS with specified language
 *
 * @param {string} text - Text to speak
 * @param {string} langCode - Language code (e.g., 'en', 'es', 'fr')
 * @returns {void}
 */
function translationUI_speakText(text, langCode) {
  console.log(`[TranslationUI] Speaking text in ${langCode}: "${text.substring(0, 50)}..."`);

  if (!text || text === 'Click Translate to see result...') {
    console.warn('[TranslationUI] No text to speak');
    return;
  }

  // Try to use existing TTS controller
  if (window.readText && typeof window.readText === 'function') {
    // Create a temporary element for TTS
    const tempElement = document.createElement('div');
    tempElement.textContent = text;
    window.readText(text, tempElement);
  } else if (window.speechSynthesis) {
    // Fallback to basic speech synthesis
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    window.speechSynthesis.speak(utterance);
  } else {
    console.error('[TranslationUI] TTS not available');
  }
}

// ============================================================================
// CLIPBOARD
// ============================================================================

/**
 * Copies text to clipboard
 *
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
async function translationUI_copyToClipboard(text) {
  console.log('[TranslationUI] Copying to clipboard');

  if (!text || text === 'Click Translate to see result...') {
    console.warn('[TranslationUI] No text to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    console.log('[TranslationUI] Text copied to clipboard');

    // Show toast notification if available
    if (window.showToast) {
      window.showToast('Copied to clipboard');
    } else {
      alert('Text copied to clipboard');
    }
  } catch (error) {
    console.error('[TranslationUI] Clipboard copy failed:', error);
    alert('Failed to copy text');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Initialize translation UI (async, but non-blocking)
  translationUI_init().catch(error => {
    console.error('[TranslationUI] Auto-initialization failed:', error);
  });

  // Register translation UI functions
  window.assistFeatures.translationUI = {
    openModal: translationUI_openModal,
    closeModal: translationUI_closeModal,
  };

  console.log('[TranslationUI] Module loaded');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translationUI_init,
    translationUI_openModal,
    translationUI_closeModal,
    translationUI_speakText,
    translationUI_copyToClipboard,
  };
}
