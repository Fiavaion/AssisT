

# **AssisT EdTech Tool: Comprehensive Architectural and Functional Specification for Adaptive Learning**

## **Section 1: Executive Summary and Neurodiversity Context**

This report provides the foundational architectural and functional specifications necessary for developing the AssisT EdTech tool, an adaptive browser extension designed for optimal integration within the Canvas Virtual Learning Environment (VLE). The specifications move beyond general accessibility to focus on highly personalized accommodations for neurodivergent students, aiming to reduce cognitive load and enhance academic independence.

### **1.1 Introduction to the AssisT Tool and Vision**

AssisT is conceptualized as an adaptive browser extension that delivers immediate, context-aware Text-to-Speech (TTS) and Speech-to-Text (STT) accommodations directly into the Canvas VLE.1 The core objective of the tool is to move beyond conventional WCAG compliance by actively implementing principles derived from the W3C Web Accessibility Initiative (WAI-Adapt) specifications.2 This approach empowers users to personalize their content presentation, which is essential for achieving genuinely optimal accessibility tailored to individual cognitive and learning needs.2

The comprehensive development process must be underpinned by rigorous documentation standards. This specification serves as a blueprint leading directly into the creation of a detailed Product Requirements Document (PRD), which must define the product's purpose, key features, and overall functionality for alignment among technical and business stakeholders.4 Furthermore, throughout the development lifecycle, maintaining an active Decision Log is mandatory. This log captures key decisions, the rationale behind those choices, alternatives considered, and the stakeholders involved, providing a crucial reference for accountability and process critique.7

### **1.2 Defining the Target User: Core Neurodivergent Needs**

The functional requirements of AssisT are derived from the specific barriers faced by a broad scope of neurodivergent users, including individuals with Dyslexia, Dysgraphia, Dyscalculia, Autism Spectrum Disorder (ASD), Attention Deficit Hyperactivity Disorder (ADHD), and working memory impairment.10

#### **Dyslexia and Reading Barriers**

Students with dyslexia often struggle with fluent word recognition and decoding written text, which leads to slow reading rates and decreased comprehension when dealing with text-heavy digital platforms like a VLE.11 For these users, the primary compensatory mechanism is TTS technology combined with synchronized visual highlighting, which reinforces word recognition and supports reading fluency.13

#### **Dysgraphia and Writing Barriers**

Dysgraphia presents difficulties in written expression, encompassing both the motor aspects of writing and the cognitive load associated with spelling, grammar, and organization.15 For this population, efficient STT input is critical. However, this must be paired with robust, streamlined error correction methods, as the friction of correcting transcription errors can negate the benefit of dictation.17

#### **Dyscalculia and Numeracy Barriers**

Students with dyscalculia experience difficulty understanding, recognizing, and manipulating numbers and quantities.2 Simply reading numbers aloud is insufficient. The tool must provide mechanisms to replace or augment numerical information with semantic, non-numeric cues (e.g., text, symbols, or graphs) to facilitate comprehension.2

#### **Cognitive Load Barriers**

A common thread across many neurodivergent profiles is the susceptibility to sensory overload and distraction from extraneous information.19 Excessive information, cluttered interfaces, complex navigation, and an overwhelming number of choices significantly increase cognitive load.20 The tool’s design must prioritize simplicity and focus, ensuring users only engage with essential information.2

## **Section 2: Optimal Text-to-Speech (TTS) Implementation Specification**

The efficacy of AssisT relies fundamentally on the quality and controllability of its TTS output, requiring an engine that supports nuanced, instructionally effective delivery.

### **2.1 Voice Selection, Acoustics, and SSML Control**

The TTS engine must utilize advanced neural models, such as Murf Speech Gen 2 or Google's Gemini-TTS, to generate high-fidelity, humanlike speech with accurate intonation and contextual awareness.22 Selecting high-quality voices is essential because generic, robotic voices increase auditory fatigue and cognitive friction, potentially negating the very benefit of reduced decoding effort intended for the neurodivergent user.

To achieve pedagogical nuance, Speech Synthesis Markup Language (SSML) implementation is mandatory for fine-tuning the speech output.24

* **Pace Control:** Users require granular control over the reading rate, using SSML \<prosody\> tags to apply percentage-based or absolute pace adjustments (e.g., \-20% or slow).13 This allows the student to match the auditory pace to their individual reading fluency and comprehension speed, maximizing information absorption.  
* **Emphasis and Tone:** The SSML \<emphasis\> tag allows content authors or the tool’s smart parsing to introduce vocal emphasis on key instructional vocabulary or critical conceptual points (using levels such as strong, moderate, or reduced).26 Furthermore, the system should allow customization of voice *styles* (e.g., narration-professional or narration-relaxed) to ensure the tone is contextually appropriate for the specific learning material being read.27  
* **Multilingual Support:** The engine must accommodate a wide range of academic environments by supporting multiple languages and regional variants (e.g., the 75+ languages offered by Google Cloud TTS).22

### **2.2 Multimodal Reading Flow and Focus Enhancement**

The TTS function must be integrated with visual supports to maximize reading comprehension and maintain focus.

* **Synchronous Highlighting:** The tool’s core reading aid must be the simultaneous, synchronized visual highlighting of text as it is read aloud. This reinforcement can be applied word-by-word or phrase-by-phrase.13 Research has shown that TTS *with* synchronized highlighting results in significantly higher reading comprehension scores for individuals with reading difficulties than using TTS alone.13 The combination of visual tracking and auditory input strengthens word recognition and reduces decoding effort.  
* **Distraction-Free Reading Mode:** AssisT must provide a "Reading Mode," similar to Microsoft's Immersive Reader or ReaderQ, designed to strip away distracting web page clutter, advertisements, and non-essential sidebars.28 This directly addresses attention management challenges and sensory overload common among students with ADHD, Autism, and generalized cognitive load issues.19  
* **Text and Color Customization:** To mitigate visual stress, users must be provided with robust customization options, including the ability to select dyslexia-friendly fonts (such as OpenDyslexic), change font and background colors, and apply screen overlays.30 All customizable color schemes must adhere to minimum contrast ratios required by WCAG 1.4.3.32

### **2.3 TTS Integration with Canvas Content Types**

The tool’s ability to interact with Canvas content relies on proper browser extension architecture.

* **DOM Injection Strategy:** The TTS feature must leverage browser extension content scripts to read and manipulate the structure and content of the Canvas VLE Document Object Model (DOM).33 To ensure stability within a large VLE environment, content scripts must operate within an Isolated World. This isolation prevents JavaScript variable conflicts with Canvas's own intricate scripting, ensuring the extension remains functional even following VLE updates.33  
* **Content Parsing Priority:** The system must intelligently parse the page content, prioritizing essential instructional text while providing user controls to skip supplementary or decorative text. This feature directly supports the WCAG Guideline 1.3 (Adaptable) by allowing content to be semantically presented in a simpler layout based on user preferences.10

## **Section 3: Advanced Speech-to-Text (STT) and Multimodal Correction**

The STT functionality must meet high standards for accuracy in an academic context and introduce innovative multimodal correction techniques to overcome barriers related to writing and motor skills.

### **3.1 STT Engine Selection and Accuracy**

High accuracy is paramount, as inaccurate transcription significantly increases the cognitive load required for proofreading and correction.35 The STT engine chosen must maintain extremely low Word Error Rates (WER), comparable to leading models (e.g., OpenAI Whisper’s stated 2.7% WER on clean data).36

* **Domain Adaptation:** Standard STT models often struggle with the specialized terminology found in education. Therefore, the engine must support domain adaptation using specialized model resources, such as ABNF Grammars or custom vocabularies/PhraseSets.37 This is essential for accurately recognizing scientific nomenclature, proper names, and technical acronyms used in course materials, ensuring the transcribed text remains coherent and useful for complex educational input.37

### **3.2 Multimodal Error Correction and Input Design**

Error correction is a known bottleneck for users with dysgraphia, dyslexia, and motor impairments.15 The required solution must drastically reduce the motor and cognitive demands of correction.

* **The Voice-and-Point (FixOver) Model:** AssisT must implement a strategy similar to the "FixOver" multimodal system.17 This system allows the user to correct transcription errors by combining cursor pointing (mouse/touch) with a simple voice command. Crucially, the system should leverage spell-checker predictions and perform automatic correction without demanding complex re-dictation of the corrected phrase or tedious mouse clicking.17 This pattern addresses motor fatigue (only pointing, no clicking required) and simplifies cognitive processing by substituting information retrieval (re-dictation) with immediate system suggestions.17  
* **Future Input Consideration:** To reduce the social stigma associated with speaking aloud in public academic environments (e.g., lecture halls), the interface design should consider advanced input methods capable of robust transcription based on low-volume or "internal verbalization" input, although this requires technology that recognizes neuromuscular signals.38

### **3.3 Supporting Complex Input: Dyscalculia and Structured Data**

The STT system must extend its functionality to handle structured academic input beyond simple narrative text.

* **Handling Mathematical Input:** To support students with dyscalculia and complex mathematical coursework, the STT feature must integrate Natural Language Toolkit (NLTK) or similar Natural Language Processing (NLP) components capable of interpreting spoken commands and mathematical expressions.39 The system must convert spoken equations and symbols into a structured format, such as expression trees, for accurate evaluation and step-by-step solutions.39  
* **Dyscalculia Mitigation via WAI-Adapt:** The implementation must utilize the WAI-Adapt feature enabling users to change numeric information.2 For content displaying numerical grades, due dates, or statistics within Canvas, AssisT must offer a toggle to replace raw numbers with non-numeric, semantic cues or graphical representations (e.g., replacing "Due 10/25 11:59 PM" with "Due today" or using a graphic to represent a grade instead of the raw score). This provides crucial assistance for users struggling with low numeracy.2

## **Section 4: Adaptive UI/UX Design Framework (WAI-Adapt and Cognitive Load)**

The extension’s interface design must adhere to strict principles of minimizing cognitive load, utilizing WAI-Adapt personalization, and meeting specific WCAG 2.2 criteria.

### **4.1 Principles for Low Cognitive Load Design**

Interface design must simplify interaction and reduce mental friction. Design elements must favor *recognition* (e.g., universally familiar icons, consistent patterns) over *recall* (memorizing commands or procedures), as the latter heavily taxes working memory.21

* **Progressive Disclosure:** To prevent users from feeling overwhelmed by complex settings (decision fatigue), progressive disclosure must be used.42 The core TTS/STT controls should be immediately visible and intuitive. Advanced customization options, such as fine-tuning SSML pace or selecting specialized fonts, should be concealed behind "Advanced Settings" or expandable controls, only revealing complexity when explicitly requested by the user.44  
* **Minimizing Clutter:** The interface must be visually streamlined, ensuring every element serves a clear functional purpose.41 The extension overlay must be non-obtrusive, maintaining consistency and clarity with the main Canvas VLE content.47

### **4.2 Integrating WAI-Adapt Personalization Features**

WAI-Adapt provides the standardization for user personalization that AssisT requires.2 The following essential capabilities must be implemented:

* **Hiding Extraneous Information:** This fundamental feature addresses distraction and overwhelm.2 The tool must provide a "Simplify View" function that identifies and suppresses decorative elements, non-essential sidebars, or complex navigational components on the Canvas page, allowing users to focus exclusively on core instructional content.28  
* **Consistent Help (WCAG 2.2 SC 3.2.6 Level A):** Any help features provided by AssisT, such as integrated tooltips, troubleshooting guides, or contact information, must be located consistently across all Canvas pages. Predictable placement reduces reliance on working memory, aiding users with short-term memory impairment.49  
* **Redundant Entry (WCAG 2.2 SC 3.3.7 Level A):** The system must minimize cognitive effort by automatically populating or providing easy selection options for information that the user has previously entered (e.g., preferred settings, personal details in forms).49

### **4.3 Specific Visual and Typography Adjustments (WCAG 2.2 AA Conformance)**

AssisT must provide explicit controls to meet and exceed WCAG 2.2 AA criteria specifically relevant to visual stress and reading comprehension.

* **Text Spacing (WCAG 2.2 SC 1.4.12 AA):** Users must be able to adjust standard text style properties without losing content or functionality.51 Specifically, the customizable metrics must adhere to the following minimum values:  
  * Line height (line spacing)  the font size.52  
  * Spacing following paragraphs  the font size.52  
  * Letter spacing (tracking)  the font size.52  
  * Word spacing  the font size.52  
* **Typography Best Practices:** Fonts must be simple and sans-serif; complex, "swirly," or novelty fonts should be avoided to improve readability.53 Text should be left-aligned, avoiding justification, heavy underlines, excessive italics, or all-uppercase text for body copy.53  
* **Accessible Authentication (WCAG 2.2 SC 3.3.8 AA):** If the extension requires its own authentication layer, it must not rely on authentication methods that demand significant cognitive function testing, such as memorizing passwords, transcribing one-time passcodes (OTPs), or solving cognitive puzzles.49 Because students already authenticate to the Canvas VLE, imposing a complex, memory-intensive secondary login process would significantly increase cognitive friction, violating the core design goal of the AssisT tool.

## **Section 5: Canvas VLE Integration and Extension Architecture**

Successful deployment requires a strategic technical approach to integrate seamlessly with the Canvas platform while ensuring stability and data security.

### **5.1 Browser Extension Architecture and DOM Injection Strategy**

The extension must be designed to avoid conflicts with the host Learning Management System (LMS).

* **Isolated World Model:** AssisT content scripts must be executed within an Isolated World.33 This architecture guarantees that the extension’s JavaScript variables and libraries are separate from the Canvas page’s own code, mitigating the risk of unexpected behavior or breakage due to VLE updates.33  
* **Resource Bundling:** To ensure fast loading times and predictable performance, all core libraries, including TTS/STT client interfaces and necessary UI frameworks, must be bundled directly within the extension package and declared as web-accessible resources in the manifest.json.34 This prevents reliance on external network fetching, which can introduce latency or vulnerability to crashes.34  
* **Manifest Permissions (Minimalism):** A rigorous security posture demands that the extension request only the minimum necessary permissions.54 Essential permissions include storage (for user preferences), and precise content\_scripts.matches for the specific Canvas VLE domains.54 Requesting excessive permissions (e.g., broad host permissions) increases the security risk (data exfiltration, privilege abuse) and raises user suspicion during installation.55

### **5.2 Canvas API Access Strategy and Context Retrieval**

To provide context-aware adaptation, AssisT must securely retrieve essential information from the Canvas REST API.

* **Authentication:** All API interactions require a securely managed Canvas Access Token, which serves as a secure credential. Tokens generated for testing or administration must be assigned a descriptive purpose and an expiration date for security, and they must be carefully protected from public exposure.57  
* **User Identification and Role Determination:** Determining the user's role (Student, Teacher, etc.) is necessary for feature gating (e.g., enabling student-focused tools versus teacher analytics dashboards). The most efficient method is to use the self shortcut with the Enrollments API: GET /api/v1/users/self/enrollments.58 The user's actual permissions and role are determined by their *enrollments* (e.g., TeacherEnrollment or StudentEnrollment) within a specific course context, not a universal user type.58  
* **Content Context Mapping:** To adapt appropriately (e.g., applying reading mode to a Page or a Discussion, or recognizing a Quiz submission), the tool must identify the type of content currently displayed. This can be achieved through URL parsing augmented by the Canvas Analytics API. The Analytics API categorizes page views into content types such as announcements, assignments, discussions, pages, and quizzes, providing robust verification of the current page context.60

The following table summarizes the critical Canvas API endpoints required for operational context:

Critical Canvas API Endpoints and Data Access Requirements

| Target Information | Canvas API Endpoint (Example) | Required Data Context | Security/Privacy Consideration |
| :---- | :---- | :---- | :---- |
| Current User ID/Role |  58 | User ID, Enrollment Type (student, teacher, observer) 59 | Use  shortcut for authenticated access; strictly enforce feature visibility based on role data (e.g., hide teacher tools from students). |
| Current Course Progress |  61 | Current Course ID 61 | Ensures data linkage remains within the appropriate FERPA-compliant course boundary. |
| Page Type (Analytics) |  60 | Account ID, Term ID 60 | Validate content category (Assignment, Discussion, Quizzes) if URL parsing is insufficient. |

### **5.3 LTI Advantage and Future Interoperability**

Currently, the browser extension provides necessary client-side accessibility without requiring formal Learning Tools Interoperability (LTI) integration.62 However, strategic planning dictates that the architecture should support future transition to the LTI Advantage standard.63 LTI provides a secure, standardized, and authenticated mechanism for third-party tools to achieve deeper VLE integration, such as grade synchronization, centralized tool configuration, and secure inclusion in the Canvas App Center, which will be necessary for scaling and long-term institutional adoption.63

## **Section 6: Security, Compliance, and Quality Assurance**

An EdTech tool handling sensitive student data must adhere to strict security protocols, legal compliance, and rigorous quality assurance testing focused on efficacy.

### **6.1 Data Privacy and Compliance Requirements (FERPA/HIPAA)**

As a third-party vendor, AssisT must rigorously comply with US student data privacy laws.

* **FERPA Compliance:** The Family Educational Rights and Privacy Act (FERPA) mandates that any Personally Identifiable Information (PII) of students handled by the extension—including transcripts generated via STT, reading habits, or user preferences—must be managed securely.65 Explicit policies must confirm that student data is either processed locally on the user device or, if transmitted to cloud APIs (e.g., for TTS/STT processing), that those services adhere to FERPA and are covered by robust institutional data agreements, explicitly precluding unauthorized disclosure or secondary use of the data.65  
* **HIPAA Considerations:** Should the tool collect or link accessibility profiles directly to specific medical diagnoses (e.g., a formal diagnosis of dyslexia), compliance with the Health Insurance Portability and Accountability Act (HIPAA) must be addressed in conjunction with FERPA guidelines for student health records.66  
* **Transparency:** Transparency is vital for building trust. The extension must clearly disclose what data is stored locally using the browser’s storage API and precisely what PII, if any, is transmitted externally for cloud-based processing.56

### **6.2 Browser Extension Security Audit and Development Practices**

Security audits must focus on the unique vulnerabilities of browser extensions, such as excessive permissions and malicious code injection.55

* **Vetting and Risk Mitigation:** Rigorous security testing must be employed to prevent critical risks like Data Exfiltration, Malicious Code Injection, and Session Hijacking.55 Developers must strictly adhere to the principle of least privilege, only requesting the minimal permissions required, as excessive permissions are a primary security concern for extensions.54  
* **Development Workflow and Documentation:** Structured documentation is necessary to maintain code quality and secure development practices, especially when utilizing AI-powered development tools. A CLAUDE.md file should be maintained to document core architecture, utility functions, code style guidelines, and project constraints, ensuring consistent context for developers and tools interacting with the codebase.67  
* **Version Control Protocol:** All source code changes must utilize the Conventional Commits specification (e.g., feat, fix, docs, chore, refactor).69 This standardized format provides an explicit commit history that facilitates automated generation of professional CHANGELOGs and ensures accurate semantic version bumping.69 A pre-commit hook should be implemented to enforce this commit standard before code is merged.72

### **6.3 Usability Testing Methodology for Neurodivergent Users**

For an adaptive tool, success cannot be judged by automated checks alone; it requires rigorous, user-centric validation. Accessibility testing must move past WCAG pass/fail metrics to include genuine user testing with neurodivergent individuals using their native Assistive Technologies (AT).74

* **Testing Methods:** A mixed-methods approach is mandated.75 This requires combining qualitative methodologies—such as semi-structured interviews, focus groups, and participatory design sessions—to capture the nuances of user experience and identify cognitive barriers, with quantitative methodologies derived from field tests focusing on measurable performance data.75  
* **Scenario Focus:** Testing scenarios must cover the critical EdTech interactions within Canvas, including content consumption (with TTS activated), text entry in forms (with STT activated), complex navigation, and task completion (e.g., submitting an assignment).76

### **6.4 Defining Accessibility Key Performance Indicators (KPIs)**

To measure the true impact of AssisT, Key Performance Indicators (KPIs) must focus on pedagogical efficacy and the reduction of cognitive friction.

Key Performance Indicators (KPIs) for AssisT Accessibility

| KPI Category | Metric | Target Value/Goal | Rationale |
| :---- | :---- | :---- | :---- |
| **Product Efficacy** | Task Success Rate (TSR) using AT |  for core tasks | Measures the functional usability by users with disabilities, ensuring features actually enable completion of academic tasks.77 |
| **Cognitive Load** | User Error Frequency (UEF) | Track downward trend (e.g.,  decrease per quarter) | Quantifies the success in reducing friction points, such as navigation errors or STT correction failures, crucial for low-cognitive load design.77 |
| **Efficiency/Fluency** | Task Completion Time Delta (TCT ) | Minimal time difference between AT users and non-AT users | Ensures the accommodation maintains efficiency and does not introduce significant time penalties for reading or writing tasks.77 |
| **Usability/Sentiment** | Accessible Usability Scale (AUS) Score |  (High Usability Benchmark) | Qualitative metric capturing user satisfaction and perceived ease of use, reflecting true accessibility beyond technical compliance.79 |
| **Code Quality** | New Accessibility Issues Introduced (per release) | Near Zero / Downward trend | Focuses on embedding accessibility requirements into the Definition of Done (DoD) during agile development, promoting sustainable practice.80 |

## **Conclusions and Strategic Recommendations**

The development of the AssisT EdTech tool must proceed with the understanding that its success rests on moving beyond minimum compliance and embracing individualized personalization.

The architectural foundation must incorporate WAI-Adapt semantics to enable user-driven customization, particularly in areas affecting cognitive load, distraction, and numeracy. Technically, the tool must mandate the use of high-fidelity neural TTS engines with SSML control for acoustic quality, and extremely high-accuracy STT engines with domain adaptation for academic language. The novel implementation of multimodal interaction, specifically the FixOver voice-and-point model, is crucial for overcoming the motor and cognitive barriers associated with STT error correction for dysgraphic students.

Integration with the Canvas VLE demands rigorous architectural isolation (Isolated World) to ensure stability, minimal API usage to retrieve only necessary contextual data (User Role via Enrollments), and adherence to minimalist permissions to preserve security. Finally, the commitment to FERPA/HIPAA compliance and the adoption of efficacy-based KPIs, measured through mixed-methods testing with neurodivergent users, will ensure the tool delivers measurable academic value and long-term sustainability. The recommendation is to proceed immediately with PRD generation, prioritizing the development of the multimodal correction interface and the WAI-Adapt personalization panel.

#### **Works cited**

1. 7 Essential Accessibility Principles for EdTech UI/UX \- WeSoftYou, accessed on October 11, 2025, [https://wesoftyou.com/elearning/essential-accessibility-principles-for-edtech-ui-ux/](https://wesoftyou.com/elearning/essential-accessibility-principles-for-edtech-ui-ux/)  
2. WAI-Adapt Overview | Web Accessibility Initiative (WAI) | W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/adapt/](https://www.w3.org/WAI/adapt/)  
3. WAI-Adapt Explainer \- W3C, accessed on October 11, 2025, [https://www.w3.org/TR/adapt/](https://www.w3.org/TR/adapt/)  
4. Product Requirements Documents (PRD) Explained \- Atlassian, accessed on October 11, 2025, [https://www.atlassian.com/agile/product-management/requirements](https://www.atlassian.com/agile/product-management/requirements)  
5. How to Write a Product Requirements Document (PRD) \- With Free Template | Formlabs, accessed on October 11, 2025, [https://formlabs.com/blog/product-requirements-document-prd-with-template/](https://formlabs.com/blog/product-requirements-document-prd-with-template/)  
6. How to Write An Effective Product Requirements Document (PRD) \- Jama Software, accessed on October 11, 2025, [https://www.jamasoftware.com/requirements-management-guide/writing-requirements/how-to-write-an-effective-product-requirements-document/](https://www.jamasoftware.com/requirements-management-guide/writing-requirements/how-to-write-an-effective-product-requirements-document/)  
7. Creating an Effective Decision Log Template for Successful Project Management | Gridfox, accessed on October 11, 2025, [https://gridfox.com/blog/creating-an-effective-decision-log-template-for-successful-project-management/](https://gridfox.com/blog/creating-an-effective-decision-log-template-for-successful-project-management/)  
8. Decision Logs: The Ultimate Guide \- Project Templates, accessed on October 11, 2025, [https://www.projectmanagertemplate.com/post/decision-logs-the-ultimate-guide](https://www.projectmanagertemplate.com/post/decision-logs-the-ultimate-guide)  
9. How to Create a Decision Log for Project Management Success \- ClickUp, accessed on October 11, 2025, [https://clickup.com/blog/decision-log-project-management/](https://clickup.com/blog/decision-log-project-management/)  
10. Cognitive Accessibility at W3C | Web Accessibility Initiative (WAI) | W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/cognitive/](https://www.w3.org/WAI/cognitive/)  
11. Thinking differently about accessibility \- British Dyslexia Association, accessed on October 11, 2025, [https://www.bdadyslexia.org.uk/news/thinking-differently-about-accessibility](https://www.bdadyslexia.org.uk/news/thinking-differently-about-accessibility)  
12. Using User Experience Design Principles (UX/UI) To Configure an Eye-Tracking Framework That Will Help Those with Dyslexia Learn, accessed on October 11, 2025, [https://ajsuccr.org/wp-content/uploads/2025/04/AJSCCR-V9-2233.pdf](https://ajsuccr.org/wp-content/uploads/2025/04/AJSCCR-V9-2233.pdf)  
13. Text to Speech for Dyslexic: Making A Difference \- Murf AI, accessed on October 11, 2025, [https://murf.ai/blog/making-a-difference-for-the-dyslexic-with-text-to-speech](https://murf.ai/blog/making-a-difference-for-the-dyslexic-with-text-to-speech)  
14. Text-to-Speech Technology: Enhancing Reading Comprehension for Students with Reading Difficulty, accessed on October 11, 2025, [https://www.atia.org/wp-content/uploads/2020/06/ATOB-V14-A2-Keelor\_etal.pdf](https://www.atia.org/wp-content/uploads/2020/06/ATOB-V14-A2-Keelor_etal.pdf)  
15. Assistive Technology For Dysgraphia | Veronica With Four Eyes \- Veroniiiica, accessed on October 11, 2025, [https://veroniiiica.com/assistive-technology-for-dysgraphia/](https://veroniiiica.com/assistive-technology-for-dysgraphia/)  
16. AI Handwriting Analysis May Catch Dyslexia and Dysgraphia Early \- Neuroscience News, accessed on October 11, 2025, [https://neurosciencenews.com/ai-handwriting-dyslexia-28925/](https://neurosciencenews.com/ai-handwriting-dyslexia-28925/)  
17. Full article: Improving Error Correction and Text Editing Using Voice and Mouse Multimodal Interface \- Taylor & Francis Online, accessed on October 11, 2025, [https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2352932](https://www.tandfonline.com/doi/full/10.1080/10447318.2024.2352932)  
18. Designing for people with dyscalculia and low numeracy, accessed on October 11, 2025, [https://designnotes.blog.gov.uk/2022/11/28/designing-for-people-with-dyscalculia-and-low-numeracy/](https://designnotes.blog.gov.uk/2022/11/28/designing-for-people-with-dyscalculia-and-low-numeracy/)  
19. How WCAG benefits everyone: A focus on neurodiversity and accessibility, accessed on October 11, 2025, [https://www.wcag.com/blog/digital-accessibility-and-neurodiversity/](https://www.wcag.com/blog/digital-accessibility-and-neurodiversity/)  
20. Neurodiversity-Focused Testing Criteria: A Guide for Accessibility Testers, accessed on October 11, 2025, [https://accessiblemindstech.com/neurodiversity-focused-testing-criteria-a-guide-for-accessibility-testers/](https://accessiblemindstech.com/neurodiversity-focused-testing-criteria-a-guide-for-accessibility-testers/)  
21. Design Principles for Reducing Cognitive Load | Laws of UX, accessed on October 11, 2025, [https://lawsofux.com/articles/2015/design-principles-for-reducing-cognitive-load/](https://lawsofux.com/articles/2015/design-principles-for-reducing-cognitive-load/)  
22. Text-to-Speech AI: Lifelike Speech Synthesis \- Google Cloud, accessed on October 11, 2025, [https://cloud.google.com/text-to-speech](https://cloud.google.com/text-to-speech)  
23. Free Text to Speech Online with 200+ Realistic AI Voices \- Murf AI, accessed on October 11, 2025, [https://murf.ai/text-to-speech](https://murf.ai/text-to-speech)  
24. Speech Synthesis Markup Language (SSML) overview \- Microsoft Learn, accessed on October 11, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup)  
25. Speech Synthesis Markup Language (SSML) | Text-to-Speech \- Google Cloud, accessed on October 11, 2025, [https://cloud.google.com/text-to-speech/docs/ssml](https://cloud.google.com/text-to-speech/docs/ssml)  
26. Speech Synthesis Markup Language (SSML) Reference | Alexa Skills Kit, accessed on October 11, 2025, [https://developer.amazon.com/en-US/docs/alexa/custom-skills/speech-synthesis-markup-language-ssml-reference.html](https://developer.amazon.com/en-US/docs/alexa/custom-skills/speech-synthesis-markup-language-ssml-reference.html)  
27. Voice and sound with Speech Synthesis Markup Language (SSML) \- Microsoft Learn, accessed on October 11, 2025, [https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice)  
28. 18 Assistive Technology Apps and Extensions for Struggling Students \- ADDitude, accessed on October 11, 2025, [https://www.additudemag.com/assistive-technology-for-students/](https://www.additudemag.com/assistive-technology-for-students/)  
29. Enrollments \- Instructure Developer Documentation Portal, accessed on October 11, 2025, [https://developerdocs.instructure.com/services/canvas/resources/enrollments](https://developerdocs.instructure.com/services/canvas/resources/enrollments)  
30. Improving Digital Inclusion & Accessibility for Those With Learning Disabilities, accessed on October 11, 2025, [https://www.inclusionhub.com/articles/improving-digital-inclusion-learning-disabilities](https://www.inclusionhub.com/articles/improving-digital-inclusion-learning-disabilities)  
31. Top 10 Chrome Plugins for Making Reading Easier for Dyslexic Users, accessed on October 11, 2025, [https://www.skynettechnologies.com/blog/top-chrome-plugins-for-dyslexic-users](https://www.skynettechnologies.com/blog/top-chrome-plugins-for-dyslexic-users)  
32. Designing for Web Accessibility – Tips for Getting Started \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/tips/designing/](https://www.w3.org/WAI/tips/designing/)  
33. Content scripts | Chrome for Developers, accessed on October 11, 2025, [https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)  
34. Browser extensions: how can injecting javascript code into a page work without conflicts?, accessed on October 11, 2025, [https://stackoverflow.com/questions/11509678/browser-extensions-how-can-injecting-javascript-code-into-a-page-work-without-c](https://stackoverflow.com/questions/11509678/browser-extensions-how-can-injecting-javascript-code-into-a-page-work-without-c)  
35. Measuring the Accuracy of Automatic Speech Recognition Solutions \- arXiv, accessed on October 11, 2025, [https://arxiv.org/html/2408.16287v1](https://arxiv.org/html/2408.16287v1)  
36. Open-Source Speech-to-Text Engines: The Ultimate 2024 Guide \- Vatis Tech, accessed on October 11, 2025, [https://vatis.tech/blog/open-source-speech-to-text-engines-the-ultimate-2024-guide](https://vatis.tech/blog/open-source-speech-to-text-engines-the-ultimate-2024-guide)  
37. Improve transcription results with model adaptation | Cloud Speech-to-Text, accessed on October 11, 2025, [https://cloud.google.com/speech-to-text/docs/adaptation-model](https://cloud.google.com/speech-to-text/docs/adaptation-model)  
38. Multimodality Assistive Technology for Users with Dyslexia, accessed on October 11, 2025, [https://dr.lib.iastate.edu/entities/publication/7a5df2f2-d96f-4783-b0d4-f9c8af617054](https://dr.lib.iastate.edu/entities/publication/7a5df2f2-d96f-4783-b0d4-f9c8af617054)  
39. A Multimodal Platform to Teach Mathematics to Students with Vision-Impairment, accessed on October 11, 2025, [https://www.researchgate.net/publication/352936127\_A\_Multimodal\_Platform\_to\_Teach\_Mathematics\_to\_Students\_with\_Vision-Impairment](https://www.researchgate.net/publication/352936127_A_Multimodal_Platform_to_Teach_Mathematics_to_Students_with_Vision-Impairment)  
40. Assistive technology-based solutions in learning mathematics for visually-impaired people: exploring issues, challenges and opportunities, accessed on October 11, 2025, [https://pmc.ncbi.nlm.nih.gov/articles/PMC10684398/](https://pmc.ncbi.nlm.nih.gov/articles/PMC10684398/)  
41. Six design principles for reducing cognitive load in UX | by Andi Zhou \- Medium, accessed on October 11, 2025, [https://medium.com/@zhouandi0318/six-design-principles-for-reducing-cognitive-load-in-ux-e4ee7e3fa62e](https://medium.com/@zhouandi0318/six-design-principles-for-reducing-cognitive-load-in-ux-e4ee7e3fa62e)  
42. Progressive disclosure UX for responsive websites \- Justinmind, accessed on October 11, 2025, [https://www.justinmind.com/ux-design/progressive-disclosure](https://www.justinmind.com/ux-design/progressive-disclosure)  
43. What is Progressive Disclosure? Show & Hide the Right Information \- UXPin, accessed on October 11, 2025, [https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)  
44. Progressive Disclosure Controls \- Win32 apps \- Microsoft Learn, accessed on October 11, 2025, [https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-progressive-disclosure-controls)  
45. How Progressive Disclosure Simplifies Complex UI Design \- Medium, accessed on October 11, 2025, [https://medium.com/@marketingtd64/how-progressive-disclosure-simplifies-complex-ui-design-e799c76cfced](https://medium.com/@marketingtd64/how-progressive-disclosure-simplifies-complex-ui-design-e799c76cfced)  
46. Key UI/UX design principles \- Dynamics 365 | Microsoft Learn, accessed on October 11, 2025, [https://learn.microsoft.com/en-us/dynamics365/guidance/develop/ui-ux-design-principles](https://learn.microsoft.com/en-us/dynamics365/guidance/develop/ui-ux-design-principles)  
47. Use accessible design patterns \- Harvard's Digital Accessibility, accessed on October 11, 2025, [https://accessibility.huit.harvard.edu/use-accessible-design-patterns](https://accessibility.huit.harvard.edu/use-accessible-design-patterns)  
48. Use a Consistent Visual Design | Cognitive Accessibility Design Pattern | WAI \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p03-consistent-design/](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p03-consistent-design/)  
49. What you need to know about WCAG 2.2 \- AbilityNet, accessed on October 11, 2025, [https://abilitynet.org.uk/factsheets/what-you-need-know-about-wcag-22](https://abilitynet.org.uk/factsheets/what-you-need-know-about-wcag-22)  
50. Web Content Accessibility Guidelines (WCAG) 2.2 \- W3C, accessed on October 11, 2025, [https://www.w3.org/TR/WCAG22/](https://www.w3.org/TR/WCAG22/)  
51. How to Meet WCAG (Quick Reference) \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/WCAG22/quickref/](https://www.w3.org/WAI/WCAG22/quickref/)  
52. Understanding Success Criterion 1.4.12: Text Spacing | WAI \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)  
53. How To Design For Users With Dyslexia, accessed on October 11, 2025, [https://smart-interface-design-patterns.com/articles/dyslexia-design/](https://smart-interface-design-patterns.com/articles/dyslexia-design/)  
54. Declare permissions | Chrome Extensions, accessed on October 11, 2025, [https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)  
55. Browser Extension Security Risks and Best Practices, accessed on October 11, 2025, [https://layerxsecurity.com/learn/browser-extension/](https://layerxsecurity.com/learn/browser-extension/)  
56. permissions \- Mozilla \- MDN, accessed on October 11, 2025, [https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)  
57. Canvas API Quickstart Guide for Instructors \- Johns Hopkins Engineering, accessed on October 11, 2025, [https://support.cmts.jhu.edu/hc/en-us/articles/37824528760717-Canvas-API-Quickstart-Guide-for-Instructors](https://support.cmts.jhu.edu/hc/en-us/articles/37824528760717-Canvas-API-Quickstart-Guide-for-Instructors)  
58. Solved: Help with User Role Identification via Canvas API \- Instructure Community \- 636380, accessed on October 11, 2025, [https://community.canvaslms.com/t5/Developers-Group/Help-with-User-Role-Identification-via-Canvas-API/m-p/636380](https://community.canvaslms.com/t5/Developers-Group/Help-with-User-Role-Identification-via-Canvas-API/m-p/636380)  
59. Users API \- Canvas LMS \- Mitt UiB, accessed on October 11, 2025, [https://mitt.uib.no/doc/api/users.html](https://mitt.uib.no/doc/api/users.html)  
60. Analytics | Instructure Developer Documentation Portal, accessed on October 11, 2025, [https://developerdocs.instructure.com/services/canvas/resources/analytics](https://developerdocs.instructure.com/services/canvas/resources/analytics)  
61. Courses \- Canvas LMS REST API Documentation, accessed on October 11, 2025, [https://lms.au.af.edu/doc/api/courses.html](https://lms.au.af.edu/doc/api/courses.html)  
62. Introduction | Instructure Developer Documentation Portal, accessed on October 11, 2025, [https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools\_intro](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.tools_intro)  
63. LTI Fundamentals FAQ | IMS Global Learning Consortium \- 1EdTech, accessed on October 11, 2025, [https://www.imsglobal.org/lti-fundamentals-faq](https://www.imsglobal.org/lti-fundamentals-faq)  
64. Caliper Analytics v1.1 Introduction | IMS Global Learning Consortium \- 1EdTech, accessed on October 11, 2025, [https://www.imsglobal.org/caliper-analytics-v11-introduction](https://www.imsglobal.org/caliper-analytics-v11-introduction)  
65. By Audience: Education Technology Vendors \- Protecting Student Privacy, accessed on October 11, 2025, [https://studentprivacy.ed.gov/audience/education-technology-vendors](https://studentprivacy.ed.gov/audience/education-technology-vendors)  
66. Joint Guidance on the Application of FERPA and HIPAA to Student Health Records, accessed on October 11, 2025, [https://studentprivacy.ed.gov/resources/joint-guidance-application-ferpa-and-hipaa-student-health-records](https://studentprivacy.ed.gov/resources/joint-guidance-application-ferpa-and-hipaa-student-health-records)  
67. Claude Code: Best practices for agentic coding \- Anthropic, accessed on October 11, 2025, [https://www.anthropic.com/engineering/claude-code-best-practices](https://www.anthropic.com/engineering/claude-code-best-practices)  
68. Highly effective CLAUDE.md for large codebasees : r/ClaudeAI \- Reddit, accessed on October 11, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1mgfy4t/highly\_effective\_claudemd\_for\_large\_codebasees/](https://www.reddit.com/r/ClaudeAI/comments/1mgfy4t/highly_effective_claudemd_for_large_codebasees/)  
69. Conventional Commits, accessed on October 11, 2025, [https://www.conventionalcommits.org/en/v1.0.0/](https://www.conventionalcommits.org/en/v1.0.0/)  
70. Conventional Commits Cheatsheet \- GitHub Gist, accessed on October 11, 2025, [https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13)  
71. Conventional Commits & SemVer \- Medium, accessed on October 11, 2025, [https://medium.com/@alextkd/conventional-commits-semver-9e42a372afc2](https://medium.com/@alextkd/conventional-commits-semver-9e42a372afc2)  
72. Cooking with Claude Code: The Complete Guide \- Sid Bharath, accessed on October 11, 2025, [https://www.siddharthbharath.com/claude-code-the-complete-guide/](https://www.siddharthbharath.com/claude-code-the-complete-guide/)  
73. pre-commit, accessed on October 11, 2025, [https://pre-commit.com/](https://pre-commit.com/)  
74. Accessibility score | How to measure digital accessibility \- Level Access, accessed on October 11, 2025, [https://www.levelaccess.com/blog/so-you-want-an-accessibility-score/](https://www.levelaccess.com/blog/so-you-want-an-accessibility-score/)  
75. Designing assistive technologies for and with neurodivergent users: considerations from research practice | Interacting with Computers | Oxford Academic, accessed on October 11, 2025, [https://academic.oup.com/iwc/advance-article/doi/10.1093/iwc/iwaf037/8276143?searchresult=1](https://academic.oup.com/iwc/advance-article/doi/10.1093/iwc/iwaf037/8276143?searchresult=1)  
76. Usability Testing for Edtech Companies \- Leanlab Education, accessed on October 11, 2025, [https://www.leanlabeducation.org/blog/usability-testing-for-edtech-companies](https://www.leanlabeducation.org/blog/usability-testing-for-edtech-companies)  
77. 7 Metrics for Testing Accessibility Performance | UXPin, accessed on October 11, 2025, [https://www.uxpin.com/studio/blog/7-metrics-for-testing-accessibility-performance/](https://www.uxpin.com/studio/blog/7-metrics-for-testing-accessibility-performance/)  
78. Research Report on Web Accessibility Metrics \- W3C, accessed on October 11, 2025, [https://www.w3.org/WAI/RD/2011/metrics/note/ED-metrics](https://www.w3.org/WAI/RD/2011/metrics/note/ED-metrics)  
79. Accessibility KPIs: How to Measure and Improve Your Accessibility Efforts \- Be My Eyes, accessed on October 11, 2025, [https://www.bemyeyes.com/business/blog/accessibility-kpis-how-to-measure-and-improve-your-accessibility-efforts/](https://www.bemyeyes.com/business/blog/accessibility-kpis-how-to-measure-and-improve-your-accessibility-efforts/)  
80. Agile Accessibility KPIs: How to Measure What Matters, accessed on October 11, 2025, [https://www.levelaccess.com/blog/agile-accessibility-kpis-how-to-measure-what-matters/](https://www.levelaccess.com/blog/agile-accessibility-kpis-how-to-measure-what-matters/)