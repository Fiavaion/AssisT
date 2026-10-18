/**
 * The citation analyser panel on a narrow screen and in dark mode: two things jsdom cannot see,
 * because it has no layout and no colour scheme.
 *
 * SC 1.4.10 Reflow: at 320 CSS pixels the panel must fit the viewport, with no sideways scroll.
 * SC 1.4.3 Contrast: in dark mode the message text must take the dark colours, which it cannot
 * while the colour is set inline.
 */

import { test, expect } from './extension-fixture.js';
import {
  articleHtml,
  routeLms,
  openExtensionPage,
  contentWorld,
} from './fixtures/citation-harness.js';

const ORIGIN = 'https://citation-analyser.instructure.com';
const PAGE_URL = `${ORIGIN}/courses/1/pages/analyser`;

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const rgb = css => css.match(/\d+/g).slice(0, 3).map(Number);

async function openPage(context, extensionId, { width, height, colorScheme }) {
  await routeLms(context, ORIGIN, articleHtml());
  const ext = await openExtensionPage(context, extensionId);
  // Cloud mode with no key makes the analyser show its "API Key Required" message.
  await ext.evaluate(() => chrome.storage.local.set({ aiMode: 'cloud' }));
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme });
  await page.goto(PAGE_URL);
  const world = await contentWorld(page);
  return { page, world };
}

test.describe('citation analyser panel', () => {
  // Fails if: any part of the panel lies outside a 320px viewport, or the page scrolls sideways.
  test('fits a 320px-wide viewport without sideways scrolling', async ({ context, extensionId }) => {
    const { page, world } = await openPage(context, extensionId, {
      width: 320,
      height: 640,
      colorScheme: 'light',
    });
    await world(() => window.assistFeatures.citationAnalyzer.show());

    const panel = page.locator('#assist-citation-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  // Fails if: in dark mode any message text in the panel is below 4.5:1 on the panel background.
  test('dark mode message text reaches 4.5:1 on the dark panel', async ({ context, extensionId }) => {
    const { page, world } = await openPage(context, extensionId, {
      width: 1280,
      height: 800,
      colorScheme: 'dark',
    });
    await world(() => window.assistFeatures.citationAnalyzer.show());
    await world(() =>
      window.assistFeatures.citationAnalyzer.analyze('Smith, J. (2020). A title. Journal of Things.')
    );

    const panel = page.locator('#assist-citation-panel');
    await expect(panel.getByRole('heading', { name: 'API Key Required' })).toBeVisible({
      timeout: 10000,
    });

    const colours = await page.evaluate(() => {
      const root = document.getElementById('assist-citation-panel');
      const background = getComputedStyle(root).backgroundColor;
      const texts = Array.from(root.querySelectorAll('.assist-citation-content h3, .assist-citation-content p'))
        .filter(el => el.textContent.trim())
        .map(el => ({ text: el.textContent.trim().slice(0, 40), color: getComputedStyle(el).color }));
      return { background, texts };
    });

    expect(colours.texts.length).toBeGreaterThan(0);
    for (const { text, color } of colours.texts) {
      expect(
        contrast(rgb(color), rgb(colours.background)),
        `"${text}" is ${color} on ${colours.background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
