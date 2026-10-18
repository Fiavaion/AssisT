/**
 * Every Tesseract worker is created with the extension's own files (ADR 0008).
 *
 * `createWorker` with no paths runs code fetched from cdn.jsdelivr.net, which the Chrome Web Store
 * rejects, and nothing at run time would say so: the CDN answers and OCR works. So every call site
 * in src/ must pass the options built by `ocrWorkerOptions`, whose paths the OCR unit suite pins to
 * chrome.runtime.getURL. A second call site written without them fails here, and so does
 * tesseract.js's one-shot `recognize`, which builds a worker with its default CDN paths.
 */

const { callSites, sourceFiles } = require('./call-sites.js');

const workers = callSites(/\bcreateWorker\s*\(/);

const FROM_TESSERACT = String.raw`['"]tesseract\.js['"]`;

/**
 * Whether code calls tesseract.js's top-level `recognize`, under any name: the module bound by a
 * default, namespace or dynamic import (then `<name>.recognize(`), or `recognize` itself imported
 * or destructured, aliased or not. A worker's own `recognize` is not this.
 */
function usesOneShotRecognize(code) {
  if (
    new RegExp(String.raw`import\s*\{[^}]*\brecognize\b[^}]*\}\s*from\s*${FROM_TESSERACT}`).test(
      code
    ) ||
    new RegExp(
      String.raw`\{[^}]*\brecognize\b[^}]*\}\s*=\s*(?:await\s+)?import\(\s*${FROM_TESSERACT}\s*\)`
    ).test(code)
  ) {
    return true;
  }
  const names = new Set(['Tesseract']);
  const bindings = [
    new RegExp(String.raw`import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*${FROM_TESSERACT}`, 'g'),
    new RegExp(String.raw`import\s*\*\s*as\s+(\w+)\s*from\s*${FROM_TESSERACT}`, 'g'),
    new RegExp(
      String.raw`(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?import\(\s*${FROM_TESSERACT}\s*\)`,
      'g'
    ),
  ];
  for (const binding of bindings) {
    for (const match of code.matchAll(binding)) {
      names.add(match[1]);
    }
  }
  return [...names].some(name =>
    new RegExp(String.raw`\b${name}\s*\.\s*recognize\s*\(`).test(code)
  );
}

describe('Tesseract workers run only packaged code', () => {
  it('the scan finds the OCR call site, so the gate is not passing on nothing', () => {
    expect(workers.map(site => site.file)).toContain('features/ocr/ocr.js');
  });

  it('every createWorker call is given the packaged paths', () => {
    const offenders = workers
      .filter(site => !/\bocrWorkerOptions\s*\(/.test(site.args))
      .map(site => site.file);
    expect(offenders).toEqual([]);
  });

  it('nothing uses the one-shot recognize, which makes a worker with CDN paths', () => {
    const offenders = sourceFiles()
      .filter(({ code }) => usesOneShotRecognize(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['the module name', "const T = await import('tesseract.js'); T.recognize(img);"],
    ['a default import', "import T from 'tesseract.js'; T.recognize(img);"],
    ['a namespace import', "import * as T from 'tesseract.js'; T.recognize(img);"],
    ['a named import', "import { recognize } from 'tesseract.js';"],
    ['an aliased import', "import { recognize as read } from 'tesseract.js';"],
    ['a destructured dynamic import', "const { recognize } = await import('tesseract.js');"],
  ])('the check finds the one-shot recognize through %s', (_, code) => {
    expect(usesOneShotRecognize(code)).toBe(true);
  });

  it('the check passes the packaged worker the OCR feature uses', () => {
    expect(
      usesOneShotRecognize(
        "const Tesseract = await import('tesseract.js'); const w = await Tesseract.createWorker();" +
          ' await w.recognize(img);'
      )
    ).toBe(false);
  });

  // That no file but the worker's request module names cdn.jsdelivr.net is held by
  // third-party-hosts.test.js, with the other outside services.
});
