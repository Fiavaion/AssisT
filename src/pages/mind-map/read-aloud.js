/**
 * Reading a map aloud.
 *
 * A mind map is the one document where the shape carries as much meaning as the words. Reading the
 * node text alone would give a student a list; reading "Argument. 2 sub-points: Evidence,
 * Counterpoint." gives them the tree. So each node is spoken with the count and the names of what
 * hangs off it, and then each of those is spoken in turn, depth first — the same order the outline
 * shows and the same order the Markdown export writes.
 *
 * The node being read is selected as it is read, with source 'program', so the outline moves its
 * focus ring and the canvas pans to it. Following along is the point.
 *
 * The voice, rate, pitch and volume are the ones the student already chose for AssisT's TTS
 * (`assist_settings.tts`). A reading aid in a voice they cannot bear at a speed they cannot follow
 * is not an aid, and asking them to set it twice is worse.
 *
 * Nothing here is required to use a map, and it is skipped entirely when
 * `assist_settings.mindMap.readAloud` is false or the browser has no speech engine.
 *
 * @module pages/mind-map/read-aloud
 */

import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { resolveSpeech, waitForVoices } from '../../utils/speech-voice.js';

import { inThisBranchSuffix } from './focus-sentences.js';
import { nameOf } from './node-edits.js';
import { matchesBinding } from './shortcut-bindings.js';
import { isTextField } from './text-fields.js';

/**
 * Who this pane says moved the selection.
 *
 * A name of its own, not 'program': the reading walks the selection from node to node and puts the
 * student's own set back at the end, and it has to be able to tell its own footsteps from theirs. A
 * selection change from anywhere else while a reading is running is the student choosing something,
 * and what they chose is what they keep.
 */
const SOURCE = 'read';

import './read-aloud.css';

/**
 * What a node with no name is called in speech.
 *
 * Everywhere a node with no name is SHOWN — the inspector, the AI panel — it reads `(untitled)`,
 * which is right on screen and wrong in a voice: brackets are either silent or spoken as the word.
 * These sentences are only ever handed to `speak`, so they say what a listener would say.
 */
const UNNAMED = 'untitled node';

/**
 * The sentences for a branch, in outline order.
 *
 * @param {Object} map - a validated map, so every id it names is a node it holds.
 * @param {string} rootId - the node to start from; the caller has checked it is on the map.
 * @returns {Array<{id: string, text: string}>}
 */
function readingPlan(map, rootId) {
  const plan = [];
  const visit = id => {
    const node = nodeAt(map, id);
    const label = node.text.trim() || UNNAMED;
    const children = node.children.map(childId => nodeAt(map, childId).text.trim() || UNNAMED);
    const summary =
      children.length === 0
        ? ''
        : ` ${children.length} sub-point${children.length === 1 ? '' : 's'}: ${children.join(', ')}.`;
    plan.push({ id, text: `${label}.${summary}` });
    for (const childId of node.children) {
      visit(childId);
    }
  };
  visit(rootId);
  return plan;
}

/**
 * Mount the read-aloud controls.
 *
 * @param {HTMLElement} host - appended to, not emptied; the toolbar holds several of these.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} [options.announce]
 * @param {() => (Object|Promise<Object>)} [options.getSettings] - the stored `assist_settings`;
 *   read once at mount, because a student changing their voice mid-sentence is not a case worth
 *   the extra reads.
 * @param {() => boolean} [options.isBlocked] - true while something else on the page has the
 *   screen and the focus. Alt+R is page-wide, and a voice that starts under an open panel is a
 *   voice whose stop button the student cannot reach; the key says so in the live region rather
 *   than going quietly dead. The buttons themselves are unaffected: a student who can see them and
 *   press them meant to press them.
 * @returns {{destroy: () => void}}
 */
export function mountReadAloud(host, options = {}) {
  const {
    history,
    selection,
    announce = () => {},
    getSettings = () => ({}),
    isBlocked = () => false,
  } = options;

  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (!synth || typeof Utterance !== 'function') {
    // No speech engine: there is nothing to offer, and an inert button would only mislead.
    return { destroy() {} };
  }

  const cleanups = [];

  const root = document.createElement('div');
  root.className = 'mm-read';
  // Play and Stop are one control in two halves, drawn as one pill: the group says so to a screen
  // reader as well, so "Stop" is never met on its own with nothing to say what it would stop.
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Read aloud');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mm-read__toggle';
  toggle.dataset.command = 'read-toggle';
  toggle.textContent = 'Read aloud';

  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'mm-read__stop';
  stop.dataset.command = 'read-stop';
  stop.textContent = 'Stop';
  stop.disabled = true;

  root.append(toggle, stop);
  host.appendChild(root);

  /** 'idle' | 'speaking' | 'paused' — ours, not the engine's: the flags lie across platforms. */
  let state = 'idle';

  /** Bumped whenever a reading ends, so a late `onend` from a cancelled run is ignored. */
  let run = 0;

  let plan = [];
  let at = 0;

  /**
   * The set the student had when a reading of more than one node began, to be given back at the end.
   *
   * Null while nothing is borrowed, and for a reading that began on one node — there is nothing to
   * put back then, and the node the reading finished on is a reasonable place to be left.
   */
  let borrowed = null;
  let voice = null;
  let speech = resolveSpeech(undefined, []);

  /** Set when the settings said no, or when the pane was destroyed: nothing may speak after this. */
  let removed = false;

  // The student changed the selection while the reading had theirs borrowed. Putting the old set back
  // at the end would then overwrite a choice they made after it was taken — so the borrowing is
  // forgotten, and the reading leaves the selection exactly where they put it.
  const unsubscribeSelection = selection.subscribe((_id, meta) => {
    if (borrowed && meta.source !== SOURCE) {
      borrowed = null;
    }
  });

  function setState(next) {
    state = next;
    toggle.textContent =
      state === 'speaking' ? 'Pause' : state === 'paused' ? 'Resume' : 'Read aloud';
    toggle.setAttribute(
      'aria-label',
      state === 'speaking'
        ? 'Pause reading'
        : state === 'paused'
          ? 'Resume reading'
          : 'Read the map aloud'
    );
    // Stop goes dead the moment a reading ends — on its own at the last node, or because the
    // student pressed it. A disabled button cannot hold focus, so the browser would drop focus on
    // `<body>` and a keyboard student would be back at the top of the page. The toggle is the same
    // control in a different state and is never disabled, so focus moves there.
    const fromStop = document.activeElement === stop;
    stop.disabled = state === 'idle';
    if (stop.disabled && fromStop) {
      toggle.focus();
    }
  }

  function stopReading(message) {
    run += 1;
    plan = [];
    at = 0;
    synth.cancel();
    setState('idle');
    giveTheSetBack();
    if (message) {
      announce(message);
    }
  }

  /**
   * Put back the set the reading borrowed, as far as the map still holds it.
   *
   * Two changes rather than one, because the primary is where the student was and `selectAll` keeps
   * the primary it is handed only when that node is in the list. Both are `said`: the student asked
   * for a reading, not for a count.
   */
  function giveTheSetBack() {
    const taken = borrowed;
    borrowed = null;
    if (!taken) {
      return;
    }
    const map = history.current();
    const alive = taken.ids.filter(id => hasNode(map, id));
    if (alive.length === 0) {
      return;
    }
    const primary = hasNode(map, taken.primary) ? taken.primary : alive[0];
    selection.set(primary, { source: SOURCE, said: true });
    if (alive.length > 1) {
      selection.selectAll(alive, { source: SOURCE, said: true });
    }
  }

  function speakNext(mine) {
    if (mine !== run || at >= plan.length) {
      if (mine === run) {
        stopReading('Finished reading.');
      }
      return;
    }
    const step = plan[at];
    at += 1;
    // `said`: the count sentence over every spoken node would bury the reading itself.
    selection.set(step.id, { source: SOURCE, said: true });

    const utterance = new Utterance(step.text);
    utterance.voice = voice;
    utterance.rate = speech.rate;
    utterance.pitch = speech.pitch;
    utterance.volume = speech.volume;
    utterance.onend = () => speakNext(mine);
    utterance.onerror = event => {
      if (mine !== run) {
        return;
      }
      stopReading(
        `The map could not read aloud: ${(event && event.error) || 'the voice stopped'}.`
      );
    };
    synth.speak(utterance);
  }

  function start() {
    const map = history.current();
    // `hasNode`: a selection can hold an id that came from a file or another module, and
    // `nodes.constructor` would answer as a node and then be read aloud as one.
    const chosen = selection.get();
    const from = hasNode(map, chosen) ? chosen : map.rootId;
    plan = readingPlan(map, from);
    at = 0;
    if (plan.length === 0) {
      announce('There is nothing to read here.');
      return;
    }
    // The reading walks the selection from node to node so the panes can follow it, which is a view
    // of the map rather than a change to it — so what the student had chosen is put back at the end.
    const had = selection.ids();
    borrowed = had.length > 1 ? { ids: had, primary: chosen } : null;
    // No cancel here: nothing can be speaking while the state is idle, and stopping already
    // cancels. A cancel on the way in would only mask a bug in that pairing.
    run += 1;
    setState('speaking');
    // Where it starts, when there was more than one node to start from: four rings on screen and no
    // word about which of them is being read is a question the student cannot answer.
    announce(
      `Reading ${plan.length} node${plan.length === 1 ? '' : 's'} aloud` +
        `${borrowed ? `, from '${nameOf(map.nodes[from].text)}'` : ''}${inThisBranchSuffix(map)}.`
    );
    speakNext(run);
  }

  function toggleReading() {
    if (state === 'speaking') {
      synth.pause();
      setState('paused');
      announce('Paused.');
      return;
    }
    if (state === 'paused') {
      synth.resume();
      setState('speaking');
      announce('Reading again.');
      return;
    }
    start();
  }

  cleanups.push(
    attachAccessibleHandler(toggle, 'Mind map read aloud', toggleReading),
    attachAccessibleHandler(stop, 'Mind map stop reading', () => stopReading('Stopped reading.'))
  );

  // The chord is a registry binding (`mm_read_aloud`, Alt+R by default) rather than a comparison
  // written out here, so a student who cannot reach Alt can move it in Settings. A bare letter was
  // never an option either way: the outline treats a plain keystroke as the start of an edit.
  const onKeydown = event => {
    if (!matchesBinding(event, 'mm_read_aloud')) {
      return;
    }
    // Not while a node name is being typed. Reading the whole map aloud over a half-written node is
    // the loudest way there is for a shortcut to interrupt somebody.
    if (isTextField(event.target)) {
      return;
    }
    // `removed` covers the student who turned reading aloud off: the controls went, and a key that
    // still starts a voice with no visible way to stop it is worse than no key at all. There is
    // nothing to say about a feature that is switched off.
    if (removed) {
      return;
    }
    // A key that does nothing and says nothing is indistinguishable from a broken one, and this
    // one is held back by something at the other end of the page. The buttons are unaffected, so
    // the way through is named rather than only the refusal.
    if (isBlocked()) {
      announce(
        'Read aloud is held back while the shortcuts list or study practice is on screen. The ' +
          'Read aloud button in the toolbar still works.'
      );
      return;
    }
    event.preventDefault();
    toggleReading();
  };
  document.addEventListener('keydown', onKeydown);
  cleanups.push(() => document.removeEventListener('keydown', onKeydown));

  // A tab that navigates away while speaking leaves the engine talking to nobody.
  const onUnload = () => stopReading('');
  window.addEventListener('beforeunload', onUnload);
  cleanups.push(() => window.removeEventListener('beforeunload', onUnload));

  Promise.resolve(getSettings())
    .then(async settings => {
      const mindMap = (settings && settings.mindMap) || {};
      if (mindMap.readAloud === false) {
        removed = true;
        root.remove();
        return;
      }
      const tts = (settings && settings.tts) || {};
      speech = resolveSpeech(tts, []);
      const voices = await waitForVoices(synth);
      if (removed) {
        return;
      }
      // The saved voice, else a voice on this device; null only when the device has none, and
      // then the engine's own default still speaks, which is better than refusing to.
      voice = resolveSpeech(tts, voices).voice;
    })
    .catch(() => {
      // Unreadable settings are not a reason to withhold the feature; the defaults still speak.
    });

  return {
    destroy() {
      removed = true;
      stopReading('');
      unsubscribeSelection();
      for (const cleanup of cleanups) {
        cleanup();
      }
      root.remove();
    },
  };
}
