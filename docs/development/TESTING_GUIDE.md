# AssisT Extension Testing Guide

## 🧪 Loading the Extension in Chrome

### Step 1: Open Chrome Extensions Page
```
chrome://extensions/
```
Or: Menu → More Tools → Extensions

### Step 2: Enable Developer Mode
- Toggle "Developer mode" switch in the top right corner

### Step 3: Load Unpacked Extension
1. Click "Load unpacked" button
2. Navigate to: `c:\Users\jones\AIprojects\AssitT`
3. Select the folder and click "Select Folder"

### Step 4: Verify Installation
You should see:
- ✅ Extension card with "AssisT: Adaptive EdTech for Canvas"
- ✅ Version 0.1.0
- ✅ "Manage extensions" button
- ⚠️ Icons will show as default (PNG files not yet generated)

---

## 🎯 Testing on Canvas

### Test Sites
1. **Canvas Demo**: https://canvas.instructure.com/
2. **Your Institution's Canvas**: *://*.instructure.com/*

### Test Steps

#### 1. Navigate to Canvas
- Go to any Canvas course page
- Open any assignment, discussion, or page with text content

#### 2. Open Popup
- Click the AssisT extension icon in Chrome toolbar
- Popup should open (360x500px)

#### 3. Test TTS Enable
- [ ] Toggle "Enable TTS" switch
- [ ] Verify playback controls become active

#### 4. Test Voice Selection
- [ ] Open voice dropdown
- [ ] Verify voices are grouped by language
- [ ] Select a different voice
- [ ] Voice should be saved

#### 5. Test Playback
- [ ] Click "Read Page" button
- [ ] Verify text starts being read
- [ ] Status should show "Reading..."
- [ ] Play button should be disabled

#### 6. Test Pause/Resume
- [ ] While reading, click "Pause"
- [ ] Speech should pause
- [ ] Status should show "Paused"
- [ ] Button should change to "Resume"
- [ ] Click "Resume"
- [ ] Speech should continue

#### 7. Test Stop
- [ ] While reading, click "Stop"
- [ ] Speech should stop
- [ ] All buttons should reset
- [ ] Status should show "Ready"

#### 8. Test Rate Control
- [ ] Move rate slider
- [ ] Value should update in real-time
- [ ] Start reading
- [ ] Verify speed change

#### 9. Test Pitch Control
- [ ] Move pitch slider
- [ ] Value should update
- [ ] Start reading
- [ ] Verify pitch change

#### 10. Test Volume Control
- [ ] Move volume slider
- [ ] Percentage should update
- [ ] Start reading
- [ ] Verify volume change

#### 11. Test Highlighting
- [ ] Enable word highlighting
- [ ] Start reading
- [ ] Verify words are highlighted as spoken (if DOM adapter supports it)

---

## 🐛 Known Issues / Expected Behavior

### Current State
- ✅ Popup UI fully functional
- ✅ TTS Controller implemented
- ⚠️ Content script integration pending
- ⚠️ DOM adapter not yet connected
- ⚠️ Icons showing as default (SVG only, no PNGs)

### Expected Issues
1. **"Tab not accessible" error**: Content script not injected yet
2. **No highlighting**: DOM adapter not connected to content script
3. **Default icons**: PNG icons not generated yet

---

## 🔧 Debugging

### View Console Logs
1. **Popup Console**:
   - Right-click popup → Inspect
   - Check Console tab for `[Popup]` logs

2. **Background Console**:
   - Go to `chrome://extensions/`
   - Click "Service worker" under AssisT
   - Check Console for `[Background]` logs

3. **Content Script Console**:
   - Open Canvas page
   - Press F12 → Console tab
   - Check for `[Content]` or `[TTS]` logs

### Common Checks
```javascript
// In popup console:
chrome.storage.local.get(null, console.log); // View all settings

// In content script console:
console.log(window.speechSynthesis.getVoices()); // Check available voices
```

---

## ✅ Testing Checklist

### UI/UX
- [ ] Popup opens correctly (360x500px)
- [ ] All controls are visible and styled
- [ ] Toggle switches animate smoothly
- [ ] Sliders update values in real-time
- [ ] Buttons show hover effects
- [ ] Status indicator updates correctly

### Functionality
- [ ] Settings persist between popup opens
- [ ] Voice list populates
- [ ] Rate/pitch/volume sliders work
- [ ] Enable/disable toggle works
- [ ] All buttons respond to clicks

### Accessibility
- [ ] Tab navigation works
- [ ] Focus indicators visible
- [ ] Screen reader labels present
- [ ] High contrast mode works
- [ ] Reduced motion respected

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Edge (Chromium-based)

---

## 📝 Next Steps

After testing popup UI:
1. Implement content script integration
2. Connect DOM adapter to TTS controller
3. Test word-by-word highlighting
4. Generate PNG icons
5. Test on multiple Canvas pages

---

## 🚨 Troubleshooting

### Popup doesn't open
- Check extension is enabled in chrome://extensions/
- Verify manifest.json has correct popup path
- Check browser console for errors

### Settings don't save
- Open chrome://extensions/
- Check "Errors" button for extension
- Verify chrome.storage permissions

### Voices don't load
- Ensure Web Speech API is supported (Chrome 33+)
- Try refreshing the popup
- Check browser console for errors

---

**Testing Status**: Phase 2 Complete - 990+ Unit Tests, 16 Core E2E Tests
**Date**: 2025-11-28
**Version**: 0.2.0

---

## Phase 2 Feature Testing

### Running Tests

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests (requires built extension)
npm run test:e2e

# Run specific test file
npm test -- tests/unit/ocr/ocr.test.js
```

### Test Coverage by Feature

| Feature | Unit Tests | E2E Tests | Coverage |
|---------|------------|-----------|----------|
| OCR & Screenshot | 42 | 14 | 100% |
| Highlight Menu | 15 | 11 | 100% |
| Reading Mode | 18 | 11 | 100% |
| Dictionary Lookup | 39 | - | 100% |
| Annotations | 188 | 23 | 94% |
| Translation | 21 | - | 100% |
| Text Statistics | 59 | - | 100% |
| Font Library | - | - | Manual |
| Keyboard Shortcuts | 47 | - | 100% |
| Citation System | 64 | 15 | 100% |
| STT Voice Commands | 84 | - | 100% |
| STT Controller | 58 | - | 100% |
| STT Vocabulary | 39 | - | 100% |
| STT Profiles | 66 | - | 100% |
| Auto-Punctuation | 59 | - | 100% |
| Confidence Feedback | 50 | - | 100% |
| Advanced Engines | 38 | - | 100% |
| **Total** | **990+** | **74** | **96%** |

---

## Testing Phase 2 Features Manually

### OCR & Screenshot Tool

#### Test 1: Full Page Capture
1. Navigate to any Canvas page with text content
2. Click AssisT icon > OCR > Capture Screenshot
3. Select "Full Page"
4. **Expected**: Screenshot captures, OCR modal opens with extracted text

#### Test 2: Region Selection
1. Navigate to page with image containing text
2. Click OCR > Select Region
3. Draw rectangle around text
4. **Expected**: Selected region captured, text extracted

#### Test 3: PDF Text Extraction
1. Open a PDF in Chrome's PDF viewer
2. Click OCR > Extract PDF Text
3. **Expected**: Text extracted from PDF, TTS available

#### Test 4: OCR + TTS Integration
1. Capture screenshot with OCR
2. Click Play button in OCR modal
3. **Expected**: Extracted text read aloud with highlighting

---

### Highlight Menu

#### Test 5: Menu Appearance
1. Select text on any Canvas page (3+ characters)
2. **Expected**: Floating toolbar appears near selection

#### Test 6: TTS Button
1. Select text, click TTS button in menu
2. **Expected**: Selected text read aloud

#### Test 7: Dictionary Button
1. Select a single word, click Dictionary button
2. **Expected**: Dictionary modal opens with definition

#### Test 8: Annotate Button
1. Select text, click Annotate button
2. **Expected**: Annotation modal opens, can add comment

---

### Reading Mode

#### Test 9: Enter Reading Mode
1. Navigate to article page
2. Click AssisT icon > Reading Mode > Enter
3. **Expected**: Page transforms to clean reading view

#### Test 10: Reading Mode + TTS
1. In Reading Mode, click Read Page
2. **Expected**: TTS reads clean content with highlighting

#### Test 11: Exit Reading Mode
1. In Reading Mode, press ESC
2. **Expected**: Returns to normal page view

---

### Dictionary Lookup

#### Test 12: Lookup Word
1. Double-click a word (or Ctrl+Shift+D)
2. **Expected**: Dictionary modal with definition, IPA, examples

#### Test 13: Audio Pronunciation
1. In dictionary modal, click speaker icon
2. **Expected**: Word pronunciation plays

#### Test 14: Synonym Links
1. Click a synonym in dictionary modal
2. **Expected**: New lookup for clicked word

---

### Annotations & Sticky Notes

#### Test 15: Create Sticky Note
1. Click AssisT icon > Add Sticky Note
2. **Expected**: Yellow note appears on page

#### Test 16: Edit Sticky Note
1. Click inside sticky note
2. Type text, use formatting toolbar
3. **Expected**: Text saved, formatting applied

#### Test 17: Create Inline Annotation
1. Select text, click Annotate in highlight menu
2. Add comment, save
3. **Expected**: Text highlighted, comment saved

#### Test 18: Annotation Sidebar
1. Press Ctrl+Shift+A
2. **Expected**: Sidebar opens with all annotations

#### Test 19: TTS on Sticky Note
1. Open sticky note, click TTS button
2. **Expected**: Note content read aloud

---

### Translation

#### Test 20: Translate Selection
1. Select text, click Translate in highlight menu
2. Choose target language
3. **Expected**: Translation modal shows result

#### Test 21: Full Page Translation
1. Click AssisT icon > Translate Page
2. **Expected**: Entire page translated in place

#### Test 22: Revert Translation
1. After translating, click Revert
2. **Expected**: Original content restored

---

### Text Statistics

#### Test 23: View Statistics
1. Press Ctrl+Shift+W
2. **Expected**: Statistics modal with word count, etc.

#### Test 24: Selection Statistics
1. Select text, view statistics
2. **Expected**: Stats for selected text only

---

### Citation System

#### Test 25: Save Citation
1. Navigate to article/paper
2. Click AssisT icon > Save Citation
3. **Expected**: Citation saved with extracted metadata

#### Test 26: Edit Citation
1. In Citation Manager, click Edit on citation
2. Modify fields
3. **Expected**: Changes saved, preview updates

#### Test 27: Generate Bibliography
1. Select citations, click Generate Bibliography
2. **Expected**: Harvard-formatted reference list

#### Test 28: Export Citations
1. Select citations, click Export
2. Choose format (BibTeX, RIS, JSON)
3. **Expected**: File downloads in chosen format

---

### Speech-to-Text (STT)

#### Test 29: Basic Dictation
1. Focus a text field, click STT button
2. Speak text
3. **Expected**: Speech converted to text in field

#### Test 30: Voice Commands
1. While STT active, say "delete last word"
2. **Expected**: Last word deleted

#### Test 31: Voice Formatting
1. Type text, select, say "bold that"
2. **Expected**: Selection formatted as bold

#### Test 32: Auto-Punctuation
1. Enable auto-punctuation in settings
2. Dictate sentence, pause at end
3. **Expected**: Period automatically added

#### Test 33: Custom Vocabulary
1. Add custom word to vocabulary
2. Dictate sentence with that word
3. **Expected**: Custom word recognized correctly

---

### Neurodivergent Profiles

#### Test 34: Load Profile
1. Click AssisT icon > Profiles
2. Select "ADHD Focus" profile
3. **Expected**: All profile settings applied

#### Test 35: Profile Persistence
1. Load profile, close popup
2. Navigate to new page
3. **Expected**: Profile settings still active

---

### Performance Testing

#### Critical Path Benchmarks

All operations should complete within these targets:

| Operation | Target | Actual |
|-----------|--------|--------|
| TTS start | <300ms | ~50ms |
| Dictionary lookup | <500ms | ~200ms |
| OCR processing | <5s | ~2-3s |
| Citation save | <300ms | ~100ms |
| Profile load | <300ms | ~20ms |
| Annotation save | <300ms | ~50ms |

To run benchmarks:
```bash
npm run test:perf
```

---

### WCAG 2.2 AA Compliance

#### Keyboard Navigation
- [ ] All controls reachable via Tab
- [ ] Focus indicators visible
- [ ] No keyboard traps
- [ ] Escape closes modals

#### Screen Reader
- [ ] ARIA labels on all controls
- [ ] Live regions announce changes
- [ ] Meaningful link text
- [ ] Form labels associated

#### Visual
- [ ] 4.5:1 contrast ratio (text)
- [ ] 3:1 contrast ratio (UI)
- [ ] No color-only information
- [ ] Respects reduced motion

#### Target Size
- [ ] All targets 44x44px minimum
- [ ] Adequate spacing between targets

---

## E2E Test Structure

E2E tests use Playwright with a custom extension fixture:

```javascript
// Example E2E test
test('OCR captures screenshot and extracts text', async ({ page, extensionId }) => {
  await page.goto('https://example.com');

  // Open extension popup
  const popup = await openExtensionPopup(page, extensionId);

  // Click OCR button
  await popup.click('[data-testid="ocr-capture"]');

  // Verify OCR modal appears
  await expect(page.locator('.ocr-modal')).toBeVisible();

  // Verify text extracted
  await expect(page.locator('.ocr-result')).toContainText(/\w+/);
});
```

---

## Debugging Tests

### Console Output
```bash
# Verbose test output
npm test -- --verbose

# Show console.log in tests
npm test -- --silent=false
```

### Visual Debugging (E2E)
```bash
# Run E2E with browser visible
npm run test:e2e -- --headed

# Pause on failure
npm run test:e2e -- --debug
```

### Test Isolation
```bash
# Run single test
npm test -- -t "OCR extracts text from image"

# Run tests in single file
npm test -- tests/unit/ocr/ocr.test.js
```

---

## Continuous Integration

Tests run automatically on:
- Every push to `main`
- Every pull request
- Nightly scheduled runs

CI configuration in `.github/workflows/test.yml`:
- Unit tests: ~2 minutes
- E2E tests: ~5 minutes (16 core tests)
- Full E2E: ~15 minutes (all 74 tests)

---

## Adding New Tests

### Unit Test Template

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { myFunction } from '../../../src/features/myFeature/myModule.js';

describe('myFunction', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do expected behavior', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### E2E Test Template

```javascript
import { test, expect } from './fixtures/extension-fixture.js';

test.describe('My Feature', () => {
  test('user can perform action', async ({ page, extensionId }) => {
    // Navigate
    await page.goto('https://example.com');

    // Perform action
    await page.click('.my-button');

    // Verify result
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

---

## Known Test Limitations

1. **E2E tests skipped in CI**: 58 E2E tests skipped for CI speed (run locally for full coverage)
2. **STT E2E**: Requires microphone permissions, manual testing recommended
3. **OCR E2E selectors**: May need updates if UI changes
4. **Multi-browser**: Tests optimized for Chrome, Edge compatible

---

**Phase 2 Testing Complete**: 2025-11-28
**Total Test Count**: 990+ unit tests, 74 E2E tests
