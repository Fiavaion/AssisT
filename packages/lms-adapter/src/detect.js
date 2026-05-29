/**
 * LMS detection — URL pattern matching + DOM fingerprinting.
 *
 * Extraction status: URL patterns lifted directly from AssisT
 * src/features/lms/ adapters. DOM fingerprinting stubs pending
 * migration of adapter.detectCanvasPageType() and equivalents.
 *
 * @module lms-adapter/detect
 */

// ─── URL-based detection (primary signal) ─────────────────────────────────────

const URL_PATTERNS = {
  canvas: [
    /\.instructure\.com(\/|$)/i,
    /\/courses\/\d+/,                       // self-hosted Canvas
    /canvas\.[a-z0-9-]+\.(edu|ac\.[a-z]+)/i,
  ],
  moodle: [
    /\/mod\/(assign|quiz|forum|page)\//,    // Moodle module URLs
    /\/course\/view\.php/,
    /moodle\.[a-z0-9-]+\.(edu|ac\.[a-z]+)/i,
  ],
  classroom: [
    /classroom\.google\.com/i,
    /\/c\/[A-Za-z0-9_-]+\/a\/[A-Za-z0-9_-]+/, // Google Classroom assignment path
  ],
};

// ─── DOM fingerprinting (secondary signal) ────────────────────────────────────

const DOM_FINGERPRINTS = {
  canvas: [
    () => !!document.querySelector('#content.ic-Layout-contentMain'),
    () => !!document.querySelector('meta[name="canvas-active-brand-config-md5"]'),
    () => typeof window.ENV !== 'undefined' && 'COURSE' in (window.ENV || {}),
  ],
  moodle: [
    () => !!document.querySelector('body.moodle-page'),
    () => !!document.querySelector('#page-wrapper[data-region]'),
    () => !!document.querySelector('meta[name="generator"][content*="Moodle"]'),
  ],
  classroom: [
    () => !!document.querySelector('[data-is-classroom]'),
    () => !!document.querySelector('.Aopndd'),  // Classroom assignment container
  ],
};

/**
 * Detect the LMS platform for the given URL and optional DOM context.
 *
 * @param {{ url?: string, useDOMHints?: boolean }} [options]
 * @returns {Promise<'canvas' | 'moodle' | 'classroom' | null>}
 */
export async function detectLMS({ url, useDOMHints = true } = {}) {
  const href = url ?? (typeof window !== 'undefined' ? window.location.href : '');

  for (const [platform, patterns] of Object.entries(URL_PATTERNS)) {
    if (patterns.some(p => p.test(href))) {
      return platform;
    }
  }

  if (!useDOMHints || typeof document === 'undefined') return null;

  for (const [platform, checks] of Object.entries(DOM_FINGERPRINTS)) {
    try {
      if (checks.some(fn => fn())) return platform;
    } catch {
      // DOM not ready or selector threw — skip
    }
  }

  return null;
}

/**
 * Detect the page type within a known LMS.
 *
 * @param {string | null} platform
 * @param {{ url?: string }} [options]
 * @returns {Promise<import('../types/index.d.ts').LMSPageType>}
 */
export async function detectPageType(platform, { url } = {}) {
  const href = url ?? (typeof window !== 'undefined' ? window.location.href : '');

  if (platform === 'canvas') return detectCanvasPageType(href);
  if (platform === 'moodle') return detectMoodlePageType(href);
  if (platform === 'classroom') return detectClassroomPageType(href);
  return 'unknown';
}

// ─── Platform-specific page-type helpers ──────────────────────────────────────

function detectCanvasPageType(href) {
  if (/\/assignments\/\d+/.test(href)) return 'assignment';
  if (/\/quizzes\/\d+/.test(href)) return 'quiz';
  if (/\/discussion_topics\/\d+/.test(href)) return 'discussion';
  if (/\/modules/.test(href)) return 'module';
  if (/\/pages\//.test(href)) return 'page';
  if (/\/grades/.test(href)) return 'gradebook';
  if (/\/syllabus/.test(href)) return 'syllabus';
  if (/\/courses\/\d+$/.test(href) || /\/courses\/\d+\?/.test(href)) return 'course-home';
  return 'unknown';
}

function detectMoodlePageType(href) {
  if (/\/mod\/assign\/view\.php/.test(href)) return 'assignment';
  if (/\/mod\/quiz\/view\.php/.test(href)) return 'quiz';
  if (/\/mod\/forum\//.test(href)) return 'discussion';
  if (/\/mod\/page\//.test(href)) return 'page';
  if (/\/course\/view\.php/.test(href)) return 'course-home';
  if (/\/grade\/report\//.test(href)) return 'gradebook';
  return 'unknown';
}

function detectClassroomPageType(href) {
  if (/\/a\/[A-Za-z0-9_-]+/.test(href)) return 'assignment';
  if (/\/c\/[A-Za-z0-9_-]+$/.test(href)) return 'course-home';
  return 'unknown';
}
