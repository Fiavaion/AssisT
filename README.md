# AssisT: Adaptive EdTech Extension for Canvas VLE

[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Neuro-adaptive TTS/STT personalization layer for neurodivergent students using Canvas VLE**

## 🎯 Overview

AssisT is a Chrome Extension that provides comprehensive accessibility features for neurodivergent students (Dyslexia, Dysgraphia, Dyscalculia, ADHD, ASD) within the Canvas Virtual Learning Environment. By implementing W3C WAI-Adapt standards and WCAG 2.2 Level AA compliance, AssisT delivers personalized reading and writing support.

### Current Features (Sprint 3 Complete)

- ✅ **Text-to-Speech** with synchronized paragraph highlighting
- ✅ **Text Customization** (WCAG 2.2 SC 1.4.12 compliant fonts and spacing)
- ✅ **Reading Guide** (horizontal line cursor tracker for dyslexia)
- ✅ **Focus Mode** (adjustable reading window with rounded corners)
- 🚧 Speech-to-Text (planned Sprint 5)
- 🚧 Canvas LMS Integration (planned Sprint 4)

**Current Version:** Sprint3-Complete-v1.0

---

## 🚀 Quick Start

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MarJone/AssisT.git
   cd AssisT
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```

4. **Load in Chrome:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `Output/` directory

See [docs/user/GETTING_STARTED.md](docs/user/GETTING_STARTED.md) for detailed instructions.

---

## 📋 Features

### ✅ Implemented Features

#### Text-to-Speech (TTS)
- Click any paragraph to read it aloud
- Voice selection (default: Google UK Female)
- Speed, pitch, and volume controls
- Paragraph-level highlighting with customizable colors
- Keyboard shortcuts: Space (pause/resume), +/- (speed)

#### Text Customization (WCAG 2.2 SC 1.4.12)
- 5 font options: System, Lexend, OpenDyslexic, Comic Sans, Arial
- Line spacing: 1.0-3.0 (WCAG min: 1.5)
- Letter spacing: 0-50% (WCAG min: 12%)
- Word spacing: 0-50% (WCAG min: 16%)
- Paragraph spacing: 1.0-3.0em (WCAG min: 2.0)

#### Reading Guide
- Horizontal line follows mouse cursor
- Helps dyslexic students track reading position
- Customizable color, thickness (1-10px), opacity (10-100%)

#### Focus Mode
- Adjustable reading window (150-800px × 50-250px)
- 20% rounded corners for comfortable viewing
- Overlay darkness control (10-100%)
- Mutual exclusivity with Reading Guide

### 🚧 Planned Features

See [docs/planning/PRODUCTION_ROADMAP.md](docs/planning/PRODUCTION_ROADMAP.md) for full roadmap.

**Sprint 4:** Canvas LMS Integration
- Assignment auto-reader
- Quiz helper with keyboard navigation
- Canvas keyboard shortcuts

**Sprint 5:** Writing Features
- Speech-to-Text (Web Speech API)
- FixOver multimodal correction system

**Sprint 6:** Testing & Quality
- 80% unit test coverage (Jest)
- E2E tests (Playwright)
- WCAG 2.2 AA full compliance audit

**Sprint 7:** Cloud TTS/STT
- Google Cloud Text-to-Speech
- Amazon Polly
- Whisper (OpenAI)

---

## 🏗️ Project Structure

```
AssisT/
├── docs/                       # Documentation (organized by audience)
│   ├── development/           # For developers (testing, debugging, architecture)
│   ├── planning/              # Roadmaps, sprint docs, decision logs
│   ├── user/                  # End-user guides
│   └── archive/               # Historical/deprecated docs
├── scripts/                   # Build and utility scripts
│   ├── build-extension.js     # Copies src/ → Output/
│   ├── build.sh               # Bash alternative
│   ├── push.sh                # Automated commit with rebase
│   └── reload-extension.bat   # Force reload in Chrome
├── src/                       # Source code (edit here!)
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── content-simple.js  # Main content script (~1100 lines)
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── engines/               # TTS/STT controllers
│   ├── adapters/              # DOM and WAI-Adapt adapters
│   └── utils/                 # Storage, messaging utilities
├── tests/                     # Test suites
├── public/                    # Public assets (icons)
├── Output/                    # Build output (gitignored, Chrome loads from here)
├── manifest.json              # Chrome Extension manifest
├── package.json               # NPM dependencies and scripts
├── CLAUDE.md                  # AI assistant instructions
├── CHANGELOG.md               # Version history
└── README.md                  # This file
```

**⚠️ CRITICAL:** Always edit files in `src/`, never in `Output/`. Run `npm run build` after changes.

---

## 🔧 Development Workflow

### Build Process

```bash
# Edit source files in src/
npm run build           # Copies src/ → Output/
# Reload extension in Chrome (chrome://extensions/)
# Hard refresh page (Ctrl+Shift+R)
```

### Commit Changes

```bash
# Use automated push script (ensures conventional commits + rebase)
./scripts/push.sh

# Or manually:
git add .
git commit -m "feat(feature): description"
git pull --rebase origin main
git push origin main
```

### Conventional Commits

All commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tts): add cloud TTS adapter
fix(ui): resolve focus mode border radius
docs(readme): update installation steps
refactor(content): extract TTS logic to module
test(storage): add unit tests for settings manager
```

### Version Tags

Create annotated tags for stable versions:

```bash
git tag -a "Sprint4-Complete-v1.0" -m "Canvas integration complete"
git push origin Sprint4-Complete-v1.0
```

**Existing Tags:**
- `Sprint3-Complete-v1.0` - Current stable (Focus Mode + Text Customization + Reading Guide)
- `Sprint3-TextCustomization-ReadingGuide-v1.0` - Before Focus Mode
- `MVP-TTS-Stable-v1.0` - Original MVP

---

## 🧪 Testing

### Current Status
- Unit Tests: 🚧 Minimal coverage (Sprint 6 goal: 80%)
- E2E Tests: ❌ Not implemented yet
- Accessibility: 🚧 Partial WCAG 2.2 AA compliance

### Run Tests

```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only (Jest)
npm run test:e2e           # E2E tests (Playwright - not yet implemented)
npm run test:coverage      # Generate coverage report
```

### Manual Testing Checklist

See [docs/development/MANUAL_TEST_CHECKLIST.md](docs/development/MANUAL_TEST_CHECKLIST.md)

---

## 🔒 Security & Privacy

### FERPA Compliance
- **Minimal Permissions:** Only `storage`, `activeTab`, Canvas domains
- **Local Storage:** All settings stored in `chrome.storage.local`
- **No PII Collection:** Zero personally identifiable information transmitted
- **Isolated World:** Prevents conflicts with Canvas JavaScript

### Data Handling
- User preferences stored locally only
- No external API calls in current version (Web Speech API is browser-native)
- Future cloud TTS/STT will require explicit opt-in and API key management

---

## 📚 Documentation

### For Users
- [Getting Started Guide](docs/user/GETTING_STARTED.md)
- [User Guide](docs/user/USER_GUIDE.md)
- [Troubleshooting](docs/user/TROUBLESHOOTING.md)

### For Developers
- [Development Workflow](docs/development/DEVELOPMENT_WORKFLOW.md)
- [File Structure Guide](docs/development/FILE_STRUCTURE.md)
- [Testing Guide](docs/development/TESTING_GUIDE.md)
- [Stable Version Guide](docs/development/STABLE_VERSION_GUIDE.md)

### For Planning
- [Production Roadmap](docs/planning/PRODUCTION_ROADMAP.md) ⭐ **Comprehensive 10-sprint plan**
- [Project Memory (Decision Log)](docs/planning/PROJECT_MEMORY.md)
- [Sprint Summaries](docs/planning/)

---

## 🤝 Contributing

1. **Review project standards:** [CLAUDE.md](CLAUDE.md)
2. **Read decision log:** [docs/planning/PROJECT_MEMORY.md](docs/planning/PROJECT_MEMORY.md)
3. **Follow TDD:** Write tests first, then implementation
4. **Use Conventional Commits:** All changes must follow spec
5. **Update decision log:** Document significant architectural choices

---

## 📊 Success Metrics

### Technical KPIs
- Test Coverage: Target 80%+
- WCAG Conformance: 2.2 AA (100% for core flows)
- Extension Load Time: <100ms
- TTS Latency: <200ms
- Memory Usage: <50MB after 1 hour

### User KPIs (Post-Launch)
- Task Success Rate: ≥90%
- User Error Frequency: ≥25% decrease per quarter
- Accessible Usability Scale: ≥70 (High Usability)

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- W3C WAI-Adapt Working Group
- Canvas LMS Platform
- OpenDyslexic font project
- Open-source accessibility community
- Neurodivergent students and advocates

---

**Version:** Sprint3-Complete-v1.0
**Status:** Active Development
**Last Updated:** 2025-10-12
**Next Milestone:** Sprint 4 (Canvas LMS Integration)

For detailed version history, see [CHANGELOG.md](CHANGELOG.md)
