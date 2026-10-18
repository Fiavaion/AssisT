/**
 * The Reading Aids accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * Two of these three tools have a slider whose DOM value is not the value written to
 * `assist_settings`: the letter- and word-spacing sliders show whole percent points (0-50) but the
 * handler stores an em fraction (`percent / 100`) and reads it back with `* 100`. The `default` on
 * those two controls is the literal initial slider value the handler assigns, not the em value — the
 * comment on each spells out the real settings-side fallback and the conversion.
 */

/** @type {Object[]} */
export const READING_AIDS_TOOLS = [
  {
    id: 'text-customization',
    icon: '✨',
    name: 'Text Customization',
    description: 'Adjust font and spacing',
    section: 'reading-aids',
    group: 'Seeing',
    toggleId: 'text-customization-enabled',
    // popup.js reads `|| false` — off unless the student has turned it on.
    state: { store: 'settings', path: 'textCustomization.enabled', default: false },
    visibilityKey: 'show_text_customization',
    keywords:
      'font typeface spacing letter word line paragraph legible lexend dyslexia ' +
      'cramped squashed crowded letters too close together words too close ' +
      'bigger text more space between the lines easier to read',
    controls: [
      {
        type: 'select',
        id: 'text-font-family',
        label: 'Font',
        path: 'textCustomization.fontFamily',
        default: 'lexend',
        options: [
          { value: 'system', label: 'System Default' },
          { value: 'lexend', label: 'Lexend (highly readable)' },
          { value: 'atkinson-hyperlegible', label: 'Atkinson Hyperlegible' },
          { value: 'opendyslexic', label: 'OpenDyslexic (dyslexia-friendly)' },
          { value: 'andika', label: 'Andika (literacy-focused)' },
          { value: 'comic-neue', label: 'Comic Neue' },
          { value: 'comic-sans', label: 'Comic Sans MS' },
          { value: 'arial', label: 'Arial' },
          { value: 'verdana', label: 'Verdana' },
        ],
      },
      {
        type: 'range',
        id: 'text-line-spacing',
        label: 'Line Spacing',
        path: 'textCustomization.lineSpacing',
        default: 1.5,
        min: 1.0,
        max: 3.0,
        step: 0.1,
      },
      {
        type: 'range',
        id: 'text-letter-spacing',
        label: 'Letter Spacing',
        path: 'textCustomization.letterSpacing',
        // Declared in the units that are STORED (em), with `scale` describing the widget: the
        // slider shows whole percent points, so it reads `Math.round(value * 100)` and writes
        // `percent / 100` back. A renderer that took the widget's number as the stored one would
        // save 12em instead of 0.12em.
        default: 0.12,
        min: 0,
        max: 0.5,
        scale: 100,
        step: 0.01,
        unit: '%',
      },
      {
        type: 'range',
        id: 'text-word-spacing',
        label: 'Word Spacing',
        path: 'textCustomization.wordSpacing',
        // Same em/percent split as Letter Spacing above — stored units here, `scale` for the widget.
        default: 0.16,
        min: 0,
        max: 0.5,
        scale: 100,
        step: 0.01,
        unit: '%',
      },
      {
        type: 'range',
        id: 'text-paragraph-spacing',
        label: 'Paragraph Spacing',
        path: 'textCustomization.paragraphSpacing',
        default: 2.0,
        min: 1.0,
        max: 4.0,
        step: 0.1,
        unit: 'em',
      },
    ],
    actions: [],
  },

  {
    id: 'reading-guide',
    icon: '📏',
    name: 'Reading Guide',
    description: 'Line follows your mouse',
    section: 'reading-aids',
    group: 'Seeing',
    toggleId: 'reading-guide-enabled',
    // popup.js reads `|| false` — off unless the student has turned it on.
    state: { store: 'settings', path: 'readingGuide.enabled', default: false },
    visibilityKey: 'show_reading_guide',
    // Not "focus": this draws a ruler line, and a student typing "focus" means Focus Mode.
    keywords:
      'line track mouse cursor guide ruler colour ' +
      'lose my place losing my place lost the line skip lines jump a line ' +
      'keep my place underline the line i am reading',
    controls: [
      {
        type: 'select',
        id: 'reading-guide-color',
        label: 'Line Color',
        path: 'readingGuide.lineColor',
        default: '#000000',
        options: [
          { value: '#000000', label: 'Black' },
          { value: '#ffffff', label: 'White (for dark pages)' },
          { value: '#FF0000', label: 'Red' },
          { value: '#0000FF', label: 'Blue' },
          { value: '#00FF00', label: 'Green' },
          { value: '#FF00FF', label: 'Magenta' },
          { value: '#FFA500', label: 'Orange' },
        ],
      },
      {
        type: 'range',
        id: 'reading-guide-thickness',
        label: 'Line Thickness',
        path: 'readingGuide.lineThickness',
        default: 3,
        min: 1,
        max: 10,
        step: 1,
        unit: 'px',
      },
      {
        type: 'range',
        id: 'reading-guide-opacity',
        label: 'Line Opacity',
        path: 'readingGuide.lineOpacity',
        // Stored as a fraction (`|| 0.7`), shown in whole percent — `scale` carries the conversion,
        // same as Read Aloud's Volume slider.
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
    id: 'reading-progress',
    icon: '📊',
    name: 'Reading Progress',
    description: "Shows how far you've read on the page",
    section: 'reading-aids',
    group: 'Focus',
    toggleId: 'reading-progress-enabled',
    // popup.js reads `|| false` — off unless the student has turned it on.
    state: { store: 'settings', path: 'readingProgress.enabled', default: false },
    visibilityKey: 'show_reading_progress',
    keywords:
      'progress bar scroll percent page position tracker ' +
      'how far have i read how much is left nearly finished',
    controls: [
      {
        type: 'select',
        id: 'reading-progress-position',
        label: 'Position',
        path: 'readingProgress.position',
        default: 'top',
        options: [
          { value: 'top', label: 'Top of page' },
          { value: 'bottom', label: 'Bottom of page' },
        ],
      },
      {
        type: 'select',
        id: 'reading-progress-color',
        label: 'Bar Color',
        path: 'readingProgress.color',
        default: '#4CAF50',
        options: [
          { value: '#4CAF50', label: 'Green' },
          { value: '#2196F3', label: 'Blue' },
          { value: '#FF9800', label: 'Orange' },
          { value: '#9C27B0', label: 'Purple' },
          { value: '#E91E63', label: 'Pink' },
        ],
      },
      {
        type: 'switch',
        id: 'reading-progress-percentage',
        label: 'Show Percentage',
        // The element id says "percentage"; the handler actually writes/reads
        // `readingProgress.showPercentage` (`|| false`).
        path: 'readingProgress.showPercentage',
        default: false,
      },
    ],
    actions: [],
  },
];
