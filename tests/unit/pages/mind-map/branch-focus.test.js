/**
 * @jest-environment jsdom
 *
 * Focus mode: the seam, the breadcrumb, and the four ways a view could lie to a student.
 *
 * The history and the selection are real — what is being graded is that a VIEW never becomes an
 * edit, and a mock of the history would only prove the mock. The panes are not here at all: they see
 * focus mode through the history they are handed, so a fake subscriber is exactly what they are.
 */

import { createHistory } from '../../../../src/features/mindMap/core/history.js';
import { createMap, validateMap } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild, addLink } from '../../../../src/features/mindMap/core/map-ops.js';
import { createSelection } from '../../../../src/pages/mind-map/selection.js';
import { mountBranchFocus } from '../../../../src/pages/mind-map/branch-focus.js';

/**
 * Root "Essay"
 *   Introduction
 *   Body
 *     Argument 1
 *       Point
 *     Argument 2
 *   Conclusion
 *
 * @returns {Object}
 */
function sampleMap() {
  let map = createMap({ id: 'm1', title: 'Essay', rootId: 'root', rootText: 'Essay' });
  map = addChild(map, { parentId: 'root', node: { id: 'intro', text: 'Introduction' } });
  map = addChild(map, { parentId: 'root', node: { id: 'body', text: 'Body' } });
  map = addChild(map, { parentId: 'body', node: { id: 'a1', text: 'Argument 1' } });
  map = addChild(map, { parentId: 'a1', node: { id: 'point', text: 'Point' } });
  map = addChild(map, { parentId: 'body', node: { id: 'a2', text: 'Argument 2' } });
  map = addChild(map, { parentId: 'root', node: { id: 'conc', text: 'Conclusion' } });
  return map;
}

let host;
let history;
let selection;
let announce;
let notify;
let rescued;
let focus;
let drawn;

function mount(map = sampleMap(), initialId = 'a1') {
  host = document.createElement('div');
  document.body.appendChild(host);
  let clock = 0;
  history = createHistory(map, { now: () => (clock += 1000) });
  selection = createSelection(initialId, { history });
  announce = jest.fn();
  notify = jest.fn();
  rescued = [];
  drawn = [];
  focus = mountBranchFocus(host, {
    history,
    selection,
    announce,
    notify,
    rescueFocus: id => rescued.push(id),
  });
  // A pane: it draws whatever `current()` says, on every notification, exactly as the real ones do.
  focus.history.subscribe((map_, opName) => drawn.push({ map: map_, opName }));
  return focus;
}

afterEach(() => {
  focus?.destroy();
  host?.remove();
});

const nav = () => host.querySelector('nav');
const crumbs = () =>
  [...host.querySelectorAll('.assist-mm-crumb')].map(control => ({
    id: control.dataset.id,
    text: control.textContent,
    tag: control.tagName,
    current: control.getAttribute('aria-current'),
    folded: control.dataset.folded,
  }));

describe('the view the panes are handed', () => {
  it('is the whole map until a branch is focused on', () => {
    mount();

    expect(focus.isOn()).toBe(false);
    expect(focus.history.current()).toBe(history.current());
  });

  it('is the branch, re-rooted, once it is', () => {
    mount();
    focus.focusOn('body');

    const view = focus.history.current();
    expect(focus.isOn()).toBe(true);
    expect(focus.focused()).toBe('body');
    expect(view.rootId).toBe('body');
    expect(Object.keys(view.nodes).sort()).toEqual(['a1', 'a2', 'body', 'point']);
    expect(validateMap(view)).toEqual([]);
  });

  it('is the whole map again on the way out', () => {
    mount();
    focus.focusOn('body');
    focus.leave();

    expect(focus.isOn()).toBe(false);
    expect(focus.history.current()).toBe(history.current());
  });

  it('tells the panes to redraw on the way in and on the way out', () => {
    mount();
    focus.focusOn('body');
    focus.leave();

    expect(drawn.map(entry => entry.opName)).toEqual(['focus', 'focus']);
    expect(drawn[0].map.rootId).toBe('body');
    expect(drawn[1].map.rootId).toBe('root');
  });

  it('draws no cross-link with one end outside the branch', () => {
    let map = addLink(sampleMap(), { id: 'inside', from: 'a1', to: 'a2' });
    map = addLink(map, { id: 'crossing', from: 'a1', to: 'intro' });
    mount(map);

    focus.focusOn('body');

    expect(focus.history.current().links.map(link => link.id)).toEqual(['inside']);
  });
});

describe('every write still lands on the real map', () => {
  it('applies through to the real history, and the undo stack is the same length', () => {
    mount();
    focus.focusOn('body');

    focus.history.apply('setText', { id: 'a2', text: 'Argument two' });

    expect(history.current().nodes.a2.text).toBe('Argument two');
    expect(history.canUndo()).toBe(true);
    focus.history.undo();
    expect(history.current().nodes.a2.text).toBe('Argument 2');
  });

  it('costs the history nothing at all to enter and leave', () => {
    mount();
    const before = history.current();

    focus.focusOn('body');
    focus.focusOn('a1');
    focus.leave();

    expect(history.current()).toBe(before);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('hands an op that changed nothing the very same view back, so a pane can tell', () => {
    mount();
    focus.focusOn('body');
    const before = focus.history.current();

    // `outdent` on a node already at the top level of the view changes nothing.
    const after = focus.history.apply('setText', { id: 'a2', text: 'Argument 2' });

    expect(after).toBe(before);
  });

  it('passes a mark and a squash through to the real history', () => {
    mount();
    focus.focusOn('body');
    const mark = focus.history.mark();

    focus.history.apply('addChild', { parentId: 'a2', node: { id: 'fresh', text: '' } }, { mark });
    focus.history.apply('setText', { id: 'fresh', text: 'Fresh' }, { mark });

    expect(focus.history.squashSince(mark, { name: 'addNode' })).toBe(true);
    focus.history.undo();
    expect(history.current().nodes.fresh).toBeUndefined();
  });
});

describe('a change the student cannot see', () => {
  it('keeps the view they have, so nothing redraws', () => {
    mount();
    focus.focusOn('body');
    const shown = focus.history.current();
    drawn.length = 0;

    history.apply('setText', { id: 'intro', text: 'Opening' });

    expect(focus.history.current()).toBe(shown);
    expect(drawn).toEqual([]);
  });

  it('redraws when the change was inside the branch', () => {
    mount();
    focus.focusOn('body');
    drawn.length = 0;

    history.apply('setText', { id: 'point', text: 'A point' });

    expect(drawn).toHaveLength(1);
    expect(focus.history.current().nodes.point.text).toBe('A point');
  });
});

describe('the branch that stops existing', () => {
  it('leaves focus mode and says so', () => {
    mount();
    focus.focusOn('a1');

    history.apply('removeNode', { id: 'a1' });

    expect(focus.isOn()).toBe(false);
    expect(focus.history.current()).toBe(history.current());
    expect(notify).toHaveBeenCalledWith(
      "'Argument 1' is no longer here, so this is the whole map again."
    );
    expect(nav().hidden).toBe(true);
  });

  it('leaves focus mode when an undo takes the branch away', () => {
    mount();
    history.apply('addChild', { parentId: 'body', node: { id: 'a3', text: 'Argument 3' } });
    focus.focusOn('a3');

    history.undo();

    expect(focus.isOn()).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      "'Argument 3' is no longer here, so this is the whole map again."
    );
  });

  it('stays focused on a branch that only moved, and the trail says where it is now', () => {
    mount();
    focus.focusOn('a1');

    history.apply('moveNode', { id: 'a1', newParentId: 'conc', index: 0 });

    expect(focus.isOn()).toBe(true);
    expect(focus.focused()).toBe('a1');
    expect(crumbs().map(crumb => crumb.text)).toEqual(['Essay', 'Conclusion', 'Argument 1']);
  });
});

describe('a node that leaves the branch', () => {
  it('says where it went when an outdent puts it beside the branch', () => {
    mount();
    focus.focusOn('a1');

    // 'Point' is the first level of the focused branch: outdenting it takes it out of the view.
    focus.history.apply('outdent', { id: 'point' });

    expect(history.current().nodes.point.parentId).toBe('body');
    expect(Object.keys(focus.history.current().nodes)).toEqual(['a1']);
    expect(notify).toHaveBeenCalledWith("Moved 'Point' out of this branch, after 'Argument 1'.");
  });

  it('names the new parent when the node did not land beside the branch', () => {
    mount();
    focus.focusOn('a1');

    focus.history.apply('moveNode', { id: 'point', newParentId: 'conc', index: 0 });

    expect(notify).toHaveBeenCalledWith("Moved 'Point' out of this branch, under 'Conclusion'.");
  });

  it('counts the tops of what went, never the children carried with them', () => {
    let map = sampleMap();
    map = addChild(map, { parentId: 'point', node: { id: 'sub', text: 'Sub' } });
    mount(map);
    focus.focusOn('a1');

    focus.history.apply('outdent', { id: 'point' });

    expect(notify).toHaveBeenCalledWith("Moved 'Point' out of this branch, after 'Argument 1'.");
  });

  it('takes it out of the selection, because no pane is drawing it', () => {
    mount();
    focus.focusOn('a1');
    selection.set('point', { source: 'outline' });

    focus.history.apply('outdent', { id: 'point' });

    expect(selection.ids()).toEqual(['a1']);
    expect(selection.get()).toBe('a1');
  });

  it('keeps the selected nodes that are still in the branch', () => {
    let map = sampleMap();
    map = addChild(map, { parentId: 'a1', node: { id: 'other', text: 'Other' } });
    mount(map);
    focus.focusOn('a1');
    selection.selectAll(['point', 'other'], { source: 'outline' });

    focus.history.apply('outdent', { id: 'point' });

    expect(selection.ids()).toEqual(['other']);
  });
});

describe('the selection on the way in', () => {
  it('drops whatever was selected outside the branch', () => {
    mount();
    selection.selectAll(['a1', 'intro'], { source: 'outline' });

    focus.focusOn('a1');

    expect(selection.ids()).toEqual(['a1']);
  });

  it('says how much of the set it kept, in the same breath as the news', () => {
    mount();
    selection.selectAll(['a1', 'point', 'intro', 'conc'], { source: 'outline' });

    focus.focusOn('a1');

    expect(selection.ids()).toEqual(['a1', 'point']);
    expect(notify).toHaveBeenCalledWith(
      "Focused on 'Argument 1': 2 nodes. Press Escape to see the whole map. " +
        '4 nodes were selected. 2 are in this branch.'
    );
  });

  it('says nothing about a set that was already inside the branch', () => {
    mount();
    selection.selectAll(['a1', 'point'], { source: 'outline' });

    focus.focusOn('a1');

    expect(notify).toHaveBeenCalledWith(
      "Focused on 'Argument 1': 2 nodes. Press Escape to see the whole map."
    );
  });
});

describe('the toggle', () => {
  it('enters on the primary and leaves again', () => {
    mount();
    selection.set('body', { source: 'outline' });

    focus.toggle();
    expect(focus.focused()).toBe('body');

    focus.toggle();
    expect(focus.isOn()).toBe(false);
  });

  it('says why it cannot act, and does nothing', () => {
    mount(sampleMap(), null);

    expect(focus.reason()).toBe('Select a node first.');
    focus.toggle();
    expect(focus.isOn()).toBe(false);

    selection.set('root', { source: 'outline' });
    expect(focus.reason()).toBe(
      'Focusing the centre would show the whole map, which is what you are looking at.'
    );
    focus.toggle();
    expect(focus.isOn()).toBe(false);
  });

  it('can always leave', () => {
    mount();
    focus.focusOn('a1');
    selection.set('root', { source: 'program' });

    expect(focus.reason()).toBe('');
  });

  /**
   * "Focus on this branch" with four nodes marked is ambiguous unless it says which one it took. It
   * takes the primary - the node the student is standing on, not the first in the list - and the
   * toast names it, in the same breath as what the narrowing did to the rest of the set.
   */
  it('enters on the primary of a set, names it, and says what became of the rest', () => {
    mount();
    selection.selectAll(['a2', 'a1'], { source: 'outline' });
    expect(selection.get()).toBe('a1');

    focus.toggle();

    expect(focus.focused()).toBe('a1');
    expect(notify).toHaveBeenLastCalledWith(
      "Focused on 'Argument 1': 2 nodes. Press Escape to see the whole map. " +
        '2 nodes were selected. 1 is in this branch.'
    );
  });
});

describe('what is said', () => {
  it('names the branch, counts it and says the way out, on screen and aloud', () => {
    mount();

    focus.focusOn('a1');

    expect(notify).toHaveBeenCalledWith(
      "Focused on 'Argument 1': 2 nodes. Press Escape to see the whole map."
    );
  });

  it('counts the nodes a fold is hiding, because they are in the branch', () => {
    const map = sampleMap();
    mount(map);
    history.apply('toggleCollapsed', { id: 'a1' });

    focus.focusOn('body');

    expect(notify).toHaveBeenCalledWith(
      "Focused on 'Body': 4 nodes. Press Escape to see the whole map."
    );
  });

  it('says the whole map is back, in the live region alone', () => {
    mount();
    focus.focusOn('a1');
    notify.mockClear();

    focus.leave();

    expect(announce).toHaveBeenCalledWith('Showing the whole map.');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('the breadcrumb', () => {
  it('is away until there is a branch to describe', () => {
    mount();

    expect(nav().hidden).toBe(true);
    expect(nav().getAttribute('aria-label')).toBe('Focused branch');
  });

  it('walks from the centre to the focused node, the last one not a button', () => {
    mount();

    focus.focusOn('point');

    expect(crumbs()).toEqual([
      { id: 'root', text: 'Essay', tag: 'BUTTON', current: null, folded: 'false' },
      { id: 'body', text: 'Body', tag: 'BUTTON', current: null, folded: 'false' },
      { id: 'a1', text: 'Argument 1', tag: 'BUTTON', current: null, folded: 'false' },
      { id: 'point', text: 'Point', tag: 'SPAN', current: 'location', folded: 'false' },
    ]);
  });

  it('re-focuses on an ancestor when its button is pressed', () => {
    mount();
    focus.focusOn('point');

    press(host.querySelector('.assist-mm-crumb[data-id="body"]'));

    expect(focus.focused()).toBe('body');
    expect(crumbs().map(crumb => crumb.id)).toEqual(['root', 'body']);
    expect(rescued).toContain('body');
  });

  it('leaves focus mode when the centre is pressed', () => {
    mount();
    focus.focusOn('point');

    press(host.querySelector('.assist-mm-crumb[data-id="root"]'));

    expect(focus.isOn()).toBe(false);
    expect(nav().hidden).toBe(true);
  });

  it('works from the keyboard, not only from a pointer', () => {
    mount();
    focus.focusOn('point');
    const button = host.querySelector('.assist-mm-crumb[data-id="body"]');

    button.focus();
    button.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    expect(focus.focused()).toBe('body');
  });

  it('narrows the middle of a long trail and keeps every step a real button', () => {
    let map = sampleMap();
    map = addChild(map, { parentId: 'point', node: { id: 'd5', text: 'Fifth' } });
    map = addChild(map, { parentId: 'd5', node: { id: 'd6', text: 'Sixth' } });
    mount(map);

    focus.focusOn('d6');

    expect(crumbs().map(crumb => crumb.folded)).toEqual([
      'false',
      'true',
      'true',
      'true',
      'false',
      'false',
    ]);
    // Narrowed on screen only: the words are still there for a screen reader to read.
    expect(crumbs().map(crumb => crumb.text)).toEqual([
      'Essay',
      'Body',
      'Argument 1',
      'Point',
      'Fifth',
      'Sixth',
    ]);
    expect(crumbs().filter(crumb => crumb.tag === 'BUTTON')).toHaveLength(5);
  });

  it('keeps a step that is still in the trail, so the keyboard is not dropped', () => {
    mount();
    focus.focusOn('point');
    const button = host.querySelector('.assist-mm-crumb[data-id="body"]');

    history.apply('setText', { id: 'point', text: 'A point' });

    expect(host.querySelector('.assist-mm-crumb[data-id="body"]')).toBe(button);
    expect(crumbs().map(crumb => crumb.text)).toEqual(['Essay', 'Body', 'Argument 1', 'A point']);
  });

  it('follows a rename of an ancestor', () => {
    mount();
    focus.focusOn('point');

    history.apply('setText', { id: 'body', text: 'The body' });

    expect(crumbs().map(crumb => crumb.text)).toEqual(['Essay', 'The body', 'Argument 1', 'Point']);
  });

  it('names a node that has none yet rather than quoting nothing', () => {
    const map = addChild(sampleMap(), { parentId: 'body', node: { id: 'blank', text: '' } });
    mount(map);

    focus.focusOn('blank');

    expect(crumbs().map(crumb => crumb.text)).toEqual(['Essay', 'Body', '(untitled)']);
  });
});

describe('teardown', () => {
  it('stops watching the map and takes the trail away', () => {
    mount();
    focus.focusOn('body');

    focus.destroy();
    history.apply('setText', { id: 'a2', text: 'Changed' });

    expect(host.querySelector('nav')).toBeNull();
  });
});

/** Press a control the way the shared event helper listens for it. */
function press(element) {
  element.dispatchEvent(
    new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
  );
}

describe('a few hundred edits cost the map the same with focus mode as without', () => {
  /** A small seeded generator, so a failure names a run that can be played again. */
  const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /**
   * The edits this run may make, and what makes them view-INDEPENDENT.
   *
   * Each one names the node it acts on by id and goes through the REAL history, so its outcome cannot
   * depend on what is on screen — unlike a keystroke, whose meaning does (Delete on the top of a
   * focused branch is refused; Shift+Tab there moves a node OUT of the view). That is the whole point
   * of the differential: with the view out of the sum, the map and the stack must come out identical
   * whether or not the student narrowed their view while making them.
   */
  const EDITS = [
    (history, id, at) => history.apply('setText', { id, text: `Named ${at}` }),
    (history, id) => history.apply('setDone', { id, done: true }),
    (history, id) => history.apply('setDone', { id, done: false }),
    (history, id, at) => history.apply('setColour', { id, colour: at % 6 }),
    (history, id, at) => history.apply('setNotes', { id, notes: `Note ${at}` }),
    (history, id) => history.apply('toggleCollapsed', { id }),
    (history, id, at) =>
      history.apply('addChild', { parentId: id, node: { id: `made-${at}`, text: `Made ${at}` } }),
    (history, id) => history.apply('moveUp', { id }),
    (history, id) => history.apply('moveDown', { id }),
    (history, id) =>
      history.applyBatch([{ op: 'setSymbol', args: { id, symbol: '★' } }], { name: 'setSymbol' }),
  ];

  /**
   * Play the same seeded run of edits, with or without narrowing the view part way through.
   *
   * @param {number} seed
   * @param {boolean} narrow - true to enter and leave focus mode as the run goes.
   * @returns {{map: string, depth: number, entries: number}}
   */
  function play(seed, narrow) {
    mount();
    const next = seeded(seed);
    let entered = 0;
    for (let at = 0; at < 300; at += 1) {
      const map = history.current();
      const ids = Object.keys(map.nodes);
      const id = ids[Math.floor(next() * ids.length)];
      const edit = EDITS[Math.floor(next() * EDITS.length)];
      try {
        edit(history, id, at);
      } catch {
        // An op can refuse — moving the root, a node a previous edit removed. A refusal is part of
        // the run, and it is the same refusal in both passes because the map is the same.
      }
      if (narrow && at % 7 === 0) {
        // A branch that is not the centre, chosen the same way in every run.
        const branch = Object.keys(history.current().nodes).find(
          nodeId => nodeId !== history.current().rootId
        );
        if (focus.isOn()) {
          focus.leave();
        } else if (branch) {
          focus.focusOn(branch);
          entered += focus.isOn() ? 1 : 0;
        }
      }
    }
    if (focus.isOn()) {
      focus.leave();
    }
    const map = JSON.stringify(history.current());
    let depth = 0;
    while (history.canUndo()) {
      history.undo();
      depth += 1;
    }
    focus.destroy();
    focus = null;
    host.remove();
    host = null;
    return { map, depth, entered };
  }

  for (const seed of [7, 8, 9]) {
    it(`leaves the same map in the same number of steps (run ${seed})`, () => {
      const plain = play(seed, false);
      const narrowed = play(seed, true);

      expect(narrowed.map).toBe(plain.map);
      expect(narrowed.depth).toBe(plain.depth);
      expect(plain.depth).toBeGreaterThan(100);
      // The run really did narrow the view, over and over: without this the comparison above would
      // pass by comparing two runs that never entered focus mode at all.
      expect(narrowed.entered).toBeGreaterThan(10);
      expect(plain.entered).toBe(0);
    });
  }
});
