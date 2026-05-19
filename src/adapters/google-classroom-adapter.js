/**
 * Google Classroom Adapter
 * Detects Google Classroom pages and extracts content for accessibility features
 *
 * @module google-classroom-adapter
 */

import { sanitizeHTML } from '../utils/sanitize.js';
import { attachInteractiveHandler } from '../utils/event-handlers.js';

/**
 * Google Classroom page types
 */
export const GoogleClassroomPageType = {
  UNKNOWN: 'unknown',
  STREAM: 'stream',
  CLASSWORK: 'classwork',
  ASSIGNMENT: 'assignment',
  PEOPLE: 'people',
  GRADES: 'grades',
  ANNOUNCEMENT: 'announcement',
  MATERIAL: 'material',
  OTHER: 'other',
};

/**
 * Check if current page is Google Classroom
 * @returns {boolean} True if on Google Classroom
 */
export function isGoogleClassroomPage() {
  const hostname = window.location.hostname;
  const isMockPage = document.querySelector('[data-assist-mock="google-classroom"]') !== null;

  if (!hostname.includes('classroom.google.com') && !isMockPage) {
    return false;
  }

  // Verify Google Classroom app is loaded
  const hasClassroomApp =
    document.querySelector('[data-focus-id="classroom-view"]') !== null ||
    document.querySelector('[data-id="app"]') !== null ||
    document.querySelector('[aria-label*="Classroom"]') !== null ||
    document.querySelector('.xSP5Vb') !== null; // Google class name (may change)

  return hasClassroomApp;
}

/**
 * Detect the type of Google Classroom page
 * @returns {string} Page type from GoogleClassroomPageType enum
 */
export function detectGoogleClassroomPageType() {
  if (!isGoogleClassroomPage()) {
    return GoogleClassroomPageType.UNKNOWN;
  }

  const pathname = window.location.pathname;
  const hash = window.location.hash;

  // Stream (home) page
  if (pathname.includes('/c/') && !hash) {
    return GoogleClassroomPageType.STREAM;
  }

  // Classwork page
  if (hash.includes('/w/') || hash.includes('/a/')) {
    return GoogleClassroomPageType.CLASSWORK;
  }

  // Assignment detail page
  if (hash.includes('/tc/')) {
    return GoogleClassroomPageType.ASSIGNMENT;
  }

  // People page
  if (hash.includes('/t/all')) {
    return GoogleClassroomPageType.PEOPLE;
  }

  // Grades page
  if (hash.includes('/gb/')) {
    return GoogleClassroomPageType.GRADES;
  }

  // Announcement
  if (document.querySelector('[data-announcement-id]')) {
    return GoogleClassroomPageType.ANNOUNCEMENT;
  }

  // Material
  if (document.querySelector('[data-material-id]')) {
    return GoogleClassroomPageType.MATERIAL;
  }

  return GoogleClassroomPageType.OTHER;
}

/**
 * Extract assignment content from Google Classroom assignment page
 * @returns {Object|null} Assignment data or null if not found
 */
export function extractAssignmentContent() {
  const pageType = detectGoogleClassroomPageType();
  if (pageType !== GoogleClassroomPageType.ASSIGNMENT) {
    return null;
  }

  // Try multiple selectors for Google Classroom assignment content
  // Note: Google uses dynamic class names, so we rely on aria-labels and data attributes
  const selectors = [
    '[aria-label*="Instructions"]',
    '[aria-label*="Description"]',
    '.YVvGBb', // Google class name (may change)
    'div[data-testid="assignment-description"]',
    '[role="article"] .VBEdtc-Wvd9Cc', // Google class names (may change)
  ];

  let contentElement = null;
  for (const selector of selectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) {
      break;
    }
  }

  if (!contentElement) {
    console.warn('[GoogleClassroomAdapter] Assignment content element not found');
    return null;
  }

  // Get assignment title
  const titleElement = document.querySelector(
    '[data-item-id] h1, .YVvGBb.z3vRzb, [aria-label*="title"]'
  );
  const title = titleElement?.textContent?.trim() || 'Assignment';

  // Extract text content
  const text = contentElement.textContent?.trim() || '';

  return {
    title,
    content: contentElement.innerHTML,
    text,
    element: contentElement,
  };
}

/**
 * Extract stream posts (announcements/assignments) from stream page
 * @returns {Array|null} Array of post objects or null
 */
export function extractStreamPosts() {
  const pageType = detectGoogleClassroomPageType();
  if (pageType !== GoogleClassroomPageType.STREAM) {
    return null;
  }

  const posts = [];

  // Google Classroom uses dynamic selectors, look for announcement cards
  const postElements = document.querySelectorAll(
    '[data-announcement-id], [data-item-id], .Fc1zpc, [role="article"]'
  );

  postElements.forEach((postEl, index) => {
    // Get post title
    const titleEl = postEl.querySelector('h2, .YVvGBb, [aria-label*="title"]');
    const title = titleEl?.textContent?.trim() || '';

    // Get post content
    const contentEl = postEl.querySelector('.JYVBee, .gJb0o, .YVvGBb');
    const content = contentEl?.textContent?.trim() || '';

    // Get timestamp
    const timeEl = postEl.querySelector('[aria-label*="Posted"], .asQXV');
    const timestamp = timeEl?.textContent?.trim() || '';

    if (title || content) {
      posts.push({
        number: index + 1,
        title,
        content,
        timestamp,
        element: postEl,
      });
    }
  });

  return posts.length > 0 ? posts : null;
}

/**
 * Extract classwork items from classwork page
 * @returns {Array|null} Array of classwork objects or null
 */
export function extractClassworkItems() {
  const pageType = detectGoogleClassroomPageType();
  if (pageType !== GoogleClassroomPageType.CLASSWORK) {
    return null;
  }

  const items = [];

  // Look for classwork cards
  const itemElements = document.querySelectorAll('[data-item-id], .WOPwXe, [role="listitem"]');

  itemElements.forEach((itemEl, index) => {
    // Get item title
    const titleEl = itemEl.querySelector('.YVvGBb, .onkcGd, [aria-label*="title"]');
    const title = titleEl?.textContent?.trim() || '';

    // Get item type (Assignment, Material, Quiz, etc.)
    const typeEl = itemEl.querySelector('[aria-label*="Assignment"], [aria-label*="Material"]');
    const type = typeEl?.getAttribute('aria-label') || 'Item';

    // Get due date
    const dueDateEl = itemEl.querySelector('.asQXV, [aria-label*="Due"]');
    const dueDate = dueDateEl?.textContent?.trim() || '';

    if (title) {
      items.push({
        number: index + 1,
        title,
        type,
        dueDate,
        element: itemEl,
      });
    }
  });

  return items.length > 0 ? items : null;
}

/**
 * Get clean text from Google Classroom content (remove UI elements)
 * @param {string} html - HTML content
 * @returns {string} Clean text
 */
export function getCleanText(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizeHTML(html);

  // Remove Google Classroom UI elements
  const uiSelectors = [
    '.VfPpkd-xl07Ob-XxIAqe', // Material Design buttons
    'script',
    'style',
    'noscript',
    '[aria-hidden="true"]',
    '.VfPpkd-rymPhb', // Icons
  ];

  uiSelectors.forEach(selector => {
    tempDiv.querySelectorAll(selector).forEach(el => el.remove());
  });

  return tempDiv.textContent.trim();
}

/**
 * Check if Google Classroom content is fully loaded
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} Resolves when content is loaded
 */
export function waitForGoogleClassroomContent(timeout = 5000) {
  return new Promise(resolve => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      // Check if main content area is loaded
      const contentLoaded =
        document.querySelector(
          '[data-focus-id="classroom-view"], [data-id="app"], .VBEdtc-Wvd9Cc'
        ) !== null;

      if (contentLoaded) {
        clearInterval(checkInterval);
        resolve(true);
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        console.warn('[GoogleClassroomAdapter] Content load timeout');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Create floating action button for Google Classroom features
 * @param {Object} options - Button options
 * @returns {HTMLElement} FAB element
 */
export function createGoogleClassroomFAB(options = {}) {
  const { text = 'Read', icon = '▶️', onClick = () => {}, position = 'bottom-right' } = options;

  const fab = document.createElement('button');
  fab.className = 'assist-google-classroom-fab';
  fab.setAttribute('aria-label', text);

  // Position styles
  const positions = {
    'bottom-right': 'bottom: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'top-right': 'top: 80px; right: 20px;',
    'top-left': 'top: 80px; left: 20px;',
  };

  fab.style.cssText = `
    position: fixed;
    ${positions[position] || positions['bottom-right']}
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4285f4 0%, #34a853 100%);
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    z-index: 9999;
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  `;

  fab.innerHTML = sanitizeHTML(icon);

  // Hover effect
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1)';
    fab.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
  });

  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  });

  attachInteractiveHandler(fab, 'Google Classroom FAB', onClick, { enableVisualFeedback: false });

  return fab;
}

/**
 * Export all functions as default object
 */
export default {
  isGoogleClassroomPage,
  detectGoogleClassroomPageType,
  extractAssignmentContent,
  extractStreamPosts,
  extractClassworkItems,
  getCleanText,
  waitForGoogleClassroomContent,
  createGoogleClassroomFAB,
  GoogleClassroomPageType,
};
