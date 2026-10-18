/**
 * The minimised timer's restore control must survive sanitising.
 *
 * A tester found the minimised Pomodoro timer rendered as a plain `<div>` with no id and no label,
 * leaving a keyboard-only student with no way back to the timer they had minimised. They were running
 * a build from before today's fix, so the div may simply have been the old markup. But they raised a
 * second possibility worth closing off: that `sanitizeHTML` strips the button. Every other button in
 * the same template came through intact, so if this one does not, the difference is in its attributes.
 */

import { sanitizeHTML } from '../../../src/utils/sanitize.js';

const MINIMISED_VIEW = `
  <button type="button" class="pomodoro-minimized-view" id="pomodoro-restore-btn"
          aria-label="Restore Pomodoro timer" hidden>
    <span class="session-dot"></span><span class="time-text">24:59</span>
  </button>
`;

describe('the minimised timer, through the sanitiser', () => {
  function parse(html) {
    const host = document.createElement('div');
    host.innerHTML = sanitizeHTML(html);
    return host;
  }

  it('is still a button, and still says what it does', () => {
    const restore = parse(MINIMISED_VIEW).querySelector('button');

    expect(restore).not.toBeNull();
    expect(restore.id).toBe('pomodoro-restore-btn');
    expect(restore.getAttribute('aria-label')).toBe('Restore Pomodoro timer');
  });

  it('keeps the class the styling and the code both look for', () => {
    const restore = parse(MINIMISED_VIEW).querySelector('#pomodoro-restore-btn');

    expect(restore.classList.contains('pomodoro-minimized-view')).toBe(true);
  });

  it('keeps its inner spans, so the time is still shown', () => {
    const restore = parse(MINIMISED_VIEW).querySelector('#pomodoro-restore-btn');

    expect(restore.querySelector('.time-text')).not.toBeNull();
    expect(restore.textContent).toContain('24:59');
  });
});
