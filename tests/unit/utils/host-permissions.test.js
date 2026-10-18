/**
 * Optional host permissions, tied to the destinations that need them (ADR 0006). Whether the
 * worker checks the permission before fetching is covered in semantic-scholar-permission.test.js.
 *
 * Chrome only shows a permission prompt from inside a user gesture, and a gesture does not survive
 * an `await`. So the request has to be made in the same tick as the click that asked for it: the
 * tests below prove `chrome.permissions.request` has been called before the returned promise is
 * even looked at.
 */

import {
  originsFor,
  requestHostPermissions,
  releaseHostPermissions,
  holdsHostPermissions,
} from '../../../src/utils/host-permissions.js';
import { consentStorageKey } from '../../../src/utils/consent.js';

const SEMANTIC_SCHOLAR = 'https://api.semanticscholar.org/*';

beforeEach(() => {
  chrome.storage.local.get.mockResolvedValue({});
  chrome.permissions = {
    request: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    contains: jest.fn().mockResolvedValue(true),
  };
});

afterAll(() => {
  delete chrome.permissions;
});

describe('which origins a destination needs', () => {
  it('names the host of each keyed cloud AI provider', () => {
    // ADR 0006 and 0007: all four keyed cloud AI providers are optional host permissions.
    expect(originsFor(['anthropic'])).toEqual(['https://api.anthropic.com/*']);
    expect(originsFor(['openai'])).toEqual(['https://api.openai.com/*']);
    expect(originsFor(['google'])).toEqual(['https://generativelanguage.googleapis.com/*']);
    expect(originsFor(['perplexity'])).toEqual(['https://api.perplexity.ai/*']);
  });

  it('names Semantic Scholar for online citation checking, and nothing for dictation', () => {
    expect(originsFor(['citationVerification'])).toEqual([SEMANTIC_SCHOLAR]);
    expect(originsFor(['dictation', 'lectureCapture'])).toEqual([]);
  });

  it('names the host of each outside service with no key (ADR 0009)', () => {
    expect(originsFor(['dictionary'])).toEqual(['https://api.dictionaryapi.dev/*']);
    expect(originsFor(['citations'])).toEqual(['https://api.crossref.org/*']);
    expect(originsFor(['ocrLanguages'])).toEqual(['https://cdn.jsdelivr.net/*']);
    expect(originsFor(['translation', 'pageTranslation'])).toEqual([
      'https://api.mymemory.translated.net/*',
    ]);
  });

  it('ignores names it does not know and never repeats an origin', () => {
    expect(originsFor(['ghost', 'citationVerification', 'citationVerification'])).toEqual([
      SEMANTIC_SCHOLAR,
    ]);
    expect(originsFor(undefined)).toEqual([]);
  });
});

describe('asking Chrome', () => {
  it('asks in the same tick as the call, so the click that asked still counts as a gesture', () => {
    const answer = requestHostPermissions([SEMANTIC_SCHOLAR]);
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
    return expect(answer).resolves.toBe(true);
  });

  it('reports a refused prompt as not granted', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    await expect(requestHostPermissions([SEMANTIC_SCHOLAR])).resolves.toBe(false);
  });

  it('reports an error from Chrome as not granted, and never throws', async () => {
    chrome.permissions.request.mockRejectedValue(new Error('not in the manifest'));
    await expect(requestHostPermissions([SEMANTIC_SCHOLAR])).resolves.toBe(false);
  });

  it('asks nothing when nothing is needed', async () => {
    await expect(requestHostPermissions([])).resolves.toBe(true);
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('reports not granted where the permissions API is missing', async () => {
    delete chrome.permissions;
    await expect(requestHostPermissions([SEMANTIC_SCHOLAR])).resolves.toBe(false);
  });
});

describe('giving a permission back', () => {
  it('removes exactly the origins of the destinations named', async () => {
    await releaseHostPermissions(['citationVerification', 'dictation']);
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ origins: [SEMANTIC_SCHOLAR] });
  });

  it('calls nothing when the destinations hold no optional permission', async () => {
    await releaseHostPermissions(['dictation']);
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
  });

  it('keeps a host another allowed service still uses', async () => {
    // Selection translation and Translate Page both reach MyMemory. Withdrawing one must not take
    // the host from the other, which would then be refused for a student who still allows it.
    chrome.storage.local.get.mockResolvedValue({
      [consentStorageKey('pageTranslation')]: { granted: true, at: '2026-10-04T10:00:00.000Z' },
    });
    await releaseHostPermissions(['translation']);
    expect(chrome.permissions.remove).not.toHaveBeenCalled();
  });

  it('gives a shared host back once no allowed service uses it', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [consentStorageKey('pageTranslation')]: { granted: false, at: '2026-10-04T10:00:00.000Z' },
    });
    await releaseHostPermissions(['translation']);
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://api.mymemory.translated.net/*'],
    });
  });

  it('swallows an error from Chrome', async () => {
    chrome.permissions.remove.mockRejectedValue(new Error('gone'));
    await expect(releaseHostPermissions(['citationVerification'])).resolves.toBe(false);
  });
});

describe('the manifest', () => {
  it('declares every origin a destination asks for as an optional host permission', () => {
    // Chrome rejects a request for an origin the manifest does not list as optional, so an origin
    // named here and missing there would make the wizard's one prompt fail outright.
    const fs = require('fs');
    const path = require('path');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../manifest.json'), 'utf8')
    );
    const { DESTINATIONS } = require('../../../src/utils/consent.js');
    const all = originsFor(Object.keys(DESTINATIONS));
    expect(all.length).toBeGreaterThan(0);
    for (const origin of all) {
      expect(manifest.optional_host_permissions).toContain(origin);
    }
  });
});

describe('whether the permission a destination needs is held', () => {
  it('asks Chrome for exactly the origins of those destinations', async () => {
    chrome.permissions.contains.mockResolvedValue(false);
    await expect(holdsHostPermissions(['anthropic'])).resolves.toBe(false);
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ['https://api.anthropic.com/*'],
    });
    chrome.permissions.contains.mockResolvedValue(true);
    await expect(holdsHostPermissions(['anthropic'])).resolves.toBe(true);
  });

  it('is true, without asking, for a destination that needs no optional permission', async () => {
    await expect(holdsHostPermissions(['dictation'])).resolves.toBe(true);
    expect(chrome.permissions.contains).not.toHaveBeenCalled();
  });

  it('reads an unreadable answer as not held', async () => {
    chrome.permissions.contains.mockRejectedValue(new Error('no'));
    await expect(holdsHostPermissions(['openai'])).resolves.toBe(false);
    delete chrome.permissions;
    await expect(holdsHostPermissions(['openai'])).resolves.toBe(false);
  });
});
