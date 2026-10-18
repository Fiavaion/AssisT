/**
 * Tests for the onboarding queue module.
 *
 * The queue's job is which guides a student picked, in which order they run, and which are
 * finished. The tracks themselves changed — clean setup and import replaced the citations and
 * writing tracks, and dictation now comes from the discovery quiz like any other support — so
 * these tests pin the new set and, for the student who picks a contradictory pair, the order the
 * queue puts them in.
 */

import {
  QUEUE_STORAGE_KEY,
  TRACK_ORDER,
  TRACK_CONFIG,
  buildQueue,
  markDone,
  nextStep,
  isComplete,
  remainingCount,
  selectionWarning,
  saveQueue,
  loadQueue,
  clearQueue,
} from '../../../src/pages/onboarding/onboarding-queue.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('QUEUE_STORAGE_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof QUEUE_STORAGE_KEY).toBe('string');
    expect(QUEUE_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

describe('TRACK_ORDER', () => {
  it('runs the bulk tracks before the ones that configure', () => {
    expect(TRACK_ORDER).toEqual(['clean', 'import', 'ai-setup', 'discover']);
  });

  it('names every configured track, and nothing else', () => {
    expect([...TRACK_ORDER].sort()).toEqual(Object.keys(TRACK_CONFIG).sort());
  });

  it('no longer carries the retired citations and writing tracks', () => {
    expect(TRACK_ORDER).not.toContain('citations');
    expect(TRACK_ORDER).not.toContain('writing');
    expect(TRACK_CONFIG.citations).toBeUndefined();
    expect(TRACK_CONFIG.writing).toBeUndefined();
  });
});

describe('TRACK_CONFIG', () => {
  it('every track declares an id matching its key, a label and a description', () => {
    Object.entries(TRACK_CONFIG).forEach(([key, track]) => {
      expect(track.id).toBe(key);
      expect(typeof track.label).toBe('string');
      expect(track.label.length).toBeGreaterThan(0);
      expect(typeof track.description).toBe('string');
      expect(track.description.length).toBeGreaterThan(0);
    });
  });

  it('clean setup is inline and marked destructive', () => {
    expect(TRACK_CONFIG.clean.kind).toBe('inline');
    expect(TRACK_CONFIG.clean.destructive).toBe(true);
  });

  it('clean setup says up front that it switches everything off', () => {
    expect(TRACK_CONFIG.clean.description.toLowerCase()).toContain('every');
  });

  it('import is inline and not destructive', () => {
    expect(TRACK_CONFIG.import.kind).toBe('inline');
    expect(TRACK_CONFIG.import.destructive).toBe(false);
  });

  it('AI setup is external, points at the wizard, and requires AI', () => {
    expect(TRACK_CONFIG['ai-setup'].kind).toBe('external');
    expect(TRACK_CONFIG['ai-setup'].url).toBe('src/pages/ai-setup/ai-setup.html');
    expect(TRACK_CONFIG['ai-setup'].requiresAI).toBe(true);
  });

  it('discover is external and points at the quiz', () => {
    expect(TRACK_CONFIG.discover.kind).toBe('external');
    expect(TRACK_CONFIG.discover.url).toBe('src/pages/discovery/discovery.html');
    expect(TRACK_CONFIG.discover.requiresAI).toBe(false);
  });

  it('no track carries its own feature or visibility list any more', () => {
    Object.values(TRACK_CONFIG).forEach(track => {
      expect(track.features).toBeUndefined();
      expect(track.visibility).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// buildQueue
// ---------------------------------------------------------------------------

describe('buildQueue()', () => {
  it('returns an empty queue for no selection', () => {
    expect(buildQueue([])).toEqual([]);
  });

  it('returns an empty queue for a non-array', () => {
    expect(buildQueue('clean')).toEqual([]);
    expect(buildQueue(undefined)).toEqual([]);
  });

  it('orders by TRACK_ORDER, not by the order they were picked', () => {
    const result = buildQueue(['discover', 'import', 'clean', 'ai-setup']);
    expect(result.map(step => step.trackId)).toEqual(['clean', 'import', 'ai-setup', 'discover']);
  });

  it('puts clean setup before discover, so a wipe cannot follow the choices it would erase', () => {
    const ids = buildQueue(['discover', 'clean']).map(step => step.trackId);
    expect(ids.indexOf('clean')).toBeLessThan(ids.indexOf('discover'));
  });

  it('puts clean setup before import, so the restored file is what survives', () => {
    const ids = buildQueue(['import', 'clean']).map(step => step.trackId);
    expect(ids.indexOf('clean')).toBeLessThan(ids.indexOf('import'));
  });

  it('dedupes repeated ids', () => {
    expect(buildQueue(['clean', 'clean', 'discover']).map(s => s.trackId)).toEqual([
      'clean',
      'discover',
    ]);
  });

  it('drops ids that name no track', () => {
    expect(buildQueue(['ghost', 'clean', 'citations']).map(s => s.trackId)).toEqual(['clean']);
  });

  it('builds an external step with its url', () => {
    const [step] = buildQueue(['discover']);
    expect(step).toEqual({
      trackId: 'discover',
      kind: 'external',
      label: TRACK_CONFIG.discover.label,
      requiresAI: false,
      status: 'pending',
      url: 'src/pages/discovery/discovery.html',
    });
  });

  it('builds an inline step with no url', () => {
    const [step] = buildQueue(['clean']);
    expect(step.kind).toBe('inline');
    expect(step.url).toBeUndefined();
    expect(step.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// selectionWarning
// ---------------------------------------------------------------------------

describe('selectionWarning()', () => {
  it('is silent for a single track', () => {
    expect(selectionWarning(['clean'])).toBeNull();
    expect(selectionWarning(['import'])).toBeNull();
  });

  it('is silent for a selection with no contradiction', () => {
    expect(selectionWarning(['discover', 'ai-setup'])).toBeNull();
  });

  it('warns when clean setup and import are picked together', () => {
    const warning = selectionWarning(['clean', 'import']);
    expect(typeof warning).toBe('string');
    expect(warning.length).toBeGreaterThan(0);
  });

  it('states the order plainly, so the outcome is not a surprise', () => {
    const warning = selectionWarning(['import', 'clean']).toLowerCase();
    expect(warning).toContain('first');
    expect(warning).toContain('file');
  });

  it('tolerates rubbish input', () => {
    expect(selectionWarning(undefined)).toBeNull();
    expect(selectionWarning('clean')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markDone / nextStep / isComplete / remainingCount
// ---------------------------------------------------------------------------

describe('markDone()', () => {
  it('marks the named step done', () => {
    const queue = buildQueue(['clean', 'discover']);
    const updated = markDone(queue, 'clean');
    expect(updated.find(s => s.trackId === 'clean').status).toBe('done');
    expect(updated.find(s => s.trackId === 'discover').status).toBe('pending');
  });

  it('does not mutate the input', () => {
    const queue = buildQueue(['clean', 'discover']);
    markDone(queue, 'clean');
    expect(queue[0].status).toBe('pending');
  });

  it('ignores an unknown id', () => {
    const queue = buildQueue(['clean']);
    expect(markDone(queue, 'citations').map(s => s.status)).toEqual(['pending']);
  });
});

describe('nextStep()', () => {
  it('returns the first pending step', () => {
    const queue = buildQueue(['clean', 'discover']);
    expect(nextStep(queue).trackId).toBe('clean');
  });

  it('skips the done ones', () => {
    const queue = markDone(buildQueue(['clean', 'discover']), 'clean');
    expect(nextStep(queue).trackId).toBe('discover');
  });

  it('returns null when everything is done', () => {
    const queue = markDone(buildQueue(['clean']), 'clean');
    expect(nextStep(queue)).toBeNull();
  });

  it('returns null for an empty queue', () => {
    expect(nextStep([])).toBeNull();
  });
});

describe('isComplete()', () => {
  it('is true for an empty queue — picking nothing is a finished onboarding', () => {
    expect(isComplete([])).toBe(true);
  });

  it('is false while a step is pending', () => {
    expect(isComplete(buildQueue(['clean', 'discover']))).toBe(false);
  });

  it('is true once every step is done', () => {
    let queue = buildQueue(['clean', 'discover']);
    queue = markDone(queue, 'clean');
    queue = markDone(queue, 'discover');
    expect(isComplete(queue)).toBe(true);
  });
});

describe('remainingCount()', () => {
  it('counts the pending steps', () => {
    expect(remainingCount(buildQueue(['clean', 'import', 'discover']))).toBe(3);
    expect(remainingCount(markDone(buildQueue(['clean', 'discover']), 'clean'))).toBe(1);
    expect(remainingCount([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Storage wrappers
// ---------------------------------------------------------------------------

describe('storage wrappers', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.remove.mockResolvedValue(undefined);
  });

  it('saveQueue writes under the queue key', async () => {
    const queue = buildQueue(['clean']);
    await saveQueue(queue);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [QUEUE_STORAGE_KEY]: queue });
  });

  it('loadQueue returns the stored array', async () => {
    const queue = buildQueue(['clean']);
    chrome.storage.local.get.mockResolvedValue({ [QUEUE_STORAGE_KEY]: queue });
    await expect(loadQueue()).resolves.toEqual(queue);
  });

  it('loadQueue returns null when nothing is stored', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await expect(loadQueue()).resolves.toBeNull();
  });

  it('clearQueue removes the key', async () => {
    await clearQueue();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(QUEUE_STORAGE_KEY);
  });
});
