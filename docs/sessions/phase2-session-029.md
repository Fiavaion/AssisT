# Phase 2 Session 029 - Custom Vocabulary & Word Lists

**Date**: 2025-11-28
**Duration**: ~2 hours
**Phase**: Phase 2.7 - State-of-the-Art STT Enhancement
**Progress**: 94% → 96% (+2%)
**Session Number**: 029

---

## Session Overview

**Goal**: Implement S.5 Custom Vocabulary & Word Lists feature for STT
**Status**: ✅ Complete

---

## Accomplishments

### Features Completed

- [x] S.5: Custom Vocabulary & Word Lists (100% - 7/7 tasks)

### Tasks Completed

- [x] S.5.1: Custom word list storage (IndexedDB via Dexie.js)
- [x] S.5.2: Add word UI in settings panel (popup vocabulary section)
- [x] S.5.3: Import vocabulary from text file (TXT and JSON formats)
- [x] S.5.4: Export vocabulary to text file (JSON export)
- [x] S.5.5: Subject-specific presets (Medical 48, Legal 38, Academic 31, STEM 43 words)
- [x] S.5.6: Auto-learn from corrections (threshold-based learning)
- [x] S.5.7: Phonetic spelling hints (pronunciation guide support)

### Files Created

- `src/engines/stt/vocabulary-manager.js` (~850 lines)
- `tests/unit/stt/vocabulary-manager.test.js` (~410 lines)

### Files Modified

- `src/engines/stt/stt-controller.js` (+155 lines) - Vocabulary integration
- `src/popup/popup.html` (+130 lines) - Vocabulary UI section
- `src/popup/popup.js` (+400 lines) - Vocabulary handlers and modals
- `docs/planning/PHASE2_TASKS.md` - Updated S.5 as complete

**Total**: ~1,945 lines added

### Tests Written

- Unit: 39 tests added for vocabulary manager (100% pass rate)
- Test coverage: Presets, similarity, auto-learning, settings, caching, validation

### Commits

- (Pending) feat(stt): add custom vocabulary with presets and auto-learning (Phase 2.7 S.5)

---

## Technical Implementation

### Vocabulary Manager Architecture

```
VocabularyManager
├── IndexedDB Storage (Dexie.js)
│   ├── vocabulary table (word, phonetic, category, tags, frequency)
│   └── settings table (key-value)
├── Presets (160 words total)
│   ├── Medical (48 words) - adenocarcinoma, chemotherapy, etc.
│   ├── Legal (38 words) - affidavit, habeas corpus, etc.
│   ├── Academic (31 words) - dissertation, methodology, etc.
│   └── STEM (43 words) - algorithm, quantum, etc.
├── Auto-Learning
│   ├── Correction tracking (Map)
│   ├── Threshold-based learning (default: 3 corrections)
│   └── Automatic word addition
├── Import/Export
│   ├── TXT format (word|phonetic per line)
│   └── JSON format (structured with metadata)
└── Cache Management
    ├── In-memory word cache
    ├── 60-second expiry
    └── Invalidation on changes
```

### Popup UI Components

- **Auto-learn toggle**: Enable/disable automatic vocabulary learning
- **Preset chips**: Medical, Legal, Academic, STEM (toggle on/off)
- **Word counts**: Custom words and preset words displayed
- **Add Word modal**: Word + phonetic pronunciation input
- **Manage modal**: View, delete individual words, clear all
- **Import/Export buttons**: File-based vocabulary management

### STT Controller Integration

- `initializeVocabulary()` - Initialize manager on controller start
- `loadVocabularyPreset(preset)` / `unloadVocabularyPreset(preset)`
- `addVocabularyWord(word, phonetic)` / `deleteVocabularyWord(word)`
- `getVocabularyStats()` - Get counts for UI
- `trackVocabularyCorrection(original, corrected)` - Auto-learning hook

---

## Decisions Made

**Decision**: Use Dexie.js for IndexedDB storage

- **Reason**: Already used for citation storage, consistent pattern
- **Impact**: Familiar API, async operations, schema versioning
- **Alternatives**: Raw IndexedDB (more complex), chrome.storage (size limits)

**Decision**: 160 preset words across 4 categories

- **Reason**: Cover common specialized terminology without overwhelming
- **Impact**: Immediate value for medical/legal/academic students
- **Alternatives**: More words (slower), fewer words (less useful)

**Decision**: Auto-learning threshold of 3 corrections

- **Reason**: Balance between noise filtering and learning speed
- **Impact**: Words consistently corrected get added automatically
- **Alternatives**: 1 (too sensitive), 5+ (too slow)

---

## Challenges

**Challenge**: Dexie.js mock complexity for unit tests

- **Solution**: Simplified mock focusing on testable logic (similarity, settings, tracking)
- **Time**: 30 minutes
- **Lesson**: Complex database mocking better suited for integration tests

---

## Technical Insights

- Dexie.js `equalsIgnoreCase()` is a chainable query method, not standard IndexedDB
- Vocabulary caching with TTL significantly reduces IndexedDB queries
- Phonetic hints stored separately allow for future pronunciation guidance
- Preset toggle chips provide instant feedback with CSS state changes
- Auto-learn tracker uses Map for O(1) correction counting

---

## Next Session

**Status**: Complete
**Next Task**: S.7 Neurodivergent STT Profiles (HIGH priority)
**Command**: `npm run build`
**File**: Create `src/engines/stt/stt-profiles.js`

**S.7 Tasks**:

1. ADHD Profile (faster response, minimal distractions, large visual feedback)
2. Dyslexia Profile (phonetic mode, extra pause time, simple commands)
3. Anxiety Profile (calm colors, gentle sounds, forgiving timing)
4. Motor Impairment Profile (longer hold times, voice-only activation)
5. Low Vision Profile (large mic button, high contrast, audio feedback)
6. Autism Profile (predictable behavior, no surprises, literal commands)
7. Profile quick-switch keyboard shortcut

**Blockers**: None

**WIP Notes**:

- Vocabulary manager complete and tested
- STT feature still disabled in content script (dynamic import issue)
- Vocabulary integration ready when STT is re-enabled

---

## Phase 2.7 Progress

**Before Session**: 3/9 features (33%) - S.1 ✓, S.2 ✓, S.6 ✓
**After Session**: 4/9 features (44%) - S.1 ✓, S.2 ✓, S.5 ✓, S.6 ✓

**Remaining Features**:

1. S.3: Smart Auto-Punctuation (MEDIUM)
2. S.4: Confidence Feedback (MEDIUM)
3. S.7: Neurodivergent STT Profiles (HIGH) ← Next
4. S.8: Advanced Recognition Engine (LOW)
5. S.9: STT Testing & Documentation (HIGH)

---

**Session Complete**: 2025-11-28
