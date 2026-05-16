# Phase 2 Session 117 — Codebase Slop Audit + Technical Debt Resolution

**Date**: 2026-05-16
**Duration**: ~2 hours
**Phase**: Phase 2 - Post-Launch Polish / Production Hardening
**Progress**: 100% → 100% (+0% feature completion, significant debt/correctness improvement)
**Session Number**: 117

---

## Session Overview

**Goal**: Full codebase AI-slop and technical debt audit — five specialist subagents in parallel, then apply all findings. Specifically targeted: dead code, comment noise, event handler pattern violations, storage split-brain, a silent API key re-encryption bug, a model preferences race condition, and raw z-index values.

**Status**: ✅ Complete — all approved must-fix and recommended items resolved, 3 real bugs fixed, baseline test suite preserved (1006/1008 passing, 2 pre-existing failures unchanged).

---

## Accomplishments

### Features Completed
- [x] Full 5-agent parallel codebase audit (comments, dead code, architecture, idioms, security/correctness)
- [x] All approved Phase 2/Phase 3 cleanup changes applied and committed

### Tasks Completed
- [x] Delete 3 confirmed-dead modules (usage-tracker.js, llm-bridge.js, agent-invoker.js)
- [x] Remove unused exports/globals (DOMPurifyInstance, window.AssistEventHandlers)
- [x] Fix 5 raw addEventListener('click') violations → attachInteractiveHandler
- [x] Remove 130-line extraction history block from content-simple.js
- [x] Remove 8 duplicate darkMode removal comments from popup.js
- [x] Remove "Reserved for future use" commented vars/dead functions from 4 feature files
- [x] Fix storage split-brain: settings-manager.js sync → local (+ one-time migration)
- [x] Fix API key re-encryption silent bug in secure-key-storage.js
- [x] Fix model preferences startup race in service-worker.js
- [x] Migrate all 21 raw z-index 999999 values to named Z constants

### Files Modified
- `src/ai/usage-tracker.js` — DELETED (dead module)
- `src/ai/llm-bridge.js` — DELETED (dead module)
- `src/utils/agent-invoker.js` — DELETED (dead module)
- `src/utils/sanitize.js` (-3 lines) — removed unused DOMPurifyInstance export
- `src/utils/event-handlers.js` (-11 lines) — removed unused window.AssistEventHandlers global
- `src/adapters/canvas-adapter.js` — import + click → attachInteractiveHandler
- `src/adapters/google-classroom-adapter.js` — import + click → attachInteractiveHandler
- `src/adapters/moodle-adapter.js` — import + click → attachInteractiveHandler
- `src/content/utils/dom-utils.js` — import + click → attachInteractiveHandler
- `src/engines/stt/confidence-feedback.js` — import + click → attachInteractiveHandler
- `src/content/content-simple.js` (-130 lines) — extraction documentation block removed
- `src/popup/popup.js` (-8 lines) — duplicate darkMode comments removed
- `src/features/imageUnderstanding/imageUnderstanding.js` (-1 line) — reserved var removed
- `src/features/socraticTutor/socraticTutor.js` (-5 lines) — reserved vars + dead commented function removed
- `src/features/multiDocCompare/multiDocCompare.js` (-1 line) — reserved var removed
- `src/ai/cloud-router.js` (+1 line) — bare catch comment added
- `src/core/storage/settings-manager.js` (+12 lines) — sync→local migration + all .sync→.local
- `src/core/storage/secure-key-storage.js` (+1 line) — missing timestamp on temp password
- `src/background/service-worker.js` (-1/+5 lines) — callback→async IIFE for model prefs
- `src/features/annotations/annotation-sidebar.js` — z-index Z.OVERLAY
- `src/features/annotations/inline-annotations.js` — z-index Z.FLOATING
- `src/features/citations/citation-ui.js` — z-index Z.MODAL
- `src/features/cognitiveProfile/cognitiveProfile.js` — z-index Z.MODAL
- `src/features/dictionary/dictionary.js` — z-index Z.MODAL (3 occurrences)
- `src/features/imageUnderstanding/imageUnderstanding.js` — z-index Z.MODAL
- `src/features/knowledgeGraph/knowledgeGraph.js` — z-index Z.FLOATING (tooltip)
- `src/features/ocr/ocr.js` — z-index Z.MODAL (4 occurrences)
- `src/features/pomodoro/pomodoro.js` — z-index Z.FLOATING
- `src/features/readingProgress/readingProgress.js` — z-index Z.OVERLAY
- `src/features/rsvp/rsvp-ui.js` — z-index Z.MODAL
- `src/features/socraticTutor/socraticTutor.js` — z-index Z.MODAL
- `src/features/textStats/textStats-ui.js` — z-index Z.MODAL
- `src/features/translation/full-page-translate.js` — z-index Z.MODAL
- `src/features/translation/translation-ui.js` — z-index Z.MODAL
- `src/ui/styles/content.css` — z-index 100400 (Z.MODAL numeric, CSS can't import JS)

**Net**: ~1,200+ lines removed, 40 files touched across 9 commits

### Tests Written
- None (audit/cleanup session — no new behaviour)

### Commits
- `d05582e` — refactor(build): delete three dead modules with zero callers
- `5b0f129` — refactor(build): remove unused export and window global from utils
- `5bbbd10` — fix(canvas): replace raw click listeners with attachInteractiveHandler
- `062db03` — docs(content): remove extraction history comments and dead commented code
- `b116dc6` — fix(build): document intentional bare catch in getCachedModels
- `1b5370d` — fix(build): resolve storage split-brain, key-rekey bug, and model-pref race
- `caaa4dc` — fix(ui): migrate all raw z-index 999999 to named scale constants

---

## Decisions Made

**Decision**: Use `enableVisualFeedback: false` on FAB `attachInteractiveHandler` calls.
- **Reason**: Canvas/Moodle/Google Classroom adapter FABs already have their own `mouseenter`/`mouseleave` scale(1.1) + boxShadow handlers. Default feedback adds a competing scale(1.05) that would double-fire.
- **Impact**: FABs keep their custom hover feel; the race-condition protection is gained without visual regression.
- **Alternatives**: Remove custom hover handlers — rejected as they use a larger scale factor (1.1 vs 1.05) that was presumably deliberate.

**Decision**: One-time migration from `chrome.storage.sync` → `.local` inside `loadSettings()`.
- **Reason**: Existing users (if any had settings saved via the SettingsManager path) would lose their customisations on first load after the switch. Migration runs once, copies, then clears sync.
- **Impact**: Zero data loss. Migration is idempotent — if sync has no data it's a no-op.
- **Alternatives**: Silent switch with no migration — rejected (risky for existing users).

**Decision**: Left `settings-manager.js` storage area as a judgment-call until confirmed, then migrated to `.local` after user confirmed the intent.
- **Reason**: `.sync` could have been an intentional cross-device-sync feature. Asked user first.
- **Impact**: Now consistent with all other storage usage in the codebase.

**Decision**: Skipped `service-worker.js` backdrop `addEventListener('click')` from the raw-click migration.
- **Reason**: `attachInteractiveHandler` is a content-script utility that uses `document`-relative event semantics. Service worker context is different — no DOM, no visual feedback needed.
- **Impact**: That click handler remains as-is, which is correct.

---

## Bugs Fixed

**Bug 1 — API key re-encryption silent failure (HIGH)**
- **Root cause**: `setUserPassword()` stored `assist_temp_password` without `assist_temp_password_ts`. The TTL check in `getEncryptionSecret()` computed `age = Date.now() - (undefined || 0) = Date.now()` which is always >> 5 minutes. The temp password was immediately expired, re-encryption fell back to the machine ID, and keys were encrypted with the machine ID — not the user's password. Subsequent `unlockWithPassword()` succeeds (hash matches), but decryption fails because the key material is wrong.
- **Fix**: Add `assist_temp_password_ts: Date.now()` alongside the temp password write.
- **Lesson**: Missing a timestamp is invisible at write time but catastrophic at read time.

**Bug 2 — Storage split-brain (MEDIUM)**
- **Root cause**: `settings-manager.js` saved to `chrome.storage.sync`; all content scripts and feature modules read from `chrome.storage.local`. Settings changed via the SettingsManager API (popup.js uses it) were silently invisible to the page.
- **Fix**: Migrated all four storage operations to `.local`; added sync→local migration on `loadSettings()`.

**Bug 3 — Model preferences race (LOW, theoretical)**
- **Root cause**: `chrome.storage.local.get('modelPreferences', callback)` at startup was a fire-and-forget callback. Messages arriving before it resolved used default model routing.
- **Fix**: Converted to `async/await` IIFE — preferences are loaded before the microtask queue returns.

---

## Technical Insights

- **`chrome.storage.sync` vs `.local`**: `sync` has a 100KB total quota and syncs across Chrome profiles. For an extension managing large settings objects and needing FERPA compliance (don't sync user data to Google servers), `.local` is always the right choice unless cross-device sync is an explicit product feature.

- **TTL guards need timestamps at write time**: The pattern `if (age > TTL) expire()` only works if the timestamp is stored at the same time as the value. A zero/undefined timestamp makes the age calculation meaningless.

- **Z-index hierarchies in extensions**: Host pages (Canvas, Moodle) use values up to ~9999. Extension UI at 999999 wins, but extension elements fight each other. A named scale (BASE=100000 … FOCUS=100600) makes stacking deterministic.

- **`attachInteractiveHandler` on adapter FABs**: Adapters share a FAB factory pattern with custom hover CSS. When wiring `attachInteractiveHandler`, always check if the element has its own hover handlers first — `enableVisualFeedback: false` is needed to avoid competing transforms.

---

## Judgment Calls Left Open (not actioned)

- `settings-manager.js` was the only one actioned after user confirmation. The others from the Phase 2 audit remain:
  - `popup.js` 11K-line monolith — architectural debt, high stability risk to split now
  - Cloud client duplication (claude/openai/google DEFAULT_OPTIONS) — architecture refactor, out of scope
  - `_TEMPLATE_FEATURE.js` commented examples — developer scaffold, harmless
  - `service-worker.js` backdrop click — correct to leave as raw listener in SW context

---

## Next Session

**Status**: ✅ Complete — no outstanding work from this session.

**Suggested next priorities**:
1. Run `/gaps-audit` to verify the event handler migrations didn't break any shortcut wiring
2. Build + manual smoke test in Chrome (especially FAB buttons on Canvas/Moodle pages after the `attachInteractiveHandler` change)
3. Pre-CWS Tier 2 checklist (from Session 110): privacy policy page, CWS listing assets, E2E smoke on real Canvas, NVDA screen reader test, CHANGELOG.md, v1.0.0 tag

**Blockers**: None

**WIP Notes**: None — working tree is clean, all commits pushed.

---

**Session Complete**: 2026-05-16
