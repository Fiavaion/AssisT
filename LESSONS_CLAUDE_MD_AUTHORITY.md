# LESSONS: CLAUDE.md is the Authoritative Source

**Date:** 2026-01-06
**Incident Duration:** ~2 hours
**Severity:** Critical - Complete extension breakage

---

## ⚠️ ABSOLUTE RULE (Direct User Instruction)

**CLAUDE.md is ALWAYS the absolute truth.**

Even if contradicted by:

- Config files (vite.config.js, package.json, tsconfig.json, etc.)
- Source code
- Conversation summaries
- Previous AI responses
- Any other source

**CLAUDE.md wins. No exceptions.**

**If you are unsure or confused: ASK THE USER TO CONFIRM before proceeding.**

Do not assume. Do not guess. Do not trust other sources over CLAUDE.md.

---

## The Failure

The AI assistant (Claude) repeatedly told the user to load the Chrome extension from the `AssistLLM` folder when CLAUDE.md explicitly states the output directory is `.vite/`.

## Root Cause

1. Claude read `vite.config.js` and found `outDir: 'AssistLLM'`
2. Claude assumed the config file represented the correct project state
3. Claude ignored the explicit instructions in CLAUDE.md lines 33-41:
   ```
   - **Chrome loads extension from:** `.vite/` directory (this is the OUTPUT directory)
   - **Build process:** Run `npm run build` to bundle `src/` → `.vite/`
   - **Build output location:** `.vite/` directory contains the final bundled extension
   ```
4. When conversation context said "the original was AssistLLM", Claude accepted this without verification

## The Critical Rule Violated

**CLAUDE.md is the authoritative project documentation.** When there is a discrepancy between:

- What a config file says
- What the codebase currently shows
- What CLAUDE.md explicitly states

**CLAUDE.md WINS. Always.**

## Why This Matters

CLAUDE.md exists specifically to:

1. Override default AI behavior
2. Establish project-specific rules
3. Prevent exactly this type of configuration drift error

When the AI ignores CLAUDE.md, the entire purpose of having project documentation is defeated.

## Mandatory AI Behavior Going Forward

### Before Making Configuration Changes

1. **READ CLAUDE.md FIRST** - Not the config files
2. **VERIFY** - Does the current config match CLAUDE.md?
3. **FIX DISCREPANCIES** - If config differs from CLAUDE.md, fix the config to match CLAUDE.md
4. **NEVER** assume config files are authoritative over CLAUDE.md

### Hierarchy of Truth (Highest to Lowest)

1. CLAUDE.md explicit statements
2. User's direct verbal instructions
3. Other project documentation (README, etc.)
4. Current state of config files
5. Conversation summaries or context

### Red Flags to Watch For

- Config file says X, CLAUDE.md says Y → **Follow CLAUDE.md**
- "The original was X" → **Verify against CLAUDE.md before accepting**
- User says "we've been through this before" → **STOP. Re-read CLAUDE.md. The user is likely right.**

## Specific Rules for This Project

### Build Output Directory

- **CORRECT:** `.vite/`
- **WRONG:** `AssistLLM`, `dist`, or any other directory

### If vite.config.js Shows Different Output Directory

The config file is WRONG. Fix it to output to `.vite/`:

```javascript
build: {
  outDir: '.vite',
  // ...
}
```

## Accountability

This incident wasted 2 hours of the user's time due to:

1. Failure to read project documentation
2. Trusting discovered state over documented requirements
3. Repeatedly giving incorrect instructions despite user pushback

**This must never happen again.**

## Checklist Before Answering Build/Config Questions

- [ ] Have I read the relevant section of CLAUDE.md?
- [ ] Does my answer align with CLAUDE.md?
- [ ] If there's a discrepancy, am I following CLAUDE.md (not the config)?
- [ ] If the user says I'm wrong, have I re-verified against CLAUDE.md?
