/**
 * A credential the extension stores must have something that uses it.
 *
 * The popup once collected, encrypted and stored DeepL and Azure Translator keys while no shipped
 * code could call either service: the module that would have read them was unreachable and had
 * been deleted. Every other test was green, because each piece worked on its own — the field saved,
 * the key round-tripped — and nothing asked whether anything outside the settings screen ever read
 * the key back.
 *
 * The rule: every provider slug that `src/` saves with `saveSecureAPIKey('<slug>', …)` must be read
 * with `getSecureAPIKey('<slug>')` (or an alias of it, or `hasSecureAPIKey`) by a file outside
 * `src/popup/`. The popup is where keys are typed in; reading one back there to fill the field is
 * not a consumer.
 *
 * LIMITS: literal slugs only. A save through a variable (`saveSecureAPIKey(provider, …)`, as the
 * cloud AI key form and the ai-setup relay do) is invisible to this scan, so a provider added
 * only through such a path needs its own test.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../src');
const POPUP = path.join(SRC, 'popup') + path.sep;

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

/** Source without comments, so a JSDoc example or a note is not read as a call. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const SAVE = /\bsaveSecureAPIKey\(\s*['"]([a-z0-9-]+)['"]/g;
const READ = /\b(?:getSecureAPIKey|getApiKey|hasSecureAPIKey)\(\s*['"]([a-z0-9-]+)['"]/g;

function scan() {
  const saved = new Map();
  const readOutsidePopup = new Set();
  for (const file of productionFiles()) {
    const source = withoutComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    for (const [, slug] of source.matchAll(SAVE)) {
      saved.set(slug, [...(saved.get(slug) || []), rel]);
    }
    if (!file.startsWith(POPUP)) {
      for (const [, slug] of source.matchAll(READ)) {
        readOutsidePopup.add(slug);
      }
    }
  }
  return { saved, readOutsidePopup };
}

test('every stored API key is read by something outside the popup', () => {
  const { saved, readOutsidePopup } = scan();
  const orphans = [...saved]
    .filter(([slug]) => !readOutsidePopup.has(slug))
    .map(([slug, files]) => `${slug} (saved in ${[...new Set(files)].join(', ')})`);
  expect(orphans).toEqual([]);
});
