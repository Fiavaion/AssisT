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
      // No need to specify input - CRXJS reads from manifest.json
      // It will automatically discover:
      // - background service worker
      // - content scripts
      // - popup HTML
      // - web_accessible_resources
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
