/**
 * The help page's shortcut table must never go stale again.
 *
 * It once listed Ctrl+Shift+R, Ctrl+Shift+T and Ctrl+Shift+D — keys the extension had not used
 * for a long time — because the list was hand-written markup nobody updated when the bindings
 * moved. These tests hold the table to the registry: every entry in DEFAULT_SHORTCUTS has a row,
 * the row shows the student's own binding when they have remapped one, and the page's static
 * markup carries no key names of its own to drift.
 */

import fs from 'fs';
import path from 'path';

import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
} from '../../../../src/utils/keyboard-shortcuts.js';
import {
  buildShortcutRows,
  renderShortcutTable,
  initShortcutTable,
} from '../../../../src/pages/help/help.js';

const HELP_HTML = path.join(__dirname, '../../../../src/pages/help/help.html');

/** A table body, as the page provides one. */
function makeTbody() {
  document.body.innerHTML = '<table><tbody id="shortcut-table-body"></tbody></table>';
  return document.getElementById('shortcut-table-body');
}

describe('help page shortcut table', () => {
  describe('coverage of the registry', () => {
    it('renders a row for every shortcut in the registry', () => {
      const tbody = makeTbody();
      renderShortcutTable(tbody, DEFAULT_SHORTCUTS);

      const rendered = Array.from(tbody.querySelectorAll('tr')).map(
        tr => tr.dataset.shortcutKey
      );

      Object.keys(DEFAULT_SHORTCUTS).forEach(key => {
        expect(rendered).toContain(key);
      });
      expect(rendered).toHaveLength(Object.keys(DEFAULT_SHORTCUTS).length);
    });

    it('names every row with the registry label and shows its keys', () => {
      const tbody = makeTbody();
      renderShortcutTable(tbody, DEFAULT_SHORTCUTS);

      Object.entries(DEFAULT_SHORTCUTS).forEach(([key, binding]) => {
        const row = tbody.querySelector(`tr[data-shortcut-key="${key}"]`);
        expect(row).not.toBeNull();
        expect(row.querySelector('.shortcut-action').textContent).toBe(SHORTCUT_LABELS[key]);
        expect(row.querySelector('.shortcut-keys').textContent).toContain(binding);
      });
    });

    it('gives every registry entry a human-readable label', () => {
      buildShortcutRows(DEFAULT_SHORTCUTS).forEach(row => {
        expect(SHORTCUT_LABELS[row.key]).toBeDefined();
        expect(row.label).not.toBe(row.key);
      });
    });
  });

  describe("the student's own bindings", () => {
    it('shows a remapped key instead of the default, and marks it as theirs', () => {
      const tbody = makeTbody();
      renderShortcutTable(tbody, { ...DEFAULT_SHORTCUTS, focus_mode_toggle: 'Alt+Shift+K' });

      const row = tbody.querySelector('tr[data-shortcut-key="focus_mode_toggle"]');
      expect(row.querySelector('kbd').textContent).toBe('Alt+Shift+K');
      expect(row.textContent).toContain('your setting');
      expect(row.textContent).not.toContain(DEFAULT_SHORTCUTS.focus_mode_toggle);
    });

    it('says "Not set" for a shortcut the student cleared, rather than the default', () => {
      const tbody = makeTbody();
      renderShortcutTable(tbody, { ...DEFAULT_SHORTCUTS, ocr_activate: '' });

      const row = tbody.querySelector('tr[data-shortcut-key="ocr_activate"]');
      expect(row.querySelector('.shortcut-keys').textContent).toBe('Not set');
      expect(row.querySelector('kbd')).toBeNull();
    });

    it('falls back to the default for a key the saved map predates', () => {
      const rows = buildShortcutRows({ ocr_activate: 'Alt+Shift+P' });
      const focus = rows.find(row => row.key === 'focus_mode_toggle');
      expect(focus.binding).toBe(DEFAULT_SHORTCUTS.focus_mode_toggle);
      expect(focus.customised).toBe(false);
    });
  });

  describe('page load', () => {
    it('fills the table from the same storage the popup reads', async () => {
      const tbody = makeTbody();
      chrome.storage.local.get = jest.fn((key, callback) =>
        callback({ assist_settings: { keyboardShortcuts: { tts_stop: 'Alt+Shift+S' } } })
      );

      await initShortcutTable();

      expect(tbody.querySelectorAll('tr')).toHaveLength(Object.keys(DEFAULT_SHORTCUTS).length);
      const row = tbody.querySelector('tr[data-shortcut-key="tts_stop"]');
      expect(row.querySelector('kbd').textContent).toBe('Alt+Shift+S');
    });

    it('still shows the defaults when storage cannot be read', async () => {
      const tbody = makeTbody();
      chrome.storage.local.get = jest.fn(() => {
        throw new Error('storage unavailable');
      });

      await initShortcutTable();

      const row = tbody.querySelector('tr[data-shortcut-key="reading_mode_toggle"]');
      expect(row.querySelector('kbd').textContent).toBe(DEFAULT_SHORTCUTS.reading_mode_toggle);
    });
  });

  describe('the page itself', () => {
    const html = fs.readFileSync(HELP_HTML, 'utf8');

    it('has the table body the script fills', () => {
      expect(html).toContain('id="shortcut-table-body"');
    });

    it('hardcodes no shortcut of its own', () => {
      // Any literal Ctrl+/Alt+ combination in the markup is a second source of truth waiting
      // to drift. The only keys named in prose are ones the registry does not own
      // (Alt+Click on an annotation, Delete/Backspace, Escape).
      const literalShortcuts = html.match(/\b(?:Ctrl|Alt)\+(?:Shift\+)?[A-Za-z0-9]+\b/g) || [];
      expect(literalShortcuts.filter(s => s !== 'Alt+Click')).toEqual([]);
    });

    it('points at the public repository, not a personal one', () => {
      expect(html).toContain('https://github.com/Fiavaion/AssisT');
      expect(html).not.toMatch(/MarJone/i);
    });

    it('has the landmarks and skip link the other pages have', () => {
      expect(html).toMatch(/<main[^>]+id="help-main"/);
      expect(html).toMatch(/<nav[^>]+aria-label(?:ledby)?=/);
      expect(html).toContain('class="skip-link" href="#help-main"');
    });
  });
});
