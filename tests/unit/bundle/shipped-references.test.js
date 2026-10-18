/**
 * Build-output gate: everything the shipped extension names must be in the shipped extension.
 *
 * Three ways this build has shipped a reference to a file that was not there, each of them silent:
 *
 *  1. A file shipped as raw source importing a module that was never emitted beside it. The LMS
 *     adapters died that way, and four more raw copies had the same fault — `ai-setup.js` reaching
 *     for `../../utils/ollama-models.js`, `feature-tools.js` for the popup's tool registry,
 *     `recommendations.js` for `setting-writes.js`, `microphone-button.js` for `sanitize.js`. A raw
 *     copy is served exactly as written, so Chrome blocks the import and the module never runs.
 *  2. A web_accessible_resources entry naming something the build does not emit — `public/assets/*`
 *     matched no file at all. A stale entry is a wrong map of the extension, and reading it is how
 *     raw copies got shipped to satisfy paths nothing loads.
 *  3. A page whose script or stylesheet went missing, which leaves a blank screen and no error.
 *
 * Every check reads the emitted extension, because none of these failures exist in src/.
 *
 * Requires a build: `npm run build`.
 */

const path = require('path');

const {
  emittedFiles,
  emittedPages,
  emittedScripts,
  filesMatchingResource,
  manifestDeclaredFiles,
  pageResourceRefs,
  readBuiltManifest,
  relativeImportSpecifiers,
  requireBuild,
  readAsset,
  OUT_DIR,
} = require('./build-output.js');

const fs = require('fs');

describe('build output: every shipped reference resolves', () => {
  let files;
  let fileSet;

  beforeAll(() => {
    requireBuild();
    files = emittedFiles();
    fileSet = new Set(files);
  });

  it('resolves every import specifier in every emitted script to an emitted file', () => {
    // Case-sensitive membership against the real listing: Windows and macOS resolve a case mismatch
    // locally and Chrome does not.
    const broken = [];
    for (const script of emittedScripts()) {
      const code = fs.readFileSync(path.join(OUT_DIR, script), 'utf-8');
      for (const specifier of relativeImportSpecifiers(code)) {
        const resolved = path.posix.join(path.posix.dirname(script), specifier);
        if (!fileSet.has(resolved)) {
          broken.push(`${script} imports ${specifier}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('emits at least one file for every web_accessible_resources entry', () => {
    const dead = [];
    for (const entry of readBuiltManifest().web_accessible_resources || []) {
      for (const resource of entry.resources || []) {
        if (filesMatchingResource(resource, files).length === 0) {
          dead.push(resource);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('emits every script and stylesheet its pages load', () => {
    const missing = [];
    for (const page of emittedPages()) {
      for (const ref of pageResourceRefs(page)) {
        if (!fileSet.has(ref)) {
          missing.push(`${page} loads ${ref}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('emits every file the manifest itself declares', () => {
    // Icons, the popup, the service worker, the managed schema. Chrome refuses to load the whole
    // extension over a missing icon, so a dropped copy rule has to fail here rather than at install.
    const missing = manifestDeclaredFiles().filter(declared => !fileSet.has(declared));
    expect(missing).toEqual([]);
  });

  it('ships the page scripts bundled, not as raw copies of src/', () => {
    // Raw copies are what failure 1 is made of. The extension pages are all build inputs now, so
    // nothing under .vite/src should be a script at all.
    const rawScripts = emittedScripts().filter(file => file.startsWith('src/'));
    expect(rawScripts).toEqual([]);
  });

  it('exposes no src/ page or component to a website through web_accessible_resources', () => {
    // Extension pages are opened in their own tab from the popup or the service worker, and the
    // components are bundled into the content script. Neither is fetched by a website, so listing
    // them only widened what any matched page could read — and invited failure 1 back, because a
    // listed path is a path the build ships as raw source.
    const exposed = (readBuiltManifest().web_accessible_resources || []).flatMap(entry =>
      (entry.resources || []).filter(
        resource =>
          /^src\/(pages|ui\/components|utils)\//.test(resource) ||
          /^src\/.*\.js$/.test(resource)
      )
    );
    expect(exposed).toEqual([]);
  });

  it('still exposes the resources a content script does fetch by URL', () => {
    // The other half of the deletion: the fonts (textCustomization resolves
    // chrome.runtime.getURL('src/assets/fonts/') inside the visited page), the PDF worker (OCR sets
    // pdf.js workerSrc the same way) and the bundled chunks the content script imports. Remove one
    // of these and the feature dies silently on every website.
    const forAllUrls = (readBuiltManifest().web_accessible_resources || []).filter(entry =>
      (entry.matches || []).includes('<all_urls>')
    );
    const exposed = forAllUrls.flatMap(entry => entry.resources || []);
    expect(exposed).toContain('src/assets/fonts/*');
    expect(exposed).toContain('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
    expect(exposed).toContain('assets/*.js');
    expect(exposed).toContain('assets/*.css');
  });

  it('keeps the content script loadable on a non-LMS page', () => {
    // On an LMS page CRXJS adds a generated entry listing the content script's chunks by name; on
    // every other website the only thing that makes them readable is the assets/*.js wildcard, and
    // its match set has to be <all_urls>. This is the regression that broke all non-LMS sites.
    const wildcard = (readBuiltManifest().web_accessible_resources || []).find(entry =>
      (entry.resources || []).includes('assets/*.js')
    );
    expect(wildcard.matches).toContain('<all_urls>');
    expect(filesMatchingResource('assets/*.js', files).length).toBeGreaterThan(10);
  });
});

describe('build output: raw copies keep their imports', () => {
  beforeAll(() => {
    requireBuild();
  });

  it('follows a raw copy to a missing import', () => {
    // Guards the guard: the check above is only worth having if a broken raw copy would trip it.
    // This is exactly the shape ai-setup.js shipped in — a real emitted directory, a specifier that
    // resolves to nothing — measured against the same resolver the suite uses.
    const files = new Set(emittedFiles());
    const specifiers = relativeImportSpecifiers(
      'import { x } from "../../utils/ollama-models.js";\nconst y = await import("./gone.js");'
    );
    expect(specifiers).toEqual(['../../utils/ollama-models.js', './gone.js']);
    const unresolved = specifiers.filter(
      specifier => !files.has(path.posix.join('src/pages/ai-setup', specifier))
    );
    expect(unresolved).toHaveLength(2);
  });

  it('reads a real chunk without finding a reference to nothing', () => {
    // Sanity: the resolver is pointed at real, minified output, not only at fixtures.
    const chunk = [...new Set(emittedScripts())].find(file => file.startsWith('assets/'));
    expect(chunk).toBeDefined();
    expect(() => readAsset(path.posix.basename(chunk))).not.toThrow();
  });
});
