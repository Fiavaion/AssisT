/**
 * @jest-environment jsdom
 *
 * The AI setup page records consent to a cloud AI provider at the moment the student saves its key
 * (ADR 0006), beside wording that names the provider and says what is sent. Only a key the worker
 * actually stored counts: a failed save records nothing.
 *
 * Anthropic, OpenAI, Google Gemini (ADR 0007) and Perplexity are optional host permissions: the
 * click that saves one of their keys asks Chrome for the provider's host before anything is
 * awaited, and a refusal saves nothing.
 */

import fs from 'fs';
import path from 'path';
import { getConsent, DESTINATIONS } from '../../../../src/utils/consent.js';

const HTML = fs.readFileSync(
  path.join(__dirname, '../../../../src/pages/ai-setup/ai-setup.html'),
  'utf8'
);

let stored;
let saveReply;

async function waitFor(condition, timeoutMs = 2000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** jest.config has resetMocks: true, so the stubs are installed again before every test. */
function installChromeStubs() {
  chrome.permissions = {
    request: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
  };
  chrome.storage.local.get = jest.fn((key, callback) => {
    const keys = key === null ? Object.keys(stored) : Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) {
      if (k in stored) {
        out[k] = JSON.parse(JSON.stringify(stored[k]));
      }
    }
    if (typeof callback === 'function') {
      callback(out);
      return undefined;
    }
    return Promise.resolve(out);
  });
  chrome.storage.local.set = jest.fn(async values => {
    Object.assign(stored, JSON.parse(JSON.stringify(values)));
  });
  chrome.runtime.sendMessage = jest.fn((message, callback) => {
    if (message && message.action === 'SAVE_API_KEY' && typeof callback === 'function') {
      callback(saveReply);
      return undefined;
    }
    if (typeof callback === 'function') {
      callback({});
      return undefined;
    }
    return Promise.resolve({});
  });
}

beforeAll(async () => {
  document.body.innerHTML = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>')).replace(
    /<body[^>]*>/,
    ''
  );
  stored = { aiMode: 'cloud' };
  installChromeStubs();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  await import('../../../../src/pages/ai-setup/ai-setup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 20));
});

beforeEach(() => {
  installChromeStubs();
  Object.keys(stored)
    .filter(key => key.startsWith('assist_consent_'))
    .forEach(key => delete stored[key]);
});

function useProvider(provider) {
  const select = document.getElementById('cloud-provider-select');
  select.value = provider;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function saveKey(key) {
  document.getElementById('api-key-input').value = key;
  document
    .getElementById('btn-verify-key')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('the AI setup page and cloud AI consent', () => {
  it('names the chosen provider, and what is sent to it, beside the key', () => {
    useProvider('perplexity');
    const note = document.getElementById('cloud-consent-note');
    expect(note.textContent).toContain(DESTINATIONS.perplexity.service);
    expect(note.textContent).toMatch(/text you ask about/);
    expect(document.getElementById('api-key-input').getAttribute('aria-describedby')).toContain(
      'cloud-consent-note'
    );
  });

  it('records consent to that provider once its key is stored', async () => {
    saveReply = { success: true };
    useProvider('anthropic');
    saveKey('sk-ant-test-0005');
    await waitFor(async () => (await getConsent('anthropic')) === 'granted');
    await expect(getConsent('openai')).resolves.toBe('unasked');
  });

  it('asks Chrome for the provider host inside the click that saves the key', async () => {
    saveReply = { success: true };
    useProvider('perplexity');
    saveKey('pplx-test-0008');
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.perplexity.ai/*'],
    });
    await waitFor(async () => (await getConsent('perplexity')) === 'granted');
  });

  it('asks Chrome for the Google Gemini host inside the click that saves its key (ADR 0007)', async () => {
    saveReply = { success: true };
    useProvider('google');
    saveKey('AIza-test-0010');
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
    await waitFor(async () => (await getConsent('google')) === 'granted');
  });

  it('saves nothing and records nothing when Chrome is refused', async () => {
    saveReply = { success: true };
    chrome.permissions.request.mockResolvedValue(false);
    chrome.permissions.contains.mockResolvedValue(false);
    useProvider('anthropic');
    saveKey('sk-ant-test-0009');
    await waitFor(async () =>
      /Chrome did not give AssisT access/.test(
        document.getElementById('api-key-status').textContent
      )
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(
      chrome.runtime.sendMessage.mock.calls.some(([message]) => message.action === 'SAVE_API_KEY')
    ).toBe(false);
    await expect(getConsent('anthropic')).resolves.toBe('unasked');
  });

  it('records nothing when the key could not be stored', async () => {
    saveReply = { success: false, error: 'The key could not be stored' };
    useProvider('openai');
    saveKey('sk-openai-test-0006');
    await waitFor(async () =>
      chrome.runtime.sendMessage.mock.calls.some(
        ([message]) => message.action === 'SAVE_API_KEY' && message.provider === 'openai'
      )
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(getConsent('openai')).resolves.toBe('unasked');
  });
});
