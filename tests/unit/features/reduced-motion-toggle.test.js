/**
 * @jest-environment jsdom
 *
 * Reduced motion: a student who gets motion sick from a page needs the movement to stop, and to
 * stay stopped only while they want it.
 *
 * Pinned here: the CSS that actually reaches the page (WCAG 2.2 SC 2.3.3 — animation, transition,
 * smooth scrolling, marquees and animated GIFs), that switching it off removes every trace, that
 * "Follow System Setting" both starts it when the operating system asks and stops it when the
 * operating system stops asking, and that a student who turned that switch OFF keeps control.
 *
 * There was no test of this feature at all before 1.0.0.
 */

import { installStorage, flush, snapshotPage } from './helpers/settings-driven-feature.js';

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const STYLE = '#assist-reduced-motion';

let storage;
let showToast;
let media;

// One instance per `load()`, each with a listener on the system preference; they are switched off
// when their test ends so an earlier instance cannot answer a later test's preference change.
const loaded = [];

/**
 * A controllable `prefers-reduced-motion` query, since jsdom's is permanently false and the feature
 * reads it at import time.
 *
 * @param {boolean} prefersReduce - What the operating system is asking for.
 */
function installMatchMedia(prefersReduce) {
  const listeners = new Set();
  const query = {
    matches: prefersReduce,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener),
  };
  window.matchMedia = jest.fn(() => query);
  return {
    /** The student changes their OS setting. */
    set(value) {
      query.matches = value;
      for (const listener of [...listeners]) {
        listener(query);
      }
    },
  };
}

async function load(settings) {
  jest.resetModules();
  storage = installStorage(settings);
  const module = await import('../../../src/features/reducedMotion/reducedMotion.js');
  ({ showToast } = await import('../../../src/core/ui/toast.js'));
  loaded.push(module);
  await flush();
  return module;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  media = installMatchMedia(false);
});

afterEach(() => {
  while (loaded.length) {
    loaded.pop().reducedMotion_disable();
  }
});

describe('a student who has never opened the popup', () => {
  test('gets an untouched page', async () => {
    document.body.innerHTML = '<div class="carousel">Week 3</div>';
    const before = snapshotPage();

    await load(); // no assist_settings key at all

    expect(document.querySelector(STYLE)).toBeNull();
    expect(snapshotPage()).toEqual(before);
    expect(showToast).not.toHaveBeenCalled();
  });

  test('is reached by the key the popup writes', async () => {
    await load();

    await storage.writeFeature('reducedMotion', { enabled: true });
    await flush();

    expect(document.querySelector(STYLE)).not.toBeNull();
  });
});

describe('switching it on', () => {
  test('puts the motion-stopping rules into the page', async () => {
    await load({ reducedMotion: { enabled: true } });

    const css = document.querySelector(STYLE).textContent;
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(css).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(css).toMatch(/scroll-behavior:\s*auto\s*!important/);
    expect(css).toContain('marquee');
    expect(css).toContain('.gif');
    expect(css).toMatch(/scroll-snap-type:\s*none/);
  });

  test('says so once, and once only, however often the popup rewrites the same value', async () => {
    await load({ reducedMotion: { enabled: true } });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/reduced motion/i);

    await storage.writeFeature('reducedMotion', { enabled: true });
    await storage.writeFeature('reducedMotion', { enabled: true, respectSystemPreference: false });
    await flush();

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('style[id="assist-reduced-motion"]')).toHaveLength(1);
  });

  test('applying it twice leaves one style tag', async () => {
    const module = await load({ reducedMotion: { enabled: true } });

    module.reducedMotion_apply();

    expect(document.querySelectorAll('style[id="assist-reduced-motion"]')).toHaveLength(1);
  });

  test('takes no focus and touches no element of the page', async () => {
    document.body.innerHTML = '<button id="submit">Submit</button>';
    document.getElementById('submit').focus();

    await load({ reducedMotion: { enabled: true } });

    expect(document.activeElement.id).toBe('submit');
    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.querySelectorAll('body [id^="assist-"]')).toHaveLength(0);
  });
});

describe('switching it off', () => {
  test('gives the document back exactly as it was', async () => {
    document.body.innerHTML = '<h1>Week 3</h1><div class="animated">Spinner</div>';
    const before = snapshotPage();

    await load({ reducedMotion: { enabled: true } });
    expect(snapshotPage()).not.toEqual(before);

    await storage.writeFeature('reducedMotion', { enabled: false });
    await flush();

    expect(snapshotPage()).toEqual(before);
    expect(document.querySelector(STYLE)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[1][0]).toMatch(/restored|disabled/i);
  });

  test('twice in a row is harmless', async () => {
    await load({ reducedMotion: { enabled: true } });
    await storage.writeFeature('reducedMotion', { enabled: false });
    await storage.writeFeature('reducedMotion', { enabled: false });
    await flush();

    expect(document.querySelector(STYLE)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
  });
});

describe('Follow System Setting', () => {
  test('starts stopped motion when the operating system asks for it', async () => {
    media = installMatchMedia(true);

    await load({ reducedMotion: { enabled: false, respectSystemPreference: true } });

    expect(document.querySelector(STYLE)).not.toBeNull();
  });

  test('leaves the page alone when the student turned that switch off', async () => {
    media = installMatchMedia(true);

    await load({ reducedMotion: { enabled: false, respectSystemPreference: false } });

    expect(document.querySelector(STYLE)).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  test('reacts when the student changes the setting on their computer', async () => {
    await load({ reducedMotion: { enabled: false, respectSystemPreference: true } });
    expect(document.querySelector(STYLE)).toBeNull();

    media.set(true);
    await flush();

    expect(document.querySelector(STYLE)).not.toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test('and restores the page when the computer stops asking', async () => {
    media = installMatchMedia(true);
    await load({ reducedMotion: { enabled: false, respectSystemPreference: true } });
    expect(document.querySelector(STYLE)).not.toBeNull();

    media.set(false);
    await flush();

    expect(document.querySelector(STYLE)).toBeNull();
  });

  test('ignores the computer when the student turned the switch off', async () => {
    await load({ reducedMotion: { enabled: false, respectSystemPreference: false } });

    media.set(true);
    await flush();

    expect(document.querySelector(STYLE)).toBeNull();
  });

  /**
   * Two settings used to be able to mean opposite things at once: while "Follow System Setting" was
   * on, the system value was forced OVER the student's own choice, so the Reduced Motion switch
   * flipped, saved, and nothing on the page changed. One of them has to decide, and the setting the
   * student turned on says which: while they are following the system, the system decides (and the
   * popup shows that value read-only); the moment they stop following it, their own choice is
   * honoured immediately.
   */
  test('while following the system, the system decides — and their own choice resumes at once', async () => {
    media = installMatchMedia(true);
    await load({ reducedMotion: { enabled: true, respectSystemPreference: true } });
    expect(document.querySelector(STYLE)).not.toBeNull();

    // Following the system: flipping their own switch changes nothing, and nothing is lost either.
    await storage.writeFeature('reducedMotion', { enabled: false });
    await flush();
    expect(document.querySelector(STYLE)).not.toBeNull();

    // They stop following the system, so the OFF they chose takes effect immediately.
    await storage.writeFeature('reducedMotion', { respectSystemPreference: false });
    await flush();
    expect(document.querySelector(STYLE)).toBeNull();
  });

  // Following the system ADDS to the student's choice; it never overrules it. An earlier version let
  // the system decide both ways, which silently switched reduced motion OFF on upgrade for a student
  // who had deliberately switched it on. Someone who needs less motion should not lose it because
  // their operating system has nothing to say on the subject.
  test('leaves a deliberate ON alone when the system is quiet', async () => {
    await load({ reducedMotion: { enabled: true, respectSystemPreference: true } });

    expect(document.querySelector(STYLE)).not.toBeNull();
  });
});
