/**
 * Unit tests for the pure number-formatting / place-value helpers.
 */

import {
  GROUPING_CHARS,
  parseNumericString,
  groupDigits,
  placeValueParts,
  numberToWords,
  formatForScreenReader,
} from '../../../src/features/maths/math-format.js';

describe('parseNumericString', () => {
  it('parses plain digits', () => {
    expect(parseNumericString('12345')).toMatchObject({
      integerDigits: '12345',
      fractionDigits: '',
      negative: false,
      value: 12345,
    });
  });

  it('parses comma grouping', () => {
    expect(parseNumericString('1,234,567')).toMatchObject({
      integerDigits: '1234567',
      negative: false,
      value: 1234567,
    });
  });

  it('parses a short comma-grouped number below 4 digits ("1,234")', () => {
    expect(parseNumericString('1,234')).toMatchObject({ integerDigits: '1234', value: 1234 });
  });

  it('parses regular-space grouping ("30 000")', () => {
    expect(parseNumericString('30 000')).toMatchObject({ integerDigits: '30000', value: 30000 });
  });

  it('parses thin-space grouping (U+2009)', () => {
    expect(parseNumericString('30 000')).toMatchObject({ integerDigits: '30000', value: 30000 });
  });

  it('parses narrow-no-break-space grouping (U+202F)', () => {
    expect(parseNumericString('30 000')).toMatchObject({ integerDigits: '30000', value: 30000 });
  });

  it('parses a decimal point', () => {
    expect(parseNumericString('3.14159')).toMatchObject({
      integerDigits: '3',
      fractionDigits: '14159',
      value: 3.14159,
    });
  });

  it('parses a grouped integer with a decimal tail', () => {
    expect(parseNumericString('34,567.25')).toMatchObject({
      integerDigits: '34567',
      fractionDigits: '25',
      value: 34567.25,
    });
  });

  it('parses a leading minus', () => {
    expect(parseNumericString('-42')).toMatchObject({ negative: true, integerDigits: '42', value: -42 });
  });

  it('parses the Unicode minus sign (U+2212)', () => {
    expect(parseNumericString('−42')).toMatchObject({ negative: true, integerDigits: '42' });
  });

  it('keeps a currency prefix without dropping it', () => {
    expect(parseNumericString('$1,234.56')).toMatchObject({
      prefix: '$',
      suffix: '',
      integerDigits: '1234',
      fractionDigits: '56',
    });
  });

  it('keeps a percent suffix without dropping it', () => {
    expect(parseNumericString('30%')).toMatchObject({ prefix: '', suffix: '%', integerDigits: '30' });
  });

  it('keeps an unrecognised unit suffix without dropping it', () => {
    expect(parseNumericString('30000 kg')).toMatchObject({ suffix: 'kg', integerDigits: '30000' });
  });

  it('handles a euro-prefixed grouped amount', () => {
    expect(parseNumericString('€30,000')).toMatchObject({ prefix: '€', integerDigits: '30000' });
  });

  it('parses zero', () => {
    expect(parseNumericString('0')).toMatchObject({ integerDigits: '0', fractionDigits: '', value: 0 });
  });

  it('parses a 4-digit year as an ordinary number (no special-casing at this layer)', () => {
    expect(parseNumericString('2026')).toMatchObject({ integerDigits: '2026', value: 2026 });
  });

  it('parses a very large (1e15-scale) integer exactly', () => {
    expect(parseNumericString('1,000,000,000,000,000')).toMatchObject({
      integerDigits: '1000000000000000',
    });
  });

  it('strips leading zeros but keeps a single zero', () => {
    expect(parseNumericString('007')).toMatchObject({ integerDigits: '7' });
    expect(parseNumericString('000')).toMatchObject({ integerDigits: '0' });
  });

  it('supports a leading-decimal form (".5")', () => {
    expect(parseNumericString('.5')).toMatchObject({ integerDigits: '0', fractionDigits: '5' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseNumericString('  42  ')).toMatchObject({ integerDigits: '42' });
  });

  it('returns null for non-numeric input, never throws', () => {
    expect(parseNumericString('not a number')).toBeNull();
    expect(parseNumericString('')).toBeNull();
    expect(parseNumericString('   ')).toBeNull();
    expect(parseNumericString('$')).toBeNull();
  });

  it('returns null (not a throw) for non-string input', () => {
    expect(parseNumericString(null)).toBeNull();
    expect(parseNumericString(undefined)).toBeNull();
    expect(parseNumericString(42)).toBeNull();
    expect(parseNumericString({})).toBeNull();
  });
});

describe('groupDigits', () => {
  it('groups with commas by default', () => {
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('groups a 4-digit number too (no minDigits gate at this layer)', () => {
    expect(groupDigits(1234)).toBe('1,234');
  });

  it('groups with spaces when requested', () => {
    expect(groupDigits(1234567, { grouping: 'space' })).toBe('1 234 567');
  });

  it('never groups the fractional part', () => {
    expect(groupDigits(1234567.891)).toBe('1,234,567.891');
  });

  it('handles negative numbers', () => {
    expect(groupDigits(-1234567)).toBe('-1,234,567');
  });

  it('does not render "-0" for a value that is exactly zero', () => {
    expect(groupDigits(-0)).toBe('0');
    expect(groupDigits('-0')).toBe('0');
  });

  it('handles zero and small numbers (no separators needed)', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(42)).toBe('42');
    expect(groupDigits(999)).toBe('999');
  });

  it('accepts an already-grouped string as input (idempotent)', () => {
    expect(groupDigits('1,234,567')).toBe('1,234,567');
  });

  it('handles a 1e15-scale integer', () => {
    expect(groupDigits(1e15)).toBe('1,000,000,000,000,000');
  });

  it('returns null for unparseable input', () => {
    expect(groupDigits('not a number')).toBeNull();
    expect(groupDigits(NaN)).toBeNull();
    expect(groupDigits(Infinity)).toBeNull();
  });
});

describe('placeValueParts', () => {
  // NOTE: placeValueParts() attaches a `.negative` own property directly to the returned array (see
  // its JSDoc) — comparing THAT array to a plain array literal via toEqual would fail (Jest treats
  // the extra own property as a structural difference), so these assertions compare `[...parts]`
  // (a plain copy with only the indexed elements) and check `.negative` separately.
  it('decomposes an integer into labelled place-value parts, most significant first', () => {
    const parts = placeValueParts(34567);
    expect([...parts]).toEqual([
      { digit: 3, place: 'ten-thousands', value: 30000 },
      { digit: 4, place: 'thousands', value: 4000 },
      { digit: 5, place: 'hundreds', value: 500 },
      { digit: 6, place: 'tens', value: 60 },
      { digit: 7, place: 'ones', value: 7 },
    ]);
    expect(parts.negative).toBe(false);
  });

  it('handles a single-digit number', () => {
    expect([...placeValueParts(7)]).toEqual([{ digit: 7, place: 'ones', value: 7 }]);
  });

  it('handles zero', () => {
    const parts = placeValueParts(0);
    expect([...parts]).toEqual([{ digit: 0, place: 'ones', value: 0 }]);
    expect(parts.negative).toBe(false);
  });

  it('flags negative numbers via the .negative property, not the digit values', () => {
    const parts = placeValueParts(-42);
    expect(parts.negative).toBe(true);
    expect([...parts]).toEqual([
      { digit: 4, place: 'tens', value: 40 },
      { digit: 2, place: 'ones', value: 2 },
    ]);
  });

  it('does not mark an exactly-zero value as negative even if given "-0"', () => {
    expect(placeValueParts('-0').negative).toBe(false);
  });

  it('decomposes decimals into tenths/hundredths/thousandths', () => {
    const parts = placeValueParts(3.14159);
    expect(parts.slice(0, 1)).toEqual([{ digit: 3, place: 'ones', value: 3 }]);
    expect(parts.slice(1)).toEqual([
      { digit: 1, place: 'tenths', value: 0.1 },
      { digit: 4, place: 'hundredths', value: 0.04 },
      { digit: 1, place: 'thousandths', value: 0.001 },
      { digit: 5, place: 'ten-thousandths', value: 0.0005 },
      { digit: 9, place: 'hundred-thousandths', value: 0.00009 },
    ]);
  });

  it('labels place values into the millions/billions/trillions range', () => {
    const parts = placeValueParts(1234567890123);
    expect(parts[0]).toEqual({ digit: 1, place: 'trillions', value: 1000000000000 });
    const places = parts.map(p => p.place);
    expect(places).toContain('hundred-billions');
    expect(places).toContain('ten-millions');
  });

  it('returns null for unparseable input', () => {
    expect(placeValueParts('not a number')).toBeNull();
  });
});

describe('numberToWords', () => {
  it('matches the documented golden example exactly', () => {
    expect(numberToWords('34,567.25')).toBe(
      'thirty-four thousand, five hundred and sixty-seven point two five'
    );
  });

  it('reads zero', () => {
    expect(numberToWords(0)).toBe('zero');
  });

  it('reads single and double digit numbers', () => {
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(15)).toBe('fifteen');
    expect(numberToWords(42)).toBe('forty-two');
    expect(numberToWords(20)).toBe('twenty');
  });

  it('uses "and" for a hundreds-group remainder', () => {
    expect(numberToWords(567)).toBe('five hundred and sixty-seven');
    expect(numberToWords(100)).toBe('one hundred');
  });

  it('bridges a final sub-100 ones-group onto the rest with "and"', () => {
    expect(numberToWords(1005)).toBe('one thousand and five');
    expect(numberToWords(50067)).toBe('fifty thousand and sixty-seven');
    expect(numberToWords(1050)).toBe('one thousand and fifty');
  });

  it('uses a comma (not "and") when the final group already contains "hundred"', () => {
    expect(numberToWords(1105)).toBe('one thousand, one hundred and five');
    expect(numberToWords(1234567)).toBe(
      'one million, two hundred and thirty-four thousand, five hundred and sixty-seven'
    );
  });

  it('omits zero-valued groups entirely', () => {
    expect(numberToWords(1000000)).toBe('one million');
    expect(numberToWords(100000)).toBe('one hundred thousand');
  });

  it('reads a 2026-style 4-digit number as an ordinary cardinal (no special-casing here)', () => {
    expect(numberToWords(2026)).toBe('two thousand and twenty-six');
  });

  it('reads decimals digit-by-digit after "point"', () => {
    expect(numberToWords('0.5')).toBe('zero point five');
    expect(numberToWords('3.14159')).toBe('three point one four one five nine');
  });

  it('prefixes negative numbers with "minus"', () => {
    expect(numberToWords(-42)).toBe('minus forty-two');
    expect(numberToWords('-1,234')).toBe('minus one thousand, two hundred and thirty-four');
  });

  it('never says "minus zero"', () => {
    expect(numberToWords(-0)).toBe('zero');
    expect(numberToWords('-0.0')).toBe('zero point zero');
  });

  it('scales up to at least the trillions', () => {
    expect(numberToWords(1000000000000)).toBe('one trillion');
  });

  it('handles a 1e15-scale integer', () => {
    expect(numberToWords(1e15)).toBe('one quadrillion');
  });

  it('returns null for unparseable input', () => {
    expect(numberToWords('not a number')).toBeNull();
  });
});

describe('formatForScreenReader', () => {
  it('speaks a plain grouped number', () => {
    expect(formatForScreenReader('30,000')).toBe('thirty thousand');
  });

  it('speaks the "30 000 read as thirty zero zero zero zero" failure case correctly', () => {
    expect(formatForScreenReader('30 000')).toBe('thirty thousand');
  });

  it('appends the spoken name of a recognised currency prefix', () => {
    expect(formatForScreenReader('€30,000')).toBe('thirty thousand euro');
    expect(formatForScreenReader('$1,234.56')).toBe(
      'one thousand, two hundred and thirty-four point five six dollars'
    );
    expect(formatForScreenReader('£10')).toBe('ten pounds');
  });

  it('appends "percent" for a % suffix (not "per cent")', () => {
    expect(formatForScreenReader('30%')).toBe('thirty percent');
  });

  it('keeps an unrecognised affix literally rather than dropping it', () => {
    expect(formatForScreenReader('30000 kg')).toBe('thirty thousand kg');
  });

  it('handles a negative number', () => {
    expect(formatForScreenReader('-42')).toBe('minus forty-two');
  });

  it('returns null when parsing fails', () => {
    expect(formatForScreenReader('not a number')).toBeNull();
  });
});

describe('GROUPING_CHARS', () => {
  it('exposes the comma and space separator characters', () => {
    expect(GROUPING_CHARS.comma).toBe(',');
    expect(GROUPING_CHARS.space).toBe(' ');
  });
});
