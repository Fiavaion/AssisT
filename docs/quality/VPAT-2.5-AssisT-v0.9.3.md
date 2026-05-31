# Voluntary Product Accessibility Template (VPAT®) 2.5 — International Edition

**Name of Product / Version:** AssisT: Adaptive Augmentative Tool, version 0.9.3

**Product Description:** A Chrome Manifest V3 browser extension that provides accessibility tools for neurodivergent learners inside Canvas, Moodle, and Google Classroom learning-management systems. Features include synchronised text-to-speech, speech-to-text dictation, dyslexia-friendly typography and reading aids, focus / reading modes, OCR, translation, AI-assisted learning (local via Ollama / WebLLM / Chrome Prompt API, or optional cloud providers), sticky notes, annotation highlighting, citations, dictionary lookup, text statistics, and a customisable keyboard-shortcut system (14 shortcuts, platform-aware).

**Date:** 2026-05-28

**Contact Information:** `accessibility@fiavaion.com` — Fiavaion, Ireland. Website: <https://fiavaion.com/products/assist/>. The legal person behind the Fiavaion trading name is identifiable on written request to the contact address above; this ensures funders, HEIs, and procurement offices can confirm counterparty identity without placing the maintainer's personal name in public documentation.

**Notes:** This VPAT is a self-assessment prepared by the project maintainer based on the codebase state at v0.9.3 (June 2026), incorporating Pa11y-CI automated findings and manual keyboard-navigation testing. It supersedes the v0.1.2 VPAT (published 2026-04-19). An independent third-party accessibility audit is planned (budget committed in the NLnet NGI0 Commons Fund application); this VPAT will be updated upon audit completion. Readers acting on procurement decisions are invited to contact the address above with questions or to report accessibility issues.

**Evaluation Methods Used:**

- Automated testing with Pa11y-CI (configured in `npm run test:a11y:ci`), axe DevTools, and WAVE; CI gate passes clean at v0.9.3.
- Manual keyboard-navigation testing of the extension popup, advanced options modal, user profile interface, and all 14 registered keyboard shortcuts.
- Manual inspection of content-script–injected elements (highlight menu, mic button, reading guide, focus mode overlay, sticky notes, annotation sidebar).
- Code review against WCAG 2.2 success criteria, ARIA Authoring Practices Guide 1.2, and WAI-Adapt draft concepts.
- 997 unit tests (Jest) and 74 end-to-end tests (Playwright; Chrome extension architecture requires a display-attached browser — attended CI verification only); accessibility assertions in both suites.
- Screen-reader testing (NVDA on Windows) planned but not yet completed — see Remarks and Gaps below.

---

## Applicable Standards and Guidelines

| Standard / Guideline                                                                                                                                    | Included in Report                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) — Level A                                                                     | Yes                                                                                                         |
| [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) — Level AA                                                                    | Yes                                                                                                         |
| [EN 301 549 v3.2.1 (EU harmonised accessibility standard)](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf) | Yes — by reference to Clause 9 (Web) which adopts WCAG 2.1 AA and is extended by this report to WCAG 2.2 AA |
| [Revised Section 508](https://www.access-board.gov/ict/) — US Federal (for reference; product is not sold to US Federal agencies)                       | Yes — via WCAG 2.x mapping in Chapter 5                                                                     |
| Level AAA WCAG success criteria                                                                                                                         | No — not claimed                                                                                            |
| Non-web software / mobile (EN 301 549 Clauses 10–11)                                                                                                    | Partially — see Chapter Conformance notes                                                                   |

---

## Terms Used

- **Supports** — The functionality of the product has at least one method that meets the criterion without known defects, or meets it with equivalent facilitation.
- **Partially Supports** — Some functionality of the product does not meet the criterion.
- **Does Not Support** — The majority of product functionality does not meet the criterion.
- **Not Applicable** — The criterion is not relevant to the product.
- **Not Evaluated** — The product has not been evaluated against the criterion. This designation is used only in WCAG 2.x Level AAA rows (not claimed).

---

## WCAG 2.2 Report

Tables 1 and 2 also document conformance with:

- **EN 301 549:** Chapter 9 — Web; Chapter 10 — Non-web documents (where applicable to in-product help); Chapter 11.8 — Authoring tools (not applicable; AssisT is a consumer tool, not an authoring tool).
- **Revised Section 508:** Chapter 5 — Software; Chapter 6 — Support Documentation and Services (mapped via WCAG).

This report covers the **Supports**, **Partially Supports**, **Does Not Support**, and **Not Applicable** conformance designations. Only Level A and Level AA Success Criteria are claimed; Level AAA criteria are out of scope.

### Notes on Scope

- **Popup UI, Options modal, and User Profiles interface:** Fully evaluated.
- **Content script–injected elements:** Partially evaluated — highlight menu, mic button, reading guide overlay, focus mode dimmer, annotation sidebar, and sticky notes have been keyboard-tested; automated Pa11y coverage of the injected DOM context is a documented roadmap item.
- **Canvas / Moodle / Classroom host pages:** Accessibility of the host LMS is out of AssisT's scope. AssisT is additive and does not override host-page semantics.

---

### Table 1: Success Criteria, Level A

| Criterion                                                                   | Conformance Level | Remarks and Explanations                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1.1 Non-text Content** (Level A)                                        | Supports          | All icon buttons have `aria-label`. Images carry `alt`. Decorative glyphs use `aria-hidden="true"`. Hidden file-input for profile JSON import carries `aria-label="Import profile JSON file"` (added v0.9.2).  |
| **1.2.1 Audio-only and Video-only (Prerecorded)**                           | Not Applicable    | Product contains no prerecorded audio-only or video-only media.                                                                                                                                                |
| **1.2.2 Captions (Prerecorded)**                                            | Not Applicable    | Product contains no prerecorded video media requiring captions.                                                                                                                                                |
| **1.2.3 Audio Description or Media Alternative (Prerecorded)**              | Not Applicable    | Product contains no prerecorded video media.                                                                                                                                                                   |
| **1.3.1 Info and Relationships**                                            | Supports          | Semantic HTML throughout. Form labels properly associated. Heading hierarchy enforced (h1 → h2 → h3). Dynamic regions use appropriate ARIA landmarks.                                                          |
| **1.3.2 Meaningful Sequence**                                               | Supports          | DOM order matches visual order. Reading order logical across popup and injected UI.                                                                                                                            |
| **1.3.3 Sensory Characteristics**                                           | Supports          | Instructions do not rely solely on shape, size, or spatial location.                                                                                                                                           |
| **1.4.1 Use of Color**                                                      | Supports          | Experimental badges combine colour with text labels. Toggle states convey state via position and colour. Focus indicators use more than colour alone. Shortcut badges use colour with `<kbd>` semantic markup. |
| **1.4.2 Audio Control**                                                     | Not Applicable    | Product does not auto-play audio. Text-to-speech is user-initiated and fully controllable.                                                                                                                     |
| **2.1.1 Keyboard**                                                          | Supports          | All interactive functionality is operable via keyboard. 14 customisable shortcuts registered; platform-aware shortcut badges (`⌥` on macOS, `Alt` on Windows) displayed in popup labels.                       |
| **2.1.2 No Keyboard Trap**                                                  | Supports          | Focus can move away from every component. Modal dialogs dismiss with `Esc`.                                                                                                                                    |
| **2.1.4 Character Key Shortcuts**                                           | Supports          | Single-character shortcuts are not used. All shortcuts require modifier keys (Alt/Option).                                                                                                                     |
| **2.2.1 Timing Adjustable**                                                 | Not Applicable    | Product imposes no time limits.                                                                                                                                                                                |
| **2.2.2 Pause, Stop, Hide**                                                 | Not Applicable    | Product contains no moving, blinking, or auto-updating content.                                                                                                                                                |
| **2.3.1 Three Flashes or Below Threshold**                                  | Supports          | Product contains no flashing content.                                                                                                                                                                          |
| **2.4.1 Bypass Blocks**                                                     | Not Applicable    | Popup is a single-view interface; no repeated navigation blocks.                                                                                                                                               |
| **2.4.2 Page Titled**                                                       | Supports          | Popup is titled "AssisT: Adaptive Augmentative Tool".                                                                                                                                                          |
| **2.4.3 Focus Order**                                                       | Supports          | Focus sequence follows visual layout. Tab order verified across popup, modals, and injected controls.                                                                                                          |
| **2.4.4 Link Purpose (In Context)**                                         | Supports          | Links carry descriptive text; no "click here" patterns.                                                                                                                                                        |
| **2.5.1 Pointer Gestures**                                                  | Supports          | All functionality operable by single pointer events. No multi-point or path-based gestures.                                                                                                                    |
| **2.5.2 Pointer Cancellation**                                              | Supports          | Actions trigger on up-event (mousedown + preventDefault + stopPropagation pattern). Event utilities in `src/utils/event-handlers.js` enforce this pattern uniformly.                                           |
| **2.5.3 Label in Name**                                                     | Supports          | Accessible names match visible labels.                                                                                                                                                                         |
| **2.5.4 Motion Actuation**                                                  | Not Applicable    | Product does not use device motion as input.                                                                                                                                                                   |
| **3.1.1 Language of Page**                                                  | Supports          | `<html lang="en">` set.                                                                                                                                                                                        |
| **3.2.1 On Focus**                                                          | Supports          | Focus does not cause context changes.                                                                                                                                                                          |
| **3.2.2 On Input**                                                          | Supports          | Settings require explicit Save; no unexpected context changes on input.                                                                                                                                        |
| **3.3.1 Error Identification**                                              | Supports          | Form errors identified in text; not conveyed by colour alone. API key validation, profile name validation, and custom vocabulary entry all provide specific error messages.                                    |
| **3.3.2 Labels or Instructions**                                            | Supports          | All form inputs carry labels; complex controls have instructions.                                                                                                                                              |
| **3.3.7 Redundant Entry** (new in WCAG 2.2)                                 | Supports          | Settings import/export and profile switching eliminate redundant entry.                                                                                                                                        |
| **4.1.1 Parsing** (obsolete in WCAG 2.2 but retained for EN 301 549 v3.2.1) | Supports          | HTML validates; no duplicate IDs; proper nesting (W3C validator).                                                                                                                                              |
| **4.1.2 Name, Role, Value**                                                 | Supports          | ARIA roles, labels, and states applied consistently. State changes communicated programmatically (`aria-checked`, `aria-expanded`). LMS integration toggles properly labelled.                                 |

### Table 2: Success Criteria, Level AA

| Criterion                                                       | Conformance Level  | Remarks and Explanations                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.2.4 Captions (Live)**                                       | Not Applicable     | Product contains no live media.                                                                                                                                                                                                                                                                                                                                                                             |
| **1.2.5 Audio Description (Prerecorded)**                       | Not Applicable     | Product contains no prerecorded video media.                                                                                                                                                                                                                                                                                                                                                                |
| **1.3.4 Orientation**                                           | Supports           | UI works in any orientation; no forced orientation lock.                                                                                                                                                                                                                                                                                                                                                    |
| **1.3.5 Identify Input Purpose**                                | Supports           | Input fields use `autocomplete` attributes where appropriate.                                                                                                                                                                                                                                                                                                                                               |
| **1.4.3 Contrast (Minimum)**                                    | Partially Supports | Main text, button text, and badge text meet 4.5:1 minimum. Two specific failures identified and fixed in v0.9.2: `#stt-engine-offline-badge` corrected from `#059669` (3.1:1) to `#00875d` (4.7:1); `#citation-count-badge` corrected from `#f59e0b` (2.8:1) to `#a76900` (4.7:1). Disabled-state foreground/background combinations across all themes remain unverified and are a documented roadmap item. |
| **1.4.4 Resize Text**                                           | Supports           | Text scales to 200% without loss of functionality; no fixed pixel heights on text containers.                                                                                                                                                                                                                                                                                                               |
| **1.4.5 Images of Text**                                        | Supports           | No images of text; all text is real text.                                                                                                                                                                                                                                                                                                                                                                   |
| **1.4.10 Reflow**                                               | Supports           | Content reflows at 320 CSS pixels width; no horizontal scrolling required.                                                                                                                                                                                                                                                                                                                                  |
| **1.4.11 Non-text Contrast**                                    | Partially Supports | Focus indicators meet 3:1 against adjacent colours. Toggle-switch track and thumb contrast across all themes not fully verified. **Action:** complete UI-component contrast sweep before v1.0.                                                                                                                                                                                                              |
| **1.4.12 Text Spacing**                                         | Supports           | AssisT **implements** text-spacing adjustments as a user feature — line-height 1.5×, letter-spacing 0.12em, word-spacing 0.16em (all user-adjustable). The AssisT UI itself respects user text-spacing overrides without loss of content or functionality.                                                                                                                                                  |
| **1.4.13 Content on Hover or Focus**                            | Supports           | Tooltips are dismissible (`Esc`), hoverable, and persistent until dismissed.                                                                                                                                                                                                                                                                                                                                |
| **2.4.5 Multiple Ways**                                         | Not Applicable     | Popup is single-page; no multi-page navigation to provide alternatives for.                                                                                                                                                                                                                                                                                                                                 |
| **2.4.6 Headings and Labels**                                   | Supports           | Headings and labels are descriptive.                                                                                                                                                                                                                                                                                                                                                                        |
| **2.4.7 Focus Visible**                                         | Supports           | All focusable elements display a visible focus indicator with ≥3:1 contrast.                                                                                                                                                                                                                                                                                                                                |
| **2.4.11 Focus Not Obscured (Minimum)** (new in WCAG 2.2)       | Supports           | Focused elements are not fully hidden by other content. Modal dialogs do not obscure focus of underlying focusable items. Injected controls (mic button, reading guide) are positioned to avoid obscuring host-page focus.                                                                                                                                                                                  |
| **2.5.7 Dragging Movements** (new in WCAG 2.2)                  | Supports           | No drag-only interactions. Sliders provide keyboard alternatives.                                                                                                                                                                                                                                                                                                                                           |
| **2.5.8 Target Size (Minimum)** (new in WCAG 2.2)               | Supports           | Toggle switches 44×24px; buttons 32×32px minimum (exceeds 24×24 CSS-pixel requirement). Mic button 48×48px.                                                                                                                                                                                                                                                                                                 |
| **3.1.2 Language of Parts**                                     | Not Applicable     | Product UI is single-language (English). Translation feature translates external content; translated text is served with appropriate `lang` attribution on output.                                                                                                                                                                                                                                          |
| **3.2.3 Consistent Navigation**                                 | Supports           | Navigation elements occupy consistent positions across popup views.                                                                                                                                                                                                                                                                                                                                         |
| **3.2.4 Consistent Identification**                             | Supports           | Identical icons and labels used consistently (for example, "Save Settings").                                                                                                                                                                                                                                                                                                                                |
| **3.2.6 Consistent Help** (new in WCAG 2.2)                     | Partially Supports | Per-feature in-context help exists for each AI feature panel. No single, consistently-positioned help mechanism across all views. **Action:** add persistent "?" help affordance to popup header and advanced-options footer before v1.0.                                                                                                                                                                   |
| **3.3.3 Error Suggestion**                                      | Supports           | Error messages suggest corrections (for example, "Invalid profile name. Use letters, numbers, and spaces only."; vocabulary entry validation messages).                                                                                                                                                                                                                                                     |
| **3.3.4 Error Prevention (Legal, Financial, Data)**             | Not Applicable     | Product does not conduct legal, financial, or irreversible data transactions.                                                                                                                                                                                                                                                                                                                               |
| **3.3.8 Accessible Authentication (Minimum)** (new in WCAG 2.2) | Not Applicable     | Product does not require user authentication. All personalisation is local-device.                                                                                                                                                                                                                                                                                                                          |
| **4.1.3 Status Messages**                                       | Partially Supports | Toast notifications use `role="status"` and `aria-live="polite"` regions. AI-inference loading states in feature panels do not yet expose `aria-busy`. **Action:** add `aria-busy="true"` to dynamic content regions during load and inference states before v1.0.                                                                                                                                          |

---

## EN 301 549 v3.2.1 Conformance Notes

AssisT is a web-based application delivered as a Chrome browser extension. The EN 301 549 clauses most relevant to this product are:

| Clause        | Title                                           | Applicability                         | Remarks                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clause 5**  | Generic requirements                            | Applicable                            | Clause 5.1 (Closed functionality) — Not applicable (not a closed product). Clause 5.2–5.9 — conformance follows from WCAG support above.                                                                   |
| **Clause 6**  | ICT with two-way voice communication            | Not Applicable                        | Product does not provide two-way voice communication.                                                                                                                                                      |
| **Clause 7**  | ICT with video capabilities                     | Not Applicable                        | Product does not provide video content.                                                                                                                                                                    |
| **Clause 8**  | Hardware                                        | Not Applicable                        | Product is software only.                                                                                                                                                                                  |
| **Clause 9**  | Web                                             | Applicable                            | Adopts WCAG 2.1 Level AA. AssisT additionally claims WCAG 2.2 AA conformance per Tables 1 and 2 above, which subsumes WCAG 2.1 AA.                                                                         |
| **Clause 10** | Non-web documents                               | Applicable to published documentation | Documentation (user guides, accessibility conformance report, privacy policy) is delivered as accessible HTML / Markdown on fiavaion.com. No proprietary document formats are required to use the product. |
| **Clause 11** | Software                                        | Applicable — see note                 | Chrome extension popup is a web-based software UI and is covered by Clause 9. The extension does not ship a separate native application.                                                                   |
| **Clause 12** | Documentation and support services              | Applicable                            | Documentation is provided in HTML / Markdown. Support channel at `accessibility@fiavaion.com`.                                                                                                             |
| **Clause 13** | ICT providing relay or emergency service access | Not Applicable                        |                                                                                                                                                                                                            |

---

## Legal Disclaimer

The information in this Accessibility Conformance Report (ACR) is provided in good faith based on the product state at the specified date. Fiavaion makes no legal representation or warranty regarding absolute compliance with WCAG 2.2, EN 301 549, or any other accessibility standard. Readers should perform their own testing where procurement decisions depend on specific conformance claims. This ACR will be updated on each minor release and republished at <https://fiavaion.com/products/assist/accessibility>.

---

## Gaps and Roadmap

The following items are tracked for closure before version 1.0 and will be reflected in an updated VPAT on completion:

1. **SC 1.4.3 Contrast (Minimum):** Complete contrast verification for disabled-state foreground/background combinations across all themes and across all toggle/badge states. Two specific failures fixed in v0.9.2; systematic sweep of disabled states remains.
2. **SC 1.4.11 Non-text Contrast:** Complete contrast verification for toggle-switch track and thumb across all themes.
3. **SC 3.2.6 Consistent Help:** Add a persistent help affordance (proposed: "?" icon in the popup header linking to the feature guide, and a help link in the advanced-options footer).
4. **SC 4.1.3 Status Messages:** Add `aria-busy="true"` to dynamic content regions during AI-inference and load states.
5. **Screen-reader validation:** Complete manual testing with NVDA (Windows), JAWS (Windows), and VoiceOver (macOS). Publish findings. This is the highest-priority remaining quality item.
6. **Third-party audit:** Commission an independent accessibility review to verify VPAT self-assessment claims. Budgeted in the NLnet NGI0 Commons Fund application (€2,500); planned for Month 1 of the grant period.
7. **Content-script Pa11y coverage:** Extend automated Pa11y scanning to content-script–injected UI (highlight menu, mic button, reading guide, focus overlay, annotation sidebar, sticky notes). Currently verified by manual keyboard inspection only.

---

## Changes from v0.1.2 VPAT

Key improvements reflected in this v0.9.3 assessment:

- **1.1.1:** Added `aria-label="Import profile JSON file"` to hidden file input for profile import.
- **1.4.3:** Two contrast failures fixed: STT offline badge and citation count badge corrected to meet 4.5:1 (see Table 2 remarks). Assessment remains Partially Supports pending disabled-state sweep.
- **2.1.1:** 14-key shortcut system now fully registered and validated; platform-aware shortcut badges added to popup labels.
- **2.1.4:** Confirmed no single-character shortcuts; all 14 shortcuts require Alt/Option modifier.
- **2.5.2:** Pointer-cancellation pattern now uniformly applied via `src/utils/event-handlers.js`; checkboxes correctly use `change` event (mousedown preventDefault exempted to preserve toggle behaviour).
- **4.1.2:** LMS integration toggles (Canvas, Moodle, Google Classroom, Moodle-specific) properly wired with ARIA labels.
- **Unit test coverage:** 979 (v0.1.2) → 997 (v0.9.3).

---

## Revision History

| Version | Date       | Author                | Changes                                                                                                                                                                         |
| ------- | ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-19 | Fiavaion (maintainer) | Initial VPAT 2.5 Int published. Derived from internal WCAG 2.2 AA audit dated 2025-10-13; updated for product v0.1.2.                                                           |
| 2.0     | 2026-05-28 | Fiavaion (maintainer) | Updated for v0.9.3. Contrast fixes documented (1.4.3). Hidden file-input aria-label added (1.1.1). Shortcut system fully registered (2.1.1). Changes-from-v0.1.2 section added. |

---

## How to Report an Accessibility Issue

Please email `accessibility@fiavaion.com` with:

- The AssisT version (see Popup → About).
- The browser and operating system.
- A description of the issue and the steps to reproduce.
- Whether assistive technology (and which) was in use.

We aim to acknowledge reports within 5 working days.

---

**Source repository:** <https://github.com/Fiavaion/AssisT>
**Published at:** <https://fiavaion.com/products/assist/accessibility>
**Copyright:** © 2026 Fiavaion. This VPAT is published under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) licence; the AssisT product itself is distributed under the [European Union Public Licence v1.2 (EUPL-1.2)](https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12) — see repository `LICENSE`.
