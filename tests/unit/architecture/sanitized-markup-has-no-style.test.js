/**
 * The extension's own CSS is never passed through the sanitiser.
 *
 * DOMPurify parses a string as a whole document. A <style> that comes first lands in <head>, and
 * only <body> is returned, so the stylesheet vanishes even though `style` is on the allowlist. The
 * learning record panel and the "Offer help when reading gets hard" prompt both lost every rule this
 * way: they rendered as loose text at the foot of the page, wider than the screen.
 *
 * The CSS is ours, not page text, so it does not need sanitising: build it as a <style> element with
 * textContent and append it next to the sanitised markup.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../../src');

/** A template literal handed straight to one of the sanitising helpers. */
const SANITIZED_TEMPLATE = /sanitize(?:HTML|UserContent)\(\s*`([\s\S]*?)`/g;

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('no sanitised template carries a <style> element', () => {
  const offenders = [];
  for (const file of sourceFiles(ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(SANITIZED_TEMPLATE)) {
      if (/<style[\s>]/i.test(match[1])) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${line}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
