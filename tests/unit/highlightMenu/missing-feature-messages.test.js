/**
 * When a highlight menu action's feature is not loaded, the menu says so in
 * the page (the shared status toast) and never blocks the page with alert().
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

import { showToast } from '../../../src/core/ui/toast.js';

const ACTIONS = [
  'Read Aloud (TTS)',
  'Dictionary Lookup',
  'Translate',
  'Add Annotation',
  'Save as Citation',
  'Speed Read (RSVP)',
  'Summarize with AI',
  'Simplify Text',
  'Break Down Assignment',
  'Socratic Tutor',
  'Knowledge Graph',
  'Analyze Citation',
  'Compare Documents',
  'Generate Study Path',
];

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 10,
    left: 0,
    right: 10,
    width: 10,
    height: 10,
  });
  global.chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../../src/features/highlightMenu/highlightMenu.js');
  // Show the AI actions too; none of their features is loaded in this test.
  window.assistFeatures.highlightMenu.settings.llmEnabled = true;
});

beforeEach(() => {
  document.body.innerHTML = '<p id="a">The quick brown fox jumps over the lazy dog.</p>';
  window.alert = jest.fn();
  const text = document.getElementById('a').firstChild;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 19);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});

test.each(ACTIONS)('%s with its feature missing tells the student in the page', label => {
  const button = document.querySelector(`[aria-label="${label}"]`);
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // The release of the same click lands on the page and is swallowed.
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  expect(window.alert).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast.mock.calls[0][2]).toEqual({ force: true });
});
