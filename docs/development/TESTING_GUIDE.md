# AssisT Extension Testing Guide

## 🧪 Loading the Extension in Chrome

### Step 1: Open Chrome Extensions Page
```
chrome://extensions/
```
Or: Menu → More Tools → Extensions

### Step 2: Enable Developer Mode
- Toggle "Developer mode" switch in the top right corner

### Step 3: Load Unpacked Extension
1. Click "Load unpacked" button
2. Navigate to: `c:\Users\jones\AIprojects\AssitT`
3. Select the folder and click "Select Folder"

### Step 4: Verify Installation
You should see:
- ✅ Extension card with "AssisT: Adaptive EdTech for Canvas"
- ✅ Version 0.1.0
- ✅ "Manage extensions" button
- ⚠️ Icons will show as default (PNG files not yet generated)

---

## 🎯 Testing on Canvas

### Test Sites
1. **Canvas Demo**: https://canvas.instructure.com/
2. **Your Institution's Canvas**: *://*.instructure.com/*

### Test Steps

#### 1. Navigate to Canvas
- Go to any Canvas course page
- Open any assignment, discussion, or page with text content

#### 2. Open Popup
- Click the AssisT extension icon in Chrome toolbar
- Popup should open (360x500px)

#### 3. Test TTS Enable
- [ ] Toggle "Enable TTS" switch
- [ ] Verify playback controls become active

#### 4. Test Voice Selection
- [ ] Open voice dropdown
- [ ] Verify voices are grouped by language
- [ ] Select a different voice
- [ ] Voice should be saved

#### 5. Test Playback
- [ ] Click "Read Page" button
- [ ] Verify text starts being read
- [ ] Status should show "Reading..."
- [ ] Play button should be disabled

#### 6. Test Pause/Resume
- [ ] While reading, click "Pause"
- [ ] Speech should pause
- [ ] Status should show "Paused"
- [ ] Button should change to "Resume"
- [ ] Click "Resume"
- [ ] Speech should continue

#### 7. Test Stop
- [ ] While reading, click "Stop"
- [ ] Speech should stop
- [ ] All buttons should reset
- [ ] Status should show "Ready"

#### 8. Test Rate Control
- [ ] Move rate slider
- [ ] Value should update in real-time
- [ ] Start reading
- [ ] Verify speed change

#### 9. Test Pitch Control
- [ ] Move pitch slider
- [ ] Value should update
- [ ] Start reading
- [ ] Verify pitch change

#### 10. Test Volume Control
- [ ] Move volume slider
- [ ] Percentage should update
- [ ] Start reading
- [ ] Verify volume change

#### 11. Test Highlighting
- [ ] Enable word highlighting
- [ ] Start reading
- [ ] Verify words are highlighted as spoken (if DOM adapter supports it)

---

## 🐛 Known Issues / Expected Behavior

### Current State
- ✅ Popup UI fully functional
- ✅ TTS Controller implemented
- ⚠️ Content script integration pending
- ⚠️ DOM adapter not yet connected
- ⚠️ Icons showing as default (SVG only, no PNGs)

### Expected Issues
1. **"Tab not accessible" error**: Content script not injected yet
2. **No highlighting**: DOM adapter not connected to content script
3. **Default icons**: PNG icons not generated yet

---

## 🔧 Debugging

### View Console Logs
1. **Popup Console**:
   - Right-click popup → Inspect
   - Check Console tab for `[Popup]` logs

2. **Background Console**:
   - Go to `chrome://extensions/`
   - Click "Service worker" under AssisT
   - Check Console for `[Background]` logs

3. **Content Script Console**:
   - Open Canvas page
   - Press F12 → Console tab
   - Check for `[Content]` or `[TTS]` logs

### Common Checks
```javascript
// In popup console:
chrome.storage.local.get(null, console.log); // View all settings

// In content script console:
console.log(window.speechSynthesis.getVoices()); // Check available voices
```

---

## ✅ Testing Checklist

### UI/UX
- [ ] Popup opens correctly (360x500px)
- [ ] All controls are visible and styled
- [ ] Toggle switches animate smoothly
- [ ] Sliders update values in real-time
- [ ] Buttons show hover effects
- [ ] Status indicator updates correctly

### Functionality
- [ ] Settings persist between popup opens
- [ ] Voice list populates
- [ ] Rate/pitch/volume sliders work
- [ ] Enable/disable toggle works
- [ ] All buttons respond to clicks

### Accessibility
- [ ] Tab navigation works
- [ ] Focus indicators visible
- [ ] Screen reader labels present
- [ ] High contrast mode works
- [ ] Reduced motion respected

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Edge (Chromium-based)

---

## 📝 Next Steps

After testing popup UI:
1. Implement content script integration
2. Connect DOM adapter to TTS controller
3. Test word-by-word highlighting
4. Generate PNG icons
5. Test on multiple Canvas pages

---

## 🚨 Troubleshooting

### Popup doesn't open
- Check extension is enabled in chrome://extensions/
- Verify manifest.json has correct popup path
- Check browser console for errors

### Settings don't save
- Open chrome://extensions/
- Check "Errors" button for extension
- Verify chrome.storage permissions

### Voices don't load
- Ensure Web Speech API is supported (Chrome 33+)
- Try refreshing the popup
- Check browser console for errors

---

**Testing Status**: Ready for manual testing
**Date**: 2025-10-11
**Commit**: `0d85c7a`
