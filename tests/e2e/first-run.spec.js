/**
 * First run: a fresh profile gets the welcome front door, where AI setup and Discover your tools
 * are two of the guides on offer, rather than the AI-setup wizard on its own.
 */

import { test, expect } from './extension-fixture.js';

test.use({ keepWelcomeTab: true });

test('a fresh install opens the welcome front door', async ({ context, extensionId }) => {
  await expect
    .poll(() => context.pages().map(p => p.url()), { timeout: 15000 })
    .toContain(`chrome-extension://${extensionId}/src/pages/welcome/welcome.html`);

  const urls = context.pages().map(p => p.url());
  expect(urls.some(u => u.endsWith('/src/pages/ai-setup/ai-setup.html'))).toBe(false);

  const welcome = context.pages().find(p => p.url().endsWith('/welcome.html'));
  await expect(welcome.getByText('AI setup', { exact: true })).toBeVisible();
  await expect(welcome.getByText('Discover your tools', { exact: true })).toBeVisible();
});
