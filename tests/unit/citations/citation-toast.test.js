/**
 * @jest-environment jsdom
 *
 * Unit tests for citation-toast.js — the relocated, self-contained success/error toasts.
 */

import { showSuccessToast, showErrorToast } from '../../../src/features/citations/citation-toast.js';

afterEach(() => {
  document.querySelectorAll('.citation-toast, #assist-citation-toast-styles').forEach(el => el.remove());
  jest.useRealTimers();
});

describe('citation-toast', () => {
  test('showSuccessToast appends a status toast with the message as text', () => {
    showSuccessToast('Saved 3 citations');
    const toast = document.querySelector('.citation-toast-success');
    expect(toast).toBeTruthy();
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.querySelector('.citation-toast-message').textContent).toBe('Saved 3 citations');
  });

  test('showErrorToast uses role=alert for assertive announcement', () => {
    showErrorToast('Export failed');
    const toast = document.querySelector('.citation-toast-error');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.textContent).toContain('Export failed');
  });

  test('the message is never interpolated as HTML (XSS-safe)', () => {
    showSuccessToast('<img src=x onerror=alert(1)>');
    const toast = document.querySelector('.citation-toast-success');
    expect(toast.querySelector('img')).toBeNull();
    expect(toast.querySelector('.citation-toast-message').textContent).toContain('<img');
  });

  test('the toast auto-dismisses after its duration', () => {
    jest.useFakeTimers();
    showSuccessToast('Bye', 1000);
    expect(document.querySelector('.citation-toast')).toBeTruthy();
    jest.advanceTimersByTime(1000 + 300 + 20);
    expect(document.querySelector('.citation-toast')).toBeNull();
  });

  test('the transition stylesheet is injected once', () => {
    showSuccessToast('a');
    showErrorToast('b');
    expect(document.querySelectorAll('#assist-citation-toast-styles')).toHaveLength(1);
  });
});
