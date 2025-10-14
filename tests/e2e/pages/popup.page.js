/**
 * Page Object Model for AssisT Popup
 * Centralizes all selectors and common actions
 */

export class PopupPage {
  constructor(page) {
    this.page = page;
  }

  // Selectors
  get selectors() {
    return {
      // Header
      resetButton: '[data-testid="reset-button"]',
      helpButton: '[data-testid="help-button"]',
      settingsButton: '[data-testid="settings-button"]',

      // Profiles
      profileSelect: '[data-testid="profile-select"]',
      profileSaveButton: '[data-testid="profile-save-button"]',
      profileExportButton: '[data-testid="profile-export-button"]',
      profileImportButton: '[data-testid="profile-import-button"]',

      // TTS
      ttsToggle: '[data-testid="tts-toggle"]',
      ttsVoiceSelect: '[data-testid="tts-voice-select"]',
      ttsSpeedSlider: '[data-testid="tts-speed-slider"]',
      ttsPitchSlider: '[data-testid="tts-pitch-slider"]',
      ttsVolumeSlider: '[data-testid="tts-volume-slider"]',
      ttsHighlightToggle: '[data-testid="tts-highlight-toggle"]',

      // Text Customization
      textCustomizationToggle: '[data-testid="text-customization-toggle"]',
      textFontSelect: '[data-testid="text-font-select"]',

      // Reading Guide
      readingGuideToggle: '[data-testid="reading-guide-toggle"]',

      // Focus Mode
      focusModeToggle: '[data-testid="focus-mode-toggle"]',

      // Screen Overlay
      screenOverlayToggle: '[data-testid="screen-overlay-toggle"]',

      // Dyslexia Mode
      dyslexiaToggle: '[data-testid="dyslexia-toggle"]',
      dyslexiaBionicRadio: '[data-testid="dyslexia-bionic-radio"]',
      dyslexiaSyllableRadio: '[data-testid="dyslexia-syllable-radio"]',
      dyslexiaGrammarRadio: '[data-testid="dyslexia-grammar-radio"]',
      dyslexiaIntensitySlider: '[data-testid="dyslexia-intensity-slider"]',

      // STT
      sttToggle: '[data-testid="stt-toggle"]',
      sttLanguageSelect: '[data-testid="stt-language-select"]',

      // LMS Integration
      canvasToggle: '[data-testid="canvas-toggle"]',
      moodleToggle: '[data-testid="moodle-toggle"]',
      classroomToggle: '[data-testid="classroom-toggle"]'
    };
  }

  // Navigation
  async goto() {
    // Implemented by test fixture
  }

  async reload() {
    await this.page.reload();
    await this.page.waitForLoadState('domcontentloaded');
  }

  // Header Actions
  async clickReset() {
    await this.page.click(this.selectors.resetButton);
  }

  async clickHelp() {
    await this.page.click(this.selectors.helpButton);
  }

  async clickSettings() {
    await this.page.click(this.selectors.settingsButton);
  }

  // Profile Actions
  async selectProfile(profileName) {
    await this.page.selectOption(this.selectors.profileSelect, { label: profileName });
    await this.page.waitForTimeout(300);
  }

  async saveProfile(name) {
    await this.page.click(this.selectors.profileSaveButton);
    // Modal should open - handle in test
  }

  async exportProfiles() {
    await this.page.click(this.selectors.profileExportButton);
  }

  async importProfiles() {
    await this.page.click(this.selectors.profileImportButton);
  }

  // TTS Actions
  async enableTTS() {
    await this.page.locator(this.selectors.ttsToggle).check();
    await this.page.waitForTimeout(300);
  }

  async disableTTS() {
    await this.page.locator(this.selectors.ttsToggle).uncheck();
  }

  async selectVoice(voiceName) {
    await this.page.selectOption(this.selectors.ttsVoiceSelect, { label: voiceName });
  }

  async setSpeed(speed) {
    await this.page.locator(this.selectors.ttsSpeedSlider).fill(speed.toString());
  }

  async setPitch(pitch) {
    await this.page.locator(this.selectors.ttsPitchSlider).fill(pitch.toString());
  }

  async setVolume(volume) {
    await this.page.locator(this.selectors.ttsVolumeSlider).fill(volume.toString());
  }

  async enableHighlight() {
    await this.page.locator(this.selectors.ttsHighlightToggle).check();
  }

  async disableHighlight() {
    await this.page.locator(this.selectors.ttsHighlightToggle).uncheck();
  }

  // Dyslexia Mode Actions
  async enableDyslexiaMode() {
    await this.page.locator(this.selectors.dyslexiaToggle).check();
    await this.page.waitForTimeout(300);
  }

  async disableDyslexiaMode() {
    await this.page.locator(this.selectors.dyslexiaToggle).uncheck();
  }

  async selectBionicMode() {
    await this.page.locator(this.selectors.dyslexiaBionicRadio).check();
    await this.page.waitForTimeout(300);
  }

  async selectSyllableMode() {
    await this.page.locator(this.selectors.dyslexiaSyllableRadio).check();
    await this.page.waitForTimeout(300);
  }

  async selectGrammarMode() {
    await this.page.locator(this.selectors.dyslexiaGrammarRadio).check();
    await this.page.waitForTimeout(300);
  }

  async setDyslexiaIntensity(intensity) {
    await this.page.locator(this.selectors.dyslexiaIntensitySlider).fill(intensity.toString());
  }

  // Text Customization Actions
  async enableTextCustomization() {
    await this.page.locator(this.selectors.textCustomizationToggle).check();
  }

  async disableTextCustomization() {
    await this.page.locator(this.selectors.textCustomizationToggle).uncheck();
  }

  // Reading Guide Actions
  async enableReadingGuide() {
    await this.page.locator(this.selectors.readingGuideToggle).check();
  }

  async disableReadingGuide() {
    await this.page.locator(this.selectors.readingGuideToggle).uncheck();
  }

  // Focus Mode Actions
  async enableFocusMode() {
    await this.page.locator(this.selectors.focusModeToggle).check();
  }

  async disableFocusMode() {
    await this.page.locator(this.selectors.focusModeToggle).uncheck();
  }

  // Screen Overlay Actions
  async enableScreenOverlay() {
    await this.page.locator(this.selectors.screenOverlayToggle).check();
  }

  async disableScreenOverlay() {
    await this.page.locator(this.selectors.screenOverlayToggle).uncheck();
  }

  // STT Actions
  async enableSTT() {
    await this.page.locator(this.selectors.sttToggle).check();
  }

  async disableSTT() {
    await this.page.locator(this.selectors.sttToggle).uncheck();
  }

  // LMS Integration Actions
  async enableCanvas() {
    await this.page.locator(this.selectors.canvasToggle).check();
  }

  async enableMoodle() {
    await this.page.locator(this.selectors.moodleToggle).check();
  }

  async enableClassroom() {
    await this.page.locator(this.selectors.classroomToggle).check();
  }

  // Assertions
  async isTTSEnabled() {
    return await this.page.locator(this.selectors.ttsToggle).isChecked();
  }

  async isDyslexiaModeEnabled() {
    return await this.page.locator(this.selectors.dyslexiaToggle).isChecked();
  }

  async getSpeed() {
    return await this.page.locator(this.selectors.ttsSpeedSlider).inputValue();
  }

  async getSelectedProfile() {
    return await this.page.locator(this.selectors.profileSelect).inputValue();
  }

  // Visibility Checks
  async isVisible(selector) {
    return await this.page.locator(selector).isVisible();
  }

  async waitForVisible(selector, timeout = 2000) {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }
}
