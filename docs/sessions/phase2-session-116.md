# Phase 2 Session 116 - Production Readiness Audit (Network Timeouts + Error Handlers)

**Date**: 2026-05-16
**Duration**: ~1 hour
**Phase**: Phase 2 - Post-Launch Polish / Production Hardening
**Progress**: 100% → 100% (+0% feature completion, significant reliability improvement)
**Session Number**: 116

---

## Session Overview

**Goal**: Run a full `/prod-ready` audit against the 8-point checklist: error handlers, null guards, network timeouts, rate limiting, config hygiene, accessibility basics, overflow bugs, and build verification.
**Status**: ✅ Complete — all fixable items resolved, build clean.

---

## Accomplishments

### Features Completed
- [x] Global unhandled-rejection + error handlers added to popup and service worker
- [x] All `fetch()` calls across the codebase given `AbortSignal.timeout()` guards (16 calls fixed)

### Tasks Completed
- [x] Prod-ready checklist item 1 — unhandled rejection/error handlers
- [x] Prod-ready checklist item 3 — network timeouts on all fetch() calls
- [x] Prod-ready checklist items 2, 4–8 — confirmed OK or N/A (no fixes needed)

### Files Modified
- `src/popup/popup.js` (+14 lines) — global `window.addEventListener('unhandledrejection')` + `'error'` handlers; `AbortSignal.timeout` on DeepL test, Azure test, Ollama status fetch
- `src/background/service-worker.js` (+20 lines) — `self.addEventListener('unhandledrejection')` + `'error'`; AbortSignal on CrossRef, SemanticScholar, image fetch, PDF fetch, Ollama generate
- `src/core/storage/secure-key-storage.js` (+4 lines) — AbortSignal on Anthropic, OpenAI, Google, Perplexity key validation fetches
- `src/ai/google-client.js` (+1 line) — AbortSignal on Gemini models listing
- `src/ai/openai-client.js` (+1 line) — AbortSignal on OpenAI models listing
- `src/features/citations/crossref-api.js` (+1 line) — AbortSignal on CrossRef DOI lookup
- `src/features/dictionary/dictionary.js` (+3 lines) — AbortSignal on Dictionary API fetch
- `src/features/llm/llm-controller.js` (+8 lines) — AbortSignal on Ollama/LM Studio model listing (2 bare fetches)
- `src/features/ocr/ocr.js` (+2 lines) — AbortSignal on PDF HTTP fetch
- `src/features/translation/translation-api.js` (+5 lines) — AbortSignal on LibreTranslate detect, languages, MyMemory
- `src/features/translation/translation-providers.js` (+4 lines) — AbortSignal on MyMemory, DeepL, Azure providers

**Total**: +63 lines added across 11 files

### Tests Written
- None — all changes are defensive guards; existing tests unaffected

### Commits Made
- Pending — to be committed with session log

---

## Audit Findings Summary

| Check | Result | Action |
|---|---|---|
| 1. Unhandled rejection/error handlers | FAIL — missing from popup + service worker | FIXED |
| 2. Null guard completeness | OK — `if (!el) return` pattern throughout | None |
| 3. Network timeouts | FAIL — 16 fetch() calls without AbortSignal | FIXED |
| 4. Rate limiting on paid API proxies | N/A — client-side extension, no proxy | None |
| 5. Configuration hygiene | OK — no personal paths, no committed keys | None |
| 6. Accessibility basics | OK — all modals have role/aria-modal/aria-labelledby; icon buttons have aria-label | None |
| 7. Scrollbar/overflow bugs | OK — overflow:hidden only on accordion animation containers | None |
| 8. Build verification | PASS — clean build, 0 errors | None |

---

## Decisions Made

**Decision**: Skip AbortSignal on whisper-engine.js model download and ollama-client.js pull stream
- **Reason**: Both are intentional long-running streaming downloads with progress reporting. A fixed wall-clock timeout would incorrectly abort legitimate large model downloads on slow connections.
- **Impact**: These remain timeout-free; they're in-extension operations where the user has explicitly triggered a model install.
- **Alternatives**: Could use a very large timeout (e.g. 30 minutes) — rejected as it adds no practical safety and would still break slow downloads.

**Decision**: Skip global error handler on content-simple.js (content script)
- **Reason**: Content scripts share the host page's `window` object. Adding `window.addEventListener('error', ...)` there would capture host-page errors too, producing noise and potentially conflicting with the host page's own error handling.
- **Impact**: Content script errors will still appear in the DevTools console under the extension's context.
- **Alternatives**: Could use a try/catch wrapper at the top-level init call — the content script's `initialize()` is already wrapped in one.

**Decision**: Timeout values chosen by endpoint category, not uniform
- **Reason**: Different endpoints have meaningfully different expected latency profiles: Ollama status = 5 s (fast local check), Dictionary API = 8 s (lightweight), most external APIs = 10–15 s, PDF/image fetch = 30–60 s, local LLM generate = 120 s (slow local inference).
- **Impact**: Users get fast failures on simple lookups; LLM inference has room to complete on modest hardware.
- **Alternatives**: Single 10 s timeout everywhere — would silently abort local LLM calls that need 30+ s.

---

## Challenges and Solutions

**Challenge**: grep filter couldn't cleanly distinguish which fetch() calls already had AbortSignal vs. not, because `signal:` is on the next line from `fetch(`.
- **Solution**: Manually read each file's surrounding context after the grep pass; cross-referenced against the known AbortController/AbortSignal usage found at the start of the audit.
- **Time Lost**: ~10 minutes
- **Lesson**: For timeout audits, `grep -A5 "fetch("` is more reliable than filtering for signal presence on the same line.

---

## Technical Insights

- Chrome Extension popup pages are full web pages — `window.addEventListener('unhandledrejection')` works the same as on any web page. The popup's existing try/catch in `DOMContentLoaded` only covers initialization; async event handlers spawned later are uncovered without a global handler.
- Service workers use `self` not `window` — `self.addEventListener('unhandledrejection')` is the correct pattern.
- `AbortSignal.timeout(ms)` (static method, Chrome 103+) is cleaner than `new AbortController()` + `setTimeout(() => controller.abort(), ms)` for simple timeouts. Both are in use in this codebase; the audit standardised on the newer form for new additions.
- The `ollamaFetch()` helper in service-worker.js is a thin wrapper that passes options through — callers that need a timeout must add `signal:` in the options they pass.

---

## Tier 2 Pre-CWS Checklist (still needs human)

These items were identified in Session 110 and remain open:
- Privacy policy page (CWS hard requirement)
- CWS listing assets: screenshots (1280×800), promo tile (440×280), store description
- E2E smoke test on a real Canvas LMS instance
- Screen reader test with NVDA + Chrome
- CHANGELOG.md
- Formal `v1.0.0` git tag + GitHub release
- GAAD launch day sequence (Show HN, Reddit)

---

## Next Session

**Status**: ✅ Complete (this session's goal fully achieved)
**Recommended Next Task**: CWS listing assets — screenshots + promo tile + privacy policy page
**Command**: `npm run build` (already passes clean)

**Blockers**: None technical — CWS submission is blocked on human tasks above.

**WIP Notes**:
- All prod-ready audit items are now resolved.
- The 3 untracked temp files in repo root (`c＞tmpjs_refs.txt`, etc.) are working-session artefacts — safe to delete, not committed.

---

**Session Complete**: 2026-05-16
