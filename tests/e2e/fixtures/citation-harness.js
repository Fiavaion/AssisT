/**
 * Shared harness for the citation browser specs: a fake course article carrying scholarly meta
 * tags, a Crossref stand-in, and the few ways a spec reaches state a student cannot see.
 *
 * Nothing here navigates to a live site. The article is served at an instructure.com address so
 * the manifest injects the content script, and every Crossref request is answered from a fixture
 * (an unknown DOI gets Crossref's own 404), so a lookup that escaped the route would show up as a
 * wrong record rather than silently passing.
 */

import { consentStorageKey } from '../../../src/utils/consent.js';

/** A DOI under Crossref's test prefix, so a lookup that reached the live API could never match. */
export const TEST_DOI = '10.5555/assist-e2e.0001';

/** The source the fake article describes, and what Crossref says about it. */
export const SOURCE = Object.freeze({
  title: 'Working memory and the reading brain',
  authors: ['Snell, Jane', 'Okafor, Daniel'],
  journal: 'Journal of Reading Research',
  date: '2021/03/04',
  volume: '12',
  issue: '3',
  firstpage: '45',
  lastpage: '67',
  doi: TEST_DOI,
});

/** Paragraph texts, each on one line so Selection.toString() gives exactly this string back. */
export const PARAGRAPHS = Object.freeze([
  'Working memory holds what a reader has just decoded while the next words arrive.',
  'A reader whose decoding is effortful spends the first pass recovering the words.',
  'Clutter is not a neutral cost, because each element competing for attention must be suppressed.',
]);

/** The Highwire / Google Scholar tags a journal page carries. */
export function scholarlyMeta(source = SOURCE) {
  return [
    ['citation_title', source.title],
    ...source.authors.map(author => ['citation_author', author]),
    ['citation_journal_title', source.journal],
    ['citation_publication_date', source.date],
    ['citation_volume', source.volume],
    ['citation_issue', source.issue],
    ['citation_firstpage', source.firstpage],
    ['citation_lastpage', source.lastpage],
    ['citation_doi', source.doi],
  ];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * An article page with the given meta tags and the three paragraphs above.
 * @param {{title?: string, heading?: string, meta?: Array<[string, string]>}} [options]
 * @returns {string}
 */
export function articleHtml({
  title = `${SOURCE.title} - Canvas`,
  heading = SOURCE.title,
  meta = scholarlyMeta(),
} = {}) {
  const tags = meta
    .map(([name, content]) => `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`)
    .join('\n');
  const paras = PARAGRAPHS.map((text, i) => `<p id="para${i + 1}">${escapeHtml(text)}</p>`).join(
    '\n'
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
${tags}
</head>
<body style="margin: 0; padding: 40px; font: 16px/1.6 system-ui, sans-serif">
<nav><a href="/courses/1">Course home</a></nav>
<article><h1 id="heading">${escapeHtml(heading)}</h1>
${paras}
</article>
</body></html>`;
}

/**
 * Serve `html` for every path under `origin`.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} origin - e.g. https://citation-routes.instructure.com
 * @param {string} html
 */
export async function routeLms(context, origin, html) {
  await context.route(`${origin}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html })
  );
}

/** Crossref's own shape for a journal article, as `api.crossref.org/works/{doi}` returns it. */
export function crossrefWork(source = SOURCE) {
  const [year, month, day] = source.date.split('/').map(Number);
  return {
    DOI: source.doi,
    URL: `https://doi.org/${source.doi}`,
    type: 'journal-article',
    title: [source.title],
    author: source.authors.map(name => {
      const [family, given] = name.split(',').map(part => part.trim());
      return { given, family, sequence: 'first' };
    }),
    'container-title': [source.journal],
    publisher: 'Reading Research Society',
    volume: source.volume,
    issue: source.issue,
    page: `${source.firstpage}-${source.lastpage}`,
    published: { 'date-parts': [[year, month, day]] },
    ISSN: ['1234-5678'],
  };
}

/**
 * Answer every Crossref request from `works` (keyed by lower-case DOI); anything else is Crossref's
 * 404. Returns the list of DOI lookups actually made (GETs only), so a spec can prove the route
 * answered, or that no request was made at all.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {Object<string, Object>} [works]
 * @returns {Promise<string[]>}
 */
export async function routeCrossref(context, works = { [TEST_DOI]: crossrefWork() }) {
  const hits = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
  await context.route('**/api.crossref.org/**', route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors });
    }
    const doi = decodeURIComponent(new URL(request.url()).pathname.replace(/^\/works\//, ''));
    hits.push(doi);
    const work = works[doi.toLowerCase()];
    if (!work) {
      return route.fulfill({
        status: 404,
        headers: cors,
        contentType: 'text/plain',
        body: 'Resource not found.',
      });
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', 'message-type': 'work', message: work }),
    });
  });
  return hits;
}

/**
 * An extension page to reach extension state from: storage, and the citation store through the
 * same CITATION_DB_OP relay every realm uses. The guide is the lightest extension page there is.
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function openExtensionPage(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pages/citation-guide/guide.html`);
  return page;
}

/**
 * One citation-store operation, from an extension page. Throws when the store refuses.
 * @param {import('@playwright/test').Page} page - an extension page
 * @param {string} op - e.g. CIT_ADD, CIT_GET_ALL, CIT_GET_TRASHED
 * @param {Array} [args]
 */
export async function rpc(page, op, args = []) {
  const reply = await page.evaluate(
    ([o, a]) => chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: o, args: a }),
    [op, args]
  );
  if (!reply || reply.ok !== true) {
    throw new Error(`${op} failed: ${reply && reply.error}`);
  }
  return reply.result;
}

/** Every citation in the library (not the trash). */
export function allCitations(page) {
  return rpc(page, 'CIT_GET_ALL', [{}]);
}

/**
 * Record the student's answer for a destination exactly as consent.js stores it (ADR 0006).
 * @param {import('@playwright/test').Page} page - an extension page
 * @param {string} destination - e.g. 'citations'
 * @param {boolean} granted
 */
export async function setConsent(page, destination, granted) {
  await page.evaluate(
    ([key, yes]) =>
      chrome.storage.local.set({ [key]: { granted: yes, at: new Date().toISOString() } }),
    [consentStorageKey(destination), granted]
  );
}

/** A citation record in the store's shape (citation-model.js), for seeding. */
export function record(over = {}) {
  const now = Date.now();
  return {
    type: 'journal',
    url: 'https://doi.org/10.1038/s41586-020-2649-2',
    title: 'Array programming with NumPy',
    authors: ['Harris, Charles R.', 'Millman, K. Jarrod'],
    publicationDate: '2020-09-16',
    accessDate: '2026-09-04',
    publisher: 'Springer',
    siteName: 'Nature',
    doi: '10.1038/s41586-020-2649-2',
    isbn: '',
    issn: '',
    extra: { journal: 'Nature', volume: '585', issue: '7825', pages: '357-362' },
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    projectId: null,
    ...over,
  };
}

/** Capture what a page writes to the clipboard without a clipboard permission. Install before goto. */
export const CLIPBOARD_TAP = `
  window.__clip = [];
  const fake = {
    async write(items) {
      for (const item of items) {
        const flavours = {};
        for (const type of item.types) flavours[type] = await (await item.getType(type)).text();
        window.__clip.push(flavours);
      }
    },
    async writeText(text) { window.__clip.push({ 'text/plain': text }); },
  };
  Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
`;

/** The last thing the page put on the clipboard, as { 'text/plain', 'text/html'? }. */
export async function lastClip(page) {
  const clips = await page.evaluate(() => window.__clip || []);
  return clips[clips.length - 1] || null;
}

/** Let open/close animations finish before pressing anything inside a new section or dialog. */
export async function settle(page) {
  await page.waitForFunction(
    () => document.getAnimations().every(animation => animation.playState !== 'running'),
    null,
    { timeout: 5000 }
  );
}

/**
 * Press Tab until `target` has focus: a keyboard-only route to a control, failing if it is not
 * reachable within `max` presses.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} target
 * @param {number} [max]
 */
export async function tabTo(page, target, max = 40) {
  for (let i = 0; i <= max; i++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Not reachable by Tab within ${max} presses: ${target}`);
}

/**
 * Run code in the content script's isolated world. `page.evaluate` runs in the page's main world,
 * where `window.assistFeatures` does not exist; the DevTools protocol can address the extension's
 * own world directly. Used only to stand in for things a student cannot drive from a test (speech,
 * a failing store), never for what they can click.
 * @param {import('@playwright/test').Page} page - a page the content script runs on
 * @returns {Promise<(fn: Function, arg?: any) => Promise<any>>}
 */
export async function contentWorld(page) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context));
  await cdp.send('Runtime.enable');

  async function run(contextId, fn, arg) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg === undefined ? null : arg)})`,
      contextId,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  }

  let worldId = null;
  for (let attempt = 0; attempt < 30 && worldId === null; attempt++) {
    for (const context of contexts.filter(c => c.auxData && c.auxData.type === 'isolated')) {
      try {
        if (
          await run(context.id, () => !!(window.assistFeatures && window.assistFeatures.citation))
        ) {
          worldId = context.id;
          break;
        }
      } catch {
        // A world that has gone (navigation) or is not ours: keep looking.
      }
    }
    if (worldId === null) {
      await page.waitForTimeout(200);
    }
  }
  if (worldId === null) {
    throw new Error('The AssisT content script world with the citation feature was not found');
  }
  return (fn, arg) => run(worldId, fn, arg);
}

/**
 * Wait until the content script has mounted the capture bar.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>} the "Cite this source" button
 */
export async function captureButton(page) {
  const bar = page.getByRole('group', { name: 'Capture a citation' });
  await bar.waitFor({ state: 'attached', timeout: 30000 });
  const cite = bar.getByRole('button', { name: 'Cite this source' });
  await cite.waitFor({ state: 'visible', timeout: 10000 });
  return cite;
}

/** Select a whole paragraph the way a script can, without the mouseup that opens the highlight menu. */
export async function selectParagraph(page, id) {
  return page.evaluate(paraId => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(paraId));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  }, id);
}
