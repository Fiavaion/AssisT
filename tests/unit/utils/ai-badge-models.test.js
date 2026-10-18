/**
 * The AI badge names the model a request will actually go to. A saved model that has been
 * replaced is sent to its replacement (see model-registry resolveModel), so the badge names the
 * replacement too rather than a model nothing is talking to.
 */

import { getAIBadgeInfo } from '../../../src/utils/ai-badge.js';

function store(values) {
  chrome.storage.local.get = jest.fn(async () => values);
}

describe('getAIBadgeInfo for cloud AI', () => {
  test.each([
    ['claude-haiku-5-5', 'Haiku'],
    ['claude-sonnet-5-5', 'Sonnet'],
    ['claude-opus-5-5', 'Opus'],
    ['sonnet-5.5', 'Sonnet'],
    ['claude-sonnet-4-6', 'Sonnet'],
    ['opus-4.6', 'Opus'],
  ])('Anthropic %s reads as %s', async (cloudModel, name) => {
    store({ aiMode: 'cloud', cloudProvider: 'anthropic', cloudModel });
    expect((await getAIBadgeInfo()).label).toBe(`Anthropic: ${name}`);
  });

  test('a replaced Gemini model reads as its replacement', async () => {
    store({ aiMode: 'cloud', cloudProvider: 'google', cloudModel: 'gemini-2.5-flash' });
    expect((await getAIBadgeInfo()).label).toBe('Google: gemini-3.8-flash');
  });
});
