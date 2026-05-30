/**
 * Citation Save Tray
 *
 * A non-blocking confirmation tray shown after a one-click citation save. Replaces the old
 * forced confirm-modal-on-save, which research (Zotero/MyBib + ADHD/dyslexia UX) showed adds
 * friction for our audience. The tray:
 *   - announces what was saved and to which project (role="status", aria-live="polite"),
 *   - offers Undo (soft-delete within the window) and Edit (open the styled edit modal),
 *   - auto-dismisses, never steals focus, and never blocks the page.
 *
 * Dynamic text is set via textContent (never innerHTML) so a hostile title/project name
 * cannot inject markup.
 */

import { Z } from '../../utils/z-index.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';

const STYLE_ID = 'citation-save-tray-styles';
let activeTray = null;
let activeTimer = null;

/**
 * Inject the tray stylesheet once.
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .citation-save-tray {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: ${Z.TOAST};
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 380px;
      padding: 12px 14px;
      background: #1f2937;
      color: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .citation-save-tray.show {
      opacity: 1;
      transform: translateY(0);
    }
    .citation-save-tray-icon {
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
    }
    .citation-save-tray-text {
      flex: 1;
      min-width: 0;
    }
    .citation-save-tray-title {
      font-weight: 600;
    }
    .citation-save-tray-sub {
      font-size: 12px;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .citation-save-tray-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .citation-save-tray-btn {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 6px 10px;
      min-height: 32px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .citation-save-tray-btn:hover {
      background: rgba(255, 255, 255, 0.22);
    }
    .citation-save-tray-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .citation-save-tray {
        transition: none;
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-contrast: high) {
      .citation-save-tray {
        border: 2px solid #fff;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Remove the current tray (if any) and clear its timer.
 */
function clearActive() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeTray) {
    const tray = activeTray;
    activeTray = null;
    tray.classList.remove('show');
    setTimeout(() => tray.remove(), 250);
  }
}

function makeButton(label, ariaLabel, handler) {
  const btn = document.createElement('button');
  btn.className = 'citation-save-tray-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  attachInteractiveHandler(btn, `Citation Tray ${label}`, handler);
  return btn;
}

/**
 * Build the tray shell with an icon, a text block, and an actions container.
 * @returns {{tray: HTMLElement, actions: HTMLElement}}
 */
function buildShell(icon) {
  injectStyles();
  const tray = document.createElement('div');
  tray.className = 'citation-save-tray';
  tray.setAttribute('role', 'status');
  tray.setAttribute('aria-live', 'polite');

  const iconEl = document.createElement('span');
  iconEl.className = 'citation-save-tray-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;
  tray.appendChild(iconEl);

  const textWrap = document.createElement('div');
  textWrap.className = 'citation-save-tray-text';
  tray.appendChild(textWrap);

  const actions = document.createElement('div');
  actions.className = 'citation-save-tray-actions';
  tray.appendChild(actions);

  return { tray, textWrap, actions };
}

function mount(tray, duration) {
  document.body.appendChild(tray);
  requestAnimationFrame(() => tray.classList.add('show'));
  activeTray = tray;
  if (duration > 0) {
    activeTimer = setTimeout(() => clearActive(), duration);
  }
}

/**
 * Show the "saved" tray with Undo + Edit actions.
 * @param {Object} opts
 * @param {string} opts.title - citation title (shown, truncated by CSS)
 * @param {string} opts.projectName - destination project/library name
 * @param {Function} [opts.onUndo] - called when the user clicks Undo
 * @param {Function} [opts.onEdit] - called when the user clicks Edit
 * @param {number} [opts.duration=6000] - auto-dismiss delay (ms); 0 keeps it open
 */
export function showSaveTray(opts = {}) {
  const { title = '', projectName = 'Library', onUndo, onEdit, duration = 6000 } = opts;
  clearActive();
  const { tray, textWrap, actions } = buildShell('✓');

  const titleEl = document.createElement('div');
  titleEl.className = 'citation-save-tray-title';
  titleEl.textContent = `Saved to ${projectName}`;
  textWrap.appendChild(titleEl);

  if (title) {
    const subEl = document.createElement('div');
    subEl.className = 'citation-save-tray-sub';
    subEl.textContent = title;
    textWrap.appendChild(subEl);
  }

  if (typeof onEdit === 'function') {
    actions.appendChild(
      makeButton('Edit', 'Edit this citation', () => {
        clearActive();
        onEdit();
      })
    );
  }
  if (typeof onUndo === 'function') {
    actions.appendChild(
      makeButton('Undo', 'Undo saving this citation', () => {
        clearActive();
        onUndo();
      })
    );
  }

  mount(tray, duration);
}

/**
 * Show a short informational tray with an optional single action (e.g. "Already saved · View").
 * @param {Object} opts
 * @param {string} opts.message
 * @param {string} [opts.actionLabel]
 * @param {Function} [opts.onAction]
 * @param {'info'|'error'} [opts.variant='info']
 * @param {number} [opts.duration=5000]
 */
export function showInfoTray(opts = {}) {
  const { message = '', actionLabel, onAction, variant = 'info', duration = 5000 } = opts;
  clearActive();
  const { tray, textWrap, actions } = buildShell(variant === 'error' ? '✕' : 'ℹ');

  const titleEl = document.createElement('div');
  titleEl.className = 'citation-save-tray-title';
  titleEl.textContent = message;
  textWrap.appendChild(titleEl);

  if (actionLabel && typeof onAction === 'function') {
    actions.appendChild(
      makeButton(actionLabel, actionLabel, () => {
        clearActive();
        onAction();
      })
    );
  }

  mount(tray, duration);
}

/**
 * Dismiss any visible tray immediately.
 */
export function hideTray() {
  clearActive();
}

export default { showSaveTray, showInfoTray, hideTray };
