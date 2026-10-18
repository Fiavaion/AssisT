/**
 * The Visual Comfort accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * Flat's grouping splits this accordion section across two groups rather than keeping it whole:
 * Focus Mode and Auto-play Blocking are attention supports (`Focus`); Screen Color Overlay and
 * Reduced Motion are about what the eye tolerates on screen (`Seeing`). `section` stays
 * `visual-comfort` throughout — that is the accordion identity `ui_visibility` and the shipped
 * popup depend on — only `group` differs per tool.
 */

/** @type {Object[]} */
export const VISUAL_COMFORT_TOOLS = [
  {
    id: 'focus-mode',
    icon: '🎯',
    name: 'Focus Mode',
    description: 'Reading window with dark overlay',
    section: 'visual-comfort',
    group: 'Focus',
    toggleId: 'focus-mode-enabled',
    // popup.js reads `|| false` — off until the student turns it on.
    state: { store: 'settings', path: 'focusMode.enabled', default: false },
    visibilityKey: 'show_focus_mode',
    keywords:
      'spotlight window overlay dark attention crop ' +
      'cant focus concentrate distracted too much on the screen at once one line at a time',
    controls: [
      {
        type: 'range',
        id: 'focus-mode-width',
        label: 'Window Width',
        path: 'focusMode.boxWidth',
        default: 400,
        min: 150,
        max: 800,
        step: 5,
        unit: 'px',
      },
      {
        type: 'range',
        id: 'focus-mode-height',
        label: 'Window Height',
        path: 'focusMode.boxHeight',
        default: 100,
        min: 50,
        max: 250,
        step: 5,
        unit: 'px',
      },
      {
        type: 'range',
        id: 'focus-mode-opacity',
        label: 'Overlay Darkness',
        path: 'focusMode.overlayOpacity',
        // Stored as a fraction, shown in whole percent; `scale` bridges the two.
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
    id: 'screen-overlay',
    icon: '🎨',
    name: 'Screen Color Overlay',
    description: 'Color tint to reduce eye strain',
    section: 'visual-comfort',
    group: 'Seeing',
    toggleId: 'screen-overlay-enabled',
    // popup.js reads `|| false` — off until the student turns it on.
    state: { store: 'settings', path: 'screenOverlay.enabled', default: false },
    visibilityKey: 'show_screen_overlay',
    keywords:
      'tint colour filter irlen overlay eye strain sepia ' +
      'too bright glare eyes hurt tired eyes white background hurts dim the page warmer colour',
    controls: [
      {
        type: 'select',
        id: 'screen-overlay-color',
        label: 'Overlay Color',
        path: 'screenOverlay.color',
        default: '#FFE4C4',
        options: [
          { value: '#FFE4C4', label: 'Warm Sepia (recommended)' },
          { value: '#FFF59D', label: 'Soft Yellow' },
          { value: '#FFCCBC', label: 'Peach' },
          { value: '#F0D9B5', label: 'Cream' },
          { value: '#B3E5FC', label: 'Cool Blue' },
          { value: '#C8E6C9', label: 'Soft Green' },
          { value: '#F8BBD0', label: 'Light Pink' },
          { value: '#E1BEE7', label: 'Lavender' },
        ],
      },
      {
        type: 'range',
        id: 'screen-overlay-opacity',
        label: 'Overlay Intensity',
        path: 'screenOverlay.opacity',
        // Stored as a fraction, shown in whole percent; `scale` bridges the two. It stops at 90%
        // so the page beneath the tint is never fully covered.
        default: 0.3,
        min: 0.1,
        max: 0.9,
        step: 0.1,
        scale: 100,
        unit: '%',
      },
    ],
    actions: [],
  },

  {
    id: 'reduced-motion',
    icon: '🛑',
    name: 'Reduced Motion',
    description: 'Disables animations for sensory comfort',
    section: 'visual-comfort',
    group: 'Seeing',
    toggleId: 'reduced-motion-enabled',
    // popup.js reads `|| false` — off until the student turns it on.
    state: { store: 'settings', path: 'reducedMotion.enabled', default: false },
    visibilityKey: 'show_reduced_motion',
    keywords:
      'animation motion sensory vestibular still calm quiet ' +
      'moving things make me dizzy sick flashing spinning travel sickness stop the movement ' +
      'make it quiet make the page calm down',
    controls: [
      {
        type: 'switch',
        id: 'reduced-motion-system',
        label: 'Follow System Setting',
        path: 'reducedMotion.respectSystemPreference',
        // popup.js reads `!== false` — on unless the student turns it off.
        default: true,
      },
    ],
    // Said when the computer is asking for less motion as well, so movement stays reduced with
    // the switch off and the student is not left thinking it is broken (popup.js).
    statusLines: [{ id: 'reduced-motion-following-note' }],
    actions: [],
  },

  {
    id: 'media-control',
    icon: '🔇',
    name: 'Auto-play Blocking',
    description: 'Stops videos and audio from playing automatically',
    section: 'visual-comfort',
    group: 'Focus',
    toggleId: 'media-control-enabled',
    // popup.js reads `|| false` — off until the student turns it on.
    state: { store: 'settings', path: 'mediaControl.enabled', default: false },
    visibilityKey: 'show_media_control',
    keywords:
      'autoplay video videos audio sound mute distraction quiet silence ' +
      'videos start playing by themselves stop the noise unexpected sound ' +
      'i need it quiet keep the page quiet',
    controls: [],
    actions: [],
  },
];
