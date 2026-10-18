/**
 * @jest-environment jsdom
 *
 * The Simplify prompts. On llama3.2:3b (Local AI) simplified text came back opening with "Here is a
 * simplified version of the text:", which the student then reads as part of their text. The summary
 * prompt stopped that by asking for only the summary after the passage, where a small model still
 * has it in view; every Simplify prompt, local and cloud, now does the same.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

let simplification_buildPrompt;

beforeAll(async () => {
  // The module listens for settings changes as it loads.
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ simplification_buildPrompt } = await import(
    '../../../src/features/textSimplification/textSimplification.js'
  ));
});

const PASSAGE = 'Photosynthesis turns light into chemical energy stored in carbohydrates.';
const REPLY_ONLY = 'Reply with only the simplified text, with no opening line.';

describe.each([
  ['local', false],
  ['cloud', true],
])('the %s prompts', (_name, isCloud) => {
  test.each(['basic', 'moderate', 'academic'])(
    '%s asks for only the simplified text, after the passage',
    level => {
      const prompt = simplification_buildPrompt(PASSAGE, level, isCloud);

      expect(prompt.indexOf(REPLY_ONLY)).toBeGreaterThan(prompt.lastIndexOf(PASSAGE));
      // The answer label still comes last, so the model starts writing straight after it.
      expect(prompt.trimEnd()).toMatch(/\n[A-Z][^\n]*:$/);
    }
  );
});

// With the reading-level wording at the top of the prompt and "reply with only" at the end,
// llama3.2:3b dropped Very plain's bracketed explanations in 5 of 5 runs; with both after the
// passage it kept them in 5 of 5, and opened with no introduction in 5 of 5.
test.each([
  ['local', false],
  ['cloud', true],
])(
  'the %s prompt puts the reading level after the passage, before the reply-only line',
  (_name, isCloud) => {
    const level = 'Explain any technical term in brackets right after it.';
    const prompt = simplification_buildPrompt(PASSAGE, 'basic', isCloud, level);

    expect(prompt.indexOf(level)).toBeGreaterThan(prompt.lastIndexOf(PASSAGE));
    expect(prompt.indexOf(level)).toBeLessThan(prompt.indexOf(REPLY_ONLY));
    expect(prompt.split(level)).toHaveLength(2);
  }
);

test('an unknown level falls back to moderate', () => {
  expect(simplification_buildPrompt(PASSAGE, 'phd', false)).toBe(
    simplification_buildPrompt(PASSAGE, 'moderate', false)
  );
});

test('local text is capped so the reply arrives inside Chrome’s message time limit', () => {
  const long = 'word '.repeat(400);
  expect(simplification_buildPrompt(long, 'moderate', false)).not.toContain(long);
  expect(simplification_buildPrompt(long, 'moderate', true)).toContain(long);
});
