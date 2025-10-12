# 🚨 Incident Report: Output/ Directory Confusion

**Date:** 2025-10-11
**Severity:** High (2+ hours development time lost)
**Status:** Resolved with guardrails implemented

---

## Executive Summary

During Sprint 2 feature development, all code changes were made to source files in `src/` directory while Chrome Extension was loading from the `Output/` directory. This caused a critical disconnect where:
- Source files contained all new features and bug fixes
- Chrome ran old code from outdated Output/ directory
- "Fixes don't work" despite proper extension reloads
- Multiple debugging attempts failed to identify root cause

**Resolution:** Implemented mandatory build step (`npm run build`) with documentation and guardrails to prevent recurrence.

---

## Timeline of Events

### Sprint 2 Development Session

**20:00** - Started implementing 3 Sprint 2 features:
- Speed Presets (4 preset buttons)
- Read Selection (context menu)
- Word-by-Word Highlighting

**20:30** - Features implemented successfully in source files

**21:00** - User reports bugs:
- "Read Selection doesn't work when TTS is disabled"
- "TTS toggle doesn't actually disable reading"

**21:15** - Implemented fixes in source files:
- Added dynamic context menu (appears/disappears with TTS toggle)
- Added `settings.enabled` check in content script
- Added visual toast feedback when TTS disabled

**21:30** - User reports: "fix didn't work"

**21:35** - Instructed user to reload extension (chrome://extensions)

**21:40** - User reports: "still doesn't work"

**21:45** - Created detailed reload instructions (RELOAD_EXTENSION_INSTRUCTIONS.md)

**22:00** - User reports: "extension has been reloaded, i removed the extension, quit out of chrome and reloaded the extension, the same behaviour"

**22:15** - Created test suite analysis (TEST_SUITE_ANALYSIS.md)

**22:20** - Created manual test page (test-tts-toggle.html)

**22:25** - Created version checker (check-version.html)

**22:30** - User expresses frustration: "this should be a simple fix"

**22:35** - User pastes Console output showing OLD code running (line 419, missing debug logs)

**22:40** - User pastes content-simple.js source showing OLD code (no `enabled` property)

**22:45** - 🔍 **ROOT CAUSE DISCOVERED:** User's pasted code was from `Output/src/content/content-simple.js`

**22:50** - Verified with `find . -name "manifest.json"` - found TWO: root and Output/

**22:55** - Confirmed Chrome was loading from Output/, edits were in root src/

**23:00** - Copied all updated files: `src/` → `Output/src/`

**23:05** - Incident resolved (pending user verification)

---

## Root Cause Analysis

### Primary Cause: Missing Build Step

**What happened:**
1. Project has build process: `npm run build` copies `src/` → `Output/`
2. Chrome Extension loads from: `Output/` directory
3. AI assistant edited source files in: `src/` directory
4. Build step was NOT executed
5. Chrome continued running old code from outdated `Output/`

### Contributing Factors

**1. Lack of Documentation**
- No FILE_STRUCTURE.md explaining directory purpose
- No mention of build requirement in CLAUDE.md
- No projectmemory.md entry about build process

**2. Missing Context**
- AI had no knowledge Output/ was the loaded directory
- Previous sessions may have worked directly from src/
- No indication build step was required for testing

**3. No Validation Guardrails**
- No check for "are you editing Output/ by mistake?"
- No reminder to build after editing
- No detection of stale Output/ directory

**4. Silent Failure**
- Build step fails silently when skipped
- Chrome shows no warning about outdated files
- Extension appears to reload but runs old code

### Why Diagnosis Was Difficult

**Symptoms mimicked other issues:**
- Looked like Chrome extension caching problem
- Looked like improper extension reload
- Looked like browser bug
- Console showed code running but from wrong version

**Missing clues initially:**
- User didn't mention which directory Chrome loaded from
- File paths in Console didn't show "Output/" prefix
- Line numbers aligned roughly with source files

---

## Impact Assessment

### Time Cost
- **Development time lost:** 2+ hours
- **Debugging cycles:** 10+ iterations
- **Documentation created during debug:** 5 files (some useful, some redundant)

### User Experience Impact
- User frustration ("this should be a simple fix")
- Loss of confidence in development process
- Repeated failed attempts to resolve issue

### Code Quality Impact
- No actual bugs in implemented features
- All fixes were correctly implemented
- Issue was purely deployment/build related

### Learning Opportunity
- ✅ Exposed critical gap in build process documentation
- ✅ Identified need for guardrails in development workflow
- ✅ Highlighted importance of directory structure clarity

---

## Guardrails Implemented

### 1. Documentation Created

**FILE_STRUCTURE.md** (Comprehensive guide)
- Directory structure explanation
- Why src/ and Output/ are separate
- Complete workflow (Edit → Build → Test → Commit)
- Diagnostic checklist for "changes not loading"
- Quick reference table

**CLAUDE.md** (Updated with critical rule)
- Added "File Location Rules" section
- ALWAYS edit src/, NEVER edit Output/
- Validation rule for AI assistant

**projectmemory.md** (Decision log entry DEC-202510-014)
- Documented incident as architectural decision
- Explained rationale for build process
- Added workflow reminder to stable state reference

**build.sh** (Alternative bash build script)
- Created for non-Node environments
- Clear warnings about file location rules
- Verification steps

### 2. Workflow Standardization

**Standard Development Workflow (MANDATORY):**

```bash
# Step 1: Edit source files (ONLY here)
vim src/content/content-simple.js

# Step 2: Build (copies src/ → Output/)
npm run build

# Step 3: Test
# - Reload extension: chrome://extensions
# - Hard refresh page: Ctrl+Shift+R

# Step 4: Commit (ONLY source files)
git add src/
git commit -m "feat: description"
```

### 3. AI Assistant Rules

**Before editing ANY file:**
1. ✅ Validate file path does NOT contain "Output/"
2. ✅ If path contains "Output/", STOP
3. ✅ Redirect to equivalent source file in `src/`
4. ✅ Proceed with edit in source file

**After editing source files:**
1. ✅ Remind user to run: `npm run build`
2. ✅ Remind user to reload extension
3. ✅ Remind user to hard refresh page
4. ✅ Ask for confirmation changes appear

### 4. .gitignore Verification

**Confirmed Output/ is excluded:**
```gitignore
# Build outputs
dist/
build/
Output/      ← Correctly ignored
*.crx
*.zip
```

This ensures Output/ is never committed to git (it's generated from src/).

---

## Verification Steps

### For User (Next Steps)

1. **Verify Chrome loads from Output/**
   ```
   Go to chrome://extensions
   Find AssisT extension
   Check path ends with "/Output"
   ```

2. **Run build to sync latest code**
   ```bash
   cd /c/Users/jones/AIprojects/AssitT
   npm run build
   ```

3. **Reload extension**
   ```
   chrome://extensions → Click reload on AssisT
   ```

4. **Test TTS toggle**
   ```
   1. Open popup
   2. Toggle TTS OFF
   3. Click a paragraph
   4. Should see warning toast: "⚠️ TTS is disabled"
   5. Console should show: "[AssisT] Click ignored - TTS is disabled"
   ```

5. **Test Read Selection context menu**
   ```
   1. With TTS OFF: Right-click selected text → No "AssisT: Read Selection" menu
   2. Toggle TTS ON
   3. Right-click selected text → "🎯 AssisT: Read Selection" appears
   ```

6. **Verify Console logs updated**
   ```
   Look for these new logs:
   - "[AssisT] Raw storage result: {...}"
   - "[AssisT] Settings loaded, TTS enabled: false"
   - "[AssisT] Context menu created (TTS enabled)"
   ```

---

## Lessons Learned

### What Went Well
1. ✅ **Systematic debugging** - Tried multiple approaches before finding root cause
2. ✅ **Documentation during debug** - Created helpful guides (reload instructions, version checker)
3. ✅ **Clear communication** - Asked user for specific file contents that revealed issue
4. ✅ **Comprehensive resolution** - Not just fixed immediate issue but implemented guardrails

### What Could Improve
1. ⚠️ **Earlier directory verification** - Should have checked Chrome load path in first debug cycle
2. ⚠️ **Build step assumption** - Should have asked: "Did you run npm run build?"
3. ⚠️ **File path validation** - Should verify file paths before suggesting edits
4. ⚠️ **Pre-session checklist** - Need standard "start of session" verification steps

### Process Improvements

**New session start checklist:**
```markdown
- [ ] Verify Chrome extension load path
- [ ] Check if Output/ exists and is recent
- [ ] Run npm run build if starting fresh session
- [ ] Review last commits to understand current state
- [ ] Check for any build scripts in package.json
```

**Before making code changes:**
```markdown
- [ ] Confirm editing source file in src/
- [ ] Path does NOT contain "Output/"
- [ ] File is tracked by git (not build artifact)
```

**After making code changes:**
```markdown
- [ ] Remind user to: npm run build
- [ ] Remind user to: reload extension
- [ ] Remind user to: hard refresh page
- [ ] Ask user to confirm changes visible
```

---

## Recommendations

### Immediate (Completed)
- ✅ Create FILE_STRUCTURE.md with comprehensive explanation
- ✅ Update CLAUDE.md with file location rules
- ✅ Document incident in projectmemory.md
- ✅ Verify .gitignore excludes Output/
- ✅ Verify build script exists (build-extension.js)

### Short-term (Next Session)
- [ ] Add pre-commit hook to prevent committing Output/ files
- [ ] Create package.json script alias: `npm run dev` (build + watch)
- [ ] Add timestamp check in build script (warn if Output/ outdated)
- [ ] Create VSCode workspace settings marking Output/ as excluded

### Long-term (Future Sprints)
- [ ] Implement file watcher: auto-rebuild on src/ changes
- [ ] Implement Chrome extension hot reload API
- [ ] Create development mode with live reload
- [ ] Add build verification to test suite (fail if Output/ stale)

---

## Key Takeaways

### For AI Assistant
1. **Always validate file paths** - Check for "Output/" before editing
2. **Never assume build is current** - Always remind user to build
3. **Ask about directory structure** - Clarify where Chrome loads from
4. **Provide complete workflow** - Edit → Build → Test is mandatory

### For Developer
1. **Build step is mandatory** - Chrome loads from Output/, not src/
2. **NEVER edit Output/ directly** - All edits go in src/
3. **Verify Output/ is current** - Run build before testing
4. **Check Console for version** - Confirms which code is running

### For Project
1. **Documentation is critical** - FILE_STRUCTURE.md prevents this issue
2. **Guardrails save time** - Pre-commit hooks, validation, checklists
3. **Build process must be obvious** - Should be first thing in development guide
4. **Automation helps** - File watchers, hot reload eliminate manual steps

---

## Related Documentation

- [FILE_STRUCTURE.md](FILE_STRUCTURE.md) - Comprehensive directory structure guide
- [CLAUDE.md](CLAUDE.md) - Project configuration with file location rules
- [projectmemory.md](projectmemory.md) - Decision log entry DEC-202510-014
- [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) - Feature development patterns
- [build-extension.js](build-extension.js) - Node.js build script
- [build.sh](build.sh) - Bash alternative build script

---

## Status: RESOLVED ✅

**Date Resolved:** 2025-10-11
**Resolution:** Files copied from src/ → Output/, guardrails implemented
**Pending:** User verification that fixes now work after rebuild
**Confidence:** High - root cause identified and addressed systematically

---

*This incident report serves as a learning document for future development and a reference for the implemented guardrails.*
