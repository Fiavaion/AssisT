/**
 * DOM Utilities
 * Common DOM manipulation helpers
 */

/**
 * Convert hex color to rgba with opacity
 * @param {string} hex - Hex color code (with or without #)
 * @param {number} opacity - Opacity value (0-1)
 * @returns {string} RGBA color string
 */
export function hexToRgba(hex, opacity) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in ms (default: 2000)
 */
export function showToast(message, duration = 2000) {
  const existing = document.getElementById('assist-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'assist-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(33, 150, 243, 0.95);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: -apple-system, system-ui, sans-serif;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Wait for an element to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise<Element>} The found element
 */
export function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Create a Floating Action Button (FAB)
 * @param {Object} options - Button options
 * @param {string} options.id - Button ID
 * @param {string} options.text - Button text
 * @param {Function} options.onClick - Click handler
 * @param {string} options.position - Position (default: bottom-right)
 * @returns {HTMLElement} The created button element
 */
export function createFAB(options) {
  const {
    id,
    text,
    onClick,
    position = 'bottom-right',
    backgroundColor = '#2196F3',
    color = 'white',
  } = options;

  const button = document.createElement('button');
  button.id = id;
  button.textContent = text;
  button.setAttribute('aria-label', text);

  // Position styles
  const positions = {
    'bottom-right': 'bottom: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'top-right': 'top: 20px; right: 20px;',
    'top-left': 'top: 20px; left: 20px;',
  };

  button.style.cssText = `
    position: fixed;
    ${positions[position] || positions['bottom-right']}
    z-index: 999998;
    background-color: ${backgroundColor};
    color: ${color};
    border: none;
    border-radius: 50%;
    width: 56px;
    height: 56px;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: transform 0.2s, box-shadow 0.2s;
    font-family: -apple-system, system-ui, sans-serif;
  `;

  // Hover effects
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  });

  button.addEventListener('click', onClick);

  return button;
}

/**
 * Inject CSS styles into the page
 * @param {string} css - CSS string to inject
 * @param {string} id - Style element ID (optional)
 * @returns {HTMLStyleElement} The created style element
 */
export function injectStyles(css, id = null) {
  const style = document.createElement('style');
  if (id) {
    style.id = id;
  }
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

/**
 * Remove styles by ID
 * @param {string} id - Style element ID
 */
export function removeStyles(id) {
  const style = document.getElementById(id);
  if (style) {
    style.remove();
  }
}
