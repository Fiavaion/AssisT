# AssisT Extension - Home PC Restart Guide

**Created:** 2025-11-27
**Last Session:** Feature/citation-capture branch - Neurodivergent Profile Features

---

## Quick Start

```bash
# 1. Navigate to project directory
cd ~/AIprojects/AssisT  # or wherever you clone it

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Run tests to verify setup
npm test

# 5. Load extension in Chrome
# Navigate to chrome://extensions
# Enable Developer Mode
# Click "Load unpacked" and select the .vite/ folder
```

---

## Prerequisites

### Required Software

| Software | Version          | Check Command         |
| -------- | ---------------- | --------------------- |
| Node.js  | v18+ recommended | `node --version`      |
| npm      | v9+              | `npm --version`       |
| Git      | Latest           | `git --version`       |
| Chrome   | Latest           | For testing extension |

### If Missing Node.js

```bash
# Windows (using winget)
winget install OpenJS.NodeJS.LTS

# macOS (using Homebrew)
brew install node

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Project Setup

### 1. Clone/Pull Latest Code

```bash
# If fresh clone
git clone <repository-url>
cd AssisT

# If existing repo
cd AssisT
git fetch origin
git checkout feature/citation-capture
git pull origin feature/citation-capture
```

### 2. Install Dependencies

```bash
npm install
```

**Expected packages:** ~800+ packages including:

- `vite` - Build system
- `@crxjs/vite-plugin` - Chrome extension support
- `jest` - Testing framework
- `playwright` - E2E testing
- `eslint` & `prettier` - Code quality

### 3. Build Extension

```bash
npm run build
```

**Build output:** `.vite/` directory

- `manifest.json` - Extension manifest
- `assets/` - Bundled JS/CSS
- `popup.html` - Extension popup

### 4. Verify with Tests

```bash
# Unit tests (should see 623 passing)
npm test

# E2E tests (optional, requires Playwright setup)
npm run test:e2e
```

---

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `.vite/` folder inside the project directory
5. Extension should appear with AssisT icon

### Troubleshooting

- If extension doesn't load, check console for errors
- Run `npm run build` again after any source changes
- Check `.vite/manifest.json` exists

---

## Current Development State

### Branch: `feature/citation-capture`

### Completed Features (This Session)

| Feature                  | Status      | Files                                         |
| ------------------------ | ----------- | --------------------------------------------- |
| Extended Font Library    | ✅ Complete | `src/content/features/text-customization.js`  |
| Reduced Motion Mode      | ✅ Complete | `src/features/reducedMotion/reducedMotion.js` |
| Auto-play Media Blocking | ✅ Complete | `src/features/mediaControl/mediaControl.js`   |
| True Dark Mode           | ✅ Complete | `src/features/darkMode/darkMode.js`           |

### Remaining Features

| Feature                    | Priority           | Complexity |
| -------------------------- | ------------------ | ---------- |
| Pomodoro Timer             | Next               | MEDIUM     |
| Reading Progress Bar       | After Pomodoro     | LOW        |
| Simplified Interface Mode  | After Progress Bar | MEDIUM     |
| Profile System Enhancement | After all features | MEDIUM     |

### Implementation Plan Location

`C:\Users\Media Admin\.claude\plans\precious-juggling-fern.md`

---

## Key Project Files

### Source Code Structure

```
src/
├── content/
│   ├── content-simple.js      # Main content script
│   └── features/              # Legacy feature modules
├── features/                  # New feature modules
│   ├── reducedMotion/
│   ├── mediaControl/
│   ├── darkMode/
│   ├── pomodoro/              # TO BE CREATED
│   ├── readingProgress/       # TO BE CREATED
│   └── simplify/              # TO BE CREATED
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic
│   └── popup.css              # Popup styles
└── utils/
    └── storage-manager.js     # Settings persistence
```

### Documentation

- `CLAUDE.md` - Project rules and AI instructions
- `docs/planning/PHASE2_TASKS.md` - Task tracking
- `docs/planning/CURRENT_STATUS.md` - Progress tracking
- `docs/projectmemory.md` - Design decisions

---

## Git Workflow

### Current Commits (This Session)

```
feat(accessibility): add extended font library with 6 accessibility fonts
feat(accessibility): add Reduced Motion mode for sensory-sensitive users
feat(accessibility): add Auto-play Media Blocking for sensory comfort
feat(accessibility): add True Dark Mode with 4 theme presets
```

### Before Starting Work

```bash
git status
git log --oneline -5
```

### After Making Changes

```bash
npm run build
npm test
git add -A
git commit -m "feat(scope): description"
```

---

## Common Commands

| Command            | Purpose                   |
| ------------------ | ------------------------- |
| `npm run build`    | Build extension to .vite/ |
| `npm test`         | Run 623 unit tests        |
| `npm run test:e2e` | Run Playwright E2E tests  |
| `npm run lint`     | Check code style          |
| `npm run format`   | Auto-format code          |

---

## Resume Development

### To Continue Neurodivergent Profile Features:

1. **Next Task:** Create Pomodoro Timer feature
   - Location: `src/features/pomodoro/`
   - Files: `pomodoro-timer.js`, `pomodoro-ui.js`
   - Add toggle to `src/popup/popup.html`
   - Add handler to `src/popup/popup.js`

2. **Follow the pattern from completed features:**
   - Import from `../../core/ui/toast.js`
   - Import from `../../content/utils/storage-utils.js`
   - Use `initFeatureSettings()` for storage
   - Add import to `src/content/content-simple.js`

3. **After all features complete:**
   - Create 6 new neurodivergent profiles
   - Update profile metadata structure
   - Add profile descriptions and icons

---

## Contact & Resources

- **Plan File:** `C:\Users\Media Admin\.claude\plans\precious-juggling-fern.md`
- **GitHub Issues:** Report bugs at project repository
- **WCAG Reference:** https://www.w3.org/WAI/WCAG21/quickref/

---

_Last updated: 2025-11-27 - Session ended with 4/7 new features complete_
