/**
 * Smart Auto-Punctuation for Speech-to-Text
 *
 * Automatically adds punctuation based on speech patterns, pauses, and linguistic analysis.
 * Designed for neurodivergent users who may find manual punctuation commands distracting.
 *
 * Features:
 * - Pause-based period detection (long pauses = sentence end)
 * - Question detection (question words, rising patterns)
 * - Comma detection (natural pauses, conjunctions, lists)
 * - Exclamation detection (emphasis patterns)
 * - Smart capitalization after punctuation
 * - Configurable confidence thresholds
 *
 * @module AutoPunctuation
 * @version 1.0.0
 */

/**
 * Punctuation types
 */
export const PunctuationType = {
  PERIOD: '.',
  COMMA: ',',
  QUESTION: '?',
  EXCLAMATION: '!',
  NONE: '',
};

/**
 * Default configuration for auto-punctuation
 */
export const DEFAULT_CONFIG = {
  // Enable/disable auto-punctuation
  enabled: true,

  // Pause thresholds (in milliseconds)
  pauses: {
    sentence: 800, // Long pause = end of sentence (period)
    clause: 400, // Medium pause = clause break (comma)
    word: 150, // Short pause between words (no punctuation)
  },

  // Confidence thresholds (0-1)
  confidence: {
    period: 0.7, // Minimum confidence to add period
    comma: 0.6, // Minimum confidence to add comma
    question: 0.75, // Minimum confidence to add question mark
    exclamation: 0.8, // Minimum confidence to add exclamation
  },

  // Feature toggles
  features: {
    periodDetection: true,
    commaDetection: true,
    questionDetection: true,
    exclamationDetection: true,
    smartCapitalization: true,
  },

  // Mode: 'auto' (fully automatic), 'assisted' (suggestions), 'manual' (off)
  mode: 'auto',
};

/**
 * Question word patterns (words that often start questions)
 */
const QUESTION_STARTERS = new Set([
  'who',
  'what',
  'where',
  'when',
  'why',
  'how',
  'which',
  'whose',
  'whom',
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'have',
  'has',
  'had',
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "couldn't",
  "wouldn't",
  "shouldn't",
  "won't",
]);

/**
 * Question ending patterns (words that often end questions)
 */
const QUESTION_ENDERS = new Set([
  'right',
  'correct',
  'okay',
  'ok',
  'yes',
  'no',
  'huh',
  'eh',
  'yeah',
  'really',
  'true',
  'not',
  'too',
]);

/**
 * Conjunctions that often require commas before them
 */
const COMMA_CONJUNCTIONS = new Set([
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'however',
  'therefore',
  'moreover',
  'furthermore',
  'although',
  'though',
  'while',
  'whereas',
  'because',
  'since',
  'unless',
  'if',
  'when',
  'whenever',
  'where',
  'wherever',
]);

/**
 * Transitional phrases that often need commas
 */
const COMMA_TRANSITIONS = [
  'in addition',
  'on the other hand',
  'in fact',
  'for example',
  'for instance',
  'in other words',
  'as a result',
  'in conclusion',
  'to summarize',
  'first of all',
  'secondly',
  'finally',
  'in the meantime',
  'at the same time',
  'in contrast',
  'on the contrary',
];

/**
 * Exclamation indicators (words/patterns suggesting strong emotion)
 */
const EXCLAMATION_WORDS = new Set([
  'wow',
  'amazing',
  'awesome',
  'incredible',
  'fantastic',
  'wonderful',
  'excellent',
  'brilliant',
  'great',
  'oh',
  'ooh',
  'ah',
  'aah',
  'yay',
  'hooray',
  'hurray',
  'yes',
  'no',
  'stop',
  'wait',
  'help',
  'look',
  'listen',
  'watch',
  'careful',
  'danger',
  'warning',
  'congratulations',
  'congrats',
  'bravo',
  'well done',
  'perfect',
  'exactly',
  'absolutely',
  'definitely',
  'certainly',
  'never',
  'always',
  'finally',
]);

/**
 * Auto-Punctuation Engine
 */
export class AutoPunctuator {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };

    // Timing tracking
    this.lastResultTime = 0;
    this.currentPauseStart = 0;
    this.sentenceBuffer = [];

    // Statistics
    this.stats = {
      periodsAdded: 0,
      commasAdded: 0,
      questionsAdded: 0,
      exclamationsAdded: 0,
      capitalizations: 0,
    };

    // Callbacks
    this.onPunctuationAdded = options.onPunctuationAdded || (() => {});
    this.onConfidenceUpdate = options.onConfidenceUpdate || (() => {});
  }

  /**
   * Process a speech result and apply auto-punctuation
   * @param {string} text - The recognized text
   * @param {Object} metadata - Recognition metadata (timing, confidence, etc.)
   * @returns {Object} Processed result with punctuation
   */
  process(text, metadata = {}) {
    if (!this.config.enabled || this.config.mode === 'manual') {
      return { text, punctuation: PunctuationType.NONE, confidence: 0 };
    }

    const currentTime = metadata.timestamp || Date.now();
    const pauseDuration = this.lastResultTime > 0 ? currentTime - this.lastResultTime : 0;
    const recognitionConfidence = metadata.confidence || 1.0;

    // Track timing
    this.lastResultTime = currentTime;

    // Build context from sentence buffer
    this.sentenceBuffer.push({ text, timestamp: currentTime, confidence: recognitionConfidence });

    // Analyze and determine punctuation
    const analysis = this.analyze(text, {
      pauseDuration,
      recognitionConfidence,
      context: this.getSentenceContext(),
      isFinal: metadata.isFinal !== false,
    });

    // Apply punctuation if confidence is high enough
    let processedText = text;
    if (
      analysis.punctuation !== PunctuationType.NONE &&
      analysis.confidence >= this.getThreshold(analysis.punctuation)
    ) {
      processedText = this.applyPunctuation(text, analysis);
      this.updateStats(analysis.punctuation);
      this.onPunctuationAdded({
        type: analysis.punctuation,
        confidence: analysis.confidence,
        text: processedText,
      });

      // Clear sentence buffer on sentence-ending punctuation
      if (
        analysis.punctuation === PunctuationType.PERIOD ||
        analysis.punctuation === PunctuationType.QUESTION ||
        analysis.punctuation === PunctuationType.EXCLAMATION
      ) {
        this.sentenceBuffer = [];
      }
    }

    // Apply smart capitalization if enabled
    if (this.config.features.smartCapitalization) {
      processedText = this.applySmartCapitalization(processedText, analysis);
    }

    return {
      text: processedText,
      punctuation: analysis.punctuation,
      confidence: analysis.confidence,
      analysis,
    };
  }

  /**
   * Analyze text to determine appropriate punctuation
   * @param {string} text - Text to analyze
   * @param {Object} context - Analysis context
   * @returns {Object} Analysis result with punctuation recommendation
   */
  analyze(text, context) {
    const { pauseDuration, recognitionConfidence, isFinal } = context;
    const normalizedText = text.trim().toLowerCase();
    const words = normalizedText.split(/\s+/);
    const firstWord = words[0] || '';
    const lastWord = words[words.length - 1] || '';

    // Start with no punctuation
    let punctuation = PunctuationType.NONE;
    let confidence = 0;
    const signals = [];

    // 1. Question Detection
    if (this.config.features.questionDetection) {
      const questionAnalysis = this.analyzeQuestion(
        normalizedText,
        words,
        firstWord,
        lastWord,
        context
      );
      if (questionAnalysis.confidence > confidence) {
        punctuation = PunctuationType.QUESTION;
        confidence = questionAnalysis.confidence;
        signals.push(...questionAnalysis.signals);
      }
    }

    // 2. Exclamation Detection
    if (this.config.features.exclamationDetection) {
      const exclamationAnalysis = this.analyzeExclamation(normalizedText, words, context);
      if (exclamationAnalysis.confidence > confidence) {
        punctuation = PunctuationType.EXCLAMATION;
        confidence = exclamationAnalysis.confidence;
        signals.push(...exclamationAnalysis.signals);
      }
    }

    // 3. Comma Detection (only if not sentence-ending)
    if (this.config.features.commaDetection && punctuation === PunctuationType.NONE) {
      const commaAnalysis = this.analyzeComma(normalizedText, words, pauseDuration, context);
      if (commaAnalysis.confidence >= this.config.confidence.comma) {
        punctuation = PunctuationType.COMMA;
        confidence = commaAnalysis.confidence;
        signals.push(...commaAnalysis.signals);
      }
    }

    // 4. Period Detection (pause-based sentence ending)
    if (this.config.features.periodDetection && punctuation === PunctuationType.NONE) {
      const periodAnalysis = this.analyzePeriod(
        normalizedText,
        words,
        pauseDuration,
        isFinal,
        context
      );
      if (periodAnalysis.confidence >= this.config.confidence.period) {
        punctuation = PunctuationType.PERIOD;
        confidence = periodAnalysis.confidence;
        signals.push(...periodAnalysis.signals);
      }
    }

    // Factor in recognition confidence
    confidence *= recognitionConfidence;

    return {
      punctuation,
      confidence,
      signals,
      pauseDuration,
      wordCount: words.length,
    };
  }

  /**
   * Analyze for question marks
   */
  analyzeQuestion(_text, words, firstWord, lastWord, _context) {
    let confidence = 0;
    const signals = [];

    // Signal: Starts with question word
    if (QUESTION_STARTERS.has(firstWord)) {
      confidence += 0.4;
      signals.push(`question_starter:${firstWord}`);
    }

    // Signal: Ends with question tag
    if (QUESTION_ENDERS.has(lastWord)) {
      confidence += 0.3;
      signals.push(`question_ender:${lastWord}`);
    }

    // Signal: Contains "or" suggesting choice question
    if (words.includes('or') && words.length >= 3) {
      const orIndex = words.indexOf('or');
      if (orIndex > 0 && orIndex < words.length - 1) {
        confidence += 0.2;
        signals.push('or_choice');
      }
    }

    // Signal: Inverted structure (verb before subject)
    // "Is the", "Are you", "Do they", etc.
    if (words.length >= 2) {
      const verbSubjectPatterns = [
        ['is', 'the'],
        ['is', 'this'],
        ['is', 'that'],
        ['is', 'it'],
        ['are', 'you'],
        ['are', 'they'],
        ['are', 'we'],
        ['are', 'the'],
        ['do', 'you'],
        ['do', 'they'],
        ['do', 'we'],
        ['does', 'it'],
        ['does', 'he'],
        ['does', 'she'],
        ['did', 'you'],
        ['did', 'they'],
        ['did', 'it'],
        ['can', 'you'],
        ['can', 'we'],
        ['can', 'i'],
        ['could', 'you'],
        ['could', 'we'],
        ['could', 'i'],
        ['would', 'you'],
        ['would', 'it'],
        ['would', 'they'],
        ['will', 'you'],
        ['will', 'it'],
        ['will', 'they'],
        ['have', 'you'],
        ['have', 'they'],
        ['have', 'we'],
        ['has', 'he'],
        ['has', 'she'],
        ['has', 'it'],
      ];

      for (const [verb, subject] of verbSubjectPatterns) {
        if (words[0] === verb && words[1] === subject) {
          confidence += 0.3;
          signals.push(`inverted:${verb}_${subject}`);
          break;
        }
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 1.0);

    return { confidence, signals };
  }

  /**
   * Analyze for exclamation marks
   */
  analyzeExclamation(_text, words, _context) {
    let confidence = 0;
    const signals = [];

    // Signal: Contains exclamation words
    for (const word of words) {
      if (EXCLAMATION_WORDS.has(word)) {
        confidence += 0.4;
        signals.push(`exclamation_word:${word}`);
        break; // Only count first match
      }
    }

    // Signal: Very short utterance with exclamation word
    if (words.length <= 3 && confidence > 0) {
      confidence += 0.2;
      signals.push('short_exclamation');
    }

    // Signal: Repeated words (emphasis)
    if (words.length >= 2) {
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i] === words[i + 1]) {
          confidence += 0.3;
          signals.push(`repeated:${words[i]}`);
          break;
        }
      }
    }

    // Signal: "What a" or "How" exclamatory patterns
    if (words[0] === 'what' && words[1] === 'a') {
      confidence += 0.3;
      signals.push('what_a_pattern');
    }
    if (words[0] === 'how' && !QUESTION_STARTERS.has(words[1])) {
      confidence += 0.2;
      signals.push('how_exclamatory');
    }

    // Cap confidence
    confidence = Math.min(confidence, 1.0);

    return { confidence, signals };
  }

  /**
   * Analyze for commas
   */
  analyzeComma(text, words, pauseDuration, _context) {
    let confidence = 0;
    const signals = [];

    // Signal: Medium pause detected
    if (pauseDuration >= this.config.pauses.clause && pauseDuration < this.config.pauses.sentence) {
      confidence += 0.5;
      signals.push(`medium_pause:${pauseDuration}ms`);
    }

    // Signal: Coordinating conjunction at end
    const lastWord = words[words.length - 1];
    if (COMMA_CONJUNCTIONS.has(lastWord) && words.length > 1) {
      confidence += 0.3;
      signals.push(`conjunction:${lastWord}`);
    }

    // Signal: Transitional phrase
    for (const transition of COMMA_TRANSITIONS) {
      if (text.includes(transition)) {
        confidence += 0.4;
        signals.push(`transition:${transition}`);
        break;
      }
    }

    // Signal: List pattern (word word word pattern)
    if (words.length >= 3) {
      // Check for list-like sequences
      const listPattern = /\b(\w+)\s+(\w+)\s+(and|or)\s+(\w+)\b/;
      if (listPattern.test(text)) {
        confidence += 0.3;
        signals.push('list_pattern');
      }
    }

    // Signal: Introductory word/phrase
    const introWords = [
      'well',
      'now',
      'yes',
      'no',
      'okay',
      'so',
      'anyway',
      'actually',
      'basically',
      'essentially',
    ];
    if (
      introWords.includes(words[0]) &&
      words.length > 1 &&
      pauseDuration >= this.config.pauses.clause
    ) {
      confidence += 0.3;
      signals.push(`intro_word:${words[0]}`);
    }

    // Cap confidence
    confidence = Math.min(confidence, 1.0);

    return { confidence, signals };
  }

  /**
   * Analyze for periods (sentence endings)
   */
  analyzePeriod(_text, words, pauseDuration, isFinal, _context) {
    let confidence = 0;
    const signals = [];

    // Signal: Long pause detected
    if (pauseDuration >= this.config.pauses.sentence) {
      confidence += 0.6;
      signals.push(`long_pause:${pauseDuration}ms`);
    }

    // Signal: Final result with sufficient length
    if (isFinal && words.length >= 3) {
      confidence += 0.3;
      signals.push('final_result');
    }

    // Signal: Sentence-ending patterns
    const statementEnders = [
      'that',
      'it',
      'them',
      'us',
      'her',
      'him',
      'me',
      'you',
      'now',
      'then',
      'here',
      'there',
      'today',
      'yesterday',
      'tomorrow',
    ];
    const lastWord = words[words.length - 1];
    if (statementEnders.includes(lastWord)) {
      confidence += 0.2;
      signals.push(`statement_ender:${lastWord}`);
    }

    // Signal: Sufficient sentence length
    if (words.length >= 5) {
      confidence += 0.1;
      signals.push('sufficient_length');
    }

    // Signal: Contains verb (likely complete sentence)
    const commonVerbs = [
      'is',
      'are',
      'was',
      'were',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'can',
      'could',
      'should',
      'may',
      'might',
      'must',
    ];
    for (const verb of commonVerbs) {
      if (words.includes(verb)) {
        confidence += 0.1;
        signals.push(`has_verb:${verb}`);
        break;
      }
    }

    // Cap confidence
    confidence = Math.min(confidence, 1.0);

    return { confidence, signals };
  }

  /**
   * Apply punctuation to text
   */
  applyPunctuation(text, analysis) {
    const trimmed = text.trim();

    // Don't double-punctuate
    if (/[.!?,;:]$/.test(trimmed)) {
      return text;
    }

    return trimmed + analysis.punctuation;
  }

  /**
   * Apply smart capitalization
   */
  applySmartCapitalization(text, analysis) {
    if (!text || text.length === 0) {
      return text;
    }

    // Capitalize first letter of sentence
    const firstChar = text.charAt(0);
    if (/[a-z]/.test(firstChar)) {
      // Check if this is start of new sentence (after period, question, exclamation)
      const context = this.getSentenceContext();
      const isNewSentence =
        context.length === 0 || /[.!?]\s*$/.test(context) || analysis.isNewSentence;

      if (isNewSentence) {
        this.stats.capitalizations++;
        return firstChar.toUpperCase() + text.slice(1);
      }
    }

    return text;
  }

  /**
   * Get current sentence context from buffer
   */
  getSentenceContext() {
    return this.sentenceBuffer.map(item => item.text).join(' ');
  }

  /**
   * Get confidence threshold for punctuation type
   */
  getThreshold(punctuation) {
    switch (punctuation) {
      case PunctuationType.PERIOD:
        return this.config.confidence.period;
      case PunctuationType.COMMA:
        return this.config.confidence.comma;
      case PunctuationType.QUESTION:
        return this.config.confidence.question;
      case PunctuationType.EXCLAMATION:
        return this.config.confidence.exclamation;
      default:
        return 1.0;
    }
  }

  /**
   * Update statistics
   */
  updateStats(punctuation) {
    switch (punctuation) {
      case PunctuationType.PERIOD:
        this.stats.periodsAdded++;
        break;
      case PunctuationType.COMMA:
        this.stats.commasAdded++;
        break;
      case PunctuationType.QUESTION:
        this.stats.questionsAdded++;
        break;
      case PunctuationType.EXCLAMATION:
        this.stats.exclamationsAdded++;
        break;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics and buffers
   */
  reset() {
    this.lastResultTime = 0;
    this.currentPauseStart = 0;
    this.sentenceBuffer = [];
    this.stats = {
      periodsAdded: 0,
      commasAdded: 0,
      questionsAdded: 0,
      exclamationsAdded: 0,
      capitalizations: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Deep merge for nested objects
    if (newConfig.pauses) {
      this.config.pauses = { ...this.config.pauses, ...newConfig.pauses };
    }
    if (newConfig.confidence) {
      this.config.confidence = { ...this.config.confidence, ...newConfig.confidence };
    }
    if (newConfig.features) {
      this.config.features = { ...this.config.features, ...newConfig.features };
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Set punctuation mode
   * @param {string} mode - 'auto', 'assisted', or 'manual'
   */
  setMode(mode) {
    if (['auto', 'assisted', 'manual'].includes(mode)) {
      this.config.mode = mode;
    }
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.config.mode;
  }

  /**
   * Enable/disable auto-punctuation
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
  }

  /**
   * Check if enabled
   */
  isEnabled() {
    return this.config.enabled && this.config.mode !== 'manual';
  }

  /**
   * Cleanup
   */
  destroy() {
    this.reset();
  }
}

export default AutoPunctuator;
