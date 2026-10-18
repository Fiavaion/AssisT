/**
 * @jest-environment jsdom
 *
 * Institution branding paint-through on the full-page library: a verified branding object must
 * paint the subtitle, the logo, and AA-safe accent tokens — and clearing the key must reset all
 * three live. The resolver is mocked (crypto is covered by the institution suite); this asserts
 * the page-side wiring.
 */

import 'fake-indexeddb/auto';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

// Mounting the whole page cold over fake IndexedDB is slow when the full suite runs in
// parallel; this budgets the harness, not the product.
jest.setTimeout(30000);
import { contrastRatio, LIBRARY_SURFACES } from '../../../src/features/institution/institution-theme.js';

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));

let mockBranding = null;
let keyChangeListener = null;
jest.mock('../../../src/features/institution/institution-resolver.js', () => ({
  resolveInstitutionBranding: jest.fn(async () => mockBranding),
  onInstitutionKeyChanged: jest.fn(listener => {
    keyChangeListener = listener;
    return () => {};
  }),
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

const BRANDED = {
  institutionId: 'ncad',
  name: 'National College of Art and Design',
  accent: '#5d7d86', // deliberately FAILS AA on white — the page must darken it, not trust it
  accentSecondary: null,
  logo: 'https://example.edu/logo.png',
  lmsDomain: null,
};

describe('full-page library institution branding', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = SKELETON;
    document.documentElement.style.cssText = '';
    keyChangeListener = null;
    chrome.runtime.sendMessage.mockResolvedValue({});
    installCitationRpcBridge();
  });

  afterEach(async () => {
    await clearCitations();
  });

  it('paints subtitle, logo, and AA-safe accent tokens for a branded install', async () => {
    mockBranding = { ...BRANDED };
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    // Subtitle names the institution.
    const sub = document.querySelector('.assist-lib-header__brandsub');
    expect(sub).toBeTruthy();
    expect(sub.textContent).toBe(BRANDED.name);

    // Logo image replaces the glyph, decorative, referrer-safe.
    const img = document.querySelector('.assist-lib-header__logo img.assist-lib-header__brandlogo');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(BRANDED.logo);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.referrerPolicy).toBe('no-referrer');

    // Accent tokens painted — and NOT the raw key value, because #5d7d86 fails AA; it must have
    // been darkened until it clears 4.5:1 on every library surface.
    const accent = document.documentElement.style.getPropertyValue('--accent').trim();
    expect(accent).toBeTruthy();
    expect(accent).not.toBe(BRANDED.accent);
    for (const bg of LIBRARY_SURFACES) {
      expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(document.documentElement.style.getPropertyValue('--accent-2').trim()).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('0.12');
  });

  it('stays fully generic when no branding resolves (public build byte-identical)', async () => {
    mockBranding = null;
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    expect(document.querySelector('.assist-lib-header__brandsub')).toBeNull();
    expect(document.querySelector('.assist-lib-header__brandlogo')).toBeNull();
    expect(document.querySelector('.assist-lib-header__logo').textContent).toBe('“');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('resets subtitle, logo, and tokens live when the key is cleared', async () => {
    mockBranding = { ...BRANDED };
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();
    expect(document.querySelector('.assist-lib-header__brandsub')).toBeTruthy();
    expect(keyChangeListener).toBeInstanceOf(Function);

    // Simulate popup "Clear" → resolver now yields generic → listener repaints everything.
    mockBranding = null;
    await keyChangeListener();

    expect(document.querySelector('.assist-lib-header__brandsub')).toBeNull();
    expect(document.querySelector('.assist-lib-header__brandlogo')).toBeNull();
    expect(document.querySelector('.assist-lib-header__logo').textContent).toBe('“');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('applies branding live when a key is pasted into an already-open library', async () => {
    mockBranding = null;
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();
    expect(document.querySelector('.assist-lib-header__brandsub')).toBeNull();

    mockBranding = { ...BRANDED };
    await keyChangeListener();

    expect(document.querySelector('.assist-lib-header__brandsub')).toBeTruthy();
    expect(document.querySelector('.assist-lib-header__brandlogo')).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--accent').trim()).toBeTruthy();
  });
});
