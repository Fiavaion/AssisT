/**
 * Readers for the emitted extension, shared by the build-output suites in this directory.
 *
 * These suites check the bundle rather than the source, because the failures they exist to catch
 * only appear once Vite has resolved imports and hashed filenames: a chunk referenced by a name
 * that is not on disk, a chunk reference resolved against the visited page instead of the
 * extension, or a file shipped as raw source whose own imports were never shipped beside it.
 *
 * Requires a build: `npm run build` (CI builds before running tests, per .github/workflows/ci.yml).
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', '..', '.vite');
const ASSETS_DIR = path.join(OUT_DIR, 'assets');
const BUILT_MANIFEST = path.join(OUT_DIR, 'manifest.json');

const MISSING_BUILD =
  `Build output not found at ${OUT_DIR}. Run \`npm run build\` before the test suite — ` +
  `this suite checks emitted chunks, not source.`;

/** Throws with a usable message when the suite is run without a build. */
function requireBuild() {
  if (!fs.existsSync(BUILT_MANIFEST) || !fs.existsSync(ASSETS_DIR)) {
    throw new Error(MISSING_BUILD);
  }
}

function readBuiltManifest() {
  return JSON.parse(fs.readFileSync(BUILT_MANIFEST, 'utf-8'));
}

/** Every filename actually in assets/, so membership tests are case-SENSITIVE on Windows/macOS. */
function readAssetNames() {
  return new Set(fs.readdirSync(ASSETS_DIR));
}

function readAsset(name) {
  return fs.readFileSync(path.join(ASSETS_DIR, name), 'utf-8');
}

/** Chunk specifiers a JS bundle references: `from"./x.js"`, `import("./x.js")`, `import"./x.js"`. */
function relativeChunkRefs(code) {
  const refs = new Set();
  const pattern = /(?:from|import)\s*\(?\s*["'](\.\/[^"']+\.js)["']/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    refs.add(match[1].slice(2));
  }
  return refs;
}

/** Root-absolute asset URLs — these resolve against the visited page, never the extension. */
function rootAbsoluteAssetRefs(code) {
  return [...new Set(code.match(/["'`]\/assets\/[^"'`]+["'`]/g) || [])];
}

/**
 * The chunk the declared content script actually runs. CRXJS ships a tiny loader as the manifest
 * entry and that loader imports the real bundle through chrome.runtime.getURL(), which is what puts
 * the bundle on the extension origin — so the entry has to be read from it rather than guessed.
 */
function contentScriptEntryChunk() {
  const loaderPath = readBuiltManifest().content_scripts[0].js[0];
  const loader = fs.readFileSync(path.join(OUT_DIR, loaderPath), 'utf-8');
  const entryMatch = loader.match(/getURL\(\s*["'](?:\.\/)?assets\/([^"']+\.js)["']\s*\)/);
  return entryMatch === null ? null : entryMatch[1];
}

function readContentScriptLoader() {
  const loaderPath = readBuiltManifest().content_scripts[0].js[0];
  return fs.readFileSync(path.join(OUT_DIR, loaderPath), 'utf-8');
}

/** Walks out from a chunk, following relative imports. Lazy chunks are followed too. */
function reachableChunks(entryFile, assetNames) {
  const seen = new Set();
  const missing = [];
  const queue = [entryFile];

  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);

    if (!assetNames.has(name)) {
      missing.push(name);
      continue;
    }
    for (const ref of relativeChunkRefs(readAsset(name))) {
      queue.push(ref);
    }
  }

  return { seen, missing };
}

/** Every .js file the build ships as raw source (everything outside assets/), relative to .vite. */
function rawCopiedScripts(subdir = '') {
  const root = path.join(OUT_DIR, 'src', subdir);
  if (!fs.existsSync(root)) {
    return [];
  }
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Imports of a raw-copied script that the build never shipped. A raw copy is served as-is, so its
 * own imports have to exist as files beside it; when they do not, the browser blocks the load and
 * the whole module silently never runs.
 */
function unshippedImports(absFile) {
  const code = fs.readFileSync(absFile, 'utf-8');
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  const broken = [];
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      continue;
    }
    if (!fs.existsSync(path.resolve(path.dirname(absFile), specifier))) {
      broken.push(specifier);
    }
  }
  return broken;
}

/** Every file the build emitted, as paths relative to .vite with forward slashes. */
function emittedFiles() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        found.push(path.relative(OUT_DIR, full).split(path.sep).join('/'));
      }
    }
  };
  walk(OUT_DIR);
  return found;
}

/** Every script the build emitted — bundled chunks and raw copies alike. */
function emittedScripts() {
  return emittedFiles().filter(file => file.endsWith('.js') || file.endsWith('.mjs'));
}

/** Every page the build emitted. */
function emittedPages() {
  return emittedFiles().filter(file => file.endsWith('.html'));
}

/**
 * Relative import specifiers in a script, static and dynamic. Only relative ones, because they are
 * the only ones that name a file the build had to emit: a bare specifier was resolved by the
 * bundler, and a specifier built at runtime cannot be read off the text at all.
 */
function relativeImportSpecifiers(code) {
  const specifiers = new Set();
  const pattern = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.[^"']*)["']/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

/**
 * Script and stylesheet targets a page loads from the extension itself, as paths relative to .vite.
 * External URLs, in-page anchors and inline data are skipped — only a path the build had to emit
 * can be missing from it.
 */
function pageResourceRefs(pageFile) {
  const html = fs.readFileSync(path.join(OUT_DIR, pageFile), 'utf-8');
  const refs = new Set();
  const pattern = /<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*"([^"]+)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const ref = match[1].trim();
    if (ref === '' || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) {
      continue;
    }
    // A root-absolute path is the extension root, which is .vite; anything else is page-relative.
    const resolved = ref.startsWith('/')
      ? ref.slice(1)
      : path.posix.join(path.posix.dirname(pageFile), ref);
    refs.add(resolved.split('?')[0].split('#')[0]);
  }
  return [...refs];
}

/** Files a web_accessible_resources pattern (`assets/*.js`, `public/icons/*`, a plain path) covers. */
function filesMatchingResource(pattern, files) {
  const expression = new RegExp(
    `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`
  );
  return files.filter(file => expression.test(file));
}

/** Every path the manifest itself claims the build ships, as paths relative to .vite. */
function manifestDeclaredFiles() {
  const manifest = readBuiltManifest();
  const declared = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.storage?.managed_schema,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap(script => [
      ...(script.js || []),
      ...(script.css || []),
    ]),
  ];
  return [...new Set(declared.filter(Boolean))];
}

module.exports = {
  OUT_DIR,
  ASSETS_DIR,
  emittedFiles,
  emittedPages,
  emittedScripts,
  filesMatchingResource,
  manifestDeclaredFiles,
  pageResourceRefs,
  relativeImportSpecifiers,
  contentScriptEntryChunk,
  readAsset,
  readAssetNames,
  readBuiltManifest,
  readContentScriptLoader,
  reachableChunks,
  rawCopiedScripts,
  relativeChunkRefs,
  requireBuild,
  rootAbsoluteAssetRefs,
  unshippedImports,
};
