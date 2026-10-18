/**
 * @jest-environment jsdom
 *
 * The cloud AI panel in the popup: the show-key toggle is a real toggle button that works from
 * the keyboard (SC 2.1.1, SC 4.1.2), and the model list comes from the model registry.
 */

jest.mock('../../../src/core/storage/secure-key-storage.js', () => ({
  saveSecureAPIKey: jest.fn(),
  getSecureAPIKey: jest.fn(),
  hasSecureAPIKey: jest.fn(),
  listSecureAPIKeys: jest.fn(),
  deleteSecureAPIKey: jest.fn(),
}));

import { getSecureAPIKey } from '../../../src/core/storage/secure-key-storage.js';
import { getHardcodedFallbackModels } from '../../../src/ai/model-registry.js';

let PopupController;
let stored;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

beforeEach(() => {
  stored = {};
  chrome.storage.local.get = jest.fn(async keys => {
    const names = keys === null ? Object.keys(stored) : [].concat(keys);
    return Object.fromEntries(
      names.filter(key => key in stored).map(key => [key, structuredClone(stored[key])])
    );
  });
  chrome.storage.local.set = jest.fn(async items => {
    Object.assign(stored, structuredClone(items));
  });
  chrome.permissions = {
    request: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
  };
  getSecureAPIKey.mockResolvedValue(null);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  delete chrome.permissions;
});

async function renderPanel(provider) {
  stored.cloudProvider = provider;
  document.body.innerHTML = '<div id="panel"></div>';
  const container = document.getElementById('panel');
  await new PopupController()._renderCloudPanel(container, false);
  return container;
}

function press(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('show-key toggle', () => {
  it('names what it does and starts unpressed', async () => {
    const container = await renderPanel('anthropic');
    const toggle = container.querySelector('.ai-panel-key-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Show API key');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows and hides the key from the keyboard', async () => {
    const container = await renderPanel('anthropic');
    const toggle = container.querySelector('.ai-panel-key-toggle');
    const input = container.querySelector('.ai-panel-key-input');

    press(toggle, 'Enter');
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    press(toggle, ' ');
    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('still works with the mouse', async () => {
    const container = await renderPanel('anthropic');
    const toggle = container.querySelector('.ai-panel-key-toggle');
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(container.querySelector('.ai-panel-key-input').type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('model list', () => {
  it('offers the registry models for the provider, whatever else is in storage', async () => {
    stored.cloudModels_openai = { models: [{ id: 'stale-model', name: 'Stale' }] };
    const container = await renderPanel('openai');
    const ids = [...container.querySelectorAll('select[aria-label="Cloud AI model"] option')].map(
      o => o.value
    );
    expect(ids).toEqual(getHardcodedFallbackModels('openai').map(m => m.id));
    expect(ids.length).toBeGreaterThan(0);
  });

  it.each([
    ['anthropic', 'claude-sonnet-4-6', 'claude-sonnet-5-5'],
    ['anthropic', 'claude-haiku-4-5-20251001', 'claude-haiku-5-5'],
    ['google', 'gemini-2.5-flash', 'gemini-3.8-flash'],
  ])(
    'moves a saved %s model that has been replaced (%s) to its replacement',
    async (provider, saved, current) => {
      stored.cloudModel = saved;
      const container = await renderPanel(provider);
      const select = container.querySelector('select[aria-label="Cloud AI model"]');
      expect(select.value).toBe(current);
      expect(stored.cloudModel).toBe(current);
    }
  );

  it('leaves a current saved model as it is', async () => {
    stored.cloudModel = 'claude-opus-5-5';
    const container = await renderPanel('anthropic');
    expect(container.querySelector('select[aria-label="Cloud AI model"]').value).toBe(
      'claude-opus-5-5'
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ cloudModel: expect.anything() });
  });
});
