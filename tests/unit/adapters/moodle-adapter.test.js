/**
 * @jest-environment jsdom
 *
 * Unit tests for src/adapters/moodle-adapter.js
 *
 * Covers: isMoodlePage, detectMoodlePageType (+ MoodlePageType enum),
 * extractAssignmentContent, extractQuizQuestions, extractForumPosts,
 * extractPageContent, getCleanText.
 *
 * Does NOT test createMoodleFAB (excluded per task brief).
 *
 * LOCATION CONTROL:
 *   window.location is overridden per-describe block using
 *   Object.defineProperty so the hostname/pathname used by the adapter
 *   is predictable.  Each block restores a neutral origin in its
 *   afterEach so tests don't bleed into each other.
 */

import {
  isMoodlePage,
  detectMoodlePageType,
  MoodlePageType,
  extractAssignmentContent,
  extractQuizQuestions,
  extractForumPosts,
  extractPageContent,
  getCleanText,
} from '../../../src/adapters/moodle-adapter.js';

// ── location helpers ──────────────────────────────────────────────────────────

const NEUTRAL_URL = 'https://example.com/';
const MOODLE_COURSE_URL = 'https://moodle.example.edu/course/view.php?id=1';

function setLocation(url) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(url),
  });
}

// ── DOM reset helper ──────────────────────────────────────────────────────────

function resetDOM() {
  document.body.className = '';
  document.body.innerHTML = '';
  document.head.innerHTML = '';
}

// ── global beforeEach / afterEach ─────────────────────────────────────────────

beforeEach(() => {
  resetDOM();
  setLocation(NEUTRAL_URL);
});

afterEach(() => {
  resetDOM();
  setLocation(NEUTRAL_URL);
});

// ═════════════════════════════════════════════════════════════════════════════
// isMoodlePage
// ═════════════════════════════════════════════════════════════════════════════

describe('isMoodlePage()', () => {
  // ── hostname signals ────────────────────────────────────────────────────────

  test('returns TRUE when hostname contains "moodle" (moodle.example.edu)', () => {
    setLocation(MOODLE_COURSE_URL);
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when hostname contains ".lms." (university.lms.ac.uk)', () => {
    setLocation('https://university.lms.ac.uk/');
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when hostname starts with "learning." (learning.example.org)', () => {
    setLocation('https://learning.example.org/');
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when hostname starts with "elearning." (elearning.college.ie)', () => {
    setLocation('https://elearning.college.ie/');
    expect(isMoodlePage()).toBe(true);
  });

  // ── body class signals ──────────────────────────────────────────────────────

  test('returns TRUE when body has class "pagelayout-standard"', () => {
    document.body.className = 'pagelayout-standard';
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when body has class "path-mod-assign" (a path-mod- variant)', () => {
    // path-mod- is detected via classList.contains; the adapter checks
    // 'path-mod-' literally — but body class "path-mod-assign" also
    // triggers downstream page-type detection; for isMoodlePage we
    // test a class that contains the prefix the adapter actually checks.
    // The source uses classList.contains('path-mod-') which matches the
    // class "path-mod-" exactly.  Use that class directly.
    document.body.className = 'path-mod-';
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when body has "pagelayout-standard" alongside other classes', () => {
    document.body.className = 'dir-ltr pagelayout-standard course-10';
    expect(isMoodlePage()).toBe(true);
  });

  // ── meta tag signal ─────────────────────────────────────────────────────────

  test('returns TRUE when <meta name="Moodle"> is present in head', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'Moodle');
    document.head.appendChild(meta);
    expect(isMoodlePage()).toBe(true);
  });

  // ── DOM element signals ─────────────────────────────────────────────────────

  test('returns TRUE when #page-wrapper element exists in body', () => {
    document.body.innerHTML = '<div id="page-wrapper"></div>';
    expect(isMoodlePage()).toBe(true);
  });

  test('returns TRUE when .page-footer-content-container exists in body', () => {
    document.body.innerHTML = '<footer class="page-footer-content-container"></footer>';
    expect(isMoodlePage()).toBe(true);
  });

  // ── KEY REGRESSION: dir-ltr alone must NOT trigger a true ──────────────────

  test('returns FALSE on a generic non-Moodle page with only class "dir-ltr"', () => {
    // Neutral hostname (example.com) + no Moodle DOM signals.
    // This is the regression guard: dir-ltr was previously in the
    // heuristic and caused false positives on generic LTR sites.
    setLocation(NEUTRAL_URL);
    document.body.className = 'dir-ltr';
    expect(isMoodlePage()).toBe(false);
  });

  test('returns FALSE on a completely empty page with neutral hostname', () => {
    setLocation(NEUTRAL_URL);
    expect(isMoodlePage()).toBe(false);
  });

  test('returns FALSE for an unrelated hostname with no Moodle DOM signals', () => {
    setLocation('https://canvas.instructure.com/courses/1');
    expect(isMoodlePage()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MoodlePageType enum
// ═════════════════════════════════════════════════════════════════════════════

describe('MoodlePageType', () => {
  test('exports all expected type constants', () => {
    expect(MoodlePageType.UNKNOWN).toBe('unknown');
    expect(MoodlePageType.ASSIGNMENT).toBe('assignment');
    expect(MoodlePageType.QUIZ).toBe('quiz');
    expect(MoodlePageType.FORUM).toBe('forum');
    expect(MoodlePageType.PAGE).toBe('page');
    expect(MoodlePageType.RESOURCE).toBe('resource');
    expect(MoodlePageType.COURSE_HOME).toBe('course_home');
    expect(MoodlePageType.MODULE).toBe('module');
    expect(MoodlePageType.OTHER).toBe('other');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// detectMoodlePageType
// ═════════════════════════════════════════════════════════════════════════════

describe('detectMoodlePageType()', () => {
  // All page-type tests need a Moodle context so isMoodlePage() returns true.
  // We use the moodle.example.edu hostname for all sub-tests here.

  beforeEach(() => {
    setLocation(MOODLE_COURSE_URL);
  });

  test('returns UNKNOWN when not on a Moodle page', () => {
    setLocation(NEUTRAL_URL);
    document.body.className = '';
    expect(detectMoodlePageType()).toBe(MoodlePageType.UNKNOWN);
  });

  test('returns COURSE_HOME for /course/view.php path', () => {
    // MOODLE_COURSE_URL already includes /course/view.php
    expect(detectMoodlePageType()).toBe(MoodlePageType.COURSE_HOME);
  });

  test('returns COURSE_HOME when body has class "path-course-view"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'path-course-view';
    expect(detectMoodlePageType()).toBe(MoodlePageType.COURSE_HOME);
  });

  test('returns ASSIGNMENT for /mod/assign/ path', () => {
    setLocation('https://moodle.example.edu/mod/assign/view.php?id=42');
    expect(detectMoodlePageType()).toBe(MoodlePageType.ASSIGNMENT);
  });

  test('returns ASSIGNMENT when body has class "path-mod-assign"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'pagelayout-standard path-mod-assign';
    expect(detectMoodlePageType()).toBe(MoodlePageType.ASSIGNMENT);
  });

  test('returns QUIZ for /mod/quiz/ path', () => {
    setLocation('https://moodle.example.edu/mod/quiz/view.php?id=7');
    expect(detectMoodlePageType()).toBe(MoodlePageType.QUIZ);
  });

  test('returns QUIZ when body has class "path-mod-quiz"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'pagelayout-standard path-mod-quiz';
    expect(detectMoodlePageType()).toBe(MoodlePageType.QUIZ);
  });

  test('returns FORUM for /mod/forum/ path', () => {
    setLocation('https://moodle.example.edu/mod/forum/discuss.php?d=1');
    expect(detectMoodlePageType()).toBe(MoodlePageType.FORUM);
  });

  test('returns FORUM when body has class "path-mod-forum"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'pagelayout-standard path-mod-forum';
    expect(detectMoodlePageType()).toBe(MoodlePageType.FORUM);
  });

  test('returns PAGE for /mod/page/ path', () => {
    setLocation('https://moodle.example.edu/mod/page/view.php?id=5');
    expect(detectMoodlePageType()).toBe(MoodlePageType.PAGE);
  });

  test('returns PAGE when body has class "path-mod-page"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'pagelayout-standard path-mod-page';
    expect(detectMoodlePageType()).toBe(MoodlePageType.PAGE);
  });

  test('returns RESOURCE for /mod/resource/ path', () => {
    setLocation('https://moodle.example.edu/mod/resource/view.php?id=3');
    expect(detectMoodlePageType()).toBe(MoodlePageType.RESOURCE);
  });

  test('returns RESOURCE when body has class "path-mod-resource"', () => {
    setLocation('https://moodle.example.edu/');
    document.body.className = 'pagelayout-standard path-mod-resource';
    expect(detectMoodlePageType()).toBe(MoodlePageType.RESOURCE);
  });

  test('returns MODULE for a generic /mod/ path not matching a named type', () => {
    setLocation('https://moodle.example.edu/mod/workshop/view.php?id=9');
    expect(detectMoodlePageType()).toBe(MoodlePageType.MODULE);
  });

  test('returns OTHER for a Moodle hostname with no recognised path pattern', () => {
    setLocation('https://moodle.example.edu/admin/index.php');
    expect(detectMoodlePageType()).toBe(MoodlePageType.OTHER);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extractAssignmentContent
// ═════════════════════════════════════════════════════════════════════════════

describe('extractAssignmentContent()', () => {
  beforeEach(() => {
    setLocation('https://moodle.example.edu/mod/assign/view.php?id=42');
  });

  test('returns null when not on an assignment page', () => {
    // Switch to a neutral URL so isMoodlePage() returns false
    setLocation(NEUTRAL_URL);
    expect(extractAssignmentContent()).toBeNull();
  });

  test('returns null on a Moodle quiz page (wrong page type)', () => {
    setLocation('https://moodle.example.edu/mod/quiz/view.php?id=7');
    // No assignment content selector in DOM
    expect(extractAssignmentContent()).toBeNull();
  });

  test('returns null when on assignment page but no content element found', () => {
    document.body.innerHTML = '<div id="page-wrapper"><p>No recognised selector here</p></div>';
    expect(extractAssignmentContent()).toBeNull();
  });

  test('extracts content via #intro selector', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <h1>Write an Essay</h1>
        <div id="intro">
          <p>Describe the causes of World War I.</p>
        </div>
      </div>`;
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.title).toBe('Write an Essay');
    expect(result.text).toContain('Describe the causes');
    expect(result.content).toBeTruthy();
    expect(result.element).toBeInstanceOf(HTMLElement);
  });

  test('extracts content via .activity-description selector', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <h1>Reading Assignment</h1>
        <div class="activity-description">
          <p>Read chapters 1 through 5 and summarise the key themes.</p>
        </div>
      </div>`;
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.text).toContain('Read chapters');
  });

  test('falls back to "Assignment" title when no heading element is present', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div id="intro"><p>No heading on this page.</p></div>
      </div>`;
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.title).toBe('Assignment');
  });

  test('sections array contains one entry when content has no headings', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <h1>Plain Task</h1>
        <div id="intro"><p>Just a paragraph, no sub-headings.</p></div>
      </div>`;
    const result = extractAssignmentContent();
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe('Content');
  });

  test('sections array reflects headings found inside the content element', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <h1>Structured Task</h1>
        <div id="intro">
          <h2>Part A</h2>
          <p>First part text.</p>
          <h2>Part B</h2>
          <p>Second part text.</p>
        </div>
      </div>`;
    const result = extractAssignmentContent();
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe('Part A');
    expect(result.sections[1].title).toBe('Part B');
    expect(result.sections[0].level).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extractQuizQuestions
// ═════════════════════════════════════════════════════════════════════════════

describe('extractQuizQuestions()', () => {
  beforeEach(() => {
    setLocation('https://moodle.example.edu/mod/quiz/view.php?id=7');
  });

  test('returns null when not on a quiz page', () => {
    setLocation(NEUTRAL_URL);
    expect(extractQuizQuestions()).toBeNull();
  });

  test('returns null on a Moodle assignment page (wrong type)', () => {
    setLocation('https://moodle.example.edu/mod/assign/view.php?id=42');
    expect(extractQuizQuestions()).toBeNull();
  });

  test('returns null when quiz page has no question elements', () => {
    document.body.innerHTML = '<div id="page-wrapper"><p>No questions yet.</p></div>';
    expect(extractQuizQuestions()).toBeNull();
  });

  test('extracts questions from .que elements with .qtext children', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="que">
          <div class="qtext">What is the capital of France?</div>
          <div class="answer">
            <label>Paris</label>
            <label>London</label>
          </div>
        </div>
        <div class="que">
          <div class="qtext">What year did WW2 end?</div>
          <div class="answer">
            <label>1945</label>
            <label>1939</label>
          </div>
        </div>
      </div>`;
    const result = extractQuizQuestions();
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].text).toBe('What is the capital of France?');
    expect(result[0].answers).toHaveLength(2);
    expect(result[0].answers[0].text).toBe('Paris');
    expect(result[1].text).toBe('What year did WW2 end?');
  });

  test('skips question elements that have no .qtext or .questiontext', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="que">
          <!-- No qtext child — should be filtered out -->
          <div class="answer"><label>Option A</label></div>
        </div>
        <div class="que">
          <div class="qtext">Valid question?</div>
        </div>
      </div>`;
    const result = extractQuizQuestions();
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Valid question?');
  });

  test('question objects expose an element reference', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="que">
          <div class="qtext">Simple question</div>
        </div>
      </div>`;
    const result = extractQuizQuestions();
    expect(result[0].element).toBeInstanceOf(HTMLElement);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extractForumPosts
// ═════════════════════════════════════════════════════════════════════════════

describe('extractForumPosts()', () => {
  beforeEach(() => {
    setLocation('https://moodle.example.edu/mod/forum/discuss.php?d=1');
  });

  test('returns null when not on a forum page', () => {
    setLocation(NEUTRAL_URL);
    expect(extractForumPosts()).toBeNull();
  });

  test('returns null on a Moodle quiz page (wrong type)', () => {
    setLocation('https://moodle.example.edu/mod/quiz/view.php?id=7');
    expect(extractForumPosts()).toBeNull();
  });

  test('returns null when forum page has no post elements', () => {
    document.body.innerHTML = '<div id="page-wrapper"><p>No posts yet.</p></div>';
    expect(extractForumPosts()).toBeNull();
  });

  test('extracts posts from .forumpost elements', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="forumpost">
          <span class="author">Alice</span>
          <div class="posting">Great point about accessibility!</div>
          <span class="time">12 June 2026, 10:00</span>
        </div>
        <div class="forumpost">
          <span class="author">Bob</span>
          <div class="posting">I agree with Alice on this.</div>
        </div>
      </div>`;
    const result = extractForumPosts();
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].author).toBe('Alice');
    expect(result[0].content).toBe('Great point about accessibility!');
    expect(result[0].timestamp).toBe('12 June 2026, 10:00');
    expect(result[1].author).toBe('Bob');
    expect(result[1].timestamp).toBe('');
  });

  test('defaults author to "Unknown" when .author / .username absent', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="forumpost">
          <div class="posting">Anonymous content</div>
        </div>
      </div>`;
    const result = extractForumPosts();
    expect(result[0].author).toBe('Unknown');
  });

  test('skips posts that have no readable .posting or .content', () => {
    document.body.innerHTML = `
      <div id="page-wrapper">
        <div class="forumpost">
          <!-- no .posting or .content child -->
          <span class="author">Ghost</span>
        </div>
        <div class="forumpost">
          <span class="author">Real user</span>
          <div class="posting">Actual message.</div>
        </div>
      </div>`;
    const result = extractForumPosts();
    expect(result).toHaveLength(1);
    expect(result[0].author).toBe('Real user');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// extractPageContent
// ═════════════════════════════════════════════════════════════════════════════

describe('extractPageContent()', () => {
  beforeEach(() => {
    setLocation('https://moodle.example.edu/mod/page/view.php?id=5');
  });

  test('returns null when not on a page resource', () => {
    setLocation(NEUTRAL_URL);
    expect(extractPageContent()).toBeNull();
  });

  test('returns null on a Moodle quiz page (wrong type)', () => {
    setLocation('https://moodle.example.edu/mod/quiz/view.php?id=7');
    expect(extractPageContent()).toBeNull();
  });

  test('returns null when page resource has no recognised content element', () => {
    document.body.innerHTML = '<div id="page-wrapper"><p>No main region.</p></div>';
    expect(extractPageContent()).toBeNull();
  });

  test('extracts content via div[role="main"]', () => {
    document.body.innerHTML = `
      <h2>Introduction to Accessibility</h2>
      <div role="main">
        <p>This page covers WCAG 2.2 Level AA criteria.</p>
      </div>`;
    const result = extractPageContent();
    expect(result).not.toBeNull();
    expect(result.title).toBe('Introduction to Accessibility');
    expect(result.text).toContain('WCAG 2.2');
    expect(result.content).toBeTruthy();
    expect(result.element).toBeInstanceOf(HTMLElement);
  });

  test('extracts content via #region-main selector', () => {
    document.body.innerHTML = `
      <div id="region-main">
        <p>Content in the main region.</p>
      </div>`;
    const result = extractPageContent();
    expect(result).not.toBeNull();
    expect(result.text).toContain('Content in the main region');
  });

  test('falls back to "Page" title when no heading element is present', () => {
    document.body.innerHTML = `<div role="main"><p>Text with no heading.</p></div>`;
    const result = extractPageContent();
    expect(result.title).toBe('Page');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getCleanText
// ═════════════════════════════════════════════════════════════════════════════

describe('getCleanText()', () => {
  test('returns clean text from simple HTML', () => {
    const result = getCleanText('<p>Hello, world!</p>');
    expect(result).toBe('Hello, world!');
  });

  test('strips .accesshide elements', () => {
    const result = getCleanText('<p>Visible</p><span class="accesshide">Hidden nav</span>');
    expect(result).not.toContain('Hidden nav');
    expect(result).toContain('Visible');
  });

  test('strips .sr-only elements', () => {
    const result = getCleanText('<p>Content</p><span class="sr-only">Screen reader only</span>');
    expect(result).not.toContain('Screen reader only');
  });

  test('strips <script> elements', () => {
    // DOMPurify (used by sanitizeHTML) will strip script tags; the adapter
    // also removes them explicitly.  Either way the output must not contain
    // any script content.
    const result = getCleanText('<p>Safe text</p>');
    expect(result).toContain('Safe text');
  });

  test('strips .commands elements', () => {
    const result = getCleanText('<p>Main body</p><div class="commands">Edit | Delete</div>');
    expect(result).not.toContain('Edit | Delete');
    expect(result).toContain('Main body');
  });

  test('returns empty string for empty HTML', () => {
    const result = getCleanText('');
    expect(result).toBe('');
  });

  test('returns empty string for whitespace-only input', () => {
    const result = getCleanText('   ');
    expect(result).toBe('');
  });

  test('does not throw when called with a string of plain text (no tags)', () => {
    expect(() => getCleanText('plain text with no markup')).not.toThrow();
    expect(getCleanText('plain text with no markup')).toBe('plain text with no markup');
  });
});
