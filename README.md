# AssisT: Adaptive EdTech Extension for Canvas VLE

[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Neuro-adaptive TTS/STT personalization layer for neurodivergent students using Canvas VLE**

## 🎯 Overview

AssisT is a Chrome Extension that provides comprehensive accessibility features for neurodivergent students (Dyslexia, Dysgraphia, Dyscalculia, ADHD, ASD) within the Canvas Virtual Learning Environment. By implementing W3C WAI-Adapt standards and WCAG 2.2 Level AA compliance, AssisT delivers personalized reading and writing support through:

- **Text-to-Speech (TTS)** with synchronized word-by-word highlighting
- **Speech-to-Text (STT)** with multimodal error correction (FixOver pattern)
- **WAI-Adapt Personalization** for text spacing, focus mode, and numeric simplification
- **Isolated World Architecture** preventing conflicts with Canvas VLE

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Google Chrome Browser
- Git

### Installation

```bash
# Clone repository
git clone <repository-url>
cd AssitT

# Install dependencies
npm install

# Make push script executable (Unix/Mac)
chmod +x push.sh

# Set up push alias (optional)
echo "alias push='$(pwd)/push.sh'" >> ~/.bashrc
source ~/.bashrc
```

### Development

```bash
# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Build extension
npm run build
```

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `AssitT` project directory
5. Navigate to any Canvas course to activate AssisT

## 📋 Features

### Core Accessibility Features

#### FR-100: Adaptive Text Styling Suite
- Customizable fonts (including OpenDyslexic)
- Color scheme customization
- WCAG 2.2 SC 1.4.12 compliant text spacing controls

#### FR-101: Synchronized TTS Reader
- High-fidelity neural TTS with SSML support
- Word-by-word visual highlighting
- Adjustable pace, pitch, and volume

#### FR-102: Immersive Focus Mode
- Hides extraneous page elements
- Simplifies navigation
- Reduces cognitive load

#### FR-103: High-Accuracy STT Input
- Domain-adapted speech recognition
- Academic terminology support
- <5% Word Error Rate (WER)

#### FR-104: Multimodal FixOver Correction
- Voice-and-point error correction
- No re-dictation required
- Reduces motor fatigue

#### FR-106: Numeric Information Adaptation
- Date/time simplification (e.g., "Due today")
- Dyscalculia-friendly formats
- Semantic text alternatives

## 🏗️ Architecture

```
AssisT/
├── manifest.json              # Chrome Extension Manifest V3
├── src/
│   ├── background/
│   │   └── service-worker.js  # Background service worker
│   ├── content/
│   │   └── content.js         # DOM injection (Isolated World)
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   ├── popup.js           # Popup logic
│   │   └── popup.css          # Popup styles
│   ├── engines/
│   │   ├── tts/
│   │   │   └── tts-controller.js
│   │   └── stt/
│   │       └── stt-controller.js
│   ├── adapters/
│   │   ├── dom-adapter.js     # Canvas DOM interaction
│   │   └── wai-adapt-manager.js
│   └── utils/
│       ├── storage-manager.js  # FERPA-compliant storage
│       └── message-router.js   # Secure messaging
├── tests/
│   ├── unit/
│   └── e2e/
└── docs/
```

## 🔒 Security & Privacy

### FERPA/HIPAA Compliance
- **Minimal Permissions**: Only `storage`, `activeTab`, and Canvas domain access
- **Local Processing**: User preferences stored locally via Chrome Storage API
- **No PII Collection**: No personally identifiable information transmitted
- **Isolated World**: Prevents JavaScript conflicts and security vulnerabilities

### Data Handling
- All TTS/STT processing can be configured for local-only operation
- Cloud API usage (if enabled) requires institutional data agreements
- User settings are exportable/importable for backup

## 🧪 Testing

### Test-Driven Development (TDD)
All features are developed following strict TDD principles:

```bash
# Run unit tests
npm run test:unit

# Run E2E tests with Playwright
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

### Accessibility Testing
- WCAG 2.2 AA automated checks
- Screen reader compatibility testing
- Keyboard navigation verification
- Neurodivergent user testing protocols

## 📝 Development Workflow

### Conventional Commits
All commits MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat(tts): add SSML pace control
fix(ui): resolve focus mode indicator positioning
docs(readme): update installation instructions
refactor(dom): optimize text node extraction
test(stt): add domain adaptation tests
```

### Automated Push Script
Use the `push` alias (or `./push.sh`) for all commits:

```bash
# After making changes
push
# Enter commit message: feat(wai-adapt): implement text spacing controls
```

This ensures:
- Atomic commits with descriptive versioning
- Linear git history via rebase
- Easy rollback to stable versions

## 📚 Documentation

See the `/docs` directory for:
- [Architecture Overview](docs/architecture/OVERVIEW.md)
- [API Reference](docs/api/README.md)
- [User Guide](docs/user-guide/README.md)
- [Decision Log](projectmemory.md)

## 🤝 Contributing

1. Consult [CLAUDE.md](claude.md) for project standards
2. Review [projectmemory.md](projectmemory.md) for architectural decisions
3. Follow TDD: Write tests first, then implementation
4. Use Conventional Commits for all changes
5. Update decision log for significant changes

## 📊 Key Performance Indicators (KPIs)

- **Task Success Rate (TSR)**: ≥90% for core Canvas tasks
- **User Error Frequency (UEF)**: Downward trend (≥25% decrease per quarter)
- **Task Completion Time**: Minimal delta between AT and non-AT users
- **Accessible Usability Scale**: ≥70 (High Usability)
- **WCAG Conformance**: 100% for core user flows

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- W3C WAI-Adapt Working Group
- Canvas LMS Platform
- Open-source accessibility community
- Neurodivergent students and advocates

---

**Version**: 0.1.0
**Status**: Initial Development
**Last Updated**: 2025-10-11
