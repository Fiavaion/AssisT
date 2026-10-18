/**
 * Capture from a page to the library, the way a student does it: the page carries academic
 * metadata, the student presses Alt+C, and the record is waiting in the library with the right
 * fields. The page is served at an instructure.com address (so the manifest injects the content
 * script) and Crossref is answered from a fixture, so nothing here depends on the network.
 */

import { test, expect } from './extension-fixture.js';
import {
  articleHtml,
  crossrefWork,
  routeLms,
  routeCrossref,
  openExtensionPage,
  setConsent,
} from './fixtures/citation-harness.js';

const ORIGIN = 'https://citation-capture.instructure.com';
const PAGE = `${ORIGIN}/courses/1/pages/numpy`;
const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

// Crossref's host is an optional permission that comes with the consent (ADR 0009). These tests
// grant the consent in storage, so the build under test also holds the host, as it would after a
// student allowed Crossref; asking for both is covered by third-party-consent.spec.js.
test.use({ grantedHosts: ['https://api.crossref.org/*'] });

const META = {
  citation_title: 'Array programming with NumPy',
  citation_author: 'Harris, Charles R.',
  citation_journal_title: 'Nature',
  citation_publication_date: '2020/09/16',
  citation_volume: '585',
  citation_issue: '7825',
  citation_firstpage: '357',
  citation_lastpage: '362',
  citation_doi: '10.1038/s41586-020-2649-2',
};

/** What Crossref holds for the same DOI, so an enriched record agrees with the page. */
const NUMPY_WORK = crossrefWork({
  title: META.citation_title,
  authors: [META.citation_author],
  journal: META.citation_journal_title,
  date: META.citation_publication_date,
  volume: META.citation_volume,
  issue: META.citation_issue,
  firstpage: META.citation_firstpage,
  lastpage: META.citation_lastpage,
  doi: META.citation_doi,
});

test('Alt+C on a page with academic metadata files a journal record in the library', async ({
  context,
  extensionId,
  popupPage,
}) => {
  test.setTimeout(120000);
  await popupPage.waitForTimeout(300);

  await routeCrossref(context, { [META.citation_doi]: NUMPY_WORK });
  await routeLms(
    context,
    ORIGIN,
    articleHtml({
      title: 'NumPy - Canvas',
      heading: META.citation_title,
      meta: Object.entries(META),
    })
  );
  const ext = await openExtensionPage(context, extensionId);
  await setConsent(ext, 'citations', true);

  const page = await context.newPage();
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Cite this source' })
    .waitFor({ state: 'attached', timeout: 30000 });

  await page.keyboard.press('Alt+C');
  await expect(page.locator('.assist-action-tray')).toContainText(/saved|added/i, {
    timeout: 15000,
  });

  const library = await context.newPage();
  await library.goto(LIBRARY(extensionId));
  const card = library.getByText('Array programming with NumPy').first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(library.getByText(/Harris/).first()).toBeVisible();
  await expect(library.getByText(/Nature/).first()).toBeVisible();

  await library.reload();
  await expect(library.getByText('Array programming with NumPy').first()).toBeVisible({
    timeout: 15000,
  });
});
