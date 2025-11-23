# AssisT Extension - Project Handoff Document

**Created**: 2025-11-23
**Current Branch**: `feature/annotations-sticky-notes`
**Last Commit**: `5a05b4d` - docs(docs): end Phase 2 session 015
**Project Status**: Phase 2.2 - Annotations & Sticky Notes (3/18 tasks complete)

---

## 🚀 Quick Start on New Machine

### 1. Prerequisites (Install First)

**Required Software**:

- **Node.js**: v18.x or higher (LTS recommended)
  - Download: https://nodejs.org/
  - Verify: `node --version` (should show v18+)
- **npm**: v9.x or higher (comes with Node.js)
  - Verify: `npm --version`
- **Git**: Latest version
  - Download: https://git-scm.com/
  - Verify: `git --version`
- **Google Chrome**: Latest version (for testing extension)
  - Download: https://www.google.com/chrome/

**Optional Tools**:

- **VS Code**: Recommended IDE
  - Download: https://code.visualstudio.com/
  - Extensions: ESLint, Prettier, Jest, Playwright

---

### 2. Clone Repository

```bash
# Clone from remote (replace with actual repo URL)
git clone <repository-url> AssisT
cd AssisT

# OR if copying files directly:
# Just copy the entire AssisT folder to new machine
cd AssisT
```

---

### 3. Install Dependencies

```bash
# Install all npm packages (this may take 5-10 minutes)
npm install

# Expected packages (from package.json):
# - tesseract.js@5.0.0 (OCR engine)
# - @mozilla/readability@0.5.0 (Reading Mode)
# - dexie@3.2.0 (IndexedDB wrapper for Annotations)
# - citeproc@2.4.63 (Citation formatting)
# - open-graph-scraper@6.4.0 (Metadata extraction)
# - compromise@14.14.4 (NLP for Dyslexia Mode)
# - pdfjs-dist@4.10.38 (PDF rendering)
# - vite@7.1.12 (Build tool)
# - @crxjs/vite-plugin@2.0.0 (Chrome Extension bundler)
# - jest@29.7.0 (Unit testing)
# - @playwright/test@1.49.1 (E2E testing)
# - eslint@8.57.0 (Linting)
# - prettier@3.2.5 (Code formatting)
# - husky@9.0.11 (Git hooks)
# - lint-staged@15.2.2 (Pre-commit linting)
```

**If `npm install` fails**:

- Delete `node_modules` folder and `package-lock.json`
- Run `npm cache clean --force`
- Run `npm install` again

---

### 4. Build Extension

```bash
# Build the extension (creates .vite/ directory)
npm run build

# Expected output:
# - .vite/ directory created with bundled files
# - manifest.json generated
# - All source files bundled into assets/
# - No errors in console
```

**Build system details**:

- **Input**: `src/` directory (source files)
- **Output**: `.vite/` directory (bundled extension)
- **Build tool**: Vite + @crxjs/vite-plugin
- **Important**: Chrome loads extension from `.vite/`, NOT `src/`

---

### 5. Load Extension in Chrome

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `.vite/` folder inside your project directory
6. Extension should load with no errors

**Verify Extension Loaded**:

- Extension icon appears in Chrome toolbar
- Click extension icon → popup opens with TTS controls
- No errors in `chrome://extensions/` page

---

### 6. Run Tests

```bash
# Run unit tests (197 tests should pass)
npm test

# Run E2E tests (41/63 passing - some selectors need updates)
npm run test:e2e

# Expected results:
# - Unit tests: 197/197 passing (100%)
# - E2E tests: 41/63 passing (65% - known issue with selectors)
```

---

### 7. Verify Everything Works

**Checklist**:

- [ ] `npm install` completed without errors
- [ ] `npm run build` completed successfully
- [ ] Extension loads in Chrome from `.vite/` folder
- [ ] Extension popup opens and shows TTS controls
- [ ] `npm test` shows 197/197 unit tests passing
- [ ] No console errors in browser DevTools

---

## 📂 Project Structure

```
AssisT/
├── .vite/                      # Build output (Chrome loads from here)
│   ├── manifest.json           # Generated manifest
│   ├── assets/                 # Bundled JS/CSS files
│   └── public/                 # Static assets (icons)
├── src/                        # Source code (edit here)
│   ├── popup/                  # Extension popup UI
│   │   ├── popup.html          # Main popup HTML
│   │   ├── popup.js            # Popup logic (2,758 lines)
│   │   └── popup.css           # Popup styles
│   ├── content/                # Content scripts (injected into pages)
│   │   └── content-simple.js   # Main content script
│   ├── core/                   # Core utilities
│   │   ├── storage/            # Settings management
│   │   │   └── settings-manager.js  # Centralized settings
│   │   └── keyboard-shortcuts.js    # Keyboard shortcuts manager
│   ├── engines/                # TTS/STT engines
│   │   ├── tts/                # Text-to-Speech
│   │   └── stt/                # Speech-to-Text
│   ├── features/               # Feature modules
│   │   ├── annotations/        # NEW: Annotations & Sticky Notes
│   │   │   ├── storage-adapter.js     # Storage adapters (575 lines)
│   │   │   └── migration-manager.js   # Migration system (244 lines)
│   │   ├── ocr/                # OCR & Screenshot
│   │   ├── reading-mode/       # Reading Mode
│   │   ├── dictionary/         # Dictionary Lookup
│   │   ├── highlight-menu/     # Text Highlight Menu
│   │   └── dyslexia/           # Dyslexia Reading Modes
│   └── manifest.json           # Extension manifest (source)
├── tests/                      # Test files
│   ├── unit/                   # Unit tests (197 tests)
│   └── e2e/                    # E2E tests (Playwright)
├── docs/                       # Documentation
│   ├── sessions/               # Session notes (phase2-session-001 to 015)
│   └── planning/               # Planning documents
│       ├── PHASE2_TASKS.md     # Task tracker
│       └── CURRENT_STATUS.md   # Project status
├── scripts/                    # Build scripts
│   └── inject-popup-scripts.js # Script injection helper
├── package.json                # Dependencies
├── vite.config.js             # Vite configuration
├── jest.config.cjs            # Jest test configuration
├── playwright.config.js       # Playwright E2E configuration
├── .eslintrc.cjs              # ESLint configuration
├── .prettierrc                # Prettier configuration
└── CLAUDE.md                  # Project instructions for AI assistant
```

---

## 🔧 Common Issues & Solutions

### Issue 1: `npm install` fails with permission errors

**Solution**:

```bash
# Windows: Run as Administrator
# OR delete node_modules and try again
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Build fails with "Cannot find module"

**Solution**:

```bash
# Reinstall dependencies
npm ci
npm run build
```

### Issue 3: Extension doesn't load in Chrome

**Solutions**:

- Make sure you're loading the `.vite/` folder, NOT `src/`
- Check `chrome://extensions/` for error messages
- Run `npm run build` again to regenerate `.vite/`
- Try removing and re-adding the extension

### Issue 4: Tests fail with "Cannot find module"

**Solution**:

```bash
# Clear Jest cache
npm test -- --clearCache
npm test
```

### Issue 5: Husky pre-commit hook fails

**Solution**:

```bash
# Bypass hook temporarily (for testing only)
git commit --no-verify -m "message"

# OR fix husky (recommended)
npm run prepare
```

### Issue 6: Playwright browser not installed

**Solution**:

```bash
# Install Playwright browsers
npx playwright install chromium
```

---

## 📊 Current Project State

### Completed Features (Phase 2.1 - 100%)

1. ✅ **OCR + Screenshot Tool** (12/12 tasks)
   - Tesseract.js integration
   - 14 language support
   - PDF support (Chrome viewer, PDF.js, Canvas)
   - Media player with chunking
   - Image upscaling for accuracy
   - Noise filtering (cookie banners, ads, social embeds)

2. ✅ **Highlight Menu** (13/13 tasks)
   - Context menu on text selection
   - 6 action buttons (Define, Translate, TTS, Annotate, Search, Copy)
   - Auto-hide delay (1-10 seconds)
   - Button enable/disable toggles
   - Settings persistence

3. ✅ **Reading Mode** (13/13 tasks)
   - Mozilla Readability integration
   - Clean article view
   - Custom fonts (Arial, OpenDyslexic, etc.)
   - Text customization (size, spacing, colors)
   - Auto-scroll functionality
   - Exit on Escape key

4. ✅ **Dictionary Lookup** (13/13 tasks)
   - Free Dictionary API integration
   - Phonetic pronunciation
   - Audio playback
   - Synonyms/antonyms (limit 8)
   - LRU cache (10-200 entries)
   - Auto-lookup toggle
   - Unit tests (39 tests)

### In Progress (Phase 2.2)

5. 🚧 **Annotations & Sticky Notes** (3/18 tasks)
   - [x] Task 5.1: Storage mode dropdown (local vs IndexedDB)
   - [x] Task 5.2: Dexie.js IndexedDB setup
   - [x] Task 5.3: Auto-migration between storage modes
   - [ ] Task 5.4: Sticky note creation (draggable div) ← **NEXT TASK**
   - [ ] Task 5.5: contentEditable rich text
   - [ ] Task 5.6-5.18: Remaining tasks (see PHASE2_TASKS.md)

**Current State**:

- Storage adapters implemented (LocalStorageAdapter, DexieStorageAdapter)
- Migration system complete with progress modal
- Storage mode selector in Advanced Options
- Ready to implement sticky note UI

---

## 🎯 Next Steps After Transfer

### Immediate Actions (First 15 minutes)

1. **Verify Setup**:

   ```bash
   npm install          # Install dependencies
   npm run build        # Build extension
   npm test             # Run tests (197 should pass)
   ```

2. **Load Extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable Developer mode
   - Load unpacked → Select `.vite/` folder
   - Click extension icon to verify popup works

3. **Check Current Branch**:
   ```bash
   git status
   # Should show: On branch feature/annotations-sticky-notes
   # Should show: nothing to commit, working tree clean
   ```

### Next Task: Sticky Note Creation (Task 5.4)

**What to Build**:

- Draggable sticky note component
- Mouse event handlers (mousedown, mousemove, mouseup)
- Position persistence (save x, y coordinates to storage)
- Basic styling (yellow note, fixed size for now)

**File to Create**:

- `src/features/annotations/sticky-note.js`

**Reference Files**:

- Storage adapters: `src/features/annotations/storage-adapter.js`
- Migration manager: `src/features/annotations/migration-manager.js`

**Task Details** (from PHASE2_TASKS.md):

```markdown
5.4: Sticky note creation (draggable div)

- Create sticky note component with mouse drag events
- Inject into content script
- Save position to storage adapter
- Test persistence across page reloads
```

---

## 🔐 Git Setup

### Current Branch State

```bash
# Current branch
feature/annotations-sticky-notes

# Last commit
5a05b4d - docs(docs): end Phase 2 session 015 - Auto-migration complete

# Commits on this branch (5 total):
cc7c4b0 - feat(ui): add storage mode dropdown
57a7a0d - feat(ui): implement Dexie.js storage adapters
e13d6ae - feat(ui): add auto-migration system
633589a - fix(ui): trigger migration on storage mode change
4022243 - fix(ui): properly handle storage mode change
d52a642 - fix(ui): attach migration event listener after modal creation
5a05b4d - docs(docs): end Phase 2 session 015
```

### Git Savepoint

**Rollback Point**: `v0.1.0-pre-phase2` (commit f16053c)

```bash
# If you need to rollback to stable state:
git reset --hard v0.1.0-pre-phase2

# To see all tags:
git tag
```

---

## 📝 Important Notes

### Build System

- **ALWAYS edit files in `src/` directory**
- **NEVER edit files in `.vite/` directory** (auto-generated)
- **Run `npm run build` after changes** to test in Chrome
- **Chrome loads extension from `.vite/`**, not `src/`

### Testing

- **Unit tests**: 197/197 passing (100%)
- **E2E tests**: 41/63 passing (65% - selector updates needed)
- **Run tests before committing**: `npm test`

### Code Style

- **ESLint**: Enforced in pre-commit hook
- **Prettier**: Auto-formats on commit
- **Conventional Commits**: Required format (feat/fix/docs/test/refactor)

### Dependencies Already Installed

All dependencies in `package.json` are installed:

- tesseract.js (OCR)
- @mozilla/readability (Reading Mode)
- dexie (IndexedDB for Annotations)
- citeproc (Citations - not yet used)
- open-graph-scraper (Metadata - not yet used)
- compromise (NLP for Dyslexia)
- pdfjs-dist (PDF rendering)

**No additional installs needed** unless adding new features.

---

## 🆘 Emergency Contacts

### Documentation References

- **Project Instructions**: `CLAUDE.md`
- **Current Status**: `docs/planning/CURRENT_STATUS.md`
- **Task Tracker**: `docs/planning/PHASE2_TASKS.md`
- **Session Notes**: `docs/sessions/phase2-session-015.md` (latest)
- **Phase Memory**: `PROJECT_MEMORY.md`

### Key Files to Know

- **Settings Manager**: `src/core/storage/settings-manager.js`
- **Main Popup Logic**: `src/popup/popup.js` (2,758 lines)
- **Content Script**: `src/content/content-simple.js`
- **Storage Adapters**: `src/features/annotations/storage-adapter.js`
- **Migration Manager**: `src/features/annotations/migration-manager.js`

---

## ✅ Transfer Checklist

Before closing this PC:

- [ ] All code committed and pushed to remote
- [ ] Documentation updated (session notes, status docs)
- [ ] No uncommitted changes (`git status` clean)
- [ ] Latest build successful (`npm run build`)
- [ ] Tests passing (`npm test`)

On new PC:

- [ ] Node.js installed (v18+)
- [ ] Git installed
- [ ] Chrome installed
- [ ] Project cloned/copied
- [ ] `npm install` completed
- [ ] `npm run build` successful
- [ ] Extension loaded in Chrome
- [ ] Tests passing (197/197)
- [ ] Current branch: `feature/annotations-sticky-notes`

---

## 🎓 Quick Reference Commands

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Git status
git status

# Switch branches
git checkout <branch-name>

# Commit changes (triggers pre-commit hooks)
git add .
git commit -m "feat(feature): description"

# Push to remote
git push origin feature/annotations-sticky-notes
```

---

**Document Complete** - Ready for transfer to work PC

**Next Action**: Start Task 5.4 - Sticky note creation (draggable div)
