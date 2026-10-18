/**
 * What the setup page can learn about the graphics hardware from WebGPU.
 *
 * Chrome reports the adapter's vendor and architecture (an RTX 3080 reads as vendor "nvidia",
 * architecture "ampere") and usually leaves the description empty. It never reports graphics
 * memory. The old detector called requestAdapterInfo(), which Chrome removed, so every GPU was
 * named "WebGPU GPU" and nothing downstream could tell a graphics card from integrated graphics.
 */

import {
  classifyGpu,
  describeGpu,
  describeRam,
  estimateGraphicsMemoryGB,
  assess,
} from '../../../../src/pages/ai-setup/system-detector.js';

describe('classifyGpu', () => {
  test.each([
    [{ vendor: 'nvidia', architecture: 'ampere' }, 'discrete'],
    [{ vendor: 'nvidia', architecture: '' }, 'discrete'],
    [{ vendor: 'intel', architecture: 'xe-hpg' }, 'discrete'],
    [{ vendor: 'intel', architecture: 'xe2-hpg' }, 'discrete'],
    [{ vendor: 'amd', architecture: 'rdna-2', description: 'AMD Radeon RX 6800' }, 'discrete'],
    [{ vendor: 'intel', architecture: 'gen-12lp' }, 'integrated'],
    [{ vendor: 'intel', architecture: 'xe-lpg', description: 'Intel(R) Arc(TM) Graphics' }, 'integrated'],
    [{ vendor: 'qualcomm', architecture: 'adreno-7xx' }, 'integrated'],
    [{ vendor: 'apple', architecture: 'metal-3' }, 'apple'],
    // An AMD adapter with no description could be a graphics card or a laptop chip: say so.
    [{ vendor: 'amd', architecture: 'rdna-3' }, 'unknown'],
    [{ vendor: '', architecture: '' }, 'unknown'],
    [{}, 'unknown'],
  ])('%j is %s', (info, expected) => {
    expect(classifyGpu(info)).toBe(expected);
  });

  test('a software fallback adapter is not a GPU', () => {
    expect(classifyGpu({ vendor: 'google', isFallbackAdapter: true })).toBe('software');
  });
});

describe('describeGpu', () => {
  test('uses the description when the browser gives one', () => {
    expect(describeGpu({ vendor: 'nvidia', description: 'NVIDIA GeForce RTX 3080' })).toBe(
      'NVIDIA GeForce RTX 3080'
    );
  });

  test('otherwise names the vendor and architecture, never a model it cannot know', () => {
    expect(describeGpu({ vendor: 'nvidia', architecture: 'ampere' })).toBe(
      'NVIDIA Ampere graphics'
    );
    expect(describeGpu({ vendor: 'intel', architecture: '' })).toBe('Intel graphics');
    expect(describeGpu({})).toBe('Graphics');
  });
});

describe('describeRam', () => {
  test('Chrome caps deviceMemory at 8, so 8 means "8 GB or more"', () => {
    expect(describeRam(8)).toBe('8 GB or more of RAM');
    expect(describeRam(4)).toBe('4 GB of RAM');
  });
});

/**
 * How much memory a local model can use on the graphics side. An Apple chip shares one pool of
 * memory between the processor and the graphics, and about 60% of it is treated as available to
 * the graphics (owner decision 2026-10-07). Chrome caps navigator.deviceMemory at 8 and WebGPU never
 * reports memory, so every figure here is a lower bound, and a separate card's memory is unknown.
 */
describe('estimateGraphicsMemoryGB', () => {
  const GiB = 2 ** 30;

  test('an Apple chip gets 60% of the memory the browser reports, as a lower bound', () => {
    expect(estimateGraphicsMemoryGB({ gpuClass: 'apple', ramGB: 8 })).toBeCloseTo(4.8);
    expect(estimateGraphicsMemoryGB({ gpuClass: 'apple', ramGB: 4 })).toBeCloseTo(2.4);
  });

  test('a larger single buffer the graphics can hold raises the lower bound', () => {
    expect(
      estimateGraphicsMemoryGB({ gpuClass: 'apple', ramGB: 8, maxBufferSize: 16 * GiB })
    ).toBe(16);
    expect(
      estimateGraphicsMemoryGB({ gpuClass: 'apple', ramGB: 8, maxBufferSize: 4 * GiB })
    ).toBeCloseTo(4.8);
  });

  test.each(['discrete', 'integrated', 'unknown', 'software'])(
    'is unknown for %s graphics, whose memory the browser never reports',
    gpuClass => {
      expect(estimateGraphicsMemoryGB({ gpuClass, ramGB: 8, maxBufferSize: 16 * GiB })).toBeNull();
    }
  );
});

describe('assess', () => {
  const realGpu = navigator.gpu;

  afterEach(() => {
    Object.defineProperty(navigator, 'gpu', { value: realGpu, configurable: true });
  });

  function fakeGpu(info, limits = {}) {
    const requestAdapter = jest.fn(async () => ({
      info,
      limits,
      requestDevice: async () => ({ destroy() {} }),
    }));
    Object.defineProperty(navigator, 'gpu', { value: { requestAdapter }, configurable: true });
    return requestAdapter;
  }

  beforeEach(() => {
    chrome.runtime.sendMessage = jest.fn((msg, cb) => cb({ available: false, models: [] }));
    chrome.storage.local.set = jest.fn(async () => {});
  });

  test('reads adapter.info and asks for the high-performance GPU', async () => {
    const requestAdapter = fakeGpu({ vendor: 'nvidia', architecture: 'ampere', description: '' });
    const { webgpu } = await assess();
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
    expect(webgpu).toMatchObject({
      supported: true,
      gpuClass: 'discrete',
      gpuName: 'NVIDIA Ampere graphics',
    });
  });

  test('an Apple chip reports a graphics memory lower bound from what it can see', async () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    fakeGpu({ vendor: 'apple', architecture: 'metal-3' }, { maxBufferSize: 2 ** 32 });
    const { graphicsMemoryGB } = await assess();
    delete navigator.deviceMemory;
    expect(graphicsMemoryGB).toBeCloseTo(4.8);
  });

  test('a separate card reports no graphics memory figure', async () => {
    fakeGpu({ vendor: 'nvidia', architecture: 'ampere' }, { maxBufferSize: 2 ** 32 });
    const { graphicsMemoryGB } = await assess();
    expect(graphicsMemoryGB).toBeNull();
  });

  test('a software fallback adapter does not count as WebGPU support', async () => {
    fakeGpu({ vendor: 'google', architecture: 'swiftshader', isFallbackAdapter: true });
    const { webgpu } = await assess();
    expect(webgpu.supported).toBe(false);
  });
});
