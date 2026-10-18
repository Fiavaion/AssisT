/**
 * A removed citation is never lost by accident: it waits in Recently removed, comes back with
 * Restore, and only Empty trash asks first.
 */

import { test, expect } from './extension-fixture.js';

const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

function record(title) {
  const now = Date.now();
  return {
    type: 'website',
    url: `https://example.org/${encodeURIComponent(title)}`,
    title,
    authors: ['Example, Eve'],
    publicationDate: '2024',
    accessDate: '2026-09-04',
    extra: {},
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function openWith(context, extensionId, titles) {
  const page = await context.newPage();
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
  await page.evaluate(async recs => {
    for (const r of recs) {
      await chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: 'CIT_ADD', args: [r] });
    }
  }, titles.map(record));
  await page.reload();
  await expect(page.getByText(titles[0], { exact: true }).first()).toBeVisible({ timeout: 15000 });
  return page;
}

test('two quick removals both wait in Recently removed, and Restore brings one back', async ({
  context,
  extensionId,
}) => {
  const page = await openWith(context, extensionId, ['First source', 'Second source']);

  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await page.waitForTimeout(600);

  await expect(page.getByRole('heading', { name: 'First source', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Second source', exact: true })).toHaveCount(0);
  const trashEntry = page.getByRole('button', { name: /recently removed \(2\)/i });
  await expect(trashEntry).toBeVisible();

  await trashEntry.click();
  await expect(page.getByRole('heading', { name: 'First source', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Second source', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy reference' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  await page.waitForTimeout(600);
  await expect(page.getByRole('button', { name: /recently removed \(1\)/i })).toBeVisible();

  await page.getByRole('button', { name: /back to your library/i }).click();
  await expect(page.getByText(/source/).first()).toBeVisible();
  await page.close();
});

test('Empty trash asks first, then the trash is gone for good', async ({ context, extensionId }) => {
  const page = await openWith(context, extensionId, ['Doomed source']);
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /recently removed \(1\)/i }).click();

  let asked = false;
  page.once('dialog', d => {
    asked = true;
    d.accept();
  });
  await page.getByRole('button', { name: /empty trash/i }).click();
  await page.waitForTimeout(600);
  expect(asked).toBe(true);
  await expect(page.getByText('Doomed source', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /recently removed \(0\)/i })).toBeVisible();
  await page.close();
});
