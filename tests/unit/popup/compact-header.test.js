/**
 * @jest-environment jsdom
 *
 * Tests for the compact header, the only header the popup has.
 *
 * The classic header was deleted with Flat becoming the popup's only face. The load-bearing
 * assertion here is that every action it offered is still reachable from the compact one, except
 * the two that acted only on the accordion Flat hides (Organize and the hide-unused filter), which
 * went with it. Everything is read off the real popup.html and popup.css, because a fixture would
 * prove nothing about the markup that actually ships.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');
const POPUP_CSS = fs.readFileSync(path.join(ROOT, 'src/popup/popup.css'), 'utf8');

/** The popup's own markup. */
function load() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
}

beforeEach(load);

/** Every action the classic header offered that still means something, and its control now. */
const ACTIONS = [
  { action: 'Advanced options', control: 'btn-options-compact' },
  { action: 'Help', control: 'menu-help' },
  { action: 'Report a bug', control: 'menu-report-bug' },
  { action: 'Discover your tools', control: 'menu-discovery' },
  { action: 'Reset settings', control: 'menu-reset' },
  { action: 'Support us', control: 'menu-support' },
];

describe('the compact header', () => {
  it('carries the popup’s heading', () => {
    const compact = document.querySelector('.popup-header-compact');
    expect(compact.querySelector('h1').textContent.trim()).toBe('AssisT');
  });

  it('keeps settings out where it can be reached in one press', () => {
    const compact = document.querySelector('.popup-header-compact');
    expect(compact.querySelector('#btn-options-compact')).not.toBeNull();
  });

  it('is one row: settings, the menu trigger, and nothing else to press', () => {
    const compact = document.querySelector('.popup-header-compact');
    const row = [...compact.querySelectorAll(':scope > button')].map(b => b.id);
    expect(row).toEqual(['btn-options-compact', 'btn-header-more']);
  });

  it('drops the subtitle, which is not worth a line of a 340px popup', () => {
    expect(document.querySelector('.popup-header-compact .subtitle')).toBeNull();
  });
});

describe('the overflow menu', () => {
  it('is a menu, wired to its trigger', () => {
    const trigger = document.getElementById('btn-header-more');
    const menu = document.getElementById('header-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(trigger.getAttribute('aria-controls')).toBe('header-menu');
  });

  it('holds exactly the actions folded away from the row', () => {
    const items = [...document.querySelectorAll('#header-menu [role="menuitem"]')].map(i => i.id);
    expect(items).toEqual([
      'menu-discovery',
      'menu-help',
      'menu-report-bug',
      'menu-support',
      'menu-reset',
    ]);
  });

  it('names every item in text, so no item is an icon alone', () => {
    document.querySelectorAll('#header-menu [role="menuitem"]').forEach(item => {
      expect(item.querySelector('.header-menu__label').textContent.trim().length).toBeGreaterThan(
        0
      );
    });
  });

  it('hides the decorative icons from the reading order', () => {
    document.querySelectorAll('#header-menu .header-menu__icon').forEach(icon => {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('sends Support Us to the support page, in a new tab that cannot reach back', () => {
    const item = document.getElementById('menu-support');
    expect(item.getAttribute('href')).toBe('https://www.fiavaion.com/support/');
    expect(item.getAttribute('target')).toBe('_blank');
    expect(item.getAttribute('rel')).toContain('noopener');
  });
});

describe('every header action is reachable from the compact header', () => {
  it.each(ACTIONS)('$action has its control', ({ control }) => {
    expect(document.querySelector(`.popup-header-compact #${control}`)).not.toBeNull();
  });
});

describe('the compact header is the only one', () => {
  it('has no classic header beside it', () => {
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelector('.popup-header')).toBeNull();
    expect(POPUP_HTML).not.toMatch(/id="btn-(organize|hide-unused|options|help|reset|discovery)"/);
  });

  it('hides the accordion Flat drives', () => {
    expect(POPUP_CSS).toMatch(/\.popup-container\s+\.popup-main\s*\{[^}]*display:\s*none/);
  });

  it('shows the compact header', () => {
    expect(POPUP_CSS).toMatch(
      /\.popup-container\s+\.popup-header-compact\s*\{[^}]*display:\s*flex/
    );
  });

  it('is not gated on any class, so nothing can bring the classic header back', () => {
    expect(POPUP_CSS).not.toMatch(/\.flat-active|\.new-experience/);
  });
});
