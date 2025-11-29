// =============================================================================
// AssisT Complete User Guide - Compact Edition
// NCAD Brand Identity Style - Two Column Layout with Cards
// =============================================================================

// NCAD Color Palette
#let ncad-black = rgb("#000000")
#let ncad-white = rgb("#ffffff")
#let ncad-dark-grey = rgb("#3b3737")
#let ncad-light-grey = rgb("#938e8c")
#let ncad-orange = rgb("#f36f21")

// Page Setup - Tighter margins for compact layout
#set page(
  paper: "a4",
  margin: (top: 18mm, bottom: 15mm, left: 15mm, right: 15mm),
  numbering: "1",
  number-align: center,
)

// Typography - Slightly smaller for compact layout
#set text(font: "Arial", size: 9.5pt, fill: ncad-dark-grey)
#set par(leading: 0.65em, justify: true)

// Heading Styles - More compact
#show heading.where(level: 1): it => {
  set text(font: "Arial", size: 16pt, weight: "bold", fill: ncad-black)
  v(0.6em)
  block(below: 0.4em)[
    #it.body
    #v(-0.2em)
    #line(length: 100%, stroke: 1.5pt + ncad-orange)
  ]
}

#show heading.where(level: 2): it => {
  set text(font: "Arial", size: 11pt, weight: "bold", fill: ncad-orange)
  v(0.5em)
  it.body
  v(0.2em)
}

// Orange accent for bold text
#show strong: set text(fill: ncad-orange, weight: "bold")

// Components
#let kbd(key) = {
  box(
    inset: (x: 3pt, y: 1pt),
    radius: 2pt,
    fill: rgb("#f0f0f0"),
    stroke: 0.5pt + ncad-light-grey,
  )[#text(font: "Consolas", size: 8pt)[#key]]
}

// Feature Card - compact box for features
#let feature-card(title, content) = {
  block(
    width: 100%,
    inset: 8pt,
    radius: 4pt,
    fill: rgb("#fafafa"),
    stroke: 0.5pt + ncad-light-grey,
  )[
    #text(weight: "bold", size: 10pt, fill: ncad-black)[#title]
    #v(2pt)
    #text(size: 9pt)[#content]
  ]
}

// Tip inline
#let tip(body) = {
  text(fill: ncad-orange, weight: "bold", size: 8pt)[TIP: ]
  text(size: 8pt, style: "italic")[#body]
}

// Small section card
#let info-card(title, items) = {
  block(
    width: 100%,
    inset: 8pt,
    radius: 4pt,
    fill: rgb("#fff8f0"),
    stroke: 1pt + ncad-orange,
  )[
    #text(weight: "bold", size: 9pt, fill: ncad-orange)[#title]
    #v(3pt)
    #text(size: 8.5pt)[#items]
  ]
}

// =============================================================================
// COVER PAGE - Compact
// =============================================================================

#align(center)[
  #v(3em)
  #text(size: 36pt, weight: "bold", fill: ncad-black)[AssisT]
  #v(0.2em)
  #text(size: 14pt, fill: ncad-light-grey)[User Guide]
  #v(0.3em)
  #line(length: 40%, stroke: 2.5pt + ncad-orange)
  #v(1.5em)
  #text(size: 11pt, fill: ncad-dark-grey)[Accessibility tools for reading, writing, and studying]
  #v(0.5em)
  #text(size: 9pt, fill: ncad-light-grey)[Version 1.0 • For neurodivergent learners]
]

#v(2em)

// Quick intro on cover page
#columns(2, gutter: 12pt)[
  #info-card("What AssisT Does")[
    • Reads text aloud for you\
    • Types what you say (voice input)\
    • Reduces page distractions\
    • Makes text easier to read\
    • Helps organize notes\
    • Translates and explains words
  ]

  #colbreak()

  #info-card("Who It's For")[
    • Students with dyslexia\
    • Students with ADHD\
    • Students with dysgraphia\
    • Non-native English speakers\
    • Anyone wanting easier studying
  ]
]

#pagebreak()

// =============================================================================
// GETTING STARTED + READING TOOLS
// =============================================================================

= Getting Started

#columns(2, gutter: 12pt)[
  == Installing AssisT

  + Open *Chrome* or *Edge* browser
  + Go to Chrome Web Store
  + Search for *"AssisT"*
  + Click *"Add to Chrome"*
  + Click *"Add Extension"*

  After installing, find the AssisT icon in your toolbar (top-right). Click the puzzle piece if you don't see it.

  #colbreak()

  == Discovery Quiz

  Take the 6-question quiz to get personalized tool recommendations.

  + Click the AssisT icon
  + Click *"Discover Your Tools"*
  + Answer 6 questions
  + Review recommendations
  + Click *"Apply"* to enable

  #tip[Retake anytime your needs change.]
]

#v(0.5em)

#block(
  width: 100%,
  inset: 8pt,
  radius: 4pt,
  fill: rgb("#f5f5f5"),
  stroke: 0.5pt + ncad-light-grey,
)[
  #text(weight: "bold", size: 9pt)[The 6 Quiz Questions: ]
  #text(size: 8.5pt)[
    *Reading* (screen fatigue?) • *Writing* (typing difficult?) • *Focus* (hard to concentrate?) • *Visual* (bright screens uncomfortable?) • *Organization* (need note help?) • *Language* (need translation?)
  ]
]

#v(0.8em)

= Reading Tools

#columns(2, gutter: 12pt)[
  #feature-card("Read Aloud (Text-to-Speech)")[
    Have any text read aloud with word highlighting.

    *Use:* Select text → #kbd("Alt+R") or click speaker

    *Controls:* #kbd("Space") pause • #kbd("Esc") stop • Adjust speed/voice in settings

    #tip[Great for proofreading—you'll hear mistakes!]
  ]

  #v(6pt)

  #feature-card("Reading Mode")[
    Removes distractions, shows clean text only.

    *Use:* Click AssisT → *Reading Mode* or #kbd("Alt+M")

    Hides ads, sidebars, navigation. Customize font and size in the simplified view.
  ]

  #colbreak()

  #feature-card("Reading Guide")[
    Coloured bar follows your mouse to track lines.

    *Use:* Toggle in AssisT popup

    Helps you not lose your place. Adjustable colour and thickness.
  ]

  #v(6pt)

  #feature-card("Dyslexia-Friendly Font")[
    Changes text to OpenDyslexic font.

    *Use:* Toggle *"Dyslexia Font"* in popup

    Letters have weighted bottoms—harder to confuse b/d, p/q. Reduces "flipping" effect.
  ]
]

#pagebreak()

// =============================================================================
// WRITING + FOCUS TOOLS
// =============================================================================

= Writing Tools

#columns(2, gutter: 12pt)[
  #feature-card("Voice Input (Speech-to-Text)")[
    Speak and your words appear as text.

    *Use:* Click in text box → #kbd("Alt+V") or mic icon → Speak → #kbd("Esc") to stop

    *Tips:* Speak at normal pace • Say punctuation ("comma", "full stop") • Use quiet environment • External mic works best
  ]

  #colbreak()

  #feature-card("Voice Commands")[
    Control writing with spoken commands:

    #table(
      columns: (1fr, 1fr),
      inset: 4pt,
      stroke: none,
      [*"new line"*], [New line],
      [*"new paragraph"*], [Blank line + new para],
      [*"delete that"*], [Delete last phrase],
      [*"undo"*], [Undo last action],
    )
  ]
]

#v(0.8em)

= Focus Tools

#columns(2, gutter: 12pt)[
  #feature-card("Focus Mode")[
    Dims distracting parts of the page.

    *Use:* #kbd("Alt+F") or toggle in popup

    Fades sidebars/ads, highlights main content. Click through faded areas if needed.
  ]

  #colbreak()

  #feature-card("Pomodoro Timer")[
    Work in focused bursts with breaks.

    *Cycle:* 25min work → 5min break → Repeat 4× → 15min long break

    *Use:* Open timer panel in popup → Click *Start*

    #tip[Great for ADHD—structured breaks prevent burnout.]
  ]
]

#v(0.8em)

= Visual Comfort

#columns(2, gutter: 12pt)[
  #feature-card("Dark Mode")[
    Dark pages with light text.

    *Options:* Dim • Dark • High Contrast • Auto (follows system)

    *Use:* Select level in AssisT popup
  ]

  #v(6pt)

  #feature-card("Colour Overlay")[
    Adds coloured tint over screen.

    *Use:* Select colour + adjust intensity in popup

    *Popular:* Yellow (reduces glare) • Blue (calming) • Pink • Green

    Helps with visual stress and Irlen syndrome.
  ]

  #colbreak()

  #feature-card("Text Customization")[
    Adjust text appearance on any page:

    • *Font size* — larger/smaller
    • *Line spacing* — between lines
    • *Letter spacing* — between letters
    • *Word spacing* — between words
    • *Font family* — change typeface

    *Use:* Adjust sliders in *Text Settings*
  ]
]

#pagebreak()

// =============================================================================
// STUDY + LANGUAGE TOOLS
// =============================================================================

= Study Tools

#columns(2, gutter: 12pt)[
  #feature-card("Annotations")[
    Add highlights and notes to any webpage.

    *Highlighting:* Select text → Choose colour (yellow/green/blue/pink) → Saved automatically

    *Sticky Notes:* Click anywhere → Type your note → Saved to that page

    View all annotations in sidebar. They appear when you return to the page.
  ]

  #colbreak()

  #feature-card("Citation Manager")[
    Save sources with automatic formatting.

    *Save:* Right-click page → *"Save Citation"* or use popup menu

    *Export formats:* Harvard • APA • MLA • Copy to clipboard

    Citation info captured automatically from the page.
  ]
]

#v(0.8em)

= Language Tools

#columns(2, gutter: 12pt)[
  #feature-card("Dictionary")[
    Look up any word instantly.

    *Use:* Double-click any word → Definition popup appears

    Shows pronunciation, example sentences. Works offline. Builds vocabulary list automatically.
  ]

  #colbreak()

  #feature-card("Translation")[
    Translate text or full pages.

    *Quick:* Select text → Click translate icon

    *Full page:* AssisT popup → *Translate Page* → Choose language
  ]
]

#v(0.8em)

= Keyboard Shortcuts

#block(
  width: 100%,
  inset: 10pt,
  radius: 4pt,
  fill: rgb("#f5f5f5"),
  stroke: 0.5pt + ncad-light-grey,
)[
  #columns(3, gutter: 8pt)[
    #text(size: 9pt)[
      #kbd("Alt+R") Read aloud\
      #kbd("Alt+V") Voice input
    ]
    #colbreak()
    #text(size: 9pt)[
      #kbd("Alt+M") Reading Mode\
      #kbd("Alt+F") Focus Mode
    ]
    #colbreak()
    #text(size: 9pt)[
      #kbd("Esc") Stop TTS/STT\
      #kbd("Space") Pause/Resume
    ]
  ]
  #v(4pt)
  #text(size: 8pt, fill: ncad-light-grey)[Customize shortcuts in Settings → Keyboard → Custom Shortcuts]
]

#pagebreak()

// =============================================================================
// SETTINGS + TROUBLESHOOTING + QUICK REF
// =============================================================================

= Settings & Troubleshooting

#columns(2, gutter: 12pt)[
  == Opening Settings

  Click AssisT icon → Gear icon (⚙️) → Browse categories → Changes save automatically

  == Reset to Defaults

  Settings → Scroll to bottom → *"Reset to Defaults"* → Confirm

  *Note:* Export settings first as backup!

  == Import/Export

  • *Export* — Save settings to file
  • *Import* — Load from saved file

  Use to transfer between computers.

  #colbreak()

  == Common Issues

  #text(size: 9pt)[
    *TTS not working?*
    Check volume • Try different voice • Refresh page • Check audio permission

    *Voice input not working?*
    Allow mic access • Check mic connected • Speak clearly • Try different browser

    *Features not appearing?*
    Press #kbd("F5") to refresh • Check enabled in settings • Try different site • Reinstall extension

    *Settings not saving?*
    Check storage permission • Clear cache • Export as backup
  ]
]

#v(1em)

= Quick Reference Card

#block(
  width: 100%,
  inset: 12pt,
  radius: 6pt,
  fill: rgb("#fff8f0"),
  stroke: 1.5pt + ncad-orange,
)[
  #columns(4, gutter: 10pt)[
    #text(weight: "bold", size: 9pt, fill: ncad-orange)[Reading]
    #text(size: 8.5pt)[
      TTS: #kbd("Alt+R")\
      Mode: #kbd("Alt+M")\
      Guide: Popup\
      Font: Popup
    ]

    #colbreak()

    #text(weight: "bold", size: 9pt, fill: ncad-orange)[Writing]
    #text(size: 8.5pt)[
      Voice: #kbd("Alt+V")\
      Stop: #kbd("Esc")\
      Commands:\
      Speak them!
    ]

    #colbreak()

    #text(weight: "bold", size: 9pt, fill: ncad-orange)[Focus]
    #text(size: 8.5pt)[
      Focus: #kbd("Alt+F")\
      Pomodoro:\
      Open in popup\
      Motion: Popup
    ]

    #colbreak()

    #text(weight: "bold", size: 9pt, fill: ncad-orange)[Visual]
    #text(size: 8.5pt)[
      Dark: Popup\
      Overlay: Popup\
      Text size:\
      Popup slider
    ]
  ]
]

#v(1.5em)

#align(center)[
  #block(
    inset: 12pt,
    radius: 6pt,
    fill: ncad-orange,
  )[
    #text(size: 11pt, weight: "bold", fill: white)[
      Remember: Start with 1-2 tools. Add more when ready!
    ]
  ]
]

#v(1.5em)

#align(center)[
  #line(length: 25%, stroke: 1pt + ncad-light-grey)
  #v(0.5em)
  #text(size: 8pt, fill: ncad-light-grey)[
    AssisT Extension • Accessibility for Everyone • assist.ncad.ie
  ]
]
