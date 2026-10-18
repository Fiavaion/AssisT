/**
 * The outline pane — the canonical mind map editor.
 *
 * ADR 0001: a node graph is the hardest thing in an interface to operate without a pointer or a
 * screen, and the usual answer — a canvas with an ARIA layer bolted on — drifts until the
 * non-visual path is a second, worse product. So the outline is the real editor and the canvas is a
 * rendering of the same history. Everything the pointer can do here, the keyboard can do.
 *
 * That makes three things non-negotiable:
 *
 *   1. Real WAI-ARIA `tree` semantics — level, position, set size, expanded state, one tab stop
 *      that roves with focus — rather than a list of divs that merely looks like a tree.
 *   2. Every structural change says what it did, including how to undo a deletion. A student who
 *      cannot see the canvas has no other way to know a branch moved.
 *   3. Colour, "done" and "has a source" are all carried as text as well as as a glyph, so nothing
 *      is signalled by colour alone (WCAG 2.2 SC 1.4.1).
 *
 * The tree is brought up to date, not rebuilt. Every row is keyed by its node and kept for as long
 * as that node is on screen, exactly as the canvas keeps its node groups: only the inside of a row is
 * redrawn, and a row is moved only when the node really moved. A wholesale rebuild was deliberate for
 * v1 and it was wrong — not because it drifted, but because it threw the row away underneath whatever
 * was holding it. Any change to the map at all took the focused row out of the document, and a change
 * arriving WHILE the keyboard was moving to a row (a debounced note from the Details panel landing as
 * the student pressed Shift+Tab) left the browser moving focus to a row that no longer existed, which
 * drops it on `<body>`: the top of the page, with the student's place lost. Keeping the row is what
 * removes that whole class — focus, the caret, and a screen reader's place in the tree.
 *
 * It cannot drift, because nothing is diffed: the row for a node is found by id and its attributes
 * and its contents are restated from the model on every render, as they were when it was built.
 */

import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { isBranchView } from '../../features/mindMap/core/branch-view.js';
import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { colourResolver } from '../../features/mindMap/core/palette.js';
import { pathTo, subtreeIds, visibleOrder } from '../../features/mindMap/core/map-ops.js';

import {
  NAMING_AGAIN,
  NEW_NODE_DISCARDED,
  wholeMapOf,
  blockMoveSteps,
  centreNotDeletedSentence,
  centreNotMovedSentence,
  droppedSetSentence,
  collapsedSetSentence,
  deletedNodesSentence,
  discardCreatedNode,
  effectiveSet,
  keptNameSentence,
  keptNewNodeSentence,
  markedDoneSetSentence,
  nameOf,
  reorderedSetSentence,
  selectedEverythingSentence,
} from './node-edits.js';
import { matchesBinding } from './shortcut-bindings.js';

/** @param {number} count @returns {string} "1 child" / "2 children" */
const childWord = count => (count === 1 ? '1 child' : `${count} children`);

/**
 * Mount the outline editor.
 *
 * @param {HTMLElement} host - element the pane fills.
 * @param {Object} options
 * @param {Object} options.history - a createHistory instance shared with the canvas.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} options.announce - writes into the page's live region.
 * @param {(text: string) => void} [options.notify] - the page's `showToast`, which writes the toast
 *   AND the live region in one call. For the things this pane does that a student cannot read off
 *   the outline: the name it puts back into a row they emptied, the refusal to follow a nameless new
 *   node with another one, and every way a node they had started making is thrown away. All of them
 *   were said into the live region alone, which a sighted student never hears. Never called
 *   alongside `announce`: that would say it twice.
 * @param {() => string} [options.newId] - id source for new nodes; core never calls crypto.
 * @param {() => boolean} [options.onEscape] - the step before leaving the pane. Escape drops a set
 *   first, then asks this, and only then parks focus on the hint after the tree. Whatever the page
 *   has narrowed the student's view down to is what unwinds here — a branch they are focused on
 *   (slice E2) — and the pane neither knows nor needs to know what that is: it returns true when it
 *   did something, and the outline is left alone.
 * @returns {{ destroy: () => void }}
 */
export function mountOutlinePane(
  host,
  { history, selection, announce, notify = () => {}, newId, onEscape = () => false } = {}
) {
  const doc = host.ownerDocument;
  const makeId = newId || (() => crypto.randomUUID());

  const pane = doc.createElement('div');
  pane.className = 'assist-mm-outline';

  const tree = doc.createElement('div');
  tree.className = 'assist-mm-tree';
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', 'Mind map outline');
  // The tree takes a set, not one row (WAI-ARIA APG): Shift and Ctrl build it, and every row says
  // whether it is in it. Selection follows focus for a plain arrow, which is the simpler of the two
  // APG variants and the right one here — a student driving this with a switch or a screen reader
  // should not have to learn that moving and choosing are different keys.
  tree.setAttribute('aria-multiselectable', 'true');
  tree.setAttribute('aria-describedby', 'assist-mm-outline-hint');

  // Also the place focus goes when the student presses Escape. It sits AFTER the tree, so Tab from
  // here leaves the pane rather than falling straight back into the row that was just left — which
  // is what keeps Tab-to-indent from being a keyboard trap (SC 2.1.2).
  const hint = doc.createElement('p');
  hint.className = 'assist-mm-outline__hint';
  hint.id = 'assist-mm-outline-hint';
  hint.tabIndex = -1;
  hint.textContent =
    'Arrow keys move. Enter adds a node, F2 renames it, and Tab indents the node the arrows are ' +
    'on. Escape leaves the outline.';

  pane.append(tree, hint);
  host.appendChild(pane);

  /** The row that holds the tree's single tab stop. */
  let focusedId = history.current().rootId;

  /**
   * `{ id, original, typed, caret, created, from, mark }` while a node's text is being typed, otherwise
   * null. `created` marks a node this edit brought into being, `from` is the row the student was on
   * when they asked for it — where they go back to if they change their mind — and `mark` is the
   * history as it stood before the node existed. Every step this edit makes is applied under that
   * mark, which is what lets `history.rewindTo` tell this edit's work from anybody else's and
   * refuse the rewind rather than take their work with it.
   */
  let editing = null;

  /** True while render() is rebuilding, so a blur caused by the rebuild is not a commit. */
  let rendering = false;

  /** True while this pane is writing text, so its own history change does not restart the input. */
  let suppressRender = false;

  /** Row handlers, torn down and rebuilt with the contents they belong to. */
  let rowCleanups = [];

  /**
   * Every node this pane has made since the map was opened.
   *
   * Making a node and naming it are folded into ONE undo step — but only when nothing else has
   * written in between, and `squashSince` refuses when something has. The creation then stays on the
   * stack as an entry of its own, holding the node with no name yet, and an undo can walk onto it.
   * This is how such a node is recognised when it comes back: a nameless node nobody is editing is a
   * nameless node the autosave will store, and an imported map can legitimately hold one, so being
   * the node this pane made is the difference.
   */
  const madeHere = new Set();

  /**
   * A node this pane made for the CANVAS to name, while it is still nameless.
   *
   * The canvas's quick-add handles ask this pane to make the node (there is one way to make one) and
   * then open their own field over it on the canvas the student is looking at. Until that field
   * writes a name, the node is nameless and nothing in the outline is editing it — which is exactly
   * what `revive` below hunts for, so it has to be told that this one is not lost.
   */
  let lent = null;

  /**
   * What is on screen for each node, by id: `{ item, row, group }`.
   *
   * The `item` is the `treeitem` — the focusable element, and so the one thing that must not be
   * replaced while anything is holding or moving to it. `group` holds its children, and is made when
   * the node gains its first visible child and taken away with the last.
   */
  const shown = new Map();

  /**
   * True while a key is moving the tab stop on purpose WITHOUT changing the selection: Ctrl+Arrow,
   * which is how a student reaches a node they mean to add to the set with Ctrl+Space. Focus landing
   * on a row otherwise selects it, which is what makes the plain arrows feel like an outliner.
   */
  let keepingSelection = false;

  /**
   * The branch colour of any node of the map being drawn, built once per render.
   *
   * `colourOf` builds a cache and climbs the branch on every call, so asking it per row turned one
   * render into a walk of the map per node. `render` replaces this before it builds anything.
   *
   * @type {(nodeId: string) => {name: string, fill: string, ink: string}}
   */
  let colourFor = colourResolver(history.current());

  // Scanned rather than selected: node ids come from imported files as well as from crypto, so
  // they cannot be pasted into a selector without escaping, and the tree is small.
  const rowFor = id => {
    for (const item of tree.querySelectorAll('[role="treeitem"]')) {
      if (item.dataset.id === id) {
        return item;
      }
    }
    return null;
  };

  const editorInput = () => tree.querySelector('.assist-mm-row__edit');

  /**
   * Whether a row is the one of several the rest of the page works from.
   *
   * The Details panel edits it, read aloud and study mode start from it, and the canvas already marks
   * it apart; with the keyboard in the Details panel nothing in the outline said which of four marked
   * rows any of that meant. No ARIA for it: `aria-selected` is on every row of the set, and the tab
   * stop is what tells assistive technology which one is current. Only while there is more than one,
   * because one selected row has nothing to be told apart from.
   *
   * @param {string} id
   * @returns {boolean}
   */
  function isPrimaryOfSet(id) {
    return selection.ids().length > 1 && selection.get() === id;
  }

  /**
   * Build one treeitem and, below it, the group holding its children.
   * @param {Object} map
   * @param {string} id
   * @param {number} level - 1-based, for aria-level
   * @param {number} position - 1-based, for aria-posinset
   * @param {number} setSize - siblings including this one
   * @returns {HTMLElement}
   */
  function renderItem(map, id, level, position, setSize) {
    const node = nodeAt(map, id);
    const entry = itemFor(id);
    const { item, row } = entry;
    item.setAttribute('aria-level', String(level));
    item.setAttribute('aria-posinset', String(position));
    item.setAttribute('aria-setsize', String(setSize));
    item.setAttribute('aria-selected', String(selection.has(id)));
    item.classList.toggle('assist-mm-item--primary', isPrimaryOfSet(id));
    item.tabIndex = id === focusedId ? 0 : -1;
    if (node.children.length > 0) {
      item.setAttribute('aria-expanded', String(!node.collapsed));
    } else {
      // A leaf has no expanded state; it may have had one a moment ago.
      item.removeAttribute('aria-expanded');
    }

    row.style.setProperty('--assist-mm-level', String(level));
    // The row's contents are restated from the model; the row and the item themselves are kept.
    row.replaceChildren();

    const colour = colourFor(id);
    const swatch = doc.createElement('span');
    swatch.className = 'assist-mm-row__swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = colour.fill;
    row.appendChild(swatch);

    if (node.symbol) {
      const symbol = doc.createElement('span');
      symbol.className = 'assist-mm-row__symbol';
      symbol.textContent = node.symbol;
      row.appendChild(symbol);
    }

    if (editing && editing.id === id) {
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'assist-mm-row__edit';
      input.dataset.testid = 'outline-row-edit';
      input.value = node.text;
      input.setAttribute('aria-label', 'Node text');
      row.appendChild(input);
    } else {
      const text = doc.createElement('span');
      text.className = 'assist-mm-row__text';
      text.dataset.testid = 'outline-row-text';
      text.textContent = node.text;
      row.appendChild(text);

      // A pointer click focuses the row; clicking the row that already has focus starts the edit,
      // the way an outliner renames. Shift and Ctrl do exactly what they do on the keys, so the
      // pointer and the keyboard build the same set (SC 2.1.1). Bound per row rather than delegated
      // from the tree, because a delegated handler cancels the mousedown that places the caret
      // inside the editor below.
      rowCleanups.push(
        attachInteractiveHandler(
          row,
          'Outline row',
          event => {
            if (editing) {
              leaveEdit();
              // Leaving an edit can take rows away with it: a node the student never named goes, and
              // so does the branch that was opened to hold it. There may be no row here any more,
              // and the tab stop must not be sent to one that is not on screen.
              if (!visibleOrder(history.current()).includes(id)) {
                return;
              }
            }
            armStructure();
            if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
              extendSelectionTo(id);
              return;
            }
            if (event.ctrlKey || event.metaKey) {
              toggleSelected(id);
              return;
            }
            // A press on the row that already has focus renames it — unless a set is open, where
            // the press means "just this one" and taking the set away is enough for one press.
            if (
              selection.ids().length <= 1 &&
              id === focusedId &&
              tree.contains(doc.activeElement)
            ) {
              startEdit(id);
              return;
            }
            selection.set(id, { source: 'outline' });
            focusNode(id);
            refreshFlags();
          },
          { enableVisualFeedback: false, enableLogging: false }
        )
      );
    }

    const colourName = doc.createElement('span');
    colourName.className = 'assist-mm-row__colour-name assist-mm-visually-hidden';
    colourName.textContent = colour.name;
    row.appendChild(colourName);

    if (node.done) {
      const tick = doc.createElement('span');
      tick.className = 'assist-mm-row__done';
      tick.setAttribute('aria-hidden', 'true');
      tick.textContent = '✓';
      const done = doc.createElement('span');
      done.className = 'assist-mm-visually-hidden';
      done.textContent = 'done';
      row.append(tick, done);
    }

    if (node.source) {
      const link = doc.createElement('span');
      link.className = 'assist-mm-row__source';
      link.setAttribute('aria-hidden', 'true');
      link.textContent = '🔗';
      const label = doc.createElement('span');
      label.className = 'assist-mm-visually-hidden';
      label.textContent = 'has a source';
      row.append(link, label);
    }

    if (node.collapsed && node.children.length > 0) {
      const hidden = subtreeIds(map, id).length - 1;
      const count = doc.createElement('span');
      count.className = 'assist-mm-row__count';
      count.setAttribute('aria-hidden', 'true');
      count.textContent = String(hidden);
      const label = doc.createElement('span');
      label.className = 'assist-mm-visually-hidden';
      label.textContent = `${childWord(hidden)} hidden`;
      row.append(count, label);
    }

    if (node.children.length > 0 && !node.collapsed) {
      if (!entry.group) {
        entry.group = doc.createElement('div');
        entry.group.setAttribute('role', 'group');
        entry.group.className = 'assist-mm-group';
        item.appendChild(entry.group);
      }
      arrange(
        entry.group,
        node.children.map((childId, at) =>
          renderItem(map, childId, level + 1, at + 1, node.children.length)
        )
      );
    } else if (entry.group) {
      entry.group.remove();
      entry.group = null;
    }

    return item;
  }

  /**
   * The row for a node, made once and kept for as long as the node is on screen.
   *
   * @param {string} id
   * @returns {{item: HTMLElement, row: HTMLElement, group: HTMLElement|null}}
   */
  function itemFor(id) {
    const held = shown.get(id);
    if (held) {
      return held;
    }
    const item = doc.createElement('div');
    item.className = 'assist-mm-item';
    item.dataset.id = id;
    item.setAttribute('role', 'treeitem');
    const row = doc.createElement('span');
    row.className = 'assist-mm-row';
    item.appendChild(row);
    const entry = { item, row, group: null };
    shown.set(id, entry);
    return entry;
  }

  /**
   * Put a parent's children into this order, moving only the ones that are out of place.
   *
   * Only the ones out of place, because moving an element takes it out of the document for an instant
   * and whatever was holding the keyboard loses it. A change that moved no node moves no row.
   *
   * @param {HTMLElement} parent
   * @param {HTMLElement[]} elements
   */
  function arrange(parent, elements) {
    elements.forEach((element, at) => {
      if (parent.children[at] !== element) {
        parent.insertBefore(element, parent.children[at] || null);
      }
    });
    while (parent.children.length > elements.length) {
      parent.lastElementChild.remove();
    }
  }

  /**
   * Rebuild the tree, carrying focus and any half-typed edit across.
   *
   * @param {Object} [options]
   * @param {string|null} [options.opName] - what changed the map, when a change is what brought us
   *   here. Two of the rules below turn on it: an undo or a redo is the one kind of change that can
   *   move the ground under an OPEN editor, and a step — or a change in what is being SHOWN — is the
   *   only way a node this pane made and nobody named can come back into view.
   */
  function render({ opName = null } = {}) {
    const map = history.current();
    const stepped = opName === 'undo' || opName === 'redo';
    const hadFocus = tree.contains(doc.activeElement);
    const liveInput = editorInput();
    if (editing && liveInput) {
      editing.caret = liveInput.selectionStart;
      // What is in the field, kept on the record: an emptied name is never written to the map, so
      // this is the only thing that knows the student had emptied it if the row is about to go.
      editing.typed = liveInput.value;
    }
    // An edit survives a rebuild, but only while the row it belongs to is still on screen. The
    // node can go two ways: deleted, or hidden because an ancestor collapsed over it (from the
    // canvas, the inspector or an undo). Either way there is no row left to put the input in.
    let orphaned = null;
    if (editing && !visibleOrder(map).includes(editing.id)) {
      orphaned = editing;
      editing = null;
    }
    // An undo or a redo — from the toolbar, from Ctrl+Z, from anywhere — can change the node under
    // an open editor. The editor FOLLOWS the map: the student asked to go back, so the map is right
    // and the field is what is out of date. A name the map still holds goes back into the field; a
    // node the step left nameless, and that this edit had only just made, goes with the typing
    // (below, once the tree has been drawn) — because a nameless node is the one thing no editor on
    // this page leaves behind, and the autosave is two seconds away from storing it.
    // The other half of the same rule: a step can land ON the creation entry, with the node back on
    // the map, nameless, and no editor anywhere. The editor goes back on it — which is the state the
    // student stepped back TO — because every way out of the editor already refuses to leave a
    // nameless node behind, and nothing else here can say whether a nameless node is one of ours or
    // one an imported file brought with it.
    // A node this pane made and nobody named can come back into view several ways: a step onto the
    // entry that made it, the whole map coming back around it when a focused branch is left, or the
    // student simply finishing the rename that was holding the field. So it is not the reason for the
    // render that decides — it is whether such a node is on screen with nothing editing it.
    //
    // Two exclusions, and no others. A node under THIS pane's field is not lost. And a node made for
    // the canvas to name (`addNode` with `openEditor` false) has the canvas's own field open over it:
    // reviving that one would be this pane stealing an edit in progress, so it is remembered as lent
    // until it has a name, or until it is gone.
    if (lent !== null && (!hasNode(map, lent) || map.nodes[lent].text.trim() !== '')) {
      lent = null;
    }
    let revive = null;
    if (!editing) {
      revive =
        visibleOrder(map).find(
          id => id !== lent && madeHere.has(id) && map.nodes[id].text.trim() === ''
        ) || null;
    }
    let undone = false;
    if (stepped && editing && hasNode(map, editing.id)) {
      const text = map.nodes[editing.id].text;
      if (text !== editing.typed) {
        if (text.trim() === '' && editing.created) {
          undone = true;
        } else {
          editing.typed = text;
          // The caret goes to the end of the text the map has, which is the only place left for it.
          editing.caret = null;
        }
      }
    }
    // `hasNode`: the focused id may have come from a selection restored from storage or from an
    // imported map, and `nodes.constructor` is a function rather than a missing node.
    if (!hasNode(map, focusedId) || !visibleOrder(map).includes(focusedId)) {
      focusedId = map.rootId;
    }

    rendering = true;
    colourFor = colourResolver(map);
    for (const cleanup of rowCleanups) {
      cleanup();
    }
    rowCleanups = [];
    arrange(tree, [renderItem(map, map.rootId, 1, 1, 1)]);
    // A node that has gone, or gone behind a fold, has no row: its entry goes with it, so the next
    // time it is on screen it is built afresh rather than restored with a stale box.
    const onScreen = new Set(visibleOrder(map));
    for (const id of [...shown.keys()]) {
      if (!onScreen.has(id)) {
        shown.get(id).item.remove();
        shown.delete(id);
      }
    }

    if (editing) {
      const input = editorInput();
      input.addEventListener('input', onEditInput);
      input.addEventListener('keydown', onEditKeyDown);
      input.addEventListener('blur', onEditBlur);
      input.focus();
      const caret = editing.caret === null ? input.value.length : editing.caret;
      input.setSelectionRange(caret, caret);
    } else if (hadFocus) {
      rowFor(focusedId)?.focus();
    }
    rendering = false;

    if (orphaned) {
      settleOrphaned(orphaned);
    }
    if (undone) {
      discardNew(NEW_NODE_DISCARDED);
    }
    if (revive) {
      resumeNaming(revive);
    }
  }

  /**
   * Put the editor back on a node the student was part way through making.
   *
   * No mark, and that is the point. A mark names a state a caller can be taken back TO, and every
   * state behind this one holds the node: rewinding to any of them would leave the very node being
   * discarded on the map while reporting that it had gone — which is what the seeded key run caught.
   * So this edit owns nothing on the stack, and if the student walks away from the field the node is
   * removed as an ordinary step they can undo.
   *
   * @param {string} id
   */
  function resumeNaming(id) {
    const node = nodeAt(history.current(), id);
    focusedId = id;
    editing = {
      id,
      original: '',
      typed: '',
      caret: 0,
      created: true,
      from: node.parentId,
      mark: undefined,
    };
    render();
    selectFocused(id, { said: true });
    announce(NAMING_AGAIN);
  }

  /**
   * An edit whose row was taken away never reached `leaveEdit`, so the rule that exit enforces is
   * enforced here: a node hidden under a collapsed branch with no name is one the student will meet
   * again as a blank box. Nothing can be rewound — somebody else's step is what hid the row — so a
   * blank new node goes as an ordinary removal.
   *
   * Only a created node can be nameless here. A rename never writes an emptied field to the map, so
   * a node that had a name still has it, whatever became of the row.
   *
   * @param {Object} edit - the `editing` record of the edit that lost its row.
   */
  function settleOrphaned(edit) {
    if (edit.typed.trim() !== '') {
      // A name was typed, and it is already on the map: there is nothing to settle.
      return;
    }
    if (edit.created) {
      suppressRender = true;
      try {
        discardCreatedNode(history, { id: edit.id, mark: edit.mark });
      } finally {
        suppressRender = false;
      }
      afterDiscard(edit.from, NEW_NODE_DISCARDED);
      return;
    }
    // A node that had a name still has it — an emptied field was never written — so this says what
    // happened to the words rather than putting anything back. A node that was nameless before this
    // edit (an imported one can be) has nothing to say. Shown as well as said: the row the student
    // was typing in has gone, and the old name is sitting there in its place unexplained.
    if (edit.original.trim() !== '') {
      notify(keptNameSentence(edit.original));
    }
  }

  /** Update the tab stop and the selected flag without rebuilding the tree. */
  function refreshFlags() {
    for (const item of tree.querySelectorAll('[role="treeitem"]')) {
      item.tabIndex = item.dataset.id === focusedId ? 0 : -1;
      item.setAttribute('aria-selected', String(selection.has(item.dataset.id)));
      item.classList.toggle('assist-mm-item--primary', isPrimaryOfSet(item.dataset.id));
    }
  }

  /**
   * Write a node's text without restarting the editor: the input the student is typing into is
   * already showing the new text, so the rebuild this change would otherwise cause is skipped.
   *
   * An emptied field writes NOTHING. A node with no name is a blank box on the canvas, a blank row
   * here and an empty line in every export, and the map must never hold one — the rule the
   * inspector's Text field has always kept. It used to be kept instead by folding the whole edit
   * away on the way out, which is refused the moment another pane writes in between: a debounced
   * note from the Details panel landing mid-rename was enough to leave the emptied name on the undo
   * stack, one Ctrl+Z from the student. Not writing it is the only version of the rule that cannot
   * be refused. The field the student is typing in shows what they typed either way, and the way out
   * of the editor decides what to do about a name they never replaced.
   *
   * @param {string} id @param {string} text
   */
  function applyText(id, text) {
    if (text.trim() === '') {
      return;
    }
    // Every keystroke of an edit carries that edit's mark, whether the node is new or is being
    // renamed. It is what lets the whole edit be taken back off the stack as one thing: the creation
    // and the naming on top of it. The history refuses that the moment anybody else has written in
    // between, and then the edit simply costs the student two presses instead of one.
    const mark = editing ? editing.mark : undefined;
    suppressRender = true;
    try {
      history.apply('setText', { id, text }, { mark });
    } finally {
      suppressRender = false;
    }
  }

  /** @param {string} id @param {string} [seed] - a character typed to start the edit. */
  function startEdit(id, seed) {
    const node = nodeAt(history.current(), id);
    if (!node) {
      return;
    }
    focusedId = id;
    // An editor is open on one node, so a set the student had is dropped here as it is on the canvas.
    // Not `said`: the count sentence names the node being renamed, which is exactly the news.
    if (selection.ids().length > 1) {
      selectFocused(id);
    }
    // Taken before the first keystroke, so the whole edit is one thing on the stack.
    editing = { id, original: node.text, typed: node.text, caret: null, mark: history.mark() };
    if (seed !== undefined) {
      editing.caret = seed.length;
      applyText(id, seed);
    }
    render();
  }

  /**
   * Finish the edit, keeping what was typed. The text is already in the history — it was applied
   * as the student typed — so this only takes the input away and puts the row back.
   *
   * What it does do is fold the edit's steps into one. Making a node and naming it is two operations
   * and one thing the student did; so is typing a new name over an old one, however many keystrokes
   * it took. Left unfolded, the first Ctrl+Z after naming a new node took the name off and left an
   * empty box, and the first Ctrl+Z after renaming an old one landed on whatever half-typed or
   * emptied state the keystrokes had passed through — which is the one thing every editor on this
   * page refuses to write.
   */
  function commitEdit() {
    if (!editing) {
      return;
    }
    const edit = editing;
    editing = null;
    suppressRender = true;
    try {
      history.squashSince(edit.mark, { name: edit.created ? 'addNode' : 'setText' });
    } finally {
      suppressRender = false;
    }
    render();
  }

  /**
   * Whether the node has no name.
   *
   * The open field is the truth while there is one: an emptied name is never written, so the map
   * still holds the name the student is part way through replacing. With no field open — an edit
   * whose row was taken away — the map is all there is, and the only node it can report as nameless
   * is one that was created and never named.
   *
   * @param {string} id
   * @returns {boolean}
   */
  function isBlank(id) {
    const node = nodeAt(history.current(), id);
    if (!node) {
      return false;
    }
    const input = editing && editing.id === id ? editorInput() : null;
    return (input ? input.value : node.text).trim() === '';
  }

  /**
   * Throw away a node this edit created, along with the step that created it.
   *
   * Rewinding the history rather than applying `removeNode` is the point: a removal would be an
   * undo step of its own, and the first Ctrl+Z after it would put the empty node the student had
   * just discarded straight back on the map — and walking back with `undo` would leave it one
   * Ctrl+Y away instead. The rewind forgets the creation and the typing on top of it altogether.
   *
   * That is only honest while the creation is still on the stack with nothing but this node's own
   * typing above it. Once it is not — the stack is finite, and another pane may have written to
   * the map meanwhile — the node goes the ordinary way, as a removal the student can undo.
   *
   * @param {string} message - what to say; each way out of the editor has its own reason.
   */
  function discardNew(message) {
    const { id, from, mark } = editing;
    editing = null;

    suppressRender = true;
    try {
      discardCreatedNode(history, { id, mark });
    } finally {
      suppressRender = false;
    }

    afterDiscard(from, message);
  }

  /**
   * Put the student back where they asked from, once a node they never named has gone.
   *
   * Every way a new node is discarded ends here — Escape, a blur, a row taken away, an undo of the
   * student's own typing — so none of them can be the one that forgets to move the keyboard, to
   * select something real, or to say what happened.
   *
   * The sentence is shown as well as said, every time. It used to be spoken into the live region
   * alone unless the caller asked otherwise, on the reasoning that Escape and a blur are the
   * student's own "be rid of it" — but a row disappearing is not a sentence, and a student who
   * pressed Escape by accident, or who left the field without meaning to end anything, watched their
   * own new node vanish with nothing on screen to say what had happened or that it was their doing.
   *
   * @param {string} from - the row the student asked from.
   * @param {string} message
   */
  function afterDiscard(from, message) {
    const map = history.current();
    const shown = visibleOrder(map);
    // The row they asked from, or the nearest branch above it that is still on screen. A fold can
    // have taken that row away along with the one being typed into — and the branch that swallowed it
    // is what the student presses to see their own work again, which the centre of the map is not.
    const start = hasNode(map, from) ? from : map.rootId;
    focusedId = shown.includes(start)
      ? start
      : [...pathTo(map, start)].reverse().find(id => shown.includes(id)) || map.rootId;
    render();
    selectFocused(focusedId);
    // `notify` writes the live region itself, so this is one call, never a pair with `announce`.
    notify(message);
  }

  /**
   * Leave the edit, by whatever route. What was typed is kept — unless it is nothing. A node this
   * edit created and the student never named has no reason to stay on the map, and a node that
   * had a name gets it back. Every way out of the editor comes through here, so there is no key
   * that leaves a blank node behind.
   *
   * @param {string} [discarded] - what to say if a new node is thrown away; it is shown as well as
   *   said, whichever way out this was (see {@link afterDiscard}).
   * @returns {boolean} true when what was typed was kept.
   */
  function leaveEdit(discarded = NEW_NODE_DISCARDED) {
    // The node may have gone while the field was open: the toolbar's Undo pressed with the mouse
    // never takes the caret out of the field, and a delete in another pane needs no caret at all.
    // There is nothing left to write to and nothing to put back, so this only says what happened and
    // puts the student somewhere real — the same ending every discard has.
    if (!hasNode(wholeMapOf(history), editing.id)) {
      const { from, created } = editing;
      editing = null;
      if (created) {
        afterDiscard(from, discarded);
      } else {
        render();
      }
      return false;
    }
    if (isBlank(editing.id)) {
      if (editing.created) {
        discardNew(discarded);
        return false;
      }
      // A node that was nameless before this edit (an imported one can be) has nothing to go back
      // to, and is no worse for having been opened.
      if (editing.original.trim() !== '') {
        const { original } = editing;
        revertEdit();
        // The same repair the other two editors make, said in the same words and shown the same
        // way: the row writing itself back in is not on its own an explanation.
        notify(keptNameSentence(original));
        return false;
      }
    }
    commitEdit();
    return true;
  }

  /**
   * Close the editor with the node's text as it was when the edit began.
   *
   * Forgetting the keystrokes rather than writing the old name back over them: the text never really
   * changed, so the stack should not remember that it did. Writing it back left the emptied state one
   * Ctrl+Z away, which is a blank node the student would meet again without having asked for one. The
   * rewind is refused once anybody else has written in between, and then the old name goes back the
   * ordinary way — a step the student can undo, which is honest because it is the only way left.
   */
  function revertEdit() {
    const { id, original, mark } = editing;
    editing = null;
    focusedId = id;
    const node = nodeAt(history.current(), id);
    if (node && node.text !== original) {
      suppressRender = true;
      const rewound = history.rewindTo(mark, { name: 'setText' });
      suppressRender = false;
      if (!rewound) {
        applyText(id, original);
      }
    }
    render();
  }

  /** Escape: put the text back as it was, where there is a "was" to go back to. */
  function cancelEdit() {
    if (!editing) {
      return;
    }
    // A node this edit made has no earlier text: putting back the empty string would leave the
    // blank node Escape was pressed to be rid of, and deleting a node the student has just named
    // would be worse. So it goes if it is still blank, and stays, as typed, if it is not.
    if (editing.created) {
      const { id } = editing;
      if (leaveEdit()) {
        announce(keptNewNodeSentence(history.current().nodes[id].text));
      }
      return;
    }
    revertEdit();
  }

  /**
   * Tab means two different things depending on how focus got here.
   *
   * Inside the tree it indents the node — the outliner gesture the whole pane is built around.
   * Arriving at the tree, it means "move on", and claiming it there would be a keyboard trap and,
   * worse, a silent edit: Escape parks focus on the hint after the tree, and Shift+Tab from the
   * hint passes back through the roving row on its way out. Without this flag that second
   * Shift+Tab outdented whatever the student had last been reading.
   *
   * So the tree only treats Tab as indent once the student has demonstrably started working in
   * it — an arrow, Enter, F2, a typed character, or a press on a row. Leaving the tree clears it.
   */
  const armStructure = () => {
    tree.dataset.editingStructure = 'true';
  };

  const disarmStructure = () => {
    delete tree.dataset.editingStructure;
  };

  /** @param {string} id */
  function focusNode(id) {
    focusedId = id;
    rowFor(id)?.focus();
  }

  /**
   * Select a node after a change that moved focus, without a second rebuild.
   *
   * @param {string} id
   * @param {{said?: boolean}} [meta] - `said` when the act about to happen will announce what it did,
   *   so the page does not read the new count out over the top of it.
   */
  function selectFocused(id, meta = {}) {
    selection.set(id, { source: 'outline', said: Boolean(meta.said) });
    refreshFlags();
  }

  /**
   * Move the tab stop without touching the selection — Ctrl+Arrow.
   *
   * The only way a student building a set from the keyboard can reach a node that is not beside the
   * ones they already have. Focus landing on a row otherwise selects it, so this says not to.
   *
   * @param {string} id
   */
  function focusWithoutSelecting(id) {
    keepingSelection = true;
    try {
      focusNode(id);
    } finally {
      keepingSelection = false;
    }
    refreshFlags();
  }

  /**
   * Extend the selection from the anchor to a row, and put the tab stop on it.
   *
   * @param {string} id
   */
  function extendSelectionTo(id) {
    focusedId = id;
    selection.extendTo(id, visibleOrder(history.current()), { source: 'outline' });
    rowFor(id)?.focus();
    refreshFlags();
  }

  /**
   * Put a row in or out of the selection, leaving the tab stop where it is.
   *
   * @param {string} id
   */
  function toggleSelected(id) {
    focusedId = id;
    selection.toggle(id, { source: 'outline' });
    rowFor(id)?.focus();
    refreshFlags();
  }

  /**
   * Ctrl+A: the node's siblings, and then — pressed again, or on the centre, which has none — every
   * row on screen. Which of the two happened is said, because the same key doing two things is only
   * fair if the student is told which one they got.
   *
   * @param {string} id
   */
  function selectSiblingsOrAll(id) {
    const map = history.current();
    const order = visibleOrder(map);
    const node = map.nodes[id];
    const siblings = node.parentId ? map.nodes[node.parentId].children : null;
    const chosen = selection.ids();
    const alreadySiblings =
      siblings !== null &&
      siblings.length === chosen.length &&
      siblings.every(siblingId => chosen.includes(siblingId));

    if (siblings === null || alreadySiblings) {
      selection.selectAll(order, { source: 'outline', said: true });
      announce(selectedEverythingSentence(order.length, isBranchView(map)));
    } else {
      selection.selectAll(siblings, { source: 'outline', said: true });
      announce(
        `${siblings.length} ${siblings.length === 1 ? 'node' : 'nodes'} selected: this one and its siblings.`
      );
    }
    refreshFlags();
  }

  /** @param {number} delta @param {string} id */
  function step(delta, id) {
    const order = visibleOrder(history.current());
    const at = order.indexOf(id) + delta;
    if (at >= 0 && at < order.length) {
      focusNode(order[at]);
    }
  }

  /**
   * Shift+Arrow: take the range out to the next row along.
   *
   * @param {Object} map
   * @param {string} id
   * @param {number} delta
   */
  function extendFocus(map, id, delta) {
    const order = visibleOrder(map);
    const at = order.indexOf(id) + delta;
    if (at >= 0 && at < order.length) {
      extendSelectionTo(order[at]);
    }
  }

  /**
   * Ctrl+Arrow: move the tab stop and leave the set alone.
   *
   * @param {Object} map
   * @param {string} id
   * @param {number} delta
   */
  function stepWithoutSelecting(map, id, delta) {
    const order = visibleOrder(map);
    const at = order.indexOf(id) + delta;
    if (at >= 0 && at < order.length) {
      focusWithoutSelecting(order[at]);
    }
  }

  /**
   * The record an edit of a brand-new node runs under, and the one this pane's own editor opens on.
   *
   * `own` is false when the node was asked for from somewhere else — the canvas's quick-add
   * handles — because the student is looking at the canvas and that is where the name is typed.
   * The record goes back to them either way, so whichever editor is on screen can throw away a
   * blank node with the step that made it.
   *
   * @param {string} id - the new node's id.
   * @param {string} from - the row the student asked from.
   * @param {symbol} mark - the history as it stood before the node existed.
   * @param {boolean} own - whether this pane opens its own editor on it.
   * @returns {{id: string, original: string, typed: string, caret: number, created: true,
   *   from: string, mark: symbol}}
   */
  function beginNew(id, from, mark, own) {
    const record = { id, original: '', typed: '', caret: 0, created: true, from, mark };
    madeHere.add(id);
    focusedId = id;
    if (own) {
      editing = record;
    } else {
      lent = id;
    }
    return record;
  }

  /** @param {string} id @param {{own?: boolean}} [options] */
  function newSibling(id, { own = true } = {}) {
    // The centre has no siblings (ADR 0001: one root), so Enter on it adds inside it — and
    // `newChild` is what opens a shut branch first, so that the new node has a row to be named in.
    if (id === history.current().rootId) {
      return newChild(id, { own });
    }
    const dropped = selection.ids().filter(other => other !== id).length;
    const mark = history.mark();
    const record = beginNew(makeId(), id, mark, own);
    history.apply('addSibling', { siblingId: id, node: { id: record.id, text: '' } }, { mark });
    // `said`: the new node has no name yet, and the settled count would read "1 node selected: ''."
    // over the top of the sentence below.
    selectFocused(record.id, { said: true });
    announce(`New node.${dropped > 0 ? ` ${droppedSetSentence(dropped)}` : ''} Type to name it.`);
    return record;
  }

  /** @param {string} id @param {{own?: boolean}} [options] */
  function newChild(id, { own = true } = {}) {
    const parent = nodeAt(history.current(), id);
    const dropped = selection.ids().filter(other => other !== id).length;
    // Taken before the branch is opened, and carried by both steps: opening the branch is part of
    // the edit, so a discarded child leaves its parent shut, as it was found.
    const mark = history.mark();
    if (parent.collapsed) {
      history.apply('toggleCollapsed', { id }, { mark });
    }
    const record = beginNew(makeId(), id, mark, own);
    history.apply('addChild', { parentId: id, node: { id: record.id, text: '' } }, { mark });
    selectFocused(record.id, { said: true });
    announce(
      `New node inside '${nameOf(parent.text)}'.` +
        `${dropped > 0 ? ` ${droppedSetSentence(dropped)}` : ''} Type to name it.`
    );
    return record;
  }

  /** @param {string} id */
  function removeCurrent(id) {
    const map = history.current();
    if (id === map.rootId) {
      announce(centreNotDeletedSentence(isBranchView(map)));
      return;
    }
    const node = map.nodes[id];
    const buried = subtreeIds(map, id).length - 1;
    const order = visibleOrder(map);
    const at = order.indexOf(id);
    const next = at > 0 ? order[at - 1] : node.parentId;

    // Chosen before the removal, not after: the store prunes itself the moment the map changes, and
    // a selection that already stands on a surviving row gives it nothing to repair.
    focusedId = next;
    selectFocused(next, { said: true });
    history.apply('removeNode', { id });
    announce(deletedNodesSentence({ count: 1, buried, hadCentre: false, text: node.text }));
  }

  /**
   * Delete every selected node, as one undo step.
   *
   * The centre is taken out of the set first and the effective set is taken of what is left, so
   * selecting the whole outline still empties it rather than being told the centre cannot go. A
   * selected node inside another selected node is carried by it, so nothing is deleted twice.
   *
   * @param {string[]} ids
   */
  function removeSet(ids) {
    const map = history.current();
    const hadCentre = ids.includes(map.rootId);
    const going = effectiveSet(
      map,
      ids.filter(id => id !== map.rootId)
    );
    if (going.length === 0) {
      announce(centreNotDeletedSentence(isBranchView(map)));
      return;
    }

    const buried = going.reduce((total, id) => total + subtreeIds(map, id).length - 1, 0);
    const doomed = new Set(going.flatMap(id => subtreeIds(map, id)));
    const order = visibleOrder(map);
    // The nearest row above the first one going that is not going itself; its parent when the whole
    // list above it is going too. A parent of an effective node is never in the set.
    let next = map.nodes[going[0]].parentId;
    for (let back = order.indexOf(going[0]) - 1; back >= 0; back -= 1) {
      if (!doomed.has(order[back])) {
        next = order[back];
        break;
      }
    }

    focusedId = next;
    selectFocused(next, { said: true });
    history.applyBatch(
      going.map(id => ({ op: 'removeNode', args: { id } })),
      { name: 'removeNodes' }
    );
    announce(
      deletedNodesSentence({
        count: going.length,
        buried,
        hadCentre,
        text: going.length === 1 ? map.nodes[going[0]].text : null,
        branch: isBranchView(map),
      })
    );
  }

  /**
   * Indent, outdent or reorder every selected node, as one undo step.
   *
   * `blockMoveSteps` owns the rule: contiguous siblings move as a block, and anything else is
   * several blocks moved one at a time, in the order that keeps them from landing on each other. A
   * set that cannot move anywhere makes no step at all, so it costs no Ctrl+Z.
   *
   * @param {string[]} ids
   * @param {'indent'|'outdent'|'up'|'down'} act
   */
  function moveSet(ids, act) {
    const before = history.current();
    const hadCentre = ids.includes(before.rootId);
    const { steps, moved, stayed } = blockMoveSteps(before, { ids, act });
    if (moved === 0 && stayed === 0) {
      // Nothing but the top node was selected, which is the one thing that never moves.
      announce(centreNotMovedSentence(isBranchView(before)));
      return;
    }
    if (steps.length > 0) {
      history.applyBatch(steps, { name: act });
    }
    if (leftTheMap(ids)) {
      return;
    }
    announce(reorderedSetSentence({ act, moved, stayed, hadCentre, branch: isBranchView(before) }));
  }

  /**
   * Tick every selected node, or untick them all when they are already ticked.
   *
   * An attribute, so each node is changed in its own right: a selected node inside another selected
   * node is ticked too, which is not true of a move.
   *
   * @param {string[]} ids
   */
  function toggleDoneSet(ids) {
    const map = history.current();
    const nodes = ids.filter(id => hasNode(map, id));
    const done = !nodes.every(id => map.nodes[id].done);
    const steps = nodes
      .filter(id => map.nodes[id].done !== done)
      .map(id => ({ op: 'setDone', args: { id, done } }));
    history.applyBatch(steps, { name: 'setDone' });
    announce(markedDoneSetSentence(steps.length, done));
  }

  /**
   * Fold or unfold every selected node that has anything inside it.
   *
   * A leaf is counted rather than ignored, so a student who selected six rows and folded four is
   * told why. Folding a branch the tab stop is inside would leave the keyboard on a row that is no
   * longer there, so the tab stop and the selection come out to that branch first — said in the
   * collapse's own sentence rather than as a second announcement.
   *
   * @param {string[]} ids
   * @param {boolean} collapse
   */
  function setCollapsedSet(ids, collapse) {
    const map = history.current();
    const nodes = ids.filter(id => hasNode(map, id));
    const childless = nodes.filter(id => map.nodes[id].children.length === 0).length;
    const steps = nodes
      .filter(id => map.nodes[id].children.length > 0 && map.nodes[id].collapsed !== collapse)
      .map(id => ({ op: 'toggleCollapsed', args: { id } }));

    if (steps.length > 0) {
      const folding = new Set(steps.map(step => step.args.id));
      const swallowed = pathTo(map, focusedId)
        .slice(0, -1)
        .find(ancestorId => folding.has(ancestorId));
      if (collapse && swallowed) {
        focusedId = swallowed;
        selectFocused(swallowed, { said: true });
      }
      history.applyBatch(steps, { name: 'toggleCollapsed' });
    }
    announce(collapsedSetSentence(collapse, { changed: steps.length, childless }));
  }

  /**
   * Whether a move has taken a node out of the map this pane is drawing.
   *
   * A node CAN leave without leaving the student's map: the page may have narrowed the view to one
   * branch (slice E2), and an outdent at the top of that branch is a real edit that puts the node
   * outside it. This pane must not then name the parent it landed under — it cannot see it — and
   * whatever narrowed the view is the one thing that can say where the node went, so it says it.
   *
   * @param {string[]} ids - the nodes that were asked to move.
   * @returns {boolean}
   */
  const leftTheMap = ids => ids.some(id => !hasNode(history.current(), id));

  /** @param {string} id @param {boolean} outwards */
  function reparent(id, outwards) {
    const before = history.current();
    if (id === before.rootId) {
      announce(centreNotMovedSentence(isBranchView(before)));
      return;
    }
    const node = before.nodes[id];
    // Tab works inside the editor too, where the node may not have a name to be called by yet.
    const blankName = editing && editing.created ? 'the new node' : 'this node';
    const name = node.text.trim() === '' ? blankName : `'${node.text}'`;
    // Indenting under a shut branch would take the row out of sight — and the editor with it, if
    // the node is being written — so the branch opens with the move, as one step.
    const siblings = before.nodes[node.parentId].children;
    const above = before.nodes[siblings[siblings.indexOf(id) - 1]];
    const steps = [{ op: outwards ? 'outdent' : 'indent', args: { id } }];
    if (!outwards && above && above.collapsed) {
      steps.push({ op: 'toggleCollapsed', args: { id: above.id } });
    }
    // A move made while the node is being written is part of that edit, so it carries its mark:
    // Enter, Tab, change your mind, and the indent goes with the node.
    const after = history.applyBatch(steps, { name: steps[0].op, mark: editing?.mark });
    if (leftTheMap([id])) {
      return;
    }
    if (after === before) {
      const reason = outwards
        ? 'is already at the top level.'
        : 'is the first node here, so there is nothing to move it under.';
      // A sentence starts with a capital, whatever it starts with.
      announce(`${name.charAt(0).toUpperCase()}${name.slice(1)} ${reason}`);
      return;
    }
    announce(`Moved ${name} under '${after.nodes[after.nodes[id].parentId].text}'`);
  }

  /** @param {string} id @param {number} delta */
  function reorder(id, delta) {
    const before = history.current();
    if (id === before.rootId) {
      announce(centreNotMovedSentence(isBranchView(before)));
      return;
    }
    const node = before.nodes[id];
    const after = history.apply(delta < 0 ? 'moveUp' : 'moveDown', { id });
    if (after === before) {
      announce(`'${nameOf(node.text)}' is already ${delta < 0 ? 'first' : 'last'} here.`);
      return;
    }
    announce(`Moved '${nameOf(node.text)}' ${delta < 0 ? 'up' : 'down'}`);
  }

  /** @param {string} id */
  function toggleDone(id) {
    const node = history.current().nodes[id];
    history.apply('setDone', { id, done: !node.done });
    announce(`'${nameOf(node.text)}' ${node.done ? 'no longer marked done' : 'marked done'}`);
  }

  /** @param {string} id @param {boolean} collapse */
  function setCollapsed(id, collapse) {
    const map = history.current();
    const node = map.nodes[id];
    const hidden = subtreeIds(map, id).length - 1;
    history.apply('toggleCollapsed', { id });
    announce(
      collapse
        ? `Collapsed '${nameOf(node.text)}', ${childWord(hidden)} hidden`
        : `Expanded '${nameOf(node.text)}', ${childWord(hidden)} shown`
    );
  }

  function onEditInput(event) {
    if (!editing) {
      return;
    }
    editing.caret = event.target.selectionStart;
    applyText(editing.id, event.target.value);
  }

  function onEditKeyDown(event) {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      const id = editing.id;
      // A blank node is not followed by another: a held Enter would otherwise fill the map, and
      // every export of it, with empty boxes.
      // A refusal, not a discard the student asked for: they pressed Enter for another node and got
      // an empty outline instead, so the sentence says what to do next as well as what happened.
      const kept = leaveEdit('New node discarded. Type a name before adding another node.');
      if (kept && !event.ctrlKey && !event.metaKey) {
        // Shift means "inside" on a row that is not being written, and a student part way through
        // naming a node is exactly who reaches for it. Reading it as a sibling here built a flat map
        // while the shortcut list promised a child, and said nothing about it.
        if (event.shiftKey) {
          newChild(id);
        } else {
          newSibling(id);
        }
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === 'Tab') {
      // Enter, Tab, then type: the node moves and the student carries on writing it. The rebuild
      // the move causes carries the input, its text and its caret across, as any rebuild does.
      event.preventDefault();
      reparent(editing.id, event.shiftKey);
    }
  }

  function onEditBlur() {
    if (rendering || !editing) {
      return;
    }
    leaveEdit();
  }

  function onTreeKeyDown(event) {
    if (editing) {
      return;
    }
    const item = event.target.closest?.('[role="treeitem"]');
    if (!item) {
      return;
    }
    const id = item.dataset.id;
    const map = history.current();
    const node = map.nodes[id];
    if (!node) {
      return;
    }

    // Every key the tree owns except the two that are about leaving it.
    if (event.key !== 'Tab' && event.key !== 'Escape') {
      armStructure();
    }

    // The set the student has built. Every act below asks it rather than the one id under the tab
    // stop, and falls through to the single-node path when the set holds one node — which is what
    // keeps one selected node behaving exactly as it did before the set existed.
    const chosen = selection.ids();
    const many = chosen.length > 1;
    const control = event.ctrlKey || event.metaKey;

    // The two keys here that a student can move in Settings, asked of the registry before the switch
    // so a remapped binding is seen even when it lands on a key the switch also knows. Rename is F2
    // by default and selecting the siblings is Ctrl+A; everything in the switch below is structural.
    if (matchesBinding(event, 'mm_rename')) {
      event.preventDefault();
      startEdit(id);
      return;
    }
    if (matchesBinding(event, 'mm_select_siblings')) {
      // Whatever it is bound to, the browser must not be left to select the whole page with it.
      event.preventDefault();
      selectSiblingsOrAll(id);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (event.altKey) {
          if (many) {
            moveSet(chosen, 'down');
          } else {
            reorder(id, 1);
          }
        } else if (event.shiftKey) {
          extendFocus(map, id, 1);
        } else if (control) {
          stepWithoutSelecting(map, id, 1);
        } else {
          step(1, id);
        }
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (event.altKey) {
          if (many) {
            moveSet(chosen, 'up');
          } else {
            reorder(id, -1);
          }
        } else if (event.shiftKey) {
          extendFocus(map, id, -1);
        } else if (control) {
          stepWithoutSelecting(map, id, -1);
        } else {
          step(-1, id);
        }
        return;
      case 'ArrowLeft':
        event.preventDefault();
        // With a set, the arrow folds every branch in it. On one node it is the outliner key it has
        // always been: fold this branch, or step out to the parent when there is nothing to fold.
        if (many) {
          setCollapsedSet(chosen, true);
        } else if (node.children.length > 0 && !node.collapsed) {
          setCollapsed(id, true);
        } else if (node.parentId) {
          focusNode(node.parentId);
        }
        return;
      case 'ArrowRight':
        event.preventDefault();
        if (many) {
          setCollapsedSet(chosen, false);
          return;
        }
        if (node.children.length === 0) {
          return;
        }
        if (node.collapsed) {
          setCollapsed(id, false);
        } else {
          focusNode(node.children[0]);
        }
        return;
      case 'Home': {
        event.preventDefault();
        const order = visibleOrder(map);
        if (event.shiftKey) {
          extendSelectionTo(order[0]);
        } else {
          focusNode(order[0]);
        }
        return;
      }
      case 'End': {
        event.preventDefault();
        const order = visibleOrder(map);
        const last = order[order.length - 1];
        if (event.shiftKey) {
          extendSelectionTo(last);
        } else {
          focusNode(last);
        }
        return;
      }
      case 'Enter':
        event.preventDefault();
        if (event.shiftKey) {
          newChild(id);
        } else {
          newSibling(id);
        }
        return;
      case 'Tab':
        if (tree.dataset.editingStructure !== 'true') {
          // Focus is only passing through: let it carry on out of the pane.
          return;
        }
        event.preventDefault();
        if (many) {
          moveSet(chosen, event.shiftKey ? 'outdent' : 'indent');
        } else {
          reparent(id, event.shiftKey);
        }
        return;
      case 'Delete':
        event.preventDefault();
        if (many) {
          removeSet(chosen);
        } else {
          removeCurrent(id);
        }
        return;
      case ' ':
        event.preventDefault();
        // Ctrl+Space is the set key; Space on its own has always been the tick.
        if (control) {
          toggleSelected(id);
        } else if (many) {
          toggleDoneSet(chosen);
        } else {
          toggleDone(id);
        }
        return;
      case 'Escape':
        event.preventDefault();
        // A set is what Escape takes away first. Leaving the outline with four rows still marked
        // would be two things happening on one press, and the student would come back to a set they
        // thought they had dropped.
        if (many) {
          selection.clearToPrimary({ source: 'outline' });
          refreshFlags();
          return;
        }
        // Then whatever the page has narrowed the view down to, which the student is more likely to
        // have meant than leaving the outline — and which leaves them in the tree either way.
        if (onEscape()) {
          return;
        }
        disarmStructure();
        hint.focus();
        return;
      default:
        break;
    }

    // Typing on a row starts the edit with the character that was typed, the way an outliner does.
    // '?' is the exception: it is the page's shortcut for the help dialog (SC 3.2.6), and help a
    // student can only reach by first leaving the editor is help they will not find.
    if (
      event.key.length === 1 &&
      event.key !== '?' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      startEdit(id, event.key);
    }
  }

  function onFocusIn(event) {
    const item = event.target;
    if (!item.matches || !item.matches('[role="treeitem"]')) {
      return;
    }
    focusedId = item.dataset.id;
    // Focus landing on a row selects that row alone — which is what makes the plain arrows feel like
    // an outliner. Two exceptions: Ctrl+Arrow says it is only moving the tab stop, and a row that is
    // already the primary of a set must not have the set taken off it by focus arriving where it
    // already is (a Shift range ends on its own far end).
    if (!keepingSelection && selection.get() !== focusedId) {
      selection.set(focusedId, { source: 'outline' });
    }
    refreshFlags();
  }

  /**
   * @param {FocusEvent} event
   */
  function onFocusOut(event) {
    // A rebuild takes the focused row out of the document and puts a new one back; that is not the
    // student leaving.
    if (rendering || tree.contains(event.relatedTarget)) {
      return;
    }
    disarmStructure();
  }

  tree.addEventListener('keydown', onTreeKeyDown);
  tree.addEventListener('focusin', onFocusIn);
  tree.addEventListener('focusout', onFocusOut);

  const unsubscribeHistory = history.subscribe((_map, opName) => {
    if (suppressRender) {
      return;
    }
    render({ opName });
  });

  const unsubscribeSelection = selection.subscribe((id, meta) => {
    // A node the map has lost cannot keep an editor open over it. The selection store prunes itself
    // the moment the map changes and tells everybody BEFORE this pane's own history subscription
    // runs, so this is the first thing that knows — and moving focus to another row while the field
    // is still open would hand the decision about where the student lands to a blur. Settled here,
    // where they go is where they stay.
    if (editing && !hasNode(wholeMapOf(history), editing.id)) {
      leaveEdit();
      return;
    }
    if (meta.source === 'outline') {
      return;
    }
    const map = history.current();
    if (id && hasNode(map, id) && visibleOrder(map).includes(id)) {
      const hadFocus = tree.contains(doc.activeElement);
      focusedId = id;
      refreshFlags();
      if (hadFocus) {
        rowFor(id)?.focus();
      }
      return;
    }
    refreshFlags();
  });

  render();

  return {
    /**
     * Make a node the way Enter and Shift+Enter do, for a control outside this pane.
     *
     * The canvas's quick-add handles come through here rather than reaching for the ops
     * themselves, so there is one way to make a node: the mark is taken before the creation, a shut
     * branch opens as part of the same edit, and the node is selected. This pane does not open its
     * own editor for it — the student pressed something on the canvas, so the canvas opens one over
     * the box they are looking at, on the record that comes back.
     *
     * @param {string} id - the node the student asked from.
     * @param {Object} [options]
     * @param {boolean} [options.asChild] - a child of it, or the next sibling after it.
     * @param {boolean} [options.openEditor] - true to open THIS pane's editor on the new row, which
     *   is what the toolbar wants: it is not on the canvas, and the outline is the editor. The
     *   canvas's own handles leave it false and open their own field over the box the student is
     *   looking at.
     * @returns {{id: string, original: string, typed: string, caret: number, created: true,
     *   from: string, mark: symbol}|null} the edit record, or null when `id` names no node.
     */
    addNode(id, { asChild = false, openEditor = false } = {}) {
      if (!nodeAt(history.current(), id)) {
        return null;
      }
      const record = asChild
        ? newChild(id, { own: openEditor })
        : newSibling(id, { own: openEditor });
      if (openEditor) {
        // `newChild` and `newSibling` set the record up; the rebuild is what puts the input on screen
        // and the keyboard in it.
        render();
      }
      return record;
    },

    /** Remove the pane and every listener it added. */
    destroy() {
      unsubscribeHistory();
      unsubscribeSelection();
      for (const cleanup of rowCleanups) {
        cleanup();
      }
      rowCleanups = [];
      shown.clear();
      tree.removeEventListener('keydown', onTreeKeyDown);
      tree.removeEventListener('focusin', onFocusIn);
      tree.removeEventListener('focusout', onFocusOut);
      pane.remove();
    },
  };
}
