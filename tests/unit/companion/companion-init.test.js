/**
 * @jest-environment jsdom
 *
 * The companion bootstrapper. What is under test is the live half: a toggle that goes off has to
 * take that feature's UI off the page immediately. Overnight release testing switched every support
 * off and the Authorship Shield's "history" chip stayed, sitting over the article's own contents
 * list, because the toggles were only ever read at page load.
 */

jest.mock('../../../src/features/authorship/authorship-ui.js', () => ({
  init: jest.fn(async () => {}),
  cleanup: jest.fn(),
}));

import { COMPANION_STORAGE_KEY } from '../../../src/features/companion/companion-settings.js';

const AUTHORSHIP = '../../../src/features/authorship/authorship-ui.js';
const BOOTSTRAPPER = '../../../src/features/companion/companion-init.js';

/** The listeners chrome.storage.onChanged was given, so a test can fire a real change. */
let changeListeners = [];

function fireCompanionChange(newValue, area = 'local') {
  for (const listener of changeListeners) {
    listener({ [COMPANION_STORAGE_KEY]: { newValue } }, area);
  }
}

/**
 * Import the bootstrapper fresh; importing it starts it, as it does in a content script. The
 * mocked feature module is fetched from the same registry, because each resetModules() hands the
 * bootstrapper a new set of mock functions.
 */
async function loadBootstrapper() {
  const authorship = await import(AUTHORSHIP);
  const mod = await import(BOOTSTRAPPER);
  await mod.companion_initialize();
  return { mod, authorship };
}

beforeEach(() => {
  jest.resetModules();
  changeListeners = [];
  chrome.storage.onChanged = {
    addListener: jest.fn(listener => changeListeners.push(listener)),
    removeListener: jest.fn(listener => {
      changeListeners = changeListeners.filter(l => l !== listener);
    }),
  };
  chrome.storage.local.get.mockResolvedValue({ [COMPANION_STORAGE_KEY]: { authorship: true } });
});

afterEach(() => {
  delete chrome.storage.onChanged;
});

test('a feature whose toggle goes off is cleaned up there and then', async () => {
  const { authorship } = await loadBootstrapper();
  expect(authorship.init).toHaveBeenCalled();

  fireCompanionChange({ authorship: false });

  expect(authorship.cleanup).toHaveBeenCalled();
});

test('a feature whose toggle comes back on is started again', async () => {
  const { authorship } = await loadBootstrapper();
  fireCompanionChange({ authorship: false });
  authorship.init.mockClear();

  fireCompanionChange({ authorship: true });

  expect(authorship.init).toHaveBeenCalled();
});

test('a change in another storage area is not a toggle change', async () => {
  const { authorship } = await loadBootstrapper();

  fireCompanionChange({ authorship: false }, 'sync');

  expect(authorship.cleanup).not.toHaveBeenCalled();
});

test('the toggles are watched once, not once per SPA navigation', async () => {
  const { mod } = await loadBootstrapper();
  const listenersAfterFirst = changeListeners.length;

  await mod.companion_reinit();

  expect(changeListeners.length).toBe(listenersAfterFirst);
});

/**
 * The popup's "Start lecture captions" button reaches the card through the bootstrapper, so the
 * lecture module is loaded the one way every companion feature is, and stays a lazy chunk.
 */
describe('companion_openLectureNotes', () => {
  const LECTURE = '../../../src/features/companion/lecture-ui.js';

  beforeEach(() => {
    jest.doMock(LECTURE, () => ({
      init: jest.fn(async () => {}),
      cleanup: jest.fn(),
      openLectureNotes: jest.fn(async () => true),
    }));
  });

  test('loads the lecture module and opens its card', async () => {
    const { mod } = await loadBootstrapper();
    const lecture = await import(LECTURE);

    await expect(mod.companion_openLectureNotes()).resolves.toBe(true);

    expect(lecture.openLectureNotes).toHaveBeenCalledTimes(1);
  });

  test('says so when the card could not open', async () => {
    const { mod } = await loadBootstrapper();
    const lecture = await import(LECTURE);
    lecture.openLectureNotes.mockResolvedValue(false);

    await expect(mod.companion_openLectureNotes()).resolves.toBe(false);
  });
});
