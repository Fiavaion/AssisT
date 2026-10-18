/**
 * Does this page belong to a supported LMS?
 *
 * These three predicates live apart from the adapters they belong to for one reason: the answer is
 * needed *before* an adapter is loaded. Each LMS feature module used to import its adapter and then
 * ask the adapter whether the page was its own, so a Canvas assignment page loaded all three
 * adapters and a page belonging to no LMS loaded three and used none. Detection is a hostname and a
 * handful of selectors; it does not need the extraction and FAB code to come with it.
 *
 * Each adapter re-exports its own predicate, so `canvas-adapter.js` still answers `isCanvasPage()`
 * and there is exactly one definition of it.
 *
 * @module adapters/lms-detect
 */

/**
 * Check if current page is a Canvas LMS page
 * @returns {boolean} True if on Canvas domain
 */
export function isCanvasPage() {
  const hostname = window.location.hostname;

  // Check for common Canvas domains
  const canvasPatterns = [/\.instructure\.com$/, /\.canvas\./, /canvas\./];

  // Check if body has Canvas-specific classes
  const hasCanvasClass =
    document.body?.classList.contains('course-menu-expanded') ||
    document.body?.classList.contains('primary-nav-expanded') ||
    document.getElementById('application') !== null;

  return canvasPatterns.some(pattern => pattern.test(hostname)) || hasCanvasClass;
}

/**
 * Check if current page is a Moodle LMS page
 * @returns {boolean} True if on Moodle domain
 */
export function isMoodlePage() {
  const hostname = window.location.hostname;

  // Check for common Moodle domains
  const moodlePatterns = [/moodle/i, /\.lms\./, /learning\./, /elearning\./];

  // Check if body has Moodle-specific classes.
  // NOTE: 'dir-ltr' is deliberately excluded — it's a generic directionality class set by
  // many non-Moodle frameworks, so it produced false positives on unrelated sites.
  const hasMoodleClass =
    document.body?.classList.contains('pagelayout-standard') ||
    document.body?.classList.contains('path-mod-') ||
    document.querySelector('meta[name="Moodle"]') !== null ||
    document.querySelector('.page-footer-content-container') !== null ||
    document.getElementById('page-wrapper') !== null;

  return moodlePatterns.some(pattern => pattern.test(hostname)) || hasMoodleClass;
}

/**
 * Check if current page is Google Classroom
 * @returns {boolean} True if on Google Classroom
 */
export function isGoogleClassroomPage() {
  const hostname = window.location.hostname;
  const isMockPage = document.querySelector('[data-assist-mock="google-classroom"]') !== null;

  if (!hostname.includes('classroom.google.com') && !isMockPage) {
    return false;
  }

  // Verify Google Classroom app is loaded. Rely on stable semantic attributes only —
  // a minified class name (e.g. .xSP5Vb) rotates with Google deploys and would silently
  // make detection fail on a real Classroom page.
  const hasClassroomApp =
    document.querySelector('[data-focus-id="classroom-view"]') !== null ||
    document.querySelector('[data-id="app"]') !== null ||
    document.querySelector('[aria-label*="Classroom"]') !== null;

  return hasClassroomApp;
}
