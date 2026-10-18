/**
 * "Ollama is not running" was shown to students whose Ollama was running perfectly well, because
 * the setup page collapsed every unavailable result into one message. The service worker already
 * separates a missing host permission from an unreachable server; this is the page's half of that
 * distinction, and it exists as a pure function so it can be pinned down here.
 */

import { ollamaPanelState } from '../../../../src/pages/ai-setup/ollama-status.js';

describe('ollamaPanelState', () => {
  it('asks for permission when the grant is what is missing', () => {
    expect(ollamaPanelState({ available: false, models: [], needsPermission: true })).toBe(
      'needs-permission'
    );
  });

  it('does not confuse a missing permission with a stopped server', () => {
    expect(ollamaPanelState({ available: false, models: [], needsPermission: false })).toBe(
      'not-running'
    );
  });

  it('treats an unknown assessment as a stopped server, never as a permission problem', () => {
    expect(ollamaPanelState(undefined)).toBe('not-running');
    expect(ollamaPanelState(null)).toBe('not-running');
    expect(ollamaPanelState({})).toBe('not-running');
  });

  it('is ready once Ollama answers with at least one model', () => {
    expect(ollamaPanelState({ available: true, models: ['qwen3:8b'] })).toBe('ready');
  });

  it('keeps the install help when Ollama answers with no models at all', () => {
    expect(ollamaPanelState({ available: true, models: [] })).toBe('not-running');
  });

  it('prefers the granted connection over a stale permission flag', () => {
    expect(
      ollamaPanelState({ available: true, models: ['qwen3:8b'], needsPermission: true })
    ).toBe('ready');
  });
});
