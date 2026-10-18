/**
 * @jest-environment jsdom
 *
 * The "API Key Required" screen in the AI feature panels named Anthropic whatever provider the
 * student had chosen. It names the chosen provider now, or "your AI provider" when none is known.
 * The WebLLM reason said "tap to open", which fits neither a mouse nor a keyboard on a desktop.
 */

import fs from 'fs';
import path from 'path';
import {
  checkAIAvailable,
  missingKeyMessage,
} from '../../../src/features/shared/ai-feature-client.js';

const CLOUD = provider => ({
  isCloud: true,
  isWebLLM: false,
  isGemini: false,
  isLocal: false,
  isOff: false,
  provider,
  modelKey: 'x',
});

describe('missingKeyMessage', () => {
  test.each([
    ['anthropic', 'Anthropic (Claude)'],
    ['openai', 'OpenAI (ChatGPT)'],
    ['google', 'Google Gemini'],
    ['perplexity', 'Perplexity'],
  ])('names %s by the name the student chose it by', (provider, name) => {
    expect(missingKeyMessage(provider)).toBe(
      `Please add your ${name} API key to use cloud features.`
    );
  });

  test('says "your AI provider" when the provider is unknown', () => {
    expect(missingKeyMessage(undefined)).toBe(
      'Please add an API key for your AI provider to use cloud features.'
    );
    expect(missingKeyMessage('dictionary')).toBe(
      'Please add an API key for your AI provider to use cloud features.'
    );
  });
});

describe('checkAIAvailable carries the provider when a key is missing', () => {
  test('no key', async () => {
    chrome.runtime.sendMessage.mockImplementation(() =>
      Promise.resolve({ success: true, available: false, needsApiKey: true })
    );
    const result = await checkAIAvailable(CLOUD('openai'));
    expect(result.needsApiKey).toBe(true);
    expect(result.provider).toBe('openai');
  });

  test('the check itself failed', async () => {
    chrome.runtime.sendMessage.mockImplementation(() => Promise.reject(new Error('gone')));
    const result = await checkAIAvailable(CLOUD('google'));
    expect(result.needsApiKey).toBe(true);
    expect(result.provider).toBe('google');
  });
});

describe('WebLLM reasons work for mouse and keyboard', () => {
  const WEBLLM = { isCloud: false, isWebLLM: true, isGemini: false, isLocal: false, isOff: false };

  test('not loaded', async () => {
    chrome.runtime.sendMessage.mockImplementation(() =>
      Promise.resolve({ status: { ready: false } })
    );
    const { reason } = await checkAIAvailable(WEBLLM);
    expect(reason).not.toMatch(/tap/i);
    expect(reason).toMatch(/Open AI settings to finish setting up/);
  });

  test('status check failed', async () => {
    chrome.runtime.sendMessage.mockImplementation(() => Promise.reject(new Error('gone')));
    const { reason } = await checkAIAvailable(WEBLLM);
    expect(reason).not.toMatch(/tap/i);
    expect(reason).toMatch(/Open AI settings to finish setting up/);
  });
});

test('no AI feature panel hard-codes a provider on its API Key Required screen', () => {
  const root = path.resolve(__dirname, '../../../src/features');
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith('.js') &&
        /your Anthropic API key/.test(fs.readFileSync(full, 'utf8'))
      ) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  expect(offenders).toEqual([]);
});
