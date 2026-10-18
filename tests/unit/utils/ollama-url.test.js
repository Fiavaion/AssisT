/**
 * Configurable Ollama base URL — validation, storage, and the permission-gated change flow.
 *
 * The contract: every endpoint, the default loopback one included, must be a clean http(s) origin
 * AND be granted by the user through optional host permissions before it is used or saved (ADR
 * 0002). Junk in storage can never leak into a fetch URL.
 */

import {
  DEFAULT_OLLAMA_BASE_URL,
  OLLAMA_BASE_URL_STORAGE,
  normaliseOllamaBaseUrl,
  ollamaOriginPattern,
  getOllamaBaseUrl,
  applyOllamaBaseUrlChange,
  hasOllamaPermission,
  ensureOllamaPermission,
} from '../../../src/utils/ollama-url.js';

describe('normaliseOllamaBaseUrl', () => {
  it('accepts the default and returns it canonically', () => {
    expect(normaliseOllamaBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
    expect(normaliseOllamaBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
  });

  it('accepts a LAN rig origin, http or https', () => {
    expect(normaliseOllamaBaseUrl('http://192.168.1.50:11434')).toBe('http://192.168.1.50:11434');
    expect(normaliseOllamaBaseUrl('https://ollama.ncad.ie')).toBe('https://ollama.ncad.ie');
  });

  it('adds http:// when the user omits the scheme (host:port shorthand)', () => {
    expect(normaliseOllamaBaseUrl('192.168.1.50:11434')).toBe('http://192.168.1.50:11434');
    expect(normaliseOllamaBaseUrl('rig.local:11434')).toBe('http://rig.local:11434');
  });

  it('strips paths, trailing slashes, and surrounding whitespace down to the origin', () => {
    expect(normaliseOllamaBaseUrl('  http://rig.local:11434/api/generate  ')).toBe('http://rig.local:11434');
  });

  it('lowercases the host', () => {
    expect(normaliseOllamaBaseUrl('http://RIG.Local:11434')).toBe('http://rig.local:11434');
  });

  it('rejects non-http(s) schemes, credentials, and junk', () => {
    expect(normaliseOllamaBaseUrl('ftp://rig:11434')).toBeNull();
    expect(normaliseOllamaBaseUrl('chrome-extension://abc')).toBeNull();
    expect(normaliseOllamaBaseUrl('http://user:pass@rig:11434')).toBeNull();
    expect(normaliseOllamaBaseUrl('not a url')).toBeNull();
    expect(normaliseOllamaBaseUrl('')).toBeNull();
    expect(normaliseOllamaBaseUrl(null)).toBeNull();
    expect(normaliseOllamaBaseUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('ollamaOriginPattern', () => {
  it('builds the match pattern for a permission request', () => {
    expect(ollamaOriginPattern('http://rig.local:11434')).toBe('http://rig.local:11434/*');
  });
});

describe('getOllamaBaseUrl', () => {
  it('returns the default when nothing is stored', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    expect(await getOllamaBaseUrl()).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('returns a stored custom origin', async () => {
    chrome.storage.local.get.mockResolvedValue({ [OLLAMA_BASE_URL_STORAGE]: 'http://rig.local:11434' });
    expect(await getOllamaBaseUrl()).toBe('http://rig.local:11434');
  });

  it('falls back to the default when the stored value is junk (defence-in-depth)', async () => {
    chrome.storage.local.get.mockResolvedValue({ [OLLAMA_BASE_URL_STORAGE]: 'ftp://evil' });
    expect(await getOllamaBaseUrl()).toBe(DEFAULT_OLLAMA_BASE_URL);
  });

  it('falls back to the default when storage throws', async () => {
    chrome.storage.local.get.mockRejectedValue(new Error('gone'));
    expect(await getOllamaBaseUrl()).toBe(DEFAULT_OLLAMA_BASE_URL);
  });
});

describe('applyOllamaBaseUrlChange', () => {
  it('rejects an invalid input without touching storage or permissions', async () => {
    const requestPermission = jest.fn();
    const result = await applyOllamaBaseUrlChange('ftp://nope', { requestPermission });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('asks for the default loopback address too, then resets by clearing storage', async () => {
    // It used to ship in host_permissions and so needed no prompt. It is optional now, so the
    // reset path has to ask like any other origin, or a student who resets loses local AI.
    const requestPermission = jest.fn(async () => true);
    const hasPermission = jest.fn(async () => false);
    const result = await applyOllamaBaseUrlChange('http://localhost:11434/', {
      requestPermission,
      hasPermission,
    });
    expect(result).toEqual({ ok: true, url: DEFAULT_OLLAMA_BASE_URL, isDefault: true });
    expect(requestPermission).toHaveBeenCalledWith('http://localhost:11434/*');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(OLLAMA_BASE_URL_STORAGE);
  });

  it('does not re-ask for an address already granted', async () => {
    const requestPermission = jest.fn();
    const hasPermission = jest.fn(async () => true);
    const result = await applyOllamaBaseUrlChange('', { requestPermission, hasPermission });
    expect(result).toEqual({ ok: true, url: DEFAULT_OLLAMA_BASE_URL, isDefault: true });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('leaves the default unset when the prompt is refused', async () => {
    const result = await applyOllamaBaseUrlChange('', {
      requestPermission: jest.fn(async () => false),
      hasPermission: jest.fn(async () => false),
    });
    expect(result).toEqual({ ok: false, reason: 'permission' });
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('requests the origin permission and saves when granted', async () => {
    const requestPermission = jest.fn(async () => true);
    const result = await applyOllamaBaseUrlChange('rig.local:11434', { requestPermission });
    expect(requestPermission).toHaveBeenCalledWith('http://rig.local:11434/*');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [OLLAMA_BASE_URL_STORAGE]: 'http://rig.local:11434',
    });
    expect(result).toEqual({ ok: true, url: 'http://rig.local:11434', isDefault: false });
  });

  it('does NOT save when the permission is denied', async () => {
    const requestPermission = jest.fn(async () => false);
    const result = await applyOllamaBaseUrlChange('http://rig.local:11434', { requestPermission });
    expect(result).toEqual({ ok: false, reason: 'permission' });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('surfaces a permission-request failure as a denial, never a throw', async () => {
    const requestPermission = jest.fn(async () => {
      throw new Error('gesture required');
    });
    const result = await applyOllamaBaseUrlChange('http://rig.local:11434', { requestPermission });
    expect(result).toEqual({ ok: false, reason: 'permission' });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('hasOllamaPermission / ensureOllamaPermission', () => {
  // The pair the popup and the service worker split between them: the worker only ever asks
  // whether the grant is held (it cannot prompt), the popup asks and prompts.
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
  });

  it('reports a held grant for the active endpoint', async () => {
    const hasPermission = jest.fn(async () => true);
    expect(await hasOllamaPermission(undefined, { hasPermission })).toBe(true);
    expect(hasPermission).toHaveBeenCalledWith('http://localhost:11434/*');
  });

  it('reports a missing grant rather than throwing when permissions cannot be read', async () => {
    const hasPermission = jest.fn(async () => {
      throw new Error('no such api');
    });
    expect(await hasOllamaPermission(undefined, { hasPermission })).toBe(false);
  });

  it('asks for the loopback address the first time local AI is turned on', async () => {
    const requestPermission = jest.fn(async () => true);
    const hasPermission = jest.fn(async () => false);
    expect(await ensureOllamaPermission(undefined, { requestPermission, hasPermission })).toBe(
      true
    );
    expect(requestPermission).toHaveBeenCalledWith('http://localhost:11434/*');
  });

  it('does not prompt again once the grant is held', async () => {
    const requestPermission = jest.fn();
    const hasPermission = jest.fn(async () => true);
    expect(await ensureOllamaPermission(undefined, { requestPermission, hasPermission })).toBe(
      true
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks for the stored custom endpoint, not the default', async () => {
    chrome.storage.local.get.mockResolvedValue({ [OLLAMA_BASE_URL_STORAGE]: 'http://rig.local:11434' });
    const requestPermission = jest.fn(async () => true);
    const hasPermission = jest.fn(async () => false);
    await ensureOllamaPermission(undefined, { requestPermission, hasPermission });
    expect(requestPermission).toHaveBeenCalledWith('http://rig.local:11434/*');
  });

  it('treats a refusal outside a user gesture as a denial, never a throw', async () => {
    const requestPermission = jest.fn(async () => {
      throw new Error('This function must be called during a user gesture');
    });
    const hasPermission = jest.fn(async () => false);
    expect(await ensureOllamaPermission(undefined, { requestPermission, hasPermission })).toBe(
      false
    );
  });
});
