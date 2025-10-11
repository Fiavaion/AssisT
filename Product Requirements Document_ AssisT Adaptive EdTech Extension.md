

# **Product Requirements Document: AssisT Adaptive EdTech Extension**

| Attribute | Value |
| :---- | :---- |
| **Title** | AssisT: Neuro-Adaptive Layer for Canvas VLE |
| **Responsible Lead** | Product Management / Accessibility Engineering |
| **Creation Date** | October 2025 |
| **Version** | 1.0 (Initial Specification) |

## **1.0 Introduction and Objectives**

### **1.1 Product Vision and Problem Definition**

The current digital learning environment, including the Canvas VLE, presents systemic barriers to neurodivergent students (including those with Dyslexia, Dysgraphia, and ADHD) due to static content presentation, complex navigation, and high cognitive load.1 AssisT solves this by acting as a client-side Chrome Extension that injects adaptive capabilities, utilizing Speech-to-Text (STT) and Text-to-Speech (TTS) as primary interaction modalities, to create a personalized, low-friction learning experience .

**Vision:** To provide the definitive, personalized digital accessibility solution that enables equitable access and academic success for neurodivergent students across the entire Canvas VLE ecosystem.

### **1.2 Goals and Metrics (Success Criteria)**

Success is measured by measurable improvements in user performance and reduction of cognitive barriers, not just compliance.3

| KPI Category | Metric | Target Value/Goal | Rationale |
| :---- | :---- | :---- | :---- |
| **Product Efficacy** | Task Success Rate (TSR) using AT |  for core Canvas tasks | Direct measure of functional usability in completing assignments/readings.5 |
| **Cognitive Load** | User Error Frequency (UEF) | Track downward trend (e.g.,  decrease per quarter) | Confirms success in reducing cognitive friction points like navigation errors or input failures.2 |
| **Usability/Sentiment** | Accessible Usability Scale (AUS) Score |  (High Usability Benchmark) | Qualitative metric capturing user satisfaction and perceived ease of use.5 |
| **Compliance** | WCAG 2.2 AA Conformance Rate |  for core user flows | Ensures adherence to legal and technical standards . |

## **2.0 Stakeholders and Target Users**

| Stakeholder Group | Role | Needs & Expectations |
| :---- | :---- | :---- |
| **Primary Users (Students)** | Neurodivergent Students (Dyslexia, Dysgraphia, ADHD, Dyscalculia) | Needs highly customizable reading modes (TTS), efficient dictation/correction (STT), and interfaces that reduce distraction and cognitive overwhelm.7 |
| **Purchasers/Deployers** | Educational Institutions / IT Administration | Requires secure deployment via Chrome Extension store, minimal API dependence for stability, FERPA compliance, and LTI Advantage readiness.10 |
| **Technical Team** | Development, QA, Architecture | Needs clear, unambiguous feature specifications, defined integration points (Canvas DOM/API), and rigorous version control standards.12 |
| **Compliance/Regulatory** | Accessibility Auditors, Legal Counsel | Requires full conformance to WCAG 2.2 Level AA and transparent data handling consistent with FERPA/HIPAA guidelines . |

## **3.0 Functional Requirements (FRs)**

AssisT operates by intercepting and dynamically manipulating the Canvas VLE Document Object Model (DOM) to apply highly personalized accessibility adjustments, backed by WAI-Adapt semantics.13

### **3.1 Reading Adaptation: Text-to-Speech (TTS) & Focus**

| ID | Feature Name | Details & Implementation | Standard Reference |
| :---- | :---- | :---- | :---- |
| FR-100 | **Adaptive Text Styling Suite** | Comprehensive controls for font selection (incl. OpenDyslexic), foreground/background colors (soft contrast options), and customizable spacing. Must enforce WCAG 2.2 SC 1.4.12 ratios (Line Height , Paragraph Spacing , etc.) . | WCAG 2.2 SC 1.4.12 (AA) |
| FR-101 | **Synchronized TTS Reader** | High-fidelity neural TTS engine (e.g., Murf Gen 2 or Gemini-TTS) with simultaneous word-by-word visual highlighting . Must support SSML tags for user-controlled pace, volume, and emphasis adjustments . | WCAG 1.3 Adaptable |
| FR-102 | **Immersive Focus Mode** | A single-click control that strips non-essential elements (sidebars, ads, dynamic content) from the Canvas page to maximize focus on core instructional content . Utilizes WAI-Adapt Hiding Extraneous Information semantics.15 | WAI-Adapt: Tools |

### **3.2 Writing Adaptation: Speech-to-Text (STT) & Correction**

| ID | Feature Name | Details & Implementation | Standard Reference |
| :---- | :---- | :---- | :---- |
| FR-103 | **High-Accuracy STT Input** | Integrates a robust STT engine (e.g., Whisper) with  Word Error Rate (WER) . Must support custom vocabulary/domain adaptation to accurately transcribe specialized academic and scientific terms.16 | WCAG 2.1.1 Keyboard |
| FR-104 | **Multimodal FixOver Correction** | Enables users to correct transcription errors by combining non-motor pointing (mouse hover/gaze) with simple voice commands, triggering immediate spell-checker correction without requiring re-dictation or clicking . This is critical for users with Dysgraphia/motor impairment . | WAI-Adapt: Content |
| FR-105 | **Contextual Writing Assistant** | Integrated grammar, spelling, and style checker (similar to Microsoft Editor) for immediate feedback, aiding students who struggle with written expression quality . | WCAG 3.1 Readable |

### **3.3 Cognitive and System Adaptation (WAI-Adapt)**

| ID | Feature Name | Details & Implementation | Standard Reference |
| :---- | :---- | :---- | :---- |
| FR-106 | **Numeric Information Adaptation** | A toggleable module that replaces complex numerical data within Canvas (e.g., grades, due dates, statistics) with simplified values, visual representations, or qualitative text cues to aid users with Dyscalculia . | WAI-Adapt: Help & Support |
| FR-107 | **Consistent Contextual Help** | All help features (tooltips, documentation, support links) must maintain a consistent, predictable location across all application pages or course modules where AssisT is active . | WCAG 2.2 SC 3.2.6 (A) |
| FR-108 | **Accessible Authentication & Redundancy** | Must store and auto-populate user-set preferences. Any required authentication layer for AssisT must not rely on memory or transcription tests, in line with modern non-cognitive authentication methods . | WCAG 2.2 SC 3.3.8 (AA) & SC 3.3.7 (A) |

## **4.0 Non-Functional Requirements (NFRs)**

### **4.1 Technical Architecture (NFR-100)**

* **Platform:** Google Chrome Browser Extension (Manifest V3).  
* **Integration:** Must operate using an **Isolated World** architecture to prevent JavaScript conflicts with the host Canvas VLE environment.13  
* **Performance:** Must not increase page load time for assistive technology users beyond  of the non-assisted baseline load time. All necessary core libraries must be bundled locally.18  
* **Future Interoperability:** Architecture must be LTI Advantage-ready for deeper, more secure institutional integration.20

### **4.2 Security and Compliance (NFR-200)**

* **Privacy:** Must adhere to minimal permission requests (storage, specific VLE domains) to reduce attack surface and security risk.21  
* **Data Handling:** Must comply with FERPA/HIPAA by ensuring that all student PII (transcripts, reading patterns) is either processed locally or managed under strict institutional data agreements, with clear transparency to the user.10

#### **Works cited**

1. Cognitive Accessibility at W3C | Web Accessibility Initiative (WAI) | W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/cognitive/](https://www.w3.org/WAI/cognitive/)  
2. Neurodiversity-Focused Testing Criteria: A Guide for Accessibility Testers, accessed on October 11, 2025, [https://accessiblemindstech.com/neurodiversity-focused-testing-criteria-a-guide-for-accessibility-testers/](https://accessiblemindstech.com/neurodiversity-focused-testing-criteria-a-guide-for-accessibility-testers/)  
3. Browser Extension Security Risks and Best Practices, accessed on October 11, 2025, [https://layerxsecurity.com/learn/browser-extension/](https://layerxsecurity.com/learn/browser-extension/)  
4. Courses \- Canvas LMS REST API Documentation, accessed on October 11, 2025, [https://lms.au.af.edu/doc/api/courses.html](https://lms.au.af.edu/doc/api/courses.html)  
5. How Progressive Disclosure Simplifies Complex UI Design \- Medium, accessed on October 11, 2025, [https://medium.com/@marketingtd64/how-progressive-disclosure-simplifies-complex-ui-design-e799c76cfced](https://medium.com/@marketingtd64/how-progressive-disclosure-simplifies-complex-ui-design-e799c76cfced)  
6. Use a Consistent Visual Design | Cognitive Accessibility Design Pattern | WAI \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p03-consistent-design/](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p03-consistent-design/)  
7. Thinking differently about accessibility \- British Dyslexia Association, accessed on October 11, 2025, [https://www.bdadyslexia.org.uk/news/thinking-differently-about-accessibility](https://www.bdadyslexia.org.uk/news/thinking-differently-about-accessibility)  
8. Assistive Technology For Dysgraphia | Veronica With Four Eyes \- Veroniiiica, accessed on October 11, 2025, [https://veroniiiica.com/assistive-technology-for-dysgraphia/](https://veroniiiica.com/assistive-technology-for-dysgraphia/)  
9. Joint Guidance on the Application of FERPA and HIPAA to Student Health Records, accessed on October 11, 2025, [https://studentprivacy.ed.gov/resources/joint-guidance-application-ferpa-and-hipaa-student-health-records](https://studentprivacy.ed.gov/resources/joint-guidance-application-ferpa-and-hipaa-student-health-records)  
10. Creating an Effective Decision Log Template for Successful Project Management | Gridfox, accessed on October 11, 2025, [https://gridfox.com/blog/creating-an-effective-decision-log-template-for-successful-project-management/](https://gridfox.com/blog/creating-an-effective-decision-log-template-for-successful-project-management/)  
11. Introduction | Instructure Developer Documentation Portal, accessed on October 11, 2025, [https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools\_intro](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools_intro)  
12. Product Requirements Documents (PRD) Explained \- Atlassian, accessed on October 11, 2025, [https://www.atlassian.com/agile/product-management/requirements](https://www.atlassian.com/agile/product-management/requirements)  
13. Understanding Success Criterion 1.4.12: Text Spacing | WAI \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)  
14. Caliper Analytics v1.1 Introduction | IMS Global Learning Consortium \- 1EdTech, accessed on October 11, 2025, [https://www.imsglobal.org/caliper-analytics-v11-introduction](https://www.imsglobal.org/caliper-analytics-v11-introduction)  
15. Assistive technology-based solutions in learning mathematics for visually-impaired people: exploring issues, challenges and opportunities, accessed on October 11, 2025, [https://pmc.ncbi.nlm.nih.gov/articles/PMC10684398/](https://pmc.ncbi.nlm.nih.gov/articles/PMC10684398/)  
16. Progressive Disclosure Controls \- Win32 apps \- Microsoft Learn, accessed on October 11, 2025, [https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls)  
17. Conventional Commits & SemVer \- Medium, accessed on October 11, 2025, [https://medium.com/@alextkd/conventional-commits-semver-9e42a372afc2](https://medium.com/@alextkd/conventional-commits-semver-9e42a372afc2)  
18. 7 Metrics for Testing Accessibility Performance | UXPin, accessed on October 11, 2025, [https://www.uxpin.com/studio/blog/7-metrics-for-testing-accessibility-performance/](https://www.uxpin.com/studio/blog/7-metrics-for-testing-accessibility-performance/)  
19. Browser extensions: how can injecting javascript code into a page work without conflicts?, accessed on October 11, 2025, [https://stackoverflow.com/questions/11509678/browser-extensions-how-can-injecting-javascript-code-into-a-page-work-without-c](https://stackoverflow.com/questions/11509678/browser-extensions-how-can-injecting-javascript-code-into-a-page-work-without-c)  
20. Improve transcription results with model adaptation | Cloud Speech-to-Text, accessed on October 11, 2025, [https://cloud.google.com/speech-to-text/docs/adaptation-model](https://cloud.google.com/speech-to-text/docs/adaptation-model)  
21. What WCAG 2.2 Means for Your Website \- AudioEye, accessed on October 11, 2025, [https://www.audioeye.com/post/whats-new-with-wcag-2-2/](https://www.audioeye.com/post/whats-new-with-wcag-2-2/)  
22. Declare permissions | Chrome Extensions, accessed on October 11, 2025, [https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)  
23. By Audience: Education Technology Vendors \- Protecting Student Privacy, accessed on October 11, 2025, [https://studentprivacy.ed.gov/audience/education-technology-vendors](https://studentprivacy.ed.gov/audience/education-technology-vendors)