/**
 * Build-output gate: the OCR engine the content script asks for is in the package (ADR 0008).
 *
 * The recognition worker is a blob worker in the visited page's origin, so every file it loads from
 * the extension has to be emitted AND web-accessible to every site, or OCR dies with a network error
 * in the page and no hint that the cause is the manifest. The files must also be the published
 * builds byte for byte: the bundler rewriting the worker or the core would ship code nobody tested.
 *
 * Requires a build: `npm run build`.
 */

const fs = require('fs');
const path = require('path');

const {
  OUT_DIR,
  emittedFiles,
  filesMatchingResource,
  readBuiltManifest,
  requireBuild,
} = require('./build-output.js');
const { OCR_ENGINE_FILES } = require('../../../src/features/ocr/ocr-engine-files.js');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('build output: the OCR engine ships in the package', () => {
  let files;
  let allSitesResources;

  beforeAll(() => {
    requireBuild();
    files = emittedFiles();
    allSitesResources = (readBuiltManifest().web_accessible_resources || [])
      .filter(entry => (entry.matches || []).includes('<all_urls>'))
      .flatMap(entry => entry.resources || []);
  });

  it('names the worker, both LSTM cores and the English model', () => {
    expect(OCR_ENGINE_FILES).toEqual(
      expect.arrayContaining([
        'node_modules/tesseract.js/dist/worker.min.js',
        'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
        'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
        'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
      ])
    );
  });

  it.each(OCR_ENGINE_FILES)('emits %s unchanged from the published package', file => {
    const built = path.join(OUT_DIR, file);
    expect(fs.existsSync(built)).toBe(true);
    expect(fs.readFileSync(built).equals(fs.readFileSync(path.join(ROOT, file)))).toBe(true);
  });

  it.each(OCR_ENGINE_FILES)('lets any site the worker runs in load %s', file => {
    const covering = allSitesResources.filter(
      resource => filesMatchingResource(resource, [file]).length > 0
    );
    expect(covering).not.toEqual([]);
  });

  it('ships no Tesseract core the LSTM-only engine never loads', () => {
    const cores = files.filter(file => file.startsWith('node_modules/tesseract.js-core/'));
    expect(cores.sort()).toEqual(
      OCR_ENGINE_FILES.filter(file => file.startsWith('node_modules/tesseract.js-core/')).sort()
    );
  });
});
