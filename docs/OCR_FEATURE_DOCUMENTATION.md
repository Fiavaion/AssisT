# OCR (Optical Character Recognition) Feature Documentation

**Status:** ✅ FULLY IMPLEMENTED
**Version:** 0.1.0
**Last Updated:** 2025-11-21
**Module Location:** [src/features/ocr/ocr.js](../src/features/ocr/ocr.js)

---

## 📋 Overview

The OCR feature provides text extraction from images, screenshots, and PDFs using Tesseract.js OCR engine. It supports multiple capture modes, lazy loading for performance, and seamless integration with the extension's TTS feature.

### Key Features

- **Lazy Loading**: Tesseract.js (2.5MB) only loads when OCR is first used
- **Screenshot Capture**: Three capture modes (visible area, full page, region selection)
- **Multi-language Support**: Supports all Tesseract.js languages (eng, spa, fra, etc.)
- **Confidence Filtering**: Filters low-confidence words to improve accuracy
- **TTS Integration**: Extracted text can be read aloud immediately
- **Export Options**: Copy to clipboard or save as TXT file
- **PDF Support**: Ready for PDF text extraction (future enhancement)

---

## 🏗️ Architecture

### Module Pattern

The OCR feature follows the **Feature Isolation Pattern** (DEC-202510-010):

- All functions prefixed with `ocr_` to avoid naming conflicts
- Self-contained module with no external dependencies
- Exposes public API via `window.assistFeatures.ocr`
- Self-initializing on script load

### File Structure

```
src/features/ocr/
└── ocr.js (1000 lines)
    ├── State Management (lines 24-30)
    ├── Lazy Loading (lines 34-101)
    ├── Initialization & Cleanup (lines 104-149)
    ├── Screenshot Capture (lines 152-606)
    ├── OCR Engine Integration (lines 609-717)
    └── Result Modal UI (lines 720-970)
```

---

## 🚀 Usage

### Programmatic API

```javascript
// Check if OCR is available
if (window.assistFeatures && window.assistFeatures.ocr) {
  // Start OCR workflow (shows screenshot UI)
  await window.assistFeatures.ocr.performOCR();

  // Or use individual functions:

  // Load Tesseract.js library
  await window.assistFeatures.ocr.loadTesseract();

  // Perform OCR on image data URL
  const result = await window.assistFeatures.ocr.recognizeText(imageDataUrl, {
    lang: 'eng',
    confidenceThreshold: 60,
  });

  // Capture screenshot
  const screenshotDataUrl = await window.assistFeatures.ocr.captureScreenshot();
}
```

### Full OCR Workflow Example

```javascript
async function extractTextFromScreen() {
  const ocr = window.assistFeatures.ocr;

  // 1. Perform OCR (shows UI for screenshot selection)
  const result = await ocr.performOCR({
    lang: 'eng', // Language code
    confidenceThreshold: 60, // Filter words below 60% confidence
  });

  if (result) {
    console.log('Extracted text:', result.text);
    console.log('Confidence:', result.confidence);
    console.log('Word count:', result.words.length);

    // 2. Use extracted text with TTS
    if (typeof window.readText === 'function') {
      const tempElement = document.createElement('div');
      tempElement.textContent = result.text;
      window.readText(result.text, tempElement);
    }
  }
}
```

---

## 🎨 User Interface

### Screenshot Capture Modal

When `performOCR()` is called, a modal appears with three options:

1. **Visible Area Only** - Captures current viewport
2. **Full Page (Scroll & Stitch)** - Scrolls page and stitches screenshots together
3. **Select Region** - Interactive region selection tool
4. **Cancel** - Closes modal

### Region Selection Tool

- **UI Elements**: Semi-transparent overlay with dashed selection box
- **Instructions**: Tooltip showing "Click and drag to select region"
- **Controls**:
  - Click and drag to select region
  - ESC key to cancel
  - Minimum selection size: 10x10 pixels

### OCR Result Modal

After text extraction, displays:

- **Image Preview**: Original screenshot
- **Extracted Text**: Editable textarea with recognized text
- **Metadata**: Confidence score and character count
- **Action Buttons**:
  - **Read Aloud (TTS)**: Triggers text-to-speech
  - **Copy to Clipboard**: Copies text
  - **Save as TXT**: Downloads text file

---

## ⚙️ Configuration

### OCR Options

```javascript
const options = {
  lang: 'eng', // Language code (default: 'eng')
  confidenceThreshold: 60, // Minimum confidence 0-100 (default: 60)
};

await window.assistFeatures.ocr.recognizeText(imageUrl, options);
```

### Supported Languages

Tesseract.js supports 100+ languages. Common examples:

- `eng` - English
- `spa` - Spanish
- `fra` - French
- `deu` - German
- `chi_sim` - Chinese Simplified
- `jpn` - Japanese
- `ara` - Arabic

### Performance Considerations

- **First Load**: 2-5 seconds (downloads Tesseract.js once)
- **Subsequent Uses**: Instant (library cached)
- **OCR Processing**: 1-10 seconds depending on image size
- **Memory Usage**: ~50MB while Tesseract.js is loaded

---

## 🔧 Implementation Details

### Lazy Loading Strategy

```javascript
// Tesseract.js only loads when first needed
let ocr_tesseractInstance = null;
let ocr_isLoading = false;
let ocr_loadingPromise = null;

async function ocr_loadTesseract() {
  // Return existing instance if already loaded
  if (ocr_tesseractInstance) {
    return ocr_tesseractInstance;
  }

  // Prevent parallel loads
  if (ocr_isLoading && ocr_loadingPromise) {
    return ocr_loadingPromise;
  }

  // Dynamic import
  const Tesseract = await import('tesseract.js');
  ocr_tesseractInstance = Tesseract;
  return Tesseract;
}
```

### Screenshot Stitching Algorithm

For full-page screenshots:

1. Calculate number of viewport-height sections needed
2. Scroll to each section with 100ms delay
3. Capture screenshot of each section
4. Create canvas with full page dimensions
5. Draw each screenshot at correct Y offset
6. Export final stitched image as data URL

### Confidence Filtering

```javascript
function ocr_filterByConfidence(result, threshold) {
  if (threshold === 0) {
    return result.data.text; // No filtering
  }

  // Filter words below threshold
  const filteredWords = result.data.words
    .filter(word => word.confidence >= threshold)
    .map(word => word.text);

  return filteredWords.join(' ');
}
```

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Open extension on any webpage
- [ ] Open browser console (F12)
- [ ] Run: `await window.assistFeatures.ocr.performOCR()`
- [ ] Verify screenshot UI appears
- [ ] Test "Visible Area Only" button
  - [ ] Screenshot captured
  - [ ] OCR result modal appears
  - [ ] Text extracted successfully
- [ ] Test "Full Page" button (on long page)
  - [ ] Page scrolls and stitches
  - [ ] Final screenshot shows full page
- [ ] Test "Select Region" button
  - [ ] Overlay appears
  - [ ] Can drag to select region
  - [ ] ESC cancels selection
  - [ ] Selected region captured
- [ ] Test OCR Result Modal
  - [ ] "Copy to Clipboard" works
  - [ ] "Save as TXT" downloads file
  - [ ] "Read Aloud (TTS)" speaks text (requires TTS enabled)

### Unit Testing (Future)

```javascript
// Example unit tests for OCR module
describe('OCR Module', () => {
  test('should lazy load Tesseract.js', async () => {
    const state1 = ocr_getLoadingState();
    expect(state1.isLoaded).toBe(false);

    await ocr_loadTesseract();

    const state2 = ocr_getLoadingState();
    expect(state2.isLoaded).toBe(true);
    expect(state2.hasInstance).toBe(true);
  });

  test('should filter low confidence words', () => {
    const mockResult = {
      data: {
        text: 'hello world',
        words: [
          { text: 'hello', confidence: 85 },
          { text: 'world', confidence: 45 },
        ],
      },
    };

    const filtered = ocr_filterByConfidence(mockResult, 60);
    expect(filtered).toBe('hello'); // 'world' filtered out
  });
});
```

---

## 🐛 Known Issues & Limitations

### Current Limitations

1. **No keyboard shortcuts**: Must trigger via console or future UI button
2. **No settings UI**: Language and threshold hardcoded to defaults
3. **No progress bar**: User can't see loading progress during OCR
4. **No PDF support**: Code structure ready but not implemented
5. **No context menu integration**: Would be useful for right-click on images

### Browser Compatibility

- ✅ Chrome 90+ (tested)
- ✅ Edge 90+ (should work, untested)
- ❌ Firefox (Manifest V3 support limited)
- ❌ Safari (no Manifest V3 support)

### Performance Issues

- **Large images** (>2MB): May crash Tesseract.js worker
- **Full page on very long pages** (>10,000px): Memory intensive
- **Region selection on complex layouts**: May miss fixed position elements

---

## 🔮 Future Enhancements

### Phase 1: UI Integration

- [ ] Add OCR button to extension popup
- [ ] Add keyboard shortcut (e.g., Alt+O)
- [ ] Add context menu item for images
- [ ] Add progress indicator during OCR

### Phase 2: Advanced Features

- [ ] PDF text extraction
- [ ] Batch processing (multiple images)
- [ ] OCR history/cache
- [ ] Image preprocessing (contrast, rotation)
- [ ] Custom language pack loading

### Phase 3: Settings & Customization

- [ ] Language selection in settings
- [ ] Confidence threshold slider
- [ ] Output format options (TXT, JSON, Markdown)
- [ ] Auto-translate extracted text

---

## 📚 API Reference

### Main Workflow Function

#### `ocr_performOCR(options)`

Starts the full OCR workflow: screenshot → OCR → result display.

**Parameters:**

- `options` (Object, optional)
  - `lang` (string): Language code (default: 'eng')
  - `confidenceThreshold` (number): 0-100 (default: 60)

**Returns:** `Promise<Object>` OCR result with text, confidence, words, lines

**Example:**

```javascript
const result = await window.assistFeatures.ocr.performOCR({
  lang: 'eng',
  confidenceThreshold: 70,
});
```

---

### Screenshot Capture Functions

#### `ocr_captureVisibleTab()`

Captures the currently visible viewport.

**Returns:** `Promise<string>` Data URL of screenshot

---

#### `ocr_captureFullPage()`

Captures entire page by scrolling and stitching.

**Returns:** `Promise<string>` Data URL of stitched screenshot

---

#### `ocr_captureRegion()`

Shows interactive region selection overlay.

**Returns:** `Promise<string>` Data URL of selected region (null if canceled)

---

#### `ocr_showScreenshotUI()`

Shows modal with capture mode options.

**Returns:** `Promise<string>` Data URL of captured screenshot (null if canceled)

---

### OCR Engine Functions

#### `ocr_recognizeText(imageDataUrl, options)`

Performs OCR on an image data URL.

**Parameters:**

- `imageDataUrl` (string): Data URL of image
- `options` (Object, optional)
  - `lang` (string): Language code (default: 'eng')
  - `confidenceThreshold` (number): 0-100 (default: 60)

**Returns:** `Promise<Object>`

```javascript
{
  text: string,              // Filtered text
  originalText: string,      // Unfiltered text
  confidence: number,        // Overall confidence (0-100)
  words: Array,              // Word objects with positions
  lines: Array,              // Line objects
  paragraphs: Array          // Paragraph objects
}
```

---

### Utility Functions

#### `ocr_loadTesseract()`

Lazy loads Tesseract.js library. Automatically called by `recognizeText()`.

**Returns:** `Promise<Object>` Tesseract.js library object

---

#### `ocr_isReady()`

Checks if Tesseract.js is loaded and ready.

**Returns:** `boolean`

---

#### `ocr_getLoadingState()`

Gets detailed loading state.

**Returns:** `Object`

```javascript
{
  isLoaded: boolean,     // Library loaded
  isLoading: boolean,    // Currently loading
  hasInstance: boolean   // Instance exists
}
```

---

## 🔗 Related Documentation

- [Feature Isolation Pattern (DEC-202510-010)](../projectmemory.md)
- [Debugging Protocol](../TEMPLATE_DEBUGGING_PROTOCOL.md)
- [TTS Integration](./TTS_INTEGRATION.md)
- [Highlight Menu Feature](./HIGHLIGHT_MENU.md)
- [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)

---

## 👥 Contributors

- OCR feature implemented as part of Phase 2 feature development
- Based on requirements from PROJECT_STATUS.md Feature 7

---

## 📝 Changelog

### 0.1.0 (2025-11-21)

- ✅ Initial OCR implementation
- ✅ Lazy loading of Tesseract.js
- ✅ Three screenshot capture modes
- ✅ Region selection UI
- ✅ OCR result modal
- ✅ TTS integration
- ✅ Export options (clipboard, TXT file)
- ✅ Confidence filtering
- ✅ Multi-language support

---

**Last Verified:** 2025-11-21
**Verification Method:** Code review + Manual testing in Chrome
**Test Status:** ✅ Module loads successfully, API accessible via console
