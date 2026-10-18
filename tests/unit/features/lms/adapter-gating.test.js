/**
 * @jest-environment jsdom
 *
 * Which LMS adapter a page is allowed to load.
 *
 * The three integrations default to on, and each feature module used to import its adapter before
 * asking whether the page belonged to that LMS. On an assignment page that meant three imports and
 * two guaranteed failures; on a non-LMS page in all-sites mode it meant three red console errors on
 * every site a student visited. The page check now comes first, so a page loads at most one adapter
 * and a page that belongs to no LMS loads none.
 */

// Counting imports needs a module-scope object, and jest's hoisting only lets a mock factory reach
// one whose name begins with "mock".
const mockAdapterLoads = { canvas: 0, moodle: 0, classroom: 0 };
const mockInits = {};

jest.mock('../../../../src/core/ui/toast.js', () => ({ showToast: () => {} }));

jest.mock('../../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: (key, defaults, onInit) => {
    mockInits[key] = onInit;
  },
}));

jest.mock('../../../../src/adapters/canvas-adapter.js', () => {
  mockAdapterLoads.canvas += 1;
  return {
    CanvasPageType: { ASSIGNMENT: 'assignment', QUIZ: 'quiz', OTHER: 'other' },
    detectCanvasPageType: () => 'other',
    waitForCanvasContent: async () => {},
  };
});

jest.mock('../../../../src/adapters/moodle-adapter.js', () => {
  mockAdapterLoads.moodle += 1;
  return {
    MoodlePageType: { ASSIGNMENT: 'assignment', OTHER: 'other' },
    detectMoodlePageType: () => 'other',
    waitForMoodleContent: async () => {},
  };
});

jest.mock('../../../../src/adapters/google-classroom-adapter.js', () => {
  mockAdapterLoads.classroom += 1;
  return {
    GoogleClassroomPageType: { ASSIGNMENT: 'assignment', OTHER: 'other' },
    detectGoogleClassroomPageType: () => 'other',
    waitForGoogleClassroomContent: async () => {},
  };
});

/** Lets the awaited dynamic import inside the feature module resolve. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Load all three integrations against the DOM the test has built and switch each one on, the way a
 * profile with the shipped defaults does on page load.
 */
async function enableAllIntegrations() {
  jest.resetModules();
  require('../../../../src/features/lms/canvas.js');
  require('../../../../src/features/lms/moodle.js');
  require('../../../../src/features/lms/googleClassroom.js');

  mockInits.canvasIntegration({ enabled: true });
  mockInits.moodleIntegration({ enabled: true });
  mockInits.googleClassroomIntegration({ enabled: true });
  await settle();
}

beforeEach(() => {
  mockAdapterLoads.canvas = 0;
  mockAdapterLoads.moodle = 0;
  mockAdapterLoads.classroom = 0;
  document.body.innerHTML = '';
});

describe('a page that belongs to no LMS', () => {
  it('imports no adapter at all', async () => {
    document.body.innerHTML = '<article><p>An encyclopaedia article.</p></article>';

    await enableAllIntegrations();

    expect(mockAdapterLoads).toEqual({ canvas: 0, moodle: 0, classroom: 0 });
  });
});

describe('a Canvas page', () => {
  it('imports the Canvas adapter', async () => {
    document.body.innerHTML = '<div id="application"></div>';

    await enableAllIntegrations();

    expect(mockAdapterLoads.canvas).toBe(1);
  });

  it('imports no other LMS adapter', async () => {
    document.body.innerHTML = '<div id="application"></div>';

    await enableAllIntegrations();

    expect(mockAdapterLoads.moodle).toBe(0);
    expect(mockAdapterLoads.classroom).toBe(0);
  });
});

describe('a Moodle page', () => {
  it('imports the Moodle adapter and nothing else', async () => {
    document.body.innerHTML = '<div id="page-wrapper"></div>';

    await enableAllIntegrations();

    expect(mockAdapterLoads.moodle).toBe(1);
    expect(mockAdapterLoads.canvas).toBe(0);
    expect(mockAdapterLoads.classroom).toBe(0);
  });
});

describe('a Google Classroom page', () => {
  it('imports the Classroom adapter and nothing else', async () => {
    // The adapter recognises the mock marker the project's own fixtures use, because a real
    // classroom.google.com page cannot be signed into from a test.
    document.body.innerHTML =
      '<div data-assist-mock="google-classroom"><div data-id="app"></div></div>';

    await enableAllIntegrations();

    expect(mockAdapterLoads.classroom).toBe(1);
    expect(mockAdapterLoads.canvas).toBe(0);
    expect(mockAdapterLoads.moodle).toBe(0);
  });
});

describe('an integration that is switched off', () => {
  it('imports its adapter even on its own LMS only once it is enabled', async () => {
    document.body.innerHTML = '<div id="application"></div>';
    jest.resetModules();
    require('../../../../src/features/lms/canvas.js');

    mockInits.canvasIntegration({ enabled: false });
    await settle();
    expect(mockAdapterLoads.canvas).toBe(0);
  });
});
