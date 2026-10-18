/**
 * Unit tests for the floating microphone button.
 *
 * These cover the honest-state contract (nothing says "Recording" until recognition really
 * started), the announcement roles on the status bar, viewport-only positioning, the one-Tab
 * keyboard route between the field and the mic, and the paused wording.
 *
 * @file microphone-button.test.js
 */

import { MicrophoneButton } from '../../../src/ui/components/microphone-button.js';
import { Z } from '../../../src/utils/z-index.js';

/**
 * Give an element a fixed viewport rectangle (jsdom returns all zeros otherwise).
 */
function stubRect(el, { left, top, width, height }) {
  el.getBoundingClientRect = () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => {},
  });
}

function makeField({ tag = 'textarea', left = 100, top = 100, width = 600, height = 200 } = {}) {
  const field = document.createElement(tag);
  document.body.appendChild(field);
  stubRect(field, { left, top, width, height });
  return field;
}

describe('MicrophoneButton', () => {
  let mic;
  let callbacks;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.scrollX = 0;
    window.scrollY = 0;
    callbacks = {
      onStart: jest.fn(),
      onStop: jest.fn(),
      onPause: jest.fn(),
      onResume: jest.fn(),
      onError: jest.fn(),
    };
    mic = new MicrophoneButton(callbacks);
  });

  afterEach(() => {
    if (mic && mic.button) {
      mic.destroy();
    }
    mic = null;
    jest.useRealTimers();
  });

  const bar = () => document.getElementById('assist-stt-recording-bar');

  // ------------------------------------------------------------------
  // Stacking: the microphone sits on the shared controls layer, below the consent question
  // ------------------------------------------------------------------
  describe('stacking', () => {
    it('uses the controls layer from the z-index scale, so the consent panel stays above it', () => {
      mic.show(makeField());

      const rule = Array.from(document.getElementById('assist-stt-mic-styles').sheet.cssRules).find(
        r => r.selectorText === '.assist-stt-mic-button'
      );
      expect(Number(rule.style.getPropertyValue('z-index'))).toBe(Z.CONTROLS);
      expect(Number(rule.style.getPropertyValue('z-index'))).toBeLessThan(Z.POINTER);
    });
  });

  // ------------------------------------------------------------------
  // 1. Honest state while the microphone is still starting
  // ------------------------------------------------------------------
  describe('honest starting state', () => {
    it('says it is waiting for the microphone, not recording, until onstart', () => {
      const field = makeField();
      mic.show(field);
      mic.startRecording();

      expect(mic.isStarting).toBe(true);
      expect(mic.isRecording).toBe(false);
      expect(mic.button.getAttribute('aria-label')).toMatch(/starting/i);
      expect(bar().textContent).toMatch(/waiting for the microphone/i);
      expect(bar().textContent).not.toMatch(/recording/i);
      expect(callbacks.onStart).toHaveBeenCalledWith(field);
    });

    it('only says Recording once recognition has really started', () => {
      mic.show(makeField());
      mic.startRecording();
      mic.updateState({ isRecording: true });

      expect(mic.isStarting).toBe(false);
      expect(mic.isRecording).toBe(true);
      expect(mic.button.getAttribute('aria-label')).toBe('Pause voice typing');
      expect(bar().textContent).toMatch(/recording/i);
    });

    it('gives a plain sentence and returns to idle when nothing starts in time', () => {
      jest.useFakeTimers();
      mic.show(makeField());
      mic.startRecording();

      jest.advanceTimersByTime(MicrophoneButton.START_TIMEOUT_MS + 10);

      expect(callbacks.onError).toHaveBeenCalledTimes(1);
      const message = callbacks.onError.mock.calls[0][0];
      expect(message).toMatch(/microphone/i);
      expect(message).toMatch(/address bar/i);
      expect(message).not.toMatch(/DOMException|SpeechRecognition/);
      expect(mic.isStarting).toBe(false);
      expect(mic.isRecording).toBe(false);
      expect(mic.button.getAttribute('aria-label')).toBe('Start voice typing');
    });

    it('cancels a pending start when clicked again', () => {
      mic.show(makeField());
      mic.startRecording();
      mic.toggle();

      expect(callbacks.onStop).toHaveBeenCalledTimes(1);
      expect(callbacks.onPause).not.toHaveBeenCalled();
      expect(mic.isStarting).toBe(false);
      expect(mic.isRecording).toBe(false);
    });

    it('showError returns the button to idle without a second error callback', () => {
      jest.useFakeTimers();
      mic.show(makeField());
      mic.startRecording();
      callbacks.onError.mockClear();

      mic.showError('No microphone was found.');
      jest.advanceTimersByTime(400);

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(mic.isStarting).toBe(false);
      expect(mic.isRecording).toBe(false);
      expect(bar()).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // 2. Announcements
  // ------------------------------------------------------------------
  describe('status announcements', () => {
    it('gives the status bar a polite live role', () => {
      mic.show(makeField());
      mic.startRecording();

      expect(bar().getAttribute('role')).toBe('status');
      expect(bar().getAttribute('aria-live')).toBe('polite');
      expect(bar().getAttribute('aria-atomic')).toBe('true');
    });
  });

  // ------------------------------------------------------------------
  // 3. Wording
  // ------------------------------------------------------------------
  describe('paused wording', () => {
    it('tooltip says a click carries on and the bar avoids jargon', () => {
      mic.show(makeField());
      mic.startRecording();
      mic.updateState({ isRecording: true });
      mic.pauseRecording();
      mic.showTooltip();

      expect(mic.tooltip.textContent).toMatch(/carry on|resume/i);
      expect(mic.tooltip.textContent).not.toMatch(/stop recording/i);
      expect(bar().textContent).toMatch(/paused/i);
      expect(bar().textContent).not.toMatch(/permission prompts/i);
    });

    it('idle tooltip advertises the shortcut that really exists', () => {
      mic.show(makeField());
      mic.showTooltip();

      expect(mic.tooltip.textContent).toContain('Alt+Shift+V');
      expect(mic.button.getAttribute('title')).not.toContain('Ctrl+Shift+M');
    });
  });

  // ------------------------------------------------------------------
  // 4. Positioning (viewport coordinates only)
  // ------------------------------------------------------------------
  describe('positioning', () => {
    it('sits inside the field, at its bottom-right corner', () => {
      const field = makeField({ left: 100, top: 100, width: 600, height: 200 });
      mic.show(field);

      const left = parseFloat(mic.button.style.left);
      const top = parseFloat(mic.button.style.top);
      expect(left).toBeGreaterThanOrEqual(100);
      expect(left + 56).toBeLessThanOrEqual(700);
      expect(top + 56).toBeLessThanOrEqual(300);
      expect(top).toBeGreaterThanOrEqual(100);
    });

    it('uses a compact button on a single-line field so it stays inside it', () => {
      const field = makeField({ tag: 'input', left: 50, top: 400, width: 300, height: 32 });
      mic.show(field);

      expect(mic.button.classList.contains('compact')).toBe(true);
      const left = parseFloat(mic.button.style.left);
      expect(left + 36).toBeLessThanOrEqual(350);
      expect(left).toBeGreaterThanOrEqual(50);
    });

    it('hides itself while the field is scrolled out of view, and comes back', () => {
      const field = makeField({ left: 100, top: 100, width: 600, height: 200 });
      mic.show(field);
      expect(mic.button.classList.contains('offscreen')).toBe(false);

      stubRect(field, { left: 100, top: -600, width: 600, height: 200 });
      mic.positionButton(field);
      expect(mic.button.classList.contains('offscreen')).toBe(true);

      stubRect(field, { left: 100, top: 100, width: 600, height: 200 });
      mic.positionButton(field);
      expect(mic.button.classList.contains('offscreen')).toBe(false);
    });

    it('places the tooltip in viewport coordinates, ignoring page scroll', () => {
      const field = makeField();
      mic.show(field);
      stubRect(mic.button, { left: 200, top: 300, width: 56, height: 56 });

      window.scrollX = 400;
      window.scrollY = 300;
      mic.showTooltip();

      expect(parseFloat(mic.tooltip.style.left)).toBe(228);
      expect(parseFloat(mic.tooltip.style.bottom)).toBe(window.innerHeight - 300 + 10);
    });

    it('places the interim results box in viewport coordinates too', () => {
      const field = makeField();
      mic.show(field);
      stubRect(mic.button, { left: 200, top: 300, width: 56, height: 56 });

      window.scrollX = 400;
      window.scrollY = 300;
      mic.showInterimResult('hello there');

      const display = document.getElementById('assist-stt-interim-display');
      expect(parseFloat(display.style.left)).toBe(200);
      expect(parseFloat(display.style.bottom)).toBe(window.innerHeight - 300 + 10);
    });
  });

  // ------------------------------------------------------------------
  // 5. Keyboard reach
  // ------------------------------------------------------------------
  describe('keyboard reach', () => {
    it('is one Tab away from the focused field', () => {
      const field = makeField();
      field.focus();
      mic.show(field);

      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      field.dispatchEvent(tab);

      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(mic.button);
    });

    it('returns to the field on Shift+Tab', () => {
      const field = makeField();
      mic.show(field);
      mic.button.focus();

      const back = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      mic.button.dispatchEvent(back);

      expect(back.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(field);
    });

    it('moves on to the next control after the field on Tab, never trapping', () => {
      const field = makeField();
      const next = document.createElement('button');
      next.textContent = 'Submit';
      document.body.appendChild(next);
      mic.show(field);
      mic.button.focus();

      const forward = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      mic.button.dispatchEvent(forward);

      expect(document.activeElement).toBe(next);
    });

    it('leaves the tab order when hidden', () => {
      const field = makeField();
      mic.show(field);
      expect(mic.button.getAttribute('tabindex')).toBe('0');

      mic.hide();
      expect(mic.button.getAttribute('tabindex')).toBe('-1');
    });

    it('stops listening to the field once hidden', () => {
      const field = makeField();
      field.focus();
      mic.show(field);
      mic.hide();

      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      field.dispatchEvent(tab);

      expect(tab.defaultPrevented).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Canvas's Rich Content Editor: the field is the body of a same-origin iframe
  // ------------------------------------------------------------------
  describe('a field inside an editor iframe', () => {
    let frame;
    let body;

    beforeEach(() => {
      frame = document.createElement('iframe');
      document.body.appendChild(frame);
      stubRect(frame, { left: 600, top: 450, width: 400, height: 250 });
      body = frame.contentDocument.body;
      body.className = 'mce-content-body';
      body.setAttribute('contenteditable', 'true');
      // The body's own rectangle is in the iframe's coordinates, which mean nothing out here.
      stubRect(body, { left: 0, top: 0, width: 400, height: 250 });
    });

    it('goes in the page, beside the iframe, and never into the editor document', () => {
      mic.show(body);

      expect(mic.button.ownerDocument).toBe(document);
      expect(mic.button.parentElement).toBe(document.body);
      const left = parseFloat(mic.button.style.left);
      const top = parseFloat(mic.button.style.top);
      expect(left).toBeGreaterThanOrEqual(600);
      expect(left + 56).toBeLessThanOrEqual(1000);
      expect(top).toBeGreaterThanOrEqual(450);
      expect(top + 56).toBeLessThanOrEqual(700);
      expect(frame.contentDocument.querySelector('[class*="assist-"], [id^="assist-"]')).toBeNull();
    });

    it('is one Tab away from the editor', () => {
      mic.show(body);

      const View = frame.contentWindow;
      const tab = new View.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      body.dispatchEvent(tab);

      expect(tab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(mic.button);
    });

    it('leaves Tab to the editor when the editor has used it (indenting a list item)', () => {
      // The editor binds its keys at start-up, long before any microphone appears.
      body.addEventListener('keydown', e => e.preventDefault(), { once: true });
      mic.show(body);

      const View = frame.contentWindow;
      const tab = new View.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      const focusSpy = jest.spyOn(mic.button, 'focus');
      body.dispatchEvent(tab);

      expect(focusSpy).not.toHaveBeenCalled();
    });

    it('moves on to the control after the iframe on Tab', () => {
      const next = document.createElement('button');
      next.textContent = 'Submit';
      document.body.appendChild(next);
      mic.show(body);
      mic.button.focus();

      const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      mic.button.dispatchEvent(forward);

      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(next);
    });

    it('goes back to the editor on Shift+Tab', () => {
      mic.show(body);
      mic.button.focus();
      const focusSpy = jest.spyOn(body, 'focus');

      const back = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      mic.button.dispatchEvent(back);

      expect(back.defaultPrevented).toBe(true);
      expect(focusSpy).toHaveBeenCalled();
    });
  });
});
