# Changelog

All notable changes to the AssisT Adaptive EdTech Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Canvas LMS deep integration (Assignment Reader, Quiz Helper)
- Speech-to-Text with Web Speech API
- Cloud TTS/STT adapters (Google, Amazon, Whisper)
- User profile presets
- Learning analytics dashboard

---

## [Sprint3-Complete-v1.0] - 2025-10-12

### Added
- **Focus Mode** with 20% rounded corners for distraction-free reading
  - Adjustable window dimensions (150-800px × 50-250px, 5px steps)
  - Overlay darkness control (10-100%)
  - Box-shadow implementation for clean rounded corners
  - Mutual exclusivity with Reading Guide
- **Text Customization** (WCAG 2.2 SC 1.4.12 compliant)
  - 5 font options (System, Lexend, OpenDyslexic, Comic Sans, Arial)
  - Line spacing control (1.0-3.0, default 1.5)
  - Letter spacing control (0-50%, default 12%)
  - Word spacing control (0-50%, default 16%)
  - Paragraph spacing control (1.0-3.0em, default 2.0)
  - Dynamic CSS injection with !important overrides
  - CDN font loading (Google Fonts, jsDelivr)
- **Reading Guide** for dyslexia assistance
  - Horizontal line follows mouse cursor vertically
  - Customizable line color (6 preset colors)
  - Adjustable thickness (1-10px, default 3px)
  - Adjustable opacity (10-100%, default 70%)
  - Fixed positioning with pointer-events: none

### Changed
- Improved highlight opacity control (hex-to-rgba conversion)
- Enhanced feature isolation with mutual exclusivity logic

### Fixed
- Focus Mode rounded corners now display correctly using box-shadow approach
- Reading Guide and Focus Mode mutual exclusivity implemented

---

## [Sprint3-TextCustomization-ReadingGuide-v1.0] - 2025-10-12

### Added
- Text Customization feature with WCAG compliance
- Reading Guide feature for cursor tracking

### Technical
- Feature isolation pattern with prefixed variables
- Chrome storage listeners for real-time updates
- Collapsible UI sections with CSS transitions

---

## [MVP-TTS-Stable-v1.0] - 2025-10-11

### Added
- **Text-to-Speech** with click-to-read functionality
  - Web Speech API integration
  - Voice selection (Google UK Female default)
  - Speed, pitch, volume controls with real-time updates
  - Paragraph-level highlighting with color/opacity controls
- **Keyboard shortcuts**
  - Space: pause/resume TTS
  - +/-: adjust reading speed
- **Settings persistence** across browser sessions
- **Compact UI** (340px width popup)
- **Reset to defaults** button
- **Options button** with modal framework

### Technical
- Single-file architecture (content-simple.js, ~400 lines)
- Manual state management with `isPaused` flag for reliability
- Feature toggles with collapsible options
- Progressive disclosure UI pattern

### Fixed
- Pause/resume functionality with reliable state tracking
- Highlight opacity with rgba color conversion

---

## [0.1.0] - Initial Development

### Added
- Chrome Extension Manifest V3 structure
- Basic project setup with build scripts
- Development workflow documentation
- Git version control with conventional commits

### Technical
- Modular architecture design
- Storage manager for settings persistence
- Message router for inter-component communication
- Build process (src/ → Output/)

---

## Version Tags Reference

- `Sprint3-Complete-v1.0` - All Sprint 3 features complete (Focus Mode + Text Customization + Reading Guide)
- `Sprint3-TextCustomization-ReadingGuide-v1.0` - Text Customization and Reading Guide only
- `MVP-TTS-Stable-v1.0` - Minimum viable product with TTS and highlighting

---

## Rollback Instructions

To revert to a stable version:

```bash
# List all tags
git tag -l

# Checkout specific version
git checkout <tag-name>

# Example: Revert to MVP
git checkout MVP-TTS-Stable-v1.0

# To return to latest
git checkout main
```

---

## Development Principles

Following these principles established in Sprint 1:

1. **Feature Isolation** - New features don't modify existing feature code
2. **Manual State Management** - Don't trust external API states for critical functionality
3. **Progressive Disclosure** - Main UI shows only essential controls
4. **Incremental Development** - Small commits with single focus
5. **User-Centric** - Fix reported issues immediately
6. **Conventional Commits** - All commits follow conventional commit specification

---

**For detailed sprint retrospectives and decision logs, see:**
- [docs/planning/PROJECT_MEMORY.md](docs/planning/PROJECT_MEMORY.md)
- [docs/planning/PRODUCTION_ROADMAP.md](docs/planning/PRODUCTION_ROADMAP.md)
