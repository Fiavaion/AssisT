/**
 * The pinned WebLLM model libraries match the installed web-llm (ADR 0010).
 *
 * Each Browser AI model needs a compiled WebGPU library built for the exact library version the
 * installed @mlc-ai/web-llm requests. The extension ships those libraries, pinned by file name,
 * size and SHA-256. Upgrading web-llm without measuring new pins would ship libraries the engine
 * cannot load, or fall back to none at all; this suite reads the installed web-llm and fails first.
 */

const fs = require('fs');
const path = require('path');

const {
  WEBLLM_LIB_VERSION,
  WEBLLM_LIB_DIR,
  WEBLLM_MODEL_LIBS,
  webllmModelLibPath,
} = require('../../../src/ai/webllm-model-libs.js');
const { REGISTRY } = require('../../../src/ai/model-registry.js');

const WEB_LLM = fs.readFileSync(
  path.join(__dirname, '../../../node_modules/@mlc-ai/web-llm/lib/index.js'),
  'utf8'
);

/** The library file web-llm's prebuiltAppConfig names for a model. */
function prebuiltLibFile(modelId) {
  const at = WEB_LLM.indexOf(`model_id: "${modelId}"`);
  if (at < 0) {
    return null;
  }
  const match = /model_lib:\s*modelLibURLPrefix\s*\+\s*modelVersion\s*\+\s*"\/([^"]+)"/.exec(
    WEB_LLM.slice(at, at + 400)
  );
  return match ? match[1] : null;
}

test('the pins are for the library version the installed web-llm requests', () => {
  const requested = /const modelVersion = "([^"]+)";/.exec(WEB_LLM)[1];
  expect(WEBLLM_LIB_VERSION).toBe(requested);
  expect(WEBLLM_LIB_DIR).toBe(`webllm-libs/${requested}`);
});

test('every model the student can pick has a pinned library', () => {
  const offered = Object.values(REGISTRY.webllm.models).map(model => model.id);
  expect(offered).toHaveLength(8);
  expect(Object.keys(WEBLLM_MODEL_LIBS).sort()).toEqual([...offered].sort());
});

test.each(Object.entries(WEBLLM_MODEL_LIBS))(
  '%s is pinned to the library file web-llm names for it',
  (modelId, pin) => {
    expect(prebuiltLibFile(modelId)).toBe(pin.file);
    expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pin.bytes).toBeGreaterThan(1000000);
  }
);

test('a model is found at its path in the package, and an unknown one is not', () => {
  expect(webllmModelLibPath('Llama-3.2-1B-Instruct-q4f16_1-MLC')).toBe(
    'webllm-libs/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm'
  );
  expect(webllmModelLibPath('constructor')).toBeNull();
  expect(webllmModelLibPath('Some-Other-Model-MLC')).toBeNull();
});
