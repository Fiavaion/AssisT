# Phase 2 Session 100 - Bug Fixes: AI Setup Key Storage, Minimize Clutter, TTS Disable

**Date**: 2026-04-12
**Duration**: ~1 hour
**Phase**: Phase 2 Extension — Bug Fixes
**Progress**: 100% → 100% (maintenance/bug fixes, no task regression)
**Session Number**: 100

---

## Session Overview

**Goal**: Fix three reported bugs found during E2E testing on the test harness page
**Status**: ✅ Complete

---

## Accomplishments

### Features Completed
- [x] AI Setup wizard now correctly saves API keys in encrypted storage
- [x] Minimize UI clutter button now hides the Text Stats badge reliably
- [x] Disabling TTS now immediately clears stale highlights from the page

### Tasks Completed
- [x] Bug: AI Setup test fails with "Claude API key not configured" even after entering key
- [x] Bug: Minimize UI clutter button no longer hides Text Stats badge
- [x] Bug: TTS highlights remain visible after disabling TTS

### Files Modified
- `src/background/service-worker.js` — added `saveSecureAPIKey` import + `SAVE_API_KEY` message handler
- `src/pages/ai-setup/ai-setup.js` — changed `saveSettings()` to route API key via `SAVE_API_KEY` message instead of plain-text storage
- `src/content/content-simple.js` — added `MINIMIZE_CLUTTER_UPDATE` case to message switch; fixed TTS disable to always clean up highlights

**Total**: ~30 lines modified

### Tests Written
- None (bug fixes, verified manually via E2E test harness)

### Commits
- Uncommitted at session end — committed as part of `/end`

---

## Decisions Made

**Decision**: Route AI Setup key save through service worker (`SAVE_API_KEY` message)
- **Reason**: `ai-setup.js` is a `web_accessible_resource` (served verbatim, not bundled) so it cannot import `src/core/storage/secure-key-storage.js` directly — only `src/pages/ai-setup/` and `src/utils/` imports resolve correctly
- **Impact**: API keys are now correctly encrypted via AES-GCM before storage; `getSecureAPIKey()` can read them
- **Alternatives**: Add `secure-key-storage.js` to `web_accessible_resources` — rejected because it would expose the crypto module to web pages, violating least-privilege

**Decision**: Add `MINIMIZE_CLUTTER_UPDATE` directly to content-simple.js message switch
- **Reason**: The case was falling to `default` which logged a warning and returned without acting; the `textStats-ui.js` secondary listener may not have been reliable in all contexts
- **Impact**: Reliable DOM manipulation of `#assist-textstats-badge` directly in the main message handler
- **Alternatives**: Fix secondary listener in `textStats-ui.js` — rejected as less robust than the primary switch

---

## Challenges and Solutions

**Challenge**: AI Setup "Test failed — Claude API key not configured" despite user entering key
- **Root cause**: `saveSettings()` stored the key as plain text at `apiKeys.anthropic`, but `getSecureAPIKey('anthropic')` reads from encrypted `secure_apikey_anthropic`. Completely incompatible storage paths.
- **Solution**: Added `SAVE_API_KEY` handler in service worker; ai-setup.js now sends message instead of direct storage write
- **Time Lost**: ~20 min diagnosis
- **Lesson**: **NEVER store API keys in plain text.** Always use `saveSecureAPIKey()`. If context can't import `secure-key-storage.js`, route via service worker.

**Challenge**: TTS highlights lingering after disabling TTS
- **Root cause**: Both the storage `onChanged` handler and the `TTS_COMMAND disable` handler only called `synth.cancel()` + `removeHighlight()` when `synth.speaking === true`. If speech had finished naturally, the highlights stayed.
- **Solution**: Removed the `synth.speaking` guard — now always runs cleanup when TTS is disabled (cancels if speaking, cleans up regardless)
- **Time Lost**: ~10 min
- **Lesson**: Highlight cleanup should not depend on `synth.speaking`; it's a display state independent of speech state

---

## Technical Insights

- `ai-setup.js` is served as a `web_accessible_resource` at `src/pages/ai-setup/*` — it's NOT bundled by Vite. Imports only work for files also listed in `web_accessible_resources` (i.e., `src/pages/ai-setup/` and `src/utils/`). Cross-directory imports fail silently.
- `chrome.runtime.onMessage` switch in `content-simple.js` is the authoritative message handler. Secondary listeners in feature modules (like `textStats-ui.js`) are a less reliable backup — prefer handling all message types in the main switch.
- The `broadcastToCanvasTabs()` in `message-router.js` only targets `*://*.instructure.com/*`. For testing on `file://` or other non-LMS URLs, settings changes propagate via `chrome.storage.onChanged` only (no direct message broadcast). This is by design but worth knowing during testing.
- Memory rule added: API keys MUST always use `saveSecureAPIKey()` — stored at `secure_apikey_{provider}` with encrypted blob. Plain text at `apiKeys.{provider}` is the wrong location.

---

## Next Session

**Status**: Complete — all three bugs fixed and built
**Next Task**: Continue E2E testing or address further bugs found on test harness
**Command**: `npm run build` (already built — reload Chrome extension)
**File**: None specific — test E2E harness features

**Blockers**: None

**WIP Notes**:
- `broadcastToCanvasTabs()` in `message-router.js` is instructure.com-only — if testing on other domains, rely on storage onChanged
- ~28 files still use raw z-index `999999` instead of `src/utils/z-index.js` constants — migrate when touching those files
- STT storage mismatch (popup saves to `chrome.storage.local`, `storage-utils.js` reads initial from `chrome.storage.sync`) still present for initial page load restoration

---

**Session Complete**: 2026-04-12
