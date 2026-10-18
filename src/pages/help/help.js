/**
 * The help page's shortcut table.
 *
 * The table used to be hand-written markup, and it drifted: it advertised Ctrl+Shift+R for
 * reading mode and Ctrl+Shift+T for read aloud long after the shipped bindings had moved to
 * Alt+R and Ctrl+Shift+Space, so a student following the page pressed keys that did nothing —
 * or, worse, stopped speech when they meant to start it. A page that repeats a list of keys is
 * a second source of truth for them, and a second source of truth is a future lie.
 *
 * So the table is built at load from `utils/keyboard-shortcuts.js`: DEFAULT_SHORTCUTS decides
 * which rows exist, SHORTCUT_LABELS names them, and `loadShortcuts()` — the same call the popup's
 * Keyboard tab makes, reading `assist_settings.keyboardShortcuts` — supplies the student's own
 * bindings where they have changed any. A shortcut they have deliberately cleared shows as "Not
 * set" rather than quietly falling back to the default, because off is a choice.
 *
 * @module pages/help/help
 */

import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  loadShortcuts,
  normalizeShortcut,
} from '../../utils/keyboard-shortcuts.js';

/**
 * @typedef {{ key: string, label: string, binding: string|null, customised: boolean }} ShortcutRow
 */

/**
 * One row per entry in the shortcut registry, in registry order.
 *
 * The registry is the whole list: a feature that ships a shortcut gets a row here whether or not
 * anyone remembered to update this page, which is the point.
 *
 * @param {Object<string, string>} [shortcuts] - the student's bindings; missing keys fall back to
 *   the default, an empty value means the student switched that shortcut off.
 * @returns {ShortcutRow[]}
 */
export function buildShortcutRows(shortcuts = {}) {
  return Object.keys(DEFAULT_SHORTCUTS).map(key => {
    const stored = Object.prototype.hasOwnProperty.call(shortcuts, key)
      ? shortcuts[key]
      : DEFAULT_SHORTCUTS[key];
    const binding = typeof stored === 'string' && stored.trim() ? normalizeShortcut(stored) : null;

    return {
      key,
      label: SHORTCUT_LABELS[key] || key,
      binding,
      customised: binding !== null && binding !== normalizeShortcut(DEFAULT_SHORTCUTS[key]),
    };
  });
}

/**
 * Draw the rows into a table body. Text only — nothing here interpolates markup.
 *
 * @param {HTMLElement} tbody
 * @param {Object<string, string>} [shortcuts]
 * @returns {ShortcutRow[]} the rows drawn
 */
export function renderShortcutTable(tbody, shortcuts = {}) {
  const rows = buildShortcutRows(shortcuts);
  tbody.textContent = '';

  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.shortcutKey = row.key;

    const action = document.createElement('th');
    action.scope = 'row';
    action.className = 'shortcut-action';
    action.textContent = row.label;
    tr.appendChild(action);

    const keys = document.createElement('td');
    keys.className = 'shortcut-keys';
    if (row.binding) {
      const kbd = document.createElement('kbd');
      kbd.textContent = row.binding;
      keys.appendChild(kbd);
      if (row.customised) {
        const note = document.createElement('span');
        note.className = 'shortcut-note';
        note.textContent = ' (your setting)';
        keys.appendChild(note);
      }
    } else {
      keys.textContent = 'Not set';
    }
    tr.appendChild(keys);

    tbody.appendChild(tr);
  });

  return rows;
}

/**
 * Fill the table on the help page from storage, falling back to the shipped defaults if storage
 * cannot be read — an empty table would be worse than a slightly optimistic one.
 *
 * @returns {Promise<void>}
 */
export async function initShortcutTable() {
  const tbody = document.getElementById('shortcut-table-body');
  if (!tbody) {
    return;
  }

  let shortcuts = DEFAULT_SHORTCUTS;
  try {
    shortcuts = await loadShortcuts();
  } catch {
    // Storage unreadable — the defaults are still true for a fresh install.
  }
  renderShortcutTable(tbody, shortcuts);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShortcutTable);
  } else {
    initShortcutTable();
  }
}
