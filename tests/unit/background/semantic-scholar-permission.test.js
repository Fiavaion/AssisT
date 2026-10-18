/**
 * Semantic Scholar is an optional host permission (ADR 0006), so the worker asks Chrome whether it
 * holds it before it looks the title up. Consent alone is not enough: a manifest that says the
 * permission is optional has to mean the request does not happen without it.
 *
 * Every refusal is proven by counting fetch calls.
 */

import { performThirdPartyRequest } from '../../../src/background/third-party-requests.js';
import { consentStorageKey } from '../../../src/utils/consent.js';

let stored;

beforeAll(() => {
  if (typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = () => new AbortController().signal;
  }
});

beforeEach(() => {
  stored = {
    [consentStorageKey('citationVerification')]: { granted: true, at: '2026-09-25T10:00:00.000Z' },
  };
  chrome.storage.local.get = jest.fn(async key => {
    const keys = Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) {
      if (k in stored) {
        out[k] = JSON.parse(JSON.stringify(stored[k]));
      }
    }
    return out;
  });
  chrome.permissions = { contains: jest.fn().mockResolvedValue(true) };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ paperId: 'p1', title: 'Attention', authors: [] }] }),
  });
});

afterAll(() => {
  delete chrome.permissions;
});

describe('online citation checking and its host permission', () => {
  it('sends nothing without the permission, even with consent', async () => {
    chrome.permissions.contains.mockResolvedValue(false);
    const reply = await performThirdPartyRequest('citationVerification', {
      title: 'Attention is all you need',
    });
    expect(reply).toMatchObject({ success: false, code: 'permission-missing' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://api.semanticscholar.org/*'],
    });
  });

  it('sends nothing when Chrome cannot say whether it holds the permission', async () => {
    chrome.permissions.contains.mockRejectedValue(new Error('no'));
    const reply = await performThirdPartyRequest('citationVerification', {
      title: 'Attention is all you need',
    });
    expect(reply.success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('looks the title up with both consent and the permission', async () => {
    const reply = await performThirdPartyRequest('citationVerification', {
      title: 'Attention is all you need',
    });
    expect(reply.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not ask about a permission before consent is given', async () => {
    delete stored[consentStorageKey('citationVerification')];
    const reply = await performThirdPartyRequest('citationVerification', {
      title: 'Attention is all you need',
    });
    expect(reply.code).toBe('consent-unasked');
    expect(chrome.permissions.contains).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
