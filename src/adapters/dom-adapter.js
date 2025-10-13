/**
 * DOM Adapter
 * Safely interacts with Canvas VLE DOM in Isolated World
 * Provides utilities for content detection, extraction, and manipulation
 */

export class DOMAdapter {
  constructor() {
    this.canvasContentTypes = {
      ASSIGNMENT: 'assignment',
      DISCUSSION: 'discussion',
      PAGE: 'page',
      QUIZ: 'quiz',
      ANNOUNCEMENT: 'announcement',
      SYLLABUS: 'syllabus',
      MODULE: 'module',
      UNKNOWN: 'unknown',
    };
  }

  /**
   * Detect the type of Canvas content on current page
   */
  detectContentType() {
    const pathname = window.location.pathname;

    if (pathname.includes('/assignments/')) {
      return this.canvasContentTypes.ASSIGNMENT;
    }
    if (pathname.includes('/discussion_topics/')) {
      return this.canvasContentTypes.DISCUSSION;
    }
    if (pathname.includes('/pages/')) {
      return this.canvasContentTypes.PAGE;
    }
    if (pathname.includes('/quizzes/')) {
      return this.canvasContentTypes.QUIZ;
    }
    if (pathname.includes('/announcements/')) {
      return this.canvasContentTypes.ANNOUNCEMENT;
    }
    if (pathname.includes('/assignments/syllabus')) {
      return this.canvasContentTypes.SYLLABUS;
    }
    if (pathname.includes('/modules/')) {
      return this.canvasContentTypes.MODULE;
    }

    return this.canvasContentTypes.UNKNOWN;
  }

  /**
   * Extract course ID from URL
   */
  extractCourseId() {
    const match = window.location.pathname.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if page has readable text content
   */
  hasTextContent() {
    const contentArea = this.getMainContentArea();
    if (!contentArea) {
      return false;
    }

    const textContent = contentArea.textContent.trim();
    return textContent.length > 50; // Arbitrary minimum
  }

  /**
   * Get main content area element
   */
  getMainContentArea() {
    // Canvas-specific content containers
    const selectors = ['#content', '#main', '.user_content', '[role="main"]', '.show-content'];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return document.body;
  }

  /**
   * Extract all readable text from page
   */
  extractReadableText() {
    const contentArea = this.getMainContentArea();
    if (!contentArea) {
      return '';
    }

    // Clone to avoid modifying original DOM
    const clone = contentArea.cloneNode(true);

    // Remove non-content elements
    const elementsToRemove = clone.querySelectorAll(
      'script, style, nav, aside, footer, .navigation, .sidebar, [aria-hidden="true"]'
    );

    elementsToRemove.forEach(el => el.remove());

    return clone.textContent.trim();
  }

  /**
   * Get all text nodes for TTS highlighting
   */
  getTextNodes(element = null) {
    const root = element || this.getMainContentArea();
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        // Skip whitespace-only nodes and hidden elements
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (
          parent &&
          (parent.closest('script, style, nav, [aria-hidden="true"]') ||
            window.getComputedStyle(parent).display === 'none')
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes;
  }

  /**
   * Find all form inputs for STT integration
   */
  getInputElements() {
    const inputs = [];
    const selectors = [
      'textarea',
      'input[type="text"]',
      'input[type="search"]',
      '[contenteditable="true"]',
      '.tox-edit-area', // TinyMCE editor
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        inputs.push(el);
      });
    });

    return inputs;
  }

  /**
   * Create highlight span for TTS
   */
  createHighlight(text, color = '#FFEB3B') {
    const span = document.createElement('span');
    span.className = 'assist-tts-highlight';
    span.textContent = text;
    span.style.backgroundColor = color;
    span.style.transition = 'background-color 0.3s ease';
    span.setAttribute('data-assist-highlight', 'true');

    return span;
  }

  /**
   * Remove all TTS highlights
   */
  removeAllHighlights() {
    const highlights = document.querySelectorAll('[data-assist-highlight="true"]');
    highlights.forEach(span => {
      const parent = span.parentNode;
      const textNode = document.createTextNode(span.textContent);
      parent.replaceChild(textNode, span);
    });
  }

  /**
   * Find numeric elements for simplification
   */
  getNumericElements() {
    const numericElements = [];
    const textNodes = this.getTextNodes();

    textNodes.forEach(node => {
      const text = node.textContent;
      // Regex for numbers, dates, times, percentages
      const numericRegex = /\d+([.,]\d+)?[%]?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}/g;

      if (numericRegex.test(text)) {
        numericElements.push({
          node: node,
          text: text,
        });
      }
    });

    return numericElements;
  }

  /**
   * Simplify date/time display
   */
  simplifyDateTime(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return 'Due today';
      }
      if (diffDays === 1) {
        return 'Due tomorrow';
      }
      if (diffDays === -1) {
        return 'Was due yesterday';
      }
      if (diffDays > 0 && diffDays < 7) {
        return `Due in ${diffDays} days`;
      }
      if (diffDays < 0) {
        return `Was due ${Math.abs(diffDays)} days ago`;
      }

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  }

  /**
   * Get extraneous elements for focus mode
   */
  getExtraneousElements() {
    const selectors = [
      'aside',
      'nav:not([role="navigation"][aria-label*="main"])',
      '.sidebar',
      '.navigation:not(.main-navigation)',
      'footer',
      '.ad',
      '.advertisement',
      '[class*="banner"]:not(.main-banner)',
    ];

    const elements = [];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        elements.push(el);
      });
    });

    return elements;
  }
}
