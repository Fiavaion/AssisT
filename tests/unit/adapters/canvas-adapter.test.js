/** @jest-environment jsdom */

/**
 * Unit tests for src/adapters/canvas-adapter.js
 *
 * Covers: isCanvasPage, detectCanvasPageType, CanvasPageType enum,
 * extractAssignmentContent, extractQuizQuestions, getCleanText.
 * FAB creation (createCanvasFAB) is intentionally excluded — UI injection only.
 */

// Mock imported utilities so tests are isolated from their implementations.
jest.mock('../../../src/utils/sanitize.js', () => ({
  sanitizeHTML: jest.fn(html => (typeof html === 'string' ? html : '')),
}));

jest.mock('../../../src/utils/event-handlers.js', () => ({
  attachInteractiveHandler: jest.fn(),
  attachHandlerBatch: jest.fn(),
  attachAccessibleHandler: jest.fn(),
}));

import { sanitizeHTML } from '../../../src/utils/sanitize.js';

import {
  isCanvasPage,
  detectCanvasPageType,
  extractAssignmentContent,
  extractQuizQuestions,
  getCleanText,
  CanvasPageType,
} from '../../../src/adapters/canvas-adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replace window.location with a URL-parsed object.
 * @param {string} url - Full URL string.
 */
function setLocation(url) {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      href: parsed.href,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
  });
}

/** Canonical Canvas hostname used across most tests. */
const CANVAS_HOST = 'https://school.instructure.com';

/** Non-Canvas hostname for negative tests. */
const OTHER_HOST = 'https://example.com';

// ── Reset state between tests ─────────────────────────────────────────────────

beforeEach(() => {
  // resetMocks:true in jest.config clears mock implementations between tests;
  // re-apply sanitizeHTML so getCleanText() receives the real HTML string.
  sanitizeHTML.mockImplementation(html => (typeof html === 'string' ? html : ''));

  // Clear body each test; individual tests add what they need.
  document.body.className = '';
  document.body.innerHTML = '';
  // Default to a non-Canvas location; individual suites override as needed.
  setLocation(`${OTHER_HOST}/some-page`);
});

// ── CanvasPageType enum ───────────────────────────────────────────────────────

describe('CanvasPageType', () => {
  it('exports the expected string values', () => {
    expect(CanvasPageType.UNKNOWN).toBe('unknown');
    expect(CanvasPageType.ASSIGNMENT).toBe('assignment');
    expect(CanvasPageType.QUIZ).toBe('quiz');
    expect(CanvasPageType.DISCUSSION).toBe('discussion');
    expect(CanvasPageType.ANNOUNCEMENT).toBe('announcement');
    expect(CanvasPageType.MODULE).toBe('module');
    expect(CanvasPageType.COURSE_HOME).toBe('course_home');
    expect(CanvasPageType.OTHER).toBe('other');
  });
});

// ── isCanvasPage ──────────────────────────────────────────────────────────────

describe('isCanvasPage()', () => {
  describe('hostname-based detection', () => {
    it('returns true for *.instructure.com domains', () => {
      setLocation('https://school.instructure.com/courses/1');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns true for subdomains of *.instructure.com', () => {
      setLocation('https://uni.edu.instructure.com/courses/5');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns true for hostnames containing .canvas.', () => {
      setLocation('https://learn.canvas.net/login');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns true for hostnames starting with canvas.', () => {
      setLocation('https://canvas.example.edu/courses/2');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns false for an unrelated hostname with no body signals', () => {
      setLocation(`${OTHER_HOST}/courses/1/assignments/99`);
      expect(isCanvasPage()).toBe(false);
    });
  });

  describe('DOM-based detection (body class)', () => {
    beforeEach(() => {
      // Non-Canvas hostname so hostname check never fires.
      setLocation(`${OTHER_HOST}/page`);
    });

    it('returns true when body has course-menu-expanded class', () => {
      document.body.classList.add('course-menu-expanded');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns true when body has primary-nav-expanded class', () => {
      document.body.classList.add('primary-nav-expanded');
      expect(isCanvasPage()).toBe(true);
    });

    it('returns true when #application element exists', () => {
      const appDiv = document.createElement('div');
      appDiv.id = 'application';
      document.body.appendChild(appDiv);
      expect(isCanvasPage()).toBe(true);
    });

    it('returns false with no Canvas class and no #application', () => {
      document.body.classList.add('some-random-class');
      expect(isCanvasPage()).toBe(false);
    });
  });
});

// ── detectCanvasPageType ──────────────────────────────────────────────────────

describe('detectCanvasPageType()', () => {
  // Use the Canvas hostname for all page-type tests so isCanvasPage() passes.
  beforeEach(() => {
    setLocation(`${CANVAS_HOST}/courses/1/home`);
  });

  it('returns UNKNOWN when not on a Canvas page', () => {
    setLocation(`${OTHER_HOST}/courses/1/assignments/99`);
    expect(detectCanvasPageType()).toBe(CanvasPageType.UNKNOWN);
  });

  describe('ASSIGNMENT detection', () => {
    it('returns ASSIGNMENT for a specific assignment URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/assignments/123`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.ASSIGNMENT);
    });

    it('returns ASSIGNMENT for deep assignment path (e.g. with query string base)', () => {
      setLocation(`${CANVAS_HOST}/courses/42/assignments/9999`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.ASSIGNMENT);
    });

    /**
     * Regression: the assignments INDEX page (/assignments/) must NOT be classified
     * as ASSIGNMENT. Previously a literal "/assignments$" regex mismatch let this slip
     * through; the fix uses includes('/assignments/') && !endsWith('/assignments/').
     */
    it('does NOT return ASSIGNMENT for the assignments index (trailing slash)', () => {
      setLocation(`${CANVAS_HOST}/courses/1/assignments/`);
      const result = detectCanvasPageType();
      expect(result).not.toBe(CanvasPageType.ASSIGNMENT);
    });

    it('does NOT return ASSIGNMENT for the bare /assignments path', () => {
      // Pathname without trailing slash, no ID segment after it.
      setLocation(`${CANVAS_HOST}/courses/1/assignments`);
      const result = detectCanvasPageType();
      expect(result).not.toBe(CanvasPageType.ASSIGNMENT);
    });
  });

  describe('QUIZ detection', () => {
    it('returns QUIZ for /quizzes/ URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/quizzes/55`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.QUIZ);
    });

    it('returns QUIZ for /quiz_submissions/ URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/quiz_submissions/7`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.QUIZ);
    });
  });

  describe('DISCUSSION detection', () => {
    it('returns DISCUSSION for /discussion_topics/ URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/discussion_topics/88`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.DISCUSSION);
    });
  });

  describe('ANNOUNCEMENT detection', () => {
    it('returns ANNOUNCEMENT for /announcements/ URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/announcements/3`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.ANNOUNCEMENT);
    });
  });

  describe('MODULE detection', () => {
    it('returns MODULE for /modules URL', () => {
      setLocation(`${CANVAS_HOST}/courses/1/modules`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.MODULE);
    });

    it('returns MODULE for /modules/ with trailing slash', () => {
      setLocation(`${CANVAS_HOST}/courses/1/modules/`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.MODULE);
    });
  });

  describe('COURSE_HOME detection', () => {
    it('returns COURSE_HOME for /courses/123 (no trailing slash)', () => {
      setLocation(`${CANVAS_HOST}/courses/123`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.COURSE_HOME);
    });

    it('returns COURSE_HOME for /courses/123/ (with trailing slash)', () => {
      setLocation(`${CANVAS_HOST}/courses/123/`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.COURSE_HOME);
    });
  });

  describe('OTHER fallback', () => {
    it('returns OTHER for an unrecognised Canvas path', () => {
      setLocation(`${CANVAS_HOST}/courses/1/grades`);
      expect(detectCanvasPageType()).toBe(CanvasPageType.OTHER);
    });
  });
});

// ── extractAssignmentContent ──────────────────────────────────────────────────

describe('extractAssignmentContent()', () => {
  beforeEach(() => {
    setLocation(`${CANVAS_HOST}/courses/1/assignments/42`);
  });

  it('returns null when not on an assignment page', () => {
    setLocation(`${CANVAS_HOST}/courses/1/grades`);
    expect(extractAssignmentContent()).toBeNull();
  });

  it('returns null when on assignments index (trailing slash)', () => {
    setLocation(`${CANVAS_HOST}/courses/1/assignments/`);
    expect(extractAssignmentContent()).toBeNull();
  });

  it('returns null when content element is missing from the DOM', () => {
    document.body.innerHTML = '<h1 class="page-title">My Assignment</h1>';
    expect(extractAssignmentContent()).toBeNull();
  });

  it('extracts title and text from a .description.user_content element', () => {
    document.body.innerHTML = `
      <h1 class="page-title">Write an Essay</h1>
      <div class="description user_content">
        <p>Write 500 words on climate change.</p>
      </div>
    `;

    const result = extractAssignmentContent();

    expect(result).not.toBeNull();
    expect(result.title).toBe('Write an Essay');
    expect(result.text).toContain('Write 500 words on climate change.');
    expect(result.content).toBeDefined();
    expect(result.element).toBeInstanceOf(HTMLElement);
    expect(Array.isArray(result.sections)).toBe(true);
  });

  it('falls back to "Assignment" as title when no title element exists', () => {
    document.body.innerHTML = `
      <div class="description user_content">
        <p>No heading on this page.</p>
      </div>
    `;

    const result = extractAssignmentContent();

    expect(result).not.toBeNull();
    expect(result.title).toBe('Assignment');
  });

  it('uses the .assignment_description selector as a fallback', () => {
    document.body.innerHTML = `
      <h1 class="page-title">Fallback Selector Test</h1>
      <div class="assignment_description">
        <p>Content via fallback selector.</p>
      </div>
    `;

    const result = extractAssignmentContent();

    expect(result).not.toBeNull();
    expect(result.text).toContain('Content via fallback selector.');
  });

  describe('sections extraction', () => {
    it('returns a single "Content" section when there are no headings', () => {
      document.body.innerHTML = `
        <div class="description user_content">
          <p>Paragraph one.</p>
          <p>Paragraph two.</p>
        </div>
      `;

      const result = extractAssignmentContent();

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].title).toBe('Content');
      expect(result.sections[0].text).toContain('Paragraph one.');
    });

    it('splits sections by headings and captures inter-heading text', () => {
      document.body.innerHTML = `
        <div class="description user_content">
          <h2>Overview</h2>
          <p>Summary text here.</p>
          <h2>Requirements</h2>
          <p>Must be 500 words.</p>
        </div>
      `;

      const result = extractAssignmentContent();

      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].title).toBe('Overview');
      expect(result.sections[0].text).toContain('Summary text here.');
      expect(result.sections[0].level).toBe(2);
      expect(result.sections[1].title).toBe('Requirements');
      expect(result.sections[1].text).toContain('Must be 500 words.');
    });

    it('records the correct heading level for each section', () => {
      document.body.innerHTML = `
        <div class="description user_content">
          <h1>Top Level</h1>
          <h3>Sub Section</h3>
        </div>
      `;

      const result = extractAssignmentContent();

      expect(result.sections[0].level).toBe(1);
      expect(result.sections[1].level).toBe(3);
    });
  });
});

// ── extractQuizQuestions ──────────────────────────────────────────────────────

describe('extractQuizQuestions()', () => {
  beforeEach(() => {
    setLocation(`${CANVAS_HOST}/courses/1/quizzes/10`);
  });

  it('returns null when not on a quiz page', () => {
    setLocation(`${CANVAS_HOST}/courses/1/assignments/5`);
    expect(extractQuizQuestions()).toBeNull();
  });

  it('returns null when there are no .question elements in the DOM', () => {
    document.body.innerHTML = '<div class="quiz-container"></div>';
    expect(extractQuizQuestions()).toBeNull();
  });

  it('returns null when question elements exist but have no question text', () => {
    document.body.innerHTML = `
      <div class="question">
        <div class="answer_label">Option A</div>
      </div>
    `;
    // No .question_text or .question-text → text is undefined → not pushed.
    expect(extractQuizQuestions()).toBeNull();
  });

  it('extracts questions with text and answer choices', () => {
    document.body.innerHTML = `
      <div class="question">
        <div class="question_text">What is 2 + 2?</div>
        <div class="answer">3</div>
        <div class="answer">4</div>
        <div class="answer">5</div>
      </div>
      <div class="question">
        <div class="question_text">Name the capital of France.</div>
        <div class="answer">London</div>
        <div class="answer">Paris</div>
      </div>
    `;

    const questions = extractQuizQuestions();

    expect(questions).not.toBeNull();
    expect(questions).toHaveLength(2);

    expect(questions[0].number).toBe(1);
    expect(questions[0].text).toBe('What is 2 + 2?');
    expect(questions[0].answers).toHaveLength(3);
    expect(questions[0].answers[1].text).toBe('4');

    expect(questions[1].number).toBe(2);
    expect(questions[1].text).toBe('Name the capital of France.');
    expect(questions[1].answers).toHaveLength(2);
  });

  it('each question carries a reference to its DOM element', () => {
    document.body.innerHTML = `
      <div class="question">
        <div class="question_text">Single question?</div>
        <div class="answer">Yes</div>
      </div>
    `;

    const questions = extractQuizQuestions();

    expect(questions[0].element).toBeInstanceOf(HTMLElement);
    expect(questions[0].answers[0].element).toBeInstanceOf(HTMLElement);
  });

  it('works via quiz_submissions URL too', () => {
    setLocation(`${CANVAS_HOST}/courses/1/quiz_submissions/7`);
    document.body.innerHTML = `
      <div class="question">
        <div class="question_text">Submitted quiz question</div>
      </div>
    `;

    const questions = extractQuizQuestions();

    expect(questions).not.toBeNull();
    expect(questions[0].text).toBe('Submitted quiz question');
  });
});

// ── getCleanText ──────────────────────────────────────────────────────────────

describe('getCleanText()', () => {
  it('returns empty string for an empty input', () => {
    expect(getCleanText('')).toBe('');
  });

  it('returns empty string for a non-string input', () => {
    expect(getCleanText(null)).toBe('');
    expect(getCleanText(undefined)).toBe('');
  });

  it('strips HTML tags and returns text content', () => {
    const result = getCleanText('<p>Hello <strong>world</strong></p>');
    expect(result).toBe('Hello world');
  });

  it('removes .screenreader-only elements', () => {
    const html = '<p>Main text</p><span class="screenreader-only">SR only</span>';
    const result = getCleanText(html);
    expect(result).not.toContain('SR only');
    expect(result).toContain('Main text');
  });

  it('removes .element_toggler elements', () => {
    const html = '<p>Visible</p><div class="element_toggler">Toggle control</div>';
    const result = getCleanText(html);
    expect(result).not.toContain('Toggle control');
    expect(result).toContain('Visible');
  });

  it('removes <script> and <style> content', () => {
    // sanitizeHTML mock passes through; the removal happens in the DOM walker.
    const html = '<p>Content</p><script>alert(1)</script><style>.x{}</style>';
    const result = getCleanText(html);
    expect(result).not.toContain('alert');
    expect(result).not.toContain('.x{}');
    expect(result).toContain('Content');
  });

  it('trims surrounding whitespace', () => {
    const result = getCleanText('<p>  padded  </p>');
    expect(result).toBe('padded');
  });
});
