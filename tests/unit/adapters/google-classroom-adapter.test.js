/**
 * @jest-environment jsdom
 *
 * Unit tests for src/adapters/google-classroom-adapter.js
 *
 * Covers: isGoogleClassroomPage, detectGoogleClassroomPageType (+ enum),
 * extractAssignmentContent, extractStreamPosts, extractClassworkItems,
 * getCleanText, waitForGoogleClassroomContent.
 *
 * REGRESSION NOTE (key removal):
 *   The brittle minified class `.xSP5Vb` was removed from detection logic.
 *   A dedicated test asserts a page carrying ONLY that class is NOT detected
 *   as Classroom, locking the removal.
 */

import {
  isGoogleClassroomPage,
  detectGoogleClassroomPageType,
  extractAssignmentContent,
  extractStreamPosts,
  extractClassworkItems,
  getCleanText,
  waitForGoogleClassroomContent,
  GoogleClassroomPageType,
} from '../../../src/adapters/google-classroom-adapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Point window.location at a classroom URL (or any URL). */
function setLocation(href) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  });
}

/** Stable signal elements recognised by isGoogleClassroomPage. */
function addFocusIdSignal() {
  const el = document.createElement('div');
  el.setAttribute('data-focus-id', 'classroom-view');
  document.body.appendChild(el);
}

function addDataIdAppSignal() {
  const el = document.createElement('div');
  el.setAttribute('data-id', 'app');
  document.body.appendChild(el);
}

function addAriaLabelSignal(label = 'Classroom') {
  const el = document.createElement('div');
  el.setAttribute('aria-label', label);
  document.body.appendChild(el);
}

// ── beforeEach: reset DOM and location ───────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = '';
  setLocation('https://classroom.google.com/u/0/h');
});

// ── GoogleClassroomPageType enum ──────────────────────────────────────────────

describe('GoogleClassroomPageType enum', () => {
  it('exposes all expected keys', () => {
    expect(GoogleClassroomPageType.UNKNOWN).toBe('unknown');
    expect(GoogleClassroomPageType.STREAM).toBe('stream');
    expect(GoogleClassroomPageType.CLASSWORK).toBe('classwork');
    expect(GoogleClassroomPageType.ASSIGNMENT).toBe('assignment');
    expect(GoogleClassroomPageType.PEOPLE).toBe('people');
    expect(GoogleClassroomPageType.GRADES).toBe('grades');
    expect(GoogleClassroomPageType.ANNOUNCEMENT).toBe('announcement');
    expect(GoogleClassroomPageType.MATERIAL).toBe('material');
    expect(GoogleClassroomPageType.OTHER).toBe('other');
  });
});

// ── isGoogleClassroomPage ─────────────────────────────────────────────────────

describe('isGoogleClassroomPage()', () => {
  describe('hostname not classroom.google.com', () => {
    it('returns false on a random hostname with no signal', () => {
      setLocation('https://example.com/page');
      expect(isGoogleClassroomPage()).toBe(false);
    });

    it('returns false on a lookalike hostname', () => {
      setLocation('https://classroom.google.com.evil.com/');
      expect(isGoogleClassroomPage()).toBe(false);
    });

    it('returns false even when stable signal is present but hostname wrong', () => {
      setLocation('https://moodle.example.com/');
      addFocusIdSignal();
      // hostname mismatch AND no mock attr → false
      expect(isGoogleClassroomPage()).toBe(false);
    });
  });

  describe('correct hostname — stable semantic signals', () => {
    it('returns true with [data-focus-id="classroom-view"]', () => {
      addFocusIdSignal();
      expect(isGoogleClassroomPage()).toBe(true);
    });

    it('returns true with [data-id="app"]', () => {
      addDataIdAppSignal();
      expect(isGoogleClassroomPage()).toBe(true);
    });

    it('returns true with [aria-label="Classroom"]', () => {
      addAriaLabelSignal('Classroom');
      expect(isGoogleClassroomPage()).toBe(true);
    });

    it('returns true with an aria-label containing Classroom (substring)', () => {
      addAriaLabelSignal('Google Classroom navigation');
      expect(isGoogleClassroomPage()).toBe(true);
    });

    it('returns false on correct hostname but NO stable signal present', () => {
      // body is empty — no signal elements added
      expect(isGoogleClassroomPage()).toBe(false);
    });
  });

  describe('mock hook [data-assist-mock="google-classroom"]', () => {
    it('returns true when mock attr is present, even on a non-Classroom hostname', () => {
      setLocation('https://localhost/test-harness');
      document.body.innerHTML = '<div data-assist-mock="google-classroom"><div data-id="app"></div></div>';
      expect(isGoogleClassroomPage()).toBe(true);
    });

    it('returns false when mock attr is present but no stable signal', () => {
      setLocation('https://localhost/test-harness');
      // The mock hook allows bypass of the hostname check, but hasClassroomApp
      // still requires a stable DOM signal.
      document.body.innerHTML = '<div data-assist-mock="google-classroom"></div>';
      expect(isGoogleClassroomPage()).toBe(false);
    });
  });

  describe('REGRESSION: minified class .xSP5Vb must NOT be a detection signal', () => {
    it('returns false when ONLY .xSP5Vb is present (minified class removed from detection)', () => {
      // A page with only the old brittle minified selector — must NOT be detected.
      document.body.innerHTML = '<div class="xSP5Vb"></div>';
      expect(isGoogleClassroomPage()).toBe(false);
    });

    it('still detects correctly when .xSP5Vb co-exists with a stable signal', () => {
      // Stable signal present alongside the old class — detection must succeed via the stable path.
      document.body.innerHTML = '<div class="xSP5Vb"></div><div data-id="app"></div>';
      expect(isGoogleClassroomPage()).toBe(true);
    });
  });
});

// ── detectGoogleClassroomPageType ─────────────────────────────────────────────

describe('detectGoogleClassroomPageType()', () => {
  // Helper: establish a recognised Classroom page with a stable signal.
  function setupClassroomPage(href) {
    setLocation(href);
    addDataIdAppSignal();
  }

  it('returns UNKNOWN when not a Classroom page', () => {
    setLocation('https://example.com/');
    // No stable signal — not a Classroom page at all.
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.UNKNOWN);
  });

  it('returns STREAM for a /c/ path with no hash', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIzNDU2Nzg5MA');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.STREAM);
  });

  it('returns CLASSWORK for a hash containing /w/', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIz#/w/NjM4');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.CLASSWORK);
  });

  it('returns CLASSWORK for a hash containing /a/', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIz#/a/NjM4');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.CLASSWORK);
  });

  it('returns ASSIGNMENT for a hash containing /tc/', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIz#/tc/NTY3');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.ASSIGNMENT);
  });

  it('returns PEOPLE for a hash containing /t/all', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIz#/t/all');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.PEOPLE);
  });

  it('returns GRADES for a hash containing /gb/', () => {
    setupClassroomPage('https://classroom.google.com/c/MTIz#/gb/sort-name/p/NTY3');
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.GRADES);
  });

  it('returns ANNOUNCEMENT when [data-announcement-id] is present', () => {
    setupClassroomPage('https://classroom.google.com/');
    const el = document.createElement('div');
    el.setAttribute('data-announcement-id', 'ann-1');
    document.body.appendChild(el);
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.ANNOUNCEMENT);
  });

  it('returns MATERIAL when [data-material-id] is present', () => {
    setupClassroomPage('https://classroom.google.com/');
    const el = document.createElement('div');
    el.setAttribute('data-material-id', 'mat-1');
    document.body.appendChild(el);
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.MATERIAL);
  });

  it('returns OTHER for a recognised Classroom page that matches no specific type', () => {
    setupClassroomPage('https://classroom.google.com/');
    // No hash, no /c/ path, no DOM signals for announcement/material.
    expect(detectGoogleClassroomPageType()).toBe(GoogleClassroomPageType.OTHER);
  });
});

// ── extractAssignmentContent ──────────────────────────────────────────────────

describe('extractAssignmentContent()', () => {
  function setupAssignmentPage() {
    setLocation('https://classroom.google.com/c/MTIz#/tc/NTY3');
    addDataIdAppSignal();
  }

  it('returns null when not on an assignment page', () => {
    // Stream page — no /tc/ hash.
    setLocation('https://classroom.google.com/c/MTIz');
    addDataIdAppSignal();
    expect(extractAssignmentContent()).toBeNull();
  });

  it('returns null when no content element is found on an assignment page', () => {
    setupAssignmentPage();
    // No matching selectors in an otherwise empty body (besides the signal div).
    expect(extractAssignmentContent()).toBeNull();
  });

  it('extracts content via [aria-label*="Instructions"]', () => {
    setupAssignmentPage();
    document.body.innerHTML += '<div aria-label="Instructions">Read chapter 3.</div>';
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.text).toBe('Read chapter 3.');
    expect(result.content).toContain('Read chapter 3.');
    expect(result.element).toBeInstanceOf(HTMLElement);
  });

  it('extracts content via [aria-label*="Description"]', () => {
    setupAssignmentPage();
    document.body.innerHTML += '<section aria-label="Assignment Description">Complete the quiz.</section>';
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.text).toBe('Complete the quiz.');
  });

  it('extracts content via data-testid="assignment-description"', () => {
    setupAssignmentPage();
    document.body.innerHTML += '<div data-testid="assignment-description">Submit by Friday.</div>';
    const result = extractAssignmentContent();
    expect(result).not.toBeNull();
    expect(result.text).toBe('Submit by Friday.');
  });

  it('falls back to title "Assignment" when no title element found', () => {
    setupAssignmentPage();
    document.body.innerHTML += '<div aria-label="Instructions">Do the task.</div>';
    const result = extractAssignmentContent();
    expect(result.title).toBe('Assignment');
  });

  it('extracts title from [data-item-id] h1 when present', () => {
    setupAssignmentPage();
    document.body.innerHTML += [
      '<div data-item-id="x"><h1>Maths Homework</h1></div>',
      '<div aria-label="Instructions">Show all working.</div>',
    ].join('');
    const result = extractAssignmentContent();
    expect(result.title).toBe('Maths Homework');
  });

  it('does not throw on empty content element', () => {
    setupAssignmentPage();
    document.body.innerHTML += '<div aria-label="Instructions"></div>';
    expect(() => extractAssignmentContent()).not.toThrow();
    const result = extractAssignmentContent();
    expect(result.text).toBe('');
  });
});

// ── extractStreamPosts ────────────────────────────────────────────────────────

describe('extractStreamPosts()', () => {
  function setupStreamPage() {
    setLocation('https://classroom.google.com/c/MTIz');
    addDataIdAppSignal();
  }

  it('returns null when not on a stream page', () => {
    // Assignment page — /tc/ hash.
    setLocation('https://classroom.google.com/c/MTIz#/tc/NTY3');
    addDataIdAppSignal();
    expect(extractStreamPosts()).toBeNull();
  });

  it('returns null when there are no post elements', () => {
    setupStreamPage();
    expect(extractStreamPosts()).toBeNull();
  });

  it('extracts posts via [data-announcement-id] with a title h2', () => {
    setupStreamPage();
    document.body.innerHTML += [
      '<div data-announcement-id="a1">',
      '  <h2>Welcome back!</h2>',
      '  <span class="JYVBee">Term starts Monday.</span>',
      '</div>',
    ].join('');
    const posts = extractStreamPosts();
    expect(posts).not.toBeNull();
    expect(posts).toHaveLength(1);
    expect(posts[0].number).toBe(1);
    expect(posts[0].title).toBe('Welcome back!');
    expect(posts[0].content).toBe('Term starts Monday.');
  });

  it('extracts posts via [data-item-id]', () => {
    setupStreamPage();
    document.body.innerHTML += [
      '<div data-item-id="i1"><h2>Assignment 1</h2></div>',
      '<div data-item-id="i2"><h2>Assignment 2</h2></div>',
    ].join('');
    const posts = extractStreamPosts();
    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('Assignment 1');
    expect(posts[1].title).toBe('Assignment 2');
    expect(posts[1].number).toBe(2);
  });

  it('omits post elements with neither a title nor content', () => {
    setupStreamPage();
    // An element that exists but contains no text in the expected places.
    document.body.innerHTML += '<div data-item-id="empty"><span>ignored</span></div>';
    expect(extractStreamPosts()).toBeNull();
  });

  it('does not throw on empty body', () => {
    setupStreamPage();
    expect(() => extractStreamPosts()).not.toThrow();
  });
});

// ── extractClassworkItems ─────────────────────────────────────────────────────

describe('extractClassworkItems()', () => {
  function setupClassworkPage() {
    // /w/ hash → CLASSWORK
    setLocation('https://classroom.google.com/c/MTIz#/w/NjM4');
    addDataIdAppSignal();
  }

  it('returns null when not on a classwork page', () => {
    // Stream page — no hash.
    setLocation('https://classroom.google.com/c/MTIz');
    addDataIdAppSignal();
    expect(extractClassworkItems()).toBeNull();
  });

  it('returns null when no item elements are found', () => {
    setupClassworkPage();
    expect(extractClassworkItems()).toBeNull();
  });

  it('extracts items via [data-item-id] with a title', () => {
    setupClassworkPage();
    document.body.innerHTML += [
      '<div data-item-id="ci1">',
      '  <span class="YVvGBb">Essay Draft</span>',
      '  <span aria-label="Assignment">Assignment</span>',
      '  <span class="asQXV">Due Mon 14 Jul</span>',
      '</div>',
    ].join('');
    const items = extractClassworkItems();
    expect(items).not.toBeNull();
    expect(items).toHaveLength(1);
    expect(items[0].number).toBe(1);
    expect(items[0].title).toBe('Essay Draft');
    expect(items[0].type).toBe('Assignment');
    expect(items[0].dueDate).toBe('Due Mon 14 Jul');
  });

  it('extracts multiple items and numbers them sequentially', () => {
    setupClassworkPage();
    document.body.innerHTML += [
      '<div data-item-id="ci1"><span class="YVvGBb">Task A</span></div>',
      '<div data-item-id="ci2"><span class="YVvGBb">Task B</span></div>',
      '<div data-item-id="ci3"><span class="YVvGBb">Task C</span></div>',
    ].join('');
    const items = extractClassworkItems();
    expect(items).toHaveLength(3);
    expect(items.map(i => i.number)).toEqual([1, 2, 3]);
  });

  it('omits items with no title', () => {
    setupClassworkPage();
    // A data-item-id element with no recognised title selector.
    document.body.innerHTML += '<div data-item-id="notitle"><span>random</span></div>';
    expect(extractClassworkItems()).toBeNull();
  });

  it('does not throw on empty body', () => {
    setupClassworkPage();
    expect(() => extractClassworkItems()).not.toThrow();
  });
});

// ── getCleanText ──────────────────────────────────────────────────────────────

describe('getCleanText()', () => {
  it('returns plain text from simple HTML', () => {
    const result = getCleanText('<p>Hello world</p>');
    expect(result).toBe('Hello world');
  });

  it('strips [aria-hidden="true"] elements', () => {
    const result = getCleanText('<p>Visible</p><span aria-hidden="true">Hidden icon</span>');
    expect(result).not.toContain('Hidden icon');
    expect(result).toContain('Visible');
  });

  it('strips <script> tags', () => {
    const result = getCleanText('<p>Content</p><script>alert("xss")</script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('Content');
  });

  it('strips <style> tags', () => {
    const result = getCleanText('<p>Text</p><style>.foo { color: red }</style>');
    expect(result).not.toContain('.foo');
    expect(result).toContain('Text');
  });

  it('returns empty string for empty input', () => {
    expect(getCleanText('')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    const result = getCleanText('<p>   spaced   </p>');
    expect(result).toBe('spaced');
  });

  it('does not throw on HTML with deeply nested elements', () => {
    const html = '<div><section><article><p>Nested</p></article></section></div>';
    expect(() => getCleanText(html)).not.toThrow();
    expect(getCleanText(html)).toBe('Nested');
  });
});

// ── waitForGoogleClassroomContent ─────────────────────────────────────────────

describe('waitForGoogleClassroomContent()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves true immediately when [data-focus-id="classroom-view"] is present', async () => {
    addFocusIdSignal();
    const promise = waitForGoogleClassroomContent(1000);
    jest.advanceTimersByTime(150);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves true when [data-id="app"] is present', async () => {
    addDataIdAppSignal();
    const promise = waitForGoogleClassroomContent(1000);
    jest.advanceTimersByTime(150);
    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves false after timeout when no content loads', async () => {
    // Empty DOM — no matching selector.
    const timeout = 500;
    const promise = waitForGoogleClassroomContent(timeout);
    jest.advanceTimersByTime(timeout + 200);
    const result = await promise;
    expect(result).toBe(false);
  });

  it('resolves true if content appears before the timeout', async () => {
    const promise = waitForGoogleClassroomContent(2000);

    // Advance a bit — content not yet loaded.
    jest.advanceTimersByTime(300);

    // Inject the signal mid-wait.
    addDataIdAppSignal();

    // Advance another tick so the interval fires again.
    jest.advanceTimersByTime(150);

    const result = await promise;
    expect(result).toBe(true);
  });
});
