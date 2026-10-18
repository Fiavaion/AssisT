/**
 * @jest-environment jsdom
 *
 * A support that is switched off has to give the page back.
 *
 * Overnight release testing switched every support off on a live article and counted what was left:
 * the body had gained two children, and among them was a hidden `#assist-reading-guide-line`. The
 * guide was only ever hidden, never removed — so "off" left a div of ours in the student's document,
 * and the page's own element count never came back to what it was.
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

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  readingGuide_disable();
});

test('switching the reading guide off takes its line out of the page', () => {
  const before = document.body.children.length;
  readingGuide_enable();
  expect(document.querySelector(LINE)).not.toBeNull();

  readingGuide_disable();

  expect(document.querySelector(LINE)).toBeNull();
  expect(document.body.children.length).toBe(before);
  expect(readingGuide_getEnabled()).toBe(false);
});

test('switching it back on builds the line again', () => {
  readingGuide_enable();
  readingGuide_disable();
  readingGuide_enable();

  const line = document.querySelector(LINE);
  expect(line).not.toBeNull();
  expect(line.style.display).toBe('block');
  expect(document.querySelectorAll(LINE)).toHaveLength(1);
});

test('switching it off twice is harmless', () => {
  readingGuide_enable();
  readingGuide_disable();
  readingGuide_disable();

  expect(document.querySelector(LINE)).toBeNull();
});
