/**
 * Custom Cursor Feature
 * Provides large, high-contrast cursor for better visibility
 * Extracted from Stargardt module for general accessibility use
 */

import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let enabled = false;
let settings = null;
let cursorOverlay = null;
let mouseMoveHandler = null;
let cursorHideStyle = null;

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  enabled: false,
  size: 32,
  style: 'crosshair',
  color: '#ff0000',
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Apply cursor style to the overlay element
 */
function applyCursorStyle(cursor, cursorSettings) {
  const size = cursorSettings.size || 32;
  const color = cursorSettings.color || '#ff0000';
  const style = cursorSettings.style || 'crosshair';

  cursor.style.width = `${size}px`;
  cursor.style.height = `${size}px`;

  // Clear any existing content and reset styles from previous cursor type
  cursor.innerHTML = '';
  cursor.style.borderRadius = '';
  cursor.style.border = '';
  cursor.style.boxShadow = '';
  cursor.style.boxSizing = '';

  switch (style) {
    case 'crosshair': {
      // Crosshair style - two lines
      const thickness = Math.max(2, size / 12);
      cursor.innerHTML = `
        <div style="
          position: absolute;
          left: 50%;
          top: 0;
          width: ${thickness}px;
          height: 100%;
          background: ${color};
          transform: translateX(-50%);
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
        "></div>
        <div style="
          position: absolute;
          top: 50%;
          left: 0;
          width: 100%;
          height: ${thickness}px;
          background: ${color};
          transform: translateY(-50%);
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
        "></div>
      `;
      break;
    }
    case 'circle': {
      // Circle outline
      const thickness = Math.max(3, size / 8);
      cursor.style.borderRadius = '50%';
      cursor.style.border = `${thickness}px solid ${color}`;
      cursor.style.boxShadow = `0 0 4px rgba(0,0,0,0.5), inset 0 0 4px rgba(0,0,0,0.3)`;
      cursor.style.boxSizing = 'border-box';
      break;
    }
    case 'dot': {
      // Dot with ring
      const dotSize = Math.max(8, size / 4);
      const ringThickness = Math.max(2, size / 16);
      cursor.style.borderRadius = '50%';
      cursor.style.border = `${ringThickness}px solid ${color}`;
      cursor.style.boxSizing = 'border-box';
      cursor.innerHTML = `
        <div style="
          position: absolute;
          left: 50%;
          top: 50%;
          width: ${dotSize}px;
          height: ${dotSize}px;
          background: ${color};
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 4px rgba(0,0,0,0.5);
        "></div>
      `;
      break;
    }
    case 'arrow': {
      // Large arrow pointer
      const arrowScale = size / 32;
      cursor.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4L4 28L12 20L18 28L22 26L16 18L28 18L4 4Z"
                fill="${color}"
                stroke="#000"
                stroke-width="${2 / arrowScale}"
                stroke-linejoin="round"/>
        </svg>
      `;
      break;
    }
    default:
      // Default to crosshair
      applyCursorStyle(cursor, { ...cursorSettings, style: 'crosshair' });
  }
}

/**
 * Initialize custom cursor overlay
 */
function initCustomCursor() {
  console.log('[CustomCursor] Initializing custom cursor...');

  // Remove existing cursor if any
  removeCustomCursor();

  // Create cursor overlay element
  const cursor = document.createElement('div');
  cursor.id = 'assist-custom-cursor';
  cursor.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  `;

  // Apply cursor style
  applyCursorStyle(cursor, settings);

  document.body.appendChild(cursor);
  cursorOverlay = cursor;

  // Hide system cursor on body
  document.body.style.cursor = 'none';

  // Create style element to hide cursor globally
  cursorHideStyle = document.createElement('style');
  cursorHideStyle.id = 'assist-cursor-hide-style';
  cursorHideStyle.textContent = `
    * { cursor: none !important; }
    #assist-custom-cursor { cursor: none !important; }
  `;
  document.head.appendChild(cursorHideStyle);

  // Track mouse movement
  mouseMoveHandler = e => {
    if (!cursorOverlay) {
      return;
    }

    const size = settings.size || 32;
    const style = settings.style || 'crosshair';

    // Arrow tip is at top-left (~4/32 of size), other styles are centered
    let offsetX, offsetY;
    if (style === 'arrow') {
      const tipOffset = size * (4 / 32);
      offsetX = tipOffset;
      offsetY = tipOffset;
    } else {
      offsetX = size / 2;
      offsetY = size / 2;
    }

    cursorOverlay.style.left = `${e.clientX - offsetX}px`;
    cursorOverlay.style.top = `${e.clientY - offsetY}px`;
    cursorOverlay.style.opacity = '1';
  };

  document.addEventListener('mousemove', mouseMoveHandler, { passive: true });

  // Initialize position at center
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const initSize = settings.size || 32;
  const initStyle = settings.style || 'crosshair';
  let initOffX, initOffY;
  if (initStyle === 'arrow') {
    initOffX = initSize * (4 / 32);
    initOffY = initSize * (4 / 32);
  } else {
    initOffX = initSize / 2;
    initOffY = initSize / 2;
  }
  cursor.style.left = `${centerX - initOffX}px`;
  cursor.style.top = `${centerY - initOffY}px`;

  // Show cursor after a moment
  setTimeout(() => {
    if (cursorOverlay) {
      cursorOverlay.style.opacity = '1';
    }
  }, 100);

  console.log('[CustomCursor] Custom cursor initialized:', settings);
}

/**
 * Update custom cursor with new settings
 */
function updateCustomCursor() {
  if (!cursorOverlay) {
    // Cursor not initialized yet, check if we should initialize
    if (settings?.enabled) {
      initCustomCursor();
    }
    return;
  }

  if (!settings?.enabled) {
    // Cursor disabled, remove it
    removeCustomCursor();
    return;
  }

  // Update cursor style
  applyCursorStyle(cursorOverlay, settings);

  // Update mousemove handler with new size
  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
  }

  mouseMoveHandler = e => {
    if (!cursorOverlay) {
      return;
    }

    const size = settings.size || 32;
    const style = settings.style || 'crosshair';
    let offsetX, offsetY;
    if (style === 'arrow') {
      const tipOffset = size * (4 / 32);
      offsetX = tipOffset;
      offsetY = tipOffset;
    } else {
      offsetX = size / 2;
      offsetY = size / 2;
    }

    cursorOverlay.style.left = `${e.clientX - offsetX}px`;
    cursorOverlay.style.top = `${e.clientY - offsetY}px`;
  };

  document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
}

/**
 * Remove custom cursor overlay
 */
function removeCustomCursor() {
  console.log('[CustomCursor] Removing custom cursor...');

  // Remove event listener
  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }

  // Remove cursor element
  if (cursorOverlay) {
    cursorOverlay.remove();
    cursorOverlay = null;
  }

  // Remove cursor hide style
  if (cursorHideStyle) {
    cursorHideStyle.remove();
    cursorHideStyle = null;
  }

  // Restore system cursor
  if (document.body) {
    document.body.style.cursor = '';
  }
}

/**
 * Apply settings changes
 * @param {Object} newSettings - New settings object
 * @param {boolean} isInit - Whether this is the initial settings load
 */
function applySettings(newSettings, isInit = false) {
  const wasEnabled = enabled;

  console.log('[CustomCursor] applySettings called with:', {
    newSettings,
    isInit,
    wasEnabled,
  });

  // Update local state
  settings = newSettings;
  enabled = settings?.enabled || false;

  console.log('[CustomCursor] After state update:', {
    enabled,
    settings,
  });

  // Handle enable/disable transitions
  if (enabled && !wasEnabled) {
    initCustomCursor();
  } else if (!enabled && wasEnabled) {
    removeCustomCursor();
  } else if (enabled) {
    // Settings changed while enabled
    updateCustomCursor();
  }
}

/**
 * Cleanup function
 */
function cleanup() {
  console.log('[CustomCursor] Cleaning up...');
  removeCustomCursor();
  enabled = false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize feature settings with storage utility
initFeatureSettings(
  'customCursor',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

console.log('[CustomCursor] Module loaded');

// ============================================================================
// PUBLIC API
// ============================================================================

export { applySettings, cleanup, DEFAULT_SETTINGS };
