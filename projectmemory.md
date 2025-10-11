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

## Project Retrospective Summary
(To be filled out at the end of each major sprint or milestone to capture lessons learned about workflow and process critique)