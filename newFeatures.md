# New Features & Changes - Last 14 Days

**Period:** November 14 - November 28, 2025
**Total Commits:** 90+
**Phase:** Phase 2 (Sessions 005-036)

---

## Major Feature Additions

### 1. Speech-to-Text (STT) System (Phase 2.7)
A comprehensive speech-to-text system designed for neurodivergent users:

- **Voice Editing Commands** - Natural language commands for text editing via voice
- **Smart Auto-Punctuation** - Linguistic analysis for automatic punctuation insertion
- **Confidence & Quality Feedback** - Real-time feedback on transcription accuracy
- **Custom Vocabulary** - User-defined vocabulary with presets and auto-learning
- **Neurodivergent STT Profiles** - Quick-switch profiles optimized for different needs
- **STT Testing & Documentation** - Comprehensive testing infrastructure

### 2. OCR (Optical Character Recognition) System
Complete image-to-text functionality:

- **Tesseract.js Integration** - Lazy-loaded OCR engine
- **Screenshot Capture** - Visible area and full-page with image stitching
- **Region Selection** - Click-and-drag area selection for targeted OCR
- **OCR Media Player** - Audio playback of extracted text with chunking controls
- **Image Upscaling** - Adaptive quality slider for improved accuracy
- **TTS Integration** - Direct text-to-speech from extracted text
- **Settings Panel** - Language selection, confidence thresholds, auto-TTS options
- **Keyboard Shortcut** - Alt+O to trigger OCR

### 3. Citation Management System (Phase 2.4)
Academic citation tools for research:

- **Citation Capture & Metadata Extraction** - Automatic source information parsing
- **Bibliography Manager UI** - Visual management interface
- **Project Manager** - Kanban-style organization for citations
- **Source Evaluator** - CRAAP test and credibility scoring
- **Citation Export** - Multiple format support (Harvard, APA, etc.)
- **Quality Filtering** - Filter sources by credibility score
- **Citation Manager Panel** - Quick-view panel in popup

### 4. Accessibility Features (Phase 2.6)
Neurodivergent-focused accessibility enhancements:

- **True Dark Mode** - 4 theme presets with aggressive element targeting
- **Reduced Motion Mode** - For sensory-sensitive users
- **Auto-play Media Blocking** - Prevents unexpected audio/video playback
- **Pomodoro Timer** - Focus/break timer with customizable intervals
- **Reading Progress Indicator** - Visual progress tracking
- **Simplified Interface Mode** - Decluttered UI option
- **Extended Font Library** - 4 new fonts including Atkinson Hyperlegible

### 5. Translation System (Feature 6)
Multi-language translation support:

- **LibreTranslate & Google Translate API** - Dual API integration
- **MyMemory API Migration** - Zero-barrier accessibility (no API key required)
- **Translation UI & Modal** - User-friendly interface
- **Full-Page Translation** - Translate entire pages
- **Settings Panel** - Language preferences and API configuration

### 6. Reading Mode (Feature 3)
Distraction-free reading experience:

- **Mozilla Readability Integration** - Clean article extraction
- **Popup Toggle Button** - Easy activation from extension popup
- **Customizable Display** - Font, size, and color options

### 7. Highlight Menu (Feature 2)
Text selection toolbar:

- **Floating Toolbar** - Appears on text selection
- **Keyboard Navigation Support** - Full accessibility
- **Settings Panel** - Customizable toolbar options
- **Visibility Toggles** - Control which buttons appear

### 8. Dictionary Lookup (Feature 4)
Inline word definitions:

- **Dictionary API Integration** - Real-time word lookup
- **Settings Panel** - Dictionary preferences
- **Keyboard Shortcut Support** - Quick access

### 9. Annotations System Enhancements (Feature 5)
Improved note-taking capabilities:

- **Color Picker** - Custom colors for sticky notes
- **Resize Handles** - Adjustable note dimensions
- **IndexedDB Storage** - Dexie.js adapters for efficient storage
- **Storage Mode Selection** - Choose between storage backends
- **Auto-Migration** - Seamless data migration between storage modes

### 10. Text Statistics (Feature 7)
Document analysis tools:

- **7 Counting Algorithms** - Words, characters, sentences, paragraphs, etc.
- **UI Components** - Visual statistics display
- **Comprehensive Testing** - Full test coverage

### 11. Keyboard Shortcuts System
Comprehensive hotkey support:

- **14 Keyboard Shortcuts** - For all major features
- **Alt+O** - Trigger OCR
- **Full Documentation** - Keyboard shortcuts reference guide

---

## Bug Fixes

### UI Fixes
- Dark mode coverage improvements with aggressive element targeting
- Screen color overlay rewritten to use CSS filters and background tinting
- Dyslexia mode, color overlay, and Pomodoro defaults improved
- Highlight Menu toolbar button visibility toggles fixed
- Toggle switch positioning issues resolved
- Scroll offset removed from fixed position toolbar
- Button click handler race conditions resolved

### Build System
- Vite bundling system restored
- AI sub-agent integration infrastructure added

### Testing
- E2E test selectors updated for toggle interaction patterns
- TTS controller test suite fixed (44 tests passing)
- 102 failing annotation tests resolved
- OCR unit tests added (42 tests, 100% pass)
- Highlight Menu E2E tests added (11 tests, 100% pass)

### Integration
- `readText` and `showToast` exposed for feature integration
- Storage access patterns consolidated
- Dead code archived

---

## Infrastructure Improvements

- **AI Sub-Agent Infrastructure** - Automated feature development support
- **Dexie.js Integration** - IndexedDB storage adapters
- **Centralized Storage Utility** - Consolidated storage patterns
- **Opus 4.5 Configuration** - Optimized project settings for enhanced AI capabilities

---

## Documentation Updates

- Keyboard shortcuts reference added
- README updated for Phase 2.7
- Comprehensive project transfer document
- OCR feature documentation
- Session documentation (Sessions 005-036)

---

## Test Coverage

| Feature | Tests | Status |
|---------|-------|--------|
| TTS Controller | 44 | Passing |
| OCR Functions | 42 | Passing |
| Annotation Tests | 102 | Passing |
| Highlight Menu E2E | 11 | Passing |
| Reading Mode E2E | Added | Passing |
| Citation E2E | Added | Passing |
| Dictionary API | Added | Passing |
| OCR E2E | 14 | Passing |

---

*Generated: November 28, 2025*
