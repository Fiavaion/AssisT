/**
 * Storage Manager
 * Handles all Chrome storage API interactions with FERPA-compliant data handling
 * Stores user preferences locally for privacy
 */

export class StorageManager {
  static STORAGE_KEYS = {
    SETTINGS: 'assist_settings',
    USER_PROFILE: 'assist_user_profile',
    LAST_SYNC: 'assist_last_sync',
  };

  static DEFAULT_SETTINGS = {
    tts: {
      enabled: false,
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      highlightOpacity: 0.7,
      autoStart: false,
    },
    // Sprint 5 Features
    stt: {
      enabled: false, // Default OFF
      continuousMode: true, // Keep listening vs single utterance
      interimResults: true, // Show partial results
      language: 'en-US', // Recognition language
      autoCapitalize: true, // Capitalize first word of sentences
      punctuationCommands: true, // Voice punctuation ("period", "comma")
      floatingButton: true, // Show mic button on text field focus
    },
    waiAdapt: {
      textSpacing: {
        enabled: false,
        lineHeight: 1.5,
        paragraphSpacing: 2.0,
        letterSpacing: 0.12,
        wordSpacing: 0.16,
      },
      focusMode: {
        enabled: false,
        hideExtraneous: true,
        simplifyNavigation: true,
      },
      numericSimplification: {
        enabled: false,
        useText: true,
        useGraphics: false,
      },
      typography: {
        font: 'system',
        fontSize: 16,
        useOpenDyslexic: false,
      },
      colorScheme: {
        mode: 'default',
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
        contrast: 'normal',
      },
    },
    accessibility: {
      keyboardShortcuts: true,
      screenReaderOptimized: false,
      reducedMotion: false,
    },
    // Sprint 3 Features
    textCustomization: {
      enabled: false,
      fontFamily: 'system', // 'system' | 'lexend' | 'opendyslexic' | 'comic-sans' | 'arial'
      lineSpacing: 1.5, // WCAG min: 1.5
      letterSpacing: 0.12, // WCAG min: 0.12em (displayed as 12%)
      wordSpacing: 0.16, // WCAG min: 0.16em (displayed as 16%)
      paragraphSpacing: 2.0, // WCAG min: 2.0em
    },
    readingGuide: {
      enabled: false,
      lineColor: '#000000',
      lineThickness: 3, // px, range: 1-10px
      lineOpacity: 0.7, // 0.0-1.0
    },
    focusMode: {
      enabled: false,
      boxWidth: 400, // px, min: 150, max: 800, step: 5
      boxHeight: 100, // px, min: 50, max: 250, step: 5
      overlayOpacity: 0.7, // 0.0-1.0 (darkness of surrounding area)
    },
    // OCR (Optical Character Recognition)
    ocr: {
      enabled: false, // Default OFF - requires user activation
      autoActivateReadingMode: true,
      filterNoise: true,
      upscaleFactor: 1.5,
    },
    // Sprint 4 Features
    canvasIntegration: {
      enabled: false, // Default OFF - user will test post-launch
      assignmentReader: true, // Auto-reader for Canvas assignments
      quizHelper: false, // Future: Quiz content extraction
      keyboardNav: false, // Future: Keyboard navigation enhancements
    },
    // Sprint 9 Features - Multi-Platform LMS Support
    moodleIntegration: {
      enabled: false, // Default OFF - EXPERIMENTAL feature
      assignmentReader: true, // Auto-reader for Moodle assignments
      forumReader: true, // Read forum posts
      pageReader: true, // Read page resources
      quizHelper: false, // Future: Quiz content extraction
    },
    googleClassroomIntegration: {
      enabled: false, // Default OFF - EXPERIMENTAL feature
      assignmentReader: true, // Auto-reader for Google Classroom assignments
      streamReader: true, // Read stream posts/announcements
      classworkReader: true, // Read classwork items
    },
    // Local LLM Integration (AssisT LLM Edition)
    localLLM: {
      enabled: false, // Master toggle for all AI features
      baseUrl: 'http://localhost:11434', // Ollama default URL
      preferredModel: 'llama3.2', // Default model for most tasks
      fastModel: 'phi3:mini', // Model for quick responses
      visionModel: 'llava', // Model for image understanding
      // Individual feature toggles
      features: {
        smartSummarization: true, // AI-powered text summaries
        textSimplification: true, // Semantic text simplification
        cognitiveProfile: true, // Cognitive Twin learning
        struggleDetection: true, // Proactive help triggers
        socraticTutor: true, // Guided questioning mode
        assignmentAnalyzer: true, // Assignment breakdown
        citationAnalyzer: true, // Source evaluation
        visionAnalysis: true, // Image/page understanding
        knowledgeGraph: true, // Annotation linking
        adaptiveRSVP: true, // Intelligent RSVP timing
        predictiveLoading: true, // Pre-load content
      },
      // Cognitive profile settings
      cognitiveProfile: {
        persistence: '6months', // 'session' | '1month' | '6months' | '1year' | 'permanent'
        lastCleared: null,
        exportEnabled: true,
      },
      // Privacy settings (enforced)
      privacy: {
        neverSendToCloud: true, // Cannot be disabled
        clearContextAfterSession: false, // Clear conversation context after session
        noPersonalDataInPrompts: true, // Sanitize prompts
        localProcessingOnly: true, // Enforced - no cloud APIs
      },
      // Performance settings
      performance: {
        cacheResponses: true, // Cache identical requests
        cacheTTL: 300000, // 5 minutes cache duration
        maxConcurrentRequests: 2, // Limit parallel AI requests
        timeoutMs: 30000, // Request timeout
      },
      // UI preferences
      ui: {
        showAIIndicator: true, // Show when AI is processing
        showFallbackMessages: true, // Notify when using fallbacks
        compactMode: false, // Reduce AI UI footprint
      },
    },
  };

  /**
   * Initialize default settings on first install
   */
  static async initializeDefaults() {
    try {
      const existing = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);

      if (!existing[this.STORAGE_KEYS.SETTINGS]) {
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
          [this.STORAGE_KEYS.LAST_SYNC]: Date.now(),
        });

        console.log('[Storage] Default settings initialized');
      }

      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to initialize defaults:', error);
      throw error;
    }
  }

  /**
   * Get all user settings
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      return result[this.STORAGE_KEYS.SETTINGS] || this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to get settings:', error);
      return this.DEFAULT_SETTINGS;
    }
  }

  /**
   * Update specific setting
   */
  static async updateSetting(path, value) {
    try {
      const settings = await this.getSettings();
      const keys = path.split('.');

      let current = settings;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now(),
      });

      console.log('[Storage] Setting updated:', path, value);
      return settings;
    } catch (error) {
      console.error('[Storage] Failed to update setting:', error);
      throw error;
    }
  }

  /**
   * Save complete settings object
   */
  static async saveSettings(settings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now(),
      });

      console.log('[Storage] Settings saved');
      return settings;
    } catch (error) {
      console.error('[Storage] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Reset to defaults
   */
  static async resetToDefaults() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now(),
      });

      console.log('[Storage] Settings reset to defaults');
      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to reset settings:', error);
      throw error;
    }
  }

  /**
   * Export settings for backup (FERPA-compliant - no PII)
   */
  static async exportSettings() {
    try {
      const settings = await this.getSettings();
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: settings,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[Storage] Failed to export settings:', error);
      throw error;
    }
  }

  /**
   * Import settings from backup
   */
  static async importSettings(jsonString) {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData.settings) {
        throw new Error('Invalid import format');
      }

      await this.saveSettings(importData.settings);
      console.log('[Storage] Settings imported successfully');

      return importData.settings;
    } catch (error) {
      console.error('[Storage] Failed to import settings:', error);
      throw error;
    }
  }
}
