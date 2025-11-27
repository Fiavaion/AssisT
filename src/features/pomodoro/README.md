# Pomodoro Timer Feature

## Overview

The Pomodoro Timer is a time management feature designed specifically for neurodivergent students who benefit from structured work/break intervals. This feature helps users:

- **Manage time blindness** - Visual countdown and notifications provide time awareness
- **Reduce burnout** - Enforced breaks prevent hyperfocus exhaustion
- **Improve task transitions** - Clear signals when to switch between work and rest
- **Build sustainable routines** - Regular intervals create predictable structure

## Features

### Core Functionality

- **Customizable Timers**: Configure work, short break, and long break durations
- **Visual Progress**: Circular progress indicator with countdown display
- **Session Tracking**: Automatic progression through work/break cycles
- **Flexible Controls**: Start, pause, reset, and skip sessions
- **Auto-Start Options**: Automatically begin breaks or work sessions (optional)

### Accessibility Features

- **High Contrast Support**: Adapts to system high contrast mode
- **Reduced Motion**: Respects `prefers-reduced-motion` setting
- **Keyboard Accessible**: All controls are keyboard navigable
- **Clear Visual States**: Color-coded sessions (blue for work, green for breaks)
- **Minimizable UI**: Collapse to pill shape to reduce visual clutter
- **Draggable Widget**: Reposition anywhere on screen

### Notifications

- **Toast Messages**: Visual notifications for session changes
- **Audio Alerts**: Optional sound notification (can be disabled)
- **Session Completion Messages**: Clear feedback when transitions occur

## Settings

### Default Configuration

```javascript
{
  enabled: false,
  workDuration: 25,              // minutes
  shortBreakDuration: 5,          // minutes
  longBreakDuration: 15,          // minutes
  sessionsUntilLongBreak: 4,     // work sessions before long break
  autoStartBreaks: false,         // auto-start break timers
  autoStartWork: false,           // auto-start work timers after breaks
  showNotifications: true,        // show toast notifications
  playSound: true,                // play notification sound
  position: 'bottom-right'        // widget position on screen
}
```

### Position Options

- `'top-left'`
- `'top-right'`
- `'bottom-left'`
- `'bottom-right'`

Users can also drag the widget to any custom position.

## Usage

### Integration

To enable the Pomodoro Timer in the extension:

1. **Import the module** in `src/content/content-simple.js`:

   ```javascript
   import '../features/pomodoro/pomodoro.js';
   ```

2. **Add UI controls** in `src/popup/popup.html`:

   ```html
   <div class="feature-section">
     <div class="feature-header">
       <label class="feature-label">
         <input type="checkbox" id="pomodoro-toggle" />
         <span>🍅 Pomodoro Timer</span>
       </label>
     </div>
     <div class="feature-settings">
       <label
         >Work Duration (min):
         <input type="number" id="pomodoro-work-duration" min="1" max="60" value="25" />
       </label>
       <label
         >Short Break (min):
         <input type="number" id="pomodoro-short-break" min="1" max="30" value="5" />
       </label>
       <label
         >Long Break (min):
         <input type="number" id="pomodoro-long-break" min="1" max="60" value="15" />
       </label>
       <label
         >Sessions Until Long Break:
         <input type="number" id="pomodoro-sessions" min="1" max="10" value="4" />
       </label>
       <label>
         <input type="checkbox" id="pomodoro-auto-start-breaks" />
         Auto-start breaks
       </label>
       <label>
         <input type="checkbox" id="pomodoro-auto-start-work" />
         Auto-start work sessions
       </label>
       <label>
         <input type="checkbox" id="pomodoro-notifications" checked />
         Show notifications
       </label>
       <label>
         <input type="checkbox" id="pomodoro-sound" checked />
         Play sound
       </label>
     </div>
   </div>
   ```

3. **Connect settings** in `src/popup/popup.js`:

   ```javascript
   // Get settings elements
   const pomodoroToggle = document.getElementById('pomodoro-toggle');
   const pomodoroWorkDuration = document.getElementById('pomodoro-work-duration');
   const pomodoroShortBreak = document.getElementById('pomodoro-short-break');
   const pomodoroLongBreak = document.getElementById('pomodoro-long-break');
   const pomodoroSessions = document.getElementById('pomodoro-sessions');
   const pomodoroAutoStartBreaks = document.getElementById('pomodoro-auto-start-breaks');
   const pomodoroAutoStartWork = document.getElementById('pomodoro-auto-start-work');
   const pomodoroNotifications = document.getElementById('pomodoro-notifications');
   const pomodoroSound = document.getElementById('pomodoro-sound');

   // Load settings
   chrome.storage.local.get('assist_settings', result => {
     const settings = result.assist_settings || {};
     const pomodoro = settings.pomodoro || {};

     pomodoroToggle.checked = pomodoro.enabled || false;
     pomodoroWorkDuration.value = pomodoro.workDuration || 25;
     pomodoroShortBreak.value = pomodoro.shortBreakDuration || 5;
     pomodoroLongBreak.value = pomodoro.longBreakDuration || 15;
     pomodoroSessions.value = pomodoro.sessionsUntilLongBreak || 4;
     pomodoroAutoStartBreaks.checked = pomodoro.autoStartBreaks || false;
     pomodoroAutoStartWork.checked = pomodoro.autoStartWork || false;
     pomodoroNotifications.checked = pomodoro.showNotifications !== false;
     pomodoroSound.checked = pomodoro.playSound !== false;
   });

   // Save settings
   function savePomodoro() {
     chrome.storage.local.get('assist_settings', result => {
       const settings = result.assist_settings || {};
       settings.pomodoro = {
         enabled: pomodoroToggle.checked,
         workDuration: parseInt(pomodoroWorkDuration.value),
         shortBreakDuration: parseInt(pomodoroShortBreak.value),
         longBreakDuration: parseInt(pomodoroLongBreak.value),
         sessionsUntilLongBreak: parseInt(pomodoroSessions.value),
         autoStartBreaks: pomodoroAutoStartBreaks.checked,
         autoStartWork: pomodoroAutoStartWork.checked,
         showNotifications: pomodoroNotifications.checked,
         playSound: pomodoroSound.checked,
         position: settings.pomodoro?.position || 'bottom-right',
       };
       chrome.storage.local.set({ assist_settings: settings });
     });
   }

   // Attach listeners
   pomodoroToggle.addEventListener('change', savePomodoro);
   pomodoroWorkDuration.addEventListener('change', savePomodoro);
   pomodoroShortBreak.addEventListener('change', savePomodoro);
   pomodoroLongBreak.addEventListener('change', savePomodoro);
   pomodoroSessions.addEventListener('change', savePomodoro);
   pomodoroAutoStartBreaks.addEventListener('change', savePomodoro);
   pomodoroAutoStartWork.addEventListener('change', savePomodoro);
   pomodoroNotifications.addEventListener('change', savePomodoro);
   pomodoroSound.addEventListener('change', savePomodoro);
   ```

### Programmatic Usage

```javascript
import {
  pomodoro_enable,
  pomodoro_disable,
  pomodoro_startTimer,
  pomodoro_pauseTimer,
  pomodoro_resetTimer,
  pomodoro_getState,
} from './features/pomodoro/pomodoro.js';

// Enable Pomodoro Timer
pomodoro_enable();

// Start the timer
pomodoro_startTimer();

// Pause the timer
pomodoro_pauseTimer();

// Reset to current session duration
pomodoro_resetTimer();

// Get current state
const state = pomodoro_getState();
console.log(state);
// {
//   enabled: true,
//   currentSession: 'work',
//   timeRemaining: 1500,
//   sessionsCompleted: 0,
//   isPaused: false,
//   isRunning: true,
//   isMinimized: false
// }

// Disable Pomodoro Timer
pomodoro_disable();
```

## User Workflow

### Standard Pomodoro Cycle

1. **Work Session** (default: 25 minutes)
   - Timer counts down from work duration
   - Blue progress ring indicates work time
   - Focus on a single task

2. **Short Break** (default: 5 minutes)
   - Green progress ring indicates break time
   - Stand up, stretch, rest eyes
   - Notification when break ends

3. **Repeat** 3 more times (default: 4 total work sessions)

4. **Long Break** (default: 15 minutes)
   - Extended break after completing session cycle
   - Counter resets to 0
   - Return to work session afterward

### Controls

- **Start/Pause**: Begin or pause the current timer
- **Reset**: Reset timer to current session's full duration
- **Skip**: Skip to the next session immediately
- **Minimize**: Collapse widget to a small pill showing only time
- **Close (✕)**: Disable the Pomodoro feature entirely
- **Drag**: Click and drag the header to reposition

## Technical Details

### File Structure

```
src/features/pomodoro/
├── pomodoro.js     # Main feature module
└── README.md       # This file
```

### Dependencies

- `src/core/ui/toast.js` - Toast notification system
- `src/content/utils/storage-utils.js` - Chrome storage utilities

### Storage Key

Settings are stored under `assist_settings.pomodoro` in Chrome local storage.

### Event Listeners

- `mousemove` - Only active during drag operations (no performance impact)
- `chrome.storage.onChanged` - Listens for settings changes

### DOM Elements Created

- `#assist-pomodoro-container` - Main container (z-index: 999999)
- `#assist-pomodoro-styles` - Injected stylesheet

### Performance

- **Minimal CPU**: Timer uses `setInterval` with 1-second tick (only when running)
- **No Memory Leaks**: All intervals and listeners properly cleaned up on disable
- **Small Bundle**: ~20KB uncompressed code

## Accessibility Compliance

### WCAG 2.2 Compliance

#### SC 1.4.12 Text Spacing (Level AA) ✅

- All text elements have adequate spacing
- No text overlap or truncation with custom spacing

#### SC 2.2.1 Timing Adjustable (Level A) ✅

- Users can pause the timer at any time
- Users can adjust all duration settings
- No automatic timeout that cannot be extended

#### SC 1.4.3 Contrast (Minimum) (Level AA) ✅

- Background: `rgba(255, 255, 255, 0.98)` with dark text
- Progress indicators use high-contrast colors
- Buttons have clear visual states

#### SC 2.1.1 Keyboard (Level A) ✅

- All controls accessible via keyboard
- Logical tab order
- No keyboard traps

### Additional Accessibility Features

- **Reduced Motion**: Respects `prefers-reduced-motion: reduce`
- **High Contrast**: Adapts to `prefers-contrast: high`
- **Screen Readers**: All buttons have `aria-label` attributes
- **Focus Indicators**: Clear focus states for keyboard navigation

## Benefits for Neurodivergent Users

### ADHD

- **Structure**: Predictable intervals reduce decision fatigue
- **Hyperfocus Protection**: Enforced breaks prevent burnout
- **Time Awareness**: Visual countdown compensates for time blindness
- **Task Switching**: Clear signals make transitions easier

### Autism

- **Predictability**: Consistent routine reduces anxiety
- **Visual Clarity**: Clear progress indicator shows time remaining
- **Sensory Control**: Optional audio can be disabled
- **Minimal Disruption**: Minimized mode reduces visual overwhelm

### Dyslexia/Dyscalculia

- **Visual Time**: Circular progress easier than clock reading
- **Large Numbers**: Big, clear countdown display
- **Color Coding**: Blue (work) vs. Green (break) aids recognition

### General Executive Function

- **External Regulation**: Timer provides structure when internal regulation is difficult
- **Break Enforcement**: Prevents overwork and mental fatigue
- **Session Tracking**: Automatic counting removes mental load

## Troubleshooting

### Timer doesn't appear

- Check that `pomodoro.enabled` is `true` in Chrome storage
- Verify the module is imported in `content-simple.js`
- Check browser console for errors

### Notifications don't show

- Ensure `showNotifications` is `true` in settings
- Check if other extensions are blocking toasts
- Verify toast.js is working correctly

### Sound doesn't play

- Ensure `playSound` is `true` in settings
- Check browser audio permissions
- Some browsers block Web Audio API in certain contexts

### Widget is off-screen

- Disable and re-enable the feature (resets to default position)
- Or manually drag it back to a visible area

## Future Enhancements (Potential)

- **Custom notification sounds** - Upload custom audio files
- **Session statistics** - Track completed sessions over time
- **Browser notifications** - Use native browser notifications API
- **Keyboard shortcuts** - Global shortcuts for start/pause/skip
- **Theme customization** - Custom colors for work/break sessions
- **Integration with task lists** - Link timer to specific tasks
- **Persistent state** - Remember timer state across page reloads

## License

Part of the AssisT Adaptive EdTech Extension project.
