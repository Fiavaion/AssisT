# 🎓 AssisT - Adaptive EdTech Chrome Extension

**Version:** Sprint 9 (Dyslexia Mode Complete)
**Status:** Test-Phase Ready ✅
**License:** MIT
**Repository:** https://github.com/MarJone/AssisT

[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Overview

**AssisT** is an adaptive educational technology Chrome extension designed to make web content more accessible for neurodivergent students, particularly those using Canvas LMS. It provides comprehensive text-to-speech, reading assistance, and innovative dyslexia-optimized features.

### 🎯 Target Users

- Students with dyslexia, ADHD, or other learning differences
- Students using Canvas LMS, Moodle, or Google Classroom
- Anyone who benefits from audio reinforcement while reading
- Users requiring text customization for readability
- Students taking online quizzes who need accessibility support

### ✨ Key Features

- 🔊 **Text-to-Speech** with synchronized word-by-word highlighting
- 🎤 **Speech-to-Text** for hands-free input with voice commands
- ✨ **Dyslexia-Optimized Reading** (Bionic Reading, Syllable Highlighting, Grammar Colors)
- 🎓 **Multi-Platform LMS Integration** (Canvas, Moodle, Google Classroom)
- 📚 **Canvas Quiz Helper** with keyboard navigation
- 👤 **User Profiles** for quick context switching
- 🎨 **Text Customization** (font, size, spacing, colors)
- 🔍 **Reading Guide** and Focus Mode
- 🌅 **Screen Overlays** for eye strain reduction
- ⚙️ **Feature Visibility** controls for cleaner UI
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
# - Select the "Output" folder
```

**✅ Done!** Click the AssisT icon in your Chrome toolbar to start.

📘 **Detailed Setup:** See [SETUP.md](SETUP.md) for complete installation guide.

---

## 📚 Documentation

| Document                                               | Description                               |
| ------------------------------------------------------ | ----------------------------------------- |
| [SETUP.md](SETUP.md)                                   | Complete setup guide for new developers   |
| [TESTING_GUIDE.md](TESTING_GUIDE.md)                   | Manual testing procedures (43 test cases) |
| [CLAUDE.md](CLAUDE.md)                                 | Development standards and workflow        |
| [PROJECT_MEMORY.md](docs/planning/PROJECT_MEMORY.md)   | Decision log and architecture rationale   |
| [TEST_EXECUTION_RESULTS.md](TEST_EXECUTION_RESULTS.md) | Test infrastructure status                |

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

| Test Type      | Status           | Details                               |
| -------------- | ---------------- | ------------------------------------- |
| Unit Tests     | ✅ 94/94 passing | Jest, 96%+ coverage on tested modules |
| E2E Tests      | ⚠️ 11/25 passing | Playwright, selector updates needed   |
| Manual Testing | ✅ Ready         | 43 test cases documented              |

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

- **7,538 lines** of code
- **10 major features** implemented
- **94 unit tests** passing
- **43 manual test cases** documented
- **9 sprints** completed
- **603 npm packages** installed

---

## 🔮 Roadmap

### Completed ✅

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

### Planned 📋

- [ ] Fix E2E test selectors
- [ ] TTS/STT engine test coverage
- [ ] Performance benchmarks
- [ ] WCAG 2.2 AA full audit (contrast ratios, keyboard navigation)
- [ ] Auto-profile switching
- [ ] Keyboard shortcut customization
- [ ] Cloud sync for profiles
- [ ] First-time user tutorial
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

**Version:** Sprint 9 (Dyslexia Mode Complete)
**Status:** Test-Phase Ready ✅
**Last Updated:** 2025-10-12
**Production Ready:** Beta testing ready

### Recent Changes

- 🎓 Multi-platform LMS integration (Canvas, Moodle, Google Classroom)
- ❓ WCAG 2.2 Consistent Help button added
- ✨ Dyslexia-Optimized Reading Mode (3 algorithms)
- ✨ Bionic Reading implementation
- ✨ Syllable Highlighting implementation
- ✨ Grammar Color-Coding with NLP
- ✨ Color intensity slider
- 📝 Comprehensive E2E test suite
- 📝 Sprint 9 Phase 2 documentation
- 🧪 94/94 unit tests maintained

---

**Built with ❤️ for neurodivergent learners**

**Ready to get started?** See [SETUP.md](SETUP.md)!
**Ready to test?** See [TESTING_GUIDE.md](TESTING_GUIDE.md)!
