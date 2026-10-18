/**
 * Build-output gate for the Canvas, Moodle and Google Classroom adapters.
 *
 * The adapters used to ship as raw copied source, loaded with
 * `import(chrome.runtime.getURL('src/adapters/canvas-adapter.js'))`. A raw copy is served exactly as
 * written, so its own imports must exist as files beside it — and when `sanitizeHTML` was added to
 * the three adapters, `src/utils/sanitize.js` was neither copied into the build nor listed in
 * web_accessible_resources. Chrome blocked it, the import rejected, and all three LMS integrations
 * were dead on the very pages they exist for while every unit test over src/ stayed green.
 *
 * They are bundled now: a plain dynamic import from the feature module, so Vite emits a chunk under
 * assets/ with sanitize.js resolved into the graph. Only the bundle can show that, hence this suite.
 *
 * Requires a build: `npm run build`.
 */

const {
  contentScriptEntryChunk,
  readAsset,
  readAssetNames,
  readBuiltManifest,
  reachableChunks,
  rawCopiedScripts,
  relativeChunkRefs,
  requireBuild,
  unshippedImports,
} = require('./build-output.js');

/** The source module each adapter chunk is named after by Rollup. */
const ADAPTERS = ['canvas-adapter', 'moodle-adapter', 'google-classroom-adapter'];

describe('build output: LMS adapter chunks', () => {
  let assetNames;
  let graph;
  /** adapter basename -> emitted chunk filenames */
  let chunksByAdapter;

  beforeAll(() => {
    requireBuild();
    assetNames = readAssetNames();
    graph = reachableChunks(contentScriptEntryChunk(), assetNames);
    chunksByAdapter = new Map(
      ADAPTERS.map(name => [
        name,
        [...assetNames].filter(asset => new RegExp(`^${name}[.-][^/]*\.js$`).test(asset)),
      ])
    );
  });

  it.each(ADAPTERS)('emits a bundled chunk for %s under assets/', name => {
    expect(chunksByAdapter.get(name)).not.toEqual([]);
  });

  it.each(ADAPTERS)('reaches the %s chunk from the content script', name => {
    // Unreachable means no feature module imports it, which is how the adapters were dead code with
    // passing tests before: the only reference was a string path resolved at runtime.
    const reached = chunksByAdapter.get(name).filter(chunk => graph.seen.has(chunk));
    expect(reached).not.toEqual([]);
  });

  it('keeps every adapter chunk lazy, so a non-LMS page pays nothing for it', () => {
    const entry = contentScriptEntryChunk();
    const eager = ADAPTERS.flatMap(name =>
      chunksByAdapter
        .get(name)
        .filter(chunk => new RegExp(`from\s*["']\./${chunk}["']`).test(readAsset(entry)))
    );
    expect(eager).toEqual([]);
  });

  it('references only chunks that exist on disk', () => {
    // The class of failure this whole suite is about: a reference to something not shipped.
    expect(graph.missing).toEqual([]);
  });

  it.each(ADAPTERS)('resolves every import of the %s chunk into the build', name => {
    const broken = [];
    for (const chunk of chunksByAdapter.get(name)) {
      for (const ref of relativeChunkRefs(readAsset(chunk))) {
        if (!assetNames.has(ref)) {
          broken.push({ chunk, ref });
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('ships no adapter as raw source whose imports were left behind', () => {
    // If a raw copy ever comes back, its imports have to come with it.
    const offenders = rawCopiedScripts('adapters')
      .map(file => ({ file, missing: unshippedImports(file) }))
      .filter(entry => entry.missing.length > 0);
    expect(offenders).toEqual([]);
  });

  it('exposes no adapter source path through web_accessible_resources', () => {
    // Nothing loads the adapters by path any more, and a path listed here is a file any page in the
    // match set can fetch. Listing it again would also invite the raw-copy failure back.
    const exposed = (readBuiltManifest().web_accessible_resources || []).flatMap(entry =>
      (entry.resources || []).filter(resource => resource.startsWith('src/adapters/'))
    );
    expect(exposed).toEqual([]);
  });
});
