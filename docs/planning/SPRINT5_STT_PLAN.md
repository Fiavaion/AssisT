# Sprint 5: Speech-to-Text Implementation Plan

**Status:** In Progress
**Created:** 2025-10-12
**Goal:** Enable writing assistance with STT using Web Speech API

---

## 📋 Overview

Sprint 5 implements Speech-to-Text (STT) functionality to help students with dysgraphia and writing difficulties. This feature enables voice-driven text input across all text fields, with special focus on Canvas LMS integration.

### Key Features:
1. ✅ **Web Speech API Integration** - Real-time speech recognition
2. ✅ **Floating Microphone Button** - Appears when text field is focused
3. ✅ **Context Menu Integration** - Right-click → "Speak to Type"
4. ✅ **Real-time Transcription** - Words appear as user speaks
5. ✅ **Continuous Mode** - Keep listening for long-form writing
6. ✅ **Punctuation Commands** - Voice commands for punctuation

---

## 🏗️ Architecture Design

### File Structure:
```
src/
├── engines/
│   └── stt/
│       └── stt-controller.js         (NEW - STT engine controller)
├── content/
│   └── content-simple.js             (UPDATE - Add STT feature)
├── ui/
│   └── components/
│       └── microphone-button.js      (NEW - Floating mic UI)
├── utils/
│   └── storage-manager.js            (UPDATE - Add STT schema)
└── popup/
    ├── popup.html                    (UPDATE - Add STT UI)
    ├── popup.css                     (UPDATE - Add STT styles)
    └── popup.js                      (UPDATE - Add STT handlers)
```

### Feature Isolation Pattern:
All STT code follows the established pattern:
- Variable prefix: `stt_`
- Function prefix: `stt_`
- Settings namespace: `settings.stt`
- Feature toggle: default OFF

---

## 🎯 Implementation Tasks

### Phase 1: STT Controller (Core Engine)

**File:** `src/engines/stt/stt-controller.js`

**Responsibilities:**
- Initialize Web Speech API (`webkitSpeechRecognition`)
- Handle real-time transcription
- Process punctuation commands
- Manage continuous listening mode
- Handle errors and fallbacks

**Key Methods:**
```javascript
class STTController {
  constructor(options = {})
  initialize()                    // Set up Web Speech API
  startListening(targetElement)   // Begin recording
  stopListening()                 // End recording
  pauseListening()                // Pause (continuous mode)
  resumeListening()               // Resume (continuous mode)
  processPunctuationCommand(text) // Handle "period", "comma", etc.
  insertText(targetElement, text) // Insert transcribed text
  destroy()                       // Cleanup
}
```

**Punctuation Commands:**
- "period" → `.`
- "comma" → `,`
- "question mark" → `?`
- "exclamation point" → `!`
- "new line" → `\n`
- "new paragraph" → `\n\n`
- "colon" → `:`
- "semicolon" → `;`
- "quote" → `"`
- "apostrophe" → `'`

**Web Speech API Configuration:**
```javascript
this.recognition = new webkitSpeechRecognition();
this.recognition.continuous = true;      // Keep listening
this.recognition.interimResults = true;  // Show partial results
this.recognition.lang = 'en-US';         // Default language
this.recognition.maxAlternatives = 1;    // Single best result
```

---

### Phase 2: Floating Microphone Button UI

**File:** `src/ui/components/microphone-button.js`

**Features:**
- Appears when text field is focused
- Red pulse animation when recording
- Waveform visualization (optional)
- Tooltip: "Click to speak" / "Recording..."
- Keyboard shortcut: Ctrl+Shift+M

**Visual States:**
1. **Idle** (gray): Not recording, ready to start
2. **Recording** (red pulsing): Actively listening
3. **Paused** (orange): Paused in continuous mode
4. **Error** (red X): API error or permission denied

**Positioning:**
- Fixed position: bottom-right of text field
- Z-index: 10000 (above all content)
- Offset: 10px from field border
- Mobile-friendly: 48px min touch target

**Accessibility:**
- ARIA role: `button`
- ARIA label: "Start voice typing" / "Stop voice typing"
- Keyboard accessible: Tab + Enter
- Screen reader announcements

---

### Phase 3: Context Menu Integration

**File:** `manifest.json` + `src/background/service-worker.js`

**Add to manifest.json:**
```json
"permissions": [
  "contextMenus",
  "storage",
  "activeTab",
  "scripting",
  "tabs"
]
```

**Context Menu Structure:**
```
AssisT >
  ├─ Read Text (TTS)                [Existing]
  ├─ Speak to Type (STT)            [NEW]
  └─ Stop All                       [NEW]
```

**Implementation:**
- Right-click on `<textarea>`, `<input type="text">`, `contenteditable` elements
- Show "Speak to Type" option
- Click → Start STT for that field
- Message content script to activate STT controller

---

### Phase 4: Content Script Integration

**File:** `src/content/content-simple.js`

**New STT Feature Section:**
```javascript
// ============================================================
// SPRINT 5 FEATURE: SPEECH-TO-TEXT (STT)
// ============================================================

// STT State (Feature Isolated)
let stt_enabled = false;
let stt_controller = null;
let stt_activeField = null;
let stt_micButton = null;

// Dynamic import STT controller
async function stt_loadController() { /* ... */ }

// Initialize STT for focused field
function stt_initialize(targetField) { /* ... */ }

// Start recording
function stt_startRecording() { /* ... */ }

// Stop recording
function stt_stopRecording() { /* ... */ }

// Insert transcribed text
function stt_insertText(text) { /* ... */ }

// Show microphone button
function stt_showMicButton(field) { /* ... */ }

// Hide microphone button
function stt_hideMicButton() { /* ... */ }

// Listen for focus on text fields
document.addEventListener('focusin', (e) => {
  if (stt_enabled && stt_isTextInput(e.target)) {
    stt_activeField = e.target;
    stt_showMicButton(e.target);
  }
});

// Listen for focusout
document.addEventListener('focusout', (e) => {
  if (stt_activeField === e.target) {
    // Delay hiding button (user might click it)
    setTimeout(() => {
      if (!stt_controller?.isRecording) {
        stt_hideMicButton();
      }
    }, 300);
  }
});
```

**Supported Input Types:**
- `<textarea>`
- `<input type="text">`
- `<input type="email">`
- `<input type="search">`
- `[contenteditable="true"]`
- Canvas Rich Text Editor (`.mce-tinymce`)

---

### Phase 5: Storage Schema & Settings UI

**File:** `src/utils/storage-manager.js`

**Add to DEFAULT_SETTINGS:**
```javascript
// Sprint 5 Features
stt: {
  enabled: false,                  // Default OFF
  continuousMode: true,            // Keep listening vs single utterance
  language: 'en-US',               // Recognition language
  interimResults: true,            // Show partial results
  autoCapitalize: true,            // Capitalize first word of sentences
  autoPunctuation: false,          // Auto-add periods (experimental)
  punctuationCommands: true,       // Voice punctuation ("period", "comma")
  floatingButton: true,            // Show mic button on focus
  contextMenu: true                // Enable right-click "Speak to Type"
}
```

**Popup UI (popup.html):**
```html
<section class="control-section" id="stt-section">
  <div class="toggle-control">
    <label for="stt-enabled" class="toggle-label">
      <span class="label-text">🎤 Speech-to-Text</span>
      <div class="toggle-switch">
        <input type="checkbox" id="stt-enabled" role="switch">
        <span class="toggle-slider"></span>
      </div>
    </label>
  </div>
  <p class="feature-description hidden" id="stt-description">
    Type using your voice in any text field
  </p>

  <div id="stt-options" class="stt-options hidden">

    <!-- Continuous Mode Toggle -->
    <div class="control-subsection">
      <div class="toggle-control">
        <label for="stt-continuous-mode" class="toggle-label">
          <span class="label-text">Continuous Mode</span>
          <div class="toggle-switch">
            <input type="checkbox" id="stt-continuous-mode" checked>
            <span class="toggle-slider"></span>
          </div>
        </label>
      </div>
      <p class="feature-description">Keep listening for long-form writing</p>
    </div>

    <!-- Language Selection -->
    <div class="control-group">
      <label for="stt-language">Language</label>
      <select id="stt-language" class="control-select">
        <option value="en-US">English (US)</option>
        <option value="en-GB">English (UK)</option>
        <option value="es-ES">Spanish</option>
        <option value="fr-FR">French</option>
        <option value="de-DE">German</option>
      </select>
    </div>

    <!-- Punctuation Commands -->
    <div class="control-subsection">
      <div class="toggle-control">
        <label for="stt-punctuation-commands" class="toggle-label">
          <span class="label-text">Punctuation Commands</span>
          <div class="toggle-switch">
            <input type="checkbox" id="stt-punctuation-commands" checked>
            <span class="toggle-slider"></span>
          </div>
        </label>
      </div>
      <p class="feature-description">Say "period", "comma", "new line"</p>
    </div>

    <!-- Floating Button -->
    <div class="control-subsection">
      <div class="toggle-control">
        <label for="stt-floating-button" class="toggle-label">
          <span class="label-text">Show Microphone Button</span>
          <div class="toggle-switch">
            <input type="checkbox" id="stt-floating-button" checked>
            <span class="toggle-slider"></span>
          </div>
        </label>
      </div>
      <p class="feature-description">Display mic icon when text field is focused</p>
    </div>

  </div><!-- End stt-options -->
</section>
```

---

### Phase 6: Testing Strategy

#### Unit Tests (Jest)

**File:** `tests/stt-controller.test.js`

**Test Cases:**
1. ✅ STT controller initializes correctly
2. ✅ Punctuation commands convert properly
3. ✅ Text insertion works for textarea
4. ✅ Text insertion works for contenteditable
5. ✅ Continuous mode toggle works
6. ✅ Error handling (no microphone permission)
7. ✅ Language switching works
8. ✅ Start/stop/pause/resume state management

```javascript
describe('STTController', () => {
  let controller;

  beforeEach(() => {
    controller = new STTController({
      continuous: true,
      interimResults: true,
      language: 'en-US'
    });
  });

  test('converts punctuation commands correctly', () => {
    expect(controller.processPunctuationCommand('period')).toBe('.');
    expect(controller.processPunctuationCommand('comma')).toBe(',');
    expect(controller.processPunctuationCommand('new line')).toBe('\n');
  });

  test('inserts text into textarea', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Hello';
    controller.insertText(textarea, ' world');
    expect(textarea.value).toBe('Hello world');
  });

  test('capitalizes first word when autoCapitalize enabled', () => {
    controller.settings.autoCapitalize = true;
    const result = controller.processTranscript('hello world');
    expect(result).toBe('Hello world');
  });
});
```

#### E2E Tests (Playwright)

**File:** `e2e-tests/stt.spec.js`

**Test Scenarios:**
1. ✅ Microphone button appears when text field focused
2. ✅ Click mic button → starts recording (visual indicator)
3. ✅ Simulated speech input → text appears in field
4. ✅ Punctuation command → correct punctuation inserted
5. ✅ Continuous mode → keeps listening after sentence
6. ✅ Context menu "Speak to Type" → activates STT
7. ✅ Settings toggle → enables/disables STT feature

**Note:** Playwright cannot actually test microphone input (browser security).
We'll use mocked Web Speech API for E2E tests:

```javascript
// Mock Web Speech API in Playwright
await page.addInitScript(() => {
  window.webkitSpeechRecognition = class MockSpeechRecognition {
    start() {
      setTimeout(() => {
        this.onresult({
          results: [[{ transcript: 'Hello world', confidence: 0.95 }]]
        });
      }, 100);
    }
    stop() {}
    addEventListener(event, handler) {
      this[`on${event}`] = handler;
    }
  };
});
```

---

## 🎨 UI/UX Considerations

### Microphone Button Design:

**Idle State:**
```css
.stt-mic-button {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: 2px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  position: fixed;
  z-index: 10000;
  transition: transform 0.2s ease;
}

.stt-mic-button:hover {
  transform: scale(1.1);
}
```

**Recording State (Red Pulse Animation):**
```css
.stt-mic-button.recording {
  background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 4px 12px rgba(255, 68, 68, 0.5);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 4px 20px rgba(255, 68, 68, 0.8);
  }
}
```

### Transcription Preview (Optional Enhancement):
- Small overlay above mic button
- Shows interim results in real-time
- Gray text = interim, black text = final
- Fades out after insertion

---

## 🔒 Privacy & Security

### Microphone Permissions:
- Request permission on first STT activation
- Clear user consent messaging: "AssisT needs microphone access to enable voice typing"
- Permission request triggered by user action (button click), never automatic
- Permission status shown in settings: "Microphone Access: Granted / Denied / Not Requested"

### Data Privacy:
- ✅ Web Speech API runs locally (browser-based, no data sent to AssisT servers)
- ⚠️ Note: Browser may send audio to Google servers (Chrome's Web Speech API backend)
- ✅ No audio stored by AssisT extension
- ✅ Transcripts only inserted into user's text fields, not saved elsewhere
- ✅ FERPA compliant: No PII transmitted to third parties

### Future Cloud STT Considerations (Sprint 7):
- Explicit opt-in required
- Users bring their own API keys (BYOK)
- Clear disclosure: "Cloud STT sends audio to [Provider]"
- Institution proxy option (API keys managed centrally)

---

## ✅ Acceptance Criteria

### Must Have (MVP):
- ✅ Microphone button appears on all text fields when focused
- ✅ Click mic button → starts recording (red pulse animation)
- ✅ Real-time transcription inserts text as user speaks
- ✅ Punctuation commands work ("period", "comma", "new line")
- ✅ Continuous mode records for 5+ minutes without stopping
- ✅ Works in Canvas discussion posts, assignments, quizzes
- ✅ Context menu "Speak to Type" option functional
- ✅ Settings UI allows enabling/disabling STT
- ✅ Unit tests: 80%+ coverage of STT controller
- ✅ E2E tests: All critical STT flows covered

### Should Have:
- ✅ Auto-capitalization (first word of sentence)
- ✅ Interim results display (optional preview overlay)
- ✅ Language selection (en-US, en-GB, es-ES, fr-FR, de-DE)
- ✅ Error handling: Permission denied, no microphone, API unavailable

### Could Have (Future):
- ⏳ Waveform visualization (audio level indicator)
- ⏳ Voice activity detection (auto-pause when user stops speaking)
- ⏳ Custom vocabulary / domain adaptation (medical, legal terms)
- ⏳ Confidence threshold slider (only insert if > X% confident)

### Won't Have (Out of Scope):
- ❌ FixOver multimodal correction (Sprint 5.2 - separate implementation)
- ❌ Cloud STT engines (Sprint 7)
- ❌ Offline STT (requires local Whisper, very complex)
- ❌ Multi-speaker diarization

---

## 📊 Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Latency** | < 200ms from speech end to text insertion | Chrome DevTools Performance tab |
| **Accuracy** | > 90% for clear speech | Manual testing with known phrases |
| **Continuous Mode** | 5+ minutes without restart | Timer test in Canvas assignment |
| **Memory Usage** | < 20MB additional (STT feature active) | Chrome Task Manager |
| **Load Time** | < 50ms to show mic button on focus | Performance.now() measurements |

---

## 🚧 Known Limitations

### Web Speech API Constraints:
1. **Browser Support**: Only works in Chrome/Edge (Chromium-based browsers)
   - Firefox: No support for Web Speech API
   - Safari: Limited support, poor accuracy
   - Solution: Show warning in unsupported browsers

2. **Network Dependency**: Chrome's Web Speech API requires internet connection
   - Audio sent to Google servers for transcription
   - Solution: Show "offline" indicator if no connection

3. **Language Models**: Accuracy varies by language
   - en-US, en-GB: Excellent accuracy
   - Other languages: Good but not perfect
   - Solution: Allow users to test and switch languages

4. **Background Noise**: Poor accuracy in noisy environments
   - Solution: Show confidence indicator, allow users to review before insertion

5. **Domain-Specific Terms**: Poor recognition of technical/medical jargon
   - Solution: Future enhancement - custom vocabulary (Sprint 7)

---

## 🔄 Rollback Plan

If STT implementation causes critical issues:

1. **Feature Toggle**: STT default OFF, so users unaffected unless they enable
2. **Emergency Disable**: Update storage schema to force `stt.enabled = false`
3. **Rollback Tag**: Create pre-STT tag before starting Sprint 5
4. **Git Revert**: Can revert all STT commits if needed
5. **User Communication**: If deployed, notify users via extension update notes

**Pre-Sprint 5 Tag:** `Sprint4-Canvas-Complete-v1.0` (to be created)

---

## 📝 Implementation Checklist

### Pre-Implementation:
- [ ] Create Sprint 4 stable tag
- [ ] Review Web Speech API documentation
- [ ] Test browser microphone permissions flow
- [ ] Create unit test infrastructure for STT

### Core Implementation:
- [ ] Create `src/engines/stt/stt-controller.js`
- [ ] Implement punctuation command processing
- [ ] Create floating microphone button component
- [ ] Integrate STT into content-simple.js
- [ ] Add context menu integration
- [ ] Update storage schema with STT settings
- [ ] Create STT UI section in popup

### Testing:
- [ ] Write unit tests for STT controller (80%+ coverage)
- [ ] Write E2E tests for STT flows
- [ ] Manual testing on Canvas text fields
- [ ] Test in unsupported browsers (warning display)
- [ ] Test with no microphone permission
- [ ] Test continuous mode (5+ minutes)
- [ ] Test punctuation commands (all variations)

### Documentation:
- [ ] Update USER_GUIDE.md with STT instructions
- [ ] Add STT troubleshooting to TROUBLESHOOTING.md
- [ ] Document Web Speech API limitations
- [ ] Create keyboard shortcut reference

### Deployment:
- [ ] Build extension
- [ ] Verify all Sprint 3 features still work
- [ ] Verify Canvas Integration (Sprint 4) still works
- [ ] Commit Sprint 5 changes
- [ ] Create Sprint 5 stable tag
- [ ] Update CHANGELOG.md

---

## 📅 Timeline Estimate

**Total Duration:** 5-7 days

| Day | Tasks | Estimated Hours |
|-----|-------|----------------|
| **Day 1** | STT Controller implementation | 6 hours |
| **Day 2** | Microphone button UI component | 4 hours |
| **Day 3** | Content script integration + context menu | 6 hours |
| **Day 4** | Settings schema + popup UI | 4 hours |
| **Day 5** | Unit tests | 6 hours |
| **Day 6** | E2E tests + manual testing | 6 hours |
| **Day 7** | Documentation + deployment | 4 hours |

**Total:** ~36 hours of development time

---

## 🎯 Success Metrics

Sprint 5 is successful when:

1. ✅ STT feature works reliably on all text fields
2. ✅ Passes all unit tests (80%+ coverage)
3. ✅ Passes all E2E tests
4. ✅ Manual testing on Canvas text fields successful
5. ✅ No regressions in Sprint 1-4 features
6. ✅ User can enable STT, dictate text, and have it appear correctly
7. ✅ Punctuation commands work as expected
8. ✅ Continuous mode works for 5+ minutes
9. ✅ Documentation updated
10. ✅ Build successful, extension loads without errors

---

## 📖 References

- [Web Speech API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Chrome Speech Recognition](https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api/)
- [WCAG 2.1.1 Keyboard Accessibility](https://www.w3.org/WAI/WCAG21/Understanding/keyboard)
- [FERPA Compliance Guidelines](https://studentprivacy.ed.gov/faq/what-ferpa)

---

**Document Status:** ✅ Complete - Ready for Implementation
**Next Step:** Begin STT Controller implementation
