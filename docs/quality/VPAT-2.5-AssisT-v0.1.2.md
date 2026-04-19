# Voluntary Product Accessibility Template (VPAT®) 2.5 — International Edition

**Name of Product / Version:** AssisT: Adaptive Augmentative Tool, version 0.1.2

**Product Description:** A Chrome Manifest V3 browser extension that provides accessibility tools for neurodivergent learners inside Canvas, Moodle, and Google Classroom learning-management systems. Features include synchronised text-to-speech, speech-to-text dictation, dyslexia-friendly typography and reading aids, focus / reading modes, OCR, translation, and privacy-respecting AI-assisted learning features (local via Ollama / WebLLM / Chrome Prompt API, or optional cloud providers).

**Date:** 2026-04-19

**Contact Information:** `accessibility@fiavaion.com` — Fiavaion, Ireland. Website: <https://fiavaion.com/products/assist/>. The legal person behind the Fiavaion trading name is identifiable on written request to the contact address above; this ensures funders, HEIs, and procurement offices can confirm counterparty identity without placing the maintainer's personal name in public documentation.

**Notes:** This VPAT is an internal self-assessment prepared by the project maintainer based on the accompanying [WCAG 2.2 AA audit](./WCAG_2.2_AA_AUDIT.md) dated 2025-10-13, updated for product version 0.1.2. It is published in good faith to support adoption decisions. External third-party validation is planned and will be republished as a superseding VPAT. Readers acting on procurement decisions are invited to contact the address above with questions or to report accessibility issues.

**Evaluation Methods Used:**

- Automated testing with axe DevTools, WAVE, and Pa11y / Pa11y-CI (configured in `npm run test:a11y:ci`).
- Manual keyboard-navigation testing of the extension popup, advanced options modal, and user profile interface.
- Code review against WCAG 2.2 success criteria, ARIA Authoring Practices, and WAI-Adapt concepts.
- 979 unit tests and 74+ end-to-end tests covering interaction flows; accessibility assertions integrated into CI.
- Screen-reader testing (NVDA, JAWS, VoiceOver) and third-party accessibility review **planned but not yet completed** — see Remarks against individual criteria and the [Gaps and Roadmap](#gaps-and-roadmap) section below.

---

## Applicable Standards and Guidelines

This report covers the following accessibility standards and guidelines. See the corresponding report tables below for details.

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

The terms used in the Conformance Level column of the tables below are defined as follows:

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
- **Content script–injected elements:** Partially evaluated — core controls (mic button, reading guide overlay, focus mode dimmer) have been keyboard-tested; full automated testing is blocked by the injected-DOM context and is a documented roadmap item.
- **Canvas / Moodle / Classroom host pages:** Accessibility of the host LMS is out of AssisT's scope. AssisT is additive and does not override host-page semantics.

---

### Table 1: Success Criteria, Level A

| Criterion                                                                   | Conformance Level | Remarks and Explanations                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1.1 Non-text Content** (Level A)                                        | Supports          | All icon buttons have `aria-label`. Images carry `alt`. Decorative glyphs use `aria-hidden="true"`.                                                   |
| **1.2.1 Audio-only and Video-only (Prerecorded)**                           | Not Applicable    | Product contains no prerecorded audio-only or video-only media.                                                                                       |
| **1.2.2 Captions (Prerecorded)**                                            | Not Applicable    | Product contains no prerecorded video media requiring captions.                                                                                       |
| **1.2.3 Audio Description or Media Alternative (Prerecorded)**              | Not Applicable    | Product contains no prerecorded video media.                                                                                                          |
| **1.3.1 Info and Relationships**                                            | Supports          | Semantic HTML throughout. Form labels properly associated. Heading hierarchy enforced (h1 → h2 → h3).                                                 |
| **1.3.2 Meaningful Sequence**                                               | Supports          | DOM order matches visual order. Reading order logical.                                                                                                |
| **1.3.3 Sensory Characteristics**                                           | Supports          | Instructions do not rely solely on shape, size, or spatial location.                                                                                  |
| **1.4.1 Use of Color**                                                      | Supports          | Experimental badges combine colour with text labels. Toggle states convey state via position and colour. Focus indicators use more than colour alone. |
| **1.4.2 Audio Control**                                                     | Not Applicable    | Product does not auto-play audio. Text-to-speech is user-initiated and fully controllable.                                                            |
| **2.1.1 Keyboard**                                                          | Supports          | All interactive functionality is operable via keyboard. 14 customisable shortcuts documented in `docs/user/KEYBOARD_SHORTCUTS_REFERENCE.md`.          |
| **2.1.2 No Keyboard Trap**                                                  | Supports          | Focus can move away from every component. Modal dialogs dismiss with `Esc`.                                                                           |
| **2.1.4 Character Key Shortcuts**                                           | Supports          | Single-character shortcuts are not used.                                                                                                              |
| **2.2.1 Timing Adjustable**                                                 | Not Applicable    | Product imposes no time limits.                                                                                                                       |
| **2.2.2 Pause, Stop, Hide**                                                 | Not Applicable    | Product contains no moving, blinking, or auto-updating content.                                                                                       |
| **2.3.1 Three Flashes or Below Threshold**                                  | Supports          | Product contains no flashing content.                                                                                                                 |
| **2.4.1 Bypass Blocks**                                                     | Not Applicable    | Popup is a single-view interface; no repeated navigation blocks.                                                                                      |
| **2.4.2 Page Titled**                                                       | Supports          | Popup is titled "AssisT: Adaptive Augmentative Tool".                                                                                                 |
| **2.4.3 Focus Order**                                                       | Supports          | Focus sequence follows visual layout.                                                                                                                 |
| **2.4.4 Link Purpose (In Context)**                                         | Supports          | Links carry descriptive text; no "click here" patterns.                                                                                               |
| **2.5.1 Pointer Gestures**                                                  | Supports          | All functionality operable by single pointer events. No multi-point or path-based gestures.                                                           |
| **2.5.2 Pointer Cancellation**                                              | Supports          | Actions trigger on up-event. Event utilities in `src/utils/event-handlers.js` enforce this pattern.                                                   |
| **2.5.3 Label in Name**                                                     | Supports          | Accessible names match visible labels.                                                                                                                |
| **2.5.4 Motion Actuation**                                                  | Not Applicable    | Product does not use device motion as input.                                                                                                          |
| **3.1.1 Language of Page**                                                  | Supports          | `<html lang="en">` set.                                                                                                                               |
| **3.2.1 On Focus**                                                          | Supports          | Focus does not cause context changes.                                                                                                                 |
| **3.2.2 On Input**                                                          | Supports          | Settings require explicit Save; no unexpected context changes on input.                                                                               |
| **3.3.1 Error Identification**                                              | Supports          | Form errors identified in text; not conveyed by colour alone.                                                                                         |
| **3.3.2 Labels or Instructions**                                            | Supports          | All form inputs carry labels; complex controls have instructions.                                                                                     |
| **3.3.7 Redundant Entry** (new in WCAG 2.2)                                 | Supports          | Settings import/export and profile switching eliminate redundant entry.                                                                               |
| **4.1.1 Parsing** (obsolete in WCAG 2.2 but retained for EN 301 549 v3.2.1) | Supports          | HTML validates; no duplicate IDs; proper nesting (W3C validator).                                                                                     |
| **4.1.2 Name, Role, Value**                                                 | Supports          | ARIA roles, labels, and states applied consistently. State changes communicated programmatically (`aria-checked`, `aria-expanded`).                   |

### Table 2: Success Criteria, Level AA

| Criterion                                                       | Conformance Level  | Remarks and Explanations                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.2.4 Captions (Live)**                                       | Not Applicable     | Product contains no live media.                                                                                                                                                                                                                            |
| **1.2.5 Audio Description (Prerecorded)**                       | Not Applicable     | Product contains no prerecorded video media.                                                                                                                                                                                                               |
| **1.3.4 Orientation**                                           | Supports           | UI works in any orientation; no forced orientation lock.                                                                                                                                                                                                   |
| **1.3.5 Identify Input Purpose**                                | Supports           | Input fields use `autocomplete` attributes where appropriate.                                                                                                                                                                                              |
| **1.4.3 Contrast (Minimum)**                                    | Partially Supports | Main text and button text meet 4.5:1. Disabled states pending verification. **Action:** automated contrast verification of disabled states is scheduled for the next compliance pass.                                                                      |
| **1.4.4 Resize Text**                                           | Supports           | Text scales to 200% without loss of functionality; no fixed pixel heights on text containers.                                                                                                                                                              |
| **1.4.5 Images of Text**                                        | Supports           | No images of text; all text is real text.                                                                                                                                                                                                                  |
| **1.4.10 Reflow**                                               | Supports           | Content reflows at 320 CSS pixels width; no horizontal scrolling required.                                                                                                                                                                                 |
| **1.4.11 Non-text Contrast**                                    | Partially Supports | Focus indicators meet 3:1. Toggle-switch contrast pending verification. **Action:** UI-component contrast audit scheduled.                                                                                                                                 |
| **1.4.12 Text Spacing**                                         | Supports           | AssisT itself **implements** text-spacing adjustments as a user feature — line-height 1.5×, letter-spacing 0.12em, word-spacing 0.16em (all user-adjustable). The AssisT UI respects user text-spacing overrides without loss of content or functionality. |
| **1.4.13 Content on Hover or Focus**                            | Supports           | Tooltips are dismissible (`Esc`), hoverable, and persistent until dismissed.                                                                                                                                                                               |
| **2.4.5 Multiple Ways**                                         | Not Applicable     | Popup is single-page; no multi-page navigation to provide alternatives for.                                                                                                                                                                                |
| **2.4.6 Headings and Labels**                                   | Supports           | Headings and labels are descriptive.                                                                                                                                                                                                                       |
| **2.4.7 Focus Visible**                                         | Supports           | All focusable elements display a focus indicator with ≥3:1 contrast.                                                                                                                                                                                       |
| **2.4.11 Focus Not Obscured (Minimum)** (new in WCAG 2.2)       | Supports           | Focused elements are not fully hidden by other content. Modal dialogs do not obscure focus of underlying focusable items.                                                                                                                                  |
| **2.5.7 Dragging Movements** (new in WCAG 2.2)                  | Supports           | No drag-only interactions. Sliders provide keyboard alternatives.                                                                                                                                                                                          |
| **2.5.8 Target Size (Minimum)** (new in WCAG 2.2)               | Supports           | Toggle switches 44×24px; buttons 32×32px minimum (exceeds 24×24 CSS-pixel requirement).                                                                                                                                                                    |
| **3.1.2 Language of Parts**                                     | Not Applicable     | Product UI is single-language (English). Translation feature translates external content; translated text is served with appropriate `lang` attribution on output.                                                                                         |
| **3.2.3 Consistent Navigation**                                 | Supports           | Navigation elements occupy consistent positions across views.                                                                                                                                                                                              |
| **3.2.4 Consistent Identification**                             | Supports           | Identical icons and labels used consistently (for example, "Save Settings").                                                                                                                                                                               |
| **3.2.6 Consistent Help** (new in WCAG 2.2)                     | Partially Supports | Per-feature in-context help exists, but no single, consistently-positioned help mechanism across all views. **Action:** add consistent "?" help affordance to popup header and advanced-options footer before v1.0.                                        |
| **3.3.3 Error Suggestion**                                      | Supports           | Error messages suggest corrections (for example, "Invalid profile name. Use letters, numbers, and spaces only.").                                                                                                                                          |
| **3.3.4 Error Prevention (Legal, Financial, Data)**             | Not Applicable     | Product does not conduct legal, financial, or irreversible data transactions.                                                                                                                                                                              |
| **3.3.8 Accessible Authentication (Minimum)** (new in WCAG 2.2) | Not Applicable     | Product does not require user authentication. All personalisation is local-device.                                                                                                                                                                         |
| **4.1.3 Status Messages**                                       | Partially Supports | Toast notifications use `aria-live` regions. Loading states need `aria-busy`. **Action:** add `aria-busy` to dynamic content regions; scheduled.                                                                                                           |

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

1. **SC 1.4.3 Contrast (Minimum):** Complete contrast verification for disabled-state foreground/background combinations across all themes.
2. **SC 1.4.11 Non-text Contrast:** Verify contrast of toggle-switch track and thumb across all themes.
3. **SC 3.2.6 Consistent Help:** Add a persistent help affordance (proposed: "?" icon in the popup header and a help link in the advanced-options footer).
4. **SC 4.1.3 Status Messages:** Add `aria-busy` to dynamic content regions during load and AI-inference states.
5. **Screen-reader validation:** Complete manual testing with NVDA (Windows), JAWS (Windows), and VoiceOver (macOS). Publish findings.
6. **Third-party audit:** Commission an independent accessibility review (candidate funding route: Enterprise Ireland Innovation Voucher partnered with an Irish HEI accessibility research centre).
7. **Content-script coverage:** Extend automated Pa11y coverage to content-script–injected UI (mic button, reading guide, focus overlay).

---

## Revision History

| Version | Date       | Author                | Changes                                                                                                               |
| ------- | ---------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-04-19 | Fiavaion (maintainer) | Initial VPAT 2.5 Int published. Derived from internal WCAG 2.2 AA audit dated 2025-10-13; updated for product v0.1.2. |

---

## How to Report an Accessibility Issue

Please email `accessibility@fiavaion.com` with:

- The AssisT version (see Popup → About).
- The browser and operating system.
- A description of the issue and the steps to reproduce.
- Whether assistive technology (and which) was in use.

We aim to acknowledge reports within 5 working days.

---

**Source audit:** [WCAG_2.2_AA_AUDIT.md](./WCAG_2.2_AA_AUDIT.md)
**Copyright:** © 2026 Fiavaion. This VPAT is published under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) licence; the AssisT product itself is distributed under the [European Union Public Licence v1.2 (EUPL-1.2)](https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12) — see repository `LICENSE`.
