/* global process, URL, Buffer, console */
/**
 * Serve the BUILT extension pages from http://127.0.0.1 so a tool that cannot open
 * chrome-extension:// pages can still drive them.
 *
 * Chrome does not let one extension read or act on another extension's pages, so a browser agent
 * that is itself an extension cannot test the mind map editor, the popup or the citation library
 * where they really live. Their code does not care about its origin, only about the handful of
 * `chrome.*` calls it makes. This serves `.vite/` as it was built and puts a small stand-in for those
 * calls at the top of every HTML page.
 *
 * What is real here: every line of the page's own code, its IndexedDB data (a separate, empty
 * database, because the origin differs from the extension's), its keyboard handling, its layout.
 * What is NOT real: anything that needs the service worker. `chrome.runtime.sendMessage` answers
 * `{ success: false }`, so AI actions, "Map this page" and cross-page capture report that they are
 * unavailable, which is also what a student with nothing set up sees.
 *
 * Test tooling only. It is not part of the build and nothing in `src/` knows it exists.
 *
 *   node tests/harness/serve-built-pages.mjs            # http://127.0.0.1:4599
 *   node tests/harness/serve-built-pages.mjs 5000       # another port
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.vite');
const PORT = Number(process.argv[2]) || 4599;
const HOST = '127.0.0.1';

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/**
 * The stand-in for the extension APIs, as page script. Storage is kept in localStorage so a reload
 * behaves like the real thing. Both calling styles are answered: a callback, and a returned promise.
 */
const SHIM = `
(() => {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) { return; }
  const listeners = new Set();
  const areaOf = name => {
    const key = 'assist-harness-storage-' + name;
    const read = () => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } };
    const write = all => localStorage.setItem(key, JSON.stringify(all));
    const answer = (value, callback) => {
      if (typeof callback === 'function') { Promise.resolve().then(() => callback(value)); return undefined; }
      return Promise.resolve(value);
    };
    return {
      get(keys, callback) {
        if (typeof keys === 'function') { callback = keys; keys = null; }
        const all = read();
        let out = {};
        if (keys === null || keys === undefined) { out = all; }
        else if (typeof keys === 'string') { if (keys in all) { out[keys] = all[keys]; } }
        else if (Array.isArray(keys)) { keys.forEach(k => { if (k in all) { out[k] = all[k]; } }); }
        else { Object.keys(keys).forEach(k => { out[k] = k in all ? all[k] : keys[k]; }); }
        return answer(out, callback);
      },
      set(items, callback) {
        const all = read();
        const changes = {};
        Object.keys(items || {}).forEach(k => {
          changes[k] = { oldValue: all[k], newValue: items[k] };
          all[k] = items[k];
        });
        write(all);
        listeners.forEach(fn => { try { fn(changes, name); } catch (e) { console.error(e); } });
        return answer(undefined, callback);
      },
      remove(keys, callback) {
        const all = read();
        [].concat(keys).forEach(k => { delete all[k]; });
        write(all);
        return answer(undefined, callback);
      },
      clear(callback) { write({}); return answer(undefined, callback); },
    };
  };
  const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const unavailable = { success: false, error: 'Not available in the localhost test harness.' };
  window.chrome = {
    runtime: {
      id: 'assist-localhost-harness',
      lastError: undefined,
      getURL: p => new URL(String(p).replace(/^\\/*/, '/'), location.origin).href,
      getManifest: () => ({ version: '1.0.0', name: 'AssisT (localhost harness)' }),
      sendMessage(...args) {
        const callback = args.find(a => typeof a === 'function');
        if (callback) { Promise.resolve().then(() => callback(unavailable)); return undefined; }
        return Promise.resolve(unavailable);
      },
      connect: () => ({ postMessage() {}, disconnect() {}, onMessage: event(), onDisconnect: event() }),
      openOptionsPage() {},
      onMessage: event(),
      onInstalled: event(),
    },
    storage: {
      local: areaOf('local'),
      sync: areaOf('sync'),
      session: areaOf('session'),
      onChanged: {
        addListener: fn => listeners.add(fn),
        removeListener: fn => listeners.delete(fn),
        hasListener: fn => listeners.has(fn),
      },
    },
    tabs: {
      create: ({ url }) => { window.open(url, '_blank'); return Promise.resolve({ id: 1 }); },
      query: (q, callback) => (callback ? callback([]) : Promise.resolve([])),
      sendMessage: () => Promise.resolve(unavailable),
      onUpdated: event(),
    },
    permissions: {
      contains: (p, callback) => (callback ? callback(false) : Promise.resolve(false)),
      request: (p, callback) => (callback ? callback(false) : Promise.resolve(false)),
      onAdded: event(),
      onRemoved: event(),
    },
    i18n: { getMessage: () => '', getUILanguage: () => navigator.language },
    commands: { getAll: callback => (callback ? callback([]) : Promise.resolve([])) },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  };
  console.info('[AssisT harness] chrome.* is a stand-in on this origin; the service worker is absent.');
})();
`;

const INDEX = `<!doctype html><html lang="en"><meta charset="utf-8"><title>AssisT built pages</title>
<body style="font:1rem/1.6 system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">
<h1>AssisT built pages (localhost harness)</h1>
<p>The pages below are the real build. Extension calls are stand-ins; the service worker is absent.</p>
<ul>
<li><a href="/src/pages/mind-map/mindmap.html">Mind map</a></li>
<li><a href="/src/pages/citation-library/library.html">Citation library</a></li>
<li><a href="/src/pages/citation-guide/guide.html">Citation guide</a></li>
<li><a href="/src/pages/discovery/discovery.html">Discover your tools</a></li>
<li><a href="/src/pages/welcome/welcome.html">Welcome</a></li>
<li><a href="/src/pages/help/help.html">Help</a></li>
</ul>
<p>The popup is not listed: it reads its settings from the service worker and cannot start without one.</p>
</body></html>`;

async function respond(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': TYPES.get('.html') });
    response.end(INDEX);
    return;
  }

  // Resolve inside the build and nowhere else.
  const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    response.writeHead(403).end('Outside the build.');
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      response.writeHead(404).end('Not a file.');
      return;
    }
    const type = TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
    let body = await readFile(file);
    if (type.startsWith('text/html')) {
      // Ahead of everything else in the head, so it is in place before the page's module runs.
      const html = body.toString('utf8');
      const tag = `<script>${SHIM}</script>`;
      body = Buffer.from(
        /<head[^>]*>/i.test(html)
          ? html.replace(/<head[^>]*>/i, match => `${match}${tag}`)
          : tag + html,
        'utf8'
      );
    }
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': TYPES.get('.txt') }).end('Not found.');
  }
}

createServer((request, response) => {
  respond(request, response).catch(error => {
    response
      .writeHead(500, { 'content-type': TYPES.get('.txt') })
      .end(String(error && error.message));
  });
}).listen(PORT, HOST, () => {
  console.log(`AssisT built pages: http://${HOST}:${PORT}/  (serving ${ROOT})`);
});
