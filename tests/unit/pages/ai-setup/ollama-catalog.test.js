/**
 * The Local AI models AssisT offers to download.
 *
 * Three, one per kind of computer: a small model that answers without a thinking step, the
 * default for an 8 GB graphics card, and a large one for 20 GB and up. Sizes are the download
 * sizes listed on ollama.com. The old list offered models that are a generation behind and
 * labelled Llama 3.2 as 8B.
 */

import {
  OLLAMA_MODEL_CATALOG,
  getCompatibleModels,
  isCatalogModelInstalled,
} from '../../../../src/pages/ai-setup/ollama-catalog.js';
import { REGISTRY } from '../../../../src/ai/model-registry.js';
import {
  DEFAULT_CHAT_MODEL,
  RECOMMENDED_PULL_MODEL,
  VISION_MODEL,
} from '../../../../src/utils/ollama-models.js';

describe('the Local AI model catalog', () => {
  test('offers the small, default and large models, in that order', () => {
    expect(OLLAMA_MODEL_CATALOG.map(m => m.name)).toEqual([
      'qwen3:4b-instruct-2507-q4_K_M',
      'qwen3.5:9b',
      'qwen3.5:27b',
    ]);
  });

  test('names the download sizes ollama.com lists', () => {
    const size = Object.fromEntries(OLLAMA_MODEL_CATALOG.map(m => [m.name, m.size]));
    expect(size['qwen3:4b-instruct-2507-q4_K_M']).toBe('2.5 GB');
    expect(size['qwen3.5:9b']).toBe('6.6 GB');
    expect(size['qwen3.5:27b']).toBe('17 GB');
  });

  test('offers none of the retired models', () => {
    const names = OLLAMA_MODEL_CATALOG.map(m => m.name).join(' ');
    expect(names).not.toMatch(/phi3|llama3\.2|mistral|llava/);
  });

  test('every entry says plainly what it is good for and what it needs', () => {
    for (const model of OLLAMA_MODEL_CATALOG) {
      expect(model.label).toBeTruthy();
      expect(model.description).toMatch(/graphics card|memory/i);
    }
  });

  test('agrees with the defaults the rest of the extension uses', () => {
    const names = OLLAMA_MODEL_CATALOG.map(m => m.name);
    expect(names).toContain(DEFAULT_CHAT_MODEL);
    expect(names).toContain(RECOMMENDED_PULL_MODEL);
    expect(names).toContain(VISION_MODEL);
  });

  test('a low-memory computer is offered the small model only', () => {
    expect(getCompatibleModels(4).map(m => m.name)).toEqual([RECOMMENDED_PULL_MODEL]);
  });
});

/**
 * The 27B needs about 20 GB of graphics memory, and the browser cannot see a card's memory. It is
 * offered only where that much is known to be there (owner decision 2026-10-07); otherwise a
 * student would download 17 GB that runs too slowly to use.
 */
describe('the large model is offered only with about 20 GB of graphics memory', () => {
  const names = models => models.map(m => m.name);

  test('hidden when the graphics memory is unknown', () => {
    expect(names(getCompatibleModels(8))).not.toContain('qwen3.5:27b');
    expect(names(getCompatibleModels(8, { graphicsMemoryGB: null }))).not.toContain(
      'qwen3.5:27b'
    );
  });

  test('hidden when the graphics memory is known to be less', () => {
    expect(names(getCompatibleModels(8, { graphicsMemoryGB: 19.2 }))).not.toContain(
      'qwen3.5:27b'
    );
  });

  test('offered when the graphics memory is known to be 20 GB or more', () => {
    expect(names(getCompatibleModels(8, { graphicsMemoryGB: 20 }))).toEqual([
      RECOMMENDED_PULL_MODEL,
      'qwen3.5:9b',
      'qwen3.5:27b',
    ]);
  });

  test('an installed 27B is always listed, so it still shows as installed', () => {
    expect(names(getCompatibleModels(8, { installed: ['qwen3.5:27b'] }))).toContain(
      'qwen3.5:27b'
    );
    expect(names(getCompatibleModels(4, { installed: ['qwen3.5:27b'] }))).toContain(
      'qwen3.5:27b'
    );
  });

  test('the default model is still offered on 8 GB without a memory figure', () => {
    expect(names(getCompatibleModels(8))).toEqual([RECOMMENDED_PULL_MODEL, 'qwen3.5:9b']);
  });
});

describe('isCatalogModelInstalled', () => {
  const small = OLLAMA_MODEL_CATALOG[0];
  const nine = OLLAMA_MODEL_CATALOG[1];
  const large = OLLAMA_MODEL_CATALOG[2];

  test('a different model of the same family is not the one on offer', () => {
    // qwen3:4b thinks before it answers; the instruct build on offer does not.
    expect(isCatalogModelInstalled(small, ['qwen3:4b'])).toBe(false);
    expect(isCatalogModelInstalled(large, ['qwen3.5:9b'])).toBe(false);
  });

  test('qwen3.5:latest is the 9B: the library gives both tags the same digest', () => {
    // ollama.com/library/qwen3.5/tags lists latest and 9b as fdf5fd4cd409; the copy installed on
    // the test machine as qwen3.5:latest is 9.7B Q4_K_M, 6.6 GB, the 9b download.
    expect(isCatalogModelInstalled(nine, ['qwen3.5:latest'])).toBe(true);
    expect(isCatalogModelInstalled(nine, ['qwen3.5'])).toBe(true);
    expect(isCatalogModelInstalled(large, ['qwen3.5:latest'])).toBe(false);
  });

  test('the exact tag is installed', () => {
    expect(isCatalogModelInstalled(small, ['QWEN3:4b-instruct-2507-q4_K_M'])).toBe(true);
    expect(isCatalogModelInstalled(nine, ['llama3.2:3b', 'qwen3.5:9b'])).toBe(true);
  });
});

describe('the model registry Local AI entry', () => {
  test('lists the same three models and their roles', () => {
    expect(Object.keys(REGISTRY.ollama.models)).toEqual(OLLAMA_MODEL_CATALOG.map(m => m.name));
    expect(REGISTRY.ollama.defaultModel).toBe(DEFAULT_CHAT_MODEL);
    expect(REGISTRY.ollama.fastModel).toBe(RECOMMENDED_PULL_MODEL);
    expect(REGISTRY.ollama.visionModel).toBe(VISION_MODEL);
  });
});
