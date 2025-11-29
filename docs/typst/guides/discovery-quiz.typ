// Discovery Quiz User Guide - NCAD Style
// Based on NCAD Brand Identity Guidelines 2025

// NCAD Color Palette
#let ncad-black = rgb("#000000")
#let ncad-white = rgb("#ffffff")
#let ncad-dark-grey = rgb("#3b3737")
#let ncad-light-grey = rgb("#938e8c")
#let ncad-orange = rgb("#f36f21")

// Page Setup
#set page(
  paper: "a4",
  margin: (top: 25mm, bottom: 20mm, left: 20mm, right: 20mm),
  numbering: "1",
  number-align: center,
)

// Typography
#set text(font: "Arial", size: 11pt, fill: ncad-dark-grey)
#set par(leading: 0.8em, justify: true)

// Heading Styles - Bold sans-serif (NCAD style)
#show heading.where(level: 1): it => {
  set text(font: "Arial", size: 24pt, weight: "bold", fill: ncad-black)
  v(1em)
  it.body
  v(0.5em)
}

#show heading.where(level: 2): it => {
  set text(font: "Arial", size: 14pt, weight: "bold", fill: ncad-black)
  v(1em)
  it.body
  v(0.3em)
}

#show heading.where(level: 3): it => {
  set text(font: "Arial", size: 12pt, weight: "bold", fill: ncad-dark-grey)
  v(0.8em)
  it.body
  v(0.2em)
}

// Orange accent for emphasis
#show strong: set text(fill: ncad-orange, weight: "bold")

// Tip box component
#let tip(body) = {
  block(
    width: 100%,
    inset: 12pt,
    radius: 4pt,
    fill: rgb("#fff8f0"),
    stroke: 1pt + ncad-orange,
  )[
    #text(weight: "bold", fill: ncad-orange)[Tip: ]#body
  ]
}

// Note box component
#let note(body) = {
  block(
    width: 100%,
    inset: 12pt,
    radius: 4pt,
    fill: rgb("#f5f5f5"),
    stroke: 1pt + ncad-light-grey,
  )[
    #text(weight: "bold", fill: ncad-dark-grey)[Note: ]#body
  ]
}

// Keyboard shortcut styling
#let kbd(key) = {
  box(
    inset: (x: 4pt, y: 2pt),
    radius: 3pt,
    fill: rgb("#f0f0f0"),
    stroke: 0.5pt + ncad-light-grey,
  )[#text(font: "Consolas", size: 10pt)[#key]]
}

// ============================================================================
// COVER PAGE
// ============================================================================

#align(center)[
  #v(6em)
  #text(size: 36pt, weight: "bold", fill: ncad-black)[Discovery Quiz]
  #v(0.5em)
  #text(size: 16pt, fill: ncad-light-grey)[User Guide]
  #v(0.5em)
  #line(length: 50%, stroke: 3pt + ncad-orange)
  #v(3em)
  #text(size: 12pt, fill: ncad-dark-grey)[
    Find the accessibility tools that match your learning style
  ]
  #v(1em)
  #text(size: 11pt, fill: ncad-light-grey)[AssisT Extension v1.0]
]

#pagebreak()

// ============================================================================
// TABLE OF CONTENTS
// ============================================================================

#align(center)[
  #text(size: 20pt, weight: "bold", fill: ncad-black)[Contents]
  #v(0.5em)
  #line(length: 30%, stroke: 2pt + ncad-orange)
]

#v(1em)

#set par(justify: false)
#block(inset: (left: 2em))[
  #text(weight: "bold")[1. Introduction] #box(width: 1fr, repeat[.]) 3\
  #text(weight: "bold")[2. Getting Started] #box(width: 1fr, repeat[.]) 3\
  #text(weight: "bold")[3. The Six Questions] #box(width: 1fr, repeat[.]) 4\
  #h(1em) 3.1 Reading Preferences #box(width: 1fr, repeat[.]) 4\
  #h(1em) 3.2 Writing Preferences #box(width: 1fr, repeat[.]) 4\
  #h(1em) 3.3 Focus & Attention #box(width: 1fr, repeat[.]) 5\
  #h(1em) 3.4 Visual Comfort #box(width: 1fr, repeat[.]) 5\
  #h(1em) 3.5 Organization #box(width: 1fr, repeat[.]) 5\
  #h(1em) 3.6 Language Support #box(width: 1fr, repeat[.]) 6\
  #text(weight: "bold")[4. Understanding Your Results] #box(width: 1fr, repeat[.]) 6\
  #text(weight: "bold")[5. Available Features] #box(width: 1fr, repeat[.]) 7\
  #text(weight: "bold")[6. Keyboard Navigation] #box(width: 1fr, repeat[.]) 8\
  #text(weight: "bold")[7. Retaking the Quiz] #box(width: 1fr, repeat[.]) 8\
  #text(weight: "bold")[8. Frequently Asked Questions] #box(width: 1fr, repeat[.]) 9\
]
#set par(justify: true)

#pagebreak()

// ============================================================================
// INTRODUCTION
// ============================================================================

= Introduction

The *Discovery Quiz* is a personalized assessment tool built into the AssisT extension. It helps you identify which accessibility features will be most useful for your learning style and preferences.

Everyone learns differently. Some people prefer to listen rather than read. Others find it easier to dictate their thoughts than type them. The Discovery Quiz asks six simple questions about your preferences and challenges, then recommends features tailored specifically to you.

*Key Benefits:*

- *Personalized recommendations* — Features ranked by relevance to your needs
- *Quick setup* — Complete the quiz in under 2 minutes
- *No wrong answers* — Every response helps customize your experience
- *Adjustable anytime* — Retake the quiz whenever your needs change

#tip[You don't need to enable every recommended feature. Start with the top recommendations and add more as needed.]

// ============================================================================
// GETTING STARTED
// ============================================================================

= Getting Started

Follow these steps to complete the Discovery Quiz:

=== Step 1: Open the Extension

Click the *AssisT icon* in your browser toolbar. If you don't see it, click the puzzle piece icon to find AssisT in your extensions list.

=== Step 2: Launch the Quiz

From the main popup, click the *"Discover Your Tools"* button. This opens the Discovery Quiz in a new panel.

=== Step 3: Answer the Questions

You'll be presented with six questions, one at a time. Each question has four answer options:

- *Not at all* — This doesn't apply to me
- *Sometimes* — I occasionally experience this
- *Often* — I frequently experience this
- *Always* — This is a constant challenge for me

Select the answer that best describes your experience. There are no right or wrong answers.

=== Step 4: Review Your Results

After answering all six questions, you'll see a personalized list of recommended features. Each feature shows a relevance score indicating how well it matches your responses.

=== Step 5: Enable Features

Click on any recommended feature to learn more about it, or toggle features on directly from the results screen.

#pagebreak()

// ============================================================================
// THE SIX QUESTIONS
// ============================================================================

= The Six Questions

The Discovery Quiz evaluates six key areas of learning preference. Each question is designed to identify specific challenges and match you with helpful tools.

== Reading Preferences

*Question: "Do you find reading on screen tiring or difficult?"*

This question identifies whether you might benefit from text-to-speech or visual reading aids.

*If you answer "Often" or "Always", you may be recommended:*
- Text-to-Speech (TTS) — Have text read aloud
- Reading Ruler — Visual guide to track your place
- Text Spacing — Increase space between letters and lines
- High Contrast Mode — Reduce visual strain

#note[Screen fatigue is common, especially during long study sessions. These tools can help reduce strain and improve comprehension.]

== Writing Preferences

*Question: "Do you find typing or writing challenging?"*

This question identifies whether you might benefit from speech input or writing assistance tools.

*If you answer "Often" or "Always", you may be recommended:*
- Speech-to-Text (STT) — Dictate instead of type
- Word Prediction — Suggestions as you type
- FixOver Correction — Multimodal error correction
- Grammar Support — Real-time writing feedback

== Focus & Attention

*Question: "Do you find it hard to focus when reading online?"*

This question identifies whether you might benefit from distraction-reduction tools.

*If you answer "Often" or "Always", you may be recommended:*
- Focus Mode — Remove distracting elements
- Reading Ruler — Visual focus guide
- Bionic Reading — Highlight key parts of words
- Line Highlighting — Emphasize the current line

#pagebreak()

== Visual Comfort

*Question: "Do bright screens or certain colours cause discomfort?"*

This question identifies whether you might benefit from display customization.

*If you answer "Often" or "Always", you may be recommended:*
- Dark Mode — Reduce overall brightness
- Colour Overlay — Tinted screen filters
- Custom Themes — Personalized colour schemes
- Reduced Motion — Minimize animations

#tip[Many users find that a subtle colour overlay (such as cream or light blue) reduces eye strain significantly.]

== Organization

*Question: "Do you need help organizing notes or finding information?"*

This question identifies whether you might benefit from organizational tools.

*If you answer "Often" or "Always", you may be recommended:*
- Note Extraction — Automatically gather key points
- Highlight Summary — Collect your highlights
- Page Outline — Navigate by headings
- Bookmark Manager — Quick access to saved pages

== Language Support

*Question: "Do you need help with translation or language support?"*

This question identifies whether you might benefit from multilingual features.

*If you answer "Often" or "Always", you may be recommended:*
- Translation — Convert text to your language
- Dictionary Lookup — Define words instantly
- Pronunciation Guide — Audio word pronunciation
- Simplified Language — Plain English alternatives

#pagebreak()

// ============================================================================
// UNDERSTANDING YOUR RESULTS
// ============================================================================

= Understanding Your Results

After completing the quiz, you'll see a results screen with personalized feature recommendations.

== Scoring System

Each feature receives a *relevance score* from 0 to 100 based on your responses:

#table(
  columns: (auto, 1fr),
  inset: 10pt,
  stroke: 0.5pt + ncad-light-grey,
  fill: (col, row) => if row == 0 { rgb("#f5f5f5") } else { white },
  [*Score Range*], [*Category*],
  [70 – 100], [*Highly Recommended* — These features closely match your needs],
  [40 – 69], [*Recommended* — These features may be helpful],
  [20 – 39], [*You Might Like* — Consider trying these features],
  [0 – 19], [Not shown — Low relevance to your responses],
)

== How Scores Are Calculated

Your answers directly influence which features are recommended:

- *"Always"* responses give maximum weight to related features
- *"Often"* responses give significant weight
- *"Sometimes"* responses give moderate weight
- *"Not at all"* responses give minimal weight

The algorithm considers feature combinations too. For example, if you indicate both reading difficulty and focus challenges, features that address both areas receive bonus points.

== Saving Your Results

Your quiz results are automatically saved in your browser. You can:

- View your results anytime from the extension popup
- See which features were recommended and your scores
- Track which recommendations you've enabled

#note[Your quiz data stays on your device and is never sent to external servers.]

#pagebreak()

// ============================================================================
// AVAILABLE FEATURES
// ============================================================================

= Available Features

Here's a complete list of features that may be recommended based on your quiz responses:

=== Reading Support

- *Text-to-Speech (TTS)* — Reads selected text aloud with adjustable voice and speed
- *Reading Ruler* — On-screen ruler that follows your cursor to help track lines
- *Bionic Reading* — Bolds the first portion of each word to guide eye movement
- *Line Highlighting* — Highlights the current line of text as you read

=== Writing Support

- *Speech-to-Text (STT)* — Convert spoken words to text in any input field
- *FixOver Correction* — Multimodal tool combining voice and visual correction
- *Word Prediction* — Suggests words as you type to speed up writing

=== Visual Comfort

- *Dark Mode* — Inverts page colours for reduced brightness
- *Colour Overlay* — Applies a tinted filter over the page
- *Custom Themes* — Create personalized colour schemes
- *Text Spacing* — Adjust letter, word, and line spacing

=== Focus Tools

- *Focus Mode* — Hides sidebars, ads, and other distractions
- *Page Simplifier* — Reduces visual complexity of web pages

=== Organization

- *Note Extraction* — Pulls key information from pages automatically
- *Highlight Summary* — Collects all your highlights in one place
- *Page Outline* — Shows navigable heading structure

=== Language

- *Translation* — Translates selected text or entire pages
- *Dictionary* — Provides definitions for highlighted words
- *Pronunciation* — Speaks words aloud with correct pronunciation

#pagebreak()

// ============================================================================
// KEYBOARD NAVIGATION
// ============================================================================

= Keyboard Navigation

The Discovery Quiz is fully accessible via keyboard. Use these shortcuts to navigate:

#table(
  columns: (auto, 1fr),
  inset: 10pt,
  stroke: 0.5pt + ncad-light-grey,
  fill: (col, row) => if row == 0 { rgb("#f5f5f5") } else { white },
  [*Key*], [*Action*],
  [#kbd("Tab")], [Move to next interactive element],
  [#kbd("Shift+Tab")], [Move to previous element],
  [#kbd("1") #kbd("2") #kbd("3") #kbd("4")], [Select answer option (1=Not at all, 4=Always)],
  [#kbd("Enter")], [Confirm selection and continue],
  [#kbd("Backspace")], [Go back to previous question],
  [#kbd("Escape")], [Close the quiz panel],
)

#tip[Screen reader users: The quiz announces each question and confirms your selections. All controls are properly labelled.]

== Focus Indicators

When navigating with keyboard, you'll see a visible focus ring around the currently selected element. This helps you track your position in the quiz.

// ============================================================================
// RETAKING THE QUIZ
// ============================================================================

= Retaking the Quiz

Your needs may change over time. You can retake the Discovery Quiz whenever you want updated recommendations.

=== To Retake the Quiz:

+ Open the AssisT extension popup
+ Go to Settings (gear icon)
+ Select *"Retake Discovery Quiz"*
+ Complete the quiz with your current preferences

Your new results will replace your previous recommendations. Any features you've already enabled will remain active—you can disable them manually if needed.

#note[Consider retaking the quiz at the start of each term, or when you notice changes in your learning needs.]

#pagebreak()

// ============================================================================
// FAQ
// ============================================================================

= Frequently Asked Questions

*Q: How long does the quiz take?*\
The quiz contains six questions and typically takes 1-2 minutes to complete.

*Q: Can I skip questions?*\
No, all six questions must be answered. If a question doesn't apply to you, select "Not at all."

*Q: Will my answers be shared with anyone?*\
No. All quiz data is stored locally in your browser and never transmitted externally.

*Q: What if I disagree with the recommendations?*\
The recommendations are suggestions based on your responses. You're free to enable or disable any feature regardless of its score.

*Q: Can I enable features that weren't recommended?*\
Yes. You can access all features from the main settings panel, even if they weren't in your quiz results.

*Q: Do I have to complete the quiz to use the extension?*\
No. The quiz is optional. You can skip it and manually explore features from the settings panel.

*Q: How do I reset my quiz results?*\
Go to Settings > Privacy > "Clear Quiz Data" to remove your saved results and start fresh.

#v(2em)

#align(center)[
  #line(length: 30%, stroke: 1pt + ncad-light-grey)
  #v(1em)
  #text(size: 10pt, fill: ncad-light-grey)[
    AssisT Extension — Accessibility for Everyone\
    For support, visit assist.ncad.ie
  ]
]
