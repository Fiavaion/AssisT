# Discovery Quiz Feature - Implementation Plan

**Created:** 2025-11-28
**Status:** Planning Complete, Ready for Implementation
**Phase:** Phase 2 - Feature Development

---

## Overview

The Discovery Quiz is an adaptive onboarding experience that helps users identify their learning needs and recommends appropriate AssisT features. It opens in a dedicated full tab for a distraction-free experience.

---

## Finalized Decisions

### 1. Quiz Location
**Decision:** Dedicated full tab using `chrome.tabs.create()`

**Rationale:**
- Chrome tabs API is sandboxed - only requires `tabs` permission (already granted)
- Full-screen experience reduces cognitive load for neurodivergent users
- No interference with current page content
- Clean separation from popup UI
- Can be bookmarked/reopened

### 2. Discovery Length
**Decision:** Adaptive approach - 6 core questions with "Tell me more" refinement

**Structure:**
- **6 Core Questions:** Required, covers main areas
- **"Tell me more" Option:** Optional deep-dive on any question
- **Progressive Disclosure:** Reveals complexity only when user requests it

**Questions Map:**
1. Reading Challenges → TTS, Reading Mode, Reading Guide
2. Writing Challenges → STT, Auto-punctuation, Vocabulary help
3. Focus/Attention → Pomodoro, Focus Mode, Reduced Motion
4. Visual Preferences → Dark Mode, Screen Overlay, Font Customization
5. Organization Needs → Annotations, Citations, Text Stats
6. Language/Comprehension → Translation, Dictionary, Simplify

### 3. Dysgraphia Handling
**Decision:** Sub-option under Dyslexia - "Dyslexia (includes writing difficulties)"

**Rationale:**
- Reduces cognitive load (fewer primary options)
- Many users experience both together
- "Tell me more" can reveal specific writing support options
- Aligns with simplified, accessible design

### 4. Demo Content
**Decision:** NCAD-specific content based on real curriculum

**Content Sources:**
- Critical Cultures essay briefs (Visual Culture theory)
- First Year Studio briefs (Materials & Process)
- Pathway Experience projects
- Assessment criteria blocks
- Harvard referencing examples

---

## NCAD Brand Guidelines (for Demo Page)

**Colors:**
- Primary: Black (#000000), White (#FFFFFF)
- Accent: Orange 2025 (#f36f21)

**Typography:**
- Typeface: Spenser (or fallback system sans-serif)

**Tone:**
- "Bold and Curious Thinking, Making and Doing"

**Four Schools:**
- Design
- Education
- Fine Art
- Visual Culture

**Learning Areas:**
- Observation
- Materials
- Research
- Processes
- Professional Practice

---

## Technical Architecture

### File Structure
```
src/
├── pages/
│   ├── discovery/
│   │   ├── discovery.html      # Main quiz page
│   │   ├── discovery.js        # Quiz logic & state
│   │   ├── discovery.css       # Quiz styles
│   │   ├── questions.js        # Question data
│   │   └── recommendations.js  # Feature recommendation engine
│   └── demo/
│       ├── demo.html           # NCAD demo content page
│       ├── demo.js             # Demo interactions
│       └── demo.css            # NCAD brand styles
```

### Integration Points

1. **Popup Trigger:**
   - Add "Discover Your Tools" button to popup header
   - Opens discovery tab via message to service worker

2. **Service Worker:**
   - Handle `OPEN_DISCOVERY_QUIZ` message
   - Use `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/discovery/discovery.html') })`

3. **Manifest Updates:**
   - Add discovery pages to `web_accessible_resources`

4. **Storage:**
   - Save quiz results to Chrome storage
   - Store recommended features profile
   - Track quiz completion status

---

## Quiz Flow

```
┌─────────────────────────────────────────┐
│           Welcome Screen                │
│  "Let's discover which tools           │
│   work best for you"                   │
│  [Start Discovery →]                   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Question 1 of 6                 │
│  "Do you find reading on screen        │
│   tiring or difficult?"                │
│                                         │
│  ○ Never                               │
│  ○ Sometimes                           │
│  ○ Often                               │
│  ○ Always                              │
│                                         │
│  [Tell me more about this ▼]           │
│  [← Back]              [Next →]        │
└─────────────────┬───────────────────────┘
                  │
                  ▼  (after 6 questions)
┌─────────────────────────────────────────┐
│      Your Personalized Toolkit          │
│                                         │
│  Based on your responses:              │
│                                         │
│  ★ Recommended for You:                │
│    • Read Aloud (TTS) - High match     │
│    • Reading Guide - High match        │
│    • Focus Mode - Medium match         │
│                                         │
│  [Try Demo Page →] [Apply & Close]     │
└─────────────────────────────────────────┘
```

---

## Question Details

### Question 1: Reading Challenges
**Primary:** "Do you find reading on screen tiring or difficult?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Do words seem to move or blur?"
- "Do you lose your place while reading?"
- "Do you prefer listening to reading?"

**Maps to:** TTS, Reading Mode, Reading Guide, Dyslexia Font

---

### Question 2: Writing Challenges
**Primary:** "Do you find typing or writing ideas down challenging?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Is spelling a barrier to expressing yourself?"
- "Do you think faster than you can type?"
- "Would speaking your ideas help?"

**Maps to:** STT, Auto-punctuation, Vocabulary Suggestions

---

### Question 3: Focus & Attention
**Primary:** "Do you struggle to maintain focus while working online?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Do animations or movements distract you?"
- "Do you work better in short bursts?"
- "Do you need reminders to take breaks?"

**Maps to:** Focus Mode, Reduced Motion, Pomodoro Timer

---

### Question 4: Visual Comfort
**Primary:** "Do bright screens or certain colors cause discomfort?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Do you prefer darker interfaces?"
- "Do certain background colors help you read?"
- "Do you need larger or different fonts?"

**Maps to:** Dark Mode, Screen Overlay, Text Customization

---

### Question 5: Organization
**Primary:** "Do you need help keeping track of research and notes?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Do you highlight or annotate documents?"
- "Do you need to track sources for essays?"
- "Do you want to see reading statistics?"

**Maps to:** Annotations, Citations, Text Stats

---

### Question 6: Language & Comprehension
**Primary:** "Do you sometimes need text simplified or translated?"
**Options:** Never / Sometimes / Often / Always

**Tell Me More:**
- "Is English your second language?"
- "Do you look up word definitions often?"
- "Would simpler language versions help?"

**Maps to:** Translation, Dictionary, Simplify Mode

---

## Recommendation Engine

### Scoring Algorithm

```javascript
const FEATURE_WEIGHTS = {
  tts: { q1: 3, q1_sub: [2, 1, 2] },
  readingGuide: { q1: 2, q1_sub: [1, 3, 0] },
  stt: { q2: 3, q2_sub: [1, 2, 3] },
  focusMode: { q3: 3, q3_sub: [3, 1, 0] },
  darkMode: { q4: 3, q4_sub: [3, 1, 0] },
  // ... etc
};

// Score calculation:
// - Primary question score: answer_index * base_weight
// - Sub-question bonus: sub_answer * sub_weight
// - Normalize to 0-100 scale
// - Threshold for recommendation: 40+
```

### Recommendation Tiers
- **Strong Match (70+):** "Highly Recommended"
- **Good Match (40-69):** "Recommended"
- **Possible Match (20-39):** "You might like"
- **Low Match (<20):** Not shown

---

## Accessibility Requirements (WCAG 2.2 AA)

1. **Keyboard Navigation:** Full tab navigation through all options
2. **Screen Reader Support:** ARIA labels, live regions for progress
3. **Focus Indicators:** Clear visible focus states
4. **Text Spacing:** Compliant with SC 1.4.12
5. **Motion Respect:** `prefers-reduced-motion` honored
6. **Color Contrast:** 4.5:1 minimum for all text
7. **Touch Targets:** 44x44px minimum for interactive elements

---

## Implementation Order

1. **Phase 1: Infrastructure**
   - Create `src/pages/discovery/` directory
   - Set up discovery.html with basic structure
   - Add manifest.json web_accessible_resources entry
   - Add service worker message handler

2. **Phase 2: Quiz UI**
   - Implement question navigation
   - Create question components
   - Add "Tell me more" expansion
   - Build progress indicator

3. **Phase 3: Recommendation Engine**
   - Create scoring algorithm
   - Build results display
   - Connect to Chrome storage
   - Enable feature activation from results

4. **Phase 4: Demo Page**
   - Create NCAD-styled demo page
   - Add sample essay brief content
   - Enable feature testing on demo content

5. **Phase 5: Integration**
   - Add trigger to popup
   - First-run detection
   - Profile saving

---

## Testing Plan

### Unit Tests
- Question navigation logic
- Scoring algorithm
- Storage integration

### E2E Tests
- Full quiz flow completion
- Keyboard navigation
- Feature activation from results

### Accessibility Tests
- Screen reader compatibility
- Keyboard-only navigation
- Color contrast verification

---

## Success Metrics

1. Quiz completion rate (target: >80%)
2. Feature activation from recommendations
3. User retention after quiz completion
4. Accessibility audit pass rate

---

## Decision Log Entry

**ID:** DEC-202511-038
**Date:** 2025-11-28
**Decision:** Implement Discovery Quiz as dedicated full-tab adaptive experience with 6 core questions

**Rationale:**
- Full tab provides distraction-free onboarding for neurodivergent users
- Adaptive length respects user time while allowing depth when needed
- NCAD demo content provides authentic educational context for testing

**Alternatives Rejected:**
1. Modal overlay: Rejected due to accessibility concerns with trapped focus
2. Multi-step popup wizard: Rejected due to space constraints
3. Fixed 15-question survey: Rejected as too time-consuming

**Impact:** Improves onboarding experience, increases feature discovery, reduces support burden

**Stakeholders:** UX Team, Accessibility SME, Product Lead

**Outcome:** Implement per this plan, beginning with infrastructure setup
