/**
 * Citation style registry.
 *
 * Single entry point for multi-style formatting. Normalises the citation once (so every style
 * module can assume a clean shape), works out what the citation's reference list changes about it
 * (see reference-set.js), then delegates to the requested style.
 *
 * Public API:
 *   formatReference(citation, style, options)     -> reference-list entry
 *   formatInText(citation, style, options)        -> in-text citation
 *   formatBibliography(citations, style, options) -> the ordered, joined reference list
 *   referenceSetFor(citation, pool)               -> the set a single citation is formatted in
 *   STYLES / DEFAULT_STYLE                         -> for the style-picker UI
 *
 * `options.set` is the reference list the citation belongs to — for a single card, its collection
 * (`referenceSetFor`). It decides the year letters (2020a) in APA, Harvard and Chicago and the
 * short title in MLA's in-text citation. It is always passed explicitly; without one the citation
 * is formatted as the only entry in its list, so it never gains a letter. A bibliography given
 * `options.pool` letters each entry within `referenceSetFor(entry, pool)`, exactly as its card
 * does; without a pool its set is the citations it is given.
 *
 * `options.html === true` wraps italic parts in <em> and escapes everything else, so the output is
 * safe to set as HTML whatever the record carries; default plain text. It applies to references
 * and in-text citations alike.
 */

import { normalizeCitation } from '../citation-types.js';
import { toReferenceHtml, stripItalicMarkers, markOrganisations } from './shared.js';
import {
  assignYearLetters,
  sameAuthorCounts,
  authorIdentities,
  groupKey,
  leadFamily,
  namesakesOf,
  referenceOrder,
  collectionOf,
} from './reference-set.js';
import * as harvard from './harvard.js';
import * as apa7 from './apa7.js';
import * as mla9 from './mla9.js';
import * as chicago17 from './chicago17.js';

const FORMATTERS = { harvard, apa7, mla9, chicago17 };

/** Ordered list for the style-picker dropdown. */
export const STYLES = Object.freeze([
  { id: 'harvard', label: 'Harvard (Cite Them Right)' },
  { id: 'apa7', label: 'APA 7th edition' },
  { id: 'mla9', label: 'MLA 9th edition' },
  { id: 'chicago17', label: 'Chicago 17th (author–date)' },
]);

export const DEFAULT_STYLE = 'harvard';

/** MLA 9 names the work instead of lettering the year; the three author-date styles letter. */
const MLA = 'mla9';

/**
 * What each style prints in the author position and how it orders its list (see reference-set.js).
 * Cite Them Right never prints "Anonymous"; MLA orders one author's works by title alone, and
 * leads with the title when the only author is the organisation that also published the work;
 * APA 7 puts an undated work before the same author's dated ones.
 */
const LIST_RULES = {
  harvard: { dropAnonymous: true, byYear: true },
  apa7: { byYear: true, undatedFirst: true },
  mla9: { byYear: false, dropPublishingOrganisation: true },
  chicago17: { byYear: true },
};

/** @returns {string} a known style id — unknown ids fall back to the default */
function styleId(style) {
  return FORMATTERS[style] ? style : DEFAULT_STYLE;
}

/**
 * The list rules of a style (what it prints in the author position, how it orders its list), for
 * code outside the formatters that must letter a list exactly as the style does.
 * @param {string} [style] - unknown ids fall back to the default
 * @returns {Object}
 */
export function listRulesFor(style) {
  return LIST_RULES[styleId(style)];
}

/**
 * What membership of the list changes about each citation, aligned with the list.
 * @param {string} id - style id
 * @param {Object[]} list - normalised citations
 * @returns {Array<{letter: string, namesWork: boolean}>}
 */
function listMarks(id, list) {
  if (id === MLA) {
    return sameAuthorCounts(list, LIST_RULES[id]).map(count => ({
      letter: '',
      namesWork: count > 1,
    }));
  }
  return assignYearLetters(list, LIST_RULES[id]).map(letter => ({ letter, namesWork: false }));
}

/**
 * A record as every style and the list ordering read it: normalised, with the authors it names as
 * organisations marked so they print whole (see `markOrganisations`).
 * @param {Object} raw
 * @returns {Object}
 */
function forStyles(raw) {
  return markOrganisations(normalizeCitation(raw));
}

/** @returns {Object} the citation ready for a style; anything that is not an object formats as empty */
function asCitation(citation) {
  return forStyles(citation && typeof citation === 'object' ? citation : {});
}

/**
 * A set member normalised, once per record object: a library card formats itself against its
 * whole collection on every render, so re-normalising every member for every card was quadratic
 * (half a minute for 500 cards). Records are replaced, never changed in place (the store builds
 * new objects on every refresh), so a cached copy cannot go stale.
 * @type {WeakMap<Object, Object>}
 */
const MEMBER_CITATIONS = new WeakMap();

/** @param {Object} raw - a set member @returns {Object} it, normalised */
function normalisedMember(raw) {
  let citation = MEMBER_CITATIONS.get(raw);
  if (!citation) {
    citation = forStyles(raw);
    MEMBER_CITATIONS.set(raw, citation);
  }
  return citation;
}

/**
 * The set's members that share `key` under `keyOf`, the target's own copy in the set replaced by
 * the one being formatted (a wizard draft carries edits the stored copy has not seen yet); a
 * citation not in the set counts as a member of it. The target comes first.
 * @param {Object} target - the normalised citation being formatted
 * @param {Object} raw - the citation as the caller passed it
 * @param {Object[]} [set]
 * @param {Object} rules - a LIST_RULES entry
 * @param {Function} keyOf - groupKey or leadFamily
 * @param {string} key - the target's key under keyOf
 * @returns {Object[]} normalised citations
 */
function peersIn(target, raw, set, rules, keyOf, key) {
  const hasId = target.id !== undefined && target.id !== null && target.id !== '';
  const targetId = hasId ? String(target.id) : null;
  // normalizeCitation keeps a record's id as it is, so the raw id is the one to compare.
  const isTarget = member => (hasId ? String(member.id) === targetId : member === raw);
  const peers = [target];
  for (const member of indexOf(set, rules, keyOf).get(key) || []) {
    if (!isTarget(member)) {
      peers.push(normalisedMember(member));
    }
  }
  return peers;
}

/**
 * The marks one citation carries in its set.
 *
 * Letters (and MLA's short title): only works that share its group key (the same author list up
 * to initials, or the same stand-in title) can change them, so only those are compared, every
 * year included, because who an initial names is read from all of them.
 *
 * Namesakes: the works whose first author is someone else with the same surname, which each style
 * tells apart in its own way (see `namesakesOf`).
 * @param {string} id - style id
 * @param {Object} target - the normalised citation being formatted
 * @param {Object} raw - the citation as the caller passed it
 * @param {Object[]} [set]
 * @returns {{letter: string, namesWork: boolean, namesakes: Object[]}}
 */
function marksInSet(id, target, raw, set) {
  return { ...lettersInSet(id, target, raw, set), namesakes: namesakesInSet(id, target, raw, set) };
}

/** @returns {{letter: string, namesWork: boolean}} see marksInSet */
function lettersInSet(id, target, raw, set) {
  const rules = LIST_RULES[id];
  const key = groupKey(target, rules);
  if (!key) {
    return { letter: '', namesWork: false };
  }
  return listMarks(id, peersIn(target, raw, set, rules, groupKey, key))[0];
}

/** @returns {Object[]} see marksInSet */
function namesakesInSet(id, target, raw, set) {
  const rules = LIST_RULES[id];
  const family = leadFamily(target, rules);
  if (!family) {
    return [];
  }
  return namesakesOf(peersIn(target, raw, set, rules, leadFamily, family), rules);
}

/**
 * A set's members indexed by a key (group key, or first author's surname), built once per set
 * array, key and style's rules. Every card in a collection is handed the same array for a render
 * (referenceSetFor caches it per pool), so each card looks up its own group instead of scanning
 * the collection. Sets are read as they stand: the store and the pages build a new array whenever
 * the library changes, and none is edited in place.
 * @type {WeakMap<Object[], Map<Function, Map<Object, Map<string, Object[]>>>>}
 */
const SET_INDEX = new WeakMap();

/**
 * @param {Object[]} [set]
 * @param {Object} rules - a LIST_RULES entry
 * @param {Function} keyOf - (citation, rules) => key; '' leaves a member out
 * @returns {Map<string, Object[]>} key → members
 */
function indexOf(set, rules, keyOf) {
  if (!Array.isArray(set)) {
    return new Map();
  }
  if (!SET_INDEX.has(set)) {
    SET_INDEX.set(set, new Map());
  }
  const byKey = SET_INDEX.get(set);
  if (!byKey.has(keyOf)) {
    byKey.set(keyOf, new Map());
  }
  const byRules = byKey.get(keyOf);
  let index = byRules.get(rules);
  if (!index) {
    index = new Map();
    for (const member of set) {
      if (member && typeof member === 'object') {
        const key = keyOf(normalisedMember(member), rules);
        if (key) {
          if (!index.has(key)) {
            index.set(key, []);
          }
          index.get(key).push(member);
        }
      }
    }
    byRules.set(rules, index);
  }
  return index;
}

/**
 * The citation as a style module receives it: its list marks attached as `listMarks`, always
 * overwriting anything a stored record might carry under that name.
 * @param {Object} citation - normalised citation
 * @param {Object} marks
 * @returns {Object}
 */
function withMarks(citation, marks) {
  return { ...citation, listMarks: marks };
}

/**
 * Render a reference or an in-text citation through a style function, and — in HTML mode — do the
 * escaping here rather than trust every sink in four style modules with metadata that may have
 * been scraped off a page. The style marks its italics; the record's own markers are stripped
 * first so only the style can open one; the finished string is escaped and the markers become
 * <em> last.
 * @param {Function} styleFn - a style module's formatReference or formatInText
 * @param {Object} citation - normalised citation
 * @param {Object} marks - its list marks
 * @param {{html?: boolean}} options
 * @returns {string}
 */
function renderWith(styleFn, citation, marks, options) {
  if (options.html !== true) {
    return styleFn(withMarks(citation, marks), options);
  }
  return toReferenceHtml(styleFn(withMarks(stripItalicMarkers(citation), marks), options));
}

/**
 * The set a single citation is formatted in: its collection, or every unfiled citation when it
 * has none. Callers pass the pool they hold (the store's citations, the popup's list).
 * @param {Object} citation
 * @param {Object[]} pool
 * @returns {Object[]}
 */
export function referenceSetFor(citation, pool) {
  if (!Array.isArray(pool)) {
    return [];
  }
  let byCollection = POOL_INDEX.get(pool);
  if (!byCollection) {
    byCollection = new Map();
    for (const member of pool) {
      // Removed (trashed) citations are in nobody's reference list.
      if (member && typeof member === 'object' && !member.deletedAt) {
        const home = collectionOf(member);
        if (!byCollection.has(home)) {
          byCollection.set(home, []);
        }
        byCollection.get(home).push(member);
      }
    }
    POOL_INDEX.set(pool, byCollection);
  }
  return byCollection.get(collectionOf(citation)) || [];
}

/**
 * A pool's members grouped by collection, built once per pool array, so a list of cards finds each
 * card's set without scanning the library once per card. The set returned is shared: read it, never
 * change it. Pools are read as they stand (see SET_INDEX).
 * @type {WeakMap<Object[], Map<string, Object[]>>}
 */
const POOL_INDEX = new WeakMap();

/**
 * @param {Object} citation
 * @param {string} [style]
 * @param {{html?: boolean, set?: Object[]}} [options]
 * @returns {string}
 */
export function formatReference(citation, style = DEFAULT_STYLE, options = {}) {
  const id = styleId(style);
  const target = asCitation(citation);
  return renderWith(
    FORMATTERS[id].formatReference,
    target,
    marksInSet(id, target, citation, options.set),
    options
  );
}

/**
 * In-text citation for the given style.
 *
 * `options.locator` (optional string) pinpoints the quoted passage — a page ("24"),
 * range ("24-26"), or a pre-labelled locator passed through verbatim ("para. 2",
 * "chap. 3", "03:12"). Rendering follows each style's rules: APA 7 / Harvard add
 * "p."/"pp." to bare page numbers ("(Smith, 2023, p. 24)"); Chicago 17 appends bare
 * numbers after a comma ("(Smith 2023, 24)"); MLA 9 appends with no year and no "p."
 * ("(Smith 24)"). Absent/empty locator leaves output exactly as before.
 *
 * `options.set` is the reference list, as for formatReference. `options.html` gives the
 * rich-text flavour with the same italics and escaping as formatReference: (Morrison,
 * <em>Beloved</em> 27).
 *
 * @param {Object} citation
 * @param {string} [style]
 * @param {{locator?: string, set?: Object[], html?: boolean}} [options]
 * @returns {string}
 */
export function formatInText(citation, style = DEFAULT_STYLE, options = {}) {
  const id = styleId(style);
  const target = asCitation(citation);
  return renderWith(
    FORMATTERS[id].formatInText,
    target,
    marksInSet(id, target, citation, options.set),
    options
  );
}

/**
 * The reference list of exactly these citations, in the style's order, joined by blank lines.
 * In MLA 9 the second and later works by the same author open with "---.".
 *
 * Year letters: with `options.pool` (the student's whole library), each entry carries the letter
 * of its own reference list, `referenceSetFor(entry, pool)`, the same letter its card copies, so
 * a search, a selection or an export of everything changes which entries are output, never their
 * letters. Without a pool the citations given are the reference list.
 * @param {Array<Object>} citations
 * @param {string} [style]
 * @param {{html?: boolean, pool?: Object[]}} [options]
 * @returns {string}
 */
export function formatBibliography(citations, style = DEFAULT_STYLE, options = {}) {
  const id = styleId(style);
  const rules = LIST_RULES[id];
  const raws = (citations || []).filter(c => c && typeof c === 'object');
  const list = raws.map(forStyles);
  const marks = Array.isArray(options.pool)
    ? list.map((c, i) => marksInSet(id, c, raws[i], referenceSetFor(raws[i], options.pool)))
    : listMarks(id, list).map((m, i) => ({
        ...m,
        namesakes: namesakesInSet(id, list[i], raws[i], raws),
      }));
  const who = authorIdentities(list, rules);
  const order = referenceOrder(list, rules);
  return order
    .map((i, position) => {
      const previous = position > 0 ? order[position - 1] : -1;
      const repeatsAuthor = id === MLA && !!who[i] && previous >= 0 && who[previous] === who[i];
      return renderWith(
        FORMATTERS[id].formatReference,
        list[i],
        { ...marks[i], repeatsAuthor },
        options
      );
    })
    .join('\n\n');
}

export default {
  STYLES,
  DEFAULT_STYLE,
  formatReference,
  formatInText,
  formatBibliography,
  referenceSetFor,
};
