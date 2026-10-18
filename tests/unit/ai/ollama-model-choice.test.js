/**
 * Choosing which local model answers a student's request.
 *
 * The bug this pins: the project default tag `qwen3:8b-q4_K_M` is installed on almost no machine,
 * so a student who switched local AI on without visiting AI setup asked Ollama for a model it did
 * not have, got a 404, and silently received an extractive "Basic" answer instead. The chooser has
 * to ask Ollama what is actually installed, never offer an embeddings-only model (Ollama answers
 * those with 400 "does not support generate"), and when nothing suitable is installed say so in
 * one plain sentence rather than letting the request fail into a fallback.
 */

import { createOllamaModelChooser } from '../../../src/ai/ollama-model-choice.js';
import { MISSING_CHAT_MODEL_MESSAGE } from '../../../src/utils/ollama-models.js';

/** An /api/tags reply, in the shape checkOllamaAvailability returns it. */
function installed(models) {
  return { available: true, models, visionAvailable: false };
}

describe('Ollama model chooser', () => {
  test("the student's own choice is used, and Ollama is not asked", async () => {
    const listModels = jest.fn(async () => installed(['llama3.1:8b']));
    const chooser = createOllamaModelChooser({ listModels });

    await expect(chooser.chooseModel({ storedModel: 'mistral:latest' })).resolves.toEqual({
      model: 'mistral:latest',
    });
    expect(listModels).not.toHaveBeenCalled();
  });

  test('with no stored choice, the task preference decides among installed models', async () => {
    const listModels = jest.fn(async () =>
      installed(['nomic-embed-text:latest', 'qwen3:4b', 'llama3.1:8b'])
    );
    const resolvePreferred = jest.fn(models => models[1]);
    const chooser = createOllamaModelChooser({ listModels });

    const { model } = await chooser.chooseModel({ resolvePreferred });

    expect(model).toBe('llama3.1:8b');
    // Embeddings-only models are never candidates.
    expect(resolvePreferred).toHaveBeenCalledWith(['qwen3:4b', 'llama3.1:8b']);
  });

  test('with no preference to go on, the first installed chat model is used', async () => {
    const listModels = async () => installed(['nomic-embed-text:latest', 'qwen3.5:latest']);
    const chooser = createOllamaModelChooser({ listModels });

    await expect(chooser.chooseModel({ resolvePreferred: () => '' })).resolves.toEqual({
      model: 'qwen3.5:latest',
    });
  });

  test('when nothing that can write text is installed, the student is told what to pull', async () => {
    const listModels = async () => installed(['nomic-embed-text:latest', 'bge-m3']);
    const chooser = createOllamaModelChooser({ listModels });

    const result = await chooser.chooseModel({});

    expect(result.model).toBeNull();
    expect(result.error).toBe(MISSING_CHAT_MODEL_MESSAGE);
    expect(result.error).toMatch(/ollama pull \S+/);
  });

  test('when Ollama is not running, no model is forced and no message is invented', async () => {
    const listModels = async () => ({ available: false, models: [], visionAvailable: false });
    const chooser = createOllamaModelChooser({ listModels });

    await expect(chooser.chooseModel({})).resolves.toEqual({ model: null });
  });

  test('the installed list is not re-fetched on every request', async () => {
    let clock = 1000;
    const listModels = jest.fn(async () => installed(['llama3.1:8b']));
    const chooser = createOllamaModelChooser({
      listModels,
      ttlMs: 30000,
      now: () => clock,
    });

    await chooser.chooseModel({});
    await chooser.chooseModel({});
    clock += 29000;
    await chooser.chooseModel({});
    expect(listModels).toHaveBeenCalledTimes(1);

    clock += 2000;
    await chooser.chooseModel({});
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  test('requests that arrive together share one lookup', async () => {
    const listModels = jest.fn(async () => installed(['llama3.1:8b']));
    const chooser = createOllamaModelChooser({ listModels });

    await Promise.all([chooser.chooseModel({}), chooser.chooseModel({}), chooser.chooseModel({})]);

    expect(listModels).toHaveBeenCalledTimes(1);
  });

  test('a failed lookup is not cached as an answer', async () => {
    let fail = true;
    const listModels = jest.fn(async () => {
      if (fail) {
        throw new Error('fetch failed');
      }
      return installed(['llama3.1:8b']);
    });
    const chooser = createOllamaModelChooser({ listModels });

    await expect(chooser.chooseModel({})).rejects.toThrow('fetch failed');
    fail = false;
    await expect(chooser.chooseModel({})).resolves.toEqual({ model: 'llama3.1:8b' });
  });
});
