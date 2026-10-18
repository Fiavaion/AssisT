/**
 * Two callers must never put AssisT into the same page at once.
 *
 * AssisT is injected into a page from three places: a tab finishing loading, a catch-up sweep after
 * an install or a browser restart, and the moment a student grants access to all sites. Nothing in
 * the content script stops a second evaluation, so if two of those reach one tab at the same moment
 * the student gets two of every listener and two of every floating control.
 *
 * The other suites in this directory read the worker as source, which cannot see a race. This one
 * runs the real listeners the worker registers, against a faked `chrome` whose PING can be held
 * open, so a second caller is guaranteed to arrive while the first is still mid-injection.
 */

/** A promise with its resolve/reject exposed, to hold an injection open. */
function deferred() {
  let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

/**
 * A stand-in for the `chrome` namespace.
 *
 * Anything the worker touches at import time answers with a callable proxy, so the worker can
 * register all of its listeners without the test having to model APIs it is not about to exercise.
 * `addListener` calls are recorded by path ('permissions.onAdded'), and `overrides` replaces named
 * calls ('tabs.query') with the behaviour a test needs.
 */
function fakeChrome(overrides) {
  const listeners = new Map();

  const node = path => {
    const callable = function () {};
    return new Proxy(callable, {
      apply(_target, _thisArg, args) {
        const override = overrides[path];
        if (override) {
          return override(...args);
        }
        if (path.endsWith('.addListener')) {
          const event = path.slice(0, -'.addListener'.length);
          const found = listeners.get(event) || [];
          found.push(args[0]);
          listeners.set(event, found);
          return undefined;
        }
        return Promise.resolve(undefined);
      },
      get(_target, prop) {
        if (typeof prop !== 'string' || prop === 'then' || prop === 'inspect') {
          return undefined;
        }
        return node(path ? `${path}.${prop}` : prop);
      },
    });
  };

  return {
    api: node(''),
    /** The single listener registered for an event, e.g. 'permissions.onAdded'. */
    listener(event) {
      const found = listeners.get(event) || [];
      if (found.length !== 1) {
        throw new Error(`expected one listener for ${event}, found ${found.length}`);
      }
      return found[0];
    },
  };
}

const CONTENT_SCRIPT = 'assets/content-simple.js';

describe('injecting one tab from two callers at once', () => {
  let chromeFake;
  let ping;
  let injectedFiles;
  let toasted;
  let tabs;
  let realChrome;
  // Tabs whose current page has AssisT in it, so asks it is there. A navigation empties it.
  let present;
  // The settings read the install handler starts with; a test can hold it open.
  let settingsRead;

  beforeEach(() => {
    realChrome = global.chrome;
    jest.resetModules();
    injectedFiles = [];
    toasted = [];
    ping = deferred();
    present = new Set();
    settingsRead = null;
    tabs = [{ id: 7, url: 'https://example.com/article' }];

    chromeFake = fakeChrome({
      'runtime.getManifest': () => ({ content_scripts: [{ js: [CONTENT_SCRIPT] }] }),
      // The worker reads its settings as it starts; empty storage is enough for this suite.
      'storage.local.get': () => settingsRead || Promise.resolve({}),
      'storage.sync.get': () => Promise.resolve({}),
      'storage.session.get': () => Promise.resolve({}),
      'permissions.contains': () => Promise.resolve(true),
      'tabs.query': query => Promise.resolve(query?.active ? [tabs[0]] : tabs.slice()),
      'tabs.get': tabId => Promise.resolve(tabs.find(tab => tab.id === tabId)),
      // The page is asked whether AssisT is already there. Held open until the test releases it,
      // which is what lets a second caller arrive mid-injection.
      'tabs.sendMessage': tabId =>
        present.has(tabId) ? Promise.resolve({ loaded: true }) : ping.promise,
      'scripting.executeScript': options => {
        if (options.files) {
          injectedFiles.push(options.target.tabId);
          present.add(options.target.tabId);
        } else {
          toasted.push(options.target.tabId);
        }
        return Promise.resolve([]);
      },
    });

    global.chrome = chromeFake.api;
    require('../../../src/background/service-worker.js');
  });

  afterEach(() => {
    global.chrome = realChrome;
  });

  /** Let the pending PING fail, as it does on a page with no AssisT in it yet. */
  const releasePing = () => {
    ping.reject(new Error('Receiving end does not exist'));
    return ping.promise.catch(() => {});
  };

  it('injects the tab once when a startup sweep and a permission grant race it', async () => {
    const startup = chromeFake.listener('runtime.onStartup')();
    const granted = chromeFake.listener('permissions.onAdded')({ origins: ['<all_urls>'] });

    await releasePing();
    await Promise.all([startup, granted]);

    expect(injectedFiles).toEqual([7]);
  });

  it('injects the tab once when the tab listener and a sweep race it', async () => {
    const loaded = chromeFake.listener('tabs.onUpdated')(7, { status: 'complete' }, tabs[0]);
    const swept = chromeFake.listener('runtime.onStartup')();

    await releasePing();
    await Promise.all([loaded, swept]);

    expect(injectedFiles).toEqual([7]);
  });

  it('injects the tab once when an install sweep and a permission grant race it', async () => {
    const installed = chromeFake.listener('runtime.onInstalled')({ reason: 'install' });
    const granted = chromeFake.listener('permissions.onAdded')({ origins: ['<all_urls>'] });

    await releasePing();
    await Promise.all([installed, granted]);

    expect(injectedFiles).toEqual([7]);
  });

  it('still injects and still confirms to the student when the permission is granted', async () => {
    const granted = chromeFake.listener('permissions.onAdded')({ origins: ['<all_urls>'] });

    await releasePing();
    await granted;

    expect(injectedFiles).toEqual([7]);
    expect(toasted).toEqual([7]);
  });

  it('leaves a page that already has AssisT alone', async () => {
    ping.resolve({ loaded: true });
    await chromeFake.listener('permissions.onAdded')({ origins: ['<all_urls>'] });

    expect(injectedFiles).toEqual([]);
    expect(toasted).toEqual([7]);
  });

  it('does nothing on a grant of some other permission', async () => {
    await chromeFake.listener('permissions.onAdded')({ permissions: ['downloads'] });

    expect(injectedFiles).toEqual([]);
    expect(toasted).toEqual([]);
  });

  /*
   * A page that finishes loading while an injection is still running for its tab is a new page, and
   * the attempt in flight may have gone into the one it replaced. The tab used to be skipped as
   * "already being handled", so that page never got AssisT. It is now checked again afterwards.
   */
  it('checks a tab again when it finishes loading while an injection is still running', async () => {
    const first = chromeFake.listener('tabs.onUpdated')(7, { status: 'complete' }, tabs[0]);
    // The page navigates and finishes loading again before the first attempt is done.
    const second = chromeFake.listener('tabs.onUpdated')(7, { status: 'complete' }, tabs[0]);

    await releasePing();
    await second;
    // The first attempt's injection went into the page that has just been replaced.
    present.delete(7);
    await first;

    expect(injectedFiles).toEqual([7, 7]);
  });

  it('a second load that finds AssisT already there does not add another copy', async () => {
    const first = chromeFake.listener('tabs.onUpdated')(7, { status: 'complete' }, tabs[0]);
    const second = chromeFake.listener('tabs.onUpdated')(7, { status: 'complete' }, tabs[0]);

    await releasePing();
    await Promise.all([first, second]);

    expect(injectedFiles).toEqual([7]);
  });

  /*
   * Pages already open when AssisT installs, the Canvas page a student was reading among them, wait
   * for the catch-up sweep. It used to start only after the default settings, the migrations and the
   * welcome page, which took seconds under load. It does not depend on any of them.
   */
  it('reaches pages already open on install without waiting for the default settings', async () => {
    settingsRead = new Promise(() => {});
    chromeFake.listener('runtime.onInstalled')({ reason: 'install' });

    await releasePing();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(injectedFiles).toEqual([7]);
  });
});
