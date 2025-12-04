/**
 * Fallback Manager for AssisT LLM Edition
 *
 * Provides graceful degradation when local LLM is unavailable:
 * - Rule-based fallbacks for critical features
 * - User-friendly messages explaining limitations
 * - Suggestions for enabling AI features
 *
 * @module ai/fallback-manager
 */

/**
 * Fallback responses and behaviors for different AI features
 */
const FALLBACK_BEHAVIORS = {
  summarize: {
    type: 'partial',
    message: 'AI summarization unavailable. Showing first paragraph instead.',
    handler: (text) => {
      // Extract first paragraph or first 500 chars
      const paragraphs = text.split(/\n\n+/);
      return paragraphs[0]?.slice(0, 500) + (paragraphs[0]?.length > 500 ? '...' : '');
    }
  },

  simplify: {
    type: 'disabled',
    message: 'AI text simplification requires local LLM. Please start Ollama.',
    handler: () => null
  },

  explain: {
    type: 'redirect',
    message: 'For explanations, try the Dictionary feature or web search.',
    handler: () => ({
      suggestion: 'dictionary',
      altSuggestion: 'search'
    })
  },

  'cognitive-state': {
    type: 'disabled',
    message: 'Cognitive state detection requires AI. Using default settings.',
    handler: () => ({
      state: 'unknown',
      confidence: 0,
      recommendation: null
    })
  },

  'content-prioritize': {
    type: 'fallback',
    message: 'Using standard content extraction (AI prioritization unavailable).',
    handler: (content) => ({
      critical: [content],
      supporting: [],
      navigational: [],
      aiEnhanced: false
    })
  },

  'assignment-breakdown': {
    type: 'partial',
    message: 'AI assignment analysis unavailable. Showing basic structure.',
    handler: (text) => {
      // Simple rule-based extraction
      const lines = text.split('\n').filter(l => l.trim());
      const tasks = lines.filter(l =>
        /^[\d\-\*\•]/.test(l.trim()) ||
        /\b(submit|complete|write|read|answer|create|prepare)\b/i.test(l)
      );

      return {
        tasks: tasks.slice(0, 10),
        aiAnalysis: false,
        message: 'Basic extraction only. Enable AI for detailed breakdown.'
      };
    }
  },

  'socratic-question': {
    type: 'static',
    message: 'AI tutoring unavailable. Here are some general reflection questions.',
    handler: () => [
      'What is the main idea of this section?',
      'How does this connect to what you already know?',
      'What questions do you still have?',
      'Can you explain this in your own words?'
    ]
  },

  'image-describe': {
    type: 'disabled',
    message: 'Image description requires Vision AI model. Click "Install Vision AI" to enable.',
    requiresVision: true,
    handler: () => null
  },

  'prosody-analyze': {
    type: 'fallback',
    message: 'Using standard TTS (emotional prosody requires AI).',
    handler: () => ({
      rate: 1.0,
      pitch: 1.0,
      emphasis: [],
      emotion: 'neutral'
    })
  },

  'knowledge-gap': {
    type: 'partial',
    message: 'Tracking lookups but AI analysis unavailable.',
    handler: (lookups) => ({
      frequentLookups: lookups.sort((a, b) => b.count - a.count).slice(0, 5),
      aiInsights: null
    })
  }
};

/**
 * Fallback Manager class
 */
export class FallbackManager {
  constructor() {
    this.unavailableShown = new Set(); // Track which messages shown this session
    this.listeners = new Set();
  }

  /**
   * Get fallback response for a feature
   * @param {string} featureId - Feature identifier
   * @param {any} input - Input data for fallback handler
   * @param {Object} options - Additional options
   * @returns {Object} Fallback result
   */
  getFallback(featureId, input = null, options = {}) {
    const behavior = FALLBACK_BEHAVIORS[featureId];

    if (!behavior) {
      return {
        type: 'unknown',
        message: 'This feature requires AI. Please ensure Ollama is running.',
        result: null
      };
    }

    // Execute fallback handler if available
    let result = null;
    if (behavior.handler && input !== null) {
      try {
        result = behavior.handler(input);
      } catch (error) {
        console.error(`[FallbackManager] Handler error for ${featureId}:`, error);
      }
    }

    // Show notification if not shown recently
    if (!options.silent && !this.unavailableShown.has(featureId)) {
      this._notifyListeners('fallback-used', {
        featureId,
        message: behavior.message,
        type: behavior.type
      });

      // Don't spam the same message
      this.unavailableShown.add(featureId);
      setTimeout(() => this.unavailableShown.delete(featureId), 60000); // Reset after 1 min
    }

    return {
      type: behavior.type,
      message: behavior.message,
      result,
      requiresVision: behavior.requiresVision || false,
      aiAvailable: false
    };
  }

  /**
   * Check if a feature has a usable fallback
   * @param {string} featureId
   * @returns {boolean}
   */
  hasFallback(featureId) {
    const behavior = FALLBACK_BEHAVIORS[featureId];
    return behavior && behavior.type !== 'disabled';
  }

  /**
   * Get user-friendly message for when AI is unavailable
   * @param {string} context - What the user was trying to do
   * @returns {Object}
   */
  getUnavailableMessage(context = 'general') {
    const messages = {
      general: {
        title: 'Local AI Not Running',
        body: 'Start Ollama to enable AI-powered features.',
        action: 'Learn how to install',
        actionUrl: 'https://ollama.ai'
      },
      vision: {
        title: 'Vision AI Not Installed',
        body: 'The LLaVA model is needed for image understanding.',
        action: 'Install Vision AI',
        actionType: 'install-vision'
      },
      firstTime: {
        title: 'Enable AI Features',
        body: 'AssisT can use local AI for smarter assistance. Your data stays on your device.',
        action: 'Set up AI',
        actionType: 'setup-wizard'
      }
    };

    return messages[context] || messages.general;
  }

  /**
   * Get suggestions when AI feature is unavailable
   * @param {string} featureId
   * @returns {Array}
   */
  getAlternativeSuggestions(featureId) {
    const suggestions = {
      summarize: [
        { label: 'Use Reading Mode', action: 'enable-reading-mode' },
        { label: 'Read with TTS', action: 'enable-tts' }
      ],
      simplify: [
        { label: 'Adjust text settings', action: 'open-text-settings' },
        { label: 'Use dictionary', action: 'enable-dictionary' }
      ],
      'image-describe': [
        { label: 'Use OCR to extract text', action: 'enable-ocr' }
      ],
      explain: [
        { label: 'Look up in dictionary', action: 'dictionary-lookup' },
        { label: 'Search online', action: 'web-search' }
      ]
    };

    return suggestions[featureId] || [];
  }

  /**
   * Add listener for fallback events
   * @param {function} callback
   * @returns {function} Unsubscribe function
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners
   * @private
   */
  _notifyListeners(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (e) {
        console.error('[FallbackManager] Listener error:', e);
      }
    }
  }

  /**
   * Reset shown messages (e.g., on new session)
   */
  reset() {
    this.unavailableShown.clear();
  }
}

// Singleton instance
let managerInstance = null;

/**
 * Get the fallback manager singleton
 * @returns {FallbackManager}
 */
export function getFallbackManager() {
  if (!managerInstance) {
    managerInstance = new FallbackManager();
  }
  return managerInstance;
}

export { FALLBACK_BEHAVIORS };
export default FallbackManager;
