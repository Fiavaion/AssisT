# AssisT New Features Development Plan

**Version:** 1.0
**Date:** 2026-02-13
**Status:** Planning Phase
**Estimated Total Effort:** 96-118 hours (~12-15 weeks part-time)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Overview](#feature-overview)
3. [Sub-Agent Orchestration Strategy](#sub-agent-orchestration-strategy)
4. [Phase 1: Quick Wins (14-18 hours)](#phase-1-quick-wins)
5. [Phase 2: Strategic Features (24-30 hours)](#phase-2-strategic-features)
6. [Phase 3: Advanced Capabilities (38-45 hours)](#phase-3-advanced-capabilities)
7. [Phase 4: Production Polish (20-25 hours)](#phase-4-production-polish)
8. [Testing & Quality Assurance](#testing--quality-assurance)
9. [Deployment Checklist](#deployment-checklist)

---

## Executive Summary

This plan outlines the implementation of **20+ new AI-powered features** that will transform AssisT into the world's most advanced neurodivergent-friendly educational assistant. The plan leverages sub-agent orchestration for parallel development across three strategic areas:

1. **Dysarthria STT Profile** - Comprehensive speech support (recognition + communication + therapy)
2. **Advanced AI Features** - Multi-modal learning, emotional intelligence, Canvas API integration
3. **Production-Ready Enhancements** - Error resilience, performance optimization, monitoring

### Strategic Value Proposition

**Current State:** 79 features, 2.3x more than Helperbird (closest competitor)

**Future State (Post-Implementation):**

- **99+ features** across 12 categories
- **7 neurodivergent STT profiles** (including dysarthria)
- **20+ AI-powered features** (all local/privacy-first)
- **Deep Canvas LMS integration** via REST API
- **Comprehensive accessibility** (WCAG 2.2 Level AAA)

### Competitive Positioning

| Capability                  | AssisT (Post-Plan) | Helperbird Pro | Google Docs Voice |
| --------------------------- | ------------------ | -------------- | ----------------- |
| **Neurodivergent Profiles** | 12+                | 1              | 0                 |
| **AI Features**             | 20+ (local)        | 5 (cloud)      | 3 (cloud)         |
| **STT Commands**            | 80+                | ~10            | ~10               |
| **Privacy**                 | 100% local         | Cloud sync     | Cloud-only        |
| **Speech Therapy**          | Integrated         | None           | None              |
| **Canvas Integration**      | REST API           | Text scraping  | None              |

---

## Feature Overview

### Category 1: Dysarthria STT Profile (22-28 hours)

**Problem:** Users with dysarthria (unclear speech articulation) struggle with standard STT systems.

**Solution Components:**

1. **Recognition Enhancement** (8-10 hrs)
   - Extended timeouts (silenceTimeout: 3.5s, speechTimeout: 60s)
   - Higher alternatives (maxAlternatives: 7)
   - Phrase learning system (auto-learn from corrections)
   - Confidence threshold tuning (0.5 vs 0.6 default)

2. **Communication Assistance** (6-8 hrs)
   - Word prediction engine (N-gram model)
   - Phrase template library (greetings, questions, requests)
   - Alternative phrasing suggester

3. **Speech Therapy Integration** (6-8 hrs)
   - Practice mode (target word/phrase repetition)
   - Progress tracking dashboard (clarity trends)
   - Session recording (privacy opt-in, encrypted)

4. **UI Components** (2-4 hrs)
   - Alternative suggestions panel
   - Phrase template quick-insert modal
   - Practice dashboard

**Files to Create:**

- `src/engines/stt/communication-assistant.js` (~800 lines)
- `src/engines/stt/therapy-tracker.js` (~600 lines)
- `src/engines/stt/phrase-learner.js` (~500 lines)
- `src/ui/components/alternative-suggestions-panel.js` (~400 lines)
- `src/ui/components/phrase-template-modal.js` (~350 lines)
- `src/ui/components/practice-dashboard.js` (~500 lines)

**Files to Modify:**

- `src/engines/stt/stt-profiles.js` (+150 lines - DYSARTHRIA_SUPPORT profile)
- `src/engines/stt/stt-controller.js` (+80 lines - integrate new modules)
- `src/popup/popup.html` (+200 lines - practice tab)
- `src/popup/popup.js` (+150 lines - handlers)

### Category 2: Advanced AI Features (56-68 hours)

#### 2.1 Multi-Modal Learning Paths (8-10 hrs)

**Goal:** Generate personalized learning sequences (text + audio + visual + quiz)

**Components:**

- Learning style detection (monitor TTS usage, annotations)
- Content transformation pipeline (Ollama → multiple formats)
- Diagram generator (Mermaid.js code generation)
- Quiz generator (multiple choice, fill-in-blank)
- Adaptive pacing (adjust chunk size based on reading speed)

**Files:**

- `src/features/ai/learning-path-generator.js` (~900 lines)
- `src/features/ai/diagram-generator.js` (~600 lines)
- `src/features/ai/quiz-generator.js` (~500 lines)

#### 2.2 Emotional Intelligence Layer (10-12 hrs)

**Goal:** Detect emotional/cognitive state and intervene appropriately

**Components:**

- Struggle detection (re-reading, pauses, scroll patterns)
- Mood tracking dashboard (optional logging)
- Adaptive content delivery (simplify if frustrated)
- Calming content recommendations (breathing exercises)

**Files:**

- `src/features/ai/emotional-intelligence.js` (~1,200 lines)
- `src/ui/components/mood-tracker-panel.js` (~400 lines)
- `src/features/ai/intervention-suggester.js` (~500 lines)

#### 2.3 Canvas API Integration (12-15 hrs)

**Goal:** Deep Canvas LMS integration via REST API (not just text scraping)

**Components:**

- OAuth2 authentication flow
- API client wrapper (assignments, grades, rubrics, submissions)
- Assignment analyzer (parse rubrics → checklist)
- Grade analytics (performance trends, insights)
- Submission compliance checker (rubric alignment)

**Files:**

- `src/integrations/canvas-api-client.js` (~800 lines)
- `src/features/ai/assignment-analyzer.js` (~700 lines)
- `src/features/ai/grade-analytics.js` (~600 lines)

#### 2.4 Collaborative Learning (10-12 hrs)

**Goal:** Privacy-first peer learning and knowledge sharing

**Components:**

- Annotation sharing (opt-in, P2P encrypted)
- Community citation library
- Peer review assistant (rubric-guided)
- Study group formation (Canvas enrollment data)

**Files:**

- `src/features/collaboration/annotation-sync.js` (~600 lines)
- `src/features/collaboration/citation-library.js` (~500 lines)
- `src/features/collaboration/peer-review-assistant.js` (~700 lines)

#### 2.5 Research Workflow Enhancements (14-16 hrs)

**Goal:** AI-powered research tools for academic work

**Components:**

- Multi-document comparison (extract themes, contradictions)
- Bias detection (political, methodological, funding)
- Citation network analysis (build graph, find related papers)
- Literature review generator (structured outline)

**Files:**

- `src/features/ai/document-comparator.js` (~800 lines)
- `src/features/ai/bias-detector.js` (~600 lines)
- `src/features/research/citation-network.js` (~700 lines)
- `src/features/ai/literature-review-generator.js` (~900 lines)

#### 2.6 Executive Function Support (12-14 hrs)

**Goal:** Comprehensive ADHD/executive dysfunction support

**Components:**

- AI task decomposition (assignment → subtasks + time estimates)
- Intelligent time estimation (learn user's completion speed)
- Procrastination detection (monitor avoidance patterns)
- Working memory aids (breadcrumbs, context sidebar, quick reference)

**Files:**

- `src/features/ai/task-decomposer.js` (~800 lines)
- `src/features/executive/procrastination-detector.js` (~600 lines)
- `src/features/executive/working-memory-assistant.js` (~700 lines)

### Category 3: Production-Ready Enhancements (18-24 hours)

#### 3.1 Error Resilience (3-4 hrs)

- Retry logic with exponential backoff (1s → 2s → 4s)
- Model fallback chain (phi3 → gemma → llama)
- Timeout escalation (30s → 60s → 90s)
- Graceful degradation (AI fails → non-AI alternatives)

**Files:**

- Modify `src/background/service-worker.js` (+200 lines)
- Create `src/utils/error-resilience.js` (+150 lines)

#### 3.2 Performance Optimization (5-6 hrs)

- Query caching (100 queries, 1hr TTL)
- Response streaming (Server-Sent Events)
- Batch processing (queue, 3 concurrent max)
- Predictive model preloading (page type detection)

**Files:**

- `src/utils/query-cache.js` (+200 lines)
- Modify `src/background/service-worker.js` (+150 lines)
- `src/utils/batch-processor.js` (+180 lines)

#### 3.3 Accessibility Enhancements (4-5 hrs)

- Customizable text size (12px-32px)
- High-contrast mode (WCAG AAA)
- Screen reader optimization (ARIA live regions)
- Visual indicators for audio (hearing-impaired)

**Files:**

- `src/ui/styles/high-contrast.css` (+150 lines)
- Modify popup.html/popup.js (+140 lines)
- Update AI UI components (+200 lines)

#### 3.4 Monitoring & Analytics (5-6 hrs)

- Local-only metrics (response times, error rates)
- Performance dashboard (settings panel)
- Error tracking (aggregate by type)
- Anonymous telemetry (opt-in only)

**Files:**

- `src/utils/metrics-collector.js` (+300 lines)
- `src/ui/components/performance-dashboard.js` (+400 lines)
- `src/utils/telemetry.js` (+200 lines)

---

## Sub-Agent Orchestration Strategy

### Agent Types Available

1. **Explore Agents** - Fast codebase exploration, pattern discovery
2. **Plan Agents** - Software architecture, implementation design
3. **Code Implementation Agents** (via feature-dev skill) - Full feature implementation

### Orchestration Principles

**Parallel vs Sequential:**

- **Parallel:** Launch 2-3 agents when tasks are independent (e.g., different features)
- **Sequential:** One agent at a time when output of one informs the next

**Agent Specialization:**

- **code-explorer:** Understand existing patterns before building
- **code-architect:** Design complex features, plan integration points
- **code-reviewer:** Quality assurance, bug detection

**Quality Gates:**

- After each agent completes: Review output, validate against requirements
- Before moving to next phase: Run tests, check accessibility
- Before final commit: Full E2E test suite, WCAG audit

---

## Phase 1: Quick Wins (14-18 hours)

**Goal:** Deliver immediate value with dysarthria profile, error resilience, and caching.

### Task 1.1: Dysarthria STT Profile - Recognition Enhancement (8-10 hrs)

**Sub-Task 1.1.1: Design Profile Configuration**

- **Agent:** Plan Agent (code-architect)
- **Input:** Existing STT profile architecture, dysarthria requirements
- **Output:** Complete profile config object, integration plan
- **Prompt:**

  ```
  Design the DYSARTHRIA_SUPPORT STT profile configuration.

  CONTEXT:
  - Existing profiles: ADHD_FOCUS, DYSLEXIA_SUPPORT, ANXIETY_CALM, MOTOR_IMPAIRMENT, LOW_VISION, AUTISM_COMFORT
  - Profile structure defined in src/engines/stt/stt-profiles.js
  - Architecture: recognition, ui, feedback, commands, processing, accessibility, [condition-specific]

  REQUIREMENTS:
  - Extended timeouts (silenceTimeout: 3500ms, speechTimeout: 60000ms)
  - Higher alternatives (maxAlternatives: 7)
  - Custom dysarthria object with: clarificationMode, phraselearning, slowSpeechDetection, communication, therapy
  - UI showing alternatives, confidence scores, low-confidence highlighting

  DELIVERABLES:
  1. Complete DYSARTHRIA_SUPPORT object (150 lines)
  2. Integration points with STTController
  3. New module requirements (phrase-learner, communication-assistant, therapy-tracker)
  ```

**Sub-Task 1.1.2: Implement Phrase Learning System**

- **Agent:** feature-dev:code-architect
- **Input:** Profile design from 1.1.1
- **Output:** `src/engines/stt/phrase-learner.js` (~500 lines)
- **Prompt:**

  ```
  Implement the dysarthria phrase learning system.

  ARCHITECTURE:
  - Hook into ConfidenceFeedback module's recognition events
  - Store misrecognition → correction pairs in VocabularyManager
  - Auto-learn after 3 corrections of same phrase
  - Boost confidence for learned phrases
  - Detect slow speech patterns → extend timeouts dynamically

  FEATURES:
  1. Pattern detection (frequently corrected phrases)
  2. Auto-correction database (IndexedDB via VocabularyManager)
  3. Adaptive timeout adjustment (detect speech rate < 60% avg)
  4. Confidence boost for learned phrases (+20% confidence)

  INTEGRATION:
  - src/engines/stt/confidence-feedback.js - onRecognitionResult hook
  - src/engines/stt/vocabulary-manager.js - extend schema for phrase patterns
  - src/engines/stt/stt-controller.js - apply learned corrections

  FILE: src/engines/stt/phrase-learner.js (~500 lines)
  TESTS: tests/unit/stt/phrase-learner.test.js (30+ tests)
  ```

**Sub-Task 1.1.3: Build Communication Assistant**

- **Agents:** 2 agents in parallel
  - Agent A: Word Prediction Engine
  - Agent B: Phrase Template Library
- **Prompt A (Word Prediction):**

  ```
  Implement word prediction engine for dysarthria communication assistance.

  ALGORITHM:
  - N-gram model (trigram) for context-aware prediction
  - Personal vocabulary learning from user corrections (VocabularyManager)
  - Confidence-weighted suggestions (show if confidence < 0.5)
  - Real-time prediction as user speaks (interim results)

  FEATURES:
  1. Trigram model (track word sequences)
  2. Personal vocabulary learning (auto-add corrected words)
  3. Top 5 suggestions ordered by probability
  4. Context window (last 10 words)

  FILE: src/engines/stt/communication-assistant.js (focus on word prediction, ~400 lines)
  TESTS: tests/unit/stt/communication-assistant.test.js (20+ tests for prediction)
  ```

- **Prompt B (Phrase Templates):**

  ```
  Implement phrase template library for quick insertion.

  TEMPLATES:
  - Categories: greetings, questions, requests, affirmations, custom
  - Pre-defined common phrases (20+ per category)
  - Custom template creation/editing
  - Variables/placeholders (e.g., "Hello [name]")
  - Quick insert via Ctrl+Shift+T

  STORAGE:
  - localStorage for templates (JSON format)
  - Import/export functionality
  - Sync with user's custom vocabulary

  FILE: src/engines/stt/communication-assistant.js (phrase template methods, ~400 lines)
  UI: src/ui/components/phrase-template-modal.js (~350 lines)
  TESTS: tests/unit/stt/phrase-templates.test.js (15+ tests)
  ```

**Sub-Task 1.1.4: Create UI Components**

- **Agent:** feature-dev:code-architect
- **Output:** Alternative suggestions panel, phrase template modal
- **Prompt:**

  ```
  Create UI components for dysarthria communication assistance.

  COMPONENT 1: Alternative Suggestions Panel
  - Floating panel next to transcript
  - Shows top 3-5 alternatives with confidence %
  - Buttons: Accept, Try Again, Edit
  - Real-time updates as recognition completes
  - Keyboard navigation (Tab, Enter, Escape)

  COMPONENT 2: Phrase Template Quick Insert
  - Modal triggered by Ctrl+Shift+T
  - Category tabs (Greetings, Questions, Requests, Custom)
  - Search/filter functionality
  - Insert at cursor or append
  - Keyboard-only navigation

  FILES:
  - src/ui/components/alternative-suggestions-panel.js (~400 lines)
  - src/ui/components/phrase-template-modal.js (~350 lines)
  - src/ui/styles/dysarthria-ui.css (~200 lines)

  INTEGRATION:
  - Hook into STTController's onRecognitionComplete
  - Display in content-simple.js (inject into page)
  - Settings toggle in popup.html

  ACCESSIBILITY:
  - WCAG 2.2 AA compliant
  - Full keyboard navigation
  - ARIA labels and roles
  - High-contrast mode support
  ```

**Quality Gate 1.1:**

- Unit tests pass (phrase-learner, communication-assistant)
- Manual testing with dysarthria simulation (intentionally garbled speech)
- UI components render correctly, keyboard navigation works
- Settings persist across sessions

### Task 1.2: Error Resilience (3-4 hrs)

**Sub-Task 1.2.1: Implement Retry Logic**

- **Agent:** feature-dev:code-architect
- **Output:** Retry utilities, service worker integration
- **Prompt:**

  ```
  Implement robust retry logic with exponential backoff for all Ollama API calls.

  STRATEGY:
  - 3 retries maximum
  - Exponential backoff: 1s → 2s → 4s
  - Detect transient errors (network, timeout) vs permanent (model missing)
  - Only retry on transient errors
  - Log retry attempts for monitoring

  IMPLEMENTATION:
  1. Create src/utils/error-resilience.js
     - retryWithBackoff(fn, maxRetries, baseDelay)
     - isTransientError(error)
     - createRetryPolicy(config)

  2. Modify src/background/service-worker.js
     - Wrap all ollamaGenerate() calls with retry logic
     - Add timeout tracking
     - Emit retry events for analytics

  FILES:
  - src/utils/error-resilience.js (~150 lines)
  - src/background/service-worker.js (+100 lines)

  TESTS:
  - tests/unit/utils/error-resilience.test.js (20+ tests)
  - Mock Ollama failures, verify retry behavior
  ```

**Sub-Task 1.2.2: Model Fallback Chain**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement model fallback chain for graceful degradation.

  CHAIN:
  1. phi3:mini (fastest, lowest quality)
  2. gemma:2b (medium speed, medium quality)
  3. llama3.2:3b (slowest, highest quality)

  LOGIC:
  - If model 1 times out → try model 2
  - If model 1 crashes → try model 2
  - If all models fail → return error, suggest manual retry
  - Log fallback events for monitoring

  CONFIGURATION:
  - User can configure fallback chain in settings
  - User can disable fallback (use primary model only)
  - Show which model was used in response footer

  IMPLEMENTATION:
  - Modify src/background/service-worker.js (+100 lines)
  - Add MODEL_FALLBACK_CHAIN constant
  - Modify ollamaGenerateWithRetry to try fallback models

  TESTS:
  - tests/unit/background/model-fallback.test.js (15+ tests)
  - Mock model failures, verify fallback behavior
  ```

**Quality Gate 1.2:**

- Retry logic handles transient errors correctly
- Fallback chain activates on timeout/crash
- Logs show retry attempts and fallback usage
- Settings UI allows fallback configuration

### Task 1.3: Query Caching (3-4 hrs)

**Sub-Task 1.3.1: Implement Cache Layer**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement query caching layer for Ollama responses.

  DESIGN:
  - LRU cache with configurable size (default: 100 queries)
  - TTL (time-to-live): 1 hour default, configurable
  - Cache key: hash of (prompt + model + parameters)
  - Storage: in-memory Map (not localStorage - privacy)
  - Eviction: LRU (least recently used) when cache full

  FEATURES:
  1. Cache hit/miss tracking
  2. Manual cache clearing
  3. Cache statistics (hit rate, size)
  4. Settings UI for size/TTL configuration

  FILE: src/utils/query-cache.js (~200 lines)
  INTEGRATION: src/background/service-worker.js (+50 lines)

  TESTS:
  - tests/unit/utils/query-cache.test.js (25+ tests)
  - Test LRU eviction, TTL expiration, hit/miss tracking
  ```

**Quality Gate 1.3:**

- Cache hit rate > 60% for repeated queries
- LRU eviction works correctly
- TTL expiration clears stale entries
- Settings UI allows configuration

**Phase 1 Completion Checklist:**

- [ ] Dysarthria profile works with test speech
- [ ] Phrase learning auto-corrects repeated errors
- [ ] Communication assistant shows word predictions
- [ ] UI components render and function correctly
- [ ] Error resilience handles failures gracefully
- [ ] Fallback chain activates on timeout
- [ ] Query cache improves response time
- [ ] All unit tests pass (100+ tests)
- [ ] Manual testing complete
- [ ] Documentation updated

---

## Phase 2: Strategic Features (24-30 hours)

**Goal:** Build differentiating AI features (multi-modal learning, emotional intelligence).

### Task 2.1: Multi-Modal Learning Paths (8-10 hrs)

**Sub-Task 2.1.1: Learning Style Detection**

- **Agent:** Explore + Plan (sequential)
- **Explore Prompt:**

  ```
  Explore existing user behavior tracking in AssisT.

  FIND:
  - How does the extension track TTS usage?
  - Where are annotations stored/tracked?
  - What metrics exist for reading speed, time-on-page?
  - Is there a user profile/preferences system?

  GOAL: Understand existing data collection so we can build learning style detection on top of it.
  ```

- **Plan Prompt:**

  ```
  Design learning style detection system based on user behavior.

  LEARNING STYLES:
  - Visual (frequent diagram viewing, image OCR usage)
  - Auditory (high TTS usage, low annotation usage)
  - Reading/Writing (high annotation usage, low TTS usage)
  - Kinesthetic (frequent interactions, short sessions)

  METRICS TO TRACK:
  - TTS activation frequency
  - Annotation creation rate
  - Time-on-page (scroll velocity as proxy)
  - OCR usage (image/diagram interaction)
  - Quiz/interactive feature usage

  DETECTION ALGORITHM:
  - Bayesian classification (prior: equal distribution)
  - Update probabilities based on behavior
  - Classify after 10+ sessions (minimum data)
  - Confidence threshold: 70%+ to apply adaptations

  DELIVERABLES:
  1. Detection algorithm design
  2. Metric collection points
  3. Classification logic
  4. Integration with existing profile system
  ```

**Sub-Task 2.1.2: Diagram Generator (Mermaid.js)**

- **Agents:** 2 agents in parallel
  - Agent A: Ollama prompt engineering for diagram generation
  - Agent B: Mermaid.js rendering implementation

- **Prompt A (Ollama Integration):**

  ```
  Create Ollama prompt templates for diagram generation.

  DIAGRAM TYPES:
  1. Flowchart (sequential processes)
  2. Mind map (concept relationships)
  3. Sequence diagram (interactions)
  4. Class diagram (structure/hierarchy)

  PROMPT TEMPLATE:
  ```

  Analyze this text and create a ${type} diagram using Mermaid.js syntax.

  Text: ${content}

  Requirements:
  - Extract key concepts and relationships
  - Use appropriate Mermaid.js diagram type
  - Keep it simple (max 10 nodes)
  - Return ONLY the Mermaid.js code (no explanation)

  Example output:
  graph TD
  A[Concept 1] --> B[Concept 2]
  B --> C[Concept 3]

  ```

  TEST PROMPTS:
  - Create prompts for each diagram type
  - Test with sample educational content
  - Validate Mermaid.js syntax correctness

  FILE: src/features/ai/diagram-generator.js (prompt templates section)
  ```

- **Prompt B (Rendering):**

  ```
  Implement Mermaid.js diagram rendering.

  FEATURES:
  1. Parse Mermaid.js code from Ollama response
  2. Render to SVG
  3. Display in modal overlay
  4. Export as PNG/SVG
  5. Zoom/pan controls

  LIBRARY:
  - Use mermaid.js (CDN or bundled)
  - Initialize on diagram display
  - Error handling for invalid syntax

  FILE: src/features/ai/diagram-generator.js (~600 lines total)
  UI: Modal overlay with diagram display

  TESTS:
  - tests/unit/ai/diagram-generator.test.js (20+ tests)
  - Test each diagram type rendering
  ```

**Sub-Task 2.1.3: Quiz Generator**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement AI quiz generator for knowledge checks.

  QUIZ TYPES:
  1. Multiple choice (4 options, 1 correct)
  2. True/False
  3. Fill-in-the-blank

  DIFFICULTY LEVELS:
  - Easy (direct recall)
  - Medium (comprehension)
  - Hard (application/analysis)

  OLLAMA PROMPT:
  ```

  Create a ${difficulty} difficulty quiz with 5 ${type} questions about this content:

  ${content}

  Return JSON array:
  [
  {
  question: string,
  options: [a, b, c, d], // for MC only
  correct: string, // index or answer
  explanation: string
  }
  ]

  ```

  FEATURES:
  1. Quiz generation via Ollama
  2. Interactive quiz UI (modal)
  3. Instant feedback (correct/incorrect)
  4. Score tracking
  5. Review mode (show explanations)

  FILES:
  - src/features/ai/quiz-generator.js (~500 lines)
  - src/ui/components/quiz-modal.js (~400 lines)

  TESTS:
  - tests/unit/ai/quiz-generator.test.js (25+ tests)
  ```

**Sub-Task 2.1.4: Orchestration & Integration**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Create the multi-modal learning path orchestrator.

  WORKFLOW:
  1. User selects text → "Create Learning Path" (highlight menu)
  2. Detect learning style (if known)
  3. Generate:
     a. Text summary (3 levels: simple, moderate, advanced)
     b. Audio script (TTS-optimized with pauses)
     c. Visual diagram (Mermaid.js)
     d. Knowledge check quiz (5 questions)
  4. Display in tabbed interface (Text | Audio | Visual | Quiz)
  5. Track completion (which components user engaged with)
  6. Update learning style confidence

  FILES:
  - src/features/ai/learning-path-generator.js (~900 lines)
  - src/ui/components/learning-path-modal.js (~500 lines)

  INTEGRATION:
  - Highlight menu → "Create Learning Path" button
  - Service worker → parallel Ollama calls (summary + diagram + quiz)
  - TTS controller → play audio script

  TESTS:
  - tests/unit/ai/learning-path-generator.test.js (30+ tests)
  - E2E test: Select text → generate path → verify all components
  ```

**Quality Gate 2.1:**

- Learning style detection classifies correctly (manual validation)
- Diagrams render for all types (flowchart, mind map, sequence)
- Quizzes generate valid questions with explanations
- Tabbed interface displays all components
- Completion tracking updates learning style

### Task 2.2: Emotional Intelligence Layer (10-12 hrs)

**Sub-Task 2.2.1: Struggle Detection**

- **Agent:** Explore + feature-dev (sequential)
- **Explore Prompt:**

  ```
  Explore existing behavior monitoring in AssisT.

  FIND:
  - Does content-simple.js track scroll events?
  - Is there any re-reading detection?
  - What pause/idle detection exists?
  - How is focus/blur tracked?

  GOAL: Understand what behavior data is already collected so we can build struggle detection on top.
  ```

- **Implementation Prompt:**

  ```
  Implement struggle detection system.

  METRICS TO MONITOR:
  1. Re-reading (same paragraph 3+ times → confusion)
  2. Scroll velocity (erratic scrolling → frustration)
  3. Pause frequency (long pauses → cognitive load)
  4. Session duration (30+ min without break → fatigue)
  5. Click patterns (rapid clicking → overwhelm)

  DETECTION ALGORITHM:
  - Track metrics in rolling 5-minute window
  - Score each metric (0-10 severity)
  - Weighted sum → overall struggle score (0-100)
  - Thresholds:
    * 0-30: Focused (green)
    * 31-60: Struggling (yellow)
    * 61-100: Overwhelmed (red)

  CLASSIFICATION:
  - Confusion: High re-reading, low scroll velocity
  - Frustration: Erratic scrolling, rapid clicking
  - Fatigue: Long session, increasing pause duration
  - Overwhelm: All metrics elevated

  FILE: src/features/ai/emotional-intelligence.js (~1,200 lines)
  INTEGRATION: src/content/content-simple.js (+100 lines for monitoring)

  TESTS:
  - tests/unit/ai/struggle-detection.test.js (30+ tests)
  - Mock behavior patterns, verify classification
  ```

**Sub-Task 2.2.2: Mood Tracking Dashboard**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement mood tracking dashboard.

  FEATURES:
  1. After-session prompt (optional): "How are you feeling?" (5-point scale)
  2. Mood history visualization (line chart)
  3. Correlation analysis (mood vs content type, time of day)
  4. Pattern detection (e.g., "Math → anxiety")

  UI:
  - Popup tab: Mood Tracker
  - Chart.js for visualization
  - Export data as CSV
  - Privacy: Local storage only, user can delete

  FILES:
  - src/features/ai/emotional-intelligence.js (MoodTracker class, +300 lines)
  - src/ui/components/mood-tracker-panel.js (~400 lines)

  TESTS:
  - tests/unit/ai/mood-tracker.test.js (20+ tests)
  ```

**Sub-Task 2.2.3: Adaptive Content Delivery**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement adaptive interventions based on emotional state.

  INTERVENTIONS:

  IF frustrated (score 61-80):
  - Offer text simplification (highlight menu)
  - Slow TTS playback (0.8x speed)
  - Suggest break (Pomodoro reminder)

  IF fatigued (score 41-60):
  - Suggest 5-minute break
  - Reduce chunk size (shorter paragraphs)
  - Enable focus mode (dim surroundings)

  IF confused (score 31-50):
  - Offer alternative explanation (Socratic Tutor)
  - Activate reading guide
  - Suggest re-reading in different modality (TTS if reading)

  IF overwhelmed (score 81-100):
  - Break assignment into smaller tasks (task decomposer)
  - Activate Pomodoro timer
  - Suggest topic change (if stuck 30+ min)

  DELIVERY:
  - Floating banner (non-intrusive)
  - Dismiss option (don't show again for 1 hour)
  - Settings toggle for interventions

  FILE: src/features/ai/intervention-suggester.js (~500 lines)
  UI: src/ui/components/intervention-banner.js (~250 lines)

  TESTS:
  - tests/unit/ai/intervention-suggester.test.js (25+ tests)
  ```

**Quality Gate 2.2:**

- Struggle detection classifies emotional states correctly
- Mood tracking dashboard displays history chart
- Interventions trigger appropriately (not too frequently)
- User can dismiss/disable interventions
- Privacy maintained (local storage only)

### Task 2.3: Dysarthria Communication Assistant (Completion) (6-8 hrs)

**Sub-Task 2.3.1: Alternative Phrasing Suggester**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement alternative phrasing suggester.

  GOAL: Help dysarthria users find easier ways to say complex words.

  FEATURES:
  1. Synonym replacement (complex word → simpler synonym)
  2. Sentence simplification (passive → active voice)
  3. Context preservation (maintain meaning)

  IMPLEMENTATION:
  - Ollama prompt for alternative phrasing
  - Show side-by-side: original vs suggested
  - User can accept, reject, or edit

  PROMPT TEMPLATE:
  ```

  Suggest an easier way to say this phrase while keeping the same meaning:

  Original: "${phrase}"

  Requirements:
  - Use simpler words
  - Shorter sentence if possible
  - Maintain meaning
  - Return JSON: { alternative: string, explanation: string }

  ```

  FILE: src/engines/stt/communication-assistant.js (+200 lines)
  UI: Alternative suggestions panel (extend existing)

  TESTS:
  - tests/unit/stt/alternative-phrasing.test.js (15+ tests)
  ```

**Sub-Task 2.3.2: Therapy Tracker & Practice Mode**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement speech therapy practice mode and progress tracking.

  PRACTICE MODE:
  1. User sets target words/phrases (via settings)
  2. Practice session: repeat target word 5 times
  3. Track confidence score for each attempt
  4. Visual feedback (progress bar)
  5. Success criteria: 3/5 attempts > 75% confidence

  PROGRESS TRACKING:
  1. Session history (date, target word, avg confidence)
  2. Clarity trend chart (line graph over time)
  3. Success rate by word/phrase
  4. Export report (PDF or CSV for therapist)

  SESSION RECORDING (opt-in, privacy):
  1. Record audio of practice sessions
  2. Encrypted storage (Web Crypto API)
  3. Playback for self-review
  4. Auto-delete after 30 days (configurable)

  FILES:
  - src/engines/stt/therapy-tracker.js (~600 lines)
  - src/ui/components/practice-dashboard.js (~500 lines)

  TESTS:
  - tests/unit/stt/therapy-tracker.test.js (30+ tests)
  ```

**Quality Gate 2.3:**

- Alternative phrasing suggests simpler options
- Practice mode tracks confidence correctly
- Progress dashboard displays trends
- Session recording works (opt-in only)
- Export report generates correctly

**Phase 2 Completion Checklist:**

- [ ] Multi-modal learning paths generate all components
- [ ] Diagrams render correctly (all types)
- [ ] Quizzes generate valid questions
- [ ] Struggle detection classifies states correctly
- [ ] Mood tracking dashboard displays history
- [ ] Adaptive interventions trigger appropriately
- [ ] Communication assistant suggests alternatives
- [ ] Practice mode tracks progress
- [ ] All unit tests pass (150+ new tests)
- [ ] Manual testing complete
- [ ] Documentation updated

---

## Phase 3: Advanced Capabilities (38-45 hours)

**Goal:** Deep Canvas integration, research tools, executive function support.

### Task 3.1: Canvas API Integration (12-15 hrs)

**Sub-Task 3.1.1: OAuth2 Authentication**

- **Agent:** Explore + feature-dev (sequential)
- **Explore Prompt:**

  ```
  Research Canvas API authentication requirements.

  FIND:
  - Canvas API documentation (OAuth2 flow)
  - Required scopes for assignments, grades, rubrics
  - Token storage best practices (Chrome extension)
  - Rate limit policies

  DELIVERABLE: Authentication flow design document
  ```

- **Implementation Prompt:**

  ```
  Implement Canvas OAuth2 authentication for Chrome extension.

  FLOW:
  1. User clicks "Connect Canvas" in settings
  2. Open Canvas authorization page (new tab)
  3. User approves access
  4. Redirect to extension with auth code
  5. Exchange code for access token
  6. Store token encrypted (Web Crypto API)

  SCOPES REQUIRED:
  - url:GET|/api/v1/courses/:id/assignments
  - url:GET|/api/v1/courses/:id/enrollments/:id/grades
  - url:GET|/api/v1/courses/:id/discussion_topics

  FILES:
  - src/integrations/canvas-api-client.js (~800 lines)
    - OAuth2 flow methods
    - Token management (secure storage)
    - API wrapper methods
    - Rate limiting (respect Canvas limits)

  SECURITY:
  - Encrypt tokens with Web Crypto API
  - Never log tokens
  - Clear tokens on logout
  - Refresh token flow

  TESTS:
  - tests/unit/integrations/canvas-api-client.test.js (25+ tests)
  - Mock OAuth flow, verify token storage
  ```

**Sub-Task 3.1.2: Assignment Analyzer**

- **Agents:** 2 agents in parallel
  - Agent A: Rubric parser
  - Agent B: AI-powered checklist generator

- **Prompt A (Rubric Parser):**

  ```
  Implement Canvas rubric parser.

  CANVAS RUBRIC FORMAT:
  {
    criteria: [
      {
        id, description, points,
        ratings: [{ description, points }]
      }
    ]
  }

  PARSER:
  1. Fetch rubric via Canvas API
  2. Extract criteria and point values
  3. Convert to checklist format
  4. Highlight high-value criteria (> 30% of total points)

  FILE: src/features/ai/assignment-analyzer.js (rubric parsing section, ~300 lines)

  TESTS:
  - tests/unit/ai/assignment-analyzer.test.js (rubric parsing tests, 15+)
  ```

- **Prompt B (AI Checklist):**

  ```
  Generate AI-powered assignment checklist from rubric.

  OLLAMA PROMPT:
  ```

  Convert this rubric into a student-friendly checklist.

  Rubric:
  ${rubricCriteria}

  Assignment Description:
  ${assignmentDescription}

  Generate:
  1. Checklist items (specific, actionable)
  2. Estimated time per item
  3. Priority ranking
  4. Tips for meeting each criterion

  Return JSON:
  {
  checklist: [
  { item: string, estimatedMinutes: number, priority: 1-3, tips: [string] }
  ]
  }

  ```

  FILE: src/features/ai/assignment-analyzer.js (AI generation section, ~400 lines)

  TESTS:
  - tests/unit/ai/assignment-analyzer.test.js (AI generation tests, 20+)
  ```

**Sub-Task 3.1.3: Grade Analytics**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement grade analytics dashboard.

  DATA:
  - Fetch grade history from Canvas API
  - Aggregate by assignment type (essay, quiz, project)
  - Calculate averages, trends

  ANALYTICS:
  1. Performance by assignment type (avg score per type)
  2. Grade trend over time (line chart)
  3. Identify weak areas (lowest scoring types)
  4. Predict final grade (current avg + remaining assignments)

  AI INSIGHTS (via Ollama):
  ```

  Analyze this student's grade history and provide actionable insights.

  Grades:
  ${gradeHistory}

  Generate:
  1. Performance patterns (e.g., "Lower on essays vs. quizzes")
  2. Improvement opportunities (specific recommendations)
  3. Final grade prediction
  4. Study strategy suggestions

  Return JSON:
  {
  patterns: [string],
  opportunities: [{ area: string, suggestion: string }],
  finalGradePrediction: { grade: string, confidence: number },
  studyStrategy: [string]
  }

  ```

  FILES:
  - src/features/ai/grade-analytics.js (~600 lines)
  - src/ui/components/grade-dashboard.js (~400 lines)

  TESTS:
  - tests/unit/ai/grade-analytics.test.js (30+ tests)
  ```

**Quality Gate 3.1:**

- OAuth2 authentication completes successfully
- Tokens stored encrypted
- Assignment rubrics parse correctly
- AI checklist generates actionable items
- Grade analytics displays trends
- Final grade prediction within 5% accuracy

### Task 3.2: Research Workflow Enhancements (14-16 hrs)

**Sub-Task 3.2.1: Multi-Document Comparison**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement multi-document comparison tool.

  USER FLOW:
  1. User selects 2-5 sources from citation library
  2. System extracts text from each source
  3. AI analyzes for themes, arguments, methodologies
  4. Generate comparison matrix (visual table)
  5. Identify contradictions and consensus

  OLLAMA PROMPT:
  ```

  Compare these ${count} sources on the topic: "${topic}"

  Sources:
  ${sources.map(s => `[${s.id}] ${s.title}\n${s.text}`).join('\n\n')}

  Analyze:
  1. Key themes across sources
  2. Arguments/claims by source
  3. Methodologies used
  4. Contradictions (where sources disagree)
  5. Consensus areas (where sources agree)

  Return JSON:
  {
  themes: [{ theme: string, sources: [id] }],
  arguments: [{ source: id, claim: string, evidence: string }],
  methodologies: [{ source: id, method: string }],
  contradictions: [{ topic: string, sources: [{ id, position }] }],
  consensus: [{ topic: string, agreement: string }]
  }

  ```

  UI:
  - Comparison matrix table (themes as rows, sources as columns)
  - Color-coded cells (green: supports, red: contradicts, yellow: neutral)
  - Expandable details on click

  FILES:
  - src/features/ai/document-comparator.js (~800 lines)
  - src/ui/components/comparison-matrix.js (~500 lines)

  TESTS:
  - tests/unit/ai/document-comparator.test.js (30+ tests)
  ```

**Sub-Task 3.2.2: Bias Detection**

- **Agents:** 2 agents in parallel
  - Agent A: Bias detection algorithm
  - Agent B: Neutral phrasing suggester

- **Prompt A (Detection):**

  ```
  Implement bias detection for research sources.

  BIAS TYPES:
  1. Political (left/center/right lean)
  2. Methodological (confirmation bias, selection bias)
  3. Funding (conflicts of interest from sponsor)
  4. Language (loaded terms, framing effects)

  OLLAMA PROMPT:
  ```

  Analyze this source for bias.

  Text: ${sourceText}
  Metadata: ${metadata}

  Detect and explain:
  1. Political bias (direction, confidence, examples)
  2. Methodological bias (types, severity)
  3. Funding bias (potential conflicts)
  4. Biased language (phrases + neutral alternatives)

  Return JSON:
  {
  political: { direction: "left"|"center"|"right", confidence: 0-1, examples: [string] },
  methodological: [{ type: string, severity: 1-10, explanation: string }],
  funding: { detected: boolean, concerns: [string] },
  language: [{ phrase: string, issue: string, neutral: string }],
  overallScore: 0-10
  }

  ```

  FILE: src/features/ai/bias-detector.js (~600 lines)

  TESTS:
  - tests/unit/ai/bias-detector.test.js (25+ tests)
  ```

- **Prompt B (Neutral Phrasing):**

  ```
  Implement neutral phrasing suggester.

  FEATURE: Highlight biased language in source text, suggest neutral alternatives.

  UI:
  - Inline highlights (yellow background)
  - Tooltip on hover shows neutral alternative
  - Click to accept suggestion (replace in local copy)

  FILE: src/features/ai/bias-detector.js (neutral phrasing section, +200 lines)
  UI: src/ui/components/bias-highlight-overlay.js (~300 lines)

  TESTS:
  - tests/unit/ai/neutral-phrasing.test.js (15+ tests)
  ```

**Sub-Task 3.2.3: Citation Network Analysis**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement citation network analyzer.

  FEATURES:
  1. Parse references from saved citations (extract DOIs, titles)
  2. Build citation graph (nodes = papers, edges = citations)
  3. Identify seminal works (high in-degree)
  4. Find related papers (neighbor traversal)
  5. Visualize network (D3.js force-directed graph)

  DATA:
  - Extract references from citation metadata (existing)
  - Optional: Fetch citation data from CrossRef API (if DOI available)

  GRAPH ALGORITHMS:
  - PageRank for importance ranking
  - Community detection for topic clustering
  - Shortest path for connection discovery

  FILES:
  - src/features/research/citation-network.js (~700 lines)
  - src/ui/components/citation-graph-viewer.js (~500 lines)

  TESTS:
  - tests/unit/research/citation-network.test.js (30+ tests)
  ```

**Sub-Task 3.2.4: Literature Review Generator**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement AI-powered literature review generator.

  USER FLOW:
  1. User selects sources from citation library
  2. System generates structured outline
  3. AI writes narrative connecting sources
  4. User edits and exports

  OLLAMA PROMPT (Outline):
  ```

  Create a literature review outline for these sources.

  Topic: ${topic}
  Sources:
  ${sources.map(s => `- ${s.title} (${s.year}): ${s.abstract}`).join('\n')}

  Generate:
  1. Thematic outline (3-5 main themes)
  2. Source grouping by theme
  3. Research gaps identified
  4. Suggested narrative flow

  Return JSON:
  {
  themes: [{ title: string, sources: [id], description: string }],
  gaps: [string],
  narrativeFlow: [string]
  }

  ```

  OLLAMA PROMPT (Narrative):
  ```

  Write a literature review section for this theme.

  Theme: ${theme.title}
  Sources: ${theme.sources.map(s => s.summary).join('\n\n')}

  Requirements:
  - Academic writing style
  - Cite sources (APA format)
  - Synthesize findings (don't just list)
  - Identify patterns and gaps
  - 300-500 words

  Return: { narrative: string, citations: [string] }

  ```

  FILES:
  - src/features/ai/literature-review-generator.js (~900 lines)
  - src/ui/components/lit-review-editor.js (~600 lines)

  TESTS:
  - tests/unit/ai/literature-review-generator.test.js (35+ tests)
  ```

**Quality Gate 3.2:**

- Multi-document comparison generates accurate matrix
- Bias detection identifies known biases (validate with test sources)
- Citation network graph renders correctly
- Literature review outline logically organized
- Narrative generation produces academic-quality text

### Task 3.3: Executive Function Support (12-14 hrs)

**Sub-Task 3.3.1: AI Task Decomposition**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement AI task decomposition for complex assignments.

  USER FLOW:
  1. User provides assignment description (or Canvas API fetches)
  2. AI breaks into subtasks (5-10 tasks)
  3. Estimate time per task (learn user's completion speed)
  4. Detect dependencies (task B requires task A)
  5. Generate study schedule

  OLLAMA PROMPT:
  ```

  Break down this assignment into actionable subtasks.

  Assignment: ${assignmentText}
  Due Date: ${dueDate}
  Point Value: ${points}

  Generate:
  1. List of 5-10 subtasks (each < 2 hours)
  2. Time estimate for each (in minutes)
  3. Priority ranking (1-10)
  4. Dependencies (which tasks first)
  5. Critical path (longest dependency chain)

  Return JSON:
  {
  subtasks: [
  { id, title, description, estimatedMinutes, priority, dependencies: [id] }
  ],
  totalHours: number,
  criticalPath: [id]
  }

  ```

  TIME ESTIMATION:
  - Learn user's speed from completed assignments
  - Adjust estimates based on assignment type
  - Factor in procrastination buffer (+20% time)

  FILES:
  - src/features/ai/task-decomposer.js (~800 lines)
  - src/ui/components/task-checklist.js (~400 lines)

  TESTS:
  - tests/unit/ai/task-decomposer.test.js (35+ tests)
  ```

**Sub-Task 3.3.2: Procrastination Detection**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement procrastination detection and intervention.

  DETECTION METRICS:
  1. Time spent on low-priority tasks (avoidance)
  2. Delay patterns (always start essays last minute)
  3. Deadline proximity (< 24 hours, not started)
  4. Task switching frequency (can't focus)

  INTERVENTION STRATEGIES:
  - Gentle reminder (1 day before deadline)
  - Accountability prompt ("You planned to start today")
  - Break task into smaller chunks
  - Gamification (streak tracking for on-time starts)

  GAMIFICATION:
  - Track on-time task starts (green checkmarks)
  - Streak counter (consecutive on-time starts)
  - Badges (5-day streak, 10-day streak)
  - No punishment, only positive reinforcement

  FILES:
  - src/features/executive/procrastination-detector.js (~600 lines)
  - src/ui/components/accountability-prompt.js (~300 lines)

  TESTS:
  - tests/unit/executive/procrastination-detector.test.js (30+ tests)
  ```

**Sub-Task 3.3.3: Working Memory Assistant**

- **Agents:** 3 agents in parallel
  - Agent A: Breadcrumb tracker
  - Agent B: Context linker
  - Agent C: Quick reference panel

- **Prompt A (Breadcrumbs):**

  ```
  Implement navigation breadcrumb tracker.

  FEATURE: Persistent trail of visited pages in current session.

  UI:
  - Floating sidebar (collapsible)
  - List of visited pages (title, timestamp)
  - Click to navigate back
  - Max 20 pages (LRU eviction)

  STORAGE:
  - sessionStorage (clears on tab close)
  - Sync across page navigations

  FILE: src/features/executive/working-memory-assistant.js (BreadcrumbTracker, ~250 lines)
  UI: src/ui/components/breadcrumb-sidebar.js (~200 lines)

  TESTS:
  - tests/unit/executive/breadcrumb-tracker.test.js (15+ tests)
  ```

- **Prompt B (Context Linker):**

  ```
  Implement auto-linking of related notes/citations.

  FEATURE: When viewing assignment page, show related notes/citations in sidebar.

  MATCHING ALGORITHM:
  - Extract keywords from current page
  - Search notes/citations for keyword matches
  - Rank by relevance (TF-IDF)
  - Show top 5 matches

  UI:
  - Sidebar section: "Related Notes"
  - Click to view note/citation
  - Create new note with context pre-filled

  FILE: src/features/executive/working-memory-assistant.js (ContextLinker, ~250 lines)

  TESTS:
  - tests/unit/executive/context-linker.test.js (20+ tests)
  ```

- **Prompt C (Quick Reference):**

  ```
  Implement quick reference panel for key info.

  FEATURE: Collapsible panel with important formulas, definitions, dates.

  SOURCES:
  - User-pinned notes
  - Extracted key terms from current page
  - Frequently referenced citations

  UI:
  - Floating panel (bottom-right)
  - Pin/unpin items
  - Search functionality

  FILE: src/features/executive/working-memory-assistant.js (QuickReferencePanel, ~200 lines)
  UI: src/ui/components/quick-reference-panel.js (~250 lines)

  TESTS:
  - tests/unit/executive/quick-reference-panel.test.js (15+ tests)
  ```

**Quality Gate 3.3:**

- Task decomposition breaks complex assignments into logical subtasks
- Time estimates within 20% accuracy (after learning period)
- Procrastination detection triggers appropriately
- Breadcrumb tracker persists across navigations
- Context linker finds relevant notes/citations
- Quick reference panel displays pinned items

**Phase 3 Completion Checklist:**

- [ ] Canvas OAuth2 authentication works
- [ ] Assignment analyzer generates checklists
- [ ] Grade analytics displays trends and predictions
- [ ] Multi-document comparison produces accurate matrix
- [ ] Bias detection identifies bias types
- [ ] Citation network graph renders
- [ ] Literature review generator creates outlines and narratives
- [ ] Task decomposer breaks assignments into subtasks
- [ ] Procrastination detection triggers interventions
- [ ] Working memory assistant displays breadcrumbs and linked notes
- [ ] All unit tests pass (200+ new tests)
- [ ] Integration tests pass (Canvas API, Ollama)
- [ ] Manual testing complete
- [ ] Documentation updated

---

## Phase 4: Production Polish (20-25 hours)

**Goal:** Performance optimization, accessibility, monitoring, therapy tracker completion.

### Task 4.1: Performance Optimization (5-6 hrs)

**Sub-Task 4.1.1: Response Streaming**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement response streaming for Ollama API calls.

  GOAL: Display AI responses incrementally as they're generated (better perceived performance).

  OLLAMA STREAMING API:
  - Endpoint: /api/generate (with stream: true)
  - Response: Server-Sent Events (SSE)
  - Each event contains partial response

  IMPLEMENTATION:
  1. Modify service-worker.js to support streaming
  2. Send partial responses to content script
  3. Update UI incrementally (append text as it arrives)
  4. Handle stream errors (connection loss, timeout)

  UI UPDATE:
  - Show "thinking..." animation while waiting for first token
  - Append text in real-time (typewriter effect)
  - Allow user to stop generation (cancel button)

  FILES:
  - src/background/service-worker.js (+150 lines)
  - src/ui/components/streaming-response.js (+200 lines)

  TESTS:
  - tests/unit/background/streaming.test.js (20+ tests)
  - Mock SSE stream, verify incremental updates
  ```

**Sub-Task 4.1.2: Batch Processing**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement request batching for Ollama API.

  GOAL: Queue multiple AI requests, process in parallel (up to 3 concurrent).

  QUEUE DESIGN:
  - FIFO queue (first in, first out)
  - Max 3 concurrent requests (prevent Ollama overload)
  - Priority levels (high, normal, low)
  - Timeout per request (30s default)

  FEATURES:
  1. Add request to queue
  2. Auto-dequeue when slot available
  3. Progress indicator (X/Y requests processing)
  4. Cancel queued requests

  FILES:
  - src/utils/batch-processor.js (~180 lines)
  - Integration with service-worker.js (+50 lines)

  TESTS:
  - tests/unit/utils/batch-processor.test.js (25+ tests)
  ```

**Sub-Task 4.1.3: Predictive Model Preloading**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement predictive model preloading based on page type.

  GOAL: Preload appropriate Ollama model before user asks (faster first response).

  PAGE TYPE DETECTION:
  - Assignment page → task decomposer model
  - Article page → summarization model
  - Quiz page → quiz generation model
  - Research page → literature review model

  PRELOADING:
  - Detect page type (URL patterns, DOM analysis)
  - Send preload request to Ollama (warm up model)
  - Cache preloaded model in memory (5 min TTL)
  - Use preloaded model for first request

  FILES:
  - src/utils/model-preloader.js (~200 lines)
  - Integration with content-simple.js (+50 lines)

  TESTS:
  - tests/unit/utils/model-preloader.test.js (15+ tests)
  ```

**Quality Gate 4.1:**

- Response streaming displays incremental text (< 100ms latency)
- Batch processor handles 3 concurrent requests
- Queue priority works correctly
- Model preloading reduces first response time by 30%+

### Task 4.2: Accessibility Enhancements (4-5 hrs)

**Sub-Task 4.2.1: High-Contrast Mode**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement high-contrast mode for all AI UI components.

  WCAG AAA REQUIREMENTS:
  - Contrast ratio ≥ 7:1 for normal text
  - Contrast ratio ≥ 4.5:1 for large text
  - Apply to all AI modals, panels, banners

  COLOR PALETTE:
  - Background: #000000 (black)
  - Text: #FFFFFF (white)
  - Primary: #FFFF00 (yellow)
  - Secondary: #00FFFF (cyan)
  - Error: #FF0000 (red)
  - Success: #00FF00 (green)

  IMPLEMENTATION:
  - Create src/ui/styles/high-contrast.css (~150 lines)
  - Settings toggle in popup.html
  - Apply via body class: .high-contrast-mode
  - Persist preference in localStorage

  TESTS:
  - Manual: Verify all UI components have 7:1+ contrast
  - Automated: axe-core contrast audit
  ```

**Sub-Task 4.2.2: Screen Reader Optimization**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Optimize all AI UI components for screen readers.

  ARIA ATTRIBUTES:
  - ARIA live regions for streaming responses
  - ARIA roles for modals (role="dialog")
  - ARIA labels for all interactive elements
  - ARIA-describedby for additional context

  FOCUS MANAGEMENT:
  - Trap focus in modals (Tab cycles within modal)
  - Return focus to trigger element on close
  - Skip links for long content

  ANNOUNCEMENTS:
  - Announce AI response completion ("Response ready")
  - Announce errors ("Error generating response")
  - Announce loading states ("Generating response...")

  FILES TO UPDATE:
  - All modal components (+50 lines each)
  - All banner components (+30 lines each)
  - All panel components (+40 lines each)

  TESTS:
  - Manual: Test with NVDA/JAWS
  - Automated: axe-core accessibility audit
  ```

**Sub-Task 4.2.3: Visual Indicators for Audio**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Add visual indicators for audio events (hearing-impaired support).

  TTS PLAYBACK:
  - Pulsing border around currently speaking text
  - Progress bar showing playback position
  - Visual "speaking" animation (sound wave icon)

  STT LISTENING:
  - Pulsing microphone icon (already exists)
  - Visual waveform during speech (optional)
  - Transcript appears in real-time (already exists)

  AI PROCESSING:
  - Animated "thinking" indicator (dots animation)
  - Progress bar for long-running tasks

  FILES TO UPDATE:
  - TTS UI components (+50 lines)
  - STT UI components (+30 lines)
  - AI response components (+40 lines)

  CSS:
  - src/ui/styles/visual-indicators.css (+100 lines)
  ```

**Quality Gate 4.2:**

- High-contrast mode passes WCAG AAA audit (axe-core)
- Screen reader announces all state changes
- Focus management works correctly in modals
- Visual indicators clearly show audio events

### Task 4.3: Monitoring & Analytics (5-6 hrs)

**Sub-Task 4.3.1: Metrics Collector**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement local-only metrics collection.

  METRICS TO TRACK:

  Performance:
  - Response time per feature (p50, p95, p99)
  - Cache hit rate
  - Error rate by feature
  - Model fallback activation rate

  Usage:
  - Feature usage frequency
  - User satisfaction (thumbs up/down)
  - Session duration
  - Active users (by day/week/month)

  Quality:
  - AI response quality (user ratings)
  - Error types and frequency
  - Retry/fallback success rates

  STORAGE:
  - IndexedDB (local-only)
  - No PII, no content, no queries
  - Aggregate metrics only
  - User can view/delete data

  FILES:
  - src/utils/metrics-collector.js (~300 lines)
  - Integration across all AI features (+10 lines each)

  TESTS:
  - tests/unit/utils/metrics-collector.test.js (30+ tests)
  ```

**Sub-Task 4.3.2: Performance Dashboard**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Create performance dashboard in settings panel.

  SECTIONS:

  1. Response Time (Chart.js line chart)
     - Last 7 days
     - By feature
     - P50/P95/P99 percentiles

  2. Error Rate (pie chart)
     - By error type
     - Total error count
     - Error rate trend

  3. Cache Performance (bar chart)
     - Hit rate %
     - Total queries
     - Cache size

  4. Feature Usage (horizontal bar chart)
     - Usage count per feature
     - Most/least used features

  5. Quality Metrics (table)
     - Average satisfaction rating
     - Thumbs up/down counts
     - Response quality distribution

  FILES:
  - src/ui/components/performance-dashboard.js (~400 lines)
  - src/ui/styles/performance-dashboard.css (~100 lines)

  TESTS:
  - tests/unit/ui/performance-dashboard.test.js (20+ tests)
  ```

**Sub-Task 4.3.3: Anonymous Telemetry (Opt-In)**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement anonymous telemetry (opt-in only).

  DATA COLLECTED (if user opts in):
  - Aggregate metrics only (no PII, no content)
  - Response time percentiles
  - Error types and frequencies
  - Feature usage counts
  - Browser/OS version (for compatibility)

  TRANSMISSION:
  - HTTPS POST to telemetry endpoint
  - Once per day (batched)
  - Encrypted payload
  - User can disable anytime

  CONSENT:
  - Clear opt-in dialog (no dark patterns)
  - Explain what's collected and why
  - Link to privacy policy
  - Easy opt-out in settings

  FILES:
  - src/utils/telemetry.js (~200 lines)
  - UI: Opt-in dialog in popup.html (+80 lines)

  TESTS:
  - tests/unit/utils/telemetry.test.js (15+ tests)
  - Verify no PII in payload
  ```

**Quality Gate 4.3:**

- Metrics collector tracks all required metrics
- Performance dashboard displays charts correctly
- Telemetry opt-in dialog is clear and honest
- User can view/delete all collected data
- No PII in telemetry payload (verify manually)

### Task 4.4: Dysarthria Therapy Tracker (Completion) (6-8 hrs)

This was started in Phase 1/2, now complete remaining features.

**Sub-Task 4.4.1: Session Recording (Opt-In)**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement session recording for speech therapy practice.

  PRIVACY-FIRST DESIGN:
  - Opt-in only (explicit consent)
  - Encrypted storage (Web Crypto API)
  - Local-only (never uploaded)
  - Auto-delete after 30 days (configurable)
  - User can delete anytime

  RECORDING:
  1. Start recording on "Begin Practice" button
  2. Record audio via MediaRecorder API
  3. Encrypt recording (AES-256)
  4. Store in IndexedDB
  5. Stop recording on "End Practice"

  PLAYBACK:
  1. Decrypt recording
  2. Play via Audio element
  3. Show transcript alongside audio
  4. Allow download (encrypted file)

  FILES:
  - src/engines/stt/therapy-tracker.js (recording section, +200 lines)
  - src/ui/components/practice-dashboard.js (playback UI, +150 lines)

  SECURITY:
  - Generate encryption key (Web Crypto API)
  - Store key in secure storage (chrome.storage.local)
  - Never log decrypted audio

  TESTS:
  - tests/unit/stt/session-recording.test.js (25+ tests)
  - Verify encryption/decryption works
  ```

**Sub-Task 4.4.2: Progress Export (PDF/CSV)**

- **Agent:** feature-dev:code-architect
- **Prompt:**

  ```
  Implement progress report export for therapists.

  EXPORT FORMATS:

  1. CSV (spreadsheet-friendly)
     - Columns: Date, Target Word, Attempts, Avg Confidence, Success Rate
     - One row per practice session

  2. PDF (professional report)
     - Header: Patient name (optional), date range
     - Charts: Clarity trend (line graph), success rate by word (bar chart)
     - Table: Session summary
     - Footer: Generated by AssisT

  IMPLEMENTATION:
  - CSV: Use papaparse library (or manual CSV generation)
  - PDF: Use jsPDF + jsPDF-AutoTable
  - Charts in PDF: Use Chart.js → canvas → image → PDF

  FILES:
  - src/engines/stt/therapy-tracker.js (export methods, +150 lines)
  - src/ui/components/practice-dashboard.js (export buttons, +50 lines)

  TESTS:
  - tests/unit/stt/progress-export.test.js (20+ tests)
  - Verify CSV format correctness
  - Verify PDF generates correctly
  ```

**Quality Gate 4.4:**

- Session recording works (opt-in only)
- Encryption/decryption secure (verify with audit)
- Auto-delete after 30 days works
- CSV export contains correct data
- PDF report generates with charts and tables
- User can delete recordings anytime

**Phase 4 Completion Checklist:**

- [ ] Response streaming displays incremental text
- [ ] Batch processor handles concurrent requests
- [ ] Model preloading reduces first response time
- [ ] High-contrast mode passes WCAG AAA audit
- [ ] Screen reader optimization tested with NVDA/JAWS
- [ ] Visual indicators show audio events clearly
- [ ] Metrics collector tracks all metrics
- [ ] Performance dashboard displays charts
- [ ] Telemetry opt-in dialog is clear
- [ ] Session recording works (encrypted)
- [ ] Progress export generates CSV and PDF
- [ ] All unit tests pass (100+ new tests)
- [ ] Accessibility audit passes (axe-core)
- [ ] Manual testing complete
- [ ] Documentation updated

---

## Testing & Quality Assurance

### Unit Testing Strategy

**Test Coverage Goal:** 80%+ for all new code

**Testing Framework:** Jest (already in use)

**Test Categories:**

1. **AI Feature Tests** (~200 tests)
   - Mock Ollama responses
   - Verify prompt templates
   - Test response parsing
   - Validate error handling

2. **STT Feature Tests** (~150 tests)
   - Mock Web Speech API
   - Test phrase learning
   - Verify communication assistant
   - Validate therapy tracker

3. **Utility Tests** (~100 tests)
   - Cache hit/miss logic
   - Retry/fallback behavior
   - Batch processing queue
   - Metrics collection

4. **UI Component Tests** (~100 tests)
   - Component rendering
   - User interactions
   - Accessibility attributes
   - Keyboard navigation

**Total New Tests:** 550+

### Integration Testing

**Canvas API Integration:**

- Test OAuth2 flow (mock Canvas responses)
- Verify API client methods
- Test rate limiting
- Validate token refresh

**Ollama Integration:**

- Test streaming responses
- Verify model fallback
- Test batch processing
- Validate caching

### E2E Testing (Optional)

**Critical User Flows:**

1. Dysarthria profile → practice mode → progress tracking
2. Multi-modal learning path generation (text selection → full path)
3. Canvas assignment → AI checklist → task decomposition
4. Research workflow → multi-doc comparison → lit review generation

**Framework:** Playwright (or Puppeteer)

### Accessibility Testing

**Automated:**

- axe-core audit (WCAG 2.2 AA/AAA)
- Lighthouse accessibility score (target: 100)

**Manual:**

- NVDA screen reader testing
- JAWS screen reader testing
- Keyboard-only navigation
- High-contrast mode visual inspection

### Performance Testing

**Benchmarks:**

- AI response time < 2s (p95)
- Cache hit rate > 60%
- Error rate < 2%
- UI render time < 100ms

**Load Testing:**

- Concurrent requests (3+ simultaneous)
- Large document processing (10k+ words)
- High query volume (100+ queries/session)

---

## Deployment Checklist

### Pre-Release Validation

**Code Quality:**

- [ ] All unit tests pass (550+ tests)
- [ ] Integration tests pass
- [ ] E2E tests pass (if implemented)
- [ ] ESLint/Prettier compliant
- [ ] No console errors/warnings

**Accessibility:**

- [ ] axe-core audit passes (WCAG 2.2 AA minimum)
- [ ] Screen reader testing complete (NVDA + JAWS)
- [ ] Keyboard navigation works for all features
- [ ] High-contrast mode tested

**Performance:**

- [ ] AI response time < 2s (p95)
- [ ] Cache hit rate > 60%
- [ ] Error rate < 2%
- [ ] No memory leaks (DevTools profiling)

**Security:**

- [ ] OAuth tokens encrypted
- [ ] Session recordings encrypted
- [ ] No PII in telemetry
- [ ] Privacy policy updated

**Documentation:**

- [ ] README.md updated
- [ ] PHASE2_TASKS.md updated
- [ ] User guides created (dysarthria, AI features, Canvas integration)
- [ ] Developer docs updated (architecture, API)

### Release Process

**Version:** v0.2.0 (major feature release)

**Release Notes:**

```markdown
# AssisT v0.2.0 - AI-Powered Learning Companion

## New Features

### Dysarthria STT Profile

- Comprehensive speech support (recognition + communication + therapy)
- Phrase learning system (auto-correct repeated errors)
- Communication assistant (word prediction, phrase templates)
- Speech therapy practice mode with progress tracking

### Advanced AI Features (20+ features)

- Multi-modal learning paths (text + audio + visual + quiz)
- Emotional intelligence (struggle detection, mood tracking)
- Canvas API integration (assignment analysis, grade analytics)
- Research workflow tools (multi-doc comparison, bias detection)
- Executive function support (task decomposition, procrastination detection)

### Production Enhancements

- Error resilience (retry logic, model fallback chains)
- Performance optimization (caching, streaming, batch processing)
- Accessibility improvements (high-contrast mode, screen reader optimization)
- Privacy-respecting analytics (local-only metrics)

## Breaking Changes

- None (fully backward compatible)

## Bug Fixes

- [List any bugs fixed during development]

## Known Issues

- [List any known limitations or issues]
```

**Deployment Steps:**

1. Update version in manifest.json (0.2.0)
2. Build extension (`npm run build`)
3. Test in Chrome (manual smoke test)
4. Create GitHub release tag (v0.2.0)
5. Submit to Chrome Web Store (if public release)
6. Update documentation website

---

## Success Metrics (Post-Launch)

### Technical Metrics (Week 1)

**Performance:**

- AI response time: Target < 2s (p95), Actual: \_\_\_
- Cache hit rate: Target > 60%, Actual: \_\_\_
- Error rate: Target < 2%, Actual: \_\_\_

**Reliability:**

- Ollama connection success: Target > 99%, Actual: \_\_\_
- Model fallback rate: Target < 5%, Actual: \_\_\_

**Usage:**

- Dysarthria profile adoption: Target 10% of STT users, Actual: \_\_\_
- AI feature usage: Target 30% of active users, Actual: \_\_\_

### User Experience Metrics (Month 1)

**Engagement:**

- Multi-modal learning path completions: Target 50+, Actual: \_\_\_
- Canvas integration usage: Target 40% of Canvas users, Actual: \_\_\_
- Research tools usage: Target 20% of users, Actual: \_\_\_

**Satisfaction:**

- User satisfaction rating: Target 4.5/5, Actual: \_\_\_
- Feature request volume: Actual: \_\_\_
- Bug report rate: Target < 1%, Actual: \_\_\_

### Educational Impact (Month 3)

**Learning Effectiveness:**

- Self-reported comprehension improvement: Target 70%+, Actual: \_\_\_
- Assignment completion rate improvement: Actual: \_\_\_
- Citation quality improvement: Actual: \_\_\_

**Neurodivergent Support:**

- ADHD user engagement with executive function tools: Target 60%+, Actual: \_\_\_
- Dysarthria user communication success rate: Target 80%+, Actual: \_\_\_
- Reported stress reduction: Target 50%+, Actual: \_\_\_

---

## Appendix: Sub-Agent Prompt Templates

### Template: Code Exploration

```
Explore [feature/component/system] in the AssisT codebase.

FIND:
- How does [X] currently work?
- What files are involved?
- What patterns/architecture is used?
- Are there existing integrations we can build on?

DELIVERABLE:
- File paths with line numbers
- Architecture overview
- Integration points identified
- Recommendations for new feature implementation
```

### Template: Feature Implementation

```
Implement [feature name] as described below.

CONTEXT:
- Existing architecture: [summary]
- Integration points: [list]
- Dependencies: [list]

REQUIREMENTS:
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

DELIVERABLES:
1. File: [path] (~X lines)
   - [Class/function name]
   - [Key methods]
2. Tests: [test file path] (X+ tests)
3. Integration: [how it connects to existing code]

CONSTRAINTS:
- Privacy-first (local processing only)
- WCAG 2.2 AA compliant
- Follow existing code style
```

### Template: Quality Review

```
Review the implementation of [feature name].

CHECK:
1. Code Quality
   - Follows project conventions?
   - Error handling comprehensive?
   - Edge cases covered?

2. Testing
   - Unit tests sufficient? (80%+ coverage)
   - Integration tests needed?
   - Manual testing scenarios?

3. Accessibility
   - WCAG 2.2 AA compliant?
   - Keyboard navigation works?
   - Screen reader compatible?

4. Performance
   - No performance regressions?
   - Efficient algorithms?
   - Memory leaks?

DELIVERABLE:
- List of issues found (severity: critical/high/medium/low)
- Recommendations for fixes
- Test coverage gaps
```

---

**End of New Features Development Plan**

This plan is ready for execution. Begin with Phase 1 for quick wins, then proceed through phases 2-4 for comprehensive feature expansion. Use sub-agent orchestration as outlined for parallel development and efficient delivery.
