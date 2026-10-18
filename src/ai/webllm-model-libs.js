/**
 * The WebLLM model libraries that ship in the package (ADR 0010).
 *
 * Each Browser AI model needs its compiled WebGPU library, built for the library version the
 * installed @mlc-ai/web-llm requests. web-llm would fetch it from GitHub and run it; the extension
 * ships it instead. The build (`scripts/webllm-model-libs.js`) downloads each file from a pinned
 * upstream commit, checks it against the size and SHA-256 here, and emits it at
 * `webllm-libs/<version>/<file>`; the offscreen code points web-llm at that copy.
 *
 * Measured on 2026-10-04. A web-llm upgrade that changes `modelVersion` or a file name fails
 * tests/unit/ai/webllm-model-libs.test.js until these pins are measured again.
 *
 * @module ai/webllm-model-libs
 */

/** The library version web-llm 0.2.81 requests (`modelVersion` in its lib/index.js). */
export const WEBLLM_LIB_VERSION = 'v0_2_80';

/** Where the libraries are in the package. */
export const WEBLLM_LIB_DIR = `webllm-libs/${WEBLLM_LIB_VERSION}`;

/** One library per offered model, keyed by web-llm's model_id. */
export const WEBLLM_MODEL_LIBS = Object.freeze({
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': Object.freeze({
    file: 'Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5498539,
    sha256: 'c7b8dad5e6e136819f726235ddd8f99da6086f1f4d4b9b2b035249d764a31cc1',
  }),
  'gemma-2b-it-q4f16_1-MLC': Object.freeze({
    file: 'gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5083185,
    sha256: '156218c667563dba15e77118c92aac937f51e5a073549b34bbc4fd0cc14c03d3',
  }),
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': Object.freeze({
    file: 'Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 6131270,
    sha256: '34de0d60ab598c6a85ae882b48474f250193076f902057a21070bb2daae96d5b',
  }),
  'Phi-3.5-mini-instruct-q4f16_1-MLC': Object.freeze({
    file: 'Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5471501,
    sha256: '2f58ffc1ed1dc812e436e73f3507a9ffdf9c564dd3c55e0ae3be789d4a2baa6f',
  }),
  'Qwen2.5-3B-Instruct-q4f16_1-MLC': Object.freeze({
    file: 'Qwen2.5-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5599880,
    sha256: 'ba07594162783740a4426007351cbc0ee1c30d6d0da9617561b6a3a27fe3b63f',
  }),
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': Object.freeze({
    file: 'Mistral-7B-Instruct-v0.3-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5456419,
    sha256: '5bbdc492f08c21911868c55f23fc4a6b8932adf2179bcf26ccf2ad7fbd0561f7',
  }),
  'Llama-3.1-8B-Instruct-q4f16_1-MLC': Object.freeze({
    file: 'Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 6296764,
    sha256: 'ebfaaeb06478b598990176e57564ef7e36f7a47e8cb1b8bbf888e27305489679',
  }),
  'gemma-2-9b-it-q4f16_1-MLC': Object.freeze({
    file: 'gemma-2-9b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
    bytes: 5920586,
    sha256: 'ec6e3ec0138c9318b042716e616b46a6e4868e25134a26e7765740aae9376671',
  }),
});

/**
 * A model's library, as a path inside the package.
 * @param {string} modelId - web-llm's model_id
 * @returns {string|null} null for a model whose library is not shipped
 */
export function webllmModelLibPath(modelId) {
  return Object.hasOwn(WEBLLM_MODEL_LIBS, modelId)
    ? `${WEBLLM_LIB_DIR}/${WEBLLM_MODEL_LIBS[modelId].file}`
    : null;
}
