/**
 * @jest-environment jsdom
 *
 * WAI-Adapt semantics on AssisT's own controls.
 *
 * The project's accessibility rule has always asked for WAI-Adapt semantics alongside WCAG 2.2 AA,
 * and until ADR 0005 nothing in the source emitted a single one of these attributes. The vocabulary
 * is the W3C WAI-Adapt Content Module, Working Draft of 9 June 2022: `data-action` on a control that
 * does something, `data-destination` on one that takes the student somewhere. Only the tokens that
 * draft enumerates are used; a control with no matching token is left bare, because a confidently
 * wrong purpose is worse for somebody relying on it than no purpose at all.
 *
 * Nothing consumes these attributes yet — no browser and no assistive technology reads them today,
 * and AssisT deliberately reads none from host pages either. An attribute with no consumer is
 * exactly the kind of thing a refactor drops without anybody noticing, which is why this file
 * exists and why it names every marked control individually rather than counting them.
 *
 * Two jsdom traps this file stays clear of: `offsetParent` is always null here and
 * `getComputedStyle` reports only an element's own `display`, so nothing below asserts visibility.
 * These are attribute assertions, and a control that currently ships hidden still carries its
 * semantics correctly.
 */

import fs from 'fs';
import path from 'path';

import { sanitizeHTML } from '../../../src/utils/sanitize.js';

const ROOT = path.join(__dirname, '../../..');

/**
 * The enumerated token lists from the Content Module, verbatim. Their job is to fail a future
 * edit that invents a plausible-looking token: an invented one reads as authoritative and is
 * worse than a missing one.
 */
const ACTION_TOKENS = new Set([
  'add', 'brightness', 'buy', 'cancel', 'captions', 'channel', 'checkout', 'close', 'color',
  'compose', 'confirm', 'connect', 'copy', 'cut', 'date', 'decrease', 'delete', 'down', 'download',
  'drag', 'edit', 'end', 'escape', 'expand', 'forward', 'opens-in-page-help', 'increase', 'label',
  'language', 'left', 'loop', 'media-position', 'mode', 'more', 'move', 'mute', 'new', 'next',
  'open', 'order', 'paste', 'pause', 'play', 'previous', 'print', 'profile', 'properties',
  'received', 'refresh', 'remove', 'reply', 'reset', 'resize', 'right', 'save', 'scroll', 'send',
  'sent', 'settings', 'skip', 'start', 'submit', 'temperature', 'toc', 'undo', 'up', 'upload',
  'voice-commands', 'volume',
]);

const DESTINATION_TOKENS = new Set([
  'about', 'accessibility-statement', 'begin', 'chat', 'contact', 'email-recipient', 'end',
  'feedback', 'help', 'home', 'phone', 'post', 'products', 'related', 'services', 'signin',
  'signout', 'sitemap', 'social', 'terms', 'tools',
]);

/** Every popup control that carries a purpose, by id, with the attribute it must carry. */
const POPUP_BY_ID = {
  // The header and its overflow menu.
  'menu-reset': ['data-action', 'reset'],
  'menu-help': ['data-destination', 'help'],
  'menu-report-bug': ['data-destination', 'feedback'],
  'btn-options-compact': ['data-action', 'settings'],
  'btn-open-extension-settings': ['data-action', 'settings'],

  // Reading
  'btn-read-page': ['data-action', 'play'],
  'btn-toggle-reading-mode': ['data-action', 'mode'],

  // Writing and dictation
  'stt-voice-commands': ['data-action', 'voice-commands'],
  'btn-add-vocab-word': ['data-action', 'add'],
  'btn-create-sticky-note': ['data-action', 'new'],
  'translation-target-language': ['data-action', 'language'],

  // Citations
  'btn-save-citation': ['data-action', 'save'],
  'btn-citation-guide': ['data-destination', 'help'],
  'btn-expand-citations': ['data-action', 'expand'],

  // AI and the student's own record
  'btn-delete-learning-data': ['data-action', 'delete'],
  'btn-ai-setup-cta': ['data-action', 'settings'],
  'btn-ai-advanced': ['data-action', 'settings'],

  // Footer
  'link-settings': ['data-action', 'settings'],

  // Modals
  'btn-cancel-save-profile': ['data-action', 'cancel'],
  'btn-confirm-save-profile': ['data-action', 'save'],
  'btn-cancel-delete-profile': ['data-action', 'cancel'],
  'btn-confirm-delete-profile': ['data-action', 'delete'],
  'btn-migration-close': ['data-action', 'close'],
};

/** The two footer links that have no id of their own, addressed by where they go. */
const POPUP_BY_HREF = {
  'https://github.com/Fiavaion/AssisT': ['data-destination', 'help'],
  'https://github.com/Fiavaion/AssisT/issues/new?template=bug_report.md': [
    'data-destination',
    'feedback',
  ],
};

/** Parse one of the extension's own pages into a queryable document. */
function pageOf(file) {
  return new DOMParser().parseFromString(
    fs.readFileSync(path.join(ROOT, file), 'utf8'),
    'text/html'
  );
}

describe('the popup declares the purpose of its controls', () => {
  const popup = pageOf('src/popup/popup.html');

  test.each(Object.entries(POPUP_BY_ID))('#%s carries %s', (id, [attr, value]) => {
    const el = popup.getElementById(id);
    expect(el).not.toBeNull();
    expect(el.getAttribute(attr)).toBe(value);
  });

  test.each(Object.entries(POPUP_BY_HREF))('the footer link to %s carries %s', (href, [attr, value]) => {
    const el = popup.querySelector(`.footer-links a[href="${href}"]`);
    expect(el).not.toBeNull();
    expect(el.getAttribute(attr)).toBe(value);
  });

  test('every token emitted anywhere in the popup is one the specification defines', () => {
    const emitted = [...popup.querySelectorAll('[data-action], [data-destination]')];
    expect(emitted.length).toBe(Object.keys(POPUP_BY_ID).length + Object.keys(POPUP_BY_HREF).length);

    for (const el of emitted) {
      if (el.hasAttribute('data-action')) {
        expect(ACTION_TOKENS).toContain(el.getAttribute('data-action'));
      }
      if (el.hasAttribute('data-destination')) {
        expect(DESTINATION_TOKENS).toContain(el.getAttribute('data-destination'));
      }
    }
  });

  test('help and the bug report are declared in both the full header and the compact one', () => {
    // SC 3.2.6 in a different vocabulary: the same help mechanism, reachable the same way, in
    // whichever header the student is looking at.
    expect(popup.querySelectorAll('[data-destination="help"]').length).toBeGreaterThanOrEqual(2);
    expect(popup.querySelectorAll('[data-destination="feedback"]').length).toBeGreaterThanOrEqual(2);
  });
});

describe('the mind map declares where its Help button goes', () => {
  const mindmap = pageOf('src/pages/mind-map/mindmap.html');

  test('#assist-mm-help is a help destination', () => {
    expect(mindmap.getElementById('assist-mm-help').getAttribute('data-destination')).toBe('help');
  });
});

describe('the sanitizer keeps these attributes', () => {
  // Markup the extension renders with innerHTML goes through sanitizeHTML, which strips any
  // attribute its allowlist does not name. `data-*` is already allowed wholesale there, so no
  // allowlist change was needed for this work — these tests pin that, because narrowing the
  // allowlist later would silently erase the semantics from every rendered control.
  const sanitized = html => {
    const host = document.createElement('div');
    host.innerHTML = sanitizeHTML(html);
    return host.firstElementChild;
  };

  test('data-action survives sanitizeHTML', () => {
    expect(sanitized('<button data-action="play">Read</button>').getAttribute('data-action')).toBe(
      'play'
    );
  });

  test('data-destination survives sanitizeHTML', () => {
    expect(
      sanitized('<a href="#" data-destination="help">Help</a>').getAttribute('data-destination')
    ).toBe('help');
  });
});

describe('the other extension pages declare their Help link the same way (SC 3.2.6)', () => {
  test.each([
    'src/pages/citation-library/library.html',
    'src/pages/welcome/welcome.html',
    'src/pages/discovery/discovery.html',
    'src/pages/ai-setup/ai-setup.html',
  ])('%s has exactly one help destination, and it goes to the Help page', file => {
    const help = [...pageOf(file).querySelectorAll('[data-destination]')];
    expect(help).toHaveLength(1);
    expect(help[0].getAttribute('data-destination')).toBe('help');
    expect(help[0].getAttribute('href')).toBe('../help/help.html');
  });
});

describe('the mind map library declares the purpose of its card actions', () => {
  // These are the one place a purpose is written from a variable, so the drift guard below cannot
  // read the value from the source; it is read here from the rendered cards instead.
  test('Open and Delete carry their tokens, Rename carries none', async () => {
    const { mountLibraryView } = await import('../../../src/pages/mind-map/library-view.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountLibraryView(host, {
      listMaps: jest.fn().mockResolvedValue([
        { id: 'm', title: 'Map', updatedAt: 0, nodeCount: 1, sourceUrl: null },
      ]),
      deleteMap: jest.fn(),
      renameMap: jest.fn(),
      createFromTemplate: jest.fn(),
      onImport: jest.fn(),
      onOpen: jest.fn(),
      announce: jest.fn(),
      notify: jest.fn(),
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const button = command => host.querySelector(`.assist-mm-card [data-command="${command}"]`);
    expect(button('open').getAttribute('data-action')).toBe('open');
    expect(button('delete').getAttribute('data-action')).toBe('delete');
    expect(button('rename').hasAttribute('data-action')).toBe(false);
    host.remove();
  });
});

/**
 * One meaning per attribute name. `data-action` is the WAI-Adapt purpose and nothing else; the
 * extension's own event wiring uses `data-command`. The two used to share `data-action`, which is
 * harmless until the first page-wide `[data-action]` reader, or a WAI-Adapt consumer, takes the
 * wiring for a declared purpose. This scan keeps them apart: every `data-action` value written
 * anywhere in src/ must be a token the Content Module defines.
 */

/** Files where a purpose is written from a variable, and the test above that reads the result. */
const DYNAMIC_PURPOSE_WRITES = new Set(['src/pages/mind-map/library-view.js']);

/**
 * Every `data-action` value a source file writes or selects on, as { value } for a literal and
 * { dynamic: true } for anything computed.
 * @param {string} source
 * @returns {Array<{value?: string, dynamic?: boolean, at: string}>}
 */
function dataActionValues(source) {
  const found = [];
  const patterns = [
    // Markup, template strings and selectors: data-action="x", data-action='x', data-action=${x}
    [/data-action\s*=\s*(?:"([^"]*)"|'([^']*)'|(\$\{))/g, m => m[3]],
    // setAttribute('data-action', ...)
    [/setAttribute\(\s*['"`]data-action['"`]\s*,\s*(?:'([^']*)'|"([^"]*)"|([^'"\s)][^)]*))/g, m => m[3]],
    // dataset.action = ... and dataset['action'] = ... (not a comparison)
    [/dataset(?:\.action|\[\s*['"]action['"]\s*\])\s*=(?!=)\s*(?:'([^']*)'|"([^"]*)"|([^'"\s;][^;\n]*))/g, m => m[3]],
  ];
  for (const [regex, dynamicPart] of patterns) {
    for (const m of source.matchAll(regex)) {
      const value = m[1] ?? m[2];
      if (dynamicPart(m) || value.includes('${')) {
        found.push({ dynamic: true, at: m[0] });
      } else {
        found.push({ value, at: m[0] });
      }
    }
  }
  return found;
}

/** @returns {string[]} every .js and .html file under src/, repo-relative with forward slashes */
function sourceFiles(dir = path.join(ROOT, 'src')) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(js|html)$/.test(entry.name)
      ? [path.relative(ROOT, full).split(path.sep).join('/')]
      : [];
  });
}

describe('data-action carries a WAI-Adapt purpose and nothing else', () => {
  test('the scanner sees every way a value can be written, so it can fail', () => {
    const planted = [
      '<button data-action="build-page">',
      "el.setAttribute('data-action', 'reanalyze');",
      "el.dataset.action = 'save-first';",
      "el.dataset['action'] = 'read-toggle';",
      "list.querySelector('[data-action=\"confirm-delete\"]');",
      '`<button data-action="${name}">`',
      'el.dataset.action = name;',
      "if (el.dataset.action === 'copy') {}",
    ].join('\n');
    const values = dataActionValues(planted);
    expect(values.filter(v => !v.dynamic).map(v => v.value)).toEqual([
      'build-page',
      'confirm-delete',
      'reanalyze',
      'save-first',
      'read-toggle',
    ]);
    expect(values.filter(v => v.dynamic)).toHaveLength(2);
  });

  test('every data-action value anywhere in src/ is a token the specification defines', () => {
    const offenders = [];
    for (const file of sourceFiles()) {
      for (const found of dataActionValues(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
        if (found.dynamic ? !DYNAMIC_PURPOSE_WRITES.has(file) : !ACTION_TOKENS.has(found.value)) {
          offenders.push(`${file}: ${found.at}`);
        }
      }
    }
    // Internal wiring belongs on data-command. A purpose computed at runtime needs its file listed
    // in DYNAMIC_PURPOSE_WRITES and its values checked from the rendered page above.
    expect(offenders).toEqual([]);
  });
});
