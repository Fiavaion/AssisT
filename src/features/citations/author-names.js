/**
 * Author name canonicalisation.
 *
 * Pages state authors in whatever order suits their own layout — "Charles R Harris" on PubMed
 * Central, "Harris, Charles R." on Nature, "Women and Equalities Unit" on GOV.UK — while every
 * citation style needs the family name first. These three functions turn what a page (or a BibTeX
 * or RIS file) says into the "Family, Given" form the styles render, without inventing anything.
 *
 * Pure string functions: no DOM, no Chrome APIs, no I/O. Safe to reuse anywhere in the citation
 * core, including a future Safari build.
 */

/**
 * Nobiliary and patronymic particles that belong to the family name, not the given name.
 * Longer particles ("van der") fall out of this list on their own: the family name starts at the
 * FIRST particle found, so every word from "van" onwards is kept together.
 */
const PARTICLES = new Set([
  'van',
  'der',
  'den',
  'de',
  'la',
  'del',
  'della',
  'di',
  'da',
  'du',
  'le',
  'von',
  'zu',
  'ter',
  'ten',
  'af',
  'y',
  'bin',
  'ibn',
  'al',
]);

/**
 * Words that make a name an organisation rather than a person. An organisation is never reordered
 * and never split on "and" — "Women and Equalities Unit" is one author, not two.
 */
const ORGANISATION_WORDS = new Set([
  'unit',
  'department',
  'office',
  'ministry',
  'agency',
  'council',
  'organisation',
  'organization',
  'university',
  'institute',
  'committee',
  'group',
  'board',
  'trust',
  'association',
  'society',
  'foundation',
  'ltd',
  'inc',
  'press',
  'museum',
  'gallery',
  'library',
  'government',
  'commission',
  'bureau',
  'service',
  'centre',
  'center',
  'team',
  'project',
  'wikimedia',
  'contributors',
]);

/**
 * Generational suffixes, held without their full stop so "Jr" and "Jr." are one entry. They are
 * neither given nor family name: they trail the whole name ("King, Martin Luther, Jr.").
 */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/**
 * An organisation named "<Head> of/for <something>" — "Department of Health and Social Care",
 * "Ministry of Housing, Communities and Local Government". What follows "of"/"for" is a
 * coordinated list, so such a name is NOT complete at its first "and": splitting there cuts it
 * in half. Every other organisation name ("World Health Organization", "Oxford University
 * Press") is complete as it stands and can be an author beside another one.
 */
const OPEN_ENDED_ORG = /^(?:the\s+)?\p{L}+\s+(?:of|for)\s+/iu;

/** Splits an author list on the separators pages and bibliography files actually use. */
const SEPARATORS = /(\s+and\s+|\s*;\s*|\s+&\s+)/i;

/**
 * Is this token a generational suffix ("Jr.", "III")?
 * @param {string} token
 * @returns {boolean}
 */
export function isNameSuffix(token) {
  if (typeof token !== 'string') {
    return false;
  }
  return SUFFIXES.has(token.trim().toLowerCase().replace(/\.$/, ''));
}

/**
 * Is this name an organisation rather than a person?
 * @param {string} raw - a single author name
 * @returns {boolean}
 */
export function isOrganisation(raw) {
  if (typeof raw !== 'string') {
    return false;
  }
  return raw
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some(word => ORGANISATION_WORDS.has(word));
}

/**
 * The names in a canonical author list that `canonicalName` kept in reading order because they
 * name an organisation — the guess this module already makes about what a page or a file said. Only
 * ever applied to names that arrived from a source (a page, a file), never to a name a student typed.
 * @param {Array<string>} names - canonical names
 * @returns {Array<string>}
 */
export function organisationsAmong(names) {
  return (names || []).filter(name => !name.includes(',') && isOrganisation(name));
}

/**
 * Canonicalise one author name to "Family, Given".
 *
 * Already-canonical names ("Smith, J.") pass through with their spacing tidied; organisations and
 * single-token names ("Aristotle") keep their reading order; everything else is reordered with any
 * particle kept on the family name ("Stéfan J van der Walt" -> "van der Walt, Stéfan J") and any
 * generational suffix moved to the end ("Martin Luther King Jr." -> "King, Martin Luther, Jr.").
 * @param {string} raw - a single author name
 * @returns {string} the canonical name, or '' if there was nothing usable
 */
export function canonicalName(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) {
    return '';
  }

  if (name.includes(',')) {
    const [family, ...rest] = name.split(',');
    const given = rest
      .map(part => part.trim())
      .filter(Boolean)
      .join(', ');
    return given ? `${family.trim()}, ${given}` : family.trim();
  }

  if (isOrganisation(name)) {
    return name;
  }

  const tokens = name.split(' ');
  const suffixes = [];
  while (tokens.length > 1 && isNameSuffix(tokens[tokens.length - 1])) {
    suffixes.unshift(tokens.pop());
  }
  const suffix = suffixes.length ? `, ${suffixes.join(' ')}` : '';
  if (tokens.length < 2) {
    return `${tokens.join(' ')}${suffix}`;
  }

  // The family name starts at the first particle that still leaves a given name before it and a
  // surname after it; failing that, at the last token.
  let familyStart = tokens.length - 1;
  for (let i = 1; i < tokens.length - 1; i++) {
    const token = tokens[i].toLowerCase();
    if (!PARTICLES.has(token)) {
      continue;
    }
    // A one-letter particle ("y") is spelled in lower case; an upper-case "Y" is a middle initial.
    if (token.length === 1 && tokens[i] !== token) {
      continue;
    }
    // "y" joins two surnames rather than introducing one: José Ortega y Gasset.
    familyStart = token === 'y' && i > 1 ? i - 1 : i;
    break;
  }

  return `${tokens.slice(familyStart).join(' ')}, ${tokens.slice(0, familyStart).join(' ')}${suffix}`;
}

/**
 * Split a run-together author string into canonical names.
 *
 * Splits on " and ", ";" and " & ", then puts back any split that cut an organisation's own name in
 * half. A split survives only when each side can be an author in its own right: either a complete
 * organisation ("World Health Organization") or a fragment that at least reads as a person's name.
 * "Department of Health" + "Social Care" fails that test on both counts — the head is open-ended
 * and the tail names no one — so the two are rejoined.
 *
 * The remaining ambiguity is inherent: "Ministry of Justice and Jane Doe" has the same shape as
 * "Department of Health and Social Care", and resolves to one organisation. A student sees the
 * joined name in the author field and can split it; a silently mangled "Care, Social" they would
 * not think to look at.
 * @param {string} raw - e.g. "Smith, J. and Doe, M." or "Women and Equalities Unit"
 * @returns {Array<string>} canonical names, in the order given
 */
export function splitAuthorList(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }

  const pieces = raw.split(SEPARATORS);
  const parts = [];
  for (let i = 0; i < pieces.length; i += 2) {
    parts.push({ text: pieces[i].trim(), separator: pieces[i + 1] || '' });
  }

  const merged = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (previous) {
      const joined = `${previous.text}${previous.separator}${part.text}`;
      if (belongsTogether(previous.text, part.text, joined)) {
        previous.text = joined;
        previous.separator = part.separator;
        continue;
      }
    }
    merged.push({ ...part });
  }

  return merged.map(part => canonicalName(part.text)).filter(Boolean);
}

/**
 * Are these two fragments one organisation's name, split down the middle?
 * @param {string} left - the fragment before the separator
 * @param {string} right - the fragment after it
 * @param {string} joined - the two with their separator back in place
 * @returns {boolean}
 */
function belongsTogether(left, right, joined) {
  if (!isOrganisation(joined)) {
    return false;
  }
  if (!standsAlone(left) || !standsAlone(right)) {
    return true;
  }
  return !isCompleteOrganisation(left) && !isCompleteOrganisation(right);
}

/**
 * Could this fragment be an author on its own? A lone word that is not an organisation ("Women")
 * is the tell-tale of a split that landed inside an organisation's name.
 * @param {string} text
 * @returns {boolean}
 */
function standsAlone(text) {
  return isOrganisation(text) || text.split(' ').filter(Boolean).length >= 2;
}

/**
 * An organisation named in full, rather than the open-ended "<Head> of/for …" that carries on
 * past an "and".
 * @param {string} text
 * @returns {boolean}
 */
function isCompleteOrganisation(text) {
  return isOrganisation(text) && !OPEN_ENDED_ORG.test(text);
}

export default {
  canonicalName,
  isOrganisation,
  isNameSuffix,
  organisationsAmong,
  splitAuthorList,
};
