/**
 * The Productivity accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * Both tools here land in Flat's Focus group — simplifying the page and running a Pomodoro timer
 * are both about protecting attention, not about reading or writing text.
 */

/** @type {Object[]} */
export const PRODUCTIVITY_TOOLS = [
  {
    id: 'simplify',
    icon: '🧹',
    name: 'Simplified Interface',
    description: 'Hide ads, sidebars, and distractions',
    section: 'productivity',
    group: 'Focus',
    toggleId: 'simplify-enabled',
    // setupSimplify() reads `|| false` — off unless the student turns it on.
    state: { store: 'settings', path: 'simplify.enabled', default: false },
    visibilityKey: 'show_simplify',
    // Not "focus": Focus Mode is the support a student typing that word is after.
    keywords:
      'declutter ads adverts sidebars distraction clean ui ' +
      'too busy too much clutter hide the rubbish simpler page',
    controls: [
      {
        type: 'select',
        id: 'simplify-intensity',
        label: 'Intensity',
        path: 'simplify.intensity',
        default: 'moderate',
        options: [
          { value: 'light', label: 'Light (ads & popups only)' },
          { value: 'moderate', label: 'Moderate (recommended)' },
          { value: 'aggressive', label: 'Aggressive (main content only)' },
        ],
      },
      {
        type: 'switch',
        id: 'simplify-focus-content',
        label: 'Highlight main content',
        path: 'simplify.focusMainContent',
        // setupSimplify() reads `!== false` — on unless the student turns it off.
        default: true,
      },
    ],
    actions: [],
  },

  {
    id: 'pomodoro',
    icon: '🍅',
    name: 'Pomodoro Timer',
    description: 'Structured work/break intervals for focus',
    section: 'productivity',
    group: 'Focus',
    toggleId: 'pomodoro-enabled',
    // setupPomodoro() reads `|| false` — off unless the student turns it on.
    state: { store: 'settings', path: 'pomodoro.enabled', default: false },
    visibilityKey: 'show_pomodoro',
    // Not "focus" — Focus Mode owns that word, here as in the other two places it had drifted to.
    keywords:
      'timer work break breaks interval study session ' +
      'procrastinate cant get started keep going time management take a rest',
    controls: [
      {
        type: 'range',
        id: 'pomodoro-work-duration',
        label: 'Work duration',
        path: 'pomodoro.workDuration',
        // setupPomodoro() reads `|| 25` — the markup's own default value attribute agrees (25).
        default: 25,
        min: 5,
        max: 60,
        step: 5,
        unit: ' min',
      },
      {
        type: 'range',
        id: 'pomodoro-break-duration',
        label: 'Break duration',
        path: 'pomodoro.shortBreakDuration',
        // setupPomodoro() reads `|| 5`.
        default: 5,
        min: 1,
        max: 30,
        step: 1,
        unit: ' min',
      },
      {
        type: 'range',
        id: 'pomodoro-long-break',
        label: 'Long break',
        path: 'pomodoro.longBreakDuration',
        // setupPomodoro() reads `|| 15`.
        default: 15,
        min: 5,
        max: 45,
        step: 5,
        unit: ' min',
      },
      {
        type: 'select',
        id: 'pomodoro-position',
        label: 'Timer position',
        path: 'pomodoro.position',
        // setupPomodoro() reads `|| 'top-right'`. Top right is the one corner the shared
        // control rails leave free - see src/utils/corner-slots.js.
        default: 'top-right',
        options: [
          { value: 'top-right', label: 'Top Right' },
          { value: 'top-left', label: 'Top Left' },
          { value: 'bottom-right', label: 'Bottom Right' },
          { value: 'bottom-left', label: 'Bottom Left' },
        ],
      },
      {
        type: 'switch',
        id: 'pomodoro-auto-start-breaks',
        label: 'Auto-start breaks',
        path: 'pomodoro.autoStartBreaks',
        // setupPomodoro() reads `|| false`.
        default: false,
      },
      {
        type: 'switch',
        id: 'pomodoro-sound',
        label: 'Sound notifications',
        path: 'pomodoro.playSound',
        // setupPomodoro() reads `!== false` — on unless the student turns it off.
        default: true,
      },
    ],
    actions: [],
  },
];
