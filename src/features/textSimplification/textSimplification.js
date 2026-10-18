/**
 * Semantic Text Simplification Feature
 *
 * Provides AI-powered text simplification using local LLM (Ollama).
 * Transforms complex academic text into accessible language appropriate
 * for students with learning difficulties.
 *
 * Features:
 * - Three simplification levels: basic, moderate, academic
 * - Technical term explanations inline
 * - Readable paragraph formatting
 * - Graceful fallback when LLM unavailable
 * - Keyboard accessible (Escape to close)
 * - Settings persistence via Chrome storage
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - Uses service worker bridge for LLM communication
 * - Registers to window.assistFeatures for integration
 *
 * @module features/textSimplification
 */

import { showToast } from '../../core/ui/toast.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { getAIBadgeInfo, renderAIBadge, injectAIBadgeStyles } from '../../utils/ai-badge.js';
import {
  getAIMode,
  checkAIAvailable,
  getSuccessStatusMessage,
  getFailureMessage,
  setAIStatusBar,
  missingKeyMessage,
} from '../shared/ai-feature-client.js';
import { getProfileAddendum } from '../companion/profile-addendum.js';
import { getReadingLevelAddendum } from '../companion/reading-level.js';
import { debugLog } from '../../utils/debug-log.js';
import { trapFocus } from '../../utils/focus-trap.js';
import { returnFocusAfterDialog, selectionContainer } from '../../utils/dialog-return-focus.js';
import { Z } from '../../utils/z-index.js';
import { createSavedUtterance } from '../../utils/speech-voice.js';

let simplification_panel = null;
let simplification_releaseFocus = null;
let simplification_returnFocus = null;
let simplification_requestId = 0;
let simplification_isLoading = false;
let simplification_currentText = '';
let simplification_currentResult = '';

const simplification_settings = {
  enabled: true,
  defaultLevel: 'moderate', // 'basic' | 'moderate' | 'academic'
  showInHighlightMenu: true,
  showTermDefinitions: true,
};

// Asked for after the passage, where a small local model still has it in view: without it,
// llama3.2:3b opened simplified text with "Here is a simplified version of the text:".
const REPLY_ONLY = 'Reply with only the simplified text, with no opening line.';

/**
 * The Simplify prompt for a level.
 *
 * The profile and reading-level addenda go after the passage, next to the reply-only line. At the
 * top of this long prompt a small local model lost them: llama3.2:3b dropped Very plain's bracketed
 * explanations in 5 of 5 runs once the reply-only line was added, and kept them in 5 of 5 here.
 *
 * @param {string} text - the passage
 * @param {string} level - basic, moderate or academic; anything else is moderate
 * @param {boolean} isCloud - cloud prompts reason step by step and take the full text
 * @param {string} [addenda] - profile and reading-level instructions, or ''
 * @returns {string}
 */
function simplification_buildPrompt(text, level, isCloud, addenda = '') {
  const closing = addenda ? `${addenda}\n\n${REPLY_ONLY}` : REPLY_ONLY;

  // Optimized prompts: CoT for cloud (50B+ benefits), direct for local (faster, similar quality)
  // Research: https://www.promptingguide.ai/techniques/cot - "CoT benefits large models (50B+)"

  // Local mode: cap input to 800 chars to avoid Chrome's ~30s sendMessage timeout.
  // Cloud mode: send full text (no sendMessage round-trip limit).
  const inputText = !isCloud && text.length > 800 ? text.substring(0, 800) + '…' : text;

  // LOCAL MODEL PROMPTS (with examples for in-context learning)
  const localPrompts = {
    basic: `Rewrite the full text below using very simple words and short sentences. Cover every idea in the original — do NOT summarise or skip parts. Your simplified version must address all the key points and be at least 2-3 sentences long.

EXAMPLE:
Input: "Cognitive dissonance occurs when a person experiences psychological discomfort because their beliefs and actions are in conflict with each other."
Output: "We feel uncomfortable when what we believe and what we do don't match. For example, someone might know that eating lots of sugar is bad for them, but still do it every day. This creates a kind of mental tension that can make us feel uneasy."

TEXT:
${inputText}

${closing}

FULL SIMPLIFIED VERSION (cover all points, 2-3+ sentences):`,

    moderate: `Rewrite this text to be clearer. Keep academic terms but add brief definitions in parentheses.

EXAMPLE:
Input: "The phenomenological approach emphasizes lived experience."
Output: "The phenomenological approach (studying direct experience) emphasizes what people actually experience."

TEXT:
${inputText}

${closing}

CLEAR VERSION:`,

    academic: `Rewrite this text to be clearer while keeping all academic vocabulary. Add brief definitions in parentheses for difficult terms.

EXAMPLE:
Input: "Ontological reframing proves particularly generative."
Output: "Ontological reframing (reconceptualising what something fundamentally is) proves particularly productive."

TEXT:
${inputText}

${closing}

IMPROVED VERSION:`,
  };

  // CLOUD MODEL PROMPTS (with CoT for better reasoning)
  const cloudPrompts = {
    basic: `You are a reading accessibility expert. Rewrite the FULL text below so that someone with severe reading difficulties can understand it easily. You MUST cover every idea in the original — do NOT summarise, skip, or shorten the content. Your simplified version must address all the key points and be at least 2-3 sentences long.

EXAMPLE 1:
Input: "The implementation of sustainable practices necessitates comprehensive stakeholder engagement and cross-sector collaboration."
Output: "Being more green and kind to the planet takes a lot of teamwork. We need to work with many different groups of people. Businesses, governments, and communities all have to work together to make it happen."

EXAMPLE 2:
Input: "Cognitive dissonance occurs when a person's beliefs and actions conflict, creating psychological discomfort and internal tension."
Output: "We feel bad when what we think and what we do don't match. For example, if you believe lying is wrong but then you tell a lie, it feels uncomfortable inside. This uncomfortable feeling is called cognitive dissonance (= when your thoughts and actions clash)."

RULES:
- Use very simple, common words only
- Write short sentences (max 10 words each)
- Break into small paragraphs
- Replace any hard words with easy ones
- If there's a technical term, add "(= simple explanation)" after it
- Cover ALL ideas from the original text — do not skip anything
- Your output must be at least 2-3 sentences long

TEXT TO SIMPLIFY:
${text}

${closing}

FULL SIMPLIFIED VERSION (cover all points, very simple English):`,

    moderate: `You are an educational accessibility specialist. Simplify academic text while keeping important terms with definitions.

EXAMPLE 1:
Input: "The phenomenological approach emphasizes lived experience over theoretical abstraction."
Output: "The phenomenological approach (studying direct personal experience) focuses on what people actually experience, rather than abstract theories."

EXAMPLE 2:
Input: "Epistemological frameworks shape our understanding of knowledge acquisition."
Output: "Epistemological frameworks (theories about how we know things) shape how we understand learning and gaining knowledge."

RULES:
- Use clear, straightforward language
- Keep sentences to 15-20 words maximum
- Break long paragraphs into shorter ones
- Keep academic terms but add brief definitions in parentheses
- Maintain the educational content but improve readability
- Restructure complex sentences, don't just swap words
- Output ONLY the simplified text, nothing else

TEXT TO SIMPLIFY:
${text}

${closing}

SIMPLIFIED VERSION:`,

    academic: `You are an academic writing specialist. Improve readability while preserving scholarly tone and vocabulary.

EXAMPLE 1:
Input: "The chiasmic intertwining of perceiver and perceived constitutes a pre-reflective stratum of meaning-making."
Output: "The chiasmic intertwining (reciprocal entanglement) of perceiver and perceived creates a pre-reflective layer of meaning-making. This foundational layer exists before conscious thought shapes our understanding."

EXAMPLE 2:
Input: "Ontological reframing proves particularly generative when applied to post-conceptualist frameworks."
Output: "This ontological reframing (reconceptualising what something fundamentally is) proves particularly productive when applied to post-conceptualist frameworks. It allows us to see art beyond traditional categories."

RULES:
- Keep academic vocabulary - students need to learn these terms
- Add brief definitions in parentheses for difficult terms
- Break complex sentences into clearer structures
- Maintain the scholarly depth and tone
- Restructure syntax while preserving meaning
- DO NOT just replace words with synonyms - transform the structure
- Output ONLY the simplified text, nothing else

TEXT TO SIMPLIFY:
${text}

${closing}

IMPROVED VERSION:`,
  };

  const promptSet = isCloud ? cloudPrompts : localPrompts;
  return promptSet[level] || promptSet.moderate;
}

async function simplification_generate(text, level = 'moderate', modelKey = 'local') {
  const isWebLLM =
    modelKey.startsWith('llama-') ||
    modelKey.startsWith('phi-') ||
    modelKey.startsWith('qwen') ||
    modelKey.startsWith('gemma-') ||
    modelKey.startsWith('mistral-');
  const isGemini = modelKey === 'gemini';
  const isCloud = modelKey !== 'local' && !isWebLLM && !isGemini;

  const addenda =
    `${await getProfileAddendum()}${await getReadingLevelAddendum('simplify')}`.trim();
  const prompt = simplification_buildPrompt(text, level, isCloud, addenda);
  // Cloud: 1200-1500 tokens (API has no sendMessage timeout).
  // Local/WebLLM: 800 tokens — Chrome's sendMessage has a ~30s hard timeout;
  // at typical Ollama speeds (10-15 tok/s) 1200+ tokens reliably exceeds it.
  const maxTokens = isCloud ? (level === 'academic' ? 1500 : 1200) : 800;

  console.log('[TextSimplification] Generating with:', {
    level,
    model: isCloud ? modelKey : 'local',
    textLength: text.length,
    maxTokens,
    promptLength: prompt.length,
  });
  debugLog('[TextSimplification] Prompt:', prompt);

  try {
    let response;

    if (isGemini) {
      response = await chrome.runtime.sendMessage({
        action: 'GEMINI_LLM_REQUEST',
        prompt,
        options: { temperature: 0.3, topK: 40 },
      });
    } else if (isWebLLM) {
      response = await chrome.runtime.sendMessage({
        action: 'WEBLLM_GENERATE',
        prompt,
        options: { maxTokens, temperature: 0.3 },
      });
    } else if (isCloud) {
      response = await chrome.runtime.sendMessage({
        action: 'CLOUD_LLM_GENERATE',
        prompt,
        options: {
          model: modelKey,
          maxTokens,
          temperature: 0.3,
          feature: 'textSimplification',
        },
      });
    } else {
      console.log('[TextSimplification] Sending to Ollama:', {
        action: 'LOCAL_LLM_GENERATE',
        taskType: 'textSimplification',
        maxTokens,
        temperature: 0.3,
      });

      response = await chrome.runtime.sendMessage({
        action: 'LOCAL_LLM_GENERATE',
        prompt,
        taskType: 'textSimplification',
        options: {
          maxTokens,
          temperature: 0.3,
        },
      });

      console.log('[TextSimplification] Raw response from Ollama:', {
        hasResponse: !!response,
        success: response?.success,
        hasData: !!response?.data,
        dataType: typeof response?.data,
        error: response?.error,
      });
    }

    if (response && response.success) {
      let simplified = response.data;
      console.log('[TextSimplification] AI Response:', {
        level,
        model: isCloud ? modelKey : 'local',
        responseLength: simplified?.length || 0,
        isEmpty: !simplified || simplified.trim().length === 0,
        preview: simplified?.substring(0, 100),
      });

      // If response is empty or whitespace-only, treat as error
      if (!simplified || simplified.trim().length === 0) {
        console.warn('[TextSimplification] AI returned empty response for level:', level);
        throw new Error(`AI returned empty response for ${level} mode`);
      }

      // Strip conversational follow-up questions the model sometimes appends
      // e.g. "Would you like me to simplify any specific part further?"
      simplified = simplified
        .replace(/\n+[\s\S]*\?[\s]*$/m, s => {
          // Only strip if the last paragraph/sentence is a question
          const lines = s.trim().split('\n');
          const lastLine = lines[lines.length - 1].trim();
          return lastLine.endsWith('?') ? '' : s;
        })
        .replace(/---\s*\n[\s\S]*$/, '') // strip "---" divider + anything after
        .trim();

      return { simplified, isCloud };
    }

    console.error('[TextSimplification] Response validation failed:', {
      hasResponse: !!response,
      success: response?.success,
      error: response?.error,
    });
    throw new Error(response?.error || 'Simplification failed');
  } catch (error) {
    console.error('[TextSimplification] Generation failed:', error);
    throw error;
  }
}

const simplification_wordReplacements = {
  // Academic -> Simple
  utilize: 'use',
  implement: 'use',
  facilitate: 'help',
  demonstrate: 'show',
  indicate: 'show',
  subsequently: 'then',
  consequently: 'so',
  therefore: 'so',
  however: 'but',
  nevertheless: 'but',
  furthermore: 'also',
  moreover: 'also',
  additionally: 'also',
  approximately: 'about',
  sufficient: 'enough',
  obtain: 'get',
  acquire: 'get',
  commence: 'start',
  initiate: 'start',
  terminate: 'end',
  conclude: 'end',
  attempt: 'try',
  endeavor: 'try',
  require: 'need',
  necessitate: 'need',
  purchase: 'buy',
  ascertain: 'find out',
  determine: 'find out',
  regarding: 'about',
  concerning: 'about',
  'prior to': 'before',
  'subsequent to': 'after',
  'in order to': 'to',
  'due to the fact that': 'because',
  'at the present time': 'now',
  'in the event that': 'if',
  'for the purpose of': 'to',
  'with respect to': 'about',
  'in accordance with': 'following',
  'in conjunction with': 'with',
  notwithstanding: 'despite',
  'inasmuch as': 'because',
  hitherto: 'until now',
  aforementioned: 'mentioned',
  heretofore: 'before',
  wherein: 'where',
  whereby: 'by which',
  therein: 'in that',
  thereof: 'of that',
  herewith: 'with this',
  forthwith: 'immediately',
  henceforth: 'from now on',
  'pursuant to': 'according to',
  'vis-a-vis': 'compared to',
  'per se': 'by itself',
  'inter alia': 'among others',
  'ipso facto': 'by that fact',
  'prima facie': 'at first look',
  'de facto': 'in practice',
  'et cetera': 'and so on',
  ergo: 'therefore',
};

function simplification_splitSentences(text) {
  // Match sentences ending with . ! ? followed by space and capital letter or end of string
  return text.match(/[^.!?]*[.!?]+(\s|$)/g) || [text];
}

function simplification_simplifySentence(sentence) {
  let simplified = sentence;

  for (const [complex, simple] of Object.entries(simplification_wordReplacements)) {
    const escapedComplex = complex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedComplex}\\b`, 'gi');
    simplified = simplified.replace(regex, match => {
      // Preserve case of first letter
      if (match[0] === match[0].toUpperCase()) {
        return simple.charAt(0).toUpperCase() + simple.slice(1);
      }
      return simple;
    });
  }

  return simplified;
}

function simplification_breakLongSentence(sentence) {
  const words = sentence.split(/\s+/);
  if (words.length <= 15) {
    return sentence;
  }

  const breakPoints = [
    /,\s*(and|but|or|yet|so|however|therefore|thus|moreover|furthermore|additionally)\s+/gi,
    /;\s*/g,
    /:\s*/g,
    /,\s*which\s+/gi,
    /,\s*that\s+/gi,
    /,\s*who\s+/gi,
  ];

  let result = sentence;
  for (const pattern of breakPoints) {
    result = result.replace(pattern, match => {
      // Replace with period and capitalize
      const parts = match.split(/,|;|:/);
      if (parts.length > 1) {
        return (
          '. ' +
          parts[parts.length - 1].trim().charAt(0).toUpperCase() +
          parts[parts.length - 1].trim().slice(1)
        );
      }
      return '. ' + match.trim().charAt(0).toUpperCase() + match.trim().slice(1);
    });
  }

  return result;
}

function simplification_addDefinitions(text) {
  const termDefinitions = {
    // General academic terms
    hypothesis: '(= educated guess)',
    methodology: '(= method or approach)',
    paradigm: '(= way of thinking)',
    empirical: '(= based on observation)',
    theoretical: '(= based on theory)',
    qualitative: '(= about qualities, not numbers)',
    quantitative: '(= about numbers)',
    variable: '(= something that changes)',
    correlation: '(= relationship between things)',
    causation: '(= one thing causing another)',
    significant: '(= important or meaningful)',
    analysis: '(= careful examination)',
    synthesis: '(= combining ideas)',
    evaluation: '(= judging value)',
    abstract: '(= summary or concept)',
    concrete: '(= real or specific)',
    subjective: '(= personal opinion)',
    objective: '(= factual, unbiased)',
    explicit: '(= clearly stated)',
    implicit: '(= hinted or suggested)',
    inherent: '(= built-in, natural part)',
    intrinsic: '(= essential, core)',
    extrinsic: '(= external, outside)',
    'paradigm shift': '(= major change in thinking)',
    framework: '(= structure or system)',
    context: '(= the situation around something)',
    phenomenon: '(= something that happens)',
    perspective: '(= point of view)',
    discourse: '(= discussion or conversation)',
    nuance: '(= subtle difference)',

    // Art & Design Theory terms (academic context)
    phenomenological: '(= relating to direct lived experience)',
    phenomenology: '(= the study of direct experience)',
    ontological: '(= relating to the nature of being)',
    ontology: '(= the study of what exists)',
    epistemological: '(= relating to knowledge and knowing)',
    epistemology: '(= theory of knowledge)',
    hermeneutic: '(= relating to interpretation)',
    hermeneutics: '(= the study of interpretation)',
    aesthetic: '(= relating to beauty and art)',
    aesthetics: '(= the study of beauty)',
    semiotics: '(= the study of signs and symbols)',
    semiotic: '(= relating to signs and meaning)',
    dialectical: '(= involving opposing ideas)',
    dialectic: '(= reasoning through opposites)',
    praxis: '(= practice informed by theory)',
    chiasmic: '(= crossing or intertwining)',
    intersubjective: '(= shared between people)',
    intersubjectivity: '(= shared understanding)',
    liminal: '(= at a threshold or boundary)',
    liminality: '(= being between states)',
    haptic: '(= relating to touch)',
    corporeal: '(= relating to the body)',
    embodied: '(= expressed through the body)',
    embodiment: '(= being expressed physically)',
    materiality: '(= physical substance and presence)',
    indexical: '(= pointing to something real)',
    indexicality: '(= direct physical connection)',
    simulacra: '(= copies without originals)',
    simulacrum: '(= a copy that replaces reality)',
    rhizomatic: '(= spreading like roots, non-hierarchical)',
    deterritorialization: '(= removing from original context)',
    deconstruction: '(= taking apart assumptions)',
    poststructuralist: '(= questioning fixed meanings)',
    'post-conceptualist': '(= going beyond concept-based art)',

    // Visual arts specific
    chiaroscuro: '(= light and shadow contrast)',
    trompe: "(= visual illusion, 'fool the eye')",
    sfumato: '(= soft, hazy edges)',
    impasto: '(= thick paint texture)',
    gestalt: '(= unified whole perception)',
    'negative space': '(= empty area around objects)',
    composition: '(= arrangement of elements)',
    juxtaposition: '(= placing things side by side)',
  };

  let result = text;
  for (const [term, definition] of Object.entries(termDefinitions)) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedTerm}\\b(?!\\s*\\()`, 'i');
    result = result.replace(regex, `${term} ${definition}`);
  }

  return result;
}

function simplification_fallback(text, level = 'moderate') {
  let result = text;

  result = simplification_simplifySentence(result);

  if (level === 'basic' || level === 'moderate') {
    const sentences = simplification_splitSentences(result);
    result = sentences.map(s => simplification_breakLongSentence(s.trim())).join(' ');
  }

  if (simplification_settings.showTermDefinitions) {
    result = simplification_addDefinitions(result);
  }

  result = result
    .replace(/\s+/g, ' ')
    .replace(/\.\s+\./g, '.')
    .replace(/\s+\./g, '.')
    .trim();

  return result;
}

async function simplification_createPanel() {
  const panel = document.createElement('div');
  panel.id = 'assist-simplification-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'assist-simplify-title');
  // Focusable so the dialog itself can hold the keyboard: `.focus()` on a plain div does nothing.
  panel.setAttribute('tabindex', '-1');

  panel.innerHTML = sanitizeHTML(`
    <div class="assist-simplify-header">
      <span class="assist-simplify-title" id="assist-simplify-title">📝 Simplified Text</span>
      <div class="assist-simplify-controls">
        <select class="assist-simplify-level" aria-label="Simplification level">
          <option value="basic">Basic (Very Simple)</option>
          <option value="moderate">Moderate (Clear)</option>
          <option value="academic">Academic (Clearer)</option>
        </select>
        <button class="assist-simplify-close" aria-label="Close" title="Close (Esc)">×</button>
      </div>
    </div>
    <div class="assist-simplify-status" role="status"></div>
    <div class="assist-simplify-content">
      <p class="assist-simplify-placeholder">Select text and click simplify...</p>
    </div>
    <div class="assist-simplify-actions">
      <button class="assist-simplify-btn assist-simplify-copy" aria-label="Copy simplified text">
        <span class="assist-simplify-btn-icon">📋</span> Copy
      </button>
      <button class="assist-simplify-btn assist-simplify-speak" aria-label="Read simplified text aloud">
        <span class="assist-simplify-btn-icon">🔊</span> Read
      </button>
      <button class="assist-simplify-btn assist-simplify-regenerate" aria-label="Regenerate simplified text">
        <span class="assist-simplify-btn-icon">🔄</span> Regenerate
      </button>
    </div>
  `);

  simplification_injectStyles();

  const closeBtn = panel.querySelector('.assist-simplify-close');
  attachAccessibleHandler(closeBtn, 'Text Simplification Close Button', simplification_hide);

  const levelSelect = panel.querySelector('.assist-simplify-level');
  levelSelect.value = simplification_settings.defaultLevel;
  levelSelect.addEventListener('change', async e => {
    simplification_settings.defaultLevel = e.target.value;
    if (simplification_currentText) {
      simplification_simplify(simplification_currentText, e.target.value);
    }
  });

  const copyBtn = panel.querySelector('.assist-simplify-copy');
  attachAccessibleHandler(copyBtn, 'Text Simplification Copy Button', simplification_copy);

  const speakBtn = panel.querySelector('.assist-simplify-speak');
  attachAccessibleHandler(speakBtn, 'Text Simplification Speak Button', simplification_speak);

  const regenerateBtn = panel.querySelector('.assist-simplify-regenerate');
  attachAccessibleHandler(regenerateBtn, 'Text Simplification Regenerate Button', async () => {
    if (simplification_currentText) {
      simplification_simplify(simplification_currentText, simplification_settings.defaultLevel);
    }
  });

  simplification_makeDraggable(panel);

  return panel;
}

function simplification_injectStyles() {
  if (document.getElementById('assist-simplification-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-simplification-styles';
  style.textContent = `
    #assist-simplification-panel {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 420px;
      /* Fits a 320px screen (SC 1.4.10): 100% of a fixed box excludes the scrollbar, which 100vw
         includes, and border-box keeps padding and border inside the cap. */
      box-sizing: border-box;
      max-width: calc(100% - 40px);
      max-height: 60vh;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      z-index: ${Z.MODAL};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .assist-simplify-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #4CAF50 0%, #2196F3 100%);
      color: white;
      cursor: move;
    }

    .assist-simplify-title {
      font-weight: 600;
      font-size: 15px;
    }

    .assist-simplify-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-simplify-level {
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 12px;
      cursor: pointer;
    }

    .assist-simplify-level option {
      color: #333;
      background: white;
    }

    .assist-simplify-close {
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .assist-simplify-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .assist-simplify-status {
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      display: none;
    }

    .assist-simplify-status.visible {
      display: block;
    }

    .assist-simplify-status.error {
      background: #fff3e0;
      color: #e65100;
    }

    .assist-simplify-status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .assist-simplify-status [data-assist-clickable]:hover {
      text-decoration: underline;
    }

    .assist-simplify-status [data-assist-clickable]:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      text-decoration: underline;
    }

    .assist-simplify-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.7;
      color: #333;
    }

    .assist-simplify-placeholder {
      color: #999;
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }

    .assist-simplify-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #666;
    }

    .assist-simplify-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #4CAF50;
      border-radius: 50%;
      animation: assist-simplify-spin 0.8s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .assist-simplify-spinner { animation: none; }
    }

    @keyframes assist-simplify-spin {
      to { transform: rotate(360deg); }
    }

    .assist-simplify-text {
      margin: 0;
      white-space: pre-wrap;
      font-size: 15px;
    }

    .assist-simplify-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }

    .assist-simplify-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .assist-simplify-btn:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .assist-simplify-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-simplify-btn-icon {
      font-size: 14px;
    }

    /* Model selector in actions bar */
    .assist-simplify-model-selector {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      margin-right: auto;
    }

    .assist-simplify-model-selector.hidden {
      display: none !important;
    }

    .assist-model-icon {
      font-size: 14px;
    }

    .assist-simplify-model {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 100px;
    }

    .assist-simplify-model:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    /* AI indicator badges */
    .assist-simplify-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #4CAF50 0%, #2196F3 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-simplify-cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-simplify-fallback-note {
      margin: 0 0 8px 0;
      padding: 8px 10px;
      background: #fff3e0;
      color: #8a4b00;
      border-left: 3px solid #ff9800;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.5;
    }

    /* Inline definitions styling */
    .assist-simplify-text .definition {
      color: #666;
      font-size: 0.9em;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #assist-simplification-panel {
        background: #1e1e1e;
        border-color: #333;
        color: #e0e0e0;
      }

      .assist-simplify-content {
        color: #e0e0e0;
      }

      .assist-simplify-text {
        color: #e0e0e0;
      }

      .assist-simplify-status {
        background: #2d2d2d;
        border-color: #333;
        color: #aaa;
      }

      .assist-simplify-actions {
        background: #252525;
        border-color: #333;
      }

      .assist-simplify-btn {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .assist-simplify-btn:hover {
        background: #3d3d3d;
      }

      .assist-simplify-model-selector {
        background: rgba(255, 255, 255, 0.1);
      }

      .assist-simplify-model {
        background: #2a2a2a;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-simplify-model:focus {
        border-color: #64b5f6;
        box-shadow: 0 0 0 2px rgba(100, 181, 246, 0.3);
      }
    }
  `;

  document.head.appendChild(style);
}

function simplification_makeDraggable(panel) {
  const header = panel.querySelector('.assist-simplify-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.assist-simplify-controls')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;

    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) {
      return;
    }

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = Math.max(
      0,
      Math.min(window.innerWidth - panel.offsetWidth, startLeft + deltaX)
    );
    const newTop = Math.max(
      0,
      Math.min(window.innerHeight - panel.offsetHeight, startTop + deltaY)
    );

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

async function simplification_show(selectionRect = null) {
  if (simplification_panel) {
    simplification_panel.remove();
  }

  // The highlight menu is gone by the time the panel opens and its buttons activate on
  // mousedown, so there may be nothing for the trap to give the keyboard back to. The words
  // the student selected are the fallback.
  const selection = window.getSelection?.();
  simplification_returnFocus = selectionContainer(
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  );

  simplification_panel = await simplification_createPanel();
  document.body.appendChild(simplification_panel);

  if (selectionRect) {
    const panelRect = simplification_panel.getBoundingClientRect();
    let left = selectionRect.right + 10;
    let top = selectionRect.top;

    // Horizontal bounds: prefer right of selection, fallback to left
    if (left + panelRect.width > window.innerWidth - 20) {
      left = Math.max(20, selectionRect.left - panelRect.width - 10);
    }

    // Vertical bounds: ensure panel stays within viewport
    if (top + panelRect.height > window.innerHeight - 20) {
      top = window.innerHeight - panelRect.height - 20;
    }

    // Check top edge (ensure not cut off at top)
    if (top < 20) {
      top = 20;
    }

    simplification_panel.style.left = `${left}px`;
    simplification_panel.style.top = `${top}px`;
    simplification_panel.style.right = 'auto';
  }

  simplification_releaseFocus = trapFocus(simplification_panel, {
    onEscape: simplification_hide,
    initialFocus: simplification_panel.querySelector('.assist-simplify-close'),
  });
}

function simplification_hide() {
  // Abandon anything in flight: its result must not paint into a panel the student has closed.
  simplification_requestId += 1;
  simplification_isLoading = false;

  if (simplification_releaseFocus) {
    simplification_releaseFocus();
    simplification_releaseFocus = null;
  }

  if (simplification_panel) {
    simplification_panel.remove();
    simplification_panel = null;
  }

  returnFocusAfterDialog(simplification_returnFocus);
  simplification_returnFocus = null;
}

async function simplification_simplify(text, level = 'moderate') {
  if (simplification_isLoading || !text || text.trim().length === 0) {
    return;
  }

  simplification_currentText = text;
  simplification_isLoading = true;
  const requestId = ++simplification_requestId;

  const contentArea = simplification_panel?.querySelector('.assist-simplify-content');
  const statusBar = simplification_panel?.querySelector('.assist-simplify-status');
  const actionBtns = simplification_panel?.querySelectorAll('.assist-simplify-btn');

  const levelLabels = { basic: 'very simple', moderate: 'clear', academic: 'clearer academic' };

  const modeInfo = await getAIMode('textSimplification');

  if (contentArea) {
    contentArea.innerHTML = sanitizeHTML(`
      <div class="assist-simplify-loading">
        <div class="assist-simplify-spinner"></div>
        <span>Creating ${levelLabels[level] || 'simplified'} version${modeInfo.isOff ? '' : ` with ${modeInfo.displayLabel}`}...</span>
      </div>
    `);
  }

  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  try {
    let simplified;
    let isAI = false;

    const availability = await checkAIAvailable(modeInfo);

    if (requestId !== simplification_requestId) {
      return;
    }

    if (!availability.available) {
      simplification_isLoading = false;
      actionBtns?.forEach(btn => {
        btn.disabled = false;
      });

      if (availability.needsApiKey) {
        simplification_showApiKeyWarning(availability.provider);
        return;
      }

      simplified = simplification_fallback(text, level);
      simplification_currentResult = simplified;
      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'assist-simplify-status');
      }
      if (contentArea) {
        contentArea.innerHTML = sanitizeHTML(`
          <p class="assist-simplify-text">${escapeHtml(simplified)}</p>
          ${renderAIBadge('fallback', 'Basic')}
        `);
      }
      return;
    }

    const result = await simplification_generate(text, level, modeInfo.modelKey);

    if (requestId !== simplification_requestId) {
      return;
    }
    simplified = result.simplified;
    isAI = true;

    if (statusBar) {
      statusBar.textContent = getSuccessStatusMessage(modeInfo, 'simplification complete');
      statusBar.className = 'assist-simplify-status visible success';
    }

    simplification_currentResult = simplified;

    if (contentArea) {
      const _simBadgeInfo = await getAIBadgeInfo();
      const badge = isAI
        ? renderAIBadge(_simBadgeInfo.mode, _simBadgeInfo.label)
        : renderAIBadge('fallback', 'Basic');
      contentArea.innerHTML = sanitizeHTML(`
        <p class="assist-simplify-text">${escapeHtml(simplified)}</p>
        ${badge}
      `);
    }
  } catch (error) {
    console.error('[TextSimplification] Error:', error);

    const reason = getFailureMessage(error);
    const fallbackResult = simplification_fallback(text, level);
    simplification_currentResult = fallbackResult;

    if (contentArea) {
      contentArea.innerHTML = sanitizeHTML(`
        <p class="assist-simplify-fallback-note">
          This wording was simplified on this device with word swaps, without AI.
        </p>
        <p class="assist-simplify-text">${escapeHtml(fallbackResult)}</p>
      `);
    }
    if (statusBar) {
      statusBar.textContent = `⚠️ ${reason}`;
      statusBar.className = 'assist-simplify-status visible error';
    }
  } finally {
    if (requestId === simplification_requestId) {
      simplification_isLoading = false;
      actionBtns?.forEach(btn => {
        btn.disabled = false;
      });
    }
  }
}

async function simplification_copy() {
  if (!simplification_currentResult) {
    showToast('No simplified text to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(simplification_currentResult);
    showToast('Simplified text copied to clipboard');
  } catch (error) {
    console.error('[TextSimplification] Copy failed:', error);
    showToast('Failed to copy text');
  }
}

function simplification_speak() {
  if (!simplification_currentResult) {
    showToast('No simplified text to read');
    return;
  }

  if (typeof window.readText === 'function') {
    const contentArea = simplification_panel?.querySelector('.assist-simplify-content');
    window.readText(simplification_currentResult, contentArea || document.body);
  } else {
    createSavedUtterance(simplification_currentResult).then(utterance =>
      window.speechSynthesis.speak(utterance)
    );
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function simplification_showApiKeyWarning(provider) {
  const contentArea = simplification_panel?.querySelector('.assist-simplify-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
      <h3 style="margin: 0 0 12px 0; color: #333;">API Key Required</h3>
      <p style="color: #666; margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        ${missingKeyMessage(provider)}
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="simplify-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="simplify-use-local" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">💻 Use Local AI Instead</button>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 16px;">
        Go to: Extension Popup → Advanced Options → AI tab → Enter API Key
      </p>
    </div>
  `);

  const openSettingsBtn = contentArea.querySelector('.simplify-open-settings');
  if (openSettingsBtn) {
    attachAccessibleHandler(openSettingsBtn, 'Open Settings Button', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
    });
  }

  const useLocalBtn = contentArea.querySelector('.simplify-use-local');
  if (useLocalBtn) {
    attachAccessibleHandler(useLocalBtn, 'Use Local AI Button', async () => {
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[TextSimplification] Switched to local AI mode');
      simplification_showEmptyState();
    });
  }
}

function simplification_showEmptyState() {
  const contentArea = simplification_panel?.querySelector('.assist-simplify-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px; color: #666;">
      <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
      <p>Select text on the page and use Text Simplification to make it easier to read.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    </div>
  `);
}

async function simplification_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to simplify');
    return;
  }

  await simplification_show(selectionRect);

  simplification_simplify(text, simplification_settings.defaultLevel);
}

function simplification_init() {
  console.log('[TextSimplification] Initializing...');
  injectAIBadgeStyles();

  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.textSimplification = {
    start: simplification_start,
    show: simplification_show,
    hide: simplification_hide,
    simplify: simplification_simplify,
    settings: simplification_settings,
  };

  chrome.storage.local.get(['textSimplificationSettings'], result => {
    if (result.textSimplificationSettings) {
      Object.assign(simplification_settings, result.textSimplificationSettings);
      console.log(
        '[TextSimplification] Settings loaded:',
        Object.keys(simplification_settings).join(', ')
      );
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.textSimplificationSettings) {
      Object.assign(simplification_settings, changes.textSimplificationSettings.newValue);
      console.log(
        '[TextSimplification] Settings updated:',
        Object.keys(simplification_settings).join(', ')
      );
    }
  });

  console.log('[TextSimplification] Feature initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  simplification_init();
}

export {
  simplification_start,
  simplification_show,
  simplification_hide,
  simplification_simplify,
  simplification_buildPrompt,
  simplification_settings,
};
