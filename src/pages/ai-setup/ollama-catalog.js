/**
 * Curated Ollama model catalog — hardware-tiered across key categories.
 * Import from both ai-setup.js (verbatim-served) and popup.js (bundled).
 */

export const OLLAMA_MODEL_CATALOG = [
  // ── Lightweight (≥4 GB RAM) ─────────────────────────────────────────────────
  {
    name: 'gemma2:2b',
    label: 'Gemma 2 (2B)',
    size: '1.6 GB',
    ramRequired: 4,
    category: 'general',
    categoryLabel: 'General',
    description: 'Compact but capable. Good starting point on low-memory systems.',
  },
  {
    name: 'llama3.2:3b',
    label: 'Llama 3.2 (3B)',
    size: '2.0 GB',
    ramRequired: 4,
    category: 'general',
    categoryLabel: 'General',
    description: "Meta's latest fast model. Excellent balance of size and quality.",
  },
  {
    name: 'phi3:mini',
    label: 'Phi-3 Mini',
    size: '2.2 GB',
    ramRequired: 4,
    category: 'general',
    categoryLabel: 'General',
    description: "Microsoft's efficient model. Punches above its weight for everyday tasks.",
  },
  // ── Mid-range (≥8 GB RAM) ───────────────────────────────────────────────────
  {
    name: 'gemma3:4b',
    label: 'Gemma 3 (4B)',
    size: '3.3 GB',
    ramRequired: 8,
    category: 'general',
    categoryLabel: 'General',
    description: "Google's latest 4B model. Strong reasoning and instruction-following.",
  },
  {
    name: 'mistral',
    label: 'Mistral (7B)',
    size: '4.1 GB',
    ramRequired: 8,
    category: 'general',
    categoryLabel: 'General',
    description: 'Top instruction-following. Widely trusted for academic and writing tasks.',
  },
  {
    name: 'llama3.1:8b',
    label: 'Llama 3.1 (8B)',
    size: '4.7 GB',
    ramRequired: 8,
    category: 'general',
    categoryLabel: 'General',
    description: "Meta's capable 8B model. Best all-round choice with 8 GB RAM.",
  },
  {
    name: 'deepseek-r1:8b',
    label: 'DeepSeek R1 (8B)',
    size: '4.9 GB',
    ramRequired: 8,
    category: 'reasoning',
    categoryLabel: 'Reasoning',
    description: 'Chain-of-thought reasoning. Great for maths, logic, and step-by-step problems.',
  },
  {
    name: 'qwen2.5:7b',
    label: 'Qwen 2.5 (7B)',
    size: '4.7 GB',
    ramRequired: 8,
    category: 'multilingual',
    categoryLabel: 'Multilingual',
    description: 'Excellent multilingual support. Best choice for non-English content and code.',
  },
  {
    name: 'codellama:7b',
    label: 'CodeLlama (7B)',
    size: '3.8 GB',
    ramRequired: 8,
    category: 'code',
    categoryLabel: 'Code',
    description: "Meta's code specialist. Best for explaining and generating code.",
  },
  {
    name: 'llava',
    label: 'LLaVA (7B)',
    size: '4.5 GB',
    ramRequired: 8,
    category: 'vision',
    categoryLabel: 'Vision',
    description: 'Understands images. Describe diagrams, screenshots, and visual documents.',
  },
];

/**
 * Return models the system can run given its available RAM.
 * @param {number} ramGB
 * @returns {Array}
 */
export function getCompatibleModels(ramGB) {
  return OLLAMA_MODEL_CATALOG.filter(m => ramGB >= m.ramRequired);
}
