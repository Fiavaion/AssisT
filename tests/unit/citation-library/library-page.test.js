/**
 * @jest-environment jsdom
 *
 * Integration smoke for the full-page citation library bootstrap.
 *
 * Mounts the REAL library.js entry in jsdom with the citation RPC bridge simulating the offscreen
 * store, and asserts the page comes up: header actions, the collections/tags sidebar, and the library
 * view all mount without throwing. This is NOT a Chrome gate — no real paint, no chrome.tabs, no
 * screen reader — but it catches mount-time crashes and wiring/structure regressions.
 */

import fs from 'fs';
import path from 'path';
import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { EXPORT_FORMATS } from '../../../src/features/citations/citation-export.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

// Mounting the whole page cold over fake IndexedDB is slow when the full suite runs in
// parallel; this budgets the harness, not the product.
jest.setTimeout(30000);

// AI off — keeps the sentinel/analyser (and any network) out of the mount path.
jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));

const SKELETON = `
  <a class="assist-lib-skip" href="#assist-lib-main">Skip</a>
  <header class="assist-lib-header" id="assist-lib-header"></header>
  <div class="assist-lib-layout">
    <div id="assist-lib-sidebar-host"></div>
    <main id="assist-lib-main" class="assist-lib-main" tabindex="-1" aria-label="Your citations">
      <p id="assist-lib-loading">Loading…</p>
    </main>
  </div>`;

/** Wait (real timers) for main()'s async chain — store.init reads fake-indexeddb, which is async. */
// The page is mounted when its loading line is gone. Wait on that, with a budget generous enough
// for a full parallel suite (the old 4s gave up quietly under load and the test failed later, on
// a half-mounted page). A page that never mounts fails here, saying so.
async function waitForMount(timeoutMs = 20000) {
  const start = Date.now();
  while (document.getElementById('assist-lib-loading')) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('the library page never finished mounting');
    }
    await new Promise(r => setTimeout(r, 25));
  }
}

describe('full-page library bootstrap (jsdom smoke)', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = SKELETON;
    chrome.runtime.sendMessage.mockResolvedValue({});
    installCitationRpcBridge();
  });

  afterEach(async () => {
    await clearCitations();
  });

  it('mounts the header, sidebar, and library view without throwing', async () => {
    await CitationStorage.add({ title: 'Seed', url: 'https://x', authors: ['A'], tags: ['t'] });

    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    // Loading placeholder removed.
    expect(document.getElementById('assist-lib-loading')).toBeNull();

    // Header actions present and labelled.
    const header = document.getElementById('assist-lib-header');
    const importBtn = [...header.querySelectorAll('button')].find(b => /import/i.test(b.textContent));
    const dedupeBtn = [...header.querySelectorAll('button')].find(b => /duplicate/i.test(b.textContent));
    expect(importBtn).toBeTruthy();
    expect(dedupeBtn).toBeTruthy();

    // Export menu offers exactly the shared format list — the selection bar builds its menu from
    // the same constant, so the two can never drift apart.
    const select = header.querySelector('select');
    expect(select).toBeTruthy();
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual(EXPORT_FORMATS);

    // Sidebar (labelled nav landmark) mounted.
    const nav = document.querySelector('#assist-lib-sidebar-host nav.assist-lib-sidebar');
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('aria-label')).toMatch(/collections/i);

    // Library view mounted into main.
    const main = document.getElementById('assist-lib-main');
    expect(main.querySelector('.assist-cite-library, .assist-cite-toolbar, input')).toBeTruthy();
  });

  it('keeps Help as the last thing in the header once the actions are built (SC 3.2.6)', async () => {
    // The real page markup this time: the Help link is static in the header, and the brand and the
    // actions are built around it. Appending them after it would put Help first in the tab order
    // while it still looks last.
    const page = fs.readFileSync(
      path.join(__dirname, '../../../src/pages/citation-library/library.html'),
      'utf8'
    );
    document.body.innerHTML = page
      .slice(page.indexOf('<body>') + 6, page.indexOf('</body>'))
      .replace(/<script[\s\S]*?<\/script>/g, '');

    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    const header = document.getElementById('assist-lib-header');
    const help = header.querySelector('[data-destination="help"]');
    expect(help).toBeTruthy();
    expect(header.firstElementChild.className).toBe('assist-lib-header__brand');
    expect(header.lastElementChild).toBe(help);
  });

  it('gives Import one Tab stop: the button, not the hidden input it drives', async () => {
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    const fileInput = document.getElementById('assist-lib-import-input');
    expect(fileInput).toBeTruthy();
    // Out of the tab order, but still named and still reachable programmatically by the button.
    expect(fileInput.tabIndex).toBe(-1);
    expect(fileInput.getAttribute('aria-label')).toMatch(/import citations/i);
  });
});
