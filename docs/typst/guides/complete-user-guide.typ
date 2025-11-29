// =============================================================================
// AssisT Complete User Guide
// Brand Guideline Style - Clean, Minimal, Sophisticated
// =============================================================================

// Color Palette - Inspired by brand guideline aesthetic
#let brand-olive = rgb("#5C6B4A")
#let brand-gold = rgb("#C4A962")
#let brand-cream = rgb("#F5F3EE")
#let brand-black = rgb("#1A1A1A")
#let brand-grey = rgb("#6B6B6B")
#let brand-light-grey = rgb("#E8E6E1")

// Page Setup
#set page(
  paper: "a4",
  margin: (top: 20mm, bottom: 18mm, left: 20mm, right: 20mm),
  numbering: "1",
  number-align: right,
  fill: white,
)

// Typography
#set text(font: "Arial", size: 9pt, fill: brand-black)
#set par(leading: 0.7em, justify: true)

// Section number style
#let section-num(num) = {
  text(size: 72pt, fill: brand-light-grey, weight: "bold", font: "Arial")[#num]
}

// Section header with large number
#let section(num, title) = {
  v(0.5em)
  grid(
    columns: (50pt, 1fr),
    gutter: 12pt,
    align(right + top)[#text(size: 48pt, fill: brand-light-grey, weight: "bold")[#num]],
    align(left + bottom)[
      #v(20pt)
      #text(size: 18pt, weight: "bold", fill: brand-black)[#title]
      #v(-2pt)
      #line(length: 40pt, stroke: 2pt + brand-olive)
    ]
  )
  v(0.8em)
}

// Subsection style
#show heading.where(level: 2): it => {
  v(0.6em)
  text(size: 11pt, weight: "bold", fill: brand-olive)[#it.body]
  v(0.3em)
}

// Feature card
#let feature-card(title, content) = {
  block(
    width: 100%,
    inset: 10pt,
    radius: 3pt,
    fill: brand-cream,
  )[
    #text(weight: "bold", size: 9.5pt, fill: brand-black)[#title]
    #v(4pt)
    #text(size: 8.5pt, fill: brand-grey)[#content]
  ]
}

// Keyboard shortcut
#let kbd(key) = {
  box(
    inset: (x: 4pt, y: 2pt),
    radius: 2pt,
    fill: white,
    stroke: 0.5pt + brand-light-grey,
  )[#text(font: "Consolas", size: 8pt, fill: brand-black)[#key]]
}

// Accent text
#let accent(body) = text(fill: brand-olive, weight: "bold")[#body]

// =============================================================================
// COVER PAGE
// =============================================================================

#v(4em)

#align(center)[
  #text(size: 11pt, fill: brand-grey, tracking: 2pt)[USER GUIDE]
]

#v(2em)

#align(center)[
  #text(size: 42pt, weight: "bold", fill: brand-black)[ASSIST]
]

#v(0.5em)

#align(center)[
  #line(length: 60pt, stroke: 2.5pt + brand-olive)
]

#v(3em)

#align(center)[
  #text(size: 11pt, fill: brand-grey)[
    Accessibility tools for reading, writing, and studying
  ]
]

#v(6em)

// Two intro boxes
#grid(
  columns: (1fr, 1fr),
  gutter: 16pt,
  block(
    width: 100%,
    inset: 14pt,
    radius: 4pt,
    fill: brand-cream,
  )[
    #text(weight: "bold", size: 10pt, fill: brand-olive)[What It Does]
    #v(6pt)
    #text(size: 8.5pt, fill: brand-grey)[
      • Reads text aloud\
      • Types what you say\
      • Reduces distractions\
      • Makes text easier to read\
      • Organizes your notes\
      • Translates words
    ]
  ],
  block(
    width: 100%,
    inset: 14pt,
    radius: 4pt,
    fill: brand-cream,
  )[
    #text(weight: "bold", size: 10pt, fill: brand-olive)[Who It's For]
    #v(6pt)
    #text(size: 8.5pt, fill: brand-grey)[
      • Students with dyslexia\
      • Students with ADHD\
      • Students with dysgraphia\
      • Non-native English speakers\
      • Anyone wanting easier study
    ]
  ]
)

#v(1fr)

#align(center)[
  #text(size: 8pt, fill: brand-grey)[Version 1.0]
]

#pagebreak()

// =============================================================================
// CONTENTS
// =============================================================================

#v(1em)

#align(right)[
  #text(size: 24pt, weight: "bold", fill: brand-black)[CONTENTS]
  #v(-2pt)
  #align(right)[#line(length: 60pt, stroke: 2pt + brand-olive)]
]

#v(2em)

#set text(size: 9pt)

#grid(
  columns: (20pt, 1fr, 30pt),
  row-gutter: 8pt,
  [01], [GETTING STARTED #box(width: 1fr, repeat[.])], [3],
  [02], [READING TOOLS #box(width: 1fr, repeat[.])], [3],
  [03], [WRITING TOOLS #box(width: 1fr, repeat[.])], [4],
  [04], [FOCUS TOOLS #box(width: 1fr, repeat[.])], [4],
  [05], [VISUAL COMFORT #box(width: 1fr, repeat[.])], [4],
  [06], [STUDY TOOLS #box(width: 1fr, repeat[.])], [5],
  [07], [LANGUAGE TOOLS #box(width: 1fr, repeat[.])], [5],
  [08], [REFERENCE #box(width: 1fr, repeat[.])], [5],
)

#pagebreak()

// =============================================================================
// 01 GETTING STARTED
// =============================================================================

#section("01", "Getting Started.")

#columns(2, gutter: 16pt)[
  == Installing

  + Open #accent[Chrome] or #accent[Edge] browser
  + Go to Chrome Web Store
  + Search for #accent["AssisT"]
  + Click "Add to Chrome"
  + Click "Add Extension"

  Find the AssisT icon in your toolbar (top-right corner).

  #colbreak()

  == Discovery Quiz

  Take 6 questions to get personalized recommendations.

  + Click the AssisT icon
  + Click #accent["Discover Your Tools"]
  + Answer the questions
  + Review recommendations
  + Click "Apply" to enable

  _Retake anytime your needs change._
]

#v(0.6em)

#block(
  width: 100%,
  inset: 10pt,
  radius: 3pt,
  fill: brand-cream,
)[
  #text(weight: "bold", size: 8.5pt, fill: brand-olive)[The 6 Questions]
  #h(8pt)
  #text(size: 8pt, fill: brand-grey)[
    Reading • Writing • Focus • Visual • Organization • Language
  ]
]

#v(1em)

// =============================================================================
// 02 READING TOOLS
// =============================================================================

#section("02", "Reading Tools.")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  feature-card("Read Aloud")[
    Have text read aloud with word highlighting.

    #accent[Use:] Select text → #kbd("Alt+R")

    #kbd("Space") pause · #kbd("Esc") stop
  ],
  feature-card("Reading Mode")[
    Clean view without distractions.

    #accent[Use:] #kbd("Alt+M") or popup toggle

    Hides ads, sidebars, navigation.
  ],
  feature-card("Reading Guide")[
    Coloured bar tracks your reading line.

    #accent[Use:] Toggle in popup

    Adjustable colour and thickness.
  ],
  feature-card("Dyslexia Font")[
    OpenDyslexic font for easier reading.

    #accent[Use:] Toggle in popup

    Weighted letters reduce confusion.
  ],
)

#pagebreak()

// =============================================================================
// 03 WRITING TOOLS
// =============================================================================

#section("03", "Writing Tools.")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  feature-card("Voice Input")[
    Speak and words appear as text.

    #accent[Use:] #kbd("Alt+V") → Speak → #kbd("Esc")

    Say punctuation: "comma", "full stop"
  ],
  feature-card("Voice Commands")[
    Control writing by speaking.

    "new line" · "new paragraph"\
    "delete that" · "undo"
  ],
)

#v(1em)

// =============================================================================
// 04 FOCUS TOOLS
// =============================================================================

#section("04", "Focus Tools.")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  feature-card("Focus Mode")[
    Dims distracting page elements.

    #accent[Use:] #kbd("Alt+F") or popup

    Fades sidebars and ads.
  ],
  feature-card("Pomodoro Timer")[
    Work in focused 25-minute bursts.

    25min work → 5min break → repeat

    Open timer panel in popup.
  ],
)

#v(1em)

// =============================================================================
// 05 VISUAL COMFORT
// =============================================================================

#section("05", "Visual Comfort.")

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 10pt,
  feature-card("Dark Mode")[
    Dark pages, light text.

    Dim · Dark · High Contrast · Auto
  ],
  feature-card("Colour Overlay")[
    Tinted screen filter.

    Yellow · Blue · Pink · Green
  ],
  feature-card("Text Settings")[
    Adjust font size, spacing, family.

    Use sliders in popup.
  ],
)

#pagebreak()

// =============================================================================
// 06 STUDY TOOLS
// =============================================================================

#section("06", "Study Tools.")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  feature-card("Annotations")[
    Highlight text and add sticky notes.

    Select text → Choose colour\
    Click anywhere → Add note

    Saved automatically.
  ],
  feature-card("Citation Manager")[
    Save sources with formatting.

    Right-click → "Save Citation"

    Export: Harvard · APA · MLA
  ],
)

#v(1em)

// =============================================================================
// 07 LANGUAGE TOOLS
// =============================================================================

#section("07", "Language Tools.")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  feature-card("Dictionary")[
    Look up any word instantly.

    Double-click word → Definition

    Works offline. Builds vocabulary.
  ],
  feature-card("Translation")[
    Translate text or full pages.

    Select text → Translate icon\
    Or: Popup → Translate Page
  ],
)

#v(1em)

// =============================================================================
// 08 REFERENCE
// =============================================================================

#section("08", "Reference.")

== Keyboard Shortcuts

#block(
  width: 100%,
  inset: 12pt,
  radius: 3pt,
  fill: brand-cream,
)[
  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 8pt,
    [#kbd("Alt+R") Read aloud],
    [#kbd("Alt+M") Reading Mode],
    [#kbd("Esc") Stop],
    [#kbd("Alt+V") Voice input],
    [#kbd("Alt+F") Focus Mode],
    [#kbd("Space") Pause/Resume],
  )
]

#v(0.8em)

== Troubleshooting

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [
    #text(weight: "bold", size: 8.5pt)[TTS not working?]\
    #text(size: 8pt, fill: brand-grey)[Check volume · Try different voice · Refresh]
  ],
  [
    #text(weight: "bold", size: 8.5pt)[Voice input issues?]\
    #text(size: 8pt, fill: brand-grey)[Allow mic access · Check connection · Speak clearly]
  ],
)

#v(1fr)

// Footer
#align(center)[
  #block(
    inset: 12pt,
    radius: 4pt,
    fill: brand-olive,
  )[
    #text(size: 9pt, weight: "bold", fill: white)[
      Start with 1-2 tools. Add more when ready.
    ]
  ]
]

#v(1em)

#align(center)[
  #text(size: 7pt, fill: brand-grey)[
    AssisT Extension · Accessibility for Everyone · assist.ncad.ie
  ]
]
