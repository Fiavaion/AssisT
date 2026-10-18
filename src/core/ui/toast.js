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

  // Create new toast element.
  //
  // role="status" is the toast's only live route: it carries the implicit aria-live="polite" a
  // status region has, stated explicitly for older screen readers, and aria-atomic so the whole
  // short message is read rather than the words that changed. One element, one announcement.
  //
  // The blue is Material Blue 800 rather than 500: white text on the old rgba(33, 150, 243, 0.95)
  // measured about 3:1 against a white page, below WCAG 2.2 SC 1.4.3's 4.5:1 for 14px text.
  const toast = document.createElement('div');
  toast.id = 'assist-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(21, 101, 192, 0.95);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 100500; /* Z.TOAST — see src/utils/z-index.js */
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: -apple-system, system-ui, sans-serif;
  `;

  // Insert the live region first, then write into it: a region that is already in the
  // accessibility tree when its text changes is announced reliably, one whose text arrives with
  // it may not be.
  document.body.appendChild(toast);
  toast.textContent = message;

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
