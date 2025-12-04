/**
 * Vite Configuration for AssisT LLM Chrome Extension
 * Uses @crxjs/vite-plugin for Chrome Manifest V3 support
 *
 * This is the LLM-enabled build configuration.
 * Outputs to AssistLLM/ directory (separate from standard build).
 *
 * Key differences from standard build:
 * - Uses manifest.llm.json (includes nativeMessaging, localhost permissions)
 * - Outputs to AssistLLM/ directory
 * - Defines __LLM_ENABLED__ = true for conditional feature loading
 */

import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.llm.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],

  build: {
    // Output to AssistLLM directory (separate from standard AssistV2a)
    outDir: 'AssistLLM',
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
      '@adapters': '/src/adapters',
      '@llm': '/src/features/llm'
    }
  },

  // Define constants available during build
  define: {
    '__APP_VERSION__': JSON.stringify(manifest.version),
    '__LLM_ENABLED__': true
  }
});
