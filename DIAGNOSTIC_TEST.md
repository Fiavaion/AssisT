# AssisT Diagnostic Test Script

## Quick Diagnostic Commands

Run these commands in the **Service Worker Console** to verify functionality.

### How to Open Service Worker Console

1. Go to `chrome://extensions/`
2. Find "AssisT: Adaptive EdTech for Canvas"
3. Click the blue **"service worker"** link
4. A DevTools window will open - this is the service worker console

---

## Test 1: Check if Service Worker is Running

**Paste this in service worker console:**
```javascript
console.log('[Diagnostic] Service worker is running!');
console.log('[Diagnostic] Chrome version:', navigator.userAgent);
```

**Expected output:**
```
[Diagnostic] Service worker is running!
[Diagnostic] Chrome version: Mozilla/5.0 ...
```

---

## Test 2: Check Storage Access

**Paste this in service worker console:**
```javascript
chrome.storage.local.get('assist_settings').then(result => {
  console.log('[Diagnostic] Storage test:', result);
});
```

**Expected output:**
```
[Diagnostic] Storage test: {assist_settings: {tts: {...}, stt: {...}, ...}}
```

**If output is `{}`**: Settings not initialized. Run:
```javascript
// Reinitialize settings
const DEFAULT_SETTINGS = {
  tts: {
    enabled: false,
    voice: 'default',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    highlightEnabled: true,
    highlightColor: '#FFEB3B',
    autoStart: false
  },
  stt: {
    enabled: false,
    language: 'en-US'
  },
  waiAdapt: {
    textSpacing: { enabled: false },
    focusMode: { enabled: false },
    numericSimplification: { enabled: false },
    typography: { font: 'system', fontSize: 16 },
    colorScheme: { mode: 'default' }
  }
};

chrome.storage.local.set({
  assist_settings: DEFAULT_SETTINGS
}).then(() => {
  console.log('[Diagnostic] Settings initialized!');
});
```

---

## Test 3: Test Message Handler

**Paste this in service worker console:**
```javascript
// Simulate GET_SETTINGS message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Diagnostic] Message received:', message);
  return true;
});

// Send test message
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, response => {
  console.log('[Diagnostic] Response received:', response);
});
```

**Expected output:**
```
[Diagnostic] Message received: {type: 'GET_SETTINGS'}
[MessageRouter] Routing message: GET_SETTINGS from: popup
[Diagnostic] Response received: {success: true, data: {...}}
```

**If no response**: Message handler not working. Check:
1. Is MessageRouter imported correctly?
2. Are there any errors in console?

---

## Test 4: Check All Extension Components

**Paste this in service worker console:**
```javascript
// Test all imports and initialization
(async () => {
  try {
    console.log('[Diagnostic] Testing extension components...');

    // Test storage
    const settings = await chrome.storage.local.get('assist_settings');
    console.log('[Diagnostic] ✓ Storage accessible:', Object.keys(settings).length > 0);

    // Test message sending
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    console.log('[Diagnostic] ✓ Tabs API accessible, current tab:', tabs[0]?.id);

    // Test permissions
    const hasStorage = await chrome.permissions.contains({permissions: ['storage']});
    const hasActiveTab = await chrome.permissions.contains({permissions: ['activeTab']});
    console.log('[Diagnostic] ✓ Permissions:', { storage: hasStorage, activeTab: hasActiveTab });

    console.log('[Diagnostic] ✅ All basic components working!');
  } catch (error) {
    console.error('[Diagnostic] ❌ Error:', error);
  }
})();
```

**Expected output:**
```
[Diagnostic] Testing extension components...
[Diagnostic] ✓ Storage accessible: true
[Diagnostic] ✓ Tabs API accessible, current tab: 123456
[Diagnostic] ✓ Permissions: {storage: true, activeTab: true}
[Diagnostic] ✅ All basic components working!
```

---

## Test 5: Test Popup Communication (Run from Popup Console)

**To open popup console:**
1. Click AssisT extension icon to open popup
2. Right-click inside popup window
3. Select "Inspect"

**Paste this in popup console:**
```javascript
// Test message to background
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, response => {
  if (chrome.runtime.lastError) {
    console.error('[Diagnostic] ❌ Error:', chrome.runtime.lastError);
  } else {
    console.log('[Diagnostic] ✅ Response:', response);
  }
});
```

**Expected output:**
```
[Diagnostic] ✅ Response: {success: true, data: {tts: {...}, ...}}
```

**If error "message channel closed":**
- Service worker is not responding
- Check service worker console for errors
- Try reloading the extension

---

## Test 6: Test Content Script (Run from Page Console)

**Navigate to**: https://canvas.instructure.com/ (or any Canvas page)

**Open page console**: F12 → Console tab

**Paste this:**
```javascript
// Check if content script is loaded
console.log('[Diagnostic] Checking for AssisT content script...');

// Look for AssisT logs
console.log('[Diagnostic] Look for "[AssisT Content]" logs above');

// Send message to check if content script is listening
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, response => {
  console.log('[Diagnostic] Background responded:', response);
});
```

**Expected output:**
```
[AssisT Content] Initialized
[Diagnostic] Checking for AssisT content script...
[Diagnostic] Look for "[AssisT Content]" logs above
[Diagnostic] Background responded: {success: true, data: {...}}
```

---

## Interpreting Results

### ✅ All Tests Pass
Extension is working correctly! Try manual testing:
- Open popup
- Enable TTS
- Click "Read Page" on a text-heavy page

### ❌ Test 1 Fails (Service worker console won't open)
**Problem**: Service worker crashed or not initialized
**Solution**:
1. Go to `chrome://extensions/`
2. Toggle AssisT off and back on
3. Look for red error messages
4. Click "Reload" button under AssisT card

### ❌ Test 2 Fails (Storage returns {})
**Problem**: Settings not initialized
**Solution**: Run the settings initialization code from Test 2

### ❌ Test 3 Fails (No message response)
**Problem**: Message routing broken
**Solution**:
1. Check service worker console for import errors
2. Verify MessageRouter.js is in Output folder
3. Rebuild: `npm run build`
4. Reload extension

### ❌ Test 5 Fails (Popup can't communicate)
**Problem**: Background service worker not responding
**Solution**:
1. Check service worker console for errors
2. Make sure only AssisT is loaded (disable other extensions)
3. Hard reload: Ctrl+Shift+R on extension

### ❌ Test 6 Fails (Content script not loaded)
**Problem**: Content script not injecting
**Solution**:
1. Verify you're on a Canvas page (*.instructure.com)
2. Reload the page
3. Check manifest.json has correct content_scripts configuration
4. Check if another extension is interfering
