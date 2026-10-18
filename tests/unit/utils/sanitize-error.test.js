/**
 * Tests for sanitizeError — the SW error mapper.
 *
 * Primary regression: an Ollama 400 "<model> does not support generate" must be
 * reported as a LOCAL capability problem, not the CLOUD "API rate limit" message.
 * The old code matched the bare substring "rate", which "gene-rate" satisfied.
 */

import { sanitizeError } from '../../../src/utils/sanitize-error.js';

describe('sanitizeError', () => {
  // Silence the intentional console.error logging in this pure mapper.
  let errSpy;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  test('local "does not support generate" 400 maps to a local capability message, not rate limit', () => {
    const err = new Error(
      'Ollama request failed: 400 {"error":"\\"nomic-embed-text:latest\\" does not support generate"}'
    );
    const out = sanitizeError(err);
    expect(out).toContain("can't generate text");
    expect(out).not.toContain('rate limit');
  });

  test('a real cloud rate limit still maps to the rate-limit message', () => {
    expect(sanitizeError(new Error('Rate limited. Please wait a moment before trying again.'))).toBe(
      'API rate limit reached — wait a moment then try again'
    );
    expect(sanitizeError(new Error('HTTP 429 Too Many Requests'))).toBe(
      'API rate limit reached — wait a moment then try again'
    );
    expect(sanitizeError(new Error('quota exceeded'))).toBe(
      'API rate limit reached — wait a moment then try again'
    );
  });

  test('a benign message containing "generate" is not mislabelled as a rate limit', () => {
    expect(sanitizeError(new Error('Failed to generate study path'))).toBe(
      'Failed to generate study path'
    );
  });

  test('network and timeout errors keep their dedicated messages', () => {
    expect(sanitizeError(new Error('Failed to fetch'))).toBe(
      'Network error — check your internet connection'
    );
    expect(sanitizeError(new Error('The operation timed out'))).toBe('Request timed out — try again');
  });

  test('API key / auth errors are surfaced as key errors', () => {
    expect(sanitizeError(new Error('401 Unauthorized: bad API key'))).toContain('API key error');
  });

  test('handles non-Error input without throwing', () => {
    expect(typeof sanitizeError('some string')).toBe('string');
    expect(typeof sanitizeError(null)).toBe('string');
  });
});
