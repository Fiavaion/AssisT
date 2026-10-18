/**
 * The permissions AssisT asks for at install.
 *
 * Least privilege is a promise made to a student before they have used anything, so it is checked
 * against the manifest itself rather than against what the code happens to call. The particular
 * thing guarded here (ADR 0002): the loopback Ollama address is OPTIONAL, requested the first time
 * Local AI is turned on. It shipped as a required host permission, which asked every install for
 * access to a server most students never run.
 *
 * A CSP `connect-src` entry is not a permission — it grants no access to any page — so the same
 * hosts are expected there, and their absence would break the features silently.
 */

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'manifest.json'), 'utf8')
);

const LOOPBACK = ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'];
const isLoopback = pattern => /(?:localhost|127\.0\.0\.1|\[::1\])/.test(pattern);

describe('host permissions', () => {
  it('asks for no loopback address at install', () => {
    expect(manifest.host_permissions.filter(isLoopback)).toEqual([]);
  });

  it('offers both spellings of the loopback Ollama address as optional', () => {
    LOOPBACK.forEach(pattern => {
      expect(manifest.optional_host_permissions).toContain(pattern);
    });
  });

  it('still asks at install only for the LMS hosts and the AI providers it ships with', () => {
    // A guard against a loopback address creeping back in under another name: every required host
    // is a public https origin or one of the declared LMS domains.
    manifest.host_permissions.forEach(pattern => {
      expect(pattern).toMatch(/^(https:\/\/|\*:\/\/)/);
    });
  });
});

describe('cloud AI hosts', () => {
  // ADR 0007: every keyed cloud AI provider is asked for when the student chooses it, never at
  // install. A student who never uses Gemini should not have granted access to it.
  const CLOUD_AI_HOSTS = [
    'https://api.anthropic.com/*',
    'https://api.openai.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.perplexity.ai/*',
  ];

  it('asks for no cloud AI host at install', () => {
    CLOUD_AI_HOSTS.forEach(pattern => {
      expect(manifest.host_permissions).not.toContain(pattern);
    });
  });

  it('offers each cloud AI host as optional', () => {
    CLOUD_AI_HOSTS.forEach(pattern => {
      expect(manifest.optional_host_permissions).toContain(pattern);
    });
  });
});

describe('outside services with no key', () => {
  // ADR 0009: the dictionary, translation, Crossref and the OCR language files are asked for in the
  // same press as their consent, never at install. 0.9.3 held none of them, so asking at install
  // would have shown every existing user a new-permission prompt on update.
  const SERVICE_HOSTS = [
    'https://api.dictionaryapi.dev/*',
    'https://api.mymemory.translated.net/*',
    'https://api.crossref.org/*',
    'https://cdn.jsdelivr.net/*',
  ];

  it('asks for none of them at install', () => {
    SERVICE_HOSTS.forEach(pattern => {
      expect(manifest.host_permissions).not.toContain(pattern);
    });
  });

  it('offers each as optional', () => {
    SERVICE_HOSTS.forEach(pattern => {
      expect(manifest.optional_host_permissions).toContain(pattern);
    });
  });
});

describe('Browser AI model libraries (ADR 0010)', () => {
  // The compiled libraries ship in the package, so nothing reaches GitHub at run time.
  it('asks for no access to GitHub raw content', () => {
    const everyHost = [...manifest.host_permissions, ...manifest.optional_host_permissions];
    expect(everyHost.filter(pattern => pattern.includes('githubusercontent'))).toEqual([]);
  });

  it('allows no connection to GitHub raw content', () => {
    expect(manifest.content_security_policy.extension_pages).not.toMatch(/githubusercontent/);
  });
});

describe('content security policy', () => {
  const connectSrc = manifest.content_security_policy.extension_pages
    .split(';')
    .map(directive => directive.trim())
    .find(directive => directive.startsWith('connect-src'));

  it('lets extension pages reach CrossRef, for add-by-DOI and citation verification', () => {
    expect(connectSrc).toContain('https://api.crossref.org');
  });

  it('lets the service worker download an OCR language file from jsDelivr', () => {
    expect(connectSrc).toContain('https://cdn.jsdelivr.net');
  });

  it('lets extension pages reach a local Ollama, both spellings', () => {
    expect(connectSrc).toContain('http://localhost:11434');
    expect(connectSrc).toContain('http://127.0.0.1:11434');
  });
});

describe('managed policy', () => {
  it('keeps the managed schema, so an institution deployment still configures itself', () => {
    expect(manifest.storage.managed_schema).toBe('managed_schema.json');
  });
});
