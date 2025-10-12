# 🗂️ File Structure & Directory Management

## 🚨 CRITICAL RULE: ALWAYS EDIT SOURCE FILES, NEVER OUTPUT FILES

---

## 📊 Root Cause Analysis: Output/ vs Root Directory Confusion

### What Happened (Sprint 2 Incident - 2025-10-11)

**Timeline:**
1. Sprint 2 features were being developed (Speed Presets, Read Selection, Word-by-Word)
2. All code edits were made to root directory files (`src/content/content-simple.js`, etc.)
3. Chrome extension was loaded from `Output/` directory
4. User reported: "Fixes don't work despite reloading extension"
5. Investigation showed Chrome was running **old code from Output/** while edits were in **root src/**

**Impact:**
- 2+ hours of development time wasted
- Multiple reload attempts with no effect
- User frustration ("this should be a simple fix")
- All 3 Sprint 2 features appeared broken when they were actually working

### Why This Happened

**Root Causes:**

1. **Two Parallel Directory Structures:**
   ```
   AssitT/
   ├── src/             ← SOURCE (where we should edit)
   │   ├── content/
   │   ├── popup/
   │   └── background/
   │
   └── Output/          ← BUILD OUTPUT (Chrome loads from here)
       ├── src/
       ├── manifest.json
       └── icons/
   ```

2. **No Build Process in Previous Session:**
   - Earlier sessions worked directly in root `src/`
   - Chrome likely loaded from root initially
   - At some point, Output/ directory was created
   - Chrome was switched to load from Output/
   - **No one communicated this change to the AI assistant**

3. **Missing Context:**
   - AI had no knowledge that Output/ was the loaded directory
   - .gitignore excludes Output/ (line 9), suggesting it's generated
   - No build script exists to sync src/ → Output/
   - No documentation about the Output/ directory purpose

4. **Symptom That Revealed the Issue:**
   - User pasted content-simple.js showing old code
   - Console logs showed old line numbers
   - Debug statements added in src/ didn't appear
   - File comparison revealed Output/ was outdated

---

## ✅ Correct Directory Structure (Going Forward)

### Source Files (ALWAYS EDIT HERE)

```
AssitT/
├── src/                          ← 🎯 EDIT SOURCE FILES HERE
│   ├── content/
│   │   ├── content-simple.js     ← Active content script
│   │   └── content.js            ← Legacy (not used)
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── background/
│   │   └── service-worker.js
│   └── utils/
│       └── storage-manager.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── manifest.json                 ← Root manifest
└── ...
```

### Build Output (GENERATED - DO NOT EDIT)

```
AssitT/
└── Output/                       ← 🚫 NEVER EDIT FILES HERE
    ├── src/                      ← Copy of src/
    ├── icons/                    ← Copy of icons/
    ├── manifest.json             ← Copy of manifest.json
    └── ...
```

### Key Principles

1. **Source of Truth:** `src/` directory is the ONLY place to edit code
2. **Build Output:** `Output/` is GENERATED from source files
3. **Chrome Loads From:** `Output/` directory (for testing)
4. **Git Tracks:** Only source files (Output/ is in .gitignore)
5. **Build Process:** Copy src/ → Output/ before testing

---

## 🛡️ Guardrails to Prevent This Issue

### Guardrail #1: File Path Validation

**Before editing ANY file, validate it's in the source directory:**

```javascript
// ✅ CORRECT - Source files
src/content/content-simple.js
src/popup/popup.js
src/background/service-worker.js
manifest.json (root)

// 🚫 WRONG - Build output files
Output/src/content/content-simple.js
Output/src/popup/popup.js
Output/manifest.json
```

**Rule:** If file path contains `Output/`, STOP and redirect to source file.

### Guardrail #2: Automated Build Script

Create a build script that ALWAYS runs before testing:

```bash
# build.sh
#!/bin/bash

echo "🔨 Building AssisT Extension..."

# Remove old build
rm -rf Output/

# Create Output directory
mkdir -p Output

# Copy all source files
cp -r src/ Output/src/
cp -r icons/ Output/icons/
cp manifest.json Output/manifest.json

echo "✅ Build complete! Chrome loads from: Output/"
echo "⚠️  Remember: ONLY edit files in src/, NOT in Output/"
```

### Guardrail #3: Pre-Commit Hook

Prevent accidental commits of Output/ files:

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Check if any Output/ files are staged
if git diff --cached --name-only | grep -q "^Output/"; then
  echo "❌ ERROR: You are trying to commit files from Output/ directory!"
  echo "   Output/ is a build artifact and should not be committed."
  echo "   Edit source files in src/ instead, then run: npm run build"
  exit 1
fi
```

### Guardrail #4: Documentation Requirements

**Every development session MUST start with:**
1. Verify Chrome extension loads from: `Output/`
2. Verify latest build exists: `ls -la Output/src/`
3. If Output/ outdated or missing: Run build script
4. ONLY edit source files in: `src/`

### Guardrail #5: Testing Checklist

Before reporting "feature doesn't work":

```markdown
- [ ] Verified editing source file (path does NOT contain Output/)
- [ ] Ran build script to copy src/ → Output/
- [ ] Reloaded extension in Chrome (chrome://extensions)
- [ ] Hard refreshed page (Ctrl+Shift+R)
- [ ] Checked Console for updated debug logs
- [ ] Verified file modification timestamp in Output/ matches recent build
```

---

## 📝 Standard Development Workflow

### Step 1: Start Development Session

```bash
# Verify current state
ls -la Output/  # Does Output/ exist?
ls -la src/     # Are source files present?

# If Output/ is missing or outdated
npm run build   # (or bash build.sh)
```

### Step 2: Make Code Changes

```bash
# ✅ CORRECT - Edit source files
vim src/content/content-simple.js
vim src/popup/popup.js
vim src/background/service-worker.js
```

### Step 3: Build & Test

```bash
# Build: Copy src/ → Output/
npm run build

# Reload extension in Chrome
# 1. Go to chrome://extensions
# 2. Click reload button on AssisT
# 3. Hard refresh page (Ctrl+Shift+R)
```

### Step 4: Verify Changes Loaded

```bash
# Check Console for debug logs
# Verify new functionality works
# Confirm file timestamps in Output/ are recent
```

### Step 5: Commit Changes

```bash
# ONLY commit source files
git add src/
git add manifest.json
git commit -m "feat(feature): description"
git push

# Output/ is in .gitignore - NEVER committed
```

---

## 🔍 How to Diagnose "Changes Not Loading" Issues

### Diagnostic Checklist

```markdown
**Problem:** Code changes don't appear in Chrome after reloading

**Diagnosis Steps:**

1. **Verify Source File Was Edited**
   - [ ] Open edited file: `cat src/content/content-simple.js | head -20`
   - [ ] Confirm changes present in source

2. **Verify Build Output Updated**
   - [ ] Check Output file: `cat Output/src/content/content-simple.js | head -20`
   - [ ] If changes MISSING → Run build script
   - [ ] If changes PRESENT → Continue to step 3

3. **Verify Chrome Loading Location**
   - [ ] Go to chrome://extensions
   - [ ] Check AssisT extension path
   - [ ] Path should be: `.../AssitT/Output`
   - [ ] If different → Remove extension, re-load from Output/

4. **Verify Extension Reloaded**
   - [ ] Click reload button on extension
   - [ ] Check timestamp on extension card
   - [ ] Should match recent time

5. **Verify Page Refreshed**
   - [ ] Hard refresh page: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - [ ] Check Console for initialization logs
   - [ ] Log timestamps should be recent

6. **Verify Console Logs Match Code**
   - [ ] Check Console output
   - [ ] Search for new debug log messages
   - [ ] If old logs appear → Cache issue, try closing tab and reopening
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Changes don't appear | Edited Output/ instead of src/ | Edit source file, rebuild |
| Changes don't appear | Forgot to run build | Run `npm run build` |
| Changes don't appear | Chrome loads from wrong directory | Remove extension, re-load from Output/ |
| Changes don't appear | Chrome aggressive caching | Close all tabs, restart Chrome |
| Console shows old logs | Page not refreshed | Hard refresh: Ctrl+Shift+R |
| Build fails | Output/ permissions | `rm -rf Output/ && npm run build` |

---

## 🎯 Quick Reference

### WHERE TO EDIT
```
✅ src/content/content-simple.js
✅ src/popup/popup.js
✅ src/background/service-worker.js
✅ manifest.json (root)
```

### WHERE CHROME LOADS FROM
```
🔍 Output/src/content/content-simple.js
🔍 Output/src/popup/popup.js
🔍 Output/manifest.json
```

### WORKFLOW COMMANDS
```bash
# Edit source
vim src/content/content-simple.js

# Build
npm run build

# Test
# 1. chrome://extensions → reload
# 2. Ctrl+Shift+R on page

# Commit
git add src/
git commit -m "feat: description"
```

### REMEMBER
- **Edit:** `src/`
- **Build:** `npm run build` (src/ → Output/)
- **Load:** Chrome uses `Output/`
- **Commit:** Only `src/` (Output/ ignored)

---

## 📚 Documentation Cross-References

- **CLAUDE.md:** Project configuration and constraints
- **DEVELOPMENT_WORKFLOW.md:** Feature development patterns
- **projectmemory.md:** Decision log for architectural choices
- **FILE_STRUCTURE.md:** (This file) Directory management rules

---

## 🔮 Future Improvements

### Planned Enhancements

1. **Automated Build on File Change**
   - Use `nodemon` or `chokidar` to watch src/
   - Auto-rebuild when files change
   - Eliminates manual build step

2. **Build Verification Script**
   - Compare src/ vs Output/ timestamps
   - Alert if Output/ is outdated
   - Run automatically before git commit

3. **Chrome Extension Hot Reload**
   - Implement extension hot reload API
   - Auto-reload extension when Output/ changes
   - Eliminates manual reload step

4. **IDE Workspace Settings**
   - Configure VSCode to mark Output/ as "excluded"
   - Prevent accidental edits in Output/
   - Make src/ the only visible directory

---

## ⚠️ Critical Reminder for AI Assistant

**BEFORE EDITING ANY FILE:**

1. Check file path
2. If path contains `Output/` → STOP
3. Redirect to equivalent source file in `src/`
4. Make edits in source
5. Remind user to run build script

**AFTER EDITING SOURCE FILES:**

1. Remind user to run: `npm run build`
2. Remind user to reload extension
3. Remind user to refresh page
4. Ask user to confirm changes appear in Console

This prevents the Sprint 2 incident from recurring.
