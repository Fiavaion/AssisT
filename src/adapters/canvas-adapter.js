/**
 * Canvas LMS Adapter
 * Detects Canvas pages and extracts content for accessibility features
 *
 * @module canvas-adapter
 */

/**
 * Canvas page types
 */
export const CanvasPageType = {
  UNKNOWN: 'unknown',
  ASSIGNMENT: 'assignment',
  QUIZ: 'quiz',
  DISCUSSION: 'discussion',
  ANNOUNCEMENT: 'announcement',
  MODULE: 'module',
  COURSE_HOME: 'course_home',
  OTHER: 'other'
};

/**
 * Check if current page is a Canvas LMS page
 * @returns {boolean} True if on Canvas domain
 */
export function isCanvasPage() {
  const hostname = window.location.hostname;

  // Check for common Canvas domains
  const canvasPatterns = [
    /\.instructure\.com$/,
    /\.canvas\./,
    /canvas\./
  ];

  // Check if body has Canvas-specific classes
  const hasCanvasClass = document.body?.classList.contains('course-menu-expanded') ||
                         document.body?.classList.contains('primary-nav-expanded') ||
                         document.getElementById('application') !== null;

  return canvasPatterns.some(pattern => pattern.test(hostname)) || hasCanvasClass;
}

/**
 * Detect the type of Canvas page
 * @returns {string} Page type from CanvasPageType enum
 */
export function detectCanvasPageType() {
  if (!isCanvasPage()) {
    return CanvasPageType.UNKNOWN;
  }

  const pathname = window.location.pathname;
  const url = window.location.href;

  // Assignment page
  if (pathname.includes('/assignments/') && !pathname.includes('/assignments$')) {
    return CanvasPageType.ASSIGNMENT;
  }

  // Quiz page
  if (pathname.includes('/quizzes/') || pathname.includes('/quiz_submissions/')) {
    return CanvasPageType.QUIZ;
  }

  // Discussion page
  if (pathname.includes('/discussion_topics/')) {
    return CanvasPageType.DISCUSSION;
  }

  // Announcement page
  if (pathname.includes('/announcements/')) {
    return CanvasPageType.ANNOUNCEMENT;
  }

  // Module page
  if (pathname.includes('/modules')) {
    return CanvasPageType.MODULE;
  }

  // Course home
  if (pathname.match(/\/courses\/\d+\/?$/)) {
    return CanvasPageType.COURSE_HOME;
  }

  return CanvasPageType.OTHER;
}

/**
 * Extract assignment content from Canvas assignment page
 * @returns {Object|null} Assignment data or null if not found
 */
export function extractAssignmentContent() {
  const pageType = detectCanvasPageType();
  if (pageType !== CanvasPageType.ASSIGNMENT) {
    return null;
  }

  // Try multiple selectors for Canvas assignment content
  const selectors = [
    '.description.user_content',
    '.assignment_description',
    '#assignment_show .description',
    '.show-content .user_content',
    'div[data-testid="assignment-description"]'
  ];

  let contentElement = null;
  for (const selector of selectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }

  if (!contentElement) {
    console.warn('[CanvasAdapter] Assignment content element not found');
    return null;
  }

  // Get assignment title
  const titleElement = document.querySelector('.page-title, h1.title, [data-testid="assignment-title"]');
  const title = titleElement?.textContent?.trim() || 'Assignment';

  // Extract text content, preserving structure
  const sections = extractSections(contentElement);

  return {
    title,
    content: contentElement.innerHTML,
    text: contentElement.textContent.trim(),
    sections,
    element: contentElement
  };
}

/**
 * Extract content sections from element (by headings)
 * @param {HTMLElement} element - Container element
 * @returns {Array} Array of section objects
 */
function extractSections(element) {
  const sections = [];
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');

  if (headings.length === 0) {
    // No headings, treat entire content as one section
    return [{
      title: 'Content',
      text: element.textContent.trim(),
      element: element
    }];
  }

  headings.forEach((heading, index) => {
    const title = heading.textContent.trim();

    // Get content until next heading
    let content = '';
    let currentElement = heading.nextElementSibling;
    const nextHeading = headings[index + 1];

    while (currentElement && currentElement !== nextHeading) {
      content += currentElement.textContent + '\n';
      currentElement = currentElement.nextElementSibling;
    }

    sections.push({
      title,
      text: content.trim(),
      level: parseInt(heading.tagName[1]), // h1 = 1, h2 = 2, etc.
      element: heading
    });
  });

  return sections;
}

/**
 * Extract quiz questions from Canvas quiz page
 * @returns {Array|null} Array of question objects or null
 */
export function extractQuizQuestions() {
  const pageType = detectCanvasPageType();
  if (pageType !== CanvasPageType.QUIZ) {
    return null;
  }

  const questions = [];
  const questionElements = document.querySelectorAll('.question, [data-testid="question"]');

  questionElements.forEach((questionEl, index) => {
    const questionText = questionEl.querySelector('.question_text, .question-text')?.textContent?.trim();
    const answers = [];

    // Extract answer options
    const answerElements = questionEl.querySelectorAll('.answer, .answer_label, [role="radio"], [role="checkbox"]');
    answerElements.forEach(answerEl => {
      answers.push({
        text: answerEl.textContent.trim(),
        element: answerEl
      });
    });

    if (questionText) {
      questions.push({
        number: index + 1,
        text: questionText,
        answers,
        element: questionEl
      });
    }
  });

  return questions.length > 0 ? questions : null;
}

/**
 * Get clean text from Canvas content (remove UI elements)
 * @param {string} html - HTML content
 * @returns {string} Clean text
 */
export function getCleanText(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Remove Canvas UI elements
  const uiSelectors = [
    '.screenreader-only',
    '.element_toggler',
    'script',
    'style',
    'noscript'
  ];

  uiSelectors.forEach(selector => {
    tempDiv.querySelectorAll(selector).forEach(el => el.remove());
  });

  return tempDiv.textContent.trim();
}

/**
 * Check if Canvas content is fully loaded
 * @returns {Promise<boolean>} Resolves when content is loaded
 */
export function waitForCanvasContent(timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      const contentLoaded = document.querySelector('.user_content, .description, [data-testid="assignment-description"]') !== null;

      if (contentLoaded) {
        clearInterval(checkInterval);
        resolve(true);
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        console.warn('[CanvasAdapter] Content load timeout');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Create floating action button for Canvas features
 * @param {Object} options - Button options
 * @returns {HTMLElement} FAB element
 */
export function createCanvasFAB(options = {}) {
  const {
    text = 'Read',
    icon = '▶️',
    onClick = () => {},
    position = 'bottom-right'
  } = options;

  const fab = document.createElement('button');
  fab.className = 'assist-canvas-fab';
  fab.setAttribute('aria-label', text);

  // Position styles
  const positions = {
    'bottom-right': 'bottom: 20px; right: 20px;',
    'bottom-left': 'bottom: 20px; left: 20px;',
    'top-right': 'top: 80px; right: 20px;',
    'top-left': 'top: 80px; left: 20px;'
  };

  fab.style.cssText = `
    position: fixed;
    ${positions[position] || positions['bottom-right']}
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

  fab.innerHTML = icon;

  // Hover effect
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1)';
    fab.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
  });

  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  });

  fab.addEventListener('click', onClick);

  return fab;
}

/**
 * Export all functions as default object
 */
export default {
  isCanvasPage,
  detectCanvasPageType,
  extractAssignmentContent,
  extractQuizQuestions,
  getCleanText,
  waitForCanvasContent,
  createCanvasFAB,
  CanvasPageType
};
