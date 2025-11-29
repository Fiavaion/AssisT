// =============================================================================
// AssisT Documentation Template
// Professional branding for user guides and documentation
// =============================================================================

// -----------------------------------------------------------------------------
// Brand Colors
// -----------------------------------------------------------------------------
#let assist-black = rgb("#000000")
#let assist-orange = rgb("#f36f21")
#let assist-white = rgb("#ffffff")
#let assist-gray = rgb("#6b7280")
#let assist-light-gray = rgb("#f3f4f6")
#let assist-dark-gray = rgb("#1f2937")

// Secondary palette
#let assist-orange-light = rgb("#fef3e8")
#let assist-orange-dark = rgb("#c45a1a")
#let assist-success = rgb("#16a34a")
#let assist-warning = rgb("#eab308")
#let assist-error = rgb("#dc2626")
#let assist-info = rgb("#0ea5e9")

// -----------------------------------------------------------------------------
// Typography
// -----------------------------------------------------------------------------
#let body-font = "Segoe UI"
#let heading-font = "Segoe UI"
#let mono-font = "Consolas"

// -----------------------------------------------------------------------------
// Main Document Template
// -----------------------------------------------------------------------------
#let assist-doc(
  title: "Documentation",
  subtitle: none,
  version: "1.0",
  date: datetime.today(),
  author: "AssisT Team",
  doc,
) = {
  // Document metadata
  set document(
    title: title,
    author: author,
  )

  // Page setup
  set page(
    paper: "a4",
    margin: (top: 1.8cm, bottom: 1.8cm, left: 1.8cm, right: 1.8cm),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 8pt, fill: assist-gray)
        #grid(
          columns: (1fr, 1fr),
          align: (left, right),
          [AssisT User Guide],
          [#title],
        )
        #line(length: 100%, stroke: 0.3pt + assist-light-gray)
      ]
    },
    footer: context {
      set text(size: 8pt, fill: assist-gray)
      grid(
        columns: (1fr, 1fr, 1fr),
        align: (left, center, right),
        [AssisT],
        [#counter(page).display() / #counter(page).final().first()],
        [v#version],
      )
    },
  )

  // Text defaults
  set text(
    font: body-font,
    size: 10pt,
    fill: assist-dark-gray,
    lang: "en",
  )

  // Paragraph settings - compact
  set par(
    justify: true,
    leading: 0.55em,
    first-line-indent: 0pt,
    spacing: 0.5em,
  )

  // Block settings - tight spacing
  set block(breakable: true, spacing: 0.35em)

  // Make figures and tables breakable
  show figure: set block(breakable: true)
  show table: set block(breakable: true)

  // Heading styles
  set heading(numbering: none)

  show heading.where(level: 1): it => {
    v(0.2cm)
    block(below: 0.1cm)[
      #text(size: 14pt, weight: "bold", fill: assist-black, font: heading-font)[#it.body]
      #v(-2pt)
      #line(length: 100%, stroke: 2pt + assist-orange)
    ]
  }

  show heading.where(level: 2): it => {
    v(0.12cm)
    block(below: 0.06cm)[
      #text(size: 11pt, weight: "semibold", fill: assist-black, font: heading-font)[#it.body]
      #v(-2pt)
      #line(length: 40%, stroke: 1pt + assist-orange)
    ]
  }

  show heading.where(level: 3): it => {
    v(0.08cm)
    block(below: 0.04cm)[
      #text(size: 10pt, weight: "semibold", fill: assist-dark-gray, font: heading-font)[#it.body]
    ]
  }

  show heading.where(level: 4): it => {
    v(0.05cm)
    block(below: 0.03cm)[
      #text(size: 9.5pt, weight: "semibold", fill: assist-gray, font: heading-font)[#it.body]
    ]
  }

  // Link styling
  show link: it => {
    set text(fill: assist-orange)
    underline(it)
  }

  // Code styling - compact
  show raw.where(block: false): it => {
    box(
      fill: assist-light-gray,
      inset: (x: 2pt, y: 1pt),
      radius: 2pt,
      text(font: mono-font, size: 8.5pt, fill: assist-dark-gray, it)
    )
  }

  show raw.where(block: true): it => {
    block(
      width: 100%,
      fill: assist-dark-gray,
      inset: 8pt,
      radius: 3pt,
      stroke: (left: 2pt + assist-orange),
      text(font: mono-font, size: 8pt, fill: rgb("#e5e7eb"), it)
    )
  }

  // Table styling - compact
  set table(
    stroke: 0.4pt + assist-light-gray,
    inset: 5pt,
    fill: (col, row) => {
      if row == 0 { assist-dark-gray }
      else if calc.odd(row) { assist-white }
      else { assist-light-gray }
    },
  )

  show table.cell.where(y: 0): it => {
    set text(fill: assist-white, weight: "semibold", size: 9pt)
    it
  }

  // -----------------------------------------------------------------------------
  // Cover Page
  // -----------------------------------------------------------------------------
  {
    set page(header: none, footer: none)

    v(2cm)

    // Logo
    align(center)[
      #box(
        width: 60pt,
        height: 60pt,
        fill: assist-orange,
        radius: 8pt,
        [
          #set text(size: 28pt, fill: assist-white, weight: "bold")
          #v(12pt)
          A
        ]
      )
    ]

    v(0.6cm)

    align(center)[
      #set text(size: 24pt, weight: "bold", fill: assist-black, font: heading-font)
      #title
    ]

    if subtitle != none {
      v(0.15cm)
      align(center)[
        #set text(size: 11pt, fill: assist-gray, style: "italic")
        #subtitle
      ]
    }

    v(0.5cm)
    align(center)[#line(length: 30%, stroke: 2pt + assist-orange)]
    v(0.5cm)

    align(center)[
      #set text(size: 9pt, fill: assist-gray)
      Version #version #h(1.5em) #date.display("[month repr:long] [year]")
    ]

    v(1fr)

    align(center)[
      #set text(size: 9pt, fill: assist-gray)
      *AssisT Adaptive EdTech Extension*
    ]

    v(1cm)
    pagebreak()
  }

  // Main content
  doc
}

// -----------------------------------------------------------------------------
// Table of Contents - compact
// -----------------------------------------------------------------------------
#let toc() = {
  text(size: 14pt, weight: "bold")[Contents]
  v(-2pt)
  line(length: 100%, stroke: 1.5pt + assist-orange)
  v(0.2cm)
  outline(
    title: none,
    indent: 1em,
    depth: 2,
  )
  v(0.3cm)
}
