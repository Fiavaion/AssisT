/**
 * Tests for finding a support by what the student wants to DO.
 *
 * The table in INTENTS is the specification. Every phrase in it is the kind of thing a student
 * types — a problem, not a product name — and the id beside it is the support that has to come
 * back FIRST. It runs against the real registry rather than a fixture on purpose: the matching
 * rules and the `keywords` strings are one feature between them, and a fixture would let the
 * keywords rot while the tests stayed green.
 *
 * Everything here is on-device: no AI mode, no network, no model. A student with AI switched off
 * and no connection gets the same results as anyone else, which is why the search is a pure
 * function over the registry and not a call to anything.
 */

import { searchTools } from '../../../../src/popup/flat/flat-search.js';
import { TOOLS, toolById } from '../../../../src/popup/registry/tool-registry.js';

/** The ids a query returns, best first. */
const ids = query => searchTools(query, TOOLS).map(result => result.id);

/** The support a query should land on, in the words a student would actually use. */
const INTENTS = [
  // ── Reading ───────────────────────────────────────────────────────────────
  { query: 'read to me', top: 'tts' },
  { query: 'listen to this page', top: 'tts' },
  { query: 'words move when i read', top: 'dyslexia-mode' },
  { query: 'letters jump around', top: 'dyslexia-mode' },
  { query: 'single word at a time', top: 'word-by-word' },
  { query: 'text in a picture', top: 'ocr' },
  { query: 'screenshot', top: 'ocr' },
  { query: 'sums and equations', top: 'maths' },
  { query: 'how long is this to read', top: 'text-stats' },
  { query: 'word limit', top: 'text-stats' },
  { query: 'i dont understand this language', top: 'translation' },
  { query: 'strip the page back to the article', top: 'reading-mode' },

  // ── Writing ───────────────────────────────────────────────────────────────
  { query: 'cant type', top: 'stt' },
  { query: 'write for me', top: 'stt' },
  { query: 'jot down a note', top: 'annotations' },
  { query: 'referencing and bibliography', top: 'citation' },
  { query: 'plagiarism', top: 'citation' },
  { query: 'menu when i select text', top: 'highlight-menu' },

  // ── Seeing ────────────────────────────────────────────────────────────────
  { query: 'too bright', top: 'screen-overlay' },
  { query: 'my eyes hurt', top: 'screen-overlay' },
  { query: 'cramped text', top: 'text-customization' },
  { query: 'i lose my place', top: 'reading-guide' },
  { query: 'things moving make me dizzy', top: 'reduced-motion' },
  { query: 'lost the mouse pointer', top: 'custom-cursor' },
  { query: 'make things bigger on screen', top: 'magnifying-lens' },

  // ── Focus ─────────────────────────────────────────────────────────────────
  { query: 'cant focus', top: 'focus-mode' },
  { query: 'ads and sidebars', top: 'simplify' },
  { query: 'stop autoplay videos', top: 'media-control' },
  { query: 'i procrastinate', top: 'pomodoro' },
  { query: 'how far have i read on this page', top: 'reading-progress' },

  // ── Study ─────────────────────────────────────────────────────────────────
  { query: 'plan my essay', top: 'mindmap' },
  { query: 'brainstorm ideas', top: 'mindmap' },
  { query: 'quiz help on canvas', top: 'canvas' },
  { query: 'moodle forum', top: 'moodle' },
  { query: 'google classroom classwork', top: 'google-classroom' },
  { query: 'ai help with coursework', top: 'ai' },

  // ── Spelt the way it sounds ───────────────────────────────────────────────
  // The audience for this search includes students who cannot spell the word for the support
  // that would help them spell. A misspelling has to land.
  { query: 'hilight', top: 'highlight' },
  { query: 'dyslexa', top: 'dyslexia-mode' },
  { query: 'dictashun', top: 'stt' },
];

describe('searchTools — intent, not product names', () => {
  INTENTS.forEach(({ query, top }) => {
    it(`“${query}” finds ${top}`, () => {
      const found = ids(query);
      expect(found).toContain(top);
      expect(found[0]).toBe(top);
    });
  });

  it('covers every group, so no part of the registry is unreachable by intent', () => {
    const groups = new Set(INTENTS.map(({ top }) => toolById(top).group));
    expect([...groups].sort()).toEqual(['Focus', 'Reading', 'Seeing', 'Study', 'Writing']);
  });

  it('returns the strongest match first', () => {
    const scores = searchTools('read to me', TOOLS).map(result => result.score);
    expect(scores.length).toBeGreaterThan(1);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('only ever returns ids that are in the registry', () => {
    INTENTS.forEach(({ query }) => {
      ids(query).forEach(id => expect(toolById(id)).toBeDefined());
    });
  });
});

describe('searchTools — what must NOT match', () => {
  it('does not mistake a short word for a different short word', () => {
    // "font" and "fold" are one edit apart, and so are "font" and "focus" once you squint. A
    // student typing font wants the font control, not the Focus Mode overlay.
    const found = ids('font');
    expect(found).toContain('text-customization');
    expect(found).not.toContain('focus-mode');
  });

  it('gives the word “focus” to Focus Mode', () => {
    // Four supports claimed it as a keyword of their own, so the one support actually named for it
    // could be outranked by a ruler line or a timer. Reading Guide, Simplified Interface and Pomodoro
    // gave it up, and this is what keeps them honest.
    //
    // The other members of the Focus GROUP still come back, on the strength of what their group is
    // called — which is right: a student typing "focus" should see what is in there. They just come
    // back beneath the support the word belongs to.
    const scores = new Map(searchTools('focus', TOOLS).map(hit => [hit.id, hit.score]));
    expect([...scores.keys()][0]).toBe('focus-mode');
    ['reading-guide', 'simplify', 'pomodoro'].forEach(id =>
      expect(scores.get(id) || 0).toBeLessThan(scores.get('focus-mode'))
    );
  });

  it('finds nothing for a query made only of stop words', () => {
    // Every one of these words is in every sentence. Matching them would return the whole list
    // and teach the student that the field does nothing.
    ['the', 'i want to', 'can you help me with this', 'it is'].forEach(query =>
      expect(ids(query)).toEqual([])
    );
  });

  it('finds nothing for an empty query or one with no letters in it', () => {
    ['', '   ', '...', '!!'].forEach(query => expect(ids(query)).toEqual([]));
  });

  it('finds nothing for a word that is in nothing', () => {
    expect(ids('xylophone')).toEqual([]);
    expect(ids('qqqqqqq')).toEqual([]);
  });

  it('needs every word of the query to land somewhere in the same support', () => {
    // Read Aloud answers "read"; nothing answers "read" AND "bibliography" together, so the
    // pair is not a weaker match — it is no match.
    expect(ids('read')).toContain('tts');
    expect(ids('bibliography')).toContain('citation');
    expect(ids('read bibliography')).toEqual([]);
  });
});

describe('searchTools — how a query is read', () => {
  it('pays no attention to case, punctuation or the apostrophe in a contraction', () => {
    // Three spellings of the same sentence. A student typing in capitals, or typing "can't" where
    // the keywords say "cant", is asking the same question.
    expect(ids("I CAN'T Read — the words move!")).toEqual(ids('i cant read the words move'));
    expect(ids('words move when I READ...')).toContain('dyslexia-mode');
    expect(ids("can't type")).toEqual(ids('cant type'));
  });

  it('splits a hyphenated name into its words', () => {
    // "Speech-to-Text" is one string in the registry and three words to a student.
    expect(ids('speech to text')).toContain('stt');
  });

  it('gives nothing back for nothing, whatever shape the nothing is', () => {
    expect(searchTools('', TOOLS)).toEqual([]);
    expect(searchTools(undefined, TOOLS)).toEqual([]);
    expect(searchTools(null, TOOLS)).toEqual([]);
    expect(searchTools('read', undefined)).toEqual([]);
  });

  it('searches only the tools it is handed', () => {
    // The model passes the part of the registry currently on screen, so the search composes with
    // the filter instead of reaching past it.
    const reading = TOOLS.filter(tool => tool.group === 'Reading');
    expect(ids('i procrastinate')).toContain('pomodoro');
    expect(searchTools('i procrastinate', reading)).toEqual([]);
  });
});

describe('searchTools — how forgiving it is', () => {
  it('matches a prefix of three letters or more', () => {
    expect(ids('cite')).toContain('citation');
    expect(ids('magnif')).toContain('magnifying-lens');
  });

  it('does not match a one or two letter fragment against everything', () => {
    // "re" is the start of read, reading, reference, reduce. A two-letter prefix is not a query.
    expect(ids('re')).toEqual([]);
  });

  it('tolerates one wrong letter in a medium word and two in a long one', () => {
    expect(ids('pomodoro')).toContain('pomodoro');
    expect(ids('pomadoro')).toContain('pomodoro');
    expect(ids('bibliografy')).toContain('citation');
  });

  it('does not tolerate any wrong letter in a short word', () => {
    // Four letters and one edit covers a large part of the language.
    expect(ids('mind')).toContain('mindmap');
    expect(ids('mint')).not.toContain('mindmap');
  });
});

describe('searchTools — plain intents that used to find nothing', () => {
  it('finds the two supports that make a page quiet', () => {
    // Overnight testing typed "quiet" and got nothing back, with Auto-play Blocking and Reduced
    // Motion sitting right there. The word was in neither set of keywords — and a support is only
    // findable by the words written there, so a missing one is a support the student cannot reach.
    const found = ids('quiet');
    expect(found).toContain('media-control');
    expect(found).toContain('reduced-motion');
  });

  it('still finds them from the fuller sentences a student types', () => {
    expect(ids('make it quiet')).toContain('media-control');
    expect(ids('i need the page quiet')).toContain('reduced-motion');
  });
});
