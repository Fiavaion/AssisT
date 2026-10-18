/**
 * Every WebLLM engine runs only model libraries shipped in the package (ADR 0010).
 *
 * An engine created without an explicit appConfig uses web-llm's prebuilt one, whose model
 * libraries (compiled WebGPU code) come from GitHub. So only the offscreen handler may import
 * web-llm at all, it may not rename what it imports (a renamed engine factory would slip past a
 * name check), and its engine is created only with the appConfig it builds from the packaged
 * libraries.
 */

const { callSites, sourceFiles } = require('./call-sites.js');

const HANDLER = 'pages/assist-offscreen/webllm-handler.js';
const FROM_WEB_LLM = String.raw`['"]@mlc-ai/web-llm['"]`;
const ENGINE =
  /\b(?:Create(?:WebWorker|ServiceWorker|ExtensionServiceWorker)?MLCEngine|new\s+(?:WebWorker|ServiceWorker|ExtensionServiceWorker)?MLCEngine)\s*\(/;

/** Whether code imports web-llm, statically, dynamically or by re-export. */
function importsWebLLM(code) {
  return new RegExp(
    String.raw`(?:\bfrom\s*${FROM_WEB_LLM}|\bimport\s*\(\s*${FROM_WEB_LLM}\s*\)|\bimport\s+${FROM_WEB_LLM})`
  ).test(code);
}

/** Whether code imports web-llm under another name: aliased, default, namespace or destructured. */
function renamesWebLLM(code) {
  return [
    String.raw`import\s*\{[^}]*\bas\b[^}]*\}\s*from\s*${FROM_WEB_LLM}`,
    String.raw`import\s+\w+\s*(?:,\s*\{[^}]*\})?\s*from\s*${FROM_WEB_LLM}`,
    String.raw`import\s*\*\s*as\s+\w+\s*from\s*${FROM_WEB_LLM}`,
    String.raw`=\s*(?:await\s+)?import\(\s*${FROM_WEB_LLM}\s*\)`,
  ].some(pattern => new RegExp(pattern).test(code));
}

const engines = callSites(ENGINE);

describe('WebLLM engines run only packaged model libraries', () => {
  it('the scan finds the offscreen handler’s engine, so the gate is not passing on nothing', () => {
    expect(engines.map(site => site.file)).toContain(HANDLER);
  });

  it('no file but the offscreen handler imports web-llm', () => {
    const offenders = sourceFiles()
      .filter(({ file, code }) => file !== HANDLER && importsWebLLM(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the handler imports web-llm under its own names only', () => {
    const handler = sourceFiles().find(({ file }) => file === HANDLER).code;
    expect(renamesWebLLM(handler)).toBe(false);
  });

  it('no engine is created anywhere but the offscreen handler', () => {
    expect(engines.filter(site => site.file !== HANDLER).map(site => site.file)).toEqual([]);
  });

  it('the handler’s engine is given the appConfig built from the packaged libraries', () => {
    const offenders = engines.filter(
      site => !/\bappConfig\s*:\s*localAppConfig\s*\(\s*\)/.test(site.args)
    );
    expect(offenders).toEqual([]);
  });

  it('that appConfig points model_lib at the package', () => {
    const handler = sourceFiles().find(({ file }) => file === HANDLER).code;
    expect(handler).toMatch(/model_lib:\s*chrome\.runtime\.getURL\(\s*webllmModelLibPath\(/);
  });

  it.each([
    ['an extension service worker engine', 'CreateExtensionServiceWorkerMLCEngine(id)', ENGINE],
    ['a web worker engine', 'CreateWebWorkerMLCEngine(w, id)', ENGINE],
    ['a constructed engine', 'new MLCEngine()', ENGINE],
  ])('the engine check finds %s', (_, code, pattern) => {
    expect(pattern.test(code)).toBe(true);
  });

  it.each([
    ['an aliased import', "import { CreateMLCEngine as make } from '@mlc-ai/web-llm';"],
    ['a namespace import', "import * as webllm from '@mlc-ai/web-llm';"],
    ['a default import', "import webllm from '@mlc-ai/web-llm';"],
    ['a dynamic import', "const webllm = await import('@mlc-ai/web-llm');"],
  ])('the rename check finds %s', (_, code) => {
    expect(importsWebLLM(code)).toBe(true);
    expect(renamesWebLLM(code)).toBe(true);
  });
});
