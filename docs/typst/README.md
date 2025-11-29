# AssisT Documentation System (Typst)

Professional PDF documentation generator using Typst.

## Quick Start

1. **Install Typst**: https://typst.app/ or `winget install typst`
2. **Install VS Code Extension**: Search "Typst LSP" in extensions
3. **Build a PDF**: `npm run docs:build`

## Folder Structure

```
docs/typst/
├── templates/          # Branding and layout templates
│   └── assist.typ      # Main AssisT template
├── components/         # Reusable UI components
│   └── lib.typ         # Component library
├── screenshots/        # All screenshot images
│   ├── discovery/      # Discovery Quiz screenshots
│   ├── popup/          # Extension popup screenshots
│   └── features/       # Feature-specific screenshots
├── guides/             # Documentation source files
│   └── discovery-quiz.typ
└── output/             # Generated PDFs (git-ignored)
```

## Usage

### Creating a New Guide

```typst
#import "../templates/assist.typ": *
#import "../components/lib.typ": *

#show: assist-doc.with(
  title: "Your Guide Title",
  subtitle: "Optional subtitle",
  version: "1.0",
)

= Introduction

Your content here...
```

### Using Components

```typst
// Tip callout
#tip[This is a helpful tip for users.]

// Warning callout
#warning[Be careful when doing this.]

// Keyboard shortcut
Press #kbd("Ctrl+Shift+P") to open the command palette.

// Screenshot with caption
#screenshot("discovery/welcome.png", caption: "The welcome screen")

// Step-by-step instructions
#steps[
  + Open the extension popup
  + Click "Discover Your Tools"
  + Answer the questions
]
```

## Building PDFs

```bash
# Build all guides
npm run docs:build

# Build specific guide
npx typst compile docs/typst/guides/discovery-quiz.typ docs/typst/output/discovery-quiz.pdf

# Watch mode (auto-rebuild on save)
npx typst watch docs/typst/guides/discovery-quiz.typ
```
