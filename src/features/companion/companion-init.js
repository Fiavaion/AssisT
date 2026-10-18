/**
 * Companion bootstrapper — lazily starts each enabled companion feature UI.
 *
 * Each feature lives in its own module exporting `init()` / `cleanup()` (both idempotent) and is
 * registered here with one loader line, so reverting a feature's commit removes both its file and
 * its registration cleanly. Toggles are read at (re)init AND watched afterwards, so switching a
 * support off takes its UI off the page there and then: a student who switches everything off and
 * still sees a chip of ours has not been given their page back.
 *
 * @module features/companion/companion-init
 */

import { getCompanionSettings, onCompanionSettingsChange } from './companion-settings.js';

const FEATURE_LOADERS = {
  // One line per feature. LMS-page-specific companions are developed separately — only
  // platform-neutral features load here.
  studySuite: () => import('./study-suite-ui.js'),
  flashcards: () => import('../flashcards/flashcards-ui.js'),
  authorship: () => import('../authorship/authorship-ui.js'),
  lecture: () => import('./lecture-ui.js'),
  voiceCommands: () => import('./voice-palette-ui.js'),
};

const loadedModules = new Map();

async function startFeature(key) {
  try {
    let mod = loadedModules.get(key);
    if (!mod) {
      mod = await FEATURE_LOADERS[key]();
      loadedModules.set(key, mod);
    }
    if (typeof mod.init === 'function') {
      await mod.init();
    }
  } catch (error) {
    console.error(`[Companion] Feature "${key}" failed to start:`, error);
  }
}

/** Take one feature's UI off the page. Safe for a feature that was never started. */
function stopFeature(key) {
  try {
    loadedModules.get(key)?.cleanup?.();
  } catch (error) {
    console.error(`[Companion] Feature "${key}" failed to stop:`, error);
  }
}

/** True once the toggles are being watched; the watch outlives an SPA re-init. */
let watchingToggles = false;

function watchToggles() {
  if (watchingToggles) {
    return;
  }
  watchingToggles = true;
  onCompanionSettingsChange(settings => {
    for (const key of Object.keys(FEATURE_LOADERS)) {
      if (settings[key] === true) {
        startFeature(key);
      } else {
        stopFeature(key);
      }
    }
  });
}

export async function companion_initialize() {
  watchToggles();
  try {
    const settings = await getCompanionSettings();
    const enabled = Object.keys(FEATURE_LOADERS).filter(key => settings[key] === true);
    await Promise.allSettled(enabled.map(startFeature));
    if (enabled.length > 0) {
      console.log('[Companion] Started:', enabled.join(', '));
    }
  } catch (error) {
    console.error('[Companion] Initialization failed:', error);
  }
}

/**
 * Tear down every started companion feature, leaving nothing of theirs on the page.
 */
export function companion_cleanup() {
  for (const mod of loadedModules.values()) {
    try {
      mod.cleanup?.();
    } catch {
      // A failed cleanup must not block the others
    }
  }
}

/**
 * Open the lecture-notes card, for the popup's "Start lecture captions" button (the content
 * script's OPEN_LECTURE_NOTES). The lecture module loads here as it does for its chip, so it stays
 * a lazy chunk.
 * @returns {Promise<boolean>} whether the card is open
 */
export async function companion_openLectureNotes() {
  let mod = loadedModules.get('lecture');
  if (!mod) {
    mod = await FEATURE_LOADERS.lecture();
    // Kept with the others, so cleanup on navigation reaches a card opened this way.
    loadedModules.set('lecture', mod);
  }
  return mod.openLectureNotes();
}

/**
 * SPA-navigation hook: tear down every started feature, then re-detect on the new page.
 */
export async function companion_reinit() {
  companion_cleanup();
  await companion_initialize();
}

companion_initialize();
