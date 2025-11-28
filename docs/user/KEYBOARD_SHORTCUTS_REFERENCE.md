# Keyboard Shortcuts Reference

AssisT Adaptive EdTech Extension - Complete Keyboard Shortcuts Guide

## Overview

AssisT provides comprehensive keyboard shortcuts for all major features. Shortcuts can be customized in the extension settings and are designed to avoid conflicts with Chrome and common application shortcuts.

## Default Keyboard Shortcuts

### Text-to-Speech (TTS) Controls

| Shortcut           | Action          | Description                                    |
| ------------------ | --------------- | ---------------------------------------------- |
| `Ctrl+Shift+Space` | TTS: Play/Pause | Start, pause, or resume text-to-speech reading |
| `Ctrl+Shift+S`     | TTS: Stop       | Stop TTS playback completely                   |

### Reading & Accessibility

| Shortcut       | Action                   | Description                                      |
| -------------- | ------------------------ | ------------------------------------------------ |
| `Alt+O`        | OCR: Activate Screenshot | Start screenshot capture for OCR text extraction |
| `Alt+R`        | Reading Mode: Toggle     | Enter or exit distraction-free reading mode      |
| `Escape`       | Reading Mode: Exit       | Exit reading mode (also closes modals)           |
| `Alt+Shift+D`  | Dictionary: Lookup       | Look up definition for selected text             |
| `Ctrl+Shift+W` | Text Statistics: Toggle  | Show/hide word count and text statistics         |
| `Ctrl+Shift+H` | Highlight Menu: Toggle   | Show/hide the highlight selection menu           |

### Writing Tools

| Shortcut | Action                   | Description                                  |
| -------- | ------------------------ | -------------------------------------------- |
| `Alt+N`  | Sticky Notes: Create New | Create a new sticky note on the current page |
| `Alt+T`  | Translation: Toggle      | Open translation modal for selected text     |

### Display Modes

| Shortcut      | Action                 | Description                                   |
| ------------- | ---------------------- | --------------------------------------------- |
| `Alt+F`       | Focus Mode: Toggle     | Enable/disable focus mode (dims surroundings) |
| `Alt+G`       | Reading Guide: Toggle  | Show/hide the reading guide ruler             |
| `Alt+Shift+O` | Screen Overlay: Toggle | Enable/disable screen color overlay           |
| `Alt+Y`       | Dyslexia Mode: Toggle  | Enable/disable dyslexia-friendly text styling |

### Speech-to-Text (STT) Profile Switching

| Shortcut       | Action                    | Description                               |
| -------------- | ------------------------- | ----------------------------------------- |
| `Ctrl+Shift+P` | STT Profile: Quick Switch | Cycle through neurodivergent STT profiles |

## Feature-Specific Shortcuts

### Reading Mode

When Reading Mode is active, additional shortcuts are available:

| Shortcut      | Action            | Description                |
| ------------- | ----------------- | -------------------------- |
| `Escape`      | Exit Reading Mode | Return to normal page view |
| `Space`       | Scroll Down       | Scroll down by one screen  |
| `Shift+Space` | Scroll Up         | Scroll up by one screen    |
| Arrow Keys    | Navigate          | Scroll through content     |

### OCR Modal

When the OCR text extraction modal is open:

| Shortcut | Action         | Description                      |
| -------- | -------------- | -------------------------------- |
| `Escape` | Close Modal    | Close the OCR results modal      |
| `Ctrl+C` | Copy Text      | Copy extracted text to clipboard |
| `Space`  | Play/Pause TTS | Control TTS for extracted text   |

### Dictionary Modal

When viewing a dictionary definition:

| Shortcut | Action          | Description                       |
| -------- | --------------- | --------------------------------- |
| `Escape` | Close Modal     | Close the dictionary popup        |
| `Tab`    | Navigate        | Move between interactive elements |
| `Enter`  | Select/Activate | Activate focused button or link   |

### Translation Modal

When the translation modal is open:

| Shortcut | Action           | Description                       |
| -------- | ---------------- | --------------------------------- |
| `Escape` | Close Modal      | Close the translation modal       |
| `Ctrl+C` | Copy Translation | Copy translated text to clipboard |

## Customizing Shortcuts

### Accessing Shortcut Settings

1. Click the AssisT extension icon in Chrome toolbar
2. Click "Advanced Options" at the bottom of the popup
3. Scroll to the "Keyboard Shortcuts" section
4. Click "Edit" next to any shortcut to change it

### Recording a New Shortcut

1. Click "Edit" next to the shortcut you want to change
2. Press your desired key combination
3. The shortcut will be validated automatically
4. Click "Save" to confirm or "Cancel" to revert

### Shortcut Requirements

- **Modifier Key Required**: All shortcuts must include at least one modifier key (Ctrl, Alt, or Shift)
- **Exception**: `Escape` is valid without a modifier
- **Conflicts**: The system prevents shortcuts that conflict with Chrome or other AssisT features

### Reset to Defaults

Click "Reset to Defaults" in the Keyboard Shortcuts section to restore all shortcuts to their original values.

## Reserved Shortcuts

The following shortcuts are reserved by Chrome and cannot be used:

### Tab Management

- `Ctrl+T` - New tab
- `Ctrl+W` - Close tab
- `Ctrl+Shift+T` - Reopen closed tab
- `Ctrl+Tab` - Next tab
- `Ctrl+Shift+Tab` - Previous tab
- `Ctrl+1` through `Ctrl+9` - Switch to specific tab

### Window Management

- `Ctrl+N` - New window
- `Ctrl+Shift+N` - New incognito window
- `Alt+F4` - Close window

### Navigation

- `Ctrl+L` - Focus address bar
- `Ctrl+K` - Focus search
- `Alt+D` - Focus address bar
- `Alt+Left/Right` - Back/Forward

### Page Actions

- `Ctrl+R` / `F5` - Refresh
- `Ctrl+Shift+R` / `Ctrl+F5` - Hard refresh
- `Ctrl+P` - Print
- `Ctrl+S` - Save page

### Browser Functions

- `Ctrl+H` - History
- `Ctrl+J` - Downloads
- `Ctrl+Shift+Delete` - Clear browsing data
- `Ctrl+Shift+B` - Toggle bookmarks bar

### Text Editing

- `Ctrl+A` - Select all
- `Ctrl+C` - Copy
- `Ctrl+V` - Paste
- `Ctrl+X` - Cut
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+F` - Find
- `Ctrl+G` - Find next

### Developer Tools

- `F12` - Toggle DevTools
- `Ctrl+Shift+I` - Open DevTools
- `Ctrl+Shift+J` - Open console
- `Ctrl+Shift+C` - Inspect element

### Zoom

- `Ctrl+Plus` - Zoom in
- `Ctrl+Minus` - Zoom out
- `Ctrl+0` - Reset zoom

### Other

- `Ctrl+O` - Open file
- `Ctrl+U` - View source
- `Ctrl+D` - Bookmark page

## Voice Commands

For hands-free control, AssisT also supports extensive voice commands through the Speech-to-Text feature. See [VOICE_COMMANDS_REFERENCE.md](VOICE_COMMANDS_REFERENCE.md) for the complete list of 60+ voice commands.

## Accessibility Notes

### Screen Reader Compatibility

All keyboard shortcuts are designed to work alongside screen readers:

- Shortcuts use non-conflicting key combinations
- Focus management follows WCAG 2.2 guidelines
- All actions provide audio feedback when TTS is enabled

### Motor Impairment Considerations

- Single-key shortcuts avoided (require modifier)
- Shortcuts can be remapped to accommodate individual needs
- STT voice commands provide keyboard-free alternative

### Visual Impairment Considerations

- High contrast mode preserves shortcut functionality
- Focus indicators clearly visible during keyboard navigation
- Reading Mode optimizes content for low vision users

## Troubleshooting

### Shortcut Not Working?

1. **Check for conflicts**: Another extension may be using the same shortcut
2. **Check if modal is open**: Some shortcuts only work when specific modals are open
3. **Refresh the page**: Shortcuts are registered when content scripts load
4. **Check feature enabled**: Ensure the associated feature is enabled in settings

### Resetting Shortcuts

If shortcuts become corrupted or you want to start fresh:

1. Open Chrome extension settings (`chrome://extensions`)
2. Find AssisT and click "Details"
3. Click "Extension options" or access via popup
4. Navigate to Keyboard Shortcuts section
5. Click "Reset to Defaults"

### Reporting Issues

If you encounter persistent shortcut issues:

1. Note the shortcut combination
2. Note what you expected to happen
3. Note what actually happened
4. Report at: https://github.com/anthropics/claude-code/issues

---

**Document Version**: 1.0
**Last Updated**: 2025-11-28
**Related**: [VOICE_COMMANDS_REFERENCE.md](VOICE_COMMANDS_REFERENCE.md), [STT_USER_GUIDE.md](STT_USER_GUIDE.md)
