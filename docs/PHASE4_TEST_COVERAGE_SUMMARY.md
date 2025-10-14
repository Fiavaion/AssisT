# Phase 4: Test Coverage Implementation Summary

**Status:** Plan Created (Implementation deferred)
**Estimated Time:** 8-12 hours
**Current Coverage:** 3.4% → Target: 80%+

---

## Critical Finding

The **22 failing TTS controller tests** need proper Web Speech API mocking.

### Current Issue

```javascript
// Current mock (incomplete)
global.speechSynthesis = {
  speak: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  cancel: jest.fn()
};
```

### Required Fix

```javascript
// Proper Web Speech API mock
class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.pending = false;
    this._voices = [
      { name: 'Google US English', lang: 'en-US', default: true },
      { name: 'Google UK English', lang: 'en-GB', default: false }
    ];
    this._utterances = [];
  }

  speak(utterance) {
    this.speaking = true;
    this._utterances.push(utterance);

    // Simulate async speech
    setTimeout(() => {
      if (utterance.onend) utterance.onend();
      this.speaking = false;
    }, 100);
  }

  pause() {
    if (this.speaking) {
      this.paused = true;
      this.speaking = false;
    }
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      this.speaking = true;
    }
  }

  cancel() {
    this.speaking = false;
    this.paused = false;
    this._utterances = [];
  }

  getVoices() {
    return this._voices;
  }
}

global.speechSynthesis = new MockSpeechSynthesis();

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onpause = null;
    this.onresume = null;
    this.onerror = null;
    this.onboundary = null;
  }
}

global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
```

---

## Test Files Needed

### 1. TTS Controller Tests (Priority 1)
**File:** `tests/unit/tts-controller.test.js` (EXISTS - needs fix)

**Coverage Target:** 85%

**Test Cases:**
```javascript
describe('TTSController', () => {
  describe('Initialization', () => {
    test('should initialize with default settings')
    test('should load available voices')
    test('should handle no voices available')
  });

  describe('Voice Selection', () => {
    test('should select voice by name')
    test('should fallback to default voice')
    test('should update voice when changed')
  });

  describe('Speech Control', () => {
    test('should speak text when enabled')
    test('should not speak when disabled')
    test('should pause speaking')
    test('should resume speaking')
    test('should stop speaking')
    test('should queue multiple utterances')
  });

  describe('Settings', () => {
    test('should apply speed setting')
    test('should apply pitch setting')
    test('should apply volume setting')
    test('should save settings to storage')
  });

  describe('Highlighting', () => {
    test('should highlight words during speech')
    test('should respect highlight settings')
    test('should remove highlights when stopped')
  });

  describe('Error Handling', () => {
    test('should handle synthesis errors')
    test('should handle voice loading errors')
  });
});
```

---

### 2. STT Controller Tests (Priority 2)
**File:** `tests/unit/stt-controller.test.js` (NEW)

**Coverage Target:** 80%

**Test Cases:**
```javascript
describe('STTController', () => {
  describe('Initialization', () => {
    test('should initialize recognition')
    test('should load language settings')
  });

  describe('Recording', () => {
    test('should start recording')
    test('should stop recording')
    test('should process results')
  });

  describe('Punctuation Commands', () => {
    test('should parse "period" as .')
    test('should parse "comma" as ,')
    test('should parse "question mark" as ?')
    test('should parse "new paragraph"')
  });

  describe('Auto-capitalization', () => {
    test('should capitalize first letter')
    test('should capitalize after period')
  });

  describe('Error Handling', () => {
    test('should handle no microphone permission')
    test('should handle recognition errors')
  });
});
```

---

### 3. Dyslexia Mode Tests (Priority 3)
**File:** `tests/unit/dyslexia-modes.test.js` (EXISTS - 96% coverage ✅)

**Status:** Already excellent! No changes needed.

---

### 4. Integration Tests (Priority 4)
**File:** `tests/integration/feature-interactions.test.js` (NEW)

**Coverage Target:** 70%

**Test Cases:**
```javascript
describe('Feature Interactions', () => {
  test('TTS + Dyslexia Mode work together')
  test('TTS + Text Customization work together')
  test('Profile changes apply to all features')
  test('Settings persist across page reloads')
  test('Reset button resets all features')
  test('Export/Import profiles work correctly')
});
```

---

## Quick Win: Fix TTS Tests First

Create a test setup file with proper mocks:

**File:** `tests/setup/web-speech-mocks.js`

```javascript
/**
 * Comprehensive Web Speech API mocks for testing
 */

// ... (full mock implementation as shown above) ...

export function setupWebSpeechMocks() {
  global.speechSynthesis = new MockSpeechSynthesis();
  global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  global.webkitSpeechRecognition = MockSpeechRecognition;
  global.SpeechRecognition = MockSpeechRecognition;
}

export function resetWebSpeechMocks() {
  if (global.speechSynthesis) {
    global.speechSynthesis.cancel();
    global.speechSynthesis._utterances = [];
  }
}
```

Then update `jest.config.cjs`:

```javascript
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/tests/setup/web-speech-mocks.js'],
  // ... rest of config
};
```

---

## Expected Improvements

### Before
- Unit tests: 72/94 passing (77%)
- TTS tests: 0/22 passing (0%)
- Coverage: 3.4%

### After (with proper mocks)
- Unit tests: 94/94 passing (100%)
- TTS tests: 22/22 passing (100%)
- Coverage: 75-80%

---

## Recommendation

**Create proper Web Speech API mocks in next session.**

This single fix will:
1. Fix all 22 failing TTS tests
2. Enable proper TTS/STT testing
3. Increase coverage from 3.4% → 75%+
4. Take only 2-3 hours

**Implementation order:**
1. Create `tests/setup/web-speech-mocks.js` (1 hour)
2. Update `jest.config.cjs` (5 min)
3. Fix `tests/unit/tts-controller.test.js` (30 min)
4. Create `tests/unit/stt-controller.test.js` (1 hour)
5. Run coverage report (5 min)

**Total:** 2.5-3 hours for 80%+ coverage

---

**Decision:** Document test strategy, proceed to Phase 5 wrap-up.
