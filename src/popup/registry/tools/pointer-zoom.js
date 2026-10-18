/**
 * The Pointer & Zoom accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js: every `id` here is the element that exists today,
 * every `path` is the settings key the current handler writes, and every `default` is the
 * fallback the current handler applies. A drift test holds this file to popup.html, so a control
 * added there without being declared here fails the suite.
 *
 * `magnifying-lens-offset-enabled` carries the master-switch `-enabled` suffix but is a
 * sub-option of the lens, not a tool of its own — it lives inside `magnifying-lens-options` and
 * only shows/hides `magnifying-lens-offset-controls`. It is declared as a `switch` control on the
 * `magnifying-lens` tool, matching where `setupMagnifyingLens()` actually wires it.
 */

/** @type {Object[]} */
export const POINTER_ZOOM_TOOLS = [
  {
    id: 'custom-cursor',
    icon: '🎯',
    name: 'Custom Cursor',
    description: 'Large, high-contrast cursor for better visibility',
    section: 'pointer-zoom',
    group: 'Seeing',
    toggleId: 'custom-cursor-enabled',
    // popup.js reads `|| false` — off unless the student turns it on.
    state: { store: 'settings', path: 'customCursor.enabled', default: false },
    visibilityKey: null,
    keywords:
      'cursor pointer mouse visibility large contrast ' +
      'cant see the pointer lost the mouse where is my cursor arrow too small',
    controls: [
      {
        type: 'range',
        id: 'custom-cursor-size',
        label: 'Cursor size',
        path: 'customCursor.size',
        default: 32,
        min: 24,
        max: 96,
        step: 4,
        unit: 'px',
      },
      {
        type: 'select',
        id: 'custom-cursor-style',
        label: 'Cursor style',
        path: 'customCursor.style',
        default: 'crosshair',
        options: [
          { value: 'crosshair', label: 'Crosshair' },
          { value: 'circle', label: 'Circle' },
          { value: 'dot', label: 'Dot with Ring' },
          { value: 'arrow', label: 'Large Arrow' },
        ],
      },
      {
        type: 'select',
        id: 'custom-cursor-color',
        label: 'Cursor colour',
        path: 'customCursor.color',
        default: '#ff0000',
        options: [
          { value: '#ff0000', label: 'Red' },
          { value: '#00ff00', label: 'Green' },
          { value: '#ffff00', label: 'Yellow' },
          { value: '#00ffff', label: 'Cyan' },
          { value: '#ff00ff', label: 'Magenta' },
          { value: '#ffffff', label: 'White' },
          { value: '#000000', label: 'Black' },
        ],
      },
    ],
    actions: [],
  },

  {
    id: 'magnifying-lens',
    icon: '🔍',
    name: 'Magnifying Lens',
    description: 'Movable magnification lens that follows your cursor',
    section: 'pointer-zoom',
    group: 'Seeing',
    toggleId: 'magnifying-lens-enabled',
    // popup.js reads `|| false` — off unless the student turns it on.
    state: { store: 'settings', path: 'magnifyingLens.enabled', default: false },
    visibilityKey: null,
    keywords:
      'magnify zoom lens loupe enlarge cursor ' +
      'make things bigger on screen text too small closer look low vision',
    controls: [
      {
        type: 'range',
        id: 'magnifying-lens-scale',
        label: 'Magnification',
        path: 'magnifyingLens.scale',
        default: 2.0,
        min: 1.5,
        max: 4,
        step: 0.25,
        unit: 'x',
      },
      {
        type: 'range',
        id: 'magnifying-lens-size',
        label: 'Lens size',
        path: 'magnifyingLens.size',
        default: 275,
        min: 100,
        max: 600,
        step: 25,
        unit: 'px',
      },
      // Sub-option, not its own tool — see the file header note.
      {
        type: 'switch',
        id: 'magnifying-lens-offset-enabled',
        label: 'Enable offset from cursor',
        path: 'magnifyingLens.offsetEnabled',
        default: false,
      },
      {
        type: 'range',
        id: 'magnifying-lens-offset',
        label: 'Offset distance',
        path: 'magnifyingLens.offset',
        default: 150,
        min: 0,
        max: 500,
        step: 25,
        unit: 'px',
      },
      {
        type: 'select',
        id: 'magnifying-lens-offset-dir',
        label: 'Offset direction',
        path: 'magnifyingLens.offsetDir',
        default: 'right',
        options: [
          { value: 'right', label: 'Right of cursor' },
          { value: 'left', label: 'Left of cursor' },
          { value: 'above', label: 'Above cursor' },
          { value: 'below', label: 'Below cursor' },
          { value: 'auto', label: 'Auto (peripheral)' },
        ],
      },
      {
        type: 'switch',
        id: 'magnifying-lens-lock',
        label: 'Lock lens position',
        path: 'magnifyingLens.lock',
        default: false,
      },
    ],
    actions: [],
  },
];
