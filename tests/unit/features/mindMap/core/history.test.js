import { createHistory } from '../../../../../src/features/mindMap/core/history.js';
import { setText } from '../../../../../src/features/mindMap/core/map-ops.js';
import { sampleMap } from './fixtures.js';

/** A clock the test drives, so coalescing is tested by time rather than by sleeping. */
function clock(start = 1000) {
  let time = start;
  return { now: () => time, advance: ms => { time += ms; } };
}

describe('createHistory', () => {
  it('starts on the given map with nothing to undo or redo', () => {
    const map = sampleMap();
    const history = createHistory(map, { now: () => 0 });
    expect(history.current()).toBe(map);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('applies a named op and returns the new map', () => {
    const history = createHistory(sampleMap(), { now: () => 0 });
    const next = history.apply('setText', { id: 'n3', text: 'Edited' });
    expect(next.nodes.n3.text).toBe('Edited');
    expect(history.current()).toBe(next);
    expect(history.canUndo()).toBe(true);
  });

  it('applies an op function as well as an op name', () => {
    const history = createHistory(sampleMap(), { now: () => 0 });
    history.apply(setText, { id: 'n3', text: 'By function' });
    expect(history.current().nodes.n3.text).toBe('By function');
  });

  it('rejects an op name it does not know', () => {
    const history = createHistory(sampleMap(), { now: () => 0 });
    expect(() => history.apply('destroyEverything', {})).toThrow(/destroyEverything/);
  });

  it('undoes and redoes in order', () => {
    const map = sampleMap();
    const time = clock();
    const history = createHistory(map, { now: time.now });
    history.apply('setText', { id: 'n3', text: 'One' });
    time.advance(2000);
    history.apply('setText', { id: 'n4', text: 'Two' });

    expect(history.undo().nodes.n4.text).toBe('Alpha two');
    expect(history.current().nodes.n3.text).toBe('One');
    expect(history.undo()).toBe(map);
    expect(history.canUndo()).toBe(false);
    expect(history.redo().nodes.n3.text).toBe('One');
    expect(history.redo().nodes.n4.text).toBe('Two');
    expect(history.canRedo()).toBe(false);
  });

  it('drops the redo branch once a new op is applied', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    history.apply('setText', { id: 'n3', text: 'One' });
    history.undo();
    time.advance(2000);
    history.apply('setText', { id: 'n4', text: 'Other' });
    expect(history.canRedo()).toBe(false);
  });

  it('coalesces consecutive setText on the same node inside 800 ms', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    history.apply('setText', { id: 'n3', text: 'A' });
    time.advance(100);
    history.apply('setText', { id: 'n3', text: 'Ab' });
    time.advance(700);
    history.apply('setText', { id: 'n3', text: 'Abc' });

    expect(history.current().nodes.n3.text).toBe('Abc');
    history.undo();
    expect(history.current().nodes.n3.text).toBe('Alpha one');
    expect(history.canUndo()).toBe(false);
  });

  it('drops the redo tail when a coalescing edit follows an undo', () => {
    // Undo, then carry on typing into the same node. The edit coalesces into the entry the undo
    // landed on, so the future it was heading for no longer exists — offering redo there would
    // hand the student a map that was never on the way here.
    const history = createHistory(sampleMap(), { now: () => 1000 });
    history.apply('setText', { id: 'n3', text: 'A' });
    history.apply('setText', { id: 'n4', text: 'B' });
    history.undo();

    history.apply('setText', { id: 'n3', text: 'Ax' });

    expect(history.current().nodes.n3.text).toBe('Ax');
    expect(history.current().nodes.n4.text).toBe('Alpha two');
    expect(history.canRedo()).toBe(false);
  });

  it('starts a new entry once the pause passes 800 ms', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    history.apply('setText', { id: 'n3', text: 'A' });
    time.advance(801);
    history.apply('setText', { id: 'n3', text: 'Ab' });
    history.undo();
    expect(history.current().nodes.n3.text).toBe('A');
  });

  it('does not coalesce setText across different nodes', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    history.apply('setText', { id: 'n3', text: 'A' });
    time.advance(10);
    history.apply('setText', { id: 'n4', text: 'B' });
    history.undo();
    expect(history.current().nodes.n4.text).toBe('Alpha two');
    expect(history.current().nodes.n3.text).toBe('A');
  });

  it('does not coalesce ops that are not setText', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    history.apply('setNotes', { id: 'n3', notes: 'A' });
    time.advance(10);
    history.apply('setNotes', { id: 'n3', notes: 'Ab' });
    history.undo();
    expect(history.current().nodes.n3.notes).toBe('A');
  });

  it('keeps at most 200 entries and forgets the oldest', () => {
    const time = clock();
    const history = createHistory(sampleMap(), { now: time.now });
    for (let i = 0; i < 250; i += 1) {
      time.advance(1000);
      history.apply('setText', { id: 'n3', text: `Edit ${i}` });
    }
    let undone = 0;
    while (history.canUndo()) {
      history.undo();
      undone += 1;
      if (undone > 400) {
        throw new Error('history never ran out of undo steps');
      }
    }
    expect(undone).toBe(200);
    expect(history.current().nodes.n3.text).toBe('Edit 49');
  });

  it('records no entry when an op changes nothing', () => {
    const map = sampleMap();
    const history = createHistory(map, { now: () => 0 });
    const same = history.apply('moveUp', { id: 'n2' });
    expect(same).toBe(map);
    expect(history.canUndo()).toBe(false);
  });

  it('notifies subscribers with the current map and the op name', () => {
    const time = clock();
    const listener = jest.fn();
    const history = createHistory(sampleMap(), { now: time.now });
    const unsubscribe = history.subscribe(listener);

    const next = history.apply('setText', { id: 'n3', text: 'Seen' });
    expect(listener).toHaveBeenCalledWith(next, 'setText');

    history.undo();
    expect(listener).toHaveBeenLastCalledWith(history.current(), 'undo');
    history.redo();
    expect(listener).toHaveBeenLastCalledWith(history.current(), 'redo');

    unsubscribe();
    time.advance(2000);
    history.apply('setText', { id: 'n3', text: 'Unseen' });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not notify on an undo or redo that cannot happen', () => {
    const listener = jest.fn();
    const history = createHistory(sampleMap(), { now: () => 0 });
    history.subscribe(listener);
    history.undo();
    history.redo();
    expect(listener).not.toHaveBeenCalled();
  });

  describe('applyBatch', () => {
    it('records several ops as a single undo step', () => {
      const map = sampleMap();
      const history = createHistory(map, { now: () => 0 });

      const next = history.applyBatch(
        [
          { op: 'addChild', args: { parentId: 'n1', node: { id: 'g1', text: 'Generated one' } } },
          { op: 'addChild', args: { parentId: 'g1', node: { id: 'g2', text: 'Generated two' } } },
          { op: 'addChild', args: { parentId: 'g1', node: { id: 'g3', text: 'Generated three' } } }
        ],
        { name: 'generate' }
      );

      expect(Object.keys(next.nodes)).toEqual(expect.arrayContaining(['g1', 'g2', 'g3']));
      expect(history.current()).toBe(next);

      history.undo();
      expect(history.current()).toBe(map);
      expect(history.canUndo()).toBe(false);
    });

    it('tells subscribers once, under the name it was given', () => {
      const listener = jest.fn();
      const history = createHistory(sampleMap(), { now: () => 0 });
      history.subscribe(listener);

      history.applyBatch(
        [
          { op: 'setText', args: { id: 'n3', text: 'One' } },
          { op: 'setText', args: { id: 'n4', text: 'Two' } }
        ],
        { name: 'generate' }
      );

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(history.current(), 'generate');
    });

    it('leaves the stack alone when a step throws, so half a batch never lands', () => {
      const map = sampleMap();
      const history = createHistory(map, { now: () => 0 });

      expect(() =>
        history.applyBatch([
          { op: 'setText', args: { id: 'n3', text: 'Landed' } },
          { op: 'setText', args: { id: 'ghost', text: 'Never' } }
        ])
      ).toThrow(/ghost/);

      expect(history.current()).toBe(map);
      expect(history.canUndo()).toBe(false);
    });

    it('costs no undo step when every op changed nothing', () => {
      const map = sampleMap();
      const history = createHistory(map, { now: () => 0 });
      const next = history.applyBatch([{ op: 'setText', args: { id: 'n3', text: map.nodes.n3.text } }]);
      expect(next).toBe(map);
      expect(history.canUndo()).toBe(false);
    });

    it('rejects a batch that is not a list of steps', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      expect(() => history.applyBatch('nonsense')).toThrow(/list of steps/);
    });
  });

  /*
   * An edit that is abandoned (a new node the student never named) has to leave the stack as
   * though it had never been started: walking back with `undo` leaves the abandoned work one
   * Ctrl+Y away, and a removal on top of it leaves it one Ctrl+Z away.
   */
  describe('mark and rewindTo', () => {
    it('goes back to the marked entry and forgets everything after it', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now });
      history.apply('setText', { id: 'n3', text: 'Kept' });
      const kept = history.current();
      const mark = history.mark();
      time.advance(2000);
      history.apply('addChild', { parentId: 'n1', node: { id: 'new', text: '' } });
      history.apply('setText', { id: 'new', text: 'x' });

      expect(history.rewindTo(mark)).toBe(true);

      expect(history.current()).toBe(kept);
      expect(history.canRedo()).toBe(false);
      expect(history.redo()).toBe(kept);
      expect(history.undo().nodes.n3.text).not.toBe('Kept');
    });

    it('tells subscribers once, under the name it was given', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', { parentId: 'n1', node: { id: 'a', text: '' } });
      history.apply('addChild', { parentId: 'n1', node: { id: 'b', text: '' } });
      const seen = [];
      history.subscribe((map, opName) => seen.push([map, opName]));

      history.rewindTo(mark, { name: 'discard' });

      expect(seen).toEqual([[history.current(), 'discard']]);
    });

    it('drops a redo future even when the marked entry is the current one', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', { parentId: 'n1', node: { id: 'a', text: '' } });
      history.undo();
      const listener = jest.fn();
      history.subscribe(listener);

      expect(history.rewindTo(mark)).toBe(true);
      expect(history.canRedo()).toBe(false);
      // Redo has just stopped being possible, and whatever shows that has to hear about it.
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('says nothing when there was nothing to rewind', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const listener = jest.fn();
      history.subscribe(listener);

      expect(history.rewindTo(history.mark())).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    });

    it('refuses, and changes nothing, once the marked entry has fallen off the stack', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now, limit: 3 });
      const mark = history.mark();
      for (let at = 0; at < 5; at += 1) {
        time.advance(2000);
        history.apply('setText', { id: 'n3', text: `Edit ${at}` });
      }
      const before = history.current();
      const listener = jest.fn();
      history.subscribe(listener);

      expect(history.rewindTo(mark)).toBe(false);

      expect(history.current()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(history.undo().nodes.n3.text).toBe('Edit 3');
    });

    it('keeps a mark out of the way of coalescing, so the state it names stays put', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now });
      history.apply('setText', { id: 'n3', text: 'O' });
      const mark = history.mark();
      time.advance(100);
      // Typing this soon would ordinarily merge into the entry above — which is the entry the mark
      // names, and merging into it would move the state the mark means out from under it. So it does
      // not merge, and the mark still names the state before the keystroke.
      history.apply('setText', { id: 'n3', text: 'On' });

      expect(history.rewindTo(mark)).toBe(true);
      expect(history.current().nodes.n3.text).toBe('O');
    });

    it('still merges the keystrokes that follow, so the edit is one step', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now });
      const mark = history.mark();
      history.apply('setText', { id: 'n3', text: 'O' }, { mark });
      time.advance(100);
      history.apply('setText', { id: 'n3', text: 'On' }, { mark });
      time.advance(100);
      history.apply('setText', { id: 'n3', text: 'One' }, { mark });

      expect(history.squashSince(mark, { name: 'setText' })).toBe(true);
      history.undo();
      expect(history.current().nodes.n3.text).toBe('Alpha one');
    });

    it('refuses a mark that is ahead of where the student now stands', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      history.apply('addChild', { parentId: 'n1', node: { id: 'a', text: '' } });
      const mark = history.mark();
      history.undo();

      expect(history.rewindTo(mark)).toBe(false);
      expect(history.canRedo()).toBe(true);
    });

    it('refuses something that was never a mark', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      expect(history.rewindTo(undefined)).toBe(false);
      expect(history.rewindTo({})).toBe(false);
    });
  });

  describe('rewindTo, when the steps were applied under the mark', () => {
    const child = id => ({ parentId: 'n1', node: { id, text: '' } });

    /** Everything a refusal must leave alone. */
    const stateOf = history => {
      const state = { map: history.current(), undo: 0, redo: 0 };
      while (history.canUndo()) {
        history.undo();
        state.undo += 1;
      }
      for (let at = 0; at < state.undo; at += 1) {
        history.redo();
      }
      while (history.canRedo()) {
        history.redo();
        state.redo += 1;
      }
      for (let at = 0; at < state.redo; at += 1) {
        history.undo();
      }
      return state;
    };

    it('rewinds steps that are all its own: an op, a batch and coalesced typing', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now });
      const before = history.current();
      const mark = history.mark();
      history.apply('addChild', child('a'), { mark });
      history.applyBatch([{ op: 'setDone', args: { id: 'a', done: true } }], { name: 'tick', mark });
      history.apply('setText', { id: 'a', text: 'O' }, { mark });
      history.apply('setText', { id: 'a', text: 'On' }, { mark });

      expect(history.rewindTo(mark)).toBe(true);
      expect(history.current()).toBe(before);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('refuses, and loses nothing, when somebody else applied a step in between', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('a'), { mark });
      history.apply('setColour', { id: 'n2', colour: 3 });
      const listener = jest.fn();
      history.subscribe(listener);
      const before = stateOf(history);
      listener.mockClear();

      expect(history.rewindTo(mark)).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      expect(stateOf(history)).toEqual(before);
      expect(history.current().nodes.n2.colour).toBe(3);
      expect(before.undo).toBe(2);
    });

    it('refuses when the step in between was a batch, or came before its own', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.applyBatch([{ op: 'setColour', args: { id: 'n2', colour: 3 } }]);
      history.apply('addChild', child('a'), { mark });
      expect(history.rewindTo(mark)).toBe(false);
      expect(history.current().nodes.n2.colour).toBe(3);
      expect(history.current().nodes.a).toBeDefined();
    });

    it('refuses, and keeps the redo, when somebody else undid in between', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('a'), { mark });
      history.undo();
      const before = stateOf(history);

      expect(history.rewindTo(mark)).toBe(false);
      expect(stateOf(history)).toEqual(before);
      expect(before.redo).toBe(1);
      expect(history.redo().nodes.a).toBeDefined();
    });

    it('refuses when somebody else typed into the same node and the typing coalesced', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now });
      const mark = history.mark();
      history.apply('addChild', child('a'), { mark });
      history.apply('setText', { id: 'a', text: 'mine' }, { mark });
      history.apply('setText', { id: 'a', text: 'theirs' });

      expect(history.rewindTo(mark)).toBe(false);
      expect(history.current().nodes.a.text).toBe('theirs');
    });

    it('gives each caller a mark of its own, so one cannot rewind the other', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const outline = history.mark();
      const canvas = history.mark();
      expect(canvas).not.toBe(outline);

      history.apply('addChild', child('a'), { mark: outline });

      // Both marks were taken at the same entry, so the canvas's mark sits behind work that is
      // not its own. A caller that has stamped nothing may still only rewind over nothing.
      expect(history.rewindTo(canvas)).toBe(false);
      expect(history.current().nodes.a).toBeDefined();

      const second = history.mark();
      history.apply('addChild', child('b'), { mark: second });

      expect(history.rewindTo(outline)).toBe(false);
      expect(history.current().nodes.b).toBeDefined();
      expect(history.rewindTo(second)).toBe(true);
      expect(history.current().nodes.a).toBeDefined();
      expect(history.current().nodes.b).toBeUndefined();
      expect(history.rewindTo(outline)).toBe(true);
      expect(history.current().nodes.a).toBeUndefined();
    });

    it('refuses an unstamped mark once anybody has applied a step under one', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const canvas = history.mark();
      const outline = history.mark();
      const before = history.current();
      history.apply('addChild', child('a'), { mark: outline });
      history.apply('toggleCollapsed', { id: 'n2' });

      // The canvas never stamped a step of its own, so the old rule let it rewind everything —
      // including the node the outline was part way through naming, unrecoverably.
      expect(history.rewindTo(canvas)).toBe(false);
      expect(history.current().nodes.a).toBeDefined();
      expect(history.current()).not.toBe(before);
    });

    it('still rewinds steps applied without the mark, for a caller that has not adopted it', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const before = history.current();
      const mark = history.mark();
      history.apply('toggleCollapsed', { id: 'n2' });
      history.apply('addChild', child('a'));

      expect(history.rewindTo(mark)).toBe(true);
      expect(history.current()).toBe(before);
    });

    it('ignores a mark option that is not a mark', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('a'), { mark: 'not a symbol' });
      expect(history.rewindTo(mark)).toBe(true);
    });
  });

  /**
   * Making a node and naming it is two ops and one thing the student did.
   *
   * Left as two entries, the first Ctrl+Z after naming a new node takes the name off and leaves an
   * empty box on the map \u2014 the very thing every editor on the page refuses to write. Folding the
   * steps made under one mark into a single entry is what makes "add a node" cost one press back.
   */
  describe('squashSince', () => {
    const child = id => ({ parentId: 'n1', node: { id, text: '' } });

    it('folds every step made under the mark into one entry', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const before = history.current();
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(true);

      const named = history.current();
      expect(named.nodes.fresh.text).toBe('Method');
      history.undo();
      expect(history.current()).toBe(before);
      expect(history.canUndo()).toBe(false);
    });

    it('brings the named node back in one redo', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });
      history.squashSince(mark, { name: 'addNode' });
      history.undo();

      history.redo();

      expect(history.current().nodes.fresh.text).toBe('Method');
      expect(history.canRedo()).toBe(false);
    });

    it('refuses when somebody else has written in between, and loses none of their work', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'n3', text: 'Another pane' });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(false);

      // Three entries still, so the other pane's step is its own to undo and to redo.
      history.undo();
      expect(history.current().nodes.fresh.text).toBe('');
      history.undo();
      expect(history.current().nodes.n3.text).not.toBe('Another pane');
      expect(history.current().nodes.fresh.text).toBe('');
      history.undo();
      expect(history.current().nodes.fresh).toBeUndefined();
      expect(history.canUndo()).toBe(false);
      history.redo();
      history.redo();
      expect(history.current().nodes.n3.text).toBe('Another pane');
    });

    it('refuses when a redo is still owed, so nobody loses a step forward', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });
      history.undo();

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(false);
      expect(history.canRedo()).toBe(true);
    });

    it('refuses a mark whose entry has fallen off the end of a full stack', () => {
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now, limit: 4 });
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      for (let at = 0; at < 6; at += 1) {
        history.apply('setText', { id: 'n3', text: `Step ${at}` });
        time.advance(5000);
      }

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(false);
    });

    it('leaves a full stack inside its limit and still walking backwards', () => {
      // A clock that moves, so consecutive renames are six entries rather than one coalesced one.
      const time = clock();
      const history = createHistory(sampleMap(), { now: time.now, limit: 4 });
      for (let at = 0; at < 6; at += 1) {
        history.apply('setText', { id: 'n3', text: `Step ${at}` });
        time.advance(5000);
      }
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(true);

      let steps = 0;
      while (history.canUndo()) {
        history.undo();
        steps += 1;
      }
      // Four entries were kept for a limit of four, and the fold turned the last two into one.
      expect(steps).toBe(3);
      expect(steps).toBeLessThanOrEqual(4);
      expect(history.current().nodes.fresh).toBeUndefined();
    });

    it('changes no map, so it tells nobody there is anything to redraw', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();
      history.apply('addChild', child('fresh'), { mark });
      history.apply('setText', { id: 'fresh', text: 'Method' }, { mark });
      const named = history.current();
      const heard = jest.fn();
      history.subscribe(heard);

      history.squashSince(mark, { name: 'addNode' });

      expect(history.current()).toBe(named);
      expect(heard).not.toHaveBeenCalled();
    });

    it('does nothing, and says so, when the mark carries no steps of its own', () => {
      const history = createHistory(sampleMap(), { now: () => 0 });
      const mark = history.mark();

      expect(history.squashSince(mark, { name: 'addNode' })).toBe(false);
      expect(history.canUndo()).toBe(false);
    });
  });

  it('lets a failing op through without disturbing the stack', () => {
    const map = sampleMap();
    const history = createHistory(map, { now: () => 0 });
    expect(() => history.apply('setText', { id: 'ghost', text: 'x' })).toThrow(/ghost/);
    expect(history.current()).toBe(map);
    expect(history.canUndo()).toBe(false);
  });
});

describe('a subscriber that throws', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not stop the other pane redrawing, and is reported once', () => {
    const history = createHistory(sampleMap(), { now: () => 0 });
    const broken = jest.fn(() => {
      throw new Error('bad node');
    });
    const other = jest.fn();
    history.subscribe(broken);
    history.subscribe(other);

    expect(() => history.apply('setText', { id: 'n3', text: 'Edited' })).not.toThrow();

    expect(broken).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0].join(' ')).toMatch(/history/i);
  });

  it('still lets an undo reach the other pane', () => {
    const history = createHistory(sampleMap(), { now: () => 0 });
    history.apply('setText', { id: 'n3', text: 'Edited' });
    history.subscribe(() => {
      throw new Error('bad node');
    });
    const other = jest.fn();
    history.subscribe(other);

    expect(() => history.undo()).not.toThrow();
    expect(other).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Object) }), 'undo');

    other.mockClear();
    expect(() => history.redo()).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);
  });
});
