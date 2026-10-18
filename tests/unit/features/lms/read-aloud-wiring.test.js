/**
 * @jest-environment jsdom
 *
 * Reading coursework aloud has to work on all three learning platforms, not just Canvas.
 *
 * Moodle and Google Classroom used to reach for `window.assistSettings` and `window.assistReadText`,
 * two globals the content script never set. Canvas was wired properly, through an explicit
 * dependency hand-off. So on Moodle the student was told to switch on a feature that was already on,
 * and on Classroom the page announced "Reading: ..." and then went silent. Both platforms now go
 * through the same injected read-aloud dependency Canvas uses, and every refusal says why.
 */

const mockToasts = [];
const mockInits = {};

jest.mock('../../../../src/core/ui/toast.js', () => ({
  showToast: message => mockToasts.push(message),
}));

jest.mock('../../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: (key, defaults, onInit) => {
    mockInits[key] = onInit;
  },
}));

/**
 * Load the shared read-aloud wiring plus both platform modules against a fresh module registry,
 * and inject the read-aloud dependency the way the content script does at start-up.
 *
 * @param {{enabled: boolean}} settings - the TTS settings object the content script owns
 */
function loadPlatforms(settings) {
  jest.resetModules();
  mockToasts.length = 0;

  const readAloudModule = require('../../../../src/features/lms/lms-read-aloud.js');
  const moodle = require('../../../../src/features/lms/moodle.js');
  const classroom = require('../../../../src/features/lms/googleClassroom.js');
  const readText = jest.fn();

  readAloudModule.initializeLmsReadAloud(readText, settings);

  return { readAloudModule, moodle, classroom, readText };
}

describe('read aloud is switched on', () => {
  it('reads a Moodle assignment through the shared read-aloud dependency', () => {
    const { moodle, readText } = loadPlatforms({ enabled: true });
    const element = document.createElement('div');

    moodle.moodle_readContent({
      title: 'Essay one',
      text: 'Compare the two sources.',
      element,
    });

    expect(readText).toHaveBeenCalledTimes(1);
    expect(readText.mock.calls[0][0]).toBe('Essay one. Compare the two sources.');
    expect(readText.mock.calls[0][1]).toBe(element);
  });

  it('reads a Google Classroom assignment through the shared read-aloud dependency', () => {
    const { classroom, readText } = loadPlatforms({ enabled: true });
    const element = document.createElement('div');

    classroom.googleClassroom_readContent({
      title: 'Week three reading',
      text: 'Read chapter four before Friday.',
      element,
    });

    expect(readText).toHaveBeenCalledTimes(1);
    expect(readText.mock.calls[0][0]).toBe('Week three reading. Read chapter four before Friday.');
    expect(readText.mock.calls[0][1]).toBe(element);
  });

  it('reads Moodle forum posts and Classroom stream posts through the same dependency', () => {
    const { moodle, classroom, readText } = loadPlatforms({ enabled: true });

    moodle.moodle_readPosts([
      { author: 'Ada', content: 'First thought.', element: document.createElement('div') },
    ]);
    classroom.googleClassroom_readPosts([
      {
        title: 'Notice',
        content: 'Class moved to room two.',
        element: document.createElement('div'),
      },
    ]);

    expect(readText).toHaveBeenCalledTimes(2);
    expect(readText.mock.calls[0][0]).toContain('First thought.');
    expect(readText.mock.calls[1][0]).toContain('Class moved to room two.');
  });
});

describe('read aloud is switched off', () => {
  it('tells the student the same thing on both platforms and reads nothing', () => {
    const offMessage =
      require('../../../../src/features/lms/lms-read-aloud.js').READ_ALOUD_OFF_MESSAGE;

    const moodleRun = loadPlatforms({ enabled: false });
    moodleRun.moodle.moodle_readContent({
      title: 'Essay one',
      text: 'Compare the two sources.',
      element: document.createElement('div'),
    });
    const moodleToasts = [...mockToasts];

    const classroomRun = loadPlatforms({ enabled: false });
    classroomRun.classroom.googleClassroom_readContent({
      title: 'Week three reading',
      text: 'Read chapter four before Friday.',
      element: document.createElement('div'),
    });
    const classroomToasts = [...mockToasts];

    expect(moodleRun.readText).not.toHaveBeenCalled();
    expect(classroomRun.readText).not.toHaveBeenCalled();
    expect(moodleToasts).toEqual([offMessage]);
    expect(classroomToasts).toEqual([offMessage]);
  });
});

describe('there is nothing readable on the page', () => {
  it('says so plainly on both platforms instead of announcing a reading that never starts', () => {
    const nothingMessage =
      require('../../../../src/features/lms/lms-read-aloud.js').NOTHING_TO_READ_MESSAGE;

    const moodleRun = loadPlatforms({ enabled: true });
    moodleRun.moodle.moodle_readContent({ title: '', text: '', element: null });
    const moodleToasts = [...mockToasts];

    const classroomRun = loadPlatforms({ enabled: true });
    classroomRun.classroom.googleClassroom_readContent({ title: '', text: '', element: null });
    const classroomToasts = [...mockToasts];

    expect(moodleRun.readText).not.toHaveBeenCalled();
    expect(classroomRun.readText).not.toHaveBeenCalled();
    expect(moodleToasts).toEqual([nothingMessage]);
    expect(classroomToasts).toEqual([nothingMessage]);
  });

  it('never announces a reading it cannot start when no post carries any words', () => {
    const { classroom, readText } = loadPlatforms({ enabled: true });

    classroom.googleClassroom_readPosts([{ title: 'Notice', content: '', element: null }]);

    expect(readText).not.toHaveBeenCalled();
    expect(mockToasts.some(message => message.includes('Reading'))).toBe(false);
  });
});

describe('the platform modules no longer depend on page globals', () => {
  it('reads aloud with window.assistSettings and window.assistReadText absent', () => {
    delete window.assistSettings;
    delete window.assistReadText;

    const { moodle, classroom, readText } = loadPlatforms({ enabled: true });

    moodle.moodle_readContent({ title: 'A', text: 'B', element: null });
    classroom.googleClassroom_readContent({ title: 'C', text: 'D', element: null });

    expect(readText).toHaveBeenCalledTimes(2);
    expect(window.assistSettings).toBeUndefined();
    expect(window.assistReadText).toBeUndefined();
  });
});

describe('the settings object is injected live, not copied', () => {
  it('picks up a toggle the student flips after the page loaded', () => {
    const settings = { enabled: false };
    const { moodle, readText } = loadPlatforms(settings);

    moodle.moodle_readContent({ title: 'A', text: 'B', element: null });
    expect(readText).not.toHaveBeenCalled();

    settings.enabled = true;
    moodle.moodle_readContent({ title: 'A', text: 'B', element: null });
    expect(readText).toHaveBeenCalledTimes(1);
  });
});
