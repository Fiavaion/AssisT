/**
 * @jest-environment jsdom
 *
 * Reading Mode: the biggest gap in the 1.0.0 sweep — 368 lines with no test anywhere in the repo,
 * and an e2e file whose "extended" cases were five empty bodies behind a skip.
 *
 * What a student depends on, and what is pinned here:
 * - the article arrives: title, byline and body, with anything executable stripped out;
 * - the way out works by mouse, by Enter, by Space and by Escape — this overlay covers the page, so
 *   a student who cannot get out of it has lost the page;
 * - leaving puts the document back exactly, and puts the scroll position back;
 * - a page it cannot read does not break: no overlay, no thrown error, and it can be tried again;
 * - it announces itself once, and the announcement says how to leave.
 *
 * Two cases are `test.failing`: they state what a keyboard or screen-reader student is entitled to
 * and are expected to fail until the source changes. Each one names the line.
 */

import { installStorage, flush, snapshotPage } from './helpers/settings-driven-feature.js';

/** The extraction step is Mozilla's Readability; what it returns is set per test. */
let mockArticle;
let mockExtractionError;

jest.mock('@mozilla/readability', () => ({
  Readability: class {
    parse() {
      if (mockExtractionError) {
        throw mockExtractionError;
      }
      return mockArticle;
    }
  },
}));

/** Shortcut registration is captured so the bound handlers can be run directly. */
const mockShortcuts = new Map();
jest.mock('../../../src/utils/keyboard-shortcuts.js', () => ({
  registerShortcut: jest.fn((id, handler) => mockShortcuts.set(id, handler)),
}));

const OVERLAY = '#assist-reading-mode-overlay';
const CONTENT = '#assist-reading-mode-content';
const CLOSE = '#assist-reading-mode-close';

const ARTICLE = {
  title: 'Working memory and reading',
  byline: 'J. Snell',
  content:
    '<div><p id="body">Working memory holds what a reader has just decoded.</p>' +
    '<script>window.pwned = true;</script>' +
    '<img src="x" onerror="window.pwned = true"></div>',
  textContent: 'Working memory holds what a reader has just decoded.',
};

let storage;
let readingMode;

/** Loads the feature fresh; it initialises itself at import, as the content script relies on. */
async function load(storageContents = {}) {
  jest.resetModules();
  mockShortcuts.clear();
  storage = installStorage();
  await storage.writeRaw(storageContents);
  await import('../../../src/features/readingMode/readingMode.js');
  await flush();
  readingMode = window.assistFeatures.readingMode;
  return readingMode;
}

/** Enters reading mode and waits for the (async) extraction to finish. */
async function enter() {
  await readingMode.enter();
  await flush();
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<h1>Course page</h1><p id="page">Original page text.</p>';
  document.body.removeAttribute('style');
  delete window.assistFeatures;
  delete window.pwned;
  mockArticle = { ...ARTICLE };
  mockExtractionError = null;
  window.showToast = jest.fn();
  window.alert = jest.fn();
  window.scrollTo = jest.fn();
});

afterEach(() => {
  if (readingMode) {
    readingMode.cleanup();
    readingMode = null;
  }
  delete window.showToast;
});

describe('what the content script is wired to', () => {
  test('the feature registers itself with the calls READING_MODE_TOGGLE makes', async () => {
    await load();

    // src/content/content-simple.js:1366 calls exactly toggle() and isActive().
    expect(typeof readingMode.toggle).toBe('function');
    expect(typeof readingMode.isActive).toBe('function');
    expect(typeof readingMode.enter).toBe('function');
    expect(typeof readingMode.exit).toBe('function');
    expect(typeof readingMode.cleanup).toBe('function');
    expect(readingMode.isActive()).toBe(false);
  });

  test('both of its keyboard shortcuts are registered', async () => {
    await load();

    expect([...mockShortcuts.keys()].sort()).toEqual(['reading_mode_exit', 'reading_mode_toggle']);
  });

  test('the toggle shortcut opens the article and the exit shortcut closes it', async () => {
    await load();

    await mockShortcuts.get('reading_mode_toggle')();
    await flush();
    expect(readingMode.isActive()).toBe(true);

    mockShortcuts.get('reading_mode_exit')();
    expect(readingMode.isActive()).toBe(false);
    expect(document.querySelector(OVERLAY)).toBeNull();
  });
});

describe('the article a student gets', () => {
  test('carries the title, the byline and the body', async () => {
    await load();

    await enter();

    const overlay = document.querySelector(OVERLAY);
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('h1').textContent).toBe(ARTICLE.title);
    expect(overlay.textContent).toContain('J. Snell');
    expect(overlay.textContent).toContain('Working memory holds what a reader has just decoded.');
  });

  test('carries nothing executable out of the page it was read from', async () => {
    await load();

    await enter();

    expect(document.querySelector(OVERLAY).querySelectorAll('script')).toHaveLength(0);
    expect(document.querySelector(OVERLAY).innerHTML).not.toContain('onerror');
    expect(window.pwned).toBeUndefined();
  });

  test('is laid out with the settings the module holds', async () => {
    await load();

    await enter();

    const content = document.querySelector(CONTENT);
    expect(content.style.fontSize).toBe('18px');
    expect(content.style.lineHeight).toBe('1.6');
    expect(content.style.maxWidth).toBe('800px');
  });

  test('has an untitled article render without an empty heading', async () => {
    mockArticle = { ...ARTICLE, title: '', byline: '' };
    await load();

    await enter();

    const overlay = document.querySelector(OVERLAY);
    expect(overlay.querySelectorAll('h1')).toHaveLength(0);
    expect(overlay.textContent).toContain('Working memory');
  });

  test('opening it twice leaves one overlay', async () => {
    await load();

    await enter();
    await enter();

    expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  });

  test('a very long article renders without throwing', async () => {
    mockArticle = {
      ...ARTICLE,
      content: `<div><p>${'Reading takes working memory. '.repeat(2000)}</p></div>`,
    };
    await load();

    await enter();

    expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
    expect(document.querySelector(CONTENT).textContent.length).toBeGreaterThan(10000);
  });
});

describe('reading it in a window 320px wide (WCAG 2.2 SC 1.4.10)', () => {
  /** What a real article drags in: media at its natural size, a wide table, an unbreakable string. */
  const WIDE_ARTICLE = {
    title: 'Reflow',
    byline: '',
    content:
      '<div>' +
      '<a href="#"><img id="wide-image" src="x" width="2400" height="1200" alt="A chart"></a>' +
      '<table id="wide-table"><tr><td>a</td><td>b</td><td>c</td></tr></table>' +
      '<pre id="wide-code">const aVeryLongLineOfCodeThatWillNotWrapAnywhereAtAll = 1;</pre>' +
      '<p id="long-string">' +
      'Pneumonoultramicroscopicsilicovolcanoconiosisandthenrathermoreofthesamewithoutaspace' +
      '</p>' +
      '</div>',
    textContent: 'Reflow',
  };

  /** 320px is the reflow floor: 1280px at 400% zoom. */
  function narrowViewport() {
    window.innerWidth = 320;
    document.documentElement.style.width = '320px';
  }

  const overlay = () => document.querySelector(OVERLAY);
  const styleOf = selector => window.getComputedStyle(document.querySelector(selector));

  test('every wide thing the article brought is constrained to the column', async () => {
    narrowViewport();
    mockArticle = { ...WIDE_ARTICLE };
    await load();

    await enter();

    // The overlay itself: width 100% PLUS 20px of side padding overflowed the window by 40px
    // before box-sizing was set, which is a sideways scrollbar on every page, not just wide ones.
    expect(overlay().style.boxSizing).toBe('border-box');

    // An image at its natural size inside a link - the case the browser wave found.
    expect(styleOf('#wide-image').maxWidth).toBe('100%');
    expect(styleOf('#wide-image').height).toBe('auto');

    // A long unbroken string is allowed to break rather than widen the column.
    expect(styleOf(CONTENT).overflowWrap).toBe('anywhere');

    // Code wraps where it can, and scrolls where it cannot.
    expect(styleOf('#wide-code').whiteSpace).toBe('pre-wrap');
  });

  test('a wide table scrolls inside its own box, and keeps its table semantics', async () => {
    narrowViewport();
    mockArticle = { ...WIDE_ARTICLE };
    await load();

    await enter();

    const table = document.querySelector('#wide-table');
    const scroller = table.parentElement;
    expect(scroller.classList.contains('assist-reading-mode-scroll')).toBe(true);
    expect(window.getComputedStyle(scroller).overflowX).toBe('auto');
    expect(window.getComputedStyle(scroller).maxWidth).toBe('100%');

    // `display: block` on the table would reflow it and take its semantics with it.
    expect(table.style.display).toBe('');
    expect(table.tagName).toBe('TABLE');

    // A region only a mouse can scroll is not reachable for the student this is built for.
    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(scroller.getAttribute('role')).toBe('region');
    expect(scroller.getAttribute('aria-label')).toMatch(/table/i);
  });

  test('nothing wide is hidden: the student can still read all of it', async () => {
    narrowViewport();
    mockArticle = { ...WIDE_ARTICLE };
    await load();

    await enter();

    expect(document.querySelector('#wide-image')).not.toBeNull();
    expect(overlay().textContent).toContain('Pneumonoultramicroscopic');
    expect(document.querySelectorAll('#wide-table td')).toHaveLength(3);
    expect(styleOf(CONTENT).display).not.toBe('none');
  });

  test('the reflow rules leave the page when the overlay does', async () => {
    mockArticle = { ...WIDE_ARTICLE };
    await load();
    const before = snapshotPage();

    await enter();
    expect(document.querySelectorAll('#assist-reading-mode-reflow')).toHaveLength(1);

    readingMode.exit();

    expect(document.querySelector('#assist-reading-mode-reflow')).toBeNull();
    expect(snapshotPage()).toEqual(before);
  });
});

describe('the way out', () => {
  test('the exit control has a name a screen reader can read', async () => {
    await load();
    await enter();

    const close = document.querySelector(CLOSE);
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('aria-label')).toBe('Exit Reading Mode');
  });

  test('works with the mouse', async () => {
    await load();
    await enter();

    document
      .querySelector(CLOSE)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(readingMode.isActive()).toBe(false);
  });

  test('works with Enter', async () => {
    await load();
    await enter();

    document
      .querySelector(CLOSE)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.querySelector(OVERLAY)).toBeNull();
  });

  test('works with Space', async () => {
    await load();
    await enter();

    document
      .querySelector(CLOSE)
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(document.querySelector(OVERLAY)).toBeNull();
  });

  test('works with Escape from anywhere on the page', async () => {
    await load();
    await enter();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(readingMode.isActive()).toBe(false);
  });

  test('Escape does nothing when reading mode is not open', async () => {
    await load();
    const before = snapshotPage();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(snapshotPage()).toEqual(before);
  });

  test('gives the document back exactly, and the scroll position with it', async () => {
    const before = snapshotPage();
    await load();
    await enter();
    expect(snapshotPage()).not.toEqual(before);

    readingMode.exit();

    expect(snapshotPage()).toEqual(before);
    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(document.querySelector(CLOSE)).toBeNull();
    expect(window.scrollTo).toHaveBeenCalledWith(window.scrollX, window.scrollY);
  });

  test('leaving twice is harmless', async () => {
    await load();
    await enter();

    readingMode.exit();
    readingMode.exit();

    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(readingMode.isActive()).toBe(false);
  });

  test('toggle opens and closes the same overlay', async () => {
    await load();

    await readingMode.toggle();
    expect(readingMode.isActive()).toBe(true);

    await readingMode.toggle();
    expect(readingMode.isActive()).toBe(false);
    expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
  });

  test('after cleanup the Escape listener is gone and the overlay with it', async () => {
    await load();
    await enter();

    readingMode.cleanup();

    expect(document.querySelector(OVERLAY)).toBeNull();
    const before = snapshotPage();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(snapshotPage()).toEqual(before);
  });
});

describe('a page it cannot read', () => {
  test('leaves the page alone and can be tried again', async () => {
    mockArticle = null;
    await load();
    const before = snapshotPage();

    await enter();

    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(readingMode.isActive()).toBe(false);
    expect(snapshotPage()).toEqual(before);

    // The message goes through the page's toast, which is a role="status" region: it tells the
    // student what happened without freezing the tab the way a native alert() does.
    expect(window.alert).not.toHaveBeenCalled();
    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast.mock.calls[0][0]).toMatch(/could not|cannot/i);

    // A student who asked for fewer notifications still gets the answer to a button they pressed:
    // without `force` the toast is dropped and the button simply looks broken.
    expect(window.showToast.mock.calls[0][2]).toEqual(
      expect.objectContaining({ force: true })
    );

    mockArticle = { ...ARTICLE };
    await enter();
    expect(document.querySelector(OVERLAY)).not.toBeNull();
  });

  test('survives the extraction throwing', async () => {
    mockExtractionError = new Error('Readability blew up');
    await load();

    await expect(enter()).resolves.toBeUndefined();

    expect(document.querySelector(OVERLAY)).toBeNull();
    expect(readingMode.isActive()).toBe(false);
  });

  test('survives a page with no body content at all', async () => {
    document.body.innerHTML = '';
    mockArticle = { title: '', byline: '', content: '', textContent: '' };
    await load();

    await enter();

    // An empty article still opens — with the way out present, which is what matters.
    expect(document.querySelector(CLOSE)).not.toBeNull();
    readingMode.exit();
    expect(document.body.children).toHaveLength(0);
  });
});

describe('being told what happened', () => {
  test('announces itself once, and says how to leave', async () => {
    await load();

    await enter();

    expect(window.showToast).toHaveBeenCalledTimes(1);
    expect(window.showToast.mock.calls[0][0]).toMatch(/ESC/i);

    // Asking again while it is already open must not announce a second time.
    await enter();
    expect(window.showToast).toHaveBeenCalledTimes(1);
  });

  test('works on a page where no toast helper was installed', async () => {
    delete window.showToast;
    await load();

    await expect(enter()).resolves.toBeUndefined();

    expect(document.querySelector(OVERLAY)).not.toBeNull();
  });
});

describe('the student’s saved appearance settings', () => {
  test('a stored background colour is used for the overlay', async () => {
    await load({ assist_settings: { readingMode: { backgroundColor: 'rgb(10, 20, 30)' } } });

    await enter();

    expect(document.querySelector(OVERLAY).style.background).toBe('rgb(10, 20, 30)');
  });

  test('a change while the overlay is open restyles it in place', async () => {
    await load({ assist_settings: { readingMode: { fontSize: '18px' } } });
    await enter();

    await storage.writeFeature('readingMode', { fontSize: '28px', maxWidth: '640px' });
    await flush();

    expect(document.querySelector(CONTENT).style.fontSize).toBe('28px');
    expect(document.querySelector(CONTENT).style.maxWidth).toBe('640px');
    expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  });

  /**
   * Reading mode used to read a TOP-LEVEL `readingModeSettings` key that nothing in src/ ever wrote,
   * so every appearance value the popup saved — background, typeface, size, line height, width — was
   * saved and never read. It now goes through `assist_settings.readingMode`, the key the popup
   * (src/popup/popup.js:8749) and the tool registry (src/popup/registry/tools/reading.js:206) agree on.
   */
  test('the settings the popup saves reach the overlay', async () => {
    await load({
      assist_settings: {
        readingMode: { enabled: true, backgroundColor: 'rgb(40, 40, 40)', fontSize: '24px' },
      },
    });

    await enter();

    expect(document.querySelector(OVERLAY).style.background).toBe('rgb(40, 40, 40)');
    expect(document.querySelector(CONTENT).style.fontSize).toBe('24px');
  });
});

describe('keyboard and screen-reader students', () => {
  /**
   * The overlay covers the whole page, so it behaves like a dialog: labelled, focus moved in and
   * given back, and the page underneath taken out of the accessibility tree.
   *
   * It does NOT claim `aria-modal`. AssisT's own page tools stay reachable behind it (the TTS bar,
   * the dictation button), and `aria-modal="true"` tells a screen reader nothing outside the dialog
   * exists - which would have made "the reading controls stay reachable" true for a mouse and false
   * for the students who read through the voice.
   */
  test('the overlay is a dialog, takes focus, and gives it back', async () => {
    await load();
    document.body.insertAdjacentHTML('beforeend', '<button id="opener">Read</button>');
    const opener = document.getElementById('opener');
    opener.focus();

    await enter();

    const overlay = document.querySelector(OVERLAY);
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.hasAttribute('aria-modal')).toBe(false);
    expect(overlay.contains(document.activeElement)).toBe(true);

    readingMode.exit();

    expect(document.activeElement).toBe(opener);
    expect(document.activeElement.tagName).not.toBe('BODY');
  });

  test('the dialog carries a name, and the article title is it when there is one', async () => {
    await load();
    await enter();

    const overlay = document.querySelector(OVERLAY);
    const labelledBy = overlay.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy).textContent).toBe(ARTICLE.title);

    readingMode.exit();

    mockArticle = { ...ARTICLE, title: '', byline: '' };
    await enter();
    expect(document.querySelector(OVERLAY).getAttribute('aria-label')).toMatch(/reading mode/i);
  });

  test('the page underneath is hidden from a screen reader, and given back on exit', async () => {
    await load();
    const pageText = document.getElementById('page');

    await enter();

    expect(pageText.getAttribute('aria-hidden')).toBe('true');
    expect(pageText.hasAttribute('inert')).toBe(true);
    expect(document.querySelector(OVERLAY).getAttribute('aria-hidden')).toBeNull();

    readingMode.exit();

    expect(pageText.hasAttribute('aria-hidden')).toBe(false);
    expect(pageText.hasAttribute('inert')).toBe(false);
  });

  test('AssisT’s own page tools stay reachable behind the overlay', async () => {
    await load();
    document.body.insertAdjacentHTML('beforeend', '<div id="assist-tts-controls"></div>');

    await enter();

    const tools = document.getElementById('assist-tts-controls');
    expect(tools.hasAttribute('inert')).toBe(false);
    expect(tools.hasAttribute('aria-hidden')).toBe(false);
  });

  /**
   * The comment at readingMode.js used to say AssisT's controls stayed reachable while the overlay
   * was open; the focus trap it used wrapped Tab back to the first control in the overlay, so they
   * were not. A student in reading mode who cannot reach the voice controls cannot start the voice.
   */
  describe('Tab while the overlay is open', () => {
    /** The overlay plus a TTS bar with one control, which is the case that was broken. */
    async function openWithTools() {
      await load();
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="assist-tts-controls"><button id="tts-play">Play</button></div>'
      );
      document.body.insertAdjacentHTML('beforeend', '<button id="page-button">Page</button>');
      await enter();
    }

    const tab = (shiftKey = false) =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
      );

    test('the cycle includes AssisT’s own page tools', async () => {
      await openWithTools();

      document.querySelector(CLOSE).focus();
      tab(true);

      expect(document.activeElement).toBe(document.getElementById('tts-play'));
    });

    test('the end of the cycle wraps back into the article, never onto the page behind', async () => {
      await openWithTools();

      document.getElementById('tts-play').focus();
      tab();

      expect(document.activeElement).toBe(document.querySelector(CLOSE));
    });

    test('focus that has landed outside the cycle is pulled back in', async () => {
      await openWithTools();

      // A control on the page behind: inert in a browser, still focusable in jsdom, which is the
      // stray-focus case the cycle has to recover from either way.
      document.getElementById('page-button').focus();
      tab();

      expect(document.activeElement).toBe(document.querySelector(CLOSE));
    });

    test('after exit Tab is left entirely to the page again', async () => {
      await openWithTools();
      readingMode.exit();

      document.getElementById('page-button').focus();
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(document.getElementById('page-button'));
    });
  });

  test('a page element that was already hidden stays hidden afterwards', async () => {
    await load();
    document.body.insertAdjacentHTML('beforeend', '<div id="offscreen" aria-hidden="true"></div>');

    await enter();
    readingMode.exit();

    expect(document.getElementById('offscreen').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('asking whether it is open, while it is opening', () => {
  // Entering is asynchronous, because extraction is. The content script answers the popup with
  // isActive() once toggle() has run, so toggle has to finish before that answer is true.

  test('a toggle that has finished reports reading mode as open', async () => {
    await load();

    await readingMode.toggle();

    expect(readingMode.isActive()).toBe(true);
    expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);
  });

  test('a second toggle during opening closes it, and never opens a second overlay', async () => {
    await load();

    const first = readingMode.toggle();
    const second = readingMode.toggle();
    await Promise.all([first, second]);
    await flush();

    expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
    expect(readingMode.isActive()).toBe(false);
    expect(document.getElementById('page')).not.toBeNull();
  });

  test('a page it cannot read reports reading mode as closed once the toggle finishes', async () => {
    mockArticle = null;
    await load();

    await readingMode.toggle();

    expect(readingMode.isActive()).toBe(false);
    expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
  });
});

describe('OCR opening reading mode while the student presses Reading Mode', () => {
  // OCR opens reading mode before it captures the page, then closes it when it is done. A toggle
  // (the popup button or the shortcut) arriving while OCR's open is still extracting used to start
  // a second overlay: when OCR closed one, the other stayed, Escape no longer reached it, and the
  // second page lock had saved "hidden" as the page's own overflow.

  afterEach(() => {
    document.documentElement.style.overflow = '';
  });

  test('never shows two overlays, and leaves the page as it was once OCR is done', async () => {
    document.documentElement.style.overflow = 'scroll';
    await load();

    const ocrOpening = readingMode.enter();
    const studentToggle = readingMode.toggle();
    await Promise.all([ocrOpening, studentToggle]);
    await flush();

    expect(document.querySelectorAll(OVERLAY).length).toBeLessThanOrEqual(1);

    readingMode.exit();

    expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
    expect(readingMode.isActive()).toBe(false);
    expect(document.documentElement.style.overflow).toBe('scroll');
    expect(document.getElementById('page').hasAttribute('inert')).toBe(false);
  });

  test('two opens at once give one overlay, which Escape closes', async () => {
    document.documentElement.style.overflow = 'auto';
    await load();

    await Promise.all([readingMode.enter(), readingMode.enter()]);
    await flush();
    expect(document.querySelectorAll(OVERLAY)).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelectorAll(OVERLAY)).toHaveLength(0);
    expect(document.documentElement.style.overflow).toBe('auto');
  });
});

describe('the page underneath while it is open', () => {
  // The overlay spans the layout viewport, which stops at the page's scrollbar. Unless the page's
  // own scrolling is locked, that scrollbar stays live beside the article: a second scrollbar,
  // belonging to the page the student asked to leave.

  afterEach(() => {
    document.documentElement.style.overflow = '';
  });

  test('the page cannot scroll behind the overlay, and scrolls again once it closes', async () => {
    document.documentElement.style.overflow = 'scroll';
    await load();

    await enter();
    expect(document.documentElement.style.overflow).toBe('hidden');

    readingMode.exit();
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  test('cleanup gives the page its scrolling back too', async () => {
    document.documentElement.style.overflow = 'auto';
    await load();

    await enter();
    readingMode.cleanup();

    expect(document.documentElement.style.overflow).toBe('auto');
  });
});
