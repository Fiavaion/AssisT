/**
 * AI Recommendation Engine
 *
 * Takes a SystemAssessment object and returns an ordered list of AI mode recommendations
 * with human-readable reasoning. Prioritises privacy-preserving and zero-config options.
 *
 * @module pages/ai-setup/recommendation-engine
 */

import { DEFAULT_CHAT_MODEL, RECOMMENDED_PULL_MODEL } from '../../utils/ollama-models.js';
import { describeRam } from './system-detector.js';

/** Graphics memory the small Local AI model needs, in GB (see ollama-catalog.js). */
const SMALL_MODEL_GRAPHICS_GB = 4;

const SHARED_STEPS =
  'It stays private and needs no account. Local AI needs Ollama, a free app, installed first; ' +
  'the next step shows you how. ';

/**
 * Generate AI mode recommendations based on system assessment.
 *
 * Priority order:
 * 1. Ollama running + models ready — already configured, use it
 * 2. A separate graphics card, or an Apple chip whose shared memory holds the small model — Local
 *    AI, with Browser AI the alternative
 * 3. WebGPU + enough RAM — browser-native, zero-config, free
 * 4. WebGPU + minimal RAM — browser AI with smallest model
 * 5. Gemini Nano available — on-device Chrome AI (rare)
 * 6. Cloud AI — always works, needs API key
 *
 * @param {Object} assessment - Result from system-detector.assess()
 * @returns {{ recommended: string, reasoning: string, alternatives: string[], details: Object }}
 */
export function recommend(assessment) {
  const { webgpu, ollama, nano, memory } = assessment;
  const gpuClass = webgpu.supported ? webgpu.gpuClass : 'unknown';

  // --- Priority 1: Ollama already running ---
  if (ollama.available && ollama.models.length > 0) {
    return {
      recommended: 'local',
      reasoning: `Ollama is running with ${ollama.models.length} model${ollama.models.length !== 1 ? 's' : ''} ready to use. No further setup needed.`,
      alternatives: ['cloud', 'webllm'],
      details: {
        models: ollama.models,
      },
    };
  }

  // --- Priority 2: hardware that runs a larger model well, outside the browser ---
  // WebGPU never reports graphics memory, so the small model is suggested and the larger one is
  // named for the student to choose if they know their computer has the memory for it. An Apple
  // chip qualifies only when its shared memory is known to hold the small model; the 9B needs 8 GB
  // of graphics memory, which is 60% of a 16 GB Mac.
  const appleFits =
    gpuClass === 'apple' &&
    typeof assessment.graphicsMemoryGB === 'number' &&
    assessment.graphicsMemoryGB >= SMALL_MODEL_GRAPHICS_GB;
  if (gpuClass === 'discrete' || appleFits) {
    const advice =
      gpuClass === 'apple'
        ? "Your Mac's Apple chip shares its memory with its graphics, so it can run a larger, " +
          'more capable model on this computer. ' +
          SHARED_STEPS +
          "AssisT can't see exactly how much memory your Mac has, so it suggests a small model. " +
          'If your Mac has 16 GB of memory or more, choose Qwen 3.5 (9B). '
        : `Your graphics card (${webgpu.gpuName}) can run a larger, more capable model on this ` +
          'computer. ' +
          SHARED_STEPS +
          "AssisT can't see how much memory your graphics card has, so it suggests a small " +
          'model. If your card has 8 GB of memory or more, choose Qwen 3.5 (9B). ';
    return {
      recommended: 'local',
      reasoning: `${advice}Rather not install anything? Choose Browser AI below.`,
      alternatives: ['webllm', 'cloud'],
      details: {
        suggestedModel: RECOMMENDED_PULL_MODEL,
        largerModel: DEFAULT_CHAT_MODEL,
        vramKnown: false,
        gpuName: webgpu.gpuName,
      },
    };
  }

  // --- Priority 3: WebGPU + enough RAM for medium models ---
  if (webgpu.supported && memory.ramGB >= 6) {
    return {
      recommended: 'webllm',
      reasoning: `Your GPU (${webgpu.gpuName || 'WebGPU'}) and ${describeRam(memory.ramGB)} can run powerful browser-native AI models. No account or internet needed.`,
      alternatives: ['cloud', 'local'],
      details: {
        suggestedModel: 'llama-3.2-3b',
        gpuName: webgpu.gpuName,
      },
    };
  }

  // --- Priority 3: WebGPU + minimal RAM (smallest model) ---
  if (webgpu.supported && memory.ramGB >= 2) {
    return {
      recommended: 'webllm',
      reasoning: `Your browser supports WebGPU and you have ${describeRam(memory.ramGB)} — enough to run a small but capable AI model (Llama 1B, ~650MB download). No account needed.`,
      alternatives: ['cloud', 'local'],
      details: {
        suggestedModel: 'llama-3.2-1b',
        gpuName: webgpu.gpuName,
      },
    };
  }

  // --- Priority 4: Gemini Nano (rare — Chrome Dev/Canary) ---
  if (nano.available || nano.status === 'needs-download') {
    return {
      recommended: 'gemini-nano',
      reasoning: 'Your Chrome has built-in Gemini AI ready to use. No download or account needed.',
      alternatives: ['cloud', 'local'],
      details: {
        status: nano.status,
      },
    };
  }

  // --- Default: Cloud AI ---
  return {
    recommended: 'cloud',
    reasoning:
      "Cloud AI works on any device and gives you the most powerful models. You'll need a free API key from Anthropic or Google, or a paid key from OpenAI or Perplexity.",
    alternatives: ['local', 'webllm'],
    details: {
      suggestedProvider: 'anthropic',
    },
  };
}

/**
 * Get display metadata for an AI mode.
 * @param {string} mode - 'local' | 'cloud' | 'webllm' | 'gemini-nano' | 'off'
 * @returns {{ icon: string, title: string, subtitle: string, pros: string[], cons: string[] }}
 */
export function getModeInfo(mode) {
  const modes = {
    local: {
      icon: '🤖',
      title: 'Local AI (Ollama)',
      subtitle: 'Free, private, works offline',
      pros: [
        'Completely private — data never leaves your device',
        'Works without internet',
        'No API costs',
      ],
      cons: ['Requires Ollama installation', 'Needs a capable CPU/GPU'],
    },
    cloud: {
      icon: '☁️',
      title: 'Cloud AI',
      subtitle: 'Most powerful, needs API key',
      pros: [
        'Most capable models (Claude, GPT-5.5, Gemini 3.8)',
        'No GPU required',
        'Fast responses',
      ],
      cons: ['Requires API key (free options available)', 'Sends text to cloud provider'],
    },
    webllm: {
      icon: '🌐',
      title: 'Browser AI',
      subtitle: 'Zero-config, runs in your browser — responses are slow (30–90s)',
      pros: [
        'No account or installation needed',
        'Private — runs locally in browser',
        'One-time model download',
      ],
      cons: [
        'Requires WebGPU-capable GPU',
        'First-time download (0.6–5GB)',
        'Much slower than Ollama or cloud AI (30–90s per response)',
      ],
    },
    'gemini-nano': {
      icon: '💎',
      title: 'Gemini Nano',
      subtitle: 'Chrome built-in AI (experimental)',
      pros: ['Built into Chrome — no download', 'Completely private and offline', 'Zero setup'],
      cons: [
        'Requires Chrome Dev/Canary with flags',
        'Experimental feature',
        'Less capable than other options',
      ],
    },
    off: {
      icon: '✨',
      title: 'No AI',
      subtitle: 'Use AssisT without AI features',
      pros: ['No configuration needed', 'All accessibility features still work'],
      cons: ['AI-powered features (summarization, simplification, etc.) unavailable'],
    },
  };

  return modes[mode] || modes.off;
}

/**
 * Build an AI system prompt prefix based on the user's neurodivergent profile.
 * This is prepended to all AI requests to personalise responses.
 * @param {{ verbosity: string, modality: string, readingLevel: string }} profile
 * @returns {string}
 */
export function buildSystemPromptFromProfile(profile) {
  if (!profile) {
    return '';
  }

  const parts = [];

  if (profile.verbosity === 'brief') {
    parts.push('Be concise. Use short sentences. Get to the point quickly.');
  } else if (profile.verbosity === 'detailed') {
    parts.push('Provide thorough explanations with examples where helpful.');
  } else {
    parts.push('Give balanced responses — enough detail to be useful, but not overwhelming.');
  }

  if (profile.readingLevel === 'simple') {
    parts.push('Use simple words. Avoid jargon. Explain technical terms when you must use them.');
  } else if (profile.readingLevel === 'advanced') {
    parts.push('You may use technical terminology and assume a strong educational background.');
  }

  if (profile.modality === 'visual') {
    parts.push('Use bullet points, numbered lists, and clear structure when possible.');
  } else if (profile.modality === 'auditory') {
    parts.push('Write in a conversational, flowing style that reads naturally aloud.');
  }

  return parts.join(' ');
}
