/**
 * HTML Sanitization Utility
 *
 * Provides centralized HTML sanitization using DOMPurify to prevent XSS attacks.
 * All innerHTML assignments in the codebase should use these functions.
 *
 * Chrome Web Store Compliance: Required for extension security review
 *
 * NOTE: DOMPurify is loaded globally via content-simple.js (window.DOMPurify)
 * This allows web_accessible_resources to use sanitization without bundling issues.
 *
 * @module utils/sanitize
 */

// Lazy getter for DOMPurify - only evaluated when functions are called
// This prevents timing issues with module loading order
function getDOMPurify() {
  if (!window.DOMPurify) {
    throw new Error('[Sanitize] DOMPurify not available. Ensure content-simple.js loaded first.');
  }
  return window.DOMPurify;
}

/**
 * Forces every surviving tabindex to a roving-safe value.
 *
 * A positive tabindex moves an element ahead of everything in document order, across the
 * WHOLE page, which is why WCAG treats it as a focus-order failure (SC 2.4.3). The
 * allowlist can only admit the attribute name, so the value is constrained here instead:
 * anything that is not "0" or "-1" becomes "0" — still focusable, never queue-jumping.
 * Nothing the extension renders needs a positive value; text captured from a host page
 * might well contain one.
 *
 * @param {Element} node - Node being sanitized
 */
function clampTabIndex(node) {
  if (typeof node?.getAttribute !== 'function' || !node.hasAttribute('tabindex')) {
    return;
  }

  const value = node.getAttribute('tabindex');
  if (value !== '0' && value !== '-1') {
    node.setAttribute('tabindex', '0');
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 *
 * @param {string} dirtyHTML - Untrusted HTML string to sanitize
 * @param {Object} config - Optional DOMPurify configuration
 * @returns {string} - Sanitized HTML safe for innerHTML
 *
 * @example
 * element.innerHTML = sanitizeHTML(userInput);
 */
export function sanitizeHTML(dirtyHTML, config = {}) {
  if (!dirtyHTML || typeof dirtyHTML !== 'string') {
    return '';
  }

  const defaultConfig = {
    ALLOWED_TAGS: [
      'b',
      'i',
      'u',
      'em',
      'strong',
      'a',
      'p',
      'br',
      'span',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
      'code',
      'pre',
      'blockquote',
      'button',
      'input',
      'label',
      'select',
      'option',
      'textarea',
      'form',
      'svg',
      'g',
      'defs',
      'use',
      'path',
      'circle',
      'rect',
      'line',
      'polygon',
      'polyline',
      'text',
      'tspan',
      'marker',
      'small',
      'mark',
      'del',
      'ins',
      'sub',
      'sup',
      'style',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'src',
      'alt',
      'title',
      'class',
      'id',
      'style',
      'data-*',
      'aria-*',
      'role',
      // Keyboard operability (SC 2.1.1). An integer-valued global attribute with no URL
      // and no script in it — DOMPurify allows it by default, and it is listed here only
      // because this config replaces those defaults wholesale. Stripping it silently
      // un-focused every element the extension renders through innerHTML: the roving
      // citation cards, the panel's own view tabs, the annotation sidebar's role="button"
      // items, and the assignment breakdown's role="checkbox" steps were all reachable by
      // mouse only.
      //
      // An allowlist admits the NAME, never the value, so clampTabIndex below constrains
      // the value. Some of this markup carries text lifted off the host page, and a
      // positive tabindex in that text would otherwise jump the whole document's tab
      // order (SC 2.4.3).
      'tabindex',
      'width',
      'height',
      'type',
      'value',
      'placeholder',
      'name',
      'viewBox',
      'd',
      'fill',
      'stroke',
      'stroke-width',
      'cx',
      'cy',
      'r',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'points',
      // Form-related attributes
      'selected',
      'disabled',
      'checked',
      'readonly',
      'required',
      'multiple',
      'size',
      'for',
      'min',
      'max',
      'step',
      'maxlength',
      'minlength',
      'pattern',
      'autocomplete',
      'autofocus',
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
  };

  const mergedConfig = { ...defaultConfig, ...config };

  // Scoped to this function only: the hook is registered for the one call and removed
  // again, so sanitizeUserContent and sanitizeText — which do not allow tabindex at all —
  // keep stripping it rather than rewriting it.
  const purify = getDOMPurify();
  purify.addHook('afterSanitizeAttributes', clampTabIndex);
  try {
    return purify.sanitize(dirtyHTML, mergedConfig);
  } finally {
    // By reference, not by entry point: removeHook('afterSanitizeAttributes') pops the
    // LAST hook registered there, which would silently remove someone else's if a
    // persistent one is ever added.
    purify.removeHook('afterSanitizeAttributes', clampTabIndex);
  }
}

/**
 * Sanitizes HTML with stricter rules (for user-generated content)
 * Removes all potentially dangerous elements and attributes
 *
 * @param {string} dirtyHTML - Untrusted HTML string to sanitize
 * @returns {string} - Strictly sanitized HTML
 *
 * @example
 * element.innerHTML = sanitizeUserContent(userComment);
 */
export function sanitizeUserContent(dirtyHTML) {
  if (!dirtyHTML || typeof dirtyHTML !== 'string') {
    return '';
  }

  return getDOMPurify().sanitize(dirtyHTML, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'p', 'br', 'span', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
  });
}

/**
 * Sanitizes text content only (strips all HTML tags)
 * Use when you only want plain text, no formatting
 *
 * @param {string} dirtyHTML - HTML string to convert to plain text
 * @returns {string} - Plain text with all HTML removed
 *
 * @example
 * element.textContent = sanitizeText(userInput);
 */
export function sanitizeText(dirtyHTML) {
  if (!dirtyHTML || typeof dirtyHTML !== 'string') {
    return '';
  }

  return getDOMPurify().sanitize(dirtyHTML, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes SVG content specifically
 * Allows SVG elements while preventing XSS
 *
 * @param {string} dirtySVG - Untrusted SVG string to sanitize
 * @returns {string} - Sanitized SVG
 *
 * @example
 * svgElement.innerHTML = sanitizeSVG(svgContent);
 */
export function sanitizeSVG(dirtySVG) {
  if (!dirtySVG || typeof dirtySVG !== 'string') {
    return '';
  }

  return getDOMPurify().sanitize(dirtySVG, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS: [
      'svg',
      'path',
      'circle',
      'rect',
      'line',
      'polygon',
      'polyline',
      'g',
      'defs',
      'use',
      'symbol',
    ],
    ALLOWED_ATTR: [
      'viewBox',
      'd',
      'fill',
      'stroke',
      'stroke-width',
      'cx',
      'cy',
      'r',
      'x',
      'y',
      'width',
      'height',
      'class',
      'id',
      'transform',
    ],
  });
}

/**
 * Safely sets innerHTML with sanitization
 * Convenience wrapper that sanitizes and sets innerHTML in one call
 *
 * @param {HTMLElement} element - DOM element to update
 * @param {string} dirtyHTML - Untrusted HTML to sanitize and insert
 * @param {Object} config - Optional DOMPurify configuration
 *
 * @example
 * setSafeHTML(element, userInput);
 */
export function setSafeHTML(element, dirtyHTML, config = {}) {
  if (!element || !(element instanceof HTMLElement)) {
    console.error('[Sanitize] Invalid element provided to setSafeHTML');
    return;
  }

  element.innerHTML = sanitizeHTML(dirtyHTML, config);
}

/**
 * Sanitizes URL to prevent javascript: and data: URL attacks
 *
 * @param {string} url - URL to sanitize
 * @returns {string} - Sanitized URL or empty string if dangerous
 *
 * @example
 * link.href = sanitizeURL(userProvidedURL);
 */
export function sanitizeURL(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmedURL = url.trim().toLowerCase();

  // Block dangerous protocols
  if (
    trimmedURL.startsWith('javascript:') ||
    trimmedURL.startsWith('data:') ||
    trimmedURL.startsWith('vbscript:')
  ) {
    console.warn('[Sanitize] Blocked dangerous URL protocol');
    return '';
  }

  return url.trim();
}
