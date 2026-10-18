/**
 * The onboarding queue — which guides a student asked for, in which order, and which are done.
 *
 * The welcome page asks one question ("which guides would you like to complete?") and the student
 * may pick any combination, including none. This module holds the answer: the pure ordering and
 * completion logic, plus the thin `chrome.storage` wrappers that let an external guide leave the
 * page and come back to it.
 *
 * THE ORDER IS THE INTERESTING PART. Two of the four tracks change settings in bulk — clean setup
 * clears everything, import restores a saved file — and two configure things afterwards. Run in
 * the order they were picked, "clean setup and discover your tools" could mean a student answers
 * a dozen questions and then has their answers wiped. So the queue always runs the bulk tracks
 * first: clean, import, AI setup, discover. TRACK_ORDER is that decision, and `buildQueue` sorts
 * by it rather than by what the student clicked first.
 *
 * RESUME PROTOCOL (unchanged): an external guide is launched with `?onboarding=1` and returns to
 * `welcome.html?resume=1&done=<trackId>`. The ids below are the ones both guides send back — see
 * `finishOnboardingOrClose` in discovery.js and the done screen in ai-setup.js.
 *
 * @module pages/onboarding/onboarding-queue
 */

/** @type {string} chrome.storage.local key for the serialised queue. */
export const QUEUE_STORAGE_KEY = 'onboardingQueue';

/**
 * Queue order: what changes everything runs before what configures anything.
 * @type {string[]}
 */
export const TRACK_ORDER = ['clean', 'import', 'ai-setup', 'discover'];

/**
 * The guides on offer.
 *
 * `kind:'external'` navigates to its own page and comes back through the resume protocol;
 * `kind:'inline'` is carried out on the welcome page itself. `destructive` marks a track that
 * takes settings away, so the page can say so before it runs rather than after.
 *
 * Neither inline track carries a feature list. Clean setup derives what "everything" means from
 * the popup's tool registry (`clean-setup.js`) and import takes it from the student's file
 * (`utils/settings-portability.js`), so a list here would be a third source of truth for the same
 * question, free to drift from both.
 *
 * @type {Record<string, {
 *   id: string,
 *   label: string,
 *   description: string,
 *   kind: 'external'|'inline',
 *   destructive: boolean,
 *   requiresAI: boolean,
 *   url?: string
 * }>}
 */
export const TRACK_CONFIG = {
  clean: {
    id: 'clean',
    label: 'Clean setup — all features off',
    description:
      'Switches off every AssisT feature, including read aloud, so you start from nothing and add only what you want. Your citations, notes and highlights are not touched.',
    kind: 'inline',
    destructive: true,
    requiresAI: false,
  },
  import: {
    id: 'import',
    label: 'Import settings from a previous install',
    description:
      'Restores the settings file you saved from another computer, or before reinstalling. Your API keys are never in that file, so you set those up again.',
    kind: 'inline',
    destructive: false,
    requiresAI: false,
  },
  'ai-setup': {
    id: 'ai-setup',
    label: 'AI setup',
    description:
      'Choose whether AssisT uses AI, and where it runs — in your browser, on your own machine, or in the cloud. You can leave it off.',
    kind: 'external',
    url: 'src/pages/ai-setup/ai-setup.html',
    destructive: false,
    requiresAI: true,
  },
  discover: {
    id: 'discover',
    label: 'Discover your tools',
    description:
      'A few questions about how you read, write and focus. AssisT then switches on the supports that match, dictation included.',
    kind: 'external',
    url: 'src/pages/discovery/discovery.html',
    destructive: false,
    requiresAI: false,
  },
};

/**
 * What to tell a student whose selection contradicts itself.
 *
 * Clean setup clears everything and import puts a saved setup back, so picking both is close to
 * meaningless. The page does NOT disable either checkbox over it: taking away a control a student
 * has deliberately reached for is a worse failure — especially by keyboard or screen reader — than
 * a sentence saying what will happen. The queue order makes the outcome definite (clean, then
 * import), and this is that outcome in plain words.
 *
 * @param {string[]} selectedTrackIds
 * @returns {string|null} null when there is nothing to warn about
 */
export function selectionWarning(selectedTrackIds) {
  if (!Array.isArray(selectedTrackIds)) {
    return null;
  }
  if (selectedTrackIds.includes('clean') && selectedTrackIds.includes('import')) {
    return 'You have picked both a clean setup and an import. AssisT will switch everything off first, then restore your file over the top — so the file is what you end up with. Untick one if that is not what you want.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * @typedef {{ trackId: string, kind: 'external'|'inline', label: string, requiresAI: boolean, status: 'pending'|'done', url?: string }} Step
 */

/**
 * Build an ordered, deduped queue from the selected track ids.
 * Unknown ids are dropped; the result follows TRACK_ORDER, never the click order.
 *
 * @param {string[]} selectedTrackIds
 * @returns {Step[]}
 */
export function buildQueue(selectedTrackIds) {
  if (!Array.isArray(selectedTrackIds)) {
    return [];
  }

  const picked = new Set(selectedTrackIds);

  return TRACK_ORDER.filter(id => picked.has(id) && TRACK_CONFIG[id] !== undefined).map(id => {
    const cfg = TRACK_CONFIG[id];
    /** @type {Step} */
    const step = {
      trackId: id,
      kind: cfg.kind,
      label: cfg.label,
      requiresAI: cfg.requiresAI,
      status: 'pending',
    };
    if (cfg.kind === 'external') {
      step.url = cfg.url;
    }
    return step;
  });
}

/**
 * Return a new queue with the named step marked done. Immutable.
 *
 * @param {Step[]} queue
 * @param {string} trackId
 * @returns {Step[]}
 */
export function markDone(queue, trackId) {
  return queue.map(step => (step.trackId === trackId ? { ...step, status: 'done' } : { ...step }));
}

/**
 * The first step that is not done, or null when they all are.
 *
 * @param {Step[]} queue
 * @returns {Step|null}
 */
export function nextStep(queue) {
  return queue.find(step => step.status !== 'done') ?? null;
}

/**
 * True when every step is done. An empty queue — the student picked nothing — is complete.
 *
 * @param {Step[]} queue
 * @returns {boolean}
 */
export function isComplete(queue) {
  return queue.every(step => step.status === 'done');
}

/**
 * How many steps are still to do.
 *
 * @param {Step[]} queue
 * @returns {number}
 */
export function remainingCount(queue) {
  return queue.filter(step => step.status !== 'done').length;
}

// ---------------------------------------------------------------------------
// Storage-backed functions (thin wrappers; guard against a missing chrome API)
// ---------------------------------------------------------------------------

/**
 * Persist the queue.
 *
 * @param {Step[]} queue
 * @returns {Promise<void>}
 */
export async function saveQueue(queue) {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }
  await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: queue });
}

/**
 * Load the queue, or null when there is none.
 *
 * @returns {Promise<Step[]|null>}
 */
export async function loadQueue() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return null;
  }
  const result = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
  const val = result[QUEUE_STORAGE_KEY];
  return Array.isArray(val) ? val : null;
}

/**
 * Forget the queue.
 *
 * @returns {Promise<void>}
 */
export async function clearQueue() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }
  await chrome.storage.local.remove(QUEUE_STORAGE_KEY);
}
