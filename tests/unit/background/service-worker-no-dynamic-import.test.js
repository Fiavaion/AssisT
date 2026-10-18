/**
 * The service worker must not use dynamic `import()`.
 *
 * Chrome refuses `import()` on ServiceWorkerGlobalScope ("import() is disallowed on
 * ServiceWorkerGlobalScope by the HTML specification"), and Vite keeps a source `import()` as a
 * runtime `import()` in the worker bundle. The upgrade step in `onInstalled` loaded the key
 * migration that way, so it threw, landed in its catch, and never ran in Chrome: the sweep that
 * deletes withdrawn translator keys on update would have been a no-op. Jest cannot see this,
 * because Babel turns `import()` into `require()`; only reading the source can.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '../../../src/background/service-worker.js'),
  'utf8'
);

/** Source with comments and string literals blanked, so prose about import() is not a finding. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
}

test('service-worker.js has no dynamic import()', () => {
  expect(code(SOURCE)).not.toMatch(/\bimport\s*\(/);
});

test('the upgrade path imports the key migration statically', () => {
  expect(SOURCE).toMatch(
    /import\s*\{[^}]*\bmigrateLegacyKeys\b[^}]*\}\s*from\s*'..\/core\/storage\/secure-key-storage\.js'/
  );
});
