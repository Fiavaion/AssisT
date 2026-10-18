/**
 * Cloud AI behind the student's consent (ADR 0006).
 *
 * A cloud AI provider is a destination like any other, but its prompts are arbitrary text, so it is
 * never routed through the worker's third-party allowlist. Instead the cloud router itself refuses
 * to call a provider the student has not allowed. Each refusal is proven by the provider client
 * never being called, not by the shape of the error.
 *
 * An install that already had a key saved before consent existed is NOT given a yes on update:
 * nobody said yes, and the key was saved under wording that never named what is sent. The router
 * refuses and says where the yes is given: the popup's "Allow access to <provider>" button, whose
 * wording names the provider and what is sent.
 *
 * Anthropic, OpenAI and Perplexity are optional host permissions (ADR 0006). The router also
 * refuses one of those whose permission Chrome does not hold, with nothing sent, and says how to
 * give it. Google Gemini is optional too since ADR 0007, and is refused the same way.
 */

const mockClaudeGenerate = jest.fn();
const mockOpenaiGenerate = jest.fn();
const mockGeminiGenerate = jest.fn();
jest.mock('../../../src/ai/claude-client.js', () => ({
  claudeGenerate: (...args) => mockClaudeGenerate(...args),
}));
jest.mock('../../../src/ai/openai-client.js', () => ({
  openaiGenerate: (...args) => mockOpenaiGenerate(...args),
}));
jest.mock('../../../src/ai/google-client.js', () => ({
  geminiGenerate: (...args) => mockGeminiGenerate(...args),
}));
jest.mock('../../../src/ai/perplexity-client.js', () => ({
  perplexityGenerate: jest.fn(),
}));

import { webcrypto } from 'crypto';
import * as cloudRouter from '../../../src/ai/cloud-router.js';
import { cloudGenerate, checkCloudAvailability } from '../../../src/ai/cloud-router.js';
import { saveSecureAPIKey } from '../../../src/core/storage/secure-key-storage.js';
import {
  CONSENT_STORAGE_KEYS,
  CLOUD_AI_DESTINATIONS,
  DESTINATIONS,
  recordConsent,
  withdrawConsent,
} from '../../../src/utils/consent.js';

let stored;

function saveKey(provider) {
  stored[`secure_apikey_${provider}`] = { encrypted: 'opaque', createdAt: 1, version: 2 };
}

beforeEach(() => {
  stored = {};
  chrome.storage.local.get = jest.fn(async key => {
    if (key === null) {
      return JSON.parse(JSON.stringify(stored));
    }
    const keys = Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) {
      if (k in stored) {
        out[k] = JSON.parse(JSON.stringify(stored[k]));
      }
    }
    return out;
  });
  chrome.storage.local.set = jest.fn(async values => {
    Object.assign(stored, JSON.parse(JSON.stringify(values)));
  });
  mockClaudeGenerate.mockResolvedValue({ content: 'ok', usage: {} });
  mockOpenaiGenerate.mockResolvedValue({ content: 'ok', usage: {} });
  mockGeminiGenerate.mockResolvedValue({ content: 'ok', usage: {} });
  chrome.permissions = { contains: jest.fn().mockResolvedValue(true) };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('the cloud AI destinations', () => {
  it('has one per provider the router supports, named as a student knows it', () => {
    expect(CLOUD_AI_DESTINATIONS).toEqual(['anthropic', 'openai', 'google', 'perplexity']);
    expect(DESTINATIONS.anthropic.service).toMatch(/Anthropic/);
    expect(DESTINATIONS.anthropic.service).toMatch(/Claude/);
    expect(DESTINATIONS.openai.service).toMatch(/OpenAI/);
    expect(DESTINATIONS.google.service).toMatch(/Gemini/);
    expect(DESTINATIONS.perplexity.service).toMatch(/Perplexity/);
    for (const id of CLOUD_AI_DESTINATIONS) {
      expect(DESTINATIONS[id].sends).toMatch(/text you ask/);
    }
  });
});

describe('the cloud router', () => {
  it('calls no provider the student has not been asked about', async () => {
    stored.cloudProvider = 'anthropic';
    await expect(cloudGenerate('Summarise this essay')).rejects.toThrow(/Anthropic/);
    expect(mockClaudeGenerate).not.toHaveBeenCalled();
  });

  it('calls no provider the student said no to', async () => {
    stored.cloudProvider = 'openai';
    await recordConsent('openai', false);
    await expect(cloudGenerate('Summarise this essay')).rejects.toThrow(/OpenAI/);
    expect(mockOpenaiGenerate).not.toHaveBeenCalled();
  });

  it('calls the provider the student allowed', async () => {
    stored.cloudProvider = 'anthropic';
    await recordConsent('anthropic', true);
    await expect(cloudGenerate('Summarise this essay')).resolves.toMatchObject({ content: 'ok' });
    expect(mockClaudeGenerate).toHaveBeenCalledTimes(1);
  });

  it('stops at the very next request after a withdrawal', async () => {
    stored.cloudProvider = 'anthropic';
    await recordConsent('anthropic', true);
    await cloudGenerate('first');
    await withdrawConsent('anthropic');
    await expect(cloudGenerate('second')).rejects.toThrow();
    expect(mockClaudeGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not let consent for one provider cover another', async () => {
    stored.cloudProvider = 'openai';
    await recordConsent('anthropic', true);
    await expect(cloudGenerate('x')).rejects.toThrow();
    expect(mockOpenaiGenerate).not.toHaveBeenCalled();
  });

  it('reports cloud AI as unavailable, and says why, while the provider is not allowed', async () => {
    stored.cloudProvider = 'anthropic';
    // Availability decrypts the key, so this one is really encrypted (jsdom has no SubtleCrypto).
    const realCrypto = global.crypto;
    Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0004');
    const status = await checkCloudAvailability();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/not allowed/i);

    await recordConsent('anthropic', true);
    await expect(checkCloudAvailability()).resolves.toMatchObject({ available: true });
    Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true });
  });
});

describe('an install from before consent existed', () => {
  it('has no carry-over: nothing records a yes the student did not give', () => {
    const fs = require('fs');
    const path = require('path');
    const src = path.join(__dirname, '../../../src');
    expect(fs.existsSync(path.join(src, 'ai/cloud-consent.js'))).toBe(false);
    const worker = fs.readFileSync(path.join(src, 'background/service-worker.js'), 'utf8');
    expect(worker).not.toMatch(/carryOverCloudConsent|cloud-consent\.js/);
  });

  it('is refused, with nothing sent, and told which button gives the yes', async () => {
    stored.aiMode = 'cloud';
    stored.cloudProvider = 'anthropic';
    saveKey('anthropic');

    await expect(cloudGenerate('Summarise this essay')).rejects.toThrow(
      /AssisT popup.*Allow access to Anthropic \(Claude\)/s
    );
    expect(mockClaudeGenerate).not.toHaveBeenCalled();
    expect(CONSENT_STORAGE_KEYS.some(key => key in stored)).toBe(false);
  });

  it('says where a no can be changed in words that match the popup', async () => {
    stored.cloudProvider = 'openai';
    await recordConsent('openai', false);
    const error = await cloudGenerate('x').catch(e => e);
    expect(error.message).toMatch(/Allow access to OpenAI/);
    expect(error.message).not.toMatch(/Settings/);
  });
});

describe('the optional host permission of a keyed provider', () => {
  it('refuses Anthropic, sending nothing, when Chrome does not hold its permission', async () => {
    stored.cloudProvider = 'anthropic';
    await recordConsent('anthropic', true);
    chrome.permissions.contains.mockResolvedValue(false);

    await expect(cloudGenerate('Summarise this essay')).rejects.toThrow(
      /Anthropic.*AssisT popup.*Allow access/s
    );
    expect(mockClaudeGenerate).not.toHaveBeenCalled();
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://api.anthropic.com/*'],
    });
  });

  it('refuses OpenAI the same way', async () => {
    stored.cloudProvider = 'openai';
    await recordConsent('openai', true);
    chrome.permissions.contains.mockResolvedValue(false);

    await expect(cloudGenerate('x')).rejects.toThrow(/OpenAI/);
    expect(mockOpenaiGenerate).not.toHaveBeenCalled();
  });

  it('an unreadable permission is not a permission', async () => {
    stored.cloudProvider = 'anthropic';
    await recordConsent('anthropic', true);
    chrome.permissions.contains.mockRejectedValue(new Error('unavailable'));

    await expect(cloudGenerate('x')).rejects.toThrow();
    expect(mockClaudeGenerate).not.toHaveBeenCalled();
  });

  it('refuses Google Gemini the same way, and says where to allow it (ADR 0007)', async () => {
    stored.cloudProvider = 'google';
    await recordConsent('google', true);
    chrome.permissions.contains.mockResolvedValue(false);

    await expect(cloudGenerate('x')).rejects.toThrow(
      /Chrome has not given AssisT access to Google Gemini, so nothing was sent.*Allow access to Google Gemini/
    );
    expect(mockGeminiGenerate).not.toHaveBeenCalled();
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://generativelanguage.googleapis.com/*'],
    });
  });

  it('sends to Google Gemini once both the yes and the permission are held', async () => {
    stored.cloudProvider = 'google';
    await recordConsent('google', true);

    await expect(cloudGenerate('x')).resolves.toMatchObject({ content: 'ok' });
    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
  });

  it('reports the missing permission as the reason, not as a missing key', async () => {
    stored.cloudProvider = 'anthropic';
    const realCrypto = global.crypto;
    Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });
    await saveSecureAPIKey('anthropic', 'sk-ant-test-0007');
    await recordConsent('anthropic', true);
    chrome.permissions.contains.mockResolvedValue(false);

    const status = await checkCloudAvailability();
    Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true });

    expect(status).toMatchObject({
      available: false,
      needsApiKey: false,
      needsHostPermission: true,
    });
    expect(status.reason).toMatch(/Allow access/);
  });
});

describe('the model list fetch nothing called', () => {
  it('is gone from the router', () => {
    expect(cloudRouter.cloudFetchModels).toBeUndefined();
    expect(cloudRouter.default.cloudFetchModels).toBeUndefined();
  });
});
