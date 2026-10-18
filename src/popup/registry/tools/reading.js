/**
 * The Reading accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * Two of these — Highlight While Reading and Word by Word — are stored as sub-keys of TTS
 * (`tts.highlightEnabled`, `tts.wordByWordEnabled`) and sit inside the TTS options container in
 * the accordion. They are declared as tools in their own right so that each has its own row, its
 * own switch and its own settings wherever it is drawn; `dependsOn` says where that is. It is not
 * a hint that a view may take or leave: neither does anything with Read Aloud switched off, so a
 * view draws them INSIDE Read Aloud and shows them only while it is on. Listed flat beside it
 * they read as two supports that can be switched on and then do nothing.
 */

/** @type {Object[]} */
export const READING_TOOLS = [
  {
    id: 'tts',
    icon: '🔊',
    name: 'Read Aloud',
    description: 'Reads selected text aloud',
    section: 'reading',
    group: 'Reading',
    toggleId: 'tts-enabled',
    state: { store: 'settings', path: 'tts.enabled', default: false },
    visibilityKey: null,
    keywords:
      'speech voice tts audio listen read aloud ' +
      'read to me read it out loud hear it spoken narrate say the words for me ' +
      'talking whole page eyes tired of reading',
    controls: [
      {
        type: 'select',
        id: 'voice-select',
        label: 'Voice',
        path: 'tts.voice',
        default: 'default',
        // Enumerated by the speech engine after `voiceschanged`, never a fixed list.
        optionsFrom: 'voices',
      },
      {
        type: 'range',
        id: 'rate-slider',
        label: 'Speed',
        path: 'tts.rate',
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        unit: 'x',
        // One-press speeds, drawn as buttons under the slider; each sets the slider, so its own
        // handler stores the rate and tells the page. Hidden with ui_visibility.show_speed_presets.
        presets: [0.5, 1.0, 1.5, 2.0],
        presetsVisibilityKey: 'show_speed_presets',
      },
      {
        type: 'range',
        id: 'pitch-slider',
        label: 'Pitch',
        path: 'tts.pitch',
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      {
        type: 'range',
        id: 'volume-slider',
        label: 'Volume',
        path: 'tts.volume',
        // Stored as a fraction — the speech engine takes 0 to 1 — and shown in whole percent, as
        // the accordion popup has always shown it. `scale` is what bridges the two; without it the
        // readout printed the fraction and glued a percent sign on, so full volume read "1%".
        default: 1.0,
        min: 0,
        max: 1,
        step: 0.1,
        scale: 100,
        unit: '%',
      },
      {
        type: 'select',
        id: 'reading-scope',
        label: 'Read on click',
        path: 'tts.readingScope',
        default: 'paragraph',
        options: [
          { value: 'paragraph', label: 'This paragraph' },
          { value: 'section', label: 'This section' },
          { value: 'page', label: 'Whole page (skip menus)' },
        ],
      },
    ],
    actions: [{ id: 'btn-read-page', label: 'Read Page', visibilityKey: null }],
  },

  {
    id: 'highlight',
    icon: '🖍️',
    name: 'Highlight While Reading',
    description: 'Follows the spoken word',
    section: 'reading',
    group: 'Reading',
    toggleId: 'highlight-enabled',
    // popup.js reads `?? true` — highlighting is on unless the student turns it off.
    state: { store: 'settings', path: 'tts.highlightEnabled', default: true },
    visibilityKey: 'show_highlighting',
    dependsOn: 'tts',
    keywords:
      'follow track karaoke place highlight colour ' +
      'highlight the words as they are read see the word being spoken follow along ' +
      'keep my place while listening',
    controls: [
      {
        type: 'select',
        id: 'highlight-color',
        label: 'Highlight colour',
        path: 'tts.highlightColor',
        default: '#FFEB3B',
        options: [
          { value: '#FFFF00', label: 'Yellow (High Contrast)' },
          { value: '#FFEB3B', label: 'Bright Yellow' },
          { value: '#FFD700', label: 'Gold' },
          { value: '#90EE90', label: 'Light Green' },
          { value: '#87CEEB', label: 'Sky Blue' },
          { value: '#FFB6C1', label: 'Light Pink' },
          { value: '#DDA0DD', label: 'Plum' },
          { value: '#F0E68C', label: 'Khaki' },
        ],
      },
      {
        type: 'range',
        id: 'highlight-opacity',
        label: 'Highlight opacity',
        path: 'tts.highlightOpacity',
        // Stored as a CSS alpha (0 to 1), shown in whole percent — see Volume above.
        default: 0.7,
        min: 0.1,
        max: 1,
        step: 0.1,
        scale: 100,
        unit: '%',
      },
    ],
    actions: [],
  },

  {
    id: 'word-by-word',
    icon: '👆',
    name: 'Word by Word',
    description: 'One word at a time',
    section: 'reading',
    group: 'Reading',
    toggleId: 'word-by-word-enabled',
    state: { store: 'settings', path: 'tts.wordByWordEnabled', default: false },
    visibilityKey: null,
    dependsOn: 'tts',
    keywords:
      'rsvp pace single word place sync ' +
      'one word at a time slow it down too many words at once',
    controls: [
      {
        type: 'radio',
        id: 'whm-boundary',
        label: 'Boundary events',
        hint: 'Best sync — Chrome built-in voices',
        path: 'tts.wordHighlightMode',
        group: 'word-highlight-mode',
        groupLabel: 'Highlight sync method',
        value: 'boundary',
        default: 'boundary',
      },
      {
        type: 'radio',
        id: 'whm-timer',
        label: 'Timer',
        path: 'tts.wordHighlightMode',
        group: 'word-highlight-mode',
        value: 'timer',
      },
      {
        type: 'range',
        id: 'word-highlight-speed',
        label: 'Highlight speed',
        path: 'tts.wordHighlightSpeed',
        default: 2.0,
        min: 0.25,
        max: 4,
        step: 0.25,
      },
    ],
    actions: [],
  },

  {
    id: 'reading-mode',
    icon: '📄',
    name: 'Reading Mode',
    description: 'Strips the page back to the article',
    section: 'reading',
    group: 'Reading',
    toggleId: 'reading-mode-enabled',
    state: { store: 'settings', path: 'readingMode.enabled', default: false },
    visibilityKey: null,
    keywords:
      'declutter article clean simplify busy distraction ' +
      'strip the page back just the article plain text easier to read',
    controls: [],
    actions: [{ id: 'btn-toggle-reading-mode', label: 'Toggle Reading Mode', visibilityKey: null }],
  },

  {
    id: 'dyslexia-mode',
    icon: '📖',
    name: 'Dyslexia Mode',
    description: 'Syllable and letter shaping',
    section: 'reading',
    group: 'Reading',
    toggleId: 'dyslexia-mode-enabled',
    state: { store: 'settings', path: 'dyslexiaMode.enabled', default: false },
    visibilityKey: 'show_dyslexia_mode',
    // No "font" here. Dyslexia Mode colours syllables and parts of speech; it does not change the
    // typeface, and a student typing "font" wants Text Customization, which does.
    keywords:
      'dyslexic dyslexia syllable bionic grammar letters colour ' +
      'the words move around and jump swim blur letters flip swap ' +
      'hard to read reading is hard',
    controls: [
      // The variant is stored as three parallel booleans, not one value, so each option declares
      // the sub-keys it writes. Syllable is the default; bionic is listed last deliberately —
      // the evidence for it is negative (see the 2026-07-02 decision).
      {
        type: 'radio',
        id: 'dyslexia-syllable',
        label: 'Syllable colours',
        path: 'dyslexiaMode',
        group: 'dyslexia-variant',
        groupLabel: 'How text is shaped',
        writes: { syllableHighlighting: true, grammarColors: false, bionicReading: false },
        default: true,
      },
      {
        type: 'radio',
        id: 'dyslexia-grammar',
        label: 'Grammar colours',
        path: 'dyslexiaMode',
        group: 'dyslexia-variant',
        writes: { syllableHighlighting: false, grammarColors: true, bionicReading: false },
      },
      {
        type: 'radio',
        id: 'dyslexia-bionic',
        label: 'Bionic reading',
        path: 'dyslexiaMode',
        group: 'dyslexia-variant',
        writes: { syllableHighlighting: false, grammarColors: false, bionicReading: true },
      },
    ],
    actions: [],
  },

  {
    id: 'ocr',
    icon: '📷',
    name: 'Read from Images (OCR)',
    description: 'Reads text out of images',
    section: 'reading',
    group: 'Reading',
    toggleId: 'ocr-enabled',
    // popup.js reads `!== false` — OCR is on unless the student turns it off.
    state: { store: 'settings', path: 'ocr.enabled', default: true },
    visibilityKey: 'show_ocr',
    keywords:
      'image picture scan photo screenshot pdf handout slides whiteboard text recognise ' +
      'text in a picture read a photo words in an image',
    controls: [
      {
        type: 'switch',
        id: 'ocr-auto-reading-mode',
        label: 'Auto reading mode',
        path: 'ocr.autoActivateReadingMode',
        default: true,
      },
      {
        type: 'range',
        id: 'ocr-upscale-factor',
        label: 'Zoom (for small text)',
        path: 'ocr.upscaleFactor',
        default: 1.5,
        min: 1.0,
        max: 3.0,
        step: 0.1,
        unit: 'x',
      },
      {
        type: 'select',
        id: 'ocr-language',
        label: 'Language',
        path: 'ocr.language',
        default: 'eng',
        options: [
          { value: 'eng', label: 'English' },
          { value: 'spa', label: 'Spanish' },
          { value: 'fra', label: 'French' },
          { value: 'deu', label: 'German' },
          { value: 'ita', label: 'Italian' },
          { value: 'por', label: 'Portuguese' },
          { value: 'nld', label: 'Dutch' },
          { value: 'pol', label: 'Polish' },
          { value: 'rus', label: 'Russian' },
          { value: 'chi_sim', label: 'Chinese (Simplified)' },
          { value: 'chi_tra', label: 'Chinese (Traditional)' },
          { value: 'jpn', label: 'Japanese' },
          { value: 'kor', label: 'Korean' },
          { value: 'ara', label: 'Arabic' },
        ],
      },
      {
        type: 'range',
        id: 'ocr-confidence-threshold',
        label: 'Confidence',
        path: 'ocr.confidenceThreshold',
        default: 60,
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
      },
      {
        type: 'switch',
        id: 'ocr-auto-tts',
        label: 'Auto-play read aloud',
        path: 'ocr.autoTTS',
        // Opt-in: a voice starting unprompted can talk over a screen reader.
        default: false,
      },
      {
        type: 'switch',
        id: 'ocr-offline-accuracy',
        label: 'Accuracy boost (offline)',
        path: 'ocr.offlineAccuracy',
        default: false,
      },
    ],
    // What the zoom number means ("2.0× (high)"), which the accordion writes beside its slider as
    // it moves (popup.js).
    statusLines: [{ id: 'ocr-upscale-label', after: 'ocr-upscale-factor' }],
    actions: [{ id: 'btn-trigger-ocr', label: 'Scan this page', visibilityKey: null }],
  },

  {
    id: 'maths',
    icon: '🔢',
    name: 'Maths Support',
    description: 'Speaks equations, formats numbers',
    section: 'reading',
    group: 'Reading',
    toggleId: 'maths-enabled',
    state: { store: 'settings', path: 'maths.enabled', default: false },
    visibilityKey: null,
    keywords:
      'equation equations number numbers calculator dyscalculia sums place value ' +
      'adding times tables fractions percentages work out the answer',
    controls: [
      {
        type: 'switch',
        id: 'maths-calculator',
        label: 'Calculator & scratchpad',
        path: 'maths.calculator',
        default: true,
      },
      {
        type: 'switch',
        id: 'maths-number-format',
        label: 'Format large numbers',
        path: 'maths.numberFormat',
        default: false,
      },
      {
        type: 'switch',
        id: 'maths-place-value',
        label: 'Colour place values',
        path: 'maths.placeValue',
        default: false,
      },
    ],
    actions: [],
  },
];
