/**
 * @jest-environment jsdom
 *
 * The summary prompt. Measured on llama3.2:3b (Local AI), a summary prompt that ended with the
 * passage and "Summary:" came back with an opening line that repeated the instruction ("Here is a
 * 1-2 sentence summary of the main point:") in 3 of 5 runs at Standard and 5 of 5 at Very plain.
 * Asking for only the summary, after the passage where a small model still has it in view, stopped
 * it in 5 of 5 at both levels.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

let summarization_buildPrompt;

beforeAll(async () => {
  // The module listens for settings changes as it loads.
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ summarization_buildPrompt } = await import(
    '../../../src/features/summarization/summarization.js'
  ));
});

const PASSAGE = 'Photosynthesis turns light into chemical energy.';

describe.each(['brief', 'moderate', 'detailed'])('a %s summary', level => {
  test('asks for only the summary, after the passage', () => {
    const prompt = summarization_buildPrompt(level, PASSAGE, '');
    const passageAt = prompt.indexOf(PASSAGE);
    const replyOnlyAt = prompt.indexOf('Reply with only the summary, with no opening line.');

    expect(replyOnlyAt).toBeGreaterThan(passageAt);
    expect(prompt.trimEnd().endsWith('Summary:')).toBe(true);
  });
});

test('the length instruction and the addenda come before the passage', () => {
  const prompt = summarization_buildPrompt('brief', PASSAGE, '\n\nWrite plainly.');

  expect(prompt.indexOf('1-2 sentences')).toBeLessThan(prompt.indexOf('Write plainly.'));
  expect(prompt.indexOf('Write plainly.')).toBeLessThan(prompt.indexOf(PASSAGE));
});

test('an unknown length falls back to brief', () => {
  expect(summarization_buildPrompt('epic', PASSAGE, '')).toContain('1-2 sentences');
});
