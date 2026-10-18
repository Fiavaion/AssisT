/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/citation-overlay.js — the modal overlay host.
 */

import { openOverlay } from '../../../../src/features/citations/ui/citation-overlay.js';

afterEach(() => {
  document.querySelectorAll('.assist-cite-overlay-backdrop').forEach(el => el.remove());
});

function content(text = 'hello') {
  const div = document.createElement('div');
  const btn = document.createElement('button');
  btn.textContent = text;
  div.appendChild(btn);
  return div;
}

describe('openOverlay()', () => {
  test('mounts a backdrop + role=dialog aria-modal surface with the label and content', () => {
    const c = content();
    openOverlay({ content: c, label: 'Your citations' });
    const backdrop = document.querySelector('.assist-cite-overlay-backdrop');
    const dialog = backdrop.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Your citations');
    expect(dialog.contains(c)).toBe(true);
  });

  test('close() removes the backdrop and calls onClose once', () => {
    const onClose = jest.fn();
    const { close } = openOverlay({ content: content(), onClose });
    close();
    close(); // idempotent
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes the overlay', () => {
    const onClose = jest.fn();
    const { el } = openOverlay({ content: content(), onClose });
    const dialog = el.querySelector('[role="dialog"]');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('mousedown on the backdrop closes, but mousedown inside the dialog does not', () => {
    const { el } = openOverlay({ content: content() });
    const dialog = el.querySelector('[role="dialog"]');
    // Inside the dialog: no close.
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeTruthy();
    // On the backdrop itself: close.
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeNull();
  });
});
