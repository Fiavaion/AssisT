# AssisT Development Workflow & Best Practices

## 📊 Process Analysis: How We Got Here

### Initial State
- Extension had complex multi-file architecture that wasn't working
- Multiple features broken: TTS, highlighting, keyboard shortcuts, voice selection
- Race conditions and state management issues

### Iterative Problem-Solving Approach

#### Phase 1: Simplification (Complete Rewrite)
**Problem:** Complex architecture with multiple dependencies causing failures
**Action:** Created single-file `content-simple.js` with direct Web Speech API
**Result:** Basic functionality working but needed refinement
**Learning:** Start simple, add complexity only when needed

#### Phase 2: Systematic Bug Fixing
**Problems Identified:**
1. Highlighting not working
2. Voice selection not persisting
3. Keyboard shortcuts not responding
4. Spacebar pause/resume inconsistent
5. Settings not applying in real-time
6. Opacity not working

**Approach Used:**
- Fix one issue at a time
- Test after each fix
- Don't batch multiple fixes together
- Verify fix before moving to next issue

**Key Pattern:** Small, focused commits with clear descriptions

#### Phase 3: State Management Issues
**Problem:** Resume functionality unreliable
**Root Cause:** Dependency on unreliable browser API states
**Solution:** Manual state tracking (`isPaused` flag)
**Learning:** Don't trust external API state when you can manage it yourself

#### Phase 4: UI Refinement
**Problems:**
- UI too large (360px → 340px)
- Poor space utilization
- No clear feature hierarchy

**Actions:**
- Compacted all UI elements
- Created collapsible sections (TTS toggle, Highlight toggle)
- Added header buttons (Reset, Options)

**Learning:** Progressive disclosure - hide complexity until needed

### Success Factors

1. **Incremental Development:** Small changes, frequent testing
2. **Detailed Logging:** Console logs helped debug state issues
3. **Manual State Management:** Reduced dependency on unreliable APIs
4. **User Feedback Loop:** Fixed issues as reported, prioritized working functionality
5. **Clear Commits:** Each commit focused on one fix/feature

---

## 🏗️ Modular Development Guide for Future Features

### Core Principle: Feature Isolation

**Rule:** New features MUST NOT affect existing features unless there are clear performance advantages to integration.

### Feature Development Template

#### 1. Planning Phase

**Before writing any code:**

1. **Define the feature clearly**
   - What does it do?
   - What UI elements does it need?
   - What settings does it require?
   - Does it interact with existing features?

2. **Create a feature specification**
   ```markdown
   ## Feature: [Name]

   ### Purpose
   [Clear description]

   ### UI Components
   - [ ] Toggle switch in popup
   - [ ] Settings panel (collapsible)
   - [ ] Keyboard shortcuts (if any)

   ### Storage Requirements
   - `feature_enabled: boolean`
   - `feature_setting_1: type`
   - `feature_setting_2: type`

   ### Dependencies
   - None (isolated) OR
   - Shares [X] with [Y] because [performance reason]

   ### Files to Modify
   - `content-simple.js` - Add feature logic
   - `popup.html` - Add UI controls
   - `popup.css` - Add styles
   - `popup.js` - Add event handlers
   ```

3. **Add decision to project memory**
   - Document WHY you're adding this feature
   - Document architectural choices
   - Use Decision Log template in `projectmemory.md`

#### 2. Implementation Phase

**File Structure for New Features:**

```javascript
// ============================================
// FEATURE: [Feature Name]
// ============================================

// Feature state (isolated from other features)
let featureName_enabled = false;
let featureName_setting1 = defaultValue;
let featureName_setting2 = defaultValue;

// Feature initialization
function initFeatureName() {
  // Load settings
  chrome.storage.local.get('assist_settings', (result) => {
    if (result.assist_settings?.featureName) {
      featureName_enabled = result.assist_settings.featureName.enabled;
      featureName_setting1 = result.assist_settings.featureName.setting1;
      // ... load other settings
    }
  });
}

// Feature functionality
function featureName_doSomething() {
  if (!featureName_enabled) return; // Early exit if disabled

  // Feature logic here
}

// Feature event listeners
function setupFeatureName_listeners() {
  // Add event listeners specific to this feature
}

// Call initialization
initFeatureName();
setupFeatureName_listeners();

// ============================================
// END FEATURE: [Feature Name]
// ============================================
```

**Benefits:**
- Clear boundaries between features
- Easy to comment out entire feature for debugging
- No name collisions
- Easy to find all code related to a feature

#### 3. UI Integration Phase

**Popup Structure Pattern:**

```html
<!-- Feature Toggle -->
<section class="control-section">
  <div class="toggle-control">
    <label for="feature-enabled" class="toggle-label">
      <span class="label-text">Feature Name</span>
      <div class="toggle-switch">
        <input type="checkbox" id="feature-enabled" role="switch">
        <span class="toggle-slider"></span>
      </div>
    </label>
  </div>
</section>

<!-- Feature Options (hidden by default) -->
<div id="feature-options-container" class="feature-options-container hidden">
  <!-- Feature-specific controls go here -->
</div>
```

**JavaScript Pattern for Toggle:**

```javascript
// Feature toggle
const featureOptionsContainer = document.getElementById('feature-options-container');
const featureEnabled = document.getElementById('feature-enabled');

// Initialize visibility based on saved state
if (featureEnabled.checked) {
  featureOptionsContainer.classList.remove('hidden');
} else {
  featureOptionsContainer.classList.add('hidden');
}

// Handle toggle
featureEnabled.addEventListener('change', (e) => {
  this.settings.featureName.enabled = e.target.checked;
  this.saveSettings();

  // Show/hide options
  if (e.target.checked) {
    featureOptionsContainer.classList.remove('hidden');
  } else {
    featureOptionsContainer.classList.add('hidden');
  }

  // Notify content script
  this.sendCommandToTab('setFeature', { enabled: e.target.checked });
});
```

#### 4. Testing Phase

**Test Checklist:**

- [ ] Feature toggle on/off works
- [ ] Settings persist after popup close
- [ ] Settings persist after browser restart
- [ ] Feature doesn't affect existing features when disabled
- [ ] Feature doesn't affect existing features when enabled
- [ ] Keyboard shortcuts work (if applicable)
- [ ] Real-time settings updates work
- [ ] Feature works on various websites
- [ ] Console has no errors

#### 5. Documentation Phase

**Required Documentation:**

1. **Update CLAUDE.md** - Add feature to project context
2. **Update projectmemory.md** - Add decision log entry
3. **Update README.md** - Add feature to user documentation
4. **Add inline comments** - Explain non-obvious code

#### 6. Commit Phase

**Commit Message Format:**

```
feat(scope): short description

Detailed description of what was added:
- Feature toggle in popup
- Settings panel with X, Y, Z options
- Keyboard shortcuts: [list]
- Storage format: [describe]

Technical details:
- Uses manual state tracking for [reason]
- Isolated from existing features
- No dependencies on other features

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 🎯 Advanced Options Modal Pattern

### Purpose
The "Options" button in header opens a modal for advanced settings that don't need to be visible in the main popup.

### When to Use Advanced Options
- Settings used infrequently
- Power-user features
- Experimental features
- Feature visibility toggles

### Implementation Pattern

**Modal Structure:**
```javascript
showAdvancedOptions() {
  const modal = document.createElement('div');
  modal.id = 'advanced-options-modal';
  modal.className = 'modal-overlay';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Advanced Options</h2>
        <button id="close-modal" class="close-btn">×</button>
      </div>

      <div class="modal-body">
        <section class="modal-section">
          <h3>Feature Visibility</h3>
          <label>
            <input type="checkbox" id="show-feature-x"> Show Feature X in popup
          </label>
          <label>
            <input type="checkbox" id="show-feature-y"> Show Feature Y in popup
          </label>
        </section>

        <section class="modal-section">
          <h3>Advanced Settings</h3>
          <!-- Advanced settings here -->
        </section>
      </div>

      <div class="modal-footer">
        <button id="save-advanced">Save</button>
        <button id="cancel-advanced">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Handle save
  document.getElementById('save-advanced').addEventListener('click', () => {
    // Save settings
    this.saveAdvancedSettings();
    modal.remove();
  });

  // Handle close
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.id === 'close-modal' || e.target.id === 'cancel-advanced') {
      modal.remove();
    }
  });
}
```

**Storage Format:**
```javascript
{
  "assist_settings": {
    "tts": { /* existing TTS settings */ },
    "ui_visibility": {
      "show_feature_x": true,
      "show_feature_y": false
    },
    "advanced": {
      "experimental_features": false,
      "debug_mode": false
    }
  }
}
```

---

## 🔄 State Management Best Practices

### Lessons Learned

1. **Don't Trust External APIs for Critical State**
   - Browser APIs can be inconsistent
   - Maintain your own state when possible
   - Use API calls as actions, not state sources

2. **Single Source of Truth**
   ```javascript
   // ✅ Good: Manual state tracking
   let isPaused = false;

   function pause() {
     synth.pause();
     isPaused = true; // Update our state
   }

   function resume() {
     synth.resume();
     isPaused = false; // Update our state
   }

   // ❌ Bad: Relying on API state
   function togglePause() {
     if (synth.paused) { // Unreliable!
       synth.resume();
     } else {
       synth.pause();
     }
   }
   ```

3. **Reset State on Boundaries**
   - Reset on initialization
   - Reset on completion
   - Reset on errors
   - Reset when starting new operations

4. **Log State Changes**
   ```javascript
   console.log('[Feature] State changed:', {
     isPaused,
     currentElement: currentElement?.tagName,
     hasUtterance: !!currentUtterance
   });
   ```

---

## 🚀 Performance Considerations

### When to Share Code Between Features

**Share code when:**
1. Multiple features need the exact same data
2. Recomputing data is expensive (API calls, heavy processing)
3. Synchronization between features is required

**Keep separate when:**
1. Features are independent
2. State management becomes complex
3. Risk of coupling increases
4. Performance gain is minimal

**Example:**

```javascript
// ✅ Good: Shared expensive operation
let cachedVoices = null;

function getVoices() {
  if (!cachedVoices) {
    cachedVoices = synth.getVoices();
  }
  return cachedVoices;
}

// Both features use the cache
function feature1_setVoice() {
  const voices = getVoices(); // Uses cache
}

function feature2_listVoices() {
  const voices = getVoices(); // Uses same cache
}

// ❌ Bad: Unnecessary coupling
let sharedState = {
  feature1_data: null,
  feature2_data: null,
  feature1_enabled: false,
  feature2_enabled: false
};
// Now both features are tied to the same object
```

---

## 📝 Code Review Checklist

Before committing any new feature:

- [ ] Feature is properly isolated with clear boundaries
- [ ] State management is explicit and reliable
- [ ] UI toggle shows/hides options smoothly
- [ ] Settings persist correctly
- [ ] Console logs added for debugging
- [ ] No errors in console
- [ ] Existing features still work
- [ ] Code follows naming conventions (`featureName_function`)
- [ ] Comments explain WHY, not WHAT
- [ ] Commit message is descriptive
- [ ] Decision logged in projectmemory.md

---

## 🎓 Key Takeaways

1. **Start Simple:** Begin with minimal working version
2. **Iterate Incrementally:** Small changes, frequent tests
3. **Isolate Features:** Each feature should be self-contained
4. **Manage State Manually:** Don't rely on unreliable external state
5. **Progressive Disclosure:** Hide complexity behind toggles
6. **Document Decisions:** Future you will thank present you
7. **Test Thoroughly:** Each feature in isolation and together
8. **Commit Often:** Small, focused commits are easier to debug

---

## 📚 Reference: Current Working Patterns

### Pattern 1: Feature Toggle with Options
```
Toggle Switch → Shows/Hides Options Container → Options Control Feature
```

### Pattern 2: Keyboard Shortcuts
```
Check if typing in input → Check if feature active → Prevent default → Execute action → Show toast
```

### Pattern 3: Settings Sync
```
Popup changes setting → Save to storage → Storage listener in content script → Update feature state → Apply immediately if active
```

### Pattern 4: Manual State Tracking
```
Initialize state → Update on every action → Reset on boundaries → Use state for decisions (don't query API)
```

---

## 🔮 Future Development Roadmap

This workflow enables:
- Adding features without breaking existing ones
- Easy feature toggling for users
- Clean debugging (can isolate features)
- Performance optimization (features don't load if disabled)
- Maintenance (can update one feature without affecting others)

Remember: **Isolation first, integration only when necessary.**
