// AI Integration Proposal - Concept Document
// Uses olive green brand guideline styling

#set document(
  title: "AI-Powered Accessibility Enhancement for AssisT",
  author: "AssisT Development Team",
)

#set page(
  paper: "a4",
  margin: (top: 2cm, bottom: 2cm, left: 2cm, right: 2cm),
  numbering: "1",
  number-align: right,
)

#set text(
  font: "Arial",
  size: 10pt,
  fill: rgb("#1A1A1A"),
)

#set par(
  justify: true,
  leading: 0.7em,
)

// Color Palette - Brand Guideline Style
#let brand-olive = rgb("#5C6B4A")
#let brand-gold = rgb("#C4A962")
#let brand-cream = rgb("#F5F3EE")
#let brand-black = rgb("#1A1A1A")
#let brand-grey = rgb("#6B6B6B")
#let brand-light-grey = rgb("#E8E6E1")

// Section header with large number
#let section(num, title) = {
  v(1em)
  grid(
    columns: (45pt, 1fr),
    gutter: 12pt,
    align(right + top)[#text(size: 42pt, fill: brand-light-grey, weight: "bold", font: "Georgia")[#num]],
    align(left + bottom)[
      #v(16pt)
      #text(size: 16pt, weight: "bold", fill: brand-black)[#title]
      #v(-2pt)
      #line(length: 40pt, stroke: 2pt + brand-olive)
    ]
  )
  v(0.6em)
}

// Subsection header
#let subsection(title) = {
  v(0.5em)
  text(size: 11pt, weight: "bold", fill: brand-olive)[#title]
  v(0.3em)
}

// Info card
#let info-card(content) = {
  block(
    width: 100%,
    inset: 12pt,
    radius: 3pt,
    fill: brand-cream,
  )[#content]
}

// Key point highlight
#let highlight-box(title, content) = {
  block(
    width: 100%,
    inset: 10pt,
    radius: 3pt,
    fill: brand-cream,
    stroke: 1pt + brand-light-grey,
  )[
    #text(weight: "bold", size: 9pt, fill: brand-olive)[#title]
    #v(4pt)
    #text(size: 9pt, fill: brand-grey)[#content]
  ]
}

// ============================================
// COVER PAGE
// ============================================

#align(center)[
  #v(3cm)

  #block(
    width: 100%,
    inset: 20pt,
    fill: brand-olive,
    radius: 0pt,
  )[
    #set text(hyphenate: false)
    #text(size: 26pt, weight: "bold", fill: white)[
      AI-Powered Accessibility Enhancement
    ]
    #v(8pt)
    #text(size: 14pt, fill: white)[
      for AssisT Browser Extension
    ]
  ]

  #v(1.5cm)

  #set text(hyphenate: false)
  #text(size: 16pt, fill: brand-grey)[
    Exploring Intelligent Support for Students with Learning Difficulties
  ]

  #v(3cm)

  #info-card[
    #grid(
      columns: (1fr, 1fr),
      gutter: 20pt,
      [
        #text(weight: "bold", fill: brand-olive)[Document Details]
        #v(8pt)
        #text(size: 9pt)[
          *Type:* Concept Proposal \
          *Date:* November 2025 \
          *Status:* For Discussion
        ]
      ],
      [
        #text(weight: "bold", fill: brand-olive)[Prepared By]
        #v(8pt)
        #text(size: 9pt)[
          AssisT Development Team
        ]
      ]
    )
  ]

  #v(2cm)

  #block(
    width: 80%,
    inset: 15pt,
    radius: 3pt,
    stroke: 2pt + brand-olive,
  )[
    #text(size: 11pt, weight: "bold", fill: brand-olive)[Overview]
    #v(8pt)
    #text(size: 9pt, fill: brand-grey)[
      This document explores how AI language processing could enhance the AssisT browser extension to provide intelligent, adaptive support for students with severe learning difficulties. The approach prioritises privacy through local processing while maintaining GDPR compliance.
    ]
  ]
]

#pagebreak()

// ============================================
// SECTION 1: THE OPPORTUNITY
// ============================================

#section("01", "The Opportunity")

#subsection("What We're Exploring")

Integrating AI language processing into AssisT to provide intelligent, adaptive support for students with severe learning difficulties—transforming how they access and understand educational content.

#subsection("Why This Matters Now")

Modern AI can understand context, simplify language, and adapt to individual needs in ways that weren't possible two years ago. Critically, this technology has matured to the point where it can run *locally on student devices*, ensuring privacy while delivering genuine educational value.

#subsection("The Gap We Could Fill")

Our current accessibility tools help students *access* content. AI enhancement could help them *understand* it.

#v(0.5em)

#table(
  columns: (1fr, 1fr),
  inset: 8pt,
  stroke: 0.5pt + brand-light-grey,
  fill: (col, row) => if row == 0 { brand-olive } else { white },

  [#text(fill: white, weight: "bold", size: 9pt)[What We Have Now]],
  [#text(fill: white, weight: "bold", size: 9pt)[What AI Could Add]],

  [#text(size: 9pt)[Text-to-speech reads content verbatim]],
  [#text(size: 9pt)[AI simplifies content _before_ reading it aloud]],

  [#text(size: 9pt)[Voice input captures raw speech]],
  [#text(size: 9pt)[AI corrects errors and improves grammar in real-time]],

  [#text(size: 9pt)[OCR extracts text from images]],
  [#text(size: 9pt)[AI explains diagrams and charts meaningfully]],

  [#text(size: 9pt)[Static accommodations (fonts, colours)]],
  [#text(size: 9pt)[Adaptive support based on individual student profile]],
)

// ============================================
// SECTION 2: WHO THIS COULD HELP
// ============================================

#section("02", "Who This Could Help")

#subsection("Students with Severe Learning Difficulties")

AI-powered accessibility could directly support students who struggle most with digital learning:

#columns(2, gutter: 15pt)[
  #highlight-box("Reading Difficulties (Dyslexia)")[
    - Complex text becomes accessible through intelligent simplification
    - Technical terms explained inline
    - Long passages broken into manageable chunks
  ]

  #v(8pt)

  #highlight-box("Attention Difficulties (ADHD)")[
    - Key points extracted automatically
    - Instructions converted to actionable checklists
    - Progress tracking keeps students oriented
  ]

  #colbreak()

  #highlight-box("Autism Spectrum)")[
    - Idioms and metaphors explained literally
    - Ambiguous instructions clarified
    - Consistent, predictable response format
  ]

  #v(8pt)

  #highlight-box("Processing Disorders")[
    - Multi-level simplification available
    - Visual content described comprehensively
    - Information in preferred modality
  ]
]

#subsection("What This Looks Like in Practice")

#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  [
    #block(
      width: 100%,
      inset: 10pt,
      radius: 3pt,
      fill: rgb("#FFF5F5"),
      stroke: 1pt + rgb("#FFCCCC"),
    )[
      #text(size: 8pt, weight: "bold", fill: rgb("#CC0000"))[Original Assignment Text]
      #v(4pt)
      #text(size: 8pt, style: "italic", fill: brand-grey)[
        "Analyse the socioeconomic factors that precipitated the industrial revolution, with particular emphasis on the agrarian transformations that displaced rural populations."
      ]
    ]
  ],
  [
    #block(
      width: 100%,
      inset: 10pt,
      radius: 3pt,
      fill: rgb("#F0FFF0"),
      stroke: 1pt + rgb("#90EE90"),
    )[
      #text(size: 8pt, weight: "bold", fill: rgb("#228B22"))[AI-Simplified Version]
      #v(4pt)
      #text(size: 8pt, fill: brand-grey)[
        "Explain why the Industrial Revolution happened. Focus on:
        • How farming changed
        • Why people moved to cities

        _Socioeconomic = related to money and society_"
      ]
    ]
  ]
)

#text(size: 9pt, style: "italic", fill: brand-grey)[This isn't dumbing down—it's making the same learning accessible.]

// ============================================
// SECTION 3: HOW IT WOULD WORK
// ============================================

#section("03", "How It Would Work")

#subsection("Privacy-First Approach")

The key insight is that AI can now run *locally*—on the student's own device—without sending data anywhere:

#v(0.5em)

#block(
  width: 100%,
  inset: 12pt,
  radius: 3pt,
  fill: brand-cream,
)[
  #grid(
    columns: (auto, 1fr),
    gutter: 10pt,
    row-gutter: 8pt,

    [#text(size: 18pt, fill: brand-olive, weight: "bold")[1]],
    [
      #text(weight: "bold", size: 9pt)[Browser-Native AI] #text(size: 9pt, fill: brand-grey)[(Default)] \
      #text(size: 8pt, fill: brand-grey)[Runs entirely on student's device. Nothing leaves the browser. Works offline.]
    ],

    [#text(size: 18pt, fill: brand-olive, weight: "bold")[2]],
    [
      #text(weight: "bold", size: 9pt)[Local Server] #text(size: 9pt, fill: brand-grey)[(Optional)] \
      #text(size: 8pt, fill: brand-grey)[Higher quality models for those who want them. Still completely local.]
    ],

    [#text(size: 18pt, fill: brand-olive, weight: "bold")[3]],
    [
      #text(weight: "bold", size: 9pt)[Cloud API] #text(size: 9pt, fill: brand-grey)[(Opt-in Fallback)] \
      #text(size: 8pt, fill: brand-grey)[Only with explicit consent. All personal data stripped first.]
    ],
  )
]

#v(0.5em)

#text(size: 9pt, weight: "bold", fill: brand-olive)[The principle:] #text(size: 9pt)[Local by default. Cloud only if the student chooses it.]

#subsection("What Students Would Experience")

#grid(
  columns: (1fr, 1fr, 1fr, 1fr),
  gutter: 8pt,

  block(inset: 8pt, radius: 3pt, fill: brand-cream)[
    #align(center)[
      #text(size: 16pt, fill: brand-olive, weight: "bold")[1]
      #v(4pt)
      #text(size: 8pt, weight: "bold")[Click "Simplify"]
      #v(2pt)
      #text(size: 7pt, fill: brand-grey)[on any Canvas page]
    ]
  ],

  block(inset: 8pt, radius: 3pt, fill: brand-cream)[
    #align(center)[
      #text(size: 16pt, fill: brand-olive, weight: "bold")[2]
      #v(4pt)
      #text(size: 8pt, weight: "bold")[Content Processed]
      #v(2pt)
      #text(size: 7pt, fill: brand-grey)[locally, in seconds]
    ]
  ],

  block(inset: 8pt, radius: 3pt, fill: brand-cream)[
    #align(center)[
      #text(size: 16pt, fill: brand-olive, weight: "bold")[3]
      #v(4pt)
      #text(size: 8pt, weight: "bold")[Simplified Version]
      #v(2pt)
      #text(size: 7pt, fill: brand-grey)[appears with key terms]
    ]
  ],

  block(inset: 8pt, radius: 3pt, fill: brand-cream)[
    #align(center)[
      #text(size: 16pt, fill: brand-olive, weight: "bold")[4]
      #v(4pt)
      #text(size: 8pt, weight: "bold")[Read Aloud]
      #v(2pt)
      #text(size: 7pt, fill: brand-grey)[the accessible version]
    ]
  ],
)

#v(0.5em)

No new interfaces to learn. It would integrate with tools students already use.

#pagebreak()

// ============================================
// SECTION 4: KEY FEATURES
// ============================================

#section("04", "Key Features")

#subsection("Content Simplification")

The highest-impact feature. AI rewrites complex academic text at an appropriate reading level while preserving meaning:

- Reduces sentence complexity
- Explains technical terms inline
- Breaks long passages into sections
- Maintains accuracy of the original content

#subsection("Writing Assistance")

Builds on our existing Speech-to-Text capability:

- Corrects transcription errors automatically
- Improves grammar and clarity
- Responds to voice commands ("make that shorter")
- Maintains the student's own voice

#subsection("Visual Content Description")

Goes beyond basic OCR:

- Explains what diagrams and charts *mean*
- Describes images in educational context
- Makes mathematical notation accessible
- Provides alternative access to visual learning materials

#subsection("Contextual Help")

An on-demand assistant that:

- Answers questions about course content
- Explains concepts in different ways
- Provides hints without giving answers
- Adapts to student comprehension level

// ============================================
// SECTIONS 5 & 6: REGULATORY + TECHNICAL (ONE PAGE)
// ============================================

#pagebreak()

// Compact section header for this page
#let mid-section(num, title) = {
  v(0.4em)
  grid(
    columns: (38pt, 1fr),
    gutter: 10pt,
    align(right + top)[#text(size: 36pt, fill: brand-light-grey, weight: "bold", font: "Georgia")[#num]],
    align(left + bottom)[
      #v(12pt)
      #text(size: 14pt, weight: "bold", fill: brand-black)[#title]
      #v(-2pt)
      #line(length: 35pt, stroke: 2pt + brand-olive)
    ]
  )
  v(0.4em)
}

#mid-section("05", "Regulatory Considerations")

#text(size: 8pt, weight: "bold", fill: brand-olive)[Our Approach:] #text(size: 8pt)[*Primary:* GDPR | *Secondary:* EU AI Act | *Also considered:* UK GDPR, US FERPA]

#v(0.3em)

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [
    #text(size: 8pt, weight: "bold", fill: brand-olive)[GDPR Compliance by Design]
    #v(0.2em)
    #table(
      columns: (1fr, 2fr),
      inset: 5pt,
      stroke: 0.5pt + brand-light-grey,
      fill: (col, row) => if row == 0 { brand-olive } else if calc.odd(row) { brand-cream } else { white },

      [#text(fill: white, weight: "bold", size: 7pt)[Principle]],
      [#text(fill: white, weight: "bold", size: 7pt)[How We'd Address It]],

      [#text(size: 7pt)[Data minimisation]],
      [#text(size: 7pt)[Only specific passages, never full documents]],

      [#text(size: 7pt)[Purpose limitation]],
      [#text(size: 7pt)[Accessibility only—no profiling or analytics]],

      [#text(size: 7pt)[Storage limitation]],
      [#text(size: 7pt)[Local cache, auto-deleted after 30 days]],

      [#text(size: 7pt)[Security]],
      [#text(size: 7pt)[Encryption in transit and at rest]],

      [#text(size: 7pt)[Transparency]],
      [#text(size: 7pt)[Clear disclosure when AI is processing]],
    )
  ],
  [
    #text(size: 8pt, weight: "bold", fill: brand-olive)[What Data Goes Where]
    #v(0.2em)
    #table(
      columns: (1fr, auto, auto, auto),
      inset: 5pt,
      stroke: 0.5pt + brand-light-grey,
      fill: (col, row) => if row == 0 { brand-olive } else { white },

      [#text(fill: white, weight: "bold", size: 7pt)[Data]],
      [#text(fill: white, weight: "bold", size: 7pt)[Local]],
      [#text(fill: white, weight: "bold", size: 7pt)[Cloud]],
      [#text(fill: white, weight: "bold", size: 7pt)[Stored]],

      [#text(size: 7pt)[Course content]], [#text(size: 7pt)[Yes]], [#text(size: 7pt)[Consent]], [#text(size: 7pt)[Temp]],
      [#text(size: 7pt)[Student IDs]], [#text(size: 7pt)[Never]], [#text(size: 7pt)[Never]], [#text(size: 7pt)[Never]],
      [#text(size: 7pt)[Writing]], [#text(size: 7pt)[Yes]], [#text(size: 7pt)[Anon.]], [#text(size: 7pt)[Session]],
    )
  ]
)

#mid-section("06", "Technical Approach")

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [
    #text(size: 8pt, weight: "bold", fill: brand-olive)[Local AI Options]
    #v(0.2em)
    #block(
      width: 100%,
      inset: 8pt,
      radius: 3pt,
      fill: brand-cream,
    )[
      #text(size: 7.5pt, weight: "bold")[Browser-Native (WebLLM)]
      #text(size: 7pt, fill: brand-grey)[ — Runs in browser, no install, works on Chromebooks]
      #v(4pt)
      #text(size: 7.5pt, weight: "bold")[Local Server (Ollama)]
      #text(size: 7pt, fill: brand-grey)[ — Higher quality, optional install, better for complex content]
    ]
  ],
  [
    #text(size: 8pt, weight: "bold", fill: brand-olive)[Model Quality Comparison]
    #v(0.2em)
    #table(
      columns: (1fr, 1fr, auto, auto),
      inset: 5pt,
      stroke: 0.5pt + brand-light-grey,
      fill: (col, row) => if row == 0 { brand-olive } else if calc.odd(row) { brand-cream } else { white },

      [#text(fill: white, weight: "bold", size: 7pt)[Model]],
      [#text(fill: white, weight: "bold", size: 7pt)[Location]],
      [#text(fill: white, weight: "bold", size: 7pt)[Quality]],
      [#text(fill: white, weight: "bold", size: 7pt)[Speed]],

      [#text(size: 7pt)[Phi-3]], [#text(size: 7pt)[Browser]], [#text(size: 7pt)[Good]], [#text(size: 7pt)[Fast]],
      [#text(size: 7pt)[Llama 3.2]], [#text(size: 7pt)[Local]], [#text(size: 7pt)[V. Good]], [#text(size: 7pt)[Med]],
      [#text(size: 7pt)[Cloud API]], [#text(size: 7pt)[External]], [#text(size: 7pt)[Excellent]], [#text(size: 7pt)[Fast]],
    )
  ]
)

#v(0.2em)
#text(size: 7.5pt, style: "italic", fill: brand-grey)[Browser-native models sufficient for most tasks. Local server or cloud available for complex content.]

#pagebreak()

// ============================================
// SECTION 7: IMPLEMENTATION CONSIDERATIONS
// ============================================

#section("07", "Implementation Considerations")

#subsection("Phased Approach")

This would be developed incrementally, with evaluation at each stage:

#v(0.5em)

#block(
  width: 100%,
  inset: 12pt,
  radius: 3pt,
  fill: brand-cream,
)[
  #grid(
    columns: (auto, 1fr),
    gutter: 12pt,
    row-gutter: 10pt,

    [#text(size: 14pt, fill: brand-olive, weight: "bold")[Phase 1]],
    [
      #text(weight: "bold", size: 9pt)[Foundation] \
      #text(size: 8pt, fill: brand-grey)[AI infrastructure, privacy framework, basic integration]
    ],

    [#text(size: 14pt, fill: brand-olive, weight: "bold")[Phase 2]],
    [
      #text(weight: "bold", size: 9pt)[Core Features] \
      #text(size: 8pt, fill: brand-grey)[Content simplification, writing assistance—the highest-impact features]
    ],

    [#text(size: 14pt, fill: brand-olive, weight: "bold")[Phase 3]],
    [
      #text(weight: "bold", size: 9pt)[Advanced Features] \
      #text(size: 8pt, fill: brand-grey)[Tutoring agent, image description, contextual help]
    ],

    [#text(size: 14pt, fill: brand-olive, weight: "bold")[Phase 4]],
    [
      #text(weight: "bold", size: 9pt)[Refinement] \
      #text(size: 8pt, fill: brand-grey)[Performance optimisation, based on user feedback]
    ],
  )
]

#subsection("Pilot Programme")

Before any wider rollout, we'd recommend:

- Small pilot with 50-75 students
- Diverse range of learning difficulties
- 6-8 weeks of structured feedback
- Clear success criteria before proceeding

#subsection("What Would Be Needed")

#columns(2, gutter: 15pt)[
  *To Start Development:*
  - Agreement to proceed with exploration
  - Access to test environment
  - Input from learning support team

  #colbreak()

  *For Pilot:*
  - Student participants (with consent)
  - Educator involvement
  - IT coordination for any local installs
]

// ============================================
// SECTIONS 8 & 9: FINAL PAGE
// ============================================

#pagebreak()

// Compact section header for final page
#let compact-section(num, title) = {
  v(0.3em)
  grid(
    columns: (35pt, 1fr),
    gutter: 10pt,
    align(right + top)[#text(size: 32pt, fill: brand-light-grey, weight: "bold", font: "Georgia")[#num]],
    align(left + bottom)[
      #v(10pt)
      #text(size: 14pt, weight: "bold", fill: brand-black)[#title]
      #v(-2pt)
      #line(length: 30pt, stroke: 2pt + brand-olive)
    ]
  )
  v(0.3em)
}

#compact-section("08", "Risks and Considerations")

#table(
  columns: (2fr, 3fr),
  inset: 6pt,
  stroke: 0.5pt + brand-light-grey,
  fill: (col, row) => if row == 0 { brand-olive } else if calc.odd(row) { brand-cream } else { white },

  [#text(fill: white, weight: "bold", size: 8pt)[Risk]],
  [#text(fill: white, weight: "bold", size: 8pt)[How We'd Address It]],

  [#text(size: 7.5pt)[AI produces inaccurate simplification]],
  [#text(size: 7.5pt)[Human review option, confidence indicators, feedback mechanism]],

  [#text(size: 7.5pt)[Students become over-reliant]],
  [#text(size: 7.5pt)[Scaffolding mode that gradually reduces assistance]],

  [#text(size: 7.5pt)[Technology doesn't meet expectations]],
  [#text(size: 7.5pt)[Phased approach with evaluation gates]],

  [#text(size: 7.5pt)[Educator concerns about AI]],
  [#text(size: 7.5pt)[Focus on accessibility, not answer generation; clear communication]],
)

#v(0.3em)
#text(size: 8pt, weight: "bold", fill: brand-olive)[Limitations:] #text(size: 8pt, fill: brand-grey)[AI simplification isn't perfect • Local models less capable than cloud • Some content harder to simplify • Device capability varies]

#compact-section("09", "Next Steps")

#block(
  width: 100%,
  inset: 10pt,
  radius: 3pt,
  fill: brand-cream,
)[
  #grid(
    columns: (auto, 1fr, auto, 1fr),
    gutter: 8pt,
    row-gutter: 6pt,

    [#text(size: 12pt, fill: brand-olive, weight: "bold")[1]],
    [#text(size: 8pt)[*Discussion* — Talk through the concept, gather input]],
    [#text(size: 12pt, fill: brand-olive, weight: "bold")[2]],
    [#text(size: 8pt)[*Proof of Concept* — Minimal working demo]],

    [#text(size: 12pt, fill: brand-olive, weight: "bold")[3]],
    [#text(size: 8pt)[*Stakeholder Input* — Learning support, IT, educators]],
    [#text(size: 12pt, fill: brand-olive, weight: "bold")[4]],
    [#text(size: 8pt)[*Decision Point* — Proceed or not]],
  )
]

#v(0.4em)
#text(size: 9pt, weight: "bold", fill: brand-olive)[Questions to Consider]
#v(0.2em)
#columns(2, gutter: 12pt)[
  #text(size: 8pt, fill: brand-grey)[
    • Would this meaningfully help our students? \
    • Which use cases should we prioritise?
  ]
  #colbreak()
  #text(size: 8pt, fill: brand-grey)[
    • What concerns need addressing? \
    • Who else should be involved?
  ]
]

#v(0.8em)

#align(center)[
  #block(
    width: 85%,
    inset: 12pt,
    radius: 3pt,
    stroke: 2pt + brand-olive,
  )[
    #text(size: 9pt, fill: brand-grey)[
      This is an early-stage concept for discussion. We'd welcome feedback and questions.
    ]
  ]
]

#v(0.6em)

#align(center)[
  #line(length: 25%, stroke: 1pt + brand-light-grey)
  #v(0.3cm)
  #text(size: 8pt, fill: brand-grey)[
    *AssisT Development Team* | November 2025
  ]
]
