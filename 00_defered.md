# Deferred Testing Items

**Created:** 2026-01-17
**Purpose:** Track features and improvements deferred from initial testing pass for later review

---

## Deferred for Separate Testing Pass

### 1. Speech-to-Text (STT) Complete Feature Testing
**Reason:** Microphone button visibility issue blocks full testing
**Scope:** All STT features once microphone button is fixed:
- Voice Input Test
- STT Pause/Resume
- Auto-Punctuation
- Voice Commands
- All related annotation/citation features

**Priority:** High - Major feature requiring dedicated testing session

---

### 2. Quiet Mode Feature Testing
**Reason:** Pages tested didn't trigger the feature properly
**Scope:**
- Test on variety of page types (news sites, blogs, social media)
- Verify ad/distraction blocking works
- Confirm whitelist functionality

**Priority:** Medium - Nice-to-have feature, not critical path

---

### 3. Reduced Motion Feature Testing
**Reason:** Could not verify on test pages
**Scope:**
- Test on pages with animations
- Verify CSS motion reduction works
- Check accessibility compliance

**Priority:** Medium - Accessibility feature, important but not urgent

---

### 4. Auto Play Blocking Testing
**Reason:** Not included in initial checklist
**Scope:**
- Test on video sites (YouTube, news sites)
- Verify autoplay prevention
- Check user override capability

**Priority:** Low - Secondary feature

---

### 5. Reading Progress Feature Testing
**Reason:** Not included in initial checklist
**Scope:**
- Verify progress indicator appears
- Check scroll position tracking
- Confirm persistence across page reloads

**Priority:** Low - Enhancement feature

---

### 6. OCR Accuracy Improvements
**Reason:** Potentially time-consuming, defer unless quick win identified
**Scope:**
- Research Tesseract.js optimization
- Test alternative OCR engines
- Improve pre-processing (contrast, rotation, noise reduction)

**Priority:** Low - Works adequately, optimization can wait

**Note:** If accuracy improvements can be achieved with minimal time investment (e.g., parameter tuning), implement. Otherwise, defer to future version.

---

### 7. Auto TTS After OCR Enhancement
**Status:** Currently working but not "auto"
**Enhancement Request:** Allow TTS to read directly from OCR-generated text with user correction capability

**Reason:** Minor UX improvement, not blocking
**Priority:** Low - Enhancement only

---

## Future Enhancements (From Session 065)

These were already identified as optional future work:

1. **Feature-level visibility toggles** in organize mode
2. **Additional shortcut presets** (accessibility-focused)
3. **Profile quick-apply buttons** in preset list
4. **Eye Tracking in Stargardt Mode** - Mark as "future feature" and grey out

---

## Notes

- Deferred items should be revisited after current testing fixes are complete and stable
- Priority levels guide scheduling but can be adjusted based on user feedback
- STT testing is highest priority deferred item due to feature complexity

---

_Last Updated: 2026-01-17_
