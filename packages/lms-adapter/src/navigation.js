/**
 * SPA navigation listener.
 *
 * LMS platforms (Canvas, Classroom) navigate without full page reloads.
 * This module fires registered callbacks when the effective URL or page
 * title changes, matching the MutationObserver + popstate approach used
 * in AssisT's content-simple.js SPA cleanup system.
 *
 * @module lms-adapter/navigation
 */

const listeners = new Set();
let observing = false;
let lastHref = typeof window !== 'undefined' ? window.location.href : '';

/**
 * Register a callback that fires on SPA-style page changes.
 * Returns an unsubscribe function.
 *
 * @param {() => void} callback
 * @returns {() => void} Unsubscribe
 */
export function onPageChange(callback) {
  listeners.add(callback);
  if (!observing) startObserving();
  return () => { listeners.delete(callback); };
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* individual callback errors must not break others */ }
  }
}

function checkNavigation() {
  const href = window.location.href;
  if (href !== lastHref) {
    lastHref = href;
    notify();
  }
}

function startObserving() {
  if (typeof window === 'undefined') return;
  observing = true;

  window.addEventListener('popstate', checkNavigation);

  // Canvas and Classroom use history.pushState — wrap it to fire our checks.
  const original = window.history.pushState.bind(window.history);
  window.history.pushState = (...args) => {
    original(...args);
    checkNavigation();
  };

  // Title-change observer catches SPA navigations that don't emit popstate.
  new MutationObserver(checkNavigation).observe(
    document.querySelector('title') ?? document.documentElement,
    { subtree: true, childList: true, characterData: true }
  );
}
