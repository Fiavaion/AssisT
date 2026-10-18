/**
 * The Writing accordion section, declared as data.
 *
 * Transcribed from popup.html (`data-section="writing"`) and the handlers `setupSTT()` /
 * `initializeVocabulary()` / `setupAnnotations()` in popup.js — every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 */

/** @type {Object[]} */
export const WRITING_TOOLS = [
  {
    id: 'stt',
    icon: '🎤',
    name: 'Speech-to-Text',
    description: 'Type using your voice in any text field',
    section: 'writing',
    group: 'Writing',
    toggleId: 'stt-enabled',
    // popup.js reads `this.settings.stt.enabled || false`.
    state: { store: 'settings', path: 'stt.enabled', default: false },
    visibilityKey: 'show_stt',
    keywords:
      'stt voice dictation talk type speak microphone dictate ' +
      'write for me say it instead of typing spelling is hard typing hurts my hands',
    controls: [
      {
        type: 'switch',
        id: 'stt-continuous-mode',
        label: 'Continuous Mode',
        path: 'stt.continuousMode',
        // popup.js reads `!== false` — on unless the student turns it off.
        default: true,
      },
      {
        type: 'select',
        id: 'stt-language',
        label: 'Language',
        path: 'stt.language',
        // popup.js reads `|| 'en-US'`.
        default: 'en-US',
        options: [
          { value: 'en-US', label: 'English (US)' },
          { value: 'en-GB', label: 'English (UK)' },
          { value: 'en-AU', label: 'English (Australia)' },
          { value: 'en-CA', label: 'English (Canada)' },
          { value: 'es-ES', label: 'Spanish (Spain)' },
          { value: 'es-MX', label: 'Spanish (Mexico)' },
          { value: 'fr-FR', label: 'French' },
          { value: 'de-DE', label: 'German' },
          { value: 'it-IT', label: 'Italian' },
          { value: 'pt-BR', label: 'Portuguese (Brazil)' },
          { value: 'pt-PT', label: 'Portuguese (Portugal)' },
          { value: 'nl-NL', label: 'Dutch' },
          { value: 'ja-JP', label: 'Japanese' },
          { value: 'ko-KR', label: 'Korean' },
          { value: 'zh-CN', label: 'Chinese (Simplified)' },
          { value: 'zh-TW', label: 'Chinese (Traditional)' },
        ],
      },
      {
        type: 'switch',
        id: 'stt-punctuation',
        label: 'Punctuation Help',
        // One checkbox, two keys: popup.js writes both on change and reads them back as
        // `punctuationCommands !== false || autoPunctuation !== false`.
        path: 'stt.punctuationCommands',
        alsoWrites: ['stt.autoPunctuation'],
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-voice-commands',
        label: 'Voice Editing Commands',
        path: 'stt.voiceCommands',
        // popup.js reads `!== false` (initialised to `true` if undefined).
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-auto-capitalize',
        label: 'Auto-Capitalize',
        path: 'stt.autoCapitalize',
        // popup.js reads `!== false`.
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-floating-button',
        label: 'Show Microphone Button',
        hint:
          'Turn this off and voice typing is still there: press Alt+Shift+V in any text box to ' +
          'start or stop dictation.',
        path: 'stt.floatingButton',
        // popup.js reads `!== false`.
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-interim-results',
        label: 'Show Interim Results',
        path: 'stt.interimResults',
        // popup.js reads `!== false`.
        default: true,
      },
      {
        type: 'select',
        id: 'stt-auto-punctuation-mode',
        label: 'Punctuation Mode',
        path: 'stt.autoPunctuationMode',
        // popup.js reads `|| 'auto'`.
        default: 'auto',
        options: [
          { value: 'auto', label: 'Automatic (fully automatic)' },
          { value: 'assisted', label: 'Assisted (suggestions only)' },
          { value: 'manual', label: 'Manual (spoken commands only)' },
        ],
      },
      {
        type: 'select',
        id: 'stt-engine',
        label: 'Recognition Engine',
        path: 'stt.engine',
        // popup.js reads `|| 'auto'` (initialised to `'auto'` if undefined; a stored `'whisper'`
        // is reset back to `'auto'` — Whisper is not yet available).
        default: 'auto',
        options: [
          { value: 'auto', label: 'Web Speech API (Browser Built-in)' },
          { value: 'web-speech', label: 'Web Speech API' },
          { value: 'whisper', label: 'Whisper Offline (coming soon)' },
        ],
      },
      {
        type: 'switch',
        id: 'stt-prefer-offline',
        label: 'Prefer Offline Mode',
        path: 'stt.preferOffline',
        // popup.js reads `!== false` (initialised to `true` if undefined).
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-confidence-feedback',
        label: 'Confidence Feedback',
        path: 'stt.confidenceFeedback',
        // popup.js reads `!== false` (initialised to `true` if undefined).
        default: true,
      },
      {
        type: 'range',
        id: 'stt-confidence-threshold',
        label: 'Minimum Confidence Threshold',
        path: 'stt.confidenceThreshold',
        // popup.js reads `|| 60` (initialised to `60` if undefined).
        default: 60,
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
      },
      {
        type: 'switch',
        id: 'stt-highlight-low-confidence',
        label: 'Highlight Low-Confidence Words',
        path: 'stt.highlightLowConfidence',
        // popup.js reads `!== false` (initialised to `true` if undefined).
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-show-alternatives',
        label: 'Show Alternative Suggestions',
        path: 'stt.showAlternatives',
        // popup.js reads `!== false` (initialised to `true` if undefined).
        default: true,
      },
      {
        type: 'switch',
        id: 'stt-auto-learn',
        label: 'Auto-learn from corrections',
        path: 'stt.vocabulary.autoLearn',
        // popup.js reads `!== false`.
        default: true,
      },
      {
        // Several may be on at once, so this is a multi-select, not a select. Each chip is its own
        // button and toggles its name in and out of the stored array
        // (popup.js: `enabledPresets.includes(preset)` / `.push(preset)`).
        type: 'chips',
        id: 'vocab-presets',
        label: 'Subject vocabulary',
        path: 'stt.vocabulary.enabledPresets',
        default: [],
        options: [
          { id: 'vocab-preset-medical', value: 'medical', label: 'Medical' },
          { id: 'vocab-preset-legal', value: 'legal', label: 'Legal' },
          { id: 'vocab-preset-academic', value: 'academic', label: 'Academic' },
          { id: 'vocab-preset-stem', value: 'stem', label: 'STEM' },
        ],
      },
    ],
    actions: [
      { id: 'btn-add-vocab-word', label: 'Add Word', visibilityKey: null },
      { id: 'btn-manage-vocabulary', label: 'Manage Vocabulary', visibilityKey: null },
      { id: 'btn-import-vocabulary', label: 'Import Vocabulary', visibilityKey: null },
      { id: 'btn-export-vocabulary', label: 'Export Vocabulary', visibilityKey: null },
      // Not settings, but a student reaches the voice-command list and the session statistics
      // through them, so a registry-driven view has to know they exist. Each opens a dialog.
      { id: 'stt-show-commands', label: 'View all voice commands', visibilityKey: null },
      { id: 'stt-show-stats', label: 'View session statistics', visibilityKey: null },
    ],
  },

  {
    id: 'annotations',
    icon: '📝',
    name: 'Sticky Notes',
    description: 'Add notes to any webpage',
    section: 'writing',
    group: 'Writing',
    toggleId: 'annotations-enabled',
    // popup.js reads `this.settings.annotations.enabled || false`.
    state: { store: 'settings', path: 'annotations.enabled', default: false },
    visibilityKey: 'show_annotations',
    keywords:
      'notes sticky annotate comment margin ' +
      'jot down remember write it down note to self mark the page scribble',
    // These six are drawn by popup.js when the Advanced Options modal opens, not by popup.html —
    // see `surface`. They are declared because they are real settings a student can change; a view
    // that knew only about popup.html would show Annotations switched on with nothing under it.
    controls: [
      {
        type: 'select',
        id: 'annotations-default-color',
        label: 'Default colour for new notes',
        path: 'annotations.defaultColor',
        // popup.js reads `|| 'yellow'`.
        default: 'yellow',
        surface: 'advanced',
        options: [
          { value: 'yellow', label: 'Yellow (recommended)' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' },
          { value: 'pink', label: 'Pink' },
          { value: 'purple', label: 'Purple' },
        ],
      },
      {
        type: 'select',
        id: 'annotations-default-size',
        label: 'Default note size',
        path: 'annotations.defaultNoteSize',
        // popup.js reads `|| 'medium'`.
        default: 'medium',
        surface: 'advanced',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ],
      },
      {
        type: 'switch',
        id: 'annotations-auto-save',
        label: 'Save notes as you make them',
        path: 'annotations.autoSave',
        // popup.js reads `!== false`.
        default: true,
        surface: 'advanced',
      },
      {
        type: 'switch',
        id: 'annotations-show-badge',
        label: 'Show the note-count badge',
        path: 'annotations.showBadge',
        // popup.js reads `!== false`.
        default: true,
        surface: 'advanced',
      },
      {
        type: 'switch',
        id: 'annotations-sidebar-auto-open',
        label: 'Open the sidebar when a note is clicked',
        path: 'annotations.sidebarAutoOpen',
        // popup.js reads `!== false`.
        default: true,
        surface: 'advanced',
      },
      {
        type: 'select',
        id: 'annotations-storage-mode',
        label: 'Where notes are kept',
        path: 'annotations.storageMode',
        // popup.js reads `|| 'local'`. Changing this migrates existing notes.
        default: 'local',
        surface: 'advanced',
        options: [
          { value: 'local', label: 'Chrome local storage' },
          { value: 'indexeddb', label: 'IndexedDB (for large collections)' },
        ],
      },
    ],
    actions: [
      { id: 'btn-create-sticky-note', label: 'Create Note', visibilityKey: null },
      { id: 'btn-view-annotations', label: 'View All Notes', visibilityKey: null },
    ],
  },
];
