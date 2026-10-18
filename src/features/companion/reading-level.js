/**
 * Reading-level dial — one preference that shapes AI summaries and simplification output.
 *
 * Three honest levels (no reading-age pseudoscience in the UI copy): standard, plain language,
 * and very plain. The addendum is appended to the summarization/simplification prompts; empty
 * when the summaryDial companion toggle is off or the level is standard.
 *
 * @module features/companion/reading-level
 */

import { isCompanionEnabled } from './companion-settings.js';

const READING_LEVEL_KEY = 'companionReadingLevel';

/** The features a reading level shapes. */
const FEATURES = ['summary', 'simplify'];

const PLAIN =
  'Write in plain language: short sentences, common words, one idea per sentence, and keep any list to a few items.';

// Very plain differs by feature. A summary is short, so it swaps hard words for everyday ones:
// asking for each term to be explained in brackets pulled against a 1-2 sentence summary, and a
// small local model kept the brackets and dropped the brevity. Simplified text is a full rewrite a
// student reads to learn from, so it keeps the proper term and explains it.
const VERY_PLAIN =
  'Write as plainly as possible: very short sentences, everyday words only, one idea per sentence.';

export const READING_LEVELS = [
  { id: 'standard', label: 'Standard', addendum: { summary: '', simplify: '' } },
  { id: 'plain', label: 'Plain language', addendum: { summary: PLAIN, simplify: PLAIN } },
  {
    id: 'very-plain',
    label: 'Very plain',
    addendum: {
      summary: `${VERY_PLAIN} Use an everyday word in place of a technical term.`,
      simplify: `${VERY_PLAIN} Explain any technical term in brackets right after it.`,
    },
  },
];

export async function getReadingLevel() {
  const stored = await chrome.storage.local.get(READING_LEVEL_KEY);
  const id = stored[READING_LEVEL_KEY];
  return READING_LEVELS.some(l => l.id === id) ? id : 'standard';
}

export async function setReadingLevel(id) {
  if (!READING_LEVELS.some(l => l.id === id)) {
    throw new Error(`Unknown reading level: ${id}`);
  }
  await chrome.storage.local.set({ [READING_LEVEL_KEY]: id });
}

/**
 * The prompt addendum for the current level and feature ('' when off or standard).
 * @param {'summary'|'simplify'} feature - which feature's wording to use
 * @returns {Promise<string>}
 */
export async function getReadingLevelAddendum(feature) {
  if (!FEATURES.includes(feature)) {
    throw new Error(`Reading level has no wording for the feature: ${feature}`);
  }
  try {
    if (!(await isCompanionEnabled('summaryDial'))) {
      return '';
    }
    const level = await getReadingLevel();
    const found = READING_LEVELS.find(l => l.id === level);
    const addendum = found ? found.addendum[feature] : '';
    return addendum
      ? `

${addendum}`
      : '';
  } catch {
    return '';
  }
}
