/**
 * @jest-environment jsdom
 *
 * Minimising the timer must not strand it.
 *
 * The minimised timer was a plain div wired with the mousedown-only helper, and the real
 * Minimise button was hidden by CSS at the same time. A keyboard-only student who minimised
 * the timer could never get it back: nothing in the tab order restored it (WCAG 2.2 SC 2.1.1).
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));
jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: jest.fn(),
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
}));

import {
  compositeOver,
  contrastRatio,
  parseCssColor,
} from '../../../src/features/annotations/annotation-colors.js';
import {
  pomodoro_enable,
  pomodoro_disable,
  pomodoro_getState,
} from '../../../src/features/pomodoro/pomodoro.js';

const restoreBtn = () => document.querySelector('#pomodoro-restore-btn');
const minimizeBtn = () => document.querySelector('#pomodoro-minimize-btn');
const mainContent = () => document.querySelector('.pomodoro-main-content');

/** A CSS colour as an opaque triple, painted over whatever is behind it when it has alpha. */
const opaque = (value, backdrop) => {
  const parsed = parseCssColor(value);
  return parsed.a === 1 ? [parsed.r, parsed.g, parsed.b] : compositeOver(parsed, backdrop);
};

/** Activate a control the way a keyboard does: Enter. */
function pressEnter(element) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  pomodoro_enable();
});

afterEach(() => {
  pomodoro_disable();
});

test('the restore affordance is a real button with an accessible name', () => {
  const button = restoreBtn();
  expect(button).not.toBeNull();
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('aria-label')).toMatch(/restore/i);
});

test('while the timer is open the restore button is out of the tab order', () => {
  expect(restoreBtn().hidden).toBe(true);
  expect(mainContent().hidden).toBe(false);
});

test('Enter on Minimise minimises, and the restore button takes the focus', () => {
  pressEnter(minimizeBtn());

  expect(pomodoro_getState().isMinimized).toBe(true);
  expect(restoreBtn().hidden).toBe(false);
  expect(mainContent().hidden).toBe(true);
  expect(document.activeElement).toBe(restoreBtn());
});

test('Enter on the restore button brings the timer back and returns the focus', () => {
  pressEnter(minimizeBtn());

  pressEnter(restoreBtn());

  expect(pomodoro_getState().isMinimized).toBe(false);
  expect(mainContent().hidden).toBe(false);
  expect(restoreBtn().hidden).toBe(true);
  expect(document.activeElement).toBe(minimizeBtn());
});

test('Space on the restore button brings the timer back too', () => {
  pressEnter(minimizeBtn());

  restoreBtn().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  expect(pomodoro_getState().isMinimized).toBe(false);
});

test('the minimise control says whether the timer is open', () => {
  expect(minimizeBtn().getAttribute('aria-expanded')).toBe('true');

  pressEnter(minimizeBtn());

  expect(minimizeBtn().getAttribute('aria-expanded')).toBe('false');
});

test('both controls point at the timer body they collapse and reopen', () => {
  // aria-controls named the other button, so a screen reader was told the Minimise control governs
  // a button rather than the timer that is about to disappear. Both point at the content.
  expect(mainContent().id).toBe('pomodoro-main-content');
  expect(minimizeBtn().getAttribute('aria-controls')).toBe('pomodoro-main-content');
  expect(restoreBtn().getAttribute('aria-controls')).toBe('pomodoro-main-content');

  expect(restoreBtn().getAttribute('aria-expanded')).toBe('false');

  pressEnter(minimizeBtn());
  expect(restoreBtn().getAttribute('aria-expanded')).toBe('false');

  pressEnter(restoreBtn());
  expect(restoreBtn().getAttribute('aria-expanded')).toBe('true');
  expect(minimizeBtn().getAttribute('aria-expanded')).toBe('true');
});

test('the restore button meets the 24px minimum target size', () => {
  const styles = document.querySelector('#assist-pomodoro-styles').textContent;
  const rule = styles.match(/#pomodoro-restore-btn[^{]*\{[^}]*\}/);
  expect(rule).not.toBeNull();
  expect(rule[0]).toMatch(/min-height:\s*(2[4-9]|[3-9]\d)px/);
  expect(rule[0]).toMatch(/min-width:\s*(2[4-9]|[3-9]\d)px/);
});

test('the restore button’s border is visible against the widget it sits on', () => {
  // rgba(60, 60, 90, 0.35) measured about 1.9:1 on the near-white widget. A control's own boundary
  // is what tells a low-vision student the button is there, and SC 1.4.11 asks 3:1 of it.
  const styles = document.querySelector('#assist-pomodoro-styles').textContent;
  const border = styles
    .match(/#pomodoro-restore-btn[^{]*\{[^}]*\}/)[0]
    .match(/border:[^;]*?(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i)[1];

  // The widget is rgba(255, 255, 255, 0.98), so it is near-white over any host page: graded over
  // both a white and a black page, because the extension does not choose the page underneath.
  for (const page of [
    [255, 255, 255],
    [0, 0, 0],
  ]) {
    const surface = compositeOver(parseCssColor('rgba(255, 255, 255, 0.98)'), page);
    expect(contrastRatio(opaque(border, surface), surface)).toBeGreaterThanOrEqual(3);
  }
});

test('every control in the widget shows a visible focus indicator', () => {
  const styles = document.querySelector('#assist-pomodoro-styles').textContent;
  expect(styles).toMatch(/:focus-visible/);
});
