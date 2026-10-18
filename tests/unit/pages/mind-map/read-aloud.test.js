/**
 * @jest-environment jsdom
 *
 * Read aloud.
 *
 * A mind map is the one document where the shape carries as much as the words, so what is graded
 * here is that the branch is read in outline order and that each node is announced with how many
 * sub-points hang off it — and that the node being spoken is selected, so the outline and the
 * canvas both follow along. The student's own TTS settings are the other half: a voice they cannot
 * bear at a speed they cannot follow is not a reading aid.
 */

import { mountReadAloud } from '../../../../src/pages/mind-map/read-aloud.js';
import {
  applySavedBindings,
  stopWatchingBindings,
} from '../../../../src/pages/mind-map/shortcut-bindings.js';
import { createSelectionStub, activate, makeHistory, press } from './pane-fixtures.js';

/** Let the mount's settings read settle. */
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

/** A speech engine the test drives: nothing is spoken until the previous utterance is ended. */
function fakeSynth(voices = []) {
  const listeners = new Map();
  return {
    spoken: [],
    cancelled: 0,
    paused: false,
    resumed: 0,
    voices,
    getVoices() {
      return this.voices;
    },
    speak(utterance) {
      this.spoken.push(utterance);
    },
    cancel() {
      this.cancelled += 1;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
      this.resumed += 1;
    },
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler]);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== handler));
    },
    /** Fire `voiceschanged` with a voice list the engine only learned about late. */
    loadVoices(list) {
      this.voices = list;
      for (const handler of listeners.get('voiceschanged') || []) {
        handler();
      }
    },
  };
}

const SETTINGS = {
  tts: { voice: 'Test Voice', rate: 1.4, pitch: 0.8, volume: 0.6 },
  mindMap: { readAloud: true },
};

describe('read aloud', () => {
  let host;
  let history;
  let selection;
  let announce;
  let reader;
  let synth;
  let realSynth;
  let realUtterance;

  const find = selector => host.querySelector(selector);
  const toggle = () => find('.mm-read__toggle');
  const spokenText = () => synth.spoken.map(utterance => utterance.text);

  /** End the utterance the engine is holding, the way the browser does when it finishes. */
  const finishOne = () => {
    const utterance = synth.spoken[synth.spoken.length - 1];
    utterance.onend();
  };

  const mount = async (settings = SETTINGS) => {
    reader = mountReadAloud(host, {
      history,
      selection,
      announce,
      getSettings: () => Promise.resolve(settings),
    });
    await settle();
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    announce = jest.fn();
    synth = fakeSynth([{ name: 'Test Voice' }, { name: 'Other Voice' }]);
    realSynth = window.speechSynthesis;
    realUtterance = window.SpeechSynthesisUtterance;
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.onend = null;
        this.onerror = null;
      }
    };
  });

  afterEach(() => {
    reader?.destroy();
    host.remove();
    // The bindings are page-wide state: a remap left behind would decide the next test's keys.
    stopWatchingBindings();
    Object.defineProperty(window, 'speechSynthesis', { value: realSynth, configurable: true });
    window.SpeechSynthesisUtterance = realUtterance;
  });

  /**
   * The shape of a branch carries as much as its words, so what a student hears is graded through
   * the engine: depth first, in outline order, each node announced with how many sub-points hang
   * off it before any of them is read.
   */
  describe('the sentences a branch becomes', () => {
    /** Read to the end, the way a browser ends one utterance and the reader starts the next. */
    const readToTheEnd = () => {
      activate(toggle());
      for (let guard = 0; guard < 50; guard += 1) {
        const before = synth.spoken.length;
        finishOne();
        if (synth.spoken.length === before) {
          break;
        }
      }
      return spokenText();
    };

    it('reads depth first, naming the sub-points of each node before reading them', async () => {
      await mount();

      expect(readToTheEnd()).toEqual([
        'Essay plan. 2 sub-points: Argument, Sources.',
        'Argument. 2 sub-points: Evidence, Counterpoint.',
        'Evidence.',
        'Counterpoint.',
        'Sources.',
      ]);
    });

    it('says "sub-point" in the singular for one child', async () => {
      history.apply('removeNode', { id: 'counter' });
      selection.set('arg', { source: 'outline' });
      await mount();

      expect(readToTheEnd()).toEqual(['Argument. 1 sub-point: Evidence.', 'Evidence.']);
    });

    // Spoken, not shown: on screen a nameless node reads `(untitled)`, which a voice either
    // swallows or says as two brackets.
    it('names an empty node rather than reading a full stop on its own', async () => {
      history.apply('setText', { id: 'ev', text: '   ' });
      selection.set('arg', { source: 'outline' });
      await mount();

      expect(readToTheEnd()).toEqual([
        'Argument. 2 sub-points: untitled node, Counterpoint.',
        'untitled node.',
        'Counterpoint.',
      ]);
    });
  });

  // A selection can hold an id that came out of a file or another module. Every object answers to
  // `constructor`, so a truthiness test on `map.nodes[id]` would hand a function to the reader.
  it('reads the whole map when the selection names something that is not a node', async () => {
    selection.set('constructor', { source: 'program' });
    await mount();
    activate(toggle());

    expect(spokenText()[0]).toBe('Essay plan. 2 sub-points: Argument, Sources.');
  });

  it('does not appear when the student has turned reading aloud off', async () => {
    await mount({ tts: {}, mindMap: { readAloud: false } });
    expect(find('.mm-read')).toBe(null);
  });

  it('appears when the setting is absent, because reading aloud is on by default', async () => {
    await mount({});
    expect(toggle()).not.toBe(null);
  });

  it('reads the selected branch depth first, naming the sub-points of each node', async () => {
    selection.set('arg', { source: 'outline' });
    await mount();
    activate(toggle());

    expect(spokenText()).toEqual(['Argument. 2 sub-points: Evidence, Counterpoint.']);
    finishOne();
    expect(spokenText()[1]).toBe('Evidence.');
    finishOne();
    expect(spokenText()[2]).toBe('Counterpoint.');
    finishOne();
    expect(synth.spoken.length).toBe(3);
    expect(announce).toHaveBeenCalledWith('Finished reading.');
  });

  it('reads the whole map from the root when nothing is selected', async () => {
    await mount();
    activate(toggle());
    expect(spokenText()[0]).toBe('Essay plan. 2 sub-points: Argument, Sources.');
  });

  it('selects the node it is reading so both panes follow it', async () => {
    selection.set('arg', { source: 'outline' });
    await mount();
    const seen = [];
    selection.subscribe((id, meta) => seen.push([id, meta.source]));

    activate(toggle());
    finishOne();
    // Signed as read aloud's own, so a change from anywhere else can be told from its footsteps.
    expect(seen).toContainEqual(['ev', 'read']);
  });

  it('speaks with the voice, rate, pitch and volume the student stored', async () => {
    await mount();
    activate(toggle());
    const utterance = synth.spoken[0];
    expect(utterance.voice).toEqual({ name: 'Test Voice' });
    expect(utterance.rate).toBe(1.4);
    expect(utterance.pitch).toBe(0.8);
    expect(utterance.volume).toBe(0.6);
  });

  it('waits for the engine to publish its voices before resolving one', async () => {
    synth = fakeSynth([]);
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    reader = mountReadAloud(host, {
      history,
      selection,
      announce,
      getSettings: () => Promise.resolve(SETTINGS),
    });
    await settle();

    synth.loadVoices([{ name: 'Test Voice' }]);
    await settle();

    activate(toggle());
    expect(synth.spoken[0].voice).toEqual({ name: 'Test Voice' });
  });

  it('with no voice chosen, reads in a device voice rather than an online one', async () => {
    const onDevice = { name: 'Device Voice', lang: 'en-GB', localService: true };
    synth.voices = [
      { name: 'Google UK English Female', lang: 'en-GB', localService: false },
      onDevice,
    ];
    await mount({ tts: { voice: 'default' } });
    activate(toggle());

    expect(synth.spoken[0].voice).toBe(onDevice);
  });

  it('falls back to the engine default when the stored voice is gone', async () => {
    await mount({ tts: { voice: 'A Voice Nobody Has' } });
    activate(toggle());
    expect(synth.spoken[0].voice).toBe(null);
  });

  it('pauses and resumes from the same button, saying which it will do next', async () => {
    await mount();
    expect(toggle().textContent).toBe('Read aloud');

    activate(toggle());
    expect(toggle().textContent).toBe('Pause');

    activate(toggle());
    expect(synth.paused).toBe(true);
    expect(toggle().textContent).toBe('Resume');

    activate(toggle());
    expect(synth.resumed).toBe(1);
    expect(toggle().textContent).toBe('Pause');
  });

  it('stops, and will not carry on with the utterance that was in flight', async () => {
    await mount();
    activate(toggle());
    const held = synth.spoken[0];

    activate(find('.mm-read__stop'));
    expect(synth.cancelled).toBe(1);
    expect(toggle().textContent).toBe('Read aloud');

    held.onend();
    expect(synth.spoken.length).toBe(1);
  });

  it('disables Stop until there is something to stop', async () => {
    await mount();
    expect(find('.mm-read__stop').disabled).toBe(true);
    activate(toggle());
    expect(find('.mm-read__stop').disabled).toBe(false);
  });

  it('toggles from Alt+R', async () => {
    await mount();
    const altR = () =>
      document.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
      );

    altR();
    expect(synth.spoken.length).toBe(1);
    altR();
    expect(synth.paused).toBe(true);
  });

  it('moves to the key the student bound instead, and leaves the old one alone', async () => {
    // The whole point of putting this key in the registry. A student whose screen reader owns Alt+R,
    // or who cannot reach Alt at all, changes it in Settings and the editor follows.
    applySavedBindings({ mm_read_aloud: 'Ctrl+Shift+K' });
    await mount();

    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
    );
    expect(synth.spoken.length).toBe(0);

    document.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'K',
        code: 'KeyK',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    expect(synth.spoken.length).toBe(1);
  });

  it('stays quiet while a node name is being typed', async () => {
    await mount();
    const field = document.createElement('input');
    field.type = 'text';
    document.body.appendChild(field);

    field.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
    );

    // Reading the whole map aloud over a half-written node is the loudest interruption there is.
    expect(synth.spoken.length).toBe(0);
    field.remove();
  });

  it('answers Alt+R on a Mac, where the key types ® rather than r', async () => {
    await mount();

    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: '®', code: 'KeyR', altKey: true, bubbles: true })
    );

    expect(synth.spoken.length).toBe(1);
  });

  it('leaves Alt+R alone while another panel has the screen', async () => {
    let blocked = true;
    reader = mountReadAloud(host, {
      history,
      selection,
      announce,
      getSettings: () => Promise.resolve(SETTINGS),
      isBlocked: () => blocked,
    });
    await settle();
    const altR = () =>
      document.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
      );

    altR();
    expect(synth.spoken).toHaveLength(0);
    // A key that does nothing and says nothing is a key the student reports as broken.
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/held back/i));
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/button in the toolbar/i));

    blocked = false;
    altR();
    expect(synth.spoken).toHaveLength(1);
  });

  it('leaves Alt+R alone when the student has turned reading aloud off', async () => {
    await mount({ tts: {}, mindMap: { readAloud: false } });

    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
    );

    expect(synth.spoken).toHaveLength(0);
  });

  it('stops speaking on destroy and lets Alt+R go', async () => {
    await mount();
    activate(toggle());
    reader.destroy();
    reader = null;
    expect(synth.cancelled).toBe(1);

    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'r', altKey: true, bubbles: true })
    );
    expect(synth.spoken.length).toBe(1);
  });

  it('stops speaking when the page is unloaded', async () => {
    await mount();
    activate(toggle());
    window.dispatchEvent(new window.Event('beforeunload'));
    expect(synth.cancelled).toBe(1);
  });

  it('says so when the engine fails rather than sitting silent', async () => {
    await mount();
    activate(toggle());
    synth.spoken[0].onerror({ error: 'synthesis-failed' });
    expect(announce).toHaveBeenCalledWith(expect.stringMatching(/could not read/i));
    expect(toggle().textContent).toBe('Read aloud');
  });

  // Stop goes dead the instant the reading ends. A disabled button cannot hold focus, so the
  // browser drops it on `<body>` and the student who pressed Stop is back at the top of the page.
  describe('focus when Stop goes dead', () => {
    const stop = () => find('.mm-read__stop');

    it('moves to the toggle when the student presses Stop', async () => {
      await mount();
      activate(toggle());
      activate(stop());

      expect(stop().disabled).toBe(true);
      expect(document.activeElement).toBe(toggle());
    });

    it('moves to the toggle when the reading finishes on its own', async () => {
      selection.set('src', { source: 'outline' });
      await mount();
      activate(toggle());
      stop().focus();
      finishOne();

      expect(stop().disabled).toBe(true);
      expect(document.activeElement).toBe(toggle());
    });

    it('leaves focus where it is when Stop was not the thing holding it', async () => {
      await mount();
      activate(toggle());
      const elsewhere = document.createElement('button');
      document.body.appendChild(elsewhere);
      elsewhere.focus();
      press(stop());

      expect(stop().disabled).toBe(true);
      expect(document.activeElement).toBe(elsewhere);
      elsewhere.remove();
    });
  });
});


/**
 * A reading of several selected nodes.
 *
 * Following the spoken node is a view of the map, not a change to it: the reading borrows the
 * selection so the outline and the canvas can point at what is being said, and gives it back when it
 * stops. And with four rings on screen it says which of them it started from, because nothing else
 * does.
 */
describe('read aloud when the student had chosen several nodes', () => {
  let host;
  let history;
  let selection;
  let announce;
  let reader;
  let synth;
  let realSynth;
  let realUtterance;

  const find = selector => host.querySelector(selector);
  const toggle = () => find('.mm-read__toggle');
  const stopButton = () => find('.mm-read__stop');
  const finishOne = () => synth.spoken[synth.spoken.length - 1].onend();

  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    synth = fakeSynth([{ name: 'Test Voice' }]);
    realSynth = window.speechSynthesis;
    realUtterance = window.SpeechSynthesisUtterance;
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.onend = null;
        this.onerror = null;
      }
    };
    reader = mountReadAloud(host, {
      history,
      selection,
      announce,
      getSettings: () => Promise.resolve({}),
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => {
    reader?.destroy();
    host.remove();
    // The bindings are page-wide state: a remap left behind would decide the next test's keys.
    stopWatchingBindings();
    Object.defineProperty(window, 'speechSynthesis', { value: realSynth, configurable: true });
    window.SpeechSynthesisUtterance = realUtterance;
  });

  it('says how many nodes it will read and which one it starts from', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });

    activate(toggle());

    expect(announce).toHaveBeenCalledWith("Reading 3 nodes aloud, from 'Argument'.");
  });

  it('names an unnamed node rather than quoting nothing', () => {
    history.apply('setText', { id: 'src', text: '' });
    selection.set('src', { source: 'outline' });
    selection.selectAll(['arg', 'src'], { source: 'outline' });

    activate(toggle());

    expect(announce).toHaveBeenCalledWith("Reading 1 node aloud, from '(untitled)'.");
  });

  it('says nothing about where it starts when there was only one node to start from', () => {
    selection.set('arg', { source: 'outline' });

    activate(toggle());

    expect(announce).toHaveBeenCalledWith('Reading 3 nodes aloud.');
  });

  it('gives the set back, primary and all, when the reading finishes', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    const had = selection.ids();
    const primary = selection.get();

    activate(toggle());
    // The reading walks the selection so the panes can follow it.
    expect(selection.ids()).toEqual(['arg']);
    finishOne();
    finishOne();
    finishOne();

    expect(announce).toHaveBeenCalledWith('Finished reading.');
    expect(selection.ids()).toEqual(had);
    expect(selection.get()).toBe(primary);
  });

  it('gives the set back when the student stops part way through', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    const had = selection.ids();

    activate(toggle());
    finishOne();
    activate(stopButton());

    expect(selection.ids()).toEqual(had);
  });

  it('leaves a selection the student changed while it was reading', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    activate(toggle());
    finishOne();

    // The student picks something else while the voice is going — the centre, which this reading
    // never visits, so the end of it cannot be mistaken for their choice. What they chose is what
    // they keep: putting the borrowed set back over it would undo a choice made after it was taken.
    const centre = history.current().rootId;
    selection.set(centre, { source: 'outline' });

    activate(stopButton());

    expect(selection.ids()).toEqual([centre]);
  });

  it('does not put the borrowed set back over a change made while it read on', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    activate(toggle());
    finishOne();
    selection.set(history.current().rootId, { source: 'outline' });

    finishOne();
    finishOne();

    expect(announce).toHaveBeenCalledWith('Finished reading.');
    // Wherever the reading left it — but never the set it had borrowed and been told to forget.
    expect(selection.ids()).not.toEqual(['arg', 'src']);
  });

  it('gives back only what the map still holds', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    activate(toggle());
    history.apply('removeNode', { id: 'src' });

    activate(stopButton());

    expect(selection.ids()).toEqual(['arg']);
  });

  it('leaves the reading where it finished when there was nothing to borrow', () => {
    selection.set('arg', { source: 'outline' });
    activate(toggle());
    finishOne();
    finishOne();
    finishOne();

    expect(selection.get()).toBe('counter');
  });
});
