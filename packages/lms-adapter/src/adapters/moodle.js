/**
 * Moodle LMS adapter.
 *
 * Extraction in progress from AssisT src/features/lms/moodle.js.
 *
 * @module lms-adapter/adapters/moodle
 */

/**
 * Extract course-level context from a Moodle page.
 *
 * Moodle embeds course data in URL parameters and meta tags.
 *
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').CourseContext>}
 */
export async function getMoodleCourseContext({ timeout = 2000 } = {}) {
  const href = window?.location?.href ?? '';
  const params = new URL(href).searchParams;
  const courseId = params.get('id') ?? extractMoodleCourseIdFromDOM();

  return {
    courseId,
    courseName: document.querySelector('.page-header-headings h1, .breadcrumb-item:last-child')?.textContent?.trim() ?? null,
    term: null,
    discipline: null,
    platform: 'moodle',
  };
}

/**
 * Extract assignment-level context from a Moodle assignment page.
 *
 * @param {{ timeout?: number, maxInstructionLength?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').AssignmentContext>}
 */
export async function getMoodleAssignmentContext({
  timeout = 2000,
  maxInstructionLength = 4000,
} = {}) {
  const title = document.querySelector('.page-header-headings h1')?.textContent?.trim() ?? null;
  const dueDate = document.querySelector('[data-region="due-date"] .text-info')?.textContent?.trim() ?? null;
  const rawInstructions = document.querySelector('.box.generalbox .no-overflow')?.textContent?.trim() ?? null;

  return {
    title,
    dueDate,
    rubric: [],
    instructions: rawInstructions ? rawInstructions.slice(0, maxInstructionLength) : null,
    submissionType: detectMoodleSubmissionType(),
    platform: 'moodle',
  };
}

export function getMoodleRawInstructions() {
  return document.querySelector('.box.generalbox .no-overflow')?.innerHTML ?? null;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function extractMoodleCourseIdFromDOM() {
  const link = document.querySelector('a[href*="course/view.php?id="]');
  if (!link) return null;
  return new URL(link.href).searchParams.get('id');
}

function detectMoodleSubmissionType() {
  if (document.querySelector('[class*="submission-type-online_text"]')) return 'text';
  if (document.querySelector('[class*="submission-type-file"]')) return 'file';
  return 'unknown';
}
