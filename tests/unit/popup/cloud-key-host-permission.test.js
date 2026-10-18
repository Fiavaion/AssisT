/**
 * @jest-environment jsdom
 *
 * The popup's cloud AI panel is where the student's yes to a provider is given (ADR 0006): by
 * saving a key, or by pressing "Allow access to <provider>", beside wording that names the provider
 * and what is sent. Anthropic, OpenAI, Google Gemini and Perplexity are also optional host
 * permissions, which the same press asks Chrome for.
 *
 * Chrome's permission prompt can close the popup, and then a promise waiting on it never settles.
 * So the student's intent is persisted FIRST, in the same tick as the press (the key goes to the
 * service worker, which outlives the popup, and the yes is written), and only then is Chrome asked.
 * The router refuses a provider whose permission is not held, and says how to allow it, so a yes
 * recorded without the permission sends nothing.
 */

jest.mock('../../../src/core/storage/secure-key-storage.js', () => ({
  saveSecureAPIKey: jest.fn(),
  getSecureAPIKey: jest.fn(),
  hasSecureAPIKey: jest.fn(),
  listSecureAPIKeys: jest.fn(),
  deleteSecureAPIKey: jest.fn(),
}));

import { getSecureAPIKey } from '../../../src/core/storage/secure-key-storage.js';
import { consentStorageKey, getConsent, recordConsent } from '../../../src/utils/consent.js';

let PopupController;
let stored;
let order;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

beforeEach(() => {
  stored = {};
  order = [];
  chrome.storage.local.get = jest.fn(async keys => {
    const names = keys === null ? Object.keys(stored) : [].concat(keys);
    return Object.fromEntries(
      names.filter(key => key in stored).map(key => [key, structuredClone(stored[key])])
    );
  });
  chrome.storage.local.set = jest.fn(async items => {
    Object.keys(items).forEach(key => order.push(`set:${key}`));
    Object.assign(stored, structuredClone(items));
  });
  chrome.runtime.sendMessage = jest.fn(async message => {
    order.push(`message:${message.action || message.type}`);
    return message.action === 'SAVE_API_KEY' ? { success: true } : {};
  });
  chrome.permissions = {
    request: jest.fn(async () => {
      order.push('permission');
      return true;
    }),
    contains: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
  };
  getSecureAPIKey.mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  delete chrome.permissions;
});

async function settle() {
  for (let i = 0; i < 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function renderPanel(provider) {
  stored.cloudProvider = provider;
  document.body.innerHTML = '<div id="panel"></div>';
  const container = document.getElementById('panel');
  await new PopupController()._renderCloudPanel(container, false);
  return container;
}

function saveKey(container, key) {
  container.querySelector('.ai-panel-key-input').value = key;
  container
    .querySelector('.ai-panel-save-btn')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function statusText(container) {
  return container.querySelector('.ai-panel-status').textContent;
}

function allowButton(container) {
  return [...container.querySelectorAll('button')].find(
    b => !b.hidden && /Allow access/.test(b.textContent)
  );
}

const neverSettles = () => new Promise(() => {});

describe('saving a cloud AI key in the popup', () => {
  it('saves the key and records the yes before it asks Chrome, all within the press', async () => {
    const container = await renderPanel('anthropic');

    saveKey(container, 'sk-ant-test-0101');

    // Synchronously, before anything was awaited, and in this order.
    expect(order).toEqual([
      'message:SAVE_API_KEY',
      `set:${consentStorageKey('anthropic')}`,
      'permission',
    ]);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'SAVE_API_KEY',
      provider: 'anthropic',
      apiKey: 'sk-ant-test-0101',
    });
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.anthropic.com/*'],
    });
    await settle();
    await expect(getConsent('anthropic')).resolves.toBe('granted');
    expect(statusText(container)).toMatch(/Key saved/);
  });

  it('loses nothing when Chrome’s prompt closes the popup and never answers', async () => {
    chrome.permissions.request.mockImplementation(neverSettles);
    const container = await renderPanel('openai');

    saveKey(container, 'sk-openai-test-0102');
    await settle();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAVE_API_KEY', provider: 'openai' })
    );
    await expect(getConsent('openai')).resolves.toBe('granted');
  });

  it('keeps the key when Chrome is refused, and says how to finish', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    const container = await renderPanel('openai');

    saveKey(container, 'sk-openai-test-0103');
    await settle();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAVE_API_KEY', provider: 'openai' })
    );
    expect(statusText(container)).toMatch(/Chrome did not give AssisT access to OpenAI/);
    expect(allowButton(container).textContent).toBe('Allow access to OpenAI (ChatGPT)');
  });

  it('says so when the key could not be stored', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ success: false });
    const container = await renderPanel('google');

    saveKey(container, 'AIza-test-0104');
    await settle();

    expect(statusText(container)).toMatch(/Save failed/);
  });

  it('asks Chrome for the Google Gemini host in the same press, after the yes (ADR 0007)', async () => {
    const container = await renderPanel('google');

    saveKey(container, 'AIza-test-0105');

    expect(order).toEqual([
      'message:SAVE_API_KEY',
      `set:${consentStorageKey('google')}`,
      'permission',
    ]);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
    await settle();
    await expect(getConsent('google')).resolves.toBe('granted');
  });
});

describe('a Gemini user whose Chrome grant did not survive the update (ADR 0007)', () => {
  // Gemini's host moved from a required to an optional permission. Whether Chrome keeps the old
  // grant is not relied on either way: without it, the panel offers the button, not an error.
  it('shows "Allow access to Google Gemini" and says nothing can be sent yet', async () => {
    getSecureAPIKey.mockResolvedValue('AIza-stored');
    await recordConsent('google', true);
    chrome.permissions.contains.mockResolvedValue(false);
    const container = await renderPanel('google');
    await settle();

    const button = allowButton(container);
    expect(button).toBeDefined();
    expect(button.textContent).toBe('Allow access to Google Gemini');
    expect(statusText(container)).toMatch(
      /Chrome has not given AssisT access to Google Gemini, so nothing can be sent to it yet/
    );
  });

  it('the press asks Chrome for the Gemini host, and the button goes once it is given', async () => {
    getSecureAPIKey.mockResolvedValue('AIza-stored');
    await recordConsent('google', true);
    chrome.permissions.contains.mockResolvedValue(false);
    const container = await renderPanel('google');
    await settle();
    order.length = 0;

    const button = allowButton(container);
    button.focus();
    chrome.permissions.contains.mockResolvedValue(true);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(order).toEqual([`set:${consentStorageKey('google')}`, 'permission']);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
    await settle();
    expect(allowButton(container)).toBeUndefined();
    expect(statusText(container)).toMatch(/API key configured/);
  });
});

describe('a key saved before consent existed, or after a no', () => {
  it('sends nothing until the student presses Allow access, which names the provider and what is sent', async () => {
    getSecureAPIKey.mockResolvedValue('sk-ant-stored');
    const container = await renderPanel('anthropic');
    await settle();

    const button = allowButton(container);
    expect(button.textContent).toBe('Allow access to Anthropic (Claude)');
    expect(statusText(container)).toMatch(/nothing/i);
    const note = document.getElementById(button.getAttribute('aria-describedby'));
    expect(note.textContent).toMatch(/Anthropic \(Claude\)/);
    expect(note.textContent).toMatch(/text you ask about/);
    await expect(getConsent('anthropic')).resolves.toBe('unasked');
  });

  it('the press records the yes before it asks Chrome, from the keyboard', async () => {
    getSecureAPIKey.mockResolvedValue('sk-ant-stored');
    chrome.permissions.contains.mockResolvedValue(false);
    const container = await renderPanel('anthropic');
    await settle();
    order.length = 0;

    const button = allowButton(container);
    button.focus();
    chrome.permissions.contains.mockResolvedValue(true);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(order).toEqual([`set:${consentStorageKey('anthropic')}`, 'permission']);
    await settle();

    await expect(getConsent('anthropic')).resolves.toBe('granted');
    expect(allowButton(container)).toBeUndefined();
    expect(statusText(container)).toMatch(/API key configured/);
  });

  it('puts focus on the status line when the button it was on goes away (SC 2.4.3)', async () => {
    getSecureAPIKey.mockResolvedValue('sk-ant-stored');
    const container = await renderPanel('anthropic');
    await settle();

    const button = allowButton(container);
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();

    expect(document.activeElement).toBe(container.querySelector('.ai-panel-status'));
  });

  it('keeps the yes when Chrome’s prompt never answers', async () => {
    getSecureAPIKey.mockResolvedValue('sk-ant-stored');
    chrome.permissions.request.mockImplementation(neverSettles);
    const container = await renderPanel('anthropic');
    await settle();

    allowButton(container).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    );
    await settle();

    await expect(getConsent('anthropic')).resolves.toBe('granted');
  });

  it('shows no button once the provider is allowed and its permission held', async () => {
    getSecureAPIKey.mockResolvedValue('sk-ant-stored');
    await recordConsent('anthropic', true);
    const container = await renderPanel('anthropic');
    await settle();

    expect(allowButton(container)).toBeUndefined();
  });
});
