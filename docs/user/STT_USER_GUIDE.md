# Speech-to-Text User Guide

AssisT Adaptive EdTech Extension - Complete STT Feature Guide

## Introduction

The Speech-to-Text (STT) feature in AssisT allows you to dictate text directly into Canvas LMS using your voice. This feature is designed with neurodivergent users in mind, offering customizable profiles and intelligent features to make voice input more accessible and effective.

## Getting Started

### Prerequisites

- Google Chrome browser
- A working microphone
- AssisT extension installed
- Microphone permissions granted to Chrome

### Enabling STT

1. **Open Canvas LMS** in Chrome
2. **Click** the AssisT extension icon in the toolbar
3. **Navigate** to the STT/Dictation section
4. **Click** the microphone button to start listening

### First-Time Setup

When you first use STT, you'll need to:

1. Grant microphone permissions when prompted
2. Choose your preferred STT profile (optional)
3. Test the microphone to ensure it's working

## Features

### 1. Real-Time Dictation

Speak naturally and watch your words appear in real-time:

- **Interim Results**: See words as you speak (light gray preview)
- **Final Results**: Confirmed transcription appears in normal text
- **Auto-Capitalization**: First letters are automatically capitalized

### 2. Voice Commands

Control your text hands-free with voice commands:

- **Delete text**: "Delete last word", "Scratch that"
- **Replace text**: "Replace hello with goodbye"
- **Navigate**: "Go to beginning", "Move left 3 words"
- **Format**: "Bold that", "New paragraph"

See [VOICE_COMMANDS_REFERENCE.md](VOICE_COMMANDS_REFERENCE.md) for the complete command list.

### 3. Smart Auto-Punctuation (Phase 2.7)

Automatically adds punctuation based on your speech patterns:

**Modes:**

- **Auto**: Full automatic punctuation (recommended)
- **Assisted**: Suggests punctuation you can accept/reject
- **Manual**: Only spoken punctuation commands work

**Features:**

- Detects questions by rising intonation and question words
- Adds periods at natural sentence endings
- Inserts commas based on pauses and linguistic patterns
- Auto-capitalizes after sentence endings

### 4. Confidence Feedback (Phase 2.7)

Visual feedback about transcription accuracy:

**Confidence Levels:**

- 🟢 **High** (80%+): Green indicator - high confidence
- 🟡 **Medium** (60-79%): Yellow indicator - moderate confidence
- 🔴 **Low** (<60%): Red indicator - may need review

**Features:**

- Real-time confidence badges
- Session statistics (words per minute, accuracy)
- Low-confidence word highlighting
- Alternative word suggestions

### 5. Custom Vocabulary (Phase 2.7)

Add custom words for better recognition:

**Adding Words:**

1. Open STT Settings
2. Go to "Custom Vocabulary"
3. Add words with optional phonetic hints
4. Words are saved and persist across sessions

**Vocabulary Presets:**

- **Medical**: Common medical terminology
- **Legal**: Legal terms and phrases
- **Academic**: Academic vocabulary
- **STEM**: Science, technology, engineering, math terms

**Auto-Learning:**
When enabled, the system learns from your corrections and suggests frequently used words.

### 6. Neurodivergent STT Profiles (Phase 2.7)

Pre-configured profiles optimized for different needs:

#### ADHD Focus Profile

- Extended silence timeout (allows thinking pauses)
- Minimal visual distractions
- Quick command support
- Burst dictation friendly

#### Dyslexia Support Profile

- Phonetic word matching
- Correction-friendly commands
- High contrast visual feedback
- Spelling assistance features

#### Autism Comfort Profile

- Consistent, predictable behavior
- Clear visual states
- No sudden changes
- Reduced sensory input

#### Anxiety Calm Profile

- Gentle visual feedback
- Generous timeouts
- Reassuring confirmations
- Easy error recovery

#### Low Vision Profile

- Extra large text
- High contrast colors
- Bold visual indicators
- Screen reader compatible

### Profile Quick-Switch

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to cycle through profiles.

## Settings

### Basic Settings

| Setting              | Description                 | Default |
| -------------------- | --------------------------- | ------- |
| Language             | Recognition language        | en-US   |
| Continuous Mode      | Keep listening after pauses | On      |
| Auto-Capitalize      | Capitalize first letters    | On      |
| Punctuation Commands | Voice punctuation           | On      |
| Voice Commands       | Editing commands            | On      |

### Advanced Settings

| Setting               | Description              | Default |
| --------------------- | ------------------------ | ------- |
| Auto-Punctuation      | Smart punctuation        | On      |
| Auto-Punctuation Mode | auto/assisted/manual     | auto    |
| Confidence Feedback   | Show accuracy feedback   | On      |
| Confidence Threshold  | Minimum confidence level | 60%     |
| Custom Vocabulary     | Enable custom words      | On      |
| Auto-Learn            | Learn from corrections   | On      |

## Tips for Better Recognition

### Environment

- Use a quiet environment when possible
- Position microphone 6-12 inches from mouth
- Avoid background noise (TV, music, etc.)

### Speaking

- Speak clearly at a moderate pace
- Pause briefly between sentences
- Don't shout - normal volume works best
- Enunciate difficult words

### Corrections

- Use "scratch that" for quick deletions
- Use "correct [word] to [word]" for typo fixes
- Review transcription periodically
- The system learns from your corrections

## Troubleshooting

### "Speech recognition not supported"

- Use Google Chrome (required for Web Speech API)
- Update Chrome to the latest version
- Check if another browser tab is using the microphone

### "Microphone permission denied"

1. Click the lock icon in the address bar
2. Find "Microphone" in the permissions list
3. Change to "Allow"
4. Refresh the page

### "No speech detected"

- Check microphone is connected and working
- Verify microphone is selected in Chrome settings
- Try speaking louder or closer to the mic
- Check for muted microphone in system settings

### "Recognition keeps stopping"

- Enable "Continuous Mode" in settings
- Check for network connectivity issues
- Try a different recognition language

### "Low accuracy/wrong words"

- Add frequently used words to Custom Vocabulary
- Use a profile suited to your needs
- Speak more clearly and slowly
- Try the phonetic hints feature

### "Commands not working"

- Ensure Voice Commands are enabled
- Speak the complete command
- Wait for the command indicator
- Try the basic form of the command

## Accessibility Features

### Keyboard Navigation

- `Tab`: Move between controls
- `Enter`: Activate button
- `Escape`: Stop recording
- `Ctrl+Shift+P`: Cycle profiles

### Screen Reader Support

- All controls have ARIA labels
- Status announcements for state changes
- Confidence feedback is screen reader friendly

### Visual Accessibility

- High contrast mode available
- Adjustable text sizes
- Color-blind friendly indicators
- Reduced motion option

## Privacy & Security

### Data Handling

- Audio is processed by Google's Speech API
- No audio is stored by AssisT
- Custom vocabulary stored locally only
- Session statistics not transmitted

### Permissions

- Microphone: Required for voice input
- Storage: For settings and vocabulary
- No other permissions required

## Getting Help

### In-App Help

- Click the "?" icon for contextual help
- Hover over settings for tooltips
- Check the command reference panel

### Documentation

- [Voice Commands Reference](VOICE_COMMANDS_REFERENCE.md)
- [Extension Settings Guide](../SETTINGS_GUIDE.md)
- [Accessibility Guide](../ACCESSIBILITY.md)

### Support

- Report issues on GitHub
- Check FAQ for common questions
- Contact support through Canvas

---

## Quick Reference

### Start/Stop

- **Start**: Click microphone button or press `Ctrl+M`
- **Stop**: Click again or press `Ctrl+M`
- **Pause**: Click pause button

### Common Commands

- "Delete last word"
- "Scratch that"
- "Undo"
- "Period" / "Question mark" / "Comma"
- "New paragraph"

### Profiles

- **Default**: Standard settings
- **ADHD**: Extended pauses, minimal UI
- **Dyslexia**: Phonetic matching, corrections
- **Autism**: Predictable, consistent
- **Anxiety**: Gentle, reassuring
- **Low Vision**: Large, high contrast

---

_AssisT Adaptive EdTech Extension - Making learning accessible for everyone_
