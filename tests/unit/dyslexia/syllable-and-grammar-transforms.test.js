/**
 * @jest-environment jsdom
 *
 * What syllable highlighting and grammar colour-coding actually put on the page.
 *
 * The sibling tests cover the two halves either side of this one: syllable-contrast.test.js
 * grades the shipped colour constants, and restore-host-nodes.test.js proves applying and
 * removing a variant leaves the host page intact. Neither looks at the transform in between —
 * whether a word is split into syllables at all, whether the two tints actually alternate,
 * whether a grammar category gets both of its cues. That is what is here.
 *
 * Everything is driven through dyslexia_initialize() and the settings listener, the way the
 * content script runs it, because the two transform functions are module-private and calling
 * them directly would test a private shape rather than the feature.
 *
 * jsdom is the right environment for this: the assertions are about DOM structure and about
 * inline style values the code itself sets, both of which jsdom reports faithfully. Nothing
 * here rests on layout, on offsetParent or on an inherited computed style.
 */

jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
}));
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: jest.fn(),
}));

const {
  DYSLEXIA_SYLLABLE_TINTS,
  DYSLEXIA_GRAMMAR_STYLES,
} = require('../../../src/content/features/dyslexia.js');

let dyslexia;
let storageUtils;

/**
 * Turn the feature on with one variant selected and let its startup timer fire.
 *
 * @param {'bionic'|'syllable'|'grammar'} variant - The one variant under test.
 */
async function enable(variant) {
  storageUtils.getSettings.mockResolvedValue({
    dyslexiaMode: {
      enabled: true,
      bionicReading: variant === 'bionic',
      syllableHighlighting: variant === 'syllable',
      grammarColors: variant === 'grammar',
    },
  });
  await dyslexia.dyslexia_initialize();
  jest.advanceTimersByTime(600);
  await Promise.resolve();
}

/** The syllable spans belonging to one word, in document order. */
function syllablesOf(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .assist-syllable`));
}

/** Every grammar span in the paragraph, keyed by the word it carries. */
function grammarByWord() {
  const byWord = {};
  document.querySelectorAll('.assist-grammar').forEach(span => {
    byWord[span.textContent] = span;
  });
  return byWord;
}

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  storageUtils = require('../../../src/content/utils/storage-utils.js');
  dyslexia = require('../../../src/content/features/dyslexia.js');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.body.removeAttribute('style');
});

describe('syllable highlighting splits the word', () => {
  test('a multi-syllable word becomes more than one span, and the spans still spell it', async () => {
    document.body.innerHTML = '<p id="para">remember</p>';

    await enable('syllable');

    const spans = syllablesOf('para');
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.map(s => s.textContent).join('')).toBe('remember');
  });

  test('a word of three characters or fewer is left whole', async () => {
    // The splitter returns short words unsplit on purpose: "eat" has one syllable, and two
    // tints across three letters would say there were two. Without that guard the vowel-cluster
    // rule would cut this very word into "ea" and "t".
    document.body.innerHTML = '<p id="para">eat</p>';

    await enable('syllable');

    const spans = syllablesOf('para');
    expect(spans).toHaveLength(1);
    expect(spans[0].textContent).toBe('eat');
  });

  test('the space between two words is plain text, not a tinted span', async () => {
    // A tinted gap would join the two words into one block of colour and destroy the very
    // boundary the tints exist to show.
    document.body.innerHTML = '<p id="para">remember letters</p>';

    await enable('syllable');

    const spanTexts = syllablesOf('para').map(s => s.textContent);
    spanTexts.forEach(text => {
      expect(text.trim()).not.toBe('');
    });
    expect(document.getElementById('para').textContent).toBe('remember letters');
  });
});

describe('syllable highlighting alternates exactly two tints', () => {
  test('consecutive syllables of one word swap tint, starting with the first of the pair', async () => {
    document.body.innerHTML = '<p id="para">remember</p>';
    const [first, second] = DYSLEXIA_SYLLABLE_TINTS.light;

    await enable('syllable');

    const backgrounds = syllablesOf('para').map(s => s.style.backgroundColor);
    expect(backgrounds.length).toBeGreaterThan(1);
    backgrounds.forEach((background, index) => {
      expect(background).toBe(index % 2 === 0 ? first : second);
    });
  });

  test('no syllable is left untinted', async () => {
    // An untinted syllable reads as a gap in the word rather than as a boundary.
    document.body.innerHTML = '<p id="para">remember the alphabet letters</p>';
    const pair = DYSLEXIA_SYLLABLE_TINTS.light;

    await enable('syllable');

    const spans = syllablesOf('para');
    expect(spans.length).toBeGreaterThan(4);
    spans.forEach(span => {
      expect(pair).toContain(span.style.backgroundColor);
    });
  });

  test('a dark page gets the dark pair, so the page keeps its own words legible', async () => {
    // The palette is chosen from the ground the words sit on, read once per apply. A pale wash
    // behind the near-white text of a dark theme is the failure this pair exists to avoid.
    document.body.innerHTML = '<p id="para">remember the alphabet</p>';
    document.body.style.backgroundColor = 'rgb(18, 18, 18)';

    await enable('syllable');

    const backgrounds = new Set(syllablesOf('para').map(s => s.style.backgroundColor));
    DYSLEXIA_SYLLABLE_TINTS.dark.forEach(tint => expect(backgrounds).toContain(tint));
    DYSLEXIA_SYLLABLE_TINTS.light.forEach(tint => expect(backgrounds).not.toContain(tint));
  });

  test('a light page gets the light pair', async () => {
    document.body.innerHTML = '<p id="para">remember the alphabet</p>';
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';

    await enable('syllable');

    const backgrounds = new Set(syllablesOf('para').map(s => s.style.backgroundColor));
    DYSLEXIA_SYLLABLE_TINTS.light.forEach(tint => expect(backgrounds).toContain(tint));
    DYSLEXIA_SYLLABLE_TINTS.dark.forEach(tint => expect(backgrounds).not.toContain(tint));
  });
});

describe('grammar colour-coding marks a category with two cues', () => {
  test('an adjective gets its tint and a 3px underline in its own accent and line style', async () => {
    // Colour alone cannot carry four categories at these luminances, so the underline is not
    // decoration: it is the second cue that survives colour blindness and a monochrome display.
    // It is 3px because Chrome paints a double border narrower than that as a single solid
    // line, which made the verb's cue identical to the noun's.
    document.body.innerHTML = '<p id="para">The lazy dog sleeps.</p>';
    const adjective = DYSLEXIA_GRAMMAR_STYLES.light.adjective;

    await enable('grammar');

    const span = grammarByWord().lazy;
    expect(span).toBeDefined();
    expect(span.dataset.assistGrammar).toBe('adjective');
    expect(span.style.backgroundColor).toBe(adjective.tint);
    expect(span.style.borderBottomWidth).toBe('3px');
    expect(span.style.borderBottomStyle).toBe(adjective.line);
    expect(span.style.borderBottomColor).toBe(adjective.accent);
  });

  test.each([['noun'], ['verb'], ['adjective'], ['adverb']])(
    'the %s cue carries its own line style, so the four stay apart without colour',
    async category => {
      document.body.innerHTML =
        '<p id="para">The quick brown fox jumps over the lazy dog and reads books.</p>' +
        '<p id="para2">Teachers explain grammar very clearly.</p>';
      const style = DYSLEXIA_GRAMMAR_STYLES.light[category];

      await enable('grammar');

      const marked = document.querySelectorAll(`[data-assist-grammar="${category}"]`);
      expect(marked.length).toBeGreaterThan(0);
      marked.forEach(span => {
        expect(span.style.borderBottomStyle).toBe(style.line);
        expect(span.style.borderBottomWidth).toBe('3px');
      });
    }
  );

  test('a word in none of the four categories is left as the page wrote it', async () => {
    // An untinted word is itself information: tinting everything would group nothing.
    document.body.innerHTML = '<p id="para">The lazy dog sleeps.</p>';

    await enable('grammar');

    const span = grammarByWord().The;
    expect(span).toBeDefined();
    expect(span.dataset.assistGrammar).toBeUndefined();
    expect(span.style.backgroundColor).toBe('');
    expect(span.style.borderBottom).toBe('');
  });

  test('a dark page gets the dark grammar set', async () => {
    document.body.innerHTML = '<p id="para">The lazy dog sleeps.</p>';
    document.body.style.backgroundColor = 'rgb(18, 18, 18)';

    await enable('grammar');

    const span = grammarByWord().lazy;
    expect(span.style.backgroundColor).toBe(DYSLEXIA_GRAMMAR_STYLES.dark.adjective.tint);
  });
});

/**
 * The part of speech each occurrence of a word was given, in document order.
 *
 * @param {string} word - The word as the page wrote it.
 * @returns {Array<string|undefined>}
 */
function categoriesOf(word) {
  return Array.from(document.querySelectorAll('.assist-grammar'))
    .filter(span => span.textContent === word)
    .map(span => span.dataset.assistGrammar);
}

describe('grammar colour-coding tags each word, not each phrase', () => {
  // The tagging runs the real compromise library. The defect this guards was a misreading of
  // what that library returns (whole phrases, in the page's case), which a mock would repeat.

  test('every noun in a plain sentence is tinted as a noun', async () => {
    document.body.innerHTML =
      '<p id="para">The quick brown fox jumps over the lazy dog and reads books.</p>';
    const noun = DYSLEXIA_GRAMMAR_STYLES.light.noun;

    await enable('grammar');

    const byWord = grammarByWord();
    ['fox', 'dog', 'books'].forEach(word => {
      expect(byWord[word].dataset.assistGrammar).toBe('noun');
      expect(byWord[word].style.backgroundColor).toBe(noun.tint);
    });
    expect(byWord.jumps.dataset.assistGrammar).toBe('verb');
  });

  test('each of the four parts of speech is tinted on plain sentences', async () => {
    document.body.innerHTML =
      '<p id="para">The quick brown fox jumps over the lazy dog and reads books.</p>' +
      '<p id="para2">Teachers explain grammar very clearly.</p>';
    const light = DYSLEXIA_GRAMMAR_STYLES.light;

    await enable('grammar');

    const expected = {
      fox: 'noun',
      dog: 'noun',
      books: 'noun',
      grammar: 'noun',
      jumps: 'verb',
      reads: 'verb',
      explain: 'verb',
      quick: 'adjective',
      lazy: 'adjective',
      very: 'adverb',
      clearly: 'adverb',
    };
    const byWord = grammarByWord();
    Object.entries(expected).forEach(([word, category]) => {
      expect({ word, category: byWord[word]?.dataset.assistGrammar }).toEqual({ word, category });
      expect(byWord[word].style.backgroundColor).toBe(light[category].tint);
    });
  });

  test('trailing punctuation stays outside the word, and a capital does not stop the match', async () => {
    document.body.innerHTML = '<p id="para">Teachers explain grammar very clearly.</p>';

    await enable('grammar');

    const byWord = grammarByWord();
    expect(byWord.Teachers.dataset.assistGrammar).toBe('noun');
    expect(byWord.clearly.dataset.assistGrammar).toBe('adverb');
    // The full stop is plain page text, not part of a tinted word.
    document.querySelectorAll('.assist-grammar').forEach(span => {
      expect(span.textContent).toMatch(/^[\p{L}\p{N}'’-]+$/u);
    });
    expect(document.getElementById('para').textContent).toBe(
      'Teachers explain grammar very clearly.'
    );
  });

  test('a word used twice as two parts of speech is coloured per occurrence', async () => {
    document.body.innerHTML = '<p id="para">We record the record.</p>';

    await enable('grammar');

    expect(categoriesOf('record')).toEqual(['verb', 'noun']);
  });

  test('a pronoun is not coloured as a noun', async () => {
    document.body.innerHTML = '<p id="para">She writes essays.</p>';

    await enable('grammar');

    expect(categoriesOf('She')).toEqual([undefined]);
    expect(categoriesOf('essays')).toEqual(['noun']);
  });

  test('a contraction stays one word, tinted as the verb it is', async () => {
    document.body.innerHTML = '<p id="para">The student doesn’t sleep.</p>';

    await enable('grammar');

    expect(categoriesOf('doesn’t')).toEqual(['verb']);
    expect(document.getElementById('para').textContent).toBe('The student doesn’t sleep.');
  });

  test('a hyphenated word keeps its hyphen as page text between its two tagged halves', async () => {
    document.body.innerHTML = '<p id="para">The well-known author writes.</p>';

    await enable('grammar');

    expect(categoriesOf('known')).toEqual(['adjective']);
    expect(categoriesOf('author')).toEqual(['noun']);
    document.querySelectorAll('.assist-grammar').forEach(span => {
      expect(span.textContent).not.toContain('-');
    });
    expect(document.getElementById('para').textContent).toBe('The well-known author writes.');
  });

  test('a word inside the page s own inline markup is tagged in place', async () => {
    document.body.innerHTML =
      '<p id="para">The <b id="bold">dog</b> <a id="link" href="/x">jumps</a> quickly.</p>';
    const bold = document.getElementById('bold');
    const link = document.getElementById('link');

    await enable('grammar');

    expect(document.getElementById('bold')).toBe(bold);
    expect(document.getElementById('link')).toBe(link);
    expect(bold.querySelector('.assist-grammar').dataset.assistGrammar).toBe('noun');
    expect(link.querySelector('.assist-grammar').dataset.assistGrammar).toBe('verb');
    expect(categoriesOf('quickly')).toEqual(['adverb']);
  });

  test('code inside a paragraph is left alone and the words after it still line up', async () => {
    // The paragraph is tagged as one string, so the code's characters count towards every
    // later word's position even though the code itself is never wrapped.
    document.body.innerHTML =
      '<p id="para">The <code id="code">x = books</code> dog sleeps soundly.</p>';

    await enable('grammar');

    expect(document.getElementById('code').innerHTML).toBe('x = books');
    expect(categoriesOf('dog')).toEqual(['noun']);
    expect(categoriesOf('soundly')).toEqual(['adverb']);
  });

  test('the page still reads as the sentence it was', async () => {
    const sentence = 'The quick brown fox jumps over the lazy dog and reads books.';
    document.body.innerHTML = `<p id="para">${sentence}</p>`;

    await enable('grammar');

    expect(document.querySelectorAll('.assist-grammar').length).toBeGreaterThan(5);
    expect(document.getElementById('para').textContent).toBe(sentence);
  });

  test('switching the option off gives the paragraph back exactly', async () => {
    document.body.innerHTML =
      '<p id="para">The <b>dog</b> jumps quickly, and <i>we</i> record the record.</p>';
    const para = document.getElementById('para');
    const before = para.innerHTML;

    await enable('grammar');
    expect(para.querySelectorAll('[data-assist-grammar]').length).toBeGreaterThan(0);

    const onChange = storageUtils.onSettingsChange.mock.calls[0][0];
    onChange({ dyslexiaMode: { enabled: false, grammarColors: true } });

    expect(para.innerHTML).toBe(before);
    expect(document.querySelectorAll('.assist-grammar').length).toBe(0);
  });

  test('an editable region and AssisT s own UI are never tagged', async () => {
    document.body.innerHTML =
      '<p id="para">The dog sleeps.</p>' +
      '<p id="edit" contenteditable="true">The cat sleeps.</p>' +
      '<div id="assist-panel"><p>The bird sings.</p></div>';

    await enable('grammar');

    expect(document.querySelectorAll('#edit .assist-grammar').length).toBe(0);
    expect(document.querySelectorAll('#assist-panel .assist-grammar').length).toBe(0);
    expect(categoriesOf('dog')).toEqual(['noun']);
  });
});
