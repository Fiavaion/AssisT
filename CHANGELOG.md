# Changelog

All notable changes to AssisT are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Planned

- Whisper offline STT engine
- Azure Speech cloud STT adapter
- v1.0.0 stable release

---

## [0.9.0] — Public Beta — 2026-05-21

First public release, launched on Global Accessibility Awareness Day (GAAD) 2026.

### Reading & TTS

- Text-to-Speech with synchronized word/sentence highlighting (speed 0.5×–2.0×, voice, pitch, volume)
- Word-by-word highlighting with boundary-event sync and timer-prediction fallback
- Configurable reading scope: paragraph, section, or whole page (skips nav/headers)
- Reading Mode — distraction-free reader view (Alt+R)
- Dyslexia Mode — Bionic Reading, Syllable Colours, Grammar Colours (Alt+Y)
- OCR (Alpha) — capture and read text from images and PDFs (Alt+O)

### Writing & STT

- Speech-to-Text (Beta) — Web Speech API, continuous listening, auto-punctuation, voice editing commands
- Confidence feedback with low-confidence word highlighting
- Vocabulary manager — custom words + domain presets (medical, legal, academic, STEM)
- Annotations & Sticky Notes — per-URL notes in IndexedDB, sidebar manager, JSON export (Alt+N)

### Text & Visual Customisation

- Text Customisation — WCAG 2.2 SC 1.4.12: font, line/letter/word/paragraph spacing, tab sync
- Highlight Menu — on-select mini-toolbar (TTS, dictionary, translate, annotate, speed-read)
- Dictionary Lookup — inline word definitions via Free Dictionary API (Alt+Shift+D)
- Translation — full-page and selection (MyMemory, DeepL, Microsoft Translator) (Alt+T)
- Text Statistics — readability metrics overlay (Ctrl+Shift+W)

### Focus & Visual Aids

- Focus Mode — spotlight window with adjustable dimensions and overlay darkness (Alt+F)
- Reading Guide — horizontal cursor-tracking line (Alt+G)
- Screen Overlay — full-screen tinted comfort overlay (Alt+Shift+O)
- Magnifying Lens — hovering magnifier with zoom, offset, and lock modes
- Custom Cursor, Reduced Motion, Media Controls, Simplified Page View

### Productivity

- Pomodoro Timer — configurable intervals with sound and auto-start
- Reading Progress — scroll position indicator
- Citations — detect, save, verify (CrossRef / Semantic Scholar), export bibliography

### LMS Integrations

- Canvas LMS — assignment reader, quiz helper, keyboard navigation
- Moodle — assignment, forum, and page readers
- Google Classroom (Alpha) — assignment, stream, and classwork readers

### AI Assist (4 Privacy Modes)

- Off, Local/Ollama (100% private), Browser/WebLLM (8 models via WebGPU, 100% private), Cloud (your own API key — Anthropic, Google Gemini, OpenAI, Perplexity)
- AI features: Summarisation, Text Simplification, Study Path Generator, Assignment Breakdown, Socratic Tutor, Multi-Doc Compare, Citation Analyser, Knowledge Graph

### Keyboard Shortcuts & Profiles

- 14 configurable shortcuts with conflict detection; 3 presets (Default, Minimal, One-Handed)
- Shortcut badges in popup labels (⌥ Mac / Alt Windows); live-reload on change
- 4 base profiles (General, ADHD, Dyslexia, Low Vision); save/import/export custom profiles
- Discovery Quiz — recommends tools based on learning style

### Security & Quality

- DOMPurify 3.4.2 (XSS prevention); AES-256-GCM for stored API keys
- No data collection, no analytics, no external servers; FERPA/COPPA/GDPR compliant
- Manifest V3; production bundle ~11 MB (dev sourcemaps only)
- 997 unit tests passing; Pa11y WCAG2AA clean; 0 production CVEs

---

## [0.1.2] - 2026-04-12

### 🐛 Fixed

#### API Key Security

- **AI Setup wizard now encrypts API keys** — keys are routed through the service worker and stored with AES-256-GCM encryption; previously stored in plain text

#### UI / Visual

- **Minimize UI clutter** — "Minimize clutter" toggle now reliably hides the Text Stats badge
- **TTS highlights** — disabling TTS now immediately clears stale highlights from the page
- **Canvas white-text inheritance** — added explicit `color: #333` to root panel elements in Study Path Generator, Assignment Breakdown, Citation Analyzer, and Summarization panels; prevents invisible text on dark-themed pages (Canvas LMS, e2e test harness)
- **Translation modal** — language dropdowns and result text now render with correct `#333` color on Canvas
- **Multi-Document Compare** — result text and remove button now render correctly on Canvas

#### STT (Speech-to-Text)

- **Mic button scroll tracking** — button now correctly follows its text field when the page scrolls, using document-level capture phase listeners (fixes Canvas quiz panels and non-standard overflow containers)

#### Multi-Document Compare

- **Drag rewritten with Pointer Events API** — `setPointerCapture` replaces the unreliable `mousedown`+`document.mousemove` pattern; drag is now reliable with no listener leaks
- **Compare button now functional** — fixed `ReferenceError` on `mdc_isLoading`/`mdc_comparisonResult` (variables were referenced but not declared, silently swallowed by event handler try/catch)
- **Panel defaults to top-right** — improved initial positioning

#### Translation

- **Language pair memory** — From/To language dropdowns now remember the last used pair across sessions

#### Text Customization Sync

- **Sync toggle defaults to OFF** — text customization now only affects the current window by default (opt-in to broadcast)
- **Toggle ON immediately applies** — enabling sync pushes current customization to all open tabs
- **Toggle OFF cleanly clears** — disabling sync removes customization from all other tabs
- **Storage race condition fixed** — now uses `chrome.tabs.sendMessage` instead of `chrome.storage.local` (which is shared across all tabs, defeating per-window intent)

---

## [0.1.1] - 2026-02-11

### ✨ Added

#### AI Mode Selection (4 Modes)

- **Off Mode** - Disable all AI features
- **Local AI Mode** - Use Ollama for on-device processing
- **Cloud AI Mode** - Use Anthropic Claude API
- **Gemini Nano Mode (NEW)** - Chrome's built-in AI via Prompt API
- Radio toggle UI for seamless mode switching
- Per-mode configuration containers with dedicated settings

#### Gemini Nano Integration

- Client for Chrome Prompt API (`window.ai`)
- Availability checking and status reporting
- On-device AI processing (no external API calls)
- Setup instructions for Chrome 128+ feature flag
- Status badge showing real-time availability

#### Google AI Models Support

- Gemini 1.5 Flash (fast & economical)
- Gemini 1.5 Pro (balanced, recommended)
- Gemini 2.0 Flash Experimental (latest features)

#### Chrome Web Store (CWS) Compliance

- Optional permissions system (user-granted `<all_urls>`)
- Improved permission flow for better user experience
- GDPR compliance section in privacy policy
- CWS screenshot capture automation tool

#### UI/UX Improvements

- Minimize UI clutter toggle in header
- Accessibility feature for sensory sensitivities
- Dark mode styling for AI mode selector
- Status badges for AI modes (Local AI / Cloud AI / Gemini)
- Improved keyboard shortcut layout

### 🗑️ Removed

#### Stargardt Vision Mode (Complete Removal)

- Removed all 11 Stargardt feature files
  - `stargardt.js` - Main feature controller
  - `apvui-engine.js` - APVUI rendering engine
  - `calibration-ui.js` - Calibration wizard
  - `content-remapper.js` - DOM remapping logic
  - `eye-tracking-controller.js` - Eye tracking integration
  - `gaze-tracker.js` - Gaze tracking implementation
  - `webgazer-loader.js` - WebGazer library loader
  - `light-adapt.js` - Light adaptation system
  - `prl-trainer.js` - Preferred retinal locus training
  - `scotoma-profile.js` - Scotoma profiling
  - `setup-wizard.js` - Setup wizard UI
- Removed all NCAD branding references from codebase
- Deleted old build directories (`AssistLLM/`, `AssistV2a/`)

### 🔧 Fixed

#### Content Script Injection

- Automatic injection for non-LMS sites when `<all_urls>` permission granted
- Service worker listener for `chrome.tabs.onUpdated`
- Permission grant handler for mass tab injection
- Fixed `web_accessible_resources` for Vite bundled assets
- Proper handling of bundled paths (`assets/*.js`, `assets/*.css`)

#### Extension Errors

- Resolved various runtime errors
- Fixed keyboard shortcut layout conflicts
- Improved event handler reliability

### 📄 Documentation

#### Added Documentation Files

- `AI_PROMPTS_REFERENCE.md` - Complete AI prompt library
  - All prompts for Summarization, Assignment Breakdown, Text Simplification, Socratic Tutor
  - Local vs Cloud model prompt differences
  - Benchmark-optimized model defaults
  - Prompt engineering best practices

- `PERFORMANCE_ANALYSIS.md` - Performance audit report
  - 3 critical performance bottlenecks identified
  - Load testing scenarios and recommendations
  - Security assessment (all checks passed ✅)
  - Priority fixes list with implementation guidance

#### Updated Documentation

- Privacy policy updated with GDPR compliance section
- Updated for optional permissions model

### ⚙️ Configuration

- Updated `.gitignore` for cleaner repository
- Storage API additions for AI mode state tracking
  - `llmEnabled` - Local AI mode status
  - `cloudModeEnabled` - Cloud AI mode status
  - `geminiEnabled` - Gemini Nano mode status

### 🔒 Security

- Improved permission model (optional vs required)
- GDPR compliance documentation
- No security vulnerabilities introduced

---

## [0.1.0] - 2025-11-28

### Initial Release

#### Core Features

- Text-to-Speech with synchronized highlighting
- Speech-to-Text with 60+ voice commands
- Dyslexia-Optimized Reading (Bionic, Syllable, Grammar modes)
- Multi-Platform LMS Integration (Canvas, Moodle, Google Classroom)
- OCR + Screenshot Tool
- Reading Mode with distraction-free view
- Dictionary Lookup
- Translation (35+ languages)
- Citation Management System
- Annotations & Sticky Notes
- Canvas Quiz Helper
- User Profiles (9 neurodivergent presets)
- Text Customization (11 fonts, size, spacing, colors)
- Reading Guide and Focus Mode
- Screen Overlays and True Dark Mode
- Pomodoro Timer
- Full Keyboard Shortcuts (14 customizable)
- Consistent Help button (WCAG 2.2 compliant)

#### Testing Infrastructure

- 979 unit tests passing
- 356 STT-specific tests
- 74+ E2E tests
- 43 manual test cases documented

#### Documentation

- Complete setup guide
- Testing guide with 43 test cases
- Development standards (CLAUDE.md)
- Keyboard shortcuts reference
- Voice commands reference
- STT user guide
- Citation system guide

---

## Release Notes

### Version 0.1.1 Summary

This release introduces **flexible AI integration** with three different modes (Local, Cloud, and Chrome's built-in Gemini Nano), improves **Chrome Web Store compliance** with optional permissions, and removes legacy features (Stargardt mode) and branding references (NCAD). The extension now offers users more choice in how they process AI features while maintaining privacy and performance.

Key highlights:

- 🤖 **3 AI modes** to choose from based on privacy/performance needs
- 💎 **Gemini Nano** integration for on-device AI (no API calls)
- ✅ **CWS compliance** improvements for smoother distribution
- 🧹 **Code cleanup** with removal of experimental features
- 📚 **Better documentation** with prompt reference and performance analysis

### Upgrade Notes

**From 0.1.0 to 0.1.1:**

- No breaking changes
- Stargardt mode removed (experimental feature with low adoption)
- New AI mode selection in Advanced Options → AI Assist
- Optional permissions now requested on-demand instead of upfront
- No data migration required

### Known Issues

- E2E tests need selector updates (74+ currently passing)
- Gemini Nano requires Chrome 128+ with feature flag enabled
- Performance bottlenecks identified in PERFORMANCE_ANALYSIS.md (non-critical)

---

**Full Changelog:** https://github.com/MarJone/AssisT/compare/v0.1.0...v0.1.1
