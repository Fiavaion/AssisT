/**
 * @jest-environment jsdom
 *
 * A reading guide a keyboard-only student can place, move and dismiss.
 *
 * The guide shipped as a pure mousemove follower: a student on switch access or a keyboard
 * could switch it on from the popup and then never move it off the top of the page. WCAG 2.2
 * SC 2.1.1 makes that a defect, not a nicety, on an extension built for disabled students.
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
}));

import {
  readingGuide_enable,
  readingGuide_disable,
  readingGuide_getEnabled,
} from '../../../src/features/readingGuide/readingGuide.js';

const LINE = '#assist-reading-guide-line';

const line = () => document.querySelector(LINE);
const top = () => parseFloat(line().style.top);

/** Give an element a real box, which jsdom otherwise reports as all zeroes. */
function withBox(element, box) {
  element.getBoundingClientRect = () => ({
    top: box.top,
    bottom: box.top + box.height,
    left: 0,
    right: 100,
    width: 100,
    height: box.height,
    x: 0,
    y: box.top,
  });
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  readingGuide_disable();
});

test('the line is decorative, so assistive tech is not asked to read it', () => {
  readingGuide_enable();
  expect(line().getAttribute('aria-hidden')).toBe('true');
});

test('switching it on with no pointer puts the line where the student can see it', () => {
  readingGuide_enable();
  expect(top()).toBe(window.innerHeight / 2);
});

test('the guide follows the element the student tabs to', () => {
  const heading = withBox(document.createElement('h2'), { top: 300, height: 40 });
  document.body.appendChild(heading);
  readingGuide_enable();

  heading.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  expect(top()).toBe(320);
});

test('the guide follows the caret into a text field', () => {
  const field = withBox(document.createElement('textarea'), { top: 500, height: 60 });
  document.body.appendChild(field);
  readingGuide_enable();
  field.focus();

  document.dispatchEvent(new Event('selectionchange'));

  expect(top()).toBe(530);
});

test('Alt and the arrow keys nudge the guide, Shift nudges it further', () => {
  readingGuide_enable();
  const start = top();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));
  expect(top()).toBe(start + 24);

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true })
  );
  expect(top()).toBe(start + 24 - 96);
});

test('a bare arrow key is left to the page, so scrolling still works', () => {
  readingGuide_enable();
  const start = top();

  const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
  document.dispatchEvent(event);

  expect(top()).toBe(start);
  expect(event.defaultPrevented).toBe(false);
});

test('Escape dismisses the guide', () => {
  readingGuide_enable();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  expect(readingGuide_getEnabled()).toBe(false);
  expect(line()).toBeNull();
});

test('Escape inside a text field is left to the field', () => {
  const field = document.createElement('input');
  document.body.appendChild(field);
  readingGuide_enable();
  field.focus();

  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  expect(readingGuide_getEnabled()).toBe(true);
});

/**
 * A closed AssisT surface that is still in the page must not keep the Escape key.
 *
 * The real case is the annotation sidebar's export menu: it is rendered into a container and then
 * closed by hiding that container, so the `role="menu"` markup stays in the document for the rest of
 * the page's life. A guard that only asks about the surface's own computed style reads that as an
 * open menu, and from the moment a student opens the export menu once, Escape stops dismissing the
 * guide - which is what a browser wave on real sites saw.
 */
describe('Escape and AssisT’s own dialogs', () => {
  /** The shape the annotation sidebar leaves behind: a menu inside a container it hides. */
  function assistMenu({ open }) {
    const container = document.createElement('div');
    container.id = 'assist-annotation-sidebar';
    container.innerHTML = '<div class="assist-export-dropdown" role="menu"></div>';
    container.style.display = open ? 'block' : 'none';
    document.body.appendChild(container);
    return container;
  }

  test('a menu that was opened and then closed does not keep Escape from the guide', () => {
    assistMenu({ open: false });
    readingGuide_enable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(readingGuide_getEnabled()).toBe(false);
    expect(line()).toBeNull();
  });

  test('an open AssisT dialog keeps Escape, so closing a panel does not also put the guide away', () => {
    const dialog = document.createElement('div');
    dialog.id = 'assist-citation-overlay';
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    readingGuide_enable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(readingGuide_getEnabled()).toBe(true);
    expect(line()).not.toBeNull();
  });

  test('the magnifier’s aria-hidden copy of a dialog does not keep Escape either', () => {
    const copy = document.createElement('div');
    copy.id = 'assist-magnifier-copy';
    copy.setAttribute('aria-hidden', 'true');
    copy.innerHTML = '<div class="assist-citation-overlay" role="dialog"></div>';
    document.body.appendChild(copy);
    readingGuide_enable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(readingGuide_getEnabled()).toBe(false);
  });

  test('a host page’s own dialog is the host page’s business', () => {
    const hostDialog = document.createElement('div');
    hostDialog.setAttribute('role', 'dialog');
    document.body.appendChild(hostDialog);
    readingGuide_enable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(readingGuide_getEnabled()).toBe(false);
  });
});

test('switching off drops every keyboard listener it added', () => {
  readingGuide_enable();
  readingGuide_disable();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));

  expect(line()).toBeNull();
});
