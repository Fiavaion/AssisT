# AI-Powered Accessibility Enhancement for AssisT

## A Strategic Investment in Inclusive Education

**Version:** 2.0 | **Date:** November 2025 | **Classification:** Budget Approval Request

---

## At a Glance

| Item                      | Detail                                              |
| ------------------------- | --------------------------------------------------- |
| **Investment Required**   | €45,000 development + €2,000-3,000/year operational |
| **Timeline**              | 20 weeks to full deployment                         |
| **Expected ROI**          | 10:1 within first academic year                     |
| **Risk Level**            | Low (phased approach with pilot)                    |
| **Regulatory Compliance** | GDPR-first, EU AI Act ready                         |

---

## 1. The Opportunity

### What We're Proposing

Integrate AI language processing into the AssisT browser extension to provide intelligent, adaptive support for students with severe learning difficulties—transforming how they access educational content.

### Why Now

Modern AI can understand context, simplify language, and adapt to individual needs in ways that weren't possible two years ago. This technology has matured to the point where it can run locally on student devices, ensuring privacy while delivering genuine educational value.

### The Gap We're Filling

Our current accessibility tools help students _access_ content. AI enhancement helps them _understand_ it.

| Current Capability                     | AI-Enhanced Capability                            |
| -------------------------------------- | ------------------------------------------------- |
| Text-to-speech reads content verbatim  | AI simplifies _then_ reads at appropriate level   |
| Voice input captures raw speech        | AI corrects errors, improves grammar in real-time |
| OCR extracts text from images          | AI explains diagrams and charts meaningfully      |
| Static accommodations (fonts, colours) | Adaptive support based on student profile         |

---

## 2. Who This Helps

### Students with Severe Learning Difficulties

This investment directly supports students who struggle most with digital learning:

**Reading Difficulties (Dyslexia)**

- Complex academic text becomes accessible through intelligent simplification
- Technical terms explained inline, at the student's level
- Long passages broken into manageable chunks

**Attention Difficulties (ADHD)**

- Key points extracted automatically—no more scanning dense paragraphs
- Complex instructions converted to actionable checklists
- Progress tracking keeps students oriented

**Autism Spectrum**

- Idioms and metaphors explained literally
- Ambiguous instructions clarified
- Consistent, predictable response format

**Processing Disorders**

- Multi-level simplification (same content at different complexity levels)
- Visual content described comprehensively
- Information presented in preferred modality

### Real Example

**Original assignment text:**

> "Analyse the socioeconomic factors that precipitated the industrial revolution, with particular emphasis on the agrarian transformations that displaced rural populations."

**AI-simplified version:**

> "Explain why the Industrial Revolution happened. Focus on:
>
> - How farming changed
> - Why people moved from farms to cities
>
> _Key terms: Socioeconomic = related to money and society_"

This isn't dumbing down—it's making the same learning accessible.

---

## 3. How It Works

### Privacy-First Architecture

We've designed this to work without sending student data to external servers:

```
Priority 1: Browser-Native AI
   └── Runs entirely on student's device
   └── Nothing leaves the browser
   └── Works offline

Priority 2: Local Server (Optional)
   └── Higher quality models
   └── Still on student's device
   └── IT can pre-install on lab machines

Priority 3: Cloud API (Fallback Only)
   └── Activates only with explicit consent
   └── All personal data stripped before transmission
   └── Highest quality for complex content
```

**Default behaviour:** AI runs locally. Cloud is opt-in, not opt-out.

### What Students Experience

1. **Click "Simplify"** on any Canvas assignment
2. **Content is processed** (locally, in under 2 seconds)
3. **Simplified version appears** with key terms highlighted
4. **Click "Read Aloud"** to hear the accessible version

No new interfaces to learn. Integrates with tools they already use.

---

## 4. Regulatory Compliance

### Our Regulatory Framework

**Primary:** EU General Data Protection Regulation (GDPR)
**Secondary:** EU AI Act (anticipated requirements)
**Considered:** UK GDPR, US FERPA (for international compatibility)

### GDPR Compliance by Design

| GDPR Principle         | How We Address It                                                         |
| ---------------------- | ------------------------------------------------------------------------- |
| **Lawful basis**       | Legitimate interest (accessibility) + explicit consent for cloud features |
| **Data minimisation**  | Only specific text passages processed, never full documents               |
| **Purpose limitation** | Processing solely for accessibility—no profiling, no analytics on content |
| **Storage limitation** | Responses cached locally, auto-deleted after 30 days                      |
| **Security**           | Encryption in transit (TLS 1.3), encrypted local storage                  |
| **Rights of access**   | Students can view/delete all cached data via extension settings           |

### EU AI Act Readiness

The AI Act classifies educational AI as "high-risk." Our approach addresses this:

- **Transparency:** Clear disclosure when AI is processing content
- **Human oversight:** Students control when AI activates
- **Data governance:** Local-first processing, documented data flows
- **Record-keeping:** Audit logs of all AI interactions (metadata only)

### Data Processing Summary

| Data Type         | Processed Locally | Sent to Cloud            | Stored          |
| ----------------- | ----------------- | ------------------------ | --------------- |
| Course content    | ✓                 | Only with consent        | Cached 30 days  |
| Student names/IDs | Never             | Never                    | Never           |
| Writing samples   | ✓                 | Anonymised, with consent | Session only    |
| Usage patterns    | ✓                 | Never                    | Aggregated only |

---

## 5. Investment Analysis

### Development Costs

| Phase             | Duration     | Cost        | Deliverable                            |
| ----------------- | ------------ | ----------- | -------------------------------------- |
| Foundation        | 4 weeks      | €9,000      | AI infrastructure, privacy framework   |
| Core Features     | 6 weeks      | €13,500     | Content simplification, writing assist |
| Advanced Features | 6 weeks      | €13,500     | Tutoring agent, image description      |
| Optimisation      | 4 weeks      | €9,000      | Performance, analytics, documentation  |
| **Total**         | **20 weeks** | **€45,000** | Full AI accessibility suite            |

### Operational Costs (Annual, 500 Students)

| Deployment Model         | Annual Cost | Per Student |
| ------------------------ | ----------- | ----------- |
| **Browser-native only**  | €500        | €1          |
| **Hybrid (recommended)** | €2,500      | €5          |
| **Cloud-primary**        | €5,000      | €10         |

### Return on Investment

**Conservative estimates based on comparable implementations:**

| Benefit                                             | Annual Value |
| --------------------------------------------------- | ------------ |
| Reduced learning support time (30 min/student/week) | €75,000      |
| Improved assignment completion (+15%)               | €25,000\*    |
| Reduced accommodations administration               | €12,500      |
| **Total Annual Benefit**                            | **€112,500** |

\*Calculated from reduced re-teaching, fewer extensions, improved progression

**ROI Calculation:**

- Year 1: (€112,500 - €47,500) / €47,500 = **137% ROI**
- Year 2+: (€112,500 - €2,500) / €2,500 = **4,400% ROI**

**Payback period:** Under 6 months

---

## 6. Risk Management

### What Could Go Wrong

| Risk                                  | Likelihood | Our Mitigation                                              |
| ------------------------------------- | ---------- | ----------------------------------------------------------- |
| AI produces inaccurate simplification | Medium     | Human review option, confidence indicators, feedback button |
| Students become over-reliant          | Medium     | Scaffolding mode reduces assistance over time               |
| Cloud provider data breach            | Low        | Local-first by default, cloud is opt-in fallback            |
| Technology doesn't meet expectations  | Medium     | Phased rollout with pilot evaluation                        |

### Pilot Programme (Recommended)

Before full deployment:

- 8-week pilot with 50-75 students
- Structured feedback collection
- Measurable success criteria
- Go/no-go decision point before Phase 3

---

## 7. Implementation Approach

### Timeline

```
Month 1-2          Month 3-4          Month 5
───────────────────────────────────────────────
Foundation    →    Core Features  →   Pilot Launch
                                      ↓
Month 6            Month 7-8          Month 9+
───────────────────────────────────────────────
Pilot Review  →    Advanced       →   Full Rollout
                   Features
```

### Key Milestones

| Week | Milestone               | Decision Point             |
| ---- | ----------------------- | -------------------------- |
| 4    | Infrastructure complete | Confirm technical approach |
| 10   | Core features ready     | Begin pilot recruitment    |
| 14   | Pilot launch            | —                          |
| 18   | Pilot evaluation        | Go/no-go for full rollout  |
| 20   | Full deployment         | —                          |

### What We Need to Start

1. **Budget approval** for Phase 1-2 (€22,500)
2. **Pilot cohort identification** (50-75 students, diverse needs)
3. **IT coordination** for any local server deployments
4. **Educator liaison** for training and feedback collection

---

## 8. Alternatives Considered

### Option A: Status Quo

- **Cost:** €0
- **Outcome:** Students continue struggling with complex content
- **Risk:** Falling behind institutions investing in AI accessibility

### Option B: Third-Party AI Tool

- **Cost:** €15,000-30,000/year licensing
- **Outcome:** Generic solution, not integrated with Canvas workflow
- **Risk:** Data leaves our control, ongoing dependency

### Option C: This Proposal (Recommended)

- **Cost:** €45,000 once + €2,500/year
- **Outcome:** Purpose-built, privacy-first, fully integrated
- **Risk:** Development timeline, mitigated by phased approach

---

## 9. Recommendation

### Approve Phase 1-2 Development (€22,500)

This delivers:

- ✓ Complete AI infrastructure with GDPR compliance
- ✓ Content simplification (highest-impact feature)
- ✓ Writing assistance integrated with existing voice input
- ✓ Pilot-ready deployment

### Conditional Approval for Phase 3-4 (€22,500)

Subject to pilot success criteria:

- Student satisfaction >75%
- Measurable comprehension improvement
- No significant technical issues
- Positive educator feedback

---

## 10. Next Steps

**If approved:**

| Week | Action                                  | Owner            |
| ---- | --------------------------------------- | ---------------- |
| 1    | Finalise technical specification        | Development Team |
| 1    | Identify pilot cohort                   | Learning Support |
| 2    | Begin Phase 1 development               | Development Team |
| 4    | IT briefing on local deployment options | IT Services      |
| 6    | Educator training materials drafted     | Learning Support |

---

## Appendices

### A. Technical Specifications

Available separately: [Technical Architecture Document]

Key points:

- Browser extension (Chrome/Edge), integrates with existing AssisT
- Models: Phi-3 (local), Llama-3.2 (local server), Enterprise API (cloud)
- Languages: JavaScript, WebAssembly
- No additional server infrastructure required

### B. AI Model Comparison

| Model          | Where It Runs | Quality   | Speed  | Best For                    |
| -------------- | ------------- | --------- | ------ | --------------------------- |
| Phi-3 (3B)     | In browser    | Good      | Fast   | Quick simplification        |
| Llama-3.2 (8B) | Local server  | Very Good | Medium | Complex content             |
| Enterprise API | Cloud         | Excellent | Fast   | Fallback, advanced features |

### C. Regulatory Documentation

Available on request:

- Data Protection Impact Assessment (DPIA)
- AI Act Compliance Checklist
- Data Processing Agreement template (for cloud providers)

### D. Glossary

| Term                 | Meaning                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| **LLM**              | Large Language Model—AI trained on text that can understand and generate language |
| **Local processing** | AI runs on the student's own device, data never leaves                            |
| **Cloud API**        | AI runs on external servers, data transmitted securely                            |
| **GDPR**             | EU regulation governing personal data protection                                  |
| **EU AI Act**        | Upcoming EU regulation on artificial intelligence systems                         |

---

**Prepared by:** AssisT Development Team
**Budget Authority:** Head of Department
**Review Date:** [To be scheduled]

---

_For questions or to discuss this proposal, please contact the development team._
