import globals from 'globals';

/**
 * ESLint configuration for AssisT.
 *
 * `no-undef` is enabled project-wide. It is the rule that catches a call to a function
 * nobody defined — which is how the annotation edit modal shipped dead, its only trace a
 * ReferenceError swallowed by a try/catch. Because this repo spans several runtimes at
 * once, the globals are declared per file pattern rather than as one permissive union:
 * a Node build script that reaches for `document`, or a service worker that reaches for
 * `window`, should still be an error.
 *
 * Nothing may be added to a globals list unless the runtime genuinely provides it.
 */

/** Injected by Vite's `define` (see vite.config.js). */
const buildTimeDefines = {
  __APP_VERSION__: 'readonly',
  __LLM_ENABLED__: 'readonly'
};

/**
 * Chrome-provided speech globals that the `globals` package's `browser` set predates.
 * Real runtime APIs, not shims.
 */
const chromeBrowserGlobals = {
  webkitSpeechRecognition: 'readonly',
  SpeechRecognition: 'readonly',
  SpeechGrammarList: 'readonly',
  webkitSpeechGrammarList: 'readonly'
};

/** Content scripts, popup, extension pages and the offscreen document — all DOM contexts. */
const extensionPageGlobals = {
  ...globals.browser,
  ...globals.webextensions,
  ...chromeBrowserGlobals,
  ...buildTimeDefines
};

export default [
  {
    ignores: [
      '.vite/**', // build output — generated, never linted, never edited
      '.vite-firefox/**',
      '.claude/**', // agent worktrees + local tooling
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
      'public/**'
    ]
  },

  // Rules apply everywhere; each environment below supplies only its own globals.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      semi: ['error', 'always']
    }
  },

  // Extension source and the standalone packages: browser DOM + chrome.* + Vite defines.
  {
    files: ['src/**/*.js', 'packages/**/*.js'],
    languageOptions: { globals: extensionPageGlobals }
  },

  // MV3 service worker: no DOM at all, so `window`/`document` must stay undefined here.
  {
    files: ['src/background/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
        ...buildTimeDefines
      }
    }
  },

  // Node: build scripts, Vite/Playwright config, the institution key-issuing CLI.
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  },

  // CommonJS tooling configs (jest.config.cjs, commitlint.config.cjs, scripts/*.cjs).
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },

  // Jest suites run in jsdom, with Node available to the runner and chrome.* stubbed by
  // tests/setup.js. Playwright specs run under Node and drive a real browser.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...extensionPageGlobals,
        ...globals.node,
        ...globals.jest
      }
    }
  },

  // Playwright specs. A destructured fixture parameter is a dependency declaration, not a
  // value: naming `popupPage` is what makes Playwright build and tear that fixture down,
  // whether or not the body reads it. `no-unused-vars` for arguments cannot hold here, and
  // the fixture cannot be renamed to `_popupPage` either — Playwright resolves fixtures by
  // parameter name. Unused *variables* are still errors.
  {
    files: ['tests/e2e/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }]
    }
  }
];
