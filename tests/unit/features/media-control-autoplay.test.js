/**
 * @jest-environment jsdom
 *
 * Auto-play blocking: the page must go quiet, and giving it back must be complete.
 *
 * A student who turns this on is telling us that sound arriving unasked is the problem (WCAG 2.2
 * SC 1.4.2). So what is pinned here is what they depend on: a video already playing when the page
 * loads is stopped and rewound, one that arrives later is stopped too, a video the STUDENT starts
 * is left alone forever after, and switching the support off hands the document back exactly —
 * same elements, same head styles, no `data-assist-blocked` of ours left behind.
 *
 * There was no test of this feature at all before 1.0.0.
 */

import { installStorage, flush, snapshotPage } from './helpers/settings-driven-feature.js';

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const STYLE_ID = '#assist-media-control-styles';

let storage;
let showToast;

// Every `load()` makes a NEW module instance, and an instance left enabled keeps its
// MutationObserver on this document — jsdom keeps one document for the whole file. So each instance
// is switched off when its test ends; otherwise an earlier test's observer blocks a later test's
// media and the failure reads like a product bug.
const loaded = [];

/**
 * Loads the feature fresh, with the given `assist_settings` already in storage.
 *
 * @param {Object} [settings] - Whole `assist_settings` object, or nothing for a page whose student
 *   has never opened the popup.
 */
async function load(settings) {
  jest.resetModules();
  storage = installStorage(settings);
  const module = await import('../../../src/features/mediaControl/mediaControl.js');
  ({ showToast } = await import('../../../src/core/ui/toast.js'));
  loaded.push(module);
  await flush();
  return module;
}

/**
 * A media element that behaves like one: jsdom implements neither `play()` nor the `currentTime`
 * setter, so the parts the feature touches are given real, observable behaviour here.
 *
 * @param {string} tag - 'video' or 'audio'.
 * @param {Object} [options] - `{ playing, autoplay }`.
 */
function makeMedia(tag, { playing = true, autoplay = true } = {}) {
  const element = document.createElement(tag);
  if (autoplay) {
    element.setAttribute('autoplay', '');
  }
  let paused = !playing;
  Object.defineProperty(element, 'paused', {
    get: () => paused,
    configurable: true,
  });
  let time = 12.5;
  Object.defineProperty(element, 'currentTime', {
    get: () => time,
    set: value => {
      time = value;
    },
    configurable: true,
  });
  element.pause = jest.fn(() => {
    paused = true;
  });
  return element;
}

afterEach(() => {
  while (loaded.length) {
    loaded.pop().mediaControl_disable();
  }
});

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

describe('a student who has never opened the popup', () => {
  test('gets an untouched page: no styles, no marks, nothing thrown', async () => {
    document.body.innerHTML = '<video id="v"></video><p>Lecture notes</p>';
    const before = snapshotPage();

    await load(); // no assist_settings key in storage at all

    expect(document.querySelector(STYLE_ID)).toBeNull();
    expect(document.querySelectorAll('[data-assist-blocked]')).toHaveLength(0);
    expect(snapshotPage()).toEqual(before);
    expect(showToast).not.toHaveBeenCalled();
  });

  test('is still reached by a later write of the key the popup writes', async () => {
    document.body.innerHTML = '<video id="v"></video>';
    await load();

    await storage.writeFeature('mediaControl', { enabled: true });
    await flush();

    expect(document.querySelector(STYLE_ID)).not.toBeNull();
  });
});

describe('switching auto-play blocking on', () => {
  test('stops and rewinds a video that is already playing, and drops its autoplay', async () => {
    const video = makeMedia('video');
    document.body.appendChild(video);

    await load({ mediaControl: { enabled: true } });

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.getAttribute('data-assist-blocked')).toBe('true');
  });

  test('stops audio as well as video', async () => {
    const audio = makeMedia('audio');
    document.body.appendChild(audio);

    await load({ mediaControl: { enabled: true } });

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.getAttribute('data-assist-blocked')).toBe('true');
  });

  test('stops a video the page adds afterwards, and one nested inside a new block', async () => {
    await load({ mediaControl: { enabled: true } });

    const late = makeMedia('video');
    document.body.appendChild(late);
    const block = document.createElement('div');
    const nested = makeMedia('audio');
    block.appendChild(nested);
    document.body.appendChild(block);
    await flush();

    expect(late.pause).toHaveBeenCalled();
    expect(nested.pause).toHaveBeenCalled();
  });

  test('leaves alone a video the student started themselves', async () => {
    const video = makeMedia('video');
    document.body.appendChild(video);
    await load({ mediaControl: { enabled: true } });
    expect(video.getAttribute('data-assist-blocked')).toBe('true');

    video.dispatchEvent(new Event('play')); // the student pressed play

    expect(video.hasAttribute('data-assist-blocked')).toBe(false);
  });

  test('says so once, not twice', async () => {
    await load({ mediaControl: { enabled: true } });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/auto-?play/i);

    // The popup writes the whole settings object back on every change, so the same value arrives
    // again and again. A student must not hear "enabled" a second time for a change they did not
    // make, and the page must not gain a second copy of our styles.
    await storage.writeFeature('mediaControl', { enabled: true });
    await flush();

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('style[id="assist-media-control-styles"]')).toHaveLength(1);
  });
});

describe('switching it off', () => {
  test('gives the document back exactly as it was', async () => {
    document.body.innerHTML = '<h1>Week 3</h1><p>Notes</p>';
    const video = makeMedia('video');
    document.body.appendChild(video);
    const before = snapshotPage();

    await load({ mediaControl: { enabled: true } });
    expect(snapshotPage()).not.toEqual(before);

    await storage.writeFeature('mediaControl', { enabled: false });
    await flush();

    expect(snapshotPage()).toEqual(before);
    expect(document.querySelector(STYLE_ID)).toBeNull();
    expect(document.querySelectorAll('[data-assist-blocked]')).toHaveLength(0);
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  test('stops watching, so media added later plays as the site intended', async () => {
    await load({ mediaControl: { enabled: true } });
    await storage.writeFeature('mediaControl', { enabled: false });
    await flush();

    const late = makeMedia('video');
    document.body.appendChild(late);
    await flush();

    expect(late.pause).not.toHaveBeenCalled();
    expect(late.hasAttribute('autoplay')).toBe(true);
  });

  test('twice in a row is harmless', async () => {
    await load({ mediaControl: { enabled: true } });
    await storage.writeFeature('mediaControl', { enabled: false });
    await storage.writeFeature('mediaControl', { enabled: false });
    await flush();

    expect(document.querySelector(STYLE_ID)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
  });
});

describe('pages at the edges', () => {
  test('an empty page is fine', async () => {
    await expect(load({ mediaControl: { enabled: true } })).resolves.toBeDefined();
    expect(document.querySelector(STYLE_ID)).not.toBeNull();
  });

  test('a page with no readable content and nothing but text is fine', async () => {
    document.body.textContent = 'x'.repeat(50000);
    await load({ mediaControl: { enabled: true } });
    expect(document.querySelectorAll('[data-assist-blocked]')).toHaveLength(0);
  });

  test('a lecture index with three hundred clips is all silenced', async () => {
    const clips = [];
    for (let index = 0; index < 300; index += 1) {
      const clip = makeMedia(index % 2 ? 'audio' : 'video');
      clips.push(clip);
      document.body.appendChild(clip);
    }

    await load({ mediaControl: { enabled: true } });

    expect(clips.every(clip => clip.pause.mock.calls.length === 1)).toBe(true);
  });
});
