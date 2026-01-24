/**
 * Emotional TTS Feature
 *
 * Detects emotional tone in text and adjusts Text-to-Speech parameters accordingly.
 * Creates more natural, expressive reading experiences.
 *
 * Features:
 * - AI-powered emotion detection
 * - Adjusts speech rate, pitch, and volume based on emotion
 * - Visual emotion indicator during playback
 * - Fallback rule-based emotion detection
 *
 * Supported emotions:
 * - Happy/Excited: Faster, higher pitch
 * - Sad/Somber: Slower, lower pitch
 * - Angry/Urgent: Faster, emphasized
 * - Calm/Neutral: Normal pace
 * - Serious/Formal: Slower, measured
 *
 * @module features/emotionalTTS
 */

import { sanitizeHTML } from '../../utils/sanitize.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let emotionalTTS_indicator = null;
let emotionalTTS_isPlaying = false;

const emotionalTTS_settings = {
  enabled: true,
  showEmotionIndicator: true,
  intensityLevel: 'moderate', // 'subtle' | 'moderate' | 'expressive'
};

// Emotion-to-speech parameter mappings
const EMOTION_PARAMS = {
  happy: {
    rate: 1.1,
    pitch: 1.15,
    volume: 1.0,
    icon: '😊',
    label: 'Happy',
    color: '#ffc107',
  },
  excited: {
    rate: 1.2,
    pitch: 1.2,
    volume: 1.0,
    icon: '🎉',
    label: 'Excited',
    color: '#ff5722',
  },
  sad: {
    rate: 0.85,
    pitch: 0.9,
    volume: 0.9,
    icon: '😢',
    label: 'Sad',
    color: '#2196f3',
  },
  angry: {
    rate: 1.15,
    pitch: 1.05,
    volume: 1.0,
    icon: '😠',
    label: 'Angry',
    color: '#f44336',
  },
  calm: {
    rate: 0.95,
    pitch: 1.0,
    volume: 0.95,
    icon: '😌',
    label: 'Calm',
    color: '#4caf50',
  },
  serious: {
    rate: 0.9,
    pitch: 0.95,
    volume: 1.0,
    icon: '😐',
    label: 'Serious',
    color: '#607d8b',
  },
  neutral: {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    icon: '🗣️',
    label: 'Neutral',
    color: '#9e9e9e',
  },
  fearful: {
    rate: 1.1,
    pitch: 1.1,
    volume: 0.9,
    icon: '😰',
    label: 'Anxious',
    color: '#9c27b0',
  },
  surprised: {
    rate: 1.15,
    pitch: 1.2,
    volume: 1.0,
    icon: '😮',
    label: 'Surprised',
    color: '#00bcd4',
  },
};

// ============================================================================
// LLM-BASED EMOTION DETECTION
// ============================================================================

/**
 * Check if local LLM is available
 * @returns {Promise<{available: boolean}>}
 */
async function emotionalTTS_checkLLM() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_CHECK',
    });
    return { available: response?.success && response?.available };
  } catch {
    return { available: false };
  }
}

/**
 * Detect emotion using LLM
 * @param {string} text - Text to analyze
 * @returns {Promise<string>} Detected emotion
 */
async function emotionalTTS_detectWithLLM(text) {
  const prompt = `Analyze the emotional tone of this text and respond with ONLY ONE word from this list: happy, excited, sad, angry, calm, serious, neutral, fearful, surprised

Text: "${text.substring(0, 500)}"

Emotion:`;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOCAL_LLM_GENERATE',
      prompt,
      options: {
        maxTokens: 10,
        temperature: 0.3,
      },
    });

    if (response?.success) {
      const emotion = response.data
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      if (EMOTION_PARAMS[emotion]) {
        return emotion;
      }
    }
    return 'neutral';
  } catch (error) {
    console.warn('[EmotionalTTS] LLM detection failed:', error);
    return 'neutral';
  }
}

// ============================================================================
// RULE-BASED EMOTION DETECTION (Fallback)
// ============================================================================

// Emotion keyword mappings
const EMOTION_KEYWORDS = {
  happy: [
    'happy',
    'joy',
    'delighted',
    'pleased',
    'wonderful',
    'amazing',
    'fantastic',
    'great',
    'excellent',
    'love',
    'lovely',
    'beautiful',
    'glad',
    'cheerful',
    'congratulations',
    'celebrate',
    'success',
    'win',
    'won',
    'awesome',
  ],
  excited: [
    'excited',
    'thrilled',
    'incredible',
    'unbelievable',
    'breakthrough',
    'revolutionary',
    'amazing',
    'spectacular',
    'extraordinary',
    'wow',
    'breaking news',
    'just discovered',
    'finally',
    '!',
  ],
  sad: [
    'sad',
    'sorry',
    'unfortunately',
    'tragic',
    'loss',
    'died',
    'death',
    'passed away',
    'regret',
    'mourn',
    'grief',
    'heartbroken',
    'devastating',
    'miss',
    'farewell',
    'goodbye',
    'closing',
    'ending',
  ],
  angry: [
    'angry',
    'furious',
    'outraged',
    'unacceptable',
    'disgraceful',
    'terrible',
    'horrible',
    'worst',
    'demand',
    'must stop',
    'enough',
    'injustice',
  ],
  calm: [
    'peaceful',
    'calm',
    'relax',
    'serene',
    'gentle',
    'slowly',
    'breathe',
    'meditation',
    'mindful',
    'quiet',
    'tranquil',
    'soothing',
  ],
  serious: [
    'important',
    'critical',
    'urgent',
    'warning',
    'caution',
    'attention',
    'significant',
    'official',
    'formal',
    'hereby',
    'pursuant',
    'whereas',
    'therefore',
    'accordingly',
    'must',
    'required',
    'mandatory',
  ],
  fearful: [
    'afraid',
    'scared',
    'worried',
    'concern',
    'danger',
    'risk',
    'threat',
    'warning',
    'careful',
    'beware',
    'alert',
    'emergency',
    'crisis',
  ],
  surprised: [
    'surprised',
    'unexpected',
    'shocking',
    'astonishing',
    'remarkable',
    'suddenly',
    'out of nowhere',
    'never expected',
    'who knew',
  ],
};

/**
 * Detect emotion using keyword matching
 * @param {string} text - Text to analyze
 * @returns {string} Detected emotion
 */
function emotionalTTS_detectWithKeywords(text) {
  const lowerText = text.toLowerCase();
  const scores = {};

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    scores[emotion] = 0;
    for (const keyword of keywords) {
      // Count occurrences
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = lowerText.match(regex);
      if (matches) {
        scores[emotion] += matches.length;
      }
    }
  }

  // Check for exclamation marks (excitement indicator)
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 2) {
    scores.excited = (scores.excited || 0) + exclamations;
  }

  // Check for question marks (uncertainty)
  const questions = (text.match(/\?/g) || []).length;
  if (questions >= 2) {
    scores.fearful = (scores.fearful || 0) + 1;
  }

  // Find emotion with highest score
  let maxEmotion = 'neutral';
  let maxScore = 0;

  for (const [emotion, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxEmotion = emotion;
    }
  }

  // Only return non-neutral if score is significant
  return maxScore >= 2 ? maxEmotion : 'neutral';
}

// ============================================================================
// EMOTION INDICATOR UI
// ============================================================================

/**
 * Create the emotion indicator element
 * @returns {HTMLElement}
 */
function emotionalTTS_createIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'assist-emotion-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: white;
    border-radius: 30px;
    padding: 8px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    display: none;
    align-items: center;
    gap: 8px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    transition: all 0.3s ease;
  `;

  indicator.innerHTML = sanitizeHTML(`
    <span class="emotion-icon" style="font-size: 24px;">🗣️</span>
    <span class="emotion-label">Speaking...</span>
    <button class="emotion-stop" style="
      background: #f44336;
      border: none;
      color: white;
      padding: 4px 12px;
      border-radius: 15px;
      cursor: pointer;
      font-size: 12px;
      margin-left: 8px;
    ">Stop</button>
  `);

  indicator.querySelector('.emotion-stop').onclick = () => {
    emotionalTTS_stop();
  };

  return indicator;
}

/**
 * Show the emotion indicator
 * @param {string} emotion - Current emotion
 */
function emotionalTTS_showIndicator(emotion) {
  if (!emotionalTTS_settings.showEmotionIndicator) {
    return;
  }

  if (!emotionalTTS_indicator) {
    emotionalTTS_indicator = emotionalTTS_createIndicator();
    document.body.appendChild(emotionalTTS_indicator);
  }

  const params = EMOTION_PARAMS[emotion] || EMOTION_PARAMS.neutral;

  emotionalTTS_indicator.querySelector('.emotion-icon').textContent = params.icon;
  emotionalTTS_indicator.querySelector('.emotion-label').textContent = `${params.label} tone`;
  emotionalTTS_indicator.style.borderLeft = `4px solid ${params.color}`;
  emotionalTTS_indicator.style.display = 'flex';
}

/**
 * Hide the emotion indicator
 */
function emotionalTTS_hideIndicator() {
  if (emotionalTTS_indicator) {
    emotionalTTS_indicator.style.display = 'none';
  }
}

// ============================================================================
// TTS WITH EMOTION
// ============================================================================

/**
 * Speak text with emotional expression
 * @param {string} text - Text to speak
 * @param {string} [overrideEmotion] - Optional emotion override
 */
async function emotionalTTS_speak(text, overrideEmotion = null) {
  if (!text || text.trim().length === 0) {
    return;
  }

  // Stop any current speech
  emotionalTTS_stop();

  let emotion = overrideEmotion;

  // Detect emotion if not provided
  if (!emotion) {
    const llmStatus = await emotionalTTS_checkLLM();

    if (llmStatus.available) {
      emotion = await emotionalTTS_detectWithLLM(text);
      console.log('[EmotionalTTS] LLM detected emotion:', emotion);
    } else {
      emotion = emotionalTTS_detectWithKeywords(text);
      console.log('[EmotionalTTS] Keyword detected emotion:', emotion);
    }
  }

  const params = EMOTION_PARAMS[emotion] || EMOTION_PARAMS.neutral;

  // Apply intensity level
  let rateMultiplier = 1;
  let pitchMultiplier = 1;

  switch (emotionalTTS_settings.intensityLevel) {
    case 'subtle':
      rateMultiplier = 0.5;
      pitchMultiplier = 0.5;
      break;
    case 'expressive':
      rateMultiplier = 1.5;
      pitchMultiplier = 1.5;
      break;
    default: // moderate
      rateMultiplier = 1;
      pitchMultiplier = 1;
  }

  // Calculate final parameters (centered around 1.0)
  const rate = 1 + (params.rate - 1) * rateMultiplier;
  const pitch = 1 + (params.pitch - 1) * pitchMultiplier;

  // Create utterance
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.max(0.5, Math.min(2, rate));
  utterance.pitch = Math.max(0.5, Math.min(2, pitch));
  utterance.volume = params.volume;

  // Get preferred voice
  const voices = speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
    voices.find(v => v.lang.startsWith('en'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Event handlers
  utterance.onstart = () => {
    emotionalTTS_isPlaying = true;
    emotionalTTS_showIndicator(emotion);
  };

  utterance.onend = () => {
    emotionalTTS_isPlaying = false;
    emotionalTTS_hideIndicator();
  };

  utterance.onerror = e => {
    console.error('[EmotionalTTS] Speech error:', e);
    emotionalTTS_isPlaying = false;
    emotionalTTS_hideIndicator();
  };

  speechSynthesis.speak(utterance);
}

/**
 * Stop current speech
 */
function emotionalTTS_stop() {
  speechSynthesis.cancel();
  emotionalTTS_isPlaying = false;
  emotionalTTS_hideIndicator();
}

/**
 * Detect emotion only (without speaking)
 * @param {string} text - Text to analyze
 * @returns {Promise<{emotion: string, params: Object}>}
 */
async function emotionalTTS_detect(text) {
  const llmStatus = await emotionalTTS_checkLLM();
  let emotion;

  if (llmStatus.available) {
    emotion = await emotionalTTS_detectWithLLM(text);
  } else {
    emotion = emotionalTTS_detectWithKeywords(text);
  }

  return {
    emotion,
    params: EMOTION_PARAMS[emotion] || EMOTION_PARAMS.neutral,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function emotionalTTS_init() {
  console.log('[EmotionalTTS] Initializing...');

  // Ensure voices are loaded
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
      console.log('[EmotionalTTS] Voices loaded:', speechSynthesis.getVoices().length);
    };
  }

  // Register to window for integration
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.emotionalTTS = {
    speak: emotionalTTS_speak,
    stop: emotionalTTS_stop,
    detect: emotionalTTS_detect,
    isPlaying: () => emotionalTTS_isPlaying,
    settings: emotionalTTS_settings,
  };

  console.log('[EmotionalTTS] Initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  emotionalTTS_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  emotionalTTS_speak,
  emotionalTTS_stop,
  emotionalTTS_detect,
  emotionalTTS_settings,
  EMOTION_PARAMS,
};
