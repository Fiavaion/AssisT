# AssisT Extension - Manual Testing Guide

**Version:** Sprint 9 (Dyslexia Mode Complete)
**Last Updated:** 2025-10-12
**Target Audience:** QA Testers, Manual Testers, Beta Users

---

## 📋 Pre-Testing Setup

### 1. Prerequisites
- ✅ Chrome browser installed (latest version)
- ✅ AssisT extension loaded (see SETUP.md)
- ✅ Test on various websites (Wikipedia, Canvas LMS, news sites)
- ✅ Microphone permission granted (for STT testing)
- ✅ Audio working (for TTS testing)

### 2. Test Environment
- **Browser:** Google Chrome (latest)
- **OS:** Windows 10/11, macOS 10.15+, or Linux
- **Screen Resolution:** 1920x1080 recommended
- **Audio:** Speakers or headphones required
- **Microphone:** Required for STT features

### 3. Test Data
Use these websites for consistent testing:
- **Long-form text:** https://en.wikipedia.org/wiki/Neurodiversity
- **Canvas LMS:** Any Canvas course with quizzes (if available)
- **News articles:** https://www.bbc.com/news
- **Forms:** https://www.google.com/forms (for STT testing)

---

## 🧪 Test Suite 1: Core TTS Functionality

### TC-TTS-001: Basic Text-to-Speech

**Objective:** Verify TTS reads page content aloud

**Steps:**
1. Navigate to Wikipedia article: https://en.wikipedia.org/wiki/Accessibility
2. Click AssisT extension icon to open popup
3. Verify "Enable TTS" toggle is ON (blue/green)
4. Click **Play** button (▶️)

**Expected Results:**
- ✅ TTS begins reading page content immediately
- ✅ Audio is clear and understandable
- ✅ Play button changes to Pause button (⏸️)
- ✅ No stuttering or delays

**Pass/Fail:** ______

---

### TC-TTS-002: Pause and Resume

**Objective:** Verify TTS can be paused and resumed

**Steps:**
1. With TTS playing (from TC-TTS-001)
2. Click **Pause** button (⏸️)
3. Wait 3 seconds
4. Click **Play** button (▶️) again

**Expected Results:**
- ✅ TTS pauses immediately when Pause clicked
- ✅ Audio stops cleanly (no cut-off words)
- ✅ TTS resumes from same position when Play clicked
- ✅ Continues reading where it left off

**Pass/Fail:** ______

---

### TC-TTS-003: Stop and Restart

**Objective:** Verify TTS can be stopped completely

**Steps:**
1. With TTS playing
2. Click **Stop** button (⏹️) if available, or reload popup
3. Click **Play** button (▶️) again

**Expected Results:**
- ✅ TTS stops completely
- ✅ Next play starts from beginning of content
- ✅ No audio artifacts or errors

**Pass/Fail:** ______

---

### TC-TTS-004: Speed Adjustment

**Objective:** Verify TTS speed can be changed

**Steps:**
1. Open popup
2. Find "Speed" slider (should show 1.0x by default)
3. Drag slider to **0.5x** (slow)
4. Click Play and listen for 5 seconds
5. Stop TTS
6. Drag slider to **2.0x** (fast)
7. Click Play and listen for 5 seconds

**Expected Results:**
- ✅ At 0.5x: Speech is noticeably slower
- ✅ At 2.0x: Speech is noticeably faster
- ✅ Speech remains clear at all speeds
- ✅ Speed value updates in UI

**Pass/Fail:** ______

---

### TC-TTS-005: Voice Selection

**Objective:** Verify different voices can be selected

**Steps:**
1. Open popup
2. Find "Voice" dropdown
3. Note current voice (e.g., "Google US English")
4. Click dropdown to open voice list
5. Select a different voice (e.g., "Google UK English Female")
6. Click Play button

**Expected Results:**
- ✅ Dropdown shows all available system voices
- ✅ At least 3-5 voices available
- ✅ Selected voice is used for speech
- ✅ Voice change is noticeable

**Pass/Fail:** ______

---

### TC-TTS-006: Pitch and Volume

**Objective:** Verify pitch and volume controls work

**Steps:**
1. Open popup
2. Set Pitch to **0.5** (low)
3. Play TTS for 5 seconds, then stop
4. Set Pitch to **2.0** (high)
5. Play TTS for 5 seconds, then stop
6. Set Volume to **0.3** (quiet)
7. Play TTS for 5 seconds, then stop
8. Set Volume to **1.0** (loud)
9. Play TTS for 5 seconds

**Expected Results:**
- ✅ Low pitch sounds noticeably deeper
- ✅ High pitch sounds noticeably higher
- ✅ Low volume is quieter
- ✅ High volume is louder
- ✅ All adjustments work smoothly

**Pass/Fail:** ______

---

### TC-TTS-007: Word-by-Word Highlighting

**Objective:** Verify synchronized highlighting works

**Steps:**
1. Open popup
2. Enable "Highlight Text" toggle
3. Navigate to a page with clear paragraphs
4. Click Play button
5. Watch the page content as TTS reads

**Expected Results:**
- ✅ Current word being read is highlighted (yellow background)
- ✅ Highlight moves smoothly word-by-word
- ✅ Highlight matches spoken words
- ✅ Highlight clears when TTS stops

**Pass/Fail:** ______

---

## 🧪 Test Suite 2: Text Customization

### TC-TEXT-001: Font Size Adjustment

**Objective:** Verify font size can be changed

**Steps:**
1. Navigate to any article
2. Open popup
3. Expand "Text Customization" section (if collapsed)
4. Adjust "Font Size" slider to **22px**
5. Check page content

**Expected Results:**
- ✅ Text on page becomes noticeably larger
- ✅ Change applies immediately
- ✅ Layout remains readable (no overlaps)

**Pass/Fail:** ______

---

### TC-TEXT-002: Line Height and Spacing

**Objective:** Verify line height and letter spacing work

**Steps:**
1. Open popup → Text Customization
2. Set "Line Height" to **2.0**
3. Check page - lines should be more spaced
4. Set "Letter Spacing" to **2px**
5. Check page - letters should be more spaced

**Expected Results:**
- ✅ Line height increases vertical spacing
- ✅ Letter spacing increases horizontal spacing
- ✅ Text remains readable

**Pass/Fail:** ______

---

### TC-TEXT-003: Font Family Change

**Objective:** Verify font family can be changed

**Steps:**
1. Open popup → Text Customization
2. Select "OpenDyslexic" from Font Family dropdown
3. Check page content
4. Select "Comic Sans MS"
5. Check page content

**Expected Results:**
- ✅ Font changes to OpenDyslexic (unique style)
- ✅ Font changes to Comic Sans MS
- ✅ All text on page updates
- ✅ Font remains readable

**Pass/Fail:** ______

---

## 🧪 Test Suite 3: Reading Assistance Features

### TC-GUIDE-001: Reading Guide Basic Function

**Objective:** Verify reading guide appears and follows cursor

**Steps:**
1. Open popup
2. Enable "Reading Guide" toggle
3. Move mouse cursor over page content slowly
4. Observe horizontal guide bar

**Expected Results:**
- ✅ Horizontal colored bar appears near cursor
- ✅ Guide follows cursor vertically
- ✅ Guide is semi-transparent
- ✅ Guide helps focus on current line

**Pass/Fail:** ______

---

### TC-GUIDE-002: Reading Guide Customization

**Objective:** Verify reading guide color and opacity can be changed

**Steps:**
1. Open popup → Reading Guide
2. Change color to **red** (#FF0000)
3. Check page - guide should be red
4. Change opacity to **0.3**
5. Check page - guide should be more transparent

**Expected Results:**
- ✅ Guide color changes correctly
- ✅ Guide opacity changes correctly
- ✅ Guide remains functional

**Pass/Fail:** ______

---

### TC-FOCUS-001: Focus Mode Activation

**Objective:** Verify focus mode dims surrounding content

**Steps:**
1. Navigate to a page with multiple paragraphs
2. Open popup
3. Enable "Focus Mode" toggle
4. Hover over a paragraph

**Expected Results:**
- ✅ All content dims except hovered area
- ✅ Dimmed areas are clearly darker
- ✅ Hovered area remains full brightness
- ✅ Focus area updates as you move cursor

**Pass/Fail:** ______

---

### TC-FOCUS-002: Focus Mode Intensity

**Objective:** Verify focus mode intensity can be adjusted

**Steps:**
1. Open popup → Focus Mode
2. Set "Dim Intensity" to **0.3** (light dim)
3. Hover over content - note darkness
4. Set "Dim Intensity" to **0.9** (heavy dim)
5. Hover over content - note darkness

**Expected Results:**
- ✅ Low intensity: subtle darkening
- ✅ High intensity: heavy darkening
- ✅ Focused area always clear
- ✅ Transition is smooth

**Pass/Fail:** ______

---

## 🧪 Test Suite 4: Speech-to-Text (STT)

### TC-STT-001: Basic Dictation

**Objective:** Verify STT can transcribe speech into text fields

**Steps:**
1. Navigate to any page with a text input (e.g., Google Forms, search bar)
2. Click into the text field
3. Open AssisT popup
4. Expand "Speech-to-Text" section
5. Click **Microphone** button (🎤)
6. Allow microphone permission if prompted
7. Speak clearly: "Hello world period"
8. Wait for transcription

**Expected Results:**
- ✅ Microphone button turns red/active
- ✅ Browser requests microphone permission (first time)
- ✅ Text appears in the focused field: "Hello world."
- ✅ Punctuation command ("period") converts to "."

**Pass/Fail:** ______

---

### TC-STT-002: Punctuation Commands

**Objective:** Verify voice punctuation commands work

**Steps:**
1. Click into a text field
2. Start STT recording
3. Speak: "This is a test comma I am testing punctuation period New paragraph This works question mark"
4. Stop recording

**Expected Results:**
- ✅ "comma" → ","
- ✅ "period" → "."
- ✅ "new paragraph" → "\n\n"
- ✅ "question mark" → "?"
- ✅ Text is properly punctuated

**Pass/Fail:** ______

---

### TC-STT-003: Continuous Mode

**Objective:** Verify continuous listening mode

**Steps:**
1. Open popup → STT
2. Enable "Continuous Mode" toggle
3. Start STT recording
4. Speak a sentence, pause 2 seconds
5. Speak another sentence, pause 2 seconds
6. Stop recording manually

**Expected Results:**
- ✅ Recording continues between pauses
- ✅ Both sentences transcribed
- ✅ Does not auto-stop after first sentence
- ✅ Must manually stop recording

**Pass/Fail:** ______

---

## 🧪 Test Suite 5: Canvas Integration

### TC-CANVAS-001: Canvas Quiz Detection

**Objective:** Verify extension detects Canvas quiz pages

**Prerequisites:** Access to Canvas LMS course with quizzes

**Steps:**
1. Navigate to Canvas quiz page (*.instructure.com/courses/*/quizzes/*)
2. Open AssisT popup
3. Look for "Canvas Integration" section
4. Check for "Canvas Quiz Helper" toggle

**Expected Results:**
- ✅ Canvas Integration section visible
- ✅ Quiz Helper toggle available
- ✅ Console shows: "[Canvas] Quiz page detected"

**Pass/Fail:** ______ (N/A if no Canvas access)

---

### TC-CANVAS-002: Quiz Question Navigation

**Objective:** Verify keyboard navigation through quiz questions

**Prerequisites:** Canvas quiz page

**Steps:**
1. On Canvas quiz page
2. Open popup → Enable "Canvas Quiz Helper"
3. Press `Ctrl + ↓` (next question)
4. Press `Ctrl + ↑` (previous question)
5. Press `Ctrl + Enter` (read question)

**Expected Results:**
- ✅ Ctrl+↓ scrolls to next question
- ✅ Ctrl+↑ scrolls to previous question
- ✅ Ctrl+Enter reads question aloud with TTS
- ✅ Visual highlight shows current question
- ✅ Smooth scrolling animation

**Pass/Fail:** ______ (N/A if no Canvas access)

---

### TC-CANVAS-003: Quiz Question Reading

**Objective:** Verify quiz questions read aloud correctly

**Prerequisites:** Canvas quiz page

**Steps:**
1. Enable Canvas Quiz Helper
2. Click on any quiz question text
3. Listen to TTS reading

**Expected Results:**
- ✅ Question text reads aloud
- ✅ Answer options read in A, B, C, D format
- ✅ Toast notification shows: "Reading question X of Y"
- ✅ Current question highlighted with border

**Pass/Fail:** ______ (N/A if no Canvas access)

---

## 🧪 Test Suite 6: User Profiles

### TC-PROFILE-001: Default Profiles Available

**Objective:** Verify 4 default profiles are pre-configured

**Steps:**
1. Open AssisT popup
2. Find profile selector dropdown at top
3. Click dropdown to open list

**Expected Results:**
- ✅ Dropdown shows exactly 4 profiles:
  1. Default
  2. Reading Mode
  3. Quiz Mode
  4. Low Vision
- ✅ "Default" is selected by default (first time)

**Pass/Fail:** ______

---

### TC-PROFILE-002: Switch to Reading Mode

**Objective:** Verify Reading Mode profile applies correct settings

**Steps:**
1. Open popup
2. Note current settings (speed, font size, etc.)
3. Select "Reading Mode" from profile dropdown
4. Wait for popup to reload
5. Check settings

**Expected Results:**
- ✅ Speed: 1.2x
- ✅ Word-by-word highlighting: ON
- ✅ Font size: 18px
- ✅ Line height: 1.8
- ✅ Font: OpenDyslexic
- ✅ Reading Guide: ON (blue)
- ✅ Screen Overlay: Sepia (20% opacity)

**Pass/Fail:** ______

---

### TC-PROFILE-003: Switch to Quiz Mode

**Objective:** Verify Quiz Mode profile applies correct settings

**Steps:**
1. Open popup
2. Select "Quiz Mode" from profile dropdown
3. Wait for popup to reload
4. Check settings

**Expected Results:**
- ✅ Speed: 1.0x (slower for comprehension)
- ✅ Font size: 16px
- ✅ Line height: 1.6
- ✅ Focus Mode: ON (70% dim)
- ✅ Canvas Quiz Helper: ON (if on Canvas page)

**Pass/Fail:** ______

---

### TC-PROFILE-004: Create Custom Profile

**Objective:** Verify users can save custom profiles

**Steps:**
1. Open popup
2. Adjust several settings (speed, font, features)
3. Click "Save Profile" button
4. Enter profile name: "My Custom Profile"
5. Click Save/OK
6. Check profile dropdown

**Expected Results:**
- ✅ Save dialog appears
- ✅ Name can be entered
- ✅ Profile saves successfully
- ✅ "My Custom Profile" appears in dropdown
- ✅ Settings are preserved when selecting it

**Pass/Fail:** ______

---

### TC-PROFILE-005: Export Profiles

**Objective:** Verify profiles can be exported to JSON

**Steps:**
1. Open popup
2. Click "Advanced Options" button (⚙️)
3. Find "Export Profiles" button
4. Click "Export Profiles"
5. Check Downloads folder

**Expected Results:**
- ✅ File downloads: `assist-profiles-[timestamp].json`
- ✅ File contains valid JSON
- ✅ All profiles included (default + custom)
- ✅ File size is reasonable (<100KB)

**Pass/Fail:** ______

---

### TC-PROFILE-006: Import Profiles

**Objective:** Verify profiles can be imported from JSON

**Steps:**
1. Export profiles (TC-PROFILE-005)
2. Delete a custom profile
3. Open Advanced Options
4. Click "Import Profiles"
5. Select the exported JSON file
6. Check profile dropdown

**Expected Results:**
- ✅ File upload dialog appears
- ✅ JSON file can be selected
- ✅ Import succeeds (toast notification)
- ✅ Deleted profile reappears
- ✅ All profiles functional

**Pass/Fail:** ______

---

## 🧪 Test Suite 7: Feature Visibility

### TC-VIS-001: Hide Feature

**Objective:** Verify features can be hidden from UI

**Steps:**
1. Open popup
2. Click "Advanced Options" (⚙️)
3. Navigate to "Features" tab
4. Uncheck "Text Customization"
5. Click "Save Changes"
6. Wait for popup to reload

**Expected Results:**
- ✅ Features tab visible in modal
- ✅ All 8+ hideable features listed
- ✅ Checkbox can be unchecked
- ✅ "Text Customization" section disappears from popup
- ✅ Change persists after popup close/reopen

**Pass/Fail:** ______

---

### TC-VIS-002: Core Features Protected

**Objective:** Verify core TTS controls cannot be hidden

**Steps:**
1. Open Advanced Options → Features tab
2. Look for checkboxes for:
   - Voice Selection
   - Speed Control
   - Pitch Control
   - Volume Control

**Expected Results:**
- ✅ Core feature checkboxes are disabled (grayed out)
- ✅ Checkboxes cannot be unchecked
- ✅ Tooltip/note explains they're protected
- ✅ Core features always visible in popup

**Pass/Fail:** ______

---

### TC-VIS-003: Hide Multiple Features

**Objective:** Verify multiple features can be hidden simultaneously

**Steps:**
1. Open Advanced Options → Features
2. Uncheck:
   - Speed Presets
   - Reading Guide
   - Focus Mode
   - Screen Overlay
3. Save changes
4. Check popup

**Expected Results:**
- ✅ All 4 sections disappear
- ✅ Popup is noticeably cleaner/shorter
- ✅ Core TTS controls remain
- ✅ Changes persist across sessions

**Pass/Fail:** ______

---

## 🧪 Test Suite 8: Dyslexia Mode (NEW - Sprint 9)

### TC-DYS-001: Bionic Reading Activation

**Objective:** Verify Bionic Reading mode bolds first letters

**Steps:**
1. Navigate to Wikipedia article with clear text
2. Open popup
3. Scroll down to "✨ Dyslexia Reading Mode"
4. Toggle Dyslexia Mode **ON**
5. Select "Bionic Reading" radio button
6. Observe page content

**Expected Results:**
- ✅ First 1-3 letters of each word are bolded
- ✅ Short words (1-3 chars): 1 letter bold
- ✅ Medium words (4-7 chars): 2 letters bold
- ✅ Long words (8+ chars): 3 letters bold
- ✅ Text remains fully readable
- ✅ Bold formatting is clear and consistent

**Pass/Fail:** ______

---

### TC-DYS-002: Syllable Highlighting Activation

**Objective:** Verify Syllable Highlighting applies alternating colors

**Steps:**
1. On same Wikipedia page
2. Toggle Dyslexia Mode **ON**
3. Select "Syllable Highlighting" radio button
4. Observe page content

**Expected Results:**
- ✅ Text has alternating background colors
- ✅ Colors alternate: light blue, light yellow
- ✅ Colors are subtle (not overwhelming)
- ✅ Text remains fully readable
- ✅ Syllable boundaries are clear

**Pass/Fail:** ______

---

### TC-DYS-003: Grammar Color-Coding Activation

**Objective:** Verify Grammar Colors apply to parts of speech

**Steps:**
1. On same Wikipedia page
2. Toggle Dyslexia Mode **ON**
3. Select "Grammar Colors" radio button
4. Wait 1-2 seconds for processing
5. Observe page content

**Expected Results:**
- ✅ Different words have different colors
- ✅ Nouns appear blue
- ✅ Verbs appear green
- ✅ Adjectives appear purple
- ✅ Adverbs appear orange
- ✅ Colors are subtle (not overwhelming)
- ✅ Text remains fully readable

**Pass/Fail:** ______

---

### TC-DYS-004: Color Intensity Adjustment

**Objective:** Verify color intensity slider works

**Steps:**
1. With Dyslexia Mode ON (any mode)
2. Set "Color Intensity" slider to **30%**
3. Observe colors - very subtle
4. Set slider to **100%**
5. Observe colors - very vibrant

**Expected Results:**
- ✅ At 30%: Colors are barely visible
- ✅ At 100%: Colors are fully saturated
- ✅ Changes apply immediately
- ✅ Text remains readable at all intensities

**Pass/Fail:** ______

---

### TC-DYS-005: One Mode Active at a Time

**Objective:** Verify only one dyslexia mode active simultaneously

**Steps:**
1. Enable Dyslexia Mode
2. Select "Bionic Reading" - observe page
3. Select "Syllable Highlighting" - observe page
4. Check if Bionic Reading formatting removed

**Expected Results:**
- ✅ Selecting new mode removes old formatting
- ✅ Only one mode visible at a time
- ✅ No mixed formatting (bold + colors together)
- ✅ Radio buttons enforce single selection

**Pass/Fail:** ______

---

### TC-DYS-006: Disable Dyslexia Mode

**Objective:** Verify dyslexia mode can be turned off cleanly

**Steps:**
1. With Dyslexia Mode ON (any mode active)
2. Note page appearance
3. Toggle Dyslexia Mode **OFF**
4. Observe page content

**Expected Results:**
- ✅ All dyslexia formatting removed
- ✅ Page returns to original appearance
- ✅ No leftover bold text or colors
- ✅ Clean restoration of original content

**Pass/Fail:** ______

---

### TC-DYS-007: Performance Check

**Objective:** Verify dyslexia transformations are fast

**Steps:**
1. Navigate to long article (3000+ words)
2. Open popup
3. Enable Dyslexia Mode → Bionic Reading
4. Note transformation time
5. Open browser console (F12)
6. Look for "[Dyslexia Mode]" performance logs

**Expected Results:**
- ✅ Transformation completes in <300ms
- ✅ No noticeable lag or freeze
- ✅ Console log shows time taken
- ✅ Page remains responsive during transformation

**Pass/Fail:** ______

---

### TC-DYS-008: Dyslexia + TTS Integration

**Objective:** Verify dyslexia mode works with TTS simultaneously

**Steps:**
1. Enable Dyslexia Mode → Bionic Reading
2. Enable TTS and click Play
3. Listen and watch as page is read

**Expected Results:**
- ✅ TTS reads correctly with dyslexia formatting
- ✅ Highlighting works on formatted text
- ✅ No conflicts or errors
- ✅ Both features work independently

**Pass/Fail:** ______

---

## 🧪 Test Suite 9: Screen Overlay

### TC-OVERLAY-001: Sepia Overlay

**Objective:** Verify sepia overlay reduces blue light

**Steps:**
1. Open popup
2. Expand "Screen Color Overlay"
3. Select "Sepia" from overlay type dropdown
4. Set opacity to **50%**
5. Observe entire screen

**Expected Results:**
- ✅ Screen has warm sepia/yellow tone
- ✅ Blue light is noticeably reduced
- ✅ Text remains readable
- ✅ Overlay covers entire page

**Pass/Fail:** ______

---

### TC-OVERLAY-002: Blue Light Filter

**Objective:** Verify blue light filter works

**Steps:**
1. Open popup → Screen Overlay
2. Select "Blue Light Filter"
3. Set opacity to **50%**
4. Observe screen

**Expected Results:**
- ✅ Screen has orange/amber tone
- ✅ Blue light is filtered
- ✅ Easier on eyes in dark environment
- ✅ Text remains readable

**Pass/Fail:** ______

---

### TC-OVERLAY-003: Grayscale Mode

**Objective:** Verify grayscale removes all colors

**Steps:**
1. Open popup → Screen Overlay
2. Select "Grayscale"
3. Set opacity to **100%**
4. Observe screen

**Expected Results:**
- ✅ All colors removed (black and white only)
- ✅ Images are grayscale
- ✅ Text contrast remains good
- ✅ No color distractions

**Pass/Fail:** ______

---

## 🧪 Test Suite 10: Settings Persistence

### TC-PERSIST-001: Settings Survive Popup Close

**Objective:** Verify settings persist after closing popup

**Steps:**
1. Open popup
2. Change multiple settings:
   - Speed: 1.5x
   - Font size: 20px
   - Enable Reading Guide
3. Close popup (click outside or press Esc)
4. Reopen popup
5. Check settings

**Expected Results:**
- ✅ All settings remain as configured
- ✅ Speed still 1.5x
- ✅ Font size still 20px
- ✅ Reading Guide still enabled
- ✅ No settings reset

**Pass/Fail:** ______

---

### TC-PERSIST-002: Settings Survive Browser Restart

**Objective:** Verify settings persist after browser restart

**Steps:**
1. Configure several settings
2. Note all current values
3. Close Chrome completely
4. Restart Chrome
5. Open AssisT popup
6. Check settings

**Expected Results:**
- ✅ All settings preserved
- ✅ Active profile preserved
- ✅ Feature visibility preserved
- ✅ Custom profiles preserved
- ✅ No data loss

**Pass/Fail:** ______

---

### TC-PERSIST-003: Settings Persist Per-Page

**Objective:** Verify settings apply globally across all pages

**Steps:**
1. On Page A (e.g., Wikipedia)
2. Set font size to 22px
3. Navigate to Page B (e.g., BBC News)
4. Open popup
5. Check font size setting

**Expected Results:**
- ✅ Font size still 22px on Page B
- ✅ Settings are global, not per-page
- ✅ All configured features work on Page B

**Pass/Fail:** ______

---

## 📊 Test Summary Report Template

### Test Execution Summary

**Tester Name:** ___________________
**Date:** ___________________
**Extension Version:** Sprint 9 (Dyslexia Mode)
**Browser:** Chrome _____._____._____
**OS:** _____________________

### Results by Test Suite

| Test Suite | Total Tests | Passed | Failed | N/A | Pass Rate |
|-----------|-------------|--------|--------|-----|-----------|
| Core TTS | 7 | ___ | ___ | ___ | ___% |
| Text Customization | 3 | ___ | ___ | ___ | ___% |
| Reading Assistance | 4 | ___ | ___ | ___ | ___% |
| Speech-to-Text | 3 | ___ | ___ | ___ | ___% |
| Canvas Integration | 3 | ___ | ___ | ___ | ___% |
| User Profiles | 6 | ___ | ___ | ___ | ___% |
| Feature Visibility | 3 | ___ | ___ | ___ | ___% |
| Dyslexia Mode | 8 | ___ | ___ | ___ | ___% |
| Screen Overlay | 3 | ___ | ___ | ___ | ___% |
| Settings Persistence | 3 | ___ | ___ | ___ | ___% |
| **TOTAL** | **43** | **___** | **___** | **___** | **___%** |

### Critical Bugs Found

1. ________________________________________________________________
2. ________________________________________________________________
3. ________________________________________________________________

### Non-Critical Bugs Found

1. ________________________________________________________________
2. ________________________________________________________________
3. ________________________________________________________________

### Usability Issues

1. ________________________________________________________________
2. ________________________________________________________________
3. ________________________________________________________________

### Recommendations

1. ________________________________________________________________
2. ________________________________________________________________
3. ________________________________________________________________

### Overall Assessment

**Ready for Production?** ☐ Yes ☐ No ☐ With Fixes

**Comments:** ________________________________________________________
____________________________________________________________________
____________________________________________________________________

---

## 🐛 Bug Report Template

### Bug ID: BUG-[DATE]-[NUMBER]

**Title:** [Short descriptive title]

**Severity:** ☐ Critical ☐ High ☐ Medium ☐ Low

**Priority:** ☐ P0 (Blocker) ☐ P1 (High) ☐ P2 (Medium) ☐ P3 (Low)

**Test Case:** TC-___-___

**Environment:**
- OS: _____________________
- Browser: Chrome _____._____._____
- Extension Version: Sprint 9

**Steps to Reproduce:**
1.
2.
3.

**Expected Result:**


**Actual Result:**


**Screenshots/Video:**
[Attach or link]

**Console Errors:**
```
[Paste console errors here]
```

**Workaround:**
[If known]

**Additional Notes:**


---

## 🔍 Exploratory Testing Guidelines

### Areas to Explore

1. **Edge Cases**
   - Very long articles (10,000+ words)
   - Pages with minimal text
   - Pages with complex layouts (tables, lists)
   - Dynamic content (JavaScript-heavy sites)
   - iframes and embedded content

2. **Browser Compatibility**
   - Test in Chrome Stable
   - Test in Chrome Beta (if available)
   - Test in Chrome Canary (if available)
   - Note: Extension is Chrome-only

3. **Performance Testing**
   - Large pages (5MB+ HTML)
   - Rapid feature toggling
   - Multiple tabs with extension active
   - Long TTS sessions (30+ minutes)
   - Memory usage over time

4. **Accessibility Testing**
   - Keyboard-only navigation
   - Screen reader compatibility (NVDA, JAWS)
   - High contrast mode
   - Zoom levels (50% - 200%)
   - Color blindness simulation

5. **Security Testing**
   - Extension permissions (should be minimal)
   - No external API calls (except Web Speech API)
   - Local storage only (no cloud sync)
   - No PII collection
   - FERPA compliance

### What to Look For

- **Usability Issues:** Confusing UI, unclear labels
- **Performance Issues:** Lag, freezes, high memory usage
- **Visual Issues:** Overlapping text, broken layouts
- **Accessibility Issues:** Keyboard traps, missing focus indicators
- **Consistency Issues:** Features not working the same across pages

---

## ✅ Test Completion Checklist

- [ ] All 43 test cases executed
- [ ] Test summary report completed
- [ ] All bugs logged with screenshots
- [ ] Severity and priority assigned to bugs
- [ ] Exploratory testing completed
- [ ] Performance baseline documented
- [ ] Accessibility spot-check completed
- [ ] Test results shared with development team
- [ ] Production readiness decision made

---

**Last Updated:** 2025-10-12
**Sprint Version:** Sprint 9 (Dyslexia Mode Complete)
**Total Test Cases:** 43
**Estimated Testing Time:** 3-4 hours (comprehensive)

**Happy Testing!** 🎉
