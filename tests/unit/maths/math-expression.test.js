/**
 * Unit tests for the safe arithmetic expression evaluator.
 *
 * The evaluator must never use eval/Function, must round away float artefacts, and must return a
 * friendly message (never throw) for anything it cannot compute.
 */

import { evaluateExpression } from '../../../src/features/maths/math-expression.js';

/** Convenience: assert a successful evaluation to an exact value. */
function value(expr) {
  const r = evaluateExpression(expr);
  expect(r.ok).toBe(true);
  return r.value;
}

describe('evaluateExpression — basic arithmetic', () => {
  it('adds', () => {
    expect(value('2 + 3')).toBe(5);
  });
  it('subtracts', () => {
    expect(value('10 - 4')).toBe(6);
  });
  it('multiplies', () => {
    expect(value('6 * 7')).toBe(42);
  });
  it('divides', () => {
    expect(value('20 / 5')).toBe(4);
  });
  it('handles a single number', () => {
    expect(value('42')).toBe(42);
  });
  it('tolerates surrounding whitespace', () => {
    expect(value('   8   ')).toBe(8);
  });
});

describe('evaluateExpression — precedence & parentheses', () => {
  it('applies * before +', () => {
    expect(value('2 + 3 * 4')).toBe(14);
  });
  it('applies / before -', () => {
    expect(value('10 - 8 / 2')).toBe(6);
  });
  it('respects parentheses', () => {
    expect(value('(2 + 3) * 4')).toBe(20);
  });
  it('handles nested parentheses', () => {
    expect(value('((1 + 2) * (3 + 4))')).toBe(21);
  });
  it('is left-associative for subtraction', () => {
    expect(value('10 - 3 - 2')).toBe(5);
  });
});

describe('evaluateExpression — unary minus/plus', () => {
  it('negates a leading number', () => {
    expect(value('-5')).toBe(-5);
  });
  it('adds a negative', () => {
    expect(value('3 + -2')).toBe(1);
  });
  it('multiplies by a negative', () => {
    expect(value('3 * -2')).toBe(-6);
  });
  it('handles a unary plus', () => {
    expect(value('+7')).toBe(7);
  });
  it('handles double negation', () => {
    expect(value('--5')).toBe(5);
  });
});

describe('evaluateExpression — percent postfix (divide by 100)', () => {
  it('converts a bare percent', () => {
    expect(value('50%')).toBe(0.5);
  });
  it('binds tighter than multiplication', () => {
    expect(value('200 * 10%')).toBe(20);
  });
  it('works with a negative', () => {
    expect(value('-25%')).toBe(-0.25);
  });
});

describe('evaluateExpression — float precision', () => {
  it('rounds 0.1 + 0.2 to 0.3', () => {
    expect(value('0.1 + 0.2')).toBe(0.3);
  });
  it('rounds 1/3 to 12 significant digits', () => {
    expect(value('1 / 3')).toBe(0.333333333333);
  });
  it('handles a leading decimal point', () => {
    expect(value('.5 + .5')).toBe(1);
  });
  it('keeps clean products of decimals', () => {
    expect(value('1.1 * 3')).toBe(3.3);
  });
});

describe('evaluateExpression — division by zero', () => {
  it('returns a friendly divide-by-zero message', () => {
    const r = evaluateExpression('5 / 0');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/divide by zero/i);
  });
  it('catches division by a zero sub-expression', () => {
    const r = evaluateExpression('1 / (2 - 2)');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/divide by zero/i);
  });
});

describe('evaluateExpression — malformed / junk input', () => {
  it('rejects an empty string', () => {
    const r = evaluateExpression('');
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
  it('rejects whitespace only', () => {
    expect(evaluateExpression('   ').ok).toBe(false);
  });
  it('rejects letters', () => {
    const r = evaluateExpression('2 + abc');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/doesn't look like a sum/i);
  });
  it('rejects a trailing operator', () => {
    expect(evaluateExpression('2 +').ok).toBe(false);
  });
  it('rejects unbalanced parentheses', () => {
    expect(evaluateExpression('(2 + 3').ok).toBe(false);
    expect(evaluateExpression('2 + 3)').ok).toBe(false);
  });
  it('rejects two numbers with no operator', () => {
    expect(evaluateExpression('2 3').ok).toBe(false);
  });
  it('rejects a malformed number with two dots', () => {
    expect(evaluateExpression('3.1.4').ok).toBe(false);
  });
  it('rejects non-string input', () => {
    expect(evaluateExpression(null).ok).toBe(false);
    expect(evaluateExpression(42).ok).toBe(false);
  });
  it('rejects a result that overflows to Infinity', () => {
    const r = evaluateExpression('9e999');
    // 9e999 tokenises as 9, e, 999 — junk (no exponent support) — still a friendly failure.
    expect(r.ok).toBe(false);
  });
});
