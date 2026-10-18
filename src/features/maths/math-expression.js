/**
 * Pure, safe arithmetic expression evaluator for the Maths Support calculator.
 *
 * NO `eval` / `new Function` — Manifest V3's CSP (`script-src 'self'`) forbids runtime code
 * generation, and even if it did not, evaluating arbitrary strings is a security hole. Instead this
 * module tokenises the input and evaluates it with a small recursive-descent parser.
 *
 * Grammar (precedence low → high):
 *   expr    := term  (('+' | '-') term)*
 *   term    := unary (('*' | '/') unary)*
 *   unary   := ('+' | '-') unary | postfix
 *   postfix := primary ('%')*            // '%' is a postfix "divide by 100" operator (50% → 0.5)
 *   primary := number | '(' expr ')'
 *
 * Supported: + - * / ( ) decimal numbers, unary minus/plus, and the '%' postfix. Anything else is
 * rejected with a friendly, non-technical message (this UI is for dyscalculic / neurodivergent
 * students — errors must reassure, never scold or leak a stack trace).
 *
 * Precision: results are rounded to 12 significant digits before returning, so IEEE-754 artefacts
 * (0.1 + 0.2 → 0.30000000000000004) display cleanly (→ 0.3).
 *
 * @module features/maths/math-expression
 */

const JUNK_MESSAGE = "That doesn't look like a sum I can work out.";
const EMPTY_MESSAGE = 'Type a sum to work out.';
const DIVIDE_BY_ZERO_MESSAGE = "You can't divide by zero.";
const TOO_BIG_MESSAGE = 'That number is too big to work out.';

/** Thrown internally when the token stream does not match the grammar. */
class ParseError extends Error {}
/** Thrown internally on division by zero so it can carry a specific friendly message. */
class DivideByZeroError extends Error {}

/**
 * Break an input string into number and operator tokens.
 * @param {string} input
 * @returns {Array<{type:'num'|'op', value:number|string}>|null} tokens, or null on any illegal char.
 */
function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    // Whitespace is insignificant.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    // A number: a run of digits and at most one decimal point.
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let dotCount = 0;
      while (i < input.length && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) {
        if (input[i] === '.') {
          dotCount += 1;
        }
        num += input[i];
        i += 1;
      }
      // "3.1.4" or a lone "." are not real numbers.
      if (dotCount > 1 || num === '.') {
        return null;
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }

    // A recognised operator / bracket / percent.
    if (
      ch === '+' ||
      ch === '-' ||
      ch === '*' ||
      ch === '/' ||
      ch === '(' ||
      ch === ')' ||
      ch === '%'
    ) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    // Anything else (letters, symbols) is not allowed.
    return null;
  }
  return tokens;
}

/**
 * Evaluate an arithmetic expression string safely.
 *
 * @param {string} input - e.g. "2 + 3 * 4", "(1+2)/3", "-5", "50%".
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
export function evaluateExpression(input) {
  if (typeof input !== 'string') {
    return { ok: false, error: JUNK_MESSAGE };
  }

  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: EMPTY_MESSAGE };
  }

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: JUNK_MESSAGE };
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];

  function parseExpr() {
    let value = parseTerm();
    let t = peek();
    while (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
      const op = advance().value;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
      t = peek();
    }
    return value;
  }

  function parseTerm() {
    let value = parseUnary();
    let t = peek();
    while (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
      const op = advance().value;
      const rhs = parseUnary();
      if (op === '*') {
        value *= rhs;
      } else {
        if (rhs === 0) {
          throw new DivideByZeroError();
        }
        value /= rhs;
      }
      t = peek();
    }
    return value;
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === 'op' && t.value === '-') {
      advance();
      return -parseUnary();
    }
    if (t && t.type === 'op' && t.value === '+') {
      advance();
      return parseUnary();
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let value = parsePrimary();
    let t = peek();
    while (t && t.type === 'op' && t.value === '%') {
      advance();
      value /= 100;
      t = peek();
    }
    return value;
  }

  function parsePrimary() {
    const t = peek();
    if (!t) {
      throw new ParseError();
    }
    if (t.type === 'num') {
      advance();
      return t.value;
    }
    if (t.type === 'op' && t.value === '(') {
      advance();
      const value = parseExpr();
      const close = peek();
      if (!close || close.type !== 'op' || close.value !== ')') {
        throw new ParseError();
      }
      advance();
      return value;
    }
    throw new ParseError();
  }

  try {
    const result = parseExpr();
    // Leftover tokens mean the expression was malformed (e.g. "2 3" or "2)").
    if (pos !== tokens.length) {
      return { ok: false, error: JUNK_MESSAGE };
    }
    if (Number.isNaN(result)) {
      return { ok: false, error: JUNK_MESSAGE };
    }
    if (!Number.isFinite(result)) {
      return { ok: false, error: TOO_BIG_MESSAGE };
    }
    // Round to 12 significant digits to hide float artefacts, then re-parse to a clean Number.
    const rounded = Number(result.toPrecision(12));
    // Normalise -0 to 0 so the display never shows a negative zero.
    return { ok: true, value: rounded === 0 ? 0 : rounded };
  } catch (err) {
    if (err instanceof DivideByZeroError) {
      return { ok: false, error: DIVIDE_BY_ZERO_MESSAGE };
    }
    return { ok: false, error: JUNK_MESSAGE };
  }
}

export default { evaluateExpression };
