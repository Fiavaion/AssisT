/**
 * Several citations at once: select all shown, remove them to the trash with one undo, and bring
 * them all back. Keyboard focus must never fall off the page while this happens.
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

test('select all shown, remove in one go, and undo brings every one back', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
  await page.evaluate(async recs => {
    for (const r of recs) {
      await chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: 'CIT_ADD', args: [r] });
    }
  }, ['Alpha source', 'Beta source', 'Gamma source'].map(record));
  await page.reload();
  await expect(page.getByText('Gamma source', { exact: true }).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole('checkbox', { name: /select all shown/i }).check();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/3 selected/);

  await bar.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: /recently removed \(3\)/i })).toBeVisible();
  const active = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  expect(active).not.toBe('BODY');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: /recently removed \(0\)/i })).toBeVisible();
  await expect(page.getByText('Alpha source', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Gamma source', { exact: true }).first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  await page.close();
});
