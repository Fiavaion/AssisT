/**
 * The companion features' checkboxes in the popup accordion: fill them from storage, store changes.
 *
 * Flat draws one switch per companion feature and drives the accordion checkbox of the same id
 * (flat/flat-mount.js), exactly as it does for every other support. This is those checkboxes'
 * handler. The markup is static in popup.html, so the drift test holds it to the registry, and a
 * feature added to COMPANION_FEATURES without a checkbox fails that test instead of shipping a
 * feature no student can switch. Content scripts watch `companionFeatures` and start or stop the
 * feature in open tabs as it changes (companion-init.js). The lecture companion's "Start lecture
 * captions" button is wired here too, beside its switch.
 *
 * @module popup/companion-switches
 */

import {
  COMPANION_FEATURES,
  getCompanionSettings,
  setCompanionEnabled,
} from '../features/companion/companion-settings.js';
import {
  READING_LEVELS,
  getReadingLevel,
  setReadingLevel,
} from '../features/companion/reading-level.js';
import { attachAccessibleHandler } from '../utils/event-handlers.js';

/** How long "Lecture notes are open" stays on screen before the popup closes, as other launchers. */
const CLOSE_DELAY_MS = 300;

const LAUNCH_MESSAGES = {
  noTab: 'There is no page open to show lecture captions on.',
  restricted:
    'Chrome does not let extensions work on this page. Open your lecture page in a normal tab, ' +
    'then press Start lecture captions again.',
  notRunning:
    'AssisT is not running on this page. Reload the page and try again. On sites other than ' +
    'Canvas, Moodle and Google Classroom, AssisT first needs permission to run on all websites.',
  off: 'The lecture companion is switched off. Turn on its switch in this list, then press Start lecture captions again.',
  failed: 'Lecture captions could not open on this page. Reload the page and try again.',
  opened: 'Lecture notes are open on the page.',
};

/**
 * Pages Chrome keeps every extension out of: its own pages, other extensions and the Web Store.
 * @param {string} url
 * @returns {boolean}
 */
function isClosedToExtensions(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
    return true;
  }
  return (
    parsed.hostname === 'chromewebstore.google.com' ||
    (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore'))
  );
}

/**
 * Ask the active tab to open the lecture-notes card (OPEN_LECTURE_NOTES, content-simple.js).
 * @returns {Promise<keyof LAUNCH_MESSAGES>}
 */
async function openLectureNotesInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return 'noTab';
  }
  const url = tab.url || tab.pendingUrl || '';
  if (url && isClosedToExtensions(url)) {
    return 'restricted';
  }
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_LECTURE_NOTES' });
  } catch {
    // No content script answered: a site AssisT has no access to, or a page loaded before it.
    return 'notRunning';
  }
  if (response && response.success) {
    return 'opened';
  }
  return response && response.error === 'Lecture companion is off' ? 'off' : 'failed';
}

/**
 * Wire "Start lecture captions": open the card on the page and close the popup, or say why not.
 * @param {Document} doc
 */
function bindLectureLauncher(doc) {
  const button = doc.getElementById('btn-open-lecture-notes');
  const status = doc.getElementById('lecture-launch-status');
  if (!button || !status) {
    return;
  }
  attachAccessibleHandler(button, 'Start lecture captions', async () => {
    let outcome;
    try {
      outcome = await openLectureNotesInActiveTab();
    } catch (error) {
      console.error('[Popup] Could not open the lecture notes:', error);
      outcome = 'failed';
    }
    status.textContent = LAUNCH_MESSAGES[outcome];
    if (outcome === 'opened') {
      setTimeout(() => doc.defaultView.close(), CLOSE_DELAY_MS);
    }
  });
}

/**
 * Show the stored state on every companion checkbox and the reading-level dial, and store each
 * change as it happens. Resolves once the state is painted, so the caller can redraw Flat from it.
 *
 * @param {Document} doc
 * @returns {Promise<void>}
 */
export async function bindCompanionSwitches(doc) {
  const settings = await getCompanionSettings();

  for (const feature of COMPANION_FEATURES) {
    const input = doc.getElementById(`companion-${feature.key}`);
    if (!input) {
      continue;
    }
    input.checked = settings[feature.key] === true;
    // A checkbox takes `change`: the shared mousedown helper's preventDefault stops it flipping.
    input.addEventListener('change', () => {
      setCompanionEnabled(feature.key, input.checked).catch(error => {
        console.error(`[Popup] Could not save the ${feature.label} switch:`, error);
      });
    });
  }

  bindLectureLauncher(doc);

  const dial = doc.getElementById('companion-reading-level');
  if (!dial) {
    return;
  }
  for (const level of READING_LEVELS) {
    const option = doc.createElement('option');
    option.value = level.id;
    option.textContent = level.label;
    dial.appendChild(option);
  }
  dial.value = await getReadingLevel();
  dial.addEventListener('change', () => {
    setReadingLevel(dial.value).catch(error => {
      console.error('[Popup] Could not save the reading level:', error);
    });
  });
}
