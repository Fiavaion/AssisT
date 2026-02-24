/**
 * Magnifying Lens Feature
 * Provides a movable magnification lens that follows the cursor
 * Extracted from Stargardt module - uses CSS transform for real magnification
 */

import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let enabled = false;
let settings = null;
let lensContainer = null;
let contentContainer = null;
let bodyClone = null;
let mouseMoveHandler = null;
let scrollHandler = null;
let dragStartHandler = null;
let lensStyle = null;
let animationFrame = null;
let currentX = 0;
let currentY = 0;

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  enabled: false,
  scale: 2.0,
  size: 275,
  offsetEnabled: false,
  offset: 150,
  offsetDir: 'right',
  lock: false,
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize magnifying lens
 */
function initMagnifyingLens() {
  console.log('[MagnifyingLens] Initializing magnifying lens...');

  // Remove existing lens if any
  removeMagnifyingLens();

  const size = settings.size || 275;
  const _scale = settings.scale || 2.0;
  const lockPosition = settings.lock === true;

  // Create the lens container (circular window)
  lensContainer = document.createElement('div');
  lensContainer.id = 'assist-magnifying-lens';
  lensContainer.style.cssText = `
    position: fixed;
    z-index: 2147483640;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 0 0 4px ${lockPosition ? '#22c55e' : '#6366f1'}, 0 8px 32px rgba(0,0,0,0.4);
    background: white;
    opacity: 0;
    transition: opacity 0.15s ease-out;
  `;

  // Create falloff overlay (gradient edge for visual effect)
  const falloff = document.createElement('div');
  falloff.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(circle, transparent 60%, rgba(0,0,0,0.3) 90%, rgba(0,0,0,0.6) 100%);
    z-index: 2;
  `;
  lensContainer.appendChild(falloff);

  // Create content container (holds magnified DOM clone)
  contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${size}px;
    height: ${size}px;
    transform-origin: 0 0;
    will-change: transform;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  `;
  lensContainer.appendChild(contentContainer);

  // Identify fixed-position direct children of body BEFORE cloning (requires live DOM for getComputedStyle).
  // Browser extensions typically inject overlays as direct body children with position:fixed.
  // Inside a CSS-transformed container, position:fixed becomes relative to the transform parent,
  // causing the overlay to appear incorrectly inside the lens.
  const fixedChildIndices = [];
  Array.from(document.body.children).forEach((child, idx) => {
    try {
      if (window.getComputedStyle(child).position === 'fixed') {
        fixedChildIndices.push(idx);
      }
    } catch {
      /* skip inaccessible elements */
    }
  });

  // Clone the body for magnification
  bodyClone = document.body.cloneNode(true);

  // Remove the lens itself and other assist UI from the clone to avoid recursion
  const assistElements = bodyClone.querySelectorAll(
    '#assist-magnifying-lens, #assist-magnifying-lens-style, [id^="assist-textstats"], .assist-toast'
  );
  assistElements.forEach(el => el.remove());

  // Remove fixed-position direct children (extension overlays) from the clone
  [...fixedChildIndices].reverse().forEach(idx => {
    if (bodyClone.children[idx]) {
      bodyClone.children[idx].remove();
    }
  });
  // Also catch any inline position:fixed elements deeper in the clone
  bodyClone
    .querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]')
    .forEach(el => el.remove());

  // Style the cloned body - use absolute positioning (NOT fixed)
  // position:fixed inside a transformed parent acts unpredictably
  bodyClone.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    margin: 0;
    pointer-events: none;
    width: ${document.body.scrollWidth}px;
    min-height: ${document.body.scrollHeight}px;
    overflow: visible;
  `;

  // Ensure all images in clone have pointer-events: none
  const clonedImages = bodyClone.querySelectorAll('img, picture, video, canvas, svg, iframe');
  clonedImages.forEach(img => {
    img.style.pointerEvents = 'none';
  });

  contentContainer.appendChild(bodyClone);
  document.body.appendChild(lensContainer);

  // Initialize position
  currentX = window.innerWidth / 2;
  currentY = window.innerHeight / 2;

  // Update lens position and content
  updateLens(currentX, currentY);

  // Show lens after a moment
  setTimeout(() => {
    if (lensContainer) {
      lensContainer.style.opacity = '0.95';
    }
  }, 100);

  // Mouse move handler
  mouseMoveHandler = e => {
    currentX = e.clientX;
    currentY = e.clientY;
    updateLens(currentX, currentY);
  };

  // Scroll handler to update content position when page scrolls
  scrollHandler = () => {
    updateLens(currentX, currentY);
  };

  // Prevent native image drag from interfering with cursor tracking
  dragStartHandler = e => {
    e.preventDefault();
  };
  document.addEventListener('dragstart', dragStartHandler);

  // Add style to prevent image drag/select interference across the page
  lensStyle = document.createElement('style');
  lensStyle.id = 'assist-magnifying-lens-style';
  lensStyle.textContent = `
    /* Prevent native image drag from blocking mousemove when lens is active */
    img, picture, video, canvas, svg {
      -webkit-user-drag: none !important;
      user-select: none !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(lensStyle);

  document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
  window.addEventListener('scroll', scrollHandler, { passive: true });

  console.log('[MagnifyingLens] Magnifying lens initialized:', settings);
}

/**
 * Update lens position and magnified content
 */
function updateLens(gazeX, gazeY) {
  if (!lensContainer || !contentContainer) {
    return;
  }

  const size = settings.size || 275;
  const scale = settings.scale || 2.0;
  const offsetEnabled = settings.offsetEnabled === true;
  const offset = settings.offset || 150;
  const offsetDir = settings.offsetDir || 'right';
  const lockPosition = settings.lock === true;
  const halfSize = size / 2;

  // Calculate lens position
  let lensX, lensY;

  if (lockPosition) {
    // Lock mode: lens stays in fixed position (center of screen)
    lensX = (window.innerWidth - size) / 2;
    lensY = (window.innerHeight - size) / 2;
  } else if (!offsetEnabled) {
    // Offset disabled: lens follows cursor directly (centered on cursor)
    lensX = gazeX - halfSize;
    lensY = gazeY - halfSize;

    // Keep lens within viewport bounds
    lensX = Math.max(10, Math.min(lensX, window.innerWidth - size - 10));
    lensY = Math.max(10, Math.min(lensY, window.innerHeight - size - 10));
  } else {
    // Follow cursor with offset
    switch (offsetDir) {
      case 'right':
        lensX = gazeX + offset;
        lensY = gazeY - halfSize;
        break;
      case 'left':
        lensX = gazeX - offset - size;
        lensY = gazeY - halfSize;
        break;
      case 'above':
        lensX = gazeX - halfSize;
        lensY = gazeY - offset - size;
        break;
      case 'below':
        lensX = gazeX - halfSize;
        lensY = gazeY + offset;
        break;
      case 'auto':
        // Auto: place in largest available space
        const spaceRight = window.innerWidth - gazeX;
        const spaceLeft = gazeX;
        const spaceBelow = window.innerHeight - gazeY;
        const spaceAbove = gazeY;
        const maxSpace = Math.max(spaceRight, spaceLeft, spaceBelow, spaceAbove);

        if (maxSpace === spaceRight) {
          lensX = gazeX + offset;
          lensY = gazeY - halfSize;
        } else if (maxSpace === spaceLeft) {
          lensX = gazeX - offset - size;
          lensY = gazeY - halfSize;
        } else if (maxSpace === spaceBelow) {
          lensX = gazeX - halfSize;
          lensY = gazeY + offset;
        } else {
          lensX = gazeX - halfSize;
          lensY = gazeY - offset - size;
        }
        break;
      default:
        lensX = gazeX + offset;
        lensY = gazeY - halfSize;
    }

    // Keep lens within viewport bounds
    lensX = Math.max(10, Math.min(lensX, window.innerWidth - size - 10));
    lensY = Math.max(10, Math.min(lensY, window.innerHeight - size - 10));
  }

  // Update lens position
  lensContainer.style.left = `${lensX}px`;
  lensContainer.style.top = `${lensY}px`;

  // Calculate document position from screen position
  const docX = gazeX;
  const docY = gazeY + window.scrollY;

  // Position the content so the cursor point appears centered in the lens
  // We scale the content, then translate to center the point of interest
  const contentX = -docX + halfSize / scale;
  const contentY = -docY + halfSize / scale;

  contentContainer.style.transform = `scale(${scale}) translate(${contentX}px, ${contentY}px)`;
}

/**
 * Update magnifying lens with new settings
 */
function updateMagnifyingLens() {
  if (!lensContainer) {
    if (settings?.enabled) {
      initMagnifyingLens();
    }
    return;
  }

  if (!settings?.enabled) {
    removeMagnifyingLens();
    return;
  }

  // Settings changed - reinitialize to apply new size/scale/etc
  removeMagnifyingLens();
  initMagnifyingLens();
}

/**
 * Remove magnifying lens
 */
function removeMagnifyingLens() {
  console.log('[MagnifyingLens] Removing magnifying lens...');

  // Stop animation loop
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // Remove event listeners
  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }

  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  if (dragStartHandler) {
    document.removeEventListener('dragstart', dragStartHandler);
    dragStartHandler = null;
  }

  if (lensStyle) {
    lensStyle.remove();
    lensStyle = null;
  }

  // Remove lens element
  if (lensContainer) {
    lensContainer.remove();
    lensContainer = null;
    contentContainer = null;
    bodyClone = null;
  }
}

/**
 * Apply settings changes
 * @param {Object} newSettings - New settings object
 * @param {boolean} isInit - Whether this is the initial settings load
 */
function applySettings(newSettings, isInit = false) {
  const wasEnabled = enabled;

  console.log('[MagnifyingLens] applySettings called with:', {
    newSettings,
    isInit,
    wasEnabled,
  });

  // Update local state
  settings = newSettings;
  enabled = settings?.enabled || false;

  console.log('[MagnifyingLens] After state update:', {
    enabled,
    settings,
  });

  // Handle enable/disable transitions
  if (enabled && !wasEnabled) {
    initMagnifyingLens();
  } else if (!enabled && wasEnabled) {
    removeMagnifyingLens();
  } else if (enabled) {
    // Settings changed while enabled
    updateMagnifyingLens();
  }
}

/**
 * Cleanup function
 */
function cleanup() {
  console.log('[MagnifyingLens] Cleaning up...');
  removeMagnifyingLens();
  enabled = false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize feature settings with storage utility
initFeatureSettings(
  'magnifyingLens',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

console.log('[MagnifyingLens] Module loaded');

// ============================================================================
// PUBLIC API
// ============================================================================

export { applySettings, cleanup, DEFAULT_SETTINGS };
