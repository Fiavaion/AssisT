/**
 * A key, token or password the popup stores must have something outside the popup that reads it.
 *
 * Advanced options once offered a "Google Translate" engine with a key field that wrote the key,
 * in plain text, into the settings as `translationSettings.googleApiKey`. Nothing read it:
 * translation only ever called MyMemory. `secure-key-consumers.test.js` catches this for keys saved
 * with `saveSecureAPIKey`, and could not see this one, because it never went near that function.
 *
 * The rule: every key-like property name the popup writes (`something.fooApiKey = ...`, or
 * `fooApiKey: ...` in an object it builds) must be read by a file outside `src/popup/`. A
 * migration that deletes a withdrawn field names it too, and is not a reader, so
 * `settings-migrations.js` does not count.
 *
 * LIMITS: literal property names only. A key written under a computed name is invisible here.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../src');
const POPUP = path.join(SRC, 'popup') + path.sep;
const NOT_A_READER = new Set(['utils/settings-migrations.js']);

function sourceFiles(dir = SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Source without comments, so a note about history is not read as code. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const KEY_LIKE = '[A-Za-z_]*(?:[Aa]pi_?[Kk]ey|[Ss]ecret|[Aa]ccess_?[Tt]oken|[Aa]uth_?[Tt]oken|[Pp]assword)';
const ASSIGNED = new RegExp(`\\.(${KEY_LIKE})\\s*=(?!=)`, 'g');
const OBJECT_KEY = new RegExp(`[{,]\\s*['"]?(${KEY_LIKE})['"]?\\s*:(?!:)`, 'g');

function scan() {
  const written = new Map();
  const outside = [];
  for (const file of sourceFiles()) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const source = withoutComments(fs.readFileSync(file, 'utf8'));
    if (file.startsWith(POPUP)) {
      for (const pattern of [ASSIGNED, OBJECT_KEY]) {
        for (const [, name] of source.matchAll(pattern)) {
          written.set(name, [...new Set([...(written.get(name) || []), rel])]);
        }
      }
    } else if (!NOT_A_READER.has(rel)) {
      outside.push(source);
    }
  }
  return { written, outside };
}

test('every key-like value the popup stores is read by something outside the popup', () => {
  const { written, outside } = scan();
  const orphans = [...written]
    .filter(([name]) => !outside.some(source => new RegExp(`\\b${name}\\b`).test(source)))
    .map(([name, files]) => `${name} (written in ${files.join(', ')})`);
  expect(orphans).toEqual([]);
});

test('the scan can see a key-like field written the way the withdrawn one was', () => {
  const sample = 'this.settings.translationSettings.googleApiKey = e.target.value;';
  expect([...sample.matchAll(ASSIGNED)].map(match => match[1])).toEqual(['googleApiKey']);
  expect([...'{ googleApiKey: "", maxTokens: 5 }'.matchAll(OBJECT_KEY)].map(m => m[1])).toEqual([
    'googleApiKey',
  ]);
});

test('the Google Translate engine choice and key field are gone from the popup', () => {
  const popup = [
    fs.readFileSync(path.join(SRC, 'popup/popup.js'), 'utf8'),
    fs.readFileSync(path.join(SRC, 'popup/popup.html'), 'utf8'),
  ].join('\n');
  expect(popup).not.toMatch(/translation-google-api-key|translation-engine-|google-api-key-container/);
  expect(popup).not.toMatch(/LibreTranslate/);
});
