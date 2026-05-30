# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For download links and full release notes see the
[GitHub Releases](https://github.com/fiavaion/AssisT/releases) page.

---

## [Unreleased]

### Planned

- Whisper offline STT engine
- Azure Speech cloud STT adapter
- v1.0.0 stable release

---

## [0.9.3] - 2026-05-29

### Added

- **Citation Manager overhaul** — full rebuild of the citation feature:
  - `citation-types.js` keystone module with 12 source types and typed field
    definitions shared across all formatters.
  - Four citation styles: APA 7th, MLA 9th, Chicago 17th, Harvard — each in its
    own dedicated module with field-level formatting logic.
  - One-click save tray — floating panel for quick project assignment without
    opening the full manager.
  - AI citation analyser (`citation-ai-analyser.js`) — optional AI pass that
    evaluates source quality, relevance, and academic rigour.
  - Focus trap (`citation-focus-trap.js`) — WCAG 2.1 compliant keyboard
    containment for all citation modals.
  - Highwire `citation_*` meta-tag extraction in `metadata-extractor.js` with a
    non-empty title fallback chain.
  - 210 unit + E2E tests covering all formatters, storage, save tray, AI
    analyser, and UI interactions.
- **Cross-browser API abstraction** (`src/core/browser-api.js`) — thin wrapper
  around `webextension-polyfill` providing a unified `browser.*` API across
  Chrome, Firefox, and Safari Web Extensions. New code uses `browser.*`;
  existing `chrome.*` calls migrate progressively toward the Firefox port.
- **`@fiavaion/lms-adapter` package scaffold** (`packages/lms-adapter/`) —
  standalone package for LMS detection, course/assignment context extraction,
  and SPA navigation support (Canvas, Moodle, Google Classroom). Public API is
  stable; full extraction from `src/features/lms/` is an NLnet deliverable.
- **`@fiavaion/local-ai-router` package scaffold** (`packages/local-ai-router/`)
  — four-mode local AI routing library (Ollama → WebLLM → Chrome Prompt API →
  cloud fallback) extracted from AssisT's AI layer. Functional at this stage;
  WebLLM engine lifecycle extraction completes with v1.0.
- **Pluggable prompt registry** (`src/ai/prompts/registry.js`) — centralised
  store for feature prompts keyed by feature × discipline × user profile.
  Allows institutions to swap discipline-adapted prompts without touching
  feature code. NLnet deliverable; feature modules migrate progressively.
- **Firefox build target** — `BROWSER=firefox vite build` now produces a
  `.vite-firefox/` build using `manifest.firefox.json` (falls back to Chrome
  manifest while the Firefox port is in progress). Build-time flags
  `__BROWSER_TARGET__` and `__IS_FIREFOX__` let content scripts disable
  Chrome-only APIs gracefully on Firefox.
- `build:firefox` npm script and `cross-env` dependency for cross-platform env
  variable support in build commands.

### Fixed

- **Gemini AI model** — replaced retired `gemini-1.5-flash` (404) with
  `gemini-2.5-flash` as the default Gemini model. Fixed a 429 rate-limit retry
  loop where the retry guard never fired because the thrown error message
  contained quota text rather than the status code string.
- **Annotation highlight race condition** — the DOM `Range` was becoming invalid
  after `await storageAdapter.create()`, causing highlights to silently fail.
  The highlight span is now inserted synchronously before the storage write;
  the annotation record is then wired to the pre-inserted span on save.
- **Organize Mode drag & drop** — sections are now correctly identified with the
  `draggable: '.accordion-section'` SortableJS selector; drag handles were
  previously targeting the wrong ancestor.
- **Organize Mode visibility toggles** — accordion header `mousedown` handlers
  were calling `preventDefault()` and suppressing visibility-toggle clicks.
  The header handler now defers to control elements; cleanup restores the
  original handler on Organize Mode exit.
- **Double-fire on OrganizeMode controls** — removed duplicate `click` listener
  alongside `mousedown` that caused handlers to fire twice per button press.
- **STT Beta label removed** — Speech-to-Text has graduated from beta; the
  "Beta" badge has been removed from both the popup feature list and the main
  STT toggle.
- **Citation Manager marked Alpha** — feature is functional but the UI and
  style output will continue to evolve; labelled Alpha in the popup to set
  expectations.
- **DOMPurify name-clobber fix** — edit modal was silently dropping the
  citation title on save because DOMPurify's sanitised output clobbered the
  `name` property used to read the field value. Fixed by reading `textContent`
  after sanitisation.

### CI

- GitHub release publish now triggers an automatic Cloudflare Pages rebuild of
  the Fiavaion website via repository dispatch.
- `deploy.yml` corrected ZIP source directory from `Output/` to `.vite/` —
  fixes CWS automated deploy failure.
- `notify-website.yml` opts into Node 24 ahead of GitHub's June 2 forced
  Node 20 deprecation.

---

## [0.9.2] - 2026-05-23

### Added

- **Ollama model catalog** — curated list of 11 recommended models organised by
  category (General, Reasoning, Multilingual, Code, Vision) and hardware tier
  (4 GB / 8 GB RAM). The AI Setup Wizard surfaces compatible models based on
  detected system RAM.
- **"Remove all downloaded models" button** in the Browser AI (WebLLM) setup panel
  — clears cached model files from browser storage without leaving the extension.

### Changed

- Browser AI recommendation chip now includes an honest speed caveat:
  "Zero-config, runs in your browser — responses are slow (30–90s)".
- AI Setup Wizard Browser AI panel adds a visible performance note directing
  users who need faster local AI toward Ollama.

### Fixed

- `WEBLLM_CLEAR_CACHE` message handler wired in service-worker — cache-clear
  button now removes both IndexedDB model data and the `webllmCachedModels`
  storage key correctly.

---

## [0.9.1] - 2026-05-21

> First public release — launched on Global Accessibility Awareness Day (GAAD) 2026.
> Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/dkekfjomoacmhbkekjkngmpbdlljjfhi).
> Awarded the **Chrome Web Store Featured badge** by Google.

### Fixed

- WebLLM inference moved to an offscreen document — resolves WebGPU context
  restrictions that prevented model loading on the CWS-distributed build.
- Discovery Quiz results now write to the correct nested `assist_settings`
  storage paths (previously results were silently dropped).
- `localhost:11434` added to `host_permissions` — Ollama auto-detection was
  blocked on CWS-distributed builds that enforce strict host permission lists.

---

## [0.9.0] - 2026-05-15

> Final beta — pre-launch security hardening, accessibility audit, licence
> change, and quality pass before GAAD public release.
>
> Note: the project version jumped from 0.1.2 to 0.9.0 to signal "release
> candidate" status before the planned v1.0.0 stable release.

### Added

- **EUPL-1.2 licence** replacing MIT — legally clearer for European educational
  deployment and grant applications.
- **VPAT 2.5** voluntary product accessibility template published in the repo.
- Community health files: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- **All fonts bundled locally** (Lexend, OpenDyslexic, Atkinson Hyperlegible,
  Andika, Comic Neue) — eliminates Google Fonts network requests for full GDPR
  compliance.
- **Production minification** via Vite — bundle size reduced from 27 MB to 11 MB;
  source maps excluded from production builds.
- **Reading Scope selector** — choose Paragraph, Section, or Whole Page per TTS
  session without changing global settings.
- **Word Highlight Sync Mode** — Boundary (speech boundary events) or Timer
  (fixed cadence fallback) to match your voice engine.
- **Word Highlight Speed slider** — adjustable 0.5×–4× (default 2×).
- **Moodle Helper toggles** (TTS, Reading Aids, Citation Capture, Forum Support)
  — fully wired with JavaScript handlers in the popup.
- **Google Classroom Helper toggles** (TTS, Reading Aids, Citation Capture,
  Google Docs Integration) — fully wired.
- LMS Helper settings included in all 4 base user profiles by default.
- Reading Guide **White** colour option.
- **Shortcut `<kbd>` badges** injected next to popup labels (Alt on Windows,
  ⌥ on Mac); platform-aware.
- 997 unit tests passing across 28 test suites; Pa11y WCAG2AA clean.

### Changed

- Text Statistics feature defaults to OFF on first install; state persists
  across popup open/close sessions.
- Study Path Generator: **Copy** and **Read All** TTS buttons added.
- Multi-Document Compare: **Read All** TTS button added.
- Emotional TTS feature removed.
- STT engine dropdown label clarified: "Web Speech API (Browser Built-in)".
- Shortcut presets expanded from 6 to 14 keys across all 3 presets
  (Default, Minimal, One-Handed).

### Fixed

- **XSS** — custom vocabulary words rendered unsanitised in `popup.js` inner
  HTML; wrapped with `sanitizeText()`.
- **Regex injection** — annotation sidebar search query used HTML-escaped but
  not regex-escaped input; `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` added.
- `innerHTML +=` orphan node bug in `cognitiveStateMonitor.js` replaced with
  `insertAdjacentHTML`.
- `Alt+N` sticky note shortcut was unregistered; now wired correctly.
- `reloadShortcuts()` was a no-op — now correctly snapshots callbacks and
  re-registers.
- Shortcut changes now auto-reload without requiring extension restart.
- `applyShortcutPreset()` called an undefined function; fixed to use
  `loadShortcuts()` + merge + `saveShortcuts()`.
- "Read Entire Page" silently crashed with `ReferenceError` — resolved.
- SPA navigation: all global event listeners tracked and cleaned up on
  Canvas page navigation (MutationObserver + popstate); eliminates duplicate
  TTS playback after navigation.
- OCR, Translation, and Citation message handlers now race against a 25-second
  timeout — prevents silent UI hangs.
- WCAG AA contrast failures: STT offline badge (#059669 → #00875d); citation
  count badge (#f59e0b → #a76900).
- Hidden file input for profile import given `aria-label` for screen readers.
- Socratic Tutor overlay z-index was covering the panel — resolved.
- TTS watchdog now correctly cancels on pause — word highlight no longer
  freezes on pause.

### Security

- `DOMPurify` updated 3.3.1 → 3.4.2 (addresses a production XSS vector).
- 12 npm audit vulnerabilities resolved (`npm audit fix`).

---

## [0.1.2] - 2026-04-19

> CWS resubmission following Phase 2 AI overhaul and multi-provider expansion.

### Added

- **Browser AI (WebLLM)** — AI models run entirely in the browser via WebGPU;
  zero installation required. 8 models available (0.6 GB–6 GB).
- **Inline AI mode switcher** in popup — switch Off / Cloud / Browser AI /
  Local AI with one click, no wizard redirect needed.
- **AI Setup Wizard** — step-by-step guided setup for all AI modes with
  hardware detection and model recommendations.
- **Model registry** (`model-registry.js`) — centralised catalogue with
  per-task routing defaults.
- **Multi-provider cloud AI routing** — Anthropic (Claude), OpenAI (GPT),
  Google (Gemini), and Perplexity all supported from a single provider selector
  with dynamic model lists.
- **Persistent AI status bars** on all 8 AI feature panels — shows current
  mode, availability, and last result at a glance.
- **Shared AI routing client** (`ai-feature-client.js`) — single source of
  truth for mode detection, availability checking, and generation; eliminates
  per-feature `getCurrentModel()` inconsistencies.
- **Multi-Document Compare** — analyse and contrast multiple text sources
  side-by-side.
- **Google Docs Speech-to-Text** — microphone button now appears inside
  Google Docs' custom rich editor.
- **Text customisation sync** — push font/spacing settings to all open tabs
  simultaneously (opt-in toggle).
- **CI pipeline** — GitHub Actions with caching and redundant-run cancellation.
- Default Ollama model changed to `qwen3:8b-q4_K_M` for superior JSON
  compliance and instruction following.
- Z-index scale system (`src/utils/z-index.js`) prevents UI stacking conflicts
  with LMS page elements.

### Changed

- All 8 AI features migrated to shared routing client.
- Local AI model picker redesigned with live Ollama detection and dropdown.

### Fixed

- Knowledge graph local AI pipeline now works on first run without reload.
- **API key encryption** — keys now encrypted with AES-256-GCM in
  `secure-key-storage.js`; previously stored as plain text.
- STT microphone button positioning — was off-screen on some Canvas layouts.
- STT enabled on Google Classroom — fixed iframe injection and storage mismatch.
- Multi-document compare drag rewritten with Pointer Events API and
  `setPointerCapture` — eliminates listener leaks and unreliable drag.
- Text customisation sync storage race condition — now uses
  `chrome.tabs.sendMessage` instead of shared `chrome.storage.local`.
- Canvas white-text inheritance — added `color: #333` to AI panel roots so
  text is readable on dark-themed Canvas pages.
- SPA navigation pre-audit: all async handlers given explicit timeouts;
  z-index conflicts resolved across Canvas, Moodle, and Classroom.

---

## [0.1.1] - 2026-02-11

> Phase 2 — 11 new features built on the TTS/STT foundation; first CWS
> submission attempt.

### Added

- **Citation Management** — Harvard Style (Cite Them Right, 13th ed.)
  generator for websites, books, journals, videos, and social media. Includes
  bibliography manager, CRAAP test evaluation, and BibTeX/RIS/JSON/CSV export.
- **Online citation verification** via CrossRef and Semantic Scholar APIs.
- **Knowledge Graph** — interactive concept-connection visualisation from
  selected text.
- **Socratic Tutor** — guided learning through AI questions rather than direct
  answers.
- **Study Path Generator** — personalised learning sequences for any topic.
- **Assignment Breakdown** — decomposes assignment instructions into
  step-by-step checklists.
- **Text Simplification** — three complexity levels; trailing AI conversational
  artifacts stripped automatically.
- **Summarization** — brief, detailed, bullet points, or ELI5 modes.
- **Translation** — 35+ languages via MyMemory (default) and LibreTranslate
  (fallback); rate-limited.
- **Highlight Menu** — contextual toolbar on text selection with Read Aloud,
  Dictionary, Translate, AI Summarize, and more.
- **Text Statistics** — word count, characters, sentences, reading time
  (Ctrl+Shift+W).
- **Discovery Quiz** — recommends features based on learning style and needs.
- **User Profiles system** — save, load, export, and import accessibility
  configurations. 9 neurodivergent profiles (ADHD, Autism, Dyslexia, Anxiety,
  Motor, Low Vision, Cognitive Overload, Sensory, General Learning).
- **7 Speech-to-Text profiles** with customised timing, UI, and feedback.
- **Drag-and-drop section reordering** in popup (Organise Mode).
- **Keyboard shortcut presets** — Default, Minimal, One-Handed.
- **Feature maturity badges** (Alpha, Beta, Experimental) displayed in popup.
- Optional `<all_urls>` permission flow — single-click "Enable Everywhere" for
  non-LMS sites.
- DOMPurify XSS protection on all user-facing inputs.
- **Gemini Nano** (Chrome built-in AI via Prompt API) added as a fourth AI mode.
- Chrome Web Store compliance improvements.

### Removed

- **Stargardt Vision Mode** removed — 11 experimental files deleted (eye
  tracking, APVUI rendering, scotoma profiling, calibration wizard). Feature
  had low adoption and introduced significant maintenance overhead.
- NCAD branding references removed from codebase.

### Fixed

- Content script injection for non-LMS sites when `<all_urls>` granted.
- `web_accessible_resources` updated for Vite-bundled asset paths.
- Various keyboard shortcut layout conflicts.

### Security

- Optional permissions model — `<all_urls>` is user-granted on demand, not
  requested upfront.
- GDPR compliance section added to privacy policy.

---

## [0.1.0] - 2025-11-28

> Initial release — TTS/STT foundation with Canvas LMS integration.

### Added

- **Text-to-Speech** with synchronised word-by-word highlighting. Customisable
  rate (0.5×–2.0×), pitch, volume, and 8 highlight colours.
- **Speech-to-Text** using Web Speech API. 60+ voice commands for editing,
  formatting, and navigation. Smart auto-punctuation (Automatic / Assisted /
  Manual). Custom vocabulary with domain presets. Confidence feedback with
  colour-coded accuracy indicators.
- **Reading Mode** — distraction-free view powered by Mozilla Readability with
  full TTS integration (Alt+R).
- **Dyslexia-Optimised Reading Modes** — Bionic Reading, Syllable Colours,
  Grammar Colours (Alt+Y).
- **OCR & Screenshot Tool** — extract text from images and PDFs using
  Tesseract.js offline (100+ languages, Alt+O).
- **Focus Mode** — dims surrounding content, centres reading area (Alt+F).
- **Reading Guide** — horizontal cursor-tracking line (Alt+G).
- **Screen Colour Overlays** — 9 comfort filters (Alt+Shift+O).
- **Reading Progress Bar** — scroll position indicator (top or bottom).
- **Text Customisation** — 11 fonts including OpenDyslexic, Lexend, Atkinson
  Hyperlegible. Line height, letter, word, and paragraph spacing. WCAG 2.2
  SC 1.4.12 compliant.
- **Reduced Motion** — disables all animations; respects
  `prefers-reduced-motion` (WCAG 2.1 SC 2.3.3).
- **Custom Cursor & Magnifying Lens** — multiple cursor styles; floating
  1.5×–4× magnification window.
- **Dictionary Lookup** — inline definitions via Free Dictionary API
  (Alt+Shift+D).
- **Sticky Notes & Annotations** — per-URL floating notes in IndexedDB with
  tag/export/sidebar (Alt+N).
- **Pomodoro Timer** — configurable work/break intervals with ADHD-optimised
  defaults.
- **Media Control** — blocks autoplay video and audio.
- **Canvas LMS integration** — content script auto-injected on
  `*.instructure.com` / `*.canvas.com`; Canvas Quiz Helper with TTS and
  keyboard navigation.
- Moodle and Google Classroom host permission support.
- **14 customisable keyboard shortcuts** with Chrome-conflict detection.
- Manifest V3 architecture with Vite + `@crxjs/vite-plugin` build pipeline.
- Jest unit testing (979 tests) + Playwright E2E infrastructure.
- WCAG 2.2 AA compliance throughout.

---

## Historical Development Checkpoints

The following internal tags exist in the repository from the Sprint-based
pre-release development phase (October–November 2025). They are not
versioned releases but are preserved for history and rollback reference.

| Tag                                | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `Sprint2-Foundation-v1.0`          | Initial popup and TTS controller              |
| `Sprint3-Complete-v1.0`            | Focus Mode, Text Customisation, Reading Guide |
| `Sprint4-Canvas-Foundation-v1.0`   | Canvas LMS integration                        |
| `Sprint5-STT-Complete-v1.0`        | Speech-to-Text with Web Speech API            |
| `Sprint5.1-UI-Cleanup-v1.0`        | Post-STT UI polish                            |
| `Sprint6-ReadPage-Simple-v1.0`     | Read Entire Page feature                      |
| `Sprint7-Canvas-Profiles-Complete` | User Profiles system                          |
| `Sprint8-Testing-Complete`         | Playwright E2E infrastructure                 |
| `MVP-TTS-Stable-v1.0`              | Stable TTS milestone                          |
| `Cleanup-Complete-v1.0`            | Pre-Phase 2 cleanup                           |
| `v0.1.0-working-baseline`          | Webpack-era baseline                          |
| `v0.2.0-stable-before-canvas`      | Pre-Canvas integration checkpoint             |
| `v0.2.1-stable-before-design`      | Pre-UI overhaul checkpoint                    |

---

[Unreleased]: https://github.com/fiavaion/AssisT/compare/v0.9.2...HEAD
[0.9.2]: https://github.com/fiavaion/AssisT/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/fiavaion/AssisT/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/fiavaion/AssisT/compare/v0.1.2...v0.9.0
[0.1.2]: https://github.com/fiavaion/AssisT/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/fiavaion/AssisT/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fiavaion/AssisT/releases/tag/v0.1.0
