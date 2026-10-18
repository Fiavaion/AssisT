/**
 * Consent to send something off the device, one answer per destination (ADR 0006).
 *
 * A destination is a named service, not a URL: the service worker's request module owns the URLs,
 * and this module owns the student's answer. Every realm that needs the answer reads it from here
 * — the worker before it sends anything, the first-use panel and the first-run wizard when they
 * record it, the popup when a student withdraws it — so there is one storage shape and one reading
 * of it.
 *
 * Storage: each destination under its own `chrome.storage.local` key, `assist_consent_<destination>`,
 * holding { granted: boolean, at: ISO-8601 string }. One key per answer, so an answer is written in
 * a single `set` made in the same tick it is recorded: two realms recording at once cannot overwrite
 * each other, and a popup that closes straight after a press has already sent the write.
 *
 * Three rules, each with a test:
 *   - An answer that is missing, malformed or unreadable is NOT consent. It means "ask".
 *   - Nothing is cached. Every read goes to storage, so a withdrawal in the popup refuses the very
 *     next request everywhere.
 *   - The keys are local to the device. They are absent from the settings-export allowlist
 *     (`settings-portability.js`), and `consent-does-not-travel.test.js` keeps them absent.
 *
 * A new third-party service is one entry in DESTINATIONS, plus its request builder in the worker.
 * The cloud AI providers are destinations too, but their prompts are arbitrary text, so they have
 * no request builder: the cloud router checks `hasConsent(provider)` itself before any request.
 *
 * A destination whose host is an OPTIONAL host permission in the manifest has its origins listed
 * beside its request builder, in the worker's request module (the only file that may name a
 * third-party host), and `utils/host-permissions.js` asks Chrome for exactly those.
 *
 * @module utils/consent
 */

const CONSENT_KEY_PREFIX = 'assist_consent_';

/** A cloud AI provider, described the same way for each. */
function cloudAI(service) {
  return Object.freeze({
    service,
    sends: 'the text you ask about and your question',
    action: 'answer with cloud AI',
  });
}

/**
 * Every destination a student can be asked about, described in the words the panel and the wizard
 * show them. `service` is a name a student would recognise; `sends` says exactly what leaves the
 * device; `action` is what the feature was doing, for the message shown after a "not now".
 */
export const DESTINATIONS = Object.freeze({
  dictionary: Object.freeze({
    service: 'Free Dictionary',
    sends: 'the word you selected',
    action: 'look up words',
  }),
  translation: Object.freeze({
    service: 'MyMemory',
    sends: 'the text you selected and the two languages',
    action: 'translate text',
  }),
  // Translate Page is its own question: it sends far more than a selection, and on a course page
  // that can include other people's names (a discussion, a grades list).
  pageTranslation: Object.freeze({
    service: 'MyMemory',
    sends:
      'all the visible text of the whole page, which can include names shown on it (for example classmates on a discussion or grades page), and the two languages',
    action: 'translate the whole page',
  }),
  citations: Object.freeze({
    service: 'Crossref',
    sends: 'the DOI of the source (a code like 10.1000/xyz123)',
    action: 'fill in source details from a DOI',
  }),
  // Reading images in a language other than English needs that language's file, which is not in
  // the package (ADR 0008). It is a download, not a sending: the request names a public file.
  ocrLanguages: Object.freeze({
    service: 'jsDelivr',
    sends: 'only a request for the language file (no image and no text from the page)',
    action: 'read text in images in a language other than English',
    note: 'The file is downloaded once and kept in AssisT on this device.',
  }),
  citationVerification: Object.freeze({
    service: 'Semantic Scholar',
    sends: 'the first few words of the title of the source',
    action: 'check a reference by its title',
  }),
  // Dictation uses Chrome's own speech recognition, which is a Google service: the recording is
  // sent there to be turned into text. AssisT makes no request itself, so nothing here goes
  // through the worker; the dictation entry points check this answer before they start.
  dictation: Object.freeze({
    service: 'Google speech recognition (in Chrome)',
    sends: 'the sound of your voice while dictation is on, so that it can be turned into text',
    action: 'type with your voice',
  }),
  // Lecture capture goes to the same Google service, but it listens to the room, so the lecturer
  // and classmates are heard and sent as well. That is its own question, never dictation's yes.
  lectureCapture: Object.freeze({
    service: 'Google speech recognition (in Chrome)',
    sends:
      'everything the microphone hears while lecture capture is on (the sound of the room, including other people’s voices such as your lecturer and classmates)',
    action: 'make captions and notes from a lecture',
  }),
  anthropic: cloudAI('Anthropic (Claude)'),
  openai: cloudAI('OpenAI (ChatGPT)'),
  google: cloudAI('Google Gemini'),
  perplexity: cloudAI('Perplexity'),
});

/** The cloud AI providers, by the ids the cloud router and `cloudProvider` use. */
export const CLOUD_AI_DESTINATIONS = Object.freeze(['anthropic', 'openai', 'google', 'perplexity']);

/**
 * The words shown beside a cloud AI key field: which provider, what is sent, and that saving the
 * key is the yes. Saving the key is where consent to a provider is recorded.
 *
 * @param {string} provider - one of CLOUD_AI_DESTINATIONS
 * @returns {string}
 */
export function describeCloudConsent(provider) {
  const description = DESTINATIONS[provider];
  if (!CLOUD_AI_DESTINATIONS.includes(provider) || !description) {
    return '';
  }
  return (
    `When you use AI, AssisT sends ${description.sends} to ${description.service}. ` +
    `Saving your key, or pressing "Allow access to ${description.service}", allows this. ` +
    'You can stop it at any time in the AssisT popup: Advanced options (the gear button), ' +
    'then Your data.'
  );
}

const DETAIL_MAX_CHARS = 100;

function shorten(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > DETAIL_MAX_CHARS ? `${flat.slice(0, DETAIL_MAX_CHARS - 1)}…` : flat;
}

/**
 * The words of the first-use question, for the in-page panel and the consent window alike, so a
 * student reads the same question wherever it is asked.
 *
 * @param {string} destination - a key of DESTINATIONS
 * @param {Object} [options]
 * @param {string} [options.detail] - the exact thing that would be sent, shortened here
 * @param {string} [options.detailLabel] - the words before it, when "This time that is:" is untrue
 * @param {boolean} [options.declinedBefore] - the student said no before
 * @returns {{title: string, earlier: string|null, purpose: string, note: string|null,
 *   detailLabel: string|null, detail: string|null, reassurance: string}|null} null for an unknown
 *   destination
 */
export function describeConsentQuestion(destination, options = {}) {
  if (!isKnownDestination(destination)) {
    return null;
  }
  const { service, sends, action, note } = DESTINATIONS[destination];
  const { detail, detailLabel, declinedBefore } = options;
  const hasDetail = typeof detail === 'string' && detail.trim().length > 0;
  return {
    title: `Use ${service}?`,
    earlier: declinedBefore ? 'Earlier you chose not to allow this, so nothing was sent.' : null,
    purpose: `To ${action}, AssisT sends ${sends} to ${service}, an online service.`,
    note: note || null,
    detailLabel: hasDetail
      ? typeof detailLabel === 'string' && detailLabel.trim()
        ? detailLabel
        : 'This time that is:'
      : null,
    detail: hasDetail ? `“${shorten(detail)}”` : null,
    reassurance:
      'Nothing else is sent: not your name, not your account. You can change your mind later.',
  };
}

/** @typedef {'granted'|'declined'|'unasked'} ConsentState */

function isKnownDestination(destination) {
  return typeof destination === 'string' && Object.hasOwn(DESTINATIONS, destination);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The storage key that holds one destination's answer.
 * @param {string} destination - a key of DESTINATIONS
 * @returns {string}
 */
export function consentStorageKey(destination) {
  return `${CONSENT_KEY_PREFIX}${destination}`;
}

/** Every key an answer can be stored under, for the settings export to leave out. */
export const CONSENT_STORAGE_KEYS = Object.freeze(Object.keys(DESTINATIONS).map(consentStorageKey));

/**
 * The stored entries for these destinations, or none when storage cannot be read.
 * @param {string[]} destinations
 * @returns {Promise<Object>} keyed by storage key
 */
async function readEntries(destinations) {
  try {
    const result = await chrome.storage.local.get(destinations.map(consentStorageKey));
    return isPlainObject(result) ? result : {};
  } catch {
    return {};
  }
}

/**
 * The state one stored entry represents. Only a real boolean is an answer.
 * @param {*} entry
 * @returns {ConsentState}
 */
function stateOf(entry) {
  if (!isPlainObject(entry)) {
    return 'unasked';
  }
  if (entry.granted === true) {
    return 'granted';
  }
  if (entry.granted === false) {
    return 'declined';
  }
  return 'unasked';
}

/**
 * The student's answer for a destination.
 * @param {string} destination
 * @returns {Promise<ConsentState>}
 */
export async function getConsent(destination) {
  if (!isKnownDestination(destination)) {
    return 'unasked';
  }
  const entries = await readEntries([destination]);
  return stateOf(entries[consentStorageKey(destination)]);
}

/**
 * True only when the student has said yes to this destination and the answer can be read.
 * @param {string} destination
 * @returns {Promise<boolean>}
 */
export async function hasConsent(destination) {
  return (await getConsent(destination)) === 'granted';
}

/**
 * Record a yes or a no, with the time it was given. The write is one `set` of this destination's
 * own key, made before this function returns.
 * @param {string} destination
 * @param {boolean} granted - only `true` is a yes
 * @param {Date} [now]
 * @returns {Promise<void>}
 */
export function recordConsent(destination, granted, now = new Date()) {
  if (!isKnownDestination(destination)) {
    return Promise.reject(new Error(`Unknown destination: ${String(destination)}`));
  }
  try {
    return Promise.resolve(
      chrome.storage.local.set({
        [consentStorageKey(destination)]: { granted: granted === true, at: now.toISOString() },
      })
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Withdraw consent. Recorded as a no, so the feature explains itself rather than asking again.
 * @param {string} destination
 * @param {Date} [now]
 * @returns {Promise<void>}
 */
export function withdrawConsent(destination, now = new Date()) {
  return recordConsent(destination, false, now);
}

/**
 * Every destination this build knows, with its state and when it was answered.
 * @returns {Promise<Array<{destination: string, state: ConsentState, at: string|null, service: string, sends: string, action: string}>>}
 */
export async function listConsents() {
  const entries = await readEntries(Object.keys(DESTINATIONS));
  return Object.entries(DESTINATIONS).map(([destination, description]) => {
    const entry = entries[consentStorageKey(destination)];
    const state = stateOf(entry);
    return {
      destination,
      state,
      at: state === 'unasked' ? null : String(entry.at || '') || null,
      ...description,
    };
  });
}
