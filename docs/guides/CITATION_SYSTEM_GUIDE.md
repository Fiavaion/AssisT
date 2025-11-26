# Citation & Research Management System Guide

## Overview

The AssisT Citation System provides comprehensive citation capture, management, and export capabilities designed for academic accessibility. Built with WCAG 2.2 AA compliance, it supports neurodivergent students in organizing their research effectively.

## Features

### 1. Citation Capture (Feature 11.1)

**File**: `src/features/citations/citation-integration.js`

Automatically extracts metadata from web pages including:

- **Title** - Page title from meta tags or `<title>` element
- **Authors** - From meta tags, JSON-LD, or Open Graph data
- **Publication Date** - From article:published_time or other date metadata
- **DOI** - Automatically detected and validated
- **URL** - Current page URL
- **Site Name** - From Open Graph or domain
- **Source Type** - Auto-detected (website, article, book, video, social-media, pdf)

#### Usage

```javascript
// From popup - sends message to content script
chrome.tabs.sendMessage(tabId, { type: 'SAVE_CITATION' });

// From content script directly
await window.assistFeatures.citation.saveCitationFromCurrentPage();
```

### 2. Citation Storage (Feature 11.1)

**File**: `src/features/citations/citation-storage.js`

Uses Dexie.js (IndexedDB wrapper) for persistent local storage with:

- Full-text search on title, authors, tags, notes
- URL-based duplicate detection
- Bulk operations (import/export)
- Tag and project associations

#### Schema

```javascript
{
  id: auto-increment,
  url: indexed,
  title: string,
  authors: array,
  publicationDate: string,
  savedAt: timestamp,
  tags: array,
  projectId: number,
  credibilityScore: number,
  craapEvaluation: object,
  notes: string
}
```

### 3. Bibliography Manager (Feature 11.2)

**File**: `src/features/citations/bibliography-manager.js`

Full-screen modal overlay for managing citations:

- **Search & Filter** - By title, author, tags, quality level
- **Sort Options** - Date, title, author, quality score
- **Citation Cards** - Show title, authors, date, credibility badge
- **Quick Actions** - Copy citation, open URL, edit, delete
- **Batch Operations** - Select multiple for export/delete

#### Keyboard Navigation (WCAG Compliant)

| Key             | Action                    |
| --------------- | ------------------------- |
| `Escape`        | Close modal               |
| `Tab`           | Navigate between elements |
| `Enter`         | Activate focused button   |
| `Arrow Up/Down` | Navigate citation list    |

### 4. Project Organization (Feature 11.3)

**File**: `src/features/citations/project-manager.js`

Kanban-style project management:

#### Columns

- **To Read** - Citations queued for reading
- **Reading** - Currently being reviewed
- **Cited** - Used in assignments

#### Features

- Create/edit/delete projects
- Drag-and-drop citations between columns
- Tag-based organization
- Citation count per project

### 5. Source Evaluation (Feature 11.4)

**File**: `src/features/citations/source-evaluator.js`

CRAAP Test implementation for credibility scoring:

#### Categories (Each 0-20 points)

| Category  | Description                      |
| --------- | -------------------------------- |
| Currency  | How recent is the information?   |
| Relevance | Does it relate to your topic?    |
| Authority | Who is the author/publisher?     |
| Accuracy  | Is the information supported?    |
| Purpose   | Why does this information exist? |

#### Automatic Indicators

- **DOI Present** - +10 points
- **Peer Reviewed** - +15 points (detected from domain)
- **Academic Domain** - Bonus based on .edu, .gov, .ac.uk
- **Source Type** - Books/journals weighted higher

#### Credibility Badges

| Score | Level  | Badge Color |
| ----- | ------ | ----------- |
| 75+   | High   | Green       |
| 50-74 | Medium | Yellow      |
| 0-49  | Low    | Red         |

### 6. Export & Integration (Feature 11.5)

**File**: `src/features/citations/citation-export.js`

#### Export Formats

| Format     | Use Case                      |
| ---------- | ----------------------------- |
| **JSON**   | Full backup with all metadata |
| **CSV**    | Spreadsheet analysis          |
| **BibTeX** | LaTeX documents               |
| **RIS**    | Zotero, EndNote, Mendeley     |

#### Import Support

- Parse RIS files from reference managers
- Parse BibTeX from academic sources
- Merge with existing library (duplicate detection)

#### Backup/Restore

```javascript
// Create backup
const backup = await createBackup();

// Restore from backup
await restoreFromBackup(backupData);
```

### 7. Citation UI (Feature 11.6)

**Files**:

- `src/popup/citation-manager-panel.js`
- `src/popup/popup.html` (citation section)

#### Popup Quick View Panel

- **View Tabs** - All / Projects / Recent
- **Display Modes** - List / Gallery
- **Search Bar** - Filter by title, author, tags
- **Citation Cards** - Compact preview with actions
- **Quick Actions** - Save Page, Open Library, Projects

#### Accessibility Features

- Full keyboard navigation
- High contrast mode support
- Reduced motion preferences
- Screen reader compatible (ARIA labels)

## API Reference

### Citation Integration (`window.assistFeatures.citation`)

```javascript
// Save citation from current page (with edit modal)
await saveCitationFromCurrentPage();

// Get citation count for URL
const count = await getCitationCountForCurrentPage();

// Check if page has citation
const exists = await hasCurrentPageCitation();

// Get citations for current URL
const citations = await getCitationsForCurrentPage();

// Get all citations
const all = await getAllCitations();

// Get all projects
const projects = await getAllProjects();

// Open bibliography manager modal
await openBibliographyManager();

// Open project manager modal
await openProjectManager();
```

### Message Types

```javascript
// From popup to content script
{
  type: 'SAVE_CITATION';
}
{
  type: 'GET_CITATIONS';
}
{
  type: 'OPEN_BIBLIOGRAPHY_MANAGER';
}
{
  type: 'OPEN_PROJECT_MANAGER';
}
```

### Citation Formatter

```javascript
import { formatInText, formatReference, formatBibliography } from './citation-formatter.js';

// In-text citation
formatInText(citation); // "Smith (2024)"

// Full reference
formatReference(citation); // "Smith, J. (2024). Title. Available at: URL (Accessed: date)."

// Bibliography list
formatBibliography(citations); // Sorted, formatted references
```

## Harvard Citation Format

All citations follow the Harvard (Cite Them Right) style:

### Website

```
Author, A. (Year). Title. Available at: URL (Accessed: Day Month Year).
```

### Book

```
Author, A. and Author, B. (Year). Title. Edition. Place: Publisher.
```

### Journal Article

```
Author, A. (Year). 'Article title', Journal Name, Volume(Issue), pp. xx-xx. doi: XXX.
```

### Video

```
Author (Year). Title [Video]. Platform. Available at: URL (Accessed: Day Month Year).
```

## WCAG 2.2 Compliance

### SC 1.4.12 - Text Spacing

- All text elements support user-defined spacing
- Modal content respects system font size

### SC 2.4.7 - Focus Visible

- All interactive elements have visible focus indicators
- Focus trapped within modals

### SC 4.1.2 - Name, Role, Value

- All buttons have accessible names
- ARIA roles properly assigned
- State changes announced to screen readers

## File Structure

```
src/features/citations/
├── citation-integration.js  # Main entry point
├── citation-storage.js      # Dexie.js storage layer
├── citation-ui.js           # Edit modal, toasts
├── citation-formatter.js    # Harvard formatting
├── metadata-extractor.js    # Page metadata extraction
├── crossref-api.js          # DOI enrichment
├── bibliography-manager.js  # Full citation library UI
├── project-manager.js       # Kanban project view
├── source-evaluator.js      # CRAAP test scoring
└── citation-export.js       # Import/export formats

src/popup/
├── citation-manager-panel.js # Quick view panel component
└── popup.html               # Citation section UI
```

## Testing

Tests located in `tests/unit/citations/`:

- `citation-model.test.js` - Data model validation
- `citation-formatter.test.js` - Harvard formatting

Run tests:

```bash
npm test -- --testPathPattern=citations
```

## Future Enhancements

1. **Cloud Sync** - Sync citations across devices
2. **Collaborative Collections** - Share bibliographies
3. **AI Summarization** - Auto-generate source summaries
4. **Citation Insertion** - Direct insert into documents
5. **Word/Google Docs Plugin** - Integration with word processors
