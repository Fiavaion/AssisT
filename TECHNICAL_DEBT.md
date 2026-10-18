# Technical debt

Known shortcuts in the code that were accepted on purpose, each with what it is, what it risks, what
it costs to pay off, and why it waits. Work on the core paths (script injection, messaging, storage)
is not deferred; if an entry here turns out to be core, it gets fixed instead.

---

## TD-001: read-aloud has many separate speech paths

**Logged:** 2026-09-26. **Planned:** after the 1.0.0 release.

### What is duplicated

Read-aloud is built in about a dozen places, each creating its own `SpeechSynthesisUtterance` and
owning its own start, stop and button state:

| Path                                                                                                                                                                 | File                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Page read-aloud with highlighting (also used by Canvas, Moodle, Google Classroom, the highlight menu, reading mode and struggle detection through `window.readText`) | `src/content/content-simple.js`                                                              |
| Sticky note "read note aloud"                                                                                                                                        | `src/features/annotations/sticky-note.js`                                                    |
| Image description read and auto-read                                                                                                                                 | `src/features/imageUnderstanding/imageUnderstanding.js`                                      |
| OCR media player (chunked, with its own speed control)                                                                                                               | `src/features/ocr/ocr.js`                                                                    |
| Compare documents "Read All"                                                                                                                                         | `src/features/multiDocCompare/multiDocCompare.js`                                            |
| Study path "Read All"                                                                                                                                                | `src/features/studyPathGenerator/studyPathGenerator.js`                                      |
| Mind map read-aloud                                                                                                                                                  | `src/pages/mind-map/read-aloud.js`                                                           |
| Voice companion "read this page"                                                                                                                                     | `src/features/companion/voice-palette-ui.js`                                                 |
| Fallbacks for when `window.readText` is missing                                                                                                                      | `summarization.js`, `textSimplification.js`, `assignmentBreakdown.js`, `citationAnalyzer.js` |
| Translation read-aloud fallback                                                                                                                                      | `src/features/translation/translation-ui.js`                                                 |

What is already shared: which voice speaks and the saved rate, pitch and volume all come from
`src/utils/speech-voice.js`, and `tests/unit/architecture/read-aloud-voice.test.js` fails if a
path that builds an utterance stops importing it. So the default voice (a voice on the device,
never an online one unless the student chose it) cannot differ between features.

What is not shared: cancel and stop, pause and resume, the "is this path speaking" state, chunking
of long text, the Chrome first-utterance warm-up, button labels, and word highlighting (only the
page path has it).

### Risk while it stays

- A fix to stop, pause or chunking lands in one path and not the others. This has happened: the
  saved volume of 0 was turned into full volume in five paths and honoured in two.
- One path's `speechSynthesis.cancel()` silently ends another path's reading, and the other path's
  button can keep showing "Stop" until its `onend` or `onerror` fires.
- `translation-ui.js` hands translated text to `window.readText`, which reads it in the voice for
  the page's language, not the translation's.
- Each new feature that speaks is tempted to copy the nearest path.

### Estimated size

About two to three days: one speech service (speak, stop, pause, resume, state, chunking, events)
used by every path above, the per-feature button state moved onto its events, the fallbacks
deleted, and the page path's highlighting left where it is but driven by the service. Around
fifteen files, so it should be reviewed as one planned change rather than slipped in alongside other
work, plus browser runs of the read-aloud, reading mode, OCR, highlight menu and page-tools specs.

### Why it waits until after the 1.0.0 release

The page read-aloud path is the core feature of the extension (read-aloud with synchronised
highlighting on a Canvas page). Refactoring it and every feature that speaks, just before the
1.0.0 release, would put the one path that must work at risk for a gain students will not notice. The part
with a student-facing consequence, which voice is used and whether the text leaves the device, is
already done in the shared helper.

---

## TD-002: two development tools need a major upgrade

**Logged:** 2026-10-18. **Planned:** the first release after 1.0.0.

### What it is

`npm audit` reports no advisories in the dependencies the extension ships. The remaining
findings (35 at the time of logging) are all in development tools, from two root causes:

- **Jest 29 and its jsdom environment.** Advisories in `braces` (via `micromatch`) and in
  `sprintf-js` (via `js-yaml` 3, pulled in by the coverage tooling). Fixed by moving `jest`
  and `jest-environment-jsdom` to 30.x; `babel-jest` is already on 30.
- **sharp 0.34.** Advisories in the image libraries it bundles (libvips, libheif, librsvg). Fixed
  by sharp 0.35.

### Risk while it stays

Neither tool reaches a student. Jest runs only in tests and CI; sharp runs only in
`scripts/generate-assets.js` on the project's own icon files. CI audits the shipped dependencies
only (`npm audit --omit=dev`), so these findings do not fail it.

### Estimated size

Jest 30 changes jsdom versions, so the whole unit suite has to be re-run and any tests that relied
on old jsdom behaviour fixed: about a day. sharp 0.35 is a version bump plus regenerating and
comparing the icons: under an hour.

### Why it waits

Both upgrades change test or build tooling, not the extension. Doing the Jest move just before the
1.0.0 release would mean re-validating the full test suite for no change a student would notice.
