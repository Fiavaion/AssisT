/**
 * @jest-environment jsdom
 *
 * "Your data" in Advanced Options (ADR 0006): what AssisT may send, and the AI keys it keeps.
 *
 * A student has to be able to see every answer they gave, change it with an effect that starts at
 * once, and remove a stored AI key, which until now nothing could do: saving an empty key was
 * refused and no remove control existed. Removing a key is proven against the real key storage,
 * encrypted with Node's Web Crypto, not against a stub that would pass whatever it was asked.
 */

import { webcrypto } from 'crypto';
import { renderYourData } from '../../../src/popup/your-data.js';
import {
  saveSecureAPIKey,
  getSecureAPIKey,
} from '../../../src/core/storage/secure-key-storage.js';
import { consentStorageKey, DESTINATIONS, getConsent } from '../../../src/utils/consent.js';

const SEMANTIC_SCHOLAR = 'https://api.semanticscholar.org/*';

let store;
let realCrypto;

beforeAll(() => {
  realCrypto = global.crypto;
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
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
    const list = Array.isArray(keys) ? keys : [keys];
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
  global.fetch = jest.fn();
  document.body.innerHTML = '<div id="panel"></div>';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
/** The live region is written a moment after it is cleared, so a repeat is read out again. */
const announced = () => new Promise(resolve => setTimeout(resolve, 40));

function consentAt(destination, granted) {
  store[consentStorageKey(destination)] = { granted, at: '2026-09-25T10:00:00.000Z' };
}

async function render(options) {
  const panel = document.getElementById('panel');
  await renderYourData(panel, options);
  return panel;
}

function groupFor(panel, destination) {
  return panel.querySelector(`fieldset[data-destination="${destination}"]`);
}

function choose(panel, destination, allow) {
  const radio = groupFor(panel, destination).querySelector(
    `input[value="${allow ? 'allow' : 'decline'}"]`
  );
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('what the student has allowed', () => {
  it('lists every destination with its current answer in words', async () => {
    consentAt('dictionary', true);
    consentAt('translation', false);
    const panel = await render();

    for (const destination of Object.keys(DESTINATIONS)) {
      expect(groupFor(panel, destination)).not.toBeNull();
    }
    expect(groupFor(panel, 'dictionary').textContent).toContain('Allowed');
    expect(groupFor(panel, 'translation').textContent).toContain('Not allowed');
    expect(groupFor(panel, 'citations').textContent).toContain('Not asked yet');
    expect(groupFor(panel, 'dictionary').querySelector('input[value="allow"]').checked).toBe(true);
    expect(groupFor(panel, 'citations').querySelector('input:checked')).toBeNull();
  });

  // MyMemory and Google speech recognition each answer two questions; titled by service alone,
  // the two rows looked like the same question twice.
  it('titles each service with what it is used for, so no two titles match', async () => {
    const panel = await render();
    const titles = [...panel.querySelectorAll('legend')].map(legend => legend.textContent);
    expect(groupFor(panel, 'pageTranslation').querySelector('legend').textContent).toBe(
      'MyMemory: translate the whole page'
    );
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('withdraws at once when the student switches an answer to no', async () => {
    consentAt('dictionary', true);
    const panel = await render();
    choose(panel, 'dictionary', false);
    await settle();

    await expect(getConsent('dictionary')).resolves.toBe('declined');
    expect(groupFor(panel, 'dictionary').textContent).toContain('Not allowed');
    await announced();
    expect(panel.querySelector('[role="status"]').textContent).toMatch(/Free Dictionary/);
  });

  it('records a yes at once when the student allows a service', async () => {
    const panel = await render();
    choose(panel, 'translation', true);
    await settle();
    await expect(getConsent('translation')).resolves.toBe('granted');
  });

  it('asks Chrome for Semantic Scholar in the same tick as the change, and records the yes', async () => {
    const panel = await render();
    choose(panel, 'citationVerification', true);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
    await settle();
    await expect(getConsent('citationVerification')).resolves.toBe('granted');
  });

  it('records a no, and shows it, when the Chrome prompt is refused', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    const panel = await render();
    choose(panel, 'citationVerification', true);
    await settle();
    await settle();

    await expect(getConsent('citationVerification')).resolves.toBe('declined');
    const group = groupFor(panel, 'citationVerification');
    expect(group.querySelector('input[value="decline"]').checked).toBe(true);
    expect(group.textContent).toContain('Not allowed');
  });

  it('records the answer before it asks Chrome, so a prompt that closes the popup loses nothing', async () => {
    chrome.permissions.request.mockImplementation(() => new Promise(() => {}));
    const panel = await render();
    choose(panel, 'citationVerification', true);
    // Written in the same tick as the change, before Chrome was asked.
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [consentStorageKey('citationVerification')]: { granted: true, at: expect.any(String) },
    });
    expect(chrome.permissions.request.mock.invocationCallOrder[0]).toBeGreaterThan(
      chrome.storage.local.set.mock.invocationCallOrder[0]
    );
    await settle();
    await expect(getConsent('citationVerification')).resolves.toBe('granted');
  });

  it('turns Verify citations online off when Semantic Scholar is not allowed, so the two agree', async () => {
    consentAt('citationVerification', true);
    store.assist_settings = { citation: { enabled: true, verifyOnline: true } };
    store.citationAnalyzerSettings = { verifyOnline: true, depth: 'quick' };
    const onVerifyOnlineOff = jest.fn();
    const panel = await render({ onVerifyOnlineOff });

    choose(panel, 'citationVerification', false);
    await settle();
    await settle();

    expect(store.assist_settings.citation).toEqual({ enabled: true, verifyOnline: false });
    expect(store.citationAnalyzerSettings).toEqual({ verifyOnline: false, depth: 'quick' });
    expect(onVerifyOnlineOff).toHaveBeenCalledTimes(1);
  });

  it('lists dictation and whole-page translation, each with its own answer', async () => {
    const panel = await render();
    expect(groupFor(panel, 'dictation').textContent).toMatch(/voice/);
    expect(groupFor(panel, 'dictation').textContent).toMatch(/Google/);
    expect(groupFor(panel, 'pageTranslation').textContent).toMatch(/whole page/);
  });

  it('lists lecture capture on its own, saying it sends other people’s voices too', async () => {
    const panel = await render();
    expect(groupFor(panel, 'lectureCapture').textContent).toMatch(/other people/);
    expect(groupFor(panel, 'lectureCapture').textContent).toMatch(/Google/);
  });

  it('gives Semantic Scholar its host permission back when the student withdraws', async () => {
    consentAt('citationVerification', true);
    const panel = await render();
    choose(panel, 'citationVerification', false);
    await settle();
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
  });

  it('sends nothing: changing an answer only records it', async () => {
    const panel = await render();
    choose(panel, 'dictionary', true);
    choose(panel, 'translation', false);
    await settle();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('saved AI keys', () => {
  it('says so when there are none', async () => {
    const panel = await render();
    expect(panel.querySelector('[data-your-data="keys"]').textContent).toMatch(
      /No AI keys are saved/
    );
  });

  it('lists each provider with a saved key, and never shows the key', async () => {
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0001');
    await saveSecureAPIKey('openai', 'sk-openai-test-0002');
    const panel = await render();
    const keys = panel.querySelector('[data-your-data="keys"]');
    expect(keys.textContent).toContain(DESTINATIONS.anthropic.service);
    expect(keys.textContent).toContain(DESTINATIONS.openai.service);
    expect(panel.innerHTML).not.toContain('sk-ant-test-0001');
    expect(panel.innerHTML).not.toContain(store.secure_apikey_anthropic.encrypted);
  });

  it('asks before removing, saying what will stop working, and keeps the key on Keep', async () => {
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0001');
    store.aiMode = 'cloud';
    store.cloudProvider = 'anthropic';
    const panel = await render();
    const remove = panel.querySelector('button[data-remove-key="anthropic"]');
    remove.focus();
    press(remove);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toMatch(/stop working/);
    expect(dialog.textContent).toContain(DESTINATIONS.anthropic.service);
    expect(dialog.textContent).toMatch(/AssisT uses now/);

    press([...dialog.querySelectorAll('button')].find(b => /Keep/.test(b.textContent)));
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await expect(getSecureAPIKey('anthropic')).resolves.toBe('sk-ant-test-0001');
    expect(document.activeElement).toBe(remove);
  });

  it('deletes the key from storage when the student confirms', async () => {
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0001');
    await saveSecureAPIKey('openai', 'sk-openai-test-0002');
    const panel = await render();
    press(panel.querySelector('button[data-remove-key="anthropic"]'));
    const dialog = document.querySelector('[role="dialog"]');
    press([...dialog.querySelectorAll('button')].find(b => /Remove/.test(b.textContent)));
    await settle();
    await settle();

    expect('secure_apikey_anthropic' in store).toBe(false);
    await expect(getSecureAPIKey('anthropic')).resolves.toBeNull();
    await expect(getSecureAPIKey('openai')).resolves.toBe('sk-openai-test-0002');
    expect(panel.querySelector('button[data-remove-key="anthropic"]')).toBeNull();
    await announced();
    expect(panel.querySelector('[role="status"]').textContent).toMatch(/removed/i);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('records removing a key as a no to that provider, and shows it at once', async () => {
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0001');
    consentAt('anthropic', true);
    consentAt('openai', true);
    const panel = await render();
    expect(groupFor(panel, 'anthropic').textContent).toContain('Now: Allowed');

    press(panel.querySelector('button[data-remove-key="anthropic"]'));
    const dialog = document.querySelector('[role="dialog"]');
    press([...dialog.querySelectorAll('button')].find(b => /Remove/.test(b.textContent)));
    await settle();
    await settle();

    await expect(getConsent('anthropic')).resolves.toBe('declined');
    await expect(getConsent('openai')).resolves.toBe('granted');
    expect(groupFor(panel, 'anthropic').textContent).toContain('Now: Not allowed');
  });

  it('closes the question on Escape without removing anything', async () => {
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0001');
    const panel = await render();
    press(panel.querySelector('button[data-remove-key="anthropic"]'));
    const dialog = document.querySelector('[role="dialog"]');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await expect(getSecureAPIKey('anthropic')).resolves.toBe('sk-ant-test-0001');
  });

  it('removes from the keyboard: Enter on the remove button opens the question', async () => {
    await saveSecureAPIKey('openai', 'sk-openai-test-0002');
    const panel = await render();
    panel
      .querySelector('button[data-remove-key="openai"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
