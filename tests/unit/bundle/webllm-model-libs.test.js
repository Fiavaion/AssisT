/**
 * Build-output gate: Browser AI's model libraries are in the package (ADR 0010).
 *
 * Every model the student can pick needs its compiled WebGPU library emitted byte for byte as
 * pinned, at the path the offscreen code asks chrome.runtime.getURL for; and the offscreen code
 * must build those URLs from the package rather than take web-llm's GitHub ones.
 *
 * Requires a build: `npm run build`.
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const { OUT_DIR, ASSETS_DIR, requireBuild } = require('./build-output.js');
const { WEBLLM_LIB_DIR, WEBLLM_MODEL_LIBS } = require('../../../src/ai/webllm-model-libs.js');

describe('build output: the WebLLM model libraries ship in the package', () => {
  beforeAll(() => {
    requireBuild();
  });

  it.each(Object.entries(WEBLLM_MODEL_LIBS))('emits the library for %s, byte-equal to its pin', (
    _modelId,
    pin
  ) => {
    const built = path.join(OUT_DIR, WEBLLM_LIB_DIR, pin.file);
    expect(fs.existsSync(built)).toBe(true);
    const bytes = fs.readFileSync(built);
    expect(bytes.length).toBe(pin.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
  });

  it('emits no library that is not pinned', () => {
    const dir = path.join(OUT_DIR, WEBLLM_LIB_DIR);
    const pinned = Object.values(WEBLLM_MODEL_LIBS).map(pin => pin.file);
    expect(fs.readdirSync(dir).sort()).toEqual(pinned.sort());
  });

  it('builds the offscreen code’s model library URLs from the package', () => {
    const handler = fs
      .readdirSync(ASSETS_DIR)
      .filter(name => /^webllm-handler-.*\.js$/.test(name))
      .map(name => fs.readFileSync(path.join(ASSETS_DIR, name), 'utf8'));
    expect(handler).toHaveLength(1);
    // The minifier splits the directory into a template, so its parts are checked separately.
    expect(handler[0]).toContain('webllm-libs/');
    expect(handler[0]).toContain(`"${WEBLLM_LIB_DIR.split('/')[1]}"`);
    expect(handler[0]).toContain('appConfig');
    expect(handler[0]).toContain('getURL');
    for (const pin of Object.values(WEBLLM_MODEL_LIBS)) {
      expect(handler[0]).toContain(pin.file);
    }
  });
});
