/**
 * The popup's citation tools, in real Chrome against the built extension: "Save Citation" on the
 * page the student is reading, "Citation Library", "How to use citations", and the Quick View list
 * (listing, search, copy in the style the library has chosen, and how a screen reader meets it).
 *
 * The popup reads the active tab once, at start-up. Opening it as a tab takes the foreground, so
 * the course page is brought back to the front and the popup reloaded against it — the technique
 * tests/e2e/mind-map.spec.js proved. Controls in a background tab are driven from the keyboard,
 * which goes straight to the focused element, where a synthesised mouse event is not guaranteed a
 * hit test.
 */

import { test, expect, waitForPopupReady } from './extension-fixture.js';
import {
  SOURCE,
  articleHtml,
  routeLms,
  routeCrossref,
  openExtensionPage,
  allCitations,
  rpc,
  record,
  setConsent,
  lastClip,
  settle,
  captureButton,
  CLIPBOARD_TAP,
} from './fixtures/citation-harness.js';

const ORIGIN = 'https://citation-popup.instructure.com';
const PAGE_URL = `${ORIGIN}/courses/1/pages/working-memory`;
const POPUP = id => `chrome-extension://${id}/src/popup/popup.html`;
const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

const NUMPY = 'Array programming with NumPy';
const DEEP = 'Deep learning';

/**
 * Wait for the citation tools in Flat. Citations is on by default, so its buttons are drawn under
 * its own row; each one presses the hidden accordion button of the same id (flat/flat-mount.js).
 */
async function openCitationTools(popup) {
  await expect(popup.locator('#flat-btn-save-citation')).toBeVisible({ timeout: 15000 });
}

/** The course page, open and with the content script running. */
async function openCoursePage(context, extensionId) {
  await routeCrossref(context);
  await routeLms(context, ORIGIN, articleHtml());
  const ext = await openExtensionPage(context, extensionId);
  await setConsent(ext, 'citations', true);
  const lms = await context.newPage();
  await lms.goto(PAGE_URL);
  await captureButton(lms);
  return { lms, ext };
}

/** A popup whose "current tab" is the course page. */
async function openPopupOn(context, extensionId, lms) {
  const popup = await context.newPage();
  await popup.addInitScript(CLIPBOARD_TAP);
  await popup.goto(POPUP(extensionId));
  await waitForPopupReady(popup);
  await lms.bringToFront();
  await popup.reload();
  await waitForPopupReady(popup);
  await openCitationTools(popup);
  return popup;
}

/**
 * Press a popup control. The popup stays a background tab here (the course page is brought to the
 * front so the popup treats it as the current tab), and Chrome gives a background tab no keyboard
 * focus, so Enter would go nowhere. It is clicked instead; these buttons' keyboard operation is
 * proven where the popup is in front (tests/e2e/popup.test.js and the popup unit tests).
 */
async function press(popup, selector) {
  await popup.locator(selector).click();
}

/** Seed two records and open Quick View on them. */
async function openQuickView(context, extensionId) {
  const { lms, ext } = await openCoursePage(context, extensionId);
  await rpc(ext, 'CIT_ADD', [record()]);
  await rpc(ext, 'CIT_ADD', [
    record({ title: DEEP, authors: ['LeCun, Yann'], doi: '', url: 'https://example.org/deep' }),
  ]);
  const popup = await openPopupOn(context, extensionId, lms);
  await press(popup, '#flat-btn-expand-citations');
  // Quick View opens over the popup in a dialog of its own; the list is inside it, where the
  // student can see it (the accordion that used to hold it is hidden).
  const dialog = popup.getByRole('dialog', { name: 'Citation Quick View' });
  await expect(dialog).toBeVisible();
  const panel = dialog.getByRole('region', { name: 'Citation Manager' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.citation-card')).toHaveCount(2, { timeout: 15000 });
  return { lms, ext, popup, panel, dialog };
}

// Crossref's host is an optional permission that comes with the consent (ADR 0009). These tests
// grant the consent in storage, so the build under test also holds the host, as it would after a
// student allowed Crossref; asking for both is covered by third-party-consent.spec.js.
test.use({ grantedHosts: ['https://api.crossref.org/*'] });

test.beforeEach(() => {
  test.setTimeout(120000);
});

test.describe('the popup citation tools', () => {
  // Fails if: the popup sends the save to the wrong tab, the content script does not answer, the
  // popup does not report the outcome, or nothing is stored.
  test('"Save Citation" saves the page in the active tab', async ({ context, extensionId }) => {
    const { lms, ext } = await openCoursePage(context, extensionId);
    const popup = await openPopupOn(context, extensionId, lms);

    await press(popup, '#flat-btn-save-citation');
    await expect(popup.locator('#status-indicator')).toHaveText('Citation saved!', {
      timeout: 20000,
    });
    await expect(lms.locator('.assist-action-tray').last()).toContainText('Saved to Library');

    const stored = await allCitations(ext);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe(SOURCE.title);
    expect(stored[0].doi).toBe(SOURCE.doi);
  });

  // On a fresh profile the first open offers the store migration choice in the page; a student
  // answers it and lands in the library. Fails if: the button does nothing, the first-run choice
  // never resolves, or no library tab opens.
  test('"Citation Library" opens the library in its own tab', async ({ context, extensionId }) => {
    const { lms } = await openCoursePage(context, extensionId);
    const popup = await openPopupOn(context, extensionId, lms);

    const opened = context.waitForEvent('page', { timeout: 30000 });
    await press(popup, '#flat-btn-citation-manager');

    const prompt = lms.getByRole('dialog', { name: 'Set up your citation library' });
    await expect(prompt).toBeVisible({ timeout: 15000 });
    await settle(lms);
    await prompt.getByRole('button', { name: 'Start fresh' }).click();

    const library = await opened;
    await library.waitForURL(LIBRARY(extensionId), { timeout: 15000 });
    await expect(library.getByRole('button', { name: /new collection/i })).toBeVisible({
      timeout: 15000,
    });
  });

  // Fails if: the button is not wired, the service worker does not open the guide, or the guide
  // page does not render.
  test('"How to use citations" opens the guide', async ({ popupPage, context }) => {
    await openCitationTools(popupPage);
    const opened = context.waitForEvent('page', { timeout: 20000 });
    await press(popupPage, '#flat-btn-citation-guide');
    const guide = await opened;
    await guide.waitForURL(/\/src\/pages\/citation-guide\/guide\.html$/, { timeout: 15000 });
    await expect(
      guide.getByRole('heading', { level: 1, name: 'Saving, writing and checking your sources' })
    ).toBeVisible();
  });

  // Fails if: Quick View does not list the library, search does not narrow it or the count does not
  // follow, or Copy uses Harvard (the default) when the library has chosen APA.
  test('Quick View lists, searches, and copies in the style the library chose', async ({
    context,
    extensionId,
  }) => {
    const { popup, panel } = await openQuickView(context, extensionId);

    // The student chose APA in the library.
    const library = await context.newPage();
    await library.goto(LIBRARY(extensionId));
    const apa = library.getByRole('radio', { name: /APA/ });
    await apa.click({ timeout: 15000 });
    await expect(apa).toHaveAttribute('aria-checked', 'true');
    await library.close();

    await expect(panel.locator('.citation-card', { hasText: NUMPY })).toHaveCount(1);
    await expect(panel.locator('.citation-card', { hasText: DEEP })).toHaveCount(1);
    await expect(panel.locator('.citation-count')).toHaveText('2 citations');

    const search = panel.getByRole('searchbox', { name: 'Search citations' });
    await search.fill('numpy');
    await expect(panel.locator('.citation-card')).toHaveCount(1);
    await expect(panel.locator('.citation-card')).toContainText(NUMPY);
    await expect(panel.locator('.citation-count')).toHaveText('1 of 2 citations');
    await search.fill('');
    await expect(panel.locator('.citation-card')).toHaveCount(2);
    await expect(panel.locator('.citation-count')).toHaveText('2 citations');

    await popup
      .locator(`.citation-card[data-id]:has-text("${NUMPY}") [data-command="copy"]`)
      .focus();
    await popup.keyboard.press('Enter');
    await expect(popup.locator('#status-indicator')).toHaveText('Copied!');
    const copied = (await lastClip(popup))?.['text/plain'] || '';
    expect(copied).toMatch(/Harris, C\. R\., & Millman, K\. J\. \(2020\)/);
    expect(copied).not.toMatch(/Harris, C\.R\. and Millman/);
  });

  // SC 4.1.3: a live list would be re-read whole on every search keystroke. Fails if: the list
  // sits inside a live region, or there is no short status carrying only the count.
  test('Quick View: the list is not a live region and a short count status is announced', async ({
    context,
    extensionId,
  }) => {
    const { popup, panel } = await openQuickView(context, extensionId);

    const insideLiveRegion = await popup
      .locator('.citation-list')
      .evaluate(el => !!el.closest('[aria-live]'));
    expect(insideLiveRegion, 'the card list is inside an aria-live region').toBe(false);

    const status = panel
      .locator('[role="status"], [aria-live="polite"]')
      .filter({ hasText: /\b2 citations\b/ });
    await expect(status).toHaveCount(1);
    expect((await status.textContent()).trim().length).toBeLessThan(60);

    await panel.getByRole('searchbox', { name: 'Search citations' }).fill('numpy');
    await expect(
      panel.locator('[role="status"], [aria-live="polite"]').filter({ hasText: /\b1 citation\b/ })
    ).toHaveCount(1);
  });

  // SC 4.1.2: a card that opens on Enter must be exposed as operable, not as an inert list item.
  // Fails if: no card is exposed as a button, link or option named by its title.
  test('Quick View: each card is exposed with an operable role named by its title', async ({
    context,
    extensionId,
  }) => {
    const { panel } = await openQuickView(context, extensionId);

    for (const title of [NUMPY, DEEP]) {
      const operable = panel
        .getByRole('button', { name: title, exact: true })
        .or(panel.getByRole('link', { name: title, exact: true }))
        .or(panel.getByRole('option', { name: title, exact: true }));
      await expect(operable, `no operable element named "${title}"`).toHaveCount(1);
    }
  });

  // Fails if: Quick View cannot be put away, or leaves the popup covered once it has gone.
  test('Quick View closes and gives the popup back', async ({ context, extensionId }) => {
    const { popup, dialog } = await openQuickView(context, extensionId);

    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(popup.locator('#flat-btn-expand-citations')).toBeVisible();
  });
});
