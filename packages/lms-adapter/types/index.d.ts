/**
 * @fiavaion/lms-adapter — TypeScript definitions
 *
 * Extraction in progress from AssisT src/features/lms/.
 * Full API stabilised at v1.0.
 */

// ─── LMS identity ─────────────────────────────────────────────────────────────

/** Supported LMS platforms. */
export type LMSPlatform = 'canvas' | 'moodle' | 'classroom' | null;

/** Broad categories of LMS page, used to scope context extraction. */
export type LMSPageType =
  | 'assignment'
  | 'quiz'
  | 'discussion'
  | 'course-home'
  | 'module'
  | 'page'
  | 'syllabus'
  | 'gradebook'
  | 'unknown';

// ─── Context shapes ────────────────────────────────────────────────────────────

/** Course-level context extracted from the current page. */
export interface CourseContext {
  /** LMS-internal course identifier (opaque string, stable across page navigations). */
  courseId: string | null;
  /** Human-readable course name. */
  courseName: string | null;
  /** Academic term or semester label (e.g. "Spring 2026", "Semester 1"). */
  term: string | null;
  /**
   * Subject-area discipline hint derived from course naming conventions.
   * Used for AI prompt adaptation. Null when undetectable.
   */
  discipline: string | null;
  /** LMS platform this context was extracted from. */
  platform: LMSPlatform;
}

/** Assignment-level context extracted from the current page. */
export interface AssignmentContext {
  /** Assignment title. */
  title: string | null;
  /** Due date (ISO-8601 string) or null when not present. */
  dueDate: string | null;
  /** Rubric criteria as an array of plain-text strings. */
  rubric: string[];
  /**
   * Full assignment instructions as plain text (HTML stripped).
   * Truncated at 4,000 chars; full content available via getRawInstructions().
   */
  instructions: string | null;
  /** Submission type hint. */
  submissionType: 'text' | 'file' | 'url' | 'media' | 'mixed' | 'unknown';
  /** LMS platform this context was extracted from. */
  platform: LMSPlatform;
}

// ─── Adapter options ───────────────────────────────────────────────────────────

/** Options passed to detectLMS(). */
export interface DetectOptions {
  /**
   * Override the URL to inspect instead of window.location.
   * Useful for testing and service-worker contexts.
   */
  url?: string;
  /** Whether to also inspect DOM signals (default: true). */
  useDOMHints?: boolean;
}

/** Options passed to getCourseContext(). */
export interface CourseContextOptions {
  /** Maximum time (ms) to wait for dynamic content to settle. Default: 2000. */
  timeout?: number;
}

/** Options passed to getAssignmentContext(). */
export interface AssignmentContextOptions {
  /** Maximum time (ms) to wait for dynamic content to settle. Default: 2000. */
  timeout?: number;
  /** Truncate instructions at this character count. Default: 4000. */
  maxInstructionLength?: number;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the LMS platform for the current page.
 *
 * Uses URL patterns as the primary signal and DOM fingerprinting as a
 * secondary signal when URL alone is ambiguous (self-hosted Canvas/Moodle).
 *
 * @example
 * const lms = await detectLMS();
 * // 'canvas' | 'moodle' | 'classroom' | null
 */
export function detectLMS(options?: DetectOptions): Promise<LMSPlatform>;

/**
 * Extract course-level context from the current page.
 *
 * Returns null fields for any property that cannot be reliably extracted.
 * Waits for dynamic content up to options.timeout ms.
 *
 * @example
 * const ctx = await getCourseContext();
 * // { courseId: '12345', courseName: 'Advanced English', term: 'Spring 2026', discipline: 'humanities', platform: 'canvas' }
 */
export function getCourseContext(options?: CourseContextOptions): Promise<CourseContext>;

/**
 * Extract assignment-level context from the current page.
 *
 * Returns null fields when the page is not an assignment or the LMS
 * is not recognised. Call detectLMS() first if you need to gate on platform.
 *
 * @example
 * const task = await getAssignmentContext();
 * // { title: 'Essay 1', dueDate: '2026-03-01T23:59:00Z', rubric: [...], instructions: '...' }
 */
export function getAssignmentContext(options?: AssignmentContextOptions): Promise<AssignmentContext>;

/**
 * Register a callback that fires on SPA-style page changes (route navigation
 * without a full browser reload). Returns an unsubscribe function.
 *
 * Internally uses MutationObserver + popstate. Safe to call multiple times.
 *
 * @example
 * let ctx = await getCourseContext();
 * const off = onPageChange(async () => { ctx = await getCourseContext(); });
 * // Later: off(); // unsubscribe
 */
export function onPageChange(callback: () => void): () => void;

/**
 * Return the detected page type for the current URL and DOM state.
 * Useful for narrowing which context extraction is worth attempting.
 *
 * @example
 * const pageType = await getPageType();
 * if (pageType === 'assignment') { ... }
 */
export function getPageType(options?: DetectOptions): Promise<LMSPageType>;

/**
 * Low-level: get raw HTML instructions for the current assignment.
 * Use getAssignmentContext() for the sanitised plain-text version.
 */
export function getRawInstructions(): string | null;
