# Testing Fixes - Progress Tracker

**Started:** 2026-01-17
**Checkpoint Commit:** 60e93ca (hide highlight menu when Local AI toggle changes)
**Plan File:** [logical-tinkering-sparkle.md](C:\Users\jones.claude\plans\logical-tinkering-sparkle.md)

---

## Overview

Systematic fixes for failed features from testing, broken into phases matching [feature-testing.html](src/pages/testing/feature-testing.html) sections.

**Strategy:** Test after EACH phase before proceeding to catch regressions early.

---

## Progress Summary

| Phase       | Section                     | Status          | Files Modified                                          |
| ----------- | --------------------------- | --------------- | ------------------------------------------------------- |
| **Phase 0** | Revert & Safety Net         | ✅ **COMPLETE** | -                                                       |
| **Phase 1** | Header Controls             | ✅ **COMPLETE** | `popup.js`, `settings-manager.js`, `storage-manager.js` |
| **Phase 2** | Reading Help                | ✅ **COMPLETE** | `tts.js`, `highlightMenu.js`                            |
| **Phase 3** | Writing Help                | ⏸️ PENDING      | -                                                       |
| **Phase 4** | Look Up Words               | ⏸️ PENDING      | -                                                       |
| **Phase 5** | Page Display (⚠️ Stargardt) | ⏸️ PENDING      | -                                                       |
| **Phase 6** | School Tools                | ⏸️ PENDING      | -                                                       |
| **Phase 7** | Local AI & Cloud AI         | ⏸️ PENDING      | -                                                       |
| **Phase 8** | Keyboard Shortcuts          | ⏸️ PENDING      | -                                                       |
| **Phase 9** | Context Menu                | ⏸️ PENDING      | -                                                       |

---

## Phase 0: Revert & Safety Net ✅

**Status:** COMPLETE

**Actions:**

- ✅ Stashed broken changes (Pre-revert stash)
- ✅ Reset to commit 60e93ca
- ✅ Created checkpoint branch `testing-fixes-checkpoint`
- ✅ Verified baseline build succeeds

**Result:** Clean baseline established

---

## Phase 1: Header Controls ✅

**Status:** COMPLETE

**Scope:**

- Reset Button
- Help Button
- Settings Button
- Organize Button
- Discovery Quiz
- Organize - Drag/Drop
- Organize - Visibility
- Organize - Persistence

### ✅ Completed Fixes

#### 1.1 Reset Button Fix

**Files Modified:**

- [src/popup/popup.js](src/popup/popup.js#L1705-L1722)
- [src/core/storage/settings-manager.js](src/core/storage/settings-manager.js#L34-L41)
- [src/utils/storage-manager.js](src/utils/storage-manager.js#L36-L47)

**Issues Fixed:**

1. Reset button only reset TTS settings (ignored all others)
2. OCR stayed enabled after reset
3. Two different DEFAULT_SETTINGS files (one missing OCR/annotations)

**Solution:**

1. Changed `resetToDefaults()` to use `RESET_SETTINGS` message type
2. Set `ocr.enabled: false` in both DEFAULT_SETTINGS files
3. Set `annotations.enabled: false` in both DEFAULT_SETTINGS files
4. Added proper error handling

**Testing:**

- ✅ Enable multiple features (TTS, OCR, STT, Reading Mode, etc.)
- ✅ Click Reset button
- ✅ Confirm ALL toggles return to OFF state (including OCR)

---

#### 1.2 Organize Mode Pencil Tool Fix

**File Modified:**

- [src/popup/popup.js](src/popup/popup.js#L291-L320)

**Issue Fixed:**

- `editSectionTitle()` failed when `.accordion-title-text` span didn't exist
- Text was being appended instead of replaced

**Solution:**

1. Extract title text by removing icon emoji from full text content
2. Create `.accordion-title-text` span if missing
3. Restructure DOM to have clean span wrapper
4. Properly replace text nodes

**Testing:**

- ✅ Enter organize mode
- ✅ Click pencil icon on any section
- ✅ Type new name (e.g., "My Custom Reading")
- ✅ Verify name replaces original (not appends)
- ✅ Exit and re-enter organize mode
- ✅ Verify custom name persists

---

## Phase 2: Reading Help ✅

**Status:** COMPLETE

**Scope:**

- TTS Toggle, Voice, Speed, Pitch, Volume
- Sync Highlighting, Highlight Color/Opacity
- Word-by-Word highlighting
- Reading Mode Toggle/Exit
- Dyslexia Mode & Intensity
- OCR Toggle, Auto Reading, Language, Duration, Auto TTS, Confidence
- Highlight Menu (Read Aloud, Dictionary, Translate, Annotate, Copy)

### ✅ Completed Fixes

#### 2.1 Word-by-Word Highlighting Speed Fix

**Files Modified:**

- [src/content/features/tts.js](src/content/features/tts.js#L89-L136)

**Issues Fixed:**

1. Used fixed 150 WPM estimation instead of syncing with actual TTS rate
2. Highlighting would drift out of sync with speech at different speeds

**Solution:**

1. Replaced `setInterval` estimation approach with `SpeechSynthesisUtterance.onboundary` events
2. Removed `tts_wordHighlightInterval` variable (no longer needed)
3. Word highlighting now perfectly synchronized with TTS engine's actual word boundaries
4. Works correctly at any speech rate (0.5x - 2.0x)

**Testing:**

- ✅ Enable TTS and Word-by-Word highlighting
- ✅ Read text at different speeds (slow 0.5x, normal 1.0x, fast 2.0x)
- ✅ Verify highlighting stays perfectly synchronized with speech

---

#### 2.2 Remove HM Read Aloud

**File Modified:**

- [src/features/highlightMenu/highlightMenu.js](src/features/highlightMenu/highlightMenu.js#L31-L48)

**Actions:**

1. Removed `showTTS: true` from settings (line 34)
2. Removed TTS button creation code (lines 293-300)
3. Removed `highlightMenu_handleTTS` function (lines 679-702)

**Result:** TTS button no longer appears in highlight menu

---

#### 2.3 Remove HM Copy

**File Modified:**

- [src/features/highlightMenu/highlightMenu.js](src/features/highlightMenu/highlightMenu.js#L31-L48)

**Actions:**

1. Removed `showCopy: true` from settings (line 38)
2. Removed Copy button creation code (lines 329-336)
3. Removed `highlightMenu_handleCopy` function (lines 765-784)

**Result:** Copy button no longer appears in highlight menu

**Testing:**

- ✅ Select text on page
- ✅ Verify highlight menu appears with Dictionary, Translate, Annotate buttons only
- ✅ Verify TTS and Copy buttons are gone

---

## Phase 3: Writing Help 🔄

**Status:** IN PROGRESS

**Scope:**

- STT Toggle
- Microphone Button
- Voice Input Test
- STT Pause/Resume
- Auto-Punctuation
- Voice Commands
- Annotations Toggle/Create
- Citations Toggle
- Text Simplification

### ✅ Completed Fixes

#### 3.1 Microphone Button Visibility Fix

**Files Modified:**

- [manifest.json](manifest.json#L75)
- [src/features/stt/stt.js](src/features/stt/stt.js) (added debug logging)

**Issue Fixed:**
Microphone button failed to load because `stt-controller.js` imports other modules that weren't in web_accessible_resources:

- `command-parser.js`
- `vocabulary-manager.js`
- `stt-profiles.js`
- `auto-punctuation.js`
- `confidence-feedback.js`

**Solution:**
Changed manifest.json line 75 from:

```json
"src/engines/stt/stt-controller.js",
```

to:

```json
"src/engines/stt/*.js",
```

This allows all STT engine files to be dynamically imported.

**Debug Logging Added:**
Added comprehensive console logging to [src/features/stt/stt.js](src/features/stt/stt.js):

- Module loading status
- Initialization steps
- Field listener setup
- Focus event debugging

**Testing:**

1. Reload extension in Chrome
2. Enable STT toggle in popup
3. Console should show: `[STT] Modules loaded successfully!`
4. Focus any text field
5. Microphone button should appear

---

## Phase 4: Look Up Words ⏸️

**Status:** PENDING

**Scope:**

- Dictionary Toggle/Test
- Translation Toggle/Test
- Full-Page Translation

### 📋 Planned Fixes

#### 4.1 Remove Dictionary/Translation Toggles

**Files to Modify:**

- `src/popup/popup.html` (Look Up Words section, lines ~1332-1604)
- `src/popup/popup.js` (Event listeners)

**Action:** Remove standalone toggles from popup, **keep quick actions menu versions**

**Critical:** Test after removal - select text, verify Dictionary and Translate still work in quick actions menu

---

## Phase 5: Page Display (⚠️ CRITICAL - Stargardt) ⏸️

**Status:** PENDING

**Scope:**

- Quiet Mode
- Text Customization (Font Family, Line Spacing, Letter Spacing)
- Reading Guide
- Focus Mode
- Screen Overlay
- Dark Mode
- Reduced Motion
- Pomodoro Timer
- **Stargardt Mode** ⚠️

### 📋 Planned Fixes

#### 5.1 Add Feature Labels (SAFE APPROACH)

**Files to Modify:**

- `src/popup/popup.html`
- `src/popup/popup.css`

**⚠️ CRITICAL - Stargardt Mode:**

- **MUST AVOID:** `pointer-events: none` CSS (breaks ALL popup interactions)
- **SAFE APPROACH:** Use visual-only CSS (opacity, color, badges)
- Mark as "FUTURE FEATURE" with badge
- Keep event handlers functional

**Changes:**

1. Stargardt → Add `.future-badge` (visual only, NO pointer-events)
2. OCR Language → Add `EXPERIMENTAL` badge
3. Canvas/Moodle/Classroom → Change BETA to ALPHA
4. Citations → Add ALPHA + caution note

**Success Criteria:**

- ✅ Popup interactions MUST NOT break
- ✅ ALL toggles, sliders, buttons remain clickable
- ✅ Stargardt shows future badge WITHOUT blocking events

---

## Phase 6: School Tools ⏸️

**Status:** PENDING

**Scope:**

- Canvas Toggle/Test
- Moodle Toggle
- Google Classroom Toggle

### 📋 Planned Fixes

#### 6.1 Add Feature Labels

**Files to Modify:**

- `src/popup/popup.html` (lines 3028, 3204, 3302, 2933)
- `src/popup/popup.css`

**Changes:**

- Canvas LMS → ALPHA badge
- Moodle LMS → ALPHA badge
- Google Classroom → ALPHA badge
- Citations → ALPHA badge + caution note

---

## Phase 7: Local AI & Cloud AI ⏸️

**Status:** PENDING

**Scope:**

- Local AI Master toggle
- AI Summarization
- AI Text Simplification
- Socratic Tutor
- Assignment Breakdown
- Cloud AI Master toggle
- API Key Setup
- Cloud AI Models

### 📋 Planned Fixes

#### 7.1 Enable llmEnabled Flag

**Files to Modify:**

- `src/features/highlightMenu/highlightMenu.js` (line 50)
- `src/popup/popup.html` (Local AI section)
- `src/popup/popup.js`

**Action:** Add toggle to enable AI features in quick actions menu

---

#### 7.2 Local vs Cloud AI Toggle

**Files to Modify:**

- `src/popup/popup.html`
- `src/popup/popup.js`

**Action:** Add radio buttons for Local AI (Ollama) vs Cloud AI

---

#### 7.3 Advanced Settings Overhaul

**Status:** DEFERRED (too complex for current phase)

**Reason:** Major UI change (new AI tab, API key manager, etc.)

---

## Phase 8: Keyboard Shortcuts ⏸️

**Status:** PENDING

**Scope:**

- Ctrl+Shift+R (Reading Mode)
- Ctrl+Shift+T (TTS)
- Ctrl+Shift+S (STT)
- Ctrl+Shift+F (Focus Mode)
- Ctrl+Shift+D (Dark Mode)
- Ctrl+Shift+W (Text Stats)
- ESC (Exit Reading Mode)

### 📋 Planned Fixes

#### 8.1 Remove Default Shortcuts

**File to Modify:**

- `src/utils/keyboard-shortcuts.js` (lines 34-56)

**Action:** Change all default shortcuts to empty string

---

#### 8.2 Add Chrome Conflict UI

**File to Modify:**

- `src/popup/popup.js` (keyboard shortcuts recording overlay)

**Action:** Add conflict warning when user tries to set Chrome reserved shortcuts

---

## Phase 9: Context Menu ⏸️

**Status:** PENDING

**Scope:**

- Read Selected
- Translate Selected
- Simplify Selected
- Dictionary Lookup

### 📋 Planned Fixes

**Verification Only** - No changes needed, just verify features work

---

## Deferred Items (Post-Phase 9)

From [00_defered.md](00_defered.md):

1. **Speech-to-Text Complete Feature Testing** (High Priority)
2. **Quiet Mode Feature Testing** (Medium Priority)
3. **Reduced Motion Feature Testing** (Medium Priority)
4. **Auto Play Blocking Testing** (Low Priority)
5. **Reading Progress Feature Testing** (Low Priority)
6. **OCR Accuracy Improvements** (Low Priority)
7. **Auto TTS After OCR Enhancement** (Low Priority)

---

## Rollback Plan

If ANY phase breaks functionality:

```bash
# Return to checkpoint
git checkout testing-fixes-checkpoint

# Or revert specific commits
git revert <commit-hash>

# Or reset to checkpoint
git reset --hard testing-fixes-checkpoint
```

---

## Success Criteria (Per Phase)

Each phase MUST pass before proceeding:

✅ Build succeeds (`npm run build`)
✅ Extension loads in Chrome
✅ Popup opens without errors
✅ All interactions work (toggles, sliders, buttons)
✅ Phase-specific features work correctly
✅ No console errors

**ABORT CRITERIA:**
❌ Popup doesn't open
❌ Interactions freeze/don't respond
❌ Console shows critical errors
❌ Extension crashes

---

## Notes

- **Critical Lesson:** Never use `pointer-events: none` on popup sections (breaks all interactions)
- **Two DEFAULT_SETTINGS files:** Both must be kept in sync for reset to work
  - `src/core/storage/settings-manager.js`
  - `src/utils/storage-manager.js`
- **Test after EACH phase** - systematic approach prevents cascading regressions

---

_Last Updated: 2026-01-17 - Phase 1 Complete_
