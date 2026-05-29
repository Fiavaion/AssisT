/**
 * Pluggable prompt registry.
 *
 * Centralises inline prompt strings that are currently scattered across
 * individual feature modules. Prompts are keyed by feature × discipline ×
 * userProfile, allowing institutions to swap discipline-adapted prompts
 * without modifying feature code.
 *
 * This is a NLnet deliverable (pluggable prompts architecture). Current state:
 * registry structure and resolution logic are in place; feature modules still
 * use their own inline prompts and will be migrated progressively.
 *
 * Usage:
 *   import { getPrompt, registerPrompt } from '../ai/prompts/registry.js';
 *   const prompt = getPrompt('summarize', { discipline: 'stem', profile: 'dyslexia' });
 *
 * @module ai/prompts/registry
 */

// ─── Registry storage ──────────────────────────────────────────────────────────

/**
 * Prompt entries keyed by `${feature}:${discipline}:${profile}`.
 * Wildcards stored as '*'.
 *
 * @type {Map<string, string>}
 */
const REGISTRY = new Map();

// ─── Built-in prompts ──────────────────────────────────────────────────────────

// Summarization
register(
  'summarize',
  '*',
  '*',
  `Summarise the following text in plain language. Use short sentences and avoid jargon. Focus on the main point only.\n\n{{text}}`
);
register(
  'summarize',
  'stem',
  '*',
  `Summarise the following text. Preserve key technical terms but explain them briefly in parentheses. Use short sentences.\n\n{{text}}`
);
register(
  'summarize',
  'humanities',
  '*',
  `Summarise the following text. Identify the central argument and main supporting points. Avoid academic jargon.\n\n{{text}}`
);

// Text simplification
register(
  'simplify',
  '*',
  '*',
  `Rewrite the following text at a reading level suitable for a 14-year-old. Use simple vocabulary and short sentences. Keep the meaning intact.\n\n{{text}}`
);
register(
  'simplify',
  '*',
  'dyslexia',
  `Rewrite the following text using shorter sentences (max 15 words each), common words, and an active voice. Avoid idioms.\n\n{{text}}`
);

// Assignment breakdown
register(
  'assignmentBreakdown',
  '*',
  '*',
  `You are a study assistant. Break the following assignment into clear, ordered steps. For each step, state what the student needs to do and roughly how long it should take.\n\nAssignment:\n{{text}}`
);

// Citation analysis
register(
  'citationAnalyzer',
  '*',
  '*',
  `Analyse the following citation and identify: (1) the claim it supports, (2) whether the source is primary or secondary, (3) any potential bias or limitations.\n\nCitation:\n{{text}}`
);

// Knowledge graph extraction
register(
  'knowledgeGraph',
  '*',
  '*',
  `Extract concepts and relationships from the following text. Return JSON with shape: { "nodes": [{ "id": string, "label": string, "type": string }], "edges": [{ "source": string, "target": string, "label": string }] }. Focus on the 5–10 most important concepts only.\n\nText:\n{{text}}`
);

// Socratic tutor
register(
  'socraticTutor',
  '*',
  '*',
  `You are a Socratic tutor. Ask a thought-provoking question that helps the student think more deeply about the following topic. Do not give the answer — only ask the question.\n\nTopic:\n{{text}}`
);

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve a prompt template for a feature, substituting {{placeholders}}.
 *
 * Resolution order (most specific wins):
 *   feature:discipline:profile → feature:discipline:* → feature:*:profile → feature:*:*
 *
 * @param {string} feature - Feature name (e.g. 'summarize', 'simplify')
 * @param {Object} [context] - Contextual parameters
 * @param {string} [context.discipline] - Subject area ('stem', 'humanities', 'health', 'social')
 * @param {string} [context.profile] - Accessibility profile ('dyslexia', 'adhd', 'default')
 * @param {Record<string, string>} [substitutions] - Values for {{placeholder}} tokens
 * @returns {string | null} Resolved prompt string, or null if no entry found
 */
export function getPrompt(feature, { discipline = '*', profile = '*' } = {}, substitutions = {}) {
  const candidates = [
    key(feature, discipline, profile),
    key(feature, discipline, '*'),
    key(feature, '*', profile),
    key(feature, '*', '*'),
  ];

  for (const candidate of candidates) {
    const template = REGISTRY.get(candidate);
    if (template) {
      return applySubstitutions(template, substitutions);
    }
  }

  return null;
}

/**
 * Register a prompt template. Can override built-in entries (e.g. for
 * institution-specific prompt customisation).
 *
 * @param {string} feature
 * @param {string} discipline - Subject area or '*' for all
 * @param {string} profile - Accessibility profile or '*' for all
 * @param {string} template - Prompt string with {{placeholder}} tokens
 */
export function registerPrompt(feature, discipline, profile, template) {
  REGISTRY.set(key(feature, discipline, profile), template);
}

/**
 * List all registered prompt keys (for debugging / admin UI).
 * @returns {string[]}
 */
export function listPromptKeys() {
  return Array.from(REGISTRY.keys()).sort();
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function register(feature, discipline, profile, template) {
  REGISTRY.set(key(feature, discipline, profile), template);
}

function key(feature, discipline, profile) {
  return `${feature}:${discipline ?? '*'}:${profile ?? '*'}`;
}

function applySubstitutions(template, subs) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => subs[name] ?? `{{${name}}}`);
}
