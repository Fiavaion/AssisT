# ADR 0010: The WebLLM model libraries ship in the package

Date: 2026-10-04. Status: accepted (owner decision).

Applies ADR 0008's reasoning to Browser AI (WebLLM).

## Context

Browser AI runs `@mlc-ai/web-llm` 0.2.81 in the offscreen document. It called
`CreateMLCEngine(modelId, …)` with web-llm's built-in `prebuiltAppConfig`, in which every model's
`model_lib` is
`https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/<lib>.wasm`.
That file is the model's compiled WebGPU kernels: WebAssembly the engine instantiates and runs. So the
first use of each model downloaded and ran code from GitHub, which Manifest V3 and the Chrome Web
Store policy forbid, for the same reason ADR 0008 removed tesseract.js's CDN code. The weights are
separate: they come from Hugging Face and are data, which the policy allows.

`raw.githubusercontent.com` was a required host permission and in `connect-src` for this one use.
Nothing else in `src/` reaches it.

### Measured

The eight models the registry offers (`src/ai/model-registry.js`), at the library version web-llm
0.2.81 requests (`modelVersion = "v0_2_80"`), from `mlc-ai/binary-mlc-llm-libs` at commit
`025bcaf3780fa8254f5e5efd3bfea0a5397248f4` (identical to `main` on 2026-10-04):

| Model        | Library                                                   | Bytes     |
| ------------ | --------------------------------------------------------- | --------- |
| Llama 3.2 1B | `Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`    | 5,498,539 |
| Gemma 2B     | `gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm`              | 5,083,185 |
| Llama 3.2 3B | `Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`    | 6,131,270 |
| Phi-3.5 Mini | `Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`    | 5,471,501 |
| Qwen 2.5 3B  | `Qwen2.5-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`      | 5,599,880 |
| Mistral 7B   | `Mistral-7B-Instruct-v0.3-q4f16_1-ctx4k_cs1k-webgpu.wasm` | 5,456,419 |
| Llama 3.1 8B | `Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`    | 6,296,764 |
| Gemma 2 9B   | `gemma-2-9b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm`            | 5,920,586 |

45,458,144 bytes in all; 6,740,310 bytes gzipped (6.7×), so the store zip grows far less than the
unpacked extension.

## Options for getting the files into the build

1. **Commit the 45 MB of binaries to the public repo.** Simplest build, but it puts 45 MB of
   third-party compiled code in the history of an OSS repo for good, and every web-llm upgrade adds
   another 45 MB.
2. **An npm package that carries them.** None exists for these libraries: they are published only to
   the GitHub repo. Publishing one ourselves would be a second artifact to maintain and to trust.
3. **A pinned, integrity-checked download at build time.** The build fetches each file from the
   exact upstream commit, checks its size and SHA-256 against a table in the source, and keeps it in
   a gitignored cache, so a repeat build needs no network. A mismatch fails the build.

## Decision

**Option 3.** A Vite plugin (`scripts/webllm-model-libs.js`) emits every pinned library into the
build at `webllm-libs/v0_2_80/<lib>.wasm`. It reads `.cache/webllm-libs/v0_2_80/` first and
downloads only a file that is missing there, from
`raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/<commit>/web-llm-models/v0_2_80/`. A file whose
size or hash does not match the pin stops the build with the file name and both hashes; nothing
unverified is cached or emitted. The pins (library version, file, size, SHA-256 per model) live in
`src/ai/webllm-model-libs.js`, the one table the build, the offscreen code and the tests read.

**The engine is given an explicit `appConfig`.** Its `model_list` holds the offered models only, each
taken whole from `prebuiltAppConfig` except `model_lib`, which becomes
`chrome.runtime.getURL('webllm-libs/v0_2_80/<lib>.wasm')`. web-llm fetches a `model_lib` that does
not start with `http` with a plain `fetch` and no Cache API, so the file is read from the package each
time, which costs nothing. The offscreen document is an extension page on the extension's own origin,
so no `web_accessible_resources` entry is needed, and `connect-src 'self'` already covers the fetch.

**`raw.githubusercontent.com` leaves the manifest**, from `host_permissions` and from `connect-src`.
1.0.0's required hosts are then the LMS hosts and Hugging Face, all of which 0.9.3 already held, so
the update asks for no new permission.

**Guards.** A unit test holds the pins to the installed web-llm: the `modelVersion` it requests and,
for each offered model, the library file name in its `prebuiltAppConfig`; upgrading web-llm without
updating the pins fails the suite. Another proves the engine is created with local libraries only.
A build-output test checks every pinned library is emitted byte-equal to its pin and that the
offscreen code builds its URLs from the package.

## Consequences

The unpacked extension grows by 45.5 MB and the store zip by about 6.7 MB. Dropping the three 7–9B
models, which few student machines can run, would save 17.7 MB unpacked; that is a product choice
left open.

A fresh clone needs network once to build, to GitHub at a fixed commit; after that, builds are
offline. CI caches `.cache/` or downloads on each run.

A web-llm upgrade now has one more step: new pins for the new library version, measured the same way.
The guard test says so.

The model weights still download from Hugging Face on first use of each model, as before.
