/**
 * Which AI mode the setup page recommends.
 *
 * The owner's desktop with an NVIDIA RTX 3080 was recommended Browser AI: the engine sent every
 * machine with WebGPU and 6 GB of RAM to Browser AI unless Ollama was already running, and a fresh
 * install never has Ollama running. A machine with a separate graphics card is steered to Local AI,
 * with Browser AI kept as the no-install alternative, and nothing is claimed that the browser
 * cannot see: WebGPU does not report graphics memory.
 */

import { recommend } from '../../../../src/pages/ai-setup/recommendation-engine.js';
import {
  RECOMMENDED_PULL_MODEL,
  DEFAULT_CHAT_MODEL,
} from '../../../../src/utils/ollama-models.js';

function assessment({
  gpuClass = 'unknown',
  gpuName = 'WebGPU GPU',
  supported = true,
  ollama,
  ramGB = 8,
  graphicsMemoryGB = null,
} = {}) {
  return {
    webgpu: { supported, gpuName, gpuClass },
    ollama: ollama || { available: false, models: [], needsPermission: true },
    nano: { available: false, status: 'not-supported' },
    memory: { ramGB },
    graphicsMemoryGB,
  };
}

describe('a separate graphics card', () => {
  const rtx = assessment({ gpuClass: 'discrete', gpuName: 'NVIDIA Ampere graphics' });

  test('is steered to Local AI, with Browser AI the first alternative', () => {
    const rec = recommend(rtx);
    expect(rec.recommended).toBe('local');
    expect(rec.alternatives[0]).toBe('webllm');
    expect(rec.alternatives).toContain('cloud');
  });

  test('says why in plain words, and what Local AI needs', () => {
    const { reasoning } = recommend(rtx);
    expect(reasoning).toMatch(/graphics card/i);
    expect(reasoning).toMatch(/larger, more capable model/i);
    expect(reasoning).toMatch(/Ollama/);
    expect(reasoning).toMatch(/install/i);
    expect(reasoning).toMatch(/Browser AI/);
  });

  test('says it cannot see the graphics memory rather than guessing it', () => {
    const rec = recommend(rtx);
    expect(rec.reasoning).toMatch(/can't see how much memory/i);
    expect(rec.reasoning).not.toMatch(/\b\d+\s?GB of memory\b(?! or more)/);
    expect(rec.details.vramKnown).toBe(false);
  });

  test('suggests the small model, and names the larger one for an 8 GB card', () => {
    const rec = recommend(rtx);
    expect(rec.details.suggestedModel).toBe(RECOMMENDED_PULL_MODEL);
    expect(rec.reasoning).toMatch(/Qwen 3\.5 \(9B\)/);
    expect(rec.details.largerModel).toBe(DEFAULT_CHAT_MODEL);
  });
});

/**
 * An Apple chip shares its memory with the graphics; about 60% of it counts as graphics memory.
 * The browser reports at most 8 GB, so the figure the engine gets is a lower bound (4.8 GB on any
 * Mac that reports 8).
 */
describe('an Apple chip', () => {
  const mac = assessment({ gpuClass: 'apple', gpuName: 'Apple graphics', graphicsMemoryGB: 4.8 });

  test('is steered to Local AI when its shared memory fits the small model', () => {
    const rec = recommend(mac);
    expect(rec.recommended).toBe('local');
    expect(rec.alternatives[0]).toBe('webllm');
    expect(rec.details.suggestedModel).toBe(RECOMMENDED_PULL_MODEL);
  });

  test('talks about the Mac and its memory, not a graphics card it does not have', () => {
    const { reasoning } = recommend(mac);
    expect(reasoning).toMatch(/Mac/);
    expect(reasoning).toMatch(/shares its memory/i);
    expect(reasoning).not.toMatch(/graphics card/i);
  });

  test('names the 9B for a Mac with 16 GB, since 60% of 16 is more than the 8 it needs', () => {
    const { reasoning } = recommend(mac);
    expect(reasoning).toMatch(/16 GB of memory or more, choose Qwen 3\.5 \(9B\)/);
    expect(reasoning).toMatch(/can't see exactly how much memory/i);
  });

  test('is not steered to Local AI when its shared memory is too small for any model', () => {
    const rec = recommend(
      assessment({ gpuClass: 'apple', ramGB: 4, graphicsMemoryGB: 2.4 })
    );
    expect(rec.recommended).toBe('webllm');
  });

  test('is not steered to Local AI when no memory figure was measured', () => {
    expect(recommend(assessment({ gpuClass: 'apple' })).recommended).toBe('webllm');
  });
});

describe('integrated or unknown graphics', () => {
  test.each(['integrated', 'unknown'])('%s graphics with WebGPU keeps Browser AI', gpuClass => {
    expect(recommend(assessment({ gpuClass })).recommended).toBe('webllm');
  });

  test('no WebGPU at all falls back to Cloud AI', () => {
    expect(recommend(assessment({ supported: false })).recommended).toBe('cloud');
  });
});

describe('Ollama already running with a model', () => {
  test('is still the first choice whatever the graphics', () => {
    const rec = recommend(
      assessment({ gpuClass: 'integrated', ollama: { available: true, models: ['qwen3:4b'] } })
    );
    expect(rec.recommended).toBe('local');
  });
});
