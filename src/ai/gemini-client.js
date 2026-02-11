/**
 * Gemini Nano Client (Chrome Prompt API)
 *
 * Provides integration with Chrome's built-in Gemini Nano AI model using the
 * Prompt API (window.ai). This enables on-device AI processing without external API calls.
 *
 * Requirements:
 * - Chrome 128+ (Canary/Dev/Beta)
 * - Feature flag enabled: chrome://flags/#optimization-guide-on-device-model
 * - Model downloaded (happens automatically on first use if available)
 *
 * @module gemini-client
 * @version 1.0.0
 */

/**
 * Checks if Gemini Nano is available on this device
 *
 * @async
 * @function checkGeminiAvailability
 * @returns {Promise<Object>} Availability status object
 * @property {boolean} available - Whether Gemini is ready to use
 * @property {string} status - Status code: 'ready', 'unavailable', 'needs-download', 'not-supported', 'error'
 * @property {string} [error] - Error message if not available
 */
export async function checkGeminiAvailability() {
  try {
    // Check if the Prompt API exists
    if (!window.ai || !window.ai.languageModel) {
      return {
        available: false,
        status: 'unavailable',
        error: 'Chrome Prompt API not found. Requires Chrome 128+ with feature flag enabled.',
      };
    }

    // Check model availability status
    const availability = await window.ai.languageModel.availability();

    if (availability === 'readily') {
      // Model is downloaded and ready
      return {
        available: true,
        status: 'ready',
      };
    } else if (availability === 'after-download') {
      // Model needs to be downloaded first
      return {
        available: false,
        status: 'needs-download',
        error: 'Model needs to be downloaded. This happens automatically on first use.',
      };
    } else {
      // Not supported on this device
      return {
        available: false,
        status: 'not-supported',
        error: 'Gemini Nano is not supported on this device or Chrome version.',
      };
    }
  } catch (error) {
    console.error('[Gemini] Availability check failed:', error);
    return {
      available: false,
      status: 'error',
      error: error.message || 'Unknown error checking availability',
    };
  }
}

/**
 * Generates text using Gemini Nano
 *
 * @async
 * @function generateText
 * @param {string} prompt - The prompt to generate text from
 * @param {Object} [options={}] - Generation options
 * @param {number} [options.temperature=0.7] - Controls randomness (0.0-1.0)
 * @param {number} [options.topK=40] - Controls diversity (higher = more diverse)
 * @returns {Promise<string>} Generated text
 * @throws {Error} If Gemini is not available or generation fails
 */
export async function generateText(prompt, options = {}) {
  // Check availability first
  const availability = await checkGeminiAvailability();
  if (!availability.available) {
    throw new Error(availability.error || 'Gemini Nano not available');
  }

  try {
    // Create a new session with the specified options
    const session = await window.ai.languageModel.create({
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      topK: options.topK !== undefined ? options.topK : 40,
    });

    console.log('[Gemini] Session created, generating text...');

    // Generate the response
    const result = await session.prompt(prompt);

    // Clean up the session
    session.destroy();

    console.log('[Gemini] Generation successful');
    return result;
  } catch (error) {
    console.error('[Gemini] Generation failed:', error);
    throw new Error(`Gemini generation failed: ${error.message}`);
  }
}

/**
 * Gets the Gemini client interface
 * Useful for exporting as a consistent interface
 *
 * @function getGeminiClient
 * @returns {Object} Client interface with checkAvailability and generateText methods
 */
export function getGeminiClient() {
  return {
    checkAvailability: checkGeminiAvailability,
    generateText,
  };
}

/**
 * Default export for convenience
 */
export default {
  checkAvailability: checkGeminiAvailability,
  generateText,
  getClient: getGeminiClient,
};
