/**
 * The build step that puts the WebLLM model libraries into the package (ADR 0010).
 *
 * The libraries are not on npm and are not committed, so the build fetches each from a pinned
 * upstream commit, checks its size and SHA-256 against the pin, and keeps it in a gitignored cache
 * so a repeat build needs no network. Anything that does not match stops the build, and nothing
 * unverified is cached or emitted.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');

const {
  WEBLLM_LIB_SOURCE,
  pinnedModelLib,
  webllmModelLibs,
} = require('../../../scripts/webllm-model-libs.js');
const { WEBLLM_LIB_VERSION } = require('../../../src/ai/webllm-model-libs.js');

const BYTES = Buffer.from('\0asm pinned kernel bytes');
const PIN = {
  file: 'Tiny-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  bytes: BYTES.length,
  sha256: createHash('sha256').update(BYTES).digest('hex'),
};

let cacheDir;
let fetchImpl;

function answers(body, { ok = true, status = 200 } = {}) {
  fetchImpl.mockResolvedValue({
    ok,
    status,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length),
  });
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webllm-libs-'));
  fetchImpl = jest.fn();
});

afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('the source is the pinned commit of the upstream library repo, at the pinned version', () => {
  expect(WEBLLM_LIB_SOURCE).toMatch(
    new RegExp(
      `^https://raw\\.githubusercontent\\.com/mlc-ai/binary-mlc-llm-libs/[0-9a-f]{40}/web-llm-models/${WEBLLM_LIB_VERSION}/$`
    )
  );
});

test('a library not yet cached is downloaded from the pinned source, checked and cached', async () => {
  answers(BYTES);

  const bytes = await pinnedModelLib(PIN, { cacheDir, fetchImpl });

  expect(fetchImpl).toHaveBeenCalledWith(`${WEBLLM_LIB_SOURCE}${PIN.file}`);
  expect(Buffer.compare(bytes, BYTES)).toBe(0);
  expect(Buffer.compare(fs.readFileSync(path.join(cacheDir, PIN.file)), BYTES)).toBe(0);
});

test('a cached library that matches its pin is used with no network at all', async () => {
  fs.writeFileSync(path.join(cacheDir, PIN.file), BYTES);

  const bytes = await pinnedModelLib(PIN, { cacheDir, fetchImpl });

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(Buffer.compare(bytes, BYTES)).toBe(0);
});

test('a cached library that does not match is replaced by a checked download', async () => {
  fs.writeFileSync(path.join(cacheDir, PIN.file), Buffer.from('corrupt'));
  answers(BYTES);

  const bytes = await pinnedModelLib(PIN, { cacheDir, fetchImpl });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(Buffer.compare(bytes, BYTES)).toBe(0);
});

test('a download that does not match its pin stops the build and is not cached', async () => {
  answers(Buffer.from('\0asm something else entirely!'));

  await expect(pinnedModelLib(PIN, { cacheDir, fetchImpl })).rejects.toThrow(PIN.file);
  await expect(pinnedModelLib(PIN, { cacheDir, fetchImpl })).rejects.toThrow(PIN.sha256);
  expect(fs.existsSync(path.join(cacheDir, PIN.file))).toBe(false);
});

test('a failed download stops the build and says which file', async () => {
  answers(Buffer.alloc(0), { ok: false, status: 404 });
  await expect(pinnedModelLib(PIN, { cacheDir, fetchImpl })).rejects.toThrow(/404/);
});

test('the plugin emits each pinned library at its path in the package', async () => {
  answers(BYTES);
  const emitted = [];
  const plugin = webllmModelLibs({ pins: { 'Tiny-MLC': PIN }, cacheDir, fetchImpl });

  await plugin.generateBundle.call({ emitFile: file => emitted.push(file) });

  expect(emitted).toEqual([
    {
      type: 'asset',
      fileName: `webllm-libs/${WEBLLM_LIB_VERSION}/${PIN.file}`,
      source: expect.any(Uint8Array),
    },
  ]);
  expect(Buffer.compare(Buffer.from(emitted[0].source), BYTES)).toBe(0);
});
