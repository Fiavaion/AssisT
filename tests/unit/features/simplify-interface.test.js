/**
 * @jest-environment jsdom
 *
 * Simplified Interface: hide the clutter, keep the coursework.
 *
 * This is the support a student reaches for when a Canvas page is too busy to start on, so the risk
 * is not that it hides too little — it is that it hides the thing they needed, or that it cannot be
 * taken off again. Pinned here: each intensity hides what it promises and no more, real dialogs and
 * AssisT's own panels are excluded from the pop-up sweep, an intensity change restyles in place
 * instead of stacking style tags, and switching it off returns the document exactly.
 *
 * There was no test of this feature at all before 1.0.0.
 */

import { installStorage, flush, snapshotPage } from './helpers/settings-driven-feature.js';

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const STYLE = '#assist-simplify-styles';

let storage;
let showToast;

const loaded = [];

async function load(settings) {
  jest.resetModules();
  storage = installStorage(settings);
  const module = await import('../../../src/features/simplify/simplify.js');
  ({ showToast } = await import('../../../src/core/ui/toast.js'));
  loaded.push(module);
  await flush();
  return module;
}

function css() {
  return document.querySelector(STYLE).textContent;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

afterEach(() => {
  while (loaded.length) {
    loaded.pop().simplify_disable();
  }
});

describe('a student who has never opened the popup', () => {
  test('gets an untouched page', async () => {
    document.body.innerHTML = '<aside class="sidebar">Links</aside><main>Essay</main>';
    const before = snapshotPage();

    await load(); // no assist_settings key at all

    expect(document.querySelector(STYLE)).toBeNull();
    expect(snapshotPage()).toEqual(before);
    expect(showToast).not.toHaveBeenCalled();
  });

  test('is reached by the key the popup writes', async () => {
    await load();

    await storage.writeFeature('simplify', { enabled: true });
    await flush();

    expect(document.querySelector(STYLE)).not.toBeNull();
  });
});

describe('what each intensity hides', () => {
  test('light hides adverts, pop-ups and share buttons, and keeps the sidebar', async () => {
    await load({ simplify: { enabled: true, intensity: 'light' } });

    expect(css()).toContain('.advertisement');
    expect(css()).toContain('[class*="popup"]');
    expect(css()).toContain('.social-share');
    expect(css()).not.toContain('[class*="sidebar"]');
    expect(css()).not.toContain('[class*="comment"]');
    expect(css()).not.toContain('#footer');
  });

  test('moderate also hides sidebars, comments and related content', async () => {
    await load({ simplify: { enabled: true, intensity: 'moderate' } });

    expect(css()).toContain('[class*="sidebar"]');
    expect(css()).toContain('[class*="comment"]');
    expect(css()).toContain('[class*="related"]');
    // A footer can hold the deadline and the contact details, so it survives until they ask.
    expect(css()).not.toContain('#footer');
  });

  test('aggressive adds the footer', async () => {
    await load({ simplify: { enabled: true, intensity: 'aggressive' } });

    expect(css()).toContain('#footer');
  });

  test('a setting the student turned off is not written into the CSS at all', async () => {
    await load({
      simplify: { enabled: true, intensity: 'aggressive', hideAds: false, hideComments: false },
    });

    expect(css()).not.toContain('.advertisement');
    expect(css()).not.toContain('.comments-section');
    expect(css()).toContain('[class*="sidebar"]');
  });
});

describe('what it must never hide', () => {
  test('a real dialog survives the pop-up sweep', async () => {
    await load({ simplify: { enabled: true } });

    // Canvas puts the submission confirmation in a role="dialog". Hiding that would take the
    // student's work with it, so every pop-up selector has to spare it.
    const popupBlock = css().split('/* Pop-up and Overlay Removal */')[1].split('}')[0];
    expect(popupBlock).toContain(':not([role="dialog"])');
    expect(popupBlock).toContain(':not([aria-modal="true"])');
  });

  test('AssisT’s own panels are excluded from the overlay selector', async () => {
    await load({ simplify: { enabled: true } });

    // `.assist-` was a class selector that could never match anything; AssisT's own panels are
    // recognised by the prefix their class names actually carry, and by the data attribute.
    expect(css()).toContain('[class*="overlay"]:not([class*="assist-"]):not([data-assist])');
    expect(css()).not.toContain(':not(.assist-)');
  });

  test('the main content keeps its place in the stack', async () => {
    await load({ simplify: { enabled: true, focusMainContent: true } });

    expect(css()).toMatch(/\bmain,/);
    expect(css()).toContain('[role="main"]');
  });

  test('it adds nothing to the page and takes no focus', async () => {
    document.body.innerHTML = '<button id="submit">Submit</button><aside>Links</aside>';
    document.getElementById('submit').focus();
    const before = snapshotPage();

    await load({ simplify: { enabled: true } });

    expect(document.activeElement.id).toBe('submit');
    // The only thing that may appear is the style tag in the head.
    expect(snapshotPage().tagCounts).toEqual({ ...before.tagCounts, STYLE: 1 });
    expect(document.body.getAttribute('style')).toBe(before.bodyStyle);
  });
});

describe('changing the intensity', () => {
  test('restyles in place, and says so once', async () => {
    const module = await load({ simplify: { enabled: true, intensity: 'light' } });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toContain('light');

    module.simplify_setIntensity('aggressive');

    expect(document.querySelectorAll('style[id="assist-simplify-styles"]')).toHaveLength(1);
    expect(css()).toContain('#footer');
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[1][0]).toContain('aggressive');
  });

  test('refuses a level that does not exist and keeps the one in use', async () => {
    const module = await load({ simplify: { enabled: true, intensity: 'light' } });

    module.simplify_setIntensity('extreme');

    expect(module.simplify_getSettings().intensity).toBe('light');
    expect(css()).not.toContain('[class*="sidebar"]');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test('is silent while the support is switched off', async () => {
    const module = await load({ simplify: { enabled: false } });

    module.simplify_setIntensity('aggressive');

    expect(document.querySelector(STYLE)).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  test('arrives through storage without announcing itself again', async () => {
    await load({ simplify: { enabled: true, intensity: 'light' } });
    expect(showToast).toHaveBeenCalledTimes(1);

    await storage.writeFeature('simplify', { enabled: true, intensity: 'moderate' });
    await flush();

    expect(css()).toContain('[class*="sidebar"]');
    // The change reaches the page; it is not news a second time.
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('style[id="assist-simplify-styles"]')).toHaveLength(1);
  });

  test('the settings it hands out cannot be edited from outside', async () => {
    const module = await load({ simplify: { enabled: true, intensity: 'light' } });

    const settings = module.simplify_getSettings();
    expect(() => {
      settings.intensity = 'aggressive';
    }).toThrow(TypeError);
    expect(module.simplify_getSettings().intensity).toBe('light');
  });
});

describe('switching it off', () => {
  test('gives the document back exactly as it was', async () => {
    document.body.innerHTML =
      '<aside class="sidebar">Links</aside><main><p>Essay</p></main><footer>Contact</footer>';
    const before = snapshotPage();

    await load({ simplify: { enabled: true, intensity: 'aggressive' } });
    expect(snapshotPage()).not.toEqual(before);

    await storage.writeFeature('simplify', { enabled: false });
    await flush();

    expect(snapshotPage()).toEqual(before);
    expect(document.querySelector(STYLE)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[1][0]).toMatch(/restored|disabled/i);
  });

  test('twice in a row is harmless, and back on again leaves one style tag', async () => {
    await load({ simplify: { enabled: true } });
    await storage.writeFeature('simplify', { enabled: false });
    await storage.writeFeature('simplify', { enabled: false });
    await flush();
    expect(document.querySelector(STYLE)).toBeNull();

    await storage.writeFeature('simplify', { enabled: true });
    await flush();

    expect(document.querySelectorAll('style[id="assist-simplify-styles"]')).toHaveLength(1);
  });

  test('on an empty page, both ways, nothing throws', async () => {
    await load({ simplify: { enabled: true } });
    await storage.writeFeature('simplify', { enabled: false });
    await flush();

    expect(document.body.children).toHaveLength(0);
  });
});
