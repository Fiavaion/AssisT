# AssisT Production Roadmap
**Full-Featured Development Cycle (Post-MVP)**

**Current Status:** Sprint 3 Complete (Tag: Sprint3-Complete-v1.0)
**Next Phase:** Production-Ready Development with Canvas LMS Integration

---

## 🎯 Vision: Production-Ready Adaptive EdTech Extension

Transform AssisT from MVP to production-grade Chrome Extension with:
- **Canvas LMS Deep Integration**: Assignment readers, quiz helpers, course navigation aids
- **Advanced Accessibility**: Beyond WCAG compliance to personalized learning profiles
- **Cloud TTS/STT**: Professional voice synthesis and speech recognition
- **Analytics & Learning Insights**: Track usage patterns to improve learning outcomes
- **Multi-Platform**: Canvas, Moodle, Blackboard support
- **Enterprise Features**: Institution deployment, FERPA compliance, admin dashboards

---

## 📊 Current Feature Matrix

| Feature | Status | Version | Notes |
|---------|--------|---------|-------|
| **Reading Features** |
| TTS (Web Speech API) | ✅ Complete | v1.0 | Click-to-read with highlighting |
| Text Customization | ✅ Complete | Sprint 3 | WCAG 2.2 SC 1.4.12 compliant |
| Reading Guide | ✅ Complete | Sprint 3 | Horizontal cursor-tracking line |
| Focus Mode | ✅ Complete | Sprint 3 | Rounded window with overlay |
| Word-by-Word Highlighting | 🚧 Partial | v1.0 | Basic implementation, needs refinement |
| **Writing Features** |
| Speech-to-Text | ❌ Not Started | - | Planned for Sprint 4 |
| FixOver Correction | ❌ Not Started | - | Multimodal correction system |
| **Canvas Integration** |
| Assignment Reader | ❌ Not Started | - | Auto-detect and read assignments |
| Quiz Helper | ❌ Not Started | - | Read questions with enhanced clarity |
| Course Navigation | ❌ Not Started | - | Keyboard shortcuts, voice control |
| **Advanced Features** |
| User Profiles | ❌ Not Started | - | Save/load personalization presets |
| Cloud TTS | ❌ Not Started | - | Murf, Google Cloud TTS, ElevenLabs |
| Cloud STT | ❌ Not Started | - | Google Cloud STT, Whisper |
| Learning Analytics | ❌ Not Started | - | Usage tracking, insights dashboard |
| **Quality & Testing** |
| Unit Tests | 🚧 Minimal | - | Need 80% coverage |
| E2E Tests | ❌ Not Started | - | Playwright with Canvas fixtures |
| Accessibility Audit | 🚧 Partial | - | Need WCAG 2.2 AA full compliance |
| Performance Profiling | ❌ Not Started | - | Measure DOM injection impact |

---

## 🚀 Sprint 4: Canvas LMS Integration Foundation
**Duration:** 2-3 weeks
**Goal:** Deep Canvas integration for assignment reading and quiz assistance

### 4.1 Canvas DOM Analysis & Selectors
**Priority:** Critical
**Complexity:** Medium

**Tasks:**
1. Map Canvas LMS DOM structure for key elements:
   - Assignment content containers (`.user_content`, `.description`)
   - Quiz question elements (`.question_text`, `.answers`)
   - Discussion posts (`.discussion-entries`)
   - Announcement cards (`.ic-announcement-row`)
   - Module items (`.context_module_item`)

2. Create Canvas Adapter Module:
   - `src/adapters/canvas-adapter.js`
   - Detection functions: `isCanvasPage()`, `getPageType()`
   - Content extractors: `extractAssignmentText()`, `extractQuizQuestions()`
   - Element selectors with fallbacks for Canvas UI updates

3. Test across Canvas instances:
   - Instructure's public demo Canvas
   - Real university Canvas instances (if accessible)
   - Different Canvas themes/customizations

**Acceptance Criteria:**
- ✅ Reliably detect Canvas pages vs other sites
- ✅ Extract assignment text with proper formatting (paragraphs, lists, headings)
- ✅ Identify quiz questions, answers, and instructions
- ✅ Handle Canvas rich text editor content (embedded images, videos, iframes)

**Deliverables:**
- `canvas-adapter.js` with full documentation
- Canvas DOM structure map document
- Unit tests for selector reliability

---

### 4.2 Assignment Auto-Reader
**Priority:** High
**Complexity:** Medium

**Features:**
1. **Auto-detect assignments**: When user navigates to assignment page, show floating "Read Assignment" button
2. **Smart text extraction**: Parse assignment description, removing Canvas UI elements
3. **Section-by-section reading**: Break long assignments into sections (header-based)
4. **Read progress tracking**: Visual indicator of what's been read
5. **Bookmark support**: Resume reading from last position

**UI Components:**
- Floating action button (FAB) with "Read Assignment" icon
- Reading progress bar at top of assignment
- Skip/rewind controls for sections

**Implementation:**
```javascript
// Pseudo-code structure
class AssignmentReader {
  detectAssignment() {
    // Check if URL matches /courses/:id/assignments/:id
    // Verify presence of .assignment-description
  }

  extractContent() {
    // Get .user_content or .description
    // Clean HTML: remove Canvas UI, keep semantic structure
    // Split into sections by <h2>, <h3> tags
  }

  createReaderUI() {
    // Inject FAB, progress bar
    // Wire up TTS to read each section
    // Save bookmark to chrome.storage
  }
}
```

**Acceptance Criteria:**
- ✅ FAB appears on all Canvas assignment pages
- ✅ Clicking FAB reads assignment from top
- ✅ Progress bar updates as text is read
- ✅ Bookmark persists across page reloads
- ✅ Works with assignments containing images, embedded videos

---

### 4.3 Quiz Helper
**Priority:** Medium
**Complexity:** High

**Features:**
1. **Question-by-question reading**: Navigate through quiz questions with keyboard shortcuts
2. **Answer option reading**: Read each multiple choice option clearly
3. **Focus mode integration**: Darken screen except current question
4. **Timer awareness**: Don't interfere with Canvas timer, show time remaining
5. **Skip functionality**: "Next question", "Previous question", "Repeat question"

**Accessibility Challenges:**
- Canvas quizzes have complex nested DOM
- Must not trigger Canvas JavaScript events (accidental submissions)
- Handle different question types: multiple choice, true/false, essay, fill-in-blank

**UI Components:**
- Keyboard shortcuts overlay: `Q` = read question, `A/S/D/F` = read options 1-4
- Question navigator: "Question 1 of 10"
- Voice commands: "Read question", "Next question"

**Acceptance Criteria:**
- ✅ Reads quiz questions without triggering Canvas events
- ✅ Keyboard shortcuts work reliably
- ✅ Focus mode highlights current question only
- ✅ Works with all Canvas quiz question types
- ✅ Does NOT interfere with quiz timer or auto-save

---

### 4.4 Canvas Keyboard Navigation
**Priority:** Low
**Complexity:** Low

**Features:**
1. **Global shortcuts** (Ctrl+Shift+...):
   - `A`: Jump to assignments page
   - `M`: Jump to modules page
   - `D`: Jump to discussions
   - `G`: Jump to grades
   - `C`: Jump to course home

2. **Assignment page shortcuts**:
   - `N`: Next assignment
   - `P`: Previous assignment
   - `S`: Submit assignment (with confirmation)

3. **Module navigation**:
   - `J`: Next module item
   - `K`: Previous module item
   - `Enter`: Open current item

**Implementation:**
- Use `chrome.commands` API for keyboard shortcuts
- Fallback to `document.addEventListener('keydown')` if user doesn't set shortcuts
- Show shortcuts overlay with `?` key

**Deliverables:**
- Keyboard shortcuts reference card (in extension popup)
- Settings page to customize shortcuts
- Toast notifications when shortcuts used

---

## 🎨 Sprint 5: Speech-to-Text & Writing Features
**Duration:** 2-3 weeks
**Goal:** Enable writing assistance with STT and multimodal correction

### 5.1 Speech-to-Text (Web Speech API)
**Priority:** High
**Complexity:** Medium

**Features:**
1. **Context menu integration**: Right-click in any text input → "Speak to Type"
2. **Floating microphone button**: Appears when text field is focused
3. **Real-time transcription**: Words appear as user speaks
4. **Continuous mode**: Keep listening until user clicks stop (for long writing)
5. **Punctuation commands**: "period", "comma", "new line", "new paragraph"

**Supported Input Fields:**
- Canvas discussion posts
- Canvas assignment submissions (text entry)
- Canvas quiz essay questions
- Any `<textarea>` or `contenteditable` element

**UI Components:**
- Microphone icon (red when recording)
- Waveform visualization (optional)
- Transcription preview panel
- Confidence indicator (Web Speech API provides this)

**Implementation:**
```javascript
class SpeechToText {
  constructor() {
    this.recognition = new webkitSpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
  }

  startListening(targetField) {
    this.recognition.start();
    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      targetField.value += transcript;
    };
  }
}
```

**Acceptance Criteria:**
- ✅ Microphone button appears on all text fields
- ✅ Transcription accuracy > 90% for clear speech
- ✅ Punctuation commands work reliably
- ✅ Continuous mode records for 5+ minutes without stopping
- ✅ Works in Canvas discussion posts and assignments

---

### 5.2 FixOver Multimodal Correction System
**Priority:** Medium
**Complexity:** Very High

**Concept:** Inspired by research on multimodal input for students with dyslexia/dysgraphia
- Student types or speaks → system detects errors → offers correction via voice + visual overlay

**Features:**
1. **Real-time spell check**: Underline misspelled words as typed/spoken
2. **Correction suggestions**: Show 3-5 alternatives on hover
3. **Voice correction**: Read correction options aloud
4. **One-click fix**: Click underlined word to see/hear corrections
5. **Learning mode**: Explain why correction is suggested (homophones, common mistakes)

**Technical Approach:**
- **Client-side spell check**: Use browser's built-in spell check API
- **Custom dictionary**: Common dyslexia-friendly substitutions (e.g., "teh" → "the")
- **Context-aware**: Use simple grammar rules for homophone detection ("their/there/they're")

**Future Enhancement (Cloud-Based):**
- Integrate GPT-4 or similar LLM for advanced grammar checking
- Contextual corrections: "I went to the store and buy milk" → "bought"

**UI Components:**
- Wavy underline (like MS Word)
- Correction popup with voice playback button
- "Apply All" button for multiple corrections

**Acceptance Criteria:**
- ✅ Real-time spell check works in Canvas text fields
- ✅ Correction suggestions appear on hover
- ✅ Voice playback reads correction options
- ✅ One-click apply corrections
- ✅ Does not interfere with Canvas auto-save

---

## 🧪 Sprint 6: Testing & Quality Assurance
**Duration:** 2 weeks
**Goal:** Achieve 80% test coverage and WCAG 2.2 AA compliance

### 6.1 Unit Testing with Jest
**Priority:** Critical
**Complexity:** Medium

**Coverage Goals:**
- **Utility functions**: 100% coverage
  - `storage-manager.js`
  - `message-router.js`
  - Color conversion, text parsing helpers

- **Feature modules**: 80% coverage
  - `tts-controller.js`
  - `stt-controller.js`
  - `canvas-adapter.js`
  - `wai-adapt-manager.js`

**Testing Strategy:**
```javascript
// Example test structure
describe('TextCustomization', () => {
  test('applies font family correctly', () => {
    const settings = { fontFamily: 'lexend' };
    const css = generateCSS(settings);
    expect(css).toContain('"Lexend"');
  });

  test('converts percentage to em for letter spacing', () => {
    expect(percentToEm(12)).toBe(0.12);
  });
});
```

**Tasks:**
1. Set up Jest with jsdom environment
2. Write tests for all utility functions
3. Mock Chrome APIs (`chrome.storage`, `chrome.runtime`)
4. Achieve 80% coverage threshold (enforced in package.json)

**Deliverables:**
- `tests/` directory with comprehensive test suites
- `npm run test` command with coverage report
- CI/CD integration (GitHub Actions) to run tests on every commit

---

### 6.2 End-to-End Testing with Playwright
**Priority:** High
**Complexity:** High

**Test Scenarios:**
1. **TTS Flow**:
   - Open Canvas assignment page
   - Click paragraph
   - Verify TTS starts, highlighting appears
   - Verify pause/resume works

2. **Text Customization Flow**:
   - Open extension popup
   - Enable text customization
   - Change font to OpenDyslexic
   - Verify Canvas page font updates

3. **Focus Mode Flow**:
   - Enable Focus Mode
   - Move mouse
   - Verify rounded window follows cursor
   - Verify overlay darkness adjustable

4. **Cross-Feature Flow**:
   - Enable Reading Guide
   - Enable Focus Mode
   - Verify Reading Guide auto-disables (mutual exclusivity)

**Setup:**
- Use Playwright with Chromium
- Mock Canvas LMS pages (use local HTML fixtures)
- Test against real Canvas demo instance (Instructure sandbox)

**Deliverables:**
- `e2e-tests/` directory with Playwright test suites
- `npm run test:e2e` command
- Video recordings of test runs (Playwright feature)

---

### 6.3 Accessibility Audit (WCAG 2.2 AA)
**Priority:** Critical
**Complexity:** Medium

**Audit Areas:**
1. **Perceivable**:
   - ✅ SC 1.4.12 (Text Spacing) - Already compliant via Text Customization
   - ⚠️ SC 1.4.3 (Contrast) - Verify popup UI has 4.5:1 contrast ratio
   - ⚠️ SC 1.4.11 (Non-text Contrast) - Check button/control contrast

2. **Operable**:
   - ⚠️ SC 2.1.1 (Keyboard) - All features accessible via keyboard?
   - ✅ SC 2.5.8 (Target Size) - Buttons are 24px+ (already implemented)
   - ⚠️ SC 3.3.8 (Accessible Authentication) - Future consideration

3. **Understandable**:
   - ⚠️ SC 3.2.6 (Consistent Help) - Add help button in popup
   - ⚠️ SC 3.3.7 (Redundant Entry) - Settings import/export

**Tools:**
- axe DevTools (Chrome extension)
- WAVE (Web Accessibility Evaluation Tool)
- Manual keyboard navigation testing
- Screen reader testing (NVDA, JAWS)

**Deliverables:**
- Accessibility audit report (PDF)
- List of issues with severity ratings (Critical, High, Medium, Low)
- Remediation plan with timeline

---

### 6.4 Performance Profiling
**Priority:** Medium
**Complexity:** Medium

**Metrics to Measure:**
1. **Extension load time**: Time from page load to AssisT ready
2. **TTS latency**: Time from click to first word spoken
3. **DOM injection impact**: Measure impact on Canvas page load time
4. **Memory usage**: Ensure no memory leaks during long sessions

**Profiling Tools:**
- Chrome DevTools Performance tab
- Lighthouse performance audit
- `chrome.storage` quota monitoring

**Optimization Targets:**
- Extension load time: < 100ms
- TTS latency: < 200ms
- Memory usage: < 50MB after 1 hour of use

**Deliverables:**
- Performance benchmark report
- List of bottlenecks with optimization suggestions
- Optimized code (if performance issues found)

---

## ☁️ Sprint 7: Cloud TTS/STT Integration
**Duration:** 2-3 weeks
**Goal:** Professional voice synthesis and speech recognition with API fallbacks

### 7.1 Cloud TTS Engine Adapters
**Priority:** High
**Complexity:** High

**Supported Engines:**
1. **Google Cloud Text-to-Speech**
   - 380+ voices, 50+ languages
   - Neural2 voices (WaveNet quality)
   - SSML support for pronunciation control

2. **Amazon Polly**
   - Neural voices (24 languages)
   - Newscaster and conversational styles
   - Lower cost than Google

3. **ElevenLabs** (Premium option)
   - Ultra-realistic AI voices
   - Voice cloning for custom voices
   - Higher cost, best quality

4. **Murf.ai** (Education-focused)
   - Kid-friendly voices
   - Emotional tone control
   - Education pricing tiers

**Architecture:**
```javascript
// Abstract TTS Engine interface
class TTSEngine {
  async speak(text, options) { throw new Error('Not implemented'); }
  async getVoices() { throw new Error('Not implemented'); }
  pause() { throw new Error('Not implemented'); }
  resume() { throw new Error('Not implemented'); }
  stop() { throw new Error('Not implemented'); }
}

// Concrete implementations
class GoogleCloudTTS extends TTSEngine { /* ... */ }
class AmazonPollyTTS extends TTSEngine { /* ... */ }
class ElevenLabsTTS extends TTSEngine { /* ... */ }

// Engine manager with fallback logic
class TTSEngineManager {
  constructor() {
    this.engines = [
      new GoogleCloudTTS(),
      new AmazonPollyTTS(),
      new WebSpeechTTS() // Fallback
    ];
  }

  async speak(text) {
    for (const engine of this.engines) {
      try {
        await engine.speak(text);
        return;
      } catch (err) {
        console.warn(`${engine.name} failed, trying next...`);
      }
    }
  }
}
```

**API Key Management:**
- Store API keys securely in `chrome.storage.local` (encrypted)
- Allow users to provide their own API keys (BYOK - Bring Your Own Key)
- For institutions: Server-side proxy to hide API keys from students

**Cost Management:**
- Character count tracking
- Monthly quota limits (configurable per institution)
- Show usage stats in settings page

**Acceptance Criteria:**
- ✅ Users can select cloud TTS engine in settings
- ✅ API key storage is secure (encrypted)
- ✅ Automatic fallback to Web Speech API if quota exceeded
- ✅ Usage tracking displays characters used / quota remaining

---

### 7.2 Cloud STT Engine Adapters
**Priority:** Medium
**Complexity:** High

**Supported Engines:**
1. **Google Cloud Speech-to-Text**
   - 125+ languages
   - Real-time streaming
   - Automatic punctuation
   - Speaker diarization (identify different speakers)

2. **Whisper (OpenAI)**
   - State-of-the-art accuracy
   - Multilingual (100+ languages)
   - Runs locally (no API costs) but requires GPU
   - Can run on server with API wrapper

**Implementation:**
- Same adapter pattern as TTS
- Real-time streaming for long-form writing
- Punctuation and capitalization commands
- Language auto-detection

**Whisper Integration Options:**
1. **Local Whisper** (Advanced users with GPU):
   - Run Whisper.cpp locally
   - Extension communicates via localhost WebSocket

2. **Cloud Whisper API**:
   - OpenAI official API
   - Self-hosted Whisper API server (for institutions)

**Acceptance Criteria:**
- ✅ Real-time transcription with < 500ms latency
- ✅ Automatic punctuation insertion
- ✅ Accuracy > 95% for clear speech
- ✅ Language auto-detection works for top 10 languages

---

## 📊 Sprint 8: User Profiles & Learning Analytics
**Duration:** 2 weeks
**Goal:** Personalization profiles and usage insights for students and educators

### 8.1 User Profiles
**Priority:** Medium
**Complexity:** Medium

**Features:**
1. **Profile presets**: "Dyslexia", "ADHD", "Low Vision", "Custom"
2. **One-click switching**: Dropdown in popup to switch profiles
3. **Import/Export**: Download profile as JSON, share with other students
4. **Cloud sync** (Future): Sync profiles across devices via Google account

**Profile Schema:**
```json
{
  "profileName": "My Dyslexia Profile",
  "tts": {
    "enabled": true,
    "voice": "Google UK English Female",
    "rate": 0.9,
    "pitch": 1.0,
    "highlightEnabled": true,
    "highlightColor": "#FFEB3B"
  },
  "textCustomization": {
    "enabled": true,
    "fontFamily": "opendyslexic",
    "lineSpacing": 2.0,
    "letterSpacing": 0.15
  },
  "focusMode": {
    "enabled": false,
    "boxWidth": 400,
    "boxHeight": 150,
    "overlayOpacity": 0.8
  }
}
```

**UI Components:**
- Profile dropdown in popup header
- "Save Current as Profile" button
- Profile manager page (popup → Settings → Manage Profiles)

**Acceptance Criteria:**
- ✅ Create, edit, delete profiles
- ✅ Switch profiles updates all settings instantly
- ✅ Export profile as JSON file
- ✅ Import profile from JSON file

---

### 8.2 Learning Analytics Dashboard
**Priority:** Low
**Complexity:** High

**Metrics to Track:**
1. **Usage Stats**:
   - TTS words read per day
   - STT words typed per day
   - Focus Mode usage time
   - Reading Guide usage time

2. **Learning Insights**:
   - Reading speed (words per minute)
   - Most-read content types (assignments, discussions, etc.)
   - Time spent on Canvas vs other sites

3. **Feature Adoption**:
   - Which features used most often
   - Identify unused features for UX improvements

**Privacy-First Design:**
- All data stored locally (`chrome.storage.local`)
- NO data sent to external servers without explicit consent
- Option to export anonymized data for research purposes (opt-in)

**Dashboard UI:**
- New page in extension: `dashboard.html`
- Charts using Chart.js or D3.js
- Date range selector (Last 7 days, Last 30 days, All time)

**Acceptance Criteria:**
- ✅ Dashboard displays accurate usage statistics
- ✅ Charts are accessible (WCAG 2.2 AA compliant)
- ✅ All data stored locally, no external tracking
- ✅ Export analytics as CSV file

---

## 🌐 Sprint 9: Multi-Platform LMS Support
**Duration:** 3-4 weeks
**Goal:** Expand beyond Canvas to Moodle, Blackboard, Google Classroom

### 9.1 Moodle Adapter
**Priority:** Medium
**Complexity:** Medium

**Canvas vs Moodle Differences:**
- Moodle uses different DOM structure (`.course-content`, `.activity`)
- Assignment pages: `.assignment-submission`
- Quiz pages: `.quiz-attempt`

**Implementation:**
- Create `moodle-adapter.js` parallel to `canvas-adapter.js`
- Detection: Check for `<body class="path-mod-...">`
- Content extraction: Map Moodle selectors to generic content objects

**Testing:**
- Use MoodleCloud free demo site
- Test with Moodle 4.x (latest version)

---

### 9.2 Blackboard Adapter
**Priority:** Low
**Complexity:** High

**Challenges:**
- Blackboard uses heavy JavaScript frameworks (React/Angular)
- Content is often loaded dynamically
- Multiple Blackboard versions in use (Learn, Ultra, etc.)

**Approach:**
- Use MutationObserver to detect content changes
- Wait for React to finish rendering before extracting content
- Build separate adapters for Learn vs Ultra

---

### 9.3 Google Classroom Adapter
**Priority:** Low
**Complexity:** Low

**Google Classroom is simpler:**
- Less complex DOM than Canvas/Blackboard
- Assignments: `.YVvGBb` (Google class names change often)
- Use `aria-label` attributes as fallback selectors

**Implementation:**
- `google-classroom-adapter.js`
- Test with real Google Classroom (free for educators)

---

## 🏢 Sprint 10: Enterprise Features & Deployment
**Duration:** 2-3 weeks
**Goal:** Institution-level deployment, admin dashboard, FERPA compliance

### 10.1 Institution Deployment Package
**Priority:** High (for B2B sales)
**Complexity:** Medium

**Features:**
1. **Pre-configured profiles**: Institution can set default settings for students
2. **Force-install via Chrome policy**: Deploy to all students' Chromebooks
3. **Centralized API key management**: Institution provides API keys, not students
4. **Usage quotas**: Limit TTS/STT usage per student (cost control)

**Chrome Policy Template:**
```json
{
  "ExtensionSettings": {
    "extension-id-here": {
      "installation_mode": "force_installed",
      "update_url": "https://clients2.google.com/service/update2/crx"
    }
  }
}
```

**Deliverables:**
- Institution deployment guide (PDF)
- Chrome policy template
- Pre-configured profile JSONs for common use cases

---

### 10.2 Admin Dashboard
**Priority:** Medium
**Complexity:** Very High

**Features:**
1. **Student usage overview**: See which students are using the extension
2. **Feature adoption metrics**: Which features are most/least used
3. **Cost tracking**: TTS/STT API usage costs per student
4. **Support ticket integration**: Students can report issues from extension

**Tech Stack:**
- **Frontend**: React dashboard hosted on institution server
- **Backend**: Node.js API to collect anonymized usage data
- **Database**: PostgreSQL for usage metrics
- **Auth**: OAuth 2.0 with institution SSO (Shibboleth, SAML)

**Privacy Compliance:**
- NO PII (Personally Identifiable Information) stored
- All data anonymized (student IDs hashed)
- FERPA compliant: data never leaves institution's control
- GDPR ready: data retention policies, right to be forgotten

**Acceptance Criteria:**
- ✅ Admin can view aggregated usage stats (no individual student data)
- ✅ Cost tracking shows API usage per month
- ✅ Dashboard accessible only to authorized admins (OAuth)
- ✅ Full FERPA compliance audit passed

---

### 10.3 FERPA & Security Audit
**Priority:** Critical
**Complexity:** High

**FERPA Requirements:**
1. **No PII transmission**: Student names, IDs, emails never sent to external servers
2. **Explicit consent**: Students must opt-in to any data collection
3. **Data retention**: Clear policies on how long data is stored
4. **Right to access**: Students can download all their data

**Security Measures:**
1. **API key encryption**: Use Web Crypto API to encrypt API keys in storage
2. **HTTPS only**: All API calls use HTTPS
3. **Content Security Policy**: Strict CSP in manifest.json
4. **Regular updates**: Security patch process

**Deliverables:**
- FERPA compliance report (reviewed by legal counsel)
- Security audit report (penetration testing by third party)
- Privacy policy document (student-facing)
- Terms of service document

---

## 📈 Success Metrics & KPIs

### Student-Facing Metrics:
- **Adoption Rate**: % of students using extension after install
- **Daily Active Users (DAU)**: Students using extension daily
- **Feature Usage**: % of users who enable each feature
- **Satisfaction Score**: NPS (Net Promoter Score) from surveys

### Technical Metrics:
- **Crash Rate**: < 0.1% of sessions
- **Performance**: Extension load time < 100ms
- **Test Coverage**: Maintain 80%+ code coverage
- **Bug Count**: < 5 critical bugs per release

### Business Metrics (for institutions):
- **Cost per Student**: TTS/STT API costs per student per month
- **ROI**: Improved grades, lower dropout rates (requires long-term study)
- **Support Tickets**: < 10 tickets per 1000 students per month

---

## 🛠️ Technical Debt & Refactoring (Ongoing)

### High Priority Refactors:
1. **Modularize content-simple.js**:
   - Current file is 1000+ lines (too large)
   - Split into feature modules: `tts-feature.js`, `focus-mode-feature.js`, etc.
   - Milestone: When file exceeds 1200 lines

2. **TypeScript migration**:
   - Add type safety to reduce runtime errors
   - Start with utility functions, then feature modules
   - Milestone: After Sprint 6 (testing infrastructure in place)

3. **Centralized event bus**:
   - Replace direct chrome.storage listeners with event emitter pattern
   - Easier to debug, better separation of concerns
   - Milestone: Sprint 7 (when adding cloud APIs)

### Medium Priority Refactors:
1. **CSS-in-JS for dynamic styles**:
   - Replace inline styles with styled-components or similar
   - Better maintainability, easier theming

2. **Webpack/Rollup for bundling**:
   - Current build script is simple file copying
   - Add minification, tree-shaking, code splitting

3. **Internationalization (i18n)**:
   - Support multiple languages (Spanish, French, German)
   - Use chrome.i18n API

---

## 📚 Documentation Plan

### User Documentation:
1. **User Guide** (PDF/Web):
   - Getting started tutorial
   - Feature reference (each feature explained with screenshots)
   - Keyboard shortcuts cheat sheet
   - Troubleshooting guide

2. **Video Tutorials** (YouTube):
   - 3-minute intro: "What is AssisT?"
   - Feature spotlights: 1-minute videos per feature
   - Setup guide: "Installing AssisT in 60 seconds"

3. **In-App Help**:
   - Tooltips on first use (guided tour)
   - Help button in popup → opens user guide
   - Contextual help ("?" icons next to complex settings)

### Developer Documentation:
1. **Architecture Document**:
   - System diagram: how components interact
   - Data flow: how settings propagate from popup to content script
   - Extension lifecycle: when scripts load, when they unload

2. **API Reference**:
   - JSDoc comments on all public functions
   - Generate API docs with JSDoc → HTML

3. **Contributing Guide**:
   - Code style (ESLint config)
   - Git workflow (feature branches, PR process)
   - How to run tests locally

### Institutional Documentation:
1. **Deployment Guide** (for IT departments):
   - Chrome policy setup
   - Pre-configuration instructions
   - Troubleshooting common deployment issues

2. **Admin Dashboard Guide**:
   - How to read usage metrics
   - Cost management best practices
   - Privacy and compliance FAQs

---

## 🎓 Research & Validation

### User Studies:
1. **Usability Testing** (Sprint 6):
   - Recruit 10-15 students with learning differences
   - Observe them using AssisT on real Canvas assignments
   - Identify pain points, confusing UI elements

2. **Longitudinal Study** (Post-Launch):
   - Partner with university to track student outcomes over semester
   - Measure: grades, assignment completion rates, time on task
   - Compare AssisT users vs control group

3. **Educator Feedback** (Ongoing):
   - Interview instructors about accessibility needs in their courses
   - Identify Canvas pain points from educator perspective
   - Build features that help educators create accessible content

### Academic Partnerships:
- **University disability services offices**: Beta testing, feedback
- **Education technology researchers**: Validate effectiveness
- **Accessibility labs**: WCAG compliance testing

---

## 🚦 Release Strategy

### Alpha Release (Internal):
- Sprint 1-3 features (current state)
- Limited to development team + 5-10 beta testers
- Focus: Stability, basic functionality

### Beta Release (Public):
- Sprint 4-6 complete (Canvas integration + testing)
- Open beta: Anyone can install from Chrome Web Store (unlisted)
- Collect feedback via Google Forms
- Iterate based on bug reports

### Version 1.0 Release:
- All core features stable (Sprints 1-6)
- WCAG 2.2 AA compliant
- 80% test coverage
- Public Chrome Web Store listing

### Version 2.0 Release:
- Cloud TTS/STT (Sprint 7)
- User profiles (Sprint 8)
- Multi-platform LMS support (Sprint 9)
- Enterprise features (Sprint 10)

---

## 💰 Monetization Strategy (Optional)

### Freemium Model:
- **Free Tier**:
  - All MVP features (TTS, text customization, reading guide, focus mode)
  - Web Speech API only (no cloud voices)
  - 10,000 TTS characters per month

- **Pro Tier** ($5/month per student):
  - Cloud TTS (Google/Amazon voices)
  - Cloud STT (Google/Whisper)
  - Unlimited usage
  - Priority support

- **Institutional Tier** (Contact for pricing):
  - All Pro features
  - Admin dashboard
  - Centralized billing
  - SSO integration
  - 99.9% uptime SLA

### Alternative: Grant-Funded / Non-Profit:
- Apply for education technology grants
- Partner with universities for research funding
- Open-source with optional paid support

---

## 📅 Timeline Summary

| Sprint | Duration | Key Deliverables | Status |
|--------|----------|------------------|--------|
| Sprint 1-3 (MVP) | 4 weeks | TTS, Text Customization, Reading Guide, Focus Mode | ✅ Complete |
| Sprint 4 | 2-3 weeks | Canvas LMS Integration (Assignment Reader, Quiz Helper) | 🔜 Next |
| Sprint 5 | 2-3 weeks | STT, FixOver Correction System | 📋 Planned |
| Sprint 6 | 2 weeks | Testing (80% coverage), WCAG Audit, Performance Profiling | 📋 Planned |
| Sprint 7 | 2-3 weeks | Cloud TTS/STT Adapters (Google, Amazon, Whisper) | 📋 Planned |
| Sprint 8 | 2 weeks | User Profiles, Learning Analytics Dashboard | 📋 Planned |
| Sprint 9 | 3-4 weeks | Multi-Platform LMS (Moodle, Blackboard, Google Classroom) | 📋 Planned |
| Sprint 10 | 2-3 weeks | Enterprise Features, Admin Dashboard, FERPA Audit | 📋 Planned |

**Total Estimated Timeline:** 5-6 months to production-ready v2.0

---

## 🎯 Prioritization Framework

Use MoSCoW method for features:

### Must Have (for v1.0):
- ✅ TTS with highlighting
- ✅ Text customization
- ✅ Reading guide
- ✅ Focus mode
- 🔜 Canvas assignment reader
- 🔜 Basic STT
- 🔜 80% test coverage
- 🔜 WCAG 2.2 AA compliance

### Should Have (for v1.0):
- Canvas quiz helper
- Keyboard navigation
- User profiles (basic)

### Could Have (for v2.0):
- Cloud TTS/STT
- FixOver correction system
- Learning analytics
- Multi-platform LMS

### Won't Have (deferred):
- Mobile app (Chrome on mobile has limited extension support)
- LTI integration (too complex for current scope)
- AI-powered study guides (interesting but out of scope)

---

## 🤝 Collaboration & Roles

### For Solo Developer (Current):
- Work through sprints sequentially
- Focus on high-priority features first
- Use GitHub Projects for task management

### For Team Expansion:
- **Frontend Developer**: Popup UI, settings pages, dashboard
- **Backend Developer**: Admin dashboard API, cloud integration
- **QA Engineer**: Testing, accessibility auditing
- **UX Designer**: User research, wireframes, usability testing
- **DevOps Engineer**: CI/CD, Chrome Web Store deployment

---

## 📖 Conclusion

This roadmap transforms AssisT from MVP to production-ready enterprise extension. Key focus areas:

1. **Canvas Deep Integration** (Sprint 4): Make AssisT indispensable for Canvas users
2. **Writing Features** (Sprint 5): Balance reading tools with writing assistance (STT, FixOver)
3. **Quality Assurance** (Sprint 6): Ensure rock-solid stability and accessibility
4. **Advanced Features** (Sprints 7-8): Cloud APIs, analytics for power users
5. **Scalability** (Sprints 9-10): Multi-platform, enterprise deployment

**Next Immediate Steps:**
1. Review this roadmap with stakeholders
2. Prioritize Sprint 4 features (Canvas integration)
3. Set up testing infrastructure (Jest + Playwright)
4. Begin Canvas DOM analysis

**Long-term Vision:**
AssisT becomes the standard accessibility tool for all LMS platforms, helping millions of neurodivergent students succeed in higher education.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-12
**Status:** Ready for Sprint 4 Planning
