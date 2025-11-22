# Phase 2 Feature Expansion - Task Tracker

**Timeline**: 12-16 weeks (Weeks 2-16)
**Status**: In Progress
**Current Phase**: Phase 1 - High Priority Features
**Last Updated**: 2025-11-22

## Phase 1: High-Priority Core Features (Weeks 2-5)

### Feature 1: OCR + Screenshot Tool

**Status**: `[>]` In Progress (92% - Reading Mode Integration Complete, Settings/Tests Remain)
**Estimated**: 2-3 weeks
**Priority**: HIGH
**Dependencies**: None

**Tasks**:

- [x] 1.1: Set up Tesseract.js lazy loading
- [x] 1.2: Implement screenshot capture (full page)
- [x] 1.3: Implement screenshot region selection
- [x] 1.4: PDF detection and rendering (Chrome viewer, PDF.js, Canvas embedded, direct URLs)
- [x] 1.5: OCR engine integration with confidence threshold
- [x] 1.6: Text extraction modal UI (Media Player design with controls)
- [x] 1.7: TTS integration for extracted text (Full media player with play/pause/stop/speed/chunking)
- [x] 1.8: Copy to clipboard functionality
- [x] 1.9: Save as TXT file
- [x] 1.9a: Auto-activate Reading Mode before OCR capture (with toggle in settings)
- [x] 1.9b: Fix OCR TTS default voice to match extension settings (Google UK Female)
- [ ] 1.10: Settings panel (language, confidence, auto-TTS)
- [ ] 1.11: Unit tests for OCR functions
- [ ] 1.12: E2E test for screenshot workflow

### Feature 2: Highlight Menu

**Status**: `[>]` In Progress (85% - 11/13 tasks)
**Estimated**: 1 week
**Priority**: HIGH
**Dependencies**: Dictionary (4), Translation (6)

**Tasks**:

- [x] 2.1: Text selection detection (mouseup event)
- [x] 2.2: Floating toolbar positioning logic
- [x] 2.3: Toolbar UI with 6 action buttons
- [x] 2.4: TTS button integration
- [x] 2.5: Dictionary button (placeholder for Feature 4)
- [x] 2.6: Translate button (placeholder for Feature 6)
- [x] 2.7: Search button (Google search)
- [x] 2.8: Annotate button (placeholder for Feature 5)
- [x] 2.9: Copy button
- [x] 2.10: Keyboard navigation (Tab/Arrow keys)
- [x] 2.11: Auto-hide after 5 seconds
- [ ] 2.12: Settings (enable/disable buttons, timeout)
- [ ] 2.13: E2E test for menu workflow

### Feature 3: Reading Mode

**Status**: `[✓]` Complete (100% - 13/13 tasks, E2E test pending)
**Estimated**: 1 week
**Priority**: MEDIUM
**Dependencies**: None

**Tasks**:

- [x] 3.1: Integrate @mozilla/readability library
- [x] 3.2: Content extraction algorithm
- [x] 3.3: Full-page overlay rendering
- [x] 3.4: Clean typography (max-width 800px, centered)
- [x] 3.5: Background color options (cream default)
- [x] 3.6: TTS preservation in reading mode
- [x] 3.7: Dyslexia mode compatibility
- [x] 3.8: Toggle button in popup (Enter/Exit)
- [x] 3.9: Keyboard shortcut (Ctrl+Shift+R)
- [x] 3.10: ESC key to exit
- [x] 3.11: Font customization (OpenDyslexic font → Arial for OCR accuracy)
- [x] 3.12: Settings persistence
- [x] 3.13: OCR integration (auto-activation before screenshot)
- [ ] 3.14: E2E test on Canvas pages

### Feature 4: Dictionary Lookup

**Status**: `[>]` In Progress (85% - 11/13 tasks)
**Estimated**: 0.5 weeks
**Priority**: MEDIUM
**Dependencies**: Highlight Menu (2) ✓

**Tasks**:

- [x] 4.1: Free Dictionary API integration
- [x] 4.2: API request with error handling
- [x] 4.3: Modal popup UI design
- [x] 4.4: Display definitions grouped by part of speech
- [x] 4.5: IPA pronunciation display
- [x] 4.6: Audio playback (if available)
- [x] 4.7: Examples in context
- [x] 4.8: Synonyms as clickable links
- [x] 4.9: Double-click auto-lookup (optional)
- [x] 4.10: Keyboard shortcut (Ctrl+Shift+D)
- [x] 4.11: Cache last 100 lookups
- [ ] 4.12: Settings (auto-lookup, cache size)
- [ ] 4.13: Unit tests for API integration

---

## Phase 2: Writing & Organization Tools (Weeks 6-9)

### Feature 5: Annotations & Sticky Notes

**Status**: `[ ]` Pending
**Estimated**: 2-3 weeks
**Priority**: HIGH
**Dependencies**: None

**Tasks**:

- [ ] 5.1: Storage mode dropdown (local vs IndexedDB)
- [ ] 5.2: Dexie.js IndexedDB setup
- [ ] 5.3: Auto-migration between storage modes
- [ ] 5.4: Sticky note creation (draggable div)
- [ ] 5.5: contentEditable rich text
- [ ] 5.6: Color picker (5 colors)
- [ ] 5.7: Resize handles
- [ ] 5.8: Pin to URL functionality
- [ ] 5.9: Inline annotations (highlight + comment)
- [ ] 5.10: Annotation sidebar panel
- [ ] 5.11: Tags for organization
- [ ] 5.12: Search across all notes
- [ ] 5.13: Filter by page/tag/date/color
- [ ] 5.14: Export (Markdown, Plain Text, JSON, CSV)
- [ ] 5.15: Link annotations to citations (Feature 11)
- [ ] 5.16: Settings persistence
- [ ] 5.17: Unit tests for CRUD operations
- [ ] 5.18: E2E test for note creation

### Feature 6: Translation

**Status**: `[ ]` Pending
**Estimated**: 1-2 weeks
**Priority**: MEDIUM
**Dependencies**: Highlight Menu (2)

**Tasks**:

- [ ] 6.1: LibreTranslate API integration
- [ ] 6.2: API error handling (quota exceeded)
- [ ] 6.3: Settings dropdown (engine selection)
- [ ] 6.4: Google Translate API key input
- [ ] 6.5: Language selector UI (auto-detect + target)
- [ ] 6.6: Translation modal (original + translated)
- [ ] 6.7: TTS integration (read translated text)
- [ ] 6.8: Copy translation to clipboard
- [ ] 6.9: Full-page translation (in-place replacement)
- [ ] 6.10: Revert to original button
- [ ] 6.11: 30+ language support
- [ ] 6.12: Settings persistence
- [ ] 6.13: Unit tests with mocked API

### Feature 7: Text Statistics

**Status**: `[ ]` Pending
**Estimated**: 0.5 weeks
**Priority**: LOW
**Dependencies**: None

**Tasks**:

- [ ] 7.1: Word count algorithm
- [ ] 7.2: Character count (with/without spaces)
- [ ] 7.3: Sentence count
- [ ] 7.4: Paragraph count
- [ ] 7.5: Reading time estimate (200-250 WPM)
- [ ] 7.6: Unique words count
- [ ] 7.7: Average word length
- [ ] 7.8: Floating badge (toggle visibility)
- [ ] 7.9: Full stats modal on click
- [ ] 7.10: Stats for selected text / page / document
- [ ] 7.11: Target word count progress bar
- [ ] 7.12: Color coding (red/yellow/green)
- [ ] 7.13: Keyboard shortcut (Ctrl+Shift+W)
- [ ] 7.14: Auto-update on typing (debounced)
- [ ] 7.15: Unit tests for counting algorithms

---

## Phase 3: UX Enhancements (Weeks 10-11)

### Feature 9: Font Library Expansion

**Status**: `[ ]` Pending
**Estimated**: 0.5 weeks
**Priority**: LOW
**Dependencies**: None

**Tasks**:

- [ ] 9.1: Download Lexend font files
- [ ] 9.2: Download Atkinson Hyperlegible font files
- [ ] 9.3: Add Arial system font option
- [ ] 9.4: Add Verdana system font option
- [ ] 9.5: Bundle fonts in src/features/textCustomization/fonts/
- [ ] 9.6: Update manifest web_accessible_resources
- [ ] 9.7: CSS @font-face declarations
- [ ] 9.8: Update popup dropdown (6 total fonts)
- [ ] 9.9: E2E test for font switching

### Feature 10: Full Keyboard Shortcuts System

**Status**: `[ ]` Pending
**Estimated**: 1-2 weeks
**Priority**: MEDIUM
**Dependencies**: All previous features

**Tasks**:

- [ ] 10.1: Define 14 default shortcuts
- [ ] 10.2: Centralized keyboard event handler
- [ ] 10.3: Settings UI table (Feature | Shortcut | Edit)
- [ ] 10.4: Key combo recording on Edit click
- [ ] 10.5: Conflict detection (Chrome/OS shortcuts)
- [ ] 10.6: Conflict detection (duplicate assignments)
- [ ] 10.7: Validation (require modifier key)
- [ ] 10.8: Storage in chrome.storage.local
- [ ] 10.9: Reset to defaults button
- [ ] 10.10: Visual feedback on shortcut use
- [ ] 10.11: Unit tests for conflict detection
- [ ] 10.12: E2E test for shortcut customization

---

## Phase 4: Citation & Research Management (Weeks 12-16)

### Feature 11.1: Citation Capture & Metadata Extraction

**Status**: `[ ]` Pending
**Estimated**: 1 week
**Priority**: HIGH
**Dependencies**: None

**Tasks**:

- [ ] 11.1.1: open-graph-scraper integration
- [ ] 11.1.2: OpenGraph metadata extraction
- [ ] 11.1.3: Dublin Core extraction
- [ ] 11.1.4: JSON-LD extraction
- [ ] 11.1.5: COinS extraction
- [ ] 11.1.6: Manual entry form
- [ ] 11.1.7: PDF detection and metadata extraction
- [ ] 11.1.8: DOI regex detection
- [ ] 11.1.9: CrossRef API lookup
- [ ] 11.1.10: Browser action button "Save Citation"
- [ ] 11.1.11: Context menu integration
- [ ] 11.1.12: Citation edit modal
- [ ] 11.1.13: Success toast notification

### Feature 11.2: Citation Formatting (Cite Them Right)

**Status**: `[ ]` Pending
**Estimated**: 1 week
**Priority**: HIGH
**Dependencies**: 11.1

**Tasks**:

- [ ] 11.2.1: citeproc-js integration
- [ ] 11.2.2: Download harvard-cite-them-right-13th-edition.csl
- [ ] 11.2.3: Load CSL style files
- [ ] 11.2.4: Generate in-text citations
- [ ] 11.2.5: Generate bibliography entries
- [ ] 11.2.6: Edition selector (10th/11th/12th/13th)
- [ ] 11.2.7: NCAD requirements (and/comma/dates)
- [ ] 11.2.8: Verbal descriptions (tooltips)
- [ ] 11.2.9: Copy formatted citation
- [ ] 11.2.10: Bibliography generator
- [ ] 11.2.11: Alphabetical sorting
- [ ] 11.2.12: Export as Word/Google Docs/Plain Text/HTML

### Feature 11.3: Project Organization System

**Status**: `[ ]` Pending
**Estimated**: 2 weeks
**Priority**: MEDIUM
**Dependencies**: 11.1, 11.2

**Tasks**:

- [ ] 11.3.1: IndexedDB schema with Dexie
- [ ] 11.3.2: Project CRUD operations
- [ ] 11.3.3: Many-to-many citation-project relationships
- [ ] 11.3.4: Tags system
- [ ] 11.3.5: Color-coded tags
- [ ] 11.3.6: Gallery view with thumbnails
- [ ] 11.3.7: List view (table)
- [ ] 11.3.8: Kanban view (To Read/Reading/Cited)
- [ ] 11.3.9: Drag-and-drop between columns
- [ ] 11.3.10: Thumbnail generation (og:image)
- [ ] 11.3.11: Screenshot API fallback
- [ ] 11.3.12: Lazy loading for performance
- [ ] 11.3.13: Folders for grouping projects
- [ ] 11.3.14: Search across titles/authors/abstracts
- [ ] 11.3.15: Filters (article/book/website type)
- [ ] 11.3.16: Sort by date/author/title/year
- [ ] 11.3.17: Link annotations to citations

### Feature 11.4: Source Evaluation & Credibility

**Status**: `[ ]` Pending
**Estimated**: 1 week
**Priority**: MEDIUM
**Dependencies**: 11.1

**Tasks**:

- [ ] 11.4.1: CRAAP test integration (5 questions)
- [ ] 11.4.2: Credibility score calculation (0-100)
- [ ] 11.4.3: Visual badges (green/yellow/red)
- [ ] 11.4.4: DOI validation via CrossRef API
- [ ] 11.4.5: Retraction Watch database check
- [ ] 11.4.6: DOAJ verification (open access)
- [ ] 11.4.7: Predatory journal list check
- [ ] 11.4.8: Peer review status toggle
- [ ] 11.4.9: Filter bibliography by quality
- [ ] 11.4.10: Visual summary of source distribution
- [ ] 11.4.11: Suggest better sources (Semantic Scholar API)

### Feature 11.5: Citation Export & Integration

**Status**: `[ ]` Pending
**Estimated**: 1 week
**Priority**: MEDIUM
**Dependencies**: 11.1, 11.2, 11.3

**Tasks**:

- [ ] 11.5.1: Export bibliography (Word .docx)
- [ ] 11.5.2: Export Google Docs (formatted text)
- [ ] 11.5.3: Export Plain Text
- [ ] 11.5.4: Export HTML
- [ ] 11.5.5: Export PDF
- [ ] 11.5.6: Export library (JSON, CSV, BibTeX, RIS)
- [ ] 11.5.7: Import from Zotero (RIS)
- [ ] 11.5.8: Export to Zotero (RIS)
- [ ] 11.5.9: Google Docs toolbar integration
- [ ] 11.5.10: Insert citation at cursor
- [ ] 11.5.11: Canvas LMS editor integration
- [ ] 11.5.12: Floating citation button in text fields
- [ ] 11.5.13: Project ZIP export (bibliography + citations + annotations + thumbnails)
- [ ] 11.5.14: Backup & restore functionality

### Feature 11.6: Citation UI Design

**Status**: `[ ]` Pending
**Estimated**: 1 week
**Priority**: HIGH
**Dependencies**: All 11.x features

**Tasks**:

- [ ] 11.6.1: Citation Manager tab in popup
- [ ] 11.6.2: View switcher (All/Projects/Recent)
- [ ] 11.6.3: Gallery/List/Kanban toggle
- [ ] 11.6.4: Search bar + filters
- [ ] 11.6.5: Citation detail modal
- [ ] 11.6.6: Full metadata display
- [ ] 11.6.7: Thumbnail image
- [ ] 11.6.8: Formatted citation preview
- [ ] 11.6.9: Tags & projects assignment UI
- [ ] 11.6.10: Linked annotations display
- [ ] 11.6.11: Edit metadata button
- [ ] 11.6.12: Source evaluation badge
- [ ] 11.6.13: Export options dropdown
- [ ] 11.6.14: Project dashboard
- [ ] 11.6.15: Citation count + status breakdown
- [ ] 11.6.16: Progress tracker
- [ ] 11.6.17: Generate bibliography button
- [ ] 11.6.18: Export project button
- [ ] 11.6.19: Spell-check in metadata fields
- [ ] 11.6.20: TTS for abstracts
- [ ] 11.6.21: Bionic Reading in abstracts
- [ ] 11.6.22: Focus mode for citation entry
- [ ] 11.6.23: Full keyboard navigation
- [ ] 11.6.24: High contrast theme support

---

## Testing & Documentation

### Testing Tasks

**Status**: `[ ]` Pending
**Estimated**: 2 weeks (ongoing)

**Tasks**:

- [ ] T.1: Unit tests for all OCR functions
- [ ] T.2: Unit tests for all dictionary functions
- [ ] T.3: Unit tests for all translation functions
- [ ] T.4: Unit tests for all annotation CRUD
- [ ] T.5: Unit tests for all citation functions
- [ ] T.6: E2E test for OCR workflow
- [ ] T.7: E2E test for Highlight Menu
- [ ] T.8: E2E test for Reading Mode
- [ ] T.9: E2E test for annotations
- [ ] T.10: E2E test for citation capture
- [ ] T.11: Performance benchmarks (<300ms targets)
- [ ] T.12: WCAG 2.2 AA accessibility audit

### Documentation Tasks

**Status**: `[ ]` Pending
**Estimated**: 1 week

**Tasks**:

- [ ] D.1: Create CITATION_SYSTEM_GUIDE.md
- [ ] D.2: Create FEATURE_COMPARISON_HELPERBIRD.md
- [ ] D.3: Update TESTING_GUIDE.md with new features
- [ ] D.4: Create OCR_USAGE_GUIDE.md
- [ ] D.5: Create ANNOTATION_GUIDE.md
- [ ] D.6: Update README.md with Phase 2 completion
- [ ] D.7: Create KEYBOARD_SHORTCUTS_REFERENCE.md

---

## Progress Tracking

**Overall Progress**: 0% (0/24 features complete)

**Phase 1**: 0% (0/4 features)
**Phase 2**: 0% (0/3 features)
**Phase 3**: 0% (0/2 features)
**Phase 4**: 0% (0/6 features)

**Current Week**: Week 1 (Preparation Complete)
**Next Milestone**: Feature 1 (OCR + Screenshot) - Week 2-3

**Estimated Completion**: Week 16
**Actual Completion**: TBD

---

## Notes

- Features marked with `[ ]` are pending
- Features marked with `[>]` are in progress
- Features marked with `[x]` are complete
- Dependencies must be complete before starting dependent features
- All features follow the isolation pattern from DEC-202510-010
- Rollback point: `v0.1.0-pre-phase2` (commit f16053c)
