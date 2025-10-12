# Sprint 2: UI Organization Strategy

## 🎯 Core Problem: Avoiding UI Clutter

**Challenge:** We want to add 6+ new features without making the popup overwhelming.

**Solution:** Two-tier UI system with feature visibility controls.

---

## 📐 Proposed UI Architecture

### Tier 1: Main Popup (Core Features Only)
**Width:** 340px (current)
**Content:** Only frequently-used controls

```
┌─────────────────────────────────────┐
│  🔄  AssisT  ⚙️                     │  ← Header (compact)
├─────────────────────────────────────┤
│  [✓] Enable TTS                     │  ← Main toggle
│                                     │
│  ┌─── Core TTS Controls ─────────┐ │
│  │ Voice: [Google UK Female ▼]   │ │  ← Essential only
│  │ Speed: [====●====] 1.0x        │ │
│  │ Pitch: [====●====] 1.0         │ │
│  │ Volume:[=======●=] 100%        │ │
│  └───────────────────────────────┘ │
│                                     │
│  [✓] Text Highlighting              │  ← Feature toggle
│  └─ Color: [Bright Yellow ▼]       │  ← Only if enabled
│     Opacity: [===●==] 70%          │
│                                     │
│  💡 More features in Options →     │  ← Hint text
└─────────────────────────────────────┘
```

**Keeps visible:**
- TTS toggle
- Essential controls (voice, speed, pitch, volume)
- Highlighting toggle + options
- Hint to access more features

---

### Tier 2: Advanced Options Modal (Everything Else)

**Triggered by:** Header ⚙️ Options button

```
┌───────────────────────────────────────────────┐
│  Advanced Options                    [×]      │
├───────────────────────────────────────────────┤
│                                               │
│  📋 Feature Visibility                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Show in main popup:                          │
│  [✓] Voice Selection                          │
│  [✓] Speed Control                            │
│  [✓] Pitch Control                            │
│  [✓] Volume Control                           │
│  [✓] Text Highlighting                        │
│  [ ] Speed Presets          ← Sprint 2        │
│  [ ] Reading Queue          ← Sprint 2        │
│  [ ] Read Selection         ← Sprint 2        │
│  [ ] Word Highlighting      ← Sprint 2        │
│                                               │
│  ⚡ Keyboard Shortcuts                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Space:      Pause/Resume                     │
│  + or =:     Increase speed                   │
│  -:          Decrease speed                   │
│  Ctrl+Shift+R: Read selection  ← Sprint 2     │
│  Ctrl+Shift+Q: Toggle queue    ← Sprint 2     │
│                                               │
│  🎨 Appearance                                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Theme: [●] Light  [ ] Dark  [ ] Auto         │
│  Compact Mode: [✓] Minimize spacing           │
│  Show Icons: [✓] Display emoji icons          │
│                                               │
│  🔧 Advanced                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  [ ] Debug Mode                               │
│  [ ] Show Console Logs                        │
│  [ ] Experimental Features                    │
│                                               │
│           [Save]  [Cancel]  [Reset All]       │
└───────────────────────────────────────────────┘
```

**Contains:**
- Feature visibility toggles (customize main popup)
- Keyboard shortcut reference
- Appearance settings
- Advanced/debug options
- All Sprint 2+ features that aren't essential

---

## 🎨 Sprint 2 Features: Where They Go

### Feature 1: Speed Presets
**Location:** Optional in main popup OR always in Advanced Options

**Main Popup (if enabled):**
```
Speed: [====●====] 1.0x
[0.5x] [1.0x] [1.5x] [2.0x]  ← Preset buttons
```

**Advanced Options (always):**
```
⚡ Speed Presets
Custom presets:
  Preset 1: [1.2x] [Rename] [×]
  Preset 2: [1.5x] [Rename] [×]
  [+ Add Preset]
```

**UI Strategy:** Hidden by default, user can enable in Advanced Options

---

### Feature 2: Read Selection
**Location:** Context menu ONLY (no popup UI needed!)

**Right-click menu:**
```
Copy
Paste
---
🎯 AssisT: Read Selection   ← New context menu item
```

**UI Impact:** ZERO clutter! ✅

---

### Feature 3: Reading Queue
**Location:** Optional in main popup

**Main Popup (if enabled):**
```
[✓] Enable TTS

📋 Reading Queue (3 items)
└─ [⏮] [⏯] [⏭] [🗑]  ← Playback controls only

💡 Manage queue in Options →
```

**Advanced Options (full controls):**
```
📋 Reading Queue
  1. Paragraph from page 1... [↑] [↓] [×]
  2. Paragraph from page 2... [↑] [↓] [×]
  3. Paragraph from page 3... [↑] [↓] [×]

  [Clear All] [Export List]
```

**UI Strategy:** Simple controls in popup, full management in Advanced Options

---

### Feature 4: Word-by-Word Highlighting
**Location:** Part of existing Highlighting toggle

**Main Popup:**
```
[✓] Text Highlighting
└─ Mode: [Paragraph ▼]  ← Add dropdown
         [Paragraph / Word-by-word / Sentence]
   Color: [Bright Yellow ▼]
   Opacity: [===●==] 70%
```

**UI Impact:** Just one extra dropdown in existing section ✅

---

### Feature 5: Reading Mode
**Location:** Optional in main popup

**Main Popup (if enabled):**
```
[✓] Enable TTS

[ ] Reading Mode  ← Toggle for distraction-free
```

**No options needed!** Simple on/off toggle.

---

### Feature 6: Voice Collections
**Location:** Optional in main popup

**Main Popup (current):**
```
Voice: [Google UK English Female ▼]  ← All 100+ voices
```

**Main Popup (with collections):**
```
Voice: [Favorites ▼]  ← Filtered dropdown
       [Google UK Female]
       [US Male]
       [---All Voices---]

⭐ Manage collections in Options →
```

**Advanced Options:**
```
🎤 Voice Collections

Favorites:
  [✓] Google UK English Female
  [✓] Microsoft David Desktop
  [ ] Google US English

Recent (auto):
  - Google UK English Female
  - Microsoft David Desktop
```

**UI Strategy:** Smarter voice selector, full management in Advanced Options

---

## 📊 Feature Visibility System

### Storage Format
```javascript
{
  "assist_settings": {
    "ui_visibility": {
      "show_speed_presets": false,      // Hide by default
      "show_reading_queue": false,       // Hide by default
      "show_reading_mode": false,        // Hide by default
      "show_voice_collections": true,    // Better UX, show by default
      // Core features always visible
      "show_voice_selection": true,
      "show_speed_control": true,
      "show_pitch_control": true,
      "show_volume_control": true,
      "show_highlighting": true
    }
  }
}
```

### Popup Rendering Logic
```javascript
function renderPopup() {
  const visibility = settings.ui_visibility;

  // Core features (always show)
  renderVoiceSelection();
  renderSpeedControl();
  renderPitchControl();
  renderVolumeControl();

  if (visibility.show_highlighting) {
    renderHighlighting();
  }

  // Sprint 2 features (conditional)
  if (visibility.show_speed_presets) {
    renderSpeedPresets();
  }

  if (visibility.show_reading_queue) {
    renderQueueControls();
  }

  if (visibility.show_reading_mode) {
    renderReadingModeToggle();
  }

  if (visibility.show_voice_collections) {
    renderVoiceCollections();
  }
}
```

---

## 🎯 Implementation Strategy

### Phase 1: Advanced Options Modal (Foundation)
**Priority:** HIGH - Do this first!

**Tasks:**
1. Expand current modal placeholder
2. Add tabbed interface (Features, Keyboard, Appearance, Advanced)
3. Implement feature visibility toggles
4. Add save/cancel functionality
5. Wire up to main popup rendering

**UI Impact:** None on main popup (just makes modal functional)

---

### Phase 2: Feature Implementation (Iterative)
**Priority:** Do features one at a time

For each feature:
1. Implement feature logic (isolated)
2. Add to Advanced Options first
3. Add optional main popup UI
4. Default to hidden in main popup
5. User can enable if they want it

**Order suggestion:**
1. ✅ Speed Presets (simple, good learning)
2. ✅ Read Selection (context menu, no UI clutter)
3. ✅ Voice Collections (improves existing feature)
4. ✅ Word-by-Word Highlighting (extends existing feature)
5. ✅ Reading Mode (simple toggle)
6. ✅ Reading Queue (most complex)

---

## 📏 UI Space Budget

### Current Main Popup
```
Header:         30px
TTS Toggle:     40px
Core Controls:  180px (voice, speed, pitch, volume)
Highlighting:   80px (when expanded)
Footer:         40px
-----------------
Total:          ~370px height
```

### With All Features Visible (Worst Case)
```
Header:         30px
TTS Toggle:     40px
Core Controls:  180px
Highlighting:   100px (with word-by-word mode dropdown)
Speed Presets:  40px
Reading Queue:  60px
Reading Mode:   40px
Voice Colls:    +0px (replaces voice dropdown)
Footer:         40px
-----------------
Total:          ~530px height  ← Too tall!
```

### With Smart Defaults (Best Case)
```
Header:         30px
TTS Toggle:     40px
Core Controls:  180px
Highlighting:   80px
Voice Colls:    +0px (better dropdown)
Footer:         40px
Hint text:      20px ("More in Options →")
-----------------
Total:          ~390px height  ← Perfect!
```

**Strategy:** Default to minimal, let users add what they need

---

## 🎨 Visual Design Principles

### 1. Progressive Disclosure (Expanded)
```
Level 1: Main popup (essentials only)
   ↓
Level 2: Feature toggle → Options appear
   ↓
Level 3: Advanced Options modal → Full control
```

### 2. Hint System
Add subtle hints to guide users:
```
💡 Tip: Enable more features in Options
💡 Right-click text to read selection
💡 Customize keyboard shortcuts in Options
```

### 3. Smart Defaults
- Show only most-used features
- Advanced features hidden by default
- Users customize to their needs

### 4. Collapsible Sections in Modal
```
▼ Feature Visibility        ← Click to collapse
  [✓] Voice Selection
  [ ] Speed Presets

▶ Keyboard Shortcuts        ← Collapsed by default

▼ Appearance               ← Click to collapse
  Theme: Light
```

---

## 📋 Sprint 2 Implementation Plan

### Week 1: Foundation
- [ ] Build robust Advanced Options modal
- [ ] Implement tabbed interface
- [ ] Add feature visibility system
- [ ] Test visibility toggles work

### Week 2: Features (Pick 2-3)
- [ ] Speed Presets (with visibility toggle)
- [ ] Read Selection (context menu)
- [ ] Voice Collections (optional improvement)

### Week 3: Features (Pick 2-3)
- [ ] Word-by-Word Highlighting
- [ ] Reading Mode toggle
- [ ] Reading Queue (if time)

### Week 4: Polish
- [ ] Test all combinations of visible/hidden features
- [ ] Add hint system
- [ ] Optimize spacing
- [ ] Documentation

---

## ✅ Success Criteria

### Main Popup
- ✅ Height stays under 400px (with defaults)
- ✅ All controls fit without scrolling (defaults)
- ✅ Clean, uncluttered appearance
- ✅ Clear visual hierarchy

### Advanced Options
- ✅ All features accessible
- ✅ Clear organization (tabs/sections)
- ✅ Easy to customize visibility
- ✅ Changes save correctly

### User Experience
- ✅ New users: Simple, not overwhelming
- ✅ Power users: Full access to features
- ✅ Customizable: Everyone gets what they need
- ✅ Discoverable: Hints guide to more features

---

## 🎯 Key Decision: Start with Modal

**Recommendation:** Before adding ANY Sprint 2 features, build the Advanced Options modal properly.

**Why:**
1. Foundation for all future features
2. Solves UI clutter problem upfront
3. Enables feature visibility system
4. Users can customize from day one

**What we build:**
```
Phase 1A: Modal Infrastructure (1-2 hours)
  - Proper modal overlay
  - Tabbed interface
  - Save/cancel logic
  - Close handlers

Phase 1B: Feature Visibility (1-2 hours)
  - UI visibility settings in storage
  - Toggles in Advanced Options
  - Wire up to main popup rendering
  - Test show/hide works

Phase 1C: Additional Tabs (1 hour)
  - Keyboard shortcuts reference
  - Appearance settings
  - Advanced settings

Then: Sprint 2 features, one at a time
```

---

## 📝 User Scenario Examples

### Scenario 1: Minimalist User
"I just want basic TTS, nothing fancy"

**Their popup:**
```
[✓] Enable TTS
Voice: [Google UK Female ▼]
Speed: [====●====] 1.0x

💡 More features available in Options
```
**Height:** ~200px
**Perfect!** ✅

---

### Scenario 2: Power User
"I want everything!"

**Their popup:**
```
[✓] Enable TTS
Voice: [Favorites ▼]
Speed: [====●====] 1.0x
[0.5x] [1.0x] [1.5x] [2.0x]
[✓] Text Highlighting
└─ Mode: [Word-by-word ▼]
   Color: [Yellow ▼] Opacity: 70%
[✓] Reading Mode
📋 Queue (5) [⏮] [⏯] [⏭]
```
**Height:** ~450px
**Still reasonable!** ✅

---

### Scenario 3: Reading-Focused User
"I mainly use highlighting and reading mode"

**Their popup:**
```
[✓] Enable TTS
Voice: [Google UK Female ▼]
[✓] Text Highlighting
└─ Mode: [Word-by-word ▼]
   Color: [Yellow ▼]
[✓] Reading Mode
```
**Height:** ~280px
**Perfect for their needs!** ✅

---

## 🎉 Summary

**UI Clutter Solution:**
1. ✅ Two-tier system (popup + modal)
2. ✅ Feature visibility toggles
3. ✅ Smart defaults (minimal)
4. ✅ User customization
5. ✅ Progressive disclosure

**Sprint 2 Plan:**
1. Build Advanced Options modal properly
2. Implement feature visibility system
3. Add features one at a time
4. Default to hidden, user enables if wanted
5. Test at each step

**Result:**
- Clean popup for all users
- Power features available but not intrusive
- Scalable for future sprints
- User controls their experience

**Ready to start?** Let's build the Advanced Options modal first! 🚀
