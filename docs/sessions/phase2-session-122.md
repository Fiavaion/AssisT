# Phase 2 Session 122 - GAAD Launch Day Prep

**Date**: 2026-05-20
**Duration**: ~2 hours
**Phase**: Pre-Launch Polish — v0.9.0 GAAD Public Beta
**Progress**: 100% (launch content/materials session)
**Session Number**: 122

---

## Session Overview

**Goal**: Prepare all GAAD launch day content — clean the showcase HTML of GATHER references, rewrite all 35 how-to video scripts to be web-first rather than LMS-specific
**Status**: Complete

---

## Accomplishments

### Features Completed
- [x] AssisT_GAAD.html — created from AssisT for GATHER 2026.html, all GATHER/AHEAD/AONTAS references purged
- [x] 22 how-to video scripts rewritten — all Canvas/LMS/Moodle/Classroom references removed
- [x] 6 launch-day video priority set — confirmed recording order for GAAD May 21
- [x] Scripts 01 and 02 updated to cover AI Setup wizard and first-popup notifications accurately

### Files Modified (GAAD_launch — Desktop + AssisT project, both locations)

New file:
- GAAD_launch/AssisT_GAAD.html — 1.35 MB (stripped from 3.1 MB GATHER version)

Scripts rewritten (22 files):
- tools/scripts/01_install.md — extended to cover 7-step AI Setup wizard
- tools/scripts/02_first-setup.md — rewritten: Enable Everywhere, local files, Discover Your Tools, AI mode selector
- tools/scripts/03_read-aloud.md — Canvas removed; any page framing
- tools/scripts/04_reading-mode.md — Canvas removed; general web tool framing
- tools/scripts/05_dyslexia-mode.md — "entire Canvas page" removed
- tools/scripts/06_ocr.md — "without leaving Canvas" removed
- tools/scripts/07_speech-to-text.md — Canvas text fields generalised
- tools/scripts/08_quick-actions-menu.md — "Canvas page" generalised; outro fixed
- tools/scripts/09_dictionary.md — "without leaving Canvas" removed
- tools/scripts/10_translation.md — "Canvas pages" generalised
- tools/scripts/11_text-customisation.md — "Canvas page layout" generalised
- tools/scripts/13_reading-progress.md — "long Canvas pages" generalised
- tools/scripts/14_speed-read-rsvp.md — outro fixed
- tools/scripts/15_annotations.md — "on Canvas" generalised; outro fixed
- tools/scripts/16_sticky-notes.md — "any Canvas page" generalised
- tools/scripts/17_custom-cursor.md — "not just Canvas" removed
- tools/scripts/22_pomodoro-timer.md — "sits on top of Canvas" generalised
- tools/scripts/23_simplified-interface.md — generalised; outro fixed
- tools/scripts/24_citations.md — generalised; outro now points to AI Summarisation (skips deferred 25/26/27)
- tools/scripts/28_ai-summarisation.md — "text on Canvas" removed; "WebLLM" renamed "Browser AI"
- tools/scripts/30_ai-assignment-breakdown.md — "on Canvas" removed
- tools/scripts/35_ai-multi-doc-compare.md — closing generalised to "any website"

Scripts left untouched (already clean): 12, 18, 19, 20, 21, 29, 31, 32, 33, 34
Scripts deferred (LMS-specific): 25 (Canvas LMS), 26 (Moodle LMS), 27 (Google Classroom)

No code commits this session — content/materials work only

---

## Decisions Made

Decision: Position AssisT as a general web accessibility tool; LMS support is a compatibility layer
- Reason: GAAD audience is broad. Leading with Canvas/Moodle shrinks perceived audience
- Impact: 22 scripts reframed. LMS videos 25/26/27 deferred until dedicated LMS functionality warrants its own set
- Alternatives: Rejected keeping Canvas as primary demo environment

Decision: 6 launch-day videos — 01, 02, 03, 04, 05, 28
- Reason: Covers full onboarding arc plus one AI feature. Realistic to record in a single day
- Impact: Remaining 29 videos publish post-GAAD at 1-2/day cadence

Decision: Scripts 25, 26, 27 deferred
- Reason: Current LMS integration is a compatibility layer — not enough differentiated functionality
- Impact: Outro chain: video 24 points to 28 (AI Summarisation), skipping LMS trilogy

---

## Technical Insights

- AssisT_GAAD.html size reduction: Removing embedded AHEAD logo (base64 PNG ~900KB) dropped file from 3.1 MB to 1.35 MB
- Gemini free API tier: 15 RPM / 1,000,000 TPM / 1,500 RPD. RPM is the practical limit. Free tier = no FERPA guarantee on personal keys
- AI Setup wizard is 7 steps: Welcome, System Scan, Our Recommendation, Configure Your AI, How You Prefer AI, Test Your AI, Suggested Features, Done
- Enable Everywhere: Yellow notification, auto-appears on install, button label is "Enable Everywhere", tab reload required after grant

---

## Next Session — GAAD Launch Day (May 21)

Status: Complete — ready to record

Recording order:
1. 01_install.md — Install + AI Setup wizard
2. 02_first-setup.md — Enable Everywhere, Discover Your Tools, AI mode selector
3. 03_read-aloud.md — Read Aloud on any webpage
4. 04_reading-mode.md — demo on cluttered news page (Daily Mail recommended)
5. 05_dyslexia-mode.md — GAAD flagship
6. 28_ai-summarisation.md — AI differentiation

GAAD launch sequence:
- 06:00 Show HN
- 08:00 Mastodon + Bluesky
- 10:00 LinkedIn
- 12:00 Reddit
- 20:01 Product Hunt

Outstanding pre-launch:
- Push Fiavaion website repo (2 commits ahead)
- CWS promo tile (440x280)
- CWS submission
- git tag v0.9.0 + GitHub release

Blockers: None

---

Session Complete: 2026-05-20