/**
 * Toast Notification Utility
 *
 * Displays temporary notification messages to the user.
 * Used across all features for user feedback.
 *
 * @module core/ui/toast
 */

/**
 * Check if toasts are suppressed by minimize clutter setting
 * @returns {Promise<boolean>} True if toasts should be suppressed
 */
async function isToastSuppressed() {
  try {
    const result = await chrome.storage.local.get('featureNotificationsEnabled');
    // featureNotificationsEnabled is false when minimize_clutter is on
    return result.featureNotificationsEnabled === false;
  } catch {
    // If storage access fails, show toast (fail open)
    return false;
  }
}

/**
 * Display a toast notification message
 *
 * @param {string} message - The message to display
 * @param {number} [duration=2000] - Display duration in milliseconds
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.force=false] - Force show even if minimize clutter is on
 * @returns {void}
 *
 * @example
 * import { showToast } from '@core/ui/toast.js';
 * showToast('Feature enabled!');
 *
 * // Force show even when minimize clutter is on (for critical messages)
 * showToast('Error occurred', 3000, { force: true });
 */
export async function showToast(message, duration = 2000, options = {}) {
  // Check if toasts are suppressed (unless forced)
  if (!options.force) {
    const suppressed = await isToastSuppressed();
    if (suppressed) {
      console.log('[Toast] Suppressed (minimize clutter enabled):', message);
      return;
    }
  }

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
    z-index: 100500; /* Z.TOAST — see src/utils/z-index.js */
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
