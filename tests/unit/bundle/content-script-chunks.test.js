/**
 * Build-output gate for content-script chunk loading.
 *
 * The content script runs inside someone else's page. Any URL it resolves against the *document*
 * instead of the extension points at that website, so a chunk reference like "/assets/x.js" becomes
 * https://whatever-they-are-reading.com/assets/x.js and 404s. Vite's module-preload helper did
 * exactly that (base is '/', and it appends <link rel="modulepreload"> to document.head), which is
 * why `build.modulePreload` is false in vite.config.js.
 *
 * Unit tests over src/ cannot see this — the bug only exists in the emitted bundle — so this suite
 * reads the real build output and walks the content script's module graph.
 *
 * Requires a build: `npm run build` (CI builds before running tests, per .github/workflows/ci.yml).
 */

const {
  contentScriptEntryChunk,
  readAsset,
  readAssetNames,
  readContentScriptLoader,
  reachableChunks,
  requireBuild,
  rootAbsoluteAssetRefs,
} = require('./build-output.js');

describe('build output: content-script chunk loading', () => {
  let assetNames;
  let entryChunk;
  let graph;

  beforeAll(() => {
    requireBuild();
    assetNames = readAssetNames();

    entryChunk = contentScriptEntryChunk();
    expect(entryChunk).not.toBeNull();

    graph = reachableChunks(entryChunk, assetNames);
  });

  it('declares a content script that loads its bundle from the extension origin', () => {
    const loader = readContentScriptLoader();

    expect(loader).toContain('chrome.runtime.getURL');
    expect(rootAbsoluteAssetRefs(loader)).toEqual([]);
  });

  it('reaches more than one chunk, so code splitting is still in effect', () => {
    // A regression that eagerly bundled everything would collapse this to a single file and
    // "fix" the 404s by making every page pay for the heavy features.
    expect(graph.seen.size).toBeGreaterThan(10);
  });

  it('references only chunks that exist on disk, matching case exactly', () => {
    // Windows and macOS resolve filenames case-insensitively, so a case mismatch is invisible
    // locally and fatal in the browser. Comparing against the real directory listing catches it.
    expect(graph.missing).toEqual([]);
  });

  it('never references an asset by a root-absolute URL', () => {
    // "/assets/x.js" resolves against the *page* the content script was injected into.
    const offenders = [];
    for (const name of graph.seen) {
      const refs = rootAbsoluteAssetRefs(readAsset(name));
      if (refs.length > 0) {offenders.push({ chunk: name, refs });}
    }
    expect(offenders).toEqual([]);
  });

  it('carries no module-preload dependency lists', () => {
    // Vite emits __vite__mapDeps only when the preload helper is given dependencies to fetch,
    // and fetching them is what appended <link> tags to the visited page.
    const offenders = [...graph.seen].filter(name => readAsset(name).includes('__vite__mapDeps'));
    expect(offenders).toEqual([]);
  });
});
