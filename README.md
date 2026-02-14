# 🎓 AssisT - Adaptive EdTech Chrome Extension

**Version:** 0.1.1
**Status:** Production Ready ✅
**License:** MIT
**Repository:** https://github.com/MarJone/AssisT

[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-979%20passing-green)](tests/)

---

## 🚀 Beyond Accessibility: Augmentative Technology

**AssisT isn't just an accessibility tool - it's augmentative technology that superpowers learning for everyone.**

Traditional accessibility tools help you cope with barriers. **AssisT helps you excel.**

- **Not a crutch, but a superpower** — Features like AI summarization, text-to-speech, and OCR don't just make content "accessible," they enhance how everyone learns
- **Leveling the playing field** — Everyone has different learning strengths. AssisT lets you leverage YOUR strengths instead of struggling with your weaknesses
- **For ALL learners** — Yes, AssisT was designed with neurodivergent students in mind, but neurotypical students benefit just as much. Speed readers use TTS. Honor students use AI summarization. Visual learners use highlighting. **Everyone learns differently.**

Think of AssisT as **augmented learning** — just as augmented reality enhances what you see, AssisT enhances how you learn, comprehend, and retain information.

---

## 📖 Overview

**AssisT** is an adaptive augmentative technology Chrome extension that superpowers learning for all students. Whether you're neurodivergent, neurotypical, a visual learner, or an auditory learner, AssisT provides tools to enhance your learning abilities. It offers comprehensive text-to-speech, AI-powered assistance, reading optimization, and innovative features designed to help every learner excel.

### 🎯 Target Users

- **ALL learners** seeking to enhance their learning capabilities
- Students with dyslexia, ADHD, or other learning differences
- Neurotypical students looking to optimize their study efficiency
- Students using Canvas LMS, Moodle, or Google Classroom
- Visual learners, auditory learners, and kinesthetic learners
- Anyone who wants to supercharge their education

### ✨ Key Features

- 🔊 **Text-to-Speech** with synchronized word-by-word highlighting
- 🎤 **Speech-to-Text** with 60+ voice commands and neurodivergent profiles
- ✨ **Dyslexia-Optimized Reading** (Bionic Reading, Syllable Highlighting, Grammar Colors)
- 🎓 **Multi-Platform LMS Integration** (Canvas, Moodle, Google Classroom)
- 📷 **OCR + Screenshot Tool** for extracting text from images and PDFs
- 📖 **Reading Mode** with distraction-free article view
- 📚 **Dictionary Lookup** with instant definitions
- 🌐 **Translation** supporting 35+ languages (zero-barrier, no API key)
- 📑 **Citation Management** with Harvard formatting and bibliography export
- 📝 **Annotations & Sticky Notes** with export capabilities
- 📚 **Canvas Quiz Helper** with keyboard navigation
- 👤 **User Profiles** with 9 neurodivergent presets
- 🎨 **Text Customization** (11 fonts, size, spacing, colors)
- 🔍 **Reading Guide** and Focus Mode
- 🌅 **Screen Overlays** and True Dark Mode
- ⏱️ **Pomodoro Timer** for ADHD focus support
- ⚙️ **Full Keyboard Shortcuts** (customizable, 14 shortcuts)
- ❓ **Consistent Help** button (WCAG 2.2 SC 3.2.6 compliant)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v16+ ([Download](https://nodejs.org/))
- **Google Chrome** (latest version)
- **Git** ([Download](https://git-scm.com/))

### Installation (5 Minutes)

```bash
# 1. Clone the repository
git clone https://github.com/MarJone/AssisT.git
cd AssisT

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Load in Chrome
# - Open chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the ".vite" folder (NOT "Output")
```

**✅ Done!** Click the AssisT icon in your Chrome toolbar to start.

📘 **Detailed Setup:** See [SETUP.md](SETUP.md) for complete installation guide.

---

## 📚 Documentation

| Document                                                                     | Description                               |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| [SETUP.md](SETUP.md)                                                         | Complete setup guide for new developers   |
| [TESTING_GUIDE.md](TESTING_GUIDE.md)                                         | Manual testing procedures (43 test cases) |
| [CLAUDE.md](CLAUDE.md)                                                       | Development standards and workflow        |
| [PROJECT_MEMORY.md](docs/planning/PROJECT_MEMORY.md)                         | Decision log and architecture rationale   |
| [KEYBOARD_SHORTCUTS_REFERENCE.md](docs/user/KEYBOARD_SHORTCUTS_REFERENCE.md) | Complete keyboard shortcuts guide         |
| [VOICE_COMMANDS_REFERENCE.md](docs/user/VOICE_COMMANDS_REFERENCE.md)         | 60+ voice commands for STT                |
| [STT_USER_GUIDE.md](docs/user/STT_USER_GUIDE.md)                             | Speech-to-Text user guide                 |
| [CITATION_SYSTEM_GUIDE.md](docs/guides/CITATION_SYSTEM_GUIDE.md)             | Citation management documentation         |

---

## 🎨 Features by Sprint

### Sprint 1-5: Core Functionality

1. **Text-to-Speech (TTS)**
   - Read any webpage aloud
   - Multiple voices, adjustable speed/pitch/volume
   - Word-by-word synchronized highlighting

2. **Text Customization**
   - Font size, line height, letter spacing
   - Font family (OpenDyslexic, Arial, etc.)
   - WCAG 2.2 AA compliant

3. **Reading Guide & Focus Mode**
   - Horizontal guide bar follows cursor
   - Dims surrounding content
   - Reduces visual distractions

4. **Speech-to-Text (STT)**
   - Dictate into text fields
   - Voice punctuation commands
   - Auto-capitalization

### Sprint 6-7: Advanced Features

5. **Screen Color Overlay**
   - Sepia, blue light filter, grayscale
   - Adjustable opacity
   - Reduces eye strain

6. **Canvas Quiz Helper**
   - Read quiz questions aloud
   - Keyboard navigation (Ctrl+↑/↓/Enter)
   - Visual highlighting

7. **User Profiles**
   - 4 default profiles (Default, Reading, Quiz, Low Vision)
   - Save/load custom profiles
   - Export/import as JSON

8. **Feature Visibility**
   - Show/hide 8 features
   - Cleaner, focused UI
   - Settings persist

### Sprint 9: Innovation ✨ NEW!

9. **Dyslexia-Optimized Reading Mode**
   - **Bionic Reading:** Bold first 1-3 letters of words
   - **Syllable Highlighting:** Alternating color backgrounds
   - **Grammar Color-Coding:** NLP-based part-of-speech coloring
   - Adjustable color intensity
   - Performance optimized (<300ms)

10. **Multi-Platform LMS Integration** 🎓 EXPERIMENTAL

- **Canvas LMS:** Read assignments, forums, and course pages
- **Moodle:** Read assignments, forums, and page resources
- **Google Classroom:** Read assignments, stream posts, and classwork
- Floating Action Button (FAB) for quick access
- Platform-specific branding and detection
- Enable via Advanced Options → Features → LMS Integration

---

## 🧪 Testing

### Test Status

| Test Type      | Status         | Details                               |
| -------------- | -------------- | ------------------------------------- |
| Unit Tests     | ✅ 979 passing | Jest, comprehensive coverage          |
| STT Tests      | ✅ 356 passing | Voice commands, profiles, punctuation |
| E2E Tests      | ⚠️ 74+ passing | Playwright, selector updates needed   |
| Manual Testing | ✅ Ready       | 43 test cases documented              |

### Run Tests

```bash
# Unit tests (fast, ~4 seconds)
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests (slow, ~55 seconds)
npm run test:e2e
```

📘 **Testing Guide:** See [TESTING_GUIDE.md](TESTING_GUIDE.md) for 43 manual test cases.

---

## 🔧 Development

### Workflow

```bash
# 1. Make changes in src/ directory
code src/popup/popup.js

# 2. Build the extension
npm run build

# 3. Reload extension in Chrome
# Go to chrome://extensions/ and click reload icon

# 4. Test your changes
```

### Commit Convention

```bash
git commit -m "feat(popup): add new feature"
git commit -m "fix(tts): resolve bug"
git commit -m "docs(readme): update"
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

---

## 📊 Project Stats

- **20,000+ lines** of code
- **35+ accessibility features** (plus 8 AI features)
- **979 unit tests** passing
- **74+ E2E tests** passing
- **43 manual test cases** documented
- **Phase 2.7** completed (ahead of schedule)
- **Zero-barrier accessibility** - no API keys required

---

## 🔮 Roadmap

### Phase 1 - Core MVP ✅ Complete

- [x] Core TTS with highlighting
- [x] Text customization
- [x] Reading guide and focus mode
- [x] Speech-to-text
- [x] Canvas Quiz Helper
- [x] User Profiles
- [x] Feature visibility
- [x] Screen overlays
- [x] Dyslexia modes
- [x] Multi-platform LMS integration (Canvas, Moodle, Google Classroom)
- [x] WCAG 2.2 AA compliance (Consistent Help button)
- [x] Testing infrastructure

### Phase 2.1-2.3 - High-Priority Features ✅ Complete

- [x] OCR + Screenshot Tool (PDF support, image text extraction)
- [x] Highlight Menu (floating toolbar on text selection)
- [x] Reading Mode (distraction-free article view)
- [x] Dictionary Lookup (Free Dictionary API integration)
- [x] Annotations & Sticky Notes (dual storage: local/IndexedDB)
- [x] Translation (MyMemory API - zero barrier, no API key)
- [x] Text Statistics (word count, reading time for assignments)
- [x] Font Library Expansion (11 fonts including Atkinson Hyperlegible)
- [x] Full Keyboard Shortcuts System (14 customizable shortcuts)

### Phase 2.4 - Citation Management ✅ Complete

- [x] Citation Capture & Metadata Extraction (OpenGraph, Dublin Core, JSON-LD)
- [x] Citation Formatting (Cite Them Right Harvard 13th edition)
- [x] Project Organization (visual cards, Kanban view, tags)
- [x] Source Evaluation (CRAAP test, DOI validation, credibility scoring)
- [x] Export & Integration (BibTeX, RIS, JSON, CSV, plain text)
- [x] Citation UI (accessibility-first design)

### Phase 2.6 - Neurodivergent Features ✅ Complete

- [x] Extended Font Library (Atkinson Hyperlegible, Andika, Comic Neue)
- [x] Reduced Motion Mode (WCAG 2.1 SC 2.3.3 compliant)
- [x] Auto-play Media Blocking (sensory comfort)
- [x] True Dark Mode (4 presets: AMOLED, Dark Gray, Navy, Sepia)
- [x] Pomodoro Timer (ADHD focus support)
- [x] Reading Progress Bar (visual progress indicator)
- [x] Simplified Interface Mode (3 intensity levels)
- [x] 9 Neurodivergent Profiles (ADHD, Autism, Dyslexia, Anxiety, etc.)

### Phase 2.7 - STT Enhancement ✅ Complete

- [x] Voice Editing Commands (60+ commands: delete, replace, select)
- [x] Voice Navigation Commands (go to, move, find)
- [x] Smart Auto-Punctuation (AI-based period, comma, question detection)
- [x] Confidence & Quality Feedback (color-coded, threshold slider)
- [x] Custom Vocabulary (presets: Medical, Legal, Academic, STEM)
- [x] Formatting Commands (bold, italic, headings, lists)
- [x] 6 Neurodivergent STT Profiles with quick-switch
- [x] 356 STT unit tests (100% pass rate)
- [x] Comprehensive STT documentation

### Planned 📋 (Phase 3+)

- [ ] Advanced Recognition Engine (Whisper.cpp WebAssembly - optional)
- [ ] Performance benchmarks (<300ms targets)
- [ ] WCAG 2.2 AA full audit
- [ ] Cloud sync for profiles and citations
- [ ] First-time user tutorial
- [ ] Cross-browser support (Firefox, Edge)
- [ ] Chrome Web Store submission

---

## 🤝 Contributing

1. **Read [SETUP.md](SETUP.md)** for installation
2. **Follow [CLAUDE.md](CLAUDE.md)** for standards
3. **Check [PROJECT_MEMORY.md](docs/planning/PROJECT_MEMORY.md)** for architecture
4. **Use conventional commits**
5. **Write tests for new features**

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🙏 Acknowledgments

- **OpenDyslexic Font** - Font for dyslexic readers
- **compromise.js** - NLP library
- **Web Speech API** - Browser TTS/STT
- **Canvas LMS** - Learning management system
- **Jest & Playwright** - Testing frameworks

---

## 📞 Support

- **Documentation:** [SETUP.md](SETUP.md), [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Bug Reports:** Use template in TESTING_GUIDE.md
- **Debugging:** Check console logs (Right-click icon → Inspect popup)

---

## 📈 Current Status

**Version:** 0.1.1
**Status:** Production Ready ✅
**Last Updated:** 2026-02-13
**Production Ready:** Beta testing ready

### Recent Changes (Phase 2.7)

- 🎤 **State-of-the-Art STT Enhancement** with 60+ voice commands
- 🧠 **6 Neurodivergent STT Profiles** with quick-switch (Ctrl+Shift+P)
- 📝 **Smart Auto-Punctuation** with AI-based detection
- 📊 **Confidence Feedback** with color-coded quality indicators
- 📚 **Custom Vocabulary** with Medical, Legal, Academic, STEM presets
- ⌨️ **Voice Formatting** (bold, italic, headings, lists by voice)
- 🧪 **356 STT Unit Tests** (100% pass rate)
- 📖 **Comprehensive Documentation** (STT Guide, Voice Commands Reference)

### Previous Highlights (Phase 2.1-2.6)

- 📷 OCR + Screenshot Tool with PDF support
- 📖 Reading Mode with distraction-free view
- 📑 Complete Citation Management System
- 🌙 True Dark Mode with 4 presets
- ⏱️ Pomodoro Timer for ADHD focus
- 👤 9 Neurodivergent User Profiles
- 🌐 Translation (35+ languages, zero-barrier)
- ⌨️ 14 Customizable Keyboard Shortcuts

---

**Built with ❤️ for neurodivergent learners**

**Ready to get started?** See [SETUP.md](SETUP.md)!
**Ready to test?** See [TESTING_GUIDE.md](TESTING_GUIDE.md)!
**Need voice commands?** See [VOICE_COMMANDS_REFERENCE.md](docs/user/VOICE_COMMANDS_REFERENCE.md)!
