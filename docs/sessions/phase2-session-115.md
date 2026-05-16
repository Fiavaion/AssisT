# Phase 2 Session 115 - Citation Analyser Output Fixes + Robustness Audit

**Date**: 2026-05-16
**Duration**: ~2 hours
**Phase**: Phase 2 - Post-Launch Polish / Quality
**Progress**: 100% → 100% (+0% feature completion, significant quality improvement)
**Session Number**: 115

---

## Session Overview

**Goal**: Fix three Citation Analyser output bugs identified from live use (status/badge mismatch, hardcoded Ollama text, bad Semantic Scholar title search), then conduct a full robustness audit across citation styles.
**Status**: ✅ Complete

---

## Accomplishments

### Features Completed
- [x] Citation Analyser — all three known output bugs fixed
- [x] Citation Analyser — full robustness audit: 7 additional defects found and fixed

### Tasks Completed
- [x] Status bar mismatch: when AI ran but returned unparseable JSON, status wrongly showed "analysis complete (Local AI)" with a Basic badge — now shows error-style "AI returned an unreadable response" message
- [x] Hardcoded "ensure Ollama is running" recommendation in `citation_fallback()` — replaced with mode-agnostic messages, parameterised by `aiAttempted` flag
- [x] `citation_extractSearchTitle()` — was APA-only; now handles 8 citation styles
- [x] `hasCitationFormat` — was returning `false` for ALL citation styles (required a colon that APA doesn't use)
- [x] DOI detection `includes('10.')` — massive false positive rate; replaced with `CITATION_DOI_REGEX`
- [x] Academic keyword false positives — "press" and bare "journal" removed; require 2+ hits for classification
- [x] Score blending — changed from 40% AI / 60% heuristic to 70% AI / 30% heuristic
- [x] Context URL — no longer defaults to `window.location.href` when no URL in citation text
- [x] Catch-block fallback — now marks `aiAttempted=true` (AI was in flight when error occurred)
- [x] Year extraction — prefers parenthetical citation year `(YYYY)` over first bare year in prose

### Files Modified
- `src/features/citationAnalyzer/citationAnalyzer.js` (+120 lines, two commits)

### Commits Made
- `3243cc2` — fix(content): citation analyser output bugs — status, recommendations, title search
- `b1bc45b` — fix(content): citation analyser robustness — multi-style title extraction and heuristic accuracy

---

## Decisions Made

**Decision**: Multi-strategy title extraction (4 strategies in priority order)
- **Reason**: No single regex covers all citation styles; different styles place the title at different positions relative to author/year
- **Impact**: Semantic Scholar online verification now works correctly for MLA, IEEE, Chicago, Vancouver, Newspaper APA, Harvard, and book/thesis formats — not just APA
- **Alternatives**: Could have used a single broader regex, but false positive rate would be high

**Decision**: Remove "press" and bare "journal" from academic keyword list
- **Reason**: "Reuters press release" and "Reuters journal coverage" were both being classified as academic sources; these keywords are too ambiguous in general text
- **Impact**: Reputable publishers list (`mit press`, `oxford`, etc.) still catches genuine academic presses; bare journal/press in text no longer misclassifies news content
- **Alternatives**: Could have required 2+ hits for any single keyword — chose to remove the ambiguous keywords entirely instead

**Decision**: Score blending changed to 70% AI / 30% heuristic (from 40/60)
- **Reason**: The heuristic was demonstrably unreliable (DOI false positives, academic keyword false positives); giving it 60% weight could actively degrade good AI analysis results
- **Impact**: AI judgement now leads; heuristic only makes a small correction when significantly higher
- **Alternatives**: Remove blending entirely — kept it as a safety net for when AI severely underestimates institutional sources

**Decision**: `context.url` no longer defaults to `window.location.href`
- **Reason**: Canvas LMS page URL has nothing to do with the citation text; sending it to the AI as `URL:` context could mislead classification (e.g., a `.edu` Canvas URL boosting score for a blog citation)
- **Impact**: URL context only sent when an `https://` URL is actually found within the selected text
- **Alternatives**: Always send page URL with a "page context" label — decided the noise outweighed any benefit

---

## Challenges and Solutions

**Challenge**: `hasCitationFormat` returned `false` for all styles in testing
- **Solution**: Discovered the original check required both `\(\d{4}\)` AND `.includes(':')`. APA uses commas, not colons. Replaced with three patterns covering parenthetical year (APA/Harvard), semicolon year (Vancouver), comma year (MLA), and period year (Chicago/IEEE)
- **Time Lost**: ~5 minutes (caught by systematic node testing before applying fix)
- **Lesson**: Always test heuristic conditions against real examples before shipping

**Challenge**: DOI false positive — `includes('10.')` matched "Figure 10.", "10.2%", "Chapter 10."
- **Solution**: Replaced with `CITATION_DOI_REGEX` (already defined in the file for DOI extraction)
- **Time Lost**: None — caught during audit
- **Lesson**: String `includes()` on partial patterns always risks false positives; use the regex that's already defined for the purpose

**Challenge**: Bare DOI (`10.1080/09612025.2021.1976647`) was being truncated by numbered-prefix strip regex
- **Solution**: Changed `\d+\.` to `\d+\.\s+` (require whitespace after period); DOIs start with `10.` immediately followed by digits with no space
- **Time Lost**: ~10 minutes (caught in final regression test)
- **Lesson**: Numbered list prefixes (`1. `, `[1] `) always have whitespace after the closing punctuation; bare DOIs never do

---

## Technical Insights

- **Multi-strategy extraction pattern**: When a heuristic needs to work across N incompatible formats, implement a ranked sequence of strategies each with a specificity check, rather than one catch-all regex. Each strategy should have a rejection condition to avoid returning garbage.
- **Citation style taxonomy**: The key axis is year position — APA/Harvard/Chicago-author-date put year in `(YYYY)` after authors; MLA puts year near end; Vancouver puts year after journal name; IEEE puts year at very end. Title position is derivable once year position is known.
- **Academic keyword precision**: Single-word keywords for source type classification are reliably identified only if they're domain-specific (`arxiv`, `pubmed`, `pmid`, `doi:`). Common English words (`press`, `journal`, `proceedings`) need 2+ co-occurrences or an anchor signal (confirmed DOI) before classifying.
- **Testing heuristics**: Run node -e scripts with representative examples from each target category before committing — catches wrong outputs in seconds vs. discovering them in live use.

---

## Next Session

**Status**: Complete
**Next Task**: No outstanding Citation Analyser bugs. General options:
  - Test Citation Analyser live with Ollama qwen3:8b-q4_K_M on real citations from NCAD research papers
  - Continue pre-CWS Tier 2 checklist (privacy policy page, CWS listing assets, CHANGELOG.md, v1.0.0 tag)
  - GAAD launch day sequence (Show HN, Reddit) planning

**Blockers**: None

**WIP Notes**:
- Three temp files in project root (`C꜀tmpjs_refs.txt`, `c꜀tmphtml_ids.txt`, `c꜀tmpjs_referenced.txt`) — untracked, not part of the extension, safe to delete
- Pre-CWS Tier 2 gaps remain (from Session 110): privacy policy page, CWS assets, E2E smoke test, screen reader test, CHANGELOG.md, v1.0.0 tag, GAAD launch sequence

---

**Session Complete**: 2026-05-16
