/**
 * @jest-environment jsdom
 *
 * The selection store is the one thing the outline, the canvas and the inspector all hold, so its
 * contract is small and its edges matter: who asked for a change reaches every listener, and a
 * change to the node already selected must not fire, or the two panes would chase each other.
 *
 * It holds an ordered set with a primary — the node the inspector edits and read-aloud starts from —
 * and an anchor, where a Shift range began. `get()` is the primary and `set()` replaces the whole
 * selection, so every caller written for one node keeps working unchanged.
 */

import { createSelection } from '../../../../src/pages/mind-map/selection.js';
import { createMap, createNode } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild, removeNode } from '../../../../src/features/mindMap/core/map-ops.js';
import { createHistory } from '../../../../src/features/mindMap/core/history.js';

/**
 * Root
 *   a → a1, a2
 *   b
 * @returns {Object} the map under test
 */
function sampleMap() {
  let map = createMap({ id: 'm1', title: 'Map', rootId: 'root', rootText: 'Root' });
  map = addChild(map, { parentId: 'root', node: createNode({ id: 'a', text: 'A' }) });
  map = addChild(map, { parentId: 'a', node: createNode({ id: 'a1', text: 'A one' }) });
  map = addChild(map, { parentId: 'a', node: createNode({ id: 'a2', text: 'A two' }) });
  map = addChild(map, { parentId: 'root', node: createNode({ id: 'b', text: 'B' }) });
  return map;
}

const ORDER = ['root', 'a', 'a1', 'a2', 'b'];

describe('createSelection', () => {
  it('starts empty unless given a node', () => {
    expect(createSelection().get()).toBeNull();
    expect(createSelection().ids()).toEqual([]);
    expect(createSelection('n1').get()).toBe('n1');
    expect(createSelection('n1').ids()).toEqual(['n1']);
  });

  it('reports the new node and who set it', () => {
    const selection = createSelection();
    const heard = [];
    selection.subscribe((id, meta) => heard.push([id, meta.source]));

    selection.set('n1', { source: 'outline' });
    selection.set('n2', { source: 'canvas' });

    expect(heard).toEqual([
      ['n1', 'outline'],
      ['n2', 'canvas']
    ]);
    expect(selection.get()).toBe('n2');
  });

  it('calls a change with no stated source "program"', () => {
    const selection = createSelection();
    const heard = [];
    selection.subscribe((id, meta) => heard.push(meta.source));

    selection.set('n1');

    expect(heard).toEqual(['program']);
  });

  it('says nothing when the node selected is the node already selected', () => {
    const selection = createSelection('n1');
    const listener = jest.fn();
    selection.subscribe(listener);

    selection.set('n1', { source: 'canvas' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('clears to null and announces that too', () => {
    const selection = createSelection('n1');
    const heard = [];
    selection.subscribe(id => heard.push(id));

    selection.set(null, { source: 'program' });

    expect(heard).toEqual([null]);
    expect(selection.get()).toBeNull();
    expect(selection.ids()).toEqual([]);
  });

  it('stops calling a listener that unsubscribed', () => {
    const selection = createSelection();
    const listener = jest.fn();
    const unsubscribe = selection.subscribe(listener);

    selection.set('n1');
    unsubscribe();
    selection.set('n2');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('survives a listener unsubscribing from inside a notification', () => {
    const selection = createSelection();
    const second = jest.fn();
    const unsubscribeFirst = selection.subscribe(() => unsubscribeFirst());
    selection.subscribe(second);

    expect(() => selection.set('n1')).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('hands back a copy of the set, so a caller cannot write into it', () => {
    const selection = createSelection('n1');
    selection.ids().push('n2');
    expect(selection.ids()).toEqual(['n1']);
  });
});

describe('the set', () => {
  it('collapses to one node when set() replaces it', () => {
    const selection = createSelection('a');
    selection.toggle('b');
    expect(selection.ids()).toEqual(['a', 'b']);

    selection.set('a', { source: 'canvas' });

    expect(selection.ids()).toEqual(['a']);
    expect(selection.get()).toBe('a');
  });

  it('tells subscribers once when set() collapses a set onto its own primary', () => {
    const selection = createSelection('a');
    selection.toggle('b');
    const listener = jest.fn();
    selection.subscribe(listener);

    selection.set('b');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(selection.ids()).toEqual(['b']);
  });

  it('adds with toggle, and the added node becomes the primary', () => {
    const selection = createSelection('a');
    const heard = [];
    selection.subscribe((id, meta) => heard.push([id, meta.source]));

    selection.toggle('b', { source: 'outline' });

    expect(selection.ids()).toEqual(['a', 'b']);
    expect(selection.get()).toBe('b');
    expect(selection.has('a')).toBe(true);
    expect(heard).toEqual([['b', 'outline']]);
  });

  it('removes with toggle, and hands the primary to what is left', () => {
    const selection = createSelection('a');
    selection.toggle('b');
    selection.toggle('a');

    expect(selection.ids()).toEqual(['b']);
    expect(selection.get()).toBe('b');
  });

  it('refuses to toggle away the last node, so the set is never empty', () => {
    const selection = createSelection('a');
    const listener = jest.fn();
    selection.subscribe(listener);

    selection.toggle('a');

    expect(selection.ids()).toEqual(['a']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('extends from the anchor through the order it is given', () => {
    const selection = createSelection('a');

    selection.extendTo('a2', ORDER, { source: 'outline' });

    expect(selection.ids()).toEqual(['a', 'a1', 'a2']);
    expect(selection.get()).toBe('a2');
  });

  it('extends backwards, and re-extending shrinks the range rather than growing it', () => {
    const selection = createSelection('a2');

    selection.extendTo('a', ORDER);
    expect(selection.ids()).toEqual(['a', 'a1', 'a2']);

    selection.extendTo('a1', ORDER);
    expect(selection.ids()).toEqual(['a1', 'a2']);
    expect(selection.get()).toBe('a1');
  });

  it('keeps the anchor where the range started, even after a toggle moved the primary', () => {
    const selection = createSelection('root');
    selection.extendTo('a1', ORDER);
    selection.extendTo('b', ORDER);

    expect(selection.ids()).toEqual(ORDER);
  });

  it('falls back to selecting the one node when the order does not hold it', () => {
    const selection = createSelection('a');
    selection.extendTo('gone', ORDER);
    expect(selection.ids()).toEqual(['gone']);
  });

  it('selects a whole list, keeping the primary when it is still in it', () => {
    const selection = createSelection('a1');

    selection.selectAll(['a', 'a1', 'a2'], { source: 'outline' });

    expect(selection.ids()).toEqual(['a', 'a1', 'a2']);
    expect(selection.get()).toBe('a1');
  });

  it('takes the first of the list as the primary when the old one is not in it', () => {
    const selection = createSelection('b');
    selection.selectAll(['a', 'a1']);
    expect(selection.get()).toBe('a');
  });

  it('says nothing when selectAll asks for the set that is already there', () => {
    const selection = createSelection('a');
    selection.selectAll(['a', 'a1']);
    const listener = jest.fn();
    selection.subscribe(listener);

    selection.selectAll(['a', 'a1']);

    expect(listener).not.toHaveBeenCalled();
  });

  it('drops a repeat rather than holding a node twice', () => {
    const selection = createSelection();
    selection.selectAll(['a', 'a', 'b']);
    expect(selection.ids()).toEqual(['a', 'b']);
  });

  it('collapses to the primary, and says nothing when there is nothing to collapse', () => {
    const selection = createSelection('a');
    selection.extendTo('a2', ORDER);
    const heard = [];
    selection.subscribe(id => heard.push(id));

    selection.clearToPrimary({ source: 'outline' });
    expect(selection.ids()).toEqual(['a2']);

    selection.clearToPrimary();
    expect(heard).toEqual(['a2']);
  });
});

describe('a map that changed under the selection', () => {
  const wire = (initial = 'a1') => {
    const history = createHistory(sampleMap());
    const selection = createSelection(initial, { history });
    return { history, selection };
  };

  it('drops an id the map no longer holds', () => {
    const { history, selection } = wire('a1');
    selection.toggle('a2');
    selection.toggle('b');

    history.apply('removeNode', { id: 'a2' });

    expect(selection.ids()).toEqual(['a1', 'b']);
  });

  it('never leaves a dangling id even when the primary is what went', () => {
    const { history, selection } = wire('a1');
    selection.toggle('b');

    history.apply('removeNode', { id: 'b' });

    expect(selection.ids()).toEqual(['a1']);
    expect(selection.get()).toBe('a1');
  });

  it('falls back to the nearest surviving relative when the whole selection goes', () => {
    const { history, selection } = wire('a1');

    history.apply('removeNode', { id: 'a1' });

    expect(selection.ids()).toEqual(['a']);
    expect(selection.get()).toBe('a');
  });

  it('keeps a node the student did select over an ancestor they did not', () => {
    const { history, selection } = wire('a1');
    selection.toggle('a2');

    history.apply('removeNode', { id: 'a2' });

    expect(selection.ids()).toEqual(['a1']);
    expect(selection.get()).toBe('a1');
  });

  it('climbs past a whole branch that went, to the centre when nothing nearer is left', () => {
    const { history, selection } = wire('a1');
    selection.toggle('a2');

    // Removing 'a' takes both selected nodes and their parent with it.
    history.apply('removeNode', { id: 'a' });

    expect(selection.ids()).toEqual(['root']);
  });

  it('falls back to the centre when nothing nearer survives', () => {
    const history = createHistory(sampleMap());
    const selection = createSelection('a1', { history });

    // A whole new map arrives — an import — with nothing of the old one in it.
    history.apply(() => createMap({ id: 'm2', title: 'Other', rootId: 'other', rootText: 'O' }), {});

    expect(selection.ids()).toEqual(['other']);
  });

  it('tells subscribers once, as a change nobody asked for', () => {
    const { history, selection } = wire('a1');
    const heard = [];
    selection.subscribe((id, meta) => heard.push([id, meta.source]));

    history.apply('removeNode', { id: 'a1' });

    expect(heard).toEqual([['a', 'program']]);
  });

  it('leaves an empty selection empty rather than inventing one', () => {
    const history = createHistory(sampleMap());
    const selection = createSelection(null, { history });

    history.apply('removeNode', { id: 'b' });

    expect(selection.ids()).toEqual([]);
    expect(selection.get()).toBeNull();
  });

  it('says nothing when every selected node survived', () => {
    const { history, selection } = wire('a1');
    const listener = jest.fn();
    selection.subscribe(listener);

    history.apply('setText', { id: 'b', text: 'Bee' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('puts the set back when the delete is undone', () => {
    const { history, selection } = wire('a1');
    selection.toggle('a2');
    history.apply('removeNode', { id: 'a2' });
    expect(selection.ids()).toEqual(['a1']);

    history.undo();

    // The node is back on the map; it is not selected again, because nobody selected it.
    expect(selection.ids()).toEqual(['a1']);
    expect(selection.has('a2')).toBe(false);
  });

  it('prunes against a map handed to it directly, for a caller with no history', () => {
    const selection = createSelection('a1');
    selection.toggle('a2');

    selection.reconcile(removeNode(sampleMap(), { id: 'a1' }));

    expect(selection.ids()).toEqual(['a2']);
  });

  it('stops pruning once the store is destroyed', () => {
    const { history, selection } = wire('a1');
    selection.destroy();

    history.apply('removeNode', { id: 'a1' });

    expect(selection.ids()).toEqual(['a1']);
  });
});

describe('a listener that throws', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not stop the next listener, and is reported once', () => {
    const selection = createSelection('a1');
    const broken = jest.fn(() => {
      throw new Error('inspector blew up');
    });
    const other = jest.fn();
    selection.subscribe(broken);
    selection.subscribe(other);

    expect(() => selection.set('a2')).not.toThrow();

    expect(broken).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledWith('a2', expect.objectContaining({ source: 'program' }));
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/selection/i);
  });
});
