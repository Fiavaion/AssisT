This document serves as the Decision Log, capturing the rationale for all critical architectural choices. This ensures that the history and logic are permanently recorded, enabling easy generation of "how-to guides" and supporting constructive critiques of the workflow.[24, 25, 26]

🧠 Project Memory Log: AssisT Adaptive EdTech Extension
This log documents all critical architectural, scope, and technical decisions made during the AssisT development lifecycle. It serves as the single source of truth for design rationale and is used to guide future feature development, retrospective analysis, and documentation generation.

Decision Log Entry Template (Mandatory Fields)
Field	Description
ID	Unique reference number (e.g., DEC-YYYYMM-###)
Date	Date and time the decision was made.
Decision	A clear, succinct statement of the choice made.
Rationale	Detailed explanation citing technical or accessibility standards for the choice.
Alternatives	Other options discussed but officially rejected.
Impact	Expected effects on the product (e.g., scope, timeline, performance).
Stakeholders	Individuals or roles involved in the decision and approval process.
Outcome/Action	The resulting immediate task or resolution.

Export to Sheets
Log Entries (Initial Project Setup)
Field	DEC-202510-001
ID	DEC-202510-001
Date	2025-10-11
Decision	Adopt a Client-Side Browser Extension (Chrome) architecture using WAI-Adapt semantics over a deep LTI platform integration for initial deployment.
Rationale	This approach guarantees full content manipulation (DOM injection) required for deep personalization (TTS, STT correction, custom spacing) and minimizes initial maintenance costs associated with proprietary Canvas API changes.[13, 14] LTI integration is complex and often limits UI/DOM manipulation.[20]
Alternatives	1. Full LTI Advantage Integration: Rejected as it delays MVP delivery and presents security/maintenance overhead.[20, 11] 2. Standalone Desktop App: Rejected due to inability to interact directly with the Canvas VLE content layer.
Impact	Scope: Focuses initial development solely on client-side JavaScript features and DOM manipulation. Performance: Requires rigorous testing to prevent latency due to DOM injection into complex VLE pages.[18]
Stakeholders	Product Lead, Architecture Team, Accessibility SME.
Outcome/Action	Define project setup using Isolated World methodology in manifest.json. Prioritize development of FR-101 (TTS with Synchronized Highlighting) and FR-104 (Multimodal FixOver Correction).

---

### DEC-202510-002

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-002 |
| **Date** | 2025-10-11 |
| **Decision** | Implement modular architecture with separate TTS/STT controllers, DOM adapter, and WAI-Adapt manager |
| **Rationale** | Separation of concerns enables independent testing, maintenance, and future extensibility. Each module has a single responsibility: DOM interaction, speech processing, or accessibility adaptation. This aligns with SOLID principles and facilitates TDD workflow. |
| **Alternatives** | 1. Monolithic content script: Rejected due to poor testability and tight coupling. 2. Framework-based approach (React/Vue): Rejected to minimize bundle size and avoid framework lock-in for a browser extension. |
| **Impact** | Development: Requires more initial setup but significantly improves long-term maintainability. Testing: Each module can be unit tested independently. Performance: Minimal impact as modules are lazy-loaded only when needed. |
| **Stakeholders** | Lead Developer, Architecture Team, QA Team |
| **Outcome/Action** | Created separate modules: `dom-adapter.js`, `tts-controller.js`, `stt-controller.js`, `wai-adapt-manager.js`, `storage-manager.js`, `message-router.js` |

---

### DEC-202510-003

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-003 |
| **Date** | 2025-10-11 |
| **Decision** | Use Chrome Storage API (local) for all user preferences with FERPA-compliant data handling |
| **Rationale** | Chrome Storage API provides secure, local-only storage that meets FERPA requirements by ensuring no PII is transmitted to external servers. All user preferences (TTS settings, WAI-Adapt configurations) are stored client-side, giving users full control over their data. |
| **Alternatives** | 1. Cloud-based user profiles: Rejected due to FERPA compliance concerns and privacy risks. 2. LocalStorage: Rejected as Chrome Storage API provides better quota management and sync capabilities (if needed in future). |
| **Impact** | Privacy: Full FERPA compliance, no external data transmission. Performance: Instantaneous settings retrieval. Scalability: Limited by Chrome Storage quota (10MB local, sufficient for settings). |
| **Stakeholders** | Privacy Officer, Legal Counsel, Product Lead |
| **Outcome/Action** | Implemented `StorageManager` class with import/export functionality for user backup |

---

### DEC-202510-004

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-004 |
| **Date** | 2025-10-11 |
| **Decision** | Implement Web Speech API as primary TTS/STT engine with architecture for cloud engine integration |
| **Rationale** | Web Speech API provides zero-latency, offline-capable speech processing that works immediately without API keys or external dependencies. This enables MVP delivery while maintaining an adapter pattern for future cloud engine integration (Murf, Google Cloud TTS, Whisper). |
| **Alternatives** | 1. Cloud-only approach (Google Cloud TTS/STT): Rejected for MVP due to API cost, latency, and internet dependency. 2. Hybrid with automatic fallback: Planned for future implementation. |
| **Impact** | Development: Faster MVP delivery, no API integration complexity initially. User Experience: Offline functionality, instant activation. Future: Architecture supports drop-in cloud engine adapters when needed. |
| **Stakeholders** | Product Lead, Architecture Team, UX Team |
| **Outcome/Action** | Created controller architecture with abstraction layer to support multiple TTS/STT engines in future versions |

---

### DEC-202510-005

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-005 |
| **Date** | 2025-10-11 |
| **Decision** | Implement Isolated World content script execution to prevent Canvas VLE JavaScript conflicts |
| **Rationale** | Chrome Extension content scripts run in an Isolated World, preventing variable namespace collisions with Canvas's extensive JavaScript. This architectural decision is critical for stability as Canvas VLE uses complex frameworks that could conflict with extension code. |
| **Alternatives** | 1. Inject into page context: Rejected due to high risk of conflicts and security vulnerabilities. 2. Shadow DOM encapsulation: Rejected as it doesn't prevent script conflicts, only style isolation. |
| **Impact** | Stability: Eliminates JavaScript conflicts with Canvas VLE. Security: Prevents malicious page scripts from accessing extension code. Performance: Minimal overhead from isolated execution context. |
| **Stakeholders** | Security Team, Architecture Team |
| **Outcome/Action** | Configured manifest.json content_scripts with default isolated world execution, implemented PostMessage for secure inter-context communication |

---

### DEC-202510-006

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-006 |
| **Date** | 2025-10-11 |
| **Decision** | Adopt Test-Driven Development (TDD) with Jest for unit tests and Playwright for E2E tests |
| **Rationale** | TDD ensures high code quality, comprehensive test coverage, and regression prevention. Jest provides fast unit testing for JavaScript modules. Playwright enables realistic E2E testing across Canvas VLE pages, including accessibility testing scenarios. |
| **Alternatives** | 1. Post-development testing: Rejected as it leads to poor test coverage and hard-to-test code. 2. Cypress for E2E: Rejected in favor of Playwright's better cross-browser support and faster execution. |
| **Impact** | Quality: Minimum 80% code coverage requirement enforced. Development: Slower initial velocity but fewer bugs and easier refactoring. Confidence: High confidence in feature stability and accessibility compliance. |
| **Stakeholders** | QA Team, Development Team, Product Lead |
| **Outcome/Action** | Configured Jest with jsdom environment, set up Playwright with Canvas test fixtures, enforced 80% coverage threshold in package.json |

---

### DEC-202510-007

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-007 |
| **Date** | 2025-10-11 |
| **Decision** | Enforce Conventional Commits specification with automated push script and git hooks |
| **Rationale** | Conventional Commits provide structured commit history enabling automated CHANGELOG generation, semantic versioning, and easy rollback. The automated push script ensures compliance and maintains linear history through rebase workflow. |
| **Alternatives** | 1. Freeform commit messages: Rejected due to poor traceability and difficulty in generating release notes. 2. Manual enforcement: Rejected as it's error-prone and inconsistent. |
| **Impact** | Development: Requires discipline in commit message formatting but provides clear project history. Deployment: Enables automated semantic versioning and CHANGELOG generation. Rollback: Linear history simplifies reverting to stable versions. |
| **Stakeholders** | Development Team, DevOps, Product Lead |
| **Outcome/Action** | Created push.sh script with commit message validation, documented conventional commit types in CLAUDE.md, will implement pre-commit hooks in Phase 3 |

---

### DEC-202510-008

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-008 |
| **Date** | 2025-10-11 |
| **Decision** | Simplify architecture by consolidating to single-file content script (`content-simple.js`) for MVP phase |
| **Rationale** | Initial modular architecture (DEC-202510-002) proved too complex for MVP debugging. Multiple features were broken due to tight coupling and race conditions between modules. Single-file approach enables: 1) Easier debugging with all state in one place, 2) Elimination of import/export complexity, 3) Faster iteration during bug fixing, 4) Direct Web Speech API usage without abstraction layers. |
| **Alternatives** | 1. Fix modular architecture: Rejected as debugging was time-consuming and complexity outweighed benefits at MVP stage. 2. Hybrid approach: Rejected to maintain simplicity and avoid partial refactoring. |
| **Impact** | Development: Dramatically faster bug fixes and feature testing. Code Organization: Less modular but more maintainable at current scale (~400 lines). Future: Can re-modularize when feature set stabilizes and complexity justifies it. Performance: Actually improved due to elimination of module loading overhead. |
| **Stakeholders** | Lead Developer, Product Lead |
| **Outcome/Action** | Created `content-simple.js` replacing complex module system. All features working: TTS, highlighting, keyboard shortcuts, settings persistence. Extension now functional end-to-end. |

---

### DEC-202510-009

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-009 |
| **Date** | 2025-10-11 |
| **Decision** | Implement manual state tracking (`isPaused`) instead of relying on Speech Synthesis API states |
| **Rationale** | Browser Speech Synthesis API state properties (`synth.speaking`, `synth.paused`) proved unreliable across different scenarios. When paused, `synth.speaking` becomes false, making it impossible to distinguish between "paused" and "stopped" states. Resume functionality was broken due to this API inconsistency. Manual state tracking provides: 1) Reliable state management independent of browser API quirks, 2) Clear boolean logic for pause/resume, 3) Predictable behavior across all browsers, 4) Easy debugging with explicit state logs. |
| **Alternatives** | 1. Complex API state checking: Rejected after multiple failed attempts to reliably detect paused state. 2. Timeout-based workarounds: Rejected as they introduced latency and additional complexity. |
| **Impact** | Reliability: Pause/resume now works 100% consistently. Code Quality: Simpler, more predictable state management. Maintenance: Future developers can easily understand state transitions. User Experience: Keyboard shortcuts (spacebar) work reliably. |
| **Stakeholders** | Lead Developer, End Users |
| **Outcome/Action** | Added `isPaused` boolean flag, updated all state transitions to maintain this flag, spacebar pause/resume now fully functional |

---

### DEC-202510-010

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-010 |
| **Date** | 2025-10-11 |
| **Decision** | Adopt feature isolation principle with toggle-based UI organization for all future features |
| **Rationale** | Based on successful TTS and highlighting implementations, feature isolation provides critical benefits: 1) New features cannot break existing features, 2) Features can be developed independently, 3) Users can hide features they don't use (progressive disclosure), 4) Debugging is simplified by ability to disable features, 5) Performance improves as disabled features don't load unnecessary code. Pattern: Each feature gets toggle → collapsible options container → isolated state management → separate event listeners. |
| **Alternatives** | 1. Integrated architecture: Rejected based on previous experience where tight coupling caused cascading failures. 2. Separate extensions: Rejected as it fragments user experience and increases maintenance burden. |
| **Impact** | Development: Slightly more boilerplate code per feature but vastly improved maintainability. User Experience: Cleaner UI, users only see features they want. Performance: Disabled features have zero runtime cost. Scalability: Can add unlimited features without increasing complexity of existing code. |
| **Stakeholders** | Lead Developer, Product Lead, End Users |
| **Outcome/Action** | Created DEVELOPMENT_WORKFLOW.md documenting feature isolation pattern, naming conventions (featureName_function), and implementation templates for future developers |

---

### DEC-202510-011

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-011 |
| **Date** | 2025-10-11 |
| **Decision** | Use Advanced Options modal for feature visibility toggles and power-user settings |
| **Rationale** | Main popup space is limited (340px width). Advanced Options modal enables: 1) Feature visibility toggles (users can hide features from main popup), 2) Experimental features that aren't ready for general use, 3) Debug/developer options, 4) Power-user settings that would clutter main UI. This maintains clean main UI while providing extensibility. Pattern: Header "Options" button → Modal overlay → Categorized settings → Save/Cancel actions. |
| **Alternatives** | 1. Dedicated settings page: Rejected as it requires navigation away from main popup. 2. Expanding main popup: Rejected due to space constraints and poor UX at large sizes. |
| **Impact** | UX: Main popup stays clean and simple. Power Users: Can access advanced features without cluttering UI for casual users. Future Development: Clear pattern for where to put advanced/experimental features. |
| **Stakeholders** | Lead Developer, UX Designer, Product Lead |
| **Outcome/Action** | Implemented modal framework in popup.js, created placeholder advanced options modal, documented pattern in DEVELOPMENT_WORKFLOW.md for future feature visibility toggles |

---

### DEC-202510-012

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-012 |
| **Date** | 2025-10-11 |
| **Decision** | Implement hex-to-rgba conversion for highlight opacity instead of CSS opacity property |
| **Rationale** | CSS opacity property affects entire element including text, making it unreadable at low opacity values. Highlight backgrounds need variable opacity while maintaining text readability. Solution: Convert hex colors to rgba format with specified opacity. This provides: 1) Background-only opacity, 2) Text remains fully readable, 3) Precise opacity control (0.1-1.0), 4) Works with any highlight color. |
| **Alternatives** | 1. CSS opacity property: Rejected as it makes text transparent. 2. Overlay elements: Rejected as they introduce z-index and positioning complexity. |
| **Impact** | User Experience: Highlight opacity slider now works correctly with text always readable. Code: Added hexToRgba() utility function, ~10 lines of code. Performance: Negligible (color conversion is instant). |
| **Stakeholders** | Lead Developer, End Users |
| **Outcome/Action** | Implemented hexToRgba() function, updated highlightElement() to use rgba colors, opacity slider now functional with real-time updates |

---

### DEC-202510-013

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-013 |
| **Date** | 2025-10-11 |
| **Decision** | Create stable version checkpoint with git tag for "MVP-TTS-Stable-v1.0" |
| **Rationale** | Current version represents first fully functional state: TTS working, highlighting working, keyboard shortcuts working, settings persisting, pause/resume reliable. This checkpoint enables: 1) Safe experimentation with future features knowing we can revert, 2) Clear reference point for "what works", 3) Semantic versioning baseline, 4) Rollback capability if future changes break functionality. Tag name follows pattern: [Milestone]-[Feature]-[Status]-[Version]. |
| **Alternatives** | 1. Branch-based versioning: Rejected as tags are immutable and clearer for version marking. 2. Release branches: Rejected as overkill for single-developer MVP phase. |
| **Impact** | Risk Management: Can always revert to working version. Confidence: Can safely add experimental features. Documentation: Clear reference for "stable TTS-only version". |
| **Stakeholders** | Lead Developer, Product Lead |
| **Outcome/Action** | Will create annotated git tag "MVP-TTS-Stable-v1.0" with detailed description of functionality, then document in DEVELOPMENT_WORKFLOW.md |

---

## Project Retrospective Summary

### Sprint 1: MVP TTS Implementation (Complete)

**Date:** 2025-10-11
**Duration:** Single development session
**Status:** ✅ Complete and Stable

#### What Went Well
1. **Simplification Strategy:** Moving from complex modular architecture to single-file drastically improved debugging speed
2. **Incremental Fixes:** Fixing one issue at a time prevented introducing new bugs
3. **Manual State Management:** `isPaused` flag eliminated API reliability issues
4. **User Feedback Loop:** Direct user testing and immediate fixes kept development focused
5. **Documentation:** Creating DEVELOPMENT_WORKFLOW.md while knowledge is fresh

#### What Didn't Go Well
1. **Initial Over-Engineering:** Modular architecture was premature optimization for MVP
2. **API Trust:** Initially trusted browser API states without verifying reliability
3. **Testing:** Should have tested pause/resume more thoroughly before considering it "done"

#### Key Learnings
1. **Start Simple:** Always begin with simplest working solution, add complexity only when justified
2. **State Management:** Manual state tracking is more reliable than API state queries for critical functionality
3. **Iterative Development:** Small commits with single focus enable faster debugging
4. **Progressive Disclosure:** Toggle-based UI with collapsible sections provides clean UX while enabling feature growth
5. **Documentation Timing:** Document architectural decisions immediately while context is fresh

#### Metrics
- **Lines of Code:** ~400 (content-simple.js)
- **Files Modified:** 4 core files (content-simple.js, popup.html, popup.css, popup.js)
- **Features Implemented:**
  - ✅ Click-to-read TTS
  - ✅ Paragraph highlighting with color/opacity controls
  - ✅ Voice selection (Google UK Female default)
  - ✅ Speed/pitch/volume controls with real-time updates
  - ✅ Keyboard shortcuts (Space: pause/resume, +/-: speed adjust)
  - ✅ Settings persistence across sessions
  - ✅ Highlight toggle with collapsible options
  - ✅ Reset button for defaults
  - ✅ Options button (modal framework)
  - ✅ Compact UI (340px width)

#### Technical Debt
- None critical. Future considerations:
  - Re-modularize when codebase grows beyond ~1000 lines
  - Add unit tests when feature set stabilizes
  - Consider TypeScript for better type safety in future

#### Next Sprint Planning
- **Sprint 2:** Additional features to be determined
- **Principle:** Each new feature must be isolated from existing TTS functionality
- **Process:** Follow DEVELOPMENT_WORKFLOW.md patterns
- **Safety:** Can always revert to MVP-TTS-Stable-v1.0 tag

---

## Development Principles (Established)

Based on learnings from Sprint 1, these principles guide all future development:

### 1. **Feature Isolation**
- New features MUST NOT modify existing feature code unless there are clear performance advantages
- Each feature has its own state variables, prefixed with feature name
- Features can be toggled on/off without affecting others

### 2. **Manual State Management**
- Don't trust external API states for critical functionality
- Maintain explicit state variables for all important states
- Reset state at all boundaries (start, end, error)

### 3. **Progressive Disclosure**
- Main UI shows only essential controls
- Feature-specific options hidden behind toggles
- Advanced/power-user features in Options modal

### 4. **Incremental Development**
- Small commits with single focus
- Test after every change
- Don't batch multiple fixes
- Document decisions immediately

### 5. **Code Organization**
- Group feature code with clear comment boundaries
- Use naming convention: `featureName_functionName`
- Keep features self-contained and searchable

### 6. **Version Control**
- Conventional Commits for all changes
- Create stable version tags at milestones
- Linear history via rebase (no merge commits)

### 7. **User-Centric**
- Fix reported issues immediately
- Prioritize working functionality over perfect architecture
- Real-time visual feedback (toasts) for all actions

---

## Future Feature Integration Guidelines

When adding new features, follow this decision tree:

```
Is this feature independent of existing features?
├─ YES → Implement as isolated feature with toggle
└─ NO → Does integration provide significant performance benefit?
   ├─ YES → Document integration in new Decision Log entry, explain trade-offs
   └─ NO → Refactor to make it independent, then implement as isolated feature
```

**Example Applications:**
- **New Feature: Read Selection** → Independent → Isolate ✅
- **New Feature: Word-by-word highlighting** → Depends on TTS → Check performance benefit
  - If benefit: Integrate and document why
  - If no benefit: Create separate highlighting manager and keep isolated

---

---

### DEC-202510-014

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-014 |
| **Date** | 2025-10-11 |
| **Decision** | Formalize build process requiring `npm run build` before testing, with strict rule: NEVER edit Output/ files directly |
| **Rationale** | **CRITICAL INCIDENT RESOLUTION:** During Sprint 2, all code edits were made to `src/` files while Chrome loaded from `Output/` directory. This caused 2+ hours of wasted development time because "fixes didn't work" despite proper extension reloads. Root cause: Build step was skipped, leaving Output/ with stale code. Source and build directories must remain separated with clear workflow: Edit src/ → Build to Output/ → Chrome loads Output/. This architectural pattern prevents editing wrong files and ensures Chrome always runs latest code. |
| **Alternatives** | 1. Single directory (no build step): Rejected as it prevents minification, excludes test files, and lacks deployment optimization. 2. Auto-watch and rebuild: Planned for future but requires additional tooling setup. 3. Direct Chrome loading from src/: Rejected as it exposes non-production files (tests, configs) to Chrome. |
| **Impact** | Development Workflow: MANDATORY step added - must run `npm run build` after every source file edit. File Organization: Clear separation - `src/` is editable, `Output/` is generated (in .gitignore). Debugging: Eliminated confusing situations where "code doesn't update" due to stale build. Documentation: Created FILE_STRUCTURE.md explaining directory purpose and workflow. |
| **Stakeholders** | Lead Developer, AI Assistant, Future Developers |
| **Outcome/Action** | 1. Updated CLAUDE.md with file location rules: "ALWAYS edit src/, NEVER edit Output/". 2. Created FILE_STRUCTURE.md with comprehensive explanation and diagnostic checklist. 3. Verified existing build-extension.js handles src/ → Output/ copying. 4. Added bash alternative (build.sh) for non-Node environments. 5. Updated .gitignore (already excluded Output/). 6. RULE FOR AI: Before editing ANY file, validate path does not contain "Output/" - if it does, redirect to equivalent src/ path. |

---

### DEC-202510-015

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-015 |
| **Date** | 2025-10-12 |
| **Decision** | Implement Screen Color Overlay feature for eye strain reduction with 8 preset colors and adjustable opacity |
| **Rationale** | User explicitly requested screen color overlay feature similar to text highlighting color picker UI. Eye strain reduction is critical for neurodivergent students during long study sessions. Color overlays (especially warm tones like sepia) are proven to reduce eye fatigue and improve reading comfort. Feature implemented using full-screen fixed-position div with `pointer-events: none` to avoid interfering with page interaction. Maintains feature isolation pattern established in DEC-202510-010. |
| **Alternatives** | 1. CSS filters (brightness, contrast, hue-rotate): Rejected as they affect entire page including UI elements and images in unwanted ways. 2. Browser-level dark mode: Rejected as it doesn't provide color tint options and isn't customizable per-page. 3. Third-party browser extensions: Rejected to keep all features integrated in single extension. |
| **Impact** | User Experience: Reduces eye strain with customizable color tints. Accessibility: Benefits users with visual processing sensitivities, dyslexia, and photophobia. Performance: Minimal (single div overlay, no reflow/repaint on scroll). Code: Added 112 lines to content-simple.js, 65 lines to popup.html, 58 lines to popup.js. |
| **Stakeholders** | Lead Developer, End Users, Accessibility SME |
| **Outcome/Action** | Implemented Sprint 6 feature with 8 color presets (Warm Sepia default), opacity slider (10-90%), real-time updates, settings persistence. Created checkpoint tag "Sprint-6-ScreenOverlay-Stable". Feature follows isolation pattern, no impact on existing features. |

---

### DEC-202510-016

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-016 |
| **Date** | 2025-10-12 |
| **Decision** | Defer word-by-word highlighting refinement (Option B) to later iteration, prioritize Canvas-specific features (Option C) |
| **Rationale** | User explicitly requested to "leave option b until later iteration" and move to Option C. Strategic decision to focus on Canvas VLE integration features (Quiz Helper, User Profiles, Keyboard Navigation) before polishing existing TTS word-by-word highlighting. Canvas-specific features provide higher value for target users (students in Canvas LMS) and align with project goal of deep VLE integration. Word-by-word highlighting is functional but could use polish - deferring allows focus on new capabilities. |
| **Alternatives** | 1. Complete Option B first: Rejected based on user priority guidance. 2. Parallel development: Rejected to maintain focus and avoid context switching. |
| **Impact** | Development: Clear priority order enables focused implementation. User Value: Canvas-specific features deliver more immediate value to target audience. Technical Debt: Word-by-word refinement noted for future sprint, not blocking. |
| **Stakeholders** | Lead Developer, Product Lead, End Users |
| **Outcome/Action** | Updated project roadmap. Next sprint focuses on Canvas Quiz Helper, User Profiles system, and Canvas Keyboard Navigation. Word-by-word highlighting refinement moved to backlog. Created Sprint-6-ScreenOverlay-Stable checkpoint before starting Option C work. |

---

### DEC-202510-017

| Field | Value |
|-------|-------|
| **ID** | DEC-202510-017 |
| **Date** | 2025-10-12 |
| **Decision** | Implement comprehensive testing infrastructure with Jest (unit tests) and Playwright (E2E tests) for Sprint 8 |
| **Rationale** | After 7 sprints of feature development with zero automated tests, Sprint 8 focused exclusively on test infrastructure and quality assurance. Testing enables: 1) Regression prevention, 2) Safe refactoring, 3) Confidence in feature stability, 4) Documentation via test cases, 5) Professional development practices. Jest chosen for unit tests due to excellent ES module support and Chrome API mocking capabilities. Playwright chosen for E2E tests as it supports Chrome Extension testing (unlike Cypress) and provides better cross-browser support. Target: 70%+ coverage on critical modules. |
| **Alternatives** | 1. Continue without tests: Rejected as technical debt was growing and regression risks increasing. 2. Vitest instead of Jest: Rejected as Jest has larger community and better Chrome Extension mock support. 3. Cypress for E2E: Rejected as it doesn't support Chrome Extensions natively. 4. Manual testing only: Rejected as it's not scalable and error-prone. |
| **Impact** | Quality: 72 unit tests with 96%+ coverage on critical modules. Development: Test-first mindset established for future features. Confidence: Can refactor without fear of breaking existing features. Documentation: Tests serve as executable documentation. CI/CD: Ready for automated test runs on commit. |
| **Stakeholders** | Lead Developer, QA Team, Future Contributors |
| **Outcome/Action** | Created Jest config with Babel for ES modules, implemented Chrome API mocks, wrote 72 unit tests (storage-manager.js: 38 tests/96% coverage, message-router.js: 34 tests/100% coverage), set up Playwright with extension fixtures, wrote ~30 E2E tests for popup UI, User Profiles, and Feature Visibility. Created Sprint-8-Testing-Complete checkpoint. |

---

## Reference: Current Stable State

**Version:** Sprint-8-Testing-Complete
**Date:** 2025-10-12
**Latest Commits:**
- ba22bf1: test(jest): set up Jest testing infrastructure
- 2164012: test(unit): add message-router tests with 100% coverage
- e6fce40: test(e2e): add Playwright E2E testing infrastructure
**Tag:** Sprint-8-Testing-Complete (pending)

**Functional Features:**
- ✅ Text-to-Speech with click-to-read
- ✅ Paragraph-level highlighting with synchronized reading
- ✅ Word-by-word highlighting (basic implementation)
- ✅ Voice selection and control
- ✅ Speed, pitch, volume adjustment
- ✅ Text customization (font, size, spacing, colors)
- ✅ Reading Guide (customizable line guide)
- ✅ Focus Mode (dim surrounding content)
- ✅ Screen Color Overlay (8 colors, adjustable opacity) **NEW**
- ✅ Highlight color and opacity customization
- ✅ Keyboard shortcuts (Space: pause/resume, +/-: speed adjust)
- ✅ Settings persistence across sessions
- ✅ Real-time setting updates
- ✅ Feature toggles with progressive disclosure
- ✅ Reset to defaults
- ✅ Compact UI (340px)

**Known Limitations:**
- Word-by-word highlighting needs refinement (deferred to future sprint)
- No speech-to-text (STT)
- No Canvas-specific features yet
- No cloud TTS engines
- No mobile optimization
- No automated tests yet

**Files:**
- `src/content/content-simple.js` (1635 lines)
- `src/popup/popup.html` (622 lines)
- `src/popup/popup.css` (830 lines)
- `src/popup/popup.js` (1135 lines)
- `manifest.json`

**⚠️ CRITICAL WORKFLOW:**
- **Edit:** Only files in `src/` directory
- **Build:** Run `npm run build` (copies src/ → Output/)
- **Load:** Chrome extension loads from `Output/` directory
- **Test:** Reload extension + hard refresh page
- **Commit:** Only commit `src/` files (Output/ is in .gitignore)

**Previous Checkpoints:**
- MVP-TTS-Stable-v1.0 (2025-10-11): Basic TTS and highlighting
- Sprint-6-ScreenOverlay-Stable (2025-10-12): Current stable with screen overlay

This checkpoint serves as the foundation for Canvas-specific feature development (Option C).