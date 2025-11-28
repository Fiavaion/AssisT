# Phase 2 Session 037 - Discovery Quiz Design Decisions & NCAD Research

**Date**: 2025-11-28
**Duration**: ~2 hours
**Phase**: Phase 2 - Feature Planning
**Progress**: Design Complete (planning session - no code)
**Session Number**: 037

---

## Session Overview

**Goal**: Finalize design decisions for the Discovery Quiz feature
**Status**: ✅ Complete (Planning/Research Session)

---

## Accomplishments

### Design Decisions Confirmed

| Question             | Decision                     | Rationale                                                                             |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| **Quiz Location**    | B) Dedicated full tab        | More breathing room, less cramped. Confirmed safe - `chrome.tabs.create` is sandboxed |
| **Discovery Length** | C) Adaptive                  | 6 core questions, with "Tell me more" option for refinement                           |
| **Dysgraphia**       | C) Sub-option under Dyslexia | "Dyslexia (includes writing difficulties)" - shared feature overlap validates this    |
| **Demo Content**     | A) NCAD-specific             | Real curriculum content based on www.ncad.ie research                                 |

### Security Confirmation

Verified that full tab approach (Option B) is secure:

- `chrome.tabs.create` is fully sandboxed in Chrome Extension architecture
- Runs in isolated extension context
- No cross-origin risks
- Standard pattern used by major extensions (Grammarly, Loom, etc.)

### Dysgraphia Logic Validation

Confirmed sub-option approach is sound because:

- Feature overlap: TTS, text spacing, STT all benefit both Dyslexia and Dysgraphia
- AssisT doesn't have Dysgraphia-specific features (no handwriting support)
- Reduces cognitive load on quiz (fewer top-level options)
- Users selecting "includes writing difficulties" get same feature set

### NCAD Brand Research Complete

**Brand Identity (from FeaturePass*002/NCAD_Brand_Identity_Guides*.pdf)**:

- **Tagline**: "Bold and Curious Thinking, Making and Doing"
- **Philosophy**: "Fifth Province" - province of imagination (from Richard Kearney)
- **Colors**: Black/white primary, Orange 2025 (#f36f21), Orange 2024 (#f4911e)
- **Typography**: Spenser typeface family
- **Logo**: Dynamic logo variations for different contexts

**Four Schools**:

1. School of Design
2. School of Education
3. School of Fine Art
4. School of Visual Culture

### NCAD Curriculum Research

**First Year Program Structure**:

- Observation (drawing, visual analysis)
- Materials (physical exploration)
- Research (academic inquiry)
- Processes (technical skills)
- Professional Practice (career preparation)

**Critical Cultures (Visual Culture Theory)**:
Key questions explored:

- What is originality?
- What makes an image real?
- Why do we value handmade objects?
- What is the future of the image?
- What can art do?

**Academic Standards**:

- Harvard referencing style
- Critical writing workshops
- 2,000-3,000 word essays
- Primary source engagement required

### Demo Content Strategy Created

Four content types identified for demo page:

1. **Critical Cultures Essay Brief** (Visual Culture Theory)
   - Question-based prompts about art/design theory
   - Harvard referencing requirement
   - 2,500 word target

2. **First Year Studio Brief** (Materials & Process)
   - Observation/analysis assignment
   - Physical material exploration
   - Documentation requirements

3. **Pathway Experience Brief** (Discipline-specific)
   - Design/Fine Art/Education variants
   - Project-based learning
   - Portfolio preparation

4. **Assessment Criteria Blocks**
   - Research & Conceptual Development (25%)
   - Technical & Material Exploration (25%)
   - Critical Reflection & Analysis (25%)
   - Presentation & Documentation (25%)

---

## Files Modified

| File | Changes                                     |
| ---- | ------------------------------------------- |
| None | Planning/research session - no code changes |

### Research Documents Referenced

- `FeaturePass_002/NCAD_Brand_Identity_Guides_.pdf` (68 pages)
- www.ncad.ie (web search)
- NCAD First Year curriculum information
- NCAD Critical Cultures program details

---

## Technical Insights

### Full Tab Security

Chrome extension `chrome.tabs.create` is sandboxed:

```javascript
// This is safe - runs in isolated extension context
chrome.tabs.create({ url: chrome.runtime.getURL('quiz.html') });
```

### Adaptive Quiz Design Pattern

```
Core Questions (6):
├── Q1: Reading difficulties?
├── Q2: Writing difficulties?
├── Q3: Focus/attention?
├── Q4: Sensory sensitivity?
├── Q5: Organization/planning?
└── Q6: Test anxiety?

Refinement (optional):
└── "Tell me more" → 2-3 follow-up questions per area
```

This balances:

- ADHD users: Prefer shorter paths (6 is manageable)
- Anxiety users: Fewer questions = less overwhelming
- Thoroughness: Optional refinement for those who want it

---

## Next Session

**Status**: Planning Complete
**Next Task**: Implementation of Discovery Quiz feature

**Implementation Phases**:

1. Quiz flow logic (questions, adaptive path)
2. Full tab UI (NCAD brand styling)
3. Demo page content creation
4. Feature recommendation engine
5. Onboarding integration

---

## Context Handoff Summary

```
Discovery Quiz - Ready for Implementation
=========================================

ARCHITECTURE:
- Full tab approach (chrome.tabs.create)
- 6 core questions + optional refinement
- NCAD-branded demo content

BRAND STYLE:
- Black/white primary, Orange 2025 (#f36f21)
- Typeface: Spenser (or web-safe equivalent)
- Tone: "Bold and Curious"

DEMO CONTENT:
1. Critical Cultures essay brief
2. First Year Studio brief
3. Pathway Experience brief
4. Assessment criteria blocks

DYSGRAPHIA:
- Sub-option under Dyslexia
- Label: "Dyslexia (includes writing difficulties)"
```

---

**Session Complete**: 2025-11-28
