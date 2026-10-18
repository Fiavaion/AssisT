/**
 * Finding a support by what the student wants to DO.
 *
 * A student who needs help does not know the name of the thing that gives it. They know "the words
 * move around", "read this to me", "I keep losing my place", "too bright", "can't focus". The
 * registry already carries a `keywords` string on every tool; this module is what reads it, and the
 * keywords are written in that problem language for exactly this reason.
 *
 * NO MODEL, NO NETWORK, NO AI. Twenty-nine items do not need embeddings, and the search has to work
 * with AI mode `off`, offline, with nothing leaving the device — the students this is for are often
 * on a school network that allows neither. So it is a pure function over the registry: a query in,
 * ids out, the same answer every time.
 *
 * FOUR WAYS A WORD CAN MATCH, and each one is here because of a case that would otherwise be lost:
 *   - exact, which needs no defence;
 *   - a prefix of three letters or more, so "cita" reaches "citation" — under three letters a
 *     prefix matches most of the registry and is not a query at all. It is the QUERY word that has
 *     to be the prefix: "cite" does not reach "citation" this way, and finds it only because the
 *     registry writes "cite" among its keywords;
 *   - a bounded edit distance, so a misspelling still lands. This is a reading and spelling tool:
 *     a student who types "dyslexa" or "hilight" is precisely the student it is for. The bound
 *     grows with the length of the word being matched — nothing for a short word ("font" must not
 *     find "fold"), one edit for a medium one, two for a long one;
 *   - and a shared stem of five letters on two long words, which is the rule that catches a
 *     phonetic guess at the END of a word. "dictashun" is three edits from "dictation", one more
 *     than the budget a word that long allows, and loosening the budget far enough to accept it
 *     would let it accept words that mean something else — but the student got the beginning right,
 *     as people spelling by ear usually do.
 *
 * A tool matches when EVERY word of the query that is not a stop word matches somewhere in it.
 * Any-of would return most of the list for most queries; all-of means "read bibliography" is not a
 * weak match but no match, which is the honest answer.
 */

/**
 * Words that say nothing about which support is wanted.
 *
 * A student types in sentences — "i want you to read this to me" — and the words carrying the
 * intent are `read` and nothing else. These are dropped from the QUERY only; a support's own text
 * is indexed whole, because "Highlight While Reading" is what the student sees on screen and the
 * words the search knows must be the words that are written there.
 *
 * A query made of nothing but these matches NOTHING rather than everything. "can you help me with
 * this" is not a request for all twenty-nine supports.
 */
const STOP_WORDS = new Set([
  'a',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'cannot',
  'cant',
  'could',
  'do',
  'does',
  'dont',
  'for',
  'from',
  'get',
  'gets',
  'got',
  'had',
  'has',
  'have',
  'help',
  'how',
  'i',
  'if',
  'im',
  'in',
  'into',
  'is',
  'it',
  'its',
  'ive',
  'keep',
  'keeps',
  'make',
  'makes',
  'me',
  'mine',
  'more',
  'my',
  'myself',
  'need',
  'needs',
  'of',
  'off',
  'on',
  'or',
  'out',
  'over',
  'please',
  'really',
  'should',
  'so',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'this',
  'those',
  'to',
  'too',
  'up',
  'very',
  'want',
  'wants',
  'was',
  'were',
  'what',
  'when',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/**
 * How much a match is worth, by where in the tool it was found.
 *
 * The name is what the support is called, so a word in it is the strongest signal there is. The
 * keywords are written for this search and come next. A control or action label is a real part of
 * the tool but often a generic word ("Language", "Colour"), so it ranks with the description.
 */
const WEIGHTS = {
  name: 6,
  keywords: 4,
  group: 2,
  description: 1,
  labels: 1,
};

/** How much of a field's weight each kind of match keeps. Exact beats a guess at the word. */
const EXACT = 1;
const PREFIX = 0.6;
const FUZZY = 0.35;

/** Below this, a prefix matches too much of the registry to mean anything. */
const MIN_PREFIX = 3;

/** Both words this long before a shared stem is allowed to stand in for the whole word. */
const MIN_STEM_WORD = 6;

/** How much of the beginning two long words must share. */
const STEM = 5;

/**
 * Split text into the words the search compares.
 *
 * Apostrophes go rather than splitting the word around them, so "can't" is one token and matches
 * a student who typed "cant" — which most of them do.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenise(text) {
  return String(text === undefined || text === null ? '' : text)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The edits allowed between a query word and a word being matched, by the longer of the two.
 *
 * Nothing under five letters: at four letters one edit reaches a large part of the language, and
 * "font" finding "fold" would make the field feel broken rather than forgiving.
 *
 * @param {number} length
 * @returns {number}
 */
function editBudget(length) {
  if (length < 5) {
    return 0;
  }
  return length < 8 ? 1 : 2;
}

/**
 * Damerau-Levenshtein distance, restricted to adjacent transpositions, and abandoned as soon as it
 * passes `budget` — which is most of the time, so the bound is what keeps a search well under a
 * millisecond over the whole registry. The field still waits for a pause in the typing before it
 * searches, for the sake of what it announces rather than the cost; see `flat-view.js`.
 *
 * The transposition matters more than it looks: "teh" for "the" and "wrods" for "words" are the
 * commonest typing errors there are, and plain Levenshtein charges two edits for them.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} budget
 * @returns {number} the distance, or budget + 1 to mean "further than that"
 */
function withinDistance(a, b, budget) {
  const tooFar = budget + 1;
  if (Math.abs(a.length - b.length) > budget) {
    return tooFar;
  }

  let twoBack = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      let cost = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, twoBack[j - 2] + 1);
      }
      current[j] = cost;
      best = Math.min(best, cost);
    }
    if (best > budget) {
      return tooFar;
    }
    twoBack = previous;
    previous = current;
  }

  return previous[b.length];
}

/**
 * How well one query word matches one indexed word: 0 for not at all, or the share of the field's
 * weight the match keeps.
 *
 * @param {string} queryWord
 * @param {string} word
 * @returns {number}
 */
function wordMatch(queryWord, word) {
  if (queryWord === word) {
    return EXACT;
  }
  if (queryWord.length >= MIN_PREFIX && word.startsWith(queryWord)) {
    return PREFIX;
  }
  const budget = editBudget(Math.max(queryWord.length, word.length));
  if (budget > 0 && withinDistance(queryWord, word, budget) <= budget) {
    return FUZZY;
  }
  // Spelt by ear: the beginning is right and the end is a guess.
  if (
    queryWord.length >= MIN_STEM_WORD &&
    word.length >= MIN_STEM_WORD &&
    queryWord.slice(0, STEM) === word.slice(0, STEM)
  ) {
    return FUZZY;
  }
  return 0;
}

/**
 * The words of one tool, by the field they came from.
 *
 * Held against the tool object itself: the query is re-run on every keystroke and the registry does
 * not change between them, so this is built once per tool for the life of the popup.
 *
 * @type {WeakMap<Object, Object<string, string[]>>}
 */
const indexCache = new WeakMap();

/**
 * @param {Object} tool
 * @returns {Object<string, string[]>}
 */
function indexOf(tool) {
  const cached = indexCache.get(tool);
  if (cached) {
    return cached;
  }

  const labels = [
    ...(tool.controls || []).map(control => control.label),
    ...(tool.actions || []).map(action => action.label),
  ];

  const index = {
    name: tokenise(tool.name),
    keywords: tokenise(tool.keywords),
    group: tokenise(tool.group),
    description: tokenise(tool.description),
    labels: tokenise(labels.join(' ')),
  };
  indexCache.set(tool, index);
  return index;
}

/**
 * Score one tool against the words of a query, or 0 when any one of them is nowhere in it.
 *
 * @param {string[]} queryWords - already lower-cased and stripped of stop words
 * @param {Object} tool
 * @returns {number}
 */
function scoreTool(queryWords, tool) {
  const index = indexOf(tool);
  let total = 0;

  for (const queryWord of queryWords) {
    let best = 0;
    for (const field of Object.keys(WEIGHTS)) {
      const weight = WEIGHTS[field];
      // A field cannot beat a better one it could not have scored higher than anyway.
      if (weight * EXACT <= best) {
        continue;
      }
      for (const word of index[field]) {
        best = Math.max(best, weight * wordMatch(queryWord, word));
      }
    }
    if (best === 0) {
      return 0;
    }
    total += best;
  }

  return total;
}

/**
 * The supports a query is asking for, best first.
 *
 * @param {string} query - what the student typed
 * @param {Object[]} tools - the registry, or the part of it currently on screen
 * @returns {Array<{id:string, score:number}>} empty when nothing matches
 */
export function searchTools(query, tools) {
  const queryWords = tokenise(query).filter(word => !STOP_WORDS.has(word));
  if (queryWords.length === 0 || !Array.isArray(tools)) {
    return [];
  }

  return (
    tools
      .map((tool, order) => ({ id: tool.id, score: scoreTool(queryWords, tool), order }))
      .filter(result => result.score > 0)
      // Registry order breaks a tie, so the same query always gives the same list in the same order.
      .sort((left, right) => right.score - left.score || left.order - right.order)
      .map(({ id, score }) => ({ id, score }))
  );
}
