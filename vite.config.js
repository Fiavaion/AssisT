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
 *                              NLnet deliverable: Firefox port (v0.1-firefox)
 */

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

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
    crx({ manifest: activeManifest })
  ],

  build: {
    // Chrome: .vite/   Firefox: .vite-firefox/
    outDir: isFirefox ? '.vite-firefox' : '.vite',
    emptyOutDir: true,

    // Source maps for local debugging only — never shipped to CWS
    sourcemap: isDev,

    // Minify in production to reduce bundle size
    minify: !isDev,

    rollupOptions: {
      // CRXJS reads entry points from manifest.json.
      // Additional HTML pages (not in manifest fields) are listed here so
      // Vite/CRXJS fully bundles them with their imports resolved.
      input: {
        // Offscreen document for WebLLM — needs WebGPU (DOM context, not SW)
        'webllm-offscreen': 'src/pages/webllm-offscreen/offscreen.html',
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
