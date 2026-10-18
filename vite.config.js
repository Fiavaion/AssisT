/**
 * Vite Configuration for AssisT Chrome Extension
 * Uses @crxjs/vite-plugin for Chrome Manifest V3 support
 *
 * This configuration:
 * - Automatically reads manifest.json
 * - Bundles content scripts correctly (IIFE format for Chrome)
 * - Preserves Chrome APIs (chrome.storage, chrome.runtime, etc.)
 * - Handles web_accessible_resources
 * - Provides HMR during development
 *
 * Browser targets:
 *   BROWSER=chrome (default) — Chrome MV3, loads from .vite/
 *   BROWSER=firefox          — Firefox MV3 on Gecko, loads from .vite-firefox/
 *                              Uses manifest.firefox.json; webextension-polyfill
 *                              wraps chrome.* → browser.*
 *                              Firefox port (v0.1-firefox)
 */

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import pkg from './package.json' with { type: 'json' };
import { webllmModelLibs } from './scripts/webllm-model-libs.js';

// package.json is the single source of truth for the version. Override the manifest's
// version at build time so the shipped extension version can never drift from
// package.json / CHANGELOG (the manifest's own version field is otherwise hand-maintained).
manifest.version = pkg.version;

const isDev = process.env.NODE_ENV === 'development';
const browser = process.env.BROWSER ?? 'chrome';
const isFirefox = browser === 'firefox';

// Firefox manifest — used only when BROWSER=firefox.
// Falls back to Chrome manifest if manifest.firefox.json doesn't exist yet;
// the file will be created as part of the Firefox port deliverable.
let activeManifest = manifest;
if (isFirefox) {
  try {
    const { default: ffManifest } = await import('./manifest.firefox.json', { with: { type: 'json' } });
    activeManifest = ffManifest;
  } catch {
    // manifest.firefox.json not yet created — Firefox port in progress.
    // Fall back to Chrome manifest; MV3-on-Gecko is largely compatible.
    console.warn('[vite] BROWSER=firefox but manifest.firefox.json not found — using manifest.json');
  }
}

export default defineConfig({
  plugins: [
    crx({ manifest: activeManifest }),
    // Browser AI's compiled model libraries, pinned and checked, so no code is fetched at run time
    // (ADR 0010). Cached in .cache/webllm-libs/; a build with an empty cache needs network once.
    webllmModelLibs()
  ],

  build: {
    // Chrome: .vite/   Firefox: .vite-firefox/
    outDir: isFirefox ? '.vite-firefox' : '.vite',
    emptyOutDir: true,

    // Source maps for local debugging only — never shipped to CWS
    sourcemap: isDev,

    // Minify in production to reduce bundle size
    minify: !isDev,

    // Module preloading is OFF, and must stay off.
    //
    // Vite's preload helper resolves a chunk's dependencies against `base` ('/') and appends
    // <link rel="modulepreload"> tags to `document.head`. In an extension page that is harmless —
    // '/assets/x.js' resolves against chrome-extension://<id>/. In a CONTENT SCRIPT the document is
    // the visited website, so every one of those links fired a request at the student's page origin
    // (https://www.rte.ie/assets/x.js) and 404'd, while the real dynamic import — a specifier
    // relative to import.meta.url — loaded correctly from the extension. Two requests per chunk,
    // one of them wrong, on every page the extension runs on.
    //
    // Preloading buys nothing here anyway: chunks are read from local disk, not over a network.
    // With it off Vite emits no dependency lists, so the helper never appends a link, and
    // code-splitting is untouched — every lazy import() stays lazy.
    // Guarded by tests/unit/bundle/content-script-chunks.test.js.
    modulePreload: false,

    rollupOptions: {
      // CRXJS reads entry points from manifest.json.
      // Additional HTML pages (not in manifest fields) are listed here so
      // Vite/CRXJS fully bundles them with their imports resolved.
      input: {
        // Shared offscreen document (stable extension-origin DOM context): owns the canonical
        // citation Dexie DB and hosts WebLLM/WebGPU (lazy-loaded). One doc — Chrome allows only one.
        'assist-offscreen': 'src/pages/assist-offscreen/offscreen.html',
        // Full-page citation library (Phase 2, behind the new-experience toggle).
        'citation-library': 'src/pages/citation-library/library.html',
        // Onboarding front door (Phase 3): bundled so it can import the queue module
        // and src/utils freely. Opened in its own tab (no web_accessible_resources entry needed).
        welcome: 'src/pages/welcome/welcome.html',
        // Discovery quiz. Bundled for the same reason as welcome: it resolves what it switches on
        // through the popup's tool registry, and an unbundled copy could only import files that
        // ship as raw source beside it. Opened in its own tab (chrome.tabs.create), so its
        // web_accessible_resources entry is unaffected either way.
        discovery: 'src/pages/discovery/discovery.html',
        // AI setup wizard. Shipped as raw copied source until now, which meant its imports had to
        // exist as raw files beside it — and `src/utils/ollama-models.js` never did, because
        // web_accessible_resources names `src/utils/event-handlers.js` file by file rather than the
        // directory. The import 404'd, ai-setup.js never finished loading, and every button on the
        // first screen a new install shows did nothing. Bundling resolves its imports at build time,
        // which fixes it without widening web_accessible_resources.
        'ai-setup': 'src/pages/ai-setup/ai-setup.html',
        // How-to guide for the citation manager, reached from the popup once Citations is on.
        // Bundled so it can import src/utils; opened in its own tab, so no web_accessible_resources
        // entry is involved.
        'citation-guide': 'src/pages/citation-guide/guide.html',
        // Mind map library and editor. Bundled so it can open the Dexie database and import the
        // Chrome-free core directly; opened in its own tab, so no web_accessible_resources entry.
        'mind-map': 'src/pages/mind-map/mindmap.html',
        // Consent window (ADR 0009): the service worker opens it in a popup window when a page
        // feature first needs a service that comes with a Chrome host. Bundled so it can import
        // the consent modules; opened by chrome.windows.create, so no web_accessible_resources.
        consent: 'src/pages/consent/consent.html',
        // Feature demo, opened from the discovery quiz. It reached the build only as a raw copy of
        // its directory, emitted because web_accessible_resources listed `src/pages/demo/*`, and its
        // one import resolved purely by luck: `src/utils/event-handlers.js` happened to be listed
        // there too, so a raw copy landed at the path the raw demo.js reached for. Listing it here
        // emits the page whether or not anything exposes it to a website, and resolves its imports
        // at build time instead of relying on a sibling copy.
        demo: 'src/pages/demo/demo.html',
        // Help page, opened from the popup. Static markup with no script of its own, but it still
        // has to be emitted — and until now the only thing emitting it was its
        // web_accessible_resources entry, which exposed the page to every LMS site for no reason.
        help: 'src/pages/help/help.html',
      },
    }
  },

  // Resolve configuration for path aliases
  resolve: {
    alias: {
      '@': '/src',
      '@core': '/src/core',
      '@content': '/src/content',
      '@utils': '/src/utils',
      '@engines': '/src/engines',
      '@adapters': '/src/adapters'
    }
  },

  // Define constants available during build
  define: {
    '__APP_VERSION__': JSON.stringify(activeManifest.version),
    '__LLM_ENABLED__': false,
    // Capability flags — content scripts read these to disable Chrome-only APIs
    // gracefully on Firefox (Chrome Prompt API, webkitSpeechRecognition).
    '__BROWSER_TARGET__': JSON.stringify(browser),
    '__IS_FIREFOX__': isFirefox,
  }
});
