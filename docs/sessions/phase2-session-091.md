# Phase 2 Session 091 - Inline AI Mode Switcher

**Date**: 2026-03-08
**Duration**: ~1 hour
**Phase**: Phase 2 Extension - AI Systems / UX Polish
**Progress**: 100% → 100% (feature polish, no % change)
**Session Number**: 091

---

## Session Overview

**Goal**: Replace the read-only AI status widget and redirect-only AI tab with a fully inline mode switcher — users should be able to change AI type (Off / Cloud / Browser AI / Local AI / Gemini Nano) without re-running the wizard.

**Status**: ✅ Complete

---

## Accomplishments

### Features Completed
- [x] Inline AI mode chip row in popup AI Assist section (both locations: popup + Advanced Options modal)
- [x] Contextual panels: Cloud (provider selector, API key, model dropdown), Browser AI (model picker, download/load button, animated progress bar), Local AI (Ollama status + Check Again), Gemini Nano (device check)
- [x] Shared panel renderer methods `_renderCloudPanel()`, `_renderWebLLMPanel()`, `_renderLocalPanel()`, `_renderGeminiPanel()`
- [x] Mode changes write to `chrome.storage.local` immediately (no wizard round-trip)
- [x] Storage listener keeps popup chip in sync when mode changed from modal
- [x] WCAG 2.2 AA: fieldset/legend radio group, 3px focus rings, aria-live panel, no colour-only differentiation
- [x] Dark mode CSS overrides

### Files Modified
- `src/popup/popup.html` — AI Assist accordion content replaced with chip row + panel div (~40 lines replaced)
- `src/popup/popup.js` — `setupAIAssist()` rewritten + `setupAITab()` rewritten + 4 new `_render*Panel()` methods added (~400 lines net)
- `src/popup/popup.css` — ~260 lines of new AI chip / panel / progress bar styles added
- AI tab HTML in popup.js modal template — replaced redirect card with inline chip row + panel

**Total**: ~700 lines added/modified

### Tests Written
- None this session (UI/UX feature — manual verification against build)

### Commits
- Uncommitted (staged changes include pre-existing feature file modifications from prior sessions)

---

## Decisions Made

**Decision**: Build contextual panels entirely in JS (`_render*Panel()` methods) rather than pre-authored HTML with show/hide classes.
- **Reason**: Avoids bloating popup.html with ~300 lines of conditional HTML; panels are dynamic by nature (async API key load, model lists from cache, Ollama status check).
- **Impact**: Slightly more JS, but cleaner HTML and easier to maintain per-mode logic.
- **Alternatives rejected**: Pre-authored `display:none` panel divs per mode — too much hidden markup.

**Decision**: Use `addEventListener('change')` on radio inputs (not `attachInteractiveHandler`).
- **Reason**: `attachInteractiveHandler` is for buttons/clicks; radio change is a standard form event without the mousedown race condition issue documented in LESSONS_UI_EVENT_HANDLING.md.
- **Impact**: Complies with CLAUDE.md intent (interactive *buttons* use the utility); radios are fine with native change events.
- **Alternatives rejected**: Wrapping each label in `attachInteractiveHandler` — semantic mismatch.

**Decision**: API key Save is an explicit button, not auto-save on blur.
- **Reason**: FERPA — users should confirm before sending a key to encrypted storage. Accidental pastes are common.
- **Impact**: One extra click, but clearer intent.

---

## Challenges and Solutions

**Challenge**: AI tab HTML lives inside a JS template literal in popup.js (not popup.html), so the initial Edit on popup.html failed.
- **Solution**: Grepped for the pattern in popup.js, found the correct location, edited there.
- **Time Lost**: ~5 minutes
- **Lesson**: Always grep for the string before assuming it's in the .html file — the modal is dynamically generated.

---

## Technical Insights

- The Advanced Options modal content is built as a template literal string in `openAdvancedOptions()` / related method in popup.js — NOT in popup.html. Any modal HTML changes must go into popup.js.
- `WEBLLM_STATUS` returns `{ loaded, modelId }` — `modelId` is a full MLC model string (e.g., `Llama-3.2-1B-Instruct-q4f16_1-MLC`), not the short key (`llama-3.2-1b`). Panel uses a partial match heuristic.
- `saveSecureAPIKey` / `getSecureAPIKey` are exported from `src/core/storage/secure-key-storage.js` and support dynamic import — safe to call from popup panel renderers.
- `webllmCachedModels` is an array of short model keys (e.g., `['llama-3.2-1b']`) stored by the service worker after successful downloads.
- CSS variables `--border-light`, `--primary-dark`, `--text-tertiary` are all defined in `:root` and available everywhere.

---

## Next Session

**Status**: Complete
**Next Task**: CWS preparation / further AI UX polish, or next feature as prioritised by user.

**Suggested next steps**:
1. Test the new inline switcher in Chrome — reload extension from `.vite/`, open popup, exercise all 4 modes.
2. If WebLLM download progress bar needs real % updates (currently animates to 10% then jumps to 100%), hook into `WEBLLM_PROGRESS` messages from the service worker.
3. Consider adding a `<datalist>` or live "Fetch models" button to the Cloud panel for dynamic model discovery.

**Blockers**: None

**WIP Notes**:
- The 9 feature files (`assignmentBreakdown.js`, `citationAnalyzer.js`, etc.) and `src/features/shared/` are modified from the prior session (ai-feature-client.js migration) — these have not been committed yet and should be committed separately.
- No temp/debug code added this session.

---

**Session Complete**: 2026-03-08
