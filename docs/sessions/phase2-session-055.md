# Phase 2 Session 055 - Assignment Breakdown Assistant

**Date**: 2025-12-05
**Duration**: ~30 minutes
**Phase**: Phase 2 Extension - Local LLM Integration
**Progress**: Layer 2 - Third AI Feature
**Session Number**: 055

---

## Session Overview

**Goal**: Implement the third AI-powered feature - Assignment Breakdown Assistant - using the LLM infrastructure built in Session 052.

**Status**: ✅ Complete

---

## Accomplishments

### Features Completed

- [x] Assignment Breakdown Assistant feature module
- [x] AI-powered assignment analysis via LLM bridge
- [x] Rule-based fallback when LLM unavailable
- [x] Interactive checklist with checkable items
- [x] Time estimation for each task
- [x] Key requirements extraction
- [x] Deadline and word count detection
- [x] Floating breakdown panel with draggable UI
- [x] Integration with highlight menu (✅ Breakdown button)
- [x] Copy as markdown checklist
- [x] TTS reading of breakdown

### Tasks Completed

- [x] Create `src/features/assignmentBreakdown/assignmentBreakdown.js` (~800 lines)
- [x] Add Breakdown button to highlight menu
- [x] Add `highlightMenu_handleBreakdown()` function
- [x] Add `showBreakdown` setting to highlight menu
- [x] Import assignmentBreakdown module in content-simple.js
- [x] Build both standard and LLM versions successfully

### Files Created

| File                                                      | Lines | Purpose                                                                  |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `src/features/assignmentBreakdown/assignmentBreakdown.js` | ~800  | Complete assignment breakdown feature with UI, LLM integration, fallback |

### Files Modified

| File                                          | Changes                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `src/features/highlightMenu/highlightMenu.js` | Added `showBreakdown` setting, ✅ button, `highlightMenu_handleBreakdown()` |
| `src/content/content-simple.js`               | Added import for assignmentBreakdown module                                 |
| `docs/planning/CURRENT_STATUS.md`             | Updated with session 055 info                                               |

---

## Feature Details

### Assignment Breakdown Panel

The breakdown panel provides:

1. **Header section**:
   - Orange/red gradient header
   - Close button (×)
   - Draggable via header

2. **Summary section**:
   - Assignment title
   - One-sentence summary
   - Deadline (if detected)
   - Word count (if detected)
   - AI or Basic badge

3. **Checklist section**:
   - Interactive checkboxes
   - Step number and task description
   - Time estimate for each step
   - Optional tip for each step
   - Completion tracking (strikes through completed items)

4. **Requirements section**:
   - Bulleted list of key requirements
   - Extracted from assignment text

5. **Study tips section**:
   - General advice for approaching the assignment
   - Highlighted box with orange border

6. **Action buttons**:
   - 📋 Copy List - Export as markdown checklist
   - 🔊 Read - TTS reading of breakdown
   - 🔄 Regenerate - Generate new analysis

### LLM Integration

- Uses `chrome.runtime.sendMessage` to communicate with service worker
- Service worker relays to Ollama at localhost:11434
- Returns structured JSON with tasks, requirements, tips
- Lower temperature (0.3) for consistent output
- Graceful fallback to rule-based analysis

### Fallback Analysis

When Ollama is not available, uses rule-based approach:

1. **Task Extraction**:
   - Keyword-based detection (write, create, analyze, research, etc.)
   - List item parsing (numbered, bulleted)
   - Paragraph splitting for simple assignments

2. **Requirement Detection**:
   - Keywords: must, should, required, minimum, include
   - Format/citation requirements
   - Word/page limits

3. **Deadline Extraction**:
   - Pattern matching for dates
   - "Due by", "deadline", "submit by" patterns

4. **Word Count Extraction**:
   - Range patterns (500-1000 words)
   - Minimum/maximum patterns

5. **Time Estimation**:
   - Research tasks: 30-60 minutes
   - Writing tasks: 1-2 hours
   - Review tasks: 20-40 minutes
   - Planning tasks: 15-30 minutes

---

## Architecture

```
User selects assignment text
      ↓
Highlight Menu appears with ✅ button
      ↓
User clicks Break Down Assignment
      ↓
window.assistFeatures.assignmentBreakdown.start(text)
      ↓
breakdown_show() → Creates floating panel
      ↓
breakdown_analyze() → Checks LLM availability
      ↓
┌─────────────┬────────────────────┐
│ LLM Available │ LLM Not Available │
├─────────────┼────────────────────┤
│ AI analysis │ Rule-based         │
│ via Ollama  │ (fallback)         │
│ JSON output │ keyword analysis   │
└─────────────┴────────────────────┘
      ↓
breakdown_renderResult() → Creates checklist UI
      ↓
User can check off completed items
```

---

## Decisions Made

### Decision 1: Interactive Checklist

- **Reason**: Students benefit from visual progress tracking
- **Impact**: Checked items get strike-through and dimmed
- **Implementation**: Set-based tracking, re-renders on toggle

### Decision 2: JSON Output from LLM

- **Reason**: Structured data easier to render than free text
- **Impact**: Consistent UI layout regardless of assignment type
- **Fallback**: If JSON parse fails, wraps raw response in basic structure

### Decision 3: ✅ Icon for Breakdown Button

- **Reason**: Represents checklist/task completion
- **Alternative Rejected**: 📋 (already used for Copy)

### Decision 4: Markdown Export

- **Reason**: Useful for pasting into note-taking apps
- **Format**: `[ ]` checkbox syntax, headings, bullet points

---

## Technical Insights

1. **LLM JSON Output**: Explicit instruction "Respond ONLY with valid JSON" improves reliability
2. **JSON Cleaning**: Must strip markdown code blocks from LLM response
3. **Keyword Analysis**: Task indicators list needs to cover common assignment verbs
4. **Pattern Matching**: Date extraction requires multiple regex patterns for different formats
5. **Time Estimation**: Heuristic-based on task type keywords

---

## Next Session

**Status**: Layer 2 - Third Feature Complete
**Next Task**: Cognitive Profile Engine (fourth AI feature)

**Immediate Next Steps**:

1. ✅ Smart Summarization feature - DONE
2. ✅ Semantic Text Simplification - DONE
3. ✅ Assignment Breakdown Assistant - DONE
4. Implement Cognitive Profile Engine (builds learning profile over time)
5. Or implement Socratic Tutoring Mode (interactive Q&A)

**Command to Test**: Load `AssistLLM/` in Chrome, select assignment text, click ✅ button

**WIP Notes**:

- Assignment Breakdown works with or without Ollama
- AI badge appears when using local LLM
- Fallback badge appears when using rule-based analysis
- Checklist items are interactive and track completion

---

## Build Scripts Reference

```bash
# Standard build (AssistV2a/)
npm run build

# LLM build (AssistLLM/)
npm run build:llm

# Both versions
npm run build:all
```

---

## Session Complete

**Time**: 2025-12-05
**Lines Added**: ~800 (assignmentBreakdown module)
**Lines Modified**: ~40 (highlight menu, content-simple)
**Files Created**: 1
**Files Modified**: 3 (including docs)
