/**
 * Which voice reads aloud, and at what rate, pitch and volume.
 *
 * Every read-aloud path asks this module, so the default cannot differ between features.
 *
 * The rule for the default: a voice that runs on the device. On desktop Chrome the "Google ..."
 * voices are network voices (`localService === false`), and whatever they read is sent to Google.
 * A student who never opened the voice picker has not agreed to that, so an unchosen voice is
 * always a device voice matching the page's language. A voice the student did choose is used as
 * chosen, online or not: the picker labels online voices, so choosing one is an informed act.
 *
 * The saved settings live in `assist_settings.tts` as `{ voice, rate, pitch, volume }`, where
 * `voice` is a voice name and `'default'` (or nothing) means "not chosen".
 *
 * @module utils/speech-voice
 */

/** How long to wait for an engine that has not published its voices yet. */
export const VOICES_TIMEOUT_MS = 2000;

/** The stored value that means the student has not picked a voice. */
export const AUTOMATIC_VOICE = 'default';

/** What the speech numbers fall back to, and the ranges the Web Speech API accepts. */
const SPEECH_NUMBERS = {
  rate: { fallback: 1, min: 0.1, max: 10 },
  pitch: { fallback: 1, min: 0, max: 2 },
  volume: { fallback: 1, min: 0, max: 1 },
};

/**
 * True when the voice runs on a server, so the text it reads leaves the device.
 * @param {SpeechSynthesisVoice|null|undefined} voice
 * @returns {boolean}
 */
export function isOnlineVoice(voice) {
  return Boolean(voice) && voice.localService === false;
}

/**
 * Only a voice that says it is local counts as local; one that does not say is not trusted to be.
 * @param {SpeechSynthesisVoice} voice
 * @returns {boolean}
 */
function isDeviceVoice(voice) {
  return Boolean(voice) && voice.localService === true;
}

/**
 * The company an online voice sends its text to, when the voice's name says so.
 * @param {SpeechSynthesisVoice} voice
 * @returns {string|null}
 */
function voiceProvider(voice) {
  const name = String(voice?.name || '');
  if (name.startsWith('Google')) {
    return 'Google';
  }
  if (name.startsWith('Microsoft')) {
    return 'Microsoft';
  }
  return null;
}

/**
 * The text of a voice's option in a picker. An online voice says so in words, because that text is
 * what a screen reader reads out with the option.
 *
 * @param {SpeechSynthesisVoice} voice
 * @returns {string}
 */
export function voiceOptionLabel(voice) {
  const base = voice.lang ? `${voice.name} (${voice.lang})` : voice.name;
  if (!isOnlineVoice(voice)) {
    return base;
  }
  const provider = voiceProvider(voice);
  return `${base}, online: sends the text ${provider ? `to ${provider}` : 'over the internet'}`;
}

const normaliseLang = lang =>
  String(lang || '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();
const primaryOf = lang => normaliseLang(lang).split('-')[0];

/**
 * The language to pick a default voice for: the page's own, with the browser's region when the
 * page names only the language (`en` on the page, `en-GB` in the browser, reads as `en-GB`).
 *
 * @param {Document} [doc]
 * @param {{language?: string}} [nav]
 * @returns {string}
 */
export function pageLanguage(doc = globalThis.document, nav = globalThis.navigator) {
  const page = (doc?.documentElement?.lang || '').trim();
  const browser = (nav?.language || '').trim();
  if (!page) {
    return browser || 'en';
  }
  if (!page.includes('-') && primaryOf(browser) === primaryOf(page) && browser.includes('-')) {
    return browser;
  }
  return page;
}

/**
 * The voice to speak with.
 *
 * The student's saved voice when it is installed, whatever kind it is. Otherwise a device voice:
 * the page's language and region, then the page's language in any region, then the device's own
 * default voice, then the first device voice. With no device voice at all it returns null and the
 * engine chooses; it never picks an online voice itself.
 *
 * @param {SpeechSynthesisVoice[]|undefined} voices
 * @param {{savedName?: string, lang?: string}} [options]
 * @returns {SpeechSynthesisVoice|null}
 */
export function chooseVoice(voices, { savedName, lang } = {}) {
  const list = Array.isArray(voices) ? voices : [];
  if (savedName && savedName !== AUTOMATIC_VOICE) {
    const saved = list.find(voice => voice.name === savedName);
    if (saved) {
      return saved;
    }
  }

  const local = list.filter(isDeviceVoice);
  const wanted = normaliseLang(lang);
  const preferDefault = candidates => candidates.find(voice => voice.default) || candidates[0];
  return (
    preferDefault(local.filter(voice => wanted && normaliseLang(voice.lang) === wanted)) ||
    preferDefault(local.filter(voice => wanted && primaryOf(voice.lang) === primaryOf(wanted))) ||
    preferDefault(local) ||
    null
  );
}

/**
 * A saved speech number when it is one the API accepts, otherwise the default. A volume of 0 is a
 * real setting (the popup's slider offers 0%), so it is kept, not treated as missing.
 *
 * @param {'rate'|'pitch'|'volume'} kind
 * @param {*} value
 * @returns {number}
 */
function speechNumber(kind, value) {
  const { fallback, min, max } = SPEECH_NUMBERS[kind];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/**
 * The voice for text known to be in `lang`. The chosen voice when it speaks that language;
 * otherwise a device voice that does, because another language's voice garbles the text (and an
 * online one would send it off the device for nothing). The chosen voice when no device voice
 * speaks it.
 *
 * @param {SpeechSynthesisVoice|null} chosen
 * @param {SpeechSynthesisVoice[]} voices
 * @param {string} lang
 * @returns {SpeechSynthesisVoice|null}
 */
function voiceForLanguage(chosen, voices, lang) {
  if (!chosen || primaryOf(chosen.lang) === primaryOf(lang)) {
    return chosen;
  }
  const device = chooseVoice(voices, { lang });
  return device && primaryOf(device.lang) === primaryOf(lang) ? device : chosen;
}

/**
 * The voice and numbers to speak with, from the saved `assist_settings.tts`.
 *
 * @param {Object|undefined} tts - `assist_settings.tts`
 * @param {SpeechSynthesisVoice[]} voices
 * @param {{lang?: string}} [options] - the language the text is in, when it is known and may not
 *   be the page's (a translation); the page's language is used when omitted
 * @returns {{voice: SpeechSynthesisVoice|null, rate: number, pitch: number, volume: number}}
 */
export function resolveSpeech(tts, voices, { lang } = {}) {
  const saved = tts || {};
  const chosen = chooseVoice(voices, { savedName: saved.voice, lang: lang || pageLanguage() });
  return {
    voice: lang ? voiceForLanguage(chosen, voices, lang) : chosen,
    rate: speechNumber('rate', saved.rate),
    pitch: speechNumber('pitch', saved.pitch),
    volume: speechNumber('volume', saved.volume),
  };
}

/**
 * Put resolved speech settings on an utterance. A null voice leaves the engine's choice alone.
 *
 * @param {SpeechSynthesisUtterance} utterance
 * @param {{voice: SpeechSynthesisVoice|null, rate: number, pitch: number, volume: number}} speech
 * @returns {SpeechSynthesisUtterance}
 */
export function applySpeech(utterance, speech) {
  utterance.rate = speech.rate;
  utterance.pitch = speech.pitch;
  utterance.volume = speech.volume;
  if (speech.voice) {
    utterance.voice = speech.voice;
  }
  return utterance;
}

/**
 * The engine's voices, waiting for `voiceschanged` when it has not published them yet. Chrome
 * returns an empty list at first; the timeout covers an engine that never fires the event.
 *
 * @param {SpeechSynthesis} [synth]
 * @param {number} [timeoutMs]
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export function waitForVoices(synth = globalThis.speechSynthesis, timeoutMs = VOICES_TIMEOUT_MS) {
  return new Promise(resolve => {
    const ready = synth.getVoices() || [];
    if (ready.length > 0) {
      resolve(ready);
      return;
    }
    let timer = 0;
    const finish = () => {
      synth.removeEventListener('voiceschanged', onChanged);
      clearTimeout(timer);
      resolve(synth.getVoices() || []);
    };
    const onChanged = () => {
      if ((synth.getVoices() || []).length > 0) {
        finish();
      }
    };
    synth.addEventListener('voiceschanged', onChanged);
    timer = setTimeout(finish, timeoutMs);
  });
}

/**
 * An utterance for `text` in the student's saved voice, rate, pitch and volume, read fresh from
 * storage so a change in the popup is heard on the next reading. Unreadable settings still speak,
 * at the defaults and in a device voice.
 *
 * @param {string} text
 * @param {{lang?: string}} [options] - the language of `text` when it is not the page's
 * @returns {Promise<SpeechSynthesisUtterance>}
 */
export async function createSavedUtterance(text, { lang } = {}) {
  let tts;
  try {
    const stored = await chrome.storage.local.get('assist_settings');
    tts = stored?.assist_settings?.tts;
  } catch (error) {
    console.warn('[Speech] Could not read the saved voice settings:', error?.message);
  }
  const voices = await waitForVoices(window.speechSynthesis);
  const utterance = new SpeechSynthesisUtterance(text);
  if (lang) {
    utterance.lang = lang;
  }
  return applySpeech(utterance, resolveSpeech(tts, voices, { lang }));
}
