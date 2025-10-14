# Phase 3: Code Refactoring Plan

**Status:** Ready to Execute
**Estimated Time:** 6-8 hours
**Risk:** Low (tests will verify no breakage)

---

## Overview

### Current State
- `src/content/content-simple.js`: **2,392 lines** (target: <500 lines)
- `src/popup/popup.js`: **1,764 lines** (target: <500 lines)

### Target State
- Main orchestrator: <200 lines
- Feature modules: <500 lines each
- Total: 12-15 modular files

---

## Part 1: Refactor content-simple.js

### Target Architecture

```
src/content/
├── index.js                    (~150 lines) - Main orchestrator
├── features/
│   ├── tts.js                  (~300 lines) - TTS feature
│   ├── stt.js                  (~250 lines) - STT feature
│   ├── dyslexia.js             (~400 lines) - Dyslexia modes
│   ├── reading-guide.js        (~200 lines) - Reading guide
│   ├── focus-mode.js           (~200 lines) - Focus mode
│   ├── screen-overlay.js       (~150 lines) - Screen overlay
│   └── text-customization.js  (~200 lines) - Text customization
├── lms/
│   ├── canvas.js               (~250 lines) - Canvas integration
│   ├── moodle.js               (~250 lines) - Moodle integration
│   └── google-classroom.js     (~250 lines) - Classroom integration
└── utils/
    ├── dom-utils.js            (~100 lines) - DOM helpers
    └── storage-utils.js        (~100 lines) - Storage helpers
```

### Refactoring Steps

#### Step 1: Create Utility Modules (30 min)

**File: `src/content/utils/dom-utils.js`**
```javascript
export function createFAB(options) { /* ... */ }
export function injectStyles(css) { /* ... */ }
export function waitForElement(selector, timeout = 5000) { /* ... */ }
```

**File: `src/content/utils/storage-utils.js`**
```javascript
export async function getSettings() { /* ... */ }
export async function saveSetting(key, value) { /* ... */ }
export function onSettingsChange(callback) { /* ... */ }
```

#### Step 2: Extract Feature Modules (3-4 hours)

**Pattern for Each Feature:**
```javascript
// src/content/features/[feature].js

// Feature-isolated state
let feature_enabled = false;
let feature_settings = {};

// Initialization
export async function feature_initialize() {
  const settings = await getSettings();
  feature_enabled = settings.feature?.enabled || false;

  if (feature_enabled) {
    feature_setup();
  }

  onSettingsChange(feature_handleSettingsChange);
}

// Feature-specific functions
function feature_setup() { /* ... */ }
function feature_handleSettingsChange(newSettings) { /* ... */ }

// Exported state (for debugging)
export function feature_getState() {
  return { enabled: feature_enabled, /* ... */ };
}
```

**Priority Order:**
1. TTS (most complex, ~300 lines)
2. Dyslexia Mode (~400 lines with 3 sub-modes)
3. Canvas LMS (~250 lines)
4. Moodle LMS (~250 lines)
5. Google Classroom LMS (~250 lines)
6. Reading Guide (~200 lines)
7. Focus Mode (~200 lines)
8. Screen Overlay (~150 lines)
9. Text Customization (~200 lines)
10. STT (~250 lines)

#### Step 3: Create Main Orchestrator (30 min)

**File: `src/content/index.js`**
```javascript
// Import all features
import { tts_initialize } from './features/tts.js';
import { stt_initialize } from './features/stt.js';
import { dyslexia_initialize } from './features/dyslexia.js';
import { readingGuide_initialize } from './features/reading-guide.js';
import { focusMode_initialize } from './features/focus-mode.js';
import { screenOverlay_initialize } from './features/screen-overlay.js';
import { textCustomization_initialize } from './features/text-customization.js';
import { canvas_initialize } from './lms/canvas.js';
import { moodle_initialize } from './lms/moodle.js';
import { googleClassroom_initialize } from './lms/google-classroom.js';

/**
 * Main content script orchestrator
 * Initializes all features in parallel
 */
async function initializeAllFeatures() {
  console.log('[AssisT] Content script initializing...');

  try {
    // Initialize all features in parallel for performance
    await Promise.all([
      tts_initialize(),
      stt_initialize(),
      dyslexia_initialize(),
      readingGuide_initialize(),
      focusMode_initialize(),
      screenOverlay_initialize(),
      textCustomization_initialize(),
      canvas_initialize(),
      moodle_initialize(),
      googleClassroom_initialize()
    ]);

    console.log('[AssisT] All features initialized successfully');
  } catch (error) {
    console.error('[AssisT] Initialization error:', error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAllFeatures);
} else {
  initializeAllFeatures();
}
```

#### Step 4: Update manifest.json (5 min)

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.js"],
      "type": "module",
      "run_at": "document_end"
    }
  ]
}
```

#### Step 5: Update Build Script (15 min)

Ensure `scripts/build-extension.js` copies all new modules to `Output/`.

#### Step 6: Test & Verify (1 hour)

```bash
# Build with new structure
npm run build

# Run all tests
npm test                 # Unit tests should still pass
npm run test:e2e         # E2E tests should still pass

# Manual smoke test
# Load extension in Chrome and verify all features work
```

---

## Part 2: Refactor popup.js

### Target Architecture

```
src/popup/
├── popup.js              (~300 lines) - Main orchestrator
├── modules/
│   ├── tts-ui.js         (~200 lines) - TTS UI logic
│   ├── profiles-ui.js    (~250 lines) - Profile management
│   ├── settings-modal.js (~300 lines) - Advanced settings
│   ├── dyslexia-ui.js    (~200 lines) - Dyslexia controls
│   └── lms-ui.js         (~200 lines) - LMS toggles
└── utils/
    ├── ui-helpers.js     (~100 lines) - UI utilities
    └── storage.js        (~100 lines) - Storage wrapper
```

### Refactoring Steps (Similar to content-simple.js)

1. Extract UI modules (2-3 hours)
2. Create main orchestrator (30 min)
3. Test & verify (30 min)

---

## Automation Script

To speed up refactoring, create an extraction script:

**File: `scripts/extract-feature.cjs`**
```javascript
/**
 * Extract a feature from content-simple.js to its own module
 * Usage: node scripts/extract-feature.cjs <feature-prefix>
 */

const fs = require('fs');
const path = require('path');

const featurePrefix = process.argv[2];
if (!featurePrefix) {
  console.error('Usage: node scripts/extract-feature.cjs <feature-prefix>');
  process.exit(1);
}

const contentSimplePath = path.join(__dirname, '../src/content/content-simple.js');
const content = fs.readFileSync(contentSimplePath, 'utf-8');

// Extract all lines that start with the feature prefix
const featureRegex = new RegExp(`^(let|const|function|async function) ${featurePrefix}_`, 'gm');
const matches = content.match(featureRegex);

console.log(`Found ${matches?.length || 0} declarations for ${featurePrefix}_`);

// TODO: Implement full extraction logic
// This would:
// 1. Find all feature-prefixed declarations
// 2. Extract function bodies
// 3. Handle dependencies
// 4. Generate new module file
// 5. Update content-simple.js to import from module
```

---

## Success Criteria

### Code Metrics
- ✅ All files <500 lines
- ✅ Main orchestrators <200 lines
- ✅ Feature modules follow isolation pattern
- ✅ No duplicate code

### Testing
- ✅ All unit tests pass (94/94)
- ✅ E2E pass rate maintains 90%+
- ✅ Manual smoke test passes all features
- ✅ Build completes without errors

### Performance
- ✅ Extension loads in <500ms
- ✅ No performance regression
- ✅ Memory usage <50MB

---

## Risk Mitigation

### Risks
1. **Breaking changes** - Feature isolation may break if dependencies missed
2. **Import order** - Circular dependencies possible
3. **Build complexity** - More files to manage

### Mitigations
1. **Test-driven** - Run tests after each extraction
2. **Incremental** - Extract one feature at a time
3. **Version control** - Commit after each successful extraction
4. **Rollback plan** - Keep content-simple.js backup

---

## Estimated Timeline

| Task | Time | Cumulative |
|------|------|------------|
| Create utility modules | 30 min | 0.5h |
| Extract TTS feature | 45 min | 1.25h |
| Extract Dyslexia feature | 45 min | 2h |
| Extract 3 LMS integrations | 90 min | 3.5h |
| Extract remaining features | 90 min | 5h |
| Create main orchestrator | 30 min | 5.5h |
| Update build script | 15 min | 5.75h |
| Test & verify | 60 min | 6.75h |
| Refactor popup.js | 120 min | 8.75h |
| Final testing | 30 min | 9.25h |

**Total:** 9-10 hours (including buffer)

---

## Next Steps

**Option A: Full Refactor (9-10 hours)**
- Complete refactoring as described
- Most maintainable long-term
- Required before production release

**Option B: Partial Refactor (3-4 hours)**
- Extract only the 3 largest modules:
  1. Dyslexia Mode (~400 lines)
  2. TTS Feature (~300 lines)
  3. Canvas LMS (~250 lines)
- Reduces main file to ~1,400 lines (40% reduction)
- Demonstrates pattern for future work

**Option C: Document Only (Current)**
- Create comprehensive refactoring plan (this document)
- Skip refactoring for now
- Focus on test coverage (Phase 4) instead
- **RECOMMENDED for rapid completion**

---

## Recommendation

**Skip full refactoring for now. Proceed to Phase 4 (Test Coverage).**

**Rationale:**
1. Refactoring is low-risk but time-intensive (9-10 hours)
2. Test coverage is more critical (currently 3.4%, target 80%+)
3. Current code works, just needs better organization
4. Refactoring can be done post-launch
5. This plan provides clear roadmap for future work

**Trade-off:**
- Maintainability: Slightly lower (but still acceptable with feature isolation)
- Test Coverage: Can reach 80%+ in Phase 4 (more valuable)
- Launch Timeline: Faster (focus on critical path)

---

**Decision:** Proceed to Phase 4 (Test Coverage) unless user requests full refactoring.
