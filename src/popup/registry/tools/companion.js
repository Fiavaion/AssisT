/**
 * The companion features, declared as data.
 *
 * Their names, descriptions and storage come from COMPANION_FEATURES, the one list the content
 * scripts start and stop them from, so the popup cannot name a feature differently from the
 * feature itself. What that list does not say is where a student looks for each one, which is the
 * presentation below. Each switch is a checkbox in the Look Up Words section of popup.html
 * (`companion-${key}`), stored as `companionFeatures.<key>` in chrome.storage.local by
 * popup/companion-switches.js. Every feature defaults on (companion-settings.js).
 *
 * A feature added to COMPANION_FEATURES with no entry here has no icon or group, which the
 * registry's own validation rejects, and one with no checkbox in popup.html fails the drift test.
 */

import {
  COMPANION_FEATURES,
  COMPANION_STORAGE_KEY,
} from '../../../features/companion/companion-settings.js';
import { READING_LEVELS } from '../../../features/companion/reading-level.js';

/** Where each companion feature sits in Flat, and the words a student might search it by. */
const PRESENTATION = {
  studySuite: {
    icon: '🧠',
    group: 'Study',
    keywords:
      'study tools summarize summarise simplify tutor tasks graph study path tip ' +
      'select text what can i do with the words i picked help me study',
  },
  personalisedAi: {
    icon: '👤',
    group: 'Study',
    keywords:
      'personalise personalize ai learning profile my needs adapt answers pitched at me ' +
      'explain it my way',
  },
  mathReadAloud: {
    icon: '➗',
    group: 'Reading',
    keywords:
      'maths math equations formula numbers symbols read aloud highlight ' +
      'read the equations out loud',
  },
  authorship: {
    icon: '🛡️',
    group: 'Writing',
    keywords:
      'authorship writing history proof i wrote this myself academic integrity accused of ' +
      'using ai detector export record of my typing',
  },
  flashcards: {
    icon: '🗂️',
    group: 'Study',
    keywords:
      'flashcards flash cards revise revision spaced repetition memorise memorize remember ' +
      'quiz myself highlights citations exam',
  },
  summaryDial: {
    icon: '🎚️',
    group: 'Reading',
    keywords:
      'reading level plain language plain english simpler words easier summaries simplify ' +
      'too hard to read long words',
  },
  lecture: {
    icon: '🎓',
    group: 'Study',
    keywords:
      'lecture class captions subtitles notes microphone listen live transcript ' +
      'cant keep up with the teacher',
  },
  voiceCommands: {
    icon: '🗣️',
    group: 'Writing',
    keywords:
      'voice commands hands free speak talk control read this page save citation open library ' +
      'cant use the mouse or keyboard',
  },
};

/** The reading-level dial belongs to the switch that turns it on. */
const CONTROLS = {
  summaryDial: [
    {
      type: 'select',
      id: 'companion-reading-level',
      label: 'AI writing level',
      store: 'local',
      path: 'companionReadingLevel',
      // reading-level.js: anything unknown or unset reads as standard.
      default: 'standard',
      options: READING_LEVELS.map(level => ({ value: level.id, label: level.label })),
    },
  ],
};

/**
 * The lecture companion's way in. Its on-page chip is drawn on LMS hosts only and can be put away
 * per site, so the popup opens the card on whatever page is in front of the student
 * (companion-switches.js), and says why when it cannot.
 */
const ACTIONS = {
  lecture: [{ id: 'btn-open-lecture-notes', label: 'Start lecture captions', visibilityKey: null }],
};

const STATUS_LINES = {
  lecture: [{ id: 'lecture-launch-status' }],
};

/** @type {Object[]} */
export const COMPANION_TOOLS = COMPANION_FEATURES.map(feature => ({
  id: `companion-${feature.key}`,
  ...PRESENTATION[feature.key],
  name: feature.label,
  description: feature.description,
  section: 'lookup',
  toggleId: `companion-${feature.key}`,
  state: { store: 'local', path: `${COMPANION_STORAGE_KEY}.${feature.key}`, default: true },
  controls: CONTROLS[feature.key] || [],
  actions: ACTIONS[feature.key] || [],
  ...(STATUS_LINES[feature.key] ? { statusLines: STATUS_LINES[feature.key] } : {}),
}));
