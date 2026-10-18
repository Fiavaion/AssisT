/**
 * The citation library, from a cold start.
 *
 * On a fresh profile the offscreen document that owns the citation database does not exist yet.
 * The library's first requests create it, and they must survive the gap between the document
 * existing and its listener being bound. Before the ready handshake, a fresh install saw
 * "Sorry — the citation library could not load" every time.
 */

import { test, expect } from './extension-fixture.js';

const LIBRARY = extensionId => `chrome-extension://${extensionId}/src/pages/citation-library/library.html`;

test.describe('citation library', () => {
  test('opens on a fresh profile and shows the empty library, not the failure notice', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') {
        errors.push(m.text());
      }
    });

    await page.goto(LIBRARY(extensionId));

    await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('could not load')).toHaveCount(0);
    expect(errors.filter(e => /Receiving end|failed to start/.test(e))).toEqual([]);
  });

  test('a second tab on the same library loads, and sees a record saved in the first without a reload', async ({
    context,
    extensionId,
  }) => {
    const first = await context.newPage();
    await first.goto(LIBRARY(extensionId));
    await expect(first.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });

    const second = await context.newPage();
    await second.goto(LIBRARY(extensionId));
    await expect(second.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });

    await first.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'CITATION_DB_OP',
        op: 'CIT_ADD',
        args: [
          {
            type: 'website',
            url: 'https://example.org/live',
            title: 'Saved in the other tab',
            authors: ['Example, Eve'],
            publicationDate: '2024',
            accessDate: '2026-09-04',
            extra: {},
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      })
    );
    await expect(second.getByText('Saved in the other tab').first()).toBeVisible({ timeout: 10000 });
  });

  test('records survive the offscreen document being torn down', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(LIBRARY(extensionId));
    await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
    await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'CITATION_DB_OP',
        op: 'CIT_ADD',
        args: [
          {
            type: 'website',
            url: 'https://example.org/durable',
            title: 'Still here after a reload',
            authors: ['Example, Eve'],
            publicationDate: '2024',
            accessDate: '2026-09-04',
            extra: {},
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      })
    );
    await expect(page.getByText('Still here after a reload').first()).toBeVisible({ timeout: 10000 });

    // Chrome tears the offscreen document down when it is idle. The database outlives it and
    // the next request must recreate it and wait for it to listen, exactly as on a cold start.
    await page.close();
    const [worker] = context.serviceWorkers();
    await worker.evaluate(() => chrome.offscreen.closeDocument());
    await new Promise(resolve => setTimeout(resolve, 500));

    const after = await context.newPage();
    await after.goto(LIBRARY(extensionId));
    await expect(after.getByText('Still here after a reload').first()).toBeVisible({ timeout: 15000 });
  });
});
