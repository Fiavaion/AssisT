# STT Feature Debugging Guide

## Problem: STT Toggles Work But Feature Doesn't Function

You've enabled STT in the popup, but:
- ❌ No microphone button appears when focusing text fields
- ❌ No text is inserted when speaking
- ✅ Toggles in popup work correctly

## Diagnostic Steps

### 1. Check Browser Console

**Open DevTools Console:**
1. Right-click on the webpage
2. Select "Inspect" or press F12
3. Click "Console" tab

**Look for these log messages:**

**✅ Expected logs if working:**
```
[AssisT] Content script loaded
[STT] Settings loaded: true {continuous: true, ...}
[STT] Initialized successfully
[STT] Field focused: TEXTAREA (when you click in a text field)
```

**❌ Error logs that indicate problems:**
```
[STT] Failed to load modules: TypeError: Failed to fetch...
→ Solution: Run `npm run build` and reload extension

[STT] Feature disabled by default
→ Solution: STT is not enabled. Check popup settings.

Speech recognition not supported
→ Solution: Browser doesn't support Web Speech API (see below)
```

### 2. Verify Web Speech API Support

**Test in browser console:**

```javascript
// Paste this in console and press Enter
if ('webkitSpeechRecognition' in window) {
  console.log('✅ Speech Recognition API supported!');
  const recognition = new webkitSpeechRecognition();
  console.log('Recognition object:', recognition);
} else {
  console.log('❌ Speech Recognition NOT supported in this browser');
  console.log('Browser:', navigator.userAgent);
}
```

**Supported Browsers:**
- ✅ Google Chrome (Desktop & Android)
- ✅ Microsoft Edge (Chromium)
- ❌ Firefox (not supported)
- ❌ Safari (limited/experimental support)

### 3. Check Extension Settings

**In popup (extension icon → AssisT):**

1. **Main STT Toggle:** Should show checkmark when enabled
2. **Scroll down** to STT section
3. **Floating Button Toggle:** Must be enabled for mic button to appear
4. **Continuous Mode:** Should be enabled

**Check storage:**
```javascript
// Paste in console
chrome.storage.local.get('assist_settings', (result) => {
  console.log('STT Settings:', result.assist_settings?.stt);
});
```

**Expected output:**
```javascript
{
  enabled: true,           // MUST be true
  continuousMode: true,
  interimResults: true,
  language: "en-US",
  autoCapitalize: true,
  punctuationCommands: true,
  floatingButton: true     // MUST be true for button to show
}
```

### 4. Verify Extension Files Exist

**Check in DevTools → Sources tab:**

Navigate to:
```
chrome-extension://[your-id]/src/engines/stt/stt-controller.js
chrome-extension://[your-id]/src/ui/components/microphone-button.js
```

If files show "404" or don't exist:
```bash
cd c:/Users/jones/AIprojects/AssitT
npm run build
```

Then **reload extension** in chrome://extensions/

### 5. Test Text Field Focus

1. Open any webpage with a text field
2. **Open console FIRST** before clicking
3. Click inside a textarea or input field
4. Console should show:
   ```
   [STT] Field focused: TEXTAREA
   ```

If you see nothing:
- STT is not enabled
- OR: Build is outdated (run `npm run build`)

### 6. Check Microphone Permissions

**If button appears but doesn't work:**

1. Click the mic button
2. Browser should prompt for microphone permission
3. **Allow** microphone access
4. Try clicking mic button again

**If no prompt appears:**
- Check browser settings → Site permissions → Microphone
- Ensure microphone is working in other apps

### 7. Force Enable STT Manually

If popup toggles don't work, force enable via console:

```javascript
chrome.storage.local.set({
  assist_settings: {
    stt: {
      enabled: true,
      continuousMode: true,
      interimResults: true,
      language: 'en-US',
      autoCapitalize: true,
      punctuationCommands: true,
      floatingButton: true
    }
  }
}, () => {
  console.log('STT settings force-enabled!');
  location.reload(); // Reload page to activate
});
```

## Common Issues & Solutions

### Issue: "STT failed to load" in console
**Cause:** Build files out of sync with source files
**Solution:**
```bash
cd c:/Users/jones/AIprojects/AssitT
npm run build
```
Then reload extension in chrome://extensions/

### Issue: No console logs at all
**Cause:** Content script not running
**Solution:**
1. Check chrome://extensions/ - ensure extension is enabled
2. Reload extension
3. Hard refresh webpage (Ctrl+Shift+R)

### Issue: "Speech recognition not supported"
**Cause:** Using unsupported browser
**Solution:** Use Google Chrome or Microsoft Edge

### Issue: Mic button appears then disappears immediately
**Cause:** Focus lost from text field, or floatingButton disabled
**Solution:** Click and hold focus in text field, ensure floatingButton toggle is ON

### Issue: Button appears but speaking doesn't insert text
**Cause:**
1. Microphone permission denied
2. Microphone not working
3. STT Controller initialization failed

**Solution:**
1. Check console for errors
2. Grant microphone permission
3. Test microphone in browser settings

## Still Not Working?

**Provide me with:**
1. Browser name and version
2. All console logs (copy/paste)
3. Screenshot of popup showing STT settings
4. Result of Web Speech API test (step 2)

**Quick Test Webpage:**
```html
<!-- Save as test-stt.html and open in Chrome -->
<!DOCTYPE html>
<html>
<head>
  <title>STT Test</title>
</head>
<body>
  <h1>AssisT STT Test Page</h1>
  <textarea style="width:400px;height:100px;" placeholder="Click here, then look for mic button..."></textarea>
  <p>Steps:</p>
  <ol>
    <li>Ensure AssisT extension is loaded</li>
    <li>Open DevTools Console (F12)</li>
    <li>Enable STT in AssisT popup</li>
    <li>Click in the textarea above</li>
    <li>Look for mic button floating near the textarea</li>
  </ol>
</body>
</html>
```

## Expected Working Flow

1. ✅ Open page with text field
2. ✅ STT enabled in popup
3. ✅ Click in text field
4. ✅ Console shows: `[STT] Field focused: TEXTAREA`
5. ✅ Mic button appears (floating purple gradient circle)
6. ✅ Click mic button
7. ✅ Browser prompts for microphone permission (first time only)
8. ✅ Allow microphone
9. ✅ Button turns red with pulsing animation
10. ✅ Speak: "Hello world period"
11. ✅ Text appears in field: "Hello world."
12. ✅ Click mic button again to stop

If any step fails, review diagnostics for that specific step above.
