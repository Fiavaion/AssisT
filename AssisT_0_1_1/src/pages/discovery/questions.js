/**
 * Discovery Quiz Questions
 * 6 core questions with optional "Tell me more" sub-questions
 * Each question maps to specific AssisT features
 */

export const QUESTIONS = [
  {
    id: 'reading',
    question: 'Do you find reading on screen tiring or difficult?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'reading_blur',
        label: 'Words sometimes move or blur when I read',
        featureBoost: { dyslexiaFont: 3, readingGuide: 2 },
      },
      {
        id: 'reading_place',
        label: 'I often lose my place or re-read the same line',
        featureBoost: { readingGuide: 3, readingProgress: 2 },
      },
      {
        id: 'reading_listen',
        label: 'I understand better when I hear text read aloud',
        featureBoost: { tts: 3 },
      },
      {
        id: 'reading_strain',
        label: 'I get headaches or eye strain from reading on screen',
        featureBoost: { darkMode: 2, screenOverlay: 2, textCustomization: 2 },
      },
      {
        id: 'reading_overwhelm',
        label: 'Long blocks of text feel overwhelming',
        featureBoost: { readingMode: 3, readingGuide: 2 },
      },
      {
        id: 'reading_slow',
        label: 'Reading takes me longer than I would like',
        featureBoost: { tts: 2, readingMode: 2 },
      },
      {
        id: 'reading_dense',
        label: 'Dense or cluttered pages make reading harder',
        featureBoost: { readingMode: 3, focusMode: 2 },
      },
    ],
    featureMapping: {
      tts: 3,
      readingMode: 2,
      readingGuide: 2,
      dyslexiaFont: 1,
    },
  },
  {
    id: 'writing',
    question: 'Do you find typing or writing ideas down challenging?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'writing_spelling',
        label: 'Spelling mistakes slow me down or embarrass me',
        featureBoost: { stt: 2, autoPunctuation: 1 },
      },
      {
        id: 'writing_speed',
        label: 'I think faster than I can type',
        featureBoost: { stt: 3 },
      },
      {
        id: 'writing_voice',
        label: 'Speaking my ideas would help me write better',
        featureBoost: { stt: 3, voiceCommands: 2 },
      },
      {
        id: 'writing_physical',
        label: 'Typing is physically uncomfortable or painful',
        featureBoost: { stt: 3, voiceCommands: 3 },
      },
      {
        id: 'writing_flow',
        label: 'I lose my train of thought while typing',
        featureBoost: { stt: 3, voiceCommands: 2 },
      },
      {
        id: 'writing_typos',
        label: 'I make many typos that interrupt my writing flow',
        featureBoost: { stt: 2, autoPunctuation: 2 },
      },
      {
        id: 'writing_blank',
        label: 'I find it easier to talk through ideas than write them',
        featureBoost: { stt: 3, voiceCommands: 2 },
      },
    ],
    featureMapping: {
      stt: 3,
      autoPunctuation: 2,
      voiceCommands: 1,
      vocabulary: 1,
    },
  },
  {
    id: 'focus',
    question: 'Do you struggle to maintain focus while working online?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'focus_motion',
        label: 'Animations and moving elements distract me',
        featureBoost: { reducedMotion: 3, focusMode: 2 },
      },
      {
        id: 'focus_bursts',
        label: 'I work better in short, timed bursts',
        featureBoost: { pomodoro: 3 },
      },
      {
        id: 'focus_breaks',
        label: 'I forget to take breaks and burn out',
        featureBoost: { pomodoro: 3 },
      },
      {
        id: 'focus_sidebar',
        label: 'Ads, sidebars, and related content pull my attention away',
        featureBoost: { focusMode: 3, readingMode: 2 },
      },
      {
        id: 'focus_scroll',
        label: 'I catch myself scrolling instead of working',
        featureBoost: { focusMode: 2, pomodoro: 2 },
      },
      {
        id: 'focus_audio',
        label: 'Auto-playing videos or sounds disrupt my concentration',
        featureBoost: { mediaControl: 3, reducedMotion: 2 },
      },
      {
        id: 'focus_overwhelm',
        label: 'Busy or cluttered webpages feel overwhelming',
        featureBoost: { focusMode: 3, readingMode: 3 },
      },
    ],
    featureMapping: {
      focusMode: 3,
      reducedMotion: 2,
      pomodoro: 2,
      mediaControl: 1,
    },
  },
  {
    id: 'visual',
    question: 'Do bright screens or certain colors cause discomfort?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'visual_dark',
        label: 'I prefer darker interfaces over bright white backgrounds',
        featureBoost: { darkMode: 3 },
      },
      {
        id: 'visual_colors',
        label: 'Certain background colours help me read better',
        featureBoost: { screenOverlay: 3 },
      },
      {
        id: 'visual_fonts',
        label: 'I need larger fonts to read comfortably',
        featureBoost: { textCustomization: 3 },
      },
      {
        id: 'visual_strain',
        label: 'Bright white backgrounds cause eye strain or headaches',
        featureBoost: { darkMode: 3, screenOverlay: 2 },
      },
      {
        id: 'visual_spacing',
        label: 'I need more space between lines to track text easily',
        featureBoost: { textCustomization: 3, readingGuide: 2 },
      },
      {
        id: 'visual_bluelight',
        label: 'I am sensitive to blue light from screens',
        featureBoost: { darkMode: 2, screenOverlay: 3 },
      },
      {
        id: 'visual_smalltext',
        label: 'Default website text is often too small for me',
        featureBoost: { textCustomization: 3, dyslexiaFont: 2 },
      },
    ],
    featureMapping: {
      darkMode: 3,
      screenOverlay: 2,
      textCustomization: 2,
      dyslexiaFont: 1,
    },
  },
  {
    id: 'organization',
    question: 'Do you need help keeping track of research and notes?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'org_annotate',
        label: 'I highlight or annotate documents when studying',
        featureBoost: { annotations: 3, highlightMenu: 2 },
      },
      {
        id: 'org_sources',
        label: 'I need to track sources for essays and projects',
        featureBoost: { citations: 3 },
      },
      {
        id: 'org_stats',
        label: 'Seeing word counts and reading time helps me plan',
        featureBoost: { textStats: 2, readingProgress: 2 },
      },
      {
        id: 'org_forget',
        label: 'I often forget where I found important information',
        featureBoost: { annotations: 3, citations: 3 },
      },
      {
        id: 'org_notes',
        label: 'I need to take notes while reading webpages',
        featureBoost: { annotations: 3, highlightMenu: 2 },
      },
      {
        id: 'org_quotes',
        label: 'I struggle to keep track of quotes I want to use',
        featureBoost: { annotations: 2, citations: 3, highlightMenu: 2 },
      },
      {
        id: 'org_multiple',
        label: 'I work with multiple research sources at once',
        featureBoost: { citations: 3, annotations: 2 },
      },
    ],
    featureMapping: {
      annotations: 3,
      citations: 2,
      textStats: 1,
      highlightMenu: 2,
    },
  },
  {
    id: 'language',
    question: 'Do you sometimes need text simplified or translated?',
    options: [
      { value: 0, label: 'Never' },
      { value: 1, label: 'Sometimes' },
      { value: 2, label: 'Often' },
      { value: 3, label: 'Always' },
    ],
    subQuestions: [
      {
        id: 'lang_esl',
        label: 'English is not my first language',
        featureBoost: { translation: 3, dictionary: 2 },
      },
      {
        id: 'lang_definitions',
        label: 'I often need to look up word definitions',
        featureBoost: { dictionary: 3 },
      },
      {
        id: 'lang_simplify',
        label: 'Simpler language would help me understand complex text',
        featureBoost: { simplify: 3 },
      },
      {
        id: 'lang_academic',
        label: 'Academic or technical vocabulary confuses me',
        featureBoost: { dictionary: 3, simplify: 2 },
      },
      {
        id: 'lang_learning',
        label: 'I read content in languages I am still learning',
        featureBoost: { translation: 3, dictionary: 2 },
      },
      {
        id: 'lang_sentences',
        label: 'Long or complex sentences are hard to follow',
        featureBoost: { simplify: 3, tts: 2 },
      },
      {
        id: 'lang_jargon',
        label: 'I encounter unfamiliar jargon in my studies',
        featureBoost: { dictionary: 3, simplify: 2 },
      },
    ],
    featureMapping: {
      translation: 3,
      dictionary: 2,
      simplify: 2,
    },
  },
];

/**
 * Feature definitions with display information
 */
export const FEATURES = {
  // Reading Features
  tts: {
    id: 'tts',
    name: 'Read Aloud (TTS)',
    description: 'Have text read aloud with synchronized highlighting',
    detailedDescription:
      'Select any text on a webpage and have it read aloud using high-quality text-to-speech. As words are spoken, they are highlighted in real-time so you can follow along. Adjust the reading speed, choose from multiple voices, and pause/resume at any time. Great for proofreading your own writing or when your eyes need a break.',
    icon: '🔊',
    category: 'reading',
    settingKey: 'ttsEnabled',
    howToUse: 'Select text and press Alt+R, or use the highlight menu',
  },
  readingMode: {
    id: 'readingMode',
    name: 'Reading Mode',
    description: 'Distraction-free reading with clean article view',
    detailedDescription:
      'Strips away ads, sidebars, navigation menus, and other visual clutter to present just the main content in a clean, readable format. Customise the background colour, font, and text size. Perfect for long articles or when you need to focus on the content without distractions.',
    icon: '📖',
    category: 'reading',
    settingKey: 'readingModeEnabled',
    howToUse: 'Click the Reading Mode button in the popup or press Alt+M',
  },
  readingGuide: {
    id: 'readingGuide',
    name: 'Reading Guide',
    description: 'Visual line guide that follows your reading',
    detailedDescription:
      'A horizontal bar or highlighted line follows your cursor or reading position, helping you track which line you are reading. Reduces the chance of skipping lines or losing your place, especially useful for dense text or when reading for extended periods.',
    icon: '📏',
    category: 'reading',
    settingKey: 'readingGuideEnabled',
    howToUse: 'Enable in popup, then move your mouse to guide the highlight',
  },
  readingProgress: {
    id: 'readingProgress',
    name: 'Reading Progress',
    description: 'Track how far you have read in a document',
    detailedDescription:
      'Shows a progress bar indicating how much of the page you have scrolled through. Useful for long documents when you want to know how much reading remains, or to remember where you left off when returning to a page later.',
    icon: '📊',
    category: 'reading',
    settingKey: 'readingProgressEnabled',
    howToUse: 'Enable in popup - progress bar appears at top of page',
  },
  dyslexiaFont: {
    id: 'dyslexiaFont',
    name: 'Dyslexia-Friendly Font',
    description: 'OpenDyslexic font to reduce reading difficulty',
    detailedDescription:
      'Applies the OpenDyslexic typeface, designed with weighted bottoms to help prevent letters from appearing to rotate or swap. Each letter has a unique shape to reduce confusion between similar characters like b/d and p/q. Research suggests this can improve reading comfort for some people with dyslexia.',
    icon: '🔤',
    category: 'reading',
    settingKey: 'dyslexiaEnabled',
    howToUse: 'Enable in the Visual Comfort section of the popup',
  },

  // Writing Features
  stt: {
    id: 'stt',
    name: 'Voice Input (STT)',
    description: 'Speak your ideas and have them typed for you',
    detailedDescription:
      'Dictate text using your microphone and watch it appear in any text field. Supports natural speech patterns and automatically handles punctuation when you say words like "comma" or "full stop". Ideal if typing is slow, painful, or interrupts your flow of thought.',
    icon: '🎤',
    category: 'writing',
    settingKey: 'sttEnabled',
    howToUse: 'Click in a text field, then press Alt+V or click the microphone button',
  },
  autoPunctuation: {
    id: 'autoPunctuation',
    name: 'Auto-Punctuation',
    description: 'Automatic punctuation when using voice input',
    detailedDescription:
      'Analyses your speech patterns and automatically inserts punctuation marks like full stops, commas, and question marks. Uses linguistic cues such as pauses and intonation to determine where punctuation should go, so you can focus on your ideas rather than formatting.',
    icon: '✏️',
    category: 'writing',
    settingKey: 'autoPunctuationEnabled',
    howToUse: 'Enable alongside Voice Input - punctuation is added automatically',
  },
  voiceCommands: {
    id: 'voiceCommands',
    name: 'Voice Commands',
    description: 'Control editing with voice commands',
    detailedDescription:
      'Use spoken commands to edit your text without touching the keyboard. Say things like "delete last sentence", "new paragraph", or "select all" to control your document. Helpful when you want to keep your hands free or when switching between keyboard and mouse is disruptive.',
    icon: '🗣️',
    category: 'writing',
    settingKey: 'voiceCommandsEnabled',
    howToUse: 'While dictating, say commands like "new line" or "delete that"',
  },
  vocabulary: {
    id: 'vocabulary',
    name: 'Custom Vocabulary',
    description: 'Add specialised terms for better recognition',
    detailedDescription:
      'Add subject-specific terminology, names, or technical terms that the speech recognition might not know. Your custom words are prioritised during transcription, improving accuracy for specialised fields like art history, science, or any domain with unique terminology.',
    icon: '📚',
    category: 'writing',
    settingKey: 'customVocabularyEnabled',
    howToUse: 'Open STT settings and add words to your custom vocabulary list',
  },

  // Focus Features
  focusMode: {
    id: 'focusMode',
    name: 'Focus Mode',
    description: 'Hide distracting elements on the page',
    detailedDescription:
      'Dims or hides non-essential page elements like sidebars, related content, and promotional banners. Keeps your attention on the main content by reducing visual noise. You can click through the dimmed areas if needed, but they will not compete for your attention.',
    icon: '🎯',
    category: 'focus',
    settingKey: 'focusModeEnabled',
    howToUse: 'Press Alt+F or enable in the Focus section of the popup',
  },
  reducedMotion: {
    id: 'reducedMotion',
    name: 'Reduced Motion',
    description: 'Stop animations and auto-playing videos',
    detailedDescription:
      'Pauses GIFs, stops CSS animations, and prevents videos from auto-playing. Motion on screen can be distracting or uncomfortable for some users. This feature creates a calmer browsing experience by keeping the page still until you choose to interact with media.',
    icon: '⏸️',
    category: 'focus',
    settingKey: 'reducedMotionEnabled',
    howToUse: 'Enable in popup - takes effect immediately on current page',
  },
  pomodoro: {
    id: 'pomodoro',
    name: 'Pomodoro Timer',
    description: 'Work in focused bursts with break reminders',
    detailedDescription:
      'Based on the Pomodoro Technique: work for 25 minutes, then take a 5-minute break. After four work sessions, take a longer 15-30 minute break. The timer notifies you when each period ends, helping maintain sustainable focus without burnout. Customise the intervals to suit your needs.',
    icon: '🍅',
    category: 'focus',
    settingKey: 'pomodoroEnabled',
    howToUse: 'Open the Pomodoro panel from the popup and click Start',
  },
  mediaControl: {
    id: 'mediaControl',
    name: 'Media Control',
    description: 'Block auto-playing media on pages',
    detailedDescription:
      'Prevents videos and audio from playing automatically when you load a page. Unexpected sounds can be startling or disruptive, especially in quiet environments. Media will only play when you explicitly click to start it.',
    icon: '🔇',
    category: 'focus',
    settingKey: 'mediaControlEnabled',
    howToUse: 'Enable in popup - all media requires a click to play',
  },

  // Visual Features
  darkMode: {
    id: 'darkMode',
    name: 'Dark Mode',
    description: 'Reduce brightness with dark theme',
    detailedDescription:
      'Inverts the colour scheme of webpages to use light text on a dark background. Reduces eye strain in low-light environments and can help with light sensitivity. Multiple theme presets are available, from subtle dimming to full dark mode with high contrast.',
    icon: '🌙',
    category: 'visual',
    settingKey: 'darkModeEnabled',
    howToUse: 'Toggle in the Visual Comfort section - choose from 4 presets',
  },
  screenOverlay: {
    id: 'screenOverlay',
    name: 'Colour Overlay',
    description: 'Apply calming colour tint to the screen',
    detailedDescription:
      'Applies a coloured tint over the entire page, similar to using coloured reading rulers or overlays. Some people find certain colours (often yellow, blue, or pink tints) make text easier to read and reduce visual stress. Adjust the colour and intensity to find what works best for you.',
    icon: '🎨',
    category: 'visual',
    settingKey: 'screenOverlayEnabled',
    howToUse: 'Enable in popup and use the colour picker to choose your tint',
  },
  textCustomization: {
    id: 'textCustomization',
    name: 'Text Customisation',
    description: 'Adjust font size, spacing, and style',
    detailedDescription:
      'Take control of how text appears on any webpage. Increase font size, adjust line height and letter spacing, or change the font family entirely. These adjustments persist across pages, making the web more comfortable to read according to your personal preferences.',
    icon: '🔠',
    category: 'visual',
    settingKey: 'textCustomizationEnabled',
    howToUse: 'Open Text Settings in popup to adjust size, spacing, and fonts',
  },

  // Organization Features
  annotations: {
    id: 'annotations',
    name: 'Annotations',
    description: 'Add sticky notes and highlights to pages',
    detailedDescription:
      'Place digital sticky notes anywhere on a webpage and highlight important text in multiple colours. Your annotations are saved and reappear when you revisit the page. Export your notes for revision or share them with classmates. Perfect for active reading and research.',
    icon: '📝',
    category: 'organization',
    settingKey: 'annotationsEnabled',
    howToUse: 'Select text and choose a highlight colour, or click to add a sticky note',
  },
  citations: {
    id: 'citations',
    name: 'Citation Manager',
    description: 'Save and format sources for your research',
    detailedDescription:
      'Capture bibliographic information from any webpage with one click. Automatically extracts author, title, date, and URL. Format your sources in Harvard, APA, MLA, or other citation styles. Organise sources into projects and export complete reference lists ready to paste into your essays.',
    icon: '📑',
    category: 'organization',
    settingKey: 'citationsEnabled',
    howToUse: 'Right-click any page and select "Save Citation" or use the popup',
  },
  textStats: {
    id: 'textStats',
    name: 'Text Statistics',
    description: 'Word count and reading time estimates',
    detailedDescription:
      'Instantly see word count, character count, sentence count, and estimated reading time for any selected text or entire page. Useful for checking assignment word limits, planning your reading time, or understanding the scope of a document before you start.',
    icon: '📈',
    category: 'organization',
    settingKey: 'textStatsEnabled',
    howToUse: 'Select text to see stats, or view page stats in the popup',
  },
  highlightMenu: {
    id: 'highlightMenu',
    name: 'Highlight Menu',
    description: 'Quick actions when you select text',
    detailedDescription:
      'A floating toolbar appears whenever you select text, giving you instant access to common actions: read aloud, highlight, add note, look up definition, translate, copy, or search. Customise which buttons appear to create your own quick-access toolkit.',
    icon: '✨',
    category: 'organization',
    settingKey: 'highlightMenuEnabled',
    howToUse: 'Select any text - the menu appears automatically',
  },

  // Language Features
  translation: {
    id: 'translation',
    name: 'Translation',
    description: 'Translate text to your preferred language',
    detailedDescription:
      'Translate selected text or entire pages into your preferred language. Useful for reading sources in other languages or checking your understanding of complex English text by seeing it in your native language. Supports dozens of languages with no API key required.',
    icon: '🌐',
    category: 'language',
    settingKey: 'translationEnabled',
    howToUse: 'Select text and click Translate, or use full-page translation in popup',
  },
  dictionary: {
    id: 'dictionary',
    name: 'Dictionary Lookup',
    description: 'Instant definitions for any word',
    detailedDescription:
      'Double-click any word to see its definition, pronunciation, and example usage in a popup. No need to open a new tab or lose your place. Results are cached so looking up the same word again is instant. Great for building vocabulary while reading.',
    icon: '📖',
    category: 'language',
    settingKey: 'dictionaryEnabled',
    howToUse: 'Double-click a word, or select it and click Define in the highlight menu',
  },
  simplify: {
    id: 'simplify',
    name: 'Simplify Text',
    description: 'Convert complex text to simpler language',
    detailedDescription:
      'Rewrites selected text using simpler words and shorter sentences while preserving the meaning. Helpful for understanding academic or technical writing, legal documents, or any text that uses unfamiliar jargon. See the original and simplified versions side by side.',
    icon: '💡',
    category: 'language',
    settingKey: 'simplifyEnabled',
    howToUse: 'Select complex text and click Simplify in the highlight menu',
  },
};

/**
 * Category display information
 */
export const CATEGORIES = {
  reading: { name: 'Reading Support', icon: '📚' },
  writing: { name: 'Writing Support', icon: '✍️' },
  focus: { name: 'Focus & Attention', icon: '🎯' },
  visual: { name: 'Visual Comfort', icon: '👁️' },
  organization: { name: 'Organization', icon: '📁' },
  language: { name: 'Language Help', icon: '🌐' },
};

/**
 * Quick Quiz question IDs
 * Selected to cover the three main preset profiles:
 * - reading → Dyslexia Support preset
 * - focus → ADHD Focus preset
 * - visual → Sensory Sensitive preset
 */
export const QUICK_QUIZ_IDS = ['reading', 'focus', 'visual'];

/**
 * Get questions for a specific quiz mode
 * @param {string} mode - 'quick' or 'full'
 * @returns {Array} Array of question objects
 */
export function getQuestionsForMode(mode) {
  if (mode === 'quick') {
    return QUESTIONS.filter(q => QUICK_QUIZ_IDS.includes(q.id));
  }
  return QUESTIONS;
}
