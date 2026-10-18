/**
 * @jest-environment jsdom
 *
 * Autosave has to hold two promises at once: a student's work reaches the database without them
 * asking, and a burst of typing costs one write rather than one per keystroke.
 *
 * The debounce is measured against fake timers; everything that touches the store runs on real
 * ones, because fake-indexeddb delivers its events through the same timer queue Jest would be
 * freezing. A save that writes a stale snapshot is the bug a stubbed store would never show, so
 * the second half drives the real Dexie database through fake-indexeddb.
 */

import 'fake-indexeddb/auto';

const channels = [];

class TestBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    channels.push(this);
  }

  postMessage(data) {
    for (const other of channels) {
      if (other !== this && other.name === this.name) {
        for (const listener of other.listeners) {
          listener({ data });
        }
      }
    }
  }

  addEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type, listener) {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }
}

global.BroadcastChannel = TestBroadcastChannel;

const { createMap } = require('../../../../src/features/mindMap/core/map-model.js');
const { setText } = require('../../../../src/features/mindMap/core/map-ops.js');
const {
  deleteMap,
  getMap,
  listMaps,
  saveMap
} = require('../../../../src/features/mindMap/mindmap-db.js');
const { createAutosave } = require('../../../../src/pages/mind-map/autosave.js');

/**
 * Wait on the autosave's own word that a write landed, never on the clock.
 *
 * A fixed sleep is a bet that the debounce, the Dexie transaction and fake-indexeddb's timer queue
 * all finish inside it, and on a loaded machine the bet loses. `onStateChange` is how the page
 * learns a save landed, so it is how the tests learn it too.
 *
 * @returns {{onStateChange: Function, saved: () => Promise<void>}} `saved()` resolves at the next
 *   'saved' state, or at once if one has arrived since the last call.
 */
function watchSaves() {
  let landed = 0;
  let taken = 0;
  let waiting = null;
  return {
    onStateChange(state) {
      if (state.status !== 'saved') {
        return;
      }
      landed += 1;
      if (waiting) {
        taken += 1;
        waiting();
        waiting = null;
      }
    },
    saved() {
      if (landed > taken) {
        taken += 1;
        return Promise.resolve();
      }
      return new Promise(resolve => {
        waiting = resolve;
      });
    }
  };
}

afterEach(async () => {
  for (const summary of await listMaps()) {
    await deleteMap(summary.id);
  }
});

describe('the debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes once after the last change in a burst, not once per change', async () => {
    const save = jest.fn().mockResolvedValue({});
    const autosave = createAutosave({ save, delay: 600 });

    autosave.markDirty();
    jest.advanceTimersByTime(500);
    autosave.markDirty();
    jest.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(save).toHaveBeenCalledTimes(1);
    autosave.destroy();
  });

  it('reports dirty, saving and saved in order', async () => {
    const states = [];
    const autosave = createAutosave({
      save: () => Promise.resolve({}),
      delay: 600,
      onStateChange: state => states.push(state.status)
    });

    autosave.markDirty();
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(['dirty', 'saving', 'saved']);
    autosave.destroy();
  });

  it('stays dirty and reports the failure when the write is refused', async () => {
    const states = [];
    const autosave = createAutosave({
      save: () => Promise.reject(new Error('Quota exceeded')),
      delay: 600,
      onStateChange: state => states.push(state)
    });

    autosave.markDirty();
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();

    expect(states[states.length - 1]).toMatchObject({ status: 'error', message: 'Quota exceeded' });
    expect(autosave.isDirty()).toBe(true);
    autosave.destroy();
  });

  it('cancels the pending write when a save is asked for outright, rather than writing twice', async () => {
    const save = jest.fn().mockResolvedValue({});
    const autosave = createAutosave({ save, delay: 600 });

    autosave.markDirty();
    await autosave.saveNow();
    jest.advanceTimersByTime(5000);

    expect(save).toHaveBeenCalledTimes(1);
    autosave.destroy();
  });

  it('forgets a pending save once destroyed', () => {
    const save = jest.fn().mockResolvedValue({});
    const autosave = createAutosave({ save, delay: 600 });

    autosave.markDirty();
    autosave.destroy();
    jest.advanceTimersByTime(5000);

    expect(save).not.toHaveBeenCalled();
  });
});

describe('against the real store', () => {
  it('saves the map as it stands when asked to, without waiting for the debounce', async () => {
    const map = createMap({ id: 'm1', title: 'Essay plan' });
    const autosave = createAutosave({ save: () => saveMap(map, { now: () => 77 }), delay: 600 });

    autosave.markDirty();
    await autosave.saveNow();

    expect((await getMap('m1')).updatedAt).toBe(77);
    expect(autosave.isDirty()).toBe(false);
    autosave.destroy();
  });

  it('writes the latest snapshot when a change lands while a save is in flight', async () => {
    let current = createMap({ id: 'm1', title: 'Essay plan' });
    let clock = 1;
    const saves = watchSaves();
    const autosave = createAutosave({
      save: () => saveMap(current, { now: () => clock }),
      delay: 20,
      onStateChange: saves.onStateChange
    });

    const first = autosave.saveNow();
    current = setText(current, { id: current.rootId, text: 'Second draft' });
    clock = 2;
    autosave.markDirty();
    await first;
    // The first write ends 'dirty', not 'saved': the only 'saved' there is belongs to the follow-up.
    await saves.saved();

    const stored = await getMap('m1');
    expect(stored.nodes[stored.rootId].text).toBe('Second draft');
    expect(stored.updatedAt).toBe(2);
    autosave.destroy();
  });

  it('leaves nothing dirty once the follow-up write lands', async () => {
    const map = createMap({ id: 'm1', title: 'Essay plan' });
    const saves = watchSaves();
    const autosave = createAutosave({
      save: () => saveMap(map, { now: () => 5 }),
      delay: 20,
      onStateChange: saves.onStateChange
    });

    autosave.markDirty();
    await saves.saved();

    expect(autosave.isDirty()).toBe(false);
    expect((await getMap('m1')).updatedAt).toBe(5);
    autosave.destroy();
  });
});
