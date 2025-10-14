/**
 * Canvas LMS Integration - FULL IMPLEMENTATION
 * Provides reading assistance for Canvas assignments, discussions, and pages
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Canvas Integration State (Feature Isolated)
let canvas_enabled = false;
let canvas_fabElement = null;
let CanvasAdapter = null;

/**
 * Load Canvas Adapter dynamically
 */
async function canvas_loadAdapter() {
  if (!CanvasAdapter) {
    try {
      CanvasAdapter = await import(chrome.runtime.getURL('adapters/canvas-adapter.js'));
      console.log('[Canvas] Adapter loaded');
    } catch (error) {
      console.error('[Canvas] Failed to load adapter:', error);
    }
  }
  return CanvasAdapter;
}

/**
 * Initialize Assignment Reader
 */
async function canvas_initializeAssignmentReader() {
  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Extract assignment content
  const assignment = adapter.extractAssignmentContent();
  if (!assignment) {
    console.log('[Canvas] No assignment content found');
    return;
  }

  console.log('[Canvas] Assignment detected:', assignment.title);

  // Create FAB button
  canvas_fabElement = adapter.createCanvasFAB({
    text: 'Read Assignment',
    icon: '📖',
    onClick: () => canvas_readAssignment(assignment),
    position: 'bottom-right',
  });

  document.body.appendChild(canvas_fabElement);
  console.log('[Canvas] Assignment Reader initialized');
}

/**
 * Read assignment content
 */
function canvas_readAssignment(assignment) {
  // Get TTS settings to check if enabled
  chrome.storage.local.get('assist_settings', result => {
    const ttsEnabled = result.assist_settings?.tts?.enabled || false;

    if (!ttsEnabled) {
      showToast('⚠️ Enable TTS in the extension popup first');
      return;
    }

    console.log('[Canvas] Reading assignment:', assignment.title);
    showToast('📖 Reading: ' + assignment.title);

    // Read title first
    const titleText = assignment.title;
    const contentText = assignment.text;
    const fullText = titleText + '. ' + contentText;

    // Trigger TTS
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(fullText);
      utterance.rate = result.assist_settings?.tts?.rate || 1.0;
      utterance.pitch = result.assist_settings?.tts?.pitch || 1.0;
      utterance.volume = result.assist_settings?.tts?.volume || 1.0;

      // Highlight the assignment element
      if (assignment.element) {
        assignment.element.style.outline = '2px solid #2196F3';
        assignment.element.style.outlineOffset = '2px';

        utterance.onend = () => {
          assignment.element.style.outline = '';
          assignment.element.style.outlineOffset = '';
        };
      }

      window.speechSynthesis.speak(utterance);
    }
  });
}

/**
 * Remove Canvas FAB
 */
function canvas_removeFAB() {
  if (canvas_fabElement) {
    canvas_fabElement.remove();
    canvas_fabElement = null;
  }
}

/**
 * Initialize Canvas features
 */
async function canvas_setup() {
  if (!canvas_enabled) {
    return;
  }

  const adapter = await canvas_loadAdapter();
  if (!adapter) {
    return;
  }

  // Check if on Canvas page
  if (!adapter.isCanvasPage()) {
    console.log('[Canvas] Not a Canvas page, skipping');
    return;
  }

  const pageType = adapter.detectCanvasPageType();
  console.log('[Canvas] Page type detected:', pageType);

  // Wait for content to load
  await adapter.waitForCanvasContent();

  // Initialize features based on page type
  if (pageType === adapter.CanvasPageType.ASSIGNMENT) {
    canvas_initializeAssignmentReader();
  }
}

/**
 * Handle settings changes
 */
function canvas_handleSettingsChange(newSettings) {
  if (!newSettings.canvasIntegration) return;

  const ciSettings = newSettings.canvasIntegration;
  const newEnabled = ciSettings.enabled || false;

  if (newEnabled && !canvas_enabled) {
    canvas_enabled = true;
    canvas_setup();
    showToast('🎓 Canvas Integration enabled');
  } else if (!newEnabled && canvas_enabled) {
    canvas_enabled = false;
    canvas_removeFAB();
    showToast('Canvas Integration disabled');
  }

  console.log('[Canvas] Settings updated:', newEnabled);
}

/**
 * Initialize Canvas LMS integration
 */
export async function canvas_initialize() {
  console.log('[Canvas] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.canvasIntegration) {
    canvas_enabled = allSettings.canvasIntegration.enabled || false;

    if (canvas_enabled) {
      await canvas_setup();
    }

    console.log('[Canvas] Settings loaded:', canvas_enabled);
  } else {
    console.log('[Canvas] Integration disabled by default');
  }

  // Listen for settings changes
  onSettingsChange(canvas_handleSettingsChange);

  console.log('[Canvas] Initialized');
}

/**
 * Get Canvas state for debugging
 */
export function canvas_getState() {
  return {
    enabled: canvas_enabled,
    fabPresent: !!canvas_fabElement,
  };
}
