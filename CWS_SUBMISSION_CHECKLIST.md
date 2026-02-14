# Chrome Web Store Submission Checklist - AssisT v0.1.1

**Submission Date:** February 13, 2026
**Extension Version:** 0.1.1
**Last Documentation Update:** February 13, 2026

---

## ✅ PHASE 1: WEBSITE DEPLOYMENT (CRITICAL - DO FIRST!)

### Deploy Fiavaion Website

**⚠️ The privacy policy MUST be live before CWS submission!**

- [ ] Navigate to Fiavaion website directory:

  ```bash
  cd c:\Users\jones\AIprojects\Fiavaion\website
  ```

- [ ] Build the website:

  ```bash
  npm run build
  ```

- [ ] Deploy to production (your deployment method)

- [ ] **VERIFY LIVE URL:** https://fiavaion.com/products/assist/privacy
  - [ ] Page loads successfully
  - [ ] Shows **"Last Updated: February 13, 2026"**
  - [ ] Shows **"Version: 0.1.1"**
  - [ ] All 4 AI modes documented (Off, Ollama, Gemini Nano, Cloud)
  - [ ] Mentions **Claude Haiku 4.5, Sonnet 4.5, Opus 4.6**
  - [ ] Specifies **AES-256-GCM encryption**
  - [ ] No broken links
  - [ ] Mobile responsive

- [ ] Screenshot the live privacy policy page for CWS submission

---

## ✅ PHASE 2: EXTENSION BUILD & VERIFICATION

### Build Extension

- [ ] Navigate to AssisT directory:

  ```bash
  cd C:\Users\jones\AIprojects\AssisT
  ```

- [ ] Build extension:

  ```bash
  npm run build
  ```

- [ ] Verify build succeeded (no errors)

- [ ] Check `.vite/` directory contains:
  - [ ] manifest.json
  - [ ] privacy-policy.html
  - [ ] All source files bundled
  - [ ] Icons (16, 32, 48, 128px)

### Test Extension Locally

- [ ] Load extension in Chrome:
  1. Open `chrome://extensions/`
  2. Enable "Developer mode"
  3. Click "Load unpacked"
  4. Select `C:\Users\jones\AIprojects\AssisT\.vite\` directory

- [ ] Verify extension loads without errors

- [ ] **Test critical features:**
  - [ ] Extension popup opens
  - [ ] TTS works on test page
  - [ ] AI mode selection works (all 4 modes)
  - [ ] Settings save and persist
  - [ ] "Enable Everywhere" button works
  - [ ] Privacy policy link works from extension

- [ ] **Test on educational sites:**
  - [ ] Works on Canvas (\*.instructure.com)
  - [ ] Works on Moodle (\*.moodle.org)
  - [ ] Works on Google Classroom
  - [ ] Works on Google Docs

- [ ] **Check console for errors:**
  - [ ] No JavaScript errors
  - [ ] No manifest warnings
  - [ ] No permission errors

---

## ✅ PHASE 3: MANIFEST.JSON VERIFICATION

- [ ] **Version:** `"version": "0.1.1"`

- [ ] **Privacy Policy URL:**

  ```json
  "privacy_policy": "https://fiavaion.com/products/assist/privacy"
  ```

- [ ] **Permissions (required):**
  - [ ] `storage`
  - [ ] `activeTab`
  - [ ] `tabs`
  - [ ] `contextMenus`
  - [ ] `scripting`

- [ ] **Host Permissions (default):**
  - [ ] `*://*.instructure.com/*`
  - [ ] `*://*.canvas.com/*`
  - [ ] `*://*.moodle.org/*`
  - [ ] `*://*.moodlecloud.com/*`
  - [ ] `*://classroom.google.com/*`
  - [ ] `*://docs.google.com/*`

- [ ] **Optional Host Permissions:**
  - [ ] `<all_urls>` (user-granted only)

- [ ] **Content Security Policy:**
  - [ ] `script-src 'self'`
  - [ ] `object-src 'self'`

- [ ] **Name:** "AssisT: Adaptive Accessibility Tool"

- [ ] **Description:** Accurate and under 132 characters

---

## ✅ PHASE 4: PRIVACY POLICY VERIFICATION

### Extension Privacy Policy (.vite/privacy-policy.html)

- [ ] **Last Updated:** February 13, 2026
- [ ] **Effective Date:** February 13, 2026
- [ ] **Version:** 0.1.1

- [ ] **4 AI Modes Documented:**
  - [ ] Mode 1: Off
  - [ ] Mode 2: Local AI (Ollama)
  - [ ] Mode 3: Gemini Nano (Chrome Built-In)
  - [ ] Mode 4: Cloud AI (Anthropic Claude 4.5/4.6)

- [ ] **Encryption Specified:**
  - [ ] "AES-256 encryption" mentioned
  - [ ] "AES-256-GCM" mentioned
  - [ ] PBKDF2 key derivation mentioned

- [ ] **External APIs Listed:**
  - [ ] Anthropic Claude API
  - [ ] Google Dictionary API
  - [ ] MyMemory Translation API
  - [ ] CrossRef API
  - [ ] Ollama (localhost)
  - [ ] Gemini Nano (Chrome)

- [ ] **Compliance Claims:**
  - [ ] FERPA compliant
  - [ ] COPPA compliant
  - [ ] GDPR compliant
  - [ ] HIPAA considerations

- [ ] **What Data is NOT Collected:**
  - [ ] No analytics or tracking
  - [ ] No browsing history
  - [ ] No personal information
  - [ ] No account required

### Website Privacy Policy (Matches Extension)

- [ ] Both policies are consistent
- [ ] Same date (February 13, 2026)
- [ ] Same version (0.1.1)
- [ ] Same AI modes description
- [ ] Same encryption details
- [ ] Same external API list

---

## ✅ PHASE 5: DOCUMENTATION CONSISTENCY

### Version Numbers

- [ ] **manifest.json:** 0.1.1
- [ ] **README.md:** 0.1.1
- [ ] **CHANGELOG.md:** 0.1.1 entry exists
- [ ] **Extension privacy policy:** 0.1.1
- [ ] **Website privacy policy:** 0.1.1
- [ ] **Product page:** 0.1.1

### Dates

- [ ] **Extension privacy policy:** February 13, 2026
- [ ] **Website privacy policy:** February 13, 2026
- [ ] **README.md:** Last Updated 2026-02-13

### Feature Counts

- [ ] **README.md:** "35+ accessibility features (plus 8 AI features)"
- [ ] **Product page:** "35+ accessibility features that work instantly, plus 8 AI-powered features"
- [ ] **Consistent across all docs**

### AI Model References

- [ ] **All docs mention:** Claude Haiku 4.5, Sonnet 4.5, Opus 4.6
- [ ] **No references to:** Claude 3.x, old model names
- [ ] **4 AI modes explained:** Off, Ollama, Gemini Nano, Cloud
- [ ] **No "requires Ollama" statements** (says "choose from 4 modes")

### External API Claims

- [ ] **Anthropic:** Mentioned with Claude models
- [ ] **Dictionary API:** Free Dictionary API
- [ ] **Translation API:** MyMemory
- [ ] **CrossRef:** Citation metadata
- [ ] **Ollama:** Local AI option
- [ ] **Gemini Nano:** Chrome built-in option
- [ ] **No mentions of:** OpenAI, Google Cloud (unless actually supported)

---

## ✅ PHASE 6: CWS LISTING PREPARATION

### Store Listing Details

- [ ] **Name:** AssisT: Adaptive Accessibility Tool
- [ ] **Summary:** (132 char max) Clear description of what it does
- [ ] **Description:** Comprehensive feature list
- [ ] **Category:** Productivity or Accessibility
- [ ] **Language:** English

### Screenshots (Required: 1-5)

- [ ] Screenshot 1: Extension popup showing features
- [ ] Screenshot 2: TTS with highlighting in action
- [ ] Screenshot 3: AI features UI
- [ ] Screenshot 4: Settings panel
- [ ] Screenshot 5: Working on Canvas/LMS
- [ ] All screenshots are 1280x800 or 640x400
- [ ] No personal information visible
- [ ] Professional, clean appearance

### Promotional Images (Optional but Recommended)

- [ ] Small tile: 440x280
- [ ] Marquee promo tile: 1400x560
- [ ] High-quality logo visible

### Links

- [ ] **Website:** https://fiavaion.com/products/assist
- [ ] **Privacy Policy:** https://fiavaion.com/products/assist/privacy (VERIFIED LIVE)
- [ ] **Support URL:** GitHub issues or contact email
- [ ] **GitHub:** https://github.com/MarJone/AssisT

---

## ✅ PHASE 7: PERMISSIONS JUSTIFICATION

### Prepare Clear Explanations

- [ ] **storage:** Save user preferences locally
- [ ] **activeTab:** Apply features to current page
- [ ] **tabs:** Detect navigation to educational sites
- [ ] **contextMenus:** Right-click quick access
- [ ] **scripting:** Inject accessibility features
- [ ] **Optional <all_urls>:** User can enable on any website

### Justify Optional Permissions

- [ ] Explain why `<all_urls>` is optional, not required
- [ ] Show "Enable Everywhere" button in screenshots
- [ ] Emphasize user control and consent
- [ ] Explain that it works fully on educational sites without this permission

---

## ✅ PHASE 8: AI MODE EXPLANATION FOR REVIEWERS

### Prepare Clear Explanation

- [ ] **4 AI Modes Available:**
  1. **Off** - No AI, all other features work
  2. **Local (Ollama)** - On-device, 100% private
  3. **Gemini Nano** - Chrome built-in, 100% private
  4. **Cloud (Anthropic)** - User's own API key, encrypted

- [ ] **Privacy Guarantees:**
  - [ ] No data sent to Fiavaion
  - [ ] User chooses AI mode
  - [ ] API keys encrypted with AES-256-GCM
  - [ ] Cloud mode optional

- [ ] **Compliance:**
  - [ ] FERPA compliant (local processing)
  - [ ] COPPA compliant (no data collection)
  - [ ] GDPR compliant (user control)

---

## ✅ PHASE 9: FINAL PRE-SUBMISSION CHECKS

### Code Quality

- [ ] No console.log() statements in production code
- [ ] No TODO comments in critical paths
- [ ] No hardcoded API keys or secrets
- [ ] All dependencies up to date
- [ ] No security vulnerabilities (run `npm audit`)

### Testing

- [ ] All 979 unit tests pass: `npm test`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Manual testing on Chrome stable
- [ ] Tested on Windows/Mac/Linux
- [ ] Tested on different screen sizes

### Documentation

- [ ] README.md is accurate
- [ ] CHANGELOG.md updated for v0.1.1
- [ ] GitHub repository is public
- [ ] License file present (MIT)
- [ ] Contributing guidelines present

### Extension Package

- [ ] Create ZIP of `.vite/` directory for upload
- [ ] ZIP file is under 100MB
- [ ] All files included
- [ ] No unnecessary files (node_modules, .git, etc.)

---

## ✅ PHASE 10: CHROME WEB STORE SUBMISSION

### Developer Console

1. [ ] Log in to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

2. [ ] Navigate to AssisT listing (or create new)

3. [ ] Upload ZIP file from `.vite/` directory

4. [ ] Fill in all required fields:
   - [ ] Name
   - [ ] Summary
   - [ ] Description
   - [ ] Category
   - [ ] Language
   - [ ] Privacy policy URL
   - [ ] Website URL
   - [ ] Support URL

5. [ ] Upload screenshots (1-5 required)

6. [ ] Upload promotional images (optional)

7. [ ] **Permissions Declaration:**
   - [ ] Justify each permission
   - [ ] Explain optional permissions
   - [ ] Emphasize user control

8. [ ] **Privacy Practices:**
   - [ ] Select "Does not collect data" (for local mode)
   - [ ] Explain cloud mode is optional with user's own key
   - [ ] Link to detailed privacy policy

9. [ ] **Single Purpose Description:**
   - [ ] Clearly state: "Adaptive accessibility tool for neurodivergent learners"
   - [ ] Emphasize educational focus

10. [ ] **Review all fields** one more time

11. [ ] Click **"Submit for Review"**

---

## ✅ PHASE 11: POST-SUBMISSION

### Monitor Review Status

- [ ] Check Developer Dashboard daily
- [ ] Respond promptly to reviewer questions (usually within 24-48 hours)
- [ ] Have source code ready if requested

### Prepare for Common Review Questions

- [ ] **Q:** "Why do you need <all_urls> permission?"
  - **A:** "It's optional, user-granted only via 'Enable Everywhere' button. Works fully on educational sites without it."

- [ ] **Q:** "What data do you collect?"
  - **A:** "None. All processing is local. Cloud AI mode is optional and uses user's own API key."

- [ ] **Q:** "Why do you need scripting permission?"
  - **A:** "To inject accessibility features (TTS, reading guides) into web pages for assistive technology."

- [ ] **Q:** "Explain AI features."
  - **A:** "4 modes: Off, Local (Ollama), Gemini Nano (Chrome built-in), Cloud (user's own Anthropic API key with AES-256 encryption). User chooses mode. Default is local-only."

### If Review is Rejected

- [ ] Read rejection reason carefully
- [ ] Fix the specific issue mentioned
- [ ] Update documentation if needed
- [ ] Re-submit with explanation of changes
- [ ] Be patient and professional

### After Approval

- [ ] Celebrate! 🎉
- [ ] Announce on social media/website
- [ ] Monitor user reviews and ratings
- [ ] Respond to user feedback
- [ ] Plan next update

---

## 📋 CRITICAL SUCCESS CRITERIA

### Must Be True Before Submission:

✅ **Privacy policy is LIVE at:** https://fiavaion.com/products/assist/privacy
✅ **Privacy policy shows:** Feb 13, 2026 / v0.1.1
✅ **Privacy policy includes:** 4 AI modes, AES-256, Claude 4.5/4.6
✅ **manifest.json includes:** privacy_policy URL
✅ **Extension builds without errors**
✅ **Extension loads and works in Chrome**
✅ **All version numbers are 0.1.1**
✅ **All dates are February 13, 2026**
✅ **Documentation is consistent across repos**
✅ **No Claude 3 references remain**
✅ **Feature counts are accurate (35+ / 8 AI)**
✅ **Screenshots are professional and informative**
✅ **Permissions are justified**
✅ **Tests pass**

---

## 📞 SUPPORT CONTACT

**Developer:** MarJone
**Email:** info@fiavaion.com
**GitHub:** https://github.com/MarJone/AssisT
**Website:** https://fiavaion.com

---

## ✅ FINAL CHECKLIST SIGNATURE

- [ ] I have reviewed all checklist items
- [ ] Website privacy policy is LIVE and verified
- [ ] Extension has been tested thoroughly
- [ ] All documentation is consistent and accurate
- [ ] I am ready to submit to Chrome Web Store

**Date:** ******\_\_\_******
**Signed:** ******\_\_\_******

---

**Good luck with your Chrome Web Store submission!** 🚀

Your documentation is now **perfect** and ready for submission. The AssisT project and Fiavaion's reputation are well-protected with accurate, comprehensive, and professional documentation.
