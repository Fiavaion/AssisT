# AssisT Extension Troubleshooting Guide

## Issue: Extension Popup Not Loading or "Message Channel Closed" Errors

### Diagnostic Steps

#### 1. Check Which Extensions Are Loaded

**CRITICAL**: Only ONE version of the accessibility extension should be loaded at a time.

1. Go to `chrome://extensions/`
2. Look for these extensions:
   - **AssisT: Adaptive EdTech for Canvas** (from `C:\Users\jones\AIprojects\AssitT\Output`)
   - **NCAD** or any other accessibility extension (from parent AIprojects folder)

3. **DISABLE or REMOVE** any other accessibility extensions
4. **Keep ONLY AssisT enabled**

#### 2. Verify Service Worker is Running

1. Go to `chrome://extensions/`
2. Find "AssisT: Adaptive EdTech for Canvas"
3. Look for "service worker" link (should say "Service Worker (Inactive)" or show blue link)
4. **Click the blue "service worker" link** to open service worker console
5. Check for errors in the service worker console (NOT the page console)

Expected console output in service worker:
```
[AssisT] Background service worker initialized
[AssisT] Extension installed: install
[Storage] Default settings initialized
```

#### 3. Test Popup Manually

1. Click the AssisT extension icon (puzzle piece icon)
2. Popup should open showing TTS controls
3. Open Chrome DevTools on the popup:
   - Right-click inside the popup window
   - Select "Inspect"
   - Check Console tab for errors

Expected console output in popup:
```
[Popup] Initializing...
[Popup] Settings loaded: {tts: {...}, stt: {...}, ...}
[Popup] Loaded XX voices
[Popup] Initialized
```

#### 4. Check Manifest Errors

1. Go to `chrome://extensions/`
2. Look for any red error messages under the AssisT extension card
3. If you see errors about:
   - **Missing files**: Run `npm run build` again
   - **Manifest errors**: Check manifest.json syntax

#### 5. Verify File Structure

The `Output` folder should contain:
```
Output/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── engines/
│   ├── adapters/
│   ├── utils/
│   └── config/
└── public/
```

Check with:
```bash
ls -R Output/
```

## Common Issues and Solutions

### Issue: "[NCAD Content]" appearing in console instead of "[AssisT Content]"

**Problem**: Multiple extensions are loaded
**Solution**:
1. Go to `chrome://extensions/`
2. Find NCAD extension
3. Click toggle to DISABLE
4. Reload the page
5. Check console - should now show "[AssisT Content]"

### Issue: "Could not load CSS" or "Could not load file" errors

**Problem**: Build didn't copy all files
**Solution**:
```bash
# Delete old Output folder
rm -rf Output/

# Rebuild
npm run build

# Reload extension
# Go to chrome://extensions/ → Click reload icon under AssisT
```

### Issue: "Message channel closed before a response was received"

**Problem**: Service worker not responding or conflicting extension
**Solutions**:
1. **Check service worker console** (step 2 above) for actual errors
2. **Disable other extensions** (step 1 above)
3. **Reload service worker**:
   - Go to `chrome://extensions/`
   - Click "service worker" link
   - Click "Reload" in that console
4. **Try hard refresh**: Ctrl+Shift+R on the extension reload button

### Issue: Popup opens but shows errors or doesn't respond

**Problem**: Settings not loading or communication failure
**Solutions**:
1. **Reset storage**:
   - Open service worker console
   - Run: `chrome.storage.local.clear()`
   - Reload extension
   - Extension will reinitialize defaults

2. **Check popup console**:
   - Right-click in popup → Inspect
   - Look for specific error messages
   - Common errors:
     - `Cannot read property 'tts' of null` → Settings not loaded
     - `Error loading settings` → Service worker not responding

### Issue: Extension loads but TTS doesn't work

**Problem**: Not on Canvas page or content script not injected
**Solutions**:
1. **Navigate to a Canvas page**: `https://canvas.instructure.com/`
2. **Reload the page** after enabling extension
3. **Check page console** for "[AssisT Content] Initialized"
4. **Manually inject content script** (if needed):
   - Open Chrome DevTools (F12)
   - Check if you see "[AssisT Content]" logs
   - If not, content script didn't load

## Testing Checklist

After fixing issues, test the following:

- [ ] Extension icon appears in toolbar (puzzle piece if no custom icon)
- [ ] Clicking icon opens popup with TTS controls
- [ ] Popup shows "Ready" status (not error)
- [ ] Voice dropdown is populated with voices
- [ ] TTS Enable toggle works
- [ ] On Canvas page, page console shows "[AssisT Content] Initialized"
- [ ] Service worker console shows no errors
- [ ] Clicking "Read Page" button speaks text (on text-heavy page)

## Still Having Issues?

If problems persist after following all steps:

1. **Collect diagnostic info**:
   - Screenshot of `chrome://extensions/` showing AssisT card
   - Service worker console output (full log)
   - Popup console output (full log)
   - Page console output when on Canvas

2. **Try clean reinstall**:
   ```bash
   # Rebuild extension
   npm run build

   # Remove from Chrome
   # Go to chrome://extensions/ → Remove AssisT

   # Reinstall
   # Load unpacked → Select Output folder
   ```

3. **Check Chrome version**:
   - Manifest V3 requires Chrome 88+
   - ES Modules in service workers require Chrome 91+
   - Check: `chrome://version/`
