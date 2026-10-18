/**
 * Profile prompt addendum — the single gate through which the cognitive profile reaches AI prompts.
 */
jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(),
}));

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { getProfileAddendum } from '../../../src/features/companion/profile-addendum.js';

beforeEach(() => {
  isCompanionEnabled.mockResolvedValue(true);
  delete window.assistFeatures;
});

test('returns the style and complexity directives as one instruction', async () => {
  window.assistFeatures = {
    cognitiveProfile: {
      getPromptModifiers: () => ({
        style: 'Use numbered steps and sequential instructions.',
        complexity: 'Use simple vocabulary and short sentences.',
      }),
    },
  };
  const addendum = await getProfileAddendum();
  expect(addendum).toContain('Adapt the response to this learner');
  expect(addendum).toContain('numbered steps');
  expect(addendum).toContain('simple vocabulary');
});

test('empty when the personalisedAi toggle is off', async () => {
  isCompanionEnabled.mockResolvedValue(false);
  window.assistFeatures = {
    cognitiveProfile: { getPromptModifiers: () => ({ style: 'Use examples.' }) },
  };
  await expect(getProfileAddendum()).resolves.toBe('');
});

test('empty when no profile is available', async () => {
  await expect(getProfileAddendum()).resolves.toBe('');
});

test('empty when the profile has no modifiers', async () => {
  window.assistFeatures = { cognitiveProfile: { getPromptModifiers: () => ({}) } };
  await expect(getProfileAddendum()).resolves.toBe('');
});

test('never throws when the profile getter blows up', async () => {
  window.assistFeatures = {
    cognitiveProfile: {
      getPromptModifiers: () => {
        throw new Error('boom');
      },
    },
  };
  await expect(getProfileAddendum()).resolves.toBe('');
});
