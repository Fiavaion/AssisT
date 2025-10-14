/**
 * Script to add data-testid attributes to all interactive elements
 * Run with: node scripts/add-testids.js
 */

const fs = require('fs');
const path = require('path');

const popupHtmlPath = path.join(__dirname, '../src/popup/popup.html');
let html = fs.readFileSync(popupHtmlPath, 'utf-8');

// Define all test IDs to add (id selector → data-testid value)
const testIds = {
  // Header buttons (already done)
  'id="btn-reset"': 'data-testid="reset-button"',
  'id="btn-help"': 'data-testid="help-button"',
  'id="btn-options"': 'data-testid="settings-button"',

  // Profile controls
  'id="profile-select"': 'data-testid="profile-select"',
  'id="btn-save-profile"': 'data-testid="profile-save-button"',
  'id="btn-export-profiles"': 'data-testid="profile-export-button"',
  'id="btn-import-profiles"': 'data-testid="profile-import-button"',

  // TTS Main Toggle
  'id="tts-enabled"': 'data-testid="tts-toggle"',

  // TTS Controls
  'id="btn-read-page"': 'data-testid="read-page-button"',
  'id="voice-select"': 'data-testid="tts-voice-select"',
  'id="rate-slider"': 'data-testid="tts-speed-slider"',
  'id="pitch-slider"': 'data-testid="tts-pitch-slider"',
  'id="volume-slider"': 'data-testid="tts-volume-slider"',
  'id="highlight-enabled"': 'data-testid="tts-highlight-toggle"',
  'id="highlight-color"': 'data-testid="tts-highlight-color-select"',
  'id="highlight-opacity"': 'data-testid="tts-highlight-opacity-slider"',
  'id="word-by-word-enabled"': 'data-testid="tts-word-by-word-toggle"',

  // Text Customization
  'id="text-customization-enabled"': 'data-testid="text-customization-toggle"',
  'id="text-font-family"': 'data-testid="text-font-select"',
  'id="text-line-spacing"': 'data-testid="text-line-spacing-slider"',
  'id="text-letter-spacing"': 'data-testid="text-letter-spacing-slider"',
  'id="text-word-spacing"': 'data-testid="text-word-spacing-slider"',
  'id="text-paragraph-spacing"': 'data-testid="text-paragraph-spacing-slider"',

  // Reading Guide
  'id="reading-guide-enabled"': 'data-testid="reading-guide-toggle"',
  'id="reading-guide-color"': 'data-testid="reading-guide-color-select"',
  'id="reading-guide-thickness"': 'data-testid="reading-guide-thickness-slider"',
  'id="reading-guide-opacity"': 'data-testid="reading-guide-opacity-slider"',

  // Focus Mode
  'id="focus-mode-enabled"': 'data-testid="focus-mode-toggle"',
  'id="focus-mode-width"': 'data-testid="focus-mode-width-slider"',
  'id="focus-mode-height"': 'data-testid="focus-mode-height-slider"',
  'id="focus-mode-opacity"': 'data-testid="focus-mode-opacity-slider"',

  // Screen Overlay
  'id="screen-overlay-enabled"': 'data-testid="screen-overlay-toggle"',
  'id="screen-overlay-color"': 'data-testid="screen-overlay-color-select"',
  'id="screen-overlay-opacity"': 'data-testid="screen-overlay-opacity-slider"',

  // Canvas Integration
  'id="canvas-integration-enabled"': 'data-testid="canvas-toggle"',
  'id="canvas-assignment-reader"': 'data-testid="canvas-assignment-reader-toggle"',
  'id="canvas-quiz-helper"': 'data-testid="canvas-quiz-helper-toggle"',
  'id="quiz-read-answers"': 'data-testid="canvas-quiz-read-answers-toggle"',
  'id="quiz-auto-read"': 'data-testid="canvas-quiz-auto-read-toggle"',
  'id="quiz-highlight-question"': 'data-testid="canvas-quiz-highlight-toggle"',
  'id="quiz-highlight-color"': 'data-testid="canvas-quiz-highlight-color-select"',
  'id="quiz-keyboard-nav"': 'data-testid="canvas-quiz-keyboard-nav-toggle"',
  'id="canvas-keyboard-nav"': 'data-testid="canvas-keyboard-nav-toggle"',

  // Moodle Integration
  'id="moodle-integration-enabled"': 'data-testid="moodle-toggle"',
  'id="moodle-assignment-reader"': 'data-testid="moodle-assignment-reader-toggle"',
  'id="moodle-forum-reader"': 'data-testid="moodle-forum-reader-toggle"',
  'id="moodle-page-reader"': 'data-testid="moodle-page-reader-toggle"',
  'id="moodle-quiz-helper"': 'data-testid="moodle-quiz-helper-toggle"',

  // Google Classroom Integration
  'id="google-classroom-integration-enabled"': 'data-testid="classroom-toggle"',
  'id="google-classroom-assignment-reader"': 'data-testid="classroom-assignment-reader-toggle"',
  'id="google-classroom-stream-reader"': 'data-testid="classroom-stream-reader-toggle"',
  'id="google-classroom-classwork-reader"': 'data-testid="classroom-classwork-reader-toggle"',

  // STT (Speech-to-Text)
  'id="stt-enabled"': 'data-testid="stt-toggle"',
  'id="stt-continuous-mode"': 'data-testid="stt-continuous-mode-toggle"',
  'id="stt-language"': 'data-testid="stt-language-select"',
  'id="stt-punctuation-commands"': 'data-testid="stt-punctuation-toggle"',
  'id="stt-auto-capitalize"': 'data-testid="stt-auto-capitalize-toggle"',
  'id="stt-interim-results"': 'data-testid="stt-interim-results-toggle"',
  'id="stt-floating-button"': 'data-testid="stt-floating-button-toggle"',

  // Dyslexia Mode
  'id="dyslexia-mode-enabled"': 'data-testid="dyslexia-toggle"',
  'id="dyslexia-bionic"': 'data-testid="dyslexia-bionic-radio"',
  'id="dyslexia-syllable"': 'data-testid="dyslexia-syllable-radio"',
  'id="dyslexia-grammar"': 'data-testid="dyslexia-grammar-radio"',
  'id="dyslexia-intensity"': 'data-testid="dyslexia-intensity-slider"',

  // Modal buttons
  'id="profile-name-input"': 'data-testid="profile-name-input"',
  'id="btn-cancel-save-profile"': 'data-testid="profile-save-cancel-button"',
  'id="btn-confirm-save-profile"': 'data-testid="profile-save-confirm-button"',
  'id="btn-cancel-delete-profile"': 'data-testid="profile-delete-cancel-button"',
  'id="btn-confirm-delete-profile"': 'data-testid="profile-delete-confirm-button"',
  'id="profile-import-input"': 'data-testid="profile-import-input"',

  // Footer links
  'id="link-settings"': 'data-testid="footer-settings-link"',

  // Speed preset buttons
  'data-speed="0.5"': 'data-testid="speed-preset-0.5"',
  'data-speed="1.0"': 'data-testid="speed-preset-1.0"',
  'data-speed="1.5"': 'data-testid="speed-preset-1.5"',
  'data-speed="2.0"': 'data-testid="speed-preset-2.0"'
};

// Add test IDs
let modified = false;
for (const [selector, testId] of Object.entries(testIds)) {
  // Only add if the element doesn't already have data-testid
  const regex = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![^<]*data-testid)`, 'g');

  if (regex.test(html)) {
    // Add data-testid after the id attribute
    html = html.replace(regex, (match) => {
      return `${match}\n            ${testId}`;
    });
    modified = true;
    console.log(`✅ Added ${testId} to element with ${selector}`);
  }
}

if (modified) {
  fs.writeFileSync(popupHtmlPath, html, 'utf-8');
  console.log('\n✅ Successfully added data-testid attributes to popup.html');
  console.log(`📄 File: ${popupHtmlPath}`);
} else {
  console.log('\n✅ All data-testid attributes already present');
}
