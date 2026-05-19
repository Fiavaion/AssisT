# Phase 2 Session 121 - GATHER Launch Day + Bug Fixes

**Date**: 2026-05-19
**Duration**: ~2 hours
**Phase**: Pre-Launch Polish — v0.9.0 GAAD Public Beta
**Progress**: 100% (maintenance/bugfix session)
**Session Number**: 121

---

## Session Overview

**Goal**: GATHER webinar day — post-event code fixes and launch prep
**Status**: ✅ Complete

---

## Accomplishments

### Features Completed
- [x] WebLLM "initialisation failed" bug — moved to Chrome Offscreen Document
- [x] Discovery quiz feature enabling — fixed storage path mismatch
- [x] Google Classroom mock page detection

### Files Modified
- `manifest.json` — added `offscreen` permission
- `vite.config.js` — added `rollupOptions.input` for webllm-offscreen entry point
- `src/background/service-worker.js` — refactored all WEBLLM_* handlers to use offscreen document via `sendToOffscreen()`
- `src/pages/webllm-offscreen/offscreen.html` — new offscreen document HTML (Vite entry)
- `src/pages/webllm-offscreen/offscreen.js` — new WebLLM runtime (CreateMLCEngine, message handler)
- `src/adapters/google-classroom-adapter.js` — mock page detection for local testing
- `src/pages/discovery/recommendations.js` — `SETTING_KEY_MAP` + `applyNestedPath()`, rewrote `applyProfile()` and `applyPreset()`

### Commits
- `a46578e` — test(classroom): add mock page detection to Google Classroom adapter
- `a079ec0` — fix(build): move WebLLM inference to offscreen document for WebGPU access
- `5703f66` — fix(content): write discovery quiz results to nested assist_settings paths

---

## Decisions Made

**Decision**: WebLLM runs in a Chrome Offscreen Document, not the service worker
- **Reason**: Service workers have no access to WebGPU; `CreateMLCEngine` was silently failing at 0%
- **Impact**: All WEBLLM_* messages now routed through `sendToOffscreen()` in service-worker.js; offscreen page bundled as proper Vite entry so `@mlc-ai/web-llm` bare imports resolve
- **Alternatives**: Rejected inline service-worker approach (WebGPU fundamentally unavailable there)

**Decision**: `SETTING_KEY_MAP` approach for discovery quiz storage writes
- **Reason**: Quiz `settingKey` values (e.g. `dyslexiaEnabled`) don't match nested `assist_settings` paths (e.g. `dyslexiaMode.enabled`); flat top-level writes were silently ignored
- **Impact**: Two special cases handled — `dyslexiaEnabled→dyslexiaMode.enabled`, `citationsEnabled→citation.enabled`
- **Alternatives**: Rejected renaming settingKeys in questions.js (would break scoring logic)

---

## Challenges and Solutions

**Challenge**: CRXJS copies `web_accessible_resources` files verbatim — bare module imports (`@mlc-ai/web-llm`) don't resolve
- **Solution**: Moved offscreen HTML to `vite.config.js` `rollupOptions.input` instead, which triggers full Vite bundling
- **Lesson**: Only files in `rollupOptions.input` (or manifest entry points) are fully bundled; WAR files are copied as-is

**Challenge**: commitlint rejected `fix(webllm)` — `webllm` not in allowed scopes
- **Solution**: Used `fix(build)` as the scope since the change required vite.config.js + manifest changes
- **Lesson**: Consider adding `webllm` or `ai` to commitlint allowed scopes for future sessions

---

## Technical Insights

- Chrome Offscreen Document reasons: `['WORKERS']` is the correct reason for WebGPU/WebLLM (not `['BLOBS']` or `['AUDIO_PLAYBACK']`)
- `chrome.runtime.getContexts()` is the correct way to check if an offscreen document already exists before creating one; wrap in try/catch for older Chrome compatibility
- `chrome.runtime.sendMessage()` broadcasts to ALL extension contexts including offscreen documents — no special routing needed, just filter on `message.target`
- Web Speech API offline behaviour: Chrome removes network-dependent voices from `getVoices()` when offline; the extension's existing `setVoice()` fallback to `availableVoices[0]` produces correct offline switching as an emergent side-effect (not explicitly coded)

---

## GATHER Event Notes

- GATHER 2026 webinar completed successfully today (2026-05-19)
- Demo pack (`GATHER-2026-Pack/`) created this session — not committed (presentation materials)
- Post-event LinkedIn message received — positive reception, advocacy interest from attendee
- Neil (post-event email) confirmed offline TTS switching behaviour works as expected

---

## Next Session

**Status**: Complete
**Next Task**: GAAD launch day sequence — Thursday 21 May 2026

**GAAD launch day checklist (UTC):**
- 06:00 — Post Show HN (account: Fiavaion)
- 08:00 — Mastodon + Bluesky thread
- 10:00 — LinkedIn launch post
- 12:00 — Reddit sequential (r/chrome_extensions, r/Accessibility, r/InstructionalDesign + others)
- 20:01 — Product Hunt goes live

**Outstanding pre-launch items:**
- Reddit account warming (u/Hefty-Vacation-4392) — 3-5 genuine comments in target subs
- Product Hunt gallery screenshots (3+) + demo video on YouTube
- `git tag v0.9.0` + GitHub release

**Blockers**: None — code is clean, build passes, 3 commits pushed to main

---

**Session Complete**: 2026-05-19
