// =============================================================================
// AssisT Component Library
// Reusable UI components for documentation
// =============================================================================

#import "../templates/assist.typ": *

// -----------------------------------------------------------------------------
// Callout Boxes
// -----------------------------------------------------------------------------

#let callout(body, type: "note", title: none) = {
  let colors = (
    note: (bg: rgb("#eff6ff"), border: rgb("#3b82f6"), icon: "ℹ", default-title: "Note"),
    tip: (bg: rgb("#f0fdf4"), border: rgb("#22c55e"), icon: "💡", default-title: "Tip"),
    warning: (bg: rgb("#fffbeb"), border: rgb("#f59e0b"), icon: "⚠", default-title: "Warning"),
    important: (bg: rgb("#fef2f2"), border: rgb("#ef4444"), icon: "!", default-title: "Important"),
    info: (bg: assist-orange-light, border: assist-orange, icon: "→", default-title: "Info"),
  )

  let style = colors.at(type, default: colors.note)
  let display-title = if title != none { title } else { style.default-title }

  block(
    width: 100%,
    fill: style.bg,
    stroke: (left: 3pt + style.border),
    inset: 6pt,
    radius: (right: 4pt),
    breakable: true,
    [
      #text(weight: "semibold", size: 9pt, fill: style.border)[#style.icon #display-title]
      #h(6pt)
      #text(size: 9.5pt)[#body]
    ]
  )
}

#let note(body, title: none) = callout(body, type: "note", title: title)
#let tip(body, title: none) = callout(body, type: "tip", title: title)
#let warning(body, title: none) = callout(body, type: "warning", title: title)
#let important(body, title: none) = callout(body, type: "important", title: title)
#let info(body, title: none) = callout(body, type: "info", title: title)

// -----------------------------------------------------------------------------
// Keyboard Shortcuts
// -----------------------------------------------------------------------------

#let kbd(key) = {
  box(
    fill: rgb("#f3f4f6"),
    stroke: (bottom: 1.5pt + rgb("#d1d5db"), rest: 0.5pt + rgb("#d1d5db")),
    inset: (x: 4pt, y: 2pt),
    radius: 3pt,
    text(font: mono-font, size: 8pt, weight: "medium", key)
  )
}

#let shortcut(keys, description) = {
  grid(
    columns: (auto, 1fr),
    gutter: 8pt,
    align: (left, left),
    keys,
    text(fill: assist-gray, size: 9pt, description),
  )
}

// -----------------------------------------------------------------------------
// Screenshots & Images
// -----------------------------------------------------------------------------

#let screenshot(
  path,
  caption: none,
  width: 85%,
  border: true,
) = {
  figure(
    block(
      stroke: if border { 0.5pt + rgb("#e5e7eb") } else { none },
      radius: 4pt,
      clip: true,
      image(path, width: width)
    ),
    caption: caption,
    supplement: "Figure",
  )
}

#let screenshot-row(..images) = {
  let imgs = images.pos()

  grid(
    columns: (1fr,) * imgs.len(),
    gutter: 8pt,
    ..imgs.map(img => {
      if type(img) == str {
        image(img, width: 100%)
      } else {
        img
      }
    })
  )
}

// -----------------------------------------------------------------------------
// Step-by-Step Instructions
// -----------------------------------------------------------------------------

#let steps(body) = {
  set enum(
    numbering: n => {
      box(
        fill: assist-orange,
        radius: 50%,
        width: 18pt,
        height: 18pt,
        align(center + horizon, text(fill: white, weight: "bold", size: 9pt, str(n)))
      )
    },
    body-indent: 8pt,
    spacing: 10pt,
  )
  body
}

#let step-card(number, title, body) = {
  block(
    width: 100%,
    stroke: 0.5pt + assist-light-gray,
    radius: 4pt,
    inset: 0pt,
    breakable: true,
    [
      #grid(
        columns: (36pt, 1fr),
        gutter: 0pt,
        // Number badge
        block(
          fill: assist-orange,
          width: 36pt,
          height: 100%,
          radius: (left: 4pt),
          inset: 8pt,
          align(center + horizon, text(fill: white, weight: "bold", size: 14pt, str(number)))
        ),
        // Content
        block(
          inset: 8pt,
          [
            #text(weight: "semibold", size: 10pt)[#title]
            #h(6pt)
            #text(fill: assist-gray, size: 9pt)[#body]
          ]
        )
      )
    ]
  )
}

// -----------------------------------------------------------------------------
// Feature Cards
// -----------------------------------------------------------------------------

#let feature-card(
  icon: "⚙",
  name: "Feature",
  description: "",
  badge: none,
) = {
  block(
    width: 100%,
    fill: assist-light-gray,
    stroke: 0.5pt + rgb("#e5e7eb"),
    radius: 4pt,
    inset: 8pt,
    breakable: true,
    [
      #grid(
        columns: (auto, 1fr, auto),
        gutter: 8pt,
        align: (left, left, right),
        // Icon
        text(size: 18pt)[#icon],
        // Content
        [
          #text(weight: "semibold", size: 10pt)[#name]\
          #text(fill: assist-gray, size: 9pt)[#description]
        ],
        // Badge
        if badge != none {
          box(
            fill: assist-orange-light,
            stroke: 0.5pt + assist-orange,
            radius: 8pt,
            inset: (x: 6pt, y: 2pt),
            text(fill: assist-orange-dark, size: 7pt, weight: "semibold", badge)
          )
        }
      )
    ]
  )
}

// -----------------------------------------------------------------------------
// Question Cards (for quizzes)
// -----------------------------------------------------------------------------

#let question-card(
  number: 1,
  question: "",
  options: (),
) = {
  block(
    width: 100%,
    stroke: 0.5pt + assist-light-gray,
    radius: 4pt,
    inset: 10pt,
    breakable: true,
    [
      #text(fill: assist-gray, size: 8pt)[Question #number of 6]
      #h(8pt)
      #text(weight: "semibold", size: 11pt)[#question]
      #v(6pt)
      #grid(
        columns: (1fr, 1fr),
        gutter: 4pt,
        ..options.map(opt => box(
          width: 100%,
          fill: white,
          stroke: 0.5pt + rgb("#e5e7eb"),
          radius: 3pt,
          inset: 6pt,
          text(size: 9pt)[○ #opt]
        ))
      )
    ]
  )
}

// -----------------------------------------------------------------------------
// Tables
// -----------------------------------------------------------------------------

#let data-table(headers, ..rows) = {
  table(
    columns: headers.len(),
    align: (col, row) => if row == 0 { center } else { left },
    ..headers.map(h => [*#h*]),
    ..rows.pos().flatten(),
  )
}

#let shortcut-table(..items) = {
  let pairs = items.pos()
  table(
    columns: (auto, 1fr),
    align: (left, left),
    [*Shortcut*], [*Action*],
    ..pairs.map(p => (kbd(p.at(0)), p.at(1))).flatten(),
  )
}

// -----------------------------------------------------------------------------
// UI Mockups
// -----------------------------------------------------------------------------

#let ui-box(title: none, body) = {
  block(
    width: 100%,
    fill: white,
    stroke: 0.5pt + rgb("#d1d5db"),
    radius: 4pt,
    breakable: true,
    [
      #if title != none {
        block(
          width: 100%,
          fill: rgb("#f9fafb"),
          inset: 6pt,
          radius: (top: 4pt),
          stroke: (bottom: 0.5pt + rgb("#e5e7eb")),
          text(weight: "semibold", size: 9pt, title)
        )
      }
      #block(inset: 8pt, body)
    ]
  )
}

#let button(label, primary: false) = {
  box(
    fill: if primary { assist-orange } else { white },
    stroke: if primary { none } else { 0.5pt + rgb("#d1d5db") },
    radius: 4pt,
    inset: (x: 8pt, y: 5pt),
    text(
      fill: if primary { white } else { assist-dark-gray },
      weight: "semibold",
      size: 9pt,
      label
    )
  )
}

// -----------------------------------------------------------------------------
// Misc Utilities
// -----------------------------------------------------------------------------

#let divider() = {
  v(6pt)
  line(length: 100%, stroke: 0.5pt + assist-light-gray)
  v(6pt)
}

#let spacer(size: 0.5cm) = v(size)

#let badge(label, color: assist-orange) = {
  box(
    fill: color.lighten(80%),
    stroke: 0.5pt + color,
    radius: 8pt,
    inset: (x: 6pt, y: 2pt),
    text(fill: color.darken(20%), size: 7pt, weight: "semibold", label)
  )
}

#let check-list(..items) = {
  set text(size: 9.5pt)
  for item in items.pos() [
    ☐ #item\
  ]
}

#let checked-list(..items) = {
  set text(size: 9.5pt)
  for item in items.pos() [
    ☑ #item\
  ]
}

// -----------------------------------------------------------------------------
// Two-column layout for compact content
// -----------------------------------------------------------------------------

#let two-col(left, right, gutter: 12pt) = {
  grid(
    columns: (1fr, 1fr),
    gutter: gutter,
    left,
    right,
  )
}
