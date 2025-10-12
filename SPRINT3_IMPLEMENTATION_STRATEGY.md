# Sprint 3: Implementation Strategy
## Text Customization, Line Highlighting & Focus Mode

**Date:** 2025-10-11
**Goal:** Add three high-value accessibility features with proper architecture
**Estimated Time:** 11-16 hours over 2-3 sessions

---

## 🏗️ Architectural Overview

### Feature Dependencies & Integration Points

```
┌─────────────────────────────────────────────────────────┐
│                    Existing System                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │ TTS Engine (synth.speak)                         │  │
│  │  ├─ Utterance events (onboundary, onend)        │  │
│  │  └─ Current element tracking                     │  │
│  └──────────────────────────────────────────────────┘  │
│                          ↓                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Highlighting System                              │  │
│  │  ├─ Paragraph highlight (existing)               │  │
│  │  ├─ Word-by-word highlight (existing)            │  │
│  │  └─ Line highlight (NEW - Sprint 3)              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              ↓                           ↓
┌─────────────────────────┐   ┌──────────────────────────┐
│  Text Customization     │   │     Focus Mode           │
│  (NEW - Sprint 3)       │   │  (NEW - Sprint 3)        │
│  ├─ Font injection      │   │  ├─ Element detection    │
│  ├─ Spacing CSS         │   │  ├─ Hide/show logic      │
│  └─ Page-wide styles    │   │  └─ Layout adjustment    │
└─────────────────────────┘   └──────────────────────────┘
```

### Key Principles

1. **Feature Isolation:** Each feature is self-contained with own state variables
2. **No Breaking Changes:** New features don't modify existing TTS/highlighting code
3. **Toggle Independence:** Each feature can be enabled/disabled without affecting others
4. **Storage Separation:** Each feature has its own storage namespace
5. **CSS Injection:** Use data attributes and CSS injection for all visual changes

---

## 📝 Feature 1: Text Customization

### Architecture Design

#### A. Storage Schema

```javascript
// src/utils/storage-manager.js
const DEFAULT_SETTINGS = {
  // ... existing settings

  textCustomization: {
    enabled: false,
    fontFamily: 'system',     // 'system' | 'opendyslexic' | 'comic-sans' | 'arial'
    lineSpacing: 1.5,         // 1.0 - 3.0 (WCAG min: 1.5)
    letterSpacing: 0.12,      // 0 - 0.5em (WCAG min: 0.12)
    wordSpacing: 0.16,        // 0 - 0.5em (WCAG min: 0.16)
    paragraphSpacing: 2.0     // 1.0 - 4.0em (WCAG min: 2.0)
  }
};
```

#### B. CSS Injection Strategy

**Approach:** Inject a `<style>` element with custom CSS, use `!important` to override Canvas styles

```javascript
// src/content/content-simple.js

// ============================================
// FEATURE: Text Customization
// ============================================

let textCustomization_enabled = false;
let textCustomization_styleElement = null;
let textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0
};

function textCustomization_init() {
  // Load settings from storage
  chrome.storage.local.get('assist_settings', (result) => {
    if (result.assist_settings?.textCustomization) {
      const tc = result.assist_settings.textCustomization;
      textCustomization_enabled = tc.enabled || false;
      textCustomization_settings = { ...textCustomization_settings, ...tc };

      if (textCustomization_enabled) {
        textCustomization_apply();
      }
    }
  });
}

function textCustomization_apply() {
  if (!textCustomization_enabled) {
    textCustomization_remove();
    return;
  }

  // Create or update style element
  if (!textCustomization_styleElement) {
    textCustomization_styleElement = document.createElement('style');
    textCustomization_styleElement.id = 'assist-text-customization';
    document.head.appendChild(textCustomization_styleElement);
  }

  // Build CSS based on settings
  const css = textCustomization_generateCSS();
  textCustomization_styleElement.textContent = css;

  console.log('[AssisT] Text customization applied:', textCustomization_settings);
}

function textCustomization_remove() {
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
    textCustomization_styleElement = null;
  }
  console.log('[AssisT] Text customization removed');
}

function textCustomization_generateCSS() {
  const { fontFamily, lineSpacing, letterSpacing, wordSpacing, paragraphSpacing } = textCustomization_settings;

  // Font family mapping
  const fontMap = {
    'system': 'inherit',
    'opendyslexic': '"OpenDyslexic", Arial, sans-serif',
    'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
    'arial': 'Arial, Helvetica, sans-serif'
  };

  const font = fontMap[fontFamily] || 'inherit';

  // Generate CSS with high specificity and !important
  return `
    /* AssisT Text Customization - WCAG 2.2 SC 1.4.12 Compliant */
    body,
    body *:not(code):not(pre):not(.ic-app-header__menu-list-item) {
      ${fontFamily !== 'system' ? `font-family: ${font} !important;` : ''}
      line-height: ${lineSpacing} !important;
      letter-spacing: ${letterSpacing}em !important;
      word-spacing: ${wordSpacing}em !important;
    }

    /* Paragraph spacing */
    p,
    div.user_content > *,
    .discussion-topic,
    .message {
      margin-bottom: ${paragraphSpacing}em !important;
    }

    /* Preserve code blocks - don't apply custom spacing */
    code,
    pre,
    .code-block,
    .CodeMirror {
      line-height: 1.5 !important;
      letter-spacing: 0 !important;
      word-spacing: 0 !important;
    }
  `;
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.assist_settings?.newValue?.textCustomization) {
    const tc = changes.assist_settings.newValue.textCustomization;
    const oldEnabled = textCustomization_enabled;

    textCustomization_enabled = tc.enabled || false;
    textCustomization_settings = { ...textCustomization_settings, ...tc };

    if (textCustomization_enabled !== oldEnabled || textCustomization_enabled) {
      textCustomization_apply();
    } else if (!textCustomization_enabled) {
      textCustomization_remove();
    }
  }
});

// Initialize on load
textCustomization_init();

// ============================================
// END FEATURE: Text Customization
// ============================================
```

#### C. OpenDyslexic Font Integration

**Option 1: Bundle Font Files (Recommended for offline)**
```
public/
└── fonts/
    ├── OpenDyslexic-Regular.woff2
    ├── OpenDyslexic-Bold.woff2
    └── OpenDyslexic-Italic.woff2
```

```css
@font-face {
  font-family: 'OpenDyslexic';
  src: url('chrome-extension://__MSG_@@extension_id__/public/fonts/OpenDyslexic-Regular.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}
```

**Option 2: CDN (Simpler, requires internet)**
```javascript
// Load from CDN when enabled
function textCustomization_loadOpenDyslexic() {
  if (fontFamily === 'opendyslexic') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/opendyslexic@3.0.0/opendyslexic-regular.css';
    document.head.appendChild(link);
  }
}
```

**Recommendation:** Use CDN for MVP, bundle fonts in production release.

#### D. UI Components

**popup.html** - Add to Advanced Options modal or new section:
```html
<!-- Text Customization Section -->
<section class="control-section" id="text-customization-section">
  <div class="toggle-control">
    <label for="text-customization-enabled" class="toggle-label">
      <span class="label-text">Text Customization</span>
      <div class="toggle-switch">
        <input type="checkbox" id="text-customization-enabled" role="switch">
        <span class="toggle-slider"></span>
      </div>
    </label>
  </div>
  <p class="feature-description">Adjust font and spacing for better readability (WCAG 2.2 SC 1.4.12)</p>
</section>

<!-- Text Customization Options (hidden by default) -->
<div id="text-customization-options" class="feature-options-container hidden">

  <!-- Font Family -->
  <div class="control-group">
    <label for="text-font-family">Font Family</label>
    <select id="text-font-family" class="control-select">
      <option value="system">System Default</option>
      <option value="opendyslexic">OpenDyslexic (for dyslexia)</option>
      <option value="comic-sans">Comic Sans MS</option>
      <option value="arial">Arial</option>
    </select>
    <p class="control-hint">OpenDyslexic is designed for readers with dyslexia</p>
  </div>

  <!-- Line Spacing -->
  <div class="control-group">
    <label for="text-line-spacing">
      Line Spacing
      <span class="control-value" id="text-line-spacing-value">1.5</span>
    </label>
    <input type="range"
           id="text-line-spacing"
           min="1.0"
           max="3.0"
           step="0.1"
           value="1.5"
           class="control-slider">
    <p class="control-hint">WCAG minimum: 1.5</p>
  </div>

  <!-- Letter Spacing -->
  <div class="control-group">
    <label for="text-letter-spacing">
      Letter Spacing
      <span class="control-value" id="text-letter-spacing-value">0.12em</span>
    </label>
    <input type="range"
           id="text-letter-spacing"
           min="0"
           max="0.5"
           step="0.01"
           value="0.12"
           class="control-slider">
    <p class="control-hint">WCAG minimum: 0.12em</p>
  </div>

  <!-- Word Spacing -->
  <div class="control-group">
    <label for="text-word-spacing">
      Word Spacing
      <span class="control-value" id="text-word-spacing-value">0.16em</span>
    </label>
    <input type="range"
           id="text-word-spacing"
           min="0"
           max="0.5"
           step="0.01"
           value="0.16"
           class="control-slider">
    <p class="control-hint">WCAG minimum: 0.16em</p>
  </div>

  <!-- Paragraph Spacing -->
  <div class="control-group">
    <label for="text-paragraph-spacing">
      Paragraph Spacing
      <span class="control-value" id="text-paragraph-spacing-value">2.0em</span>
    </label>
    <input type="range"
           id="text-paragraph-spacing"
           min="1.0"
           max="4.0"
           step="0.1"
           value="2.0"
           class="control-slider">
    <p class="control-hint">WCAG minimum: 2.0em</p>
  </div>

  <!-- Preview Button -->
  <button id="text-customization-preview" class="control-btn">
    Preview on Page
  </button>

</div>
```

**popup.js** - Event handlers:
```javascript
// In setupEventListeners()

// Text Customization toggle
const textCustomizationEnabled = document.getElementById('text-customization-enabled');
const textCustomizationOptions = document.getElementById('text-customization-options');

textCustomizationEnabled.checked = this.settings?.textCustomization?.enabled || false;

// Show/hide options
if (textCustomizationEnabled.checked) {
  textCustomizationOptions.classList.remove('hidden');
} else {
  textCustomizationOptions.classList.add('hidden');
}

textCustomizationEnabled.addEventListener('change', (e) => {
  this.settings.textCustomization.enabled = e.target.checked;
  this.saveSettings();

  if (e.target.checked) {
    textCustomizationOptions.classList.remove('hidden');
  } else {
    textCustomizationOptions.classList.add('hidden');
  }

  this.sendCommandToTab('textCustomization', { enabled: e.target.checked });
});

// Font family selector
const fontFamilySelect = document.getElementById('text-font-family');
fontFamilySelect.value = this.settings?.textCustomization?.fontFamily || 'system';

fontFamilySelect.addEventListener('change', (e) => {
  this.settings.textCustomization.fontFamily = e.target.value;
  this.saveSettings();
});

// Line spacing slider
const lineSpacingSlider = document.getElementById('text-line-spacing');
const lineSpacingValue = document.getElementById('text-line-spacing-value');

lineSpacingSlider.value = this.settings?.textCustomization?.lineSpacing || 1.5;
lineSpacingValue.textContent = lineSpacingSlider.value;

lineSpacingSlider.addEventListener('input', (e) => {
  lineSpacingValue.textContent = e.target.value;
  this.settings.textCustomization.lineSpacing = parseFloat(e.target.value);
  this.saveSettings();
});

// Letter spacing slider
const letterSpacingSlider = document.getElementById('text-letter-spacing');
const letterSpacingValue = document.getElementById('text-letter-spacing-value');

letterSpacingSlider.value = this.settings?.textCustomization?.letterSpacing || 0.12;
letterSpacingValue.textContent = letterSpacingSlider.value + 'em';

letterSpacingSlider.addEventListener('input', (e) => {
  letterSpacingValue.textContent = e.target.value + 'em';
  this.settings.textCustomization.letterSpacing = parseFloat(e.target.value);
  this.saveSettings();
});

// Word spacing slider
const wordSpacingSlider = document.getElementById('text-word-spacing');
const wordSpacingValue = document.getElementById('text-word-spacing-value');

wordSpacingSlider.value = this.settings?.textCustomization?.wordSpacing || 0.16;
wordSpacingValue.textContent = wordSpacingSlider.value + 'em';

wordSpacingSlider.addEventListener('input', (e) => {
  wordSpacingValue.textContent = e.target.value + 'em';
  this.settings.textCustomization.wordSpacing = parseFloat(e.target.value);
  this.saveSettings();
});

// Paragraph spacing slider
const paragraphSpacingSlider = document.getElementById('text-paragraph-spacing');
const paragraphSpacingValue = document.getElementById('text-paragraph-spacing-value');

paragraphSpacingSlider.value = this.settings?.textCustomization?.paragraphSpacing || 2.0;
paragraphSpacingValue.textContent = paragraphSpacingSlider.value + 'em';

paragraphSpacingSlider.addEventListener('input', (e) => {
  paragraphSpacingValue.textContent = e.target.value + 'em';
  this.settings.textCustomization.paragraphSpacing = parseFloat(e.target.value);
  this.saveSettings();
});
```

#### E. Testing Checklist

**Text Customization Tests:**
- [ ] Font family changes apply to page
- [ ] OpenDyslexic font loads correctly
- [ ] Line spacing meets WCAG 1.5 minimum
- [ ] Letter spacing meets WCAG 0.12em minimum
- [ ] Word spacing meets WCAG 0.16em minimum
- [ ] Paragraph spacing meets WCAG 2.0em minimum
- [ ] Code blocks preserve original formatting
- [ ] Settings persist across browser restart
- [ ] Toggle on/off works correctly
- [ ] Real-time updates without page refresh
- [ ] Works on: Dashboard, Assignments, Discussions, Quizzes
- [ ] Doesn't break Canvas navigation/buttons
- [ ] Compatible with TTS highlighting

#### F. Edge Cases & Considerations

**Potential Issues:**
1. **Canvas CSS specificity wars** - Use `!important` judiciously
2. **Code blocks** - Exclude from spacing changes
3. **Rich text editors** - May have inline styles that override
4. **Math equations** - MathJax/LaTeX should preserve spacing
5. **Performance** - CSS injection is fast, but test on large pages

**Solutions:**
```javascript
// Exclude specific elements
const excludeSelectors = [
  'code',
  'pre',
  '.CodeMirror',
  '.math',
  '.equation',
  '[class*="monaco"]',  // VS Code editor
  '.ic-app-header'      // Canvas header
];
```

---

## 📝 Feature 2: Line Highlighting

### Architecture Design

#### A. Storage Schema

```javascript
// src/utils/storage-manager.js
const DEFAULT_SETTINGS = {
  tts: {
    // ... existing
    highlightMode: 'paragraph',  // 'paragraph' | 'line' | 'word'
    // ... rest of highlighting settings
  }
};
```

#### B. Line Detection Algorithm

**Challenge:** Detect which line a word is on dynamically

**Approach:** Use `Range.getBoundingClientRect()` to compare Y positions

```javascript
// src/content/content-simple.js

// ============================================
// FEATURE: Line Highlighting
// ============================================

function lineHighlight_getLineFromWordIndex(element, wordIndex) {
  const text = element.textContent;
  const words = text.split(/\s+/);

  if (wordIndex >= words.length) return null;

  // Create temporary spans for each word to get positions
  const tempSpans = [];
  const originalHTML = element.innerHTML;

  // Wrap each word in a span
  const wrappedHTML = words.map((word, index) => {
    return `<span data-word-index="${index}">${word}</span>`;
  }).join(' ');

  element.innerHTML = wrappedHTML;

  // Get the Y position of the current word
  const currentWordSpan = element.querySelector(`[data-word-index="${wordIndex}"]`);
  if (!currentWordSpan) {
    element.innerHTML = originalHTML;
    return null;
  }

  const currentY = currentWordSpan.getBoundingClientRect().top;

  // Find all words on the same line (same Y position, ±5px tolerance)
  const lineWords = [];
  element.querySelectorAll('[data-word-index]').forEach(span => {
    const spanY = span.getBoundingClientRect().top;
    if (Math.abs(spanY - currentY) < 5) {
      lineWords.push({
        index: parseInt(span.getAttribute('data-word-index')),
        element: span
      });
    }
  });

  // Restore original HTML
  element.innerHTML = originalHTML;

  return lineWords;
}

function lineHighlight_highlightLine(element, wordIndex) {
  const lineWords = lineHighlight_getLineFromWordIndex(element, wordIndex);

  if (!lineWords || lineWords.length === 0) return;

  // Get start and end word indices
  const startIndex = lineWords[0].index;
  const endIndex = lineWords[lineWords.length - 1].index;

  // Create range for the line
  const text = element.textContent;
  const words = text.split(/\s+/);

  let charIndex = 0;
  let startChar = 0;
  let endChar = text.length;

  for (let i = 0; i <= endIndex; i++) {
    if (i === startIndex) {
      startChar = charIndex;
    }
    if (i === endIndex) {
      endChar = charIndex + words[i].length;
      break;
    }
    charIndex += words[i].length + 1; // +1 for space
  }

  // Highlight the range
  const range = document.createRange();
  const textNode = findTextNode(element, startChar);

  if (textNode) {
    range.setStart(textNode, startChar);
    range.setEnd(textNode, endChar);
    highlightRange(range);
  }
}

// Helper: Find text node at character offset
function findTextNode(element, charOffset) {
  let currentOffset = 0;

  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (currentOffset + node.length >= charOffset) {
        return node;
      }
      currentOffset += node.length;
    }

    for (let child of node.childNodes) {
      const found = traverse(child);
      if (found) return found;
    }

    return null;
  }

  return traverse(element);
}

// Integrate with TTS boundary events
function readText(text, element) {
  // ... existing code ...

  // Determine highlighting mode
  const mode = settings.highlightMode || 'paragraph';

  if (mode === 'word') {
    // Existing word-by-word highlighting
    highlightWordByWord(element, text, settings.rate);
  } else if (mode === 'line') {
    // NEW: Line highlighting
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // Calculate which word we're on
        const charIndex = event.charIndex;
        const wordIndex = text.substring(0, charIndex).split(/\s+/).length - 1;

        lineHighlight_highlightLine(element, wordIndex);
      }
    };

    // ... rest of utterance setup
  } else {
    // Existing paragraph highlighting
    highlightElement(element);
  }
}

// ============================================
// END FEATURE: Line Highlighting
// ============================================
```

#### C. UI Components

**popup.html:**
```html
<!-- Highlighting Mode Selector -->
<div class="control-group">
  <label>Highlighting Mode</label>
  <div class="radio-group">
    <label class="radio-label">
      <input type="radio" name="highlight-mode" value="paragraph" checked>
      <span>Paragraph</span>
      <p class="radio-hint">Highlight entire paragraph</p>
    </label>
    <label class="radio-label">
      <input type="radio" name="highlight-mode" value="line">
      <span>Line</span>
      <p class="radio-hint">Highlight current line only</p>
    </label>
    <label class="radio-label">
      <input type="radio" name="highlight-mode" value="word">
      <span>Word-by-Word</span>
      <p class="radio-hint">Highlight each word progressively</p>
    </label>
  </div>
</div>
```

**popup.js:**
```javascript
// Highlighting mode selector
const highlightModeInputs = document.querySelectorAll('input[name="highlight-mode"]');

// Set initial value
const currentMode = this.settings?.tts?.highlightMode || 'paragraph';
document.querySelector(`input[name="highlight-mode"][value="${currentMode}"]`).checked = true;

// Listen for changes
highlightModeInputs.forEach(input => {
  input.addEventListener('change', (e) => {
    if (e.target.checked) {
      this.settings.tts.highlightMode = e.target.value;
      this.saveSettings();
      this.sendCommandToTab('setHighlightMode', { mode: e.target.value });
    }
  });
});
```

#### D. Testing Checklist

**Line Highlighting Tests:**
- [ ] Detects line breaks correctly
- [ ] Works with various font sizes
- [ ] Works with various screen widths
- [ ] Handles text wrapping properly
- [ ] Smooth transitions between lines
- [ ] Compatible with existing paragraph highlight
- [ ] Compatible with word-by-word highlight
- [ ] Toggle between modes works seamlessly
- [ ] Performance: no lag on long paragraphs
- [ ] Works on: multi-line paragraphs, list items, headings

#### E. Edge Cases

**Potential Issues:**
1. **Dynamic text wrapping** - Line breaks change with window resize
2. **Multi-column layouts** - May highlight wrong column
3. **RTL languages** - Line detection may fail
4. **Math equations** - May not detect line breaks in LaTeX

**Solutions:**
- Recalculate line positions on window resize
- Detect single-column vs multi-column layouts
- Test with RTL content if needed
- Fallback to paragraph mode for complex content

---

## 📝 Feature 3: Focus Mode

### Architecture Design

#### A. Storage Schema

```javascript
// src/utils/storage-manager.js
const DEFAULT_SETTINGS = {
  // ... existing

  focusMode: {
    enabled: false,
    dimInsteadOfHide: false,  // Alternative approach
    dimOpacity: 0.2,          // Opacity when dimming
    customSelectors: []       // User can add custom selectors to hide
  }
};
```

#### B. Element Detection Strategy

**Challenge:** Canvas DOM varies by page type

**Approach:** Use multiple selector strategies with fallbacks

```javascript
// src/content/content-simple.js

// ============================================
// FEATURE: Focus Mode (FR-102)
// ============================================

let focusMode_enabled = false;
let focusMode_hiddenElements = [];
let focusMode_originalStyles = new Map();

const FOCUS_MODE_SELECTORS = {
  // Canvas-specific selectors
  canvas: [
    '#left-side',                          // Left sidebar
    '#right-side',                         // Right sidebar
    '#right-side-wrapper',
    'header#header',                       // Top header
    '.ic-app-nav-toggle-and-crumbs',      // Breadcrumbs
    '#global_nav_help_link',              // Help link
    '#global_nav_profile_link',           // Profile link
    '.ic-app-header__menu-list',          // Top menu
    '.ic-app-header__secondary-navigation', // Secondary nav
    '#mobile-header',                      // Mobile header
    'aside',                               // Generic sidebars
    '[role="banner"]',                     // Banner elements
    '[role="navigation"]:not(#content *)', // Nav (except in content)
    '.ui-dialog'                           // Dialogs/modals
  ],

  // Generic distracting elements
  generic: [
    'aside:not(#content aside)',
    'nav:not(#content nav)',
    '[role="complementary"]',
    '.sidebar',
    '.ads',
    '.advertisement',
    '[id*="sidebar"]',
    '[class*="sidebar"]'
  ]
};

function focusMode_init() {
  chrome.storage.local.get('assist_settings', (result) => {
    if (result.assist_settings?.focusMode) {
      const fm = result.assist_settings.focusMode;
      focusMode_enabled = fm.enabled || false;

      if (focusMode_enabled) {
        focusMode_enable();
      }
    }
  });
}

function focusMode_enable() {
  if (focusMode_enabled) {
    console.log('[AssisT] Focus mode already enabled');
    return;
  }

  focusMode_enabled = true;
  console.log('[AssisT] Enabling focus mode...');

  // Detect page type (Canvas or generic)
  const isCanvasPage = window.location.hostname.includes('instructure.com') ||
                       document.querySelector('#application, .ic-app');

  const selectors = isCanvasPage ?
    [...FOCUS_MODE_SELECTORS.canvas, ...FOCUS_MODE_SELECTORS.generic] :
    FOCUS_MODE_SELECTORS.generic;

  // Hide distracting elements
  selectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(element => {
        // Skip if already hidden or if it's inside main content
        if (element.offsetParent === null) return;
        if (element.closest('#content, [role="main"], main')) return;

        // Store original styles
        const originalDisplay = element.style.display;
        const originalOpacity = element.style.opacity;

        focusMode_originalStyles.set(element, {
          display: originalDisplay,
          opacity: originalOpacity
        });

        // Hide or dim
        const dimMode = focusMode_settings?.dimInsteadOfHide || false;
        if (dimMode) {
          element.style.opacity = '0.2';
          element.style.pointerEvents = 'none';
        } else {
          element.style.display = 'none';
        }

        focusMode_hiddenElements.push(element);
      });
    } catch (error) {
      console.warn('[AssisT] Error hiding element with selector:', selector, error);
    }
  });

  // Optimize main content area
  const mainContent = document.querySelector('#content, [role="main"], main, .user_content');
  if (mainContent) {
    focusMode_originalStyles.set(mainContent, {
      maxWidth: mainContent.style.maxWidth,
      margin: mainContent.style.margin,
      padding: mainContent.style.padding,
      width: mainContent.style.width
    });

    mainContent.style.maxWidth = '900px';
    mainContent.style.margin = '0 auto';
    mainContent.style.padding = '40px';
    mainContent.style.width = '100%';
  }

  // Add focus mode indicator
  focusMode_addIndicator();

  console.log('[AssisT] Focus mode enabled:', focusMode_hiddenElements.length, 'elements hidden');
  showToast('📖 Focus Mode enabled - distractions hidden');
}

function focusMode_disable() {
  if (!focusMode_enabled) {
    console.log('[AssisT] Focus mode already disabled');
    return;
  }

  focusMode_enabled = false;
  console.log('[AssisT] Disabling focus mode...');

  // Restore all hidden elements
  focusMode_hiddenElements.forEach(element => {
    const originalStyles = focusMode_originalStyles.get(element);
    if (originalStyles) {
      element.style.display = originalStyles.display;
      element.style.opacity = originalStyles.opacity;
      element.style.pointerEvents = '';
    }
  });

  // Restore main content
  const mainContent = document.querySelector('#content, [role="main"], main, .user_content');
  if (mainContent) {
    const originalStyles = focusMode_originalStyles.get(mainContent);
    if (originalStyles) {
      mainContent.style.maxWidth = originalStyles.maxWidth;
      mainContent.style.margin = originalStyles.margin;
      mainContent.style.padding = originalStyles.padding;
      mainContent.style.width = originalStyles.width;
    }
  }

  // Clear tracking arrays
  focusMode_hiddenElements = [];
  focusMode_originalStyles.clear();

  // Remove indicator
  focusMode_removeIndicator();

  console.log('[AssisT] Focus mode disabled');
  showToast('📄 Focus Mode disabled - all elements restored');
}

function focusMode_addIndicator() {
  // Add visual indicator that focus mode is active
  const indicator = document.createElement('div');
  indicator.id = 'assist-focus-mode-indicator';
  indicator.textContent = '📖 Focus Mode Active';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #4CAF50;
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 999999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    cursor: pointer;
  `;

  indicator.addEventListener('click', () => {
    focusMode_disable();
  });

  indicator.title = 'Click to exit Focus Mode';

  document.body.appendChild(indicator);
}

function focusMode_removeIndicator() {
  const indicator = document.getElementById('assist-focus-mode-indicator');
  if (indicator) {
    indicator.remove();
  }
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.assist_settings?.newValue?.focusMode) {
    const fm = changes.assist_settings.newValue.focusMode;
    const newEnabled = fm.enabled || false;

    if (newEnabled !== focusMode_enabled) {
      if (newEnabled) {
        focusMode_enable();
      } else {
        focusMode_disable();
      }
    }
  }
});

// Initialize
focusMode_init();

// ============================================
// END FEATURE: Focus Mode
// ============================================
```

#### C. UI Components

**popup.html:**
```html
<!-- Focus Mode Toggle -->
<section class="control-section">
  <div class="toggle-control">
    <label for="focus-mode-enabled" class="toggle-label">
      <span class="label-text">📖 Focus Mode</span>
      <div class="toggle-switch">
        <input type="checkbox" id="focus-mode-enabled" role="switch">
        <span class="toggle-slider"></span>
      </div>
    </label>
  </div>
  <p class="feature-description">Hide sidebars and navigation for distraction-free reading</p>
</section>

<!-- Focus Mode Options (in Advanced Options modal) -->
<div id="focus-mode-options" class="feature-options-container hidden">
  <div class="control-group">
    <label class="checkbox-label">
      <input type="checkbox" id="focus-dim-instead-of-hide">
      <span>Dim instead of hide</span>
    </label>
    <p class="control-hint">Reduce opacity instead of completely hiding elements</p>
  </div>

  <div class="control-group" id="focus-dim-opacity-group" style="display: none;">
    <label for="focus-dim-opacity">
      Dim Opacity
      <span class="control-value" id="focus-dim-opacity-value">20%</span>
    </label>
    <input type="range"
           id="focus-dim-opacity"
           min="0"
           max="0.5"
           step="0.05"
           value="0.2"
           class="control-slider">
  </div>
</div>
```

**popup.js:**
```javascript
// Focus Mode toggle
const focusModeEnabled = document.getElementById('focus-mode-enabled');
const focusModeOptions = document.getElementById('focus-mode-options');

focusModeEnabled.checked = this.settings?.focusMode?.enabled || false;

if (focusModeEnabled.checked) {
  focusModeOptions.classList.remove('hidden');
} else {
  focusModeOptions.classList.add('hidden');
}

focusModeEnabled.addEventListener('change', (e) => {
  this.settings.focusMode.enabled = e.target.checked;
  this.saveSettings();

  if (e.target.checked) {
    focusModeOptions.classList.remove('hidden');
  } else {
    focusModeOptions.classList.add('hidden');
  }

  this.sendCommandToTab('focusMode', { enabled: e.target.checked });
});

// Dim instead of hide option
const dimInsteadOfHide = document.getElementById('focus-dim-instead-of-hide');
const dimOpacityGroup = document.getElementById('focus-dim-opacity-group');

dimInsteadOfHide.checked = this.settings?.focusMode?.dimInsteadOfHide || false;

if (dimInsteadOfHide.checked) {
  dimOpacityGroup.style.display = '';
} else {
  dimOpacityGroup.style.display = 'none';
}

dimInsteadOfHide.addEventListener('change', (e) => {
  this.settings.focusMode.dimInsteadOfHide = e.target.checked;
  this.saveSettings();

  if (e.target.checked) {
    dimOpacityGroup.style.display = '';
  } else {
    dimOpacityGroup.style.display = 'none';
  }
});

// Dim opacity slider
const dimOpacitySlider = document.getElementById('focus-dim-opacity');
const dimOpacityValue = document.getElementById('focus-dim-opacity-value');

dimOpacitySlider.value = this.settings?.focusMode?.dimOpacity || 0.2;
dimOpacityValue.textContent = Math.round(dimOpacitySlider.value * 100) + '%';

dimOpacitySlider.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  dimOpacityValue.textContent = Math.round(value * 100) + '%';
  this.settings.focusMode.dimOpacity = value;
  this.saveSettings();
});
```

#### D. Testing Checklist

**Focus Mode Tests:**
- [ ] Hides Canvas left sidebar
- [ ] Hides Canvas right sidebar
- [ ] Hides Canvas header navigation
- [ ] Hides breadcrumbs
- [ ] Preserves main content area
- [ ] Widens main content for readability
- [ ] Focus indicator appears and is clickable
- [ ] Toggle off restores all elements
- [ ] Dim mode works as alternative
- [ ] Works on: Dashboard, Assignments, Discussions, Quizzes, Modules
- [ ] Doesn't hide critical buttons (Submit, Save, etc.)
- [ ] Doesn't break page functionality
- [ ] Compatible with TTS and highlighting

#### E. Edge Cases

**Potential Issues:**
1. **Critical buttons hidden** - Submit, Save buttons may be in sidebars
2. **Dynamic content** - New elements added after focus mode enabled
3. **Canvas updates** - New Canvas releases may change DOM
4. **Modal dialogs** - May be hidden inadvertently
5. **Mobile view** - Different DOM structure

**Solutions:**
```javascript
// Never hide these critical elements
const NEVER_HIDE = [
  'button[type="submit"]',
  '.submit-button',
  '#submit_assignment',
  '.save-button',
  '[role="dialog"]',
  '[role="alertdialog"]'
];

// Check if element contains critical buttons
function containsCriticalElements(element) {
  return NEVER_HIDE.some(selector => element.querySelector(selector));
}
```

---

## 📊 Implementation Order & Timeline

### **Session 1: Text Customization (4-6 hours)**

**Steps:**
1. Add storage schema to storage-manager.js (15 min)
2. Implement CSS injection in content-simple.js (2 hours)
3. Add OpenDyslexic font via CDN (30 min)
4. Build UI controls in popup (1.5 hours)
5. Test on Canvas pages (1 hour)
6. Build and commit (15 min)

**Deliverable:** Working text customization with all WCAG spacing controls

---

### **Session 2: Line Highlighting (3-4 hours)**

**Steps:**
1. Implement line detection algorithm (1.5 hours)
2. Integrate with TTS boundary events (1 hour)
3. Add highlighting mode selector to popup (30 min)
4. Test line transitions (45 min)
5. Build and commit (15 min)

**Deliverable:** Three highlighting modes (paragraph, line, word-by-word)

---

### **Session 3: Focus Mode (4-6 hours)**

**Steps:**
1. Research Canvas DOM structure (30 min)
2. Build element detection and hiding logic (2 hours)
3. Add toggle and options to popup (1 hour)
4. Test on all Canvas page types (1.5 hours)
5. Handle edge cases (30 min)
6. Build and commit (15 min)

**Deliverable:** Working focus mode that hides distractions

---

## 🎯 Success Criteria

**Text Customization:**
- ✅ All WCAG 2.2 SC 1.4.12 spacing requirements met
- ✅ Font changes apply without page reload
- ✅ OpenDyslexic font loads successfully
- ✅ Code blocks preserve original formatting
- ✅ Settings persist across sessions

**Line Highlighting:**
- ✅ Accurately detects line breaks at multiple screen widths
- ✅ Smooth transitions between lines
- ✅ Toggle between all three highlighting modes works
- ✅ No performance lag on long paragraphs

**Focus Mode:**
- ✅ Hides 90%+ of distracting Canvas elements
- ✅ Preserves main content readability
- ✅ Toggle on/off works seamlessly
- ✅ Critical buttons remain accessible
- ✅ Works on all Canvas page types

---

## 🔄 Integration with Existing Features

**Feature Compatibility Matrix:**

| Feature | TTS | Highlighting | Word-by-Word | Speed Presets | Settings |
|---------|-----|--------------|--------------|---------------|----------|
| **Text Customization** | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Independent |
| **Line Highlighting** | ✅ Required | ⚠️ Replaces existing modes | ⚠️ Alternative mode | ✅ Compatible | ✅ Independent |
| **Focus Mode** | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Independent |

**Key Integration Points:**
1. Text Customization runs independently of TTS
2. Line Highlighting shares the same highlighting system but uses different mode
3. Focus Mode is completely independent, just hides elements

---

## 📝 Documentation Requirements

**For Each Feature:**
- [ ] Add decision log entry to projectmemory.md
- [ ] Update DEVELOPMENT_WORKFLOW.md with implementation patterns
- [ ] Add feature description to README.md (when created)
- [ ] Document WCAG compliance (for Text Customization)
- [ ] Add inline code comments explaining complex logic

---

## 🚦 Ready to Implement?

This implementation strategy covers:
✅ Complete architecture for all three features
✅ Detailed code examples with feature isolation
✅ UI components and event handlers
✅ Testing checklists
✅ Edge case handling
✅ Timeline and session breakdown

**Next Step:** Choose which feature to implement first.

**My recommendation:** Start with **Text Customization** because:
1. Foundation for accessibility
2. WCAG compliance critical
3. Independent of other features
4. Immediate user value
5. Lowest risk

Shall we proceed with implementing Text Customization?
