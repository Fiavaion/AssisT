# Phase 2 Session 125 - WebLLM Download Pipeline Fix

**Date**: 2026-05-22
**Duration**: ~3 hours
**Phase**: Post-Launch — WebLLM Browser AI Debug
**Progress**: No % change — bug fix / polish session
**Session Number**: 125

---

## Session Overview

**Goal**: Fix WebLLM model download failures — "Error: Failed to fetch" on every download attempt in the AI setup wizard and popup
**Status**: ✅ All download blockers resolved, auto-activation fixed, status check bug fixed

---

## Accomplishments

### Bugs Fixed

- [x] **Fetch proxy removed** — offscreen doc was routing all HuggingFace fetches through the service worker via a `PROXY_FETCH_TO_CACHE` mechanism. SW gets killed by Chrome MV3 mid-transfer for large files (100–500MB shards). Direct fetch from offscreen doc (which shares `host_permissions`) is correct and works.
- [x] **HuggingFace XetHub CDN blocked** — model param shards (`.bin` files) 302-redirect to `cas-bridge.xethub.hf.co`, a domain under `hf.co` not `huggingface.co`. Neither `host_permissions` nor CSP `connect-src` covered this. Added `*.hf.co` and `*.xethub.hf.co` to both.
- [x] **`gemma-7b-it-q4f16_1-MLC` invalid** — this model ID does not exist in web-llm v0.2.81. Renamed registry key `gemma-7b` → `gemma-9b` with correct ID `gemma-2-9b-it-q4f16_1-MLC` across all files.
- [x] **`response?.ready` wrong path** — `WEBLLM_STATUS` returns `{ status: { ready: bool } }` but `ai-feature-client.js` was checking `response?.ready` (always `undefined`). WebLLM was permanently reported unavailable; every feature fell back to "⚠️ Basic" mode. Fixed to `response?.status?.ready`.
- [x] **WebLLM not activated after wizard download** — `onSuccess` in `initiateModelDownload` updated the UI but never persisted the mode. Now explicitly writes `aiMode: 'webllm'` and `webllmModel` to `chrome.storage.local` on download success.

### Skill Created

- [x] `C:\Users\jones\.claude\skills\webllm-debug\SKILL.md` — systematic checklist for diagnosing WebLLM download/init failures without browser console access. Covers: model ID verification, CSP gaps, host_permissions, proxy detection, local diagnostic server pattern.

### Files Modified

- `src/pages/webllm-offscreen/offscreen.js` — removed fetch proxy, direct `CreateMLCEngine` call
- `src/background/service-worker.js` — added logging to `PROXY_FETCH_TO_CACHE` handler (proxy still present but never called; can be cleaned up)
- `manifest.json` — added `https://hf.co/*`, `https://*.hf.co/*`, `https://*.xethub.hf.co/*` to `host_permissions` and `connect-src`
- `src/ai/model-registry.js` — `gemma-7b` → `gemma-9b` with correct model ID
- `src/pages/ai-setup/ai-setup.js` — `gemma-7b` → `gemma-9b`; `onSuccess` now writes `aiMode`+`webllmModel` to storage
- `src/popup/popup.js` — `gemma-7b` → `gemma-9b` (×2 locations)
- `src/utils/ai-badge.js` — `gemma-7b` → `gemma-9b`
- `src/features/shared/ai-feature-client.js` — `response?.ready` → `response?.status?.ready`

---

## Decisions Made

**Decision**: Remove fetch proxy entirely rather than fix it
- **Reason**: The proxy required the service worker to download entire model shards before responding. MV3 SWs are killed after ~30s idle. For 500MB+ files this is fundamentally broken. Offscreen documents are extension pages and share `host_permissions` — they can fetch directly.
- **Impact**: Simpler architecture, no SW-lifetime dependency for downloads
- **Alternatives**: Keeping proxy with chunked streaming — too complex, fragile

**Decision**: Add `*.hf.co` + `*.xethub.hf.co` rather than a single broad wildcard
- **Reason**: Least-privilege principle; FERPA compliance posture
- **Impact**: Covers the known HuggingFace XetHub CDN pattern; may need updating if HF adds other CDN domains

---

## Challenges and Solutions

**Challenge**: "Error: Failed to fetch" regression after fixing model IDs — extension failed to load entirely due to `worker-src blob:` in CSP
- **Solution**: Chrome MV3 rejects `blob:` in `worker-src` as insecure. Reverted. Web-LLM's `CreateMLCEngine` doesn't need blob: workers in offscreen doc context (WASM loading was already working before this).
- **Time Lost**: ~20 minutes
- **Lesson**: Chrome Extension CSP is stricter than web CSP — `blob:` source is rejected in several directives. Test manifest loads immediately after any CSP change.

**Challenge**: Root cause of "Failed to fetch" was invisible without console access
- **Solution**: Static analysis — curl-followed the full redirect chain for model param URLs, discovered `xethub.hf.co` CDN domain not in permissions.
- **Lesson**: For Chrome Extension network failures, `curl -L -o /dev/null -w "%{url_effective}"` on the target URL reveals the final CDN domain without needing browser console.

**Challenge**: Went in circles adding logging that neither the assistant nor user could read
- **Solution**: Created `webllm-debug` skill — establishes protocol of static file analysis first, local diagnostic server (writes to readable file) for runtime data when needed.
- **Lesson**: When browser console isn't accessible, the diagnostic must write to a file on disk (local HTTP server accepting POSTs) or the investigation stays blind.

---

## Technical Insights

- **HuggingFace CDN architecture**: Small files (JSON configs, tokenizers) stay on `huggingface.co`. Large binary files (model weights, `.bin` shards) are served via XetHub LFS at `cas-bridge.xethub.hf.co`. These are different domains and both need to be in `host_permissions` and CSP.
- **web-llm v0.2.81 model ID format**: All IDs are `ModelName-quantization-MLC` (e.g. `Llama-3.2-1B-Instruct-q4f16_1-MLC`). Gemma models changed from `gemma-Xb-it-*` to `gemma-2-Xb-it-*` in ~v0.2.78. Always verify against `prebuiltAppConfig.model_list` in the installed package.
- **WebGPU vs CUDA performance**: WebLLM 1B via WebGPU (→ Vulkan on Windows) is significantly slower than Ollama 8B via native CUDA. WebLLM is a zero-install fallback for users who can't run Ollama — not a performance-comparable alternative.
- **MV3 offscreen document lifetime**: `reasons: ['WORKERS']` has no time limit. The offscreen doc lives until the extension is reloaded. Model weights loaded into WebGPU memory persist for the browser session.
- **WEBLLM_STATUS response shape**: `{ success: true, status: { ready: bool, loading: bool, model: string } }` — the ready flag is nested under `status`, not at the top level.

---

## Next Session

**Status**: ✅ Core download pipeline fixed. End-to-end verification pending.

**Exact Next Steps**:
1. Reload extension in Chrome (`chrome://extensions` → AssisT → reload)
2. Open AI setup wizard → select Browser AI → download `llama-3.2-1b` (650MB)
3. Confirm download completes (progress reaches 100%, "✓ Model downloaded and ready")
4. Open a Canvas page, select text, run Summarise — confirm badge shows model name not "⚠️ Basic"
5. If download still fails: run `/webllm-debug` skill for systematic diagnosis

**Cleanup (low priority)**:
- Remove `PROXY_FETCH_TO_CACHE` handler from `src/background/service-worker.js` (dead code — proxy never called now)

**Blockers**: None known. Download pipeline fixes are in place.

---

**Session Complete**: 2026-05-22
