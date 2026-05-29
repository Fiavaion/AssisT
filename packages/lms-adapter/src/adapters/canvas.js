/**
 * Canvas LMS adapter.
 *
 * Extraction in progress from AssisT src/features/lms/canvas.js and
 * the dynamically-loaded CanvasAdapter module. The extraction separates
 * AssisT-specific UI logic (FAB, TTS callbacks) from the reusable
 * context-extraction concern exposed here.
 *
 * @module lms-adapter/adapters/canvas
 */

// ─── Course context ────────────────────────────────────────────────────────────

/**
 * Extract course-level context from a Canvas page.
 *
 * Uses window.ENV (Canvas's client-side environment object) as the primary
 * source; falls back to URL and DOM scraping for self-hosted deployments that
 * omit ENV.
 *
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').CourseContext>}
 */
export async function getCanvasCourseContext({ timeout = 2000 } = {}) {
  await waitForEnv(timeout);

  const env = typeof window !== 'undefined' ? window.ENV : null;
  const courseId = env?.COURSE?.id?.toString()
    ?? extractCourseIdFromURL(window?.location?.href ?? '');

  return {
    courseId,
    courseName: env?.COURSE?.name ?? extractCourseNameFromDOM(),
    term: env?.COURSE?.grading_period_set?.title
      ?? env?.COURSE?.term_name
      ?? null,
    discipline: inferDiscipline(env?.COURSE?.name ?? ''),
    platform: 'canvas',
  };
}

// ─── Assignment context ────────────────────────────────────────────────────────

/**
 * Extract assignment-level context from a Canvas assignment page.
 *
 * @param {{ timeout?: number, maxInstructionLength?: number }} [options]
 * @returns {Promise<import('../../types/index.d.ts').AssignmentContext>}
 */
export async function getCanvasAssignmentContext({
  timeout = 2000,
  maxInstructionLength = 4000,
} = {}) {
  await waitForContent('.assignment_description, #assignment_description, [data-testid="assignment-description"]', timeout);

  const title = document.querySelector('h1.title, .assignment-title, [data-testid="assignment-title"]')?.textContent?.trim() ?? null;
  const dueDate = extractCanvasDueDate();
  const rubric = extractCanvasRubric();
  const rawInstructions = document.querySelector('.assignment_description, #assignment_description, [data-testid="assignment-description"]')?.textContent?.trim() ?? null;
  const instructions = rawInstructions ? rawInstructions.slice(0, maxInstructionLength) : null;
  const submissionType = detectCanvasSubmissionType();

  return { title, dueDate, rubric, instructions, submissionType, platform: 'canvas' };
}

// ─── Raw instructions ──────────────────────────────────────────────────────────

export function getCanvasRawInstructions() {
  return document.querySelector('.assignment_description, #assignment_description')?.innerHTML ?? null;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function waitForEnv(timeout) {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && window.ENV) { resolve(); return; }
    const deadline = Date.now() + timeout;
    const interval = setInterval(() => {
      if ((typeof window !== 'undefined' && window.ENV) || Date.now() > deadline) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

function waitForContent(selector, timeout) {
  return new Promise(resolve => {
    if (document.querySelector(selector)) { resolve(); return; }
    const deadline = Date.now() + timeout;
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector) || Date.now() > deadline) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
  });
}

function extractCourseIdFromURL(href) {
  const match = href.match(/\/courses\/(\d+)/);
  return match ? match[1] : null;
}

function extractCourseNameFromDOM() {
  return (
    document.querySelector('.course-title, [data-course-name]')?.textContent?.trim() ??
    document.title?.split(' - ')[0]?.trim() ??
    null
  );
}

function extractCanvasDueDate() {
  const el = document.querySelector('.due_date_value, [data-due-date], time[datetime]');
  return el?.getAttribute('datetime') ?? el?.textContent?.trim() ?? null;
}

function extractCanvasRubric() {
  return Array.from(
    document.querySelectorAll('.rubric_criterion .description, .rubric-criterion')
  ).map(el => el.textContent?.trim()).filter(Boolean);
}

function detectCanvasSubmissionType() {
  const el = document.querySelector('[data-submission-type]');
  if (el) return normaliseSubmissionType(el.dataset.submissionType);
  if (document.querySelector('[data-type="online_text_entry"]')) return 'text';
  if (document.querySelector('[data-type="online_upload"]')) return 'file';
  if (document.querySelector('[data-type="online_url"]')) return 'url';
  return 'unknown';
}

function normaliseSubmissionType(raw) {
  if (!raw) return 'unknown';
  if (raw.includes('text')) return 'text';
  if (raw.includes('upload') || raw.includes('file')) return 'file';
  if (raw.includes('url')) return 'url';
  if (raw.includes('media')) return 'media';
  return 'mixed';
}

const DISCIPLINE_KEYWORDS = {
  humanities: ['english', 'literature', 'history', 'philosophy', 'art', 'music', 'language', 'writing'],
  stem: ['math', 'science', 'physics', 'chemistry', 'biology', 'engineering', 'computer'],
  social: ['sociology', 'psychology', 'economics', 'politics', 'law', 'business'],
  health: ['nursing', 'medicine', 'health', 'physio', 'occupational'],
};

function inferDiscipline(courseName) {
  const lower = courseName.toLowerCase();
  for (const [discipline, keywords] of Object.entries(DISCIPLINE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return discipline;
  }
  return null;
}
