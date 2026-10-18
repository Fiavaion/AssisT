/**
 * @jest-environment jsdom
 *
 * One Escape, one thing closed.
 *
 * The magnifier and the reading guide both bound a bare Escape on the document with no check for
 * anything open on top of them, so a student who pressed Escape to close a summary panel also lost
 * the magnifier and the guide underneath it — two settings they then had to switch back on from the
 * popup. WCAG 2.2 SC 3.2.4 (Consistent Identification) and plain predictability both say Escape
 * acts on the topmost thing.
 *
 * The rule pinned here: these two are page-wide reading aids with no surface of their own, so they
 * sit at the bottom of the Escape stack. While any AssisT dialog, alert dialog or menu is open they
 * ignore Escape entirely; with nothing above them, Escape switches the aid off.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));
jest.mock('../../../src/features/focusMode/focusMode.js', () => ({
  focusMode_disable: jest.fn(),
  focusMode_getEnabled: jest.fn(() => false),
}));
jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: jest.fn(),
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
  saveSetting: jest.fn(),
}));

import {
  applySettings as lensApplySettings,
  cleanup as lensCleanup,
} from '../../../src/features/magnifyingLens/magnifying-lens.js';
import {
  readingGuide_enable,
  readingGuide_disable,
  readingGuide_getEnabled,
} from '../../../src/features/readingGuide/readingGuide.js';

const lens = () => document.querySelector('#assist-magnifying-lens');
const guideLine = () => document.querySelector('#assist-reading-guide-line');

const pressEscape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

/** One of AssisT's own in-page panels, open on top of the reading aids. */
function openAssistPanel(markup = '') {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div id="assist-summarization-panel" role="dialog" aria-modal="true" aria-label="Summary">
       <button type="button">Close</button>${markup}
     </div>`
  );
  return document.getElementById('assist-summarization-panel');
}

function turnLensOn() {
  lensApplySettings({ enabled: true, scale: 2, size: 275, offsetEnabled: false, lock: false }, true);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  lensCleanup();
  readingGuide_disable();
});

describe('the magnifier', () => {
  test('ignores Escape while an AssisT dialog is open on top of it', () => {
    openAssistPanel();
    turnLensOn();

    pressEscape();

    expect(lens()).not.toBeNull();
  });

  test('ignores Escape while an AssisT menu is open', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="assist-export-dropdown" role="menu"><button role="menuitem">CSV</button></div>'
    );
    turnLensOn();

    pressEscape();

    expect(lens()).not.toBeNull();
  });

  test('switches off on Escape once the dialog above it has gone', () => {
    const panel = openAssistPanel();
    turnLensOn();
    pressEscape();
    expect(lens()).not.toBeNull();

    panel.remove();
    pressEscape();

    expect(lens()).toBeNull();
  });

  test('is not held hostage by an AssisT panel that is only left in the DOM, hidden', () => {
    openAssistPanel().style.display = 'none';
    turnLensOn();

    pressEscape();

    expect(lens()).toBeNull();
  });

  test('its own magnified copy of a page dialog does not count as something open', () => {
    // The lens holds a clone of the whole page, so a host-page dialog is duplicated inside an
    // AssisT element. An aria-hidden, inert subtree is not an open dialog.
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div role="dialog" aria-label="Cookie notice"><button>OK</button></div>'
    );
    turnLensOn();

    pressEscape();

    expect(lens()).toBeNull();
  });
});

describe('the reading guide', () => {
  test('ignores Escape while an AssisT dialog is open on top of it', () => {
    openAssistPanel();
    readingGuide_enable();

    pressEscape();

    expect(readingGuide_getEnabled()).toBe(true);
    expect(guideLine()).not.toBeNull();
  });

  test('switches off on Escape once the dialog above it has gone', () => {
    const panel = openAssistPanel();
    readingGuide_enable();
    pressEscape();
    expect(readingGuide_getEnabled()).toBe(true);

    panel.remove();
    pressEscape();

    expect(readingGuide_getEnabled()).toBe(false);
    expect(guideLine()).toBeNull();
  });
});

test('one Escape with a panel open leaves both reading aids exactly as they were', () => {
  openAssistPanel();
  turnLensOn();
  readingGuide_enable();

  pressEscape();

  expect(lens()).not.toBeNull();
  expect(readingGuide_getEnabled()).toBe(true);
});
