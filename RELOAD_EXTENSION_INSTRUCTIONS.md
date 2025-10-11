# How to Reload the AssisT Extension in Chrome

## Why You Need to Reload

When you update extension files, Chrome doesn't automatically reload them. You must manually reload the extension for changes to take effect.

## Step-by-Step Instructions

### Method 1: Chrome Extensions Page (Recommended)

1. **Open Chrome Extensions page:**
   - Type in address bar: `chrome://extensions`
   - Or: Menu (⋮) → More Tools → Extensions

2. **Find AssisT extension** in the list

3. **Click the circular reload button** (🔄) at the bottom of the AssisT card
   - Or click "Remove" and then "Load unpacked" again

4. **Verify reload:**
   - Look for "Reloaded" message
   - Extension icon should still be in toolbar

5. **Refresh all open tabs** where you want to use AssisT
   - The content script only injects when page loads
   - Existing tabs won't get the new version until refreshed

### Method 2: Quick Reload (If Developer Mode is On)

1. Go to `chrome://extensions`
2. Make sure "Developer mode" toggle is ON (top right)
3. Press `Ctrl + R` or click reload button on the extension card

## After Reloading

### Test That It Worked:

1. **Open a new tab** or **refresh existing tab**
2. **Right-click on the page** → Inspect → Console tab
3. **Look for:** `[AssisT] Content script loaded`
4. **Check settings loaded log:** `[AssisT] Settings loaded, TTS enabled: true/false`

### If You Don't See Logs:

- Extension didn't reload properly
- Try removing and re-adding the extension:
  1. `chrome://extensions`
  2. Find AssisT → Click "Remove"
  3. Click "Load unpacked"
  4. Select the `AssitT` folder

## Testing TTS Toggle After Reload

### Test Sequence:

1. **Open extension popup** (click extension icon)
2. **Check "Enable TTS"** checkbox
3. **Close popup**
4. **Refresh the page** you want to test on
5. **Click a paragraph** → Should read it aloud
6. **Open popup again**
7. **Uncheck "Enable TTS"**
8. **Close popup**
9. **Click a paragraph** → Should show warning toast: "⚠️ TTS is disabled"

### Console Logs to Watch For:

```javascript
// On page load:
[AssisT] Content script loaded
[AssisT] Settings loaded, TTS enabled: false

// When you enable TTS in popup:
[AssisT] TTS enabled state changed: false → true

// When you click paragraph with TTS disabled:
[AssisT] Click ignored - TTS is disabled

// When you click paragraph with TTS enabled:
[AssisT] Reading: [first 50 chars]...
```

## Common Issues

### Issue: "Enable TTS" checkbox doesn't save

**Solution:**
1. Open DevTools console on the popup itself:
   - Right-click extension icon → Inspect popup
   - Check for errors in console
2. Check Chrome storage:
   ```javascript
   chrome.storage.local.get('assist_settings', console.log)
   ```

### Issue: Clicking paragraphs still reads when TTS is off

**Symptoms:**
- No warning toast appears
- Text is read aloud even when TTS checkbox is unchecked

**Solutions:**
1. **Verify extension was reloaded** (see steps above)
2. **Hard refresh the webpage:** `Ctrl + Shift + R`
3. **Check console for correct version:**
   ```
   [AssisT] Settings loaded, TTS enabled: false  ← Should show this
   ```
4. **If still doesn't work:**
   - Remove extension completely
   - Restart Chrome
   - Load unpacked extension again

### Issue: Context menu doesn't update

**Solution:**
- Reload extension
- Close ALL Chrome tabs
- Reopen Chrome (context menu updates in background script)

## Verify Your Current Version

Run this in the console on any webpage:

```javascript
// Check if content script has the fix
chrome.runtime.sendMessage({type: 'GET_VERSION'}, (response) => {
  console.log('Extension version:', response);
});

// Check settings in storage
chrome.storage.local.get('assist_settings', (result) => {
  console.log('TTS Enabled:', result.assist_settings?.tts?.enabled);
});
```

## Quick Reference

| Action | Shortcut |
|--------|----------|
| Open Extensions | `chrome://extensions` |
| Developer Mode | Toggle top-right |
| Reload Extension | Click 🔄 on extension card |
| Hard Refresh Page | `Ctrl + Shift + R` |
| Open Console | `F12` |

---

**IMPORTANT:** Always reload the extension AND refresh web pages after code changes!
