/**
 * @fiavaion/lms-adapter
 *
 * Adapter layer for Canvas LMS, Moodle, and Google Classroom.
 * Provides LMS detection, course/assignment context extraction, and
 * SPA navigation support for browser extensions and web tools.
 *
 * Extraction status (May 2026): scaffolding in place; full extraction
 * from AssisT src/features/lms/ is the NLnet-funded deliverable.
 * Public API is stable — implementation depth will increase through v1.0.
 *
 * @example
 * import { detectLMS, getCourseContext, getAssignmentContext, onPageChange } from '@fiavaion/lms-adapter';
 *
 * const lms = await detectLMS();           // 'canvas' | 'moodle' | 'classroom' | null
 * const ctx = await getCourseContext();    // { courseId, courseName, term, discipline, platform }
 * const task = await getAssignmentContext(); // { title, dueDate, rubric, instructions, ... }
 * const off = onPageChange(async () => { ctx = await getCourseContext(); });
 *
 * @module @fiavaion/lms-adapter
 */

import { detectLMS as _detectLMS, detectPageType } from './detect.js';
import { onPageChange } from './navigation.js';
import { getCanvasCourseContext, getCanvasAssignmentContext, getCanvasRawInstructions } from './adapters/canvas.js';
import { getMoodleCourseContext, getMoodleAssignmentContext, getMoodleRawInstructions } from './adapters/moodle.js';
import { getClassroomCourseContext, getClassroomAssignmentContext, getClassroomRawInstructions } from './adapters/classroom.js';

export { detectLMS, getCourseContext, getAssignmentContext, getPageType, getRawInstructions, onPageChange };

// ─── detectLMS ─────────────────────────────────────────────────────────────────

/**
 * Detect the LMS platform for the current page.
 *
 * @param {{ url?: string, useDOMHints?: boolean }} [options]
 * @returns {Promise<'canvas' | 'moodle' | 'classroom' | null>}
 */
async function detectLMS(options) {
  return _detectLMS(options);
}

// ─── getPageType ───────────────────────────────────────────────────────────────

/**
 * Return the page type for the current URL and DOM state.
 *
 * @param {{ url?: string }} [options]
 * @returns {Promise<import('../types/index.d.ts').LMSPageType>}
 */
async function getPageType(options) {
  const platform = await _detectLMS(options);
  return detectPageType(platform, options);
}

// ─── getCourseContext ──────────────────────────────────────────────────────────

/**
 * Extract course-level context from the current LMS page.
 *
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<import('../types/index.d.ts').CourseContext>}
 */
async function getCourseContext(options) {
  const platform = await _detectLMS();
  if (platform === 'canvas') return getCanvasCourseContext(options);
  if (platform === 'moodle') return getMoodleCourseContext(options);
  if (platform === 'classroom') return getClassroomCourseContext(options);
  return { courseId: null, courseName: null, term: null, discipline: null, platform: null };
}

// ─── getAssignmentContext ──────────────────────────────────────────────────────

/**
 * Extract assignment-level context from the current LMS page.
 *
 * @param {{ timeout?: number, maxInstructionLength?: number }} [options]
 * @returns {Promise<import('../types/index.d.ts').AssignmentContext>}
 */
async function getAssignmentContext(options) {
  const platform = await _detectLMS();
  if (platform === 'canvas') return getCanvasAssignmentContext(options);
  if (platform === 'moodle') return getMoodleAssignmentContext(options);
  if (platform === 'classroom') return getClassroomAssignmentContext(options);
  return { title: null, dueDate: null, rubric: [], instructions: null, submissionType: 'unknown', platform: null };
}

// ─── getRawInstructions ────────────────────────────────────────────────────────

/**
 * Return raw HTML instructions for the current assignment (unsanitised).
 *
 * @returns {string | null}
 */
function getRawInstructions() {
  // Synchronous best-effort — call after getAssignmentContext() has settled.
  const href = typeof window !== 'undefined' ? window.location.href : '';
  if (/\.instructure\.com|\/courses\/\d+/.test(href)) return getCanvasRawInstructions();
  if (/\/mod\/assign/.test(href)) return getMoodleRawInstructions();
  if (/classroom\.google\.com/.test(href)) return getClassroomRawInstructions();
  return null;
}
