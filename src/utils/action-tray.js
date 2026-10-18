/**
 * Action Tray
 *
 * A non-blocking confirmation tray for actions that have just happened. It announces what
 * was done (role="status", aria-live="polite"), offers up to two actions — typically Undo —
 * auto-dismisses, never steals focus, and never blocks the page. It replaces confirm-first
 * dialogs: research (Zotero/MyBib + ADHD/dyslexia UX) shows a confirmation step in front of
 * every action costs our audience more than an occasional undo does.
 *
 * SC 2.2.1: the dismiss timer pauses while the pointer is over the tray or focus is inside
 * it, so a keyboard or switch user is never raced.
 *
 * Dynamic text is set via textContent (never innerHTML) so a hostile title or message
 * cannot inject markup.
 *
 * Shared by the citation manager (save + undo) and inline annotations (delete + undo);
 * it lives in utils for the same reason focus-trap.js does — more than one feature needs it
 * and neither owns it.
 */

import { Z } from './z-index.js';
import { attachAccessibleHandler } from './event-handlers.js';
import { DEFAULT_SHORTCUTS, loadShortcuts, matchesShortcut } from './keyboard-shortcuts.js';

const STYLE_ID = 'assist-action-tray-styles';

/** Registry key for "move focus into the tray" (see DEFAULT_SHORTCUTS). */
const TRAY_FOCUS_FEATURE = 'action_tray_focus';

/**
 * SC 2.2.1: a tray whose action the student may need (Undo above all) gets at least this long.
 * The tray used to live 8 s while sitting 10-24 Tab presses from the top of the page, which meant
 * a keyboard-only student had no Undo at all.
 */
const MIN_ACTION_DURATION = 20000;

let activeTray = null;
let activeTimer = null;
/** The storage listener that keeps the binding current, null while no tray is on screen. */
let trayShortcutListener = null;
/** Where focus was when the shortcut was pressed, so the same key can hand it straight back. */
let returnFocusTo = null;
/** The student's binding for the tray shortcut; the registry default until storage answers. */
let trayShortcut = DEFAULT_SHORTCUTS[TRAY_FOCUS_FEATURE];
/** Storage is read once per realm; every later remap arrives through the change listener. */
let shortcutRead = false;
/** The hint line of the tray on screen, so a remap can rewrite what it promises. */
let activeHint = null;

/**
 * Adopt a binding and make the tray on screen agree with it — both the line that names the key and
 * the key onTrayKeydown matches come from this one value. An empty string is a binding the student
 * cleared on purpose: the hint goes, and no keystroke claims to reach the tray.
 * @param {string} binding
 */
function applyTrayShortcut(binding) {
  if (typeof binding !== 'string' || binding === trayShortcut) {
    return;
  }
  trayShortcut = binding;
  renderTrayHint();
}

/**
 * The popup writes the whole settings object when a shortcut is remapped, so the new binding is
 * read straight out of the change rather than by going back to storage.
 * @param {Object} changes
 * @param {string} [area]
 */
function onShortcutStorageChange(changes, area) {
  if (area && area !== 'local') {
    return;
  }
  const change = changes && changes.assist_settings;
  if (!change) {
    return;
  }
  const saved = (change.newValue && change.newValue.keyboardShortcuts) || {};
  applyTrayShortcut(
    TRAY_FOCUS_FEATURE in saved ? saved[TRAY_FOCUS_FEATURE] : DEFAULT_SHORTCUTS[TRAY_FOCUS_FEATURE]
  );
}

/**
 * Follow the student's binding while a tray is on screen: storage is read once per realm, and the
 * change listener lives exactly as long as the tray does, so nothing is left behind when it goes.
 * The first read is deliberately NOT awaited — a tray must appear the instant a citation is saved,
 * so the very first tray of a session may name the default binding and every tray after it names
 * theirs. Silent on any failure: a realm that cannot read storage keeps the registry default and
 * says the registry default.
 */
function watchTrayShortcut() {
  if (!trayShortcutListener) {
    try {
      trayShortcutListener = onShortcutStorageChange;
      chrome.storage.onChanged.addListener(trayShortcutListener);
    } catch {
      trayShortcutListener = null;
    }
  }

  if (shortcutRead) {
    return;
  }
  shortcutRead = true;
  try {
    Promise.resolve(loadShortcuts())
      .then(map => {
        if (map && TRAY_FOCUS_FEATURE in map) {
          applyTrayShortcut(map[TRAY_FOCUS_FEATURE]);
        }
      })
      .catch(() => {});
  } catch {
    /* no storage in this realm — the registry default stands */
  }
}

/** Stop following the binding when the tray goes, so no listener outlives it. */
function unwatchTrayShortcut() {
  if (!trayShortcutListener) {
    return;
  }
  try {
    chrome.storage.onChanged.removeListener(trayShortcutListener);
  } catch {
    /* the realm that could not add one cannot have one to remove */
  }
  trayShortcutListener = null;
}

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
    .assist-action-tray {
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
    .assist-action-tray.show {
      opacity: 1;
      transform: translateY(0);
    }
    .assist-action-tray-icon {
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
    }
    .assist-action-tray-text {
      flex: 1;
      min-width: 0;
    }
    .assist-action-tray-title {
      font-weight: 600;
    }
    .assist-action-tray-sub {
      font-size: 12px;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .assist-action-tray-status {
      font-size: 12.5px;
      margin-top: 2px;
      color: #e5e7eb;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .assist-action-tray-hint {
      font-size: 12px;
      margin-top: 2px;
      color: #cbd5e1;
    }
    .assist-action-tray-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .assist-action-tray-btn {
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
    .assist-action-tray-btn:hover {
      background: rgba(255, 255, 255, 0.22);
    }
    .assist-action-tray-btn:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .assist-action-tray {
        transition: none;
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-contrast: high) {
      .assist-action-tray {
        border: 2px solid #fff;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * The control the tray shortcut should land on: Undo if the tray offers it (the action a student
 * is racing the timer for), otherwise the first action, otherwise the tray itself.
 * @param {HTMLElement} tray
 * @returns {HTMLElement}
 */
function trayFocusTarget(tray) {
  const buttons = Array.from(tray.querySelectorAll('.assist-action-tray-btn'));
  return buttons.find(b => b.dataset.trayAction === 'undo') || buttons[0] || tray;
}

/**
 * Write the hint line that names the one keystroke reaching the tray, and keep it in step with the
 * binding. SC 2.1.1: the tray sits at the end of <body>, so Tab reaches it last if at all, and the
 * hint lives inside the live region so a screen reader hears it with the "Saved" message instead of
 * having to hunt for the tray. A student who has cleared the binding in Settings gets no hint
 * promising a key that does nothing; the tray is still reachable by Tab, and its actions still
 * answer Enter and Space. Only the hint's own text changes on a remap, so the tray is not
 * announced again from the top.
 */
function renderTrayHint() {
  if (!activeTray) {
    return;
  }
  const target = trayFocusTarget(activeTray);
  if (target === activeTray || !trayShortcut) {
    if (activeHint) {
      activeHint.remove();
      activeHint = null;
    }
    return;
  }
  if (!activeHint) {
    activeHint = document.createElement('div');
    activeHint.className = 'assist-action-tray-hint';
    activeTray.querySelector('.assist-action-tray-text').appendChild(activeHint);
  }
  const text = `Press ${trayShortcut} to reach ${target.textContent}`;
  if (activeHint.textContent !== text) {
    activeHint.textContent = text;
  }
}

/**
 * Hand focus back to whatever held it before the tray took it. Returns false when that element
 * has gone (a re-rendered list, a closed dialog), so the caller can place focus somewhere real
 * instead of letting it fall to BODY.
 * @returns {boolean}
 */
function restoreFocus() {
  const target = returnFocusTo;
  returnFocusTo = null;
  if (target && target.isConnected && typeof target.focus === 'function') {
    target.focus();
    return document.activeElement === target;
  }
  return false;
}

/**
 * Last resort when the element focus came from has gone: put focus on the page's main landmark
 * rather than leave it on BODY, where the next Tab starts again from the top of the document.
 */
function focusMainLandmark() {
  const main = document.querySelector('main, [role="main"]');
  if (!main) {
    return;
  }
  if (!main.hasAttribute('tabindex')) {
    main.setAttribute('tabindex', '-1');
  }
  main.focus();
}

/** Move focus out of a tray that is about to be removed, so it never lands on BODY. */
function releaseFocus(tray) {
  if (!tray.contains(document.activeElement)) {
    returnFocusTo = null;
    return;
  }
  if (!restoreFocus()) {
    focusMainLandmark();
  }
}

/**
 * The tray's own keydown handler, bound on the document so the shortcut works wherever the
 * student is:
 *  - the shortcut from outside the tray moves focus in (and remembers where it came from)
 *  - the shortcut from inside, or Escape, hands focus back and starts the full timer over
 * @param {KeyboardEvent} e
 */
function onTrayKeydown(e) {
  if (!activeTray) {
    return;
  }
  const inside = activeTray.contains(document.activeElement);
  const isTrayKey = Boolean(trayShortcut) && matchesShortcut(e, trayShortcut);
  if (!isTrayKey && !(inside && e.key === 'Escape')) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  if (inside) {
    if (!restoreFocus()) {
      focusMainLandmark();
    }
    if (typeof activeTray.assistRestartTimer === 'function') {
      activeTray.assistRestartTimer();
    }
    return;
  }
  returnFocusTo = document.activeElement;
  trayFocusTarget(activeTray).focus();
}

/**
 * Remove the current tray (if any) and clear its timer.
 */
function clearActive() {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  document.removeEventListener('keydown', onTrayKeydown);
  unwatchTrayShortcut();
  activeHint = null;
  if (activeTray) {
    const tray = activeTray;
    activeTray = null;
    releaseFocus(tray);
    tray.classList.remove('show');
    setTimeout(() => tray.remove(), 250);
  }
  returnFocusTo = null;
}

function makeButton(label, ariaLabel, handler, action) {
  const btn = document.createElement('button');
  btn.className = 'assist-action-tray-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  if (action) {
    btn.dataset.trayAction = action;
  }
  attachAccessibleHandler(btn, `Action Tray ${label}`, handler);
  return btn;
}

/**
 * Build the tray shell with an icon, a text block, and an actions container.
 * @returns {{tray: HTMLElement, actions: HTMLElement}}
 */
function buildShell(icon) {
  injectStyles();
  const tray = document.createElement('div');
  tray.className = 'assist-action-tray';
  tray.setAttribute('role', 'status');
  tray.setAttribute('aria-live', 'polite');
  // Focusable by script only: the shortcut can land here when a tray carries no action, and the
  // tray never joins the tab order, so it still never takes focus from what the student is doing.
  tray.setAttribute('tabindex', '-1');

  const iconEl = document.createElement('span');
  iconEl.className = 'assist-action-tray-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;
  tray.appendChild(iconEl);

  const textWrap = document.createElement('div');
  textWrap.className = 'assist-action-tray-text';
  tray.appendChild(textWrap);

  const actions = document.createElement('div');
  actions.className = 'assist-action-tray-actions';
  tray.appendChild(actions);

  return { tray, textWrap, actions, iconEl };
}

/** Icon + colour per reassurance level (rendered on the dark tray surface). */
const LEVEL_ICON = { green: '✓', amber: '!', red: '✕' };
const LEVEL_COLOR = { green: '#4ade80', amber: '#fbbf24', red: '#f87171' };

function mount(tray, duration) {
  const hasAction = tray.querySelector('.assist-action-tray-btn') !== null;
  // The tray is the active one before it is in the document, so its hint is written into the live
  // region before the region arrives: a live region that turns up already changing is often not
  // announced at all.
  activeTray = tray;
  watchTrayShortcut();
  renderTrayHint();
  // A tray carrying an action is a time limit on that action, so it gets the longer life.
  const life = hasAction && duration > 0 ? Math.max(duration, MIN_ACTION_DURATION) : duration;

  document.body.appendChild(tray);
  requestAnimationFrame(() => tray.classList.add('show'));
  document.addEventListener('keydown', onTrayKeydown);
  if (life > 0) {
    // SC 2.2.1: the tray's Undo/Fix actions are time-limited, so the timer PAUSES while the
    // pointer is over the tray or keyboard focus is inside it, and restarts (full duration) on
    // leave — a keyboard or switch user can take as long as they need.
    const start = () => {
      clearTimeout(activeTimer);
      activeTimer = setTimeout(() => clearActive(), life);
    };
    // Escape (or the shortcut again) hands focus back and starts the student's time over.
    tray.assistRestartTimer = start;
    const pause = () => clearTimeout(activeTimer);
    tray.addEventListener('mouseenter', pause);
    tray.addEventListener('focusin', pause);
    tray.addEventListener('mouseleave', start);
    tray.addEventListener('focusout', e => {
      if (!tray.contains(e.relatedTarget)) {
        start();
      }
    });
    start();
  }
}

/**
 * Show the "saved" tray with Undo + Edit/Fix actions and an optional reassurance verdict.
 * @param {Object} opts
 * @param {string} opts.title - citation title (shown, truncated by CSS)
 * @param {string} opts.projectName - destination project/library name
 * @param {'green'|'amber'|'red'} [opts.level='green'] - reassurance level (sets the icon + colour)
 * @param {string} [opts.statusMessage] - plain-language verdict line ("Looks complete", "Add a year")
 * @param {Function} [opts.onUndo] - called when the user clicks Undo
 * @param {Function} [opts.onEdit] - called when the user clicks the edit/fix action
 * @param {string} [opts.editLabel='Edit'] - label for the edit action (e.g. "Fix")
 * @param {string} [opts.itemNoun='item'] - what was saved, for the actions' accessible names
 * @param {number} [opts.duration=6000] - auto-dismiss delay (ms); 0 keeps it open
 */
export function showSaveTray(opts = {}) {
  const {
    title = '',
    projectName = 'Library',
    level = 'green',
    statusMessage = '',
    onUndo,
    onEdit,
    editLabel = 'Edit',
    itemNoun = 'item',
    duration = 8000,
  } = opts;
  clearActive();
  const { tray, textWrap, actions, iconEl } = buildShell(LEVEL_ICON[level] || '✓');
  iconEl.style.color = LEVEL_COLOR[level] || '';

  const titleEl = document.createElement('div');
  titleEl.className = 'assist-action-tray-title';
  titleEl.textContent = `Saved to ${projectName}`;
  textWrap.appendChild(titleEl);

  if (statusMessage) {
    const statusEl = document.createElement('div');
    statusEl.className = 'assist-action-tray-status';
    statusEl.textContent = statusMessage;
    textWrap.appendChild(statusEl);
  }

  if (title) {
    const subEl = document.createElement('div');
    subEl.className = 'assist-action-tray-sub';
    subEl.textContent = title;
    textWrap.appendChild(subEl);
  }

  if (typeof onEdit === 'function') {
    actions.appendChild(
      makeButton(editLabel, `${editLabel} this ${itemNoun}`, () => {
        clearActive();
        onEdit();
      })
    );
  }
  if (typeof onUndo === 'function') {
    actions.appendChild(
      makeButton(
        'Undo',
        `Undo saving this ${itemNoun}`,
        () => {
          clearActive();
          onUndo();
        },
        'undo'
      )
    );
  }

  mount(tray, duration);
}

/**
 * Show a short informational tray with an optional single action (e.g. "Already saved · View").
 * @param {Object} opts
 * @param {string} opts.message
 * @param {string} [opts.actionLabel]
 * @param {string} [opts.actionAriaLabel] - accessible name when the label alone is too terse
 *   out of context ("Add quote" -> "Add the highlighted words to the source already saved")
 * @param {Function} [opts.onAction]
 * @param {'info'|'error'} [opts.variant='info']
 * @param {number} [opts.duration=5000]
 */
export function showInfoTray(opts = {}) {
  const {
    message = '',
    actionLabel,
    actionAriaLabel,
    onAction,
    variant = 'info',
    duration = 5000,
  } = opts;
  clearActive();
  const { tray, textWrap, actions } = buildShell(variant === 'error' ? '✕' : 'ℹ');

  const titleEl = document.createElement('div');
  titleEl.className = 'assist-action-tray-title';
  titleEl.textContent = message;
  textWrap.appendChild(titleEl);

  if (actionLabel && typeof onAction === 'function') {
    actions.appendChild(
      makeButton(actionLabel, actionAriaLabel || actionLabel, () => {
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
