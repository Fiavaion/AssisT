/**
 * Voice-command grammar for hands-free control of AssisT.
 *
 * Pure module: no chrome.* APIs, no DOM. Takes a FINAL transcript string
 * (as produced by the STT engine's onResult/finalTranscript path) and
 * either recognises it as a command or returns null so the caller treats
 * it as ordinary dictation.
 *
 * Matching is deliberately conservative: the whole utterance (after an
 * optional wake word and a single leading filler are stripped) must match
 * a known phrase exactly. This avoids swallowing dictation text that
 * merely mentions a command word mid-sentence ("she told me to stop
 * reading" must stay dictation, not fire stop-reading).
 */

const WAKE_WORD = 'assist';

// Tolerate exactly one of these as a leading filler, in addition to the
// wake word (in either order): "assist please read this page",
// "please read this page", "hey open my library".
const FILLERS = ['could you', 'can you', 'please', 'hey'];

// Exact-phrase commands: normalized utterance -> action.
const PHRASE_ACTIONS = {
  // read-page
  'read this page': 'read-page',
  'read the page': 'read-page',
  'read this': 'read-page',
  'read page': 'read-page',
  'read aloud': 'read-page',
  'start reading': 'read-page',

  // stop-reading
  stop: 'stop-reading',
  'stop reading': 'stop-reading',
  pause: 'stop-reading',
  'pause reading': 'stop-reading',

  // save-citation
  'cite this source': 'save-citation',
  'cite this': 'save-citation',
  'save citation': 'save-citation',
  'save this citation': 'save-citation',
  'capture source': 'save-citation',
  'capture this source': 'save-citation',

  // open-library
  'open my library': 'open-library',
  'open library': 'open-library',
  'open my citations': 'open-library',
  'open citations': 'open-library',

  // summarize
  'summarize this': 'summarize',
  'summarize this page': 'summarize',
  'summarize the page': 'summarize',

  // simplify
  'simplify this': 'simplify',
  'simplify this page': 'simplify',
  'simplify the page': 'simplify',

  // open-calculator
  'open calculator': 'open-calculator',
  'open the calculator': 'open-calculator',

  // help
  help: 'help',
  'what can i say': 'help',
  'show help': 'help',
  'voice commands help': 'help',
};

/**
 * Screen-reader-friendly catalogue for a "what can I say" help overlay.
 * @type {Array<{action: string, example: string, description: string}>}
 */
export const COMMAND_HELP = [
  {
    action: 'read-page',
    example: 'Read this page',
    description: 'Start reading the current page aloud.',
  },
  {
    action: 'stop-reading',
    example: 'Stop reading',
    description: 'Stop or pause text-to-speech playback.',
  },
  {
    action: 'save-citation',
    example: 'Cite this source',
    description: 'Save a citation for the current page or selection.',
  },
  { action: 'open-library', example: 'Open my library', description: 'Open the citation library.' },
  {
    action: 'summarize',
    example: 'Summarize this page',
    description: 'Ask AI to summarize the current page.',
  },
  {
    action: 'simplify',
    example: 'Simplify this',
    description: 'Ask AI to simplify the current page text.',
  },
  {
    action: 'open-calculator',
    example: 'Open calculator',
    description: 'Open the accessible calculator.',
  },
  {
    action: 'help',
    example: 'What can I say',
    description: 'Show the list of available voice commands.',
  },
];

/**
 * Lowercase, strip punctuation, collapse whitespace.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/['"]/g, '') // drop apostrophes/quotes: "what's" -> "whats"
    .replace(/[.,!?;:()-]/g, ' ') // other punctuation becomes a word break
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip at most one leading wake word ("assist") and at most one leading
 * filler phrase, in either order.
 * @param {string} normalized
 * @returns {string}
 */
function stripLeadIns(normalized) {
  let words = normalized.length ? normalized.split(' ') : [];
  let wakeStripped = false;
  let fillerStripped = false;
  let changed = true;

  while (changed && (!wakeStripped || !fillerStripped)) {
    changed = false;

    if (!wakeStripped && words[0] === WAKE_WORD) {
      words = words.slice(1);
      wakeStripped = true;
      changed = true;
      continue;
    }

    if (!fillerStripped) {
      for (const filler of FILLERS) {
        const fillerWords = filler.split(' ');
        if (
          words.length >= fillerWords.length &&
          words.slice(0, fillerWords.length).join(' ') === filler
        ) {
          words = words.slice(fillerWords.length);
          fillerStripped = true;
          changed = true;
          break;
        }
      }
    }
  }

  return words.join(' ').trim();
}

/**
 * Parse a final STT transcript into a companion voice command.
 * @param {string} transcript - a FINAL transcript (not interim/partial).
 * @returns {{action: string, matchedPhrase: string}|null}
 *   null means "not a recognised command" — treat as dictation.
 */
export function parseCommand(transcript) {
  if (typeof transcript !== 'string') {
    return null;
  }

  const normalized = normalize(transcript);
  if (!normalized) {
    return null;
  }

  const stripped = stripLeadIns(normalized);
  if (!stripped) {
    return null;
  }

  const action = PHRASE_ACTIONS[stripped];
  return action ? { action, matchedPhrase: stripped } : null;
}
