/**
 * Voice capture session: what the capture bar's Voice capture button turns on and off.
 *
 * Voice capture works on its own. With voice typing already running it listens on that recogniser
 * (the page never gets a second one) and leaves it running when turned off. Otherwise it asks the
 * dictation question (ADR 0006) and starts a recogniser of its own that types nothing and runs no
 * editing commands: it only listens for the trigger phrase. That one is stopped when Voice capture
 * is turned off.
 *
 * The button shows pressed only while a recogniser is actually listening; every start, stop and
 * failure is reported through `onChange` with a sentence for the bar's status line.
 *
 * Public API:
 *   createVoiceCaptureSession({ getDictation, onTrigger, onChange, returnFocus, language })
 *     -> { toggle(), stop(), state }
 */

import { STTController } from '../../../engines/stt/stt-controller-facade.js';
import { allowDictation } from '../../../utils/dictation-consent.js';
import { SPOKEN_PHRASES } from './voice-capture.js';

/** The trigger phrases as a student would say them, quoted: "cite this", "capture source" ... */
const PHRASES = SPOKEN_PHRASES.map(phrase => `"${phrase}"`);

export const MESSAGES = Object.freeze({
  starting: 'Starting voice capture - waiting for the microphone...',
  listening: `Listening. Say ${PHRASES.slice(0, -1).join(', ')} or ${PHRASES.at(-1)} to save the passage you're reading.`,
  declined: 'Voice capture is off. Dictation was not allowed, so nothing was recorded or sent.',
  cannotStart:
    'Voice capture could not start in this browser. Open the page in Google Chrome to use it.',
  stoppedOwn: 'Voice capture is off. The microphone has stopped.',
  stoppedShared: 'Voice capture is off. Voice typing is still on.',
  cancelled: 'Voice capture is off.',
  endedOwn:
    'Voice capture is off because the microphone stopped. Press Voice capture to listen again.',
  endedShared: 'Voice capture is off because voice typing stopped.',
  blocked:
    'Voice capture is off. The microphone is blocked for this site: click the microphone icon in the address bar, choose Allow, then press Voice capture again.',
  noSpeech:
    'Voice capture is off. Nothing was heard for a while. Press Voice capture to listen again.',
});

/** Settings for a recogniser of Voice capture's own: it listens for a phrase and types nothing. */
const CAPTURE_SETTINGS = Object.freeze({
  continuous: true,
  interimResults: false,
  voiceCommands: false,
  punctuationCommands: false,
  autoPunctuation: false,
  autoCapitalize: false,
  vocabularyEnabled: false,
  confidenceFeedback: false,
});

/**
 * @param {{code?: string, message?: string}} event
 * @returns {string}
 */
function errorMessage(event) {
  if (event.code === 'not-allowed' || event.code === 'service-not-allowed') {
    return MESSAGES.blocked;
  }
  if (event.code === 'no-speech') {
    return MESSAGES.noSpeech;
  }
  return `Voice capture is off. ${event.message || ''}`.trim();
}

/**
 * @param {Object} options
 * @param {() => (Object|null)} options.getDictation - the page's voice-typing controller, if any
 * @param {(text: string) => boolean} options.onTrigger - the citation trigger for final transcripts
 * @param {(change: {listening: boolean, message: string}) => void} options.onChange
 * @param {() => (HTMLElement|null)} [options.returnFocus] - where focus goes after the question
 * @param {() => (string|undefined)} [options.language] - the student's dictation language
 */
export function createVoiceCaptureSession(options) {
  const { getDictation, onTrigger, onChange } = options;
  const returnFocus = options.returnFocus || (() => null);
  const language = options.language || (() => undefined);

  /** @type {'off'|'starting'|'listening'} */
  let state = 'off';
  let recogniser = null;
  let owned = false;
  let release = () => {};
  let attempt = 0;
  let restartPending = false;
  let startedSinceRestart = false;

  function report(message) {
    onChange({ listening: state === 'listening', message });
  }

  /** Let go of the recogniser: stop and destroy one of our own, unbind from a shared one. */
  function teardown() {
    attempt++;
    release();
    release = () => {};
    if (recogniser) {
      if (owned) {
        recogniser.stopListening();
        recogniser.destroy();
      } else {
        recogniser.onCitationTrigger = () => false;
      }
    }
    recogniser = null;
    restartPending = false;
    startedSinceRestart = false;
    state = 'off';
  }

  function finish(message) {
    teardown();
    report(message);
  }

  /**
   * Chrome ends a continuous recogniser with `no-speech` after a few seconds of silence, then
   * `end`. Our own recogniser is still wanted, so it is started again once `end` has landed
   * (starting before then throws). A restart that hears silence again without ever starting is
   * not retried: that would spin.
   */
  function restartAfterSilence() {
    restartPending = false;
    startedSinceRestart = false;
    if (!recogniser.startListening(null)) {
      finish(MESSAGES.cannotStart);
    }
  }

  function onState(event) {
    if (event.type === 'start') {
      startedSinceRestart = true;
      if (state === 'starting') {
        state = 'listening';
        report(MESSAGES.listening);
      }
    } else if (event.type === 'error') {
      if (event.code === 'no-speech' && owned && startedSinceRestart) {
        restartPending = true;
      } else {
        finish(errorMessage(event));
      }
    } else if (event.type === 'end') {
      if (restartPending) {
        restartAfterSilence();
      } else {
        finish(owned ? MESSAGES.endedOwn : MESSAGES.endedShared);
      }
    }
  }

  function listenOn(shared) {
    recogniser = shared;
    owned = false;
    shared.onCitationTrigger = onTrigger;
    release = shared.addStateListener(onState);
    state = shared.isRecording ? 'listening' : 'starting';
    report(state === 'listening' ? MESSAGES.listening : MESSAGES.starting);
  }

  async function startOwn() {
    state = 'starting';
    const mine = ++attempt;
    report(MESSAGES.starting);
    const allowed = await allowDictation({ returnFocus: returnFocus() });
    if (mine !== attempt) {
      return; // turned off while the question was open
    }
    if (!allowed) {
      finish(MESSAGES.declined);
      return;
    }
    recogniser = new STTController({
      ...CAPTURE_SETTINGS,
      language: language(),
      // Asked just now; the controller must not ask again.
      confirmStart: () => true,
      onCitationTrigger: onTrigger,
    });
    owned = true;
    release = recogniser.addStateListener(onState);
    if (!recogniser.startListening(null)) {
      finish(MESSAGES.cannotStart);
    }
  }

  function arm() {
    const shared = getDictation();
    if (shared && (shared.isRecording || shared.isStarting)) {
      listenOn(shared);
      return;
    }
    startOwn();
  }

  function disarm() {
    const wasOwned = owned && recogniser !== null;
    const wasShared = !owned && recogniser !== null;
    teardown();
    if (wasOwned) {
      report(MESSAGES.stoppedOwn);
    } else if (wasShared) {
      report(MESSAGES.stoppedShared);
    } else {
      report(MESSAGES.cancelled);
    }
  }

  return {
    toggle() {
      if (state === 'off') {
        arm();
      } else {
        disarm();
      }
    },
    /** Turn off without a word: the bar is going away. */
    stop() {
      teardown();
    },
    get state() {
      return state;
    },
  };
}

export default { createVoiceCaptureSession };
