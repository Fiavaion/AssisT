# Sprint 7: Canvas Quiz Helper - Feature Specification

## Overview
Canvas Quiz Helper provides TTS reading and visual enhancements for Canvas LMS quiz pages, helping neurodivergent students navigate and complete quizzes more effectively.

## Feature Goals
1. **Reduce cognitive load** during quiz-taking
2. **Improve comprehension** by reading questions aloud
3. **Visual clarity** with question highlighting
4. **Easy navigation** between questions
5. **Non-intrusive** - works alongside existing TTS features

## User Stories

### US-1: Read Quiz Questions Aloud
**As a** student taking a Canvas quiz
**I want to** click on a question to have it read aloud
**So that** I can better comprehend complex questions

**Acceptance Criteria:**
- ✅ Clicking a question element triggers TTS
- ✅ Question text is read clearly
- ✅ Answer options are read as a list
- ✅ Visual highlight shows current question being read
- ✅ Pause/resume works with existing Space key shortcut

### US-2: Navigate Questions with Keyboard
**As a** student using keyboard navigation
**I want to** move between quiz questions without scrolling
**So that** I can efficiently review questions

**Acceptance Criteria:**
- ✅ Down Arrow moves to next question
- ✅ Up Arrow moves to previous question
- ✅ Enter key reads current question
- ✅ Visual indicator shows current question focus
- ✅ Smooth scrolling to focused question

### US-3: Auto-Detect Quiz Pages
**As a** student navigating Canvas
**I want** Quiz Helper to automatically activate on quiz pages
**So that** I don't have to manually enable it

**Acceptance Criteria:**
- ✅ Detects Canvas quiz pages via URL pattern
- ✅ Only activates if Quiz Helper is enabled in settings
- ✅ Shows toast notification when Quiz Helper activates
- ✅ Gracefully handles "Classic Quizzes" and "New Quizzes"

### US-4: Toggle Quiz Helper On/Off
**As a** student who doesn't need help on all quizzes
**I want to** toggle Quiz Helper on/off from the popup
**So that** I can control when the feature is active

**Acceptance Criteria:**
- ✅ Toggle switch in popup UI
- ✅ Collapsible options section
- ✅ Settings persist across sessions
- ✅ Can disable without affecting other TTS features

## Technical Design

### Architecture
- **Feature Isolation**: Follows established pattern from Sprint 3-6
- **Canvas Adapter Integration**: Uses existing `extractQuizQuestions()`
- **Event-Driven**: Listens for clicks and keyboard events
- **State Management**: Tracks current question index

### DOM Structure

#### Canvas Quiz Page Structure (Classic Quizzes)
```html
<div id="quiz_show" class="quiz-show">
  <div class="question" data-id="123">
    <div class="question_text">
      <p>What is the capital of France?</p>
    </div>
    <div class="answers">
      <div class="answer" data-id="1">
        <label>
          <input type="radio" name="question_123" value="1">
          <span class="answer_label">Paris</span>
        </label>
      </div>
      <div class="answer" data-id="2">
        <label>
          <input type="radio" name="question_123" value="2">
          <span class="answer_label">London</span>
        </label>
      </div>
      <!-- More answers -->
    </div>
  </div>
  <!-- More questions -->
</div>
```

#### New Quizzes Structure
```html
<div class="quiz-container">
  <div data-testid="question" role="group">
    <div class="question-text">
      <span>What is 2 + 2?</span>
    </div>
    <div class="answers">
      <div role="radio" aria-label="Answer: 4">
        <span>4</span>
      </div>
      <!-- More answers -->
    </div>
  </div>
</div>
```

### Selectors to Use
```javascript
// Question containers
const questionSelectors = [
  '.question',                    // Classic Quizzes
  '[data-testid="question"]',     // New Quizzes
  '.quiz_question',               // Alternative Classic
  '[role="group"][aria-labelledby]' // Accessible New Quizzes
];

// Question text
const questionTextSelectors = [
  '.question_text',
  '.question-text',
  '[data-testid="question-text"]',
  '.quiz-question-text'
];

// Answer options
const answerSelectors = [
  '.answer',
  '.answer_label',
  '[role="radio"]',
  '[role="checkbox"]',
  '[data-testid="answer-option"]'
];
```

### State Management
```javascript
// Quiz Helper State (Feature Isolated)
let quizHelper_enabled = false;
let quizHelper_currentQuestionIndex = -1;
let quizHelper_questions = [];
let quizHelper_navigationEnabled = true;
```

### Settings Schema
```javascript
settings.canvasQuizHelper = {
  enabled: false,                    // Master toggle
  autoRead: false,                   // Auto-read questions on focus
  highlightCurrentQuestion: true,    // Visual highlight
  readAnswers: true,                 // Include answer options in TTS
  keyboardNavigation: true,          // Enable arrow key navigation
  highlightColor: '#4A90E2',         // Question highlight color
  highlightOpacity: 0.3              // Border/background opacity
};
```

## UI Design

### Popup UI Section
```
┌─────────────────────────────────────────┐
│ 📝 Canvas Quiz Helper          [Toggle] │
│                                          │
│ Help with Canvas quizzes                │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ Question Reading                   │  │
│ │ ☑ Read answer options              │  │
│ │ ☑ Auto-read on focus               │  │
│ │                                    │  │
│ │ Visual Highlighting                │  │
│ │ ☑ Highlight current question       │  │
│ │ Color: [Blue ▼]                    │  │
│ │ Opacity: ▓▓▓▓░░░░░░ 30%           │  │
│ │                                    │  │
│ │ Keyboard Navigation                │  │
│ │ ☑ Enable arrow key navigation      │  │
│ │                                    │  │
│ │ ℹ️ Shortcuts:                       │  │
│ │ • Click question to read            │  │
│ │ • ↑/↓ arrows: Navigate              │  │
│ │ • Enter: Read current question      │  │
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Visual Indicators

#### Question Highlight (Active)
- **Border**: 3px solid highlight color with opacity
- **Background**: Subtle background tint (10% opacity)
- **Transition**: Smooth 0.3s ease

#### Question Hover State
- **Border**: 2px dashed highlight color
- **Cursor**: pointer
- **Opacity**: Slight increase

#### Question Navigation Indicator
Small floating badge showing "Question 3 of 10"

## Implementation Steps

### Phase 1: Basic Quiz Detection & UI (Task 3)
1. Add Quiz Helper section to `popup.html`
2. Add `setupCanvasQuizHelper()` to `popup.js`
3. Define default settings structure
4. Create toggle with collapsible options

### Phase 2: Content Script Integration (Task 4)
1. Import canvas-adapter functions into content-simple.js
2. Add Quiz Helper state variables
3. Create `quizHelper_init()` function
4. Detect Canvas quiz pages on load
5. Extract questions using `extractQuizQuestions()`
6. Inject click handlers on questions
7. Inject visual styling for questions

### Phase 3: TTS Reading Logic (Task 4)
1. Create `quizHelper_readQuestion(questionIndex)` function
2. Format question text for TTS
3. Optionally append answer options
4. Use existing TTS controls (voice, speed, pitch)
5. Highlight question being read

### Phase 4: Keyboard Navigation (Task 4)
1. Create `quizHelper_navigateToQuestion(index)` function
2. Add keyboard event listener (ArrowDown, ArrowUp, Enter)
3. Update current question index
4. Scroll to question smoothly
5. Update visual indicator

### Phase 5: Visual Enhancements (Task 4)
1. Create `quizHelper_highlightQuestion(element)` function
2. Apply border and background styling
3. Remove previous highlights
4. Add hover effects
5. Show question counter badge

### Phase 6: Settings Persistence (Task 4)
1. Load settings from storage on init
2. Listen for settings changes
3. Update behavior in real-time
4. Handle enable/disable toggle

## Testing Checklist (Task 5)

### Functional Tests
- [ ] Enable Quiz Helper toggle in popup
- [ ] Navigate to Canvas quiz page (classic)
- [ ] Verify toast notification appears
- [ ] Click question, verify TTS reads it
- [ ] Verify question highlights during reading
- [ ] Press Down Arrow, verify moves to next question
- [ ] Press Up Arrow, verify moves to previous question
- [ ] Press Enter, verify reads current question
- [ ] Toggle "Read answer options", verify behavior changes
- [ ] Change highlight color, verify updates in real-time
- [ ] Adjust opacity, verify visual change
- [ ] Disable Quiz Helper, verify no interaction on quiz page
- [ ] Test on "New Quizzes" page (if available)

### Edge Cases
- [ ] Quiz with single question (navigation disabled)
- [ ] Quiz with no questions detected (graceful fallback)
- [ ] Quiz with images in questions (read alt text)
- [ ] Quiz with math equations (read LaTeX/MathML)
- [ ] Multiple quizzes on same page
- [ ] Quiz loaded dynamically (SPA navigation)

### Integration Tests
- [ ] Quiz Helper + TTS (both enabled)
- [ ] Quiz Helper + Focus Mode
- [ ] Quiz Helper + Reading Guide
- [ ] Quiz Helper + Screen Overlay
- [ ] Quiz Helper keyboard shortcuts don't conflict with TTS shortcuts

### Performance Tests
- [ ] Quiz with 50+ questions (no lag)
- [ ] Rapid keyboard navigation (smooth scrolling)
- [ ] Multiple page loads (no memory leaks)

## Success Metrics
- ✅ Works on Canvas quiz pages (classic and new)
- ✅ Questions can be read aloud with one click
- ✅ Keyboard navigation is smooth and intuitive
- ✅ Visual feedback is clear and non-distracting
- ✅ No conflicts with existing features
- ✅ Settings persist across sessions
- ✅ Feature can be toggled on/off easily

## Known Limitations (v1)
- Does not auto-submit quizzes
- Does not highlight correct/incorrect answers
- Does not read question feedback
- Does not work on third-party quiz platforms (Qualtrics, etc.)
- Keyboard shortcuts may conflict with Canvas native shortcuts

## Future Enhancements (Backlog)
- Auto-advance to next question after reading
- Read timer countdown aloud
- Summarize quiz instructions
- Export quiz questions to text file
- Support for equation reading (MathJax/LaTeX)
- Multi-language quiz support
- Analytics: Track which questions were read most

## Dependencies
- ✅ Existing canvas-adapter.js (already implemented)
- ✅ Existing TTS system (already implemented)
- ✅ Existing settings persistence (already implemented)
- ✅ Existing keyboard shortcut handling (already implemented)

## File Changes Required
1. **src/popup/popup.html** - Add Quiz Helper UI section
2. **src/popup/popup.js** - Add `setupCanvasQuizHelper()` function
3. **src/content/content-simple.js** - Add Quiz Helper logic (import canvas-adapter, add event handlers)
4. **src/popup/popup.css** - Add Quiz Helper styling (optional, uses existing patterns)

## Commit Strategy
1. Single feature commit: `feat(canvas): add Canvas Quiz Helper with keyboard navigation`
2. Conventional commit format
3. Detailed commit message with testing instructions

---

**Status**: Specification Complete ✅
**Next Step**: Implement Quiz Helper UI in popup (Task 3)
**Estimated Effort**: 3-4 hours implementation + 1 hour testing
