# Test Suite Analysis & Recommendations

## Current Issues

### 1. **Test-Code Mismatch**
**Problem:** The test file `tests/unit/tts-controller.test.js` tests a `TTSController` class that doesn't exist in the actual codebase.

**Evidence:**
- Test imports: `import { TTSController } from '../../src/engines/tts/tts-controller.js';`
- Actual implementation: `src/content/content-simple.js` (no class structure)
- No `src/engines/` directory exists

**Impact:** Tests pass/fail based on non-existent code, making results meaningless.

---

### 2. **Architecture Disconnect**
**Designed Architecture (from tests):**
```
TTSController class
  ├── DOMAdapter (dependency injection)
  ├── Settings object
  ├── Event system (on/emit)
  └── Methods: speak(), pause(), resume(), etc.
```

**Actual Implementation:**
```
content-simple.js (procedural)
  ├── Global settings object
  ├── Direct DOM manipulation
  ├── Direct speechSynthesis API calls
  └── Event listeners (click, keyboard)
```

---

### 3. **TTS Toggle Bug Root Cause**

After analysis, the TTS toggle issue is likely caused by:

1. **Extension Reload Required:** Chrome extensions sometimes require a full reload after updating:
   ```
   chrome://extensions → Find AssisT → Click reload button
   ```

2. **Storage Timing:** Content script loads before storage is fully initialized
   - Default: `enabled: false`
   - User toggles to `true`
   - Content script might not receive the update

3. **No Sync on Page Load:** When you navigate to a new page:
   - Content script reinitializes with defaults
   - Storage load is async and might complete after first click

**Fix Applied (commit 2a5e2b2):**
- Added visual toast feedback when TTS disabled
- Shows: "⚠️ TTS is disabled. Enable it in the popup to read text."
- This will help diagnose if storage is loading correctly

---

## Testing Strategy Recommendations

### Option 1: Manual Testing with Test Page (RECOMMENDED FOR NOW)
**Status:** ✅ Created `test-tts-toggle.html`

**Why:**
- Tests actual user behavior
- No test infrastructure needed
- Immediate feedback
- Tests real Chrome extension environment

**How to use:**
1. Load `test-tts-toggle.html` in Chrome
2. Follow test instructions on page
3. Check console for `[AssisT]` logs
4. Verify all 4 test cases pass

---

### Option 2: Rewrite Tests to Match Implementation
**Effort:** Medium (2-3 hours)
**Files to create:**
- `tests/unit/content-script.test.js` - Test actual content script
- `tests/integration/tts-toggle.test.js` - Test popup → content communication
- `tests/integration/context-menu.test.js` - Test context menu behavior

**Test Structure:**
```javascript
describe('Content Script TTS', () => {
  test('should not read when settings.enabled is false', () => {
    // Mock settings.enabled = false
    // Simulate click on paragraph
    // Assert: synth.speak not called
  });

  test('should show toast when clicking while disabled', () => {
    // Mock settings.enabled = false
    // Simulate click on paragraph
    // Assert: toast shown with warning message
  });
});
```

---

### Option 3: Implement Original Architecture
**Effort:** High (8-16 hours)
**Not recommended** - Current implementation works fine, refactoring adds risk

---

## Immediate Action Plan

### Step 1: Verify TTS Toggle with Test Page (5 minutes)
1. Open Chrome
2. Navigate to `file:///C:/Users/jones/AIprojects/AssitT/test-tts-toggle.html`
3. Open DevTools console (F12)
4. Follow test instructions
5. Report results:
   - ✓ TTS enabled: paragraphs read?
   - ✓ TTS disabled: warning toast shown?
   - ✓ Context menu appears/disappears correctly?
   - ✓ Console shows correct logs?

### Step 2: If Toggle Still Doesn't Work
**Debug checklist:**
```javascript
// In console, check storage:
chrome.storage.local.get('assist_settings', (result) => {
  console.log('TTS Enabled:', result.assist_settings?.tts?.enabled);
});

// Check content script state:
// Open console on any webpage, look for:
// [AssisT] Settings loaded, TTS enabled: true/false
```

### Step 3: Create Accurate Integration Tests (Later)
Once behavior is confirmed working:
1. Delete `tests/unit/tts-controller.test.js` (tests non-existent code)
2. Create new test files that match actual implementation
3. Use Playwright for E2E tests (already configured)
4. Test actual extension behavior, not mocked classes

---

## Why Tests Were Inaccurate

1. **Test-Driven Development Mistake:**
   - Tests were written for desired architecture
   - Implementation went a different (simpler) direction
   - Tests were never updated to match

2. **No Integration Tests:**
   - Unit tests mock everything
   - Never test real Chrome extension APIs
   - Can't catch storage timing issues

3. **Test Files Orphaned:**
   - Tests in `tests/unit/` don't run automatically
   - No CI/CD pipeline executing them
   - Failures go unnoticed

---

## Recommended Test Structure (Future)

```
tests/
├── manual/
│   └── test-tts-toggle.html (✅ Created)
│
├── integration/
│   ├── tts-click-to-read.test.js (Chrome extension E2E)
│   ├── tts-context-menu.test.js
│   ├── popup-settings-sync.test.js
│   └── storage-initialization.test.js
│
└── e2e/
    └── playwright/
        ├── user-workflows.spec.js
        └── accessibility.spec.js
```

---

## Summary

**Current State:**
- ❌ Unit tests test non-existent code
- ⚠️ TTS toggle fix applied but needs verification
- ✅ Manual test page created for immediate testing

**Next Steps:**
1. Use manual test page to verify TTS toggle works
2. Report actual behavior observed
3. Delete or rewrite unit tests to match implementation
4. Add integration tests for real Chrome extension behavior

**Priority:**
- 🔴 HIGH: Verify TTS toggle with manual test page
- 🟡 MEDIUM: Create integration tests that match implementation
- 🟢 LOW: Refactor to match original architecture (not recommended)
