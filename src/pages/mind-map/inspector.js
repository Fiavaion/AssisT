/**
 * Inspector: the node fields an outline row has no room for.
 *
 * The outline owns text and structure; this pane owns everything else — notes, branch colour,
 * symbol, where the node came from, whether it is done, and the cross-links that live beside the
 * tree. Every write goes through `history.apply`, so undo covers this pane exactly as it covers the
 * other two, and the canvas redraws from the same subscription.
 *
 * The hard part is not the writing but the re-rendering: the pane redraws on every history change,
 * and a student is often typing in it when one arrives (the change is usually their own keystroke,
 * coming back round). So a value is only written into a control that is not focused, unless the
 * selected node itself changed — at which point the fields must show the new node whatever has
 * focus.
 *
 * @module pages/mind-map/inspector
 */

import { CitationStorageRPC } from '../../features/citations/citation-rpc.js';
import { formatInText, referenceSetFor } from '../../features/citations/citation-styles/index.js';
import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { pathTo, subtreeIds, walk } from '../../features/mindMap/core/map-ops.js';
import { BRANCH_COLOURS } from '../../features/mindMap/core/palette.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import {
  SELECT_A_NODE_FIRST,
  cannotMoveIntoOwnBranchSentence,
  centreNotMovedSentence,
  centreStaysSentence,
  colourSetSentence,
  effectiveSet,
  keptNameSentence,
  markedDoneSetSentence,
  movedNodesSentence,
  movedSentence,
  siblingIndexForBlock,
  symbolSetSentence,
} from './node-edits.js';

import './inspector.css';

/** Typing settles before an undo step is cut; `setText` coalesces further inside history. */
const WRITE_DEBOUNCE_MS = 200;

/**
 * Quick symbols, chosen for essay and revision work rather than for decoration. Each is at most two
 * UTF-16 units, so it fits the input's maxlength.
 */
const QUICK_SYMBOLS = ['⭐', '❗', '❓', '💡', '📌', '✅', '⚠️', '🔑', '📖', '✍️', '🔗', '🎯'];

/** Ids must be unique in the page, and the editor may hold more than one inspector. */
let inspectorSerial = 0;

/** What `shared` answers with when the selected nodes disagree; never a value a node could hold. */
const MIXED = Symbol('mixed');

/** A node with no text yet still has to be nameable in a list and a select. */
const labelFor = node => (node && node.text.trim() !== '' ? node.text : '(untitled)');

/**
 * Which node "Focus on this branch" would take, when the student has more than one selected.
 *
 * It takes the primary — the node they are standing on — and a set of four gives no hint of which
 * that is. Said beside the button rather than in its name: the name carries `aria-pressed`, and a
 * name that moves under the state reads as a second control.
 *
 * @param {string} label - the primary node, as {@link labelFor} names it.
 * @returns {string}
 */
const focusesOnSentence = label => `Focuses on '${label}', the node you are on.`;

/** How much of a citation title fits in a picker before it stops helping. */
const CITATION_TITLE = 60;

/**
 * A citation as a student would recognise it in a list: who, when, and enough of the title to tell
 * two papers by the same author apart.
 *
 * @param {Object} citation
 * @returns {string}
 */
function citationLabel(citation) {
  const author = (citation.authors && citation.authors[0]) || citation.siteName || 'Unknown author';
  const year = String(citation.publicationDate || '').slice(0, 4) || 'no date';
  const title = String(citation.title || 'Untitled').slice(0, CITATION_TITLE);
  return `${author}, ${year}, ${title}`;
}

/**
 * Wait for the typing to stop, then write once. The arguments are captured per call, so a write
 * that is still pending when the selection moves lands on the node it was typed into.
 *
 * `flush` runs the pending write now. A write left to its timer lands two hundred milliseconds into
 * whatever the student did next — and a step from this panel arriving in the middle of another pane's
 * rename is what stops that rename being folded into one undo step. `cancel` throws the pending
 * write away instead, for the two places that are about to write the same field themselves.
 */
function debounce(ms, run) {
  let timer = 0;
  let pending = null;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    pending = args;
    timer = window.setTimeout(() => {
      pending = null;
      run(...args);
    }, ms);
  };
  wrapped.cancel = () => {
    window.clearTimeout(timer);
    pending = null;
  };
  wrapped.flush = () => {
    if (!pending) {
      return;
    }
    const args = pending;
    pending = null;
    window.clearTimeout(timer);
    run(...args);
  };
  return wrapped;
}

/** Build a labelled control and return both halves. */
function field(id, labelText, control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mm-inspector__field';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  wrapper.append(label, control);
  return wrapper;
}

const textArea = rows => {
  const element = document.createElement('textarea');
  element.rows = rows;
  return element;
};

const textInput = type => {
  const element = document.createElement('input');
  element.type = type;
  return element;
};

/**
 * Mount the node inspector.
 *
 * @param {HTMLElement} host - emptied on mount.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} [options.announce]
 * @param {(text: string) => void} [options.notify] - the page's `showToast`, which writes the toast
 *   AND the live region in one call. For the repair nobody asked for: the name this panel puts back
 *   when the student empties the Text field. It was said into the live region alone, so a sighted
 *   student saw the name reappear with no word about why. Never called alongside `announce`.
 * @param {(id: string) => void} [options.reveal] - bring a node into view on the canvas; a node
 *   moved from here is usually moved somewhere the student cannot currently see.
 * @param {Object|null} [options.branchFocus] - the `mountBranchFocus` handle. This panel is the
 *   node's own context — it is where "Move to…" lives — so it is where "show me just this branch"
 *   belongs as well. Without one the control is simply away, and the panel is what it was.
 * @returns {{destroy: () => void, focusMoveTo: () => void}}
 */
export function mountInspector(host, options = {}) {
  const {
    history,
    selection,
    announce = () => {},
    notify = () => {},
    reveal = () => {},
    branchFocus = null,
  } = options;

  inspectorSerial += 1;
  const uid = `mm-i${inspectorSerial}`;
  const cleanups = [];
  const linkCleanups = [];

  const form = document.createElement('form');
  form.className = 'mm-inspector';
  form.noValidate = true;
  form.setAttribute('aria-labelledby', `${uid}-title`);
  // Never in the tab order, but somewhere for the keyboard to land when a field has to be taken away
  // from under it — see `releaseFields`.
  form.tabIndex = -1;

  const title = document.createElement('h2');
  title.className = 'mm-inspector__title';
  title.id = `${uid}-title`;
  title.textContent = 'Node details';

  const empty = document.createElement('p');
  empty.className = 'mm-inspector__empty';
  empty.textContent = 'Select a node';

  const fields = document.createElement('fieldset');
  fields.className = 'mm-inspector__fields';

  // ---- text and notes ----------------------------------------------------
  const text = textArea(2);
  const notes = textArea(4);
  const textField = field(`${uid}-text`, 'Text', text);
  const notesField = field(`${uid}-notes`, 'Notes', notes);

  // Said when the panel is showing a set: the fields below it act on every selected node, and the
  // ones that are away are away because "the text" of four nodes is not a thing a box can hold.
  const setNote = document.createElement('p');
  setNote.className = 'mm-inspector__setNote';
  setNote.textContent = 'Text, notes, the source and citations are edited one node at a time.';

  fields.append(setNote, textField, notesField);

  // ---- focus on this branch ----------------------------------------------
  // A VIEW, not an edit: it changes nothing about the map, makes no undo step and saves nothing. It
  // is here because this panel is the node's own context, and because the alternative — a third
  // handle on the selected node on the canvas — would crowd the two that make a node and take
  // presses from them.
  let focusGroup = null;
  let focusWhy = null;
  let focusButton = null;

  if (branchFocus) {
    focusGroup = document.createElement('div');
    focusGroup.className = 'mm-inspector__field mm-inspector__focusField';
    focusWhy = document.createElement('p');
    focusWhy.className = 'mm-inspector__why';
    focusWhy.id = `${uid}-focus-why`;
    focusButton = document.createElement('button');
    focusButton.type = 'button';
    focusButton.className = 'mm-inspector__focusButton';
    // A state, so `aria-pressed` and a name that does not change under it: a control whose label and
    // whose pressed state both move reads as two different controls.
    focusButton.setAttribute('aria-pressed', 'false');
    focusButton.setAttribute('aria-describedby', focusWhy.id);
    focusButton.textContent = 'Focus on this branch';
    focusGroup.append(focusWhy, focusButton);
    cleanups.push(
      attachAccessibleHandler(focusButton, 'Mind map focus on this branch', () => {
        const why = branchFocus.reason();
        if (why) {
          // There is no toast in this panel, so the sentence is both on screen (above the button)
          // and said. Pressing a control that cannot act does nothing else.
          announce(why);
          return;
        }
        branchFocus.toggle();
      })
    );
  }

  // ---- move to -----------------------------------------------------------
  // The single-pointer and keyboard way to do what a drag on the canvas does (SC 2.5.7): choose a
  // parent from a searchable list, then where the node sits among that parent's children. Four
  // native controls rather than a custom picker — a filter, two selects and a button — because a
  // listbox written by hand is a second keyboard model to get right, and this one has to be the
  // reliable path rather than the clever one.
  const moveGroup = document.createElement('fieldset');
  moveGroup.className = 'mm-inspector__group mm-inspector__move';
  const moveLegend = document.createElement('legend');
  moveLegend.textContent = 'Move to';
  const moveWhy = document.createElement('p');
  moveWhy.className = 'mm-inspector__why';
  moveWhy.id = `${uid}-move-why`;
  const moveFilter = textInput('search');
  const moveParent = document.createElement('select');
  const movePlace = document.createElement('select');
  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'mm-inspector__moveButton';
  moveButton.textContent = 'Move';
  // `aria-disabled` and a sentence rather than `disabled`: a control that has something to explain
  // has to stay reachable to explain it, which is the rule the toolbar keeps.
  //
  // All four of them, not the button alone. A student who can filter a list, choose a parent and
  // choose a place for the centre of the map has been told nothing until the press refuses — three
  // controls' worth of work for a sentence that was there from the start. The reason is what each one
  // is described by, so it is read out wherever in the group the keyboard is.
  const moveControls = [moveFilter, moveParent, movePlace, moveButton];
  for (const control of moveControls) {
    control.setAttribute('aria-describedby', moveWhy.id);
  }
  moveGroup.append(
    moveLegend,
    moveWhy,
    field(`${uid}-move-find`, 'Find a parent', moveFilter),
    field(`${uid}-move-parent`, 'New parent', moveParent),
    field(`${uid}-move-place`, 'Place it', movePlace),
    moveButton
  );

  // ---- colour ------------------------------------------------------------
  const colourGroup = document.createElement('fieldset');
  colourGroup.className = 'mm-inspector__group mm-inspector__colours-group';
  const colourLegend = document.createElement('legend');
  colourLegend.textContent = 'Branch colour';
  const colourList = document.createElement('div');
  colourList.className = 'mm-inspector__colours';
  // "Mixed" is a sentence, not an unchecked radio group: nothing checked on its own says only that
  // the student has not chosen, which is a different thing from "these four nodes disagree".
  const colourWhy = document.createElement('p');
  colourWhy.className = 'mm-inspector__mixed';
  colourWhy.id = `${uid}-colour-why`;
  colourGroup.setAttribute('aria-describedby', colourWhy.id);
  colourGroup.append(colourLegend, colourWhy, colourList);

  /** "" means inherit from the nearest ancestor, which is what a fresh node does. */
  const colourOptions = [
    { value: '', name: 'Inherit', fill: null },
    ...BRANCH_COLOURS.map((c, at) => ({
      value: String(at),
      name: c.name,
      fill: c.fill,
    })),
  ];
  const colourRadios = colourOptions.map(option => {
    const label = document.createElement('label');
    label.className = 'mm-inspector__colour';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `${uid}-colour`;
    radio.value = option.value;
    const swatch = document.createElement('span');
    swatch.className = 'mm-inspector__swatch';
    // Decorative: the name beside it is what carries the meaning (SC 1.4.1).
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = option.fill || 'transparent';
    const name = document.createElement('span');
    name.textContent = option.name;
    label.append(radio, swatch, name);
    colourList.appendChild(label);
    return radio;
  });
  fields.appendChild(colourGroup);

  // ---- symbol ------------------------------------------------------------
  const symbol = textInput('text');
  symbol.maxLength = 2;
  const symbolWhy = document.createElement('p');
  symbolWhy.className = 'mm-inspector__mixed';
  symbolWhy.id = `${uid}-symbol-why`;
  symbol.setAttribute('aria-describedby', symbolWhy.id);
  const symbolField = field(`${uid}-symbol`, 'Symbol', symbol);
  symbolField.appendChild(symbolWhy);
  const symbolRow = document.createElement('div');
  symbolRow.className = 'mm-inspector__symbolRow';
  const quickPick = document.createElement('div');
  quickPick.className = 'mm-inspector__quickPick';
  quickPick.setAttribute('role', 'group');
  quickPick.setAttribute('aria-label', 'Quick symbols');
  const clearSymbol = document.createElement('button');
  clearSymbol.type = 'button';
  clearSymbol.textContent = 'Clear';
  symbolRow.append(quickPick, clearSymbol);
  fields.append(symbolField, symbolRow);

  // ---- source ------------------------------------------------------------
  const sourceUrl = textInput('url');
  const sourceQuote = textArea(3);
  const sourceLink = document.createElement('a');
  sourceLink.className = 'mm-inspector__sourceLink';
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener';
  sourceLink.textContent = 'Open source';
  const sourceUrlField = field(`${uid}-source-url`, 'Source URL', sourceUrl);
  const sourceQuoteField = field(`${uid}-source-quote`, 'Quote', sourceQuote);
  fields.append(sourceUrlField, sourceQuoteField, sourceLink);

  // ---- done --------------------------------------------------------------
  const doneRow = document.createElement('div');
  doneRow.className = 'mm-inspector__check';
  const done = document.createElement('input');
  done.type = 'checkbox';
  done.id = `${uid}-done`;
  const doneLabel = document.createElement('label');
  doneLabel.htmlFor = done.id;
  doneLabel.textContent = 'Done';
  const doneWhy = document.createElement('p');
  doneWhy.className = 'mm-inspector__mixed';
  doneWhy.id = `${uid}-done-why`;
  done.setAttribute('aria-describedby', doneWhy.id);
  doneRow.append(done, doneLabel, doneWhy);
  fields.appendChild(doneRow);

  // ---- linked citation ---------------------------------------------------
  // A node that came from a source usually has a citation already saved beside it. Linking the two
  // is what lets a plan become an essay with its references intact, which is the reason the
  // citation was captured at reading time in the first place.
  const citationSelect = document.createElement('select');
  const citationField = field(`${uid}-citation`, 'Linked citation', citationSelect);
  const citationRow = document.createElement('div');
  citationRow.className = 'mm-inspector__citationRow';
  const clearCitation = document.createElement('button');
  clearCitation.type = 'button';
  clearCitation.className = 'mm-inspector__citationClear';
  clearCitation.textContent = 'Clear';
  const citationRef = document.createElement('p');
  citationRef.className = 'mm-inspector__citationRef';
  citationRow.append(clearCitation, citationRef);
  fields.append(citationField, citationRow);

  // ---- cross-links -------------------------------------------------------
  const linksTitle = document.createElement('h3');
  linksTitle.className = 'mm-inspector__linksTitle';
  linksTitle.id = `${uid}-links-title`;
  linksTitle.textContent = 'Cross-links';
  const linkList = document.createElement('ul');
  linkList.className = 'mm-inspector__links';
  linkList.setAttribute('aria-labelledby', linksTitle.id);

  const linkTarget = document.createElement('select');
  const linkLabel = textInput('text');
  const addLink = document.createElement('button');
  addLink.type = 'button';
  addLink.textContent = 'Add';
  const linkForm = document.createElement('div');
  linkForm.className = 'mm-inspector__linkForm';
  linkForm.append(
    field(`${uid}-link-target`, 'Add link to', linkTarget),
    field(`${uid}-link-label`, 'Link label', linkLabel),
    addLink
  );
  fields.append(linksTitle, linkList, linkForm);

  // Outside `fields`, which is `disabled` while nothing is selected: a control that has a reason to
  // give has to stay reachable to give it, and "Select a node first" is one of its reasons.
  // Focus and Move stay OUT of the `fields` fieldset: a disabled fieldset takes its controls out of
  // the tab order, and a control whose whole job is to explain why it cannot act has to stay
  // reachable to explain it — "Select a node first" included.
  form.append(title, empty, ...(focusGroup ? [focusGroup] : []), fields, moveGroup);
  host.replaceChildren(form);

  /**
   * What is shown for one node and put away for a set.
   *
   * The text of four nodes is not a thing one box can hold, and neither is their quote or their
   * citation: a field that cannot act is put away with one sentence saying so, rather than left
   * looking editable and quietly writing to whichever node happened to be the primary.
   */
  const oneNodeOnly = [
    textField,
    notesField,
    sourceUrlField,
    sourceQuoteField,
    citationField,
    citationRow,
    linksTitle,
    linkList,
    linkForm,
  ];

  // ---- writing -----------------------------------------------------------

  const selected = () => selection.get();

  /** Every selected node the map still holds, in the order the set was built. @returns {string[]} */
  const chosenIds = () => {
    const map = history.current();
    return selection.ids().filter(id => hasNode(map, id));
  };

  /**
   * The selected node, or null.
   *
   * `nodeAt` rather than a truthiness test, here and everywhere else this pane reaches into
   * `nodes`: a selection can be restored from storage or arrive from another module with an id that
   * came out of an imported file, and `nodes.constructor` would answer any of them with a function.
   *
   * @param {string|null} id
   * @returns {Object|null}
   */
  const nodeOf = id => nodeAt(history.current(), id);

  /**
   * The nodes each field's value was filled FOR: one id for the one-node fields, the whole set for
   * Symbol.
   *
   * A field writes here and never to whatever happens to be selected by the time the keystroke
   * lands. The selection moves under this panel all the time — a click in another pane, Alt+M, an
   * undo that takes the node away — and the render that follows rewrites the field with the new
   * node's text. Writing to the selection meant the next keystroke saved that text, plus the letter,
   * to a node the student was not looking at: their own words, gone, and someone else's changed.
   */
  const filledFor = new Map();

  /**
   * Fields the selection moved out from under while the caret was in them.
   *
   * The caret is taken out (below), and the field then holds nothing to write to until the student
   * puts it back: a field showing one node's text and bound to another is the same defect wearing a
   * different hat. Focusing it again is the student saying "this node, now".
   */
  const awaitingCaret = new Set();

  /** Every field whose value belongs to a node, in the order the panel shows them. */
  const valueFields = [text, notes, symbol, sourceUrl, sourceQuote];

  /** @param {HTMLElement} element @param {string[]} ids - what the field now shows. */
  const bind = (element, ids) => {
    if (!awaitingCaret.has(element)) {
      filledFor.set(element, ids);
    }
  };

  /** The node a one-node field writes to, or null while it is waiting for the caret to come back. */
  const boundId = element => {
    const ids = filledFor.get(element) || [];
    return ids.length === 1 ? ids[0] : null;
  };

  // A node with no name is a blank box on the canvas, a blank row in the outline and an empty line
  // in every export, so an emptied field writes nothing at all — the rule the outline's editor and
  // the canvas's inline editor both keep. The name comes back on the way out of the field, below.
  const writeText = debounce(WRITE_DEBOUNCE_MS, (id, value) => {
    if (value.trim() !== '' && nodeOf(id)) {
      history.apply('setText', { id, text: value });
    }
  });
  const writeNotes = debounce(WRITE_DEBOUNCE_MS, (id, value) => {
    if (nodeOf(id)) {
      history.apply('setNotes', { id, notes: value });
    }
  });
  // Every selected node, as one undo step: a symbol is an attribute, so it is set on each node in
  // its own right rather than on the branch that carries them.
  const writeSymbol = debounce(WRITE_DEBOUNCE_MS, (ids, value) => {
    applySymbol(ids, value === '' ? null : value);
  });
  const writeSource = debounce(WRITE_DEBOUNCE_MS, (id, url, quote) => {
    const node = nodeOf(id);
    if (!node) {
      return;
    }
    // The title is captured when a highlight creates the node; editing the URL must not lose it.
    const existingTitle = node.source && node.source.title ? node.source.title : '';
    const source = url === '' && quote === '' ? null : { url, quote, title: existingTitle };
    history.apply('setSource', { id, source });
  });

  const onInput = (element, write) => {
    const handler = () => {
      const id = boundId(element);
      if (id) {
        write(id, element.value);
      }
    };
    element.addEventListener('input', handler);
    cleanups.push(() => element.removeEventListener('input', handler));
  };

  onInput(text, writeText);
  onInput(notes, writeNotes);

  const onSymbolInput = () => {
    const ids = (filledFor.get(symbol) || []).filter(id => nodeOf(id));
    if (ids.length > 0) {
      writeSymbol(ids, symbol.value);
    }
  };
  symbol.addEventListener('input', onSymbolInput);
  cleanups.push(() => symbol.removeEventListener('input', onSymbolInput));

  /**
   * Write one symbol to every selected node, as one undo step, and say what happened.
   *
   * @param {string[]} ids
   * @param {string|null} glyph
   */
  function applySymbol(ids, glyph) {
    const map = history.current();
    const steps = ids
      .filter(id => nodeAt(map, id))
      .map(id => ({ op: 'setSymbol', args: { id, symbol: glyph } }));
    history.applyBatch(steps, { name: 'setSymbol' });
    return steps.length;
  }

  /**
   * Put the node's name back when the student leaves the Text field empty.
   *
   * Nothing was written while it was empty, so the map is untouched; what has to be repaired is the
   * field, which otherwise sits there blank and disagreeing with the canvas beside it. Said in the
   * same words the canvas's inline editor uses, because it is the same rule.
   */
  const keepName = () => {
    const id = boundId(text);
    const node = id ? nodeOf(id) : null;
    if (!node || text.value.trim() !== '') {
      return;
    }
    writeText.cancel();
    text.value = node.text;
    // A node the outline has just made and not yet named has no name to keep.
    if (node.text.trim() !== '') {
      // Seen as well as said: the field filling itself back in is not an explanation.
      notify(keptNameSentence(node.text));
    }
  };

  const onTextKeydown = event => {
    if (event.key === 'Enter' && text.value.trim() === '') {
      // A newline is not a name, and this is the one keystroke that means "I am done here".
      event.preventDefault();
      keepName();
    }
  };
  text.addEventListener('blur', keepName);
  text.addEventListener('keydown', onTextKeydown);
  cleanups.push(() => {
    text.removeEventListener('blur', keepName);
    text.removeEventListener('keydown', onTextKeydown);
  });

  const onSourceInput = event => {
    const id = boundId(event.target);
    if (id) {
      writeSource(id, sourceUrl.value.trim(), sourceQuote.value);
    }
  };
  sourceUrl.addEventListener('input', onSourceInput);
  sourceQuote.addEventListener('input', onSourceInput);
  cleanups.push(() => {
    sourceUrl.removeEventListener('input', onSourceInput);
    sourceQuote.removeEventListener('input', onSourceInput);
  });

  // Radios, checkboxes and selects bind `change` directly: the shared helper's preventDefault on
  // mousedown would cancel the flip and the native picker.
  const onColourChange = event => {
    const ids = chosenIds();
    if (ids.length === 0) {
      return;
    }
    const raw = event.target.value;
    const colour = raw === '' ? null : Number(raw);
    history.applyBatch(
      ids.map(id => ({ op: 'setColour', args: { id, colour } })),
      { name: 'setColour' }
    );
    const name = colour === null ? null : BRANCH_COLOURS[colour].name;
    if (ids.length > 1) {
      announce(colourSetSentence(name, ids.length));
      return;
    }
    announce(name === null ? 'Branch colour inherited' : `Branch colour ${name}`);
  };
  for (const radio of colourRadios) {
    radio.addEventListener('change', onColourChange);
    cleanups.push(() => radio.removeEventListener('change', onColourChange));
  }

  const onDoneChange = () => {
    const ids = chosenIds();
    if (ids.length === 0) {
      return;
    }
    // A box that was showing "mixed" is now showing what the student chose, for all of them.
    done.indeterminate = false;
    history.applyBatch(
      ids.map(id => ({ op: 'setDone', args: { id, done: done.checked } })),
      { name: 'setDone' }
    );
    if (ids.length > 1) {
      announce(markedDoneSetSentence(ids.length, done.checked));
      return;
    }
    const id = ids[0];
    announce(
      done.checked
        ? `Marked ${labelFor(nodeOf(id))} done`
        : `Marked ${labelFor(nodeOf(id))} not done`
    );
  };
  done.addEventListener('change', onDoneChange);
  cleanups.push(() => done.removeEventListener('change', onDoneChange));

  for (const glyph of QUICK_SYMBOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = glyph;
    button.setAttribute('aria-label', `Use symbol ${glyph}`);
    quickPick.appendChild(button);
    cleanups.push(
      attachAccessibleHandler(button, `Mind map symbol ${glyph}`, () => {
        const ids = chosenIds();
        if (ids.length === 0) {
          return;
        }
        writeSymbol.cancel();
        symbol.value = glyph;
        applySymbol(ids, glyph);
        announce(ids.length > 1 ? symbolSetSentence(glyph, ids.length) : `Symbol ${glyph}`);
      })
    );
  }

  cleanups.push(
    attachAccessibleHandler(clearSymbol, 'Mind map clear symbol', () => {
      const ids = chosenIds();
      if (ids.length === 0) {
        return;
      }
      writeSymbol.cancel();
      symbol.value = '';
      applySymbol(ids, null);
      announce(ids.length > 1 ? symbolSetSentence(null, ids.length) : 'Symbol cleared');
    })
  );

  cleanups.push(
    attachAccessibleHandler(addLink, 'Mind map add cross-link', () => {
      const from = selected();
      const to = linkTarget.value;
      if (!from || !to) {
        // The placeholder is not a node; there is nothing to link to yet.
        return;
      }
      try {
        history.apply('addLink', { from, to, label: linkLabel.value.trim() });
        announce(`Linked ${labelFor(nodeOf(from))} to ${labelFor(nodeOf(to))}`);
        linkLabel.value = '';
      } catch (error) {
        // A second link between the same pair is a DUPLICATE_ID, not a crash.
        announce(error.message);
      }
    })
  );

  // ---- moving the node ---------------------------------------------------

  /**
   * Why the selection cannot be moved, or '' when it can.
   *
   * The centre can be in a set without stopping it: the rest of the set moves and the sentence says
   * the centre stayed. It is only a refusal when the centre is the whole of what is selected.
   *
   * @param {Object} map
   * @param {string[]} ids
   * @returns {string}
   */
  function moveReason(map, ids) {
    const known = ids.filter(id => nodeAt(map, id));
    if (known.length === 0) {
      return SELECT_A_NODE_FIRST;
    }
    if (known.every(id => id === map.rootId)) {
      // Always the whole map's own centre: this panel is given the REAL history, because "Move to…"
      // offers the whole map as a destination whatever is on screen.
      return `${centreNotMovedSentence()} Move one of its branches instead.`;
    }
    return '';
  }

  /**
   * The nodes a move really moves: the selection without the centre, and without anything carried by
   * something else in it, in outline order.
   *
   * @param {Object} map
   * @param {string[]} ids
   * @returns {string[]}
   */
  function movingBlock(map, ids) {
    return effectiveSet(
      map,
      ids.filter(id => id !== map.rootId)
    );
  }

  /**
   * A node named by where it is, so two branches carrying the same word can be told apart. The
   * ancestors are listed nearest first, the way a student would say it: "Evidence, under Argument".
   *
   * @param {Object} map
   * @param {string} id
   * @returns {string}
   */
  function pathLabel(map, id) {
    const ancestors = pathTo(map, id)
      .slice(0, -1)
      .reverse()
      .map(ancestorId => labelFor(nodeAt(map, ancestorId)));
    const self = labelFor(nodeAt(map, id));
    return ancestors.length === 0 ? self : `${self} (under ${ancestors.join(', ')})`;
  }

  /**
   * Every node the selected one could hang from: the whole map in outline order, less the node
   * itself and everything under it — which is the same refusal `moveNode` makes with CYCLE, said
   * before the student can ask for it rather than after.
   *
   * @param {Object} map
   * @param {string[]} ids
   * @returns {Array<{id: string, label: string}>}
   */
  function moveCandidates(map, ids) {
    const banned = new Set(ids.flatMap(id => subtreeIds(map, id)));
    const out = [];
    walk(map, node => {
      if (!banned.has(node.id)) {
        out.push({ id: node.id, label: pathLabel(map, node.id) });
      }
    });
    return out;
  }

  /** What the two pickers offer before the student has reached into the control that holds them. */
  const MOVE_PLACEHOLDER = 'Choose a parent';
  const LINK_PLACEHOLDER = 'Choose a node';

  /** The map and node the cross-link picker was last built from; null when it holds nothing. */
  let linkBuiltFrom = null;

  /**
   * Whether a control is open, asked rather than remembered.
   *
   * Nothing is built until the student reaches into it. A path for every node in the map, on every
   * history change, is work a write in this panel's own Text field used to wait 184 milliseconds for
   * on a two thousand node map — and writes land every 200 milliseconds while anybody is typing, here
   * or in the outline. The Details tab being away is covered by the same question: a control nobody
   * can see is a control nobody has focused.
   *
   * Asked of the document rather than kept in a flag, because a flag set on the way in was never
   * cleared on the way out: one Alt+M and the lists were rebuilt on every history change for the rest
   * of the session, whatever the keyboard was doing (78 ms per change on a two thousand node map,
   * against 1 ms for a control nobody had touched).
   *
   * @param {HTMLElement} control
   * @returns {boolean}
   */
  const isOpen = control => control.contains(document.activeElement);

  /** The map, node and filter term the pickers were last built from; null when they hold nothing. */
  let moveBuiltFrom = null;

  /** How many candidates the parent picker is offering, so the count is not read back out of it. */
  let moveShown = 0;

  /**
   * A choice the map took away under the student's hand: `{parentId}` for a parent that is no longer
   * a candidate, `{parentId: null}` for a named sibling that is no longer a sibling.
   *
   * Substituting something valid and moving the node there is the worst of the answers — the student
   * chose one place and the node would go to another without a word. So the choice is dropped, this
   * is remembered, and Move says what happened.
   */
  let moveStale = null;

  const placeOption = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  };

  /** Put the pickers back to their unbuilt state, which costs one option and no walk of the map. */
  function showMovePlaceholder() {
    moveBuiltFrom = null;
    moveShown = 0;
    moveParent.replaceChildren(placeOption('', MOVE_PLACEHOLDER));
    movePlace.replaceChildren(placeOption('first', 'First'), placeOption('last', 'Last'));
    movePlace.value = 'last';
  }

  /** Say how many places are left after the filter, once the typing has settled. */
  const sayMoveMatches = debounce(WRITE_DEBOUNCE_MS, () => {
    const refusal = moveReason(history.current(), selection.ids());
    if (refusal !== '') {
      // No list was built, so counting it would answer a student who filtered the places the centre
      // can go with "No place matches" — true of every word they could type, and not the reason.
      announce(refusal);
      return;
    }
    const term = moveFilter.value.trim();
    const total = moveShown;
    const places = total === 1 ? 'place' : 'places';
    if (term === '') {
      announce(`${total} ${places} to move it to.`);
      return;
    }
    announce(
      total === 0
        ? `No place matches "${term}".`
        : `${total} ${places} ${total === 1 ? 'matches' : 'match'} "${term}".`
    );
  });

  /**
   * Fill the parent picker, narrowed by whatever is in the filter box.
   *
   * The node's own parent is what the list starts on, so the control is also how a student reorders
   * a node among the siblings it already has — the other thing a drag does.
   */
  function renderMoveParents(map, ids, term, mapChanged) {
    const candidates = moveCandidates(map, ids);
    const shown =
      term === '' ? candidates : candidates.filter(one => one.label.toLowerCase().includes(term));
    moveShown = shown.length;

    const previous = moveParent.value;
    // The placeholder stays on the list, so there is always somewhere for the value to be when the
    // student's choice is not among the candidates any more.
    moveParent.replaceChildren(
      placeOption('', MOVE_PLACEHOLDER),
      ...shown.map(one => placeOption(one.id, one.label))
    );
    const own = nodeAt(map, ids[0]).parentId;
    if (shown.some(one => one.id === previous)) {
      moveParent.value = previous;
      return;
    }
    if (previous !== '') {
      // Their choice has gone. If the map is what took it, Move has something to say about that;
      // if the filter is what hid it, they are still typing and can see the list for themselves.
      if (mapChanged) {
        moveStale = { parentId: previous };
      }
      moveParent.value = '';
      return;
    }
    moveParent.value = shown.some(one => one.id === own) ? own : '';
  }

  /**
   * Fill the place picker from the chosen parent's children.
   *
   * First and Last, then every child by name under Before and under After. The two groups are
   * `optgroup`s so that "Counterpoint" appearing twice reads as the two sides of one sibling rather
   * than as a list with a duplicate in it.
   */
  function renderMovePlaces(map, ids, mapChanged) {
    const parent = nodeAt(map, moveParent.value);
    // A sibling that is moving as well is not a place to sit beside: it will not be there.
    const moving = new Set(ids);
    const children = parent ? parent.children.filter(childId => !moving.has(childId)) : [];

    const previous = movePlace.value;
    movePlace.replaceChildren(placeOption('first', 'First'), placeOption('last', 'Last'));
    for (const side of ['before', 'after']) {
      if (children.length === 0) {
        continue;
      }
      const group = document.createElement('optgroup');
      group.label = side === 'before' ? 'Before' : 'After';
      for (const childId of children) {
        group.appendChild(placeOption(`${side}:${childId}`, labelFor(nodeAt(map, childId))));
      }
      movePlace.appendChild(group);
    }
    const values = [...movePlace.options].map(option => option.value);
    if (values.includes(previous)) {
      movePlace.value = previous;
      return;
    }
    // A named sibling that is no longer one: the same rule as a parent that has gone.
    if (mapChanged && previous.includes(':')) {
      moveStale = { parentId: null };
    }
    movePlace.value = 'last';
  }

  /**
   * Build the pickers, unless they already show what they should.
   *
   * Keyed on three cheap identities: the map object the ops handed back (they share structure, so a
   * map nobody changed is the same object), the selected id, and the filter term. Nothing else can
   * change what the lists hold, so nothing else needs asking.
   *
   * @param {boolean} [force] - rebuild even when those three are unchanged.
   */
  function ensureMoveLists(force = false) {
    const map = history.current();
    const block = movingBlock(map, selection.ids());
    if (block.length === 0) {
      return;
    }
    const term = moveFilter.value.trim().toLowerCase();
    // The set is compared as one string: it is short, and a key is cheaper than a walk of the map.
    const key = block.join('\u0000');
    if (
      !force &&
      moveBuiltFrom &&
      moveBuiltFrom.map === map &&
      moveBuiltFrom.key === key &&
      moveBuiltFrom.term === term
    ) {
      return;
    }
    const mapChanged = Boolean(moveBuiltFrom) && moveBuiltFrom.map !== map;
    moveBuiltFrom = { map, key, term };
    renderMoveParents(map, block, term, mapChanged);
    renderMovePlaces(map, block, mapChanged);
  }

  /**
   * What to say about a choice the map took away, and forget it.
   *
   * `moveNode` answers a parent that has become part of the node's own branch with a thrown CYCLE,
   * which the shared handler catches and logs: the button did nothing and said nothing. Said here it
   * is one sentence, in the same words the drag refuses with, and the lists are there to choose from
   * again.
   *
   * @param {Object} map
   * @param {string} id - the node being moved.
   * @returns {string} the sentence.
   */
  function takeStaleReason(map, ids) {
    const { parentId } = moveStale;
    moveStale = null;
    if (
      parentId &&
      hasNode(map, parentId) &&
      ids.some(id => subtreeIds(map, id).includes(parentId))
    ) {
      return cannotMoveIntoOwnBranchSentence(labelFor(nodeOf(ids[0])));
    }
    return 'That place is no longer available. Choose again.';
  }

  /** Move every selected node where the two pickers say, as one undo step. */
  function applyMove() {
    // Whatever Move says next replaces the match count. Left to its timer, a count still pending
    // from the typing landed after "Moved…" and a screen reader never said the move had happened.
    sayMoveMatches.cancel();
    const map = history.current();
    const ids = selection.ids();
    const reason = moveReason(map, ids);
    if (reason !== '') {
      announce(reason);
      return;
    }
    const block = movingBlock(map, ids);
    if (moveStale) {
      ensureMoveLists(true);
      announce(takeStaleReason(map, block));
      return;
    }
    if (moveParent.value === '') {
      announce('Choose a new parent first.');
      return;
    }
    const [side, siblingId] = movePlace.value.split(':');
    const parent = nodeAt(map, moveParent.value);
    const parentId = parent.id;
    const index =
      side === 'first'
        ? 0
        : side === 'last'
          ? parent.children.length
          : siblingIndexForBlock(map, { ids: block, parentId, siblingId, after: side === 'after' });

    // Moving into a shut branch and opening it is one thing the student did, so it costs one Ctrl+Z.
    const steps = [{ op: 'moveNodes', args: { ids: block, newParentId: parentId, index } }];
    if (parent.collapsed) {
      steps.push({ op: 'toggleCollapsed', args: { id: parentId } });
    }
    const after = history.applyBatch(steps, { name: 'moveNode' });
    if (after === map) {
      announce(
        block.length === 1
          ? `'${labelFor(nodeAt(map, block[0]))}' is already there.`
          : `${block.length} nodes are already there.`
      );
      return;
    }

    const where = side === 'before' || side === 'after' ? side : 'into';
    const targetText = labelFor(nodeAt(map, where === 'into' ? parentId : siblingId));
    const expanded = parent.collapsed ? labelFor(parent) : null;
    const centre = ids.includes(map.rootId) ? ` ${centreStaysSentence()}` : '';
    announce(
      block.length === 1
        ? `${movedSentence({ text: labelFor(nodeAt(map, block[0])), where, targetText, expanded })}${centre}`
        : `${movedNodesSentence({ count: block.length, where, targetText, expanded })}${centre}`
    );
    // The nodes stay selected; they are usually somewhere the student cannot see from here.
    reveal(selected());
    // The pointer press never focused the button (the shared helper prevents it), so both routes in
    // leave the student in the same place: on the control they just used.
    moveButton.focus();
  }

  const onLinkReach = () => {
    // Cross-links are a one-node field, so the form is away for a set and there is nothing to build.
    if (selection.ids().length > 1) {
      return;
    }
    const id = selected();
    if (nodeOf(id)) {
      renderTargets(history.current(), id);
    }
  };
  linkForm.addEventListener('focusin', onLinkReach);
  linkForm.addEventListener('pointerdown', onLinkReach);
  cleanups.push(() => {
    linkForm.removeEventListener('focusin', onLinkReach);
    linkForm.removeEventListener('pointerdown', onLinkReach);
  });

  /**
   * The student has reached into the control, so the lists are worth building.
   *
   * `focusin` covers the keyboard and `pointerdown` covers the pointer — a press on a `select`
   * arrives before the browser opens its list, so the options are there by the time it does.
   */
  const onMoveReach = () => {
    // Called for `pointerdown` as well as `focusin`, and a press arrives before the focus does, so
    // this builds the lists itself rather than leaving them to the next render.
    ensureMoveLists();
  };
  moveGroup.addEventListener('focusin', onMoveReach);
  moveGroup.addEventListener('pointerdown', onMoveReach);
  cleanups.push(() => {
    moveGroup.removeEventListener('focusin', onMoveReach);
    moveGroup.removeEventListener('pointerdown', onMoveReach);
  });

  const onMoveFilter = () => {
    ensureMoveLists(true);
    sayMoveMatches();
  };
  moveFilter.addEventListener('input', onMoveFilter);
  cleanups.push(() => moveFilter.removeEventListener('input', onMoveFilter));

  // A select binds `change` directly: the shared helper's preventDefault on mousedown would cancel
  // the native picker.
  const onMoveParentChange = () => {
    // A choice of their own replaces whatever the map took away.
    moveStale = null;
    const map = history.current();
    const block = movingBlock(map, selection.ids());
    if (block.length > 0) {
      renderMovePlaces(map, block, false);
    }
  };
  moveParent.addEventListener('change', onMoveParentChange);
  cleanups.push(() => moveParent.removeEventListener('change', onMoveParentChange));

  cleanups.push(attachAccessibleHandler(moveButton, 'Mind map move node', applyMove));

  // ---- the citation library ----------------------------------------------

  /** Citations as the library holds them, by id, once they have been read. */
  let citations = new Map();

  /** The style the student picked in the citation library; the in-text form follows it. */
  let citationStyle = 'harvard';

  /** Set when the library could not be read, so the row can say so instead of looking empty. */
  let citationsUnavailable = false;

  const citationNone = document.createElement('option');
  citationNone.value = '';
  citationNone.textContent = 'No citation';
  citationSelect.appendChild(citationNone);

  /**
   * Read the library once. The store lives in an offscreen document that may not be up yet, and a
   * node's citation link is a nicety — a failure here must cost the student nothing but this row.
   */
  async function loadCitations() {
    try {
      const stored = await chrome.storage.local.get('citationStyle');
      if (stored && typeof stored.citationStyle === 'string') {
        citationStyle = stored.citationStyle;
      }
    } catch {
      // The default style still formats.
    }
    try {
      const all = await CitationStorageRPC.getAll();
      citations = new Map((Array.isArray(all) ? all : []).map(entry => [entry.id, entry]));
    } catch {
      citationsUnavailable = true;
      render();
      return;
    }
    for (const citation of citations.values()) {
      const option = document.createElement('option');
      option.value = citation.id;
      option.textContent = citationLabel(citation);
      citationSelect.appendChild(option);
    }
    render();
  }

  const onCitationChange = () => {
    const id = selected();
    if (!id) {
      return;
    }
    const citationId = citationSelect.value === '' ? null : citationSelect.value;
    history.apply('setCitation', { id, citationId });
    announce(
      citationId === null
        ? 'Citation link cleared'
        : `Linked to ${citationLabel(citations.get(citationId) || {})}`
    );
  };
  citationSelect.addEventListener('change', onCitationChange);
  cleanups.push(() => citationSelect.removeEventListener('change', onCitationChange));

  cleanups.push(
    attachAccessibleHandler(clearCitation, 'Mind map clear citation', () => {
      const id = selected();
      if (!id) {
        return;
      }
      history.apply('setCitation', { id, citationId: null });
      announce('Citation link cleared');
    })
  );

  /**
   * Write everything that is waiting on a timer, now.
   *
   * On the way out of a field, and before anything is done about a selection that has moved: a write
   * that arrives later lands in the middle of whatever the student has started next. The arguments
   * were captured when the student typed, so each write still goes to the node it was typed into.
   */
  function flushWrites() {
    writeText.flush();
    writeNotes.flush();
    writeSymbol.flush();
    writeSource.flush();
  }

  const onFocusOut = () => flushWrites();
  form.addEventListener('focusout', onFocusOut);
  cleanups.push(() => form.removeEventListener('focusout', onFocusOut));

  /**
   * Hand the fields over to the node that is selected now.
   *
   * Whatever was typed is written to the node it was typed into, and the caret is taken out of the
   * one field it could still do harm in. It is a real loss of focus, and it is the smaller of the two
   * losses: the alternative is a student typing into a box that says "Sources" and quietly renaming
   * the node they left behind. The field is theirs again the moment they put the caret back.
   */
  function releaseFields() {
    const active = valueFields.includes(document.activeElement) ? document.activeElement : null;
    if (active) {
      // Blurred first, while the field is still the old node's: the focusout writes what is pending
      // and an emptied name is put back, both against the node the student typed into.
      active.blur();
      // On the panel rather than dropped on the document: the student was working HERE, so the next
      // Tab should carry on through this panel instead of starting again at the top of the page.
      form.focus();
      awaitingCaret.add(active);
      filledFor.delete(active);
    }
    flushWrites();
  }

  /** The caret is back in a released field: it writes to the node it has been showing since. */
  const onFocusIn = event => {
    const element = event.target;
    if (!awaitingCaret.has(element)) {
      return;
    }
    awaitingCaret.delete(element);
    bind(element, element === symbol ? chosenIds() : [selected()].filter(Boolean));
  };
  form.addEventListener('focusin', onFocusIn);
  cleanups.push(() => form.removeEventListener('focusin', onFocusIn));

  // Nothing here is submitted anywhere; writes are live. Enter in a field must not reload the page.
  const onSubmit = event => event.preventDefault();
  form.addEventListener('submit', onSubmit);
  cleanups.push(() => form.removeEventListener('submit', onSubmit));

  // ---- rendering ---------------------------------------------------------

  /**
   * Only write into a control the student is not in the middle of using — and whenever one is
   * written, bind it to the node the value came from, so a keystroke in it can go nowhere else.
   *
   * @param {HTMLElement} element
   * @param {string} value
   * @param {boolean} force - the selection changed, so the field must show the new node whatever
   *   has focus.
   * @param {string[]} ids - the nodes this value is that of; empty when there is no node at all.
   */
  const setValue = (element, value, force, ids) => {
    if (!force && document.activeElement === element) {
      return;
    }
    if (element.value !== value) {
      element.value = value;
    }
    bind(element, ids);
  };

  function renderLinks(map, id) {
    for (const cleanup of linkCleanups.splice(0)) {
      cleanup();
    }
    linkList.replaceChildren();

    const outgoing = map.links.filter(link => link.from === id);
    if (outgoing.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No cross-links from this node';
      linkList.appendChild(item);
      return;
    }

    for (const link of outgoing) {
      const item = document.createElement('li');
      item.className = 'mm-inspector__link';
      const description = document.createElement('span');
      // A cross-link's other end is written in the file an import came from.
      const target = labelFor(nodeAt(map, link.to));
      description.textContent = link.label ? `${target} — ${link.label}` : target;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove cross-link to ${target}`);
      item.append(description, remove);
      linkList.appendChild(item);
      linkCleanups.push(
        attachAccessibleHandler(remove, `Mind map remove link ${link.id}`, () => {
          history.apply('removeLink', { id: link.id });
          announce(`Removed the cross-link to ${target}`);
        })
      );
    }
  }

  /**
   * Fill the cross-link picker, unless it already shows what it should.
   *
   * Built when the student reaches into the form and not before, and keyed on the same two cheap
   * identities the "Move to…" pickers use — for the same reason. A label per node on every history
   * change, with a JSON string of the whole list to compare against, is work a keystroke in the Text
   * field a few pixels above used to wait for.
   */
  function renderTargets(map, id) {
    if (linkBuiltFrom && linkBuiltFrom.map === map && linkBuiltFrom.id === id) {
      return;
    }
    linkBuiltFrom = { map, id };

    // Outline order, collapsed nodes included: a link may point anywhere in the map, and a list in
    // the order the student reads the outline is the one they can find a node in.
    const candidates = [];
    walk(map, (node, _depth, parent) => {
      if (node.id !== id) {
        // Two branches often carry the same word; the parent is what tells them apart.
        candidates.push({
          id: node.id,
          label: parent ? `${labelFor(node)} (under ${labelFor(parent)})` : labelFor(node),
        });
      }
    });

    const previous = linkTarget.value;
    linkTarget.replaceChildren(
      placeOption('', LINK_PLACEHOLDER),
      ...candidates.map(candidate => placeOption(candidate.id, candidate.label))
    );
    if (candidates.some(candidate => candidate.id === previous)) {
      linkTarget.value = previous;
    }
  }

  /** The picker and the short reference for one node's citation link. */
  function renderCitation(node) {
    citationSelect.disabled = citationsUnavailable;
    if (document.activeElement !== citationSelect) {
      citationSelect.value =
        node.citationId && citations.has(node.citationId) ? node.citationId : '';
    }

    if (citationsUnavailable) {
      citationRef.textContent = 'Citation library unavailable';
      return;
    }
    if (!node.citationId) {
      citationRef.textContent = '';
      return;
    }
    const citation = citations.get(node.citationId);
    if (!citation) {
      // The citation was deleted after the node was linked to it. Saying so beats a blank row.
      citationRef.textContent = 'Citation no longer in your library';
      return;
    }
    try {
      // Within the citation's own reference list, so the year letter matches what the library copies.
      const set = referenceSetFor(citation, [...citations.values()]);
      citationRef.textContent = formatInText(citation, citationStyle, { set });
    } catch {
      citationRef.textContent = citationLabel(citation);
    }
  }

  let renderedId = null;
  let renderedKey = null;

  /**
   * The value every selected node shares, or the `mixed` marker when they disagree.
   *
   * @param {Object[]} nodes
   * @param {(node: Object) => *} read
   * @returns {*} the shared value, or the symbol MIXED.
   */
  const shared = (nodes, read) => {
    const first = read(nodes[0]);
    return nodes.every(node => read(node) === first) ? first : MIXED;
  };

  function render() {
    const map = history.current();
    const id = selected();
    const node = nodeOf(id);
    const nodes = chosenIds().map(nodeId => nodeAt(map, nodeId));
    const chosen = nodes.map(one => one.id);
    const many = nodes.length > 1;
    const key = chosen.join('\u0000');
    // A new node — or a different set — means the fields must show it whatever happens to have focus.
    const force = id !== renderedId || key !== renderedKey;
    renderedId = id;
    renderedKey = key;

    fields.disabled = !node;
    empty.hidden = Boolean(node);
    title.textContent = many ? `${nodes.length} nodes selected` : 'Node details';
    setNote.hidden = !many;
    for (const element of oneNodeOnly) {
      element.hidden = many;
    }

    // Said whether or not there is a node, because "Select a node first" is one of the reasons.
    const reason = moveReason(map, selection.ids());
    moveWhy.textContent = reason;
    for (const control of moveControls) {
      control.setAttribute('aria-disabled', String(reason !== ''));
    }

    if (branchFocus) {
      const focusReason = branchFocus.reason();
      const on = branchFocus.isOn();
      // A refusal first; then, for a set, which of the selected nodes the press would take. "This
      // branch" names one branch, and four selected nodes are usually four of them.
      focusWhy.textContent =
        focusReason || (many && !on && node ? focusesOnSentence(labelFor(node)) : '');
      focusButton.setAttribute('aria-disabled', String(focusReason !== ''));
      focusButton.setAttribute('aria-pressed', String(on));
    }

    if (!node) {
      showMovePlaceholder();
      // Bound to nothing: there is no node for a stray keystroke to reach.
      setValue(text, '', true, []);
      setValue(notes, '', true, []);
      setValue(symbol, '', true, []);
      setValue(sourceUrl, '', true, []);
      setValue(sourceQuote, '', true, []);
      done.checked = false;
      done.indeterminate = false;
      doneWhy.textContent = '';
      colourWhy.textContent = '';
      symbolWhy.textContent = '';
      sourceLink.hidden = true;
      citationSelect.value = '';
      citationRef.textContent = '';
      linkList.replaceChildren();
      return;
    }

    // The one-node fields are the primary's, whether or not a set is selected: they are put away for
    // a set, and a field that is away must still not be bound to the wrong node.
    setValue(text, node.text, force, [id]);
    setValue(notes, node.notes, force, [id]);
    setValue(sourceUrl, (node.source && node.source.url) || '', force, [id]);
    setValue(sourceQuote, (node.source && node.source.quote) || '', force, [id]);

    // Colour, symbol and done act on every selected node, so they show what the nodes agree on and
    // say so in a sentence when they do not: an unchecked radio group on its own would read as "not
    // chosen yet", which is a different thing.
    const sharedSymbol = shared(nodes, one => one.symbol || '');
    setValue(
      symbol,
      sharedSymbol === MIXED ? '' : sharedSymbol,
      force,
      nodes.map(one => one.id)
    );
    symbolWhy.textContent =
      sharedSymbol === MIXED ? 'Mixed: these nodes have different symbols.' : '';

    const sharedDone = shared(nodes, one => one.done);
    if (document.activeElement !== done) {
      done.checked = sharedDone === MIXED ? false : sharedDone;
    }
    // `indeterminate` and nothing else: the native state already reads as "mixed" in the
    // accessibility tree, and ARIA in HTML says not to put aria-checked on a native checkbox. The
    // sentence beside it is what a sighted student reads, since the third state is easy to miss.
    done.indeterminate = sharedDone === MIXED;
    doneWhy.textContent = sharedDone === MIXED ? 'Mixed: some of these nodes are done.' : '';

    const sharedColour = shared(nodes, one =>
      one.colour === null || one.colour === undefined ? '' : String(one.colour)
    );
    colourWhy.textContent =
      sharedColour === MIXED ? 'Mixed: these nodes have different colours.' : '';
    // Written whatever has focus, unlike the text fields. A radio holds no half-typed value to
    // protect, and the keyboard reaches this group by choosing a colour — so an undo of that very
    // choice arrives with a radio focused. Skipped, the group showed a colour the map no longer held,
    // and pressing the radio that looked chosen changed nothing at all. Setting `checked` moves no
    // focus, so the student stays where they were.
    for (const radio of colourRadios) {
      radio.checked = sharedColour !== MIXED && radio.value === sharedColour;
    }

    if (!many) {
      renderCitation(node);
    }

    const url = (node.source && node.source.url) || '';
    sourceLink.hidden = many || url === '';
    if (url !== '') {
      sourceLink.href = url;
    }

    // Rebuilding the list would take focus off a Remove button mid-press.
    if (!many && (force || !linkList.contains(document.activeElement))) {
      renderLinks(map, id);
    }
    if (!many && isOpen(linkForm)) {
      renderTargets(map, id);
    }

    // Only while the student is in it. The chosen parent, the filter text and the focus all survive
    // the rebuild: the elements are kept and their values restated, so a map that changed under an
    // open control shows the change without taking the student's place in it away.
    if (isOpen(moveGroup)) {
      ensureMoveLists();
    }
  }

  /**
   * Forget the filter and the pickers.
   *
   * A term typed for one node leaves "New parent" showing a match that has nothing to do with the
   * next one, and one press of Enter on Move would send it somewhere the student never chose. The
   * control stays open only while it still holds the keyboard.
   */
  function resetMove() {
    moveFilter.value = '';
    moveStale = null;
    linkBuiltFrom = null;
    linkTarget.replaceChildren(placeOption('', LINK_PLACEHOLDER));
    showMovePlaceholder();
  }

  showMovePlaceholder();
  linkTarget.replaceChildren(placeOption('', LINK_PLACEHOLDER));

  // Entering or leaving a branch changes no map, so no history subscription hears about it.
  if (branchFocus) {
    cleanups.push(branchFocus.subscribe(() => render()));
  }

  const unsubscribeHistory = history.subscribe(() => render());
  const unsubscribeSelection = selection.subscribe(() => {
    releaseFields();
    resetMove();
    render();
  });
  render();
  loadCitations();

  return {
    /**
     * Put the keyboard on "Move to…", for the page's Alt+M.
     *
     * @returns {string} why the control cannot act, or '' when it can. The page says it once, as a
     *   toast: a student who pressed a key and got nothing has no way to tell a refusal from a bug,
     *   and saying it here as well would say it twice.
     */
    focusMoveTo() {
      // Focused first, so the control is open by the time anything asks.
      moveFilter.focus();
      ensureMoveLists();
      moveFilter.select();
      return moveReason(history.current(), selection.ids());
    },

    destroy() {
      unsubscribeHistory();
      unsubscribeSelection();
      writeText.cancel();
      writeNotes.cancel();
      writeSymbol.cancel();
      writeSource.cancel();
      sayMoveMatches.cancel();
      for (const cleanup of [...cleanups, ...linkCleanups]) {
        cleanup();
      }
      form.remove();
    },
  };
}
