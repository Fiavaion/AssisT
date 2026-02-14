# Voice Assistant Implementation Plan

**Status:** Research Complete | Ready for Implementation
**Privacy Model:** 100% Local Processing (True Local Alexa Alternative)
**Estimated Effort:** 10-12 days (MVP in 2-3 days)

---

## Executive Summary

This document provides a complete implementation blueprint for adding a privacy-first, local voice assistant to the AssisT Chrome extension. Users will be able to activate the assistant via keyboard shortcut (Ctrl+Shift+A), speak commands or questions, and receive AI-powered spoken responses - **all processing happens locally via Ollama with zero data leaving the device**.

### Core Capabilities

- **Voice-controlled TTS:** "read this", "pause", "faster", "slower"
- **AI-powered Q&A:** "What is this assignment about?", "When is this due?"
- **Writing assistance:** "help me write a response", "improve this sentence", "check grammar"
- **Navigation commands:** "go to assignments", "show my grades"
- **Multi-turn conversations:** Context-aware follow-up questions
- **Configurable latency:** Real-time (<1s), Conversational (1-3s), Background (3-10s)

---

## Browser & Extension Functionality Analysis

### What's Possible with Chrome Extensions + Web APIs

#### ✅ CONFIRMED CAPABILITIES

**1. Speech Recognition (STT)**

- Web Speech API (`webkitSpeechRecognition`) - already integrated in `src/engines/stt/stt-controller.js`
- Continuous listening mode with interim results
- No special permission required beyond microphone access (user grants via browser UI)
- Works offline after initial load
- Browser handles all speech-to-text processing locally

**2. Speech Synthesis (TTS)**

- Web Speech API (`window.speechSynthesis`) - already integrated in `src/engines/tts/tts-controller.js`
- Word-by-word highlighting via `onboundary` events
- Multiple voice selection with language filtering
- Rate, pitch, volume control
- Fully offline, browser-native

**3. Local AI Processing**

- Ollama client (`src/ai/ollama-client.js`) connects to localhost:11434
- Model routing in service-worker.js handles task-based optimization
- Multiple models supported: phi3:mini, llama3.2, mistral, gemma3, qwen2.5
- Vision support via llava model
- All inference happens on local machine
- No external API calls

**4. Content Script Injection**

- Auto-inject on LMS sites (Canvas, Moodle, Google Classroom) via manifest
- On-demand injection for all sites when user grants `<all_urls>` permission
- Voice assistant works on any webpage (bundled with existing permission flow)

**5. Keyboard Shortcuts**

- Chrome commands API allows global shortcuts
- Can register Ctrl+Shift+A for voice assistant activation
- Works regardless of which tab is active
- Configurable by user

**6. Context Extraction**

- Content scripts can read DOM (title, headings, visible text, selected text)
- Canvas-specific metadata extraction (assignment names, due dates, course info, points)
- LMS API integration possible for deeper data access
- Smart extraction with token budget management

#### ❌ LIMITATIONS

**1. Wake Word Detection**

- Browser-based wake word (like "Hey AssisT") is POSSIBLE but with caveats:
  - Requires continuous microphone access (privacy concern)
  - Battery drain on laptops
  - Libraries like Porcupine.js exist but add significant complexity
- **Recommendation:** Defer to Phase 4+, start with push-to-talk (keyboard shortcut)

**2. Background Processing**

- Service workers have execution time limits (5 minutes)
- Long-running Ollama tasks (>10s) need careful timeout handling
- Cannot process audio in service worker (must use content script)

**3. Cross-Origin Restrictions**

- Cannot access iframe content from different domains (browser security)
- Some Canvas pages use iframes - context extraction may be limited
- Can work around by using Canvas API for structured data

**4. User Gesture Requirement**

- Web Speech API requires initial user gesture to start
- Cannot auto-activate voice assistant on page load
- Keyboard shortcut counts as user gesture

---

### Local Alexa Comparison - Privacy Guarantee

**YES - This is achievable as a true local Alexa alternative!**

| Feature                            | Amazon Alexa                    | AssisT Voice Assistant                                 |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------ |
| **Wake Word**                      | "Alexa" (cloud-based detection) | "Ctrl+Shift+A" (Phase 1), optional wake word (Phase 4) |
| **Speech Recognition**             | Cloud (Amazon servers)          | **Local** (Web Speech API - browser)                   |
| **Natural Language Understanding** | Cloud (Amazon AI)               | **Local** (Ollama on localhost:11434)                  |
| **Response Generation**            | Cloud (Amazon AI)               | **Local** (Ollama models: llama3.2, mistral, etc.)     |
| **Speech Synthesis**               | Cloud/On-device hybrid          | **Local** (Web Speech API - browser voices)            |
| **Data Privacy**                   | Sent to Amazon servers          | **NEVER leaves device**                                |
| **Internet Required**              | Yes (for AI processing)         | **No** (after models downloaded)                       |
| **Latency**                        | 500ms - 2s                      | Configurable: 1s (real-time) to 10s (deep reasoning)   |
| **Offline Capable**                | No                              | **Yes** (fully functional offline)                     |

#### Privacy Technical Implementation

**Data Flow (100% Local):**

```
Microphone
  ↓ (audio stream)
Web Speech API (browser-local STT)
  ↓ (text transcript)
Extension Content Script
  ↓ (command/question)
Extension Service Worker
  ↓ (HTTP request to 127.0.0.1:11434)
Ollama (local AI server)
  ↓ (AI response)
Extension Service Worker
  ↓ (response text)
Extension Content Script
  ↓ (text to speak)
Web Speech API (browser-local TTS)
  ↓ (audio playback)
Speakers
```

**Privacy Verification Methods:**

- User can disconnect WiFi/Ethernet after model download - assistant still works
- Browser DevTools Network tab shows NO external API calls
- Ollama server logs confirm all requests originate from 127.0.0.1
- Wireshark packet capture shows zero traffic to external IPs during operation

**FERPA Compliance:**

- No student data transmitted to third parties
- No cloud storage of conversations
- No analytics or telemetry
- All processing contained within user's device

---

## Architecture

### Component Structure

```
src/features/voiceAssistant/
├── voice-assistant-controller.js    # Main orchestrator (NEW)
│   ├── Activation/deactivation logic
│   ├── STT/TTS integration
│   ├── Error handling & recovery
│   └── Settings management
│
├── command-classifier.js             # Simple vs AI command routing (NEW)
│   ├── Keyword-based pattern matching
│   ├── Question detection heuristics
│   └── Confidence scoring
│
├── context-extractor.js              # Page context for Ollama (NEW)
│   ├── Minimal mode (100 chars)
│   ├── Balanced mode (500 chars)
│   ├── Full mode (2000 chars)
│   └── LMS-specific metadata
│
├── intent-router.js                  # Route to feature handlers (NEW)
│   └── Dispatches classified commands to appropriate handlers
│
├── conversation-manager.js           # Multi-turn state (NEW)
│   ├── Conversation history (last 3 interactions)
│   ├── Context retention
│   └── Topic change detection
│
├── latency-manager.js                # Model selection per mode (NEW)
│   ├── Real-time: phi3:mini
│   ├── Conversational: llama3.2
│   └── Background: mistral/qwen2.5
│
├── ui/
│   ├── listening-indicator.js        # Pulsing mic visual feedback (NEW)
│   │   ├── Listening state (pulsing)
│   │   ├── Processing state (spinner)
│   │   └── Speaking state (waveform)
│   │
│   ├── transcript-display.js         # Accessibility: shows transcript (NEW)
│   │   ├── User input display
│   │   ├── Assistant response display
│   │   └── Auto-scroll, copy functionality
│   │
│   └── assistant-panel.js            # Optional floating button (NEW)
│       └── Alternative activation UI
│
└── handlers/
    ├── tts-command-handler.js        # "read this", "pause" (NEW)
    │   └── Controls existing TTS engine
    │
    ├── navigation-handler.js         # "go to assignments" (NEW)
    │   └── Canvas/LMS navigation
    │
    ├── qa-handler.js                 # Q&A via Ollama (NEW)
    │   ├── Prompt building
    │   ├── Ollama communication
    │   └── Response parsing
    │
    └── writing-handler.js            # "help me write" (NEW)
        ├── Text generation
        ├── Grammar checking
        └── Text insertion into DOM
```

### Integration Points with Existing Systems

**Reuse Existing Components:**

- `src/engines/stt/stt-controller.js` - Voice input (Web Speech API wrapper)
- `src/engines/tts/tts-controller.js` - Voice output (Web Speech API wrapper)
- `src/ai/ollama-client.js` - AI processing client
- `src/background/service-worker.js` - Add message handlers for voice assistant
- `src/utils/event-handlers.js` - Use `attachInteractiveHandler()` for all UI elements
- `src/utils/keyboard-shortcuts.js` - Register Ctrl+Shift+A activation shortcut

**New Message Types for Service Worker:**

```javascript
// Voice Assistant Processing
{
  action: 'VOICE_ASSISTANT_PROCESS',
  transcript: "What is this assignment about?",
  pageContext: { url, title, visibleText, metadata },
  latencyMode: 'conversational' // 'realtime' | 'conversational' | 'background'
}

// Voice Assistant Health Check
{
  action: 'VOICE_ASSISTANT_CHECK',
  // Returns: { available, models, recommendedModel }
}

// Voice Assistant Model Install
{
  action: 'VOICE_ASSISTANT_INSTALL_MODEL',
  modelName: 'llama3.2',
  latencyMode: 'conversational'
}
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ USER ACTION: Press Ctrl+Shift+A                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ VoiceAssistantController.activate()                             │
│  - Check Ollama availability                                    │
│  - Load user settings (latency mode, etc.)                      │
│  - Initialize UI components                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STTController.startListening()                                  │
│ + ListeningIndicator.show('listening', latencyMode)             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ USER SPEAKS: "What is this assignment about?"                  │
│ Web Speech API captures audio → transcript                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ STTController fires onResult(transcript)                        │
│ → VoiceAssistantController.processInput(transcript)             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ CommandClassifier.classify(transcript)                          │
│                                                                  │
│ Option A: Simple Command (keyword match)                        │
│   - "read this" → { type: 'SIMPLE', action: 'READ_SELECTED' }  │
│   → IntentRouter.route() → TTSCommandHandler.execute()          │
│   → TTSController.readText(selectedText)                        │
│   → DONE (no AI needed)                                         │
│                                                                  │
│ Option B: Complex Query (requires AI)                           │
│   - "what is this about?" → { type: 'QUESTION', requiresAI }   │
│   → Continue to context extraction ↓                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (Complex Query Path)
┌─────────────────────────────────────────────────────────────────┐
│ ContextExtractor.extract(latencyMode)                           │
│  - Minimal (realtime): 100 chars selected text                  │
│  - Balanced (conversational): 500 chars visible + metadata      │
│  - Full (background): 2000 chars headings + links + LMS data    │
│                                                                  │
│ Returns: {                                                       │
│   url: 'https://canvas.instructure.com/courses/123/assignments',│
│   title: 'Assignment: Write Essay',                             │
│   visibleText: 'Write a 500-word essay about...',               │
│   selectedText: null,                                            │
│   metadata: {                                                    │
│     courseId: '123',                                             │
│     assignmentName: 'Write Essay',                              │
│     dueDate: 'March 15, 2026',                                  │
│     points: '100'                                                │
│   }                                                              │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Send to Service Worker                                          │
│                                                                  │
│ chrome.runtime.sendMessage({                                    │
│   action: 'VOICE_ASSISTANT_PROCESS',                            │
│   transcript: "What is this assignment about?",                 │
│   pageContext: { ... },                                         │
│   latencyMode: 'conversational'                                 │
│ })                                                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Service Worker (service-worker.js)                              │
│                                                                  │
│ 1. getOptimalModelForTask('voiceAssistantNLU', 'conversational')│
│    → Returns: { model: 'llama3.2', reason: 'Balanced' }        │
│                                                                  │
│ 2. Build NLU prompt:                                             │
│    "User is on an assignment page titled 'Write Essay'.         │
│     Assignment details: Write 500-word essay, due March 15.     │
│     User asked: 'What is this assignment about?'                │
│     Provide a concise answer."                                  │
│                                                                  │
│ 3. ollamaGenerate(prompt, {                                     │
│      model: 'llama3.2',                                         │
│      temperature: 0.3,                                          │
│      maxTokens: 300,                                            │
│      timeout: 3000                                              │
│    })                                                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Ollama (localhost:11434)                                        │
│  POST /api/generate                                             │
│  → Llama 3.2 model inference (local)                            │
│  → Response: "This assignment requires you to write a 500-word  │
│     essay about climate change. It's due on March 15 and is     │
│     worth 100 points."                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Service Worker → Content Script                                 │
│  sendResponse({                                                 │
│    success: true,                                               │
│    response: "This assignment requires you to write...",        │
│    model: 'llama3.2',                                           │
│    latency: 1842 // ms                                          │
│  })                                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ VoiceAssistantController receives response                      │
│  1. TranscriptDisplay.show(response)  // Visual feedback        │
│  2. TTSController.speak(response)     // Audio feedback         │
│  3. ConversationManager.addInteraction(transcript, response)    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ USER HEARS: "This assignment requires you to write a 500-word  │
│ essay about climate change. It's due on March 15 and is worth   │
│ 100 points."                                                     │
│                                                                  │
│ USER SEES: Transcript display showing both question and answer  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (MVP - 2-3 days)

**Goal:** Voice control of existing TTS features (no AI required yet)

**What Users Can Do:**

- Press Ctrl+Shift+A to activate voice assistant
- Say "read this" with text selected → TTS starts reading
- Say "pause" while TTS is speaking → TTS pauses
- Say "resume" → TTS continues
- Say "stop" → TTS stops completely
- Say "faster" / "slower" → Adjust reading speed
- Visual feedback: Pulsing microphone indicator appears when listening

#### Files to Create

**1. `src/features/voiceAssistant/voice-assistant-controller.js` (~200 lines)**

Main orchestrator class that coordinates all voice assistant components.

```javascript
/**
 * Voice Assistant Controller
 *
 * Main orchestrator for voice assistant functionality.
 * Integrates STT, TTS, command classification, and intent routing.
 */
export class VoiceAssistantController {
  constructor() {
    this.sttController = null; // STTController instance
    this.ttsController = null; // TTSController instance
    this.commandClassifier = null; // CommandClassifier instance
    this.intentRouter = null; // IntentRouter instance
    this.listeningIndicator = null; // UI component
    this.isActive = false;
    this.settings = null;
  }

  async initialize() {
    // Load settings from chrome.storage.local
    // Initialize STT and TTS controllers
    // Create UI components
    // Register keyboard shortcut handler
  }

  async activate() {
    // Check Ollama availability
    // Start listening via STTController
    // Show listening indicator
    // Handle onResult callback
  }

  deactivate() {
    // Stop listening
    // Hide UI
    // Cleanup
  }

  async processInput(transcript) {
    // Classify command
    // Route to appropriate handler
    // Handle errors
  }

  // Event handlers
  onSpeechStart() {}
  onSpeechEnd(transcript) {}
  onSpeechError(error) {}
}
```

**Key Responsibilities:**

- Lifecycle management (initialize, activate, deactivate)
- Integration with STTController for voice input
- Integration with TTSController for voice output
- Error handling and recovery
- Settings management

**2. `src/features/voiceAssistant/command-classifier.js` (~150 lines)**

Determines whether a spoken command is simple (keyword-based) or complex (AI-required).

```javascript
/**
 * Command Classifier
 *
 * Two-tier classification system:
 * 1. Keyword-based matching for simple commands (fast path)
 * 2. AI-based classification for complex queries (fallback)
 */
export class CommandClassifier {
  constructor() {
    this.simplePatterns = {
      TTS_CONTROL: [
        { patterns: ['read this', 'start reading'], action: 'READ_SELECTED' },
        { patterns: ['pause', 'stop reading'], action: 'PAUSE' },
        { patterns: ['resume', 'continue', 'keep going'], action: 'RESUME' },
        { patterns: ['stop', 'stop reading'], action: 'STOP' },
        { patterns: ['skip ahead', 'next', 'skip'], action: 'SKIP' },
        { patterns: ['go back', 'previous'], action: 'REWIND' },
        { patterns: ['faster', 'speed up'], action: 'INCREASE_RATE' },
        { patterns: ['slower', 'slow down'], action: 'DECREASE_RATE' },
      ],
      // More patterns in Phase 2+
    };
  }

  classify(transcript) {
    // 1. Try keyword match first (< 1ms)
    const simple = this.classifySimple(transcript);
    if (simple) return simple;

    // 2. Check if it's a question (heuristic)
    if (this.isQuestion(transcript)) {
      return { type: 'QUESTION', requiresAI: true };
    }

    // 3. Default: treat as question (fallback)
    return { type: 'QUESTION', requiresAI: true, confidence: 0.5 };
  }

  classifySimple(transcript) {
    const lower = transcript.toLowerCase().trim();

    for (const [category, commands] of Object.entries(this.simplePatterns)) {
      for (const { patterns, action } of commands) {
        if (patterns.some(p => lower.includes(p) || lower === p)) {
          return {
            type: 'SIMPLE',
            category,
            action,
            confidence: 1.0,
            originalText: transcript,
          };
        }
      }
    }

    return null;
  }

  isQuestion(text) {
    const questionWords = [
      'what',
      'when',
      'where',
      'who',
      'why',
      'how',
      'is',
      'are',
      'does',
      'do',
      'can',
      'could',
      'should',
    ];
    const lower = text.toLowerCase();
    return questionWords.some(w => lower.startsWith(w)) || lower.endsWith('?');
  }
}
```

**Returns:**

- Simple command: `{ type: 'SIMPLE', category: 'TTS_CONTROL', action: 'READ_SELECTED', confidence: 1.0 }`
- Complex query: `{ type: 'QUESTION', requiresAI: true, confidence: 0.8 }`

**3. `src/features/voiceAssistant/handlers/tts-command-handler.js` (~100 lines)**

Executes TTS control commands by interfacing with existing TTSController.

```javascript
/**
 * TTS Command Handler
 *
 * Executes voice commands that control the TTS engine.
 * Integrates with existing TTSController from src/engines/tts/
 */
export class TTSCommandHandler {
  constructor(ttsController) {
    this.ttsController = ttsController;
  }

  async execute(action, context = {}) {
    switch (action) {
      case 'READ_SELECTED':
        return await this.readSelected();

      case 'PAUSE':
        return this.pause();

      case 'RESUME':
        return this.resume();

      case 'STOP':
        return this.stop();

      case 'INCREASE_RATE':
        return this.adjustRate(0.2);

      case 'DECREASE_RATE':
        return this.adjustRate(-0.2);

      default:
        throw new Error(`Unknown TTS action: ${action}`);
    }
  }

  async readSelected() {
    const selectedText = window.getSelection().toString().trim();

    if (!selectedText) {
      return {
        success: false,
        message: 'No text selected. Please select some text and try again.',
      };
    }

    await this.ttsController.speak(selectedText);
    return { success: true, message: `Reading ${selectedText.length} characters` };
  }

  pause() {
    this.ttsController.pause();
    return { success: true, message: 'Paused' };
  }

  resume() {
    this.ttsController.resume();
    return { success: true, message: 'Resumed' };
  }

  stop() {
    this.ttsController.stop();
    return { success: true, message: 'Stopped' };
  }

  adjustRate(delta) {
    const currentRate = this.ttsController.settings.rate || 1.0;
    const newRate = Math.max(0.5, Math.min(2.0, currentRate + delta));
    this.ttsController.setRate(newRate);
    return {
      success: true,
      message: `Speed adjusted to ${newRate.toFixed(1)}x`,
    };
  }
}
```

**4. `src/features/voiceAssistant/ui/listening-indicator.js` (~150 lines)**

Visual feedback component that shows assistant state (listening, processing, speaking).

```javascript
/**
 * Listening Indicator UI Component
 *
 * Provides visual feedback during voice assistant operation:
 * - Listening: Pulsing microphone icon
 * - Processing: Spinner animation
 * - Speaking: Waveform animation
 *
 * Positioned at center-bottom of viewport for visibility.
 * WCAG 2.2 Level AA compliant (color contrast, animations).
 */
export class ListeningIndicator {
  constructor() {
    this.container = null;
    this.currentState = null;
  }

  show(state, latencyMode = 'conversational') {
    if (!this.container) {
      this.createContainer();
    }

    this.currentState = state;
    this.updateUI(state, latencyMode);
    this.container.style.display = 'flex';

    // Add entrance animation
    this.container.classList.add('assist-slide-in');
  }

  hide() {
    if (!this.container) return;

    this.container.classList.add('assist-slide-out');
    setTimeout(() => {
      this.container.style.display = 'none';
      this.container.classList.remove('assist-slide-in', 'assist-slide-out');
    }, 300);
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'assist-voice-indicator';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');

    this.container.innerHTML = `
      <div class="indicator-icon">
        <svg class="mic-icon" width="60" height="60" viewBox="0 0 60 60">
          <circle class="pulse-ring" cx="30" cy="30" r="25"
                  fill="none" stroke="#667eea" stroke-width="2" />
          <circle cx="30" cy="30" r="20" fill="#667eea" />
          <path class="mic-symbol" d="M30 15 v20 M20 30 h20"
                stroke="white" stroke-width="3" stroke-linecap="round" />
        </svg>
      </div>
      <div class="indicator-text">Listening...</div>
      <div class="indicator-waveform">
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
      </div>
      <div class="indicator-mode"></div>
    `;

    // Styling
    this.container.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      padding: 20px 30px;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 10001;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      min-width: 280px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    document.body.appendChild(this.container);
  }

  updateUI(state, latencyMode) {
    const textElement = this.container.querySelector('.indicator-text');
    const modeElement = this.container.querySelector('.indicator-mode');
    const iconElement = this.container.querySelector('.mic-icon');

    switch (state) {
      case 'listening':
        textElement.textContent = 'Listening...';
        iconElement.classList.add('pulsing');
        modeElement.textContent = this.getLatencyModeLabel(latencyMode);
        break;

      case 'processing':
        textElement.textContent = 'Processing...';
        iconElement.classList.remove('pulsing');
        iconElement.classList.add('spinning');
        break;

      case 'speaking':
        textElement.textContent = 'Speaking...';
        iconElement.classList.remove('pulsing', 'spinning');
        // Show waveform animation
        break;
    }
  }

  getLatencyModeLabel(mode) {
    const labels = {
      realtime: 'Real-time (<1s)',
      conversational: 'Conversational (1-3s)',
      background: 'Deep Analysis (3-10s)',
    };
    return labels[mode] || '';
  }
}
```

**CSS (to be added to existing stylesheets):**

```css
/* Voice Assistant Listening Indicator */
.assist-voice-indicator .mic-icon.pulsing .pulse-ring {
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    r: 20;
    opacity: 1;
  }
  100% {
    r: 28;
    opacity: 0;
  }
}

.assist-slide-in {
  animation: slideIn 0.3s ease-out;
}

.assist-slide-out {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from {
    transform: translateX(-50%) translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
  to {
    transform: translateX(-50%) translateY(20px);
    opacity: 0;
  }
}
```

#### Files to Modify

**1. `src/utils/keyboard-shortcuts.js`**

Add voice assistant activation shortcut.

```javascript
// Add to DEFAULT_SHORTCUTS object
const DEFAULT_SHORTCUTS = {
  // ... existing shortcuts ...

  // Voice Assistant
  voice_assistant_activate: 'Ctrl+Shift+A',
};

// Add to SHORTCUT_LABELS object
const SHORTCUT_LABELS = {
  // ... existing labels ...

  'Ctrl+Shift+A': 'Activate Voice Assistant',
};
```

**2. `src/content/content-simple.js`**

Import and initialize VoiceAssistantController, wire up keyboard shortcut.

```javascript
import { VoiceAssistantController } from '../features/voiceAssistant/voice-assistant-controller.js';

// Initialize voice assistant (add to existing initialization logic)
let voiceAssistantController = null;

async function initializeVoiceAssistant() {
  try {
    voiceAssistantController = new VoiceAssistantController();
    await voiceAssistantController.initialize();
    console.log('[AssisT] Voice Assistant initialized');
  } catch (error) {
    console.error('[AssisT] Voice Assistant initialization failed:', error);
  }
}

// Register keyboard shortcut handler (add to existing shortcut handling)
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.shiftKey && event.key === 'A') {
    event.preventDefault();
    event.stopPropagation();

    if (voiceAssistantController) {
      voiceAssistantController.activate();
    }
  }
});

// Initialize on page load
initializeVoiceAssistant();
```

#### Testing Checklist for Phase 1

- [ ] Press Ctrl+Shift+A → Listening indicator appears with pulsing microphone
- [ ] Say "read this" with text selected → TTS starts reading the selected text
- [ ] Say "pause" while TTS is speaking → TTS pauses immediately
- [ ] Say "resume" after pausing → TTS continues from where it left off
- [ ] Say "stop" while TTS is speaking → TTS stops completely
- [ ] Say "faster" → TTS reading speed increases (confirm with visual feedback)
- [ ] Say "slower" → TTS reading speed decreases
- [ ] Say "read this" with NO text selected → Shows error message "No text selected"
- [ ] Keyboard shortcut works on Canvas LMS pages
- [ ] Keyboard shortcut works on generic webpages (if `<all_urls>` granted)
- [ ] Listening indicator disappears after command execution
- [ ] Visual feedback uses correct colors (WCAG 2.2 contrast compliance)

#### Phase 1 Deliverable

**MVP Feature:** Voice-controlled TTS (hands-free reading)

Users can activate the voice assistant and control the TTS engine entirely through voice commands. No AI processing required - all commands are keyword-based for instant response.

**User Value:**

- Hands-free operation for users with motor impairments
- Convenient TTS control without breaking flow
- Foundation for AI-powered features in Phase 2

**Technical Achievement:**

- STT/TTS integration working
- Keyboard shortcut activation functional
- Visual feedback system operational
- Command classification (keyword-based) implemented

---

### Phase 2: AI-Powered Q&A (3-4 days)

**Goal:** Answer questions about page content using Ollama

**What Users Can Do (New in Phase 2):**

- Ask questions about page content: "What is this assignment about?"
- Request summaries: "Summarize this article"
- Query deadlines: "When is this due?"
- Get explanations: "Explain this concept to me"
- See visual transcript of conversation (accessibility)
- Choose latency mode (real-time, conversational, background)

#### Files to Create

**1. `src/features/voiceAssistant/context-extractor.js` (~250 lines)**

Extracts page context for AI processing with tiered extraction based on latency mode.

```javascript
/**
 * Context Extractor
 *
 * Extracts page context for Ollama with token budget management.
 * Three extraction modes:
 * - Minimal (real-time): 100 chars, selected text only
 * - Balanced (conversational): 500 chars, visible text + metadata
 * - Full (background): 2000 chars, headings + links + LMS data
 */
export class ContextExtractor {
  constructor() {
    this.maxTokens = {
      minimal: 100,
      balanced: 500,
      full: 2000,
    };
  }

  extract(level = 'balanced') {
    const context = {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      timestamp: Date.now(),
    };

    switch (level) {
      case 'minimal':
        return this.extractMinimal(context);
      case 'balanced':
        return this.extractBalanced(context);
      case 'full':
        return this.extractFull(context);
      default:
        return this.extractBalanced(context);
    }
  }

  extractMinimal(context) {
    context.selectedText = this.getSelectedText();
    context.nearbyText = this.getNearbyText(100);
    return context;
  }

  extractBalanced(context) {
    context.selectedText = this.getSelectedText();
    context.visibleText = this.getVisibleText(500);
    context.pageType = this.detectPageType();
    context.metadata = this.extractMetadata();
    return context;
  }

  extractFull(context) {
    context.selectedText = this.getSelectedText();
    context.fullText = this.getAllText(2000);
    context.headings = this.extractHeadings();
    context.links = this.extractLinks(10);
    context.forms = this.detectForms();
    context.lmsData = this.extractLMSData();
    return context;
  }

  getSelectedText() {
    return window.getSelection().toString().trim();
  }

  getVisibleText(maxChars) {
    // Use TreeWalker to get only visible text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const element = node.parentElement;
        if (!element) return NodeFilter.FILTER_REJECT;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }

        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
      },
    });

    let text = '';
    let node;
    while ((node = walker.nextNode()) && text.length < maxChars) {
      text += node.textContent + ' ';
    }

    return text.slice(0, maxChars).trim();
  }

  detectPageType() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();

    if (url.includes('/assignments/') || title.includes('assignment')) {
      return 'assignment';
    } else if (url.includes('/quizzes/') || title.includes('quiz')) {
      return 'quiz';
    } else if (url.includes('/discussion') || title.includes('discussion')) {
      return 'discussion';
    } else if (url.includes('/grades')) {
      return 'grades';
    }

    return 'general';
  }

  extractLMSData() {
    // Canvas LMS specific
    if (!window.location.hostname.includes('instructure.com')) {
      return null;
    }

    return {
      platform: 'canvas',
      courseId: this.extractCanvasCourseId(),
      courseName: document
        .querySelector('.course-title, .context_course_name')
        ?.textContent?.trim(),
      assignmentName: document.querySelector('.assignment-title, h1.title')?.textContent?.trim(),
      dueDate: document.querySelector('.due-date, .due_date_display')?.textContent?.trim(),
      points: document.querySelector('.points, .points_possible')?.textContent?.trim(),
      description: document
        .querySelector('.description, .user_content')
        ?.textContent?.trim()
        .slice(0, 300),
    };
  }

  extractCanvasCourseId() {
    const match = window.location.pathname.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }

  extractHeadings() {
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach(h => {
      headings.push({
        level: h.tagName.toLowerCase(),
        text: h.textContent.trim(),
      });
    });
    return headings.slice(0, 10); // Limit to 10 headings
  }

  extractLinks(limit = 10) {
    const links = [];
    document.querySelectorAll('a[href]').forEach(a => {
      if (links.length >= limit) return;
      links.push({
        text: a.textContent.trim(),
        href: a.href,
      });
    });
    return links;
  }

  extractMetadata() {
    const meta = {};

    // Open Graph tags
    document.querySelectorAll('meta[property^="og:"]').forEach(tag => {
      const property = tag.getAttribute('property').replace('og:', '');
      meta[property] = tag.getAttribute('content');
    });

    // Standard meta tags
    ['description', 'keywords', 'author'].forEach(name => {
      const tag = document.querySelector(`meta[name="${name}"]`);
      if (tag) {
        meta[name] = tag.getAttribute('content');
      }
    });

    return meta;
  }
}
```

**2. `src/features/voiceAssistant/handlers/qa-handler.js` (~200 lines)**

Builds Q&A prompts and orchestrates communication with Ollama.

```javascript
/**
 * Q&A Handler
 *
 * Handles question-answering via Ollama.
 * Builds context-aware prompts and manages AI communication.
 */
export class QAHandler {
  constructor(contextExtractor, latencyManager) {
    this.contextExtractor = contextExtractor;
    this.latencyManager = latencyManager;
  }

  async execute(question, latencyMode = 'conversational') {
    try {
      // Extract page context
      const contextLevel = this.latencyManager.getContextLevel(latencyMode);
      const pageContext = this.contextExtractor.extract(contextLevel);

      // Build prompt
      const prompt = this.buildPrompt(question, pageContext);

      // Send to service worker
      const response = await chrome.runtime.sendMessage({
        action: 'VOICE_ASSISTANT_PROCESS',
        transcript: question,
        pageContext: pageContext,
        latencyMode: latencyMode,
        prompt: prompt,
      });

      if (!response.success) {
        throw new Error(response.error || 'AI processing failed');
      }

      return {
        success: true,
        answer: response.response,
        model: response.model,
        latency: response.latency,
      };
    } catch (error) {
      console.error('[QAHandler] Error:', error);
      return {
        success: false,
        error: error.message,
        fallbackMessage: this.getFallbackResponse(error),
      };
    }
  }

  buildPrompt(question, context) {
    let prompt = `You are a helpful educational assistant. Answer the user's question based on the provided context.\n\n`;

    // Add context
    if (context.lmsData) {
      prompt += `Page Type: ${context.lmsData.platform} ${context.pageType}\n`;
      if (context.lmsData.courseName) {
        prompt += `Course: ${context.lmsData.courseName}\n`;
      }
      if (context.lmsData.assignmentName) {
        prompt += `Assignment: ${context.lmsData.assignmentName}\n`;
      }
      if (context.lmsData.dueDate) {
        prompt += `Due Date: ${context.lmsData.dueDate}\n`;
      }
      if (context.lmsData.points) {
        prompt += `Points: ${context.lmsData.points}\n`;
      }
    }

    prompt += `\nPage Title: ${context.title}\n`;
    prompt += `Page URL: ${context.url}\n\n`;

    if (context.selectedText) {
      prompt += `Selected Text:\n${context.selectedText}\n\n`;
    }

    if (context.visibleText || context.fullText) {
      const text = context.fullText || context.visibleText;
      prompt += `Page Content:\n${text}\n\n`;
    }

    prompt += `User Question: ${question}\n\n`;
    prompt += `Provide a concise, helpful answer. If you cannot answer based on the context, say so clearly.`;

    return prompt;
  }

  getFallbackResponse(error) {
    if (error.message.includes('Ollama')) {
      return "I'm having trouble connecting to the AI service. Please make sure Ollama is running.";
    } else if (error.message.includes('timeout')) {
      return 'The AI is taking too long to respond. Try using real-time mode or ask a simpler question.';
    } else {
      return 'I encountered an error processing your question. Please try again.';
    }
  }
}
```

**3. `src/features/voiceAssistant/latency-manager.js` (~100 lines)**

Manages model selection and timeout configuration per latency mode.

```javascript
/**
 * Latency Manager
 *
 * Manages model selection, timeout values, and context extraction
 * levels based on user's selected latency mode.
 */
export class LatencyManager {
  constructor() {
    this.modes = {
      realtime: {
        maxContextTokens: 200,
        maxResponseTokens: 100,
        timeout: 1000,
        modelPriority: ['phi3:mini', 'llama3.2:3b'],
        contextLevel: 'minimal',
        description: 'Real-time (<1s) - Quick answers',
      },
      conversational: {
        maxContextTokens: 500,
        maxResponseTokens: 300,
        timeout: 3000,
        modelPriority: ['llama3.2', 'gemma3:4b', 'mistral:7b-instruct'],
        contextLevel: 'balanced',
        description: 'Conversational (1-3s) - Balanced quality and speed',
      },
      background: {
        maxContextTokens: 2000,
        maxResponseTokens: 800,
        timeout: 10000,
        modelPriority: ['mistral:7b-instruct', 'qwen2.5:7b', 'llama3.2'],
        contextLevel: 'full',
        description: 'Deep Analysis (3-10s) - Comprehensive reasoning',
      },
    };
  }

  getConfig(mode) {
    return this.modes[mode] || this.modes.conversational;
  }

  getContextLevel(mode) {
    return this.modes[mode]?.contextLevel || 'balanced';
  }

  getTimeout(mode) {
    return this.modes[mode]?.timeout || 3000;
  }

  getModelPriority(mode) {
    return this.modes[mode]?.modelPriority || ['llama3.2'];
  }

  getDescription(mode) {
    return this.modes[mode]?.description || 'Conversational mode';
  }
}
```

**4. `src/features/voiceAssistant/ui/transcript-display.js` (~150 lines)**

Visual transcript panel for accessibility (WCAG 2.2 compliance).

```javascript
/**
 * Transcript Display Component
 *
 * Shows visual transcript of conversation for accessibility.
 * WCAG 2.2 Level AA compliant:
 * - High contrast (4.5:1 minimum)
 * - Resizable text
 * - Keyboard accessible
 * - Screen reader friendly
 */
export class TranscriptDisplay {
  constructor() {
    this.panel = null;
    this.isVisible = false;
    this.maxEntries = 10;
  }

  show() {
    if (!this.panel) {
      this.createPanel();
    }
    this.panel.style.display = 'flex';
    this.isVisible = true;
  }

  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
      this.isVisible = false;
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'assist-transcript-panel';
    this.panel.setAttribute('role', 'log');
    this.panel.setAttribute('aria-label', 'Voice Assistant Transcript');

    this.panel.innerHTML = `
      <div class="transcript-header">
        <h3>Voice Assistant Transcript</h3>
        <button class="transcript-close" aria-label="Close transcript">×</button>
      </div>
      <div class="transcript-log" aria-live="polite"></div>
      <div class="transcript-footer">
        <button class="transcript-clear">Clear</button>
        <button class="transcript-copy">Copy</button>
      </div>
    `;

    // Styling
    this.panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 400px;
      max-height: 600px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      display: none;
      flex-direction: column;
      z-index: 10002;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // Event listeners
    const closeBtn = this.panel.querySelector('.transcript-close');
    attachInteractiveHandler(closeBtn, 'Close Transcript', () => this.hide());

    const clearBtn = this.panel.querySelector('.transcript-clear');
    attachInteractiveHandler(clearBtn, 'Clear Transcript', () => this.clear());

    const copyBtn = this.panel.querySelector('.transcript-copy');
    attachInteractiveHandler(copyBtn, 'Copy Transcript', () => this.copy());

    document.body.appendChild(this.panel);
  }

  addUserInput(text) {
    if (!this.panel) this.createPanel();

    const entry = document.createElement('div');
    entry.className = 'transcript-entry transcript-user';
    entry.innerHTML = `
      <div class="entry-label">You:</div>
      <div class="entry-text">${this.escapeHtml(text)}</div>
      <div class="entry-time">${this.getTimestamp()}</div>
    `;

    this.addEntry(entry);
  }

  addAssistantResponse(text) {
    if (!this.panel) this.createPanel();

    const entry = document.createElement('div');
    entry.className = 'transcript-entry transcript-assistant';
    entry.innerHTML = `
      <div class="entry-label">AssisT:</div>
      <div class="entry-text">${this.escapeHtml(text)}</div>
      <div class="entry-time">${this.getTimestamp()}</div>
    `;

    this.addEntry(entry);
  }

  addEntry(entry) {
    const log = this.panel.querySelector('.transcript-log');
    log.appendChild(entry);

    // Remove old entries if exceeding max
    const entries = log.querySelectorAll('.transcript-entry');
    if (entries.length > this.maxEntries) {
      entries[0].remove();
    }

    // Auto-scroll to bottom
    log.scrollTop = log.scrollHeight;
  }

  clear() {
    const log = this.panel.querySelector('.transcript-log');
    log.innerHTML = '';
  }

  copy() {
    const log = this.panel.querySelector('.transcript-log');
    const text = Array.from(log.querySelectorAll('.transcript-entry'))
      .map(entry => {
        const label = entry.querySelector('.entry-label').textContent;
        const text = entry.querySelector('.entry-text').textContent;
        return `${label} ${text}`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      // Show success feedback
      const copyBtn = this.panel.querySelector('.transcript-copy');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
```

#### Files to Modify

**1. `src/background/service-worker.js`**

Add message handler for voice assistant AI processing.

```javascript
// Add to chrome.runtime.onMessage listener

if (message.action === 'VOICE_ASSISTANT_PROCESS') {
  (async () => {
    try {
      const { transcript, pageContext, latencyMode, prompt } = message;
      const startTime = Date.now();

      // Get optimal model for latency mode
      const availableModels = await getInstalledModels(); // Existing function
      const routing = getOptimalModelForTask('voiceAssistantNLU', latencyMode, availableModels);

      if (!routing.matched) {
        // No suitable model installed
        sendResponse({
          success: false,
          error: 'MODEL_NOT_INSTALLED',
          recommendedModel: routing.model,
          message: `For ${latencyMode} mode, please install ${routing.model}`,
        });
        return;
      }

      // Get latency config
      const latencyConfig = LATENCY_MODES[latencyMode] || LATENCY_MODES.conversational;

      // Generate response via Ollama
      const response = await ollamaGenerate(prompt, {
        model: routing.model,
        temperature: 0.3,
        max_tokens: latencyConfig.maxResponseTokens,
        timeout: latencyConfig.timeout,
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      sendResponse({
        success: true,
        response: response,
        model: routing.model,
        latency: latency,
        latencyMode: latencyMode,
      });
    } catch (error) {
      console.error('[Voice Assistant] Processing error:', error);
      sendResponse({
        success: false,
        error: error.message,
        fallback: 'An error occurred processing your request.',
      });
    }
  })();
  return true; // Async response
}

// Add to TASK_OPTIMAL_MODELS object
const TASK_OPTIMAL_MODELS = {
  // ... existing tasks ...

  voiceAssistantNLU: {
    realtime: {
      priority: ['phi3:mini', 'llama3.2:3b', 'llama3.2'],
      reason: 'Real-time NLU needs fastest inference',
    },
    conversational: {
      priority: ['llama3.2', 'gemma3:4b', 'mistral:7b-instruct'],
      reason: 'Balanced quality and speed for natural conversation',
    },
    background: {
      priority: ['mistral:7b-instruct', 'qwen2.5:7b', 'gemma3:4b'],
      reason: 'Deep reasoning for complex queries',
    },
  },

  // Can also be used for direct Q&A routing
  voiceAssistantQA: {
    realtime: {
      priority: ['llama3.2', 'phi3:mini'],
      reason: 'Quick factual answers',
    },
    conversational: {
      priority: ['gemma3:4b', 'mistral:7b-instruct', 'llama3.2'],
      reason: 'Comprehensive answers with context',
    },
    background: {
      priority: ['mistral:7b-instruct', 'qwen2.5:7b'],
      reason: 'Detailed analysis and multi-step reasoning',
    },
  },
};

// Add latency mode configurations
const LATENCY_MODES = {
  realtime: {
    maxContextTokens: 200,
    maxResponseTokens: 100,
    timeout: 1000,
  },
  conversational: {
    maxContextTokens: 500,
    maxResponseTokens: 300,
    timeout: 3000,
  },
  background: {
    maxContextTokens: 2000,
    maxResponseTokens: 800,
    timeout: 10000,
  },
};
```

**2. `src/features/voiceAssistant/command-classifier.js`**

Add fallback to AI classification for complex queries.

```javascript
// Update classify() method to support AI fallback

classify(transcript) {
  // 1. Try keyword match first (< 1ms)
  const simple = this.classifySimple(transcript);
  if (simple) return simple;

  // 2. Check if it's a question (heuristic)
  if (this.isQuestion(transcript)) {
    return {
      type: 'QUESTION',
      requiresAI: true,
      confidence: 0.8
    };
  }

  // 3. Default: treat as question (requires AI)
  // This allows open-ended commands like "help me with this"
  return {
    type: 'QUESTION',
    requiresAI: true,
    confidence: 0.5
  };
}
```

**3. `src/features/voiceAssistant/voice-assistant-controller.js`**

Integrate Q&A handler and transcript display.

```javascript
// Add to imports
import { ContextExtractor } from './context-extractor.js';
import { QAHandler } from './handlers/qa-handler.js';
import { LatencyManager } from './latency-manager.js';
import { TranscriptDisplay } from './ui/transcript-display.js';

// Add to constructor
constructor() {
  // ... existing properties ...
  this.contextExtractor = null;
  this.qaHandler = null;
  this.latencyManager = null;
  this.transcriptDisplay = null;
}

// Add to initialize()
async initialize() {
  // ... existing initialization ...

  this.contextExtractor = new ContextExtractor();
  this.latencyManager = new LatencyManager();
  this.qaHandler = new QAHandler(this.contextExtractor, this.latencyManager);
  this.transcriptDisplay = new TranscriptDisplay();
}

// Update processInput() to handle AI queries
async processInput(transcript) {
  try {
    // Show in transcript
    this.transcriptDisplay.addUserInput(transcript);

    // Classify command
    const classification = this.commandClassifier.classify(transcript);

    if (classification.type === 'SIMPLE') {
      // Handle simple command (existing logic)
      const result = await this.intentRouter.route(classification);
      // ... handle result ...
    } else if (classification.requiresAI) {
      // Handle complex query (NEW)
      this.listeningIndicator.updateState('processing');

      const result = await this.qaHandler.execute(
        transcript,
        this.settings.latencyMode || 'conversational'
      );

      if (result.success) {
        this.transcriptDisplay.addAssistantResponse(result.answer);
        this.listeningIndicator.updateState('speaking');
        await this.ttsController.speak(result.answer);
      } else {
        // Handle error
        const errorMsg = result.fallbackMessage || 'Sorry, I encountered an error.';
        this.transcriptDisplay.addAssistantResponse(errorMsg);
        await this.ttsController.speak(errorMsg);
      }
    }

    this.listeningIndicator.hide();

  } catch (error) {
    console.error('[VoiceAssistant] Processing error:', error);
    this.handleError(error);
  }
}
```

#### Testing Checklist for Phase 2

- [ ] Open Canvas assignment page
- [ ] Activate voice assistant (Ctrl+Shift+A)
- [ ] Say "What is this assignment about?" → AI answers with assignment details
- [ ] Say "When is this due?" → AI extracts and states the due date
- [ ] Say "Summarize this" → AI provides concise summary of page content
- [ ] Test on article page → AI answers questions about article
- [ ] Test on quiz page → AI describes quiz structure
- [ ] Verify transcript display shows both question and answer
- [ ] Test real-time mode (settings) → Response <1s with phi3:mini
- [ ] Test conversational mode → Response 1-3s with llama3.2
- [ ] Test background mode → Response 3-10s with mistral (more detailed)
- [ ] Test with Ollama stopped → Shows graceful error message
- [ ] Test with missing model → Suggests model installation
- [ ] Verify NO external network calls (DevTools Network tab)

#### Phase 2 Deliverable

**Feature:** Voice-based Q&A for course content

Users can now ask questions about any webpage and receive AI-powered answers, all processed locally via Ollama. The system intelligently extracts page context and routes to the optimal model based on latency preferences.

**User Value:**

- Quick answers to course material questions
- Accessibility aid for comprehension
- Study assistant for neurodivergent students
- Privacy-preserved AI interaction

**Technical Achievement:**

- Context extraction working (minimal/balanced/full modes)
- Ollama integration complete
- Latency mode system operational
- Visual transcript for accessibility
- Service worker message routing functional

---

### Phase 3: Context Awareness & Navigation (2-3 days)

**Goal:** Canvas-specific features and navigation commands

**What Users Can Do (New in Phase 3):**

- Navigate via voice: "Go to assignments", "Show my grades"
- Ask follow-up questions: "Tell me more", "What about the deadline?"
- Canvas-aware queries: "What's my next assignment?", "How many points is this worth?"
- Multi-turn conversations with context retention

#### Files to Create

**1. `src/features/voiceAssistant/handlers/navigation-handler.js` (~150 lines)**

```javascript
/**
 * Navigation Handler
 *
 * Handles voice commands for navigating Canvas LMS.
 * Detects course context and constructs appropriate URLs.
 */
export class NavigationHandler {
  constructor() {
    this.platform = this.detectPlatform();
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('instructure.com')) return 'canvas';
    if (hostname.includes('moodle')) return 'moodle';
    if (hostname.includes('classroom.google.com')) return 'google_classroom';
    return 'unknown';
  }

  async execute(action, context = {}) {
    switch (action) {
      case 'NAVIGATE_ASSIGNMENTS':
        return this.navigateToAssignments();

      case 'NAVIGATE_GRADES':
        return this.navigateToGrades();

      case 'NAVIGATE_NOTIFICATIONS':
        return this.showNotifications();

      case 'NAVIGATE_COURSE_HOME':
        return this.navigateToCourseHome();

      default:
        throw new Error(`Unknown navigation action: ${action}`);
    }
  }

  navigateToAssignments() {
    if (this.platform === 'canvas') {
      const courseId = this.getCanvasCourseId();
      if (courseId) {
        window.location.href = `/courses/${courseId}/assignments`;
        return { success: true, message: 'Navigating to assignments' };
      }
    }

    // Generic fallback: search for assignments link
    const assignmentsLink = document.querySelector('a[href*="assignments"]');
    if (assignmentsLink) {
      assignmentsLink.click();
      return { success: true, message: 'Opening assignments' };
    }

    return { success: false, message: 'Could not find assignments page' };
  }

  navigateToGrades() {
    if (this.platform === 'canvas') {
      const courseId = this.getCanvasCourseId();
      if (courseId) {
        window.location.href = `/courses/${courseId}/grades`;
        return { success: true, message: 'Navigating to grades' };
      }
    }

    const gradesLink = document.querySelector('a[href*="grades"]');
    if (gradesLink) {
      gradesLink.click();
      return { success: true, message: 'Opening grades' };
    }

    return { success: false, message: 'Could not find grades page' };
  }

  showNotifications() {
    if (this.platform === 'canvas') {
      // Trigger Canvas notifications panel
      const notifButton = document.querySelector(
        '#global_nav_conversations_link, a[href*="conversations"]'
      );
      if (notifButton) {
        notifButton.click();
        return { success: true, message: 'Opening notifications' };
      }
    }

    return { success: false, message: 'Could not find notifications' };
  }

  navigateToCourseHome() {
    if (this.platform === 'canvas') {
      const courseId = this.getCanvasCourseId();
      if (courseId) {
        window.location.href = `/courses/${courseId}`;
        return { success: true, message: 'Navigating to course home' };
      }
    }

    return { success: false, message: 'Could not determine course' };
  }

  getCanvasCourseId() {
    const match = window.location.pathname.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }
}
```

**2. `src/features/voiceAssistant/conversation-manager.js` (~200 lines)**

```javascript
/**
 * Conversation Manager
 *
 * Manages multi-turn conversation state.
 * Stores last N interactions and provides context for follow-up questions.
 */
export class ConversationManager {
  constructor(maxHistory = 3) {
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentTopic = null;
  }

  addInteraction(userInput, assistantResponse, metadata = {}) {
    const interaction = {
      timestamp: Date.now(),
      userInput,
      assistantResponse,
      metadata,
      topic: this.detectTopic(userInput),
    };

    this.history.push(interaction);

    // Trim history to max size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Update current topic
    this.currentTopic = interaction.topic;
  }

  getContext(forQuestion = null) {
    if (this.history.length === 0) {
      return null;
    }

    // Check if current question is a follow-up
    if (forQuestion && this.isFollowUp(forQuestion)) {
      return {
        isFollowUp: true,
        previousInteractions: this.history,
        currentTopic: this.currentTopic,
      };
    }

    return {
      isFollowUp: false,
      previousInteractions: [],
      currentTopic: null,
    };
  }

  isFollowUp(question) {
    const followUpIndicators = [
      'tell me more',
      'what about',
      'and',
      'also',
      'what else',
      'why',
      'how',
      'more details',
      'explain',
      'elaborate',
    ];

    const lower = question.toLowerCase();

    // Short questions are likely follow-ups
    if (question.split(' ').length <= 3) {
      return true;
    }

    // Contains follow-up indicators
    return followUpIndicators.some(indicator => lower.includes(indicator));
  }

  detectTopic(input) {
    const lower = input.toLowerCase();

    if (lower.includes('assignment')) return 'assignment';
    if (lower.includes('quiz') || lower.includes('test')) return 'quiz';
    if (lower.includes('grade') || lower.includes('score')) return 'grades';
    if (lower.includes('due date') || lower.includes('deadline')) return 'deadline';
    if (lower.includes('read') || lower.includes('tts')) return 'reading';

    return 'general';
  }

  clear() {
    this.history = [];
    this.currentTopic = null;
  }

  getLastInteraction() {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  buildContextString() {
    if (this.history.length === 0) return '';

    let contextStr = 'Previous conversation:\n';
    this.history.forEach((interaction, index) => {
      contextStr += `\nUser: ${interaction.userInput}\n`;
      contextStr += `Assistant: ${interaction.assistantResponse}\n`;
    });

    return contextStr;
  }
}
```

#### Files to Modify

**1. `src/features/voiceAssistant/context-extractor.js`**

Enhance Canvas-specific data extraction.

```javascript
// Enhance extractLMSData() method

extractLMSData() {
  if (!window.location.hostname.includes('instructure.com')) {
    return null;
  }

  return {
    platform: 'canvas',
    courseId: this.extractCanvasCourseId(),
    courseName: this.extractCourseName(),
    assignmentName: this.extractAssignmentName(),
    dueDate: this.extractDueDate(),
    points: this.extractPoints(),
    description: this.extractDescription(),
    submissionStatus: this.extractSubmissionStatus(),
    upcomingAssignments: this.extractUpcomingAssignments()
  };
}

extractCourseName() {
  const selectors = [
    '.course-title',
    '.context_course_name',
    'h1.course-name',
    '[data-testid="course-name"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element.textContent.trim();
  }

  return null;
}

extractAssignmentName() {
  const selectors = [
    '.assignment-title',
    'h1.title',
    '.page-title',
    '[data-testid="assignment-title"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element.textContent.trim();
  }

  return null;
}

extractDueDate() {
  const selectors = [
    '.due-date',
    '.due_date_display',
    '[data-testid="due-date"]',
    '.assignment-due-date'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element.textContent.trim();
  }

  return null;
}

extractPoints() {
  const selectors = [
    '.points',
    '.points_possible',
    '[data-testid="points-possible"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent.trim();
      const match = text.match(/(\d+)/);
      return match ? match[1] : text;
    }
  }

  return null;
}

extractDescription() {
  const selectors = [
    '.description',
    '.user_content',
    '.assignment-description',
    '[data-testid="description"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element.textContent.trim().slice(0, 300);
    }
  }

  return null;
}

extractSubmissionStatus() {
  const submitted = document.querySelector('.submission-details, .submitted');
  if (submitted) {
    return submitted.textContent.includes('Submitted') ? 'submitted' : 'not_submitted';
  }
  return 'unknown';
}

extractUpcomingAssignments() {
  const assignments = [];
  document.querySelectorAll('.assignment-item, .upcoming-assignment').forEach(item => {
    if (assignments.length >= 5) return;

    const name = item.querySelector('.assignment-name, .title')?.textContent?.trim();
    const due = item.querySelector('.due-date')?.textContent?.trim();

    if (name) {
      assignments.push({ name, due });
    }
  });

  return assignments;
}
```

**2. `src/features/voiceAssistant/command-classifier.js`**

Add navigation command patterns.

```javascript
// Add to simplePatterns object

NAVIGATION: [
  { patterns: ['go to assignments', 'show assignments', 'open assignments'],
    action: 'NAVIGATE_ASSIGNMENTS' },
  { patterns: ['go to grades', 'show my grades', 'open grades', 'check my grades'],
    action: 'NAVIGATE_GRADES' },
  { patterns: ['show notifications', 'check notifications', 'open notifications'],
    action: 'NAVIGATE_NOTIFICATIONS' },
  { patterns: ['go to course home', 'course home', 'home page'],
    action: 'NAVIGATE_COURSE_HOME' },
  { patterns: ['go back', 'previous page'],
    action: 'NAVIGATE_BACK' }
],
```

**3. `src/features/voiceAssistant/voice-assistant-controller.js`**

Integrate navigation handler and conversation manager.

```javascript
// Add to imports
import { NavigationHandler } from './handlers/navigation-handler.js';
import { ConversationManager } from './conversation-manager.js';

// Add to constructor
constructor() {
  // ... existing properties ...
  this.navigationHandler = null;
  this.conversationManager = null;
}

// Add to initialize()
async initialize() {
  // ... existing initialization ...

  this.navigationHandler = new NavigationHandler();
  this.conversationManager = new ConversationManager(3); // Keep last 3 interactions
}

// Update processInput() to handle navigation and conversation context
async processInput(transcript) {
  try {
    // Show in transcript
    this.transcriptDisplay.addUserInput(transcript);

    // Classify command
    const classification = this.commandClassifier.classify(transcript);

    if (classification.type === 'SIMPLE') {
      // Check if it's a navigation command
      if (classification.category === 'NAVIGATION') {
        const result = await this.navigationHandler.execute(classification.action);
        if (result.success) {
          await this.ttsController.speak(result.message);
        } else {
          await this.ttsController.speak(result.message || 'Navigation failed');
        }
        return;
      }

      // Other simple commands (TTS control, etc.)
      const result = await this.intentRouter.route(classification);
      // ... handle result ...

    } else if (classification.requiresAI) {
      // Check for conversation context
      const conversationContext = this.conversationManager.getContext(transcript);

      this.listeningIndicator.updateState('processing');

      // Build enhanced prompt with conversation history
      let enhancedTranscript = transcript;
      if (conversationContext.isFollowUp) {
        enhancedTranscript = this.buildFollowUpPrompt(
          transcript,
          conversationContext.previousInteractions
        );
      }

      const result = await this.qaHandler.execute(
        enhancedTranscript,
        this.settings.latencyMode || 'conversational'
      );

      if (result.success) {
        // Store in conversation history
        this.conversationManager.addInteraction(transcript, result.answer);

        this.transcriptDisplay.addAssistantResponse(result.answer);
        this.listeningIndicator.updateState('speaking');
        await this.ttsController.speak(result.answer);
      } else {
        const errorMsg = result.fallbackMessage || 'Sorry, I encountered an error.';
        this.transcriptDisplay.addAssistantResponse(errorMsg);
        await this.ttsController.speak(errorMsg);
      }
    }

    this.listeningIndicator.hide();

  } catch (error) {
    console.error('[VoiceAssistant] Processing error:', error);
    this.handleError(error);
  }
}

buildFollowUpPrompt(currentQuestion, previousInteractions) {
  let prompt = 'Previous conversation:\n';
  previousInteractions.forEach(interaction => {
    prompt += `User: ${interaction.userInput}\n`;
    prompt += `Assistant: ${interaction.assistantResponse}\n\n`;
  });
  prompt += `User's follow-up question: ${currentQuestion}\n\n`;
  prompt += 'Please answer the follow-up question considering the previous conversation context.';

  return prompt;
}
```

#### Testing Checklist for Phase 3

- [ ] Say "go to assignments" → Navigates to assignments page
- [ ] Say "show my grades" → Navigates to grades page
- [ ] Say "show notifications" → Opens Canvas notifications
- [ ] Ask "what is this assignment?" then "when is it due?" → Second question uses context
- [ ] Ask "summarize this" then "tell me more" → Provides additional detail
- [ ] Test on Canvas course with multiple assignments → Extracts upcoming assignments
- [ ] Verify conversation history retained (last 3 interactions)
- [ ] Test topic change → Clears irrelevant conversation context
- [ ] Test navigation on non-Canvas page → Graceful fallback

#### Phase 3 Deliverable

**Feature:** Hands-free Canvas navigation + multi-turn conversations

Users can now navigate Canvas entirely by voice and have natural conversations with the assistant that remember context from previous questions.

**User Value:**

- Complete hands-free workflow for mobility-impaired users
- Natural conversation flow for better UX
- Canvas-specific intelligence for student workflows

**Technical Achievement:**

- Navigation handler operational for Canvas LMS
- Conversation manager tracking interaction history
- Follow-up question detection working
- Enhanced context extraction with LMS metadata

---

### Phase 4: Writing Assistance & Production Polish (2-3 days)

**Goal:** Voice-based writing help + production-ready UX

**What Users Can Do (New in Phase 4):**

- Writing assistance: "Help me write a response to this email"
- Text improvement: "Improve this sentence" (with text selected)
- Grammar check: "Check grammar"
- Settings UI: Configure latency mode, activation method, model preferences
- Error recovery: Graceful handling of Ollama unavailable or model missing
- Interrupt handling: Stop assistant mid-speech by speaking

#### Files to Create

**1. `src/features/voiceAssistant/handlers/writing-handler.js` (~250 lines)**

```javascript
/**
 * Writing Handler
 *
 * Handles voice commands for writing assistance:
 * - Compose drafts
 * - Improve existing text
 * - Grammar checking
 * - Text insertion into DOM
 */
export class WritingHandler {
  constructor() {
    this.focusedElement = null;
  }

  async execute(action, context = {}) {
    switch (action) {
      case 'COMPOSE_DRAFT':
        return await this.composeDraft(context);

      case 'IMPROVE_TEXT':
        return await this.improveText(context);

      case 'CHECK_GRAMMAR':
        return await this.checkGrammar(context);

      default:
        throw new Error(`Unknown writing action: ${action}`);
    }
  }

  async composeDraft(context) {
    // Get context about what user wants to write
    const prompt = this.buildCompositionPrompt(context);

    // Send to Ollama
    const response = await chrome.runtime.sendMessage({
      action: 'VOICE_ASSISTANT_PROCESS',
      transcript: context.userRequest,
      pageContext: context.pageContext,
      latencyMode: context.latencyMode || 'conversational',
      prompt: prompt,
    });

    if (response.success) {
      // Insert generated text into focused element
      this.insertTextIntoFocusedElement(response.response);

      return {
        success: true,
        message: 'Draft inserted',
        text: response.response,
      };
    } else {
      return {
        success: false,
        error: response.error,
        message: 'Could not generate draft',
      };
    }
  }

  buildCompositionPrompt(context) {
    let prompt = `You are a writing assistant helping a student compose text.\n\n`;

    if (context.pageContext?.lmsData) {
      prompt += `Context: ${context.pageContext.lmsData.platform} ${context.pageContext.pageType}\n`;
      if (context.pageContext.lmsData.assignmentName) {
        prompt += `Assignment: ${context.pageContext.lmsData.assignmentName}\n`;
      }
    }

    prompt += `\nUser request: ${context.userRequest}\n\n`;
    prompt += `Generate appropriate text. Be concise, clear, and appropriate for academic context.\n`;
    prompt += `Return ONLY the text to be inserted, with no preamble or explanation.`;

    return prompt;
  }

  async improveText(context) {
    const selectedText = window.getSelection().toString().trim();

    if (!selectedText) {
      return {
        success: false,
        message: 'No text selected. Please select some text and try again.',
      };
    }

    const prompt = `Improve the following text for clarity, grammar, and style:\n\n"${selectedText}"\n\nProvide ONLY the improved version, no explanation.`;

    const response = await chrome.runtime.sendMessage({
      action: 'VOICE_ASSISTANT_PROCESS',
      transcript: 'improve this text',
      pageContext: { selectedText },
      latencyMode: context.latencyMode || 'conversational',
      prompt: prompt,
    });

    if (response.success) {
      // Replace selected text
      this.replaceSelectedText(response.response);

      return {
        success: true,
        message: 'Text improved',
        original: selectedText,
        improved: response.response,
      };
    } else {
      return {
        success: false,
        error: response.error,
        message: 'Could not improve text',
      };
    }
  }

  async checkGrammar(context) {
    const selectedText = window.getSelection().toString().trim() || context.fullText;

    if (!selectedText) {
      return {
        success: false,
        message: 'No text to check. Please select some text and try again.',
      };
    }

    const prompt = `Check the following text for grammar and spelling errors:\n\n"${selectedText}"\n\nList any errors found and corrections. If no errors, say "No errors found."`;

    const response = await chrome.runtime.sendMessage({
      action: 'VOICE_ASSISTANT_PROCESS',
      transcript: 'check grammar',
      pageContext: { selectedText },
      latencyMode: context.latencyMode || 'conversational',
      prompt: prompt,
    });

    if (response.success) {
      return {
        success: true,
        message: 'Grammar check complete',
        feedback: response.response,
      };
    } else {
      return {
        success: false,
        error: response.error,
        message: 'Could not check grammar',
      };
    }
  }

  insertTextIntoFocusedElement(text) {
    const element = document.activeElement;

    if (!element) {
      console.warn('[WritingHandler] No focused element');
      return false;
    }

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // Standard input/textarea
      const start = element.selectionStart || element.value.length;
      const end = element.selectionEnd || element.value.length;
      const before = element.value.substring(0, start);
      const after = element.value.substring(end);

      element.value = before + text + after;
      element.selectionStart = start + text.length;
      element.selectionEnd = start + text.length;

      // Trigger events for framework compatibility
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return true;
    } else if (element.isContentEditable) {
      // ContentEditable div
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // Move cursor to end
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      // Trigger input event
      element.dispatchEvent(new Event('input', { bubbles: true }));

      return true;
    }

    console.warn('[WritingHandler] Focused element not editable:', element.tagName);
    return false;
  }

  replaceSelectedText(newText) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    // Move cursor to end
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  }
}
```

**2. `src/features/voiceAssistant/ui/assistant-panel.js` (~200 lines)**

Optional floating button for activation (alternative to keyboard shortcut).

```javascript
/**
 * Assistant Floating Button
 *
 * Provides a floating button UI for activating the voice assistant.
 * Alternative to keyboard shortcut activation.
 */
export class AssistantFloatingButton {
  constructor(voiceAssistantController) {
    this.controller = voiceAssistantController;
    this.button = null;
    this.isVisible = false;
  }

  show() {
    if (!this.button) {
      this.createButton();
    }
    this.button.style.display = 'flex';
    this.isVisible = true;
  }

  hide() {
    if (this.button) {
      this.button.style.display = 'none';
      this.isVisible = false;
    }
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  createButton() {
    this.button = document.createElement('div');
    this.button.className = 'assist-floating-button';
    this.button.setAttribute('role', 'button');
    this.button.setAttribute('aria-label', 'Activate Voice Assistant');
    this.button.setAttribute('tabindex', '0');

    this.button.innerHTML = `
      <svg class="button-icon" width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="white" opacity="0.9" />
        <path d="M15 8 v10 M10 15 h10" stroke="#667eea" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    `;

    // Styling
    this.button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      cursor: pointer;
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    // Hover effect
    this.button.addEventListener('mouseenter', () => {
      this.button.style.transform = 'scale(1.1)';
      this.button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    });

    this.button.addEventListener('mouseleave', () => {
      this.button.style.transform = 'scale(1)';
      this.button.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
    });

    // Click handler
    attachInteractiveHandler(this.button, 'Activate Voice Assistant', () => {
      this.controller.activate();
    });

    document.body.appendChild(this.button);
  }
}
```

#### Files to Modify

**1. `src/popup/popup.html`**

Add Voice Assistant settings section.

```html
<!-- Add this section to popup.html -->
<div class="settings-section">
  <h3>Voice Assistant</h3>

  <label class="checkbox-label">
    <input type="checkbox" id="voiceAssistantEnabled" />
    <span>Enable Voice Assistant</span>
  </label>

  <div class="form-group">
    <label for="voiceAssistantLatency">Response Speed:</label>
    <select id="voiceAssistantLatency" class="form-select">
      <option value="realtime">Real-time (&lt;1s) - Quick answers</option>
      <option value="conversational" selected>Conversational (1-3s) - Balanced</option>
      <option value="background">Deep Analysis (3-10s) - Comprehensive</option>
    </select>
    <small class="help-text">Faster modes use lighter AI models</small>
  </div>

  <div class="form-group">
    <label for="voiceAssistantActivation">Activation:</label>
    <select id="voiceAssistantActivation" class="form-select">
      <option value="shortcut" selected>Keyboard Shortcut (Ctrl+Shift+A)</option>
      <option value="button">Floating Button</option>
      <option value="both">Both</option>
    </select>
  </div>

  <label class="checkbox-label">
    <input type="checkbox" id="voiceAssistantShowTranscript" checked />
    <span>Show Visual Transcript</span>
  </label>

  <details class="advanced-settings">
    <summary>Advanced Settings</summary>

    <div class="form-group">
      <label for="voiceAssistantModel">Preferred Model:</label>
      <select id="voiceAssistantModel" class="form-select">
        <option value="auto" selected>Auto-select (Recommended)</option>
        <option value="phi3:mini">Phi3 Mini (Fastest)</option>
        <option value="llama3.2">Llama 3.2</option>
        <option value="gemma3:4b">Gemma 3 4B</option>
        <option value="mistral:7b-instruct">Mistral 7B</option>
      </select>
      <small class="help-text">Leave on Auto unless you know what you're doing</small>
    </div>

    <div class="form-group">
      <label for="voiceAssistantContext">Context Detail:</label>
      <select id="voiceAssistantContext" class="form-select">
        <option value="minimal">Minimal (100 chars)</option>
        <option value="balanced" selected>Balanced (500 chars)</option>
        <option value="full">Full (2000 chars)</option>
      </select>
      <small class="help-text">More context = better answers but slower</small>
    </div>
  </details>
</div>
```

**2. `src/popup/popup.js`**

Add settings save/load logic.

```javascript
// Voice Assistant Settings Management

async function loadVoiceAssistantSettings() {
  const settings = await chrome.storage.local.get('assist_voice_assistant');
  const va = settings.assist_voice_assistant || {};

  document.getElementById('voiceAssistantEnabled').checked = va.enabled || false;
  document.getElementById('voiceAssistantLatency').value = va.latencyMode || 'conversational';
  document.getElementById('voiceAssistantActivation').value = va.activation || 'shortcut';
  document.getElementById('voiceAssistantShowTranscript').checked = va.showTranscript !== false;
  document.getElementById('voiceAssistantModel').value = va.model || 'auto';
  document.getElementById('voiceAssistantContext').value = va.contextLevel || 'balanced';
}

async function saveVoiceAssistantSettings() {
  const settings = {
    assist_voice_assistant: {
      enabled: document.getElementById('voiceAssistantEnabled').checked,
      latencyMode: document.getElementById('voiceAssistantLatency').value,
      activation: document.getElementById('voiceAssistantActivation').value,
      showTranscript: document.getElementById('voiceAssistantShowTranscript').checked,
      model: document.getElementById('voiceAssistantModel').value,
      contextLevel: document.getElementById('voiceAssistantContext').value,
    },
  };

  await chrome.storage.local.set(settings);

  // Notify content scripts of settings change
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'VOICE_ASSISTANT_SETTINGS_UPDATED',
          settings: settings.assist_voice_assistant,
        })
        .catch(() => {
          // Tab doesn't have content script, ignore
        });
    });
  });
}

// Add event listeners
document
  .getElementById('voiceAssistantEnabled')
  .addEventListener('change', saveVoiceAssistantSettings);
document
  .getElementById('voiceAssistantLatency')
  .addEventListener('change', saveVoiceAssistantSettings);
document
  .getElementById('voiceAssistantActivation')
  .addEventListener('change', saveVoiceAssistantSettings);
document
  .getElementById('voiceAssistantShowTranscript')
  .addEventListener('change', saveVoiceAssistantSettings);
document
  .getElementById('voiceAssistantModel')
  .addEventListener('change', saveVoiceAssistantSettings);
document
  .getElementById('voiceAssistantContext')
  .addEventListener('change', saveVoiceAssistantSettings);

// Load on popup open
document.addEventListener('DOMContentLoaded', async () => {
  await loadVoiceAssistantSettings();
  // ... other initialization ...
});
```

**3. `src/features/voiceAssistant/voice-assistant-controller.js`**

Add error recovery, interrupt handling, and settings integration.

```javascript
// Add to class

async loadSettings() {
  const stored = await chrome.storage.local.get('assist_voice_assistant');
  this.settings = stored.assist_voice_assistant || {
    enabled: false,
    latencyMode: 'conversational',
    activation: 'shortcut',
    showTranscript: true,
    model: 'auto',
    contextLevel: 'balanced'
  };

  // Apply settings
  if (this.settings.showTranscript && this.transcriptDisplay) {
    this.transcriptDisplay.show();
  } else if (this.transcriptDisplay) {
    this.transcriptDisplay.hide();
  }

  // Show/hide floating button
  if (this.settings.activation === 'button' || this.settings.activation === 'both') {
    if (!this.floatingButton) {
      this.floatingButton = new AssistantFloatingButton(this);
    }
    this.floatingButton.show();
  } else if (this.floatingButton) {
    this.floatingButton.hide();
  }
}

// Listen for settings changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VOICE_ASSISTANT_SETTINGS_UPDATED') {
    this.settings = message.settings;
    this.loadSettings(); // Reapply settings
  }
});

// Error recovery
async activate() {
  // Check if feature is enabled
  if (!this.settings.enabled) {
    await this.ttsController.speak('Voice assistant is disabled. Please enable it in settings.');
    return;
  }

  // Check Ollama availability
  try {
    const status = await chrome.runtime.sendMessage({ action: 'LOCAL_LLM_CHECK' });

    if (!status.available) {
      await this.showOllamaError();
      return;
    }

    // Check if recommended models are installed
    const latencyConfig = this.latencyManager.getConfig(this.settings.latencyMode);
    const hasRecommendedModel = status.models.some(m =>
      latencyConfig.modelPriority.some(pref => m.name.includes(pref))
    );

    if (!hasRecommendedModel) {
      await this.suggestModelInstallation(latencyConfig.modelPriority[0]);
      // Continue anyway with fallback
    }

  } catch (error) {
    console.error('[VoiceAssistant] Availability check failed:', error);
    await this.showOllamaError();
    return;
  }

  // Normal activation
  this.isActive = true;
  await this.sttController.startListening();
  this.listeningIndicator.show('listening', this.settings.latencyMode);

  if (this.settings.showTranscript) {
    this.transcriptDisplay.show();
  }
}

async showOllamaError() {
  const message = 'Voice assistant requires Ollama to be running. Please start Ollama or use the manual features instead. Simple voice commands like "read this" and "pause" will still work.';

  this.listeningIndicator.showError(message);
  await this.ttsController.speak(message);

  // Enable simple-commands-only mode
  this.simpleCommandsOnly = true;
}

async suggestModelInstallation(modelName) {
  const message = `For best ${this.settings.latencyMode} performance, consider installing ${modelName}. Continuing with available models.`;

  console.warn('[VoiceAssistant]', message);
  // Don't speak this - just log it
}

// Interrupt handling
onSpeechStart() {
  // User started speaking
  if (this.ttsController.isSpeaking()) {
    // Pause TTS to avoid conflict
    this.ttsController.pause();
    this.interruptedTTS = true;
  }
}

onSpeechEnd(transcript) {
  if (this.interruptedTTS) {
    // Check if user said interrupt command
    const lower = transcript.toLowerCase().trim();
    if (lower === 'stop' || lower === 'cancel' || lower === 'never mind') {
      // User wanted to stop
      this.ttsController.stop();
      this.interruptedTTS = false;
      this.listeningIndicator.hide();
      return;
    } else {
      // New query - process it
      this.ttsController.stop();
      this.interruptedTTS = false;
      this.processInput(transcript);
    }
  } else {
    // Normal processing
    this.processInput(transcript);
  }
}
```

**4. `src/features/voiceAssistant/command-classifier.js`**

Add writing command patterns.

```javascript
// Add to simplePatterns object

WRITING: [
  { patterns: ['help me write', 'compose', 'draft'],
    action: 'COMPOSE_DRAFT' },
  { patterns: ['improve this', 'make this better', 'rewrite this'],
    action: 'IMPROVE_TEXT' },
  { patterns: ['check grammar', 'grammar check', 'spelling'],
    action: 'CHECK_GRAMMAR' }
],
```

#### Testing Checklist for Phase 4

- [ ] Say "help me write a response" → AI generates draft and inserts into text field
- [ ] Select poorly written text, say "improve this" → Text is replaced with improved version
- [ ] Say "check grammar" with text selected → AI provides grammar feedback
- [ ] Open popup settings → All voice assistant settings visible and functional
- [ ] Change latency mode in settings → Next query uses new mode
- [ ] Enable floating button in settings → Button appears bottom-right
- [ ] Click floating button → Voice assistant activates
- [ ] Disable voice assistant in settings → Keyboard shortcut shows disabled message
- [ ] Stop Ollama, activate assistant → Shows graceful error, simple commands still work
- [ ] Speak while assistant is talking → Assistant pauses, processes new input
- [ ] Say "stop" while assistant is talking → Assistant stops immediately
- [ ] Test with missing model → Suggests installation, uses fallback model
- [ ] Full accessibility audit: keyboard-only navigation, screen reader, WCAG 2.2

#### Phase 4 Deliverable

**Feature:** Full-featured voice assistant, production-ready

Complete voice assistant with writing assistance, comprehensive settings UI, error recovery, and interrupt handling. Users have full control over behavior and can rely on graceful degradation when issues occur.

**User Value:**

- Complete hands-free writing workflow
- Customizable experience via settings
- Reliable operation with clear error messages
- Professional UX matching modern voice assistants

**Technical Achievement:**

- Writing handler operational (compose, improve, grammar)
- Settings UI fully integrated
- Error recovery and fallback strategies implemented
- Interrupt handling working correctly
- All accessibility requirements met (WCAG 2.2 Level AA)
- Production-ready code quality

---

## Technical Architecture Summary

### Privacy Architecture (Critical)

**Zero External API Calls Guarantee:**

```
[User Microphone]
       ↓ (audio stream)
[Web Speech API] ← Browser-local STT
       ↓ (text transcript)
[Content Script]
       ↓ (classification + context extraction)
[Service Worker]
       ↓ (HTTP to 127.0.0.1:11434 ONLY)
[Ollama Local Server]
       ↓ (AI response)
[Service Worker]
       ↓ (response text)
[Content Script]
       ↓ (text to speak)
[Web Speech API] ← Browser-local TTS
       ↓ (audio playback)
[User Speakers]
```

**Verification Steps:**

1. Open Chrome DevTools → Network tab
2. Activate voice assistant, ask questions
3. Filter: XHR/Fetch requests
4. Verify: ONLY requests to localhost:11434 (Ollama)
5. Verify: ZERO requests to external domains
6. Test: Disconnect WiFi → assistant still works (after model download)

### Model Selection Strategy

**Task-Based Routing:**

```javascript
// In service-worker.js TASK_OPTIMAL_MODELS
voiceAssistantNLU: {
  realtime: ['phi3:mini', 'llama3.2:3b'],     // <1s response
  conversational: ['llama3.2', 'gemma3:4b'],   // 1-3s response
  background: ['mistral:7b', 'qwen2.5:7b']     // 3-10s response
}
```

**Fallback Chain:**

1. Try first priority model for latency mode
2. If not installed, try next in priority list
3. If none installed, suggest installation
4. Use fastest available model as ultimate fallback

### Context Extraction Tiers

| Mode     | Chars | What's Included                             | Use Case           |
| -------- | ----- | ------------------------------------------- | ------------------ |
| Minimal  | 100   | Selected text + nearby text                 | Real-time commands |
| Balanced | 500   | Visible text + metadata + LMS data          | General Q&A        |
| Full     | 2000  | All text + headings + links + full LMS data | Deep analysis      |

### Event Handling Standard

**ALL interactive UI elements MUST use:**

```javascript
import { attachInteractiveHandler } from '../utils/event-handlers.js';

attachInteractiveHandler(element, 'Element Label', handlerFunction);
```

**Why:** Prevents race conditions with document-level listeners, provides visual feedback, handles cleanup correctly.

### Build & Deployment

```bash
# Development
npm run build         # Build to .vite/ directory
npm run dev           # Watch mode

# Testing
1. npm run build
2. Chrome → Load unpacked → Select .vite/ directory
3. Test on Canvas LMS and generic webpages
4. Check console for errors

# Deployment
1. npm run build
2. Verify .vite/ directory contents
3. Package as .zip for Chrome Web Store
```

---

## Browser API Capabilities - Comprehensive Reference

### Web Speech API (STT)

**What Works:**

- ✅ Continuous listening mode (`continuous: true`)
- ✅ Interim results (`interimResults: true`) for live transcription
- ✅ Multiple language support (`lang: 'en-US'`)
- ✅ Confidence scoring for recognition quality
- ✅ Offline capability (after initial setup)
- ✅ No special permissions required (user grants via browser UI)

**Browser Support:**

- Chrome/Edge: Full support (webkitSpeechRecognition)
- Firefox: Limited support
- Safari: Partial support

**Limitations:**

- Requires user gesture to start (can't auto-activate on page load)
- 60-second timeout for continuous listening (can be restarted)
- Accuracy varies by browser and accent

### Web Speech API (TTS)

**What Works:**

- ✅ Multiple voice selection (`speechSynthesis.getVoices()`)
- ✅ Rate, pitch, volume control
- ✅ Word-by-word boundary events (`onboundary`) for highlighting
- ✅ Pause, resume, cancel controls
- ✅ Fully offline
- ✅ No permissions required

**Browser Support:**

- Chrome/Edge/Safari: Full support
- All platforms (Windows, macOS, Linux, Android, iOS)

**Limitations:**

- Voice quality varies by OS (uses system TTS)
- Some browsers don't support `onboundary` (can't do word highlighting)
- Long text may be chunked automatically

### Chrome Extension APIs Used

**Permissions (in manifest.json):**

```json
{
  "permissions": [
    "storage", // Settings persistence
    "activeTab", // Current tab access
    "tabs", // Tab management
    "scripting" // Content script injection
  ],
  "optional_host_permissions": [
    "<all_urls>" // For non-LMS sites (user must grant)
  ]
}
```

**Commands API:**

```javascript
// Register keyboard shortcut
chrome.commands.onCommand.addListener(command => {
  if (command === 'voice_assistant_activate') {
    // Activate assistant
  }
});
```

**Storage API:**

```javascript
// Save settings
await chrome.storage.local.set({ assist_voice_assistant: settings });

// Load settings
const data = await chrome.storage.local.get('assist_voice_assistant');
```

**Scripting API:**

```javascript
// Inject content script dynamically
await chrome.scripting.executeScript({
  target: { tabId: tabId },
  files: ['src/content/content-simple.js'],
});
```

---

## Testing Strategy

### Unit Tests (Per Component)

```javascript
// Example: test/voice-assistant/command-classifier.test.js
describe('CommandClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new CommandClassifier();
  });

  it('should classify "read this" as TTS_CONTROL', () => {
    const result = classifier.classify('read this');
    expect(result.type).toBe('SIMPLE');
    expect(result.category).toBe('TTS_CONTROL');
    expect(result.action).toBe('READ_SELECTED');
    expect(result.confidence).toBe(1.0);
  });

  it('should classify "what is this about" as QUESTION', () => {
    const result = classifier.classify('what is this about');
    expect(result.type).toBe('QUESTION');
    expect(result.requiresAI).toBe(true);
  });

  it('should detect follow-up questions', () => {
    const result = classifier.classify('tell me more');
    expect(result.type).toBe('QUESTION');
    expect(result.requiresAI).toBe(true);
  });
});
```

### Integration Tests (E2E Scenarios)

```javascript
// Example: test/voice-assistant/integration.test.js
describe('Voice Assistant E2E', () => {
  beforeEach(async () => {
    // Mock Ollama responses
    mockOllamaClient();

    // Load test page
    await loadCanvasAssignmentPage();
  });

  it('should answer question about assignment', async () => {
    const controller = new VoiceAssistantController();
    await controller.initialize();
    await controller.activate();

    // Simulate STT result
    const response = await controller.processInput('what is this assignment about?');

    expect(response.success).toBe(true);
    expect(response.answer).toContain('essay');
    expect(response.answer).toContain('climate change');
  });

  it('should handle multi-turn conversation', async () => {
    const controller = new VoiceAssistantController();
    await controller.initialize();

    // First question
    await controller.processInput('what is this assignment?');

    // Follow-up
    const response = await controller.processInput('when is it due?');

    expect(response.success).toBe(true);
    expect(response.answer).toContain('March 15');
  });
});
```

### Manual Test Scenarios

**Phase 1 (TTS Control):**

1. Open Canvas assignment page
2. Select paragraph of text
3. Press Ctrl+Shift+A
4. Say "read this"
5. Verify: TTS starts reading selected text
6. Say "pause"
7. Verify: TTS pauses
8. Say "resume"
9. Verify: TTS resumes from pause point

**Phase 2 (AI Q&A):**

1. Open Canvas assignment page
2. Press Ctrl+Shift+A
3. Say "What is this assignment about?"
4. Verify: AI answers with assignment details
5. Verify: Answer includes assignment name, description
6. Verify: Transcript display shows both question and answer
7. Verify: Response spoken via TTS

**Phase 3 (Navigation & Context):**

1. Open Canvas course page
2. Press Ctrl+Shift+A
3. Say "go to assignments"
4. Verify: Navigates to assignments page
5. Press Ctrl+Shift+A
6. Say "what's the next assignment?"
7. Say "when is it due?"
8. Verify: Second question uses context from first

**Phase 4 (Writing & Settings):**

1. Open Canvas discussion reply field
2. Click into text field
3. Press Ctrl+Shift+A
4. Say "help me write a response about climate change"
5. Verify: AI generates draft and inserts into field
6. Open extension popup
7. Change latency mode to "real-time"
8. Repeat step 4
9. Verify: Response is faster (1s vs 3s)

### Accessibility Testing (WCAG 2.2)

**Keyboard Navigation:**

- [ ] All features accessible without mouse
- [ ] Ctrl+Shift+A activates assistant
- [ ] Escape key cancels/closes assistant
- [ ] Tab navigation works in transcript panel
- [ ] Settings UI fully keyboard-accessible

**Screen Reader:**

- [ ] Listening indicator has `role="status"` and `aria-live="polite"`
- [ ] Transcript display has `role="log"` and `aria-label`
- [ ] All buttons have `aria-label`
- [ ] Assistant state changes announced

**Visual:**

- [ ] Color contrast 4.5:1 minimum (use Chrome DevTools)
- [ ] No information conveyed by color alone
- [ ] Text resizable to 200% without breaking layout
- [ ] Animations can be paused/stopped

**Cognitive:**

- [ ] Clear visual feedback for all states
- [ ] Error messages are clear and actionable
- [ ] Help text available for complex features
- [ ] Consistent UI patterns throughout

---

## Deployment Checklist

**Before Release:**

- [ ] All 4 phases implemented and tested
- [ ] Unit tests pass (all components)
- [ ] Integration tests pass (E2E scenarios)
- [ ] Manual testing complete (all scenarios)
- [ ] Accessibility audit complete (WCAG 2.2 Level AA)
- [ ] Privacy verification complete (zero external calls)
- [ ] Error handling tested (Ollama down, models missing)
- [ ] Settings UI tested (all combinations)
- [ ] Build succeeds without errors (`npm run build`)
- [ ] Extension loads in Chrome without errors
- [ ] Tested on Canvas LMS (3+ different pages)
- [ ] Tested on generic webpages (3+ different sites)
- [ ] Performance acceptable (latency modes working as expected)
- [ ] Code review complete (follows CLAUDE.md standards)
- [ ] Documentation updated (README, user guide)

**Build & Package:**

```bash
# 1. Clean build
rm -rf .vite
npm run build

# 2. Verify build output
ls -la .vite/
# Should contain: manifest.json, assets/, background/, content/, popup/

# 3. Test extension
# Chrome → Extensions → Load unpacked → Select .vite/

# 4. Package for distribution (if publishing)
cd .vite
zip -r ../AssisT-VoiceAssistant-v1.0.zip .
cd ..
```

**Release Notes Template:**

```markdown
## AssisT Voice Assistant v1.0

### New Feature: Local Voice Assistant

Experience a privacy-first, hands-free AI assistant that never sends your data to the cloud!

**Key Features:**

- 🎙️ Voice-controlled TTS (read, pause, faster, slower)
- 🤖 AI-powered Q&A about course content (100% local via Ollama)
- ✍️ Writing assistance (compose, improve, grammar check)
- 🧭 Hands-free Canvas navigation
- 🔒 Complete privacy (zero cloud calls, works offline)
- ⚡ Configurable speed (real-time, conversational, deep analysis)

**How to Use:**

1. Ensure Ollama is running with llama3.2 model installed
2. Press Ctrl+Shift+A to activate voice assistant
3. Speak your command or question
4. Listen to AI-powered response

**Privacy Guarantee:**
All processing happens on your device. Your microphone input, questions, and AI responses NEVER leave your computer. Verify this yourself by checking browser DevTools Network tab - zero external API calls!

**Requirements:**

- Ollama installed and running (localhost:11434)
- At least one model installed (llama3.2 recommended)
- Chrome/Edge browser
- Microphone access granted

**Settings:**
Open extension popup → Voice Assistant section to customize:

- Response speed mode
- Activation method (keyboard shortcut or floating button)
- Visual transcript display
- Advanced: preferred model, context level

For more information, see the [Voice Assistant User Guide](link).
```

---

## Troubleshooting Guide

### Issue: "Voice assistant requires Ollama to be running"

**Cause:** Ollama server not running or not accessible on localhost:11434

**Solution:**

1. Start Ollama: `ollama serve` (or launch Ollama app)
2. Verify: `curl http://localhost:11434/api/tags`
3. If port conflict, check if another service is using port 11434

### Issue: "No suitable model installed"

**Cause:** Optimal model for latency mode not installed

**Solution:**

1. Check installed models: `ollama list`
2. Install recommended model:
   - Real-time mode: `ollama pull phi3:mini`
   - Conversational mode: `ollama pull llama3.2`
   - Background mode: `ollama pull mistral:7b-instruct`
3. Restart voice assistant

### Issue: Voice assistant not activating (no response to Ctrl+Shift+A)

**Cause:** Content script not injected or keyboard shortcut conflict

**Solution:**

1. Check browser console for errors
2. Verify extension is active: Chrome Extensions page
3. Reload page (Ctrl+R)
4. Check if another extension uses same shortcut
5. Try alternative activation: Enable floating button in settings

### Issue: STT not recognizing speech

**Cause:** Microphone access denied or browser STT not supported

**Solution:**

1. Grant microphone permission: Click camera icon in address bar
2. Check browser compatibility (Chrome/Edge recommended)
3. Test microphone: Open Chrome voice search
4. Check language setting (English recommended for best results)

### Issue: Responses are slow (>5s even in real-time mode)

**Cause:** Heavy model selected or system resources constrained

**Solution:**

1. Check Settings → Preferred Model: Set to "Auto" or "phi3:mini"
2. Check system resources: Is Ollama using 100% CPU?
3. Try smaller model: `ollama pull phi3:mini`
4. Reduce Context Detail: Settings → Context Detail → Minimal

### Issue: Assistant doesn't understand complex questions

**Cause:** Real-time mode uses lightweight models

**Solution:**

1. Switch to Conversational or Background mode in settings
2. Install better model: `ollama pull mistral:7b-instruct`
3. Use more specific questions
4. Provide context by selecting relevant text first

---

## Future Enhancements (Post-Phase 4)

### Wake Word Detection

- Integrate Porcupine.js or similar wake word library
- Custom wake word: "Hey AssisT"
- Requires continuous microphone access (privacy tradeoff)
- Battery optimization for laptops

### Vision Support

- Use Ollama llava model for image understanding
- "What's in this diagram?"
- "Read the text from this screenshot"
- OCR for handwritten notes

### Advanced Context

- Canvas API integration for structured data (assignments, grades, submissions)
- Cross-page context (remember previous assignment when on grades page)
- Learning profile (adapt to user's courses and interests)

### Voice Profiles

- Custom wake words per user
- Voice biometrics for personalization
- Accent adaptation for better STT accuracy

### Collaboration Features

- Summarize discussion threads
- Draft peer review comments
- Citation assistance

### Offline Improvements

- Bundled lightweight model (phi3:mini)
- No Ollama requirement for basic features
- Graceful degradation hierarchy

---

## Success Metrics

### Technical Metrics

- **Activation success rate:** >95% (user presses Ctrl+Shift+A → assistant activates)
- **Command recognition accuracy:** >90% (keyword-based commands)
- **Q&A response time:**
  - Real-time mode: <1s (median)
  - Conversational mode: 1-3s (median)
  - Background mode: 3-10s (median)
- **Privacy compliance:** 0 external API calls (verified via network monitoring)
- **Error rate:** <5% (AI failures, Ollama unavailable, etc.)

### User Experience Metrics

- **WCAG 2.2 Level AA compliance:** 100% (accessibility audit)
- **User satisfaction:** >4.0/5.0 (post-implementation survey)
- **Feature adoption:** >30% of active users try voice assistant (first week)
- **Retention:** >70% of users who try continue using (first month)

### Performance Metrics

- **Browser memory usage:** <50MB additional (with assistant active)
- **CPU usage:** <10% additional (during STT/TTS, excluding Ollama)
- **Build size:** <500KB additional (new code only)

---

## Conclusion

This comprehensive plan provides a complete roadmap for implementing a privacy-first, local voice assistant in the AssisT Chrome extension. The phased approach allows for:

1. **Rapid MVP delivery** (Phase 1: 2-3 days) - Immediate value with voice TTS control
2. **Progressive enhancement** (Phases 2-4: 8-10 days) - Add AI capabilities incrementally
3. **Risk mitigation** - Test and validate at each phase before proceeding
4. **User feedback integration** - Iterate based on real usage patterns

**Core Value Proposition:**

- **Privacy:** 100% local processing, zero cloud calls, works offline
- **Accessibility:** WCAG 2.2 Level AA compliance, multiple activation methods
- **Performance:** Configurable latency modes for speed vs. quality tradeoff
- **Usability:** Natural voice interaction with context awareness

**Differentiators from Alexa/Other Voice Assistants:**

- No wake word required (privacy-preserving push-to-talk)
- Complete offline capability after model download
- Educational context awareness (Canvas LMS integration)
- Open-source AI models (user choice, transparency)
- No subscription fees, no data collection, no vendor lock-in

This implementation transforms AssisT from a TTS/STT tool into a comprehensive voice-powered educational assistant that respects user privacy while delivering powerful AI capabilities.

**Ready for Implementation:** All architectural decisions made, component designs complete, integration points identified, testing strategy defined.

**Next Step:** Begin Phase 1 implementation!
