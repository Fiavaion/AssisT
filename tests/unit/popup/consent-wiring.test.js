/**
 * @jest-environment jsdom
 *
 * Where the popup meets consent (ADR 0006):
 *   - Advanced Options has a "Your data" tab, reached by the gear on both layouts;
 *   - "Verify citations online" saves the student's choice first, then asks Chrome for Semantic
 *     Scholar's optional host permission from the switch itself (the only place a user gesture
 *     exists): Chrome's prompt can close the popup, and the choice must survive that. A refusal
 *     while the popup is still open turns it back off; switching off gives the permission back;
 *   - saving a cloud AI key is the moment consent to that provider is recorded, beside wording
 *     that names the provider and says what is sent.
 */

import fs from 'fs';
import path from 'path';
import { webcrypto } from 'crypto';
import { getConsent, DESTINATIONS } from '../../../src/utils/consent.js';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');
const SEMANTIC_SCHOLAR = 'https://api.semanticscholar.org/*';

let PopupController;
let store;
let realCrypto;

beforeAll(async () => {
  realCrypto = global.crypto;
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

afterAll(() => {
  Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true });
  delete chrome.permissions;
});

beforeEach(() => {
  store = {};
  chrome.storage.local.get = jest.fn(async keys => {
    if (keys === null || keys === undefined) {
      return JSON.parse(JSON.stringify(store));
    }
    const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const out = {};
    for (const k of list) {
      if (k in store) {
        out[k] = JSON.parse(JSON.stringify(store[k]));
      }
    }
    return out;
  });
  chrome.storage.local.set = jest.fn(async values => {
    Object.assign(store, JSON.parse(JSON.stringify(values)));
  });
  chrome.storage.local.remove = jest.fn(async keys => {
    for (const k of [].concat(keys)) {
      delete store[k];
    }
  });
  chrome.permissions = {
    request: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
  };
  chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Encrypting a key runs PBKDF2, which takes real time: wait for the status line to say so. */
async function waitFor(condition, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function mountPopup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  const popup = new PopupController();
  popup.settings = { citation: {} };
  return popup;
}

describe('the Your data tab', () => {
  it('is a tab of Advanced Options with its own panel, and lists the services when opened', async () => {
    const popup = mountPopup();
    popup.showAdvancedOptions('your-data');
    const tab = document.querySelector('.modal-tab[data-tab="your-data"]');
    expect(tab).not.toBeNull();
    expect(tab.textContent).toBe('Your data');
    expect(tab.getAttribute('aria-selected')).toBe('true');
    const panel = document.getElementById('tab-your-data');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    await settle();
    await settle();
    expect(panel.textContent).toContain(DESTINATIONS.dictionary.service);
    expect(panel.querySelector('[data-your-data="keys"]')).not.toBeNull();
  });
});

describe('the Verify citations online switch', () => {
  function flip(on) {
    const input = document.getElementById('citation-verify-online');
    input.checked = on;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input;
  }

  it('saves the choice first, then asks Chrome for Semantic Scholar in the same tick', async () => {
    const order = [];
    const get = chrome.storage.local.get;
    chrome.storage.local.get = jest.fn(keys => {
      order.push('storage');
      return get(keys);
    });
    chrome.permissions.request.mockImplementation(async () => {
      order.push('permission');
      return true;
    });
    const popup = mountPopup();
    popup.setupEventListeners();
    flip(true);
    expect(order[0]).toBe('storage');
    expect(order).toContain('permission');
    expect(popup.settings.citation.verifyOnline).toBe(true);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
    await settle();
    await settle();
    expect(store.citationAnalyzerSettings).toEqual({ verifyOnline: true });
  });

  it('keeps the choice when Chrome’s prompt closes the popup and never answers', async () => {
    chrome.permissions.request.mockImplementation(() => new Promise(() => {}));
    const popup = mountPopup();
    popup.setupEventListeners();
    flip(true);
    await settle();
    await settle();
    expect(store.citationAnalyzerSettings).toEqual({ verifyOnline: true });
    expect(store.assist_settings.citation.verifyOnline).toBe(true);
  });

  it('goes back off, and says why, when Chrome is refused while the popup is open', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    const popup = mountPopup();
    popup.setupEventListeners();
    const input = flip(true);
    await settle();
    await settle();
    await settle();
    expect(input.checked).toBe(false);
    expect(store.citationAnalyzerSettings).toEqual({ verifyOnline: false });
    expect(popup.settings.citation.verifyOnline).toBe(false);
    expect(document.getElementById('status-indicator').textContent).toMatch(/Semantic Scholar/);
  });

  it('gives the permission back when switched off', async () => {
    const popup = mountPopup();
    popup.settings.citation.verifyOnline = true;
    popup.setupEventListeners();
    flip(false);
    await settle();
    await settle();
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
    expect(store.citationAnalyzerSettings).toEqual({ verifyOnline: false });
  });
});

describe('saving a cloud AI key', () => {
  beforeEach(() => {
    // The key is saved by the service worker, which outlives the popup.
    chrome.runtime.sendMessage = jest.fn(async message =>
      message.action === 'SAVE_API_KEY' ? { success: true } : {}
    );
  });

  async function cloudPanel(provider) {
    store.cloudProvider = provider;
    const popup = mountPopup();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await popup._renderCloudPanel(container, true);
    return container;
  }

  it('says, beside the key, which provider the text goes to', async () => {
    const container = await cloudPanel('openai');
    const note = container.querySelector('[data-cloud-consent-note]');
    expect(note.textContent).toContain(DESTINATIONS.openai.service);
    expect(note.textContent).toMatch(/text you ask about/);
  });

  it('records consent to that provider when the key is saved', async () => {
    const container = await cloudPanel('openai');
    await expect(getConsent('openai')).resolves.toBe('unasked');
    container.querySelector('.ai-panel-key-input').value = 'sk-openai-test-0003';
    container
      .querySelector('.ai-panel-save-btn')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await waitFor(() => /saved/i.test(container.querySelector('.ai-panel-status').textContent));
    await expect(getConsent('openai')).resolves.toBe('granted');
    await expect(getConsent('anthropic')).resolves.toBe('unasked');
  });

  it('records nothing when no key was entered', async () => {
    const container = await cloudPanel('openai');
    container
      .querySelector('.ai-panel-save-btn')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await settle();
    await expect(getConsent('openai')).resolves.toBe('unasked');
  });

  it('updates the wording when the student picks another provider, without recording consent', async () => {
    const container = await cloudPanel('openai');
    const select = container.querySelector('select.ai-panel-select');
    select.value = 'perplexity';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(container.querySelector('[data-cloud-consent-note]').textContent).toContain(
      DESTINATIONS.perplexity.service
    );
    await expect(getConsent('perplexity')).resolves.toBe('unasked');
  });
});
