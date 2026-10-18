/**
 * The core is the half of the mind map a Safari build lifts unchanged (ADR 0001), and the half
 * that can be unit tested without a browser. Both properties hold only while it stays free of
 * `chrome.*`, the DOM and any import reaching outside `core/`, so they are asserted here rather
 * than left to review.
 */

import fs from 'node:fs';
import path from 'node:path';

const CORE = path.join(__dirname, '../../../../../src/features/mindMap/core');

function coreFiles(dir = CORE, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      coreFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = coreFiles();
const relative = file => path.relative(CORE, file).split(path.sep).join('/');

/**
 * Code with the comments taken out. The rule is about what these modules *call*; the headers
 * discuss `chrome.*`, DOMParser and crypto precisely because they explain why none of it is used.
 * The line-comment pattern keeps a `:` in front of `//` so that a URL inside a string survives.
 */
const codeOf = file =>
  fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('mind map core', () => {
  it('ships the modules the build contract names', () => {
    expect(files.map(relative).sort()).toEqual([
      'branch-view.js',
      'history.js',
      'layout.js',
      'map-model.js',
      'map-ops.js',
      'palette.js',
      'serialisers/freemind.js',
      'serialisers/import-map.js',
      'serialisers/json.js',
      'serialisers/markdown.js',
      'serialisers/opml.js',
      'serialisers/outline-text.js',
      'serialisers/svg.js',
      'serialisers/xmind.js',
      'serialisers/xml-scan.js',
      'templates.js'
    ]);
  });

  it.each(files.map(file => [relative(file), file]))('%s touches no browser API', (_name, file) => {
    const source = codeOf(file);
    expect(source).not.toMatch(/\bchrome\s*\./);
    expect(source).not.toMatch(/\b(?:document|window|localStorage|DOMParser|XMLSerializer|fetch)\s*[.(]/);
    expect(source).not.toMatch(/\bcrypto\s*\./);
    expect(source).not.toMatch(/\bDate\s*\.\s*now\b/);
    expect(source).not.toMatch(/Math\s*\.\s*random/);
  });

  it.each(files.map(file => [relative(file), file]))('%s imports nothing outside core', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:^|\n)import[^;]*?from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const specifier of specifiers) {
      expect(specifier.startsWith('.')).toBe(true);
      const resolved = path.resolve(path.dirname(file), specifier);
      expect(path.relative(CORE, resolved).startsWith('..')).toBe(false);
    }
  });

  it.each(files.map(file => [relative(file), file]))('%s exports by name and leaves no TODO', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).not.toMatch(/export\s+default/);
    expect(source).not.toMatch(/TODO|FIXME|DEFERRED|TEMPORARY/);
  });
});
