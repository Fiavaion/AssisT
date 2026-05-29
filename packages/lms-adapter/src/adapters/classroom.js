/**
 * Google Classroom adapter.
 *
 * Extraction in progress from AssisT src/features/lms/googleClassroom.js.
 * Classroom is a SPA — context is extracted from the DOM, not URL params.
 *
 * @module lms-adapter/adapters/classroom
 */

/**
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').CourseContext>}
 */
export async function getClassroomCourseContext({ timeout = 2000 } = {}) {
  await waitForSelector('[data-course-name], .YVvGBb', timeout);

  const courseEl = document.querySelector('[data-course-name]');
  const courseName = courseEl?.dataset?.courseName
    ?? document.querySelector('.YVvGBb')?.textContent?.trim()
    ?? null;

  return {
    courseId: extractClassroomCourseId(),
    courseName,
    term: null,
    discipline: null,
    platform: 'classroom',
  };
}

/**
 * @param {{ timeout?: number, maxInstructionLength?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').AssignmentContext>}
 */
export async function getClassroomAssignmentContext({
  timeout = 2000,
  maxInstructionLength = 4000,
} = {}) {
  await waitForSelector('.Aopndd, [data-assignment-title]', timeout);

  const title = document.querySelector('[data-assignment-title], .dne4Jd')?.textContent?.trim() ?? null;
  const dueDate = extractClassroomDueDate();
  const rawInstructions = document.querySelector('.fOWGHc, .vvKfkc')?.textContent?.trim() ?? null;

  return {
    title,
    dueDate,
    rubric: [],
    instructions: rawInstructions ? rawInstructions.slice(0, maxInstructionLength) : null,
    submissionType: 'file',
    platform: 'classroom',
  };
}

export function getClassroomRawInstructions() {
  return document.querySelector('.fOWGHc, .vvKfkc')?.innerHTML ?? null;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function extractClassroomCourseId() {
  const match = window?.location?.pathname?.match(/\/c\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractClassroomDueDate() {
  const el = document.querySelector('[data-due-date-ms], .dkkmFe');
  if (el?.dataset?.dueDateMs) return new Date(Number(el.dataset.dueDateMs)).toISOString();
  return el?.textContent?.trim() ?? null;
}

function waitForSelector(selector, timeout) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) { resolve(); return; }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) { observer.disconnect(); resolve(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
  });
}
