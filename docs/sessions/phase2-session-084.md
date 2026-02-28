# Phase 2 Session 084 - AI Feature Bug Fixes (KG, Study Path, Model Cache)

**Date**: 2026-02-28
**Duration**: ~1 hour
**Phase**: Phase 2 Extension - Bug Fix Sprint
**Progress**: 100% → 100% (maintenance / quality)
**Session Number**: 84

---

## Session Overview

**Goal**: Fix broken Knowledge Graph and Study Path features; fix model dropdown showing stale "4.5" labels.
**Status**: ⏸️ Partial — fixes applied and built, awaiting final user confirmation of Study Path fix.

---

## Accomplishments

### Bugs Fixed
- [x] **Model dropdown showing "4.5" labels** — stale `cloudModels_anthropic` cache in `chrome.storage.local`
- [x] **Knowledge Graph classifying people as "concept"** — weak prompt with no type guidance
- [x] **Study Path JSON parse failure** — response cache collision + broken regex + insufficient tokens
- [x] **Study Path single-section heuristic fallback** — root cause was cached truncated response

### Root Causes Discovered

1. **Stale model label cache**: `cloud-router.js` cached model names in `chrome.storage.local` for 24h with no version stamp. Old entries with "4.5" in labels persisted after model IDs were updated.

2. **ClaudeCache key collision**: `ClaudeCache.generateKey()` only hashes `prompt.slice(0, 500)`. The Study Path prompt's first 500 chars are always identical (same preamble + same page content start), so every call returned the original truncated response regardless of template changes.

3. **Broken JSON regex**: My previous fix changed `/\{[\s\S]*\}/` to `/\{[\s\S]*/` to handle truncation — but this captures trailing markdown backticks (` ``` `) when Claude wraps responses in code fences, breaking `JSON.parse`.

4. **Knowledge Graph uses simple fallback**: The LLM prompt had no guidance on entity type classification; Claude defaulted to "concept" for partial person names ("Pierre", "Paul", "Vincent") and generated generic definitions matching the fallback string.

### Files Modified This Session
- `src/ai/cloud-router.js` — Added `MODELS_CACHE_VERSION = 2`; version checked on cache read, stored on write
- `src/features/knowledgeGraph/knowledgeGraph.js` — Rewrote extraction prompt with explicit type rules + examples; added `noCache: true`; expanded token limit map to include full model IDs
- `src/features/studyPathGenerator/studyPathGenerator.js` — `maxTokens` 3000→8192; `noCache: true`; simplified JSON prompt template; rewrote JSON extraction (code block stripping, two-stage parse, diagnostic logging); clean error message

---

## Decisions Made

**Decision**: `noCache: true` for Knowledge Graph and Study Path generation calls
- **Reason**: Cache key only uses first 500 prompt chars — identical for all calls on same page
- **Impact**: Slight latency increase (no caching for these features), but correct results every time
- **Alternatives**: Extend cache key length — rejected as that could break other features using the cache

**Decision**: `MODELS_CACHE_VERSION` constant in `cloud-router.js`
- **Reason**: Cleanest way to invalidate 24h `chrome.storage.local` cache when model names/IDs change
- **Impact**: Bumping the version in future forces all users to refresh model lists automatically
- **Alternatives**: Clear cache on extension update — harder to implement with MV3

**Decision**: `maxTokens: 8192` for Study Path (Sonnet's maximum)
- **Reason**: Previous 3000 was too low; 4096 was borderline; 8192 eliminates truncation entirely
- **Impact**: Slightly higher API cost per Study Path generation; worth it for reliability

---

## Challenges

**Challenge**: Study Path kept showing "Heuristic (AI parse error — retry)" despite noCache and maxTokens fixes
- **Solution**: Traced to my broken regex change (`/\{[\s\S]*/` captures trailing backticks from code-fenced responses). Fixed to: strip code block → try `{..}` match → fallback to raw parse.
- **Time**: ~20 minutes of iteration
- **Lesson**: Never change a working regex without testing all output formats (plain JSON, code-fenced, truncated)

**Challenge**: Multiple changes weren't taking effect
- **Solution**: The cache was serving the old truncated response; `noCache: true` was the key unlock
- **Lesson**: The ClaudeCache key only hashes 500 chars of prompt — effectively identical for same-page repeat calls on feature prompts that share a common preamble

---

## Technical Insights

- `ClaudeCache.generateKey()` uses `prompt.slice(0, 500)` — any feature with a fixed preamble + variable content is vulnerable to cache collisions on the same page
- Claude sometimes wraps JSON responses in ` ```json ``` ` code fences even when instructed not to; always strip these before regex matching
- `chrome.storage.local` model caches survive extension reloads and need explicit versioning
- Adding explicit type examples with rationale ("Pierre in art context = person") dramatically improves LLM classification accuracy vs just listing type names

---

## Next Session

**Status**: ⏸️ Partial — Study Path fix needs user confirmation after extension reload
**Next Steps**:
1. User confirms Study Path generates multiple sections with AI badge shown
2. User confirms Knowledge Graph shows coloured person/place/theory nodes
3. If Study Path still fails: check Chrome DevTools console for `[StudyPathGenerator] Raw response` log to see actual API output
4. Run `/commit` once features confirmed working

**WIP Notes**:
- 12 source files modified but not yet committed (accumulated from sessions 083+084)
- Diagnostic `console.log` left in `studyPathGenerator.js` (line 532) — remove after confirming fix works
- `AssisT_0_1_1/` directory untracked — do not commit

---

**Session Complete**: 2026-02-28
