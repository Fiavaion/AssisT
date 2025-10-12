# 🔍 Popup TTS Toggle Debug Instructions

Your console logs show the **content script** is working perfectly:
- ✅ TTS starts disabled
- ✅ Click-to-read is blocked when disabled
- ✅ Reads text when enabled
- ✅ Stops reading when disabled again

The issue you're reporting is: **"when enabled there are no options displayed"**

This means the **popup UI** is not showing the options when you toggle TTS on.

---

## Diagnostic Steps

### Step 1: Open Popup and Inspect It

1. **Click the AssisT extension icon** in your browser toolbar
2. **Right-click anywhere in the popup** and select **"Inspect"**
3. This opens DevTools for the popup (separate from page DevTools)

### Step 2: Check TTS Toggle State

In the popup DevTools Console, run:

```javascript
// Check checkbox state
document.getElementById('tts-enabled').checked
// Should return: true or false

// Check options container classes
document.getElementById('options-container').className
// Should return: "options-container" (no "hidden")
// OR: "options-container hidden" (with "hidden")
```

**Expected behavior:**
- When checkbox is **unchecked**: `className` should be `"options-container hidden"`
- When checkbox is **checked**: `className` should be `"options-container"` (no "hidden")

### Step 3: Manually Test Toggle

With popup DevTools open, try toggling the TTS checkbox and watch the Console.

Run this in popup Console to see if event fires:
```javascript
document.getElementById('tts-enabled').addEventListener('change', (e) => {
  console.log('TTS Toggle changed to:', e.target.checked);
  console.log('Options container classes:', document.getElementById('options-container').className);
});
```

Then toggle the checkbox. You should see logs appear.

### Step 4: Check CSS Display

In popup DevTools Console:
```javascript
// Get computed styles of options-container
const container = document.getElementById('options-container');
const styles = window.getComputedStyle(container);
console.log('Max-height:', styles.maxHeight);
console.log('Opacity:', styles.opacity);
console.log('Overflow:', styles.overflow);
```

**Expected when TTS enabled (checkbox checked):**
- Max-height: "2000px"
- Opacity: "1"
- Overflow: "hidden"

**Expected when TTS disabled (checkbox unchecked):**
- Max-height: "0px"
- Opacity: "0"
- Overflow: "hidden"

### Step 5: Force Show Options (Test CSS)

To verify CSS works, manually force-show the options:

In popup DevTools Console:
```javascript
document.getElementById('options-container').classList.remove('hidden');
```

**Result:**
- If options appear → CSS is working, JS event handler issue
- If options still don't appear → CSS issue

### Step 6: Check for JavaScript Errors

In popup DevTools Console:
- Look for any red error messages
- Errors would prevent event handlers from working

---

## Common Issues & Solutions

### Issue 1: Checkbox Checked But Options Hidden

**Diagnosis:**
```javascript
document.getElementById('tts-enabled').checked  // true
document.getElementById('options-container').className  // "options-container hidden"
```

**Cause:** Event handler not removing `hidden` class

**Solution:** Check if popup.js loaded correctly:
```javascript
// In popup DevTools Console
console.log('Popup script loaded?');
// Should see popup.js in Sources tab
```

### Issue 2: Options Container Not Found

**Diagnosis:**
```javascript
document.getElementById('options-container')  // null
```

**Cause:** HTML structure problem

**Solution:** Verify HTML was rebuilt:
```bash
# In terminal
ls -lh Output/src/popup/popup.html
# Check timestamp - should be recent
```

### Issue 3: CSS Not Applied

**Diagnosis:**
```javascript
const container = document.getElementById('options-container');
window.getComputedStyle(container).maxHeight  // Not "0px" or "2000px"
```

**Cause:** CSS file not loaded or rebuilt

**Solution:** Rebuild and reload:
```bash
npm run build
# Then reload extension
```

---

## Quick Fix: Manual Toggle Test

If you want to quickly test if everything works, open popup DevTools Console and run:

```javascript
// Get elements
const checkbox = document.getElementById('tts-enabled');
const container = document.getElementById('options-container');

// Toggle ON
checkbox.checked = true;
container.classList.remove('hidden');
console.log('TTS enabled, options shown');

// Wait 5 seconds...
setTimeout(() => {
  // Toggle OFF
  checkbox.checked = false;
  container.classList.add('hidden');
  console.log('TTS disabled, options hidden');
}, 5000);
```

This manually simulates what should happen automatically.

---

## What to Report Back

Please run the diagnostics above and tell me:

1. **Checkbox state:**
   ```javascript
   document.getElementById('tts-enabled').checked
   // Your result: ____
   ```

2. **Options container classes:**
   ```javascript
   document.getElementById('options-container').className
   // Your result: ____
   ```

3. **Computed max-height:**
   ```javascript
   window.getComputedStyle(document.getElementById('options-container')).maxHeight
   // Your result: ____
   ```

4. **Any errors in popup Console?**
   - Yes/No
   - If yes, paste the error

5. **When you manually remove 'hidden' class, do options appear?**
   ```javascript
   document.getElementById('options-container').classList.remove('hidden');
   // Do you see Voice/Speed/Pitch controls appear? Yes/No
   ```

This will help me identify exactly where the issue is!

---

## Expected Popup Appearance

**When TTS is DISABLED (toggle OFF):**
```
╔══════════════════════════╗
║  🔄  🎯 AssisT  ⚙️       ║
║  Text-to-Speech Controls ║
╠══════════════════════════╣
║                          ║
║  Enable TTS  [ OFF ]     ║
║                          ║
║  (No other options)      ║
║                          ║
╚══════════════════════════╝
```

**When TTS is ENABLED (toggle ON):**
```
╔══════════════════════════╗
║  🔄  🎯 AssisT  ⚙️       ║
║  Text-to-Speech Controls ║
╠══════════════════════════╣
║                          ║
║  Enable TTS  [ ON ]      ║
║                          ║
║  ▶️ Read Page  ⏸️ Pause  ║
║  ⏹️ Stop                 ║
║                          ║
║  Voice: [Dropdown ▼]     ║
║  Speed: [======•====]    ║
║  Pitch: [======•====]    ║
║  Volume: [========•=]    ║
║                          ║
║  Text Highlighting [ON]  ║
║    Color: [Dropdown ▼]   ║
║    Opacity: [====•==]    ║
║                          ║
╚══════════════════════════╝
```

If you're not seeing the Voice/Speed/Pitch controls when TTS is ON, that's the issue we need to diagnose.
