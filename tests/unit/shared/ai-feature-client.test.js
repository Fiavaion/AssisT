/**
 * @jest-environment jsdom
 *
 * Tests for the shared AI client's response-normalisation contract.
 *
 * The contract (see generateWithAI JSDoc): `text` is ALWAYS a string in every mode; `json` holds the
 * parsed object when `format:'json'` was requested (parsed centrally for all modes) or null otherwise.
 * This is the guard against the 2026-07-01 local-mode regression, where a per-caller assumption that
 * `text` is a string crashed when local Ollama returned a pre-parsed object.
 */

import {
  extractJsonObject,
  generateWithAI,
  checkAIAvailable,
  getFailureMessage,
} from '../../../src/features/shared/ai-feature-client.js';

const CLOUD = { isCloud: true, isWebLLM: false, isGemini: false, isLocal: false, modelKey: 'haiku-4.5' };
const LOCAL = { isCloud: false, isWebLLM: false, isGemini: false, isLocal: true, modelKey: 'local' };

function mockGenerate(action, data) {
  chrome.runtime.sendMessage.mockImplementation(msg =>
    msg.action === action ? Promise.resolve({ success: true, data }) : Promise.resolve({})
  );
}

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips Markdown code fences', () => {
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it('strips <think> reasoning blocks and leading prose', () => {
    expect(extractJsonObject('<think>hmm</think> Sure: {"a":3}')).toEqual({ a: 3 });
  });
  it('repairs trailing commas', () => {
    expect(extractJsonObject('{"a":4,}')).toEqual({ a: 4 });
  });
  it('returns null for non-JSON and non-strings', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject(null)).toBeNull();
    expect(extractJsonObject({ a: 1 })).toBeNull();
  });
});

describe('generateWithAI — { text, json } contract', () => {
  it('cloud + format:json: string data → string text AND parsed json', async () => {
    mockGenerate('CLOUD_LLM_GENERATE', '{"signal":"high"}');
    const r = await generateWithAI('p', CLOUD, { format: 'json' });
    expect(typeof r.text).toBe('string');
    expect(r.json).toEqual({ signal: 'high' });
  });

  it('no format requested: json is null, text is the string', async () => {
    mockGenerate('CLOUD_LLM_GENERATE', 'just prose');
    const r = await generateWithAI('p', CLOUD, {});
    expect(r.text).toBe('just prose');
    expect(r.json).toBeNull();
  });

  it('local + format:json: pre-parsed object → text is a string, json is the object', async () => {
    mockGenerate('LOCAL_LLM_GENERATE', { signal: 'medium', summary: 's' });
    const r = await generateWithAI('p', LOCAL, { format: 'json' });
    expect(typeof r.text).toBe('string');
    expect(r.json).toEqual({ signal: 'medium', summary: 's' });
  });

  it('local + format:json: { raw, parseError } → recovers json from raw, text is raw', async () => {
    mockGenerate('LOCAL_LLM_GENERATE', { raw: 'noise {"signal":"low"} tail', parseError: true });
    const r = await generateWithAI('p', LOCAL, { format: 'json' });
    expect(r.text).toBe('noise {"signal":"low"} tail');
    expect(r.json).toEqual({ signal: 'low' });
  });

  it('local plain string (no format): json null, text string', async () => {
    mockGenerate('LOCAL_LLM_GENERATE', 'plain local answer');
    const r = await generateWithAI('p', LOCAL, {});
    expect(r.text).toBe('plain local answer');
    expect(r.json).toBeNull();
  });
});

describe('checkAIAvailable — Gemini Nano', () => {
  const GEMINI = { isCloud: false, isWebLLM: false, isGemini: true, isLocal: false, isOff: false, modelKey: 'gemini' };

  test('asks the worker with the probe it actually answers', async () => {
    // It used to send GEMINI_NANO_CHECK, which nothing handled, so Nano could never report ready.
    chrome.runtime.sendMessage.mockImplementation(msg =>
      msg.action === 'GEMINI_LLM_CHECK' ? Promise.resolve({ success: true, available: true }) : Promise.resolve(undefined)
    );
    const result = await checkAIAvailable(GEMINI);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'GEMINI_LLM_CHECK' });
    expect(result.available).toBe(true);
  });

  test('reports unavailable when the worker says so', async () => {
    chrome.runtime.sendMessage.mockImplementation(() => Promise.resolve({ success: true, available: false }));
    const result = await checkAIAvailable(GEMINI);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/Gemini Nano/);
  });
});

describe('getFailureMessage', () => {
  test('passes through the first line of a plain, actionable sentence', () => {
    const message = 'No suitable local model is installed. Run: ollama pull qwen3:8b.';
    expect(getFailureMessage(new Error(`${message}\n    at somewhere`))).toBe(message);
  });

  test('replaces a DOMException with wording the student can act on', () => {
    const shown = getFailureMessage(new DOMException('aborted', 'AbortError'));
    expect(shown).not.toMatch(/aborted/);
    expect(shown).toMatch(/AI settings/);
  });

  test('replaces an empty or missing message', () => {
    expect(getFailureMessage(new Error(''))).toMatch(/AI settings/);
    expect(getFailureMessage(undefined)).toMatch(/AI settings/);
  });
});
