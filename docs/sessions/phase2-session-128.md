# Phase 2 Session 128 - NLnet Proposal Full Readiness Pass

**Date**: 2026-05-25
**Duration**: ~2 hours
**Phase**: Phase 2 - Grant & Launch
**Progress**: N/A (funding/docs work, no code changes)

---

## Session Overview

**Goal**: Full critique of the NLnet NGI0 Commons Fund proposal, identify weaknesses, and bring the proposal and supporting dossier to submission-ready state before the 1 June 2026 12:00 CEST deadline.

**Status**: ✅ Complete

---

## Accomplishments

### Work Completed

- Full honest critique of the NLnet proposal across all dimensions (technical, impact, commons, dissemination)
- Full pass on the proposal draft — 10 targeted edits covering factual errors and content gaps
- Rewrite of COI declaration (file 01) to match post-April-2026 engineering-only scope
- Assessed whether Fiavaionbook LTI 1.3 integration plan had value for the proposal (answer: yes, but only as API design rationale for `@fiavaion/lms-adapter`, not as a deliverable)

### Files Modified

- `docs/funding/NLnet/nlnet-proposal-draft.md` — 10 substantive changes (see Decisions Made)
- `docs/funding/NLnet/01-coi-declaration-to-line-manager-and-hr.md` — full rewrite for post-pivot scope

---

## Decisions Made

**Decision 1: Version numbers updated throughout**
- **Reason**: Proposal still said "v0.1.2 soft-launched" — the actual version is v0.9.2, publicly launched on GAAD 21 May 2026. A reviewer checking the CWS would see the discrepancy immediately.
- **Impact**: Fixes a credibility-damaging inconsistency.

**Decision 2: Test count corrected**
- `979` → `997` (actual count after session 110 fixes)

**Decision 3: "47 engineering days" typo fixed**
- Budget table totals 51 days; rate justification said 47. Fixed to 51.

**Decision 4: Firefox budget line now explicit about de-scope**
- Added "*v0.1-firefox* de-scoped release" qualifier with specific items (capability-detection module, Chrome Prompt API + STT disabled with honest UX copy, Ollama CORS allow-list for `moz-extension://`). This matches what the port analysis document recommended and prevents a reviewer seeing a contradiction between §5 and the port analysis.

**Decision 5: VPAT reference corrected**
- Now references the actual repo file path (`docs/quality/VPAT-2.5-AssisT-v0.1.2.md`) and adds fiavaion.com/accessibility URL with "will be live before review" qualifier. VPAT must be published at that URL before submission.

**Decision 6: Statistics + urgency paragraph added to §3**
- AHEAD data (~14-15% Irish HE students with disclosed disability, ~35,000 students), Eurostudent VII (~1 in 5 European HE students affected). Cost barrier evidence (€100–€1,400/user/year for incumbents).
- Urgency argument: 51 focused days cannot be done alongside full-time employment; Erasmus+ KA220-HED 2027 consortium must assemble October 2026, requiring NLnet funding to land by August–September 2026.
- `[INSERT: CWS install count]` placeholder added in two places — user must fill this from CWS Developer Console before submission.

**Decision 7: §4 updated with GAAD launch and delivery evidence**
- Added GAAD 2026 launch date, CWS extension ID, install count placeholder, CHANGELOG URL. Updated test count. Added note about 6 public releases from v0.1.0 to v0.9.2.

**Decision 8: §7.4 — LTI 1.3 forward-compatibility paragraph added**
- Rationale: Fiavaionbook LTI 1.3 planning document (D:\AIprojects\Fiavaionbook\docs\planning\canvas-lti-integration-plan.md) was considered as a proposal addition. Decision: not a deliverable, but relevant as evidence that the `@fiavaion/lms-adapter` API is designed with LTI context as a forward-compatible extension point — `courseContext` and `userIdentity` populated via DOM in Phase 1 but API surface accommodates LTI JWT payload in future without breaking consumer code.

**Decision 9: §7.5 upstream contributions fully rewritten**
- Old version: vague ("at least two committed contributions"). New version: each contribution has a specific PR description, the ecosystem problem it solves, a target month, and explicit "useful regardless of AssisT" framing.
- Ollama #2308/#3016: CORS/origin-allowlist PR by Month 4
- Ollama: model-loading error surface PR by Month 6
- WebLLM: MV3 service-worker lifecycle test report + mitigation by Month 8
- webextension-polyfill: cross-browser AI routing documentation PR by Month 9
- W3C WebML/WebNN CG: formal participation ongoing Month 3–12

**Decision 10: §8 fully restructured**
- New opening: infrastructure multiplier argument as thesis ("the next developer inherits solved infrastructure")
- Output 1 (AssisT v1.0): added explicit "v1.0 is gated specifically on the Firefox port and library extraction" to pre-empt "why do you need €30k to go from 0.9.2 to 1.0?"
- Output 2 (lms-adapter): added LTI forward-compatibility note
- Output 3 (local-ai-router): added "currently the only open-source routing library that treats Ollama, WebLLM, Chrome Prompt API, and cloud providers as first-class peers"
- New adoption pathway section: institutional channel (AHEAD/AISHE/ENGS/EDF), developer channel (upstream contribution threads), library-as-adoption-mechanism argument
- Dissemination expanded from 4 bullets to 7: added W3C WebExtensions CG, W3C WebML/WebNN CG, AHEAD/AISHE channels, Ollama/WebLLM community forums, Mozilla Add-ons editorial

**Decision 11: §9 NGI alignment strengthened with evidence**
- Each of the 4 NGI priority bullets now backed with statistics or verifiable claims, not assertions.

**Decision 12: COI declaration (file 01) fully rewritten**
- Old version described pre-April-2026 scope: €35,000, comparative research, student participants, Critique Commons, partner HEI. None of this is in the current proposal.
- New version: €30,000, engineering-only, no student participants, no ethics review, NCAD's role minimal (name on record, IP carve-out, permission to approach colleagues).
- Follow-on pathway (Erasmus+) flagged transparently but clearly separated.
- Shorter, cleaner, less alarming for a line manager to receive.

---

## Remaining Pre-Submission Actions (not completed this session)

1. **`[INSERT: CWS install count]`** — fill in two places in `nlnet-proposal-draft.md` from CWS Developer Console.
2. **Publish VPAT page** at `fiavaion.com/products/assist/accessibility` before submission.
3. **Send COI email** (`01-coi-declaration-to-line-manager-and-hr.md`) to line manager + HR + Dr. Siun Hanrahan.
4. **Send Origin8 email** (`04-email-research-office-origin8.md`) to Derek McGarry — this is ready and does not need changes.
5. **Send Access Office email** (`03-email-access-disability-service.md`) to Finola McTernan — review before sending.
6. **Final personal editing pass** on the full proposal for voice and wordiness.
7. **Verify AHEAD statistics** cited in §3 against current AHEAD annual report (the figures used are directionally correct; confirm exact percentages).
8. **Letter of Support** — unlikely to materialise before June 1 given timeline; chase but do not let it block submission.
9. **Submit** via https://nlnet.nl/propose/ before 1 June 2026, 12:00 CEST.

---

## Technical Insights

- NLnet NGI0 Commons Fund scores 30% technical / 40% impact+relevance / 30% cost-effectiveness. The proposal was previously strongest on technical and cost dimensions. This session focused on closing the impact gap.
- The "infrastructure multiplier" framing (libraries > product) is the correct frame for a Commons Fund application. Leading with the product undersells the commons contribution.
- Upstream contribution specificity matters: named GitHub issue numbers + specific PR descriptions + target months = credible; "at least X contributions" = not credible.
- LTI 1.3 integration from another Fiavaion project (Fiavaionbook) is relevant to the lms-adapter API design story but not as a deliverable. The distinction: LTI is an auth/SSO protocol (web app ↔ Canvas); lms-adapter is DOM injection (content script ↔ Canvas page). Different surfaces, same underlying LMS data model.
- The COI declaration is genuinely simpler post-pivot. No research = no student participants = no institutional process = a much shorter, less alarming declaration.

---

## Handoff Context for Next Session

**Status**: Proposal docs updated and ready. Submission on 1 June 2026.

**Next tasks** (not code — admin/submission):
1. Fill `[INSERT: CWS install count]` in proposal
2. Publish VPAT page on fiavaion.com
3. Send COI + Origin8 + Access Office emails
4. Final voice/wordiness editing pass on proposal
5. Submit via nlnet.nl/propose/

**User indicated "a few fixes" to work on next** — likely code fixes in the AssisT extension (unrelated to NLnet docs).
