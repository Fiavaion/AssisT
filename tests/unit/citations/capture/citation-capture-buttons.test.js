/**
 * @jest-environment jsdom
 *
 * Unit tests for capture/citation-capture-buttons.js.
 */

import { createCaptureButtons } from '../../../../src/features/citations/capture/citation-capture-buttons.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('createCaptureButtons()', () => {
  test('renders a labelled group with the cite + voice buttons', () => {
    const { el } = createCaptureButtons();
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBeTruthy();
    const labels = [...el.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toEqual(['Cite this source', 'Voice capture']);
  });

  test('"Cite this source" calls onCiteSource (mouse + keyboard)', () => {
    const onCiteSource = jest.fn();
    const { el } = createCaptureButtons({ onCiteSource });
    const btn = el.querySelector('button');
    fireMousedown(btn);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onCiteSource).toHaveBeenCalledTimes(2);
  });

  test('voice toggle calls onToggleVoice and reflects armed state via aria-pressed', () => {
    const onToggleVoice = jest.fn();
    const api = createCaptureButtons({ onToggleVoice });
    const voiceBtn = api.el.querySelectorAll('button')[1];
    expect(voiceBtn.getAttribute('aria-pressed')).toBe('false');
    fireMousedown(voiceBtn);
    expect(onToggleVoice).toHaveBeenCalledTimes(1);
    api.setVoiceActive(true);
    expect(voiceBtn.getAttribute('aria-pressed')).toBe('true');
  });

  test('has a polite status line in the bar, empty until there is something to say', () => {
    const { el } = createCaptureButtons();
    const status = el.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });

  test('setVoiceStatus() shows and announces what voice capture is doing', () => {
    const api = createCaptureButtons();
    const status = api.el.querySelector('[role="status"]');
    api.setVoiceStatus('Listening. Say "cite this" to save the passage you\'re reading.');
    expect(status.textContent).toBe(
      'Listening. Say "cite this" to save the passage you\'re reading.'
    );
    api.setVoiceStatus('');
    expect(status.textContent).toBe('');
  });

  test('the voice button is described by the status line', () => {
    const { el } = createCaptureButtons();
    const voiceBtn = el.querySelectorAll('button')[1];
    const status = el.querySelector('[role="status"]');
    expect(status.id).toBeTruthy();
    expect(voiceBtn.getAttribute('aria-describedby')).toBe(status.id);
  });

  test('destroy() removes the element and its handlers', () => {
    const onCiteSource = jest.fn();
    const api = createCaptureButtons({ onCiteSource });
    document.body.appendChild(api.el);
    const btn = api.el.querySelector('button');
    api.destroy();
    expect(api.el.parentNode).toBeNull();
    fireMousedown(btn);
    expect(onCiteSource).not.toHaveBeenCalled();
  });
});
