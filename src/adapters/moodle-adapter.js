/**
 * Moodle LMS Adapter
 * Detects Moodle pages and extracts content for accessibility features
 *
 * @module moodle-adapter
 */

import { sanitizeHTML } from '../utils/sanitize.js';

/**
 * Moodle page types
 */
export const MoodlePageType = {
  UNKNOWN: 'unknown',
  ASSIGNMENT: 'assignment',
  QUIZ: 'quiz',
  FORUM: 'forum',
  PAGE: 'page',
  RESOURCE: 'resource',
  COURSE_HOME: 'course_home',
  MODULE: 'module',
  OTHER: 'other',
};

/**
 * Check if current page is a Moodle LMS page
 * @returns {boolean} True if on Moodle domain
 */
export function isMoodlePage() {
  const hostname = window.location.hostname;

  // Check for common Moodle domains
  const moodlePatterns = [/moodle/i, /\.lms\./, /learning\./, /elearning\./];

  // Check if body has Moodle-specific classes
  const hasMoodleClass =
    document.body?.classList.contains('pagelayout-standard') ||
    document.body?.classList.contains('path-mod-') ||
    document.body?.classList.contains('dir-ltr') ||
    document.querySelector('meta[name="Moodle"]') !== null ||
    document.querySelector('.page-footer-content-container') !== null ||
    document.getElementById('page-wrapper') !== null;

  return moodlePatterns.some(pattern => pattern.test(hostname)) || hasMoodleClass;
}

/**
 * Detect the type of Moodle page
 * @returns {string} Page type from MoodlePageType enum
 */
export function detectMoodlePageType() {
  if (!isMoodlePage()) {
    return MoodlePageType.UNKNOWN;
  }

  const pathname = window.location.pathname;
  const bodyClasses = Array.from(document.body?.classList || []).join(' ');

  // Assignment page
  if (bodyClasses.includes('path-mod-assign') || pathname.includes('/mod/assign/')) {
    return MoodlePageType.ASSIGNMENT;
  }

  // Quiz page
  if (bodyClasses.includes('path-mod-quiz') || pathname.includes('/mod/quiz/')) {
    return MoodlePageType.QUIZ;
  }

  // Forum page
  if (bodyClasses.includes('path-mod-forum') || pathname.includes('/mod/forum/')) {
    return MoodlePageType.FORUM;
  }

  // Page resource
  if (bodyClasses.includes('path-mod-page') || pathname.includes('/mod/page/')) {
    return MoodlePageType.PAGE;
  }

  // Resource (file/link)
  if (bodyClasses.includes('path-mod-resource') || pathname.includes('/mod/resource/')) {
    return MoodlePageType.RESOURCE;
  }

  // Course home
  if (bodyClasses.includes('path-course-view') || pathname.includes('/course/view.php')) {
    return MoodlePageType.COURSE_HOME;
  }

  // Module page
  if (bodyClasses.includes('path-mod-') || pathname.includes('/mod/')) {
    return MoodlePageType.MODULE;
  }

  return MoodlePageType.OTHER;
}

/**
 * Extract assignment content from Moodle assignment page
 * @returns {Object|null} Assignment data or null if not found
 */
export function extractAssignmentContent() {
  const pageType = detectMoodlePageType();
  if (pageType !== MoodlePageType.ASSIGNMENT) {
    return null;
  }

  // Try multiple selectors for Moodle assignment content
  const selectors = [
    '.box.generalbox.boxaligncenter',
    '#intro',
    '.assignment-description',
    '.activityinstance',
    'div[role="main"] .no-overflow',
    '.activity-description',
  ];

  let contentElement = null;
  for (const selector of selectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) {
      break;
    }
  }

  if (!contentElement) {
    console.warn('[MoodleAdapter] Assignment content element not found');
    return null;
  }

  // Get assignment title
  const titleElement = document.querySelector(
    'h2.main, h1, .page-header-headings h1, #page-header h1'
  );
  const title = titleElement?.textContent?.trim() || 'Assignment';

  // Extract text content, preserving structure
  const sections = extractSections(contentElement);

  return {
    title,
    content: contentElement.innerHTML,
    text: contentElement.textContent.trim(),
    sections,
    element: contentElement,
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
    return [
      {
        title: 'Content',
        text: element.textContent.trim(),
        element: element,
      },
    ];
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
      element: heading,
    });
  });

  return sections;
}

/**
 * Extract quiz questions from Moodle quiz page
 * @returns {Array|null} Array of question objects or null
 */
export function extractQuizQuestions() {
  const pageType = detectMoodlePageType();
  if (pageType !== MoodlePageType.QUIZ) {
    return null;
  }

  const questions = [];
  const questionElements = document.querySelectorAll('.que, .formulation, [class*="question"]');

  questionElements.forEach((questionEl, index) => {
    const questionText = questionEl.querySelector('.qtext, .questiontext')?.textContent?.trim();
    const answers = [];

    // Extract answer options
    const answerElements = questionEl.querySelectorAll(
      '.answer label, .r0, .r1, input[type="radio"] + label, input[type="checkbox"] + label'
    );
    answerElements.forEach(answerEl => {
      const text = answerEl.textContent.trim();
      if (text) {
        answers.push({
          text,
          element: answerEl,
        });
      }
    });

    if (questionText) {
      questions.push({
        number: index + 1,
        text: questionText,
        answers,
        element: questionEl,
      });
    }
  });

  return questions.length > 0 ? questions : null;
}

/**
 * Extract forum posts from Moodle forum page
 * @returns {Array|null} Array of post objects or null
 */
export function extractForumPosts() {
  const pageType = detectMoodlePageType();
  if (pageType !== MoodlePageType.FORUM) {
    return null;
  }

  const posts = [];
  const postElements = document.querySelectorAll(
    '.forumpost, article.forum-post, [data-region="post"]'
  );

  postElements.forEach((postEl, index) => {
    const author = postEl.querySelector('.author, .username')?.textContent?.trim();
    const content = postEl.querySelector('.posting, .content')?.textContent?.trim();
    const timestamp = postEl.querySelector('.time, .post-time')?.textContent?.trim();

    if (content) {
      posts.push({
        number: index + 1,
        author: author || 'Unknown',
        content,
        timestamp: timestamp || '',
        element: postEl,
      });
    }
  });

  return posts.length > 0 ? posts : null;
}

/**
 * Extract page resource content
 * @returns {Object|null} Page data or null if not found
 */
export function extractPageContent() {
  const pageType = detectMoodlePageType();
  if (pageType !== MoodlePageType.PAGE) {
    return null;
  }

  // Try multiple selectors for Moodle page content
  const selectors = ['div[role="main"]', '.region-main-box', '#region-main', '.generalbox'];

  let contentElement = null;
  for (const selector of selectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) {
      break;
    }
  }

  if (!contentElement) {
    console.warn('[MoodleAdapter] Page content element not found');
    return null;
  }

  // Get page title
  const titleElement = document.querySelector('h2, #page-header h1, .page-header-headings h1');
  const title = titleElement?.textContent?.trim() || 'Page';

  return {
    title,
    content: contentElement.innerHTML,
    text: contentElement.textContent.trim(),
    element: contentElement,
  };
}

/**
 * Get clean text from Moodle content (remove UI elements)
 * @param {string} html - HTML content
 * @returns {string} Clean text
 */
export function getCleanText(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizeHTML(html);

  // Remove Moodle UI elements
  const uiSelectors = [
    '.accesshide',
    '.sr-only',
    'script',
    'style',
    'noscript',
    '.commands',
    '.link-block-metadata',
  ];

  uiSelectors.forEach(selector => {
    tempDiv.querySelectorAll(selector).forEach(el => el.remove());
  });

  return tempDiv.textContent.trim();
}

/**
 * Check if Moodle content is fully loaded
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} Resolves when content is loaded
 */
export function waitForMoodleContent(timeout = 5000) {
  return new Promise(resolve => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      const contentLoaded =
        document.querySelector('div[role="main"], .region-main-box, #region-main, .generalbox') !==
        null;

      if (contentLoaded) {
        clearInterval(checkInterval);
        resolve(true);
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        console.warn('[MoodleAdapter] Content load timeout');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Create floating action button for Moodle features
 * @param {Object} options - Button options
 * @returns {HTMLElement} FAB element
 */
export function createMoodleFAB(options = {}) {
  const { text = 'Read', icon = '▶️', onClick = () => {}, position = 'bottom-right' } = options;

  const fab = document.createElement('button');
  fab.className = 'assist-moodle-fab';
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
    background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%);
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

  fab.addEventListener('click', onClick);

  return fab;
}

/**
 * Export all functions as default object
 */
export default {
  isMoodlePage,
  detectMoodlePageType,
  extractAssignmentContent,
  extractQuizQuestions,
  extractForumPosts,
  extractPageContent,
  getCleanText,
  waitForMoodleContent,
  createMoodleFAB,
  MoodlePageType,
};
