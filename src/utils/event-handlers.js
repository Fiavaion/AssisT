/**
 * Event Handler Utilities
 *
 * Provides robust event handling patterns to prevent race conditions
 * with document-level mousedown listeners.
 *
 * Per LESSONS_UI_EVENT_HANDLING.md:
 * - Use mousedown instead of click to prevent race conditions
 * - Always call preventDefault() and stopPropagation()
 * - Provide visual feedback for accessibility
 * - Include error handling and debug logging
 *
 * @module utils/event-handlers
 */

// Configuration options
const DEFAULT_CONFIG = {
  enableVisualFeedback: true,
  feedbackScale: 1.05,
  enableLogging: true,
  logPrefix: '[EventHandler]',
};

/**
 * Attaches a robust interactive handler to an element.
 * Uses mousedown instead of click to prevent race conditions.
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label for logging
 * @param {Function} handler - Handler function (receives event)
 * @param {Object} options - Configuration options
 * @returns {Function} Cleanup function to remove handlers
 *
 * @example
 * import { attachInteractiveHandler } from '../utils/event-handlers.js';
 *
 * const cleanup = attachInteractiveHandler(
 *   button,
 *   'Play Button',
 *   () => togglePlayback()
 * );
 *
 * // Later, to remove handlers:
 * cleanup();
 */
export function attachInteractiveHandler(element, label, handler, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!element) {
    if (config.enableLogging) {
      console.warn(`${config.logPrefix} Element not found for: ${label}`);
    }
    return () => {};
  }

  // Main interaction handler - use onmousedown for immediate response
  const mousedownHandler = e => {
    if (config.enableLogging) {
      console.log(`${config.logPrefix} ${label} triggered`);
    }

    e.preventDefault();
    e.stopPropagation();

    try {
      handler(e);
    } catch (error) {
      console.error(`${config.logPrefix} ${label} error:`, error);
    }
  };

  // BUG-6 fix: use addEventListener instead of direct .onmousedown assignment
  // so we don't clobber existing handlers set by Canvas/Moodle on the same element.
  element.addEventListener('mousedown', mousedownHandler);

  // Visual feedback for accessibility
  let mouseenterHandler = null;
  let mouseleaveHandler = null;
  if (config.enableVisualFeedback) {
    const originalTransform = element.style.transform || '';

    mouseenterHandler = () => {
      element.style.transform = `scale(${config.feedbackScale})`;
      element.style.cursor = 'pointer';
    };
    mouseleaveHandler = () => {
      element.style.transform = originalTransform;
    };

    element.addEventListener('mouseenter', mouseenterHandler);
    element.addEventListener('mouseleave', mouseleaveHandler);
  }

  // Return cleanup function
  return () => {
    element.removeEventListener('mousedown', mousedownHandler);
    if (mouseenterHandler) {
      element.removeEventListener('mouseenter', mouseenterHandler);
    }
    if (mouseleaveHandler) {
      element.removeEventListener('mouseleave', mouseleaveHandler);
    }
  };
}

/**
 * Attaches handler without visual feedback (for subtle UI elements)
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function
 * @returns {Function} Cleanup function
 *
 * @example
 * // For elements where scale transform would look odd
 * attachQuietHandler(closeIcon, 'Close Icon', () => closeModal());
 */
export function attachQuietHandler(element, label, handler) {
  return attachInteractiveHandler(element, label, handler, {
    enableVisualFeedback: false,
  });
}

/**
 * Batch attaches handlers to multiple elements
 *
 * @param {Array<{element: HTMLElement, label: string, handler: Function}>} handlers
 * @param {Object} options - Shared configuration
 * @returns {Function} Cleanup function for all handlers
 *
 * @example
 * const cleanup = attachHandlerBatch([
 *   { element: playBtn, label: 'Play', handler: play },
 *   { element: pauseBtn, label: 'Pause', handler: pause },
 *   { element: stopBtn, label: 'Stop', handler: stop }
 * ]);
 */
export function attachHandlerBatch(handlers, options = {}) {
  const cleanups = handlers.map(({ element, label, handler }) =>
    attachInteractiveHandler(element, label, handler, options)
  );

  return () => cleanups.forEach(cleanup => cleanup());
}

/**
 * Creates a delegated event handler for dynamically created elements
 *
 * @param {HTMLElement} container - Parent container
 * @param {string} selector - CSS selector for target elements
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function (receives event and matched element)
 * @returns {Function} Cleanup function
 *
 * @example
 * // For dynamically created list items
 * attachDelegatedHandler(
 *   list,
 *   '.list-item button',
 *   'List Item Button',
 *   (e, button) => handleItemClick(button)
 * );
 */
export function attachDelegatedHandler(container, selector, label, handler) {
  if (!container) {
    console.warn(`[EventHandler] Container not found for delegated: ${label}`);
    return () => {};
  }

  const delegatedHandler = e => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      console.log(`[EventHandler] ${label} delegated to:`, target);
      e.preventDefault();
      e.stopPropagation();

      try {
        handler(e, target);
      } catch (error) {
        console.error(`[EventHandler] ${label} error:`, error);
      }
    }
  };

  container.addEventListener('mousedown', delegatedHandler);

  return () => container.removeEventListener('mousedown', delegatedHandler);
}

/**
 * Attaches handler with keyboard support for accessibility
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function
 * @param {Object} options - Configuration options
 * @returns {Function} Cleanup function
 *
 * @example
 * // For buttons that should respond to Enter and Space
 * attachAccessibleHandler(button, 'Submit Button', () => submitForm());
 */
export function attachAccessibleHandler(element, label, handler, options = {}) {
  const cleanup = attachInteractiveHandler(element, label, handler, options);

  if (!element) {
    return cleanup;
  }

  // Keyboard handler for Enter and Space
  const keydownHandler = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      console.log(`[EventHandler] ${label} triggered (keyboard)`);

      try {
        handler(e);
      } catch (error) {
        console.error(`[EventHandler] ${label} error:`, error);
      }
    }
  };

  element.addEventListener('keydown', keydownHandler);

  // Return combined cleanup
  return () => {
    cleanup();
    element.removeEventListener('keydown', keydownHandler);
  };
}

// Legacy support for scripts that can't use ESM imports
if (typeof window !== 'undefined') {
  window.AssistEventHandlers = {
    attachInteractiveHandler,
    attachQuietHandler,
    attachHandlerBatch,
    attachDelegatedHandler,
    attachAccessibleHandler,
  };
}

export default {
  attachInteractiveHandler,
  attachQuietHandler,
  attachHandlerBatch,
  attachDelegatedHandler,
  attachAccessibleHandler,
};
