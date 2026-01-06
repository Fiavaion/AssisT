# Phase 2 Session 064 - Safe Branding System & CLAUDE.md Authority

**Date**: 2026-01-06
**Duration**: ~2.5 hours
**Phase**: Phase 2 Extension - Branding Infrastructure
**Progress**: 100% → 100% (maintenance)
**Session Number**: 64

---

## Session Overview

**Goal**: Fix extension breakage from previous session and implement safe branding switching system
**Status**: ✅ Complete

---

## Session Context

**Starting Status**: Extension completely broken - wrong build output directory
**Issue**: AI assistant (Claude) ignored CLAUDE.md instructions about `.vite/` output directory, repeatedly told user to load from `AssistLLM` folder

---

## Accomplishments

### Critical Fix: Build Output Directory

The vite.config.js had `outDir: 'AssistLLM'` which contradicted CLAUDE.md documentation stating `.vite/` is the correct output directory. Fixed by:

- Changing vite.config.js outDir from 'AssistLLM' to '.vite'
- This aligns with CLAUDE.md which is the authoritative source

### LESSONS_CLAUDE_MD_AUTHORITY.md Created

Documented the failure mode where AI assistant ignored project documentation:

- Root cause: Trusted config file state over CLAUDE.md
- Established hierarchy of truth: CLAUDE.md > User instructions > Other docs > Config files
- Added checklist for AI behavior before answering build/config questions

### CLAUDE.md Updated

Added two critical reminders:

- **ABSOLUTE RULE #0**: CLAUDE.md is always the truth
- **Critical Reminder** in debugging protocol section
- Added LESSONS_CLAUDE_MD_AUTHORITY.md to mandatory reading list

### Safe Branding System Implemented

Created build-time branding system that switches extension name between "AssisT" and "@NCAD":

**Files Created**:

- `branding.config.json` - Brand definitions (name, tagline, logo)
- `scripts/apply-branding.cjs` - Build-time HTML preprocessing script

**How It Works**:

1. `npm run switch:ncad` copies manifest.ncad.json → manifest.json
2. `apply-branding.cjs` replaces branded strings in HTML files
3. `npm run build` compiles to `.vite/`
4. Single command does everything

**Safety Features**:

- No runtime DOM manipulation (previous failure cause)
- No popup.js modifications
- Simple string replacement - predictable, auditable
- Fail-safe: if script fails, build fails

### Manifest Files Synced

Both manifest.assist.json and manifest.ncad.json now have identical permissions:

- Full permissions: downloads, contextMenus, declarativeNetRequest
- Ollama/Claude API host_permissions
- All adapters and web_accessible_resources
- Only name/description/title differ between variants

---

## Files Created

| File                             | Lines | Description                                    |
| -------------------------------- | ----- | ---------------------------------------------- |
| `LESSONS_CLAUDE_MD_AUTHORITY.md` | ~95   | Failure documentation and prevention checklist |
| `branding.config.json`           | 14    | Brand variant definitions                      |
| `scripts/apply-branding.cjs`     | 140   | Build-time HTML branding script                |

---

## Files Modified

| File                   | Change                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `vite.config.js`       | Changed outDir from 'AssistLLM' to '.vite'                   |
| `CLAUDE.md`            | Added ABSOLUTE RULE #0, critical reminder, mandatory reading |
| `package.json`         | Updated switch:assist and switch:ncad scripts                |
| `manifest.assist.json` | Full permissions, fixed adapter path                         |
| `manifest.ncad.json`   | Full permissions, fixed adapter path                         |

---

## Key Decision

**Decision**: Use build-time HTML preprocessing for branding changes

- **Reason**: Previous attempt used runtime DOM manipulation (setBranding()) which broke all UI elements
- **Impact**: Safe, reversible branding switching with zero risk of breaking functionality
- **Rejected**: Runtime JavaScript branding changes

---

## Challenge and Solution

**Challenge**: Extension completely broken after previous session's changes

- AI ignored explicit CLAUDE.md instructions about build output directory
- Told user to load from AssistLLM when CLAUDE.md states .vite/

**Solution**:

1. Fixed vite.config.js to output to .vite/ per CLAUDE.md
2. Created lessons file documenting the failure
3. Updated CLAUDE.md with stronger authority rules
4. Implemented safe branding system that cannot break extension

**Time Lost**: ~2 hours in previous session
**Lesson**: CLAUDE.md is ALWAYS the authoritative source - even when config files say otherwise

---

## Technical Insights

1. **Build-time vs Runtime branding**: Build-time string replacement is much safer than runtime DOM manipulation
2. **Config file drift**: Config files can diverge from documented requirements - always verify against CLAUDE.md
3. **User pushback signal**: When user says "we've been through this before" - STOP and re-read CLAUDE.md

---

## Branding System Usage

```bash
# Switch to @NCAD branding
npm run switch:ncad

# Switch to AssisT branding
npm run switch:assist

# Both commands:
# 1. Copy correct manifest
# 2. Apply branding to HTML files
# 3. Build to .vite/
# 4. Output reminder to reload from .vite/
```

---

## Verification Completed

- [x] `npm run switch:ncad` completes without error
- [x] Extension loads from `.vite/` without errors
- [x] Chrome toolbar shows "@NCAD" as extension name
- [x] Popup header shows "@NCAD"
- [x] `npm run switch:assist` reverts correctly
- [x] All functionality works after switching

---

## Next Session

**Status**: Complete
**Extension State**: Fully functional with working branding switch
**Current Branding**: @NCAD (user's last switch)

---

**Session Complete**: 2026-01-06
