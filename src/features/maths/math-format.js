/**
 * Pure number-formatting / place-value helpers — the "number formatter" accommodation.
 *
 * WHY this exists: screen readers routinely mangle large numbers written as plain digit runs
 * ("30000" is read digit-by-digit — "three zero zero zero zero" — not "thirty thousand"), and dense
 * unstructured numbers are hard to parse visually for dyscalculic students. This module turns a raw
 * numeric token (as it appears on a page) into: a digit-grouped display, a labelled place-value
 * breakdown (for colour-coding), full English words (for an accurate screen-reader string), and a
 * one-call screen-reader convenience that also speaks a recognised currency/percent affix.
 *
 * This is an ACCOMMODATION, not a tutor: no teaching, no explanation of place value — just make the
 * number readable, copyable and speakable as the number it already is.
 *
 * No DOM, no chrome APIs — safe to import anywhere and fully unit-testable. DOM wiring lives in the
 * sibling `math-format-dom.js`.
 *
 * CONVENTIONS (documented, not universal): grouping separators recognised on input are comma, any
 * Unicode space-separator (plain space, non-breaking space, thin space U+2009, narrow no-break space
 * U+202F, ...), all matched by `\s`. The decimal separator is always `.` (US/UK/Irish convention —
 * this is an Irish college product; comma-as-decimal locales are out of scope). English word output
 * uses the British/Irish "and" convention: "five hundred and sixty-seven", "one thousand and five".
 */

/** Grouping separator characters usable with {@link groupDigits} / the DOM wrapper. */
export const GROUPING_CHARS = { comma: ',', space: ' ' };

const MINUS_RE = /^[-−]/;
/**
 * Any grouping separator a page might use: comma, or a space. JS regex whitespace class `\s` already
 * matches every Unicode "space separator" (Zs) code point — plain space, NBSP (U+00A0), thin space
 * (U+2009), narrow no-break space (U+202F), etc. — so a bare `\s` covers all of them.
 */
const GROUP_CHARS_RE_G = /[,\s]/g;
/** A grouped-or-plain integer, with an optional decimal tail. */
const NUMBER_CORE_RE = /^(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d+))?/;

/**
 * Match the numeric core of a string (after sign/prefix have been stripped by the caller).
 * Falls back to a leading-decimal form ("`.5`") when there is no integer part.
 * @param {string} work
 * @returns {{intRaw: string, fracRaw: string, consumed: number}|null}
 */
function matchNumericCore(work) {
  const m = work.match(NUMBER_CORE_RE);
  if (m) {
    return { intRaw: m[1], fracRaw: m[2] || '', consumed: m[0].length };
  }
  const dotOnly = work.match(/^\.(\d+)/);
  if (dotOnly) {
    return { intRaw: '0', fracRaw: dotOnly[1], consumed: dotOnly[0].length };
  }
  return null;
}

/** @param {string} s digits, possibly with leading zeros @returns {string} normalised (min "0") */
function normalizeIntegerDigits(s) {
  const stripped = s.replace(/^0+(?=\d)/, '');
  return stripped || '0';
}

/** @param {boolean} negative @param {string} intDigits @param {string} fracDigits @returns {number} */
function toNumberValue(negative, intDigits, fracDigits) {
  const n = Number(fracDigits ? `${intDigits}.${fracDigits}` : intDigits);
  return negative ? -n : n;
}

/**
 * Robustly parse a numeric token as it might be displayed on a page: plain digits, comma/space/thin-
 * space grouping, a decimal point, a leading minus, and an optional currency/percent prefix or suffix
 * (kept, not dropped, so a caller can decide how to speak/render it). Never throws — returns `null`
 * for anything that isn't a recognisable number.
 * @param {string} str
 * @returns {{raw: string, prefix: string, suffix: string, negative: boolean, integerDigits: string,
 *   fractionDigits: string, value: number}|null} `integerDigits`/`fractionDigits` are the exact digit
 *   strings (no grouping) and are the canonical source of truth for huge/precise numbers; `value` is a
 *   best-effort `Number` convenience and may lose precision beyond `Number.MAX_SAFE_INTEGER`.
 */
export function parseNumericString(str) {
  if (typeof str !== 'string') {
    return null;
  }
  const raw = str.trim();
  if (!raw) {
    return null;
  }

  let work = raw;
  let negative = false;
  if (MINUS_RE.test(work)) {
    negative = true;
    work = work.slice(1);
  }

  const prefixMatch = work.match(/^[^\d.\-−]*/);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  work = work.slice(prefix.length);

  if (MINUS_RE.test(work)) {
    negative = true;
    work = work.slice(1);
  }

  const core = matchNumericCore(work);
  if (!core) {
    return null;
  }

  const suffix = work.slice(core.consumed);
  const integerDigits = normalizeIntegerDigits(core.intRaw.replace(GROUP_CHARS_RE_G, ''));
  const fractionDigits = core.fracRaw;

  return {
    raw,
    prefix: prefix.trim(),
    suffix: suffix.trim(),
    negative,
    integerDigits,
    fractionDigits,
    value: toNumberValue(negative, integerDigits, fractionDigits),
  };
}

/**
 * Normalise a `Number` or numeric `String` (grouped or plain) into exact digit-string parts. Shared
 * by every function below so they all accept either a `Number` or a formatted string interchangeably.
 * @param {number|string} value
 * @returns {{negative: boolean, integerDigits: string, fractionDigits: string}|null}
 */
function toDigits(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    const str = Math.abs(value).toString();
    if (/e/i.test(str)) {
      // Outside this module's documented range (would need exponential notation to round-trip).
      return null;
    }
    const [integerDigits, fractionDigits = ''] = str.split('.');
    return { negative: value < 0, integerDigits, fractionDigits };
  }
  if (typeof value === 'string') {
    const parsed = parseNumericString(value);
    if (!parsed) {
      return null;
    }
    return {
      negative: parsed.negative,
      integerDigits: parsed.integerDigits,
      fractionDigits: parsed.fractionDigits,
    };
  }
  return null;
}

/** @param {{integerDigits: string, fractionDigits: string}} digits @returns {boolean} true value is 0 */
function isZeroValue(digits) {
  return (
    digits.integerDigits === '0' && (!digits.fractionDigits || /^0*$/.test(digits.fractionDigits))
  );
}

/**
 * Format a number (or an already-formatted numeric string) with digit grouping. The fractional part,
 * if any, is never grouped. Returns `null` for unparseable input.
 * @param {number|string} value
 * @param {{grouping?: 'comma'|'space'}} [opts]
 * @returns {string|null}
 */
export function groupDigits(value, opts = {}) {
  const digits = toDigits(value);
  if (!digits) {
    return null;
  }
  const sep = GROUPING_CHARS[opts.grouping] || GROUPING_CHARS.comma;
  const intDigits = digits.integerDigits;
  let grouped = '';
  for (let i = 0; i < intDigits.length; i++) {
    if (i > 0 && (intDigits.length - i) % 3 === 0) {
      grouped += sep;
    }
    grouped += intDigits[i];
  }
  let out = digits.fractionDigits ? `${grouped}.${digits.fractionDigits}` : grouped;
  if (digits.negative && !isZeroValue(digits)) {
    out = `-${out}`;
  }
  return out;
}

/** Short-scale magnitude names for each 3-digit group above the ones/tens/hundreds group. */
const SCALE_NAMES = [
  '',
  'thousand',
  'million',
  'billion',
  'trillion',
  'quadrillion',
  'quintillion',
];

/** @param {number} groupIdx 0 = ones/tens/hundreds, 1 = thousands, 2 = millions, ... @returns {string} */
function scaleNameForGroup(groupIdx) {
  return groupIdx < SCALE_NAMES.length ? SCALE_NAMES[groupIdx] : `10^${groupIdx * 3}`;
}

/**
 * The colour-coding label for an integer digit position.
 * @param {number} idx place index from the right, 0 = ones, 1 = tens, 2 = hundreds, 3 = thousands, ...
 * @returns {string} e.g. 'ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands'
 */
function placeLabel(idx) {
  const group = Math.floor(idx / 3);
  const pos = idx % 3;
  const base = scaleNameForGroup(group);
  if (pos === 0) {
    return base === '' ? 'ones' : `${base}s`;
  }
  if (pos === 1) {
    return base === '' ? 'tens' : `ten-${base}s`;
  }
  return base === '' ? 'hundreds' : `hundred-${base}s`;
}

/** @param {number} p fraction position, 1 = tenths, 2 = hundredths, 3 = thousandths, ... @returns {string} */
function fractionPlaceLabel(p) {
  return `${placeLabel(p).replace(/s$/, '')}ths`;
}

/**
 * Decompose a number into per-digit place-value parts, most significant first, suitable for
 * colour-coding UI. Zero digits are included (so a UI can render a stable column count). Decimals are
 * broken down as tenths/hundredths/thousandths/... after the integer parts.
 * @param {number|string} value
 * @returns {(Array<{digit: number, place: string, value: number}> & {negative: boolean})|null} the
 *   array carries a `negative` flag as an own property (kept a flat array so each entry matches the
 *   simple `{digit, place, value}` shape); `negative` is false for a value that is exactly zero.
 */
export function placeValueParts(value) {
  const digits = toDigits(value);
  if (!digits) {
    return null;
  }
  const parts = [];
  const intDigits = digits.integerDigits;
  const n = intDigits.length;
  for (let i = 0; i < n; i++) {
    const idx = n - 1 - i;
    const digit = Number(intDigits[i]);
    parts.push({ digit, place: placeLabel(idx), value: digit * 10 ** idx });
  }
  const fracDigits = digits.fractionDigits;
  for (let i = 0; i < fracDigits.length; i++) {
    const p = i + 1;
    const digit = Number(fracDigits[i]);
    // Build the value from its exact decimal-string form ("0.00009") rather than `digit * 10 ** -p`,
    // which drifts (e.g. 9 * 10**-5 === 0.00008999999999999999) because -p powers of ten are not all
    // exactly representable in binary floating point.
    parts.push({
      digit,
      place: fractionPlaceLabel(p),
      value: Number(`0.${'0'.repeat(p - 1)}${digit}`),
    });
  }
  parts.negative = digits.negative && !isZeroValue(digits);
  return parts;
}

const ONES_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS_WORDS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/** @param {number} n 0-99 @returns {string} */
function twoDigitWords(n) {
  if (n < 20) {
    return ONES_WORDS[n];
  }
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS_WORDS[tens]}-${ONES_WORDS[ones]}` : TENS_WORDS[tens];
}

/** @param {number} n 0-999 @returns {string} */
function threeDigitWords(n) {
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds && rem) {
    return `${ONES_WORDS[hundreds]} hundred and ${twoDigitWords(rem)}`;
  }
  if (hundreds) {
    return `${ONES_WORDS[hundreds]} hundred`;
  }
  return twoDigitWords(rem);
}

/**
 * Convert an exact (unsigned) integer digit string to English words, using the British/Irish "and"
 * convention: "and" bridges the final group into the rest ONLY when that final (ones) group has no
 * hundreds digit of its own (e.g. "fifty thousand and sixty-seven", "one thousand and five") — when
 * the final group already reads "... hundred and ...", groups are joined with a comma instead (e.g.
 * "thirty-four thousand, five hundred and sixty-seven").
 * @param {string} digitStr
 * @returns {string}
 */
function integerDigitsToWords(digitStr) {
  const clean = normalizeIntegerDigits(digitStr);
  if (clean === '0') {
    return 'zero';
  }

  const groups = [];
  for (let i = clean.length; i > 0; i -= 3) {
    groups.unshift(clean.slice(Math.max(0, i - 3), i));
  }

  const rendered = groups
    .map((g, idx) => {
      const n = Number(g);
      if (n === 0) {
        return null;
      }
      const groupIdxFromRight = groups.length - 1 - idx;
      const scale = scaleNameForGroup(groupIdxFromRight);
      const words = threeDigitWords(n);
      return scale ? `${words} ${scale}` : words;
    })
    .filter(Boolean);

  if (rendered.length === 0) {
    return 'zero';
  }
  if (rendered.length === 1) {
    return rendered[0];
  }

  const lastGroupValue = Number(groups[groups.length - 1]);
  const lastGroupIsRendered = lastGroupValue !== 0;
  const lastGroupHasHundreds = lastGroupValue >= 100;

  if (lastGroupIsRendered && !lastGroupHasHundreds) {
    const last = rendered.pop();
    return `${rendered.join(', ')} and ${last}`;
  }
  return rendered.join(', ');
}

/**
 * Full English words for a number (or an already-formatted numeric string, grouping accepted).
 * Decimals are read digit-by-digit after "point" (never as a fraction/ratio). Negative numbers are
 * prefixed "minus " (never "minus zero" for a value that is exactly zero).
 * @param {number|string} value
 * @returns {string|null} e.g. `numberToWords('34,567.25')` -\>
 *   "thirty-four thousand, five hundred and sixty-seven point two five"
 */
export function numberToWords(value) {
  const digits = toDigits(value);
  if (!digits) {
    return null;
  }
  let out = integerDigitsToWords(digits.integerDigits);
  if (digits.fractionDigits) {
    const fracWords = digits.fractionDigits
      .split('')
      .map(d => ONES_WORDS[Number(d)])
      .join(' ');
    out = `${out} point ${fracWords}`;
  }
  if (digits.negative && !isZeroValue(digits)) {
    out = `minus ${out}`;
  }
  return out;
}

/** Accessible names for affixes we know how to speak; anything else is kept literally, not dropped. */
const AFFIX_WORDS = { '€': 'euro', $: 'dollars', '£': 'pounds', '%': 'percent' };

/**
 * One-call convenience: parse a displayed numeric token and produce a screen-reader-friendly spoken
 * string, including a natural rendering of a recognised currency/percent affix (e.g. "$30,000" -\>
 * "thirty thousand dollars", "30%" -\> "thirty percent"). An unrecognised affix is kept literally
 * (never silently dropped) in its original position. Returns `null` when the input can't be parsed.
 * @param {string} str
 * @returns {string|null}
 */
export function formatForScreenReader(str) {
  const parsed = parseNumericString(str);
  if (!parsed) {
    return null;
  }
  const canonical = `${parsed.negative ? '-' : ''}${parsed.integerDigits}${
    parsed.fractionDigits ? `.${parsed.fractionDigits}` : ''
  }`;
  let words = numberToWords(canonical);
  if (words === null) {
    return null;
  }

  const prefixWord = AFFIX_WORDS[parsed.prefix];
  if (prefixWord) {
    words = `${words} ${prefixWord}`;
  } else if (parsed.prefix) {
    words = `${parsed.prefix} ${words}`;
  }

  const suffixWord = AFFIX_WORDS[parsed.suffix];
  if (suffixWord) {
    words = `${words} ${suffixWord}`;
  } else if (parsed.suffix) {
    words = `${words} ${parsed.suffix}`;
  }

  return words;
}

export default {
  GROUPING_CHARS,
  parseNumericString,
  groupDigits,
  placeValueParts,
  numberToWords,
  formatForScreenReader,
};
