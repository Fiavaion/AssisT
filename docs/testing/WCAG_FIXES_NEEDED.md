# WCAG 2.2 Level AA - Fixes Needed

**AssisT Extension - Accessibility Remediation Guide**

**Report Date:** 2025-11-28
**Total Issues:** 6 (2 Critical, 2 High, 2 Medium)

---

## Priority 0: CRITICAL (Required for Compliance)

### 1. Fix Target Size for Interactive Elements (SC 2.5.8)

**WCAG Criterion:** 2.5.8 Target Size (Minimum) - Level AA (NEW in 2.2)
**Severity:** CRITICAL
**Impact:** Users with motor impairments cannot reliably tap/click small buttons
**Estimated Effort:** 2-3 hours

#### Current Issues

**Files Affected:**

- `src/popup/popup.html` (lines 14-45, 199-230, 1102-1174)
- `src/popup/popup.css` (lines 68-90, 300-340)

#### Issue 1: Header Buttons (Reset, Help, Settings)

**Current Code (popup.css lines 68-76):**

```css
.header-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 4px 8px; /* ❌ Results in ~20x24px */
  cursor: pointer;
  transition: var(--transition);
  color: white;
}
```

**Current Icon Size (popup.css line 87-90):**

```css
.header-btn-icon {
  font-size: 16px; /* ❌ Too small */
  display: block;
}
```

**FIX - Update popup.css:**

```css
.header-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 8px 10px; /* ✓ Increased padding */
  min-width: 44px; /* ✓ ADDED: Ensures 24px minimum (44px for comfort) */
  min-height: 44px; /* ✓ ADDED: Ensures 24px minimum */
  cursor: pointer;
  transition: var(--transition);
  color: white;
  display: flex; /* ✓ ADDED: Center icon properly */
  align-items: center;
  justify-content: center;
}

.header-btn-icon {
  font-size: 20px; /* ✓ Increased from 16px */
  display: block;
}
```

---

#### Issue 2: Speed Preset Buttons (0.5x, 1.0x, 1.5x, 2.0x)

**Current Code (popup.html lines 199-230):**

```html
<button class="preset-btn" data-speed="0.5" aria-label="Set speed to 0.5x">0.5x</button>
```

**Current CSS (likely in popup.css - not explicitly defined):**

```css
/* ❌ MISSING: No explicit sizing for .preset-btn */
.preset-btn {
  /* Defaults to content size, likely ~40x20px */
}
```

**FIX - Add to popup.css:**

```css
.preset-btn {
  padding: 8px 12px; /* ✓ Adequate padding */
  min-width: 60px; /* ✓ Wider for text "1.5x" */
  min-height: 44px; /* ✓ WCAG compliant height */
  border: 2px solid var(--border);
  border-radius: var(--border-radius);
  background: white;
  color: var(--text-primary);
  font-size: 13px; /* ✓ Slightly larger than current */
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.preset-btn:hover {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.preset-btn:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

---

#### Issue 3: Vocabulary Preset Chips (Medical, Legal, Academic, STEM)

**Current Code (popup.html lines 1102-1174):**

```html
<button
  type="button"
  id="vocab-preset-medical"
  class="preset-chip"
  data-preset="medical"
  aria-pressed="false"
  style="
    padding: 4px 10px;           /* ❌ Too small */
    border-radius: 16px;
    border: 1px solid #ddd;
    background: #f5f5f5;
    font-size: 11px;             /* ❌ Small text */
    cursor: pointer;
  "
>
  🏥 Medical
</button>
```

**FIX - Replace inline styles with CSS class:**

**HTML Update:**

```html
<button
  type="button"
  id="vocab-preset-medical"
  class="preset-chip"
  data-preset="medical"
  aria-pressed="false"
>
  🏥 Medical
</button>
```

**CSS Addition (popup.css):**

```css
.preset-chip {
  padding: 10px 16px; /* ✓ Increased from 4px 10px */
  min-height: 44px; /* ✓ WCAG compliant */
  border-radius: 22px; /* ✓ Adjusted for larger size */
  border: 2px solid var(--border); /* ✓ Thicker border for better visibility */
  background: var(--surface);
  font-size: 13px; /* ✓ Increased from 11px */
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex; /* ✓ Better alignment */
  align-items: center;
  gap: 6px; /* ✓ Space between emoji and text */
}

.preset-chip:hover {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.preset-chip:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.preset-chip[aria-pressed='true'] {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-dark);
}
```

---

#### Issue 4: Profile Action Buttons (Export/Import)

**Current Code (popup.html lines 83-100):**

```html
<button
  id="btn-export-profiles"
  class="profile-action-btn"
  title="Export all profiles"
  aria-label="Export profiles"
>
  <span>📤</span>
  <!-- ❌ Icon-only, likely too small -->
</button>
```

**FIX - Add CSS for profile-action-btn:**

```css
.profile-action-btn {
  min-width: 44px; /* ✓ WCAG compliant */
  min-height: 44px; /* ✓ WCAG compliant */
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: var(--border-radius);
  background: white;
  color: var(--text-primary);
  font-size: 16px; /* ✓ Larger icon */
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-action-btn:hover {
  border-color: var(--primary-color);
  background: var(--primary-light);
  transform: translateY(-2px);
}

.profile-action-btn:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

---

#### Verification Checklist

After implementing fixes, verify:

- [ ] Header buttons (Reset, Help, Settings) are **44x44px**
- [ ] Speed preset buttons (0.5x, 1.0x, etc.) are **≥60x44px**
- [ ] Vocabulary chips are **≥44px height**
- [ ] Profile export/import buttons are **44x44px**
- [ ] All buttons are keyboard accessible (Tab + Enter/Space)
- [ ] All buttons have visible focus indicators
- [ ] Mobile testing: Touch targets feel comfortable on phone

**Testing Tool:** Use browser DevTools to inspect computed dimensions:

```javascript
// In console:
document.querySelectorAll('.header-btn').forEach(btn => {
  const rect = btn.getBoundingClientRect();
  console.log(`${btn.id || btn.className}: ${rect.width}x${rect.height}`);
});
```

---

## Priority 1: HIGH (Significant Accessibility Improvement)

### 2. Improve Text Contrast for Small Text (SC 1.4.3)

**WCAG Criterion:** 1.4.3 Contrast (Minimum) - Level AA
**Severity:** HIGH
**Impact:** Users with low vision cannot read small text
**Estimated Effort:** 1-2 hours

#### Current Issues

**Color Variables (popup.css lines 12-13):**

```css
--text-primary: #212121; /* ✓ 16.1:1 contrast - GOOD */
--text-secondary: #757575; /* ❌ 4.6:1 contrast - INSUFFICIENT for <14px text */
```

**WCAG Requirement:**

- Text ≥18pt (24px) or ≥14pt bold (18.66px): **4.5:1 minimum**
- Text <18pt (24px): **7:1 minimum**

#### Issue 1: Section Titles (11px, uppercase)

**Current Code (popup.css lines 171-177):**

```css
.section-title {
  font-size: 11px; /* ❌ Small text */
  font-weight: 600;
  color: var(--text-secondary); /* ❌ #757575 = 4.6:1 (needs 7:1) */
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
```

**FIX:**

```css
.section-title {
  font-size: 12px; /* ✓ Slightly larger for readability */
  font-weight: 600;
  color: #5f6368; /* ✓ CHANGED: 7.0:1 contrast ratio */
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}
```

---

#### Issue 2: Feature Descriptions

**Current Code (popup.html line 514):**

```html
<p class="feature-description">Extract text from PDFs, images, and screenshots</p>
```

**CSS (likely):**

```css
.feature-description {
  font-size: 11px; /* ❌ Small text */
  color: var(--text-secondary); /* ❌ 4.6:1 (needs 7:1) */
}
```

**FIX:**

```css
.feature-description {
  font-size: 12px; /* ✓ Increased */
  color: #5f6368; /* ✓ 7.0:1 contrast */
  line-height: 1.5;
  margin-top: 4px;
}
```

---

#### Issue 3: Button Text (10px)

**Current Code (popup.css lines 357-359):**

```css
.btn-text {
  font-size: 10px; /* ❌ Very small */
}
```

**FIX:**

```css
.btn-text {
  font-size: 11px; /* ✓ Increased minimum */
  line-height: 1.3;
}
```

---

#### Issue 4: Slider Labels

**Current Code (popup.css lines 437-443):**

```css
.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 10px; /* ❌ Small text */
  color: var(--text-secondary); /* ❌ 4.6:1 */
}
```

**FIX:**

```css
.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 11px; /* ✓ Increased */
  color: #5f6368; /* ✓ 7.0:1 contrast */
  font-weight: 500; /* ✓ Added weight for clarity */
}
```

---

#### Color Variable Update

**Update popup.css root variables (line 13):**

```css
:root {
  --primary-color: #2196f3;
  --primary-dark: #1976d2;
  --primary-light: #bbdefb;
  --accent-color: #ffeb3b;
  --text-primary: #212121;
  --text-secondary: #5f6368; /* ✓ CHANGED from #757575 (now 7.0:1) */
  --text-tertiary: #757575; /* ✓ ADDED for non-critical text ≥14px */
  --background: #ffffff;
  --surface: #f5f5f5;
  --border: #e0e0e0;
  --success: #4caf50;
  --warning: #ff9800;
  --error: #f44336;
}
```

---

#### Verification Checklist

After implementing fixes, verify contrast ratios using:

- **WebAIM Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **Chrome DevTools:** Inspect element → Styles → Color picker shows contrast ratio

**Test Cases:**

- [ ] Section titles (`#5f6368` on `#ffffff`) = **7.0:1** ✓
- [ ] Feature descriptions (`#5f6368` on `#ffffff`) = **7.0:1** ✓
- [ ] Button text (11px minimum)
- [ ] Slider labels (`#5f6368` on `#ffffff`) = **7.0:1** ✓

---

### 3. Increase UI Component Border Contrast (SC 1.4.11)

**WCAG Criterion:** 1.4.11 Non-text Contrast - Level AA
**Severity:** HIGH
**Impact:** Users with low vision cannot distinguish form controls
**Estimated Effort:** 1 hour

#### Current Issues

**Border Color (popup.css line 16):**

```css
--border: #e0e0e0; /* ❌ 1.3:1 contrast on white (needs 3:1) */
```

**WCAG Requirement:**

- UI components and graphical objects: **3:1 minimum contrast**

#### Issue 1: Form Input Borders

**Current Code (popup.css lines 363-372):**

```css
.voice-select {
  width: 100%;
  padding: var(--spacing-sm);
  border: 2px solid var(--border); /* ❌ #e0e0e0 = 1.3:1 */
  border-radius: var(--border-radius);
  background: white;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}
```

**FIX - Update border color variable:**

```css
:root {
  /* ... existing variables ... */
  --border: #959595; /* ✓ CHANGED: 3.0:1 contrast ratio */
  --border-light: #d0d0d0; /* ✓ ADDED: 2.0:1 for decorative borders */
}
```

**No code changes needed** - All components using `var(--border)` will update automatically.

---

#### Issue 2: Slider Track

**Current Code (popup.css lines 389-398):**

```css
.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--surface); /* ❌ #f5f5f5 = 1.04:1 */
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
```

**FIX:**

```css
.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #d0d0d0; /* ✓ CHANGED: 2.0:1 contrast (acceptable for inactive state) */
  border: 1px solid var(--border); /* ✓ ADDED: Border for better definition */
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
```

---

#### Issue 3: Toggle Switch (Inactive State)

**Current Code (popup.css lines 258-268):**

```css
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--border); /* ❌ 1.3:1 in inactive state */
  transition: var(--transition);
  border-radius: 24px;
}
```

**FIX:**

```css
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #b0b0b0; /* ✓ CHANGED: 2.5:1 contrast */
  border: 1px solid var(--border); /* ✓ ADDED: Border for clarity */
  transition: var(--transition);
  border-radius: 24px;
}
```

---

#### Verification Checklist

- [ ] Input borders (`#959595` on white) = **3.0:1** ✓
- [ ] Slider track visible against white background
- [ ] Toggle switch (inactive) distinguishable from background
- [ ] Button borders meet 3:1 contrast

**Testing:**
Use **Chrome DevTools Accessibility Panel:**

1. Inspect element
2. Click "Accessibility" tab
3. Check "Contrast" section shows ✓ for all states

---

## Priority 2: MEDIUM (Enhances User Experience)

### 4. Add Non-Color Indicators to Color-Coded Features (SC 1.4.1)

**WCAG Criterion:** 1.4.1 Use of Color - Level A
**Severity:** MEDIUM
**Impact:** Colorblind users cannot distinguish status by color alone
**Estimated Effort:** 2-3 hours

#### Issue 1: Highlight Color Selector

**Current Code (popup.html lines 311-325):**

```html
<select id="highlight-color" aria-label="Select highlight color">
  <option value="#FFFF00">Yellow (High Contrast)</option>
  <option value="#FFEB3B">Bright Yellow</option>
  <option value="#FFD700">Gold</option>
  <!-- ... more color options ... -->
</select>
```

**FIX - Add visual pattern swatches:**

**HTML Update:**

```html
<select id="highlight-color" aria-label="Select highlight color">
  <option value="#FFFF00">⬛ Yellow (High Contrast)</option>
  <option value="#FFEB3B">▓ Bright Yellow</option>
  <option value="#FFD700">▒ Gold</option>
  <option value="#90EE90">░ Light Green</option>
  <option value="#87CEEB">◈ Sky Blue</option>
  <option value="#FFB6C1">◇ Light Pink</option>
  <option value="#DDA0DD">◆ Plum</option>
  <option value="#F0E68C">● Khaki</option>
</select>
```

**Better Solution - Add color preview with pattern:**

Create custom dropdown with visual swatches (requires JS):

```html
<div class="color-picker-container">
  <button class="color-picker-button" aria-label="Select highlight color">
    <span class="color-swatch" style="background: #FFFF00;"></span>
    <span>Yellow (High Contrast)</span>
    <span class="dropdown-icon">▼</span>
  </button>
  <div class="color-picker-dropdown" hidden>
    <button class="color-option" data-color="#FFFF00">
      <span class="color-swatch solid-pattern" style="background: #FFFF00;"></span>
      <span class="color-name">Yellow (High Contrast)</span>
      <span class="pattern-indicator">Solid</span>
    </button>
    <button class="color-option" data-color="#90EE90">
      <span class="color-swatch stripe-pattern" style="background: #90EE90;"></span>
      <span class="color-name">Light Green</span>
      <span class="pattern-indicator">Stripes</span>
    </button>
    <!-- More options with different patterns -->
  </div>
</div>
```

**CSS for patterns:**

```css
.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid var(--border);
}

.stripe-pattern {
  background: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor 2px,
    transparent 2px,
    transparent 6px
  ) !important;
}

.dot-pattern {
  background: radial-gradient(circle, currentColor 1px, transparent 1px);
  background-size: 4px 4px;
}
```

---

#### Issue 2: Dyslexia Mode Color Features

**Current Implementation:** Three modes (Bionic, Syllable, Grammar) differentiated by color

**FIX - Add icons to each mode:**

**HTML Update (popup.html lines 434-467):**

```html
<label class="toggle-label" style="cursor: pointer">
  <input type="radio" name="dyslexia-feature" id="dyslexia-bionic" value="bionic" checked />
  <span class="label-text">
    <span class="mode-icon">🔤</span>
    Bionic Reading
    <span class="mode-description">(Bold prefixes)</span>
  </span>
</label>

<label class="toggle-label" style="cursor: pointer">
  <input type="radio" name="dyslexia-feature" id="dyslexia-syllable" value="syllable" />
  <span class="label-text">
    <span class="mode-icon">📝</span>
    Syllable Colors
    <span class="mode-description">(Alternating patterns)</span>
  </span>
</label>

<label class="toggle-label" style="cursor: pointer">
  <input type="radio" name="dyslexia-feature" id="dyslexia-grammar" value="grammar" />
  <span class="label-text">
    <span class="mode-icon">🎨</span>
    Grammar Colors
    <span class="mode-description">(Part of speech)</span>
  </span>
</label>
```

**CSS Addition:**

```css
.mode-description {
  font-size: 10px;
  color: var(--text-tertiary);
  font-style: italic;
  margin-left: 4px;
}

.mode-icon {
  margin-right: 6px;
  font-size: 14px;
}
```

---

#### Verification Checklist

- [ ] Color picker shows pattern indicators (not just color names)
- [ ] Dyslexia modes have text descriptions beyond color
- [ ] Status indicators combine icon + color (e.g., ✓ + green)
- [ ] Test with grayscale filter: Features still distinguishable

**Testing with Colorblind Simulation:**

- Use Chrome DevTools → Rendering → "Emulate vision deficiencies"
- Test: Protanopia, Deuteranopia, Tritanopia
- Verify: All states distinguishable without color

---

### 5. Add aria-live to Status Messages (SC 4.1.3)

**WCAG Criterion:** 4.1.3 Status Messages - Level AA
**Severity:** MEDIUM
**Impact:** Screen reader users miss dynamic status updates
**Estimated Effort:** 1 hour

#### Current Status

**Inference:** Status indicators exist (popup.css lines 452-478) but may lack `aria-live`

#### FIX - Add ARIA live regions

**Verify toast.js implementation (src/core/ui/toast.js):**

**Expected Code:**

```javascript
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status'); // ✓ REQUIRED
  toast.setAttribute('aria-live', 'polite'); // ✓ REQUIRED
  toast.setAttribute('aria-atomic', 'true'); // ✓ RECOMMENDED
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
```

**For TTS status indicator:**

**HTML Addition (popup.html, after line 445):**

```html
<div id="tts-status-live" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
  <!-- Dynamically updated by JS -->
</div>
```

**JavaScript Update (popup.js):**

```javascript
function updateTTSStatus(status) {
  const statusLive = document.getElementById('tts-status-live');
  const statusIndicator = document.querySelector('.status-indicator');

  // Visual update
  statusIndicator.className = `status-indicator ${status}`;
  statusIndicator.textContent = statusMessages[status];

  // Screen reader announcement
  statusLive.textContent = `TTS status: ${statusMessages[status]}`;
}
```

**CSS for screen-reader-only content:**

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

#### Verification Checklist

- [ ] Toast notifications have `role="status"` and `aria-live="polite"`
- [ ] TTS status changes announce to screen readers
- [ ] STT confidence feedback uses `aria-live` for score updates
- [ ] Error messages use `aria-live="assertive"` for critical alerts

**Testing:**

- Enable screen reader (NVDA, JAWS, VoiceOver)
- Trigger status changes (enable TTS, change settings)
- Verify announcements occur without focus movement

---

### 6. Verify Custom Vocabulary Persistence (SC 3.3.7)

**WCAG Criterion:** 3.3.7 Redundant Entry - Level A (NEW in 2.2)
**Severity:** MEDIUM
**Impact:** Users must re-enter custom words repeatedly
**Estimated Effort:** 1 hour (verification + testing)

#### Current Implementation

**File:** `src/features/stt/validation.js` (referenced in audit)

**Expected Behavior:**

- Custom vocabulary auto-saves after each addition
- Imported words persist across sessions
- Profile export includes custom vocabulary

#### Verification Steps

1. **Check storage adapter** (src/features/annotations/storage-adapter.js):
   - Verify `addWord()` method commits to storage immediately
   - Verify `getWords()` retrieves from persistent storage

2. **Check auto-save** (popup.html line 1078):

   ```html
   <input type="checkbox" id="stt-auto-learn" data-testid="stt-auto-learn-toggle" checked />
   ```

   - Verify this setting is respected in JS
   - Verify corrections auto-add to vocabulary when enabled

3. **Check import/export** (popup.html lines 1217-1236):
   - Verify exported JSON includes `customVocabulary` array
   - Verify import pre-populates vocabulary list

#### FIX - If issues found

**Ensure auto-save on word addition:**

```javascript
// In vocabulary management JS
async function addCustomWord(word) {
  if (!word || word.trim().length === 0) {
    return false;
  }

  const trimmedWord = word.trim().toLowerCase();

  // Check if already exists
  const existing = await storageAdapter.getCustomVocabulary();
  if (existing.includes(trimmedWord)) {
    showToast(`"${word}" already in vocabulary`, 'info');
    return false;
  }

  // Add to storage immediately (no manual save required)
  await storageAdapter.addCustomWord(trimmedWord);

  // Update UI
  updateVocabularyCount();
  showToast(`Added "${word}" to vocabulary`, 'success');

  return true;
}
```

**Ensure import pre-fills all fields:**

```javascript
async function importProfile(profileData) {
  // Import settings
  await chrome.storage.local.set({ assist_settings: profileData.settings });

  // Import custom vocabulary (CRITICAL)
  if (profileData.customVocabulary && Array.isArray(profileData.customVocabulary)) {
    for (const word of profileData.customVocabulary) {
      await storageAdapter.addCustomWord(word);
    }
    showToast(`Imported ${profileData.customVocabulary.length} custom words`, 'success');
  }

  // Update UI
  await loadSettings();
  updateVocabularyCount();
}
```

---

#### Verification Checklist

- [ ] Add custom word → Close extension → Reopen → Word persists
- [ ] Enable auto-learn → Make correction → Word added automatically
- [ ] Export profile → Import on different machine → Custom words included
- [ ] No duplicate entry prompts for existing words

**Testing:**

1. Add 5 custom words manually
2. Export profile
3. Clear extension data (chrome://extensions → Remove)
4. Reinstall extension
5. Import profile
6. Verify all 5 words present

---

## Summary

| Priority | Issue                  | WCAG Criterion | Effort | Status     |
| -------- | ---------------------- | -------------- | ------ | ---------- |
| P0       | Target Size            | 2.5.8          | 2-3h   | ⏳ Pending |
| P1       | Text Contrast          | 1.4.3          | 1-2h   | ⏳ Pending |
| P1       | UI Border Contrast     | 1.4.11         | 1h     | ⏳ Pending |
| P2       | Color Indicators       | 1.4.1          | 2-3h   | ⏳ Pending |
| P2       | ARIA Live Regions      | 4.1.3          | 1h     | ⏳ Pending |
| P2       | Vocabulary Persistence | 3.3.7          | 1h     | ⏳ Pending |

**Total Estimated Effort:** 8-12 hours

---

## Implementation Order

### Phase 1: Critical Compliance (P0)

1. Fix target sizes (all buttons to 44x44px minimum)
2. Test with touch devices and keyboard navigation

### Phase 2: High-Priority Accessibility (P1)

3. Update color variables for text contrast (7:1 for small text)
4. Update border colors for UI component contrast (3:1)
5. Run contrast checker on all components

### Phase 3: Enhanced Experience (P2)

6. Add non-color indicators to color features
7. Implement aria-live regions for status updates
8. Verify vocabulary persistence and auto-save

### Phase 4: Verification

9. Full WCAG 2.2 Level AA audit using automated tools (axe DevTools)
10. Manual keyboard navigation testing
11. Screen reader testing (NVDA + VoiceOver)
12. Colorblind simulation testing

---

## Automated Testing Tools

**Recommended:**

- **axe DevTools** (Chrome extension) - Comprehensive WCAG checker
- **WAVE** (WebAIM) - Visual accessibility audit
- **Lighthouse** (Chrome DevTools) - Accessibility score + recommendations
- **Pa11y** (CLI) - Automated regression testing

**Run after fixes:**

```bash
npm install -g pa11y
pa11y --standard WCAG2AA --reporter html http://localhost:3000 > audit-results.html
```

---

## Acceptance Criteria

All fixes are complete when:

- [ ] All buttons meet 24x24px minimum (44x44px preferred)
- [ ] All text <14px meets 7:1 contrast ratio
- [ ] All UI components meet 3:1 contrast ratio
- [ ] Color-coded features have non-color indicators
- [ ] Status changes announce to screen readers
- [ ] Custom vocabulary persists across sessions
- [ ] axe DevTools reports 0 critical/serious issues
- [ ] Lighthouse accessibility score ≥95
- [ ] Manual keyboard navigation test passes
- [ ] Screen reader test (NVDA) passes

---

**Document Version:** 1.0
**Last Updated:** 2025-11-28
**Next Review:** After fixes implemented
