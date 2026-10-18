/**
 * One source of truth for where local AI lives.
 *
 * `src/utils/ollama-url.js` owns the Ollama endpoint: the default, the validation of a
 * user-supplied one, the stored override and the host permission that has to be held before any
 * of it is fetched (ADR 0002). A second copy of the address elsewhere in src silently opts that
 * caller out of all four — it ignores an institution's configured server, and it bypasses the
 * permission check, so it fails as an unexplained network error.
 *
 * Three modules had done exactly that and none of them was reachable; they were deleted rather
 * than repaired. This gate is what stops the fourth being written.
 *
 * The address does not have to be spelled in one piece to be a second copy of it. The service
 * worker's URL validator carried `hostname === 'localhost' && port === '11434'`, which is the same
 * decision written sideways — and, being its own spelling, it got the address wrong: it let
 * localhost through and turned away 127.0.0.1 and every institution's own Ollama host. So a
 * hostname and the port in one statement counts.
 *
 * Comments are allowed to name the address — the module's own documentation does.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'src');

/** The single module permitted to hold the literal. */
const OWNER = path.join(SRC, 'utils', 'ollama-url.js');

const ADDRESS = /(?:localhost|127\.0\.0\.1|\[::1\]):11434/;
const HOST = /(?:localhost|127\.0\.0\.1|\[::1\])/;
const PORT = /\b11434\b/;

/** Every .js and .html file under src/. */
function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, found);
    } else if (/\.(js|html)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Strip line comments, block comments and HTML comments, so a line that merely *documents* the
 * address is not read as a second definition of it.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Roughly one statement per entry: enough to tell a hostname and a port used together from the
 * two of them merely living in the same file.
 * @param {string} text
 * @returns {string[]}
 */
function statements(text) {
  return stripComments(text).split(/[;{}\n]/);
}

/**
 * Does this source name the Ollama endpoint — written whole, or as a hostname and a port decided
 * together in one statement?
 * @param {string} text
 * @returns {boolean}
 */
function namesTheEndpoint(text) {
  return statements(text).some(statement => HOST.test(statement) && PORT.test(statement));
}

describe('the Ollama endpoint', () => {
  it('is written down in exactly one module', () => {
    const offenders = sourceFiles(SRC)
      .filter(file => file !== OWNER)
      .filter(file => namesTheEndpoint(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('is recognised when it has been split into a hostname and a port', () => {
    expect(namesTheEndpoint("if (hostname === 'localhost' && parsed.port === '11434') {")).toBe(
      true
    );
    expect(namesTheEndpoint('const ok = host === "127.0.0.1" && port === 11434;')).toBe(true);
  });

  it('does not mistake an unrelated hostname and an unrelated port in one file for it', () => {
    expect(namesTheEndpoint("const host = 'localhost';\nconst timeout = 11434;")).toBe(false);
  });

  it('is still written down in that module, so the gate is testing something', () => {
    expect(ADDRESS.test(fs.readFileSync(OWNER, 'utf8'))).toBe(true);
  });
});
