/**
 * Magnifying Lens Feature
 * Provides a movable magnification lens that follows the cursor
 * Extracted from Stargardt module - uses CSS transform for real magnification
 */

import { initFeatureSettings, saveSetting } from '../../content/utils/storage-utils.js';
import { showToast } from '../../core/ui/toast.js';
import { assistOverlayIsOpen } from '../../utils/assist-overlay-state.js';
import { Z } from '../../utils/z-index.js';

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
let focusInHandler = null;
let selectionChangeHandler = null;
let keyDownHandler = null;
let currentX = 0;
let currentY = 0;

/**
 * Keyboard control of the lens.
 *
 * Alt is required on every one of these. The lens stays on for a whole reading session, and a bare
 * arrow key is how the page scrolls, so claiming the arrows outright would break the page the
 * student is magnifying. Alt with an arrow aims the lens, Alt with +/- changes the zoom, Alt with
 * the brackets changes its size, and Escape puts it away.
 */
const NUDGE = 40;
const NUDGE_LARGE = 160;
const SCALE_STEP = 0.25;
const SCALE_MIN = 1.25;
const SCALE_MAX = 6;
const SIZE_STEP = 25;
const SIZE_MIN = 120;
const SIZE_MAX = 600;

const DEFAULT_SETTINGS = {
  enabled: false,
  scale: 2.0,
  size: 275,
  offsetEnabled: false,
  offset: 150,
  offsetDir: 'right',
  lock: false,
};

/**
 * Whether the student has asked the system for reduced motion.
 * @returns {boolean}
 */
function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Whether the lens already has a position inside the current viewport worth keeping.
 * @returns {boolean}
 */
function hasAimedPosition() {
  return (
    currentX > 0 && currentY > 0 && currentX <= window.innerWidth && currentY <= window.innerHeight
  );
}

/**
 * True for anything that owns its own arrow keys and its own Escape.
 *
 * Inside a text field the caret is what aims the lens, so the keystrokes stay with the field.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditable(target) {
  if (!target || typeof target.closest !== 'function') {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Aim the lens at the centre of an element - the one keyboard focus has just landed on.
 *
 * @param {EventTarget|null} element
 * @returns {void}
 */
function aimAtElement(element) {
  if (!lensContainer || !element || typeof element.getBoundingClientRect !== 'function') {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    return;
  }
  aimAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * Aim the lens at the caret.
 *
 * `input` and `textarea` expose no caret rectangle, so their own box is the best answer available;
 * contenteditable prose gives a real range rectangle.
 *
 * @returns {void}
 */
function aimAtCaret() {
  if (!lensContainer) {
    return;
  }

  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
    aimAtElement(active);
    return;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width || rect.height) {
    aimAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return;
  }
  const node = selection.focusNode;
  aimAtElement(node?.nodeType === 1 ? node : node?.parentElement);
}

/**
 * Move the lens to a point in the viewport, clamped to it.
 *
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
function aimAt(x, y) {
  currentX = Math.max(0, Math.min(x, window.innerWidth));
  currentY = Math.max(0, Math.min(y, window.innerHeight));
  updateLens(currentX, currentY);
}

/**
 * Persist the lens settings so the popup, and the next page load, agree with what the student just
 * did from the keyboard. Storage is unavailable in some test and sandbox contexts, so a failure
 * here never takes the live lens down with it.
 *
 * @returns {void}
 */
function persistSettings() {
  try {
    Promise.resolve(saveSetting('magnifyingLens', { ...settings })).catch(error => {
      console.warn('[MagnifyingLens] Could not save settings:', error);
    });
  } catch (error) {
    console.warn('[MagnifyingLens] Could not save settings:', error);
  }
}

/**
 * Keyboard control of the lens: aim it, zoom it, resize it, or put it away.
 *
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function handleKeyDown(event) {
  if (!lensContainer || isEditable(event.target)) {
    return;
  }

  // The lens is the bottom of the Escape stack: it stays on while any AssisT dialog or menu is
  // open above it, so closing a panel does not also switch the magnifier off.
  if (
    event.key === 'Escape' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !assistOverlayIsOpen()
  ) {
    settings = { ...settings, enabled: false };
    enabled = false;
    removeMagnifyingLens();
    persistSettings();
    showToast('Magnifier off');
    return;
  }

  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const step = event.shiftKey ? NUDGE_LARGE : NUDGE;

  switch (event.key) {
    case 'ArrowLeft':
      aimAt(currentX - step, currentY);
      break;
    case 'ArrowRight':
      aimAt(currentX + step, currentY);
      break;
    case 'ArrowUp':
      aimAt(currentX, currentY - step);
      break;
    case 'ArrowDown':
      aimAt(currentX, currentY + step);
      break;
    case '+':
    case '=':
      changeScale(SCALE_STEP);
      break;
    case '-':
    case '_':
      changeScale(-SCALE_STEP);
      break;
    case ']':
      changeSize(SIZE_STEP);
      break;
    case '[':
      changeSize(-SIZE_STEP);
      break;
    default:
      return;
  }

  event.preventDefault();
}

/**
 * Step the zoom, announce the new level once, and remember it.
 *
 * @param {number} delta
 * @returns {void}
 */
function changeScale(delta) {
  const next = clamp((settings.scale || 2.0) + delta, SCALE_MIN, SCALE_MAX);
  if (next === settings.scale) {
    return;
  }
  settings = { ...settings, scale: next };
  updateLens(currentX, currentY);
  persistSettings();
  showToast(`Magnifier zoom ${next.toFixed(2)}x`);
}

/**
 * Step the lens diameter, announce it once, and remember it.
 *
 * @param {number} delta
 * @returns {void}
 */
function changeSize(delta) {
  const next = clamp((settings.size || 275) + delta, SIZE_MIN, SIZE_MAX);
  if (next === settings.size) {
    return;
  }
  settings = { ...settings, size: next };
  removeMagnifyingLens();
  initMagnifyingLens();
  persistSettings();
  showToast(`Magnifier size ${next} pixels`);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

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
  // The lens holds a clone of the whole page. Left visible to assistive technology it would offer
  // a screen reader a second copy of every heading and link on the page.
  lensContainer.setAttribute('aria-hidden', 'true');
  // `aria-hidden` silences the clone but leaves every cloned link, button and field in the tab
  // order, so with the lens on, each control on the page became a second, nameless tab stop
  // (WCAG 2.2 SC 2.4.3, and axe's aria-hidden-focus rule). `inert` takes the whole subtree out of
  // the tab order as well, which is what a magnified picture of the page should be.
  lensContainer.setAttribute('inert', '');
  lensContainer.style.cssText = `
    position: fixed;
    z-index: ${Z.FOCUS};
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 0 0 4px ${lockPosition ? '#22c55e' : '#6366f1'}, 0 8px 32px rgba(0,0,0,0.4);
    background: white;
    opacity: 0;
    transition: ${prefersReducedMotion() ? 'none' : 'opacity 0.15s ease-out'};
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

  // Keep wherever the student had aimed the lens. Changing the zoom or the size rebuilds the lens,
  // and resetting to the middle of the screen each time would throw away the line they were on.
  if (!hasAimedPosition()) {
    currentX = window.innerWidth / 2;
    currentY = window.innerHeight / 2;
  }

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

  // Keyboard focus, the caret and the pointer all aim the same lens - whichever moved last wins,
  // so a student who uses both is never fighting the other input.
  focusInHandler = event => {
    aimAtElement(event.target);
  };
  selectionChangeHandler = () => {
    aimAtCaret();
  };
  keyDownHandler = handleKeyDown;

  document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
  window.addEventListener('scroll', scrollHandler, { passive: true });
  document.addEventListener('focusin', focusInHandler);
  document.addEventListener('selectionchange', selectionChangeHandler);
  document.addEventListener('keydown', keyDownHandler);

  console.log('[MagnifyingLens] Magnifying lens initialized');
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

  if (focusInHandler) {
    document.removeEventListener('focusin', focusInHandler);
    focusInHandler = null;
  }

  if (selectionChangeHandler) {
    document.removeEventListener('selectionchange', selectionChangeHandler);
    selectionChangeHandler = null;
  }

  if (keyDownHandler) {
    document.removeEventListener('keydown', keyDownHandler);
    keyDownHandler = null;
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
    // Announced once, on switch-on only: changing the zoom or the size rebuilds the lens, and a
    // student who nudges the zoom four times does not want the announcement four more times.
    //
    // Short on purpose. The earlier version read out the whole key list in a two-second toast,
    // which is about 45 words nobody can hold — and no way to see them again. The toast now says
    // the one thing needed to start and where the rest lives, and the help page's "Other keys that
    // always work" list carries the full set, so it can be read at any time (SC 3.2.6).
    showToast(
      '🔍 Magnifier on. Alt with an arrow key aims it, Escape turns it off. The full key list is on the AssisT help page.'
    );
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

// Initialize feature settings with storage utility
initFeatureSettings(
  'magnifyingLens',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

console.log('[MagnifyingLens] Module loaded');

export { applySettings, cleanup, DEFAULT_SETTINGS };
