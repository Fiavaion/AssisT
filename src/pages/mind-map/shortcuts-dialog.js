/**
 * The keyboard map, written down.
 *
 * The outline is the canonical editor (ADR 0001), which means the keys are the interface rather
 * than a shortcut to it. A student who cannot find out what Tab does on a tree row is locked out of
 * half the product, so the list is one keystroke away from anywhere on the page.
 *
 * Every chord in it that a student can change is PRINTED FROM THE REGISTRY rather than typed out
 * here — `bindingFor()` reads what they actually have, so the list cannot drift from the keys the
 * page answers and it shows their own binding rather than the shipped one. Only the sentence saying
 * what a key does lives in this file. The structural keys (a bare arrow, Enter, Tab, Escape, Space,
 * Delete, a typed character, `?`) are still written out, because they are not registry entries: they
 * are the grammar of the editor, not shortcuts to it, and the list says so where a student would
 * otherwise go looking for them in Settings.
 *
 * The Help button that opens it is the last control in the page header. No other AssisT page offers
 * a help control yet, so this page sets the placement rather than following one: any page that adds
 * help later puts it in the same slot, because SC 3.2.6 (Consistent Help) is about help being in the
 * same relative order everywhere it appears, not about it appearing everywhere.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { MIND_MAP_KEYS, bindingFor, isCustomised, onBindingsChanged } from './shortcut-bindings.js';

/** Where a student says what is missing or broken — the same route as the popup's Report a bug. */
const REPORT_URL = 'https://github.com/Fiavaion/AssisT/issues/new?template=bug_report.md';

/**
 * What the list says about the keys nothing in Settings can move.
 *
 * Without it a student reads "Enter makes a node", goes to Settings to put it somewhere their hands
 * can reach, finds no row for it, and is left thinking the page is broken rather than that the key
 * is part of how an outline works.
 */
const STRUCTURAL_NOTE =
  'The keys shown without a note — the arrows, Enter, Tab, Escape, Space, Delete and typing a ' +
  'letter — are how an outline works rather than shortcuts to it, so they are not in Settings and ' +
  'cannot be moved. Everything else here can: Settings, then Keyboard.';

/**
 * Every key the page binds, grouped the way a student would look for them.
 *
 * An entry is either `{ registry, does }` — a row in the shortcut registry, whose chord is printed
 * from the student's own bindings — or `{ key, does }`, a structural key spelled out because there
 * is nothing to remap.
 *
 * @type {ReadonlyArray<{name: string, keys: Array<{registry?: string, key?: string, does: string}>}>}
 */
const SHORTCUT_GROUPS = Object.freeze([
  {
    name: 'The whole page',
    keys: [
      { registry: 'mm_undo', does: 'Undo the last change. Add Shift to redo' },
      { registry: 'mm_redo', does: 'Redo' },
      { registry: 'mm_save', does: 'Save now' },
      { registry: 'mm_save_as', does: 'Save a copy of this map under a new name' },
      { registry: 'mm_open_map', does: 'Open another map' },
      { registry: 'mm_find', does: 'Search this map' },
      {
        registry: 'mm_focus_branch',
        does:
          'Show just the branch you are on, so the rest of the map is out of the way. Press it ' +
          'again, or Escape, to see the whole map. Nothing about your map changes',
      },
      { key: 'Enter in the search box', does: 'Go to the next match' },
      { key: 'Shift+Enter in the search box', does: 'Go to the previous match' },
      { registry: 'mm_read_aloud', does: 'Read the map aloud, and pause or carry on' },
      { registry: 'mm_shortcuts_help', does: 'Open this list' },
      { key: '?', does: 'Opens this list too. That one is fixed, so help is always a key away' },
    ],
  },
  {
    name: 'The panels',
    keys: [
      {
        key: 'Escape',
        does: 'Leave the AI or Study panel: back to Details, and to the button that opened it',
      },
      { key: 'Left and Right', does: 'Move between Details, AI and Study, on the tabs themselves' },
      { key: 'Tab', does: 'Leave a panel for the map: nothing here holds the keyboard' },
      {
        key: 'Left and Right, on the divider between the outline and the map',
        does:
          'Make the outline narrower or wider. Home and End take it to its narrowest and its ' +
          'widest',
      },
    ],
  },
  {
    name: 'Moving around the outline',
    keys: [
      { key: 'Up and Down', does: 'Move between nodes' },
      { key: 'Left', does: 'Collapse the node, or go to its parent' },
      { key: 'Right', does: 'Expand the node, or go to its first child' },
      { key: 'Home and End', does: 'First and last node' },
      {
        key: 'Escape',
        does:
          'Leave the outline, so Tab moves on as usual. While you are looking at one branch it ' +
          'brings the whole map back first',
      },
    ],
  },
  {
    name: 'Choosing more than one node',
    keys: [
      {
        key: 'Shift+Up and Shift+Down',
        does: 'Take the selection out to the node above or below',
      },
      { key: 'Shift+Home and Shift+End', does: 'Take it out to the first or the last node' },
      {
        key: 'Ctrl+Up and Ctrl+Down',
        does: 'Move between nodes WITHOUT changing what is selected',
      },
      {
        key: 'Ctrl+Space, or Ctrl+click on a row',
        does:
          'Add the node you are on to the selection, or take it out. Use the click where ' +
          'Ctrl+Space belongs to your keyboard layout',
      },
      {
        registry: 'mm_select_siblings',
        does: 'Select this node and its siblings; press it again for the whole map',
      },
      { key: 'Escape', does: 'Back to one node. Press it again to leave the outline' },
      {
        key: 'Ctrl+click on the canvas',
        does:
          'Add a node to the selection, or take it out. Shift+click does the same, because ' +
          '"everything in between" only means something in the outline',
      },
      {
        key: 'Drag any selected node',
        does: 'Move all of them together. "Move to…" does the same without dragging',
      },
    ],
  },
  {
    name: 'Building the map',
    keys: [
      { key: 'Enter', does: 'New node below this one' },
      { key: 'Shift+Enter', does: 'New node inside this one' },
      { key: 'Tab', does: 'Indent: move under the node above' },
      { key: 'Shift+Tab', does: 'Outdent: move out one level' },
      { key: 'Alt+Up and Alt+Down', does: 'Move the node up or down among its siblings' },
      {
        registry: 'mm_move_node',
        does: 'Move the node somewhere else: pick a new parent and a place among its children',
      },
      {
        key: 'Shift+Tab at the top of a focused branch',
        does:
          'Moves the node out of the branch. That is a real change, and you are told where it ' +
          'went',
      },
      { key: 'Delete', does: 'Delete the node and everything under it' },
      { key: 'Space', does: 'Tick the node done, or untick it' },
      {
        key: 'Left and Right, with several selected',
        does: 'Fold or unfold every selected branch',
      },
      {
        key: 'Tab, Shift+Tab, Alt+Up, Alt+Down, Delete, Space, Left, Right and Alt+M',
        does:
          'With several nodes selected, these act on all of them at once, and one Ctrl+Z takes ' +
          'the lot back',
      },
      {
        key: 'Enter, Shift+Enter and F2',
        does:
          'Always the one node you are on. With several selected, the rest are dropped and you ' +
          'are told so',
      },
    ],
  },
  {
    name: 'Writing a node',
    keys: [
      { registry: 'mm_rename', does: 'Edit the text. Just starting to type does the same' },
      { key: 'Enter', does: 'Finish, and start a new node below' },
      { key: 'Shift+Enter', does: 'Finish, and start a new node inside this one' },
      { key: 'Ctrl+Enter', does: 'Finish and stay here' },
      { key: 'Tab and Shift+Tab', does: 'Indent or outdent the node, and carry on writing it' },
      {
        key: 'Escape',
        does: 'Cancel, and put the old text back. A new node goes if it has no name yet',
      },
    ],
  },
]);

/**
 * Every registry entry the editor owns has a row somewhere above.
 *
 * A key registered and then left out of this list is a key a student cannot find out about, which is
 * the whole fault this file exists to prevent; it is cheaper to fail here than to ship it.
 *
 * @returns {string[]} the registry ids with no row.
 */
export function missingRegistryRows() {
  const listed = new Set(
    SHORTCUT_GROUPS.flatMap(group => group.keys.map(entry => entry.registry).filter(Boolean))
  );
  return MIND_MAP_KEYS.filter(key => !listed.has(key));
}

/**
 * One chord in a written term: modifiers joined to a key by "+", where the key is a named key, a
 * function key, a mouse click, or a single capital or symbol standing on its own. A capital that
 * starts an ordinary word ("Drag") is not a key, so the match must not run on into a letter.
 */
const CHORD =
  /(?<![\w+])(?:(?:Ctrl|Alt|Shift)\+)*(?:Enter|Escape|Delete|Space|Tab|Home|End|Left|Right|Up|Down|click|F\d{1,2}|[A-Z?])(?![\w+])/g;

/**
 * Split a written term into its chords and the words between them, so each chord can be drawn as a
 * chip that never breaks and the words ("and", "on the canvas") are where a long term wraps.
 *
 * @param {string} term - e.g. "Shift+Home and Shift+End"
 * @returns {Array<{chord: string}|{text: string}>} the parts in order
 */
export function chordParts(term) {
  const parts = [];
  let last = 0;
  for (const match of term.matchAll(CHORD)) {
    if (match.index > last) {
      parts.push({ text: term.slice(last, match.index) });
    }
    parts.push({ chord: match[0] });
    last = match.index + match[0].length;
  }
  if (last < term.length) {
    parts.push({ text: term.slice(last) });
  }
  return parts;
}

/**
 * Build the shortcuts dialog inside a host element.
 *
 * @param {HTMLElement} host
 * @param {Object} [options]
 * @param {(featureKey: string) => (string|null)} [options.binding] - the chord a registry key is on;
 *   the live bindings by default.
 * @param {(featureKey: string) => boolean} [options.customised] - whether that chord is the
 *   student's own rather than the shipped one.
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean, destroy: () => void }}
 */
export function mountShortcutsDialog(host, options = {}) {
  const { binding = bindingFor, customised = isCustomised } = options;
  const doc = host.ownerDocument;
  const dialog = doc.createElement('dialog');
  dialog.className = 'assist-mm-dialog assist-mm-shortcuts';
  dialog.setAttribute('aria-labelledby', 'assist-mm-shortcuts-title');

  const heading = doc.createElement('h2');
  heading.id = 'assist-mm-shortcuts-title';
  heading.className = 'assist-mm-dialog__title';
  heading.textContent = 'Keyboard shortcuts';
  dialog.appendChild(heading);

  // What the Beta mark in the header actually means. It is here, with the keys, because this is
  // the one place on the page a student comes to for an explanation, and a mark with no
  // explanation anywhere is just a word.
  const beta = doc.createElement('p');
  beta.className = 'assist-mm-shortcuts__beta';
  beta.append(
    'Mind maps are in beta. Everything here works and your maps are saved, but parts of it will ' +
      'still change, so if something is missing or goes wrong, '
  );
  const report = doc.createElement('a');
  report.className = 'assist-mm-link';
  report.href = REPORT_URL;
  report.target = '_blank';
  report.rel = 'noopener noreferrer';
  report.textContent = 'tell us about it (opens in a new tab)';
  beta.append(report, '.');
  dialog.appendChild(beta);

  const structural = doc.createElement('p');
  structural.className = 'assist-mm-shortcuts__fixed';
  structural.textContent = STRUCTURAL_NOTE;
  dialog.appendChild(structural);

  // The lists are redrawn rather than built once: a student who remaps a key in Settings with this
  // page open must see the new chord the next time they open the list, not the old one.
  const body = doc.createElement('div');
  body.className = 'assist-mm-shortcuts__body';
  dialog.appendChild(body);

  function render() {
    body.textContent = '';
    for (const group of SHORTCUT_GROUPS) {
      const groupHeading = doc.createElement('h3');
      groupHeading.className = 'assist-mm-shortcuts__group';
      groupHeading.textContent = group.name;
      body.appendChild(groupHeading);

      const list = doc.createElement('dl');
      list.className = 'assist-mm-shortcuts__list';
      for (const entry of group.keys) {
        const chord = entry.registry ? binding(entry.registry) : entry.key;
        const term = doc.createElement('dt');
        if (entry.registry) {
          term.dataset.shortcutKey = entry.registry;
        }
        const description = doc.createElement('dd');
        if (entry.registry && !chord) {
          // Switched off on purpose. Saying so beats printing a key that will not fire.
          term.textContent = 'Not set';
          description.textContent = `${entry.does}. You have switched this key off in Settings`;
        } else {
          // A key from Settings is one chord however it is written; a written term is split so a
          // long one wraps between its chords rather than widening the key column.
          const parts = entry.registry ? [{ chord }] : chordParts(chord);
          for (const part of parts) {
            if (part.chord) {
              const keyEl = doc.createElement('kbd');
              keyEl.textContent = part.chord;
              term.appendChild(keyEl);
            } else {
              term.append(part.text);
            }
          }
          description.textContent = entry.does;
          if (entry.registry && customised(entry.registry)) {
            const note = doc.createElement('span');
            note.className = 'assist-mm-shortcuts__yours';
            note.textContent = ' (your setting)';
            description.appendChild(note);
          }
        }
        list.append(term, description);
      }
      body.appendChild(list);
    }
  }

  render();

  const actions = doc.createElement('div');
  actions.className = 'assist-mm-dialog__actions';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'assist-mm-button';
  closeButton.dataset.command = 'close';
  closeButton.dataset.action = 'close';
  closeButton.textContent = 'Close';
  actions.appendChild(closeButton);
  dialog.appendChild(actions);

  host.appendChild(dialog);

  let opener = null;

  const cleanupClose = attachAccessibleHandler(closeButton, 'Shortcuts close', () =>
    dialog.close()
  );

  // A remap while this page is open reaches the list as well as the keys.
  const stopFollowing = onBindingsChanged(render);

  // Escape closes a modal dialog by itself; the page still has to put focus back where it was, or a
  // keyboard student lands at the top of the document with their place lost.
  const onClose = () => {
    if (opener && opener.isConnected) {
      opener.focus();
    }
    opener = null;
  };
  dialog.addEventListener('close', onClose);

  return {
    /** Show the list, remembering what to give focus back to. */
    open() {
      if (dialog.open) {
        return;
      }
      render();
      const active = doc.activeElement;
      opener = active && active !== doc.body ? active : null;
      dialog.showModal();
      // Focus on Close without scrolling to it: the list opens at its title and first groups, and a
      // list scrolled down last time starts at the top again.
      closeButton.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    },

    /** Close the list. */
    close() {
      if (dialog.open) {
        dialog.close();
      }
    },

    /** @returns {boolean} */
    isOpen() {
      return dialog.open;
    },

    /** Remove the dialog and its listeners. */
    destroy() {
      cleanupClose();
      stopFollowing();
      dialog.removeEventListener('close', onClose);
      dialog.remove();
    },
  };
}
