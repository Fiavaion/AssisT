# 🔧 AssisT Troubleshooting Guide

**Quick solutions to common issues**

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Text-to-Speech Problems](#text-to-speech-problems)
3. [LMS Integration Issues](#lms-integration-issues)
4. [Settings Not Saving](#settings-not-saving)
5. [Dyslexia Mode Issues](#dyslexia-mode-issues)
6. [Performance Issues](#performance-issues)
7. [Browser Compatibility](#browser-compatibility)
8. [Debugging Tools](#debugging-tools)

---

## Installation Issues

### Extension Won't Load

**Symptom:** Chrome shows "Failed to load extension" or "Manifest file is missing or unreadable"

**Solutions:**

1. Verify you're loading the `Output` folder, not the `src` folder
2. Run `npm run build` to ensure the extension is built
3. Check that `manifest.json` exists in the `Output` folder
4. Ensure you're using **Google Chrome** (not Firefox, Edge, etc.)
5. Try disabling other extensions that might conflict

### Extension Icon Not Appearing

**Symptom:** Extension loads but no icon in toolbar

**Solutions:**

1. Click the **puzzle piece icon** in Chrome toolbar
2. Find "AssisT" in the list
3. Click the **pin icon** to pin it to the toolbar
4. Refresh Chrome: Right-click icon → Reload extension

### Build Fails

**Symptom:** `npm run build` shows errors

**Solutions:**

1. Ensure Node.js v16+ is installed: `node --version`
2. Delete `node_modules` and `package-lock.json`
3. Run `npm install` again
4. Check for syntax errors in `src/` files
5. Ensure file paths use correct separators (Windows: `\`, Mac/Linux: `/`)

### Multiple Extensions Conflict

**Symptom:** "[NCAD Content]" appears in console instead of "[AssisT Content]"

**Solution:**

1. Go to `chrome://extensions/`
2. **DISABLE or REMOVE** any other accessibility extensions
3. Keep ONLY AssisT enabled
4. Reload the page

---

## Text-to-Speech Problems

### TTS Not Speaking

**Symptom:** No audio when clicking "Read" or selecting text

**Solutions:**

1. **Enable TTS:** Open popup, toggle "Enable TTS" to ON
2. **Select a Voice:** Choose a voice from the dropdown (not "Default")
3. **Check Volume:**
   - Increase volume slider in popup
   - Check system volume and Chrome tab audio
   - Right-click Chrome tab → Unmute if muted
4. **Refresh Page:** Sometimes speech synthesis needs a page reload
5. **Try Another Voice:** Some voices fail on certain systems

### TTS Cuts Off Mid-Sentence

**Symptom:** Speech stops unexpectedly before finishing

**Solutions:**

1. **Browser Limitation:** Chrome's Web Speech API has a ~15-second limit per utterance
2. **Workaround:** Use shorter text selections
3. **Check Console:** Right-click popup → Inspect → Console for errors
4. **Try Slower Speed:** Some voices glitch at high speeds

### No Highlighting During TTS

**Symptom:** Text is spoken but no visual highlighting appears

**Solutions:**

1. **Enable Highlighting:** Check "Highlight Text" is ON in popup
2. **Check Element Visibility:** Highlighting only works on visible text
3. **Content Script Issue:** Refresh the page to reinject the content script
4. **Z-index Conflict:** Some websites override highlight styles (rare)

### Voice List is Empty

**Symptom:** Voice dropdown shows only "Default" or no voices

**Solutions:**

1. **Wait for Voices to Load:** They load asynchronously after page load
2. **Refresh Popup:** Close and reopen the popup
3. **Check Browser Permissions:** Ensure Chrome has microphone/speech permissions
4. **macOS Users:** Go to System Preferences → Accessibility → Speech → Enable voices
5. **Windows Users:** Go to Settings → Time & Language → Speech → Add voices

### Highlighting Color Not Changing

**Symptom:** Highlight stays yellow even after changing color

**Solutions:**

1. Click **"Save Changes"** in Advanced Options
2. Refresh the page where you're reading
3. Check that opacity isn't set to 0%
4. Ensure TTS highlighting is enabled

---

## LMS Integration Issues

### No FAB Button Appears

**Symptom:** Floating Action Button doesn't appear on Canvas/Moodle/Google Classroom

**Solutions:**

1. **Enable Integration:**
   - Click ⚙️ Options → Features tab
   - Scroll to 🎓 LMS Integration
   - Enable your platform (Canvas/Moodle/Google Classroom)
   - Click "Save Changes"
2. **Refresh Page:** FAB appears after page reload
3. **Check Page Type:** FABs only appear on:
   - Canvas: Assignment, Discussion, Course Page
   - Moodle: Assignment, Forum, Page Resource
   - Google Classroom: Assignment, Stream, Classwork
4. **Check URL:** Ensure you're on the correct domain:
   - Canvas: `*.instructure.com`
   - Moodle: Sites with Moodle in URL or specific selectors
   - Google Classroom: `classroom.google.com`
5. **Check Console:** Right-click → Inspect → Console for `[Canvas]`, `[Moodle]`, or `[GoogleClassroom]` logs

### FAB Button Not Reading Content

**Symptom:** FAB appears but clicking it does nothing or shows error

**Solutions:**

1. **Enable TTS First:** Main TTS must be enabled in popup
2. **Content Not Found:** Page structure may have changed
   - Check console for adapter errors
   - Report the issue with page URL
3. **Adapter Loading Failed:** Check console for import errors
4. **Permissions Issue:** Ensure extension has access to the LMS domain
   - Go to `chrome://extensions/`
   - Click "Details" on AssisT
   - Check "Site access" includes your LMS

### Wrong FAB Color/Branding

**Symptom:** FAB has wrong color or doesn't match platform

**Solutions:**

- **Canvas:** Should be purple gradient
- **Moodle:** Should be orange/gold gradient
- **Google Classroom:** Should be blue/green gradient

If wrong:

1. Check which adapter is loading (console logs)
2. Platform detection may be incorrect
3. Report the issue with URL and screenshot

### FAB Appears on Wrong Pages

**Symptom:** FAB shows up on non-content pages (dashboard, settings, etc.)

**Solutions:**

1. **Expected Behavior:** Some pages may trigger detection
2. **Workaround:** Disable LMS integration when not reading content
3. **Report Issue:** If intrusive, report specific page URL

---

## Settings Not Saving

### Settings Reset After Closing Popup

**Symptom:** All settings revert to defaults when reopening popup

**Solutions:**

1. **Click "Save Changes":** Advanced Options require explicit save
2. **Chrome Storage Quota:** Check `chrome://settings/content/all` for storage
3. **Incognito Mode:** Settings don't persist in incognito (by design)
4. **Extension Reload:** Reloading extension clears unsaved settings
5. **Check Console:** Look for storage API errors

### Reset Storage Manually

**Solution:**

1. Go to `chrome://extensions/`
2. Click "service worker" link under AssisT
3. In service worker console, run: `chrome.storage.local.clear()`
4. Reload extension
5. Extension will reinitialize default settings

### Profiles Not Saving

**Symptom:** Custom profiles disappear after closing Chrome

**Solutions:**

1. **Save Profile:** Click "Save Profile" button after creating
2. **Export Backup:** Export profiles as JSON files for safety
3. **Storage API Issue:** Check for errors in console
4. **Profile Name:** Ensure name is unique (no duplicates)

### Feature Visibility Resets

**Symptom:** Hidden features reappear after page reload

**Solutions:**

1. Click **"Save Changes"** in Advanced Options → Features tab
2. Check that `show_*` keys are saved in `chrome.storage.local`
3. Debug: Right-click popup → Inspect → Application → Storage → Local Storage

---

## Dyslexia Mode Issues

### Dyslexia Mode Not Applying

**Symptom:** Toggle is ON but text doesn't change

**Solutions:**

1. **Select a Mode:** Choose Bionic, Syllable, or Grammar from dropdown
2. **Refresh Page:** Mode applies to newly loaded content
3. **Check Target Site:** Some sites block style injection (rare)
4. **Performance Optimization:** Large pages (>10,000 words) may have delays
5. **Console Errors:** Check for NLP library loading errors

### Text Looks Broken/Garbled

**Symptom:** Dyslexia mode makes text unreadable

**Solutions:**

1. **Reduce Color Intensity:** Lower the slider to 30-50%
2. **Change Mode:** Try a different algorithm (Bionic vs Syllable)
3. **Disable Mode:** Toggle OFF, refresh page
4. **Website Conflict:** Some CSS overrides AssisT styles
5. **Report Issue:** Send screenshot with website URL

### Grammar Colors Incorrect

**Symptom:** Words have wrong colors (nouns shown as verbs, etc.)

**Solutions:**

1. **NLP Limitation:** `compromise.js` has ~95% accuracy on English
2. **Non-English Text:** Grammar mode only supports English
3. **Context-Dependent:** Some words are ambiguous (e.g., "read" - noun or verb?)
4. **Workaround:** Use Bionic or Syllable mode instead

### Performance Lag with Dyslexia Mode

**Symptom:** Page becomes slow when Dyslexia Mode is enabled

**Solutions:**

1. **Expected:** Processing 10,000+ words takes time
2. **Optimization:** Use on specific sections, not entire long pages
3. **Reduce Intensity:** Lower slider reduces processing overhead
4. **Disable on Heavy Pages:** Turn off for Wikipedia-length articles
5. **Check Console:** Look for timeout warnings

---

## Performance Issues

### Extension Makes Browser Slow

**Symptom:** Chrome tabs lag or freeze when AssisT is active

**Solutions:**

1. **Disable Unused Features:** Hide features via Advanced Options → Features
2. **Limit Dyslexia Mode:** Only enable on pages where needed
3. **Check Memory:** Chrome Task Manager (Shift+Esc) → Find AssisT
4. **Update Chrome:** Ensure latest version installed
5. **Disable Other Extensions:** Conflicts with other accessibility extensions

### Page Load Times Increased

**Symptom:** Websites load slower with AssisT installed

**Solutions:**

1. **Content Script Injection:** AssisT injects on all pages (configurable)
2. **Reduce Permissions:** Edit `manifest.json` to limit domains
3. **Lazy Loading:** LMS integrations load adapters only when needed
4. **Check Network:** Console → Network tab for slow requests

### High Memory Usage

**Symptom:** AssisT uses excessive RAM (>100MB)

**Solutions:**

1. **Expected Range:** 20-50MB is normal, 100MB+ is high
2. **Memory Leak Check:** Use Chrome DevTools → Performance → Memory
3. **Disable Features:** Turn off Screen Overlay, Dyslexia Mode
4. **Reload Extension:** `chrome://extensions/` → Reload
5. **Report Issue:** If persistent, submit bug report with screenshots

---

## Browser Compatibility

### AssisT Only Works in Chrome

**Symptom:** Want to use in Firefox, Edge, Safari, etc.

**Answer:**

- **Chrome/Chromium:** Fully supported ✅
- **Microsoft Edge:** Should work (Chromium-based) ⚠️
- **Brave:** Should work (Chromium-based) ⚠️
- **Firefox:** Not supported (requires Manifest V2/V3 conversion) ❌
- **Safari:** Not supported (requires Safari Web Extension conversion) ❌

**Edge/Brave Users:**

1. Load unpacked extension same as Chrome
2. Most features should work
3. Report any issues specific to your browser

### Web Speech API Not Available

**Symptom:** Error: "SpeechSynthesis API not supported"

**Solutions:**

1. **Update Browser:** Ensure Chrome is up to date
2. **HTTPS Required:** Some APIs require secure context (not `http://`)
3. **Private/Incognito:** Some browsers restrict APIs in private mode
4. **Check `chrome://flags`:** Ensure Speech APIs aren't disabled

---

## Debugging Tools

### Enable Console Logging

**Popup Console:**

1. Right-click AssisT icon → "Inspect popup"
2. Console tab shows popup.js logs

**Expected Output:**

```
[Popup] Initializing...
[Popup] Settings loaded: {tts: {...}, stt: {...}, ...}
[Popup] Loaded XX voices
[Popup] Initialized
```

**Content Script Console:**

1. Right-click webpage → "Inspect"
2. Console tab shows content-simple.js logs
3. Look for prefixes: `[TTS]`, `[Canvas]`, `[Moodle]`, `[GoogleClassroom]`

**Expected Output:**

```
[AssisT Content] Initialized
[Canvas] Adapter loaded
[Canvas] Page type detected: assignment
[Canvas] Assignment Reader initialized
```

**Background Script Console:**

1. Go to `chrome://extensions/`
2. Find AssisT → Click "Inspect views: service worker"
3. Console tab shows background.js logs

**Expected Output:**

```
[AssisT] Background service worker initialized
[AssisT] Extension installed: install
[Storage] Default settings initialized
```

### Check Storage Data

**View Saved Settings:**

1. Right-click popup → "Inspect popup"
2. Go to **Application tab**
3. Expand **Storage → Local Storage**
4. Click `chrome-extension://[extension-id]`
5. View `assist_settings` key

### Check Permissions

**Verify Extension Permissions:**

1. Go to `chrome://extensions/`
2. Click "Details" on AssisT
3. Check "Site access":
   - Should show "On all sites" OR
   - Specific LMS domains (Canvas, Moodle, Classroom)

### Verify File Structure

The `Output` folder should contain:

```
Output/
├── manifest.json
├── adapters/
│   ├── canvas-adapter.js
│   ├── moodle-adapter.js
│   ├── google-classroom-adapter.js
│   └── ...
├── background/
│   └── service-worker.js
├── content/
│   └── content-simple.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── ...
```

Check with: `ls -R Output/` (Mac/Linux) or `dir /s Output` (Windows)

### Export Diagnostic Info

**When Reporting Bugs, Include:**

1. **Chrome Version:** `chrome://version/`
2. **Extension Version:** Check `manifest.json` → `version`
3. **Console Errors:** Screenshot of Console tab
4. **Steps to Reproduce:** Exact sequence of actions
5. **Expected vs Actual:** What should happen vs what happened
6. **Settings:** Export current profile as JSON

---

## Common Error Messages

### "Extension context invalidated"

**Cause:** Extension was reloaded or updated while page was open

**Solution:**

- Refresh the webpage
- This is normal after extension updates

### "Cannot access chrome.storage"

**Cause:** Storage API permissions missing or quota exceeded

**Solution:**

1. Check `manifest.json` includes `"storage"` permission
2. Clear extension storage: Right-click icon → Options → Reset Settings
3. Check `chrome://settings/content/all` for storage restrictions

### "Failed to load adapter"

**Cause:** LMS adapter module failed to import

**Solution:**

1. Check that adapter files exist in `Output/adapters/` folder
2. Run `npm run build` to ensure all files copied
3. Check console for specific file path errors

### "Speech synthesis failed"

**Cause:** Browser's TTS engine encountered an error

**Solution:**

1. Try a different voice
2. Reduce text length (split into smaller chunks)
3. Reload the page
4. Restart Chrome

### "Message channel closed before a response was received"

**Cause:** Service worker not responding or conflicting extension

**Solutions:**

1. **Check service worker console** for actual errors
2. **Disable other extensions**
3. **Reload service worker:**
   - Go to `chrome://extensions/`
   - Click "service worker" link
   - Click "Reload" in that console
4. **Try hard refresh:** Ctrl+Shift+R on the extension reload button

---

## Clean Reinstall Procedure

If all else fails, perform a clean reinstall:

1. **Backup settings** (export profiles if needed)
2. **Remove extension:**
   - Go to `chrome://extensions/`
   - Click "Remove" on AssisT
3. **Delete build:**
   ```bash
   rm -rf Output/
   rm -rf node_modules/
   ```
4. **Reinstall dependencies:**
   ```bash
   npm install
   ```
5. **Rebuild extension:**
   ```bash
   npm run build
   ```
6. **Load extension:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `Output` folder

---

## Still Having Issues?

### Before Reporting a Bug

1. **Check this guide** for your specific issue
2. **Try basic troubleshooting:**
   - Reload extension
   - Refresh webpage
   - Restart Chrome
   - Try in incognito mode (to rule out conflicts)
3. **Check existing issues:** [GitHub Issues](https://github.com/MarJone/AssisT/issues)

### Report a Bug

Use the bug report template in [TESTING_GUIDE.md](../../TESTING_GUIDE.md):

```markdown
**Bug Description:** [What went wrong?]
**Steps to Reproduce:** [How to trigger the bug?]
**Expected Behavior:** [What should happen?]
**Actual Behavior:** [What actually happened?]
**Environment:**

- Chrome Version: [e.g., 120.0.6099.109]
- AssisT Version: [e.g., Sprint 9]
- Operating System: [e.g., Windows 11, macOS 14]
  **Console Errors:** [Copy/paste from Console tab]
  **Screenshots:** [Attach if relevant]
```

### Get Help

- **Documentation:** [USER_GUIDE.md](USER_GUIDE.md), [QUICK_START.md](QUICK_START.md)
- **GitHub Issues:** https://github.com/MarJone/AssisT/issues
- **Chrome Extension Help:** https://developer.chrome.com/docs/extensions/

---

**📌 Tip:** Most issues are resolved by:

1. Reloading the extension
2. Refreshing the webpage
3. Checking that settings are saved
4. Ensuring TTS is enabled

---

**Last Updated:** 2025-10-13
