# OCR & Screenshot Tool User Guide

This guide explains how to use AssisT's OCR (Optical Character Recognition) and Screenshot tools to extract text from images, PDFs, and any screen content.

---

## Overview

The OCR tool allows you to:
- Capture screenshots of any content
- Extract text from images and scanned documents
- Read extracted text aloud with TTS
- Copy or save extracted text
- Work with PDFs that don't allow text selection

---

## Quick Start

### Capture a Screenshot

1. Click the AssisT extension icon
2. Navigate to the **OCR** section
3. Click **Capture Screenshot**
4. Choose capture mode:
   - **Full Page**: Captures the entire visible page
   - **Region Select**: Draw a rectangle around specific content

### Extract Text

1. After capture, the OCR modal appears
2. Text is automatically extracted using Tesseract.js
3. Review the extracted text in the preview area
4. Confidence score shows extraction quality

### Use Extracted Text

- **Read Aloud**: Click the play button to hear the text via TTS
- **Copy**: Click Copy to copy text to clipboard
- **Save**: Click Save as TXT to download the text

---

## Capture Modes

### Full Page Capture

Best for:
- Articles and web pages
- Documents displayed in browser
- Canvas course materials

How to use:
1. Navigate to the page you want to capture
2. Click **Capture Screenshot** > **Full Page**
3. Wait for the capture to complete

### Region Selection

Best for:
- Specific sections of a page
- Images with text
- Diagrams with labels
- Partial document capture

How to use:
1. Click **Capture Screenshot** > **Select Region**
2. Click and drag to draw a rectangle
3. Release to capture the selected area
4. Adjust selection if needed before confirming

---

## PDF Text Extraction

AssisT handles multiple PDF scenarios:

### Chrome PDF Viewer
When viewing a PDF in Chrome's built-in viewer:
1. The extension detects the PDF automatically
2. Click **Extract PDF Text**
3. Text is extracted page by page

### Embedded Canvas PDFs
For PDFs embedded in Canvas assignments:
1. Use **Region Select** to capture the PDF area
2. OCR will extract visible text

### PDF.js Viewer
For academic PDFs using PDF.js:
1. Automatic detection and native text extraction
2. Falls back to OCR if native extraction fails

---

## OCR Settings

### Language Selection

AssisT supports multiple languages for OCR:

| Language | Code | Best For |
|----------|------|----------|
| English | eng | Default for most content |
| Spanish | spa | Spanish documents |
| French | fra | French documents |
| German | deu | German documents |
| Italian | ita | Italian documents |

To change language:
1. Open AssisT popup
2. Go to **Settings** > **OCR**
3. Select **OCR Language** from dropdown

### Confidence Threshold

The confidence threshold filters low-quality extractions:

- **High (90%)**: Only very clear text accepted
- **Medium (75%)**: Balanced (recommended)
- **Low (60%)**: Accepts most text, may include errors

### Image Upscaling

Upscaling improves OCR accuracy for small text:

| Level | Scale | Use Case |
|-------|-------|----------|
| Low | 1.0x | Large, clear text |
| Medium | 1.5x | Normal documents (default) |
| High | 2.0x | Small text, low-resolution images |

Note: Higher upscaling increases processing time.

### Auto-Activation Reading Mode

When enabled:
- Reading Mode activates automatically before capture
- Removes ads, navigation, and clutter
- Improves OCR accuracy for article content

To enable:
1. Go to **Settings** > **OCR**
2. Toggle **Auto-activate Reading Mode** ON

---

## TTS Integration

### Media Player Controls

The OCR modal includes a full media player:

| Button | Function |
|--------|----------|
| Play/Pause | Start or pause reading |
| Stop | Stop reading and reset |
| Speed | Adjust reading speed (0.5x-2.0x) |
| Skip Back | Go back to previous sentence |
| Skip Forward | Skip to next sentence |

### Voice Settings

TTS uses your extension voice settings:
- Voice selection from popup
- Speed, pitch, and volume settings
- Word highlighting (if enabled)

### Chunked Reading

Long documents are split into manageable chunks:
- Each chunk is ~500 words
- Navigation controls move between chunks
- Progress indicator shows position

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+O | Open OCR capture |
| Esc | Close OCR modal |
| Space | Play/Pause TTS (in modal) |
| Ctrl+C | Copy extracted text |
| Ctrl+S | Save as TXT file |

---

## Best Practices

### For Best OCR Results

1. **Ensure good contrast**: Black text on white background works best
2. **Avoid skewed images**: Straighten content before capture
3. **Use appropriate upscaling**: Small text needs higher upscaling
4. **Clean backgrounds**: Simple backgrounds improve accuracy

### For PDFs

1. **Try native extraction first**: Many PDFs have selectable text
2. **Use high upscale for scans**: Scanned PDFs need 2.0x upscaling
3. **Capture one page at a time**: For multi-page accuracy

### For Canvas Content

1. **Activate Reading Mode**: Removes Canvas navigation clutter
2. **Full Page for articles**: Use full page capture for text-heavy content
3. **Region for specific content**: Use region select for embedded images

---

## Common Issues & Solutions

### "OCR returned no text"

**Causes**:
- Image quality too low
- Non-standard font
- Handwritten text
- Wrong language setting

**Solutions**:
1. Increase upscale factor to 2.0x
2. Check language setting matches content
3. Ensure content is printed (not handwritten)
4. Try region select for cleaner capture

### "Low confidence score"

**Causes**:
- Blurry image
- Complex background
- Small text size

**Solutions**:
1. Zoom in on the page before capture
2. Use region select to isolate text
3. Lower confidence threshold temporarily
4. Increase upscale factor

### "TTS not reading extracted text"

**Causes**:
- TTS not enabled
- No text extracted
- Audio permissions

**Solutions**:
1. Enable TTS in main popup toggle
2. Verify text appears in preview
3. Check browser audio permissions

### "PDF text extraction failed"

**Causes**:
- Scanned PDF (image-based)
- Protected PDF
- Corrupted file

**Solutions**:
1. Use OCR capture instead of native extraction
2. Download PDF and open in Chrome
3. Try different PDF viewer

---

## Accessibility Features

### Screen Reader Support

- OCR modal has proper ARIA labels
- Extracted text announced on completion
- Media controls keyboard accessible

### Visual Accessibility

- High contrast modal design
- Configurable text size in preview
- Dark mode compatible

### Cognitive Support

- Simple, step-by-step workflow
- Visual feedback for all actions
- Progress indicators for long operations

---

## Technical Details

### OCR Engine

AssisT uses **Tesseract.js v5**, the JavaScript port of Google's Tesseract OCR engine:
- Runs entirely in browser (no server upload)
- FERPA compliant (no data leaves device)
- Supports 100+ languages
- Active development and improvements

### Performance

| Operation | Typical Time |
|-----------|-------------|
| Full page capture | <1 second |
| Region capture | <0.5 seconds |
| OCR processing | 2-5 seconds |
| PDF extraction | 1-3 seconds/page |

### Storage

- Extracted text stored temporarily
- No automatic cloud backup
- Export to save permanently

---

## Examples

### Example 1: Extract Text from Canvas PDF

1. Open the PDF in Canvas
2. Click AssisT icon > OCR > Capture Screenshot
3. Select "Full Page" capture
4. Wait for OCR processing
5. Click "Read Aloud" to hear content
6. Click "Copy" to paste into notes

### Example 2: Read Image Text Aloud

1. Navigate to page with image containing text
2. Click OCR > Region Select
3. Draw rectangle around the image
4. OCR extracts text automatically
5. Click Play to hear the text via TTS

### Example 3: Save Lecture Slides

1. Open lecture slides in browser
2. Capture each slide with Region Select
3. Save each as TXT file
4. Combine into study document

---

## Related Guides

- [User Guide](USER_GUIDE.md) - General extension usage
- [STT User Guide](STT_USER_GUIDE.md) - Speech-to-text features
- [Annotation Guide](ANNOTATION_GUIDE.md) - Taking notes on content

---

**Last Updated**: 2025-11-28
**AssisT Version**: 0.2.0 (Phase 2 Complete)
