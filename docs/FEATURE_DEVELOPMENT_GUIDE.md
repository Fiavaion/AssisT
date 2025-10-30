# Feature Development Guide

## How to Safely Add New Features to AssisT

This guide helps you add new features without breaking existing functionality.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Safe Changes](#safe-changes)
3. [Dangerous Changes](#dangerous-changes)
4. [Feature Template](#feature-template)
5. [Testing Checklist](#testing-checklist)
6. [Common Pitfalls](#common-pitfalls)

---

## Architecture Overview

AssisT uses the **Orchestrator Pattern**:

```
content-simple.js (ORCHESTRATOR)
├── TTS Core (readText, settings, synth)
├── Click Handler
├── Keyboard Shortcuts
└── Module Initialization
    ↓ (dependency injection)
    ├── Canvas Module
    ├── Moodle Module
    ├── Google Classroom Module
    └── All Feature Modules
```

**Key Principle:** The orchestrator provides TTS infrastructure to all features.

---

## Safe Changes

### ✅ Add a New Feature Module

**Risk Level:** 🟢 **LOW** - Self-contained, can't break existing features

**Steps:**

1. Create module file in `src/features/yourFeature/`
2. Import in `content-simple.js`
3. Add Chrome storage listener
4. Build and test

**Example:**

```javascript
// src/features/highlightBookmarks/highlightBookmarks.js

let bookmarks_enabled = false;
let bookmarks_list = [];

function bookmarks_initialize() {
  if (!bookmarks_enabled) return;

  console.log('[Bookmarks] Initialized');
  // Your feature logic here
}

// Chrome storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings?.bookmarks?.enabled) {
    bookmarks_enabled = true;
    bookmarks_initialize();
  }
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings?.newValue?.bookmarks) {
    // Handle settings updates
  }
});

export { bookmarks_initialize };
```

```javascript
// In content-simple.js - just add one import
import '../features/highlightBookmarks/highlightBookmarks.js';
```

---

### ✅ Modify Feature Internals

**Risk Level:** 🟢 **LOW** - Changes isolated to one module

**Safe to modify:**
- Internal state variables
- Private functions (not exported)
- UI rendering logic
- Event listeners within the feature

**Example:**

```javascript
// Modify focusMode.js - safe changes
function focusMode_updateStyle() {
  // Change the focus window appearance
  focusMode_window.style.borderRadius = '20px'; // ← SAFE
  focusMode_window.style.borderColor = 'blue';  // ← SAFE
}
```

**Why safe?** Other modules don't depend on focusMode internals.

---

### ✅ Add New LMS Integration

**Risk Level:** 🟢 **LOW** - Independent module

**Steps:**

1. Create `src/features/lms/yourLms.js`
2. Follow Canvas/Moodle pattern
3. Load adapter dynamically
4. Initialize with dependencies

**Example:**

```javascript
// src/features/lms/blackboard.js
import { showToast } from '../../core/ui/toast.js';

let blackboard_enabled = false;
let readTextFunction = null;
let settingsObject = null;

export async function blackboard_initialize() {
  if (!blackboard_enabled) return;

  // Check if on Blackboard page
  if (!window.location.hostname.includes('blackboard')) return;

  console.log('[Blackboard] Initialized');
}

export function initializeBlackboardModule(readText, settings) {
  readTextFunction = readText;
  settingsObject = settings;
  console.log('[Blackboard] Dependencies injected');
}

// Chrome storage
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings?.blackboardIntegration?.enabled) {
    blackboard_enabled = true;
    blackboard_initialize();
  }
});
```

```javascript
// In content-simple.js
import { initializeBlackboardModule } from '../features/lms/blackboard.js';
initializeBlackboardModule(readText, settings);
```

---

### ✅ Add Optional Settings Properties

**Risk Level:** 🟡 **MEDIUM** - Test all features

**Safe pattern:**

```javascript
// In content-simple.js settings object
const settings = {
  enabled: false,
  highlightEnabled: true,
  // ... existing properties ...

  // ✅ SAFE: Add new optional properties
  autoScroll: false,        // New feature flag
  scrollSpeed: 1.0,         // New setting
  experimentalFeatures: {}, // Nested settings
};
```

**Why safe?** Existing modules ignore unknown properties.

**Testing required:**
- Verify existing features still work
- Check Chrome storage saves/loads correctly
- Test settings UI updates

---

## Dangerous Changes

### ❌ Change readText() Signature

**Risk Level:** 🔴 **HIGH** - Breaks ALL modules

**Don't do this:**

```javascript
// ❌ DANGEROUS - Changes function signature
function readText(text, element, speed, voice) {
  // This breaks Canvas, Moodle, Quiz Helper, etc.
}
```

**Why dangerous?** Every module calls `readText(text, element)`. Adding parameters breaks all of them.

**Safe alternative:**

```javascript
// ✅ SAFE - Use settings object for new options
function readText(text, element) {
  // Read from settings instead
  const speed = settings.customSpeed || settings.rate;
  const voice = settings.voice;
}
```

---

### ❌ Rename Settings Properties

**Risk Level:** 🔴 **HIGH** - Breaks dependency injection

**Don't do this:**

```javascript
// ❌ DANGEROUS - Renames property
settings.enabled → settings.isEnabled

// Canvas module still reads settings.enabled
if (!settingsObject.enabled) {  // ← Now undefined!
  return;
}
```

**Safe alternative:**

```javascript
// ✅ SAFE - Add new property, keep old one
const settings = {
  enabled: false,         // Keep for compatibility
  isEnabled: false,       // New property (optional)
};
```

---

### ❌ Remove Module Initialization

**Risk Level:** 🔴 **HIGH** - Modules can't access TTS

**Don't do this:**

```javascript
// ❌ DANGEROUS - Removes initialization
// initializeCanvasModule(readText, settings);
```

**Why dangerous?** Canvas module needs `readText` and `settings` to work.

---

## Feature Template

Use this template for new features:

```javascript
/**
 * @fileoverview [Feature Name] - [Brief Description]
 * @module features/[featureName]
 */

// ============================================================
// STATE
// ============================================================

let [featureName]_enabled = false;
let [featureName]_settings = {
  // Feature-specific settings
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Initialize [Feature Name]
 * @returns {void}
 */
function [featureName]_initialize() {
  if (![featureName]_enabled) {
    console.log(`[${featureName}] Not enabled`);
    return;
  }

  console.log(`[${featureName}] Initializing...`);

  // Your initialization logic

  console.log(`[${featureName}] Initialized successfully`);
}

/**
 * Cleanup [Feature Name]
 * @returns {void}
 */
function [featureName]_cleanup() {
  // Remove event listeners
  // Reset state
  console.log(`[${featureName}] Cleanup complete`);
}

// ============================================================
// CHROME STORAGE INTEGRATION
// ============================================================

// Load settings on init
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.[featureName]) {
    const settings = result.assist_settings.[featureName];
    [featureName]_enabled = settings.enabled || false;

    // Load other settings
    [featureName]_settings = {
      ...[featureName]_settings,
      ...settings
    };

    if ([featureName]_enabled) {
      [featureName]_initialize();
    }

    console.log(`[${featureName}] Settings loaded:`, [featureName]_enabled);
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.[featureName]) {
    const settings = changes.assist_settings.newValue.[featureName];
    const wasEnabled = [featureName]_enabled;
    const newEnabled = settings.enabled || false;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      [featureName]_enabled = true;
      [featureName]_initialize();
    } else if (!newEnabled && wasEnabled) {
      [featureName]_enabled = false;
      [featureName]_cleanup();
    }

    console.log(`[${featureName}] Settings updated:`, newEnabled);
  }
});

// ============================================================
// EXPORTS
// ============================================================

export {
  [featureName]_initialize,
  [featureName]_cleanup
};
```

---

## Testing Checklist

Before committing changes, verify:

### Build Test
```bash
npx vite build
# Should complete in ~600ms
# Bundle size should stay around 74-75 KB
```

### Chrome Extension Test
1. Load `.vite/` folder in `chrome://extensions/`
2. **TTS Core:** Click paragraph → Does it read?
3. **Keyboard:** Space → Pause/resume work?
4. **Speed:** +/- → Speed changes?
5. **Canvas:** Visit Canvas page → FAB appears?
6. **New Feature:** Your feature works?

### Console Check
```javascript
// Should see initialization logs
[AssisT] Content script loaded
[Canvas] Settings loaded
[YourFeature] Initialized
```

### Settings Test
1. Open extension popup
2. Toggle your feature on/off
3. Verify it enables/disables without page reload

---

## Common Pitfalls

### Pitfall 1: Forgetting to Import

**Problem:**
```javascript
// Created feature but forgot to import
// Feature never initializes!
```

**Solution:**
```javascript
// In content-simple.js
import '../features/myFeature/myFeature.js'; // ← Don't forget!
```

---

### Pitfall 2: Circular Dependencies

**Problem:**
```javascript
// focusMode.js imports readingGuide.js
// readingGuide.js imports focusMode.js
// → Build error!
```

**Solution:**
```javascript
// Use events or shared state instead
// See focusMode/readingGuide for working example
```

---

### Pitfall 3: Modifying Global State

**Problem:**
```javascript
// In your feature
settings.enabled = false; // ← DANGER! Disables TTS for everyone!
```

**Solution:**
```javascript
// Use your own state
myFeature_enabled = false; // ← SAFE: Only affects your feature
```

---

### Pitfall 4: Not Handling Settings Changes

**Problem:**
```javascript
// Only loads settings on init
// User changes settings in popup → Feature doesn't update!
```

**Solution:**
```javascript
// Always add storage change listener
chrome.storage.onChanged.addListener(changes => {
  // Handle real-time updates
});
```

---

## Need Help?

- **Architecture:** See `src/content/content-simple.js` file header
- **Examples:** Look at `canvas.js`, `focusMode.js`, `stt.js`
- **Build Issues:** Check Vite output for errors
- **Testing:** Follow the testing checklist above

---

**Last Updated:** 2025-10-30
**Version:** 1.0.0
