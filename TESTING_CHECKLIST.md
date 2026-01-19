# @NCAD Extension - Complete Testing Checklist

## HEADER CONTROLS

### Header Buttons
- [ ] **Reset Button (🔄)** - Resets all settings to defaults
- [ ] **Help Button (❓)** - Opens help documentation
- [ ] **Settings Button (⚙️)** - Opens advanced options
- [ ] **Organize Button (📐)** - Toggles organize mode for layout customization
- [ ] **Discovery Quiz Button (🔍)** - Opens personalized tool discovery quiz

### Organize Mode (when activated)
- [ ] Drag and drop sections to reorder
- [ ] Click eye icon to hide/show sections
- [ ] Done button saves layout
- [ ] Layout persists after closing popup

---

## SECTION 1: READING HELP 🔊

### Read Aloud (TTS)
- [ ] **TTS Toggle** - Enable/disable text-to-speech
- [ ] **Voice Select Dropdown** - Choose TTS voice
- [ ] **Speed Slider** (0.5x - 2.0x) - Adjust speaking rate
- [ ] **Pitch Slider** (0.5 - 2.0) - Adjust voice pitch
- [ ] **Volume Slider** (0% - 100%) - Adjust volume level

### TTS Highlighting
- [ ] **Synchronized Highlighting Toggle** - Enable word highlighting during TTS
- [ ] **Highlight Color Picker** - Choose highlight color
- [ ] **Highlight Opacity Slider** (0% - 100%) - Adjust highlight transparency
- [ ] **Word-by-Word Toggle** - Enable word-by-word reading mode

### Reading Mode
- [ ] **Reading Mode Toggle** - Enable distraction-free reader
- [ ] **Exit Reading Mode Button** (top-right when active) - Test both click and ESC key
- [ ] Verify button shows "×" and "ESC" text
- [ ] Verify button turns red on hover

### Dyslexia Mode
- [ ] **Dyslexia Mode Toggle** - Apply dyslexia-friendly formatting
- [ ] **Intensity Slider** (1-5) - Adjust formatting strength

### Read from Images (OCR)
- [ ] **OCR Toggle** - Enable optical character recognition
- [ ] **Auto Reading Mode Toggle** - Automatically open reading mode for OCR
- [ ] **OCR Language Dropdown** - Select recognition language
- [ ] **Reading Mode Duration Slider** (5-60 seconds) - Auto-close timing
- [ ] **Auto TTS after OCR Toggle** - Automatically read extracted text
- [ ] **Confidence Threshold Slider** (50-100%) - OCR accuracy requirement

### Highlight Menu
- [ ] **Highlight Menu Toggle** - Enable text selection toolbar
- [ ] Select text on page to trigger menu
- [ ] Test all toolbar buttons:
  - [ ] 🔊 Read Aloud
  - [ ] 📖 Dictionary
  - [ ] 🌐 Translate
  - [ ] 📝 Annotate
  - [ ] 📋 Copy

---

## SECTION 2: WRITING HELP ✏️

### Speech-to-Text (STT)
- [ ] **STT Toggle** - Enable voice input
- [ ] **Microphone Button** (appears when enabled) - Start/stop recording
- [ ] Test voice input in text field
- [ ] Test pause/resume functionality

### STT Options
- [ ] **Auto-Punctuation Toggle** - Add punctuation automatically
- [ ] **Voice Commands Toggle** - Enable voice control commands
- [ ] Test voice commands:
  - [ ] "new paragraph"
  - [ ] "delete that"
  - [ ] "period", "comma", "question mark"
- [ ] **Custom Vocabulary Toggle** - Enable custom word recognition

### Annotations
- [ ] **Annotations Toggle** - Enable inline notes
- [ ] **Storage Mode Dropdown** - Local/Sync storage selection
- [ ] **Default Color Dropdown** - Choose annotation color
- [ ] **Default Note Size Dropdown** - Small/Medium/Large
- [ ] **Auto-Save Toggle** - Automatically save annotations
- [ ] **Show Badge Toggle** - Display annotation count badge
- [ ] **Sidebar Auto-Open Toggle** - Auto-open sidebar when annotations present
- [ ] Test creating annotation by highlighting text
- [ ] Test annotation sidebar open/close
- [ ] Test citation manager button

### Citations
- [ ] **Citations Toggle** - Enable citation management
- [ ] Test citation detection
- [ ] Test citation manager panel

### Text Simplification
- [ ] **Text Simplification Toggle** - Enable AI text simplification
- [ ] Select complex text and trigger simplification

---

## SECTION 3: LOOK UP WORDS 📚

### Dictionary
- [ ] **Dictionary Toggle** - Enable dictionary lookup
- [ ] **Auto-Lookup Toggle** - Automatically look up selected words
- [ ] Test dictionary lookup by selecting word

### Translation
- [ ] **Translation Toggle** - Enable translation
- [ ] **Target Language Dropdown** - Select translation language
- [ ] Test translation by selecting text
- [ ] Test full-page translation option

---

## SECTION 4: PAGE DISPLAY 🎨

### Quiet Mode (NEW!)
- [ ] **Quiet Mode Toggle** - Hide all popups and notifications
- [ ] Enable and verify Text Stats badge disappears
- [ ] Enable feature and verify no toast notifications appear
- [ ] Disable and verify notifications return

### Text Customization
- [ ] **Text Customization Toggle** - Enable custom fonts/spacing
- [ ] **Font Family Dropdown** - Select from multiple font options:
  - [ ] System Default
  - [ ] Lexend
  - [ ] Atkinson Hyperlegible
  - [ ] OpenDyslexic
  - [ ] Andika
  - [ ] Comic Neue
  - [ ] Comic Sans MS
  - [ ] Arial
  - [ ] Verdana
- [ ] **Line Spacing Slider** (1.0 - 3.0) - Adjust line height
- [ ] **Letter Spacing Slider** (0% - 50%) - Adjust character spacing
- [ ] **Word Spacing Slider** (0% - 100%) - Adjust word spacing
- [ ] **Paragraph Spacing Slider** (0.5 - 4.0 em) - Adjust paragraph spacing

### Reading Guide
- [ ] **Reading Guide Toggle** - Enable ruler/line focus tool
- [ ] **Color Picker** - Choose guide color
- [ ] **Thickness Slider** (1-20px) - Adjust guide thickness
- [ ] **Opacity Slider** (0% - 100%) - Adjust guide transparency

### Focus Mode
- [ ] **Focus Mode Toggle** - Enable spotlight reading mode
- [ ] **Width Slider** (200-800px) - Adjust focus window width
- [ ] **Height Slider** (100-500px) - Adjust focus window height
- [ ] **Darkness Slider** (0% - 90%) - Adjust overlay opacity

### Screen Overlay
- [ ] **Screen Overlay Toggle** - Enable color tint overlay
- [ ] **Color Picker** - Choose overlay color
- [ ] **Opacity Slider** (0% - 80%) - Adjust overlay transparency

### Dark Mode
- [ ] **Dark Mode Toggle** - Enable dark color scheme
- [ ] **Auto Dark Mode Toggle** - Follow system dark mode preference

### Reduced Motion
- [ ] **Reduced Motion Toggle** - Disable animations
- [ ] Test with animations enabled/disabled

### Reading Progress
- [ ] **Reading Progress Toggle** - Enable progress tracking
- [ ] **Show Progress Bar Toggle** - Display visual progress bar
- [ ] Test scroll progress tracking

### Media Control
- [ ] **Media Control Toggle** - Enable pause media on TTS
- [ ] **Auto-Pause Toggle** - Automatically pause media
- [ ] Test with video/audio on page

### Pomodoro Timer
- [ ] **Pomodoro Toggle** - Enable focus timer
- [ ] **Work Duration Slider** (5-60 min) - Set work period
- [ ] **Break Duration Slider** (1-30 min) - Set short break
- [ ] **Long Break Slider** (5-45 min) - Set long break period
- [ ] **Auto-Start Work Toggle** - Automatically start work timer
- [ ] **Auto-Start Break Toggle** - Automatically start break timer
- [ ] Test timer start/pause/reset

### Stargardt Mode (Advanced Vision)
- [ ] **Stargardt Mode Toggle** - Enable specialized vision assistance
- [ ] **Cursor Avoidance Toggle** - Enable cursor blind spot avoidance
- [ ] **Cursor Size Slider** (20-80px) - Adjust avoidance zone size
- [ ] **Magnification Toggle** - Enable magnifier lens
  - [ ] **Scale Slider** (1.5x - 5.0x) - Magnification power
  - [ ] **Lens Size Slider** (100-400px) - Magnifier window size
  - [ ] **Offset Slider** (50-300px) - Distance from cursor
- [ ] **Content Remapping Toggle** - Enable blind spot content repositioning
- [ ] **Remap Delay Slider** (100-1000ms) - Delay before remap
- [ ] **Color Inversion Toggle** - Invert colors for better contrast
- [ ] **Scotoma Size Toggle** - Adjust blind spot size estimation
- [ ] **Letter Spacing Slider** (100% - 250%) - Enhanced letter spacing
- [ ] **Line Height Slider** (100% - 300%) - Enhanced line height
- [ ] **High Contrast Toggle** - Enable maximum contrast mode
- [ ] **Brightness Boost Slider** (20% - 100%) - Adjust brightness

---

## SECTION 5: SCHOOL TOOLS 🎓

### Canvas Integration
- [ ] **Canvas Toggle** - Enable Canvas LMS integration
- [ ] **Show Badges Toggle** - Display Canvas badges
- [ ] **Auto-Sync Toggle** - Automatically sync Canvas data
- [ ] Test on Canvas page

### Moodle Integration
- [ ] **Moodle Toggle** - Enable Moodle LMS integration
- [ ] Test on Moodle page

### Google Classroom Integration
- [ ] **Google Classroom Toggle** - Enable GC integration
- [ ] Test on Google Classroom page

---

## SECTION 6: LOCAL AI 🤖 (LLM Edition)

### Local AI Master Toggle
- [ ] **Local AI Toggle** - Enable/disable all AI features
- [ ] Verify AI tools appear/disappear in Highlight Menu when toggled

### AI Reading Tools
- [ ] **Summarization Toggle** - Enable AI text summarization
- [ ] **Text Simplification Toggle** - Enable AI text simplification
- [ ] **Assignment Breakdown Toggle** - Enable AI task breakdown
- [ ] Test each by selecting text

### AI Learning Tools
- [ ] **Socratic Tutor Toggle** - Enable AI questioning
- [ ] **Knowledge Graph Toggle** - Enable concept visualization
- [ ] **Adaptive RSVP Toggle** - Enable speed reading
- [ ] Test Socratic Tutor with text selection

### AI Analysis Tools
- [ ] **Citation Analyzer Toggle** - Enable source analysis
- [ ] **Cognitive Monitor Toggle** - Enable focus tracking
- [ ] **Multi-Doc Compare Toggle** - Enable document comparison
- [ ] **Study Path Generator Toggle** - Enable learning path creation

---

## SECTION 7: CLOUD AI ☁️

### Cloud AI Master Toggle
- [ ] **Cloud AI Toggle** - Enable cloud-based AI features
- [ ] Verify requires API key setup

### Cloud AI Models
- [ ] **Haiku 4.5 Toggle** - Enable fast AI model
- [ ] **Sonnet 4.5 Toggle** - Enable balanced AI model
- [ ] **Opus 4.5 Toggle** - Enable advanced AI model

---

## KEYBOARD SHORTCUTS

Test all keyboard shortcuts:
- [ ] **Ctrl+Shift+R** - Toggle Reading Mode
- [ ] **Ctrl+Shift+T** - Toggle TTS
- [ ] **Ctrl+Shift+S** - Toggle STT
- [ ] **Ctrl+Shift+F** - Toggle Focus Mode
- [ ] **Ctrl+Shift+D** - Toggle Dark Mode
- [ ] **Ctrl+Shift+W** - Open Text Stats modal
- [ ] **ESC** - Exit Reading Mode (when active)

---

## CONTEXT MENU (Right-Click)

Test right-click menu options:
- [ ] **Read Selected Text** - TTS on selection
- [ ] **Translate Selected Text** - Translation on selection
- [ ] **Simplify Selected Text** - Simplification on selection
- [ ] **Look Up in Dictionary** - Dictionary on selection

---

## FLOATING UI ELEMENTS

### Text Stats Badge (bottom-right)
- [ ] Appears when enabled
- [ ] Shows word count and reading time
- [ ] Click to expand full stats modal
- [ ] Close button works
- [ ] Hidden in Quiet Mode

### Text Stats Modal
- [ ] Scope selector (Selection / Page / Document)
- [ ] Detailed statistics display correctly
- [ ] Progress bar (if target set)
- [ ] Refresh button updates stats
- [ ] Close button works

---

## SETTINGS PERSISTENCE

- [ ] Close and reopen popup - verify settings persist
- [ ] Reload extension - verify settings persist
- [ ] Test sync storage mode - verify settings sync across devices

---

## EDGE CASES

- [ ] Test with no text on page
- [ ] Test with non-English page
- [ ] Test with Canvas LMS page
- [ ] Test with Moodle page
- [ ] Test with Google Classroom page
- [ ] Test with PDF file
- [ ] Test with image-heavy page
- [ ] Test reading mode with article
- [ ] Test reading mode with non-article page
- [ ] Test OCR on image
- [ ] Test multiple features enabled simultaneously
- [ ] Test disabling all features
- [ ] Test reset button

---

## PERFORMANCE

- [ ] Extension doesn't slow down page load
- [ ] TTS responds quickly
- [ ] STT has minimal latency
- [ ] UI is responsive
- [ ] No console errors
- [ ] No memory leaks during extended use

---

## ACCESSIBILITY

- [ ] All toggles are keyboard accessible (Tab navigation)
- [ ] Screen reader announces toggle states
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators are visible
- [ ] All interactive elements have proper ARIA labels

---

## BROWSER COMPATIBILITY

- [ ] Chrome
- [ ] Edge
- [ ] Brave
- [ ] Opera (if applicable)

---

## NOTES

Use this format for bug reporting:
```
Feature: [Feature Name]
Steps to Reproduce:
1.
2.
3.
Expected:
Actual:
Browser:
Error Console:
```

---

**Total Interactive Elements: 200+ features, toggles, sliders, and buttons**

Last Updated: 2026-01-13
