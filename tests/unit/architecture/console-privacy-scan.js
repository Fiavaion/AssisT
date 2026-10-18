/**
 * Source scanner behind the console privacy gate.
 *
 * Reads `src/` as text at test time and reports every `console.*` call that hands a student's own
 * words to the browser console: page text, a selection, a dictated transcript, an essay, a citation
 * they typed, an AI prompt or an AI response. Under FERPA that log is coursework data, and it is
 * routinely pasted whole into a bug report.
 *
 * This is regex over text, not a parser. Read `LIMITS` before trusting a green run.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../src');

/**
 * The content-bearing words. A `console.*` argument built from an identifier containing any of them
 * is assumed to carry something of the student's until the shape of the expression proves otherwise.
 *
 * The first nine were the original list, and a replay of the thirteen leaks removed in the 1.0.0
 * privacy sweep walked straight through it: nine of the thirteen named no content word. A page URL,
 * an assignment title, a search query, a dictated vocabulary word, a summary and an AI answer are
 * all the student's, so the list now names them too, and `console-privacy.test.js` replays all
 * thirteen removed lines as shapes this scanner must reject.
 *
 * `text` excludes `context`: `AudioContext` and `contextMenu` carry nothing, and flagging them would
 * teach the next reader to suppress the gate rather than read it.
 */
const SENSITIVE_WORD =
  /(?<!con)text|content|transcript|selection|prompt|response|essay|quote|citation|word|title|url|quer(?:y|ies)|summar(?:y|ies)|answer|question|token|secret|credential|password/i;

/**
 * Names that contain a content word and still carry nothing: the DOM search methods, the keyboard,
 * a CSS at-rule. Listed one by one, because a loose exception is how a gate stops working.
 */
const STRUCTURAL_NAME =
  /^(?:querySelector(?:All)?|keyboard|key(?:down|up|press|frames)|titleCase|urlPattern|tokenizer)$/i;

/**
 * A credential name, judged before the `…Key`/`…Keys` exemption below: `cacheKey` and `sortedKeys`
 * are structure, `apiKey` and `authToken` are the thing an attacker wants out of a pasted log.
 */
const CREDENTIAL_NAME = /api|auth|access|secret|private|licen[cs]e|credential|bearer|password/i;

/**
 * Whole containers. Logging one of these by itself prints whatever it happens to hold — the root
 * `assist_settings` object carries an API key and the cognitive profile, and a storage writer's
 * `value` is whatever the student just saved. One named field read off a container is judged on its
 * own name instead, so `settings.aiMode` and `event.target.value` stay quiet.
 */
const CONTAINER_NAME =
  /^(?:settings?|config|configuration|preferences?|prefs|profile|payload|credentials?|values?|data)$/i;

/**
 * Properties that reduce a content-bearing value to a measurement. `value.length` says how much was
 * dictated; `value` says what was dictated. Only the first belongs in a log.
 */
const MEASURING_PROPERTIES = new Set([
  'length',
  'size',
  'byteLength',
  'status',
  'statusText',
  'ok',
  'count',
  'id',
  'type',
  'number', // a question number, a page number — a position, not what is on the page
  'index',
  'name', // voice names and provider names only; see the allowlist for the one caller that matters
  'error', // our own error strings and Chrome's, never a value the student produced
  'success', // the boolean flag on our own message envelope
]);

/**
 * Identifier endings that are already a measurement rather than the thing measured —
 * `responseLength`, `promptTokens`, `selectionCount`. Matching the whole ending, not a substring,
 * keeps `responseText` out.
 */
const MEASURING_SUFFIX =
  /(Length|Count|Type|Types|Id|Ids|Size|Ms|Time|Tokens|Index|Mode|Enabled|Available|State|Status|Error)$/;

/** Every `.js` file under src/, recursively. */
function productionFiles(dir = SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      productionFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const relative = file => path.relative(SRC, file).split(path.sep).join('/');

/**
 * Blanks out comments and the literal parts of strings, leaving the code that produces values.
 *
 * Template literals keep their `${...}` holes: `` `Reading: ${text}` `` leaks, and blanking the
 * whole literal would hide it. Everything blanked is replaced by spaces so byte offsets, and so
 * line numbers, survive.
 */
function blankLiterals(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') {
        out[i] = ' ';
      }
    }
  };
  /**
   * Whether the `/` at `at` opens a regular expression rather than dividing.
   *
   * It has to be asked: `.replace(/```json/g, '')` holds three backticks, and reading them as a
   * template literal swallowed the rest of `socraticTutor.js` — including the call that logged a
   * whole AI answer. Division only ever follows a value, so anything else means a regex.
   */
  const opensRegex = at => {
    let j = at - 1;
    while (j >= 0 && /\s/.test(source[j])) {
      j -= 1;
    }
    if (j < 0) {
      return true;
    }
    if (/[)\]}\w$]/.test(source[j])) {
      const word = source.slice(0, j + 1).match(/[A-Za-z_$][\w$]*$/);
      return Boolean(
        word && ['return', 'typeof', 'case', 'in', 'of', 'do', 'else'].includes(word[0])
      );
    }
    return true;
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      blank(i, end === -1 ? source.length : end + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === '/' && opensRegex(i)) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '[') {
          inClass = true;
        } else if (source[j] === ']') {
          inClass = false;
        } else if (source[j] === '/' && !inClass) {
          break;
        }
        j += 1;
      }
      blank(i, j + 1);
      i = j + 1;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch && source[j] !== '\n') {
        j += source[j] === '\\' ? 2 : 1;
      }
      blank(i, j + 1);
      i = j + 1;
    } else if (ch === '`') {
      let j = i + 1;
      let depth = 0;
      blank(i, i + 1);
      while (j < source.length) {
        if (source[j] === '\\') {
          blank(j, j + 2);
          j += 2;
          continue;
        }
        if (depth === 0 && source[j] === '`') {
          blank(j, j + 1);
          j += 1;
          break;
        }
        if (depth === 0 && source[j] === '$' && source[j + 1] === '{') {
          depth = 1;
          j += 2;
          continue;
        }
        if (depth > 0) {
          if (source[j] === '{') {
            depth += 1;
          }
          if (source[j] === '}') {
            depth -= 1;
          }
          j += 1;
          continue;
        }
        blank(j, j + 1);
        j += 1;
      }
      i = j;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** The argument text of a `console.*` call, found by balancing parentheses from the opening one. */
function callArguments(source, openParen) {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === '(') {
      depth += 1;
    } else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParen + 1, i);
      }
    }
  }
  return source.slice(openParen + 1);
}

/**
 * Whether a content-bearing identifier at `at` is consumed as a measurement.
 *
 * `text.length` and `response?.status` measure; `text.substring(0, 50)` and a bare `text` do not.
 */
function isMeasured(args, at, identifier) {
  if (MEASURING_SUFFIX.test(identifier)) {
    return true;
  }
  // `hasResponse`, `isPromptReady` — the name says it is already a boolean about the value.
  if (/^(has|is|should|can|needs?|no)[A-Z]/.test(identifier)) {
    return true;
  }
  const before = args.slice(0, at);
  // `typeof text` is the shape of the value, `Object.keys(settings)` its field names, and
  // `!!response` only whether there was one.
  if (
    /!\s*$/.test(before) ||
    /\btypeof\s+$/.test(before) ||
    /\bObject\s*\.\s*keys\s*\(\s*$/.test(before)
  ) {
    return true;
  }
  // Judge the end of the member chain, not its first link: `content.text?.length` measures,
  // `content.text` does not, and `text.substring(0, 50)` is a preview of the student's words.
  let rest = args.slice(at + identifier.length);
  let last = null;
  for (;;) {
    // `[)\]]*` steps out of a wrapper first, so `Object.keys(layout.titles).length` and
    // `String(text).length` are read as the measurement they are.
    const link = rest.match(/^\s*[)\]]*\s*\??\.\s*([A-Za-z_$][\w$]*)\s*(\([^()]*\))?/);
    if (!link) {
      break;
    }
    last = link[1];
    rest = rest.slice(link[0].length);
  }
  return last !== null && MEASURING_PROPERTIES.has(last);
}

/**
 * Whether the identifier at `at` is the whole of its container rather than one field read off it.
 *
 * `settings` and `this.settings` are the container; `settings.aiMode` and `event.target.value` are
 * one named field, judged on that field's own name. `this` is transparent, because `this.settings`
 * is exactly the object the 1.0.0 sweep was logging whole.
 */
function isWholeContainer(args, at, identifier) {
  const before = args.slice(0, at);
  if (/\??\.\s*$/.test(before) && !/(?:this|self|globalThis)\s*\??\.\s*$/.test(before)) {
    return false;
  }
  return !/^\s*(?:\??\.|\[|\()/.test(args.slice(at + identifier.length));
}

/**
 * Whether the identifier at `at` names something of the student's.
 *
 * A content word always counts. A container name counts only when the whole container is logged.
 * A `…Key`/`…Keys` name is structure — a storage key, the field names off an object — unless the
 * name also reads as a credential.
 */
function isSensitive(args, at, identifier) {
  if (STRUCTURAL_NAME.test(identifier)) {
    return false;
  }
  // A property key in an object literal — `{ settings: featureSettings }` — is a label, not a
  // value. The key is judged, the value beside it is judged on its own name.
  if (
    /^\s*:(?!:)/.test(args.slice(at + identifier.length)) &&
    /[{,]\s*$/.test(args.slice(0, at))
  ) {
    return false;
  }
  if (/keys?$/i.test(identifier)) {
    return CREDENTIAL_NAME.test(identifier);
  }
  if (SENSITIVE_WORD.test(identifier)) {
    return true;
  }
  return CONTAINER_NAME.test(identifier) && isWholeContainer(args, at, identifier);
}

/**
 * Every `console.*` call in `src/` that passes a content-bearing value.
 *
 * Returns `{ file, line, identifier, snippet }` per finding, `file` relative to `src/`.
 */
function scanSource(name, raw) {
  const findings = [];
  const code = blankLiterals(raw);
  const call =
    /console\s*\.\s*(log|warn|error|info|debug|trace|table|dir|group|groupCollapsed)\s*\(/g;
  let match;
  while ((match = call.exec(code))) {
    const openParen = code.indexOf('(', match.index + match[0].length - 1);
    const args = callArguments(code, openParen);
    const identifier = /[A-Za-z_$][\w$]*/g;
    let token;
    const seen = new Set();
    while ((token = identifier.exec(args))) {
      const word = token[0];
      if (seen.has(word) || !isSensitive(args, token.index, word)) {
        continue;
      }
      if (isMeasured(args, token.index, word)) {
        continue;
      }
      seen.add(word);
      findings.push({
        file: name,
        line: raw.slice(0, openParen).split('\n').length,
        identifier: word,
        snippet: raw
          .slice(match.index, openParen + args.length + 1)
          .replace(/\s+/g, ' ')
          .slice(0, 120),
      });
    }
  }
  return findings;
}

function scanConsoleCalls(files = productionFiles()) {
  return files.flatMap(file => scanSource(relative(file), fs.readFileSync(file, 'utf8')));
}

/** The same scan over a source string, so the scanner's own rules can be tested. */
scanConsoleCalls.forSource = scanSource;

/**
 * What this gate cannot see, stated so a green run is not read as more than it is.
 *
 * - Aliasing. `const payload = transcript; console.log(payload)` passes: the name no longer says
 *   what the value is. The gate is a naming discipline, not a taint tracker.
 * - Objects. `console.log({ a: text })` is caught because `text` appears; `console.log(result)`
 *   where `result` happens to hold an essay is not.
 * - Logging helpers. Only literal `console.*` calls are scanned, so a value passed to a wrapper is
 *   judged where the wrapper calls `console`, not where the caller hands it over.
 */
const LIMITS = [
  'Renaming a content-bearing variable hides it from this gate.',
  'A value logged through a wrapper is judged at the wrapper, not at the caller.',
  'Only `console.*` is scanned; other sinks are out of scope.',
];

module.exports = { scanConsoleCalls, productionFiles, blankLiterals, LIMITS };
