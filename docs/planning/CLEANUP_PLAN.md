# Project Cleanup & Optimization Plan

## 🗂️ Current Issues
1. **Root directory cluttered** with 40+ files
2. **Redundant documentation** (multiple overlapping guides)
3. **Temporary files** still in repo (test HTML files, debug scripts)
4. **Inconsistent naming** (some files use underscores, some use dashes)
5. **Token inefficiency** (large markdown files loaded unnecessarily)

---

## 📁 Proposed Directory Structure

```
AssisT/
├── .claude/                    # Claude Code settings (keep)
├── .git/                       # Git repository (keep)
├── docs/                       # All documentation (ORGANIZED)
│   ├── development/           # For developers
│   │   ├── ARCHITECTURE.md
│   │   ├── DEVELOPMENT_WORKFLOW.md
│   │   ├── FILE_STRUCTURE.md
│   │   └── TESTING_GUIDE.md
│   ├── planning/              # Sprint plans, roadmaps
│   │   ├── PRODUCTION_ROADMAP.md
│   │   ├── SPRINT2_CLEANUP_SUMMARY.md
│   │   ├── SPRINT3_STRATEGY.md
│   │   └── PROJECT_MEMORY.md
│   ├── user/                  # End-user documentation
│   │   ├── USER_GUIDE.md
│   │   ├── GETTING_STARTED.md
│   │   └── TROUBLESHOOTING.md
│   └── archive/               # Historical/deprecated docs
│       ├── INCIDENT_REPORTS.md
│       ├── OLD_ROADMAP.md
│       └── DIAGNOSTIC_TESTS.md
├── scripts/                   # Build and utility scripts
│   ├── build-extension.js
│   ├── build.sh
│   ├── reload-extension.bat
│   └── push.sh
├── src/                       # Source code (keep as-is)
├── tests/                     # Test files (keep)
├── public/                    # Public assets (keep)
├── Output/                    # Build output (gitignored)
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── manifest.json
├── package.json
├── package-lock.json
├── CLAUDE.md                  # AI assistant instructions (ROOT - high priority)
├── README.md                  # Project overview (ROOT - high priority)
└── CHANGELOG.md               # Version history (NEW - create this)
```

**Key Changes:**
- **Root has only 10 essential files** (down from 40+)
- **docs/ organized by audience** (developers, planners, users, archive)
- **scripts/ for build tools** (not cluttering root)
- **CLAUDE.md stays in root** (high priority for AI)
- **README.md stays in root** (GitHub landing page)

---

## 🗑️ Files to Move/Archive

### Move to docs/development/
- DEVELOPMENT_WORKFLOW.md
- FILE_STRUCTURE.md
- TESTING_GUIDE.md
- MANUAL_TEST_CHECKLIST.md
- POPUP_DEBUG_INSTRUCTIONS.md
- RELOAD_EXTENSION_INSTRUCTIONS.md
- STABLE_VERSION_GUIDE.md
- TEST_SUITE_ANALYSIS.md

### Move to docs/planning/
- PRODUCTION_ROADMAP.md
- SPRINT2_CLEANUP_SUMMARY.md
- SPRINT2_UI_STRATEGY.md
- SPRINT3_IMPLEMENTATION_STRATEGY.md
- SPRINT3_IMPLEMENTATION_STRATEGY_v2.md
- SPRINT3_PROGRESS.md
- projectmemory.md → PROJECT_MEMORY.md (rename)
- ROADMAP.md → OLD_ROADMAP.md (archive, superseded by PRODUCTION_ROADMAP)
- VERSION_CHECKPOINT_SUMMARY.md

### Move to docs/user/
- USER_GUIDE.md
- GETTING_STARTED.md
- TROUBLESHOOTING.md

### Move to docs/archive/
- DIAGNOSTIC_TEST.md
- INCIDENT_REPORT_OUTPUT_DIRECTORY.md
- OPTIMIZATION_REPORT.md
- AssisT Canvas Integration Research.md
- Product Requirements Document_ AssisT Adaptive EdTech Extension.md

### Move to scripts/
- build-extension.js
- build.sh
- push.sh
- FORCE_RELOAD_EXTENSION.bat → reload-extension.bat (rename)

### DELETE (temporary/redundant files)
- check-version.html (testing artifact)
- test-tts-toggle.html (old test file)
- test-tts-toggle-v2.html (old test file)
- LOAD_EXTENSION.txt (instructions now in docs)
- errorImages/ (if empty or unused)

---

## 📝 Token Optimization Strategies

### 1. Consolidate CLAUDE.md and projectmemory.md
**Current Problem:** Both files contain overlapping information
- CLAUDE.md: 6,371 bytes
- projectmemory.md: 26,595 bytes
- **Total:** 33KB loaded every session

**Solution:** Merge into single CLAUDE.md with:
- **Critical rules** (top section - always read)
- **Decision log** (reference section - read on demand)
- **Archived decisions** → Move to docs/planning/DECISION_LOG_ARCHIVE.md

**Token Savings:** ~30% reduction (keep only active decisions in CLAUDE.md)

### 2. Simplify File Structure Documentation
**Current:** FILE_STRUCTURE.md (10,791 bytes) explains src/ vs Output/
**Solution:**
- Keep short version in CLAUDE.md (critical rules only)
- Move detailed explanation to docs/development/

**Token Savings:** ~8KB removed from high-priority context

### 3. Create CHANGELOG.md (Semantic Versioning)
**Current:** Sprint summaries scattered across multiple files
**Solution:** Single CHANGELOG.md with:
```markdown
# Changelog

## [Sprint3-Complete-v1.0] - 2025-10-12
### Added
- Focus Mode with rounded corners
- Text Customization (WCAG 2.2)
- Reading Guide

### Changed
- Improved highlight opacity control

### Fixed
- Focus Mode rounded corners implementation
```

**Benefit:** Quick version history without loading large sprint docs

### 4. Compress Sprint Documentation
**Current:** 3 Sprint 3 documents totaling ~62KB
**Solution:**
- Keep only PRODUCTION_ROADMAP.md in high-priority context
- Move sprint docs to docs/planning/ (loaded only when referenced)

**Token Savings:** ~60KB removed from default context

### 5. Optimize src/ File Comments
**Current:** content-simple.js has verbose comments
**Solution:**
- Keep JSDoc for functions (needed for IntelliSense)
- Remove redundant inline comments
- Move implementation notes to docs/development/ARCHITECTURE.md

**Token Savings:** ~10-15% file size reduction without losing functionality

---

## 🎯 Execution Plan

### Phase 1: Directory Restructure (15 minutes)
1. Create new directory structure
2. Move files to appropriate locations
3. Update any hardcoded paths in scripts
4. Update .gitignore if needed

### Phase 2: CLAUDE.md Optimization (10 minutes)
1. Extract archived decisions to separate file
2. Keep only critical rules and active decisions
3. Add reference links to detailed docs

### Phase 3: Code Optimization (20 minutes)
1. Review content-simple.js for redundant comments
2. Extract large comment blocks to ARCHITECTURE.md
3. Ensure no functionality broken

### Phase 4: Create New Files (10 minutes)
1. CHANGELOG.md
2. docs/development/ARCHITECTURE.md
3. Update README.md with new structure

### Phase 5: Testing & Verification (10 minutes)
1. Run npm run build
2. Load extension in Chrome
3. Test all features still work
4. Verify no broken imports

### Phase 6: Commit & Document (5 minutes)
1. Git commit with detailed message
2. Tag as "Cleanup-Complete-v1.0"
3. Update PRODUCTION_ROADMAP.md with new paths

**Total Time:** ~70 minutes

---

## ✅ Success Criteria

1. **Root directory has ≤15 files**
2. **CLAUDE.md reduced to <8KB** (critical rules only)
3. **All features still work** (no broken functionality)
4. **Build process unchanged** (npm run build works)
5. **Documentation accessible** (clear navigation)
6. **Token efficiency improved by 40%+** (less context loaded per session)

---

## 📊 Before/After Metrics

### Before:
- Root files: 42
- CLAUDE.md + projectmemory.md: 33KB
- Total documentation: ~300KB
- Token usage per session: High (all docs in root)

### After (Target):
- Root files: 12
- CLAUDE.md: <8KB
- docs/ subdirectories: 4
- Token usage per session: 40% reduction (only essential docs loaded)

---

## 🚨 Risks & Mitigations

**Risk 1:** Breaking build process
- **Mitigation:** Test build after every file move

**Risk 2:** AI assistant can't find moved files
- **Mitigation:** Update CLAUDE.md with clear file paths

**Risk 3:** Losing important historical context
- **Mitigation:** Archive, don't delete; keep in docs/archive/

**Risk 4:** Merge conflicts if working on multiple branches
- **Mitigation:** Do cleanup on main branch after all features merged

---

## 🔄 Maintenance Plan (Ongoing)

**Monthly Review:**
- Check if new docs are cluttering root
- Archive old sprint documentation after 2 sprints
- Update CHANGELOG.md with each release

**Quarterly Review:**
- Consolidate archived docs (combine old sprint summaries)
- Review CLAUDE.md decision log (archive old decisions)
- Update ARCHITECTURE.md if major refactors done

**Annual Review:**
- Complete documentation audit
- Remove truly obsolete files
- Refresh user guides with latest screenshots

---

**Ready to Execute:** Yes
**Approval Required:** User confirmation
**Estimated Impact:** High (better developer experience, faster AI responses)
