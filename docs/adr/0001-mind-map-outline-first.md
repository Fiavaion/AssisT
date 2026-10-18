# ADR 0001: Mind map is an outline first, and the canvas is a view of it

Date: 2026-09-04. Status: accepted.

## Context

Students who plan essays, revise lectures or break a brief into parts asked for a mind map. A node
graph is the hardest thing in a user interface to make operable without a pointer or a screen: the
usual design is a canvas with an ARIA layer bolted on, and that layer drifts until it is a second,
worse product. AssisT is an accessibility product, so the non-visual path has to be the real path.

The extension already has a Knowledge Graph (`src/features/knowledgeGraph/`), an AI-generated
force-directed D3 graph drawn on the page. It is a reading aid, not an authoring tool, and a force
layout cannot represent an outline a student edits.

## Decision

1. **The model is a tree.** A map is a root node with ordered children; every node has text,
   optional notes, an optional colour and symbol, and an optional source (URL plus quoted text).
   Cross-links between nodes are a secondary relation stored beside the tree, never inside it.
2. **The outline pane is the canonical editor.** It uses WAI-ARIA `tree` semantics with the
   standard keyboard: arrows to move, Enter for a sibling, Tab and Shift+Tab to indent and outdent,
   F2 to edit, Delete to remove. Everything the pointer can do, the outline can do.
3. **The canvas is a rendering of the same model.** A deterministic layout places nodes on an SVG;
   pointer users drag, pan and zoom. Dragging a node onto another re-parents it in the model, and
   the outline updates. There is no second state.
4. **Deterministic first, AI second.** Every capability works with AI off. AI adds: generate a map
   from a page or a selection, suggest children for a node, and explain a node. Each degrades to a
   message when no provider is configured.
5. **Storage is a Dexie database of its own** (`AssistMindMaps`), opened by the editor page and the
   service worker on the extension origin. The core (model, operations, layout, serialisers) is
   plain JavaScript with no Chrome API, so a Safari build can lift it unchanged.
6. **The Knowledge Graph stays as it is.** The mind map is a separate feature with its own tree
   layout. It does not add a second force graph and does not share the graph's render code.
7. **Export is the outline.** Markdown, OPML and JSON are lossless round-trips; SVG and PNG are
   snapshots of the canvas.

## Consequences

- Maps are free-standing, listed in a library page, and record the URL they started from. They are
  not scoped to one page the way annotations are.
- A map can be reached from the popup, from the highlight menu ("Add to mind map") and from a
  keyboard shortcut. The highlight route writes through the service worker, so a selection made on
  any page lands in the student's chosen map.
- Undo is a command history over the model, so it is identical in both panes.
- The layout is a pure function of the tree, which makes it testable without a browser.
