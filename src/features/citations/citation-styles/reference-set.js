/**
 * The reference list a citation belongs to, and what belonging to it changes.
 *
 * A formatted citation is not a function of one record. Two works by the same author in the same
 * year are told apart by letters (2020a, 2020b) in APA 7, Harvard and Chicago 17, and by a short
 * title in MLA 9's in-text citation; the letters are assigned within the reference list of ONE
 * document, so the in-text citation and the list entry must be computed over the same set.
 * STYLE-RULES.md (2026-09-26) holds the verified rules.
 *
 * The set is always passed in by the caller. Nothing here reads a store: every output letters an
 * entry within its own collection (`referenceSetFor` in index.js, keyed by `collectionOf`), so an
 * essay's collection behaves as one reference list whichever way it leaves the library.
 *
 * Every key here is built from what the style PRINTS in the author position, described by the
 * `rules` each function takes: `{dropAnonymous}` is true for Cite Them Right, which never prints
 * "Anonymous" and moves the title into the author position instead; `{dropPublishingOrganisation}`
 * is true for MLA 9, which leads with the title when the only author is the organisation that
 * also published the work.
 *
 * Pure functions over normalised citations: no DOM, no Chrome APIs.
 */

import { extractYear } from '../citation-model.js';
import {
  parseAuthor,
  safe,
  withoutAnonymous,
  withoutPublishingOrganisation,
  isOrganisationAuthor,
  LEADING_ARTICLE,
} from './shared.js';

/**
 * A title as the styles alphabetise it: lower case, leading quotation marks and an initial
 * A/An/The ignored.
 * @param {string} title
 * @returns {string}
 */
export function titleSortKey(title) {
  return safe(title)
    .trim()
    .replace(/^["'“”‘’«(\[]+/, '')
    .replace(LEADING_ARTICLE, '')
    .toLowerCase();
}

/**
 * The authors the style prints in the author position.
 * @param {Object} citation - normalised citation
 * @param {{dropAnonymous?: boolean, dropPublishingOrganisation?: boolean}} [rules]
 * @returns {string[]}
 */
function printedAuthors(citation, rules = {}) {
  if (!citation || !Array.isArray(citation.authors)) {
    return [];
  }
  if (rules.dropPublishingOrganisation === true) {
    return withoutPublishingOrganisation(citation);
  }
  return rules.dropAnonymous === true ? withoutAnonymous(citation.authors) : citation.authors;
}

/**
 * One author as comparable parts: family name, suffix and each given name, lower case, with the
 * full stops of initials gone ("Smith, J. M." → given ['j', 'm']).
 * @param {string} raw
 * @returns {{family: string, suffix: string, given: string[]}}
 */
function nameForm(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  // An organisation is alphabetised by its first significant word: "The Royal Society" under R.
  const sorted = isOrganisationAuthor(raw) ? family.replace(LEADING_ARTICLE, '') : family;
  return {
    family: sorted.trim().toLowerCase(),
    suffix: safe(suffix).trim().toLowerCase(),
    given: safe(given)
      .toLowerCase()
      .split(/[\s.]+/)
      .filter(Boolean),
  };
}

/** @returns {string} what two forms of one person always share: family, initials, suffix */
function formBucket(form) {
  return [form.family, form.given.map(g => g.charAt(0)).join(''), form.suffix]
    .filter(Boolean)
    .join(' ');
}

/**
 * True when two given-name lists could name one person: the same number of names, each the same
 * or an initial of the other ("J." and "John"). "John" and "Jane" never can.
 */
function compatible(a, b) {
  return (
    a.length === b.length &&
    a.every((name, i) => {
      const other = b[i];
      return (
        name === other ||
        (name.length === 1 && other.charAt(0) === name) ||
        (other.length === 1 && name.charAt(0) === other)
      );
    })
  );
}

/** True when `fuller` spells out at least one name `given` gives only as an initial. */
function spellsOut(fuller, given) {
  return (
    compatible(fuller, given) &&
    given.every((name, i) => name.length === 1 || fuller[i] === name) &&
    given.some((name, i) => name.length === 1 && fuller[i].length > 1)
  );
}

/**
 * The fullest form of a name the list gives for the same person. "J. Smith" is John Smith when
 * John is the only Smith with that initial in the list; beside both John and Jane it could be
 * either, so it stays "J. Smith" and is matched with neither.
 * @param {string[]} given
 * @param {string[][]} known - every given-name list recorded for this family and initials
 * @returns {string[]}
 */
function resolveGiven(given, known) {
  const candidates = known.filter(other => compatible(other, given));
  const fullest = candidates.filter(c => !candidates.some(other => spellsOut(other, c)));
  return fullest.length === 1 ? fullest[0] : given;
}

/**
 * Who a work is by, as a coarse comparable key: each printed author's family name, initials and
 * any suffix, in the order given. Two works by the same author list always share it; two that
 * share it may still be different people (John and Jane Smith), which `authorIdentities` decides.
 * '' when the style prints no author.
 * @param {Object} citation - normalised citation
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {string}
 */
export function authorKey(citation, rules = {}) {
  return printedAuthors(citation, rules)
    .map(raw => formBucket(nameForm(raw)))
    .filter(Boolean)
    .join('|');
}

/**
 * The key a work is grouped and lettered by: its author key, or — when the style prints no
 * author — the title that stands in the author position, so two authorless works share a key only
 * when they share that title. '' when there is neither.
 * @param {Object} citation - normalised citation
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {string}
 */
export function groupKey(citation, rules = {}) {
  const who = authorKey(citation, rules);
  if (who) {
    return who;
  }
  const title = safe(citation && citation.title)
    .trim()
    .toLowerCase();
  return title ? `\u0001${title}` : '';
}

/**
 * Who each work in a list is by: the same string for the same author list, the same person in
 * the same order. Full given names are compared as written; an initial matches a full name only
 * when it agrees and nobody else could be meant. '' for a work with no printed author.
 *
 * A name is resolved only against the works that share its `authorKey`, the same author list up
 * to initials, and at the same place in that list. So one work's identity depends on those works
 * alone, and a card formatted against its peers reads exactly as it does in the full list.
 * @param {Object[]} list - normalised citations
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {string[]}
 */
export function authorIdentities(list, rules = {}) {
  const forms = list.map(c =>
    printedAuthors(c, rules)
      .map(nameForm)
      .filter(f => f.family)
  );
  const slot = (authorForms, position) =>
    `${authorForms.map(formBucket).join('|')}\u0000${position}`;
  const known = new Map();
  for (const authorForms of forms) {
    authorForms.forEach((form, position) => {
      const key = slot(authorForms, position);
      if (!known.has(key)) {
        known.set(key, new Map());
      }
      known.get(key).set(form.given.join(' '), form.given);
    });
  }
  return forms.map(authorForms =>
    authorForms
      .map((form, position) => {
        const given = resolveGiven(form.given, [
          ...known.get(slot(authorForms, position)).values(),
        ]);
        return [form.family, given.join(' '), form.suffix].filter(Boolean).join(' ');
      })
      .join('|')
  );
}

/**
 * The surname of the first author the style prints, lower case; '' when it prints none.
 * @param {Object} citation - normalised citation
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {string}
 */
export function leadFamily(citation, rules = {}) {
  const [first] = printedAuthors(citation, rules);
  return first ? nameForm(first).family : '';
}

/**
 * The works in a list whose first author is a DIFFERENT person with the same surname as the first
 * author of `list[0]` — John Smith beside Jane or Mary Smith. Each style decides from these how it
 * tells the two apart in the text (STYLE-RULES.md, "Same surname, different people").
 *
 * Who is the same person is decided as `authorIdentities` decides it, over first authors alone: an
 * initial that can only mean John is John. A name with no given name recorded is not counted on
 * either side, since nothing says it is someone else and there is nothing to add to it.
 * @param {Object[]} list - normalised citations; list[0] is the work being formatted
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {Array<{sameInitials: boolean, sameFirstInitial: boolean, sameYear: boolean}>} one
 *   entry per namesake work: whether its first author's initials, and first initial, match, and
 *   whether it has the same year as list[0]
 */
export function namesakesOf(list, rules = {}) {
  const firsts = list.map(c => printedAuthors(c, rules).slice(0, 1));
  const who = authorIdentities(firsts.map(authors => ({ authors })));
  const forms = firsts.map(([first]) => (first ? nameForm(first) : null));
  const [target] = forms;
  if (!target || !target.family || target.given.length === 0) {
    return [];
  }
  const initialsOf = form => form.given.map(g => g.charAt(0)).join('');
  const year = extractYear(list[0].publicationDate);
  const namesakes = [];
  forms.forEach((form, i) => {
    if (
      i === 0 ||
      !form ||
      form.family !== target.family ||
      form.given.length === 0 ||
      who[i] === who[0]
    ) {
      return;
    }
    namesakes.push({
      sameInitials: initialsOf(form) === initialsOf(target),
      sameFirstInitial: form.given[0].charAt(0) === target.given[0].charAt(0),
      sameYear: extractYear(list[i].publicationDate) === year,
    });
  });
  return namesakes;
}

/** Stable last resort, so two identical titles still get the same letter every time. */
function byTitleThenId(a, b) {
  return (
    titleSortKey(a.title).localeCompare(titleSortKey(b.title)) ||
    safe(a.title).localeCompare(safe(b.title)) ||
    safe(a.id).localeCompare(safe(b.id))
  );
}

/**
 * The n-th year letter: a … z, then aa, ab … (a list with 27 works by one author in one year is
 * improbable, but it must not print "{").
 * @param {number} n - zero-based
 * @returns {string}
 */
function letterAt(n) {
  let out = '';
  let i = n;
  do {
    out = String.fromCharCode(97 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}

/**
 * Year letters for every citation in a list: the same author list (or, with no printed author,
 * the same title in the author position) + the same year (or both undated) and more than one such
 * work → a, b, c by title, the initial article ignored.
 * @param {Object[]} list - normalised citations
 * @param {{dropAnonymous?: boolean}} [rules]
 * @returns {string[]} one letter (or '') per citation, in list order
 */
export function assignYearLetters(list, rules = {}) {
  const identities = authorIdentities(list, rules);
  const letters = list.map(() => '');
  const groups = new Map();
  list.forEach((citation, index) => {
    const who = identities[index] || groupKey(citation, rules);
    if (!who) {
      return;
    }
    const key = `${who}\u0000${extractYear(citation.publicationDate)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(index);
  });
  for (const members of groups.values()) {
    if (members.length < 2) {
      continue;
    }
    members
      .slice()
      .sort((i, j) => byTitleThenId(list[i], list[j]))
      .forEach((index, n) => {
        letters[index] = letterAt(n);
      });
  }
  return letters;
}

/**
 * How many works in the list share each citation's author list (0 for an authorless work) — MLA 9
 * names the work in the text only when the author has more than one in the list.
 * @param {Object[]} list - normalised citations
 * @param {{dropPublishingOrganisation?: boolean}} [rules]
 * @returns {number[]}
 */
export function sameAuthorCounts(list, rules = {}) {
  const identities = authorIdentities(list, rules);
  const counts = new Map();
  for (const who of identities) {
    if (who) {
      counts.set(who, (counts.get(who) || 0) + 1);
    }
  }
  return identities.map(who => (who ? counts.get(who) : 0));
}

/**
 * Reference-list order, as indices into the list. Alphabetical by what leads each entry: the
 * author list, or the title (initial article ignored) when the style prints no author; then,
 * except in MLA, earliest year first; then by title, which is also the order the year letters
 * follow.
 *
 * An undated work among one author's dated works: APA 7 puts "n.d." first (§9.46); Harvard and
 * Chicago, whose guides do not say, keep it after the dated ones.
 * @param {Object[]} list - normalised citations
 * @param {{byYear: boolean, undatedFirst?: boolean, dropAnonymous?: boolean}} rules - byYear is
 *   false for MLA 9, which orders one author's works by title; undatedFirst is true for APA 7
 * @returns {number[]}
 */
export function referenceOrder(list, rules) {
  const identities = authorIdentities(list, rules);
  const lead = list.map((c, i) => identities[i] || titleSortKey(c.title));
  const undated = rules.undatedFirst === true ? '0000' : '9999';
  const year = c => extractYear(c.publicationDate) || undated;
  return list
    .map((_, i) => i)
    .sort(
      (i, j) =>
        lead[i].localeCompare(lead[j]) ||
        (rules.byYear ? year(list[i]).localeCompare(year(list[j])) : 0) ||
        byTitleThenId(list[i], list[j])
    );
}

/**
 * A collection id as a comparable key; '' for an unfiled citation.
 * @param {Object} citation
 * @returns {string}
 */
export function collectionOf(citation) {
  const id = citation && citation.projectId;
  return id === undefined || id === null || id === '' ? '' : String(id);
}
