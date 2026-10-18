/**
 * @jest-environment jsdom
 *
 * Browser AI runs only model libraries shipped in the package (ADR 0010).
 *
 * web-llm's prebuiltAppConfig points every model's `model_lib` (compiled WebGPU code) at GitHub.
 * The offscreen handler gives the engine its own appConfig instead: the offered models only, each
 * exactly as web-llm describes it, except that `model_lib` is the copy inside the extension. The
 * weights (`model`) still come from Hugging Face, which is data.
 */

const mockCreateMLCEngine = jest.fn();

const PREBUILT = {
  useIndexedDBCache: false,
  model_list: [
    {
      model: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC',
      model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      model_lib:
        'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
      vram_required_MB: 879.04,
      low_resource_required: true,
      overrides: { context_window_size: 4096 },
    },
    {
      model: 'https://huggingface.co/mlc-ai/Llama-3.1-8B-Instruct-q4f16_1-MLC',
      model_id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
      model_lib:
        'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
      vram_required_MB: 5001.0,
      low_resource_required: false,
    },
    {
      model: 'https://huggingface.co/mlc-ai/SmolLM2-135M-Instruct-q0f16-MLC',
      model_id: 'SmolLM2-135M-Instruct-q0f16-MLC',
      model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/x.wasm',
    },
  ],
};

jest.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: (...args) => mockCreateMLCEngine(...args),
  prebuiltAppConfig: PREBUILT,
}));

jest.mock('../../../../src/pages/assist-offscreen/offscreen-storage.js', () => ({
  getOffscreenStorage: () => ({
    get: async () => ({}),
    set: async () => {},
  }),
}));

const EXTENSION = 'chrome-extension://test-id/';

/** A fresh handler each time: it keeps the loaded engine in module state. */
async function initialise(modelKey) {
  let handleWebLLMMessage;
  jest.isolateModules(() => {
    ({ handleWebLLMMessage } = require('../../../../src/pages/assist-offscreen/webllm-handler.js'));
  });
  handleWebLLMMessage({ action: 'WEBLLM_INITIALIZE', modelKey, requestId: 'r1' });
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
  return mockCreateMLCEngine.mock.calls[0];
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.runtime.getURL.mockImplementation(p => `${EXTENSION}${p}`);
  chrome.runtime.sendMessage.mockResolvedValue(undefined);
  mockCreateMLCEngine.mockResolvedValue({ chat: {} });
});

test('the engine is created for the chosen model with an explicit appConfig', async () => {
  const [modelId, options] = await initialise('llama-3.2-1b');
  expect(modelId).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  expect(options.appConfig).toBeDefined();
  expect(typeof options.initProgressCallback).toBe('function');
});

test('every model library the engine can load is the copy inside the extension', async () => {
  const [, { appConfig }] = await initialise('llama-3.2-1b');
  expect(appConfig.model_list.length).toBeGreaterThan(0);
  for (const record of appConfig.model_list) {
    expect(record.model_lib.startsWith(`${EXTENSION}webllm-libs/v0_2_80/`)).toBe(true);
  }
  expect(appConfig.model_list.find(r => r.model_id === 'Llama-3.1-8B-Instruct-q4f16_1-MLC'))
    .toMatchObject({
      model_lib: `${EXTENSION}webllm-libs/v0_2_80/Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
    });
});

test('everything else about a model is web-llm’s own description, weights included', async () => {
  const [, { appConfig }] = await initialise('llama-3.2-1b');
  const record = appConfig.model_list.find(r => r.model_id === 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
  const { model_lib: _lib, ...rest } = PREBUILT.model_list[0];
  expect(record).toMatchObject(rest);
  expect(record.model).toBe('https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC');
  expect(appConfig.useIndexedDBCache).toBe(false);
});

test('a model AssisT does not ship a library for is not offered to the engine at all', async () => {
  const [, { appConfig }] = await initialise('llama-3.2-1b');
  expect(appConfig.model_list.map(r => r.model_id)).not.toContain('SmolLM2-135M-Instruct-q0f16-MLC');
});
