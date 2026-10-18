/**
 * Show Text Stats, declared as data.
 *
 * The one tool the popup draws outside every accordion section. Its switch sits in the
 * `.text-stats-bar` between the header and `<main>` (popup.html), so it is in no `data-section`
 * block, which is why the registry and its drift test both went a whole release without noticing
 * it existed. It carries `section: UNSECTIONED` to say that plainly rather than being
 * filed under a section it is not in.
 *
 * Transcribed from popup.html and popup.js, like every other file here: the ids are the elements
 * that exist today, the paths are the keys the current handler writes, and the defaults are what
 * the current handler falls back to.
 *
 * ONE SWITCH, TWO SETTINGS. The change handler (popup.js) writes the same boolean to both
 * `ui_overlay.show_text_stats_badge` and `ui_overlay.show_text_stats_notifications` — the bar is a
 * master switch over the pair, which Advanced Options then lets a student separate. The state
 * below names the badge key, because that is the one popup.js reads back to set the switch, and
 * declares the notifications key as a mirror rather than pretending only one path is written.
 *
 * It also mirrors both onto the top-level chrome.storage.local keys `textStatsBadgeVisible` and
 * `textStatsNotificationsEnabled`, which is how the content script hears about the change
 * (`textStats-ui.js` watches them). Those are a delivery mechanism, not a second source of truth:
 * popup.js reads the switch's state from `ui_overlay`, so that is what `state.path` names. They are
 * declared as mirrors all the same — anything that writes this tool without them changes the popup
 * and nothing else, which is the shape of the bug the discovery quiz was shipping.
 */

import { UNSECTIONED } from '../tool-schema.js';

/** @type {Object[]} */
export const TEXT_STATS_TOOLS = [
  {
    id: 'text-stats',
    icon: '📊',
    name: 'Show Text Stats',
    description: 'Word count and reading time for the page on screen',
    section: UNSECTIONED,
    // Reading: it measures the page in front of the student — `document.body.innerText`, scoped to
    // the selection, the page or the whole document — and answers "how long is this to read?".
    group: 'Reading',
    toggleId: 'main-text-stats-toggle',
    // popup.js reads `uiOverlay.show_text_stats_badge === true` — off unless the student turns it
    // on. `alsoWrites` records the second key the one switch sets; see the file header.
    state: {
      store: 'settings',
      path: 'ui_overlay.show_text_stats_badge',
      alsoWrites: [
        'ui_overlay.show_text_stats_notifications',
        // The two keys the content script watches. popup.js sets them in the same change handler
        // (popup.js:2624-2627), so a writer that skips them leaves the badge invisible.
        { store: 'local', path: 'textStatsBadgeVisible' },
        { store: 'local', path: 'textStatsNotificationsEnabled' },
      ],
      default: false,
    },
    // `ui_overlay` is its own namespace — there is no `ui_visibility.show_*` key for this tool, so
    // nothing can hide its row.
    visibilityKey: null,
    keywords:
      'word count characters sentences reading time length badge statistics ' +
      'how long is this how long will it take word limit essay length too long to read',
    controls: [
      // Both are built by popup.js when the Advanced Options modal opens, under "UI Overlay
      // Visibility", and split what the bar's switch sets together.
      {
        type: 'switch',
        id: 'show-text-stats-badge',
        label: 'Floating word-count badge',
        path: 'ui_overlay.show_text_stats_badge',
        // popup.js reads `=== true`.
        default: false,
        surface: 'advanced',
      },
      {
        type: 'switch',
        id: 'show-text-stats-notifications',
        label: 'Text stats notifications',
        path: 'ui_overlay.show_text_stats_notifications',
        // popup.js reads `=== true`.
        default: false,
        surface: 'advanced',
      },
    ],
    actions: [],
  },
];
