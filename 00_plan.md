# Testing Results Fixes & Improvements Plan

**Date:** 2026-01-17
**Based on:** `000_ncad-testing-results.md` (41 failed features out of 83 tested)
**Deferred Items:** See `00_defered.md`
**Approach:** Comprehensive overhaul with coordinated sub-agent implementation

---

## Summary

Addresses 41 failed features through:
1. **Critical Bug Fixes** (4): Reset button, organize pencil tool, microphone visibility, TTS highlighting
2. **Feature Removals** (5): HM Read Aloud/Copy, Dictionary/Translation toggles
3. **Advanced Settings Overhaul**: New AI tab, secure API storage, tab reorganization
4. **AI Integration**: Enable AI in quick actions, Local/Cloud toggle
5. **Feature Labeling** (6): ALPHA/BETA/EXPERIMENTAL badges
6. **Keyboard Shortcuts**: Remove defaults, add conflict UI
7. **Documentation**: GitHub README

---

## Phase 0: Create Checkpoint

**Before any implementation:**
```bash
git checkout -b testing-fixes-checkpoint
git push origin testing-fixes-checkpoint
git checkout ui-overhaul  # Or: git checkout -b testing-fixes
```

**Purpose:** Rollback point if changes break extension

---

## Phase 1: Critical Bug Fixes

### 1.1 Reset Button Fix
**File:** `src/popup/popup.js` (lines 1698-1715)

**Issue:** Only resets `settings.tts`, ignores all other settings

**Solution:**
```javascript
async resetToDefaults() {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;

  // Get default settings from settings-manager
  const { DEFAULT_SETTINGS } = await import('../core/storage/settings-manager.js');

  // Reset to defaults
  this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  // Save and reload
  await this.saveSettings();
  window.location.reload();
}
```

**Test:** Enable features, click reset, verify all toggles return to off

---

### 1.2 Organize Mode Pencil Tool Fix
**File:** `src/popup/popup.js` (lines 291-346)

**Issue:** `editSectionTitle()` fails when `.accordion-title-text` doesn't exist

**Current code:**
```javascript
const titleTextSpan = section.querySelector('.accordion-title-text');
if (!titleTextSpan) return; // BUG: Silently fails
```

**Solution:**
```javascript
editSectionTitle(sectionId) {
  const section = document.querySelector(`[data-section="${sectionId}"]`);
  let titleTextSpan = section.querySelector('.accordion-title-text');

  // Create span if missing
  if (!titleTextSpan) {
    const titleSpan = section.querySelector('.accordion-title');
    const titleText = titleSpan.childNodes[1]; // Text node after icon
    titleTextSpan = document.createElement('span');
    titleTextSpan.className = 'accordion-title-text';
    titleTextSpan.textContent = titleText.textContent.trim();
    titleSpan.replaceChild(titleTextSpan, titleText);
  }

  // Rest of implementation unchanged...
}
```

**Test:** Enter organize mode, click pencil, rename section

---

### 1.3 Microphone Button Visibility
**Files:**
- `src/popup/popup.html` (line 1127)
- `src/ui/components/microphone-button.js`
- `src/features/stt/stt.js`

**Issue:** Microphone button not appearing despite toggle being enabled

**Investigation needed:**
1. Check if STT enabled (`stt-enabled` checkbox)
2. Verify `floatingButton: true` in storage
3. Check CSS `.assist-stt-mic-button` display rules
4. Verify content script loads microphone-button.js

**Solution (via sub-agent):**
- Launch Explore agent to diagnose exact cause
- Likely CSS z-index or display:none issue
- May need to ensure microphone-button.js initializes after DOM ready

---

### 1.4 Word-by-Word Highlighting Speed
**File:** `src/core/dom/highlighting.js` (lines 101-142)

**Issue:** Uses fixed 150 WPM, doesn't sync with actual TTS rate

**Current:**
```javascript
const baseWordsPerMinute = 150;
const adjustedWordsPerMinute = baseWordsPerMinute * rate;
const msPerWord = (60 * 1000) / adjustedWordsPerMinute;
```

**Solution:** Use TTS `onboundary` events instead of estimation
```javascript
// In tts-controller.js, expose boundary events
utterance.addEventListener('boundary', (event) => {
  if (event.name === 'word') {
    // Emit event with word index and timestamp
    this.emit('word-boundary', {
      charIndex: event.charIndex,
      charLength: event.charLength,
      elapsedTime: event.elapsedTime
    });
  }
});

// In highlighting.js, listen to actual TTS timing
ttsController.on('word-boundary', (data) => {
  this.highlightWordAtIndex(data.charIndex, data.charLength);
});
```

**Test:** Set TTS speed to 0.5x, 1x, 2x - verify highlighting syncs

---

## Phase 2: Feature Removals

### 2.1 Remove HM Read Aloud
**File:** `src/features/highlightMenu/highlightMenu.js` (lines 293-300)

**Action:** Remove TTS button from highlight menu toolbar

**Code to remove:**
```javascript
if (highlightMenu_settings.showTTS) {
  allButtons.push({
    id: 'tts',
    icon: '🔊',
    label: 'Read',
    fullLabel: 'Read Aloud (TTS)',
    action: highlightMenu_handleTTS,
  });
}
```

**Also remove:** `showTTS: true` from settings (line 33)

---

### 2.2 Remove HM Copy
**File:** `src/features/highlightMenu/highlightMenu.js` (lines 329-337)

**Action:** Remove Copy button from highlight menu

**Code to remove:**
```javascript
if (highlightMenu_settings.showCopy) {
  allButtons.push({
    id: 'copy',
    icon: '📋',
    label: 'Copy',
    fullLabel: 'Copy Text',
    action: highlightMenu_handleCopy,
  });
}
```

**Also remove:** `showCopy: true` from settings (line 35)

---

### 2.3 Remove Dictionary/Translation Toggles
**Files:**
- `src/popup/popup.html` (Look Up Words section, lines ~1332-1604)
- `src/popup/popup.js` (Event listeners for dictionary/translation toggles)

**Action:** Remove standalone toggles from popup, **keep quick actions menu versions**

**Strategy:**
1. Search popup.html for dictionary/translation toggle checkboxes
2. Remove only the standalone UI toggles
3. **DO NOT** remove dictionary.js or translation-*.js files
4. **DO NOT** remove highlight menu buttons for dictionary/translate
5. Verify quick actions menu still shows Dictionary and Translate buttons

**Critical:** Test after removal - select text, verify Dictionary and Translate still work in quick actions menu

---

## Phase 3: Advanced Settings Overhaul

### 3.1 Add AI Tab
**File:** `src/popup/popup.js` (lines 1761-2463)

**Current tabs:** Features, Keyboard, Appearance, Profiles

**New structure:**
1. **Features** (unchanged)
2. **Keyboard** (unchanged)
3. **Preferences** (merge Appearance + Profiles)
4. **AI** (new)

**AI Tab HTML:**
```html
<div id="tab-ai" class="tab-content">
  <h3>🤖 AI Configuration</h3>

  <!-- AI Mode Selection -->
  <section class="ai-mode-section">
    <h4>AI Mode</h4>
    <div class="radio-group">
      <label>
        <input type="radio" name="ai-mode" value="local" checked>
        <span>Local AI (Ollama)</span>
        <span class="mode-description">100% private, runs on your computer</span>
      </label>
      <label>
        <input type="radio" name="ai-mode" value="cloud">
        <span>Cloud AI</span>
        <span class="mode-description">Enhanced quality, requires API key</span>
      </label>
    </div>
  </section>

  <!-- Cloud AI Provider (shown when cloud mode selected) -->
  <section id="cloud-provider-section" class="hidden">
    <h4>Cloud Provider</h4>
    <select id="cloud-provider">
      <option value="anthropic">Anthropic (Claude)</option>
      <option value="openai">OpenAI (GPT-4)</option>
      <option value="google">Google (Gemini)</option>
    </select>

    <h4>API Key</h4>
    <div class="api-key-input-group">
      <input type="password" id="api-key-input" placeholder="Enter API key">
      <button id="test-api-key">Test Connection</button>
    </div>
    <p class="security-note">🔒 Keys are encrypted and stored locally</p>
  </section>

  <!-- Local AI Configuration (shown when local mode selected) -->
  <section id="local-ai-section">
    <h4>Ollama Status</h4>
    <div id="ollama-status" class="status-indicator">
      <span class="status-dot"></span>
      <span class="status-text">Checking...</span>
    </div>

    <h4>Available Models</h4>
    <select id="local-model-select" multiple size="5">
      <!-- Populated dynamically -->
    </select>
    <button id="install-model">Install New Model</button>
  </section>

  <!-- Model Selection Per Feature -->
  <section class="feature-models-section">
    <h4>Model Preferences</h4>
    <p class="description">Choose which model to use for each AI feature</p>

    <div class="model-preference-grid">
      <label>Summarization: <select class="model-select" data-feature="summarize"></select></label>
      <label>Text Simplification: <select class="model-select" data-feature="simplify"></select></label>
      <label>Socratic Tutor: <select class="model-select" data-feature="tutor"></select></label>
      <label>Assignment Breakdown: <select class="model-select" data-feature="breakdown"></select></label>
    </div>
  </section>

  <!-- Usage Statistics (for cloud mode) -->
  <section id="usage-stats-section" class="hidden">
    <h4>Usage Statistics</h4>
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-label">Requests:</span>
        <span class="stat-value" id="stat-requests">0</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Total Tokens:</span>
        <span class="stat-value" id="stat-tokens">0</span>
      </div>
    </div>
    <div class="stats-actions">
      <button id="export-stats-json">📤 Export JSON</button>
      <button id="export-stats-csv">📊 Export CSV</button>
      <button id="clear-stats">🗑️ Clear Stats</button>
    </div>
  </section>
</div>
```

**JavaScript handlers:**
```javascript
setupAITab(modal) {
  // AI mode radio buttons
  const localRadio = modal.querySelector('[name="ai-mode"][value="local"]');
  const cloudRadio = modal.querySelector('[name="ai-mode"][value="cloud"]');

  localRadio.addEventListener('change', () => this.switchToLocalMode());
  cloudRadio.addEventListener('change', () => this.switchToCloudMode());

  // Cloud provider dropdown
  modal.querySelector('#cloud-provider').addEventListener('change', (e) => {
    this.updateCloudProvider(e.target.value);
  });

  // API key
  modal.querySelector('#test-api-key').addEventListener('click', () => {
    this.testAPIKey(modal.querySelector('#api-key-input').value);
  });

  // ... more handlers
}
```

---

### 3.2 Secure API Key Storage
**File:** `src/core/storage/api-key-manager.js` (NEW)

**Implementation:**
```javascript
import CryptoJS from 'crypto-js';

// Generate encryption key from device ID + timestamp
async function getEncryptionKey() {
  const deviceId = await chrome.storage.local.get('deviceId');
  if (!deviceId.deviceId) {
    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId: newId });
    return newId;
  }
  return deviceId.deviceId;
}

export async function saveAPIKey(provider, apiKey) {
  const key = await getEncryptionKey();
  const encrypted = CryptoJS.AES.encrypt(apiKey, key).toString();

  await chrome.storage.local.set({
    [`apiKey_${provider}_encrypted`]: encrypted
  });
}

export async function getAPIKey(provider) {
  const key = await getEncryptionKey();
  const result = await chrome.storage.local.get(`apiKey_${provider}_encrypted`);

  if (!result[`apiKey_${provider}_encrypted`]) return null;

  const decrypted = CryptoJS.AES.decrypt(
    result[`apiKey_${provider}_encrypted`],
    key
  ).toString(CryptoJS.enc.Utf8);

  return decrypted;
}
```

**Add CryptoJS dependency:**
```bash
npm install crypto-js
```

---

### 3.3 Merge Appearance + Profiles → Preferences
**File:** `src/popup/popup.js`

**Changes:**
1. Rename "Appearance" tab to "Preferences"
2. Move Profiles tab content into Preferences tab
3. Organize as two sections:
   - **UI Preferences** (Compact Mode, Show Icons, Debug Mode)
   - **Profile Management** (existing profiles content)

**New tab structure:**
```html
<div id="tab-preferences" class="tab-content">
  <h3>Preferences</h3>

  <section class="ui-preferences-section">
    <h4>UI Preferences</h4>
    <!-- Compact Mode, Show Icons, Debug Mode -->
  </section>

  <section class="profile-management-section">
    <h4>Profile Management</h4>
    <!-- Profile selector, save/delete, import/export -->
  </section>
</div>
```

---

## Phase 4: AI Integration

### 4.1 Enable llmEnabled Flag
**Files:**
- `src/features/highlightMenu/highlightMenu.js` (line 50)
- `src/popup/popup.html` (Local AI section)

**Add toggle in Local AI section:**
```html
<label for="enable-ai-features" class="toggle-label">
  <span class="label-text">Enable AI Features in Quick Actions</span>
  <input type="checkbox" id="enable-ai-features" />
</label>
```

**Handler:**
```javascript
document.getElementById('enable-ai-features').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ llmEnabled: e.target.checked });
  // Notify content scripts to reload highlight menu
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tabs[0].id, { type: 'RELOAD_HIGHLIGHT_MENU' });
});
```

---

### 4.2 Local vs Cloud AI Toggle
**File:** `src/popup/popup.html`

**Add in Local AI section:**
```html
<div class="ai-mode-toggle">
  <label>
    <input type="radio" name="ai-source" value="local" checked>
    Local AI (Ollama)
  </label>
  <label>
    <input type="radio" name="ai-source" value="cloud">
    Cloud AI
  </label>
</div>
```

**Handler sets `cloudModeEnabled` flag:**
```javascript
document.querySelectorAll('[name="ai-source"]').forEach(radio => {
  radio.addEventListener('change', async (e) => {
    const isCloud = e.target.value === 'cloud';
    await chrome.storage.local.set({ cloudModeEnabled: isCloud });
  });
});
```

---

### 4.3 Move Local AI Config to Advanced Settings
**Current:** Local AI section in main popup (popup.html lines 3385-3796)

**Action:**
1. Remove "Powered by Ollama" text and model installation instructions from popup
2. Move model selector and installation to new AI tab
3. Keep only AI mode toggle (Local/Cloud) in popup
4. All detailed configuration goes to Advanced Settings > AI tab

---

## Phase 5: Feature Labeling

### 5.1 Add Labels
**File:** `src/popup/popup.html`

**Changes:**

1. **OCR Language** (line ~471) - Add EXPERIMENTAL:
```html
<span class="experimental-badge experimental">EXPERIMENTAL</span>
```

2. **Canvas LMS** (line 3028) - Change BETA to ALPHA:
```html
<span class="experimental-badge alpha">ALPHA</span>
```

3. **Moodle LMS** (line 3204) - Change BETA to ALPHA:
```html
<span class="experimental-badge alpha">ALPHA</span>
```

4. **Google Classroom** (line 3302) - Change BETA to ALPHA:
```html
<span class="experimental-badge alpha">ALPHA</span>
```

5. **Citations** (line 2933) - Add ALPHA:
```html
<span class="experimental-badge alpha">ALPHA</span>
<span class="caution-note">Use with caution</span>
```

6. **Stargardt Eye Tracking** (line ~2400) - Add "Future Feature":
```html
<div class="feature-disabled">
  <span class="future-badge">FUTURE FEATURE</span>
  <p class="disabled-note">Eye tracking coming in future release</p>
</div>
```

**CSS for badges:**
```css
.experimental-badge.alpha {
  background: #f59e0b;
  color: white;
}

.experimental-badge.experimental {
  background: #8b5cf6;
  color: white;
}

.future-badge {
  background: #6b7280;
  color: white;
  opacity: 0.6;
}

.feature-disabled {
  opacity: 0.5;
  pointer-events: none;
}
```

---

## Phase 6: Keyboard Shortcuts

### 6.1 Remove Default Shortcuts
**File:** `src/utils/keyboard-shortcuts.js` (lines 34-56)

**Change all defaults to empty string:**
```javascript
const DEFAULT_SHORTCUTS = {
  tts_play_pause: '',
  tts_stop: '',
  ocr_activate: '',
  reading_mode_toggle: '',
  dictionary_lookup: '',
  // ... all others set to ''
};
```

---

### 6.2 Add Chrome Conflict UI
**File:** `src/popup/popup.js` (keyboard shortcuts recording overlay)

**Already exists** (lines 92-154 in keyboard-shortcuts.js): `isConflictWithChrome()`

**Add to recording UI:**
```javascript
startShortcutRecording(key) {
  // ... existing overlay code ...

  input.addEventListener('keydown', (e) => {
    e.preventDefault();
    const shortcut = formatShortcut(e);

    // Check conflicts
    const conflict = isConflictWithChrome(shortcut);
    if (conflict) {
      showConflictWarning(overlay, conflict.description);
      return; // Don't save
    }

    // Save if no conflict
    updateShortcut(key, shortcut);
    closeOverlay();
  });
}

function showConflictWarning(overlay, description) {
  const warning = overlay.querySelector('.conflict-warning');
  warning.textContent = `⚠️ Conflicts with Chrome: ${description}`;
  warning.classList.add('visible');
}
```

---

## Phase 7: Documentation

### 7.1 Create GitHub README
**File:** `README.md` (root)

**Content:**
```markdown
# @NCAD Adaptive EdTech Extension

> Accessibility-first Chrome extension providing TTS, STT, OCR, and AI-powered learning support for neurodivergent students.

## Features

### 🔊 Reading Support
- **Text-to-Speech (TTS)** with synchronized highlighting
- **OCR** (Read text from images)
- **Reading Mode** for distraction-free reading
- **Dyslexia-friendly fonts** and color overlays

### ✏️ Writing Support
- **Speech-to-Text (STT)** with floating microphone
- **Voice commands** for hands-free editing
- **Auto-punctuation** and formatting

### 📚 Learning Tools
- **Dictionary & Translation** in 100+ languages
- **AI-powered simplification** and summarization
- **Socratic tutor** for interactive learning
- **Assignment breakdown** and study planning

### 🎓 LMS Integration (Alpha)
- Canvas LMS support
- Moodle integration
- Google Classroom compatibility
- Citation generator

### 🤖 AI Modes
- **Local AI** via Ollama (100% private)
- **Cloud AI** with Anthropic, OpenAI, or Google (enhanced quality)

## Installation

1. Download the latest release
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → Select `.vite` folder
5. Pin extension to toolbar

## Quick Start

1. Click extension icon to open popup
2. Enable features you need (TTS, OCR, etc.)
3. Select text on any webpage → Quick Actions menu appears
4. For AI features: Enable in Advanced Settings > AI tab

## Local AI Setup (Optional)

1. Install [Ollama](https://ollama.ai)
2. Run: `ollama pull llama3.2`
3. Start Ollama: `OLLAMA_ORIGINS=* ollama serve`
4. Enable Local AI in extension

## Cloud AI Setup (Optional)

1. Get API key from [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), or [Google AI](https://makersuite.google.com)
2. Open Advanced Settings > AI tab
3. Select provider and enter API key
4. Keys are encrypted and stored locally

## Keyboard Shortcuts

By default, no shortcuts are set. Add custom shortcuts in Advanced Settings > Keyboard.

Chrome reserved shortcuts (Ctrl+T, Ctrl+W, etc.) are blocked for safety.

## Privacy

- **Local AI**: All processing happens on your computer
- **Cloud AI**: Only selected text is sent to providers
- **No tracking**: Zero analytics or telemetry
- **API keys**: Encrypted with device-specific key

## Support

- **Issues**: [GitHub Issues](https://github.com/MarJone/AssisT/issues)
- **Docs**: [Wiki](https://github.com/MarJone/AssisT/wiki)

## License

MIT License - See LICENSE file

## Accessibility

WCAG 2.2 Level AA compliant. Features designed for:
- Dyslexia
- ADHD
- Visual impairments
- Motor disabilities
- Hearing impairments

---

**Note**: LMS integrations and some AI features are in Alpha. Use with caution in production environments.
```

---

## Phase 8: Implementation Order & Sub-Agents

### Recommended Sub-Agent Strategy

**Use Plan agents** for each phase with parallel execution where possible:

1. **Agent 1 - Critical Bugs** (Phase 1):
   - Reset button fix
   - Pencil tool fix
   - Microphone visibility diagnosis and fix
   - TTS highlighting speed sync

2. **Agent 2 - Feature Removals** (Phase 2):
   - Remove HM Read Aloud/Copy
   - Remove Dictionary/Translation toggles
   - Verify quick actions still work

3. **Agent 3 - Advanced Settings** (Phase 3):
   - Add AI tab
   - Implement secure API storage
   - Merge Appearance + Profiles

4. **Agent 4 - AI Integration** (Phase 4):
   - Enable llmEnabled flag
   - Add Local/Cloud toggle
   - Move config to advanced settings

5. **Agent 5 - Labeling & Polish** (Phases 5-7):
   - Add all badges
   - Remove default shortcuts
   - Add conflict UI
   - Create README

**Parallel Execution:**
- Agents 1, 2, 5 can run in parallel (independent)
- Agents 3, 4 should run sequentially (4 depends on 3)

---

## Phase 9: Testing & Verification

### Critical Test Cases

1. **Reset Button:**
   - Enable multiple features
   - Click Reset
   - Verify ALL settings return to defaults
   - Check: TTS, keyboard shortcuts, UI layout, profiles

2. **Organize Mode Pencil:**
   - Enter organize mode
   - Click pencil on each section
   - Rename and save
   - Exit and re-enter organize mode
   - Verify custom names persist

3. **Microphone Button:**
   - Enable STT
   - Check "Show Microphone Button"
   - Focus text field
   - Verify microphone appears
   - Click and test voice input

4. **TTS Highlighting Speed:**
   - Enable word-by-word highlighting
   - Set speed to 0.5x, 1x, 2x
   - Play TTS
   - Verify highlighting syncs with audio

5. **Feature Removals:**
   - Select text
   - Open quick actions menu
   - Verify Read Aloud and Copy are GONE
   - Verify Dictionary and Translate still WORK

6. **AI Integration:**
   - Enable Local AI in advanced settings
   - Select text
   - Verify AI buttons appear (Summarize, Simplify, etc.)
   - Test one AI feature
   - Switch to Cloud AI
   - Verify still works

7. **API Key Security:**
   - Enter API key in AI tab
   - Save
   - Inspect chrome://extensions storage
   - Verify key is encrypted (not plaintext)

8. **Keyboard Shortcuts:**
   - Verify all shortcuts are blank by default
   - Try to set Ctrl+T
   - Verify conflict warning appears
   - Set valid shortcut (Alt+Q)
   - Test it works

9. **Feature Labels:**
   - Check OCR → EXPERIMENTAL badge
   - Check Canvas/Moodle/Classroom → ALPHA badges
   - Check Citations → ALPHA with caution note
   - Check Stargardt → Future Feature (greyed)

10. **Help Button:**
    - Click Help button
    - Verify README loads (no 404)

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `src/popup/popup.js` | Reset button, pencil tool, AI tab, handlers |
| `src/popup/popup.html` | Remove features, add labels, reorganize tabs |
| `src/popup/popup.css` | AI tab styles, badge styles |
| `src/features/highlightMenu/highlightMenu.js` | Remove buttons, enable AI |
| `src/core/dom/highlighting.js` | TTS sync with boundaries |
| `src/core/storage/api-key-manager.js` | **NEW** - Encrypted API keys |
| `src/utils/keyboard-shortcuts.js` | Clear defaults |
| `src/ui/components/microphone-button.js` | Fix visibility |
| `README.md` | **NEW** - Documentation |
| `package.json` | Add crypto-js dependency |

---

## Rollback Plan

If any phase breaks the extension:

```bash
# Return to checkpoint
git checkout testing-fixes-checkpoint

# Or cherry-pick good commits
git checkout ui-overhaul
git cherry-pick <good-commit-hash>
```

---

_Last Updated: 2026-01-17_
_Total Estimated LOC: ~1200 lines added, ~300 lines removed_
