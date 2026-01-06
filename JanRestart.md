# AssisT Project Restart Guide - January 2026

## Quick Start

```bash
# 1. Clone/copy project to work computer
# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Load extension in Chrome
# Go to chrome://extensions > Developer mode > Load unpacked > Select .vite folder
```

---

## Prerequisites Checklist

### Required Software

Run these commands to verify installation:

```bash
# Node.js (v18+ required)
node --version
# Expected: v18.x.x or higher

# npm (v9+ required)
npm --version
# Expected: 9.x.x or higher

# Git
git --version
# Expected: git version 2.x.x
```

### If Missing, Install:

| Software | Download Link                  | Notes                       |
| -------- | ------------------------------ | --------------------------- |
| Node.js  | https://nodejs.org/            | LTS version recommended     |
| Git      | https://git-scm.com/           | Include Git Bash on Windows |
| VS Code  | https://code.visualstudio.com/ | Recommended IDE             |

### Chrome Browser

- Chrome v120+ required for Manifest V3 extensions
- Developer mode must be enabled in chrome://extensions

---

## Project Setup

### 1. Get the Code

```bash
# If cloning from remote
git clone <repository-url>
cd AssisT

# Or copy the entire folder to new machine
```

### 2. Install Dependencies

```bash
npm install
```

This will install ~50 dependencies including:

- Vite (build tool)
- SortableJS (drag-drop for UI overhaul)
- Tesseract.js (OCR)
- PDF.js (PDF handling)
- Dexie (IndexedDB wrapper)

### 3. Build the Extension

```bash
# Standard build (outputs to .vite folder)
npm run build

# Watch mode for development
npm run dev
```

### 4. Load in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `.vite` folder (NOT the `src` folder)
5. Extension should appear with the AssisT icon

---

## Current Project State

### Branch Status

```bash
# Check current branch
git branch

# Currently on: ui-overhaul
# Main branch: main
```

### Recent Work (Session 065)

**UI Overhaul - COMPLETE**

| Feature                     | Status  | Commit    |
| --------------------------- | ------- | --------- |
| Organize Mode               | ✅ Done | `3450359` |
| Profiles Tab in Modal       | ✅ Done | `23b51e7` |
| Keyboard Shortcuts Redesign | ✅ Done | `19d9189` |

### Key Features Implemented

1. **Organize Mode** (📐 button in popup header)
   - Drag-and-drop section reordering
   - Drag-and-drop feature reordering within sections
   - Section visibility toggles (eye icon)
   - Inline section title editing
   - Keyboard accessible (Alt+Up/Down)

2. **Profiles Tab** (Advanced Settings > Profiles)
   - Profile selector with descriptions
   - Save/Delete/Export/Import buttons
   - Preset profile showcase

3. **Keyboard Shortcuts** (Advanced Settings > Keyboard)
   - Card-based layout
   - Preset buttons (Default, Minimal, One-Handed)
   - Enhanced recording overlay with modifier visualization

---

## File Structure Overview

```
AssisT/
├── .vite/              # BUILD OUTPUT - Chrome loads from here
├── src/                # SOURCE CODE - Edit files here
│   ├── popup/          # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.js    # Main popup logic + OrganizeMode class
│   │   └── popup.css   # All styles including organize mode
│   ├── core/
│   │   └── storage/
│   │       └── settings-manager.js  # Settings with ui_layout schema
│   ├── features/       # Individual feature modules
│   ├── engines/        # TTS/STT/OCR engines
│   └── adapters/       # Canvas/Moodle/Classroom integrations
├── docs/
│   ├── sessions/       # Session documentation
│   └── planning/       # CURRENT_STATUS.md, PHASE2_TASKS.md
├── tests/              # Unit and E2E tests
├── package.json
├── vite.config.js
└── CLAUDE.md           # Project instructions (IMPORTANT!)
```

---

## Common Commands

```bash
# Build extension
npm run build

# Development with watch
npm run dev

# Run unit tests
npm test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Switch branding (if applicable)
npm run switch:assist
npm run switch:ncad
```

---

## Verify Installation

After setup, verify everything works:

### 1. Build Check

```bash
npm run build
# Should complete without errors
# Output: ".vite/" folder with built files
```

### 2. Extension Load Check

- Load extension in Chrome
- Click extension icon
- Popup should appear with 6 accordion sections
- Click ⚙️ (gear icon) > Should open Advanced Options modal with 4 tabs

### 3. Organize Mode Check

- Click 📐 button in popup header
- Purple border should appear
- Drag handles should be visible on sections
- Drag a section to reorder

### 4. Test Run (Optional)

```bash
npm test
# Should pass ~979 unit tests
```

---

## Pending Work / Next Steps

### Ready to Merge

The `ui-overhaul` branch is complete and ready for merge to main:

```bash
git checkout main
git merge ui-overhaul
git push origin main
```

### Optional Future Enhancements

- Feature-level visibility toggles in organize mode
- Additional shortcut presets (accessibility-focused)
- Profile quick-apply buttons

---

## Troubleshooting

### Build Fails

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
npm run build
```

### Extension Won't Load

1. Make sure you're loading `.vite` folder (not `src`)
2. Check Chrome version (v120+ required)
3. Ensure Developer mode is enabled

### Popup Doesn't Open

1. Check Chrome console for errors (right-click extension > Inspect popup)
2. Rebuild: `npm run build`
3. Reload extension in chrome://extensions

### Git Issues

```bash
# Check status
git status

# If uncommitted changes need to be saved
git stash

# If need to reset to clean state
git checkout -- .
```

---

## Key Documentation Files

| File                                  | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `CLAUDE.md`                           | Project instructions and constraints |
| `docs/planning/CURRENT_STATUS.md`     | Current progress and session info    |
| `docs/planning/PHASE2_TASKS.md`       | Task tracker for Phase 2             |
| `docs/sessions/phase2-session-065.md` | Latest session notes                 |

---

## Contact / Resources

- Session notes: `docs/sessions/`
- Plan file: `C:\Users\jones\.claude\plans\buzzing-pondering-lollipop.md`
- All Phase 2 features: 100% complete
- Current focus: UI overhaul polish

---

_Last Updated: 2026-01-06_
_Session: 065_
_Branch: ui-overhaul_
