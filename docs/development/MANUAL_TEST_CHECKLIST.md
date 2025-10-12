# ✅ Manual Test Checklist

## Pre-Test Setup

### 1. Load Extension
- [ ] Open Chrome
- [ ] Go to `chrome://extensions/`
- [ ] Enable "Developer mode"
- [ ] Click "Load unpacked"
- [ ] Select: `C:\Users\jones\AIprojects\AssitT`
- [ ] Verify extension appears

### 2. Open Test Page
Choose one:
- [ ] https://wikipedia.org (any article)
- [ ] https://canvas.instructure.com/
- [ ] Any text-heavy webpage

---

## 🎯 Test Scenarios

### Test 1: Popup Opens
- [ ] Click AssisT extension icon in toolbar
- [ ] Popup opens (360x500px)
- [ ] All controls are visible
- [ ] Header shows "AssisT" with gradient
- [ ] Status shows "Ready"

**Expected**: Clean, modern popup interface

---

### Test 2: Enable TTS
- [ ] Toggle "Enable TTS" switch ON
- [ ] Switch animates smoothly
- [ ] Playback controls become active (not grayed out)
- [ ] Settings are saved (close and reopen popup to verify)

**Expected**: Smooth toggle, controls activate

---

### Test 3: Voice Selection
- [ ] Open "Voice" dropdown
- [ ] Voices are grouped by language (EN, ES, etc.)
- [ ] Select a different voice
- [ ] Voice selection persists (close/reopen popup)

**Expected**: Voices load and selection works

---

### Test 4: Read Page Content
- [ ] Ensure TTS is enabled
- [ ] Click "Read Page" button
- [ ] Status changes to "Reading..." with pulse animation
- [ ] Play button becomes disabled
- [ ] Pause and Stop buttons become enabled
- [ ] **Listen**: Page content is read aloud

**Expected**: Text-to-speech works!

---

### Test 5: Pause/Resume
While reading:
- [ ] Click "Pause" button
- [ ] Speech pauses
- [ ] Status shows "Paused" (orange)
- [ ] Button changes to "Resume"
- [ ] Click "Resume"
- [ ] Speech continues from where it paused
- [ ] Status back to "Reading..."

**Expected**: Pause/resume works smoothly

---

### Test 6: Stop
While reading:
- [ ] Click "Stop" button
- [ ] Speech stops immediately
- [ ] All buttons reset
- [ ] Status shows "Ready"
- [ ] Play button re-enabled

**Expected**: Complete stop and reset

---

### Test 7: Rate Control (Speed)
- [ ] Move rate slider to 1.5x
- [ ] Value updates in real-time
- [ ] Click "Read Page"
- [ ] **Listen**: Speech is faster
- [ ] Try 0.5x (slower)
- [ ] Try 2.0x (fastest)

**Expected**: Speed changes work

---

### Test 8: Pitch Control
- [ ] Move pitch slider to 1.5
- [ ] Value updates
- [ ] Click "Read Page"
- [ ] **Listen**: Voice pitch is higher
- [ ] Try 0.5 (lower pitch)

**Expected**: Pitch changes work

---

### Test 9: Volume Control
- [ ] Move volume slider to 50%
- [ ] Percentage updates
- [ ] Click "Read Page"
- [ ] **Listen**: Volume is lower
- [ ] Try 0% (muted)
- [ ] Try 100% (full volume)

**Expected**: Volume control works

---

### Test 10: Word Highlighting Toggle
- [ ] Enable "Word Highlighting"
- [ ] Click "Read Page"
- [ ] **Look**: Words should highlight as spoken (if DOM adapter supports)
- [ ] Disable highlighting
- [ ] Click "Read Page"
- [ ] **Look**: No highlighting

**Note**: Highlighting may not work fully yet (DOM adapter pending)

---

### Test 11: Settings Persistence
- [ ] Set rate to 1.5x
- [ ] Set pitch to 1.2
- [ ] Set volume to 70%
- [ ] Select a specific voice
- [ ] Close popup
- [ ] Reopen popup
- [ ] **Verify**: All settings are preserved

**Expected**: Settings persist

---

### Test 12: Keyboard Navigation
- [ ] Press Tab to navigate through controls
- [ ] **Look**: Focus indicators visible (blue outline)
- [ ] Press Space on toggle switches
- [ ] Press Enter on buttons
- [ ] Use arrow keys on sliders

**Expected**: Full keyboard accessibility

---

### Test 13: Console Logs (Debug)
- [ ] Right-click popup → Inspect
- [ ] Check Console tab
- [ ] Look for `[Popup]` logs
- [ ] Open test page → F12 → Console
- [ ] Look for `[AssisT Content]` and `[TTS]` logs
- [ ] Verify no errors

**Expected**: Clean logs, no errors

---

### Test 14: Multiple Pages
- [ ] Navigate to different webpage
- [ ] Open popup
- [ ] Click "Read Page"
- [ ] **Verify**: New page content is read
- [ ] Go back to first page
- [ ] **Verify**: Works on both pages

**Expected**: Works across pages

---

## 🐛 Common Issues & Solutions

### Issue: "Tab not accessible" error
**Solution**: Refresh the page (F5) to inject content script

### Issue: No voices in dropdown
**Solution**: Wait a few seconds, voices load asynchronously

### Issue: Nothing happens when clicking "Read Page"
**Check**:
1. Is TTS enabled (toggle on)?
2. Browser console for errors
3. Page has text content?
4. Content script loaded? (Check console for `[AssisT Content]`)

### Issue: Default icon showing
**Expected**: We only have SVG, PNGs not generated yet

---

## ✅ Success Criteria

### Minimum Viable Test
- [ ] Extension loads without errors
- [ ] Popup opens and displays correctly
- [ ] Can enable/disable TTS
- [ ] "Read Page" speaks text aloud
- [ ] Pause/stop controls work
- [ ] At least one slider control works

### Full Test
- [ ] All 14 test scenarios pass
- [ ] No console errors
- [ ] Settings persist
- [ ] Keyboard navigation works
- [ ] Multiple pages work

---

## 📝 Test Results

**Date**: ___________
**Tester**: ___________
**Browser**: Chrome ___________
**Test Page**: ___________

**Overall Result**: ⬜ PASS ⬜ FAIL ⬜ PARTIAL

**Notes**:
```
[Write any issues, bugs, or observations here]
```

---

## 🚀 Next Steps After Testing

If tests pass:
- [ ] Generate PNG icons
- [ ] Begin Phase 1.3 (WAI-Adapt Text Spacing)
- [ ] Document any bugs found

If tests fail:
- [ ] Note specific failures
- [ ] Check browser console for errors
- [ ] Review TESTING_GUIDE.md for troubleshooting

---

**Ready to test? Start with Test 1!** 🎯
