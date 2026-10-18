/**
 * @jest-environment jsdom
 *
 * WCAG 2.2 SC 3.2.6 Consistent Help across the extension's own pages.
 *
 * The popup and the mind map each put Help at the trailing end of their header. The citation
 * library, the welcome wizard, the Discovery quiz and the AI setup wizard offered none, and AI setup
 * is the page a student is most likely to be stuck on. Each of them now carries the same control in
 * the same place: the last thing in the page's header, a link to the extension's Help page that
 * opens in a new tab so the wizard behind it keeps its step.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const HELP_PAGE = path.join(ROOT, 'src/pages/help/help.html');

const PAGES = [
  ['the citation library', 'src/pages/citation-library/library.html'],
  ['the welcome wizard', 'src/pages/welcome/welcome.html'],
  ['the Discovery quiz', 'src/pages/discovery/discovery.html'],
  ['AI setup', 'src/pages/ai-setup/ai-setup.html'],
  ['the consent window', 'src/pages/consent/consent.html'],
];

function pageOf(file) {
  return new DOMParser().parseFromString(
    fs.readFileSync(path.join(ROOT, file), 'utf8'),
    'text/html'
  );
}

describe.each(PAGES)('%s offers help', (_label, file) => {
  const page = pageOf(file);
  const help = page.querySelector('[data-destination="help"]');

  test('has a help control declared as a WAI-Adapt help destination', () => {
    expect(help).not.toBeNull();
  });

  test('the control has an accessible name that says Help and that it opens a new tab', () => {
    const name = help.getAttribute('aria-label') || help.textContent.trim();
    expect(name).toMatch(/^Help\b/);
    expect(name).toMatch(/new tab/i);
    // SC 2.5.3 Label in Name: the visible words start the accessible name.
    expect(name.startsWith(help.textContent.trim())).toBe(true);
  });

  test('is a keyboard-reachable link to the extension Help page', () => {
    expect(help.tagName).toBe('A');
    expect(help.hasAttribute('tabindex')).toBe(false);
    const target = path.resolve(path.dirname(path.join(ROOT, file)), help.getAttribute('href'));
    expect(target).toBe(HELP_PAGE);
    expect(fs.existsSync(target)).toBe(true);
  });

  test('opens in a new tab, so the page behind it keeps its place', () => {
    expect(help.getAttribute('target')).toBe('_blank');
    expect(help.getAttribute('rel')).toMatch(/noopener/);
  });

  test('sits where the popup and the mind map put it: last in the page header', () => {
    const header = help.closest('header');
    expect(header).not.toBeNull();
    // A banner, not a header scoped to one wizard step.
    expect(header.closest('main, section, article, aside, nav, [role="main"]')).toBeNull();
    expect(header.lastElementChild).toBe(help);
  });

  test('is the only help control on the page', () => {
    expect(page.querySelectorAll('[data-destination="help"]')).toHaveLength(1);
  });
});
