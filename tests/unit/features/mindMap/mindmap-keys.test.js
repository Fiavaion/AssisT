/**
 * The target-map key, and the two functions that read and write it.
 *
 * This module exists so the popup can reach the student's chosen map without importing
 * `mindmap-db.js` — which would pull Dexie, and everything Dexie pulls, into the popup bundle. The
 * write itself is one line, and one line is exactly the sort of thing that gets copied instead of
 * imported and then drifts: the popup wrote the key inline while `setTargetMap` wrote it here, and
 * a change to either would have left the two disagreeing about where a highlight lands.
 */

import { readTargetId, writeTargetId, TARGET_KEY } from '../../../../src/features/mindMap/mindmap-keys.js';

describe('the target map key', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('is the name the rest of the extension already stores', () => {
    expect(TARGET_KEY).toBe('mindMapTarget');
  });

  it('reads nothing back when the student has not chosen a map', async () => {
    expect(await readTargetId()).toBeNull();
    expect(chrome.storage.local.get).toHaveBeenCalledWith(TARGET_KEY);
  });

  it('reads the chosen map back', async () => {
    chrome.storage.local.get.mockResolvedValue({ [TARGET_KEY]: 'chosen' });

    expect(await readTargetId()).toBe('chosen');
  });

  it('writes the chosen map under that key', async () => {
    await writeTargetId('chosen');

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [TARGET_KEY]: 'chosen' });
  });
});
