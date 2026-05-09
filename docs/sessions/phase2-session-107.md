# Phase 2 Session 107 — TTS Word-Highlight Speed Slider + Page-Scope Fix

**Date**: 2026-05-09
**Phase**: Phase 2 — Bug Fix Sprint (pre-GAAD 2026-05-21)
**Session Number**: 107

---

## Session Overview

**Goal**: Continue Batch B bug fixes (#80, #82, #83). The previous context window had fixed #80/#83 and added the boundary/timer mode selector for #82. This session added the user-requested highlight-speed slider, changed the default to 2×, and fixed the watchdog so highlights actually advance through whole-page/section scope without boundary events.

**Status**: ⏸️ Partial — #80 and #83 confirmed fixed; #82 code-complete, pending user verification. Batch C (#84, #85, #91) not yet started.

---

## Accomplishments

### Features Completed

- [x] Word highlight speed slider (0.25×–4×) in popup word-by-word panel
- [x] Speed default changed to 2× (faster highlight advance for voices without boundary events)
- [x] Watchdog re-engineered: uses `wordLen × msPerChar` timing when `onboundary` never fires — highlights now advance at speech pace through page/section scope

### Commits

| Hash | Message |
|------|---------|
| `bf266c8` | fix(tts): remove disabled-TTS toast, fix highlight pause, clarify STT engine dropdown |
| `c03cdf7` | fix(tts): chunk long texts for page/section scope; fix word-highlight drift |
| `72dad15` | feat(tts): add word-highlight sync mode selector (boundary vs timer) |
| `bcd1862` | feat(tts): add word highlight speed slider to popup |
| `ce68261` | fix(tts): set word highlight speed default to 2x |
| `86607d0` | fix(tts): watchdog tracks word pace when onboundary never fires |

### Files Modified

- `src/popup/popup.html` — Added `#word-highlight-speed` slider + `#word-highlight-speed-value` display inside `#word-highlight-mode-row`; added Whisper `disabled` + renamed auto option; added `#word-highlight-mode-row` with boundary/timer radios
- `src/popup/popup.js` — Speed slider init + `input` handler → `setWordHighlightSpeed`; mode radio init + `change` → `setWordHighlightMode`; scope `change` → `setReadingScope`; `engineNames.auto` relabelled
- `src/content/content-simple.js` — `wordHighlightSpeed: 2.0` default in settings; two settings-load blocks + message handler (`setWordHighlightSpeed`); `setWordHighlightMode`; `setReadingScope`; `readChunked` + `_drainQueue` + `_splitAndQueueLeaves` for page/section chunking
- `src/core/dom/highlighting.js` — `speedMultiplier` from `settings.wordHighlightSpeed`; `initialMsPerChar` scaled by multiplier; `speedMultiplier` applied to calibrated `msPerChar` on boundary; `setWatchdog` now uses `wordLen × msPerChar` when `boundaryFired === false` (word-pace mode) vs long safety-net when boundary events work

---

## Decisions Made

**Decision**: Speed slider (0.25×–4×) rather than EMA blend or two discrete modes as the user-facing calibration knob.
- **Reason**: User reported both sync modes highlighted every 1–2 seconds regardless of mode — the problem was the 2-second watchdog, not the sync algorithm. A slider gives direct control without algorithm switching confusion.
- **Impact**: Users can tune to their voice without understanding boundary events vs timer prediction.
- **Alternatives rejected**: EMA blend (added convergence lag, made sync worse per user feedback); binary fast/slow preset.

**Decision**: Default speed 2× (not 1×).
- **Reason**: Without `onboundary`, the watchdog was the primary driver. At 1×, `msPerChar = 100ms/char` → 5-char word highlighted every 500ms; TTS speaks ≈3–5 words/sec. 2× halves the delay, keeping highlights roughly in pace without racing ahead.
- **Impact**: New users get a better out-of-box experience on voices without boundary events.

**Decision**: Watchdog uses `wordLen × msPerChar` when `boundaryFired === false`; reverts to long safety-net (2s/speed) once any boundary fires.
- **Reason**: The fixed 2000ms watchdog advanced 1 word/second while TTS spoke 3–5 words/second — highlights appeared stuck on the first paragraph across page/section scope. Per-word estimated duration makes the watchdog the correct primary driver when no boundaries arrive.
- **Impact**: Page/section scope word-by-word highlighting now advances through all paragraphs, not just the first chunk's first leaf.

---

## Challenges and Solutions

**Challenge**: `popup.html` edit failed with "File has been modified since read" twice during the slider addition (linter reformatted between Read and Edit).
- **Solution**: Re-read the file to get fresh state before every edit attempt; used Grep first to find exact surrounding context to target the smallest unique string.
- **Time**: ~5 minutes per occurrence.

**Challenge**: ESLint `eqeqeq` — used `!= null` (loose null check) which the linter rejected.
- **Solution**: Replaced with `!== null && !== undefined` in all three content-simple.js occurrences. Pre-commit hook caught it automatically.

**Challenge**: Identifying why page-scope word highlighting appeared "stuck" on first paragraph — root cause was not immediately obvious from user description.
- **Solution**: Traced `onboundary` never firing → watchdog as sole driver → fixed 1000ms/word advance vs 3–5 words/sec speech → watchdog falls far behind before chunk ends. Fix: per-word `wordLen × msPerChar` timing.

---

## Technical Insights

- Chrome's `onboundary` is unreliable for network voices (Google UK Female, most non-OS voices). Any word-by-word system MUST have a viable fallback that advances at actual speech pace, not a fixed safety-net interval.
- A `2000ms` watchdog designed as a "missed event" safety net becomes the primary driver for many users — its timing must reflect speech rate, not just "long enough for a boundary to fire."
- `speedMultiplier` must be applied at THREE points: `initialMsPerChar` (startup estimate), boundary-calibrated `msPerChar` (live recalibration), and `setWatchdog` timeout (the advance interval). Missing any one causes the slider to be partially effective.
- `wrapLeafTextNodes` + TreeWalker pattern (from session 106) correctly handles all leaves across all chunks — the bug was purely in the advancement timing, not the wrapping.

---

## Bugs Fixed This Session

| Bug | Status | Commit |
|-----|--------|--------|
| #80 — TTS notification pop-up when disabled | ✅ Fixed | `bf266c8` |
| #83 — STT Whisper option confusing | ✅ Fixed | `bf266c8` |
| #82 — Word highlight sync + speed control | ✅ Code complete (BugHive linked `bcd1862`) | `bcd1862`, `ce68261`, `86607d0` |

---

## Next Session

**Status**: Partial — Batch B code-complete pending user verification of #82.
**Next Batch (C)**: #84 Reading guide white colour, #85 Shortcuts not working, #91 Compare documents read-all button.

**Exact next steps**:
1. User verifies #80, #82, #83 in browser and closes verified bugs in BugHive
2. Start Batch C: `get_bug` for #84, #85, #91
3. `npm run build` before each fix, reload extension, test

**WIP Notes**:
- #82 BugHive linked to commit `bcd1862` + comment added explaining all three timing paths
- Speed slider shows `1×` as display label when stored value is `1.0` — this is correct; existing users with no saved preference will see `2×` after the default change only on fresh installs (stored value trumps default)
- `wordHighlightMode` second settings-load block (storage `onChanged`) still does not sync `wordHighlightMode` — only the first block and the `setWordHighlightMode` message do. Low priority: mode persists correctly via direct message.

---

**Session Complete**: 2026-05-09
