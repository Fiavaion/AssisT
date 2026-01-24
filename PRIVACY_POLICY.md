# Privacy Policy for AssisT Adaptive EdTech Extension

**Last Updated:** January 22, 2026
**Effective Date:** January 22, 2026

---

## Overview

AssisT is a Chrome browser extension designed to enhance accessibility and learning support for students using Canvas LMS, Moodle, and Google Classroom. This privacy policy explains how AssisT handles user data and respects user privacy.

---

## Data Collection and Usage

### What Data We Collect

AssisT operates **entirely on your local device** and does **not collect, store, or transmit any personal information to external servers**. Specifically:

- **No Usage Tracking:** We do not track how you use the extension.
- **No Analytics:** We do not use analytics services (e.g., Google Analytics, mixpanel).
- **No Account Creation:** AssisT does not require user accounts or authentication.
- **No Personal Information:** We do not collect names, email addresses, student IDs, or any personally identifiable information (PII).

### Local Data Storage

The extension stores the following data **locally on your device only** using Chrome's secure storage API:

1. **API Keys (Optional):**
   - If you choose to use cloud-based Text-to-Speech (TTS) or Speech-to-Text (STT) services, you may provide API keys for services like Google Cloud Speech, Amazon Polly, or similar providers.
   - These keys are stored locally in your browser and are **never transmitted to AssisT developers or third-party servers** (except directly to the API provider you configured).

2. **User Preferences:**
   - Settings such as reading speed, highlight colors, voice selection, and feature toggles are stored locally to persist your preferences across sessions.

3. **Temporary Content Processing:**
   - When using features like text-to-speech, the extension accesses page content from Canvas/Moodle/Google Classroom pages you visit.
   - This content is processed **locally in your browser** and is not stored or transmitted unless you explicitly choose to use a cloud-based API (see "Third-Party Services" below).

---

## Permissions Explanation

AssisT requires the following Chrome permissions to function:

### 1. **Storage Permission**

- **Why:** To save your preferences and API keys locally on your device.
- **Data Access:** Limited to Chrome's local storage API (no external servers).

### 2. **Content Scripts on Educational Platforms**

- **Domains:** `*.instructure.com` (Canvas), `*.moodle.org`, `classroom.google.com`, and institutional LMS domains.
- **Why:** To inject accessibility features (text highlighting, TTS controls, etc.) into learning management system pages.
- **Data Access:** The extension can read and modify content on these pages to provide accessibility features. **No data is sent to external servers.**

### 3. **TTS/STT APIs (Optional)**

- **Why:** If you enable cloud-based speech services, the extension will send text content to the API provider you configure (e.g., Google Cloud, AWS).
- **User Control:** This is entirely optional and disabled by default. You must explicitly provide API keys and enable these features.

---

## Third-Party Services (Optional)

If you choose to use cloud-based TTS/STT services:

- **Data Sent:** Only the specific text content you request to be read aloud or transcribed is sent to your chosen API provider.
- **Provider Privacy Policies:** Your interaction with these services is governed by their respective privacy policies:
  - [Google Cloud Speech-to-Text Privacy Policy](https://cloud.google.com/terms/)
  - [Amazon Polly Privacy Policy](https://aws.amazon.com/privacy/)
  - [Microsoft Azure Cognitive Services Privacy Policy](https://privacy.microsoft.com/en-us/privacystatement)

**Important:** AssisT developers **do not** receive, store, or have access to data sent to these third-party APIs.

---

## FERPA and Student Privacy Compliance

AssisT is designed with **FERPA (Family Educational Rights and Privacy Act)** compliance in mind:

- **No Data Collection:** We do not collect or store student education records.
- **Local Processing:** All content processing happens locally in the user's browser.
- **No Third-Party Sharing:** We do not share any user data with third parties (unless the user explicitly enables and configures optional cloud APIs, which are under the user's control).

**Educational Institutions:** If deploying AssisT in a managed environment, consult your institution's IT and legal teams to ensure compliance with local policies.

---

## Data Security

- **Local Storage Encryption:** Chrome's storage API uses the operating system's built-in encryption mechanisms.
- **No External Transmission:** Since AssisT operates entirely client-side (except for optional user-configured APIs), there is no risk of data interception during transmission to AssisT servers (because there are no AssisT servers).
- **User-Controlled APIs:** If using cloud APIs, data is transmitted securely over HTTPS to the provider you choose.

---

## Children's Privacy

AssisT may be used by students under the age of 13 in educational settings. Since we do not collect any personal information, we comply with **COPPA (Children's Online Privacy Protection Act)** requirements. No data is collected, stored, or transmitted by AssisT.

---

## Your Rights and Choices

- **Disable Features:** You can disable any feature (TTS, STT, etc.) at any time via the extension's settings.
- **Remove API Keys:** You can delete stored API keys at any time through the extension's settings panel.
- **Uninstall:** Removing the extension from Chrome will delete all locally stored data (preferences, API keys, etc.).

---

## Changes to This Privacy Policy

We may update this privacy policy from time to time to reflect changes in functionality or legal requirements. Updates will be posted at:

- **GitHub Repository:** https://github.com/fiavaion/AssisT
- **Chrome Web Store Listing:** (Link will be added after publication)

**Notification:** Material changes will be indicated by updating the "Last Updated" date at the top of this policy.

---

## Contact Information

If you have questions about this privacy policy or AssisT's data practices, please contact:

- **Email:** info@fiavaion.com
- **GitHub Issues:** https://github.com/fiavaion/AssisT/issues

---

## Summary (TL;DR)

✅ **No data collection:** We don't track you or collect personal information.
✅ **Local-only storage:** Preferences and API keys stay on your device.
✅ **No external servers:** AssisT has no backend servers (all processing is local).
✅ **Optional cloud APIs:** If you enable TTS/STT cloud services, you control which provider and API keys are used.
✅ **FERPA/COPPA compliant:** Designed for educational use with student privacy in mind.
✅ **Open source:** Code is transparent and auditable.

---

**By using AssisT, you agree to this privacy policy.**
