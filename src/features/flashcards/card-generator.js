/**
 * Deterministic flashcard generation.
 *
 * `fromHighlight` builds a cloze card from captured text with plain string logic — no AI, no
 * network. Pure module — no chrome.*, no Date.now().
 */

const MIN_CLOZE_WORDS = 8;
const MIN_CLOZE_WORD_LENGTH = 5;

// Common function words that make poor cloze targets (too easy / not "content").
const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'their',
  'there',
  'which',
  'would',
  'should',
  'could',
  'these',
  'those',
  'where',
  'while',
  'because',
  'before',
  'between',
  'through',
  'being',
  'doing',
  'having',
  'other',
  'another',
  'still',
  'though',
  'always',
  'never',
  'every',
  'something',
  'someone',
  'anything',
  'nothing',
  'everyone',
  'himself',
  'herself',
  'itself',
  'themselves',
  'ourselves',
  'yourself',
  'yourselves',
  'myself',
  'also',
  'from',
  'with',
  'that',
  'this',
  'then',
  'than',
  'when',
  'what',
  'into',
  'onto',
  'over',
  'under',
  'above',
  'below',
  'during',
  'until',
  'against',
  'among',
  'around',
  'within',
  'without',
  'toward',
  'towards',
]);

/**
 * Build a cloze-deletion card from a captured text highlight: the longest content word
 * (>= 5 chars, not a stopword) is blanked out.
 * @param {{text:string, pageTitle?:string}} input
 * @returns {{front:string, back:string, pageTitle?:string}|null} null when there's too little text
 */
export function fromHighlight({ text, pageTitle } = {}) {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < MIN_CLOZE_WORDS) {
    return null;
  }

  let best = null;
  const wordRegex = /[A-Za-z][A-Za-z'-]*/g;
  let match = wordRegex.exec(trimmed);
  while (match !== null) {
    const word = match[0];
    if (word.length >= MIN_CLOZE_WORD_LENGTH && !STOPWORDS.has(word.toLowerCase())) {
      if (!best || word.length > best.word.length) {
        best = { word, index: match.index };
      }
    }
    match = wordRegex.exec(trimmed);
  }

  if (!best) {
    return null;
  }

  const front = `${trimmed.slice(0, best.index)}____${trimmed.slice(best.index + best.word.length)}`;
  const card = { front, back: best.word };

  if (typeof pageTitle === 'string' && pageTitle.trim()) {
    card.pageTitle = pageTitle.trim();
  }

  return card;
}
