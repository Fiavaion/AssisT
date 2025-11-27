# Pomodoro Timer - Quick Integration Guide

## Step-by-Step Integration

### 1. Import in Content Script ✅

**File:** `src/content/content-simple.js`

Add this import with the other feature imports:

```javascript
// Pomodoro Timer Feature
import '../features/pomodoro/pomodoro.js';
```

### 2. Add Popup UI Controls

**File:** `src/popup/popup.html`

Add this section in the appropriate accordion or feature section:

```html
<!-- Pomodoro Timer Feature -->
<div class="feature-card">
  <div class="feature-header">
    <label class="feature-toggle">
      <input type="checkbox" id="pomodoro-enabled" />
      <span class="feature-icon">🍅</span>
      <span class="feature-name">Pomodoro Timer</span>
      <span class="toggle-switch"></span>
    </label>
  </div>

  <div class="feature-content" id="pomodoro-settings">
    <div class="setting-group">
      <label class="setting-label">
        Work Duration (minutes)
        <input type="number" id="pomodoro-work-duration" min="1" max="90" value="25" />
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-label">
        Short Break (minutes)
        <input type="number" id="pomodoro-short-break" min="1" max="30" value="5" />
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-label">
        Long Break (minutes)
        <input type="number" id="pomodoro-long-break" min="5" max="60" value="15" />
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-label">
        Sessions Until Long Break
        <input type="number" id="pomodoro-sessions-until-long-break" min="2" max="10" value="4" />
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-checkbox">
        <input type="checkbox" id="pomodoro-auto-start-breaks" />
        <span>Auto-start break timers</span>
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-checkbox">
        <input type="checkbox" id="pomodoro-auto-start-work" />
        <span>Auto-start work timers</span>
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-checkbox">
        <input type="checkbox" id="pomodoro-notifications" checked />
        <span>Show notifications</span>
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-checkbox">
        <input type="checkbox" id="pomodoro-sound" checked />
        <span>Play notification sound</span>
      </label>
    </div>

    <div class="setting-group">
      <label class="setting-label">
        Widget Position
        <select id="pomodoro-position">
          <option value="top-left">Top Left</option>
          <option value="top-right">Top Right</option>
          <option value="bottom-left">Bottom Left</option>
          <option value="bottom-right" selected>Bottom Right</option>
        </select>
      </label>
    </div>
  </div>
</div>
```

### 3. Add Popup JavaScript Logic

**File:** `src/popup/popup.js`

Add this code in the settings loading/saving section:

```javascript
// ============================================================
// POMODORO TIMER SETTINGS
// ============================================================

const pomodoroElements = {
  enabled: document.getElementById('pomodoro-enabled'),
  workDuration: document.getElementById('pomodoro-work-duration'),
  shortBreak: document.getElementById('pomodoro-short-break'),
  longBreak: document.getElementById('pomodoro-long-break'),
  sessionsUntilLongBreak: document.getElementById('pomodoro-sessions-until-long-break'),
  autoStartBreaks: document.getElementById('pomodoro-auto-start-breaks'),
  autoStartWork: document.getElementById('pomodoro-auto-start-work'),
  notifications: document.getElementById('pomodoro-notifications'),
  sound: document.getElementById('pomodoro-sound'),
  position: document.getElementById('pomodoro-position'),
};

/**
 * Load Pomodoro settings from storage
 */
function loadPomodoroSettings(settings) {
  const pomodoro = settings.pomodoro || {};

  if (pomodoroElements.enabled) {
    pomodoroElements.enabled.checked = pomodoro.enabled || false;
  }
  if (pomodoroElements.workDuration) {
    pomodoroElements.workDuration.value = pomodoro.workDuration || 25;
  }
  if (pomodoroElements.shortBreak) {
    pomodoroElements.shortBreak.value = pomodoro.shortBreakDuration || 5;
  }
  if (pomodoroElements.longBreak) {
    pomodoroElements.longBreak.value = pomodoro.longBreakDuration || 15;
  }
  if (pomodoroElements.sessionsUntilLongBreak) {
    pomodoroElements.sessionsUntilLongBreak.value = pomodoro.sessionsUntilLongBreak || 4;
  }
  if (pomodoroElements.autoStartBreaks) {
    pomodoroElements.autoStartBreaks.checked = pomodoro.autoStartBreaks || false;
  }
  if (pomodoroElements.autoStartWork) {
    pomodoroElements.autoStartWork.checked = pomodoro.autoStartWork || false;
  }
  if (pomodoroElements.notifications) {
    pomodoroElements.notifications.checked = pomodoro.showNotifications !== false;
  }
  if (pomodoroElements.sound) {
    pomodoroElements.sound.checked = pomodoro.playSound !== false;
  }
  if (pomodoroElements.position) {
    pomodoroElements.position.value = pomodoro.position || 'bottom-right';
  }
}

/**
 * Save Pomodoro settings to storage
 */
function savePomodoroSettings() {
  chrome.storage.local.get('assist_settings', result => {
    const settings = result.assist_settings || {};

    settings.pomodoro = {
      enabled: pomodoroElements.enabled?.checked || false,
      workDuration: parseInt(pomodoroElements.workDuration?.value || 25),
      shortBreakDuration: parseInt(pomodoroElements.shortBreak?.value || 5),
      longBreakDuration: parseInt(pomodoroElements.longBreak?.value || 15),
      sessionsUntilLongBreak: parseInt(pomodoroElements.sessionsUntilLongBreak?.value || 4),
      autoStartBreaks: pomodoroElements.autoStartBreaks?.checked || false,
      autoStartWork: pomodoroElements.autoStartWork?.checked || false,
      showNotifications: pomodoroElements.notifications?.checked !== false,
      playSound: pomodoroElements.sound?.checked !== false,
      position: pomodoroElements.position?.value || 'bottom-right',
    };

    chrome.storage.local.set({ assist_settings: settings }, () => {
      console.log('[Popup] Pomodoro settings saved:', settings.pomodoro);
    });
  });
}

/**
 * Attach event listeners to Pomodoro controls
 */
function attachPomodoroListeners() {
  Object.values(pomodoroElements).forEach(element => {
    if (element) {
      element.addEventListener('change', savePomodoroSettings);
    }
  });
}

// Call in your initialization function
// Add to existing settings load:
chrome.storage.local.get('assist_settings', result => {
  const settings = result.assist_settings || {};

  // ... other feature loading ...

  loadPomodoroSettings(settings);
});

// Add to event listener setup:
attachPomodoroListeners();
```

### 4. Test the Feature

1. **Build the extension:**

   ```bash
   npm run build
   ```

2. **Reload extension in Chrome:**
   - Go to `chrome://extensions/`
   - Find "AssisT Adaptive EdTech"
   - Click the refresh icon

3. **Test on a Canvas page:**
   - Navigate to any Canvas LMS page
   - Open the AssisT popup
   - Toggle "Pomodoro Timer" ON
   - Widget should appear in bottom-right corner

4. **Test controls:**
   - Click "Start" - timer should begin countdown
   - Click "Pause" - timer should pause
   - Click "Reset" - timer should reset to 25:00
   - Click "Skip" - should switch to break session
   - Drag the header - widget should move
   - Click minimize button - should collapse to pill
   - Click minimized pill - should expand

5. **Test settings changes:**
   - Change work duration to 1 minute
   - Start timer
   - Wait for completion - should show notification and switch to break

## Testing Checklist

- [ ] Widget appears when enabled
- [ ] Widget disappears when disabled
- [ ] Timer counts down correctly (1 second per tick)
- [ ] Start/Pause button toggles timer state
- [ ] Reset button restores full duration
- [ ] Skip button advances to next session
- [ ] Work → Short Break transition works
- [ ] Short Break → Work transition works
- [ ] After 4 work sessions → Long Break
- [ ] Long Break → Work (resets counter)
- [ ] Toast notifications appear (if enabled)
- [ ] Sound plays on completion (if enabled)
- [ ] Minimize button collapses widget
- [ ] Click minimized widget expands it
- [ ] Drag to reposition works
- [ ] Widget stays within viewport bounds
- [ ] Settings persist after page reload
- [ ] Multiple settings changes work in real-time
- [ ] Close button disables feature
- [ ] Respects prefers-reduced-motion
- [ ] High contrast mode works

## Common Issues

### Widget doesn't appear

**Solution:** Check browser console for errors. Ensure `pomodoro.js` is imported in `content-simple.js`.

### Timer doesn't count down

**Solution:** Check that Start button was clicked. Verify no JavaScript errors in console.

### Settings don't save

**Solution:** Verify popup.js has correct element IDs and event listeners attached.

### Widget overlaps Canvas UI

**Solution:** Change position in settings or drag to new location.

### Sound doesn't play

**Solution:** Browser may block Web Audio API. Check browser sound permissions.

## Minimal Integration (Quick Test)

If you just want to test without full UI integration:

**File:** `src/content/content-simple.js`

```javascript
import '../features/pomodoro/pomodoro.js';

// Manually enable for testing
setTimeout(() => {
  chrome.storage.local.get('assist_settings', result => {
    const settings = result.assist_settings || {};
    settings.pomodoro = {
      enabled: true,
      workDuration: 1, // 1 minute for quick testing
      shortBreakDuration: 1,
      longBreakDuration: 1,
      sessionsUntilLongBreak: 2,
      autoStartBreaks: false,
      autoStartWork: false,
      showNotifications: true,
      playSound: true,
      position: 'bottom-right',
    };
    chrome.storage.local.set({ assist_settings: settings }, () => {
      console.log('[Test] Pomodoro enabled with 1-minute sessions');
    });
  });
}, 1000);
```

Then build and reload. Widget will appear automatically with 1-minute timers for quick testing.

## Next Steps

After integration:

1. **User Testing** - Get feedback from neurodivergent students
2. **Adjust Defaults** - Based on user preferences
3. **Add Analytics** - Track feature usage (respecting privacy)
4. **Keyboard Shortcuts** - Add global shortcuts for power users
5. **Persistence** - Save timer state across page reloads (optional)

## Support

For issues or questions:

- Check browser console for error messages
- Review README.md for detailed documentation
- Test in isolation (disable other features)
- Verify Chrome storage contents at `chrome://extensions/` → AssisT → "Inspect views: service worker" → Application → Storage
