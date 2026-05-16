/**
 * Image Understanding Feature
 *
 * Uses AI vision models (LLaVA) to describe images, read text in photos,
 * and explain diagrams. Essential for making visual content accessible.
 *
 * Features:
 * - Right-click context menu on images
 * - AI-generated image descriptions
 * - OCR-like text extraction from images
 * - Diagram and chart explanation
 * - Floating description panel
 *
 * @module features/imageUnderstanding
 */

import { showToast } from '../../core/ui/toast.js';
import { Z } from '../../utils/z-index.js';
import { sanitizeHTML as _sanitizeHTML, sanitizeURL } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let imageUI_panel = null;
let imageUI_currentImage = null;
let imageUI_currentDescription = '';

const imageUI_settings = {
  enabled: true,
  descriptionLevel: 'detailed', // 'brief' | 'detailed' | 'comprehensive'
  includeTextExtraction: true,
  autoReadDescription: false,
};

// TTS settings - pre-loaded voice object for reliable TTS (same pattern as StickyNotes)
const imageUI_ttsSettings = {
  voice: null, // SpeechSynthesisVoice object
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

// ============================================================================
// IMAGE CAPTURE
// ============================================================================

/**
 * Convert image element to base64
 * @param {HTMLImageElement} img - Image element
 * @returns {Promise<string>} Base64 encoded image
 */
async function imageUI_getBase64(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const maxSize = 1024;

  function drawAndExport(source) {
    let width = source.naturalWidth || source.width;
    let height = source.naturalHeight || source.height;

    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.replace(/^data:image\/\w+;base64,/, '');
  }

  // Try 1: Draw the already-loaded DOM element directly (works for same-origin and file://)
  try {
    const base64 = drawAndExport(img);
    console.log('[ImageUnderstanding] Got base64 from DOM element directly');
    return base64;
  } catch (e) {
    console.log(
      '[ImageUnderstanding] Direct draw failed (tainted canvas), trying CORS reload:',
      e.message
    );
  }

  // Try 2: Fetch via background script (handles file:// URLs and cross-origin)
  try {
    console.log('[ImageUnderstanding] Trying background script fetch for:', img.src);
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_IMAGE',
      url: img.src,
    });
    if (response?.success && response?.base64) {
      console.log('[ImageUnderstanding] Got base64 from background script');
      return response.base64;
    }
    console.log('[ImageUnderstanding] Background fetch failed:', response?.error);
  } catch (bgError) {
    console.log('[ImageUnderstanding] Background script error:', bgError.message);
  }

  // Try 3: Re-fetch with crossOrigin='anonymous' (works for CORS-enabled remote images)
  return new Promise((resolve, reject) => {
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';

    tempImg.onload = () => {
      try {
        resolve(drawAndExport(tempImg));
      } catch {
        reject(new Error('Failed to process image'));
      }
    };

    tempImg.onerror = () => reject(new Error('Failed to load image'));
    tempImg.src = img.src;
  });
}

/**
 * Capture image from URL
 * Uses background script for cross-origin images
 * @param {string} url - Image URL
 * @returns {Promise<string>} Base64 encoded image
 */
async function imageUI_captureFromUrl(url) {
  // First, try fetching through background script (handles CORS)
  try {
    console.log('[ImageUnderstanding] Fetching image via background script:', url);
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_IMAGE',
      url: url,
    });

    if (response?.success && response?.base64) {
      console.log('[ImageUnderstanding] Got image from background script');
      return response.base64;
    }
    console.log('[ImageUnderstanding] Background fetch failed:', response?.error);
  } catch (bgError) {
    console.log('[ImageUnderstanding] Background script error:', bgError);
  }

  // Fallback: try loading directly (works for same-origin or CORS-enabled images)
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        const base64 = await imageUI_getBase64(img);
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

// ============================================================================
// VISION MODEL COMMUNICATION
// ============================================================================

/**
 * Get the current AI mode from storage.
 * Returns 'cloud', 'local', or 'off'.
 * @returns {Promise<{mode: string, cloudModel: string}>}
 */
async function imageUI_getAIMode() {
  try {
    const result = await chrome.storage.local.get(['aiMode', 'cloudModel', 'cloudProvider']);
    return {
      mode: result.aiMode || 'off',
      cloudModel: result.cloudModel || 'claude-sonnet-4-6',
      cloudProvider: result.cloudProvider || 'anthropic',
    };
  } catch {
    return { mode: 'off', cloudModel: 'claude-sonnet-4-6', cloudProvider: 'anthropic' };
  }
}

/**
 * Check if cloud AI is available (API key configured).
 * @returns {Promise<boolean>}
 */
async function imageUI_checkCloudAvailable() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CLOUD_LLM_CHECK' });
    return !!(response?.success && response?.available);
  } catch {
    return false;
  }
}

/**
 * Check if local vision model (LLaVA) is available.
 * @returns {Promise<boolean>}
 */
async function imageUI_checkLocalVision() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'LOCAL_LLM_CHECK' });
    return !!(response?.success && response?.visionAvailable);
  } catch {
    return false;
  }
}

/**
 * Detect actual image media type from base64 magic bytes.
 * Prevents sending image/jpeg to the API when the image is actually PNG/GIF/WebP.
 * @param {string} base64 - Base64 encoded image data (no data URL prefix)
 * @returns {string} MIME type
 */
function imageUI_detectMediaType(base64) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }
  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }
  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }
  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }
  return 'image/jpeg'; // safe default
}

/**
 * Generate image description using the best available AI.
 * Prefers cloud when aiMode === 'cloud', falls back to local vision.
 * @param {string} base64Image - Base64 encoded image
 * @param {string} prompt - Description prompt
 * @returns {Promise<{description: string, modelLabel: string}>}
 */
async function imageUI_describe(base64Image, prompt) {
  const { mode, cloudModel } = await imageUI_getAIMode();

  if (mode === 'cloud') {
    const cloudAvailable = await imageUI_checkCloudAvailable();
    if (cloudAvailable) {
      const imageMediaType = imageUI_detectMediaType(base64Image);
      console.log(`[ImageUnderstanding] Detected media type: ${imageMediaType}`);
      const response = await chrome.runtime.sendMessage({
        action: 'CLOUD_LLM_VISION',
        image: base64Image,
        imageMediaType,
        prompt,
        options: {
          model: cloudModel,
          maxTokens: 800,
          temperature: 0.5,
          feature: 'imageUnderstanding',
          noCache: true, // Every image is unique — never serve a cached description
        },
      });
      if (response?.success) {
        return { description: response.data, modelLabel: 'Cloud AI' };
      }
      throw new Error(response?.error || 'Cloud vision request failed');
    }
    throw new Error(
      'Cloud AI is selected but no API key is configured. Please add your API key in Advanced Options → AI tab.'
    );
  }

  // Local mode: use Ollama/LLaVA
  const localAvailable = await imageUI_checkLocalVision();
  if (!localAvailable) {
    throw new Error('Vision model (LLaVA) is not available. Run: ollama pull llava');
  }

  const response = await chrome.runtime.sendMessage({
    action: 'LOCAL_LLM_VISION',
    image: base64Image,
    prompt,
    options: { maxTokens: 500, temperature: 0.5 },
  });

  if (response?.success) {
    return { description: response.data, modelLabel: 'Local AI' };
  }
  throw new Error(response?.error || 'Vision request failed');
}

// ============================================================================
// DESCRIPTION PROMPTS
// ============================================================================

const DESCRIPTION_PROMPTS = {
  brief: `Describe this image in 1-2 sentences. Focus on the main subject and key details.`,

  detailed: `Describe this image in detail for someone who cannot see it. Include:
- Main subject and what's happening
- Important objects and their positions
- Colors, text, or numbers visible
- Any relevant context`,

  comprehensive: `Provide a comprehensive description of this image for accessibility. Include:
- Complete description of all visible elements
- Spatial relationships between objects
- Any text, numbers, labels, or captions
- Colors, patterns, and visual style
- Context and likely purpose of the image
- If it's a chart/diagram, explain the data or concept shown`,

  textExtraction: `Focus on reading and extracting any text visible in this image. List all text you can see, including:
- Main text content
- Labels and captions
- Numbers and data
- Signs or headings
Format the extracted text clearly.`,

  diagram: `This appears to be a diagram or chart. Please:
- Identify what type of diagram/chart it is
- Explain what it represents
- Describe the key components
- Explain any relationships or data shown
- Summarize the main takeaway`,
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Create the image description panel
 * @returns {HTMLElement}
 */
function imageUI_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-image-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Image Description');

  panel.innerHTML = `
    <style>
      #assist-image-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: ${Z.MODAL};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .assist-image-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .assist-image-title {
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .assist-image-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .assist-image-close:hover {
        background: rgba(255,255,255,0.3);
      }

      .assist-image-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .assist-image-preview {
        max-width: 100%;
        max-height: 200px;
        border-radius: 8px;
        margin-bottom: 16px;
        display: block;
        margin-left: auto;
        margin-right: auto;
        border: 1px solid #eee;
      }

      .assist-image-description {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 12px;
        line-height: 1.6;
        font-size: 15px;
        color: #333;
      }

      .assist-image-loading {
        text-align: center;
        padding: 40px;
        color: #666;
      }

      .assist-image-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #667eea;
        border-radius: 50%;
        margin: 0 auto 16px;
        animation: image-spin 1s linear infinite;
      }

      @keyframes image-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .assist-image-error {
        background: #ffebee;
        color: #c62828;
        padding: 16px;
        border-radius: 8px;
        text-align: center;
      }

      .assist-image-controls {
        padding: 12px 20px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .assist-image-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        flex: 1;
        min-width: 100px;
      }

      .assist-image-btn-primary {
        background: #667eea;
        color: white;
      }

      .assist-image-btn-primary:hover {
        background: #5a6fd6;
      }

      .assist-image-btn-secondary {
        background: #f0f0f0;
        color: #333;
      }

      .assist-image-btn-secondary:hover {
        background: #e0e0e0;
      }

      .assist-image-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
        background: #667eea;
        color: white;
        margin-left: 8px;
      }

      .assist-image-no-vision {
        background: #fff3e0;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .assist-image-no-vision-title {
        font-weight: 600;
        color: #e65100;
        margin-bottom: 8px;
      }

      .assist-image-no-vision-text {
        font-size: 13px;
        color: #666;
      }
    </style>

    <div class="assist-image-header">
      <div class="assist-image-title">
        <span>🖼️</span>
        <span>Image Understanding</span>
      </div>
      <button class="assist-image-close" aria-label="Close">&times;</button>
    </div>

    <div class="assist-image-content">
      <div class="assist-image-loading">
        <div class="assist-image-spinner"></div>
        <div>Analyzing image...</div>
      </div>
    </div>

    <div class="assist-image-controls">
      <button class="assist-image-btn assist-image-btn-secondary" id="assist-image-read">
        🔊 Read Aloud
      </button>
      <button class="assist-image-btn assist-image-btn-secondary" id="assist-image-copy">
        📋 Copy
      </button>
      <button class="assist-image-btn assist-image-btn-primary" id="assist-image-detailed">
        🔍 More Detail
      </button>
    </div>
  `;

  // Close button
  attachInteractiveHandler(
    panel.querySelector('.assist-image-close'),
    'Image Understanding Close Button',
    () => imageUI_hide()
  );

  // Read aloud button - uses pre-loaded TTS settings (same pattern as StickyNotes)
  attachInteractiveHandler(
    panel.querySelector('#assist-image-read'),
    'Image Understanding Read Button',
    () => {
      console.log('[ImageUnderstanding] Read Aloud clicked');

      if (!imageUI_currentDescription) {
        console.log('[ImageUnderstanding] No description to read');
        return;
      }

      // Cancel any ongoing speech
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      // Create utterance with pre-loaded TTS settings
      const utterance = new SpeechSynthesisUtterance(imageUI_currentDescription);
      utterance.rate = imageUI_ttsSettings.rate;
      utterance.pitch = imageUI_ttsSettings.pitch;
      utterance.volume = imageUI_ttsSettings.volume;

      if (imageUI_ttsSettings.voice) {
        utterance.voice = imageUI_ttsSettings.voice;
        console.log('[ImageUnderstanding] Using voice:', imageUI_ttsSettings.voice.name);
      } else {
        console.log('[ImageUnderstanding] No voice loaded, using system default');
      }

      window.speechSynthesis.speak(utterance);
      console.log('[ImageUnderstanding] TTS started');
    }
  );

  // Copy button
  attachInteractiveHandler(
    panel.querySelector('#assist-image-copy'),
    'Image Understanding Copy Button',
    async () => {
      if (imageUI_currentDescription) {
        try {
          await navigator.clipboard.writeText(imageUI_currentDescription);
          showToast?.('Description copied!') || alert('Copied!');
        } catch (e) {
          console.error('[ImageUnderstanding] Copy failed:', e);
        }
      }
    }
  );

  // More detail button
  attachInteractiveHandler(
    panel.querySelector('#assist-image-detailed'),
    'Image Understanding Detail Button',
    () => {
      if (imageUI_currentImage) {
        imageUI_analyze(imageUI_currentImage, 'comprehensive');
      }
    }
  );

  // Close on escape
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      imageUI_hide();
    }
  });

  return panel;
}

/**
 * Render the description result
 * @param {string} description - Image description
 * @param {string} imageUrl - Original image URL
 * @param {boolean} isAI - Whether AI-generated
 */
function imageUI_renderResult(description, imageUrl, isAI = true, modelLabel = '') {
  const contentArea = imageUI_panel?.querySelector('.assist-image-content');
  if (!contentArea) {
    return;
  }

  const badgeText = modelLabel || (isAI ? 'AI Vision' : 'Basic');
  const badge = isAI
    ? `<span class="assist-image-badge">☁️ ${badgeText}</span>`
    : '<span class="assist-image-badge" style="background:#ff9800">⚠️ Basic</span>';

  const safeImageUrl = sanitizeURL(imageUrl);
  contentArea.innerHTML = `
    ${safeImageUrl ? `<img src="${safeImageUrl}" alt="Image being described" class="assist-image-preview">` : ''}
    <div class="assist-image-description">
      ${badge}
      <p style="margin-top: 12px; white-space: pre-wrap;">${escapeHtml(description)}</p>
    </div>
  `;

  imageUI_currentDescription = description;

  // Auto-read if enabled - uses pre-loaded TTS settings
  if (imageUI_settings.autoReadDescription && isAI) {
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(description);
      utterance.rate = imageUI_ttsSettings.rate;
      utterance.pitch = imageUI_ttsSettings.pitch;
      utterance.volume = imageUI_ttsSettings.volume;
      if (imageUI_ttsSettings.voice) {
        utterance.voice = imageUI_ttsSettings.voice;
      }
      window.speechSynthesis.speak(utterance);
    }, 500);
  }
}

/**
 * Render error state
 * @param {string} message - Error message
 */
function imageUI_renderError(message) {
  const contentArea = imageUI_panel?.querySelector('.assist-image-content');
  if (!contentArea) {
    return;
  }

  const isLocalError =
    message.includes('LLaVA') || message.includes('ollama') || message.includes('vision model');
  const hint = isLocalError
    ? `<div class="assist-image-no-vision">
        <div class="assist-image-no-vision-title">💡 Vision Model Required</div>
        <div class="assist-image-no-vision-text">
          To use local image understanding, install the LLaVA vision model:<br>
          <code style="background:#f0f0f0; padding:2px 6px; border-radius:4px;">ollama pull llava</code><br>
          Or enable Cloud AI in Advanced Options → AI tab.
        </div>
      </div>`
    : `<div class="assist-image-no-vision">
        <div class="assist-image-no-vision-title">💡 Enable Cloud AI</div>
        <div class="assist-image-no-vision-text">
          Add your API key in <strong>Advanced Options → AI tab</strong> and set the mode to Cloud AI to analyze images.
        </div>
      </div>`;

  contentArea.innerHTML = `
    <div class="assist-image-error">
      <p><strong>Unable to analyze image</strong></p>
      <p>${escapeHtml(message)}</p>
    </div>
    ${hint}
  `;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the image panel
 */
function imageUI_show() {
  if (!imageUI_panel) {
    imageUI_panel = imageUI_createPanel();
    document.body.appendChild(imageUI_panel);
  }
  imageUI_panel.style.display = 'flex';
}

/**
 * Hide the image panel
 */
function imageUI_hide() {
  if (imageUI_panel) {
    imageUI_panel.style.display = 'none';
  }
}

/**
 * Analyze an image
 * @param {HTMLImageElement|string} imageOrUrl - Image element or URL
 * @param {string} [level] - Description level
 */
async function imageUI_analyze(imageOrUrl, level = null) {
  const descLevel = level || imageUI_settings.descriptionLevel;

  imageUI_show();

  const contentArea = imageUI_panel?.querySelector('.assist-image-content');
  if (contentArea) {
    imageUI_getAIMode().then(({ mode }) => {
      const modeLabel = mode === 'cloud' ? 'Cloud AI' : 'AI vision';
      contentArea.innerHTML = `
        <div class="assist-image-loading">
          <div class="assist-image-spinner"></div>
          <div>Analyzing image with ${modeLabel}...</div>
        </div>
      `;
    });
  }

  try {
    // Get image URL
    let imageUrl = '';
    let base64Image = '';

    if (typeof imageOrUrl === 'string') {
      imageUrl = imageOrUrl;
      base64Image = await imageUI_captureFromUrl(imageUrl);
    } else if (imageOrUrl instanceof HTMLImageElement) {
      imageUrl = imageOrUrl.src;
      imageUI_currentImage = imageOrUrl;
      base64Image = await imageUI_getBase64(imageOrUrl);
    } else {
      throw new Error('Invalid image input');
    }

    // Get appropriate prompt
    const prompt = DESCRIPTION_PROMPTS[descLevel] || DESCRIPTION_PROMPTS.detailed;

    // Generate description — prefers cloud AI, falls back to local
    const { description, modelLabel } = await imageUI_describe(base64Image, prompt);

    imageUI_renderResult(description, imageUrl, true, modelLabel);
  } catch (error) {
    console.error('[ImageUnderstanding] Analysis failed:', error);
    imageUI_renderError(error.message);
  }
}

/**
 * Quick describe for an image element
 * @param {HTMLImageElement} img - Image element
 */
function imageUI_describeImage(img) {
  imageUI_currentImage = img;
  imageUI_analyze(img);
}

// ============================================================================
// CONTEXT MENU INTEGRATION
// ============================================================================

/**
 * Add context menu listener for images
 */
function imageUI_setupContextMenu() {
  // Listen for right-click on images
  document.addEventListener('contextmenu', e => {
    const target = e.target;

    if (target.tagName === 'IMG' && imageUI_settings.enabled) {
      // Store reference to clicked image
      window._assistLastRightClickedImage = target;
    }
  });

  // Listen for messages from background script
  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    // Handle both action and type for compatibility
    if (message.action === 'DESCRIBE_IMAGE' || message.type === 'DESCRIBE_IMAGE') {
      console.log('[ImageUnderstanding] Received DESCRIBE_IMAGE message', message.imageUrl);

      // Try to find the actual <img> element on the page first (avoids fetch issues with file:// URLs)
      let targetImg = window._assistLastRightClickedImage || null;
      console.log('[ImageUnderstanding] Stored right-click image:', targetImg?.src || 'none');

      if (message.imageUrl && !targetImg) {
        // Search DOM for an <img> matching this URL (case-insensitive for Windows file:// paths)
        const msgUrl = message.imageUrl.toLowerCase();
        targetImg =
          Array.from(document.querySelectorAll('img')).find(
            img => img.src.toLowerCase() === msgUrl || img.currentSrc?.toLowerCase() === msgUrl
          ) || null;
        console.log('[ImageUnderstanding] DOM search found:', targetImg?.src || 'none');
      }

      if (targetImg) {
        imageUI_describeImage(targetImg);
        sendResponse({ success: true });
      } else if (message.imageUrl) {
        // No DOM element found - fall back to URL fetch (works for http/https)
        imageUI_analyze(message.imageUrl);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No image found' });
      }
      return true; // Keep channel open for async
    }
    return false;
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function imageUI_init() {
  console.log('[ImageUnderstanding] Initializing...');

  // Setup context menu handling
  imageUI_setupContextMenu();

  // Load TTS settings (voice, rate, pitch, volume) - fire and forget with logging
  imageUI_loadTTSSettings().catch(err => {
    console.error('[ImageUnderstanding] Failed to load TTS settings:', err);
  });

  // Register to window
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.imageUnderstanding = {
    analyze: imageUI_analyze,
    describe: imageUI_describeImage,
    show: imageUI_show,
    hide: imageUI_hide,
    settings: imageUI_settings,
  };

  console.log('[ImageUnderstanding] Initialized');
}

/**
 * Ensure speech synthesis voices are loaded
 * @returns {Promise<SpeechSynthesisVoice[]>} Available voices
 */
function imageUI_ensureVoicesLoaded() {
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

      // Fallback timeout
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 2000);
    }
  });
}

/**
 * Load TTS settings from extension storage (same pattern as StickyNotes)
 * Pre-loads voice object for reliable TTS
 */
async function imageUI_loadTTSSettings() {
  console.log('[ImageUnderstanding] Loading TTS settings...');

  // First, ensure voices are loaded
  const voices = await imageUI_ensureVoicesLoaded();
  console.log('[ImageUnderstanding] Voices available:', voices.length);

  // Get TTS settings from storage
  return new Promise(resolve => {
    chrome.storage.local.get(['assist_settings'], result => {
      const tts = result.assist_settings?.tts;

      // Load rate/pitch/volume from settings if available
      if (tts) {
        imageUI_ttsSettings.rate = tts.rate || 1.0;
        imageUI_ttsSettings.pitch = tts.pitch || 1.0;
        imageUI_ttsSettings.volume = tts.volume || 1.0;

        // Try to load voice by name from storage
        if (tts.voice && tts.voice !== 'default') {
          const voice = voices.find(v => v.name === tts.voice);
          if (voice) {
            imageUI_ttsSettings.voice = voice;
            console.log('[ImageUnderstanding] Loaded TTS voice from settings:', voice.name);
          } else {
            console.warn('[ImageUnderstanding] Stored voice not found:', tts.voice);
          }
        }
      }

      // ALWAYS try fallback if no voice loaded yet - Find Google UK English Female
      if (!imageUI_ttsSettings.voice && voices.length > 0) {
        const fallbackVoice =
          voices.find(
            v => v.name.includes('Google') && v.name.includes('UK') && v.name.includes('Female')
          ) ||
          voices.find(v => v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('female')) ||
          voices.find(v => v.lang.startsWith('en-') && v.name.toLowerCase().includes('female'));

        if (fallbackVoice) {
          imageUI_ttsSettings.voice = fallbackVoice;
          console.log('[ImageUnderstanding] Using fallback voice:', fallbackVoice.name);
        } else {
          console.warn('[ImageUnderstanding] No suitable voice found in', voices.length, 'voices');
        }
      }

      console.log('[ImageUnderstanding] TTS ready:', {
        voice: imageUI_ttsSettings.voice?.name || 'system default',
        rate: imageUI_ttsSettings.rate,
        pitch: imageUI_ttsSettings.pitch,
        volume: imageUI_ttsSettings.volume,
      });

      resolve();
    });
  });
}

// Auto-initialize
if (typeof window !== 'undefined') {
  imageUI_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { imageUI_analyze, imageUI_describeImage, imageUI_show, imageUI_hide, imageUI_settings };
