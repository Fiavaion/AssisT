/**
 * Custom Cursor Feature
 * Provides large, high-contrast cursor for better visibility
 * Extracted from Stargardt module for general accessibility use
 */

import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { Z } from '../../utils/z-index.js';

let enabled = false;
let settings = null;
let cursorOverlay = null;
let cursorHideStyle = null;

/**
 * Where the drawn cursor's top-left sits relative to the pointer for the current settings.
 * The arrow's tip is at its top-left corner; every other style is centred on the pointer.
 * @returns {{x: number, y: number}}
 */
function pointerOffset() {
  const size = settings?.size || 32;
  if ((settings?.style || 'crosshair') === 'arrow') {
    const tip = size * (4 / 32);
    return { x: tip, y: tip };
  }
  return { x: size / 2, y: size / 2 };
}

/**
 * Move the drawn cursor under the pointer.
 *
 * Registered in the capture phase: a page that stops mousemove at its own editor (Google Docs
 * does) would otherwise leave the system cursor hidden and this one parked where it started.
 * @param {MouseEvent} e
 */
function positionCursor(e) {
  if (!cursorOverlay) {
    return;
  }
  const { x, y } = pointerOffset();
  cursorOverlay.style.left = `${e.clientX - x}px`;
  cursorOverlay.style.top = `${e.clientY - y}px`;
  cursorOverlay.style.opacity = '1';
}

const POINTER_LISTENER = { capture: true, passive: true };

const DEFAULT_SETTINGS = {
  enabled: false,
  size: 32,
  style: 'crosshair',
  color: '#ff0000',
};

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
    z-index: ${Z.POINTER};
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

  document.addEventListener('mousemove', positionCursor, POINTER_LISTENER);

  // Start in the middle of the viewport until the pointer moves
  const { x, y } = pointerOffset();
  cursor.style.left = `${window.innerWidth / 2 - x}px`;
  cursor.style.top = `${window.innerHeight / 2 - y}px`;

  // Show cursor after a moment
  setTimeout(() => {
    if (cursorOverlay) {
      cursorOverlay.style.opacity = '1';
    }
  }, 100);
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

  // The listener reads `settings` on every move, so a new size or style needs no re-binding.
  applyCursorStyle(cursorOverlay, settings);
}

/**
 * Remove custom cursor overlay
 */
function removeCustomCursor() {
  console.log('[CustomCursor] Removing custom cursor...');

  document.removeEventListener('mousemove', positionCursor, POINTER_LISTENER);

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

  // Restore system cursor. Clearing the declaration leaves `style=""` behind on a body
  // that had no style attribute of its own, which is a leftover the student cannot clear
  // without reloading — so the emptied attribute goes too, and any the page set stays.
  if (document.body) {
    document.body.style.cursor = '';
    if (document.body.getAttribute('style') === '') {
      document.body.removeAttribute('style');
    }
  }
}

/**
 * Apply settings changes
 * @param {Object} newSettings - New settings object
 */
function applySettings(newSettings) {
  // Every frame draws its own cursor: mouse events never cross a document boundary, so a cursor
  // owned by the top document alone would freeze the moment the pointer entered an iframe.
  const wasEnabled = enabled;
  settings = newSettings;
  enabled = settings?.enabled || false;

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

initFeatureSettings('customCursor', DEFAULT_SETTINGS, applySettings, applySettings);
