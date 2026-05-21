# Phase 2 Session 123 - GAAD Launch Day

**Date**: 2026-05-21
**Duration**: ~3 hours
**Phase**: Post-Launch — v0.9.1 CWS Update + How-To Guide Pipeline
**Progress**: 100% (launch day operations session)
**Session Number**: 123

---

## Session Overview

**Goal**: GAAD launch day — publish v0.9.1 to CWS, update Fiavaion website, begin how-to guide video production pipeline
**Status**: ✅ Complete (CWS + website) / 🔄 In Progress (voice pipeline)

---

## Accomplishments

### Features Completed
- [x] Version bump 0.9.0 → 0.9.1 in manifest.json and package.json
- [x] Production build of v0.9.1 (773 modules, 0 errors, 11 MB)
- [x] assist-0.9.1.zip created for CWS upload (5.46 MB)
- [x] Fiavaion website version updated — assist.mdx (was 0.1.3!) and privacy.astro both → 0.9.1
- [x] Fiavaion website committed and pushed (live deploy triggered)
- [x] CWS offscreen document justification written for privacy practices tab
- [x] AssisT_GAAD.html — "GAAD 2026" logo sub-text replaced with "How-To Guides"
- [x] AssisT_GAAD.html — First Setup panel rewritten (interface tour, tabs, Settings, permission prompts)
- [x] AssisT_GAAD.html — New AI Setup panel added (7-step wizard, 4 AI modes, prerequisites quick-start)
- [x] AssisT_GAAD.html — "AI Setup" nav item added to Getting Started section
- [x] PANEL_META updated with accurate descriptions for first-setup and ai-setup
- [x] Both GAAD_launch locations updated (project + Desktop)
- [x] YouTube video descriptions written for videos 1 (Install), 2 (Popup Controls)
- [x] YouTube how-to playlist title and description written
- [x] FiavaionTuts voice pipeline — voice_replace.py script built and tested
- [x] FiavaionTuts voice pipeline — full run completed (Whisper medium + Chatterbox TTS)

### Files Modified

**AssisT project:**
- `manifest.json` — version 0.9.0 → 0.9.1
- `package.json` — version 0.9.0 → 0.9.1
- `GAAD_launch/AssisT_GAAD.html` — logo sub, First Setup panel, AI Setup panel + nav, PANEL_META

**Fiavaion website (separate repo, pushed):**
- `src/content/products/assist.mdx` — version 0.1.3 → 0.9.1
- `src/pages/products/assist/privacy.astro` — version 0.9.0 → 0.9.1

**FiavaionTuts project (D: drive):**
- `backend/voice_replace.py` — new file, full voice replacement pipeline

### Commits Made
- `657800c` — docs(docs): end Phase 2 session 122 - GAAD launch prep, feature guide live
- Fiavaion website: `9ca2905` — chore(assist): bump AssisT version to 0.9.1
- AssisT v0.9.1 zip created locally (not yet pushed — CWS upload was the target)

---

## Decisions Made

**Decision**: v0.9.1 patch release rather than staying on 0.9.0 for GAAD
- **Reason**: CWS required offscreen document justification to publish; re-upload needed a version bump
- **Impact**: Clean version separation between pre-GAAD (0.9.0) and GAAD live (0.9.1)
- **Alternatives**: Staying on 0.9.0 was blocked by CWS review requirement

**Decision**: How-To Guides page uses word "How-To Guides" not "GAAD 2026" in nav logo
- **Reason**: The showcase file will be used ongoing for YouTube how-to guides, not just GAAD
- **Impact**: File is now a permanent how-to reference, not a one-day event page

**Decision**: Try voice conversion (seed-vc) before word-level TTS approach
- **Reason**: Voice conversion preserves timing perfectly by transforming the existing audio rather than re-synthesising from text
- **Alternatives**: Word-level timecode + time-stretch approach held in reserve if VC quality is poor

---

## Challenges and Solutions

**Challenge**: CWS blocked publish — "A justification for offscreen is required"
- **Solution**: Written justification provided: offscreen document used exclusively for WebLLM/WebGPU inference, no external data transmission, on-demand only
- **Time Lost**: ~10 minutes
- **Lesson**: CWS requires explicit justification for offscreen API in privacy practices tab — not just declaring the permission

**Challenge**: Fiavaion website showing 0.1.3 after version update
- **Solution**: Changes were sitting uncommitted — commit + push triggered redeploy
- **Time Lost**: ~5 minutes
- **Lesson**: Always commit and push Fiavaion website changes; edits alone don't deploy

**Challenge**: Voice clone (Chatterbox TTS) output was 53s for a 160s video
- **Root Cause**: Full transcript (~400+ words) exceeds Chatterbox's practical per-call limit; audio was truncated and rushed
- **Solution**: Pivot to voice conversion (seed-vc) which transforms existing audio without synthesis — timing preserved by definition
- **Time Lost**: ~15 minutes for the full run
- **Lesson**: Chatterbox TTS needs chunked input for long transcripts; voice conversion is the better architecture for this use case

---

## Technical Insights

- Chatterbox TTS `generate()` has no documented length limit but empirically truncates/rushes long transcripts — always chunk at sentence level or shorter
- `faster-whisper` with `word_timestamps=True` provides per-word start/end times — useful for the word-level fallback approach
- seed-vc 0.4.3 is pip-installable and supports zero-shot voice conversion (no training required)
- FFmpeg `-shortest` flag cuts output at the shorter stream — dangerous when cloned audio is shorter than video
- Chatterbox sampling ran at ~1.4 it/s on RTX 3080 for 1000 steps (~12 minutes for the full run)

---

## Next Session

**Status**: In Progress — seed-vc install triggered at session end (background task)
**Next Task**: Test seed-vc voice conversion on 002_Setup.mp4

**Exact Next Steps**:
1. Check seed-vc install completed: `cd FiavaionTuts/backend && .venv/Scripts/pip show seed-vc`
2. Check seed-vc API: `.venv/Scripts/python -c "import seedvc; help(seedvc)"`
3. Write `voice_convert.py` using seed-vc — extract audio, run VC with 20s reference, merge back
4. Test on `D:\AssisT_HowTo\Output\002_Setup.mp4`
5. Compare quality against original

**If seed-vc fails**: Fall back to word-level timecode approach:
- Whisper with `word_timestamps=True`
- Group into 2-word chunks
- Synthesise each chunk with Chatterbox
- Time-stretch each chunk to match original duration with FFmpeg `atempo`
- Build silent timeline, drop chunks at original start times, merge

**Blockers**: seed-vc install was running at session end — may have succeeded or failed

**WIP Notes**:
- `FiavaionTuts/backend/voice_replace.py` — working but poor quality due to truncation, kept for reference
- assist-0.9.1.zip at repo root — for CWS upload, not committed (correct, build artefact)
- GAAD_launch/ directory is untracked in AssisT repo (gitignored) — this is correct

---

**Session Complete**: 2026-05-21
