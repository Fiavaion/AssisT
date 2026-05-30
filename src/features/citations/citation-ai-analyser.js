/**
 * Citation AI Analyser (OPTIONAL enhancement layer)
 *
 * Wraps the shared AI client to provide an on-demand credibility assessment for a SAVED
 * citation's metadata. This is strictly additive: the heuristic source-evaluator
 * (CRAAP + domain rules) is always available and never depends on this module. When no AI
 * mode is configured, `getAnalyserAvailability().available` is false and callers simply hide
 * the "Analyse with AI" affordance — nothing breaks.
 *
 * Routes through src/features/shared/ai-feature-client.js, so it works across all AI modes
 * (cloud / local Ollama / WebLLM / Gemini Nano) with no per-mode branching here.
 */

import { getAIMode, checkAIAvailable, generateWithAI } from '../shared/ai-feature-client.js';

const FEATURE = 'citationAnalyzer';

/**
 * @typedef {Object} AnalyserAvailability
 * @property {Object}  mode      - the resolved AIMode
 * @property {boolean} available
 * @property {string}  reason    - why unavailable (empty when available)
 */

/**
 * Resolve whether the optional AI analyser can run right now.
 * @returns {Promise<AnalyserAvailability>}
 */
export async function getAnalyserAvailability() {
  const mode = await getAIMode(FEATURE);
  const availability = await checkAIAvailable(mode);
  return { mode, available: availability.available, reason: availability.reason };
}

/**
 * Convenience boolean.
 * @returns {Promise<boolean>}
 */
export async function isAnalyserAvailable() {
  const { available } = await getAnalyserAvailability();
  return available;
}

/**
 * Build a metadata-only credibility prompt. We deliberately constrain the model to the
 * supplied metadata so it cannot hallucinate facts about the source.
 * @param {Object} c - normalised citation
 * @returns {string}
 */
function buildPrompt(c) {
  const lines = [
    `Title: ${c.title || 'Unknown'}`,
    `Author(s): ${(c.authors || []).join('; ') || 'Unknown'}`,
    `Source type: ${c.type || 'unknown'}`,
    `Publisher / container: ${c.siteName || c.publisher || 'Unknown'}`,
    `Publication date: ${c.publicationDate || 'Unknown'}`,
    `DOI: ${c.doi || 'none'}`,
    `URL: ${c.url || 'none'}`,
  ].join('\n');

  return (
    'You are helping a student judge whether a source is appropriate to cite in academic ' +
    'work. Based ONLY on the metadata below, give a brief, balanced credibility assessment. ' +
    'Do not invent facts you cannot infer from the metadata.\n\n' +
    `${lines}\n\n` +
    'Respond with STRICT JSON only (no markdown, no prose outside the JSON):\n' +
    '{"signal":"high|medium|low","summary":"<one plain-language sentence>",' +
    '"considerations":["<short point>","<short point>"]}'
  );
}

/**
 * Defensively parse the model's JSON response.
 * @param {string} text
 * @returns {{signal:string, summary:string, considerations:string[]}|null}
 */
function parseResult(text) {
  const match = text && text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    const obj = JSON.parse(match[0]);
    const raw = String(obj.signal || '').toLowerCase();
    const signal = ['high', 'medium', 'low'].includes(raw) ? raw : 'unknown';
    return {
      signal,
      summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
      considerations: Array.isArray(obj.considerations)
        ? obj.considerations.filter(x => typeof x === 'string' && x.trim()).slice(0, 4)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Run the optional AI analysis for a citation.
 *
 * @param {Object} citation - normalised citation
 * @returns {Promise<{available:boolean, reason?:string, signal?:string, summary?:string, considerations?:string[]}>}
 */
export async function analyseCitation(citation) {
  const { mode, available, reason } = await getAnalyserAvailability();
  if (!available) {
    return { available: false, reason };
  }

  const prompt = buildPrompt(citation || {});
  const { text } = await generateWithAI(prompt, mode, {
    maxTokens: 350,
    temperature: 0.3,
    feature: FEATURE,
    taskType: FEATURE,
    format: 'json',
  });

  const parsed = parseResult(text);
  if (!parsed) {
    return {
      available: true,
      signal: 'unknown',
      summary: text ? text.trim().slice(0, 300) : 'No analysis returned.',
      considerations: [],
    };
  }
  return { available: true, ...parsed };
}

export default { getAnalyserAvailability, isAnalyserAvailable, analyseCitation };
