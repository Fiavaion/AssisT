/**
 * The Look Up Words accordion section, declared as data.
 *
 * The accordion header calls this section "Look Up Words", but the only two live tools in it are
 * Translation and the highlight-menu ("Quick Actions Menu") toolbar. A third feature this section's
 * `featureOrder` list still names — `dictionary` (a since-deleted settings manager listed it) — has
 * no markup left in popup.html: `toggleSection('dictionary-section', 'show_dictionary')` in
 * popup.js targets an element id that no longer exists. Dead wiring, not something to transcribe.
 *
 * The companion features' switches also live in this section's markup, between the two. They are
 * declared in companion.js, from the list the features themselves are started from, and drawn here
 * in markup order.
 *
 * Translation has no on/off checkbox at all (`toggleId: null`, matching AI Assist in reading.js) —
 * see the state comment on the `translation` tool below for what popup.js actually does with
 * `translation.enabled`.
 */

import { COMPANION_TOOLS } from './companion.js';

/** @type {Object[]} */
export const LOOKUP_TOOLS = [
  {
    id: 'translation',
    icon: '🌐',
    name: 'Translate Page',
    description: 'Translates the page or selected text',
    section: 'lookup',
    // Not the highlight-menu tool the task singles out for Writing — this one helps a student
    // understand what they're reading, so it stays with the other Reading supports.
    group: 'Reading',
    toggleId: null,
    // Nothing you switch on — something you do. No handler anywhere reads `translation.enabled` to
    // gate behaviour; the translation feature files carry no `enabled` check and the content script
    // loads them unconditionally. popup.js writes `{ enabled: true }` once, lazily, the first time
    // the target-language select changes (popup.js:1929-1931) — a side effect of storing the
    // language, not a switch. Giving this tool a state block would invent a control the student
    // cannot use, so it is declared action-only and the view must not draw it a switch.
    actionOnly: true,
    visibilityKey: 'show_translation',
    keywords:
      'translate language foreign page multilingual esl mymemory ' +
      'understand another language english is not my first language ' +
      'what does this mean in my own words',
    controls: [
      {
        type: 'select',
        id: 'translation-target-language',
        label: 'Target language',
        path: 'translation.targetLanguage',
        // popup.js:1925 — `this.settings.translation?.targetLanguage || 'en'`.
        default: 'en',
        options: [
          { value: 'en', label: '🇬🇧 English' },
          { value: 'es', label: '🇪🇸 Spanish' },
          { value: 'fr', label: '🇫🇷 French' },
          { value: 'de', label: '🇩🇪 German' },
          { value: 'it', label: '🇮🇹 Italian' },
          { value: 'pt', label: '🇵🇹 Portuguese' },
          { value: 'nl', label: '🇳🇱 Dutch' },
          { value: 'pl', label: '🇵🇱 Polish' },
          { value: 'ru', label: '🇷🇺 Russian' },
          { value: 'zh', label: '🇨🇳 Chinese' },
          { value: 'ja', label: '🇯🇵 Japanese' },
          { value: 'ko', label: '🇰🇷 Korean' },
          { value: 'ar', label: '🇸🇦 Arabic' },
          { value: 'hi', label: '🇮🇳 Hindi' },
        ],
      },
    ],
    actions: [{ id: 'btn-translate-page', label: 'Translate Page', visibilityKey: null }],
  },

  ...COMPANION_TOOLS,

  {
    id: 'highlight-menu',
    icon: '✨',
    name: 'Quick Actions Menu',
    description: 'Shows quick actions when you select text',
    section: 'lookup',
    // Directed by the task: this tool goes to Writing, not Reading.
    group: 'Writing',
    toggleId: 'highlight-menu-enabled',
    // popup.js:1835 — `this.settings.highlightMenu.enabled !== false`.
    state: { store: 'settings', path: 'highlightMenu.enabled', default: true },
    visibilityKey: 'show_highlight_menu',
    keywords:
      'select text toolbar quick actions popup menu shortcuts ' +
      'buttons when i select a word do something with the words i picked',
    controls: [
      {
        type: 'switch',
        id: 'highlight-menu-show-tts',
        label: 'Read Aloud button',
        path: 'highlightMenu.showTTS',
        // popup.js:1879 — `this.settings.highlightMenu[key] !== false` (key: 'showTTS').
        default: true,
      },
      {
        type: 'switch',
        id: 'highlight-menu-show-dictionary',
        label: 'Dictionary button',
        path: 'highlightMenu.showDictionary',
        default: true,
      },
      {
        type: 'switch',
        id: 'highlight-menu-show-translate',
        label: 'Translate button',
        path: 'highlightMenu.showTranslate',
        default: true,
      },
      {
        type: 'switch',
        id: 'highlight-menu-show-annotate',
        label: 'Annotate button',
        path: 'highlightMenu.showAnnotate',
        default: true,
      },
      {
        type: 'switch',
        id: 'highlight-menu-show-speed-read',
        label: 'Speed Read button',
        path: 'highlightMenu.showSpeedRead',
        default: true,
      },
      {
        type: 'range',
        id: 'highlight-menu-auto-hide-delay',
        label: 'Auto-hide delay',
        path: 'highlightMenu.autoHideDelay',
        // popup.js:1904 — `this.settings.highlightMenu.autoHideDelay || 5000`.
        default: 5000,
        min: 1000,
        max: 10000,
        step: 1000,
        // Stored and read as milliseconds; the popup only *displays* it converted to seconds
        // (`${delay / 1000} second(s)`, popup.js:1906/1911), so no `unit` suffix is declared here
        // rather than guessing a display convention this file doesn't own.
      },
    ],
    actions: [],
  },
];

/*
 * `highlightMenu.*` is also mirrored, on every change, into a separate top-level
 * `highlightMenuSettings` key via `saveHighlightMenuSettings()` (popup.js:1190-1203) — that is
 * how `features/highlightMenu/highlightMenu.js` (a content-script module, different storage
 * origin expectations) reads its config. It is a write-time echo of the same values, not a second
 * source the popup UI reads from: every control above still binds to `assist_settings.highlightMenu.*`
 * (`store: 'settings'`), because that is what the checkboxes/slider actually read on load and what
 * `saveSettings()` persists as the settings object. A generic renderer built from this file that
 * writes `assist_settings.highlightMenu.*` and then wants the content script to see the change
 * live will need to also call the equivalent of `saveHighlightMenuSettings()` — flagged here rather
 * than silently dropped.
 */
