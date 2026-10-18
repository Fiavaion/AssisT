/**
 * Citation toasts — transient success / error notifications.
 *
 * Relocated out of the (retired) citation-ui.js so the citation feature has a small, self-contained
 * toast that the export pipeline and the content-script integration can both import without dragging
 * in a deleted god-class. Fully standalone: it injects its own one-line transition rule and builds
 * the toast with textContent (the message is never interpolated as HTML — XSS-safe).
 *
 * For confirmable actions (save/undo) prefer the richer action-tray; this is for fire-and-
 * forget status only.
 */

import { Z } from '../../utils/z-index.js';

const STYLE_ID = 'assist-citation-toast-styles';

/** Inject the one transition rule the toast animates against (idempotent, no-op without a document). */
function injectToastStyles() {
  if (typeof document === 'undefined' || !document.head || document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .citation-toast.show { opacity: 1 !important; transform: translateY(0) !important; }
    @media (prefers-reduced-motion: reduce) { .citation-toast { transition: none !important; } }
  `;
  document.head.appendChild(style);
}

/**
 * Build a toast element. The message is set via textContent — never HTML.
 * @param {string} message
 * @param {'success'|'error'} type
 * @returns {HTMLElement}
 */
function createToast(message, type) {
  injectToastStyles();

  const toast = document.createElement('div');
  toast.className = `citation-toast citation-toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const icon = document.createElement('span');
  icon.className = 'citation-toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'success' ? '✓' : '✕';

  const text = document.createElement('span');
  text.className = 'citation-toast-message';
  text.textContent = String(message ?? '');

  toast.appendChild(icon);
  toast.appendChild(text);

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: type === 'success' ? '#2e7d32' : '#c62828',
    color: '#ffffff',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    zIndex: String(Z.TOAST),
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s ease',
    maxWidth: '400px',
  });

  return toast;
}

/**
 * Show a toast, animate it in, then auto-dismiss.
 * @param {HTMLElement} toast
 * @param {number} duration
 */
function present(toast, duration) {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show a success toast.
 * @param {string} message
 * @param {number} [duration=3000]
 */
export function showSuccessToast(message, duration = 3000) {
  present(createToast(message, 'success'), duration);
}

/**
 * Show an error toast.
 * @param {string} message
 * @param {number} [duration=4000]
 */
export function showErrorToast(message, duration = 4000) {
  present(createToast(message, 'error'), duration);
}

export default { showSuccessToast, showErrorToast };
