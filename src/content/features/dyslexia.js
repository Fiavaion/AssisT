/**
 * Dyslexia Mode Feature
 * Three modes: Syllable Highlighting, Grammar Color-Coding, Bionic Reading
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../../core/ui/toast.js';
import { isDarkSurface, parseCssColor } from '../../features/annotations/annotation-colors.js';
import nlp from 'compromise';
import {
  mountGrammarLegend,
  paintGrammarCue,
  unmountGrammarLegend,
} from './dyslexia-grammar-legend.js';

// Dyslexia Mode State (Feature Isolated)
let dyslexiaMode_enabled = false;
const dyslexiaMode_settings = {
  bionicReading: false,
  syllableHighlighting: true,
  grammarColors: false,
};

/**
 * Resolve which single variant is active from stored settings.
 * Explicit stored choices always win; only missing variant state falls back to the
 * syllable default. Bionic stays opt-in — its claimed reading benefits did not
 * survive empirical testing (Snell 2024, Acta Psychologica).
 */
export function dyslexia_resolveVariant(dmSettings = {}) {
  const bionic = dmSettings?.bionicReading === true;
  const syllable = dmSettings?.syllableHighlighting === true;
  const grammar = dmSettings?.grammarColors === true;

  if (bionic || syllable || grammar) {
    return { bionicReading: bionic, syllableHighlighting: syllable, grammarColors: grammar };
  }

  return { bionicReading: false, syllableHighlighting: true, grammarColors: false };
}
/**
 * Every text node this feature swapped out, with the nodes put in its place.
 *
 * Restoring used to re-serialise each processed element through `innerHTML`, which is
 * how a single toggle destroyed 358 of Wikipedia's own elements — reference `<cite>`,
 * `<abbr title>`, `<bdi>`, `<q>`, `<link>`, `<meta>` — along with every listener the page
 * had bound to them. Nothing but the page's text nodes is ours to touch, so the record
 * is per text node and restoring puts the original node back where it was.
 *
 * @type {Array<{original: Text, inserted: Array<Node>}>}
 */
const dyslexiaMode_textReplacements = [];
const dyslexiaMode_processedElements = new Set(); // Track processed elements

/**
 * Syllable tints, as opaque colours.
 *
 * A translucent wash makes the ratio the page's to decide: at alpha 0.58 the old blue
 * left a default link, rgb(51, 102, 204), at 3.43:1 and the old yellow at 4.37:1, both
 * under SC 1.4.3. Opaque tints are a property of these values instead, and every ratio
 * is asserted in tests/unit/dyslexia/syllable-contrast.test.js.
 *
 * There are two pairs for the reason the annotation palette has two: a pale tint behind
 * the near-white text of a dark theme destroys the words it is meant to group.
 *
 * @type {Readonly<{light: ReadonlyArray<string>, dark: ReadonlyArray<string>}>}
 */
export const DYSLEXIA_SYLLABLE_TINTS = Object.freeze({
  light: Object.freeze(['rgb(228, 240, 255)', 'rgb(255, 245, 204)']),
  dark: Object.freeze(['rgb(23, 42, 71)', 'rgb(61, 45, 10)']),
});

/**
 * Grammar colour-coding, as opaque tints with a saturated underline.
 *
 * The washes this replaces were translucent (alpha 0.48), which left a default link,
 * rgb(51, 102, 204), at 3.15:1 — under SC 1.4.3 on every link in the paragraph. Pale enough
 * to keep the page's own words at 4.5:1 means four tints that are close in luminance, so the
 * category is carried by a 3px underline in a saturated version of the same colour rather
 * than by the wash alone.
 *
 * The underline style differs per category as well as the colour, so a student who cannot
 * separate the hues, or who is reading in monochrome, still sees four distinguishable groups
 * (SC 1.4.1); the grammar colours key (dyslexia-grammar-legend.js) names each style in words.
 * The accent clears 3:1 against its own tint so the line itself is visible (SC 1.4.11).
 *
 * Two sets, for the reason the syllable tints have two: a pale wash behind the near-white text
 * of a dark theme destroys the words it is meant to group. Every ratio is asserted in
 * tests/unit/dyslexia/syllable-contrast.test.js.
 *
 * @type {Readonly<Object<string, Readonly<Object<string, {tint: string, accent: string, line: string}>>>>}
 */
export const DYSLEXIA_GRAMMAR_STYLES = Object.freeze({
  light: Object.freeze({
    noun: Object.freeze({ tint: 'rgb(224, 238, 255)', accent: 'rgb(21, 87, 176)', line: 'solid' }),
    verb: Object.freeze({ tint: 'rgb(222, 245, 223)', accent: 'rgb(27, 105, 42)', line: 'double' }),
    adjective: Object.freeze({
      tint: 'rgb(243, 234, 252)',
      accent: 'rgb(111, 44, 145)',
      line: 'dashed',
    }),
    adverb: Object.freeze({
      tint: 'rgb(255, 240, 213)',
      accent: 'rgb(150, 75, 0)',
      line: 'dotted',
    }),
  }),
  dark: Object.freeze({
    noun: Object.freeze({ tint: 'rgb(16, 36, 64)', accent: 'rgb(125, 177, 255)', line: 'solid' }),
    verb: Object.freeze({ tint: 'rgb(12, 42, 20)', accent: 'rgb(118, 209, 134)', line: 'double' }),
    adjective: Object.freeze({
      tint: 'rgb(36, 22, 54)',
      accent: 'rgb(200, 150, 240)',
      line: 'dashed',
    }),
    adverb: Object.freeze({ tint: 'rgb(54, 32, 4)', accent: 'rgb(240, 175, 90)', line: 'dotted' }),
  }),
});

/**
 * Is the page the words sit on a light one or a dark one?
 *
 * The background is the better signal because it is what a tint replaces, but it is not
 * always readable. The page's own text colour answers the same question the other way round
 * — light text means a dark page — and with neither reading, light is the safe default, since
 * a page that sets no colours at all is a white one.
 *
 * @param {{backgroundColor?: string|null, textColor?: string|null}} [surface]
 * @returns {'light'|'dark'}
 */
function dyslexia_resolveSurfaceVariant(surface = {}) {
  const background = parseCssColor(surface.backgroundColor);
  if (background && background.a >= 1) {
    return isDarkSurface([background.r, background.g, background.b]) ? 'dark' : 'light';
  }

  const text = parseCssColor(surface.textColor);
  if (text && text.a > 0) {
    return isDarkSurface([text.r, text.g, text.b]) ? 'light' : 'dark';
  }

  return 'light';
}

/**
 * Pick the syllable tint pair for the page the words are on.
 *
 * @param {{backgroundColor?: string|null, textColor?: string|null}} [surface]
 * @returns {ReadonlyArray<string>} The two tints, in alternation order.
 */
export function dyslexia_resolveSyllableTints(surface = {}) {
  return DYSLEXIA_SYLLABLE_TINTS[dyslexia_resolveSurfaceVariant(surface)];
}

/**
 * Pick the grammar set for the page the words are on — the same reading of the page as the
 * syllable tints get, so the two variants can never disagree about what kind of page this is.
 *
 * @param {{backgroundColor?: string|null, textColor?: string|null}} [surface]
 * @returns {Readonly<Object<string, {tint: string, accent: string, line: string}>>}
 */
export function dyslexia_resolveGrammarStyles(surface = {}) {
  return DYSLEXIA_GRAMMAR_STYLES[dyslexia_resolveSurfaceVariant(surface)];
}

/**
 * Read the page's ground once per apply: the body's background if it paints, else the
 * root element's, plus the body's text colour as the fallback signal.
 *
 * @returns {{backgroundColor: string|null, textColor: string|null}}
 */
function dyslexia_readPageSurface() {
  const view = document.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') {
    return { backgroundColor: null, textColor: null };
  }

  const opaqueBackground = element => {
    if (!element) {
      return null;
    }
    const value = view.getComputedStyle(element)?.backgroundColor;
    const parsed = parseCssColor(value);
    return parsed && parsed.a >= 1 ? value : null;
  };

  return {
    backgroundColor: opaqueBackground(document.body) || opaqueBackground(document.documentElement),
    textColor: document.body ? view.getComputedStyle(document.body)?.color || null : null,
  };
}

/**
 * Put the styled nodes built from a text node in its place, remembering both sides.
 *
 * @param {Text} textNode - The page's own text node.
 * @param {DocumentFragment} fragment - The nodes that replace it.
 */
function dyslexia_swapTextNode(textNode, fragment) {
  const parent = textNode.parentNode;
  if (!parent) {
    return;
  }

  const inserted = Array.from(fragment.childNodes);
  parent.replaceChild(fragment, textNode);
  dyslexiaMode_textReplacements.push({ original: textNode, inserted });
}

/**
 * Put every original text node back where its styled nodes are sitting.
 *
 * Walked backwards so a node inserted later is undone first, and anchored on the styled
 * nodes themselves rather than on a remembered index: a page script may have moved or
 * removed them in the meantime, and one that is gone only costs its own record.
 *
 * @returns {{restored: number, orphaned: number}}
 */
function dyslexia_restoreTextNodes() {
  let restored = 0;
  let orphaned = 0;

  for (let i = dyslexiaMode_textReplacements.length - 1; i >= 0; i--) {
    const { original, inserted } = dyslexiaMode_textReplacements[i];
    const anchor = inserted.find(node => node.parentNode);
    if (!anchor) {
      orphaned++;
      continue;
    }

    anchor.parentNode.insertBefore(original, anchor);
    inserted.forEach(node => node.parentNode?.removeChild(node));
    restored++;
  }

  dyslexiaMode_textReplacements.length = 0;
  return { restored, orphaned };
}

/**
 * Tags whose text is code, markup or a control's own value, so it is never re-styled.
 */
const DYSLEXIA_SKIP_TAGS = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
  'select',
  'option',
];

/**
 * Whether an element is part of AssisT's own injected UI, which the extension must never
 * rewrite: its panels carry ids and classes that start with "assist".
 *
 * @param {Element} node
 * @returns {boolean}
 */
function dyslexia_isAssistOwned(node) {
  const id = typeof node.id === 'string' ? node.id : '';
  if (/^assist/i.test(id)) {
    return true;
  }

  const classAttr = typeof node.className === 'string' ? node.className : '';
  return classAttr.split(/\s+/).some(name => /^assist/i.test(name));
}

/**
 * Whether dyslexia styling must leave this element (and its text) alone.
 *
 * Rewriting AssisT's own panels made the extension's UI text bionic along with the page;
 * rewriting an editable field or a shadow host destroys a student's draft or a
 * component's own DOM.
 *
 * @param {Element|null} element
 * @returns {boolean} true when the element must not be touched
 */
export function dyslexia_isExcludedElement(element) {
  if (!element || element.nodeType !== 1) {
    return true;
  }

  for (let node = element; node; node = node.parentElement) {
    const tag = node.tagName?.toLowerCase();
    if (DYSLEXIA_SKIP_TAGS.includes(tag)) {
      return true;
    }

    const editable = node.getAttribute?.('contenteditable');
    if (editable === '' || editable === 'true' || editable === 'plaintext-only') {
      return true;
    }

    // A shadow host's light DOM is the component's business, not ours.
    if (node.shadowRoot) {
      return true;
    }

    if (dyslexia_isAssistOwned(node)) {
      return true;
    }
  }

  return false;
}

/**
 * Split text into user-perceived characters: grapheme clusters where Intl.Segmenter
 * exists, code points otherwise. Never UTF-16 code units — slicing those cut emoji in
 * half and the page showed two replacement characters.
 *
 * @param {string} text
 * @returns {Array<string>}
 */
function dyslexia_graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(text), part => part.segment);
    } catch (error) {
      console.warn('[DyslexiaMode] Intl.Segmenter unavailable, using code points:', error);
    }
  }

  return Array.from(text);
}

/**
 * Work out the bold prefix of a word for bionic reading, counting whole characters.
 *
 * @param {string} word
 * @returns {{bold: string, rest: string}}
 */
export function dyslexia_splitWordForBionic(word) {
  const units = dyslexia_graphemes(word);
  const len = units.length;

  let boldCount;
  if (len <= 3) {
    boldCount = 1;
  } else if (len <= 7) {
    boldCount = 2;
  } else {
    boldCount = 3;
  }

  return {
    bold: units.slice(0, boldCount).join(''),
    rest: units.slice(boldCount).join(''),
  };
}

/**
 * Bionic Reading: Bold first letters of words
 */
export function dyslexia_applyBionicReading(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  if (dyslexia_isExcludedElement(element)) {
    return;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      // Skip script/style/code, editable fields and AssisT's own injected UI
      const parent = node.parentElement;
      if (!parent || dyslexia_isExcludedElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    // Split into words and process
    const words = text.split(/(\s+|[,.!?;:])/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        // Keep whitespace/punctuation as-is
        fragment.appendChild(document.createTextNode(word));
      } else {
        // Whole characters only: slicing UTF-16 code units cut emoji in half.
        const { bold, rest } = dyslexia_splitWordForBionic(word);

        // Create span with bolded first part
        const span = document.createElement('span');
        span.classList.add('assist-bionic');

        const strongPart = document.createElement('strong');
        strongPart.textContent = bold;
        strongPart.style.fontWeight = '700';

        const normalPart = document.createTextNode(rest);

        span.appendChild(strongPart);
        span.appendChild(normalPart);
        fragment.appendChild(span);
      }
    });

    dyslexia_swapTextNode(textNode, fragment);
  });

  element.dataset.assistDyslexiaProcessed = 'bionic';
}

/**
 * Syllable Highlighting: Alternate colors between syllables
 *
 * @param {Element} element - Element whose text is tinted.
 * @param {ReadonlyArray<string>} [tints] - The pair to alternate, for this page's ground.
 */
function dyslexiaMode_applySyllableHighlighting(element, tints = DYSLEXIA_SYLLABLE_TINTS.light) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  // Simple syllable split algorithm (basic English rules)
  function splitIntoSyllables(word) {
    // Very basic syllabification - split on vowel clusters
    // This is simplified; production would use Hypher.js library
    if (word.length <= 3) {
      return [word];
    }

    const vowels = 'aeiouAEIOU';
    const syllables = [];
    let current = '';

    for (let i = 0; i < word.length; i++) {
      current += word[i];

      // Split when we hit a consonant after a vowel
      if (i < word.length - 1) {
        const isVowel = vowels.includes(word[i]);
        const nextIsConsonant = !vowels.includes(word[i + 1]);

        if (isVowel && nextIsConsonant && current.length >= 2) {
          syllables.push(current);
          current = '';
        }
      }
    }

    if (current) {
      syllables.push(current);
    }
    return syllables.length > 0 ? syllables : [word];
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement;
      if (!parent || dyslexia_isExcludedElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  const [color1, color2] = tints || DYSLEXIA_SYLLABLE_TINTS.light;

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    const words = text.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const syllables = splitIntoSyllables(word);
        syllables.forEach((syllable, idx) => {
          const span = document.createElement('span');
          span.classList.add('assist-syllable');
          span.textContent = syllable;
          span.style.backgroundColor = idx % 2 === 0 ? color1 : color2;
          span.style.padding = '0 1px';
          fragment.appendChild(span);
        });
      }
    });

    dyslexia_swapTextNode(textNode, fragment);
  });

  element.dataset.assistDyslexiaProcessed = 'syllable';
}

/**
 * The part of speech one of compromise's terms was given, as one of the four the feature colours.
 *
 * A pronoun carries compromise's Noun tag as well, but it is a part of speech of its own, and
 * colouring "she" and "they" as nouns would teach the wrong grouping. Verb is checked before
 * the others because auxiliaries and gerunds carry it alongside a second tag.
 *
 * @param {ReadonlyArray<string>} tags - The term's tags, as compromise reports them.
 * @returns {'noun'|'verb'|'adjective'|'adverb'|null}
 */
function dyslexia_categoryOf(tags) {
  if (tags.includes('Pronoun')) {
    return null;
  }
  if (tags.includes('Verb')) {
    return 'verb';
  }
  if (tags.includes('Adjective')) {
    return 'adjective';
  }
  if (tags.includes('Adverb')) {
    return 'adverb';
  }
  if (tags.includes('Noun')) {
    return 'noun';
  }
  return null;
}

/**
 * Tag every word of a text with its part of speech, as character ranges into that text.
 *
 * This reads compromise term by term. Its phrase-level helpers (`doc.nouns().out('array')`)
 * return whole noun and verb phrases in the page's own case ("The quick brown fox",
 * "quickly jumps"), so looking a single word up in them never found a noun and missed most
 * verbs. A term carries its own tags and its own offset, which is also what lets the same word
 * be a verb in one place and a noun in the next ("we record the record").
 *
 * The ranges cover the word only: compromise keeps punctuation in a term's pre/post text, so a
 * full stop or a quote mark is never inside a tinted word. A contraction is one term with an
 * empty implicit partner ("doesn't" + "not"), and the empty one is skipped.
 *
 * @param {string} text - The element's full text, exactly as textContent reports it.
 * @returns {Array<{start: number, end: number, category: string|null}>} In text order.
 */
export function dyslexia_tagWords(text) {
  const words = [];
  let cursor = 0;

  for (const sentence of nlp(text).json({ offset: true, terms: { offset: true } })) {
    for (const term of sentence.terms) {
      if (!term.text) {
        continue;
      }
      // Trust the offset only when it points at the word itself: compromise normalises some
      // characters on the way in, and a shifted offset would tint half of one word and half of
      // the next.
      let start = term.offset?.start;
      if (!Number.isInteger(start) || text.slice(start, start + term.text.length) !== term.text) {
        start = text.indexOf(term.text, cursor);
        if (start < 0) {
          continue;
        }
      }
      const end = start + term.text.length;
      words.push({ start, end, category: dyslexia_categoryOf(term.tags || []) });
      cursor = end;
    }
  }

  return words;
}

/**
 * Grammar Color-Coding: mark words by part of speech
 *
 * The element's text is tagged once, as a whole, so compromise sees the sentence a word sits
 * in; the tags are then laid back onto the element's own text nodes by character position.
 * Text nodes this feature must not touch (code, editable regions, AssisT's UI) still count
 * towards those positions, which is what keeps every later word lined up with its tag.
 *
 * Every tagged word is wrapped; a word in one of the four categories also gets the category's
 * opaque tint and underline (see DYSLEXIA_GRAMMAR_STYLES). Everything between words (spaces,
 * punctuation, a hyphen) stays plain page text.
 *
 * @param {HTMLElement} element - A leaf content element.
 * @param {Readonly<Object<string, {tint: string, accent: string, line: string}>>} styles - The
 *   set for this page, from dyslexia_resolveGrammarStyles().
 */
function dyslexiaMode_applyGrammarColors(element, styles = DYSLEXIA_GRAMMAR_STYLES.light) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  const text = element.textContent;
  if (!text.trim()) {
    return;
  }

  const words = dyslexia_tagWords(text);

  // Where each text node starts inside element.textContent, which is every descendant text node
  // in document order, excluded ones included.
  const offsets = new Map();
  const everyText = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let position = 0;
  let node;
  while ((node = everyText.nextNode())) {
    offsets.set(node, position);
    position += node.data.length;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: candidate => {
      const parent = candidate.parentElement;
      if (!parent || dyslexia_isExcludedElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return candidate.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  let next = 0;
  textNodes.forEach(textNode => {
    const data = textNode.data;
    const nodeStart = offsets.get(textNode);
    const nodeEnd = nodeStart + data.length;

    while (next < words.length && words[next].end <= nodeStart) {
      next++;
    }

    const fragment = document.createDocumentFragment();
    let cursor = nodeStart;
    let wrapped = 0;

    // A word split across two text nodes ("<b>re</b>ad") gets its tag on both halves, so the
    // pointer only moves past a word once a later node starts beyond its end.
    for (let i = next; i < words.length && words[i].start < nodeEnd; i++) {
      const from = Math.max(words[i].start, nodeStart);
      const to = Math.min(words[i].end, nodeEnd);
      if (from > cursor) {
        fragment.appendChild(
          document.createTextNode(data.slice(cursor - nodeStart, from - nodeStart))
        );
      }

      const span = document.createElement('span');
      span.classList.add('assist-grammar');
      span.textContent = data.slice(from - nodeStart, to - nodeStart);
      // Words in none of the four categories are left as the page wrote them: an untinted
      // word is itself information, and tinting everything would group nothing.
      const category = words[i].category;
      if (category) {
        span.dataset.assistGrammar = category;
        paintGrammarCue(span, styles[category]);
      }
      fragment.appendChild(span);
      wrapped++;
      cursor = to;
    }

    if (wrapped === 0) {
      return;
    }
    if (cursor < nodeEnd) {
      fragment.appendChild(document.createTextNode(data.slice(cursor - nodeStart)));
    }

    dyslexia_swapTextNode(textNode, fragment);
  });

  element.dataset.assistDyslexiaProcessed = 'grammar';
}

/**
 * Apply dyslexia mode to main content
 */
async function dyslexiaMode_apply() {
  if (!dyslexiaMode_enabled) {
    dyslexiaMode_remove();
    return;
  }

  const startTime = performance.now();

  // Find main content areas - ONLY leaf elements, not containers
  const contentSelectors = [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
    'td',
    'th',
    'figcaption',
    'label',
    'span.user_content', // Canvas-specific content spans
  ];

  const elements = new Set();
  contentSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      // Skip already processed elements
      if (!dyslexiaMode_processedElements.has(el)) {
        // Skip if element has no text content
        if (!el.textContent.trim()) {
          return;
        }
        // Skip AssisT's own injected UI, editable fields, code and shadow hosts
        if (dyslexia_isExcludedElement(el)) {
          return;
        }
        // Skip if this element is inside another element we're already processing
        let hasParentInSet = false;
        for (const otherEl of elements) {
          if (otherEl.contains(el)) {
            hasParentInSet = true;
            break;
          }
        }
        if (!hasParentInSet) {
          elements.add(el);
        }
      }
    });
  });

  if (elements.size === 0) {
    console.log('[DyslexiaMode] No content elements found');
    return;
  }

  console.log('[DyslexiaMode] Processing', elements.size, 'elements');

  // Read the page's ground once: every element gets the same palette, and a per-element read
  // of thousands of elements is a layout cost for no gain.
  const surface =
    dyslexiaMode_settings.syllableHighlighting || dyslexiaMode_settings.grammarColors
      ? dyslexia_readPageSurface()
      : null;
  const tints = dyslexiaMode_settings.syllableHighlighting
    ? dyslexia_resolveSyllableTints(surface)
    : null;
  const grammarVariant = dyslexiaMode_settings.grammarColors
    ? dyslexia_resolveSurfaceVariant(surface)
    : null;
  const grammarStyles = grammarVariant ? dyslexia_resolveGrammarStyles(surface) : null;

  // Apply selected features
  for (const element of elements) {
    if (dyslexiaMode_settings.bionicReading) {
      dyslexia_applyBionicReading(element);
    } else if (dyslexiaMode_settings.syllableHighlighting) {
      dyslexiaMode_applySyllableHighlighting(element, tints);
    } else if (dyslexiaMode_settings.grammarColors) {
      dyslexiaMode_applyGrammarColors(element, grammarStyles);
    }

    dyslexiaMode_processedElements.add(element);
  }

  // The same condition that picked the grammar transform above: the key only names colours
  // that are actually on the page.
  if (
    grammarStyles &&
    !dyslexiaMode_settings.bionicReading &&
    !dyslexiaMode_settings.syllableHighlighting
  ) {
    mountGrammarLegend({ styles: grammarStyles, variant: grammarVariant });
  }

  const duration = performance.now() - startTime;
  console.log(`[DyslexiaMode] Applied in ${duration.toFixed(1)}ms`);
  showToast(`✨ Dyslexia Mode enabled`);
}

/**
 * Remove dyslexia mode: put the page's own text nodes back and drop our markers.
 */
function dyslexiaMode_remove() {
  unmountGrammarLegend();
  const { restored, orphaned } = dyslexia_restoreTextNodes();

  dyslexiaMode_processedElements.forEach(element => {
    delete element.dataset.assistDyslexiaProcessed;
  });
  dyslexiaMode_processedElements.clear();

  console.log(
    '[DyslexiaMode] Restored',
    restored,
    'text nodes,',
    orphaned,
    'no longer in the page'
  );
  showToast('Dyslexia Mode disabled');
}

/**
 * Handle settings changes
 */
function dyslexiaMode_handleSettingsChange(newSettings) {
  if (!newSettings.dyslexiaMode) {
    return;
  }

  const dmSettings = newSettings.dyslexiaMode;
  const wasEnabled = dyslexiaMode_enabled;
  const newEnabled = dmSettings.enabled || false;

  // Update settings
  Object.assign(dyslexiaMode_settings, dyslexia_resolveVariant(dmSettings));

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    dyslexiaMode_enabled = true;
    dyslexiaMode_apply();
  } else if (!newEnabled && wasEnabled) {
    dyslexiaMode_enabled = false;
    dyslexiaMode_remove();
  } else if (newEnabled) {
    // Settings changed, reapply
    dyslexiaMode_remove();
    setTimeout(() => dyslexiaMode_apply(), 100);
  }

  console.log('[DyslexiaMode] Settings updated:', newEnabled);
}

/**
 * Initialize Dyslexia Mode feature
 */
export async function dyslexia_initialize() {
  console.log('[DyslexiaMode] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.dyslexiaMode) {
    const dmSettings = allSettings.dyslexiaMode;
    dyslexiaMode_enabled = dmSettings.enabled || false;
    Object.assign(dyslexiaMode_settings, dyslexia_resolveVariant(dmSettings));

    if (dyslexiaMode_enabled) {
      // Apply after page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => dyslexiaMode_apply(), 500);
        });
      } else {
        setTimeout(() => dyslexiaMode_apply(), 500);
      }
    }

    console.log('[DyslexiaMode] Settings loaded:', dyslexiaMode_enabled);
  }

  // Listen for settings changes
  onSettingsChange(dyslexiaMode_handleSettingsChange);

  console.log('[DyslexiaMode] Initialized');
}

/**
 * Get Dyslexia Mode state for debugging
 */
export function dyslexia_getState() {
  return {
    enabled: dyslexiaMode_enabled,
    settings: dyslexiaMode_settings,
    processedElements: dyslexiaMode_processedElements.size,
  };
}
