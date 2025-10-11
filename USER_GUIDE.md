# AssisT User Guide

## Quick Start

AssisT is a Text-to-Speech extension designed to make Canvas VLE more accessible for neurodivergent students.

### Installation

1. **Build the extension:**
   ```bash
   npm run build
   ```

2. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `Output` folder

3. **Navigate to Canvas:**
   - Go to any Canvas page (e.g., `https://canvas.instructure.com/`)
   - The extension will automatically initialize

---

## Features Overview

### 1. Main Toggle

Click the AssisT extension icon to open the popup.

**Enable TTS Toggle:**
- Turn on/off the Text-to-Speech functionality
- When enabled, all TTS features become active

**Show/Hide Options Button:**
- Click to expand or collapse advanced options
- Keeps the interface clean and accessible

---

## Basic Controls

### Playback Controls

Three main buttons are available when TTS is enabled:

1. **Read Page** - Starts reading all text content on the current page
2. **Pause** - Pauses the current reading (changes to "Resume" when paused)
3. **Stop** - Stops reading and clears highlighting

---

## Advanced Options

Click "Show Options" to access these settings:

### Voice Selection

- **Default Voice:** Google UK Female (automatically selected)
- **Dropdown:** Choose from all available system voices
- Voices are grouped by language for easy selection

### Speed Control

- **Slider:** Adjust reading speed from 0.5x to 2.0x
- **Default:** 1.0x (normal speed)
- **Keyboard Shortcuts:**
  - Press `+` or `=` to increase speed
  - Press `-` to decrease speed
  - Visual toast notification shows current speed

### Pitch Control

- **Slider:** Adjust voice pitch from 0.5 to 2.0
- **Default:** 1.0 (normal pitch)
- Lower values = deeper voice
- Higher values = higher-pitched voice

### Volume Control

- **Slider:** Adjust volume from 0% to 100%
- **Default:** 100%
- Independent of system volume

### Text Highlighting

**Enable/Disable Toggle:**
- Turn highlighting on/off during reading
- **Default:** Enabled

**Highlight Color:**
Select from 8 preset colors optimized for accessibility:
- Yellow (High Contrast) - Best for most users
- Bright Yellow
- Gold
- Light Green
- Sky Blue
- Light Pink
- Plum
- Khaki

**Highlight Opacity:**
- **Slider:** Adjust from 10% (transparent) to 100% (solid)
- **Default:** 70%
- Helps reduce visual overwhelm
- Higher opacity = more visible
- Lower opacity = more subtle

---

## Keyboard Shortcuts

All shortcuts work when you're not typing in an input field:

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume reading |
| `+` or `=` | Increase speed by 0.1x |
| `-` | Decrease speed by 0.1x |

**Note:** Speed changes show a toast notification in the bottom-right corner.

---

## Click-to-Read Feature

### How to Use

1. Enable TTS in the popup
2. Hold `Ctrl` key
3. Click on any paragraph or text block
4. That specific text will be read aloud with highlighting

### Visual Feedback

- **Blue Outline:** Shows which element is being read
- **Highlight:** Words are highlighted as they're spoken
- **Color/Opacity:** Uses your selected settings

### Supported Elements

The click-to-read feature works on:
- Paragraphs (`<p>`)
- Canvas content blocks (`.user_content`)
- Descriptions (`.description`)
- Articles and sections
- List items

---

## Tips for Best Experience

### For Dyslexia

- Use **Light Green** or **Sky Blue** highlight color
- Set opacity to **50-60%** for comfortable reading
- Slower speed: **0.8-0.9x**
- Google UK Female voice (default) has clear pronunciation

### For ADHD

- Use **Yellow (High Contrast)** for focus
- Higher opacity: **80-90%**
- Faster speed: **1.2-1.5x**
- Use click-to-read for specific paragraphs instead of full page

### For Visual Processing Issues

- Lower opacity: **30-40%**
- Slower speed: **0.6-0.8x**
- Use **Khaki** or **Light Pink** for softer contrast
- Enable highlighting to follow along visually

### For Auditory Learners

- Normal speed: **1.0x**
- Use **Pause** (`Space`) to take notes
- Click-to-read specific sections for review
- Use speed shortcuts (`+`/`-`) to find optimal pace

---

## Troubleshooting

### Extension Not Working

1. **Check if extension is enabled:**
   - Go to `chrome://extensions/`
   - Verify AssisT is toggled ON

2. **Reload the page:**
   - Press `F5` or `Ctrl+R`
   - Extension loads on page load

3. **Check console:**
   - Press `F12` to open DevTools
   - Look for `[AssisT Content] Initialized`

### No Voices Available

1. **Wait a few seconds:**
   - Voices load asynchronously
   - Close and reopen the popup

2. **Check browser voices:**
   - Some systems have limited voices
   - Install more voices in system settings

### Highlighting Not Working

1. **Check if enabled:**
   - Open popup
   - Verify "Text Highlighting" is ON

2. **Try different opacity:**
   - Very low opacity may be invisible
   - Try 70% or higher

3. **Color contrast:**
   - Yellow works best on white backgrounds
   - Try different colors for different page styles

### Keyboard Shortcuts Not Working

1. **Check if focused on input:**
   - Click outside any text field
   - Shortcuts don't work in inputs

2. **Try clicking the page first:**
   - Page must have focus
   - Click anywhere on the Canvas page

### Click-to-Read Not Working

1. **Hold Ctrl while clicking:**
   - Must hold `Ctrl` key
   - Regular clicks won't trigger reading

2. **Click directly on text:**
   - Click paragraphs, not images or buttons
   - Look for text-heavy areas

3. **Check TTS is enabled:**
   - Open popup
   - Verify "Enable TTS" is ON

---

## Privacy & Data

AssisT is **FERPA compliant** and prioritizes privacy:

- ✅ All settings stored locally in Chrome
- ✅ No data sent to external servers
- ✅ No tracking or analytics
- ✅ No personal information collected
- ✅ Works entirely on your device

### What's Stored

- Voice preference
- Speed, pitch, volume settings
- Highlight color and opacity
- TTS enable/disable state

### What's NOT Stored

- Text content from pages
- Your Canvas data
- Your browsing history
- Any personal information

---

## Accessibility Features

AssisT is built with WCAG 2.2 Level AA compliance:

### Keyboard Navigation

- All controls accessible via keyboard
- Proper focus indicators
- Tab order follows logical flow

### Screen Reader Support

- Proper ARIA labels on all controls
- Semantic HTML structure
- Clear status messages

### Visual Accessibility

- High contrast mode support
- Respects prefers-reduced-motion
- Minimum touch target sizes (44x44px)
- Clear visual feedback

### Cognitive Accessibility

- Simple, uncluttered interface
- Collapsible options to reduce overwhelm
- Clear labels and instructions
- Consistent behavior

---

## Keyboard Reference Card

Print this for quick reference:

```
┌─────────────────────────────────────┐
│   AssisT Keyboard Shortcuts        │
├─────────────────────────────────────┤
│                                     │
│  Space  →  Pause/Resume Reading    │
│                                     │
│  +  =   →  Speed Up                │
│                                     │
│    -    →  Speed Down              │
│                                     │
│  Ctrl + Click  →  Read Paragraph   │
│                                     │
└─────────────────────────────────────┘
```

---

## Advanced Usage

### Reading Specific Sections

1. **Method 1: Click-to-Read**
   - Hold `Ctrl` + Click paragraph
   - Best for quick spot-reading

2. **Method 2: Manual Selection**
   - Copy text you want read
   - Paste into a text document
   - Use "Read Page" on that document

### Speed Reading Training

Start slow and gradually increase:
1. Week 1: 0.8x - Get comfortable with voice
2. Week 2: 1.0x - Normal speed baseline
3. Week 3: 1.2x - Slight challenge
4. Week 4: 1.4x+ - Advanced speed

### Study Sessions

**Pre-reading:**
- Use 1.5x speed for overview
- Just listen, don't take notes
- Get the gist of content

**Deep reading:**
- Use 0.8-1.0x speed
- Pause (`Space`) to take notes
- Use click-to-read for complex paragraphs

**Review:**
- Use 1.2-1.5x speed
- Quick refresh of material
- Focus on highlighted sections

---

## Getting Help

### Documentation

- **This Guide:** USER_GUIDE.md
- **Troubleshooting:** TROUBLESHOOTING.md
- **Diagnostic Tests:** DIAGNOSTIC_TEST.md

### Community

- GitHub Issues: [github.com/MarJone/AssisT/issues](https://github.com/MarJone/AssisT/issues)
- Report bugs or request features

### Contact

For FERPA/privacy questions or accessibility concerns, see the project README.

---

## Version Information

**Current Version:** 0.1.0 (Phase 1.2 - Basic TTS Implementation)

**Recent Updates:**
- ✨ Collapsible options panel
- ✨ Google UK Female default voice
- ✨ Keyboard shortcuts (Space, +, -)
- ✨ Click-to-read paragraphs (Ctrl+Click)
- ✨ Highlight color picker (8 colors)
- ✨ Highlight opacity control
- ✨ Real-time word highlighting
- ✨ Visual feedback (blue outline)
- ✨ Toast notifications

---

## Next Steps

After getting comfortable with basic TTS features, explore:

- **Phase 1.3:** WAI-Adapt Text Spacing (coming soon)
- **Phase 1.4:** Advanced Highlighting & Focus Mode (coming soon)
- **Phase 2:** Speech-to-Text Integration (planned)

---

## Quick Reference: Default Settings

| Setting | Default Value |
|---------|--------------|
| TTS Enabled | OFF (must enable) |
| Voice | Google UK Female |
| Speed | 1.0x |
| Pitch | 1.0 |
| Volume | 100% |
| Highlighting | ON |
| Highlight Color | Bright Yellow (#FFEB3B) |
| Highlight Opacity | 70% |

---

## Credits

AssisT is designed with input from neurodivergent students and accessibility experts to provide the best possible reading experience in Canvas VLE.

Built with:
- Web Speech API
- Chrome Extension Manifest V3
- WAI-ARIA accessibility standards
- WCAG 2.2 Level AA guidelines
- FERPA privacy compliance

---

**Last Updated:** 2025-10-11
**Guide Version:** 1.0
