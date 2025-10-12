# Stable Version Guide - MVP-TTS-Stable-v1.0

## 📌 Quick Reference

**Version:** MVP-TTS-Stable-v1.0
**Date:** October 11, 2025
**Commit:** `5e247a2fa3cf7bfb812646f69b288d4926d6513f`
**Status:** ✅ Fully Functional & Tested

---

## 🎯 What This Version Does

This is a **stable checkpoint** of the AssisT extension with fully working TTS (Text-to-Speech) functionality. All features have been tested and confirmed working.

### Core Features

1. **Click-to-Read TTS**
   - Click any paragraph on a webpage to have it read aloud
   - Uses browser's built-in speech synthesis (no internet required)
   - Visual outline appears around paragraph being read

2. **Text Highlighting**
   - Paragraph is highlighted while being read
   - Choose from 8 different highlight colors
   - Adjust opacity from 10% to 100%
   - Toggle highlighting on/off

3. **Voice Controls**
   - Default: Google UK English Female voice
   - Select from all available system voices
   - Speed: 0.5x to 2.0x (adjustable)
   - Pitch: 0.5 to 2.0 (adjustable)
   - Volume: 0% to 100% (adjustable)

4. **Keyboard Shortcuts**
   - **Spacebar:** Pause/Resume reading
   - **+ or =:** Increase speed
   - **-:** Decrease speed

5. **Settings**
   - All settings persist across browser sessions
   - Real-time updates (changes apply immediately)
   - Reset button to restore defaults

---

## 🚀 How to Use This Version

### First Time Setup

1. **Clone or Checkout:**
   ```bash
   # If starting fresh
   git clone https://github.com/MarJone/AssisT.git
   cd AssisT
   git checkout MVP-TTS-Stable-v1.0

   # If already have repo
   git fetch --tags
   git checkout MVP-TTS-Stable-v1.0
   ```

2. **Build Extension:**
   ```bash
   npm install
   npm run build
   ```

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `Output` folder

### Daily Usage

1. **Enable TTS:**
   - Click the AssisT extension icon in Chrome toolbar
   - Toggle "Enable TTS" switch to ON
   - Options will appear below the toggle

2. **Read Text:**
   - Navigate to any webpage
   - Click on any paragraph you want to read
   - Speech starts automatically

3. **Control Playback:**
   - Press **Spacebar** to pause
   - Press **Spacebar** again to resume
   - Click another paragraph to switch

4. **Adjust Settings:**
   - Open extension popup
   - Adjust speed, pitch, volume sliders
   - Changes apply immediately to current speech
   - Try different voices from dropdown

5. **Customize Highlighting:**
   - Toggle "Text Highlighting" ON to show options
   - Choose highlight color
   - Adjust opacity slider
   - Toggle OFF to hide options (highlighting disabled)

---

## 🔄 Reverting to This Version

If you're testing new features and want to return to this stable version:

### Option 1: Hard Reset (Destructive)
```bash
# ⚠️ WARNING: This discards all changes since this version
git reset --hard MVP-TTS-Stable-v1.0
npm run build
```

### Option 2: Create Branch from This Version (Recommended)
```bash
# Create a new branch from stable version
git checkout -b my-experiment MVP-TTS-Stable-v1.0
npm run build

# Work on your new feature...

# If you want to go back to main
git checkout main
```

### Option 3: Temporarily Test This Version
```bash
# Detached HEAD state (for testing only)
git checkout MVP-TTS-Stable-v1.0
npm run build

# When done testing, return to main
git checkout main
```

---

## 📁 File Structure

### Core Files (Do Not Modify Without Documentation)

```
src/
├── content/
│   └── content-simple.js          # Main TTS logic (~400 lines)
├── popup/
│   ├── popup.html                 # Extension popup UI
│   ├── popup.css                  # Styling (compact 340px)
│   └── popup.js                   # Popup event handlers
└── background/
    └── service-worker.js          # Background processes

manifest.json                       # Extension configuration
```

### Documentation Files

```
DEVELOPMENT_WORKFLOW.md             # How to add new features
projectmemory.md                    # Decision log and rationale
STABLE_VERSION_GUIDE.md            # This file
CLAUDE.md                          # Project configuration
```

---

## 🧪 Testing Checklist

Use this to verify the version works after checkout:

- [ ] Extension loads without errors in Chrome
- [ ] TTS toggle appears in popup
- [ ] Clicking paragraph starts speech
- [ ] Paragraph is highlighted during speech
- [ ] Spacebar pauses speech
- [ ] Spacebar resumes speech
- [ ] +/- keys change speed
- [ ] Speed changes apply immediately
- [ ] Voice selection works
- [ ] Highlight toggle shows/hides options
- [ ] Highlight color changes work
- [ ] Highlight opacity slider works
- [ ] Reset button restores defaults
- [ ] Options button opens modal
- [ ] Settings persist after closing popup
- [ ] Settings persist after browser restart

---

## 🐛 Known Issues & Limitations

### What Works Perfectly
✅ All listed features above work reliably

### Known Limitations
⚠️ **Not Implemented:**
- Word-by-word highlighting (only paragraph-level)
- Speech-to-text (STT)
- Canvas LMS specific integrations
- Cloud TTS engines (Google Cloud, Azure, etc.)
- Mobile browser support
- Reading entire page (only click-to-read)

⚠️ **Browser Compatibility:**
- Chrome/Edge: ✅ Fully supported
- Firefox: ⚠️ Not tested (different API)
- Safari: ⚠️ Not tested
- Mobile: ❌ Not optimized

### Design Decisions
These are intentional:
- Single paragraph reading only (not continuous page reading)
- Manual paragraph selection (no auto-advance)
- Simple outline highlight (no word-by-word)
- Desktop focus (mobile TBD)

---

## 🔮 Future Development

### Adding New Features

When you're ready to add features beyond this stable version:

1. **Read First:**
   - Review `DEVELOPMENT_WORKFLOW.md` completely
   - Understand feature isolation principles
   - Follow the development template

2. **Create Branch:**
   ```bash
   # Start from stable version
   git checkout -b feature-name MVP-TTS-Stable-v1.0
   ```

3. **Follow Patterns:**
   - Isolate new features from existing TTS code
   - Use toggle-based UI (feature on/off)
   - Add feature-specific state with prefixes
   - Test new feature doesn't break TTS

4. **Document:**
   - Add decision log entry in `projectmemory.md`
   - Update this guide if needed
   - Write clear commit messages

### Planned Features (Examples)

These could be added as isolated features:

- **Read Selection:** Right-click menu to read highlighted text
- **Word-by-word Highlighting:** More granular highlighting during speech
- **Continuous Reading:** Auto-advance to next paragraph
- **Reading List:** Queue multiple paragraphs
- **Skip/Previous:** Navigate between paragraphs
- **Bookmarks:** Save position in long articles
- **Speed Presets:** Quick-select common speeds
- **Canvas Integration:** Special handling for Canvas LMS content

Each would be:
- Separate toggle in popup
- Own collapsible options section
- Isolated state management
- No modification of TTS core code

---

## 📞 Support & Questions

### Getting Help

**Before asking for help, verify:**
1. You're on the correct version: `git describe --tags` should show `MVP-TTS-Stable-v1.0`
2. You ran `npm run build` after checkout
3. You reloaded the extension in Chrome
4. You checked console for errors (F12 → Console)

**Common Issues:**

| Problem | Solution |
|---------|----------|
| "Extension won't load" | Run `npm run build`, reload extension |
| "TTS not working" | Check if TTS toggle is ON in popup |
| "No sound" | Check system volume, Chrome volume, extension volume slider |
| "Spacebar scrolls page" | Click the paragraph first to start reading |
| "Wrong voice" | Select desired voice in popup dropdown |
| "Can't find tag" | Run `git fetch --tags` first |

**Logs for Debugging:**

Press F12 on any webpage, check Console for:
- `[AssisT] Content script loaded` (should appear on page load)
- `[AssisT] Reading: ...` (when clicking paragraph)
- `[AssisT] Paused/Resumed` (when pressing spacebar)

---

## 🎓 Key Learnings

These lessons learned led to this stable version:

1. **Simplicity Wins:** Single-file was faster to debug than modular architecture
2. **Manual State Tracking:** Don't trust browser API states for critical features
3. **Iterative Fixes:** Fix one thing at a time, test, commit
4. **Progressive Disclosure:** Hide complexity behind toggles
5. **User Testing:** Real user feedback found issues faster than tests

---

## 📊 Version History

| Version | Date | Description |
|---------|------|-------------|
| MVP-TTS-Stable-v1.0 | 2025-10-11 | First fully functional TTS version |
| (Future) | TBD | Additional features as isolated modules |

---

## 🎉 Success Criteria

This version is considered successful because:

✅ **Reliability:** All features work consistently
✅ **Performance:** No noticeable lag or delays
✅ **User Experience:** Intuitive UI, clear feedback
✅ **Persistence:** Settings save correctly
✅ **Stability:** No crashes or errors in console
✅ **Documentation:** Fully documented decisions and architecture

---

## 🔒 Safety Guarantee

**This tag is immutable.** You can always return to this exact working state:

```bash
git checkout MVP-TTS-Stable-v1.0
npm run build
```

No matter what experiments you try, this version will always be available as a safe fallback.

---

**Last Updated:** 2025-10-11
**Maintained By:** Development Team
**Status:** Production Ready ✅
