# Known Issues - Deferred to Alpha Phase

This document tracks known issues with current features that are **functional but need refinement** before production release.

## Sprint 5: Speech-to-Text (STT)

**Status:** ✅ Working (MVP functionality complete)
**Tested:** 2025-10-12
**Deferred Issues:**

### Issue List
*(To be documented by user during alpha testing)*

**Notes:**
- Core functionality verified: microphone button appears, recording works, text insertion works
- User identified issues during initial testing but chose to defer fixes to alpha phase
- Document specific issues here when ready for alpha refinement

---

## Next Steps

**Current Phase:** Sprint 5 Complete - Moving to Next Feature
**Alpha Phase:** Will address all known issues across all features
**Testing Protocol:** Document issues as they're discovered, prioritize fixes during alpha

---

## How to Document Issues

When documenting issues for alpha phase, use this format:

```markdown
### Issue: [Brief Title]
- **Feature:** [TTS/STT/Reading Guide/etc]
- **Severity:** [Critical/High/Medium/Low]
- **Description:** [Detailed description]
- **Steps to Reproduce:**
  1. Step one
  2. Step two
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What actually happens]
- **Workaround:** [If any temporary solution exists]
- **Notes:** [Any additional context]
```

**Example:**
```markdown
### Issue: Mic button doesn't hide when recording ends
- **Feature:** STT
- **Severity:** Medium
- **Description:** After stopping recording, mic button stays visible even when clicking away
- **Steps to Reproduce:**
  1. Click in text field
  2. Click mic button to start recording
  3. Speak text
  4. Click mic button to stop
  5. Click outside the field
- **Expected Behavior:** Button should hide after clicking outside
- **Actual Behavior:** Button remains visible
- **Workaround:** Reload page to clear button
- **Notes:** May need to track recording state in focusout handler
```
