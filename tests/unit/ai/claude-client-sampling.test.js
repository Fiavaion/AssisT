/**
 * Sampling parameters (temperature, top_p, top_k) are rejected with a 400 by Claude Opus 4.7 and
 * every later model (platform.claude.com/docs/en/about-claude/model-deprecations, checked
 * 2026-10-07). Every model AssisT offers is later than that, so the client never sends them.
 */
jest.mock('../../../src/core/storage/secure-key-storage.js', () => ({
  getSecureAPIKey: jest.fn(),
  hasSecureAPIKey: jest.fn(),
}));

import { getSecureAPIKey } from '../../../src/core/storage/secure-key-storage.js';
import { claudeGenerate } from '../../../src/ai/claude-client.js';
import { getHardcodedFallbackModels } from '../../../src/ai/model-registry.js';

async function sentBody(model) {
  await claudeGenerate(`prompt for ${model}`, { model, temperature: 0.3, noCache: true });
  return JSON.parse(global.fetch.mock.calls[0][1].body);
}

describe('claudeGenerate request shape', () => {
  beforeEach(() => {
    // jest.config resetMocks wipes factory implementations, so they are set here.
    getSecureAPIKey.mockResolvedValue('sk-ant-test-key');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test.each(getHardcodedFallbackModels('anthropic').map(m => m.id))(
    'sends no sampling parameters to %s',
    async id => {
      const body = await sentBody(id);
      expect(body.model).toBe(id);
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('top_p');
      expect(body).not.toHaveProperty('top_k');
    }
  );

  test('a request with no model goes to the default, Sonnet 5.5', async () => {
    await claudeGenerate('prompt with no model', { noCache: true });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe('claude-sonnet-5-5');
  });
});
