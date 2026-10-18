/**
 * The Local AI models AssisT offers to download, one per kind of computer.
 * Imported by ai-setup.js (verbatim-served) and popup.js (bundled).
 *
 * `ramRequired` is compared with navigator.deviceMemory, which Chrome caps at 8, so it can only
 * separate "under 8 GB" from "8 GB or more". The graphics-card memory each model needs is
 * therefore said in words in its description. Sizes are the downloads listed on ollama.com.
 *
 * `minGraphicsMemoryGB` hides a model unless that much graphics memory is known to be there (see
 * estimateGraphicsMemoryGB in system-detector.js); an unknown amount hides it.
 */

import { findInstalledTag } from '../../utils/ollama-models.js';

export const OLLAMA_MODEL_CATALOG = [
  {
    name: 'qwen3:4b-instruct-2507-q4_K_M',
    label: 'Qwen 3 Instruct (4B)',
    size: '2.5 GB',
    ramRequired: 4,
    category: 'general',
    categoryLabel: 'Small',
    description:
      'Quick and light. Answers straight away without a long thinking step. The one to choose if your computer has no separate graphics card, or 4 to 6 GB of graphics memory.',
  },
  {
    name: 'qwen3.5:9b',
    label: 'Qwen 3.5 (9B)',
    size: '6.6 GB',
    ramRequired: 8,
    category: 'general',
    categoryLabel: 'Recommended',
    description:
      'Clearer, more careful answers, and it can read images too. Needs a graphics card with 8 GB of memory or more.',
  },
  {
    name: 'qwen3.5:27b',
    label: 'Qwen 3.5 (27B)',
    size: '17 GB',
    ramRequired: 8,
    minGraphicsMemoryGB: 20,
    category: 'reasoning',
    categoryLabel: 'Large',
    description:
      'The most capable, and much slower. Only for a computer with 20 GB of graphics memory or more.',
  },
];

/**
 * The models to list for this computer: those that fit, plus any already installed, so an
 * installed model still shows as installed whatever the hardware reads as.
 *
 * @param {number} ramGB  navigator.deviceMemory, capped at 8.
 * @param {{graphicsMemoryGB?: number|null, installed?: string[]}} [options]
 *   graphicsMemoryGB is the least graphics memory known to be there, or null when unknown.
 * @returns {Array}
 */
export function getCompatibleModels(ramGB, { graphicsMemoryGB = null, installed = [] } = {}) {
  const fits = m =>
    ramGB >= m.ramRequired &&
    (m.minGraphicsMemoryGB === undefined ||
      (typeof graphicsMemoryGB === 'number' && graphicsMemoryGB >= m.minGraphicsMemoryGB));
  return OLLAMA_MODEL_CATALOG.filter(m => fits(m) || isCatalogModelInstalled(m, installed));
}

/**
 * True when exactly the model on offer is installed. Matching on the family alone marked the
 * small instruct build as installed for anyone who had qwen3:4b, which is a different model that
 * thinks before it answers, and left them no way to download the one on offer. Ollama's
 * `latest` alias is honoured where the library documents it (qwen3.5:latest is the 9B).
 *
 * @param {{name: string}} model  A catalog entry.
 * @param {string[]} installed     Installed model names from Ollama.
 * @returns {boolean}
 */
export function isCatalogModelInstalled(model, installed) {
  return Boolean(findInstalledTag(installed, model.name));
}
