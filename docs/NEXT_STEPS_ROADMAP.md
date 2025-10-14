# Next Steps Roadmap - AssisT Extension

**Last Updated:** 2025-10-14
**Current Status:** Phase 3 Complete - Modular Architecture Established
**Branch:** feature/automated-fixes

---

## ✅ Completed Work

### Phase 3: Code Refactoring (COMPLETE)
- ✅ Created modular architecture (13 files)
- ✅ Extracted all 7 core features to separate modules
- ✅ Created utility modules (dom-utils, storage-utils)
- ✅ LMS integration placeholders created
- ✅ Main orchestrator with parallel initialization
- ✅ All files <500 lines per file
- ✅ Build succeeds, tests passing (94/116)
- ✅ Feature isolation pattern throughout

---

## 📋 Remaining Work

### HIGH PRIORITY

#### 1. Fix TTS Test Mocks (2-3 hours)
**Current Status:** 22/44 tests passing (50%)
**Target:** 40/44 tests passing (90%+)

**File:** `tests/unit/tts-controller.test.js`

**Issues to Fix:**
- Missing `beforeEach(async () => await controller.initialize())` in test groups:
  - Playback Control (line ~369)
  - Enable/Disable (line ~403)
- Async operations not being awaited:
  - `readText()` tests (line ~451)
  - `readPageContent()` tests (line ~465)
- Mock synthesis.speaking state not tracked properly

**Quick Fixes:**
```javascript
// Add to Playback Control describe block (line 369):
beforeEach(async () => {
  await controller.initialize();
});

// Add to Enable/Disable describe block (line 403):
beforeEach(async () => {
  await controller.initialize();
});

// Fix readText test (line 451):
test('should read text with element context', async () => {
  const mockElement = { style: {} };
  await controller.readText('Test text', mockElement); // Add await

  expect(controller.currentElement).toBe(mockElement);
  expect(controller.currentText).toBe('Test text');
  expect(mockSynthesis.speak).toHaveBeenCalled();
});

// Fix readPageContent test (line 465):
test('should read page content using DOM adapter', async () => {
  await controller.readPageContent(); // Add await

  expect(mockDomAdapter.getTextNodes).toHaveBeenCalled();
  expect(mockSynthesis.speak).toHaveBeenCalled();
  expect(controller.currentText).toBe('Hello world This is a test');
});
```

---

#### 2. Refactor popup.js (4-6 hours)
**Current:** 1,927 lines (monolithic)
**Target:** <500 lines per file (modular)

**Proposed Structure:**
```
src/popup/
├── popup.js                (~200 lines) - Main orchestrator
├── modules/
│   ├── tts-controls.js     (~250 lines) - TTS UI
│   ├── profiles.js         (~300 lines) - Profile management
│   ├── advanced-settings.js (~350 lines) - Settings modal
│   ├── feature-toggles.js  (~200 lines) - Feature switches
│   └── export-import.js    (~150 lines) - Settings export/import
└── utils/
    └── ui-helpers.js       (~100 lines) - Shared UI utilities
```

**Extraction Strategy:**
1. Create `utils/ui-helpers.js` for shared functions
2. Extract TTS controls (lines ~100-350)
3. Extract profile management (lines ~350-650)
4. Extract advanced settings modal (lines ~650-1000)
5. Extract feature toggles (lines ~1000-1200)
6. Extract export/import (lines ~1200-1350)
7. Update main popup.js to import modules

**Pattern to Follow:**
```javascript
// popup/modules/tts-controls.js
import { getSettings, saveSettings } from '../../content/utils/storage-utils.js';

let ttsSettings = {};

export async function initTTSControls() {
  const settings = await getSettings();
  ttsSettings = settings.tts || {};

  // Setup event listeners
  setupTTSListeners();
  updateTTSUI();
}

function setupTTSListeners() {
  document.getElementById('tts-enable').addEventListener('change', handleTTSToggle);
  // ... more listeners
}

function updateTTSUI() {
  // Update UI based on settings
}

export { ttsSettings };
```

---

#### 3. Complete LMS Integrations (6-8 hours)
**Current:** Placeholder modules (~50 lines each)
**Target:** Full implementations (~250 lines each)

**Canvas LMS (src/content/lms/canvas.js)**
- Extract from content-simple.js lines 1128-1270
- Already documented in canvas-full.js
- Features: Assignment reader, FAB button

**Moodle LMS (src/content/lms/moodle.js)**
- Extract from content-simple.js lines 1271-1481
- Features: Assignment reader, forum reader, page reader

**Google Classroom (src/content/lms/google-classroom.js)**
- Extract from content-simple.js lines 1482-1714
- Features: Assignment reader, stream reader, classwork reader

**Implementation Steps per LMS:**
1. Copy code from content-simple.js
2. Convert to ES6 module format
3. Import utilities from utils modules
4. Use onSettingsChange for reactive settings
5. Export initialize and getState functions
6. Test on actual LMS page

---

### MEDIUM PRIORITY

#### 4. Add Test Coverage for New Modules (3-4 hours)
**Current:** No tests for new feature modules
**Target:** 80%+ coverage for each module

**Files Needing Tests:**
- `tests/unit/content/features/dyslexia.test.js` (new)
- `tests/unit/content/features/text-customization.test.js` (new)
- `tests/unit/content/features/reading-guide.test.js` (new)
- `tests/unit/content/features/focus-mode.test.js` (new)
- `tests/unit/content/features/screen-overlay.test.js` (new)
- `tests/unit/content/features/stt.test.js` (new)

**Test Template:**
```javascript
import { feature_initialize, feature_getState } from '../../../src/content/features/feature.js';
import { getSettings } from '../../../src/content/utils/storage-utils.js';

jest.mock('../../../src/content/utils/storage-utils.js');
jest.mock('../../../src/content/utils/dom-utils.js');

describe('Feature Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize when enabled', async () => {
    getSettings.mockResolvedValue({
      feature: { enabled: true }
    });

    await feature_initialize();

    const state = feature_getState();
    expect(state.enabled).toBe(true);
  });

  test('should not initialize when disabled', async () => {
    getSettings.mockResolvedValue({
      feature: { enabled: false }
    });

    await feature_initialize();

    const state = feature_getState();
    expect(state.enabled).toBe(false);
  });
});
```

---

### LOW PRIORITY

#### 5. Performance Optimizations (2-3 hours)

**Opportunities:**
1. **Lazy load features** - Only initialize features when first enabled
2. **Debounce settings changes** - Reduce storage operations
3. **Memoize utility functions** - Cache hexToRgba conversions
4. **Optimize DOM operations** - Batch updates where possible
5. **Reduce bundle size** - Tree-shake unused code

**Example Optimizations:**
```javascript
// Lazy loading
let ttsModule = null;
async function loadTTS() {
  if (!ttsModule) {
    ttsModule = await import('./features/tts.js');
  }
  return ttsModule;
}

// Debounced settings
let settingsTimeout = null;
function saveSettingsDebounced(settings) {
  clearTimeout(settingsTimeout);
  settingsTimeout = setTimeout(() => {
    saveSettings(settings);
  }, 300);
}

// Memoization
const colorCache = new Map();
function hexToRgbaMemoized(hex, opacity) {
  const key = `${hex}-${opacity}`;
  if (!colorCache.has(key)) {
    colorCache.set(key, hexToRgba(hex, opacity));
  }
  return colorCache.get(key);
}
```

---

#### 6. E2E Test Improvements (2-3 hours)
**Current:** 23/25 passing (92%)
**Target:** 25/25 passing (100%)

**Failing Tests:**
- TTS-related E2E tests (need proper Speech API mocking)
- Timing-related flakiness

**Improvements:**
- Add proper wait strategies
- Mock Speech Synthesis API in E2E environment
- Add visual regression testing for UI changes
- Test on multiple browsers (Chrome, Firefox, Edge)

---

## 📊 Success Metrics

### Code Quality
- ✅ All files <500 lines
- ✅ Feature isolation pattern
- ✅ No code duplication
- 🔸 80%+ test coverage (currently 81% for tested modules)

### Testing
- ✅ Unit tests: 94/116 passing (81%)
- 🔸 TTS tests: 22/44 passing (50%) → Target: 40/44
- ✅ E2E tests: 23/25 passing (92%)
- 🔸 Feature module tests: 0/6 → Target: 6/6

### Build & Deploy
- ✅ Clean build process
- ✅ ES6 modules working
- ✅ Chrome extension loads successfully
- ✅ No console errors

---

## 🚀 Recommended Sequence

**For Next Session (4-6 hours):**
1. Fix TTS test mocks (1 hour)
2. Refactor popup.js modules (3-4 hours)
3. Build, test, commit (30 min)

**Following Session (6-8 hours):**
1. Complete LMS integrations (6 hours)
2. Add feature module tests (2 hours)

**Final Polish (3-4 hours):**
1. Performance optimizations (2 hours)
2. E2E test fixes (1 hour)
3. Documentation updates (1 hour)

---

## 📝 Quick Reference Commands

```bash
# Build extension
npm run build

# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=tts-controller

# Run E2E tests
npm run test:e2e

# Watch mode for development
npm test -- --watch

# Load extension in Chrome
# 1. chrome://extensions/
# 2. Enable Developer mode
# 3. Load unpacked → Select Output/ folder
```

---

## 🎯 Current Branch Status

**Branch:** `feature/automated-fixes`
**Last Commit:** Complete modular architecture
**Ready to Push:** Yes
**Merge-Ready:** After popup.js refactor + TTS test fixes

---

**Total Estimated Time Remaining:** 15-20 hours for 100% completion
**Highest Impact Next Steps:**
1. Fix TTS tests (1h)
2. Refactor popup.js (4h)
3. Complete LMS integrations (6h)
