# 🔧 Refactoring Starter Prompt

**Copy and paste this into your next Claude session to begin refactoring:**

---

## Starter Prompt

```
I need to refactor large files in my AssisT Chrome Extension project to improve maintainability.

PROJECT CONTEXT:
- Branch: feature/automated-fixes (already checked out)
- Location: c:\Users\Media Admin\AIprojects\AssisT\AssisT
- Goal: Split large files into modular structure (<500 lines per file)

CURRENT STATE:
- src/content/content-simple.js: 2,392 lines (needs splitting into 12 files)
- src/popup/popup.js: 1,764 lines (needs splitting into 8 files)
- All code follows feature isolation pattern (e.g., tts_initialize, dyslexia_applyBionic)

WHAT TO DO:
1. Read docs/PHASE3_REFACTORING_PLAN.md for complete architecture and strategy
2. Follow the refactoring plan step-by-step:
   - Create utility modules first (dom-utils.js, storage-utils.js)
   - Extract features one at a time (TTS, Dyslexia, LMS integrations)
   - Create main orchestrator (index.js)
   - Update manifest.json and build script
   - Test after each extraction (npm test && npm run build)
3. Maintain feature isolation pattern throughout
4. Run tests after each module extraction to verify nothing breaks
5. Commit after each successful extraction

IMPORTANT CONSTRAINTS:
- Keep existing function names (feature isolation pattern: tts_, dyslexia_, etc.)
- Don't break any functionality
- Run npm test after each extraction
- Use --no-verify flag for commits (TTS tests have known failures)

TESTING AFTER REFACTOR:
npm run build          # Verify build works
npm test               # Unit tests (expect 72/94 passing - TTS mocks need fix)
npm run test:e2e       # E2E tests (expect ~23/25 passing)

ESTIMATED TIME: 6-8 hours for full refactor

START WITH: Read docs/PHASE3_REFACTORING_PLAN.md and begin with Step 1 (utility modules)

Please begin the refactoring process following the plan in PHASE3_REFACTORING_PLAN.md. Work systematically through each step, testing and committing as you go.
```

---

## Quick Reference for Next Session

### Branch Status

```bash
git branch --show-current
# Should show: feature/automated-fixes

git status
# Should show: clean working tree

git log --oneline -5
# Should show recent commits including refactoring work
```

### Key Files to Read First

1. `docs/PHASE3_REFACTORING_PLAN.md` - Complete refactoring strategy
2. `src/content/content-simple.js` - File to refactor (2,392 lines)
3. `src/popup/popup.js` - File to refactor (1,764 lines)

### Directory Structure to Create

```
src/content/
├── index.js (new)
├── features/ (new)
│   ├── tts.js
│   ├── dyslexia.js
│   └── ... (8 more)
├── lms/ (new)
│   ├── canvas.js
│   ├── moodle.js
│   └── google-classroom.js
└── utils/ (new)
    ├── dom-utils.js
    └── storage-utils.js
```

### Success Criteria

- [ ] All files <500 lines
- [ ] Main index.js <200 lines
- [ ] npm run build succeeds
- [ ] npm test shows 72/94 passing (same as before)
- [ ] npm run test:e2e shows ~23/25 passing
- [ ] Extension loads in Chrome without errors
- [ ] All features still work (manual smoke test)

### Commit Pattern

```bash
git commit -m "refactor(content): extract [feature] to separate module

- Extracted [feature]_* functions to src/content/features/[feature].js
- [X] lines extracted, content-simple.js now [Y] lines
- Tests passing: npm test (72/94)
- Build verified: npm run build

🤖 Generated with Claude Code"
```

---

## Optional: Faster Refactoring Strategy

If you want to save time, you can do **partial refactoring** (3-4 hours):

**Extract only the 3 largest features:**

1. Dyslexia Mode (~400 lines) - Most complex
2. TTS Feature (~300 lines) - Core functionality
3. Canvas LMS (~250 lines) - Largest LMS

This reduces content-simple.js from 2,392 → ~1,400 lines (40% reduction) and demonstrates the pattern for future work.

---

## Emergency Rollback

If refactoring causes issues:

```bash
# See what changed
git status
git diff

# Rollback all changes
git reset --hard origin/feature/automated-fixes

# Or rollback to specific commit
git log --oneline
git reset --hard <commit-hash>
```

---

**Good luck with the refactoring! The plan in PHASE3_REFACTORING_PLAN.md has everything you need.** 🚀
