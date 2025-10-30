/**
 * Toast Notification Utility
 *
 * Displays temporary notification messages to the user.
 * Used across all features for user feedback.
 *
 * @module core/ui/toast
 */

/**
 * Display a toast notification message
 *
 * @param {string} message - The message to display
 * @param {number} [duration=2000] - Display duration in milliseconds
 * @returns {void}
 *
 * @example
 * import { showToast } from '@core/ui/toast.js';
 * showToast('Feature enabled!');
 */
export function showToast(message, duration = 2000) {
  // Remove any existing toast
  const existing = document.getElementById('assist-toast');
  if (existing) {
    existing.remove();
  }

  // Create new toast element
  const toast = document.createElement('div');
  toast.id = 'assist-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(33, 150, 243, 0.95);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: -apple-system, system-ui, sans-serif;
  `;

  document.body.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
