# ADR 0003: Mind maps exchange with other tools through FreeMind `.mm`, with XMind read-only

Date: 2026-09-18. Status: accepted.

## Context

A student does not start from nothing. They arrive with maps made in Coggle, MindMeister, XMind or
Freeplane, and they leave for a group project or a tutor who uses something else. Until now a map
could leave AssisT as its own JSON, a Markdown outline, OPML, SVG or PNG, and come back as JSON,
Markdown or OPML. None of those is what another mind-mapping tool calls a mind map: Markdown and OPML
carry text, notes and one link, and drop colour, symbol, the done tick, collapsed state and every
cross-link.

The formats in the field, and what each would cost:

- **FreeMind / Freeplane `.mm`.** Plain XML, not zipped, openly specified (the FreeMind wiki and the
  Freeplane XSD). Read natively by Freeplane, FreeMind, XMind, MindManager and MindMeister, and it
  is the format Coggle itself imports and exports. It carries topics, notes (`richcontent`), links
  (`LINK`), colour (`COLOR`, `BACKGROUND_COLOR`), icons, cross-links (`arrowlink`) and folded state.
- **XMind `.xmind`.** A zip holding `content.json` (current) or `content.xml` (legacy). Not
  specified by its vendor; the layout is known from community parsers. XMind reads `.mm`, so writing
  `.xmind` buys nothing `.mm` does not, and a zip we author must carry correct CRC32s or XMind
  rejects it. Reading one is different: a student with a folder of `.xmind` files should not have to
  open each in XMind and re-export it.
- **MindManager `.mmap`.** Proprietary and partly binary, no public specification.
- **Miro.** No mind map import or export exists to target.
- **Obsidian Canvas.** Openly specified, but a spatial graph with no parent and child: a tree would
  have to be guessed from edges, lossy in both directions.
- **Mermaid, PlantUML, Markmap.** Render targets, not interchange. Markmap reads the Markdown we
  already write.

A zip needs no library in a browser. The central directory can be parsed by hand, and
`DecompressionStream('deflate-raw')` inflates an entry. The project's minimalism ladder puts the web
platform ahead of a new dependency, and a dependency here would touch bundle size for a feature most
students use once.

## Decision

1. **`.mm` is the interchange format, both ways.** One reader and one writer in
   `src/features/mindMap/core/serialisers/freemind.js`, pure like its siblings. Export writes
   FreeMind 1.0.1-compatible XML so the oldest reader in the field opens it. Import accepts FreeMind
   and Freeplane files and ignores what it does not know.
2. **`.xmind` is import only.** A reader for `content.json`, falling back to `content.xml`, over a
   hand-written zip reader in `src/utils/zip-reader.js` that uses the central directory (never the
   local header sizes), honours the UTF-8 name flag, and refuses what it cannot be sure of with a
   sentence rather than a stack trace (the list is below). No writer.
3. **A plain indented text outline is accepted on import**, because it is what Coggle exports as
   text and what a student pastes from anywhere. Tabs or consistent spaces set the depth.
4. **Markdown export carries the done tick** as a task list item (`- [x]`), and import reads it back.
5. **Nothing is added to `manifest.json`.** Files are chosen by the student through a file input and
   read in the page; nothing is fetched.
6. **No new dependency.**

Mapping, where the models differ:

| AssisT       | `.mm`                                                          | Note                                                                                                                                                                |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`       | `TEXT`, or the text of `richcontent TYPE="NODE"` on import     | HTML in a node is reduced to text; an unnamed centre takes the file's name; any other unnamed node is named as described below                                      |
| `notes`      | `richcontent TYPE="NOTE"`, then `TYPE="DETAILS"` on import     | written as escaped paragraphs, one per line; read back as text, the ends of each line trimmed; Freeplane details follow the note after a blank line                 |
| `source.url` | `LINK`                                                         | quote and title travel in the note on export                                                                                                                        |
| `colour`     | `BACKGROUND_COLOR` from the palette                            | import snaps a foreign colour to the nearest palette entry, or inherits                                                                                             |
| `symbol`     | `icon BUILTIN` for the symbols that have a FreeMind equivalent | others are dropped on export; unknown icons ignored on import                                                                                                       |
| `done`       | `icon BUILTIN="button_ok"`                                     |                                                                                                                                                                     |
| `collapsed`  | `FOLDED`                                                       |                                                                                                                                                                     |
| `links[]`    | `arrowlink DESTINATION` with `ID`s on both ends                | on import Freeplane's `LINK="#ID"` to another node is read as a cross-link too; a link to a node that is not in the file is dropped; export writes `arrowlink` only |
| positions    | not written; `HGAP`/`VSHIFT`/`POSITION` ignored                | layout is computed (ADR 0001)                                                                                                                                       |

An `icon`, `arrowlink` or `richcontent` is read only as the direct child of a `node`. Freeplane keeps
its style sheet inside the root node (`hook NAME="MapStyle"` holding `stylenode` elements with icons
and arrowlinks of their own), and reading those as the centre's would tick it off or give it a symbol
the student never chose. Any other element, known or not, is skipped with everything inside it. So from
a FreeMind or Freeplane file, node attributes, clouds, edge and font styling, images, formulas and
the formatting inside a rich-text label or note are not imported; the words are. A `LINK` to
another file (`other.mm`, `other.mm#ID`) is dropped, as any link outside the allowlist is.

Rich content is XHTML written by an HTML editor, which uses HTML's named entities (`&eacute;`,
`&ndash;`, `&hellip;`) although XML defines none of them. Inside `richcontent`, and nowhere else,
the scanner decodes HTML's Latin-1 set, its Greek letters and the common punctuation and symbols;
a name outside that table stays as it was written, and a `TEXT` attribute saying `&eacute;`
means those letters.

**No imported node is left without a name.** Other tools allow an empty topic: `<node/>`, an
`<outline/>` with no text, an XMind topic with no title, a Markdown bullet that is only a
checkbox. The editor does not, because a row with no text is a tree item with no accessible name.
So when a map is assembled from any format, JSON included, a blank centre takes the map's title
and any other blank node becomes "(untitled)", the wording the editor already shows for one. A
Freeplane node named only by the `LOCALIZED_TEXT` key `new_node` becomes "New node". Maps already
in the store are left alone: `validateMap` does not treat a blank name as a fault, so a student
can still save the map they are in the middle of fixing.

What XMind carries, and what it loses. `fromXMind` reads the first sheet: titles, order, plain notes,
labels (appended to the notes as `Labels: a, b`), `href`, markers (`task-done` becomes the done tick,
the priority, star, flag and a few symbol markers become symbols), folded branches, relationships,
and the fill colour of a topic in the current layout. Floating topics become children of one
"Floating topics" node. Not imported: every sheet after the first (counted and reported, so the
interface can say so), summaries, boundaries, images and attachments, rich-text note formatting,
callouts, markers with no equivalent symbol, and colour in the legacy `content.xml` layout, which
keeps styles in a separate `styles.xml` that is not read.

**Every import is treated as hostile input.** `core/` has no DOM (ADR 0001), so nothing is parsed
with `DOMParser`; `.mm`, OPML and XMind's legacy `content.xml` are all read by one hand-written
scanner, `core/serialisers/xml-scan.js`, and what it does is the security boundary:

- It **refuses** a DOCTYPE that carries an internal subset, before announcing a single element. The
  subset is where a document declares its own entities, which is how a kilobyte of file expands to
  gigabytes. No DTD is ever loaded and nothing is fetched.
- It **refuses** a document that is not whole: an unclosed comment, CDATA section, processing
  instruction, declaration, tag or attribute value, a close tag that does not match its open tag,
  an unquoted attribute. A truncated download is an error, not half a map.
- It **decodes** the five predefined entities, `nbsp`, and numeric character references, plus
  HTML's named entities inside XHTML as described above, and nothing else: an entity it does not
  define is left as the letters it was written with. A reference to a character XML 1.0 forbids
  (NUL, the C0 controls other than tab, line feed and carriage return, a surrogate, U+FFFE,
  U+FFFF) or to anything past U+10FFFF decodes to nothing, and the same characters arriving raw
  are dropped. Leading zeros are legal XML and are ignored, so `&#x0000041;` is `A`; a reference
  whose digits still run past eight once the zeros are gone names no code point and decodes to
  nothing without being handed to the number parser.
- It **refuses for size**, each with one sentence: a document longer than 20 MB, before scanning
  it (the same limit the zip reader puts on one unpacked entry, so `content.xml` and a `.mm` file
  are held to one number); an element with more than 256 attributes; and a document with more
  than 200,000 entity references, counted one ampersand at a time so the count cannot be outrun.
  Each of these costs a file a few bytes and cost the reader seconds and hundreds of megabytes.
- It never recurses, so nesting cannot exhaust the stack, and it pushes elements to its caller as
  it meets them, so an importer stops at its cap instead of reading a hundred thousand nodes first.
- Text is only ever a string in the model. Markup inside a title or a note stays text.

The writer holds the other side of that line. `toFreeMind`, `toOPML` and `toSVG` share one
escape, which leaves out every character XML 1.0 forbids, because a conformant parser rejects the
whole file on meeting one, and the everyday source is a paste from a word processor, whose soft
line break is U+000B. For the SVG that parser is the browser: a picture holding one such character
is not drawn, and so cannot be exported as a PNG either. The test suite checks all three outputs
with a real XML parser rather than with the scanner that shares its assumptions, and, because that
parser is lenient about these characters, against XML's `Char` production directly.

Around the scanner, and for the formats that are not XML:

- **Caps.** Every importer (JSON, Markdown, OPML, `.mm`, text outline, XMind) stops at 5,000
  nodes and at 100 levels, with one sentence each. Depth is measured where a node ends up: a second
  root in a `.mm` file is adopted by the first as it opens, so its subtree is counted from there.
  JSON carries its own ids and so is not read record by record; its nodes are counted before any
  is built and its depth is measured once validation has shown it to be a tree. Records are
  collected and the map is assembled once, so an import costs time in proportion to its size.
- **Depth after import.** A map already in the store may be deeper than the cap, so nothing in
  `core/` recurses per level: the outline walk, the layout, validation and every exporter are
  loops, and a chain 20,000 deep is walked, laid out and exported. Exporters stop indenting at the
  cap. In `.mm` and OPML indentation is decoration and the structure is untouched; in Markdown
  indentation is the structure, so levels past the hundredth are written as siblings at the
  hundredth, which is also the deepest file the importer will open again.
- **Links.** One allowlist: `http`, `https` and `mailto`, case-insensitive. The scheme is tested
  on a copy with control characters and spaces removed (`java&#9;script:`), and the link is stored
  as it was written, trimmed.
- **Lookups.** Any table probed with a key taken from a file is a `Map`, and scanned attributes
  have no prototype, so a marker, entity or attribute called `constructor` finds nothing rather
  than a function.
- **Node ids.** A map's `nodes` is a plain object keyed by id, because that is the shape the store
  clones and the JSON format writes, and a plain object answers `nodes['constructor']` with a
  function. Two rules close that. Every test of whether a node exists, anywhere in `core/`, asks
  for an own property (`hasNode` and `nodeAt` in `map-model.js`), so a child, parent, root or
  link endpoint naming an inherited property is a missing node, and a child id that is not a string
  is a missing node as well. And an id must be a non-empty string with no control character that
  is not the name of an `Object.prototype` member; `createNode` refuses any other, `validateMap`
  reports it as `BAD_ID`, and the JSON importer builds its node table from entries rather than by
  assignment, since assigning under `__proto__` stores nothing. Every id the editor generates (a
  UUID, `<map>-root`, `imported-7`) passes. Code outside `core/` that looks a node up by an id it
  did not get from the map must use the same helpers.
- **Validation last.** The finished map goes through the same `validateMap` as our own JSON, which
  checks the tree and also that every node's text, notes, symbol, colour, done and collapsed hold
  the types the editor and the store expect.

The zip reader refuses, each with one sentence: a file with no end-of-directory record, or whose
only candidate record does not end exactly at the end of the file (the record's signature bytes can
occur inside the archive comment, and believing such a candidate reads a good archive as an empty
one); Zip64; an encrypted entry; a multi-disk archive; a directory or an entry that points outside
the file; the same entry name listed twice; a compression method other than stored or deflate; a
checksum that does not match; more than 1,024 entries; an entry that unpacks to more than 20 MB or
an archive to more than 50 MB, measured while inflating so that a zip bomb is stopped at the cap.
Entry names are keys, never paths.

An import never overwrites an existing map.

## Consequences

- A student can move a map to and from six tools with one format, and bring XMind files in directly.
- What does not survive a round trip through `.mm` is stated in the export dialog in one sentence:
  citation links and captured quotes become note text.
- The zip reader and the XML scanner are code we own. Both are small, have no writer beyond the
  escape function, and are covered by tests built from hostile input as well as real files.
- `.mmap`, Miro and Canvas stay unsupported. If MindManager matters later it reads `.mm`.
