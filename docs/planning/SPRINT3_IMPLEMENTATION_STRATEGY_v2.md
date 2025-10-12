# Sprint 3 Implementation Strategy v2 (REVISED)

## Overview
Sprint 3 focuses on three independent accessibility features to enhance reading experience for neurodivergent students. Each feature is isolated and can be toggled independently.

---

## Feature 1: Text Customization (WCAG 2.2 SC 1.4.12)

### Purpose
Allow users to customize font family and text spacing to improve readability, particularly for dyslexic readers.

### Technical Specifications

**Storage Schema Addition:**
```javascript
textCustomization: {
  enabled: false,
  fontFamily: 'system',      // 'system' | 'lexend' | 'opendyslexic' | 'comic-sans' | 'arial'
  lineSpacing: 1.5,          // WCAG min: 1.5
  letterSpacing: 0.12,       // WCAG min: 0.12em (displayed as 12%)
  wordSpacing: 0.16,         // WCAG min: 0.16em (displayed as 16%)
  paragraphSpacing: 2.0      // WCAG min: 2.0em
}
```

**Implementation Pattern:**
- CSS injection via `<style>` element with `!important` declarations
- Font loading from CDN (Google Fonts for Lexend, jsDelivr for OpenDyslexic)
- Percentage-to-em conversion for user-friendly slider values
- Exclude Canvas UI elements (buttons, inputs, headers) from customization

**UI Controls:**
- Independent toggle (NOT nested in TTS options)
- Font dropdown selector
- 4 spacing sliders with real-time preview
- Description text shows/hides with toggle
- All options collapse when disabled

---

## Feature 2: Reading Guide (Dyslexia Line Tracker)

### Purpose
Display a horizontal line that follows the mouse cursor vertically to help dyslexic students track which line they are reading.

### Technical Specifications

**Storage Schema Addition:**
```javascript
readingGuide: {
  enabled: false,
  lineColor: '#000000',      // Default: black
  lineThickness: 3,          // px, range: 1-10px
  lineOpacity: 0.7           // 0.0-1.0 (displayed as 0-100%)
}
```

**Implementation Pattern:**
- Fixed-position overlay element (z-index: 9999)
- Follows `mousemove` event Y-coordinate in real-time
- CSS `pointer-events: none` to avoid blocking interactions
- Spans full viewport width
- Feature isolation: `readingGuide_` prefix for all variables/functions

**Visual Specification:**
- **Default style:** Thick (3px), visible but not obstructing
- Line should NOT cover text, positioned between lines
- High contrast against typical Canvas backgrounds
- Smooth tracking (no lag or jitter)

**UI Controls:**
- Enable/disable toggle
- Color picker for line color
- Thickness slider (1-10px)
- Opacity slider (0-100%)
- Real-time updates without page reload

**Mutual Exclusivity:**
- When Focus Mode is enabled, Reading Guide must disable automatically
- Show informational message: "Reading Guide disabled while Focus Mode is active"

---

## Feature 3: Focus Mode (Adjustable Reading Window)

### Purpose
Create an adjustable rectangular "reading window" with darkened overlay outside to reduce visual distractions and help maintain focus.

### Technical Specifications

**Storage Schema Addition:**
```javascript
focusMode: {
  enabled: false,
  boxWidth: 400,            // px, min: 150, max: 800, step: 5
  boxHeight: 100,           // px, min: 50, max: 250, step: 5
  overlayOpacity: 0.7       // 0.0-1.0 (darkness of surrounding area)
}
```

**Implementation Pattern:**
- Four overlay divs creating "window" effect:
  - Top overlay (0 to mouseY - boxHeight/2)
  - Bottom overlay (mouseY + boxHeight/2 to viewport bottom)
  - Left overlay (0 to mouseX - boxWidth/2)
  - Right overlay (mouseX + boxWidth/2 to viewport right)
- Fixed positioning with high z-index (9998, below Reading Guide)
- CSS `pointer-events: none` to allow interaction with content
- Follow mouse automatically in real-time
- Smooth transitions during mouse movement

**Visual Specification:**
- Overlay color: Black with adjustable opacity (0-100%)
- Clear rectangular "window" where user can read
- Box dimensions adjustable via sliders
- No borders or visual indicators on the clear area (just the darkened overlay)

**Dimension Constraints:**
- Width: 150px (min) - 800px (max), step: 5px
- Height: 50px (min) - 250px (max), step: 5px
- Default: 400px × 100px

**UI Controls:**
- Enable/disable toggle
- Width slider (150-800px, step: 5)
- Height slider (50-250px, step: 5)
- Overlay opacity slider (0-100%)
- Real-time preview as sliders adjust

**Mutual Exclusivity:**
- When Reading Guide is enabled, Focus Mode must disable automatically
- Show informational message: "Focus Mode disabled while Reading Guide is active"

---

## Feature Isolation Rules

### Naming Convention
- All variables: `featureName_variableName`
- All functions: `featureName_functionName`
- Example: `readingGuide_lineElement`, `focusMode_updateOverlays()`

### Independence Requirements
1. Each feature has separate storage schema section
2. Each feature has separate UI section in popup
3. No shared state between features (except mutual exclusivity)
4. Features can be toggled on/off without affecting others
5. Disabling one feature does NOT reset another's settings

### Mutual Exclusivity Implementation
```javascript
// When Reading Guide enabled
if (readingGuide_enabled && focusMode_enabled) {
  focusMode_disable();
  showToast('Focus Mode disabled (Reading Guide active)');
}

// When Focus Mode enabled
if (focusMode_enabled && readingGuide_enabled) {
  readingGuide_disable();
  showToast('Reading Guide disabled (Focus Mode active)');
}
```

---

## Implementation Order

### Phase 1: Text Customization
1. Add storage schema
2. Implement CSS injection system
3. Add font loading functions
4. Build UI controls
5. Test in isolation → Commit

### Phase 2: Reading Guide
1. Add storage schema
2. Create overlay line element
3. Implement mousemove tracking
4. Add styling controls
5. Test in isolation → Commit

### Phase 3: Focus Mode
1. Add storage schema
2. Create four overlay divs
3. Implement mouse-following logic
4. Add dimension/opacity controls
5. Implement mutual exclusivity with Reading Guide
6. Test in isolation → Commit

### Phase 4: Integration Testing
1. Test all three features together
2. Verify no conflicts with existing TTS/highlighting
3. Test mutual exclusivity logic
4. Performance testing (smooth cursor tracking)
5. Create stable version tag: `Sprint3-Complete-v2.0`

---

## Testing Checklist

### Text Customization
- [ ] Toggle on/off works independently
- [ ] All 5 fonts load correctly
- [ ] Spacing controls update in real-time
- [ ] Settings persist after page reload
- [ ] Canvas UI elements excluded from styling
- [ ] No conflicts with TTS/highlighting features

### Reading Guide
- [ ] Line follows mouse smoothly (no lag)
- [ ] Line does not obstruct text
- [ ] Color/thickness/opacity controls work
- [ ] Toggle on/off without page reload
- [ ] Pointer events pass through line
- [ ] Automatically disables when Focus Mode enabled

### Focus Mode
- [ ] Overlay creates clear reading window
- [ ] Box follows mouse automatically
- [ ] Width/height sliders work (5px increments)
- [ ] Opacity slider adjusts darkness
- [ ] Min/max constraints enforced (150-800 × 50-250)
- [ ] Pointer events pass through overlays
- [ ] Automatically disables when Reading Guide enabled

### Integration
- [ ] All features work with TTS enabled
- [ ] All features work with TTS disabled
- [ ] No performance degradation with all features on
- [ ] Settings export/import includes all Sprint 3 features
- [ ] Reset button resets all Sprint 3 features to defaults

---

## Rollback Plan

If any phase fails:
1. Use `git restore src/` to revert uncommitted changes
2. Use `npm run build` to rebuild from stable source
3. Reload extension in Chrome
4. If committed but broken, use `git revert <commit-hash>`
5. Document failure in projectmemory.md Decision Log

Current stable version: **25c81ae** (refactor(tts): remove Read Selection context menu feature)

---

## Success Criteria

Sprint 3 is complete when:
1. ✅ Text Customization: All fonts and spacing controls working, WCAG compliant
2. ✅ Reading Guide: Smooth cursor tracking, visible but non-obstructive line
3. ✅ Focus Mode: Adjustable reading window with proper dimensions and opacity
4. ✅ Feature Isolation: Each feature can be toggled independently
5. ✅ Mutual Exclusivity: Reading Guide and Focus Mode properly exclusive
6. ✅ No Regressions: Existing TTS/highlighting features unaffected
7. ✅ Performance: No lag or jitter with all features enabled
8. ✅ Documentation: Decision Log entries for all architectural choices
9. ✅ Stable Tag: Git tag created with working version

**Estimated Implementation Time:** 3-4 focused sessions (1 per feature + integration)
