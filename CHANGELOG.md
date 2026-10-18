# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For download links and full release notes see the
[GitHub Releases](https://github.com/fiavaion/AssisT/releases) page.

---

## [Unreleased]

## [1.0.0] - 2026-10-12

First stable release. Everything here has landed since 0.9.3, including the 0.10.0
work that was prepared but never published.

### Added

- **Mind Map (beta)**: an outline-first planning and revision tool that works with AI
  switched off.
  - The outline pane is a WAI-ARIA tree with a full keyboard map (arrows, Enter, Tab and
    Shift+Tab, F2, Delete, Ctrl+Z and Ctrl+Y) and live announcements. The canvas is a
    second view of the same map with pan, zoom and drag re-parenting, so both edit one
    model. Choosing a different layout redraws the canvas straight away.
  - A File menu for new, open, save, save as, import and export, over a free-standing
    library of maps with six templates (essay plan, lecture notes, compare and contrast,
    project plan, reading notes, blank), plus search, rename and delete.
  - Export to Markdown, OPML, JSON, SVG and PNG. Markdown, OPML and JSON round-trip
    losslessly. Exporting a map more than 100 levels deep as Markdown says that Markdown
    cannot hold levels that deep, and which exports can.
  - Reached from the popup's Study group, from the highlight menu ("Add to mind map"
    sends a phrase from any page into the chosen map) and from Alt+Shift+M.
  - Moves between AssisT and the tools other people use. Open a map made in XMind,
    Coggle, MindMeister, Freeplane or FreeMind, or a plain indented outline saved as text,
    and send one out as a FreeMind `.mm` file that all of those open. Colour, symbols,
    ticks, notes, links and cross-links travel, and a captured quote and its source become
    part of the note. Files are read on your own machine and nothing is uploaded. A file
    you open always becomes a new map rather than writing over one you already have.
    Import works the same way from the library and from the File menu: the file you picked
    is named while it is being read, a second file picked before the first has finished is
    turned down rather than raced, and once the map is on screen one sentence says what
    came in, including which sheet was opened when an XMind file has several. A file whose
    first line begins "PK", such as a revision outline about PKU, opens as the outline it
    is, and a file saved as `.xmind` that is really a FreeMind map opens too.
  - Work on one branch at a time. Choose a node and press Alt+Shift+F, the Focus button
    or "Focus on this branch" in the Details panel, and the outline and the picture show
    just that branch. A trail above the map says where the branch sits and takes you back
    up it, Escape brings the whole map back, and searching, reading aloud and study mode
    all keep to the branch and say so. It is a view, so editing, undo and saving work as
    they do on the whole map, and if a change lands somewhere you cannot see, you are
    told.
  - Work on several nodes at once. Hold Shift and press the arrow keys to take in the
    nodes either side of the one you are on, Ctrl+Space to add or drop the node you are
    on, or Ctrl+A for the node you are on and its siblings, and again for the whole
    outline. On a row or on the picture, Ctrl+click picks out as many nodes as you like.
    Then move them together with one Tab, one Alt+Up, one drag or one "Move to...", or
    tick, colour, symbol, fold or delete them in one go. One Ctrl+Z puts any of it back.
    The Details panel says "Mixed" when the nodes you have picked do not agree, and how
    many are selected is read out when you move between one node and several.
  - Rearranging takes fewer moves. Drag a node onto the top or bottom edge of another to
    drop it above or below that one instead of inside it, with a line showing where it
    will land, and press Escape to change your mind part way through. "Move to..." in the
    Details panel does the same without dragging: search for the node you want it under,
    say whether it goes first, last or beside a branch you name, and press Move (Alt+M
    takes you straight there). The move is announced even straight after a search. The
    selected node on the canvas carries two small buttons for adding a child or the next
    node along. They step aside when the map is zoomed out too far for them to fit, and
    everything they do is still on the keyboard.
  - Writing in a map is steady. Adding a node and naming it is one step to undo, and so
    is renaming one however long the name took to type. Undo your own typing and you are
    put back in front of that node, ready to name it or to press Escape and be rid of it,
    and no way out of the field leaves a node with no name on it. What you type is kept if
    the branch is folded from somewhere else. Tab keeps you typing as it indents, the
    canvas does not redraw on every keystroke, a toolbar button that cannot act says why
    instead of going dark, and the node you are working on stays in view when a panel
    opens over it.
  - The Keyboard shortcuts list is easy to read: keys take a third of the width and
    descriptions the rest, the columns line up in every group, and it opens at its title
    with the keyboard on Close, which stays in view as the list scrolls. The map's own
    shortcuts can be remapped and checked for conflicts like every other AssisT shortcut,
    and a change takes effect straight away. Every sentence spoken while a file opens is
    announced once.
  - "Map this page" turns a page's headings into branches without AI. With a provider set
    up, the AI panel builds a map from the page or from pasted text, suggests sub-points,
    explains a node into its notes, and turns a branch into recall questions.
  - Read aloud speaks a branch in the student's stored voice and highlights the node being
    read, and does not start while you are still typing the name. Study mode hides
    children for recall practice and turns misses into flashcards. A node can link a
    citation from the library and keep the source URL and quote it came from.
- **A new popup**: flat navigation that puts every support on one screen, with a light and
  dark theme. It is the only popup.
  - Search by what you want to do, not by what a feature is called. Typing "read to me",
    "I keep losing my place" or "too bright" narrows the list of supports. Matching is
    on-device and needs no AI or network: it reads each support's name, description, group
    and keywords, tolerates a misspelling, and a match on a support that lives inside
    another shows the one that holds it. The field searches on a pause in the typing so a
    screen reader is told the result once, and the count is announced whenever the
    supports on screen change.
  - Shortcuts are listed under headings rather than in one long list.
  - Popup sections open and close on a single Enter or Space press, and a closed section
    cannot be reached by Tab. Advanced Options is a proper dialog: focus stays inside it
    and Escape closes it. The popup opens without a distracting animation running under
    the pointer.
  - Citation Quick View and the dictation statistics open over the popup where you can see
    them, and Close or Escape takes you back to the button you pressed.
- **The citation manager, rebuilt** into a writing companion:
  - In-text citations with page and paragraph locators, copied in both a rich-text and a
    plain-text flavour so they paste correctly into an editor or a plain field.
  - An on-device checker that compares the citations in an essay against its reference
    list and names what is missing on either side. No text leaves the machine.
  - Trash with restore, bulk selection with file, remove, copy and export, and quote,
    locator and note capture from any page. The quote or locator you captured survives
    when a new source is saved, and saving a citation with only a title works.
  - Book chapters and theses as first-class types with their own wizard fields, and
    undated sources dated by each style's own convention instead of by the date they were
    read.
  - Zotero BibTeX and RIS import (a BibTeX entry with no title is reported rather than
    dropped), add by DOI with CrossRef verification and a lock on the fields CrossRef
    supplied, and CSL-JSON round-trip with duplicate detection. Removing duplicates keeps
    every quote, page, note and tag from the copies being merged. RIS export no longer
    breaks a note or title across two lines.
  - The chosen style persists between sessions. Four styles ship: Harvard, APA 7, MLA 9 and
    Chicago 17. References follow each style's published rules closely: a numbered edition
    reads "2nd ed." or "2nd edn.", page ranges take an en dash and are shortened where MLA
    and Chicago shorten them, an APA citation that names a work by its title gives that
    title capitals, MLA puts a DOI after a comma, Chicago writes "n.d.-a" and "(Walsh,
    n.d.)" and gives a dated web page its date instead of an access date, and Harvard
    writes "(eds)" and tells apart two authors with the same name in the same year by
    their first names. Exported CSL files carry a video's platform and a short title.
  - The source check shows a plain rating (Looks reliable, Check before you use it, Hard
    to tell) with the reasons behind it, not a numeric score.
  - Voice capture listens on its own, even with voice typing off: say "cite this", "site
    this", "capture the source" or "save the citation". It keeps listening through
    silence, the button shows pressed only while something is listening, a status line
    says what to say and why it stopped, and a saved capture says it is in the library and
    offers to open it. It also reaches the capture wizard, the library's reference cards draw on every
    page load, and Quick View's count updates while a search narrows the list.
  - Alt+Shift+U opens the save tray directly, without hunting for it with Tab.
- **Maths Support**: opt-in numeracy accommodations for dyscalculic and neurodivergent
  students, off by default. An on-page calculator with a persistent scratchpad
  (keyboard-operable, with a safe expression evaluator and no `eval`) moves focus into its
  dialog on open, and Escape clears the entry and then closes it, on Canvas pages too.
  Large-number formatting groups digits, keeps the value copy-safe and gives screen readers
  the spoken words rather than digit-by-digit, with optional place-value colouring. Both
  load only when switched on.
- **Consent before anything leaves your device.** AssisT asks before it sends anything to an
  outside service, one question per service. Dictionary lookups, translation, checking a
  citation online and each cloud AI provider ask once, name exactly what would be sent, and
  remember the answer. First-run setup has a step listing only the services your own
  choices would use, with Allow all and Don't allow any buttons that fill in every answer
  at once (nothing is recorded until you press Save my choices, and each answer can still
  be changed), and Advanced Options has a Your data tab that lists every service's
  answer and every saved AI key, with a Remove button and a way to change your mind at any
  time. The question says "Getting ready..." and Allow cannot be pressed until Chrome
  confirms that Allow can be seen, which usually takes under a second. If something on the
  page keeps covering or fading the question, such as a colour filter or another extension,
  the question says so and explains how to allow the service from Advanced Options instead.
  Dictation, which uses Chrome's own speech recognition (a Google service), asks before it
  starts. Translate Page has its own question, since it can send the whole visible page
  rather than a selection, and it skips hidden text and AssisT's own controls.
- **Institutional branding**: institutions can apply a cosmetic skin (name, logo, accent
  colours, default LMS domain) via an Ed25519-signed key delivered by enterprise policy
  (`chrome.storage.managed`). Keys are verified offline against a bundled public key and
  fail closed, and the accent is darkened automatically to keep WCAG 2.2 AA contrast on
  every surface. The public build is unbranded with no key present, and branding that is
  applied can be turned back to the standard appearance.
- **Configurable local-AI server**: the Local AI panel accepts a custom Ollama server
  address, so a local install works out of the box and a shared server can be set per
  institution.
- **OCR accuracy boost**: an opt-in toggle that runs extra image preprocessing (contrast,
  binarisation, sharpening, upscale) before recognition, for low-quality scans and small
  text.
- **Higher-fidelity OCR** throughout: layout reconstruction from line geometry, an
  accessible formatted result view with read-aloud and an AI proofread pass, a progress bar
  during recognition, page furniture stripped from full-page captures, and adaptive
  chunking so a long capture can be cleaned by a local model.
- **Companion features**, each individually switchable in the popup:
  - A study-tools discovery card, and AI output shaped by the learning profile rather than
    by one or two features.
  - Equation read-aloud joined to the synchronised-highlight reading flow.
  - A gentle offer of help when the same passage keeps being reread. "Offer help when
    reading gets hard" is the one switch for that help.
  - Authorship Shield, a private local writing history that can be exported if the work is
    questioned. Its indicator disappears cleanly when the feature is turned off.
  - Flashcards with spaced repetition built from highlights. Add to Flashcards is in the
    highlight menu on every page.
  - A reading-level dial for AI summaries. "Very plain" summaries are short and in
    everyday words, swapping a technical term for an everyday word, and do not open by
    repeating the instruction back.
  - A lecture companion with live captions and structured notes. A Start lecture captions
    button under its switch in the popup opens the notes card on any page, or says in plain
    words why it cannot (a browser or Web Store page, or a page AssisT is not running on).
    Focus moves to Start listening when the card opens. Words being recognised appear as
    you speak in a line that screen readers skip, and finished lines are announced. If
    Chrome blocks the microphone or cannot reach its speech service, the card stops and
    says what to do, and it gives up if listening keeps ending without starting.
    Recognition uses the page language.
  - A hands-free voice command palette. "Open calculator" opens the Maths Support
    calculator, and "summarize this page" and "simplify this" work on the selected text or,
    for a summary, the page itself.
- **Learning-profile transparency.** You can see what a learning-profile support has
  recorded about you, and delete it in one step. Deleting asks first, in a box you can see
  and hear, with its own Delete button; Cancel or Escape keeps the record. Tracking how
  often you scroll back, how long you linger, how many words you look up, or how often you
  ask for simpler text is off until you turn it on, and is described in plain words first.
- **A welcome front door** that opens on install, with AI setup and "Discover your tools" as
  tracks through it.
- A keyboard shortcut, Alt+Shift+V, starts and stops dictation from wherever you are on
  the page. Dictation says in plain words when it is starting, recording, paused, or
  blocked because the microphone is not allowed.
- AssisT's own controls (popup buttons, the mind map's help button, a sticky note's colour,
  delete and read-aloud buttons) declare their purpose using WAI-Adapt attributes, for
  assistive tools that show symbols instead of words.
- Equations read aloud through the Speech Rule Engine.
- A "Report a Bug" link in the popup footer.

### Changed

- Read Aloud defaults to a voice that runs on your device, instead of an online Google
  voice. Online voices are still available and say in the voice picker that they send your
  text to Google.
- Read Aloud's four speed buttons sit under the speed slider.
- The zoom slider in Read from Images says what the number means, and Reduced Motion says
  when your computer is keeping movement reduced.
- Syllable colours is now the default dyslexia reading mode.
- Saved keyboard shortcut sets pick up new defaults. A key added after a student saved
  their shortcuts now appears at its default value instead of being invisible and unbound;
  changed keys keep their value and cleared keys stay off.
- Citations and the LMS integrations are enabled and surfaced by default.
- The Local AI panel lists only models that can hold a conversation (embeddings-only models
  are filtered out). Three models are offered: `qwen3:4b-instruct-2507` (2.5 GB) for
  modest computers, `qwen3.5:9b` (6.6 GB) for an 8 GB graphics card, and `qwen3.5:27b`
  (17 GB) for 20 GB of graphics memory and up. Models are sized for Apple shared memory,
  `qwen3.5` also reads images, and a model you already have installed always shows as
  installed. `qwen3.5:latest` counts as `qwen3.5:9b`, so it is not offered as a second
  download. Local failures say what actually went wrong. The on-device AI picks
  a model from what is actually installed, instead of asking for one that may not exist and
  silently giving a lesser answer.
- Cloud AI uses the current models: Claude Haiku, Sonnet and Opus 5.5 and Gemini 3.8 Flash
  and 3.5 Flash-Lite. A model you saved that has since been replaced moves to its
  replacement and is shown and saved as that. The Opus option says it costs about twice as
  much as Sonnet.
- AI setup recommends Local AI on a computer with a separate graphics card or an Apple
  chip, with Browser AI as the next choice, instead of sending every machine with WebGPU
  to Browser AI. The text says graphics memory cannot be seen from the browser and that
  8 GB of RAM reads as 8 GB or more.
- Each AI panel's "API key required" screen names your actual provider, instead of always
  asking for an Anthropic key.
- Simplified text no longer opens with "Here is a simplified version of the text:", which
  read as part of your text. Very plain simplified text still keeps the proper term and
  explains it in brackets.
- The popup's description of what leaves your device is accurate: while personalised AI is
  on, a short line about how you like things explained travels with your question.
- AssisT no longer asks for access to Google Gemini when it is installed. Chrome asks when
  you save a Gemini key, and if you already use Gemini the popup shows an "Allow access"
  button if it is needed. Saving a key for Anthropic, OpenAI or Perplexity likewise asks
  Chrome for permission to reach that provider in the same step, and access can be granted
  from the popup if it was missed earlier.
- The floating AssisT pill no longer covers a page's own text on sites with a full-height
  sidebar, and you can put AssisT away on one site and have it come back on the next.
- The AI panels (tutor, document compare and others) can be closed with Escape, Tab no
  longer leaves an open panel for the page behind it, and focus returns to whatever opened
  the panel.
- The build reads `manifest.json` directly, with the version stamped from `package.json`,
  so the shipped version cannot drift.

### Fixed

- AssisT reaches every page it should. Pages already open when AssisT is installed or when
  permission is granted, such as the Canvas page you were reading, get AssisT straight
  away, and a page that finishes loading again while AssisT is being added is no longer
  skipped.
- Canvas, Moodle and Google Classroom course integrations load on their pages and announce
  themselves only on a page that belongs to them. Read Aloud works on Moodle and Google
  Classroom, not only on Canvas. LMS integrations and click-to-read re-mount after in-page
  navigation instead of going quiet.
- A setting you change in the popup no longer overwrites one you changed on the page a
  moment earlier. The popup saves only what you actually changed.
- Changing an appearance setting no longer fails on a settings file saved by an older
  version that never held that setting.
- Font and spacing settings are remembered. They used to reset unless "Apply to all
  windows" was on, and that shipped off.
- Changing where annotations are stored no longer resets your other settings (citation
  style, maths support, platform switches and popup visibility) to their defaults.
- A setting turned on right after a fresh install is no longer switched off again at the
  next update.
- Hiding Annotations & Sticky Notes or Translation Features in Advanced Options now
  actually hides them.
- Read Aloud no longer leaves a word or paragraph highlighted after navigating within the
  page while it is speaking.
- Bionic reading no longer splits emoji into broken characters, and never rewrites
  AssisT's own panels.
- Speed Read and the Detailed Statistics dialog behave like proper dialogs: Escape closes
  them and focus returns to the button that opened them.
- Reading mode's appearance settings take effect; they were saved under one name and read
  under another. It reports its real open or closed state to the popup, and cannot be
  opened twice at once, which used to leave a stuck overlay that Escape could not close.
  It no longer scrolls sideways on any page: its width and padding were added together,
  and wide images, tables, formulas and long unbroken text are now kept inside it.
- The highlight menu no longer opens over AssisT's own panels, such as Speed Read, the
  consent question, sticky notes and the action tray, or when you select words inside them.
  Reading Mode's copy of the article is page text, so the menu still works there.
- Escape stops a read aloud even when the page has a cookie or sign-up dialog left open or
  faded out. A page dialog keeps Escape only while focus is inside it.
- The highlight menu's Read Aloud, with the Read Aloud feature switched off, reads just the
  selected words in your voice and speed and no longer outlines and highlights the whole
  block. Stopping a read in its first moments now cancels it, so it can no longer leave its
  highlight stuck on the page.
- Grammar colours tag every word correctly. Roughly half of verbs were being missed before,
  because whole-phrase matching could not match against the page's own capitalisation.
- Grammar colour coding, link text under syllable highlighting, and several popup and page
  badges meet WCAG AA contrast.
- A note you add to a paragraph is kept. Selecting a paragraph by triple-clicking it,
  adding an annotation and saving used to close the dialog as though it had worked while
  the highlight was never drawn and the note was lost, because the selection ends at the
  start of the next paragraph and that was read as selecting nothing.
- An empty annotations sidebar tells you how to make your first note, instead of suggesting
  you adjust filters you have not set. A closed annotations sidebar cannot be reached by
  Tab.
- The reading guide and the magnifier can be used from the keyboard: Alt and the arrow keys
  aim and nudge them, and Escape dismisses them. This is a general fix: any AssisT dialog
  that is only hidden by its container, not removed from the page, was being read as still
  open. The reading guide stays above the screen tint.
- The magnifier's copy of the page is hidden from screen readers and removed from the tab
  order, instead of being read and reachable twice.
- Minimising the study timer no longer removes the only way to bring it back for a keyboard
  user. The Pomodoro timer starts in the top-right corner, which nothing else uses, and a
  position the student has already chosen is kept.
- AssisT no longer injects its interface into a page's own editable content.
- Floating on-page controls no longer sit on top of each other. The Maths tools button, the
  citation capture bar, the lecture companion toggle and the Authorship Shield indicator
  shared the bottom-left corner, so whichever appeared last swallowed the others' presses;
  they now stack in one rail. Companion cards stack above the text statistics badge instead
  of over it.
- The first-run tip card and floating page controls fit small and zoomed screens without
  covering their own close button. Side panels (citation analyser, assignment breakdown,
  summary, simplification, the grammar colour key, the tool dock, the maths panel) fit a
  320px-wide screen without a sliver running off the edge.
- Citation manager Copy and Open buttons respond to Enter and Space and carry explicit
  accessible names, so a screen reader announces them by name instead of falling back to
  the tooltip.
- Tab reaches the citation list: exactly one card holds the tab stop, whatever the search
  or project filter leaves on screen, and the arrow keys move it. Previously no card held
  it at all, so Tab stopped only on the Copy and Open buttons inside the list. The same
  fix restores the roving tab stop on the citation panel's view tabs, and restores keyboard
  focus to the annotation sidebar's saved items and the assignment breakdown's step
  checkboxes.
- Focus returns to the right place after removing, undoing or editing a citation, and an
  undo that cannot restore says so.
- Text selected on a page is shown as text in the annotation sidebar, so a page that
  contains markup can no longer place anything of its own in the sidebar or ahead of the
  page's own tab order.
- The text statistics badge's buttons (close, speed read, view details, and the stats
  window's own controls) answer Enter and Space, not the mouse alone. So do popup buttons,
  and keyboard focus can no longer strand inside the mind map editor.
- The AI setup mode chooser can be operated from the keyboard: Enter and Space select a
  mode, as clicking one always did. Skipping AI setup switches AI off instead of silently
  selecting cloud. The AI setup wizard is bundled so its imports resolve.
- Screen Colour Overlay is a single blended element rather than a stylesheet forcing opaque
  backgrounds, so it no longer paints over Google Docs and Sheets, and a malformed overlay
  colour is rejected. Custom Cursor listens in the capture phase and so survives editors
  that stop pointer events.
- Local reasoning models no longer leak their thinking into the answer, and JSON mode works
  on them, including for the tutor and the study path. A reply that used up its thinking
  budget is asked again once with thinking off, and a half-finished monologue is never
  shown as an answer. Sampling parameters are sent only to the models that accept them; the newest
  Anthropic models reject `temperature` outright. A downloading on-device model no longer
  logs an error on every progress update.
- Gemini Nano availability is probed with the message the service worker actually answers,
  so features that gate on it can use it.
- The discovery quiz switches on every feature it recommends. Four features were weighted
  so low that their best possible score fell below the threshold that enables anything. In
  Discover quizzes, pressing Enter on a Back or Next button no longer also submits an
  answer, and the quiz helper detaches its listeners when it is torn down.
- Citation autofill reads real pages the way those pages state themselves, measured against
  seven page fixtures; videos, social posts and PDFs are recognised.
- Content-script chunks are no longer preloaded from the page origin.
- A dictionary outage is told apart from a word that is simply missing.
- The classic OCR result modal is accessible, and the OCR capture UI stays above Reading
  Mode. OCR's Auto-play TTS setting works: a scanned page is read aloud when it is switched
  on, and stays silent when it is not.

### Removed

- The Layout mode option in Advanced Options, which only rearranged the old popup.
- The field for pasting an institution branding key in the popup. Branding set up through
  your institution keeps working.
- The Azure Speech option, which nothing in AssisT could reach. A stored choice of it falls
  back to automatic.
- The DeepL and Microsoft Translator options, which nothing in AssisT could actually call.
  Any key already saved for them is deleted.
- Code nothing could reach: five content-script feature modules, an unreachable annotation
  reader in citation storage, an unvalidated proxy-fetch handler in the service worker, and
  popup lookups for a profile surface that no longer exists.
- The out-of-sync manifest generator and its variant config.
- Alpha, beta and experimental badges from feature names.
- The unused feature-selection step in AI setup.
- Stuck-reader rescue as a separate feature, and two voice commands that did nothing
  ("what's due this week" and "start a focus session").

### Security

- The offscreen document rejects any message that did not come from the service worker, so
  page-injected script cannot reach the citation database directly.
- A custom local-AI server address is scoped to loopback in the public build.
- AssisT no longer asks at install for permission to reach the local-AI server. The
  loopback Ollama address (`http://localhost:11434`, `http://127.0.0.1:11434`) is an
  optional permission, requested the first time a student turns Local AI on;
  `https://api.crossref.org` and the same loopback address remain in the extension's
  `connect-src` policy, which grants no access to any page a student visits.
- A settings file you export or import can no longer carry consent choices or the developer
  log switch; those stay on the device you set them on.
- The console no longer records what you dictate, what an AI feature answers about your
  own work, or what is being read aloud.
- Institution branding text is stripped of Unicode bidi and zero-width controls, to prevent
  visual spoofing of the rendered name.
- `undici` and `dompurify` updated to resolve published advisories.
- `@xmldom/xmldom` (a dependency of the maths speech engine) pinned to 0.9.12 to clear its
  advisories. The browser build uses Chrome's own XML parser, so it was not reachable from the
  extension.
- `package-lock.json` is now published, so a clone installs exactly the audited dependency tree.

---

## [0.9.3] - 2026-05-29

### Added

- **Citation Manager overhaul** — full rebuild of the citation feature:
  - `citation-types.js` keystone module with 12 source types and typed field
    definitions shared across all formatters.
  - Four citation styles: APA 7th, MLA 9th, Chicago 17th, Harvard — each in its
    own dedicated module with field-level formatting logic.
  - One-click save tray — floating panel for quick project assignment without
    opening the full manager.
  - AI citation analyser (`citation-ai-analyser.js`) — optional AI pass that
    evaluates source quality, relevance, and academic rigour.
  - Focus trap (`citation-focus-trap.js`) — WCAG 2.1 compliant keyboard
    containment for all citation modals.
  - Highwire `citation_*` meta-tag extraction in `metadata-extractor.js` with a
    non-empty title fallback chain.
  - 210 unit + E2E tests covering all formatters, storage, save tray, AI
    analyser, and UI interactions.
- **Cross-browser API abstraction** (`src/core/browser-api.js`) — thin wrapper
  around `webextension-polyfill` providing a unified `browser.*` API across
  Chrome, Firefox, and Safari Web Extensions. New code uses `browser.*`;
  existing `chrome.*` calls migrate progressively toward the Firefox port.
- **`@fiavaion/lms-adapter` package scaffold** (`packages/lms-adapter/`) —
  standalone package for LMS detection, course/assignment context extraction,
  and SPA navigation support (Canvas, Moodle, Google Classroom). Public API is
  stable; full extraction from `src/features/lms/` is still to come.
- **`@fiavaion/local-ai-router` package scaffold** (`packages/local-ai-router/`)
  — four-mode local AI routing library (Ollama → WebLLM → Chrome Prompt API →
  cloud fallback) extracted from AssisT's AI layer. Functional at this stage;
  WebLLM engine lifecycle extraction completes with v1.0.
- **Pluggable prompt registry** (`src/ai/prompts/registry.js`) — centralised
  store for feature prompts keyed by feature × discipline × user profile.
  Allows institutions to swap discipline-adapted prompts without touching
  feature code. Feature modules migrate progressively.
- **Firefox build target** — `BROWSER=firefox vite build` now produces a
  `.vite-firefox/` build using `manifest.firefox.json` (falls back to Chrome
  manifest while the Firefox port is in progress). Build-time flags
  `__BROWSER_TARGET__` and `__IS_FIREFOX__` let content scripts disable
  Chrome-only APIs gracefully on Firefox.
- `build:firefox` npm script and `cross-env` dependency for cross-platform env
  variable support in build commands.

### Fixed

- **Gemini AI model** — replaced retired `gemini-1.5-flash` (404) with
  `gemini-2.5-flash` as the default Gemini model. Fixed a 429 rate-limit retry
  loop where the retry guard never fired because the thrown error message
  contained quota text rather than the status code string.
- **Annotation highlight race condition** — the DOM `Range` was becoming invalid
  after `await storageAdapter.create()`, causing highlights to silently fail.
  The highlight span is now inserted synchronously before the storage write;
  the annotation record is then wired to the pre-inserted span on save.
- **Organize Mode drag & drop** — sections are now correctly identified with the
  `draggable: '.accordion-section'` SortableJS selector; drag handles were
  previously targeting the wrong ancestor.
- **Organize Mode visibility toggles** — accordion header `mousedown` handlers
  were calling `preventDefault()` and suppressing visibility-toggle clicks.
  The header handler now defers to control elements; cleanup restores the
  original handler on Organize Mode exit.
- **Double-fire on OrganizeMode controls** — removed duplicate `click` listener
  alongside `mousedown` that caused handlers to fire twice per button press.
- **STT Beta label removed** — Speech-to-Text has graduated from beta; the
  "Beta" badge has been removed from both the popup feature list and the main
  STT toggle.
- **Citation Manager marked Alpha** — feature is functional but the UI and
  style output will continue to evolve; labelled Alpha in the popup to set
  expectations.
- **DOMPurify name-clobber fix** — edit modal was silently dropping the
  citation title on save because DOMPurify's sanitised output clobbered the
  `name` property used to read the field value. Fixed by reading `textContent`
  after sanitisation.

### CI

- GitHub release publish now triggers an automatic Cloudflare Pages rebuild of
  the Fiavaion website via repository dispatch.
- `deploy.yml` corrected ZIP source directory from `Output/` to `.vite/` —
  fixes CWS automated deploy failure.
- `notify-website.yml` opts into Node 24 ahead of GitHub's June 2 forced
  Node 20 deprecation.

---

## [0.9.2] - 2026-05-23

### Added

- **Ollama model catalog** — curated list of 11 recommended models organised by
  category (General, Reasoning, Multilingual, Code, Vision) and hardware tier
  (4 GB / 8 GB RAM). The AI Setup Wizard surfaces compatible models based on
  detected system RAM.
- **"Remove all downloaded models" button** in the Browser AI (WebLLM) setup panel
  — clears cached model files from browser storage without leaving the extension.

### Changed

- Browser AI recommendation chip now includes an honest speed caveat:
  "Zero-config, runs in your browser — responses are slow (30–90s)".
- AI Setup Wizard Browser AI panel adds a visible performance note directing
  users who need faster local AI toward Ollama.

### Fixed

- `WEBLLM_CLEAR_CACHE` message handler wired in service-worker — cache-clear
  button now removes both IndexedDB model data and the `webllmCachedModels`
  storage key correctly.

---

## [0.9.1] - 2026-05-21

> First public release — launched on Global Accessibility Awareness Day (GAAD) 2026.
> Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/dkekfjomoacmhbkekjkngmpbdlljjfhi).
> Awarded the **Chrome Web Store Featured badge** by Google.

### Fixed

- WebLLM inference moved to an offscreen document — resolves WebGPU context
  restrictions that prevented model loading on the CWS-distributed build.
- Discovery Quiz results now write to the correct nested `assist_settings`
  storage paths (previously results were silently dropped).
- `localhost:11434` added to `host_permissions` — Ollama auto-detection was
  blocked on CWS-distributed builds that enforce strict host permission lists.

---

## [0.9.0] - 2026-05-15

> Final beta — pre-launch security hardening, accessibility audit, licence
> change, and quality pass before GAAD public release.
>
> Note: the project version jumped from 0.1.2 to 0.9.0 to signal "release
> candidate" status before the planned v1.0.0 stable release.

### Added

- **EUPL-1.2 licence** replacing MIT — legally clearer for European educational
  deployment.
- **VPAT 2.5** voluntary product accessibility template published in the repo.
- Community health files: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- **All fonts bundled locally** (Lexend, OpenDyslexic, Atkinson Hyperlegible,
  Andika, Comic Neue) — eliminates Google Fonts network requests for full GDPR
  compliance.
- **Production minification** via Vite — bundle size reduced from 27 MB to 11 MB;
  source maps excluded from production builds.
- **Reading Scope selector** — choose Paragraph, Section, or Whole Page per TTS
  session without changing global settings.
- **Word Highlight Sync Mode** — Boundary (speech boundary events) or Timer
  (fixed cadence fallback) to match your voice engine.
- **Word Highlight Speed slider** — adjustable 0.5×–4× (default 2×).
- **Moodle Helper toggles** (TTS, Reading Aids, Citation Capture, Forum Support)
  — fully wired with JavaScript handlers in the popup.
- **Google Classroom Helper toggles** (TTS, Reading Aids, Citation Capture,
  Google Docs Integration) — fully wired.
- LMS Helper settings included in all 4 base user profiles by default.
- Reading Guide **White** colour option.
- **Shortcut `<kbd>` badges** injected next to popup labels (Alt on Windows,
  ⌥ on Mac); platform-aware.
- 997 unit tests passing across 28 test suites; Pa11y WCAG2AA clean.

### Changed

- Text Statistics feature defaults to OFF on first install; state persists
  across popup open/close sessions.
- Study Path Generator: **Copy** and **Read All** TTS buttons added.
- Multi-Document Compare: **Read All** TTS button added.
- Emotional TTS feature removed.
- STT engine dropdown label clarified: "Web Speech API (Browser Built-in)".
- Shortcut presets expanded from 6 to 14 keys across all 3 presets
  (Default, Minimal, One-Handed).

### Fixed

- **XSS** — custom vocabulary words rendered unsanitised in `popup.js` inner
  HTML; wrapped with `sanitizeText()`.
- **Regex injection** — annotation sidebar search query used HTML-escaped but
  not regex-escaped input; `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` added.
- `innerHTML +=` orphan node bug in `cognitiveStateMonitor.js` replaced with
  `insertAdjacentHTML`.
- `Alt+N` sticky note shortcut was unregistered; now wired correctly.
- `reloadShortcuts()` was a no-op — now correctly snapshots callbacks and
  re-registers.
- Shortcut changes now auto-reload without requiring extension restart.
- `applyShortcutPreset()` called an undefined function; fixed to use
  `loadShortcuts()` + merge + `saveShortcuts()`.
- "Read Entire Page" silently crashed with `ReferenceError` — resolved.
- SPA navigation: all global event listeners tracked and cleaned up on
  Canvas page navigation (MutationObserver + popstate); eliminates duplicate
  TTS playback after navigation.
- OCR, Translation, and Citation message handlers now race against a 25-second
  timeout — prevents silent UI hangs.
- WCAG AA contrast failures: STT offline badge (#059669 → #00875d); citation
  count badge (#f59e0b → #a76900).
- Hidden file input for profile import given `aria-label` for screen readers.
- Socratic Tutor overlay z-index was covering the panel — resolved.
- TTS watchdog now correctly cancels on pause — word highlight no longer
  freezes on pause.

### Security

- `DOMPurify` updated 3.3.1 → 3.4.2 (addresses a production XSS vector).
- 12 npm audit vulnerabilities resolved (`npm audit fix`).

---

## [0.1.2] - 2026-04-19

> Chrome Web Store resubmission after the AI overhaul and multi-provider expansion.

### Added

- **Browser AI (WebLLM)** — AI models run entirely in the browser via WebGPU;
  zero installation required. 8 models available (0.6 GB–6 GB).
- **Inline AI mode switcher** in popup — switch Off / Cloud / Browser AI /
  Local AI with one click, no wizard redirect needed.
- **AI Setup Wizard** — step-by-step guided setup for all AI modes with
  hardware detection and model recommendations.
- **Model registry** (`model-registry.js`) — centralised catalogue with
  per-task routing defaults.
- **Multi-provider cloud AI routing** — Anthropic (Claude), OpenAI (GPT),
  Google (Gemini), and Perplexity all supported from a single provider selector
  with dynamic model lists.
- **Persistent AI status bars** on all 8 AI feature panels — shows current
  mode, availability, and last result at a glance.
- **Shared AI routing client** (`ai-feature-client.js`) — single source of
  truth for mode detection, availability checking, and generation; eliminates
  per-feature `getCurrentModel()` inconsistencies.
- **Multi-Document Compare** — analyse and contrast multiple text sources
  side-by-side.
- **Google Docs Speech-to-Text** — microphone button now appears inside
  Google Docs' custom rich editor.
- **Text customisation sync** — push font/spacing settings to all open tabs
  simultaneously (opt-in toggle).
- **CI pipeline** — GitHub Actions with caching and redundant-run cancellation.
- Default Ollama model changed to `qwen3:8b-q4_K_M` for superior JSON
  compliance and instruction following.
- Z-index scale system (`src/utils/z-index.js`) prevents UI stacking conflicts
  with LMS page elements.

### Changed

- All 8 AI features migrated to shared routing client.
- Local AI model picker redesigned with live Ollama detection and dropdown.

### Fixed

- Knowledge graph local AI pipeline now works on first run without reload.
- **API key encryption** — keys now encrypted with AES-256-GCM in
  `secure-key-storage.js`; previously stored as plain text.
- STT microphone button positioning — was off-screen on some Canvas layouts.
- STT enabled on Google Classroom — fixed iframe injection and storage mismatch.
- Multi-document compare drag rewritten with Pointer Events API and
  `setPointerCapture` — eliminates listener leaks and unreliable drag.
- Text customisation sync storage race condition — now uses
  `chrome.tabs.sendMessage` instead of shared `chrome.storage.local`.
- Canvas white-text inheritance — added `color: #333` to AI panel roots so
  text is readable on dark-themed Canvas pages.
- SPA navigation pre-audit: all async handlers given explicit timeouts;
  z-index conflicts resolved across Canvas, Moodle, and Classroom.

---

## [0.1.1] - 2026-02-11

> Eleven new features built on the TTS/STT foundation; first Chrome Web Store
> submission attempt.

### Added

- **Citation Management** — Harvard Style (Cite Them Right, 13th ed.)
  generator for websites, books, journals, videos, and social media. Includes
  bibliography manager, CRAAP test evaluation, and BibTeX/RIS/JSON/CSV export.
- **Online citation verification** via CrossRef and Semantic Scholar APIs.
- **Knowledge Graph** — interactive concept-connection visualisation from
  selected text.
- **Socratic Tutor** — guided learning through AI questions rather than direct
  answers.
- **Study Path Generator** — personalised learning sequences for any topic.
- **Assignment Breakdown** — decomposes assignment instructions into
  step-by-step checklists.
- **Text Simplification** — three complexity levels; trailing AI conversational
  artifacts stripped automatically.
- **Summarization** — brief, detailed, bullet points, or ELI5 modes.
- **Translation** — 35+ languages via MyMemory (default) and LibreTranslate
  (fallback); rate-limited.
- **Highlight Menu** — contextual toolbar on text selection with Read Aloud,
  Dictionary, Translate, AI Summarize, and more.
- **Text Statistics** — word count, characters, sentences, reading time
  (Ctrl+Shift+W).
- **Discovery Quiz** — recommends features based on learning style and needs.
- **User Profiles system** — save, load, export, and import accessibility
  configurations. 9 neurodivergent profiles (ADHD, Autism, Dyslexia, Anxiety,
  Motor, Low Vision, Cognitive Overload, Sensory, General Learning).
- **7 Speech-to-Text profiles** with customised timing, UI, and feedback.
- **Drag-and-drop section reordering** in popup (Organise Mode).
- **Keyboard shortcut presets** — Default, Minimal, One-Handed.
- **Feature maturity badges** (Alpha, Beta, Experimental) displayed in popup.
- Optional `<all_urls>` permission flow — single-click "Enable Everywhere" for
  non-LMS sites.
- DOMPurify XSS protection on all user-facing inputs.
- **Gemini Nano** (Chrome built-in AI via Prompt API) added as a fourth AI mode.
- Chrome Web Store compliance improvements.

### Removed

- **Stargardt Vision Mode** removed — 11 experimental files deleted (eye
  tracking, APVUI rendering, scotoma profiling, calibration wizard). Feature
  had low adoption and introduced significant maintenance overhead.
- NCAD branding references removed from codebase.

### Fixed

- Content script injection for non-LMS sites when `<all_urls>` granted.
- `web_accessible_resources` updated for Vite-bundled asset paths.
- Various keyboard shortcut layout conflicts.

### Security

- Optional permissions model — `<all_urls>` is user-granted on demand, not
  requested upfront.
- GDPR compliance section added to privacy policy.

---

## [0.1.0] - 2025-11-28

> Initial release — TTS/STT foundation with Canvas LMS integration.

### Added

- **Text-to-Speech** with synchronised word-by-word highlighting. Customisable
  rate (0.5×–2.0×), pitch, volume, and 8 highlight colours.
- **Speech-to-Text** using Web Speech API. 60+ voice commands for editing,
  formatting, and navigation. Smart auto-punctuation (Automatic / Assisted /
  Manual). Custom vocabulary with domain presets. Confidence feedback with
  colour-coded accuracy indicators.
- **Reading Mode** — distraction-free view powered by Mozilla Readability with
  full TTS integration (Alt+R).
- **Dyslexia-Optimised Reading Modes** — Bionic Reading, Syllable Colours,
  Grammar Colours (Alt+Y).
- **OCR & Screenshot Tool** — extract text from images and PDFs using
  Tesseract.js offline (100+ languages, Alt+O).
- **Focus Mode** — dims surrounding content, centres reading area (Alt+F).
- **Reading Guide** — horizontal cursor-tracking line (Alt+G).
- **Screen Colour Overlays** — 9 comfort filters (Alt+Shift+O).
- **Reading Progress Bar** — scroll position indicator (top or bottom).
- **Text Customisation** — 11 fonts including OpenDyslexic, Lexend, Atkinson
  Hyperlegible. Line height, letter, word, and paragraph spacing. WCAG 2.2
  SC 1.4.12 compliant.
- **Reduced Motion** — disables all animations; respects
  `prefers-reduced-motion` (WCAG 2.1 SC 2.3.3).
- **Custom Cursor & Magnifying Lens** — multiple cursor styles; floating
  1.5×–4× magnification window.
- **Dictionary Lookup** — inline definitions via Free Dictionary API
  (Alt+Shift+D).
- **Sticky Notes & Annotations** — per-URL floating notes in IndexedDB with
  tag/export/sidebar (Alt+N).
- **Pomodoro Timer** — configurable work/break intervals with ADHD-optimised
  defaults.
- **Media Control** — blocks autoplay video and audio.
- **Canvas LMS integration** — content script auto-injected on
  `*.instructure.com` / `*.canvas.com`; Canvas Quiz Helper with TTS and
  keyboard navigation.
- Moodle and Google Classroom host permission support.
- **14 customisable keyboard shortcuts** with Chrome-conflict detection.
- Manifest V3 architecture with Vite + `@crxjs/vite-plugin` build pipeline.
- Jest unit testing (979 tests) + Playwright E2E infrastructure.
- WCAG 2.2 AA compliance throughout.

---

## Historical Development Checkpoints

The following internal tags exist in the repository from pre-release development
(October–November 2025). They are not versioned releases, but are preserved for
history and rollback reference.

| Tag                                | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `Sprint2-Foundation-v1.0`          | Initial popup and TTS controller              |
| `Sprint3-Complete-v1.0`            | Focus Mode, Text Customisation, Reading Guide |
| `Sprint4-Canvas-Foundation-v1.0`   | Canvas LMS integration                        |
| `Sprint5-STT-Complete-v1.0`        | Speech-to-Text with Web Speech API            |
| `Sprint5.1-UI-Cleanup-v1.0`        | Post-STT UI polish                            |
| `Sprint6-ReadPage-Simple-v1.0`     | Read Entire Page feature                      |
| `Sprint7-Canvas-Profiles-Complete` | User Profiles system                          |
| `Sprint8-Testing-Complete`         | Playwright E2E infrastructure                 |
| `MVP-TTS-Stable-v1.0`              | Stable TTS milestone                          |
| `Cleanup-Complete-v1.0`            | Cleanup before the AI work began              |
| `v0.1.0-working-baseline`          | Webpack-era baseline                          |
| `v0.2.0-stable-before-canvas`      | Pre-Canvas integration checkpoint             |
| `v0.2.1-stable-before-design`      | Pre-UI overhaul checkpoint                    |

---

[Unreleased]: https://github.com/fiavaion/AssisT/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fiavaion/AssisT/compare/v0.9.3...v1.0.0
[0.9.3]: https://github.com/fiavaion/AssisT/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/fiavaion/AssisT/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/fiavaion/AssisT/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/fiavaion/AssisT/compare/v0.1.2...v0.9.0
[0.1.2]: https://github.com/fiavaion/AssisT/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/fiavaion/AssisT/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/fiavaion/AssisT/releases/tag/v0.1.0
