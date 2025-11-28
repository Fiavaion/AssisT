# Annotation & Sticky Notes User Guide

This guide explains how to use AssisT's annotation and sticky notes features to take notes, highlight content, and organize your research.

---

## Overview

AssisT's annotation system includes:
- **Sticky Notes**: Draggable note windows pinned to specific pages
- **Inline Annotations**: Highlighted text with attached comments
- **Annotation Sidebar**: Central panel to view and manage all annotations
- **Tags & Organization**: Categorize and search your notes
- **TTS/STT Integration**: Read and dictate notes by voice
- **Citation Linking**: Connect notes to your citation projects

---

## Quick Start

### Create a Sticky Note

1. Click the AssisT extension icon
2. Click **Add Sticky Note** button
3. A yellow note appears on the page
4. Click inside to type your note
5. Drag the title bar to reposition

### Highlight Text with Annotation

1. Select text on the page
2. The highlight menu appears
3. Click the **Annotate** button (pencil icon)
4. Choose a highlight color
5. Add an optional comment
6. Click **Save**

### Open Annotation Sidebar

1. Click the AssisT extension icon
2. Click **Annotation Sidebar** button
3. Or use keyboard shortcut: **Ctrl+Shift+A**

---

## Sticky Notes

### Creating Notes

**From Popup**:
1. Click AssisT icon
2. Click **Add Sticky Note**
3. Note appears at center of viewport

**From Highlight Menu**:
1. Select text on page
2. Click Annotate button
3. Choose "Create Sticky Note"
4. Note is pre-filled with selected text

### Editing Notes

- **Click inside** the note to edit text
- Use **formatting toolbar**:
  - **B** = Bold
  - **I** = Italic
  - **U** = Underline
  - **List** = Bullet points

### Note Colors

Five color options available:
| Color | Use Case |
|-------|----------|
| Yellow | General notes (default) |
| Blue | Questions, things to review |
| Green | Important points, key facts |
| Pink | Warnings, things to remember |
| Purple | Personal thoughts, reflections |

To change color:
1. Click the **color circle** in note header
2. Select new color from palette

### Positioning & Resizing

**Moving Notes**:
- Click and drag the title bar
- Notes snap to viewport edges

**Resizing Notes**:
- Drag the resize handle (bottom-right corner)
- Or use keyboard: **+** to grow, **-** to shrink

**Minimizing**:
- Click the minimize button (-)
- Note collapses to title bar only
- Click again to expand

### Page Pinning

Notes are automatically pinned to the URL where they're created:
- Notes only appear on their creation page
- Navigate away and the note hides
- Return to the page and it reappears

To view all notes regardless of page:
1. Open Annotation Sidebar
2. Clear URL filter

---

## Inline Annotations

### Creating Annotations

1. Select text you want to annotate
2. Highlight menu appears automatically
3. Click **Annotate** (pencil icon)
4. Choose highlight color
5. (Optional) Add a comment
6. Click **Save**

### Annotation Colors

| Color | Suggested Use |
|-------|---------------|
| Yellow | Key concepts |
| Blue | Definitions |
| Green | Evidence/Facts |
| Pink | Questions |
| Purple | Your analysis |

### Viewing Annotations

**On Page**:
- Highlighted text shows your annotation
- Hover over highlight to see comment
- Click highlight to edit

**In Sidebar**:
- All annotations listed with context
- Click to jump to annotation location
- Full comment text visible

### Editing Annotations

1. Click on the highlighted text
2. Edit popup appears
3. Modify comment or color
4. Click **Update** or **Delete**

---

## Annotation Sidebar

### Opening the Sidebar

Three ways to open:
1. Click **Annotation Sidebar** in popup
2. Keyboard shortcut: **Ctrl+Shift+A**
3. From highlight menu: **View All**

### Sidebar Features

**Filter Options**:
| Filter | Description |
|--------|-------------|
| Page | Show only current page annotations |
| Tags | Filter by specific tags |
| Date | Sort by creation/update date |
| Color | Filter by annotation color |
| Type | Sticky notes vs highlights |

**Search**:
- Type in search box to find annotations
- Searches note content and comments
- Real-time filtering

**Sort Options**:
- Date Created (newest/oldest)
- Date Modified
- Page URL
- Color

### Managing from Sidebar

- **Click annotation**: Jump to location on page
- **Edit button**: Modify annotation
- **Delete button**: Remove annotation
- **Tag button**: Add/remove tags
- **Project button**: Link to citation project

---

## Tags & Organization

### Adding Tags

**To a single annotation**:
1. Open annotation for editing
2. Click **Add Tag** button
3. Type tag name (or select existing)
4. Press Enter to add

**Bulk tagging**:
1. Open Annotation Sidebar
2. Select multiple annotations (checkboxes)
3. Click **Bulk Actions** > **Add Tag**
4. Choose tag to apply

### Tag Suggestions

Common tags for academic use:
- `important` - Key information
- `review` - Needs review
- `question` - Has questions
- `quote` - Direct quotation
- `definition` - Term definition
- `chapter-1`, `chapter-2` - By section
- `midterm`, `final` - By exam

### Filtering by Tags

1. Open Annotation Sidebar
2. Click **Tags** filter
3. Select one or more tags
4. Only matching annotations shown

---

## TTS & STT Integration

### Read Notes Aloud

**Single Note**:
1. Open sticky note or annotation
2. Click **TTS** button (speaker icon)
3. Note content is read aloud

**All Notes on Page**:
1. Open Annotation Sidebar
2. Filter to current page
3. Click **Read All** button

### Dictate Notes

**Voice Dictation**:
1. Open sticky note
2. Click **STT** button (microphone icon)
3. Speak your note
4. Text appears as you speak

**Voice Commands for Notes**:
| Command | Action |
|---------|--------|
| "New note" | Create sticky note |
| "Save note" | Save current note |
| "Delete note" | Delete current note |
| "Bold that" | Format selected as bold |
| "New line" | Insert line break |

---

## Citation Linking (Task 5.15)

### Linking Annotations to Projects

Connect your annotations to citation projects for research organization:

1. Open annotation for editing
2. Click **Link to Project** button
3. Select project from dropdown
4. Click **Link**

### Viewing Linked Annotations

**From Citation Manager**:
1. Open Citation Manager (popup)
2. Select a project
3. Click **View Resources**
4. See both citations AND linked annotations

**From Annotation Sidebar**:
1. Open sidebar
2. Filter by **Project**
3. See all annotations for that research project

### Use Cases

- Link quotes to their source citations
- Organize reading notes by essay/paper
- Track evidence for arguments
- Build research paper structure

---

## Export & Backup

### Export Formats

| Format | Best For |
|--------|----------|
| Markdown | Note-taking apps (Obsidian, Notion) |
| Plain Text | Universal compatibility |
| JSON | Full backup with metadata |
| CSV | Spreadsheets, data analysis |

### How to Export

**Single Annotation**:
1. Open annotation
2. Click **Export** button
3. Choose format
4. File downloads automatically

**All Annotations**:
1. Open Annotation Sidebar
2. Click **Export All** button
3. Choose format
4. Optionally filter before export

### Import Annotations

1. Open Annotation Sidebar
2. Click **Import** button
3. Select JSON file
4. Annotations are restored

---

## Storage Options

### Local Storage (Default)

- Uses Chrome's local storage
- 5MB limit
- Fast and simple
- Cleared with browser data

### IndexedDB (Recommended)

- Uses Dexie.js for IndexedDB
- Unlimited storage
- Better for many annotations
- Persists longer

### Switching Storage Modes

1. Open AssisT popup
2. Go to **Settings** > **Annotations**
3. Select storage mode
4. Annotations auto-migrate

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+A | Open Annotation Sidebar |
| Ctrl+Shift+N | Create new sticky note |
| Esc | Close sidebar/modal |
| Tab | Navigate between elements |
| Enter | Save annotation |
| Delete | Delete selected annotation |

---

## Accessibility Features

### Screen Reader Support

- All annotations have ARIA labels
- Sidebar fully navigable
- Actions announced verbally

### Keyboard Navigation

- Tab through all controls
- Enter to activate buttons
- Arrow keys in dropdowns
- Escape to close modals

### Visual Accessibility

- High contrast mode compatible
- Configurable highlight colors
- Adjustable note sizes

---

## Tips for Effective Annotation

### For Reading Comprehension

1. **Color-code by purpose**: Use consistent colors
2. **Add questions**: Pink for "why?" and "how?"
3. **Summarize sections**: Green notes for key points
4. **Connect ideas**: Use tags to link related notes

### For Research Papers

1. **Tag by source**: One tag per source document
2. **Link to citations**: Connect notes to bibliography
3. **Export by project**: Get all notes for one paper
4. **Use quotes**: Store exact text with page numbers

### For Exam Prep

1. **Review tags**: Mark notes as "needs review"
2. **TTS for review**: Listen to notes while commuting
3. **Color by confidence**: Green=know, Yellow=review, Pink=study more
4. **Export study guide**: Export filtered notes as TXT

---

## Troubleshooting

### Notes Not Appearing

**Causes**:
- On different page than creation
- Hidden by page elements
- Storage full

**Solutions**:
1. Check URL filter in sidebar
2. Scroll page to find note
3. Clear old annotations or switch to IndexedDB

### Annotations Not Saving

**Causes**:
- Storage permissions
- Browser in private mode
- Extension needs reload

**Solutions**:
1. Check extension permissions
2. Exit private/incognito mode
3. Reload extension from chrome://extensions

### Highlight Menu Not Appearing

**Causes**:
- Selection too short
- Selection in input field
- Feature disabled

**Solutions**:
1. Select at least 3 characters
2. Select in main content area
3. Enable highlight menu in settings

---

## Related Guides

- [User Guide](USER_GUIDE.md) - General extension usage
- [OCR Usage Guide](OCR_USAGE_GUIDE.md) - Extract text from images
- [STT User Guide](STT_USER_GUIDE.md) - Voice dictation
- [Voice Commands Reference](VOICE_COMMANDS_REFERENCE.md) - All voice commands

---

**Last Updated**: 2025-11-28
**AssisT Version**: 0.2.0 (Phase 2 Complete)
