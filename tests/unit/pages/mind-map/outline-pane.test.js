/**
 * @jest-environment jsdom
 *
 * The outline is the editor (ADR 0001), so these tests are the accessibility contract rather than a
 * convenience: the tree carries real WAI-ARIA semantics, every structural key works without a
 * pointer, and every structural change says out loud what it did.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createMap, createNode } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild } from '../../../../src/features/mindMap/core/map-ops.js';
import { createHistory } from '../../../../src/features/mindMap/core/history.js';
import { createSelection } from '../../../../src/pages/mind-map/selection.js';
import { mountBranchFocus } from '../../../../src/pages/mind-map/branch-focus.js';
import { mountOutlinePane } from '../../../../src/pages/mind-map/outline-pane.js';
import {
  applySavedBindings,
  stopWatchingBindings,
} from '../../../../src/pages/mind-map/shortcut-bindings.js';

const PAGE = path.join(__dirname, '../../../../src/pages/mind-map');

/**
 * Root "Essay"
 *   Introduction
 *   Argument one
 *     Point
 *     Evidence
 *   Conclusion
 * @returns {Object} the map under test
 */
function sampleMap() {
  let map = createMap({ id: 'm1', title: 'Essay', rootId: 'root', rootText: 'Essay' });
  map = addChild(map, {
    parentId: 'root',
    node: createNode({ id: 'intro', text: 'Introduction' }),
  });
  map = addChild(map, { parentId: 'root', node: createNode({ id: 'arg', text: 'Argument one' }) });
  map = addChild(map, { parentId: 'arg', node: createNode({ id: 'point', text: 'Point' }) });
  map = addChild(map, { parentId: 'arg', node: createNode({ id: 'evidence', text: 'Evidence' }) });
  map = addChild(map, { parentId: 'root', node: createNode({ id: 'conc', text: 'Conclusion' }) });
  return map;
}

let host;
let history;
let selection;
let announce;
let notified;
let pane;
let made;
let focus;
let autosaveSaw;

/**
 * Mount the pane exactly as the page does: over the branch-focus seam rather than over the history
 * itself.
 *
 * The seam is transparent while no branch is focused — `current()` IS the map — so every test below
 * reads the same as it did before it existed. What it buys is that the pane can be graded with one
 * branch on screen, which is the only way to know that focus mode is a view and not a second editor.
 *
 * @param {Object} [map]
 * @param {Object} [historyOptions]
 * @returns {Object} the pane handle.
 */
function mount(map = sampleMap(), historyOptions = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const crumbHost = document.createElement('div');
  document.body.appendChild(crumbHost);
  history = createHistory(map, historyOptions);
  selection = createSelection(null, { history });
  announce = jest.fn();
  // The page hands this pane its `showToast`, which writes the toast AND the live region. The two
  // are separate mocks here so a sentence that has to be SEEN cannot pass by being said.
  notified = jest.fn();
  made = 0;
  focus = mountBranchFocus(crumbHost, {
    history,
    selection,
    announce,
    notify: announce,
  });
  autosaveSaw = [];
  pane = mountOutlinePane(host, {
    history: focus.history,
    selection,
    announce,
    notify: notified,
    newId: () => `new-${++made}`,
    onEscape: () => {
      if (!focus.isOn()) {
        return false;
      }
      focus.leave();
      return true;
    },
  });
  // What the page's autosave subscriber sees. Subscribed after the pane, so it reads the map the
  // way the autosave does: once every pane has finished reacting to the change. A nameless node
  // reaching it is a nameless node two seconds from being STORED, which is the whole of why the
  // editors on this page refuse to write one.
  history.subscribe(() => {
    if (editor()) {
      // A field is open, so the student is naming something and the pane owes a revival at most.
      return;
    }
    const shown = new Set(
      [...host.querySelectorAll('[role="treeitem"]')].map(row => row.dataset.id)
    );
    const leaked = Object.values(history.current().nodes)
      .filter(node => node.text.trim() === '' && shown.has(node.id))
      .map(node => node.id);
    if (leaked.length > 0) {
      autosaveSaw.push(leaked.join(' '));
    }
  });
  return pane;
}

/** @param {string} id @returns {HTMLElement} the treeitem for a node id */
const item = id => host.querySelector(`[role="treeitem"][data-id="${id}"]`);

/** @returns {string[]} node ids of the rows on screen, in outline order */
const rows = () => [...host.querySelectorAll('[role="treeitem"]')].map(el => el.dataset.id);

/** @param {string} id @returns {string} the visible label of a row */
const labelOf = id => item(id).querySelector('.assist-mm-row__text').textContent;

function press(key, init = {}) {
  document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  );
}

const editor = () => host.querySelector('.assist-mm-row__edit');

/** @param {string} id @returns {boolean} whether the real map still holds that node. */
const hasNodeNamed = id => Object.hasOwn(history.current().nodes, id);

/** Every node on the map with no name, which is what the editors here must never leave behind. */
const nameless = () =>
  Object.values(history.current().nodes)
    .filter(node => node.text.trim() === '')
    .map(node => node.id);

/** Type into the open editor, one value at a time, the way the input event arrives. */
const type = text => {
  editor().value = text;
  editor().dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Reach a row the way a student does with a pointer.
 *
 * A bare `.focus()` is how focus arrives from a Tab, and Tab-to-indent is deliberately not armed
 * by that — see "Tab out of the tree" below. Pressing the row is the pointer route in, and leaves
 * the tree in the state the arrow keys would.
 *
 * @param {string} id
 */
function focusRow(id) {
  item(id)
    .querySelector('.assist-mm-row')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/**
 * @param {string} key
 * @param {Object} [init]
 * @returns {KeyboardEvent} the event, so a test can read whether the pane claimed it.
 */
function pressAndRead(key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.activeElement.dispatchEvent(event);
  return event;
}

afterEach(() => {
  if (pane) {
    pane.destroy();
  }
  if (host) {
    host.remove();
  }
  document.body.innerHTML = '';
});

describe('tree semantics', () => {
  it('builds a tree of treeitems with level, position and set size', () => {
    mount();

    expect(host.querySelector('[role="tree"]')).not.toBeNull();
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);

    expect(item('root').getAttribute('aria-level')).toBe('1');
    expect(item('arg').getAttribute('aria-level')).toBe('2');
    expect(item('point').getAttribute('aria-level')).toBe('3');
    expect(item('arg').getAttribute('aria-posinset')).toBe('2');
    expect(item('arg').getAttribute('aria-setsize')).toBe('3');
    expect(item('point').closest('[role="group"]')).not.toBeNull();
  });

  it('marks a node with children expanded, and a leaf not at all', () => {
    mount();

    expect(item('arg').getAttribute('aria-expanded')).toBe('true');
    expect(item('point').hasAttribute('aria-expanded')).toBe(false);
  });

  it('gives exactly one row the tab stop and moves it with focus', () => {
    mount();

    const tabbable = () => rows().filter(id => item(id).tabIndex === 0);
    expect(tabbable()).toEqual(['root']);

    item('arg').focus();
    expect(tabbable()).toEqual(['arg']);
  });

  it('names the branch colour in text, never by the swatch alone', () => {
    mount();

    expect(item('root').querySelector('.assist-mm-row__colour-name').textContent).toBe('Blue');
    expect(item('root').querySelector('.assist-mm-row__swatch').getAttribute('aria-hidden')).toBe(
      'true'
    );
  });

  it('shows a hidden-child count on a collapsed node', () => {
    mount();
    item('arg').focus();

    press('ArrowLeft');

    expect(item('arg').getAttribute('aria-expanded')).toBe('false');
    expect(rows()).toEqual(['root', 'intro', 'arg', 'conc']);
    expect(item('arg').querySelector('.assist-mm-row__count').textContent).toContain('2');
  });
});

describe('moving about', () => {
  it('walks the visible rows with the arrow keys', () => {
    mount();
    item('root').focus();

    press('ArrowDown');
    expect(document.activeElement).toBe(item('intro'));
    press('ArrowDown');
    press('ArrowDown');
    expect(document.activeElement).toBe(item('point'));
    press('ArrowUp');
    expect(document.activeElement).toBe(item('arg'));
  });

  it('goes to the first and last visible row with Home and End', () => {
    mount();
    item('arg').focus();

    press('End');
    expect(document.activeElement).toBe(item('conc'));
    press('Home');
    expect(document.activeElement).toBe(item('root'));
  });

  it('collapses on Left, then moves to the parent on the next Left', () => {
    mount();
    item('arg').focus();

    press('ArrowLeft');
    expect(item('arg').getAttribute('aria-expanded')).toBe('false');

    press('ArrowLeft');
    expect(document.activeElement).toBe(item('root'));
  });

  it('expands on Right, then moves to the first child on the next Right', () => {
    mount();
    item('arg').focus();
    press('ArrowLeft');
    press('ArrowRight');
    expect(item('arg').getAttribute('aria-expanded')).toBe('true');

    press('ArrowRight');
    expect(document.activeElement).toBe(item('point'));
  });

  it('leaves the tree on Escape so Tab is never a trap', () => {
    mount();
    item('arg').focus();

    press('Escape');

    expect(host.contains(document.activeElement)).toBe(true);
    expect(document.activeElement.getAttribute('role')).not.toBe('treeitem');
  });
});

/**
 * Tab means "indent this node" inside the tree and "leave" everywhere else, and the tree has to
 * tell the two apart. Escape parks focus on the hint after the tree; Shift+Tab from there passes
 * back through the roving row on its way out, and a second Shift+Tab must carry on out rather than
 * quietly outdent the branch the student was reading (SC 2.1.2, and no change nobody asked for).
 */
describe('Tab out of the tree', () => {
  it('carries focus out instead of outdenting after Escape and back', () => {
    mount();
    item('evidence').focus();
    press('Escape');
    expect(document.activeElement).toBe(host.querySelector('.assist-mm-outline__hint'));

    // Shift+Tab from the hint puts focus back on the roving row — the browser's own move.
    item('evidence').focus();
    const before = history.current();
    const event = pressAndRead('Tab', { shiftKey: true });

    expect(history.current()).toBe(before);
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
    // Not claimed, so focus goes where it would have gone.
    expect(event.defaultPrevented).toBe(false);
  });

  it('indents again as soon as the student moves inside the tree', () => {
    mount();
    item('evidence').focus();
    press('Escape');
    item('evidence').focus();
    pressAndRead('Tab', { shiftKey: true });

    press('ArrowUp');
    const event = pressAndRead('Tab', { shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(item('point').getAttribute('aria-level')).toBe('2');
  });
});

describe('structural editing', () => {
  it('adds a sibling below on Enter and starts editing it', () => {
    mount();
    item('intro').focus();

    press('Enter');

    expect(rows()).toEqual(['root', 'intro', 'new-1', 'arg', 'point', 'evidence', 'conc']);
    expect(editor()).not.toBeNull();
    expect(document.activeElement).toBe(editor());
  });

  it('adds a child on Shift+Enter', () => {
    mount();
    item('intro').focus();

    press('Enter', { shiftKey: true });

    expect(item('new-1').getAttribute('aria-level')).toBe('3');
    expect(item('intro').getAttribute('aria-expanded')).toBe('true');
  });

  it('adds a child rather than a sibling when Enter is pressed on the root', () => {
    mount();
    item('root').focus();

    press('Enter');

    expect(item('new-1').getAttribute('aria-level')).toBe('2');
  });

  // Found by the run-of-keys test below: the new node was made inside a shut centre, so it had no
  // row, the editor never opened, and a blank node was left where nobody could see it.
  it('opens a shut centre for the node Enter adds to it', () => {
    mount();
    item('root').focus();
    press('ArrowLeft');
    expect(item('root').getAttribute('aria-expanded')).toBe('false');

    press('Enter');

    expect(item('root').getAttribute('aria-expanded')).toBe('true');
    expect(editor().closest('[role="treeitem"]').dataset.id).toBe('new-1');
    expect(document.activeElement).toBe(editor());
  });

  it('indents on Tab and says where the node went', () => {
    mount();
    focusRow('arg');

    press('Tab');

    expect(item('arg').getAttribute('aria-level')).toBe('3');
    expect(announce).toHaveBeenCalledWith("Moved 'Argument one' under 'Introduction'");
  });

  it('outdents on Shift+Tab', () => {
    mount();
    focusRow('point');

    press('Tab', { shiftKey: true });

    expect(item('point').getAttribute('aria-level')).toBe('2');
  });

  it('reorders with Alt and the arrow keys', () => {
    mount();
    item('arg').focus();

    press('ArrowUp', { altKey: true });

    expect(rows()).toEqual(['root', 'arg', 'point', 'evidence', 'intro', 'conc']);
    expect(document.activeElement).toBe(item('arg'));
  });

  it('deletes a node with its children, counts them, and offers the undo', () => {
    mount();
    item('arg').focus();

    press('Delete');

    expect(rows()).toEqual(['root', 'intro', 'conc']);
    expect(announce).toHaveBeenCalledWith(
      "Deleted 'Argument one' and 2 children. Press Ctrl+Z to undo"
    );
    expect(document.activeElement).toBe(item('intro'));
  });

  it('refuses to delete the root and says why', () => {
    mount();
    item('root').focus();

    press('Delete');

    expect(rows()).toContain('root');
    expect(announce).toHaveBeenCalledWith('The centre of the map cannot be deleted.');
  });

  it('ticks a node done with Space', () => {
    mount();
    item('intro').focus();

    press(' ');

    expect(history.current().nodes.intro.done).toBe(true);
    expect(item('intro').querySelector('.assist-mm-row__done')).not.toBeNull();
    expect(announce).toHaveBeenCalledWith("'Introduction' marked done");
  });
});

describe('inline text editing', () => {
  it('opens an editor on F2 with the current text', () => {
    mount();
    item('intro').focus();

    press('F2');

    expect(editor().value).toBe('Introduction');
    expect(document.activeElement).toBe(editor());
  });

  // Rename and "select the siblings" are registry entries, so a student whose keyboard has no F2 —
  // or whose screen reader owns it — can move them. Everything else the tree answers is structural.
  it('opens the editor on the key the student bound, and no longer on F2', () => {
    applySavedBindings({ mm_rename: 'Alt+E' });
    mount();
    item('intro').focus();

    press('F2');
    expect(editor()).toBeNull();

    press('e', { code: 'KeyE', altKey: true });
    expect(editor().value).toBe('Introduction');

    stopWatchingBindings();
  });

  it('starts editing from a printable character, keeping that character', () => {
    mount();
    item('intro').focus();

    press('R');

    expect(editor().value).toBe('R');
  });

  it('updates the node as the student types', () => {
    mount();
    item('intro').focus();
    press('F2');

    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    expect(history.current().nodes.intro.text).toBe('Opening');
  });

  it('commits and opens a new sibling on Enter', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Enter');

    expect(labelOf('intro')).toBe('Opening');
    expect(rows()).toContain('new-1');
  });

  /**
   * Shift+Enter means "inside" everywhere else on the page, and a student writing a node is the
   * student most likely to press it. It used to commit and make a SIBLING, so the map quietly grew
   * flat while the shortcut list said otherwise.
   */
  it('commits and opens a child on Shift+Enter, as it does on a row not being written', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Enter', { shiftKey: true });

    expect(labelOf('intro')).toBe('Opening');
    expect(history.current().nodes.intro.children).toEqual(['new-1']);
    expect(history.current().nodes.root.children).toEqual(['intro', 'arg', 'conc']);
    expect(editor()).not.toBeNull();
    expect(document.activeElement).toBe(editor());
    expect(announce).toHaveBeenLastCalledWith("New node inside 'Opening'. Type to name it.");
  });

  it('commits without a child on Ctrl+Shift+Enter, the way Ctrl+Enter stays put', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Enter', { shiftKey: true, ctrlKey: true });

    expect(editor()).toBeNull();
    expect(labelOf('intro')).toBe('Opening');
    expect(history.current().nodes.intro.children).toEqual([]);
    expect(document.activeElement).toBe(item('intro'));
  });

  it('commits without a new sibling on Ctrl+Enter', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Enter', { ctrlKey: true });

    expect(editor()).toBeNull();
    expect(labelOf('intro')).toBe('Opening');
    expect(rows()).not.toContain('new-1');
    expect(document.activeElement).toBe(item('intro'));
  });

  it('puts the old text back on Escape', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Something else';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Escape');

    expect(editor()).toBeNull();
    expect(history.current().nodes.intro.text).toBe('Introduction');
    expect(document.activeElement).toBe(item('intro'));
  });

  it('keeps the editor and the caret through a re-render caused by another pane', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Open';
    editor().dispatchEvent(new Event('input', { bubbles: true }));
    editor().setSelectionRange(2, 2);

    history.apply('setText', { id: 'conc', text: 'Closing' });

    expect(editor()).not.toBeNull();
    expect(editor().value).toBe('Open');
    expect(editor().selectionStart).toBe(2);
    expect(document.activeElement).toBe(editor());
  });
});

/**
 * A node the student started and never named.
 *
 * Enter creates the node before the first character is typed — that is what puts the editor on
 * screen — so a student who changes their mind is holding an empty node the map will keep, the
 * canvas will draw as a blank box, and every export will carry. Escape means "I did not want
 * this", and the node has to go with the step that made it: a `removeNode` on top would leave
 * Ctrl+Z pointing straight back at the empty node they had just thrown away.
 */
describe('a node the student never named', () => {
  // Shown as well as said, and only once. A row disappearing is not a sentence: a student who
  // pressed Escape by mistake watched their own new node go with nothing on screen to say so.
  it('goes away on Escape, saying so and putting the student back where they were', () => {
    mount();
    item('intro').focus();
    press('Enter');
    expect(rows()).toContain('new-1');

    press('Escape');

    expect(rows()).not.toContain('new-1');
    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(notified).toHaveBeenCalledWith('New node discarded');
    // `notify` writes the live region itself, so a second call through `announce` would say it twice.
    expect(announce).not.toHaveBeenCalledWith('New node discarded');
    expect(document.activeElement).toBe(item('intro'));
  });

  it('takes its own creation with it, so undo cannot bring the empty node back', () => {
    mount();
    item('intro').focus();
    press('Enter');

    press('Escape');
    history.undo();

    expect(history.current().nodes['new-1']).toBeUndefined();
  });

  it('goes away on Escape after the student typed and cleared it again', () => {
    mount();
    item('intro').focus();
    press('Enter');
    editor().value = 'Ope';
    editor().dispatchEvent(new Event('input', { bubbles: true }));
    editor().value = '';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Escape');

    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(notified).toHaveBeenCalledWith('New node discarded');
  });

  it('goes away when the student leaves it empty and the editor loses focus', () => {
    mount();
    item('intro').focus();
    press('Enter');

    editor().dispatchEvent(new FocusEvent('blur'));

    expect(rows()).not.toContain('new-1');
    expect(notified).toHaveBeenCalledWith('New node discarded');
    expect(announce).not.toHaveBeenCalledWith('New node discarded');
  });

  it('is kept, with what was typed, when the editor loses focus after a name', () => {
    mount();
    item('intro').focus();
    press('Enter');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    editor().dispatchEvent(new FocusEvent('blur'));

    expect(rows()).toContain('new-1');
    expect(labelOf('new-1')).toBe('Opening');
  });

  // The branch is opened so the new child has a row to be named in, which is part of the same
  // edit: discarding the child has to leave the branch shut, the way the student found it.
  it('leaves the branch it was made inside shut again, as it was found', () => {
    mount();
    item('arg').focus();
    press('ArrowLeft');
    const before = history.current();

    press('Enter', { shiftKey: true });
    expect(history.current().nodes.arg.collapsed).toBe(false);

    press('Escape');

    expect(history.current()).toBe(before);
    expect(history.current().nodes.arg.collapsed).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
  });

  it('goes away with the child it was, back to the node it was made inside', () => {
    mount();
    item('arg').focus();
    press('Enter', { shiftKey: true });

    press('Escape');

    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(history.current().nodes.arg.children).toEqual(['point', 'evidence']);
    expect(document.activeElement).toBe(item('arg'));
  });

  /** Type into the open editor the way a student does: the whole value, then one input event. */
  const type = text => {
    editor().value = text;
    editor().dispatchEvent(new Event('input', { bubbles: true }));
  };

  const emptyNodes = () =>
    Object.values(history.current().nodes).filter(node => node.text.trim() === '');

  it('leaves the map exactly as it was before the node was asked for', () => {
    mount();
    const before = history.current();
    item('intro').focus();
    press('Enter');
    type('Ope');
    type('');

    press('Escape');

    expect(history.current()).toBe(before);
  });

  it('cannot be brought back by redo', () => {
    mount();
    item('intro').focus();
    press('Enter');

    press('Escape');

    expect(history.canRedo()).toBe(false);
    history.redo();
    expect(history.current().nodes['new-1']).toBeUndefined();
  });

  it('is kept on Escape once it has a name, with the name, and says so', () => {
    mount();
    item('intro').focus();
    press('Enter');
    type('Opening');

    press('Escape');

    expect(editor()).toBeNull();
    expect(history.current().nodes['new-1'].text).toBe('Opening');
    expect(labelOf('new-1')).toBe('Opening');
    expect(notified).not.toHaveBeenCalledWith('New node discarded');
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining("Kept 'Opening'"));
    expect(document.activeElement).toBe(item('new-1'));
  });

  it('is removed by an ordinary step when its creation has left the undo stack', () => {
    let time = 0;
    mount(sampleMap(), { limit: 3, now: () => (time += 5000) });
    item('intro').focus();
    press('Enter');
    for (const text of ['O', 'Op', 'Ope', 'Open', '']) {
      type(text);
    }

    press('Escape');

    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(rows()).not.toContain('new-1');
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
  });

  it("takes nobody else's work with it when another pane changed the map meanwhile", () => {
    mount();
    item('intro').focus();
    press('Enter');
    history.apply('setText', { id: 'conc', text: 'Closing' });

    press('Escape');

    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(history.current().nodes.conc.text).toBe('Closing');
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
  });

  it('is discarded by Enter rather than followed by a second empty node', () => {
    mount();
    const before = history.current();
    item('intro').focus();
    press('Enter');

    press('Enter');

    expect(history.current()).toBe(before);
    expect(made).toBe(1);
    expect(editor()).toBeNull();
    expect(document.activeElement).toBe(item('intro'));
    // Shown as well as said: the student asked for another node and got an empty outline instead.
    expect(notified).toHaveBeenLastCalledWith(expect.stringMatching(/discarded.*Type a name/));
    expect(announce).not.toHaveBeenCalledWith(expect.stringMatching(/discarded.*Type a name/));
  });

  it('cannot be minted by holding Enter down', () => {
    mount();
    item('intro').focus();

    for (let at = 0; at < 10; at += 1) {
      press('Enter');
    }
    expect(emptyNodes()).toEqual([]);

    // An eleventh press leaves the one node the student is being asked to name, and no more.
    press('Enter');
    expect(emptyNodes()).toHaveLength(1);
    expect(editor()).not.toBeNull();
  });

  it('is discarded by Ctrl+Enter as well', () => {
    mount();
    item('intro').focus();
    press('Enter');

    press('Enter', { ctrlKey: true });

    expect(emptyNodes()).toEqual([]);
  });

  it('is discarded by Shift+Enter rather than given a child of its own', () => {
    mount();
    const before = history.current();
    item('intro').focus();
    press('Enter');

    press('Enter', { shiftKey: true });

    expect(history.current()).toBe(before);
    expect(emptyNodes()).toEqual([]);
    expect(made).toBe(1);
    expect(editor()).toBeNull();
    expect(document.activeElement).toBe(item('intro'));
    expect(notified).toHaveBeenLastCalledWith(expect.stringMatching(/discarded.*Type a name/));
  });

  it('cannot be minted by holding Shift+Enter down either', () => {
    mount();
    item('intro').focus();

    for (let at = 0; at < 10; at += 1) {
      press('Enter', { shiftKey: true });
    }
    expect(emptyNodes()).toEqual([]);

    press('Enter', { shiftKey: true });
    expect(emptyNodes()).toHaveLength(1);
    expect(editor()).not.toBeNull();
  });

  it('still leads on to a node inside it once it has a name', () => {
    mount();
    item('intro').focus();
    press('Enter');
    type('Opening');

    press('Enter', { shiftKey: true });

    expect(history.current().nodes['new-1'].text).toBe('Opening');
    expect(history.current().nodes['new-1'].children).toEqual(['new-2']);
    expect(editor()).not.toBeNull();
  });

  it('still leads on to the next node once it has a name', () => {
    mount();
    item('intro').focus();
    press('Enter');
    type('Opening');

    press('Enter');

    expect(history.current().nodes['new-1'].text).toBe('Opening');
    expect(editor()).not.toBeNull();
    expect(rows()).toContain('new-2');
  });

  it('leaves an existing node its own text when it is emptied and escaped', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = '';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    press('Escape');

    expect(rows()).toContain('intro');
    expect(history.current().nodes.intro.text).toBe('Introduction');
    expect(notified).not.toHaveBeenCalledWith('New node discarded');
  });
});

/**
 * Enter, Tab, then type is how an outliner is driven: make the node, put it where it belongs, name
 * it. So Tab inside the editor moves the node and leaves the student typing. Nothing blank is left
 * behind by that, because nothing has been left: the node is still under edit, and every real way
 * out of the editor still goes through the one exit that discards a blank.
 */
describe('Tab while a node is being written', () => {
  const type = text => {
    editor().value = text;
    editor().dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('indents a new, still blank node and leaves the student typing in it', () => {
    mount();
    item('conc').focus();
    press('Enter');

    const event = pressAndRead('Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(history.current().nodes['new-1'].parentId).toBe('conc');
    expect(editor()).not.toBeNull();
    expect(document.activeElement).toBe(editor());
    expect(editor().closest('[role="treeitem"]').dataset.id).toBe('new-1');
    expect(announce).toHaveBeenLastCalledWith("Moved the new node under 'Conclusion'");
  });

  it('keeps what was typed, and the caret where it was', () => {
    mount();
    item('conc').focus();
    press('Enter');
    type('Closing');
    editor().setSelectionRange(3, 3);

    press('Tab');

    expect(history.current().nodes['new-1'].parentId).toBe('conc');
    expect(editor().value).toBe('Closing');
    expect(editor().selectionStart).toBe(3);
    expect(document.activeElement).toBe(editor());
  });

  it('outdents on Shift+Tab, on a node that already existed as well', () => {
    mount();
    item('point').focus();
    press('F2');
    type('Poi');

    press('Tab', { shiftKey: true });

    expect(history.current().nodes.point.parentId).toBe('root');
    expect(editor().value).toBe('Poi');
    expect(document.activeElement).toBe(editor());
  });

  it('says why when the node cannot go there, and stays in the edit', () => {
    mount();
    const before = history.current();
    item('intro').focus();
    press('F2');

    press('Tab');
    expect(announce).toHaveBeenLastCalledWith(
      "'Introduction' is the first node here, so there is nothing to move it under."
    );
    press('Tab', { shiftKey: true });
    expect(announce).toHaveBeenLastCalledWith("'Introduction' is already at the top level.");

    expect(history.current()).toBe(before);
    expect(document.activeElement).toBe(editor());
  });

  // Indenting under a shut branch would take the row, and the editor with it, out of sight.
  it('opens the branch the node is indented into, as one step with the move', () => {
    mount();
    item('arg').focus();
    press('ArrowLeft');
    press('Enter');
    type('Aside');
    const before = history.current();

    press('Tab');

    expect(history.current().nodes['new-1'].parentId).toBe('arg');
    expect(history.current().nodes.arg.collapsed).toBe(false);
    expect(document.activeElement).toBe(editor());
    expect(editor().value).toBe('Aside');

    history.undo();
    expect(history.current()).toBe(before);
  });

  it('takes the indent with it when the blank node is then discarded', () => {
    mount();
    const before = history.current();
    item('conc').focus();
    press('Enter');
    press('Tab');
    type('Clo');
    type('');

    press('Escape');

    // Exactly the map there was before the node was asked for: no node, no trace of the move.
    expect(history.current()).toBe(before);
    expect(history.canRedo()).toBe(false);
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
    expect(document.activeElement).toBe(item('conc'));
  });

  it('undoes back past the whole of it, to what was there before the node was asked for', () => {
    mount();
    history.apply('setText', { id: 'intro', text: 'Opening' });
    const before = history.current();
    item('conc').focus();
    press('Enter');
    press('Tab');

    press('Escape');
    expect(history.current()).toBe(before);

    history.undo();
    expect(history.current().nodes.intro.text).toBe('Introduction');
    expect(history.current().nodes['new-1']).toBeUndefined();
  });
});

/**
 * A node with no name is a blank box on the canvas and an empty line in every export. A new one is
 * discarded; one that already had a name gets it back, and the student is told.
 */
describe('a node that already had a name', () => {
  const type = text => {
    editor().value = text;
    editor().dispatchEvent(new Event('input', { bubbles: true }));
  };

  const KEPT = "A node needs a name. Kept 'Introduction'.";

  const exits = {
    Enter: () => press('Enter'),
    'Ctrl+Enter': () => press('Enter', { ctrlKey: true }),
    blur: () => editor().dispatchEvent(new FocusEvent('blur')),
    'a press on another row': () => focusRow('conc'),
  };

  for (const [name, leave] of Object.entries(exits)) {
    it(`gets it back when it is emptied and left by ${name}`, () => {
      mount();
      item('intro').focus();
      press('F2');
      type('   ');

      leave();

      expect(history.current().nodes.intro.text).toBe('Introduction');
      expect(labelOf('intro')).toBe('Introduction');
      // The row writing itself back in explains nothing on its own, so this one is shown too.
      expect(notified).toHaveBeenCalledWith(KEPT);
      expect(announce).not.toHaveBeenCalledWith(KEPT);
    });
  }

  it('is not followed by a new node when Enter found nothing to commit', () => {
    mount();
    item('intro').focus();
    press('F2');
    type('');

    press('Enter');

    expect(made).toBe(0);
    expect(editor()).toBeNull();
    expect(notified).toHaveBeenLastCalledWith(KEPT);
    expect(document.activeElement).toBe(item('intro'));
  });

  it('gets it back when the row is taken away from under the edit', () => {
    mount();
    item('point').focus();
    press('F2');
    type('');

    // The canvas's collapse button does not take focus from the field it is pressed from.
    history.apply('toggleCollapsed', { id: 'arg' });

    expect(editor()).toBeNull();
    expect(history.current().nodes.point.text).toBe('Point');
    expect(notified).toHaveBeenLastCalledWith("A node needs a name. Kept 'Point'.");
  });

  it('takes a blank new node away when its row is taken from under the edit', () => {
    mount();
    item('point').focus();
    press('Enter');

    history.apply('toggleCollapsed', { id: 'arg' });

    expect(history.current().nodes['new-1']).toBeUndefined();
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
  });
});

/**
 * The invariant behind all of the above, stated once and then attacked: whatever a student types,
 * in whatever order, a node with no name exists only while it is the node being written.
 */
/**
 * What one Ctrl+Z does after an edit.
 *
 * The outline writes as the student types, so every keystroke used to be its own step: one press back
 * after naming a brand-new node took the name off and left an empty box, and one press back after
 * renaming an old one landed on whatever half-typed or emptied state the keystrokes passed through.
 * An empty box is the one thing every editor on this page refuses to write, so it must not be
 * something undo can write either. Each edit now runs under a mark and is folded into one step when
 * it is committed.
 */
describe('one press back after an edit', () => {
  it('takes a brand-new node away whole, rather than leaving it nameless', () => {
    mount();
    focusRow('intro');
    press('Enter');
    type('First branch');
    press('Enter', { ctrlKey: true });
    expect(labelOf('new-1')).toBe('First branch');

    history.undo();

    expect(rows()).not.toContain('new-1');
    expect(nameless()).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it('brings it back named, in one press forward', () => {
    mount();
    focusRow('intro');
    press('Enter');
    type('First branch');
    press('Enter', { ctrlKey: true });
    history.undo();

    history.redo();

    expect(labelOf('new-1')).toBe('First branch');
    expect(history.canRedo()).toBe(false);
  });

  it('costs one step however many keystrokes the name took', () => {
    // A clock that moves, so the keystrokes are separate steps rather than one coalesced one: what
    // folds them is the edit's mark, not the eight hundred millisecond coalescing window.
    let time = 0;
    mount(sampleMap(), { now: () => (time += 5000) });
    focusRow('intro');
    press('F2');
    type('I');
    type('In');
    type('Intr');
    type('Introduction, rewritten');
    press('Enter', { ctrlKey: true });

    history.undo();

    expect(labelOf('intro')).toBe('Introduction');
    expect(history.canUndo()).toBe(false);
  });

  it('never lands on the moment a name was emptied', () => {
    mount();
    focusRow('intro');
    press('F2');
    type('');
    editor().dispatchEvent(new FocusEvent('blur'));
    expect(labelOf('intro')).toBe('Introduction');

    // The text never really changed, so there is nothing about it on the stack to step back onto.
    expect(history.canUndo()).toBe(false);
    expect(nameless()).toEqual([]);
  });

  it('puts the old name back the ordinary way when the rewind would take somebody else’s work', () => {
    mount();
    focusRow('intro');
    press('F2');
    type('');
    // Another pane writes while the field is empty: the rewind is refused rather than taking it.
    history.apply('setText', { id: 'conc', text: 'In conclusion' });
    editor().dispatchEvent(new FocusEvent('blur'));

    expect(labelOf('intro')).toBe('Introduction');
    expect(history.current().nodes.conc.text).toBe('In conclusion');
  });
});

describe('no run of keys leaves a nameless node, or a selection that lies', () => {
  /** A small seeded generator, so a failure names a run that can be played again. */
  const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /** Press a row the way a pointer does, modifiers and all. */
  const pressRow = (id, init = {}) =>
    item(id)
      ?.querySelector('.assist-mm-row')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));

  /**
   * Every key worth pressing, and whether it is an ACT — a change to the map that the student made
   * in one press and that one Ctrl+Z has to take back.
   *
   * The editor's own keys are not acts, on purpose: a node the student never named is FORGOTTEN
   * rather than undone (`rewindTo`), and the keystrokes that named one are folded into the step that
   * made it (`squashSince`), so the entry the stack ends on is deliberately not the state that was
   * there a moment before. Those rules have their own tests above.
   */
  const moves = [
    { play: () => press('Enter') },
    { play: () => press('Enter', { shiftKey: true }) },
    { play: () => press('Enter', { ctrlKey: true }) },
    { play: () => press('F2') },
    { play: () => press('Escape') },
    { play: () => press('x') },
    { play: () => editor() && type('Named') },
    { play: () => editor() && type('') },
    { play: () => editor() && type('   ') },
    { play: () => editor() && editor().dispatchEvent(new FocusEvent('blur')) },
    // Moving about, which changes nothing on the map at all.
    { play: () => press('ArrowDown'), act: true },
    { play: () => press('ArrowUp'), act: true },
    { play: () => press('Home'), act: true },
    { play: () => press('End'), act: true },
    // The acts.
    { play: () => press('Tab'), act: true },
    { play: () => press('Tab', { shiftKey: true }), act: true },
    { play: () => press('ArrowLeft'), act: true },
    { play: () => press('ArrowRight'), act: true },
    { play: () => press('Delete'), act: true },
    { play: () => press(' '), act: true },
    { play: () => press('ArrowDown', { altKey: true }), act: true },
    { play: () => press('ArrowUp', { altKey: true }), act: true },
    // The chords that build a set, which change nothing on the map either.
    { play: () => press('ArrowDown', { shiftKey: true }), act: true },
    { play: () => press('ArrowUp', { shiftKey: true }), act: true },
    { play: () => press('ArrowDown', { ctrlKey: true }), act: true },
    { play: () => press('ArrowUp', { ctrlKey: true }), act: true },
    { play: () => press(' ', { ctrlKey: true }), act: true },
    { play: () => press('a', { ctrlKey: true }), act: true },
    { play: () => press('Home', { shiftKey: true }), act: true },
    { play: () => press('End', { shiftKey: true }), act: true },
    { play: () => pressRow(rows()[1], { shiftKey: true }), act: true },
    { play: () => pressRow(rows()[rows().length - 1], { ctrlKey: true }), act: true },
    { play: () => pressRow(rows()[0]), act: true },
    // Narrowing the view to one branch, and widening it again. Among the moves rather than in a
    // test of their own, because what has to hold is that EVERY invariant above still holds with a
    // branch on screen — and that a view never changes the map, which the undo check below sees.
    {
      play: () => {
        const id = selection.get();
        if (focus.isOn() || !id) {
          focus.leave();
          return;
        }
        focus.focusOn(id);
      },
      act: true,
    },
    { play: () => focus.leave(), act: true },
    // The toolbar's Undo and Redo, pressed with the MOUSE. The shared event helper prevents the
    // mousedown default, so the caret never leaves the field: the step arrives with the editor still
    // open on a node it may be about to take away. Not marked as an act — a step on the stack is not
    // a press one more Ctrl+Z puts back.
    { play: () => history.undo() },
    { play: () => history.redo() },
  ];

  /**
   * Nameless nodes the student can see, with no field open anywhere in the pane.
   *
   * A node this pane made and nobody named goes back under the field the moment the field is free
   * (`resumeNaming`), so while the student is part way through naming ANOTHER node a blank one can be
   * on screen — and there is nothing to do about that which does not yank them out of their own edit.
   * What must never happen is that the field goes free and the blank node stays.
   *
   * @returns {string[]}
   */
  const strayNameless = () => {
    if (editor()) {
      return [];
    }
    const shown = new Set(rows());
    return nameless().filter(id => shown.has(id));
  };

  /**
   * Everything that must be true of the tree and the store after every single keystroke.
   *
   * @param {string} played - the run so far, so a failure can be replayed.
   */
  function checkInvariants(played) {
    const map = history.current();
    const view = focus.history.current();
    const chosen = selection.ids();
    const shown = rows();
    const where = { played };

    // Every row on screen is in the branch being shown — the whole map when none is focused.
    const strangers = shown.filter(id => !Object.hasOwn(view.nodes, id));
    expect({ ...where, strangers }).toEqual({ ...where, strangers: [] });

    // The top row is level 1 whatever depth it really sits at, so a screen reader never hears
    // "level 7" for the top of what it can reach, and every row is one deeper than its parent.
    const levelOf = id => Number(item(id).getAttribute('aria-level'));
    expect({ ...where, top: levelOf(shown[0]) }).toEqual({ ...where, top: 1 });
    const misplaced = shown.filter(id => {
      const parentId = view.nodes[id].parentId;
      return levelOf(id) !== (parentId ? levelOf(parentId) + 1 : 1);
    });
    expect({ ...where, misplaced }).toEqual({ ...where, misplaced: [] });

    // And its place in its set is counted against the set the student can see.
    const miscounted = shown.filter(id => {
      const parentId = view.nodes[id].parentId;
      const siblings = parentId ? view.nodes[parentId].children : [view.rootId];
      return (
        Number(item(id).getAttribute('aria-posinset')) !== siblings.indexOf(id) + 1 ||
        Number(item(id).getAttribute('aria-setsize')) !== siblings.length
      );
    });
    expect({ ...where, miscounted }).toEqual({ ...where, miscounted: [] });

    // No id the map has lost, no empty set, exactly one primary and it is in the set.
    expect({ ...where, dangling: chosen.filter(id => !Object.hasOwn(map.nodes, id)) }).toEqual({
      ...where,
      dangling: [],
    });
    expect({ ...where, empty: chosen.length === 0 }).toEqual({ ...where, empty: false });
    expect({ ...where, primaryInSet: chosen.includes(selection.get()) }).toEqual({
      ...where,
      primaryInSet: true,
    });
    expect({ ...where, repeats: chosen.length - new Set(chosen).size }).toEqual({
      ...where,
      repeats: 0,
    });

    // Every row on screen agrees with the store, and there is exactly one tab stop.
    const disagreeing = shown.filter(
      id => item(id).getAttribute('aria-selected') !== String(selection.has(id))
    );
    expect({ ...where, disagreeing }).toEqual({ ...where, disagreeing: [] });
    const stops = shown.filter(id => item(id).tabIndex === 0);
    expect({ ...where, stops: stops.length }).toEqual({ ...where, stops: 1 });

    // No node left without a name, except the one being typed into.
    // No node the student can SEE left without a name, except the one being typed into.
    //
    // On screen rather than anywhere on the map, and the line is worth drawing exactly here. An undo
    // can step onto the entry that MADE a node: creating and naming a node are folded into one step,
    // but the fold is refused whenever another pane wrote in between, so the creation can stay on the
    // stack as an entry of its own. When that node is on screen the pane puts the editor back on it
    // (`resumeNaming`), which is what keeps it from being stored nameless. When it is out of sight —
    // under a fold, or outside the branch being shown — there is no row to put an editor on, and
    // nothing this pane can do about it that does not fight the student's own next Ctrl+Z.
    //
    // So the residual is stated rather than hidden: a nameless node can exist out of sight after a
    // step, and the autosave can store it. The fix is for a new node not to reach the map until it
    // has a name, which is a change to how nodes are made, not to how this run is graded.
    const stray = strayNameless();
    expect({ ...where, stray }).toEqual({ ...where, stray: [] });

    // And the autosave was never told about one either, at any point in the run: a nameless node the
    // student is looking at and not typing into is one that can be written to the database.
    expect({ ...where, autosaveSaw }).toEqual({ ...where, autosaveSaw: [] });
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`holds through 300 keys (run ${seed})`, () => {
      mount();
      item('intro').focus();
      const next = seeded(seed);
      const played = [];

      for (let at = 0; at < 300; at += 1) {
        // Escape parks focus on the hint, outside the tree; a student comes back in with a press.
        if (!host.querySelector('[role="tree"]').contains(document.activeElement)) {
          host.querySelector('[role="treeitem"][tabindex="0"]').focus();
        }
        const move = Math.floor(next() * moves.length);
        played.push(move);
        const before = history.current();
        const wasEditing = Boolean(editor());
        moves[move].play();
        const trail = played.join(',');
        checkInvariants(trail);

        // One press is one undo step: whatever that key did to the map, one Ctrl+Z puts it back.
        // Not while an editor was open on either side of the press: a press on a row finishes the
        // edit as well as choosing a node, and finishing an edit folds its steps on purpose.
        if (moves[move].act && !wasEditing && !editor() && history.current() !== before) {
          expect({ played: trail, back: history.undo() }).toEqual({ played: trail, back: before });
          history.redo();
          checkInvariants(`${trail} (after undo and redo)`);
        }
      }

      if (editor()) {
        editor().dispatchEvent(new FocusEvent('blur'));
      }
      expect(nameless()).toEqual([]);
    });
  }
});

describe('an edit that goes out of view', () => {
  it('is dropped when an ancestor collapses over it', () => {
    mount();
    item('point').focus();
    press('F2');
    expect(editor()).not.toBeNull();

    // Collapsing 'arg' from the canvas or the inspector hides the row being typed into.
    history.apply('toggleCollapsed', { id: 'arg' });

    expect(editor()).toBeNull();
    expect(rows()).toEqual(['root', 'intro', 'arg', 'conc']);
  });
});

describe('the question mark', () => {
  it('is left to the page, so ? opens Help rather than renaming the node', () => {
    mount();
    item('arg').focus();

    const event = pressAndRead('?');

    expect(editor()).toBeNull();
    expect(history.current().nodes.arg.text).toBe('Argument one');
    // Not claimed and not stopped, so the page's own ? handler still sees it.
    expect(event.defaultPrevented).toBe(false);
  });

  it('still starts an edit from any other printable character', () => {
    mount();
    item('arg').focus();

    press('x');

    expect(editor().value).toBe('x');
  });
});

describe('the pointer', () => {
  const clickOn = element => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
  };

  it('focuses the row that was clicked', () => {
    mount();

    clickOn(item('evidence').querySelector('.assist-mm-row'));

    expect(document.activeElement).toBe(item('evidence'));
    expect(selection.get()).toBe('evidence');
  });

  it('starts editing when the row already had focus', () => {
    mount();
    const row = () => item('intro').querySelector('.assist-mm-row');

    clickOn(row());
    clickOn(row());

    expect(editor()).not.toBeNull();
    expect(editor().value).toBe('Introduction');
  });

  it('lets the caret land inside the editor rather than cancelling the click', () => {
    mount();
    item('intro').focus();
    press('F2');

    const event = clickOn(editor());

    expect(event.defaultPrevented).toBe(false);
    expect(editor()).not.toBeNull();
  });

  it('commits the edit when another row is clicked', () => {
    mount();
    item('intro').focus();
    press('F2');
    editor().value = 'Opening';
    editor().dispatchEvent(new Event('input', { bubbles: true }));

    clickOn(item('conc').querySelector('.assist-mm-row'));

    expect(editor()).toBeNull();
    expect(labelOf('intro')).toBe('Opening');
    expect(document.activeElement).toBe(item('conc'));
  });
});

describe('selection', () => {
  it('selects the node the student focuses, and says the outline did it', () => {
    mount();
    const heard = [];
    selection.subscribe((id, meta) => heard.push([id, meta.source]));

    item('arg').focus();

    expect(selection.get()).toBe('arg');
    expect(heard).toEqual([['arg', 'outline']]);
  });

  it('highlights a selection made on the canvas without stealing focus', () => {
    mount();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    selection.set('evidence', { source: 'canvas' });

    expect(item('evidence').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(outside);
  });

  // A selection can carry an id that came out of a file or another module, and every object answers
  // to `constructor`: a truthiness test on `map.nodes[id]` would move the focus onto nothing.
  it('ignores a selection that names something which is not a node', () => {
    mount();
    item('arg').focus();

    selection.set('constructor', { source: 'canvas' });

    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
    expect(document.activeElement).toBe(item('arg'));
    expect(host.querySelectorAll('[role="treeitem"][aria-selected="true"]')).toHaveLength(0);
    expect(host.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
  });

  it('follows a selection made elsewhere when the outline already had focus', () => {
    mount();
    item('root').focus();

    selection.set('evidence', { source: 'inspector' });

    expect(document.activeElement).toBe(item('evidence'));
  });
});

/**
 * Node creation asked for from outside this pane.
 *
 * The canvas's quick-add handles make nodes through here rather than reaching for the ops
 * themselves, so a node made with a pointer on the picture and a node made with Enter on a row are
 * the same node made the same way: one mark before the creation, a shut branch opened as part of it,
 * and the record that lets whichever editor is on screen throw away a blank one.
 */
describe('a node asked for by another pane', () => {
  it('adds a child, selects it and hands back the record, without opening its own editor', () => {
    mount();

    const record = pane.addNode('arg', { asChild: true });

    expect(rows()).toContain('new-1');
    expect(history.current().nodes.arg.children).toEqual(['point', 'evidence', 'new-1']);
    expect(selection.get()).toBe('new-1');
    expect(record).toMatchObject({ id: 'new-1', created: true, from: 'arg' });
    expect(typeof record.mark).toBe('symbol');
    // The student is looking at the canvas, so the canvas is where the name is typed.
    expect(editor()).toBeNull();
    expect(announce).toHaveBeenCalledWith("New node inside 'Argument one'. Type to name it.");
  });

  it('adds a sibling below the node it was asked from', () => {
    mount();

    const record = pane.addNode('point', { asChild: false });

    expect(history.current().nodes.arg.children).toEqual(['point', 'new-1', 'evidence']);
    expect(record.from).toBe('point');
    expect(announce).toHaveBeenCalledWith('New node. Type to name it.');
  });

  it('adds inside the centre, which has no siblings', () => {
    mount();

    pane.addNode('root', { asChild: false });

    expect(history.current().nodes.root.children).toEqual(['intro', 'arg', 'conc', 'new-1']);
  });

  it('opens a shut branch so the new child is on screen, under the one mark', () => {
    mount();
    history.apply('toggleCollapsed', { id: 'arg' });

    const record = pane.addNode('arg', { asChild: true });

    expect(history.current().nodes.arg.collapsed).toBe(false);
    expect(rows()).toContain('new-1');
    // The mark covers the opening as well as the creation, so a discard leaves the branch shut.
    expect(history.rewindTo(record.mark)).toBe(true);
    expect(history.current().nodes.arg.collapsed).toBe(true);
  });

  it('answers with nothing when the node it was asked from has gone', () => {
    mount();

    expect(pane.addNode('constructor', { asChild: true })).toBeNull();
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
  });
});

describe('destroy', () => {
  it('empties the host and stops listening to the history', () => {
    mount();

    pane.destroy();
    pane = null;

    expect(host.querySelector('[role="tree"]')).toBeNull();
    expect(() => history.apply('setText', { id: 'intro', text: 'Changed' })).not.toThrow();
  });
});

describe('more than one node at a time', () => {
  /** @returns {string[]} the ids the tree says are selected, in row order */
  const selectedRows = () =>
    [...host.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(el => el.dataset.id);

  /** @returns {string[]} the rows holding the tree's tab stop; there is only ever one */
  const tabStops = () =>
    [...host.querySelectorAll('[role="treeitem"][tabindex="0"]')].map(el => el.dataset.id);

  const clickRow = (id, init = {}) =>
    item(id)
      .querySelector('.assist-mm-row')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));

  it('says the tree takes more than one selection', () => {
    mount();
    expect(host.querySelector('[role="tree"]').getAttribute('aria-multiselectable')).toBe('true');
  });

  it('extends the selection down from the anchor with Shift', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });

    expect(selection.ids()).toEqual(['intro', 'arg']);
    expect(selectedRows()).toEqual(['intro', 'arg']);
    expect(selection.get()).toBe('arg');
    expect(tabStops()).toEqual(['arg']);
  });

  it('extends back up to the anchor, shrinking the range', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['intro', 'arg', 'point']);

    press('ArrowUp', { shiftKey: true });

    expect(selection.ids()).toEqual(['intro', 'arg']);
  });

  it('collapses the selection back to one node on a plain arrow', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });

    press('ArrowDown');

    expect(selection.ids()).toEqual(['point']);
  });

  it('moves focus without touching the selection on Ctrl+Arrow', () => {
    mount();
    focusRow('intro');

    press('ArrowDown', { ctrlKey: true });

    expect(document.activeElement).toBe(item('arg'));
    expect(selection.ids()).toEqual(['intro']);
    expect(tabStops()).toEqual(['arg']);
  });

  it('adds the node focus is on to the set with Ctrl+Space, and takes it out again', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { ctrlKey: true });
    press('ArrowDown', { ctrlKey: true });

    press(' ', { ctrlKey: true });
    expect(selection.ids()).toEqual(['intro', 'point']);
    expect(document.activeElement).toBe(item('point'));

    press(' ', { ctrlKey: true });
    expect(selection.ids()).toEqual(['intro']);
    // Nothing was ticked: Ctrl+Space is not Space.
    expect(history.current().nodes.point.done).toBe(false);
  });

  it('will not take the last node out of the set', () => {
    mount();
    focusRow('intro');
    press(' ', { ctrlKey: true });
    expect(selection.ids()).toEqual(['intro']);
  });

  it('keeps Space for the tick when Ctrl is not held', () => {
    mount();
    focusRow('intro');
    press(' ');
    expect(history.current().nodes.intro.done).toBe(true);
  });

  it('selects the siblings first with Ctrl+A, then the whole outline', () => {
    mount();
    focusRow('point');

    press('a', { ctrlKey: true });
    expect(selection.ids()).toEqual(['point', 'evidence']);
    expect(announce).toHaveBeenLastCalledWith('2 nodes selected: this one and its siblings.');

    press('a', { ctrlKey: true });
    expect(selection.ids()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
    expect(announce).toHaveBeenLastCalledWith('6 nodes selected: the whole outline.');
  });

  it('claims Ctrl+A so the browser does not select the page instead', () => {
    mount();
    focusRow('point');
    const event = pressAndRead('a', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('extends to the first and last rows with Shift+Home and Shift+End', () => {
    mount();
    focusRow('arg');

    press('Home', { shiftKey: true });
    expect(selection.ids()).toEqual(['root', 'intro', 'arg']);

    focusRow('arg');
    press('End', { shiftKey: true });
    expect(selection.ids()).toEqual(['arg', 'point', 'evidence', 'conc']);
  });

  it('collapses a set to the primary on Escape, and stays in the tree', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });

    press('Escape');

    expect(selection.ids()).toEqual(['arg']);
    expect(document.activeElement).toBe(item('arg'));

    // A second Escape is the one that leaves, exactly as it always did.
    press('Escape');
    expect(document.activeElement).toBe(host.querySelector('.assist-mm-outline__hint'));
  });

  it('selects a row the moment the button goes down, with no release to wait for', () => {
    mount();
    focusRow('intro');
    // The outline has no drag, so a press here can never be the start of one: there is nothing to
    // hold off for, and a row press means the row it landed on straight away.
    item('conc')
      .querySelector('.assist-mm-row')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(selection.ids()).toEqual(['conc']);
  });

  it('extends and toggles from the pointer the same way the keys do', () => {
    mount();
    clickRow('intro');
    clickRow('point', { shiftKey: true });
    expect(selection.ids()).toEqual(['intro', 'arg', 'point']);

    clickRow('conc', { ctrlKey: true });
    expect(selection.ids()).toEqual(['intro', 'arg', 'point', 'conc']);

    // A plain press collapses the set rather than opening the editor.
    clickRow('conc');
    expect(selection.ids()).toEqual(['conc']);
    expect(editor()).toBeNull();
  });

  it('deletes the whole set as one undo step, and says how many went', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['intro', 'arg', 'point']);

    press('Delete');

    // 'arg' carries 'point' and 'evidence', so two nodes go and two children go with them.
    expect(rows()).toEqual(['root', 'conc']);
    expect(announce).toHaveBeenLastCalledWith(
      'Deleted 2 nodes and 2 children. Press Ctrl+Z to undo'
    );

    history.undo();
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
  });

  it('deletes the rest and says the centre stays when the set holds it', () => {
    mount();
    focusRow('root');
    press('a', { ctrlKey: true });

    press('Delete');

    expect(rows()).toEqual(['root']);
    expect(announce).toHaveBeenLastCalledWith(
      'Deleted 3 nodes and 2 children. The centre stays where it is. Press Ctrl+Z to undo'
    );
  });

  it('gives the existing reason when only the centre is selected', () => {
    mount();
    focusRow('root');
    press('Delete');
    expect(announce).toHaveBeenLastCalledWith('The centre of the map cannot be deleted.');
  });

  it('puts the keyboard on a row that survived the delete', () => {
    mount();
    focusRow('point');
    press('ArrowDown', { shiftKey: true });

    press('Delete');

    expect(selection.ids()).toEqual(['arg']);
    expect(tabStops()).toEqual(['arg']);
  });

  it('outdents a block of siblings as one undo step', () => {
    mount();
    focusRow('point');
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['point', 'evidence']);

    // 'point' is first among its siblings, so the block has nothing above it: it stays.
    press('Tab');
    expect(announce).toHaveBeenLastCalledWith(
      'Nothing moved: there is nothing above them to move them under.'
    );
    expect(history.canUndo()).toBe(false);

    press('Tab', { shiftKey: true });
    expect(history.current().nodes.root.children).toEqual([
      'intro',
      'arg',
      'point',
      'evidence',
      'conc',
    ]);
    expect(announce).toHaveBeenLastCalledWith('Moved 2 nodes out one level.');

    history.undo();
    expect(history.current().nodes.point.parentId).toBe('arg');
    expect(history.current().nodes.evidence.parentId).toBe('arg');
  });

  it('indents a non-contiguous set node by node and says how many could not', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { ctrlKey: true });
    press('ArrowDown', { ctrlKey: true });
    press('ArrowDown', { ctrlKey: true });
    press('ArrowDown', { ctrlKey: true });
    press(' ', { ctrlKey: true });
    expect(selection.ids()).toEqual(['intro', 'conc']);

    press('Tab');

    // 'intro' is first under the root, so only 'conc' moves — under 'arg'.
    expect(history.current().nodes.conc.parentId).toBe('arg');
    expect(history.current().nodes.intro.parentId).toBe('root');
    expect(announce).toHaveBeenLastCalledWith(
      'Indented 1 node. 1 stayed where it was: there is nothing above it to move it under.'
    );
  });

  it('moves a block up among its siblings as one step', () => {
    mount();
    focusRow('arg');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    // 'arg' carries 'point' and 'evidence', so the effective set is 'arg' alone.
    expect(selection.ids()).toEqual(['arg', 'point', 'evidence']);

    press('ArrowUp', { altKey: true });

    expect(history.current().nodes.root.children).toEqual(['arg', 'intro', 'conc']);
    expect(announce).toHaveBeenLastCalledWith('Moved 1 node up.');
  });

  it('keeps the set selected after a structural act', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    const before = selection.ids();

    press('Tab', { shiftKey: true });

    expect(selection.ids()).toEqual(before);
    expect(selectedRows()).toEqual(before);
  });

  it('ticks every selected node at once, and unticks them all again', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });

    press(' ');
    expect(history.current().nodes.intro.done).toBe(true);
    expect(history.current().nodes.arg.done).toBe(true);
    expect(announce).toHaveBeenLastCalledWith('Marked 2 nodes done.');

    press(' ');
    expect(history.current().nodes.intro.done).toBe(false);
    expect(announce).toHaveBeenLastCalledWith('Marked 2 nodes not done.');
  });

  it('collapses every selected node that has something inside it', () => {
    mount();
    focusRow('arg');
    press('ArrowUp', { ctrlKey: true });
    press(' ', { ctrlKey: true });
    expect(selection.ids()).toEqual(['arg', 'intro']);

    press('ArrowLeft');

    expect(history.current().nodes.arg.collapsed).toBe(true);
    expect(announce).toHaveBeenLastCalledWith('Collapsed 1 node. 1 node has nothing inside it.');
  });

  it('keeps the primary on a row the collapse left on screen', () => {
    mount();
    focusRow('arg');
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['arg', 'point']);

    press('ArrowLeft');

    // 'point' went behind the fold, so the primary and the keyboard come out to 'arg'.
    expect(rows()).toEqual(['root', 'intro', 'arg', 'conc']);
    expect(selection.ids()).toEqual(['arg']);
    expect(tabStops()).toEqual(['arg']);
  });

  it('leaves the tab stop on a row that is still there after a press discarded one', () => {
    mount();
    // A shut branch, a new child inside it, and then a press on another row: discarding the unnamed
    // child shuts the branch again, so the row the press was aimed at may have gone with it.
    history.apply('toggleCollapsed', { id: 'arg' });
    focusRow('arg');
    press('Enter', { shiftKey: true });
    expect(editor()).not.toBeNull();
    const buried = rows().find(id => id === 'new-1');
    expect(buried).toBe('new-1');

    clickRow('point');

    expect(rows()).toEqual(['root', 'intro', 'arg', 'conc']);
    expect(tabStops()).toHaveLength(1);
    expect(selection.ids()).toEqual([selection.get()]);
  });

  it('every row agrees with the store, and there is one tab stop', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });

    for (const row of host.querySelectorAll('[role="treeitem"]')) {
      expect([row.dataset.id, row.getAttribute('aria-selected')]).toEqual([
        row.dataset.id,
        String(selection.has(row.dataset.id)),
      ]);
    }
    expect(tabStops()).toHaveLength(1);
  });
});

/**
 * No name is ever taken off a node — on the map OR anywhere on the undo stack.
 *
 * The rule used to be kept by folding a whole rename into one step on the way out of the editor,
 * which the history refuses the moment another pane has written in between. A debounced note from the
 * Details panel landing mid-rename was enough: the emptied name then sat on the stack one Ctrl+Z from
 * the student. So the rule is kept at the source instead — an emptied field is never written — and
 * these walk every entry on the stack rather than only the map on screen.
 */
describe('the whole undo stack, not just the map on screen', () => {
  /**
   * Every map the stack holds, oldest first, leaving the student where they were.
   *
   * @returns {Object[]}
   */
  function everyStateOnTheStack() {
    while (history.canRedo()) {
      history.redo();
    }
    const states = [history.current()];
    let stepsBack = 0;
    while (history.canUndo()) {
      history.undo();
      states.push(history.current());
      stepsBack += 1;
    }
    for (let at = 0; at < stepsBack; at += 1) {
      history.redo();
    }
    return states.reverse();
  }

  /**
   * Where a node lost the name it had.
   *
   * The invariant in full, and it needs no exception for the node being edited: a node may be blank in
   * an entry only if it was blank in the entry before, or was not there at all. A node is born
   * nameless — Enter makes it before the student names it — and it may stay nameless while nothing
   * but that edit is happening. What may never happen is a node that HAD a name holding none.
   *
   * @param {Object[]} states - every map on the stack, oldest first.
   * @returns {string[]} one line per fault; empty when the stack is sound.
   */
  function namesLost(states) {
    const faults = [];
    states.forEach((after, at) => {
      if (at === 0) {
        return;
      }
      const before = states[at - 1];
      for (const node of Object.values(after.nodes)) {
        const was = before.nodes[node.id];
        if (node.text.trim() === '' && was && was.text.trim() !== '') {
          faults.push(`'${was.text}' (${node.id}) lost its name at step ${at} of ${states.length}`);
        }
      }
    });
    return faults;
  }

  it('holds no emptied name when another pane writes in the middle of a rename', () => {
    mount();
    focusRow('intro');
    press('F2');
    type('');

    // What the Details panel does 200 ms after the student left it: a debounced write, landing here.
    history.apply('setNotes', { id: 'conc', notes: 'From the panel' });

    type('Introduction, reworded');
    press('Enter', { ctrlKey: true });

    expect(namesLost(everyStateOnTheStack())).toEqual([]);
    // And the step the student lands on is the name they started with, never an empty box.
    history.undo();
    expect(history.current().nodes.intro.text).toBe('Introduction');
  });

  it('holds no emptied name when the rename is abandoned after a foreign step', () => {
    mount();
    focusRow('intro');
    press('F2');
    type('');
    history.apply('setNotes', { id: 'conc', notes: 'From the panel' });
    press('Escape');

    expect(history.current().nodes.intro.text).toBe('Introduction');
    expect(namesLost(everyStateOnTheStack())).toEqual([]);
  });

  it('holds no emptied name when a foreign step lands between two keystrokes', () => {
    mount();
    focusRow('intro');
    press('F2');
    type('Intro');
    history.apply('setNotes', { id: 'conc', notes: 'From the panel' });
    type('');
    type('Introduction at last');
    editor().dispatchEvent(new FocusEvent('blur'));

    expect(namesLost(everyStateOnTheStack())).toEqual([]);
  });

  for (const seed of [11, 12, 13]) {
    it(`holds through 200 keys with foreign steps landing in them (run ${seed})`, () => {
      mount();
      item('intro').focus();
      let state = seed;
      const next = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
      const keys = [
        () => press('Enter'),
        () => press('Enter', { shiftKey: true }),
        () => press('Enter', { ctrlKey: true }),
        () => press('F2'),
        () => press('Escape'),
        () => press('x'),
        () => press('Tab'),
        () => press('Delete'),
        () => press('ArrowDown'),
        () => press('ArrowUp'),
        () => press('ArrowDown', { shiftKey: true }),
        () => editor() && type(''),
        () => editor() && type('   '),
        () => editor() && type('Named'),
        () => editor() && editor().dispatchEvent(new FocusEvent('blur')),
      ];

      /** Another pane writing, which is what refuses the fold and left the blank behind. */
      const foreign = () => {
        const ids = Object.keys(history.current().nodes);
        const id = ids[Math.floor(next() * ids.length)];
        history.apply('setNotes', { id, notes: `note ${state}` });
      };

      const played = [];
      for (let at = 0; at < 200; at += 1) {
        if (!host.querySelector('[role="tree"]').contains(document.activeElement)) {
          host.querySelector('[role="treeitem"][tabindex="0"]').focus();
        }
        const move = Math.floor(next() * keys.length);
        played.push(move);
        keys[move]();
        // Roughly one key in five is followed by somebody else's step.
        if (next() < 0.2) {
          played.push('f');
          foreign();
        }
      }
      if (editor()) {
        editor().dispatchEvent(new FocusEvent('blur'));
      }

      const trail = played.join(',');
      expect({ trail, lost: namesLost(everyStateOnTheStack()) }).toEqual({ trail, lost: [] });
      // And nothing nameless is left on the map itself, which is the promise a student sees.
      expect({ trail, nameless: nameless() }).toEqual({ trail, nameless: [] });
    });
  }
});

describe('making and renaming a node while a set is selected', () => {
  /** Every selection change the pane made, with the meta it carried. */
  const watch = () => {
    const heard = [];
    selection.subscribe((id, meta) => heard.push({ id, said: meta.said }));
    return heard;
  };

  it('adds beside the node the student is on, and says what it dropped', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['intro', 'arg', 'point']);
    const heard = watch();

    press('Enter');

    expect(announce).toHaveBeenLastCalledWith(
      'New node. The other 2 nodes are no longer selected. Type to name it.'
    );
    // `said`, because the new node has no name for the count sentence to quote.
    expect(heard).toEqual([{ id: 'new-1', said: true }]);
  });

  it('says it in the singular for one other node', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });

    press('Enter', { shiftKey: true });

    expect(announce).toHaveBeenLastCalledWith(
      "New node inside 'Argument one'. The other node is no longer selected. Type to name it."
    );
  });

  it('says nothing of the kind when one node was selected', () => {
    mount();
    focusRow('intro');

    press('Enter');

    expect(announce).toHaveBeenLastCalledWith('New node. Type to name it.');
  });

  it('names an unnamed parent rather than quoting nothing', () => {
    mount();
    history.apply('setText', { id: 'arg', text: '' });
    focusRow('arg');

    press('Enter', { shiftKey: true });

    expect(announce).toHaveBeenLastCalledWith("New node inside '(untitled)'. Type to name it.");
  });

  it('drops the set when the editor opens on one node, and lets the count say so', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    const heard = watch();

    press('F2');

    expect(selection.ids()).toEqual(['arg']);
    // Not `said`: "1 node selected: 'Argument one'." is exactly the news, and the rename has no
    // sentence of its own.
    expect(heard).toEqual([{ id: 'arg', said: false }]);
  });
});

describe('the row the rest of the page works from', () => {
  const primaryRows = () =>
    [...host.querySelectorAll('.assist-mm-item--primary')].map(row => row.dataset.id);

  it('is marked among several selected rows, and only then', () => {
    mount();
    focusRow('intro');
    expect(primaryRows()).toEqual([]);

    press('ArrowDown', { shiftKey: true });

    expect(primaryRows()).toEqual([selection.get()]);
    expect(primaryRows()).toEqual(['arg']);

    press('Escape');
    expect(primaryRows()).toEqual([]);
  });

  it('follows the primary as the set is built, across a rebuild', () => {
    mount();
    focusRow('intro');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(primaryRows()).toEqual(['point']);

    // A rebuild from somebody else's change keeps the mark where the store says it is.
    history.apply('setNotes', { id: 'conc', notes: 'x' });
    expect(primaryRows()).toEqual(['point']);
  });

  it('is told apart by more than a colour, in the stylesheet', () => {
    const css = fs.readFileSync(path.join(PAGE, 'mindmap.css'), 'utf8');
    const rule = css.slice(css.indexOf('.assist-mm-item--primary'));
    // A heavier leading rule, not a different colour (SC 1.4.1), and an outline under forced colours.
    expect(rule).toMatch(/box-shadow:\s*inset 7px/);
    expect(css).toMatch(/forced-colors: active[\s\S]*\.assist-mm-item--primary[\s\S]*outline:/);
  });
});

/**
 * A row is the same element before and after a change that did not touch its node.
 *
 * This is the structural half of a defect jsdom cannot show. In a real browser, focus moving to a row
 * is a two-step affair: the browser leaves the old element, the page's `focusout` handlers run, and
 * only then does focus arrive. A write flushed by one of those handlers used to rebuild the whole
 * tree, so focus arrived at a row that had been thrown away and fell to `<body>` — the top of the
 * page, with the student's place lost. jsdom's `focus()` is synchronous and models no in-transit
 * state, so what is asserted here is the property that makes the browser case impossible: the element
 * is never replaced. The real proof is the Playwright case "a rename with another panel writing
 * mid-way leaves no blank one undo away", which moves focus with the keyboard — a click hides this
 * bug entirely, because the row's own press handler puts focus back afterwards.
 */
describe('a row keeps its identity across a change that left its node alone', () => {
  const held = ids => ids.map(id => item(id));

  it('keeps every row when another node gains a note', () => {
    mount();
    const before = held(rows());

    history.apply('setNotes', { id: 'conc', notes: 'From the Details panel' });

    expect(held(rows())).toEqual(before);
  });

  it('keeps the row whose own note changed', () => {
    mount();
    focusRow('intro');
    const before = item('intro');

    history.apply('setNotes', { id: 'intro', notes: 'A note of its own' });

    expect(item('intro')).toBe(before);
    expect(document.activeElement).toBe(before);
  });

  it('keeps the row the keyboard is about to reach', () => {
    mount();
    // Nothing in the tree has focus yet — the student is on their way to this row.
    const target = item('point');

    history.apply('setColour', { id: 'conc', colour: 2 });
    history.apply('setNotes', { id: 'arg', notes: 'x' });
    history.apply('setText', { id: 'evidence', text: 'Evidence, reworded' });

    expect(item('point')).toBe(target);
    // And it is still the row it was, so focus arriving at it lands somewhere real.
    target.focus();
    expect(document.activeElement).toBe(item('point'));
  });

  it('keeps every row when a node is added somewhere else', () => {
    mount();
    const before = held(rows());

    history.apply('addChild', { parentId: 'conc', node: { id: 'extra', text: 'Extra' } });

    // The rows that were there are the same elements; the new one is new.
    expect(held(rows().filter(id => id !== 'extra'))).toEqual(before);
  });

  it('keeps the rows that did not move when one of them did', () => {
    mount();
    const untouched = held(['root', 'intro', 'conc']);

    history.apply('moveUp', { id: 'evidence' });

    expect(held(['root', 'intro', 'conc'])).toEqual(untouched);
  });

  it('moves no row at all when no node moved', () => {
    mount();
    // Not only the same elements: not touched. Re-inserting an element where it already is takes it
    // out of the document for an instant, and in a browser that is enough to drop the keyboard — the
    // one thing jsdom cannot show, so what is asserted is that it does not happen.
    const moved = jest.spyOn(window.Element.prototype, 'insertBefore');

    history.apply('setNotes', { id: 'conc', notes: 'From the Details panel' });
    history.apply('setColour', { id: 'arg', colour: 3 });
    history.apply('setDone', { id: 'intro', done: true });

    const rowMoves = moved.mock.calls.filter(
      ([element]) => element.getAttribute?.('role') === 'treeitem'
    );
    expect(rowMoves).toEqual([]);
    moved.mockRestore();
  });

  it('builds a fresh row for a node that went behind a fold and came back', () => {
    mount();
    const before = item('point');

    history.apply('toggleCollapsed', { id: 'arg' });
    expect(item('point')).toBeNull();
    history.apply('toggleCollapsed', { id: 'arg' });

    expect(item('point')).not.toBe(before);
    expect(item('point').dataset.id).toBe('point');
  });
});

describe('with one branch on screen', () => {
  const levels = () => rows().map(id => Number(item(id).getAttribute('aria-level')));
  const hint = () => host.querySelector('.assist-mm-outline__hint');

  it('shows the branch alone, with the levels rebased from its top', () => {
    mount();
    focus.focusOn('arg');

    expect(rows()).toEqual(['arg', 'point', 'evidence']);
    expect(levels()).toEqual([1, 2, 2]);
    expect(item('arg').getAttribute('aria-posinset')).toBe('1');
    expect(item('arg').getAttribute('aria-setsize')).toBe('1');
    expect(item('evidence').getAttribute('aria-posinset')).toBe('2');
    expect(item('evidence').getAttribute('aria-setsize')).toBe('2');
  });

  it('keeps the row of every node that stays on screen, in and out', () => {
    mount();
    const before = { arg: item('arg'), point: item('point') };

    focus.focusOn('arg');
    expect(item('arg')).toBe(before.arg);
    expect(item('point')).toBe(before.point);

    focus.leave();
    expect(item('arg')).toBe(before.arg);
    expect(item('point')).toBe(before.point);
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
  });

  it('never rebuilds for a change the branch cannot see', () => {
    mount();
    focus.focusOn('arg');
    const row = item('point');

    history.apply('setText', { id: 'intro', text: 'Opening' });

    expect(item('point')).toBe(row);
    expect(rows()).toEqual(['arg', 'point', 'evidence']);
  });

  it('leaves the branch on Escape, and the outline on the next one', () => {
    mount();
    focus.focusOn('arg');
    item('point').focus();
    press('ArrowDown', { shiftKey: true });
    expect(selection.ids()).toEqual(['point', 'evidence']);

    // A set is what Escape drops first; the primary — the far end of the range — is what is left.
    press('Escape');
    expect(selection.ids()).toEqual(['evidence']);
    expect(focus.isOn()).toBe(true);

    // Then the branch.
    press('Escape');
    expect(focus.isOn()).toBe(false);
    expect(host.querySelector('[role="tree"]').contains(document.activeElement)).toBe(true);

    // And only then the outline itself.
    press('Escape');
    expect(document.activeElement).toBe(hint());
  });

  it('says the whole BRANCH when Ctrl+A has taken everything on screen', () => {
    mount();
    focus.focusOn('arg');
    item('point').focus();

    press('a', { ctrlKey: true });
    expect(announce).toHaveBeenLastCalledWith('2 nodes selected: this one and its siblings.');

    press('a', { ctrlKey: true });
    expect(announce).toHaveBeenLastCalledWith('3 nodes selected: the whole branch.');
  });

  it('refuses to delete the top of the branch, in words about the branch', () => {
    mount();
    focus.focusOn('arg');
    item('arg').focus();

    press('Delete');

    expect(announce).toHaveBeenLastCalledWith(
      'The top of this branch cannot be deleted from inside it. Press Escape to see the whole map.'
    );
    expect(history.current().nodes.arg).toBeDefined();
  });

  it('refuses to move it, in the same words', () => {
    mount();
    focus.focusOn('arg');
    item('arg').focus();
    // Tab only means "indent" once the student has started working in the tree (SC 2.1.2).
    press('Home');

    press('Tab', { shiftKey: true });

    expect(announce).toHaveBeenLastCalledWith(
      'The top of this branch cannot be moved from inside it. Press Escape to see the whole map.'
    );
  });

  it('adds a child when Enter asks for a sibling of the top of the branch', () => {
    mount();
    focus.focusOn('arg');
    item('arg').focus();

    press('Enter');
    type('Third point');
    press('Enter', { ctrlKey: true });

    expect(history.current().nodes['new-1'].parentId).toBe('arg');
    expect(rows()).toContain('new-1');
  });

  it('lets a node be moved out of the branch, and says where it went', () => {
    mount();
    focus.focusOn('arg');
    item('arg').focus();
    // Down to the row, which is also what arms Tab as the indent key.
    press('ArrowDown');
    expect(document.activeElement).toBe(item('point'));

    press('Tab', { shiftKey: true });

    // A real edit on the real map: the node is now a branch of the map in its own right.
    expect(history.current().nodes.point.parentId).toBe('root');
    expect(history.current().nodes.root.children).toEqual(['intro', 'arg', 'point', 'conc']);
    // Said once, by the thing that knows the branch: the pane cannot see where the node landed.
    expect(announce).toHaveBeenLastCalledWith(
      "Moved 'Point' out of this branch, after 'Argument one'."
    );
    // The view is still the branch, and the selection is a node that is in it.
    expect(focus.isOn()).toBe(true);
    expect(rows()).toEqual(['arg', 'evidence']);
    expect(selection.ids()).toEqual(['arg']);
  });
});

describe('a run of keys costs the map the same with a branch focused as without', () => {
  /**
   * Play the same view-independent edits, once on the whole map and once with a branch on screen.
   *
   * View-independent on purpose: each press acts on a node inside the branch either way, so the map
   * it leaves behind is the differential this is about. What the run proves is that narrowing the
   * view adds nothing to the map and nothing to the undo stack.
   *
   * @param {boolean} focused
   * @returns {{map: string, depth: number}}
   */
  function play(focused) {
    mount();
    if (focused) {
      focus.focusOn('arg');
    }
    item('point').focus();
    press(' ');
    press('F2');
    type('Rewritten');
    press('Enter', { ctrlKey: true });
    item('evidence').focus();
    press('ArrowUp', { altKey: true });
    press(' ');
    press('ArrowDown', { altKey: true });
    if (focused) {
      focus.leave();
    }
    const map = JSON.stringify(history.current());
    let depth = 0;
    while (history.canUndo()) {
      history.undo();
      depth += 1;
    }
    pane.destroy();
    focus.destroy();
    host.remove();
    return { map, depth };
  }

  it('leaves the same map, in the same number of undo steps', () => {
    const plain = play(false);
    const narrowed = play(true);

    expect(narrowed.map).toBe(plain.map);
    expect(narrowed.depth).toBe(plain.depth);
    expect(plain.depth).toBeGreaterThan(0);
  });
});

describe('an edit whose row is taken away', () => {
  it('discards a node it had only just made, and puts the student back where they asked', () => {
    mount();
    item('point').focus();
    press('Enter');
    expect(editor()).not.toBeNull();

    // A collapse from somewhere else — the canvas, the Details panel, an undo — hides the row being
    // typed into. The node has no name, so it goes; the student came from 'point', so that is where
    // they are put.
    history.apply('toggleCollapsed', { id: 'arg' });

    expect(editor()).toBeNull();
    expect(nameless()).toEqual([]);
    // 'point' went behind the fold too, so the branch that swallowed it is where they are put — the
    // one thing they can press to see their own row again.
    expect(selection.get()).toBe('arg');
    // Shown as well as said: the row the student was typing in is gone from the screen, and this is
    // the only thing that tells them the node went with it.
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
    expect(announce).not.toHaveBeenCalledWith('New node discarded');
  });
});

describe('an undo while an editor is open', () => {
  it('closes the editor and puts the student back when the node is taken away', () => {
    mount();
    item('intro').focus();
    press('Enter');
    expect(editor()).not.toBeNull();

    // The toolbar's Undo, pressed with the mouse: the shared handler prevents the mousedown default,
    // so the caret never leaves the field and the undo arrives with the editor still open.
    history.undo();

    expect(editor()).toBeNull();
    expect(nameless()).toEqual([]);
    expect(selection.get()).toBe('intro');
    expect(notified).toHaveBeenLastCalledWith('New node discarded');
  });

  it('takes the node with the typing the student undid', () => {
    mount();
    item('intro').focus();
    press('Enter');
    type('Hello');
    expect(history.current().nodes['new-1'].text).toBe('Hello');

    history.undo();

    // A node with no name never survives a keystroke, whoever wrote it.
    expect(nameless()).toEqual([]);
    expect(hasNodeNamed('new-1')).toBe(false);
    expect(editor()).toBeNull();
    expect(selection.get()).toBe('intro');
    // Nothing about the node is left on the stack: it cannot come back nameless through either key.
    expect(history.canRedo()).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('follows the map when an undo puts an older name back under the editor', () => {
    mount();
    item('intro').focus();
    press('F2');
    type('Opening');
    // Somebody else's step, so the edit can no longer be folded away on the way out.
    history.apply('setText', { id: 'conc', text: 'In closing' });

    history.undo();

    // The field shows what the map holds, rather than a name the map no longer has.
    expect(editor()).not.toBeNull();
    expect(editor().value).toBe('Opening');
    expect(history.current().nodes.intro.text).toBe('Opening');
  });

  it('leaves nothing for a redo to bring back nameless', () => {
    mount();
    item('intro').focus();
    press('Enter');
    type('Hello');
    history.undo();

    history.redo();

    expect(nameless()).toEqual([]);
    expect(rows()).toEqual(['root', 'intro', 'arg', 'point', 'evidence', 'conc']);
  });
});
