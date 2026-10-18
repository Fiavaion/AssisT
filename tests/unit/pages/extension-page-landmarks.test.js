/**
 * @jest-environment jsdom
 *
 * Landmarks on the extension's own pages.
 *
 * axe's remaining items from the overnight sweep were all of one kind: content a student navigating
 * by landmark cannot reach, or a landmark they cannot tell apart from another. The popup's nine
 * accordion panels were nine unnamed regions; the Text Stats switch and the permission banner sat
 * outside every landmark, so the banner explaining that AssisT is only active on LMS sites was
 * skipped; the Discovery and AI-setup progress bars sat outside too; and the demo page declared a
 * second banner beside the page's own header.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');

/** Parse a page into a document a test can query. */
function pageOf(file) {
  return new DOMParser().parseFromString(
    fs.readFileSync(path.join(ROOT, file), 'utf8'),
    'text/html'
  );
}

describe('the popup', () => {
  const popup = pageOf('src/popup/popup.html');

  test('every accordion panel is a region with a name of its own', () => {
    const panels = [...popup.querySelectorAll('.accordion-content[role="region"]')];
    expect(panels.length).toBeGreaterThan(1);

    const names = panels.map(panel => panel.getAttribute('aria-label'));
    expect(names.filter(Boolean)).toHaveLength(panels.length);
    expect(new Set(names).size).toBe(names.length);
  });

  test('the Text Stats switch and the banners are inside a named landmark', () => {
    for (const selector of [
      '.text-stats-bar',
      '#permission-banner',
      '#file-access-banner',
    ]) {
      const el = popup.querySelector(selector);
      expect(el).not.toBeNull();
      const landmark = el.closest('section[aria-label], main, header, [role="region"]');
      expect(landmark && landmark.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe.each([
  ['the Discovery quiz', 'src/pages/discovery/discovery.html'],
  ['AI setup', 'src/pages/ai-setup/ai-setup.html'],
])('%s', (_label, file) => {
  const page = pageOf(file);

  test('the progress bar is inside a named landmark', () => {
    const bar = page.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    const landmark = bar.closest('[role="region"], main, [role="main"], section[aria-label]');
    expect(landmark).not.toBeNull();
    expect(landmark.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('the demo page', () => {
  const demo = pageOf('src/pages/demo/demo.html');

  test('declares one banner, not two', () => {
    const banners = [
      ...demo.querySelectorAll('[role="banner"]'),
      // A <header> that is not inside a sectioning element is a banner too.
      ...[...demo.querySelectorAll('header')].filter(
        header => !header.closest('article, aside, nav, section')
      ),
    ];
    expect(banners).toHaveLength(1);
  });

  test('the AssisT notice is still in a landmark of its own', () => {
    const notice = demo.querySelector('.assist-banner');
    expect(notice.tagName).toBe('ASIDE');
    expect(notice.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('the Help page', () => {
  test('has a main landmark', () => {
    expect(pageOf('src/pages/help/help.html').querySelector('main')).not.toBeNull();
  });
});
