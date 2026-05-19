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
 */

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],

  build: {
    // Output to .vite directory (Chrome loads extension from here)
    outDir: '.vite',
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
    '__APP_VERSION__': JSON.stringify(manifest.version),
    '__LLM_ENABLED__': false
  }
});
