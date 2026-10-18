/**
 * Finds calls in src/, with their argument text, for the gates that keep third-party engines on
 * packaged code (ADR 0008, ADR 0010).
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every source file, with its path relative to src/ and its text. */
function sourceFiles() {
  return walk(SRC).map(file => ({
    file: path.relative(SRC, file).replace(/\\/g, '/'),
    code: fs.readFileSync(file, 'utf8'),
  }));
}

/**
 * The argument text of each call the pattern finds, matched to its closing paren.
 * @param {string} code
 * @param {RegExp} pattern - global, ending at the call's opening paren
 * @returns {string[]}
 */
function callArguments(code, pattern) {
  const calls = [];
  const found = new RegExp(pattern.source, 'g');
  while (found.exec(code) !== null) {
    let depth = 1;
    let i = found.lastIndex;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') {
        depth++;
      } else if (code[i] === ')') {
        depth--;
      }
      i++;
    }
    calls.push(code.slice(found.lastIndex, i - 1));
  }
  return calls;
}

/** Every call site in src/ for the pattern, as {file, args}. */
function callSites(pattern) {
  return sourceFiles().flatMap(({ file, code }) =>
    callArguments(code, pattern).map(args => ({ file, args }))
  );
}

module.exports = { callSites, sourceFiles };
