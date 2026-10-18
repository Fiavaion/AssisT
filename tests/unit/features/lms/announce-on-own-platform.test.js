/**
 * @jest-environment jsdom
 *
 * An integration only speaks up on its own platform.
 *
 * Each LMS integration announces itself when its setting is switched on. The page check guarded
 * initialisation but not the announcement, so a settings change on a Canvas page told the student
 * "Google Classroom Integration enabled" — a message about a platform they were not on, arriving
 * unprompted, and the first thing a fresh install showed on a Canvas page.
 */

const mockToasts = [];
const mockChanges = {};

jest.mock('../../../../src/core/ui/toast.js', () => ({
  showToast: message => mockToasts.push(message),
}));

jest.mock('../../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: (key, defaults, onInit, onChange) => {
    mockChanges[key] = onChange;
  },
}));

jest.mock('../../../../src/adapters/canvas-adapter.js', () => ({
  CanvasPageType: { ASSIGNMENT: 'assignment', QUIZ: 'quiz', OTHER: 'other' },
  detectCanvasPageType: () => 'other',
  waitForCanvasContent: async () => {},
}));

jest.mock('../../../../src/adapters/moodle-adapter.js', () => ({
  MoodlePageType: { ASSIGNMENT: 'assignment', OTHER: 'other' },
  detectMoodlePageType: () => 'other',
  waitForMoodleContent: async () => {},
}));

jest.mock('../../../../src/adapters/google-classroom-adapter.js', () => ({
  GoogleClassroomPageType: { ASSIGNMENT: 'assignment', OTHER: 'other' },
  detectGoogleClassroomPageType: () => 'other',
  waitForGoogleClassroomContent: async () => {},
}));

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Loads all three integrations on the page the test built, then switches every one on. */
async function switchAllOn() {
  jest.resetModules();
  require('../../../../src/features/lms/canvas.js');
  require('../../../../src/features/lms/moodle.js');
  require('../../../../src/features/lms/googleClassroom.js');

  mockChanges.canvasIntegration({ enabled: true });
  mockChanges.moodleIntegration({ enabled: true });
  mockChanges.googleClassroomIntegration({ enabled: true });
  await settle();
}

beforeEach(() => {
  mockToasts.length = 0;
  document.body.innerHTML = '';
});

test('on a Canvas page only Canvas announces itself', async () => {
  document.body.innerHTML = '<div id="application"></div>';

  await switchAllOn();

  expect(mockToasts.some(message => /Canvas/.test(message))).toBe(true);
  expect(mockToasts.some(message => /Classroom|Moodle/.test(message))).toBe(false);
});

test('on a Moodle page only Moodle announces itself', async () => {
  document.body.innerHTML = '<div id="page-wrapper"></div>';

  await switchAllOn();

  expect(mockToasts.some(message => /Moodle/.test(message))).toBe(true);
  expect(mockToasts.some(message => /Classroom|Canvas/.test(message))).toBe(false);
});

test('on a page that belongs to no LMS, nothing announces itself', async () => {
  document.body.innerHTML = '<article><p>An encyclopaedia article.</p></article>';

  await switchAllOn();

  expect(mockToasts).toEqual([]);
});
