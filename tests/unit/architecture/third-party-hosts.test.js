/**
 * One route off the device (ADR 0006).
 *
 * Every request to a third-party service is made by the service worker's request module, behind
 * the student's consent for that service. A content script or an extension page that names one of
 * these hosts itself has found a way round the consent check, and a content-script fetch needs no
 * manifest entry to work, so nothing else would notice. This gate notices: no file in `src/` other
 * than the request module may contain these host names at all, in code or in comments.
 *
 * Adding a new destination means adding it to the request module and to this list.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../src');
const REQUEST_MODULE = path.join(SRC, 'background', 'third-party-requests.js');

const HOSTS = [
  'api.dictionaryapi.dev',
  'api.mymemory.translated.net',
  'api.crossref.org',
  'api.semanticscholar.org',
  // OCR language files (ADR 0008). tesseract.js falls back to this CDN for its own code when not
  // given paths, so a mention anywhere else is also a sign of a worker built without them.
  'cdn.jsdelivr.net',
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(js|mjs|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);

describe('third-party hosts are named in one place only', () => {
  it('the scan found the source tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(HOSTS)('%s appears only in the worker request module', host => {
    const offenders = files
      .filter(file => file !== REQUEST_MODULE)
      .filter(file => fs.readFileSync(file, 'utf8').includes(host))
      .map(file => path.relative(SRC, file).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it.each(HOSTS)('the request module does name %s, so the gate is not passing on an empty tree', host => {
    expect(fs.existsSync(REQUEST_MODULE)).toBe(true);
    expect(fs.readFileSync(REQUEST_MODULE, 'utf8')).toContain(host);
  });
});
