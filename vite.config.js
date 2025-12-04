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

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],

  build: {
    // Output to AssistV2a directory for sharing
    outDir: 'AssistV2a',
    emptyOutDir: true,

    // Enable source maps for debugging
    sourcemap: true,

    // Don't minify for easier debugging (enable for production)
    minify: false,

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

  //Define constants available during build
  define: {
    '__APP_VERSION__': JSON.stringify(manifest.version)
  }
});
