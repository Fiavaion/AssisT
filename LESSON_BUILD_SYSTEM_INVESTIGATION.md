# Critical Lesson: Always Investigate Build Systems Before Making Assumptions

**Date**: 2025-11-21
**Project**: AssisT Chrome Extension
**Severity**: CRITICAL - Caused complete extension breakage
**AI Assistant**: Claude (Sonnet 4.5)

---

## What Went Wrong

### The Problem

User reported: "Extension not working when loaded from Output folder. The .vite folder version works."

### The Mistakes Made by AI

1. **Contradicted user's explicit statement** - User said ".vite works" but AI insisted "use Output folder"
2. **Made wrong assumption** - Assumed simple file copy was correct build process
3. **Didn't investigate build system** - Failed to check `vite.config.js`, `package.json`, or git history FIRST
4. **Made problem worse** - Added `"type": "module"` to manifest.json, which was incorrect
5. **Declared "FIXED"** too early - Only addressed a symptom, not the root cause

### The Root Cause

The project uses **Vite** to bundle ES6 modules into browser-compatible code:

- `vite.config.js` specifies output directory as `.vite`
- Build script in `package.json` was incorrectly set to `node scripts/build-extension.js` (simple file copy)
- The extension REQUIRES bundling because it uses ES6 `import` statements
- Chrome extensions cannot load ES6 imports directly without bundling (unless using `"type": "module"` in manifest for background workers only)

---

## The Correct Fix

### Step 1: Investigate Build System FIRST

```bash
# Check package.json for build scripts
cat package.json | grep -A 5 "scripts"

# Check for bundler config files
ls -la | grep -E "vite|webpack|rollup|parcel"

# Check git history for build-related commits
git log --all --oneline --grep="vite\|bundle\|build" | head -20
```

### Step 2: Understand the Architecture

- `vite.config.js` exists → Project uses Vite
- `outDir: '.vite'` → Build output goes to `.vite` folder
- `@crxjs/vite-plugin` → Chrome extension-specific bundler
- ES6 imports in `src/` → MUST be bundled for Chrome

### Step 3: Fix the Build Script

**Before (WRONG)**:

```json
"build": "node scripts/build-extension.js"  // Simple file copy
```

**After (CORRECT)**:

```json
"build": "vite build"  // Proper bundling with Vite
```

### Step 4: Update Instructions

- Load extension from `.vite` folder (NOT `Output`)
- Run `npm run build` before testing
- `npm run dev` for watch mode during development

---

## Critical Rules for AI Assistants

### Rule 1: LISTEN TO THE USER

**If user says**: "X works but Y doesn't"
**AI should think**: "Why does X work? What makes X different from Y?"
**AI should NOT think**: "User is wrong, Y is the correct way"

### Rule 2: INVESTIGATE BEFORE ASSUMING

**ALWAYS check these files FIRST** before making changes:

1. `package.json` - Build scripts, dependencies
2. `vite.config.js` / `webpack.config.js` / `rollup.config.js` - Bundler config
3. `git log --grep="build\|bundle"` - Build system history
4. Project documentation (README, CLAUDE.md, etc.)

### Rule 3: VERIFY ASSUMPTIONS WITH EVIDENCE

**Before claiming something is "wrong"**:

- [ ] Read the actual config files
- [ ] Check git history for changes
- [ ] Look for evidence in logs/output
- [ ] Ask "why might the user's observation be correct?"

### Rule 4: DON'T DECLARE SUCCESS PREMATURELY

**Never say "FIXED"** until:

- [ ] Root cause identified and addressed
- [ ] Fix verified with actual testing
- [ ] No new problems introduced

### Rule 5: BUILD SYSTEMS ARE CRITICAL INFRASTRUCTURE

**ES6 modules in browsers**:

- ❌ Chrome extensions cannot directly load ES6 `import` statements in content scripts
- ✅ Background service workers CAN use `"type": "module"` in manifest
- ✅ Content scripts MUST be bundled (Vite, Webpack, Rollup, etc.)
- ✅ OR use IIFE (Immediately Invoked Function Expression) format

---

## Technical Details: Why Bundling Is Required

### The Problem with ES6 Imports

```javascript
// src/content/content-simple.js
import { showToast } from '../core/ui/toast.js'; // ❌ Won't work in Chrome
```

**Chrome extension content scripts cannot**:

- Use `import` statements (ES6 modules)
- Load dependencies dynamically
- Access `node_modules` directly

**They CAN only**:

- Execute single bundled JavaScript files
- Use IIFE format (what bundlers output)
- Access Chrome APIs (`chrome.storage`, etc.)

### What Vite Does

```javascript
// After Vite bundling (.vite/content-simple.js)
(function () {
  // All imports inlined and bundled
  const showToast = function (message) {
    /* ... */
  };
  // Main code here
})();
```

### Build Tool Detection Checklist

| File                     | Purpose         | Action           |
| ------------------------ | --------------- | ---------------- |
| `vite.config.js`         | Vite bundler    | Use `vite build` |
| `webpack.config.js`      | Webpack bundler | Use `webpack`    |
| `rollup.config.js`       | Rollup bundler  | Use `rollup -c`  |
| `package.json` "scripts" | Build commands  | Use npm scripts  |
| `tsconfig.json`          | TypeScript      | May need `tsc`   |

---

## Red Flags That Should Trigger Investigation

### 🚩 User says "X works but Y doesn't"

→ **Investigate what makes X different from Y**

### 🚩 Different folders exist (.vite, dist, build, Output)

→ **Check which is the ACTUAL build output**

### 🚩 ES6 imports in source code

→ **Check if bundler exists (vite.config.js, etc.)**

### 🚩 "It was working before"

→ **Check git history: `git log --oneline -20`**

### 🚩 File exists but extension fails silently

→ **Likely bundling issue, not missing file**

---

## Correct Troubleshooting Flow

```
User reports issue
    ↓
Listen to user's observation
    ↓
DON'T assume user is wrong
    ↓
Investigate build system
    ├─ Check package.json scripts
    ├─ Look for bundler config files
    ├─ Check git history
    └─ Read project documentation
    ↓
Identify root cause with EVIDENCE
    ↓
Propose fix with explanation
    ↓
Implement fix
    ↓
Verify with testing
    ↓
ONLY THEN declare "fixed"
```

---

## What AI Should Have Done

### Immediate Response to "vite folder works"

```
User: "the vite folder version at least works"

AI: "You're right - if .vite works, that's significant. Let me check
     why that folder exists and what creates it."

[Checks vite.config.js]
[Checks package.json build script]
[Realizes Vite is the correct build tool]

AI: "Found it - the project uses Vite bundling. The .vite folder
     is the correct build output. The issue is that package.json
     has the wrong build command. I'll fix it to use 'vite build'."
```

### What AI Actually Did (WRONG)

```
User: "the vite folder version at least works"

AI: "Use Output folder, not .vite"  ❌ Contradicted user
AI: "Added type:module to manifest"  ❌ Wrong fix
AI: "FIXED - reload from Output"     ❌ Problem not fixed
```

---

## Key Takeaways

### For AI Assistants

1. **User observations are data, not errors** - Investigate WHY they're true
2. **Build systems are infrastructure** - Check them BEFORE making changes
3. **Evidence over assumptions** - Read actual config files
4. **Humility over confidence** - "I don't know yet" is better than wrong answer
5. **Root cause first** - Don't fix symptoms

### For Developers

1. **Document build process** - README should explain `npm run build`
2. **Standardize folder names** - Use conventional names (`dist`, `.vite`)
3. **CI/CD reveals truth** - Automated builds show correct process
4. **Version control build configs** - Keep vite.config.js in git
5. **Test from build output** - Always load extension from bundler output

### For Project Setup

1. ✅ Keep `vite.config.js` in version control
2. ✅ Document build process in README
3. ✅ Use conventional output folder names
4. ✅ Add `.vite` or `dist` to `.gitignore` but document it
5. ✅ Include build command in `package.json` scripts

---

## Testing The Fix

### Before Fix (Broken)

```bash
npm run build              # Uses wrong script (file copy)
# Load from Output folder  # Extension doesn't work (no bundling)
```

### After Fix (Works)

```bash
npm run build              # Uses vite build
# Load from .vite folder   # Extension works (properly bundled)
```

### Verification Steps

1. ✅ Run `npm run build`
2. ✅ Check `.vite` folder exists and contains bundled code
3. ✅ Load extension from `.vite` folder in Chrome
4. ✅ Test all features (Highlight Menu, Dictionary, Reading Mode, TTS)
5. ✅ Check console for errors (should be none)

---

## Historical Context

### Git History Shows Vite Was Always Used

```bash
git log --oneline --grep="vite"
# 90e0031 feat(build): integrate Vite with @crxjs plugin for modular architecture
# 531ee6d refactor(core): extract showToast() to modular architecture with Vite
```

**The build script change to simple copy was a regression** - reverted to Vite-based build.

---

## Conclusion

**The most important lesson**: When a user reports "X works but Y doesn't",
the AI must investigate WHY X works, not insist Y is correct. The user's
observation that .vite folder worked was the KEY CLUE that Vite bundling
was the correct build process.

**Trust the evidence, not assumptions.**
