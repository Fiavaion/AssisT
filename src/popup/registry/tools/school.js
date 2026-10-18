/**
 * The School Tools accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * The three LMS integrations (Canvas, Moodle, Google Classroom) are three separate tools, not one
 * "LMS" tool with a picker — `setupCanvasIntegration`/`setupMoodleIntegration`/
 * `setupGoogleClassroomIntegration` each own an independent `<lms>Integration.enabled` switch in
 * storage, and a student on Moodle has no reason to see Canvas's quiz-helper controls. A view may
 * still choose to present them as one row; that is presentation, not what is actually stored.
 */

import { INBOX_ID, TARGET_KEY } from '../../../features/mindMap/mindmap-keys.js';

/** @type {Object[]} */
export const SCHOOL_TOOLS = [
  {
    id: 'citation',
    icon: '📚',
    name: 'Citations',
    description: 'Save citations from web pages',
    section: 'school',
    group: 'Writing',
    toggleId: 'citation-enabled',
    // popup.js reads `?.enabled !== false` — on unless the student turns it off.
    state: { store: 'settings', path: 'citation.enabled', default: true },
    visibilityKey: 'show_citations',
    keywords:
      'cite reference references referencing bibliography apa mla chicago harvard doi ' +
      'source sources library projects plagiarism where i got it quote page numbers works cited',
    controls: [
      {
        type: 'switch',
        id: 'citation-verify-online',
        label: 'Verify citations online',
        hint: 'Checks CrossRef & Semantic Scholar by DOI/title only',
        // popup.js reads `?.verifyOnline === true` — off unless explicitly turned on.
        path: 'citation.verifyOnline',
        default: false,
      },
    ],
    actions: [
      { id: 'btn-save-citation', label: 'Save Citation', visibilityKey: null },
      { id: 'btn-citation-manager', label: 'Citation Library', visibilityKey: null },
      // Opens the citation how-to guide in its own tab. Declared here, rather than only written
      // into popup.html, so the Flat view draws it: a button only in the hidden accordion is one
      // the student cannot reach.
      { id: 'btn-citation-guide', label: 'How to use citations', visibilityKey: null },
      // Expands the in-popup quick-view list; the full-page library is the two buttons above.
      { id: 'btn-expand-citations', label: 'Quick View', visibilityKey: null },
    ],
  },

  {
    id: 'mindmap',
    icon: '🧠',
    name: 'Mind Map',
    description: 'Plan and revise with an outline that is also a map',
    section: 'school',
    group: 'Study',
    // Newest of the study tools and the one still moving: the views draw the word "Beta" beside
    // its name so a student knows what they are getting before they put an essay plan in it. It
    // changes nothing about what the tool does or who may open it.
    beta: true,
    toggleId: 'mind-map-enabled',
    // popup.js reads `?.enabled !== false` — on unless the student turns it off.
    state: { store: 'settings', path: 'mindMap.enabled', default: true },
    visibilityKey: 'show_mind_map',
    keywords:
      'mind map outline plan essay brainstorm ideas revise notes tree branch structure ' +
      'thoughts in order where to start stuck for ideas',
    controls: [
      {
        type: 'select',
        id: 'mind-map-layout',
        label: 'Layout',
        // Which arrangement the editor opens with; the model is the same tree either way.
        path: 'mindMap.layout',
        default: 'map',
        options: [
          { value: 'map', label: 'Map' },
          { value: 'tree', label: 'Tree' },
        ],
      },
      {
        type: 'select',
        id: 'mind-map-target',
        label: 'Highlights go to',
        hint: 'Which map "Add to mind map" saves into',
        // The one mind map setting that is not part of `assist_settings`: the service worker reads
        // it while answering a capture from a page, so it lives at the top level of local storage
        // where both realms already look for it.
        store: 'local',
        path: TARGET_KEY,
        default: INBOX_ID,
        // The student's own maps, enumerated by the service worker over MINDMAP_LIST — never a
        // fixed list, and empty until they have made one.
        optionsFrom: 'mindMaps',
      },
    ],
    actions: [
      // Straight to the service worker: the library is an extension page, so it does not wait on a
      // content script being present in the current tab.
      { id: 'btn-open-mind-maps', label: 'Open Mind Maps', visibilityKey: null },
      // Needs the page, so this one goes through the content script.
      { id: 'btn-map-this-page', label: 'Map this page', visibilityKey: null },
    ],
  },

  {
    id: 'canvas',
    icon: '🎓',
    name: 'Canvas LMS',
    description: 'Assignment reader, quiz helper',
    section: 'school',
    group: 'Study',
    toggleId: 'canvas-integration-enabled',
    // popup.js reads `canvasIntegration.enabled !== false` — on unless the student turns it off.
    state: { store: 'settings', path: 'canvasIntegration.enabled', default: true },
    visibilityKey: 'show_canvas_integration',
    keywords:
      'canvas lms instructure assignment quiz keyboard college university coursework ' +
      'read my assignment quiz questions',
    controls: [
      {
        type: 'switch',
        id: 'canvas-assignment-reader',
        label: 'Assignment Reader',
        // popup.js reads `assignmentReader !== false`.
        path: 'canvasIntegration.assignmentReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'canvas-quiz-helper',
        label: 'Quiz Helper',
        // setupCanvasIntegration() first coerces a legacy boolean (or absent) quizHelper into an
        // object — {enabled:false, readAnswers:true, autoRead:false, highlightQuestion:true,
        // highlightColor:'#4A90E2', keyboardNavigation:true} — before reading `.enabled`, so a
        // pre-upgrade install that stored `quizHelper: true/false` is not silently misread.
        path: 'canvasIntegration.quizHelper.enabled',
        default: false,
      },
      {
        type: 'switch',
        id: 'quiz-read-answers',
        label: 'Read Answers',
        // popup.js reads `readAnswers !== false`.
        path: 'canvasIntegration.quizHelper.readAnswers',
        default: true,
      },
      {
        type: 'switch',
        id: 'quiz-auto-read',
        label: 'Auto-Read on Focus',
        // popup.js reads `autoRead || false`.
        path: 'canvasIntegration.quizHelper.autoRead',
        default: false,
      },
      {
        type: 'switch',
        id: 'quiz-highlight-question',
        label: 'Highlight Question',
        // popup.js reads `highlightQuestion !== false`.
        path: 'canvasIntegration.quizHelper.highlightQuestion',
        default: true,
      },
      {
        type: 'select',
        id: 'quiz-highlight-color',
        label: 'Highlight Color',
        // popup.js reads `highlightColor || '#4A90E2'`.
        path: 'canvasIntegration.quizHelper.highlightColor',
        default: '#4A90E2',
        options: [
          { value: '#4A90E2', label: 'Blue' },
          { value: '#FF6B6B', label: 'Red' },
          { value: '#4ECDC4', label: 'Teal' },
          { value: '#95E1D3', label: 'Mint' },
          { value: '#FFD93D', label: 'Yellow' },
          { value: '#6BCF7F', label: 'Green' },
        ],
      },
      {
        type: 'switch',
        id: 'quiz-keyboard-nav',
        label: 'Keyboard Navigation',
        // popup.js reads `keyboardNavigation !== false`.
        path: 'canvasIntegration.quizHelper.keyboardNavigation',
        default: true,
      },
      {
        type: 'switch',
        id: 'canvas-keyboard-nav',
        label: 'Enhanced Keyboard Nav (Coming)',
        hint: 'Not shipped yet — the checkbox is disabled in the DOM',
        // popup.js reads `keyboardNav || false`. Marked `disabled` in popup.html and never gets a
        // change listener — read-only display of an unshipped feature, not a live control.
        path: 'canvasIntegration.keyboardNav',
        default: false,
      },
    ],
    actions: [],
  },

  {
    id: 'moodle',
    icon: '📚',
    name: 'Moodle LMS',
    description: 'Assignment, forum, page readers',
    section: 'school',
    group: 'Study',
    toggleId: 'moodle-integration-enabled',
    // popup.js reads `moodleIntegration.enabled !== false` — on unless the student turns it off.
    state: { store: 'settings', path: 'moodleIntegration.enabled', default: true },
    visibilityKey: 'show_moodle_integration',
    keywords:
      'moodle lms assignment forum page reader college university coursework ' +
      'read the discussion posts',
    controls: [
      {
        type: 'switch',
        id: 'moodle-assignment-reader',
        label: 'Assignment Reader',
        // popup.js reads `assignmentReader !== false`.
        path: 'moodleIntegration.assignmentReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'moodle-forum-reader',
        label: 'Forum Reader',
        // popup.js reads `forumReader !== false`.
        path: 'moodleIntegration.forumReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'moodle-page-reader',
        label: 'Page Reader',
        // popup.js reads `pageReader !== false`.
        path: 'moodleIntegration.pageReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'moodle-quiz-helper',
        label: 'Quiz Helper (Coming)',
        hint: 'Not shipped yet — the checkbox is disabled in the DOM',
        // popup.js reads `quizHelper || false`. Marked `disabled` in popup.html; the change
        // listener is wired anyway (unlike Canvas's keyboard-nav placeholder) but cannot fire
        // while the control stays disabled.
        path: 'moodleIntegration.quizHelper',
        default: false,
      },
    ],
    actions: [],
  },

  {
    id: 'google-classroom',
    icon: '🎒',
    name: 'Google Classroom',
    description: 'Assignment, stream, classwork readers',
    section: 'school',
    group: 'Study',
    toggleId: 'google-classroom-integration-enabled',
    // popup.js reads `googleClassroomIntegration.enabled !== false` — on unless turned off.
    state: { store: 'settings', path: 'googleClassroomIntegration.enabled', default: true },
    visibilityKey: 'show_google_classroom_integration',
    keywords:
      'google classroom assignment stream classwork college university coursework ' +
      'read my classwork and stream posts',
    controls: [
      {
        type: 'switch',
        id: 'google-classroom-assignment-reader',
        label: 'Assignment Reader',
        // popup.js reads `assignmentReader !== false`.
        path: 'googleClassroomIntegration.assignmentReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'google-classroom-stream-reader',
        label: 'Stream Reader',
        // popup.js reads `streamReader !== false`.
        path: 'googleClassroomIntegration.streamReader',
        default: true,
      },
      {
        type: 'switch',
        id: 'google-classroom-classwork-reader',
        label: 'Classwork Reader',
        // popup.js reads `classworkReader !== false`.
        path: 'googleClassroomIntegration.classworkReader',
        default: true,
      },
    ],
    actions: [],
  },

  {
    id: 'learning-profile',
    icon: '📓',
    name: 'Keep a record of how I work',
    description:
      'Counts which tools you use, your reading speed and your streak, on this device only, to ' +
      'pitch AI answers at you',
    section: 'school',
    group: 'Study',
    toggleId: 'learning-profile-enabled',
    // Not a settings path: the content script hears about this through its own local key and stops
    // recording the moment it changes. `enabled !== true` is off — a missing key is off.
    state: { store: 'local', path: 'cognitiveProfileSettings.enabled', default: false },
    visibilityKey: 'show_learning_profile',
    keywords:
      'profile record data privacy learning style streak history what you know about me ' +
      'personalise personalize adapt stop tracking me delete my data',
    controls: [],
    actions: [
      // Seeing it comes before deleting it: a record a student cannot inspect is not one they can
      // meaningfully consent to. The panel is drawn in the page by the content script, so this
      // button asks the active tab to open it (profile-record-button.js).
      { id: 'btn-see-learning-record', label: 'See what is recorded', visibilityKey: null },
      { id: 'btn-delete-learning-data', label: 'Delete this record', visibilityKey: null },
    ],
    // What just happened: recording started or stopped, the record deleted, or why not. On the row,
    // so it is seen whether or not recording is on.
    statusLines: [{ id: 'learning-profile-delete-status' }],
  },

  {
    id: 'struggle-detection',
    icon: '🧭',
    name: 'Offer help when reading gets hard',
    description:
      'Watches your scrolling, how long you stay on a paragraph and how often you look words ' +
      'up, so it can offer to read aloud or simplify. Nothing is saved',
    section: 'school',
    group: 'Study',
    toggleId: 'struggle-detection-enabled',
    state: { store: 'local', path: 'struggleDetectionSettings.enabled', default: false },
    visibilityKey: 'show_struggle_detection',
    keywords:
      'stuck struggling reread rereading lost my place cant follow this is hard ' +
      'offer help proactive suggestions watching how i read',
    controls: [],
    actions: [],
  },
];
