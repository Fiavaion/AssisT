/**
 * @jest-environment jsdom
 *
 * The mind map page itself: the wiring nobody else owns.
 *
 * The panes have their own specs, so they are stubbed here. What is graded is the page's own
 * contract with them — the keyboard map, the find box, the live region, the options each pane is
 * handed, and the teardown that has to reach every one of them.
 *
 * The real `mindmap.html` body is used rather than a hand-written skeleton: an element renamed in
 * the markup and not in the wiring is exactly the defect this file should fail on.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ROOT_ID, makeMap } from './pane-fixtures.js';

const PAGE = path.join(__dirname, '../../../../src/pages/mind-map');

/**
 * The handles and options every stubbed mount hands back, so a test can reach into the page's
 * collaborators. Plain methods, not `jest.fn`s: `resetMocks` would wipe a factory's implementation
 * before the test that needs it ever runs.
 */
const mockRegistry = {
  mounts: {},
  handles: {},
  maps: {},
  mapListeners: [],
  /** What is holding the student's attention; the page reads these to hold Alt+R back. */
  open: { study: false, shortcuts: false },
  /** Mount the real canvas pane instead of its stub, for the tests that are about the picture. */
  realCanvas: false,
  /** Stood in by the one test about a map that reads and then will not store. */
  saveMap: async map => ({ ...map, updatedAt: 1700000000000 }),
  reset() {
    this.realCanvas = false;
    this.saveMap = async map => ({ ...map, updatedAt: 1700000000000 });
    this.mounts = {};
    this.handles = {};
    this.maps = {};
    this.mapListeners = [];
    this.open = { study: false, shortcuts: false };
  },
  mount(name, host, options, extra) {
    this.mounts[name] = { host, options };
    const handle = { destroy: jest.fn(), ...(extra || {}) };
    this.handles[name] = handle;
    return handle;
  },
  options(name) {
    return this.mounts[name].options;
  },
};

jest.mock('../../../../src/popup/theme.js', () => ({
  loadAndApplyTheme: async () => ({ theme: 'dark' }),
}));

jest.mock('../../../../src/utils/setting-writes.js', () => ({
  applySettingWrites: async () => {},
}));

jest.mock('../../../../src/features/flashcards/flashcards-store.js', () => ({
  saveCard: async () => ({ saved: true }),
}));

jest.mock('../../../../src/features/mindMap/mindmap-db.js', () => ({
  getMap: async id => mockRegistry.maps[id] || null,
  saveMap: async map => mockRegistry.saveMap(map),
  listMaps: async () => [],
  deleteMap: async () => {},
  onMapsChanged: listener => {
    mockRegistry.mapListeners.push(listener);
    return () => {};
  },
}));

jest.mock('../../../../src/pages/mind-map/autosave.js', () => ({
  createAutosave: options =>
    mockRegistry.mount('autosave', null, options, {
      markDirty: jest.fn(),
      saveNow: jest.fn(),
      isDirty: () => false,
    }),
}));

jest.mock('../../../../src/pages/mind-map/outline-pane.js', () => ({
  mountOutlinePane: (host, options) => mockRegistry.mount('outline', host, options),
}));

jest.mock('../../../../src/pages/mind-map/canvas-pane.js', () => ({
  mountCanvasPane: (host, options) => {
    if (mockRegistry.realCanvas) {
      const real = jest.requireActual('../../../../src/pages/mind-map/canvas-pane.js');
      const handle = real.mountCanvasPane(host, options);
      mockRegistry.mounts.canvas = { host, options };
      mockRegistry.handles.canvas = handle;
      return handle;
    }
    return mockRegistry.mount('canvas', host, options, {
      fitToView: jest.fn(),
      zoomTo: jest.fn(),
      redraw: jest.fn(),
      setCovered: jest.fn(),
      ensureVisible: jest.fn(),
      getSvgElement: () => null,
    });
  },
}));

jest.mock('../../../../src/pages/mind-map/inspector.js', () => ({
  mountInspector: (host, options) =>
    mockRegistry.mount('inspector', host, options, { focusMoveTo: jest.fn() }),
}));

jest.mock('../../../../src/pages/mind-map/file-menu.js', () => ({
  mountFileMenu: (host, options) => mockRegistry.mount('file', host, options),
}));

jest.mock('../../../../src/pages/mind-map/new-map-dialog.js', () => ({
  mountNewMapDialog: (host, options) =>
    mockRegistry.mount('newMap', host, options, { open: jest.fn(), close: jest.fn() }),
}));

jest.mock('../../../../src/pages/mind-map/open-map-dialog.js', () => ({
  mountOpenMapDialog: (host, options) =>
    mockRegistry.mount('openMap', host, options, { open: jest.fn(), close: jest.fn() }),
}));

jest.mock('../../../../src/pages/mind-map/save-as-dialog.js', () => ({
  mountSaveAsDialog: (host, options) =>
    mockRegistry.mount('saveAs', host, options, { open: jest.fn(), close: jest.fn() }),
}));

jest.mock('../../../../src/pages/mind-map/ai-panel.js', () => ({
  mountAiPanel: (host, options) =>
    mockRegistry.mount('ai', host, options, {
      refresh: jest.fn().mockResolvedValue(undefined),
      focusFirst: jest.fn(),
      cancel: jest.fn(),
    }),
}));

// Read aloud is the one pane that puts controls of its own into the toolbar, so its stub mounts
// them in the shape and state the real module does: a toggle, and a Stop that starts out
// `disabled`. A stub that added nothing hid a toolbar with two tab stops.
jest.mock('../../../../src/pages/mind-map/read-aloud.js', () => ({
  mountReadAloud: (host, options) => {
    const doc = host.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'mm-read';
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mm-read__toggle';
    toggle.textContent = 'Read aloud';
    const stop = doc.createElement('button');
    stop.type = 'button';
    stop.className = 'mm-read__stop';
    stop.textContent = 'Stop';
    stop.disabled = true;
    root.append(toggle, stop);
    host.appendChild(root);
    return mockRegistry.mount('read', host, options);
  },
}));

jest.mock('../../../../src/pages/mind-map/study-mode.js', () => ({
  mountStudyMode: (host, options) =>
    mockRegistry.mount('study', host, options, {
      startWithQuestions: jest.fn(),
      isActive: () => mockRegistry.open.study,
      focusFirst: jest.fn(),
    }),
}));

jest.mock('../../../../src/pages/mind-map/library-view.js', () => ({
  mountLibraryView: (host, options) =>
    mockRegistry.mount('library', host, options, { refresh: jest.fn() }),
}));

jest.mock('../../../../src/pages/mind-map/shortcuts-dialog.js', () => ({
  mountShortcutsDialog: (host, options) =>
    mockRegistry.mount('shortcuts', host, options, {
      open: jest.fn(),
      close: jest.fn(),
      isOpen: () => mockRegistry.open.shortcuts,
    }),
}));

const html = fs.readFileSync(path.join(PAGE, 'mindmap.html'), 'utf8');
const BODY = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

const el = id => document.getElementById(id);

/** Everything written into the live region, in order; '' clears are dropped. */
let spoken = [];

/** Watch the live region by its own setter, so two announcements in one tick still count as two. */
function watchLiveRegion() {
  const live = el('assist-mm-live');
  const descriptor = Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent');
  Object.defineProperty(live, 'textContent', {
    configurable: true,
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      if (value !== '') {
        spoken.push(value);
      }
      descriptor.set.call(this, value);
    },
  });
}

/**
 * Every listener the page put on `document` or `window`, so the next test starts on a clean page.
 *
 * A browser gets a new document per load; jsdom does not, and a stale listener from the previous
 * test still holds references to the previous test's elements — which is exactly how a passing
 * suite hides a broken keyboard map.
 */
let pageListeners = [];

function recordListeners() {
  for (const target of [document, window]) {
    const original = target.addEventListener.bind(target);
    target.addEventListener = (type, listener, options) => {
      pageListeners.push({ target, type, listener, options });
      original(type, listener, options);
    };
  }
}

function releaseListeners() {
  for (const { target, type, listener, options } of pageListeners) {
    target.removeEventListener(type, listener, options);
  }
  pageListeners = [];
  delete document.addEventListener;
  delete window.addEventListener;
}

/**
 * Load the page at a URL, with the map (if any) already in the store.
 *
 * @param {{search?: string, map?: Object}} [options]
 * @returns {Promise<void>}
 */
async function loadPage({ search = '', map = null } = {}) {
  if (map) {
    mockRegistry.maps[map.id] = map;
  }
  window.history.replaceState({}, '', `/mindmap.html${search}`);
  document.body.innerHTML = BODY;
  watchLiveRegion();
  recordListeners();
  jest.resetModules();
  await import('../../../../src/pages/mind-map/mindmap.js');
  // `start()` is async: the theme, the map and the settings are all awaited before the panes mount.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Type into the find box the way a student does: one input event per keystroke. */
function typeInto(input, text) {
  input.focus();
  for (const character of text) {
    input.value += character;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
}

const key = (target, init) =>
  target.dispatchEvent(
    new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  );

/** The event object itself, for the tests that care whether the page claimed the keystroke. */
function pressAndRead(target, init) {
  const event = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** Activate a control the way a keyboard student does. */
function activate(element) {
  element.focus();
  key(element, { key: 'Enter' });
}

beforeEach(() => {
  jest.useFakeTimers();
  spoken = [];
  mockRegistry.reset();
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  if (!window.crypto) {
    window.crypto = {};
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
  }
});

afterEach(() => {
  releaseListeners();
  jest.useRealTimers();
  document.body.innerHTML = '';
});

const editorHistory = () => mockRegistry.options('outline').history;

describe('the toolbar', () => {
  it('runs every button from the keyboard, not only from a pointer', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    history.apply('setText', { id: 'arg', text: 'Argument, reworded' });

    activate(el('assist-mm-undo'));

    expect(history.current().nodes.arg.text).toBe('Argument');
    expect(spoken).toContain('Undone');

    activate(el('assist-mm-redo'));
    expect(history.current().nodes.arg.text).toBe('Argument, reworded');
  });

  // Fit lives in the canvas's own zoom cluster now. Two controls with one id was the alternative,
  // and a toolbar copy of a canvas control is a second thing to keep in step for no gain.
  it('keeps no Fit control of its own: the canvas owns the one there is', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(el('assist-mm-editor').querySelector('.assist-mm-toolbar #assist-mm-fit')).toBe(null);
  });

  /**
   * ADR 0001: the outline is the editor, so it owns making a node. The toolbar used to apply the ops
   * itself, with the literal text 'New node' and a sentence telling the student to go and press F2 —
   * a third way to make a node, with none of the rules the other two keep.
   */
  it('makes a node through the outline, which is the editor', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.outline.addNode = jest.fn(() => ({ id: 'fresh' }));
    mockRegistry.options('outline').selection.set('arg', { source: 'outline' });

    activate(el('assist-mm-new-child'));

    expect(mockRegistry.handles.outline.addNode).toHaveBeenCalledWith('arg', {
      asChild: true,
      openEditor: true,
    });
    // Nothing is applied here, so there is no second node and no second way of naming one.
    expect(Object.keys(editorHistory().current().nodes)).toHaveLength(5);
  });

  it('makes a sibling the same way, and brings the outline out to type in', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.outline.addNode = jest.fn(() => ({ id: 'fresh' }));
    mockRegistry.options('outline').selection.set('arg', { source: 'outline' });
    activate(el('assist-mm-outline-toggle'));
    expect(el('assist-mm-outline-region').hidden).toBe(true);

    activate(el('assist-mm-new-sibling'));

    expect(mockRegistry.handles.outline.addNode).toHaveBeenCalledWith('arg', {
      asChild: false,
      openEditor: true,
    });
    // The row the student is about to type in has to be on screen to be typed in.
    expect(el('assist-mm-outline-region').hidden).toBe(false);
  });

  it('opens Help from the keyboard', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    activate(el('assist-mm-help'));

    expect(mockRegistry.handles.shortcuts.open).toHaveBeenCalled();
  });
});

/**
 * A control that cannot act now, and does not say why, is a control a student presses twice and
 * then gives up on. `disabled` takes the button out of the tab order altogether, so the one person
 * who most needs the explanation — someone tabbing through the toolbar with speech — never even
 * finds the button that is refusing them.
 */
describe('toolbar buttons that cannot act', () => {
  const toolbarButton = id => el(id);
  const why = id => el(`${id}-why`).textContent;

  it('stays reachable and says why, rather than going dark', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    const undo = toolbarButton('assist-mm-undo');
    expect(undo.hasAttribute('disabled')).toBe(false);
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(why('assist-mm-undo')).toBe('Nothing to undo yet.');
    expect(undo.getAttribute('aria-describedby')).toBe('assist-mm-undo-why');
  });

  it('announces the reason when it is pressed, and does nothing else', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();

    activate(el('assist-mm-delete'));

    // The map opens with the centre selected, and the centre is the one node that cannot go.
    expect(spoken).toContain('The centre of the map cannot be deleted.');
    expect(Object.keys(history.current().nodes)).toHaveLength(5);
    expect(history.canUndo()).toBe(false);
  });

  // The reason lives in a visually hidden span and a live region, which is everything a screen
  // reader needs and nothing at all for a student who is looking at the button.
  it('shows the reason as well as saying it, and says it once', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    activate(el('assist-mm-delete'));

    expect(el('assist-mm-toast').hidden).toBe(false);
    expect(el('assist-mm-toast').textContent).toBe('The centre of the map cannot be deleted.');
    expect(spoken.filter(text => text === 'The centre of the map cannot be deleted.')).toHaveLength(
      1
    );
  });

  it('takes the reason away as soon as the button can act', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const selection = mockRegistry.options('outline').selection;

    selection.set('arg', { source: 'outline' });

    const remove = el('assist-mm-delete');
    expect(remove.getAttribute('aria-disabled')).toBe('false');
    expect(why('assist-mm-delete')).toBe('');

    activate(remove);
    expect(editorHistory().current().nodes.arg).toBeUndefined();
  });

  // The selection starts on the rootId of a map that came off disk, so an id here is only as
  // trustworthy as that file. Every object answers to `constructor`, and a truthiness test on
  // `map.nodes[id]` would take that for a node and ask the model layer to delete it.
  it('does nothing when the selection names something that is not a node', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const selection = mockRegistry.options('outline').selection;
    selection.set('constructor', { source: 'program' });

    activate(el('assist-mm-delete'));

    expect(Object.keys(editorHistory().current().nodes)).toHaveLength(5);
    expect(editorHistory().canUndo()).toBe(false);
    // Nor is the selection moved to the parent of a function.
    expect(selection.get()).toBe('constructor');
  });

  it('says a node has to be chosen before one can be added beside it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const selection = mockRegistry.options('outline').selection;
    selection.set(null, { source: 'program' });

    activate(el('assist-mm-new-child'));

    expect(spoken).toContain('Select a node first.');
    expect(Object.keys(editorHistory().current().nodes)).toHaveLength(5);
  });
});

/**
 * `role="toolbar"` is a promise about the keyboard: one tab stop for the whole strip, and the
 * arrow keys to move along it (WAI-ARIA APG). Without it the toolbar is eleven stops a student
 * must Tab past to reach the map.
 */
describe('the toolbar as one control', () => {
  const strip = () => document.querySelector('.assist-mm-toolbar');
  const items = () => [...strip().querySelectorAll('button, select')];

  /** The controls Tab would actually stop on: what the student meets, not what the markup says. */
  const tabStops = () =>
    items().filter(item => item.tabIndex === 0 && !item.disabled && !item.closest('[hidden]'));

  it('holds exactly one tab stop', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(items().filter(item => item.tabIndex === 0)).toEqual([items()[0]]);
  });

  // Read aloud's Stop button is `disabled` until a reading starts. A disabled button that was
  // never given `tabindex="-1"` wakes up with the browser's own 0, and the strip has two ways in.
  it('still holds one tab stop when a control that started out disabled wakes up', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const stop = strip().querySelector('.mm-read__stop');
    expect(stop.disabled).toBe(true);

    stop.disabled = false;

    // No waiting: there is no moment at which the strip may offer Tab two stops.
    expect(tabStops()).toEqual([items()[0]]);
  });

  it('holds one tab stop through every enable, disable, hide and show', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const stop = strip().querySelector('.mm-read__stop');
    const changes = [
      () => (stop.disabled = false),
      () => stop.focus(),
      () => (stop.disabled = true),
      () => (stop.disabled = false),
      () => (el('assist-mm-ai').hidden = true),
      () => el('assist-mm-study').focus(),
      () => (el('assist-mm-study').hidden = true),
      () => (el('assist-mm-ai').hidden = false),
      () => (el('assist-mm-study').hidden = false),
      () => (el('assist-mm-read-host').hidden = true),
      () => (el('assist-mm-read-host').hidden = false),
    ];

    for (const change of changes) {
      change();
      await Promise.resolve();
      expect(tabStops()).toHaveLength(1);
    }
  });

  it('gives a control that arrives later no tab stop of its own', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const late = document.createElement('button');
    late.type = 'button';

    el('assist-mm-read-host').appendChild(late);
    await Promise.resolve();

    expect(tabStops()).toEqual([items()[0]]);
  });

  /*
   * A closed select changes its value on Up and Down, and a key the contained control uses is not
   * the toolbar's to take (APG). Left and Right it also changes on Windows — but those are the
   * strip's rove keys, and handing all four over cost the student every control after the chooser:
   * the arrows stopped dead on it, and Left and Right changed the layout of the map instead of
   * moving along the strip. So Up and Down are the chooser's, Left and Right are the toolbar's.
   */
  describe('the layout chooser inside it', () => {
    const chooser = () => el('assist-mm-layout');

    it('keeps Up and Down for itself, which are the keys it changes its value with', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      chooser().focus();

      for (const name of ['ArrowUp', 'ArrowDown']) {
        const event = pressAndRead(chooser(), { key: name });
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(chooser());
      }
    });

    // The defect this replaced: the chooser was the last control the arrow keys could reach, and
    // Left and Right redrew the map from a strip the student was only trying to walk along.
    it('roves on Left and Right, and never changes the layout doing it', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const at = items().indexOf(chooser());
      const chosen = chooser().value;

      chooser().focus();
      const right = pressAndRead(chooser(), { key: 'ArrowRight' });
      expect(right.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(items()[at + 1]);

      chooser().focus();
      const left = pressAndRead(chooser(), { key: 'ArrowLeft' });
      expect(left.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(items()[at - 1]);
      expect(chooser().value).toBe(chosen);
    });

    it('lets the arrow keys carry on to the controls after it', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const reachable = items().filter(item => !item.disabled && !item.closest('[hidden]'));
      const at = reachable.indexOf(chooser());
      expect(at).toBeLessThan(reachable.length - 1);

      chooser().focus();
      for (const control of reachable.slice(at + 1)) {
        key(document.activeElement, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(control);
      }
    });

    it('is reached by the arrow keys of the controls either side of it', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const at = items().indexOf(chooser());

      items()[at - 1].focus();
      key(document.activeElement, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(chooser());

      items()[at + 1].focus();
      key(document.activeElement, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(chooser());
    });

    it('is left with Home and End, so it is never a trap', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const all = items().filter(item => !item.disabled);

      chooser().focus();
      const end = pressAndRead(chooser(), { key: 'End' });
      expect(end.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(all[all.length - 1]);

      chooser().focus();
      key(chooser(), { key: 'Home' });
      expect(document.activeElement).toBe(all[0]);
    });

    it('leaves Tab to the browser', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      chooser().focus();

      expect(pressAndRead(chooser(), { key: 'Tab' }).defaultPrevented).toBe(false);
    });
  });

  it('moves along the strip with the arrow keys, carrying the tab stop with it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const strip0 = items()[0];
    strip0.focus();

    key(strip0, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(items()[1]);
    expect(items().filter(item => item.tabIndex === 0)).toEqual([items()[1]]);

    key(document.activeElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('goes to the ends with Home and End, and round the ends with the arrows', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const all = items();
    all[0].focus();

    key(document.activeElement, { key: 'End' });
    expect(document.activeElement).toBe(all[all.length - 1]);

    key(document.activeElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(all[0]);

    key(document.activeElement, { key: 'Home' });
    expect(document.activeElement).toBe(all[0]);
  });

  // Read aloud puts its own controls in the strip, and its Stop button disables itself when the
  // voice finishes. A tab stop left on a control nobody can focus is a toolbar Tab walks past.
  it('never leaves its tab stop on a control that cannot take it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const last = items()[items().length - 1];
    last.focus();
    expect(last.tabIndex).toBe(0);

    last.disabled = true;
    await Promise.resolve();

    const reachable = items().filter(item => !item.disabled);
    expect(reachable.filter(item => item.tabIndex === 0)).toEqual([reachable[0]]);
  });

  it('claims the arrow keys rather than leaving them to the page', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    items()[0].focus();

    const event = pressAndRead(document.activeElement, { key: 'ArrowRight' });

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('the header', () => {
  it('marks the page Beta in a word, beside the brand', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    const beta = document.querySelector('.assist-mm-header__beta');
    expect(beta.textContent).toContain('Beta');
    // Heard as well as seen, and unambiguous about WHAT is beta once the chip is out of sight.
    expect(beta.querySelector('.assist-mm-visually-hidden').textContent).toMatch(/mind map/i);
  });

  it("draws the mark from the page's own tokens, in both themes", () => {
    const css = fs.readFileSync(path.join(PAGE, 'mindmap.css'), 'utf8');
    const at = css.indexOf('.assist-mm-header__beta {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('var(--mm-body)');
    expect(rule).toContain('var(--mm-sunken)');
  });
});

/*
 * The banner used to render as a strip of colour with a Dismiss button and no words in it, on every
 * load of the page — `.assist-mm-banner` declared `display: flex`, and an author rule beats the
 * browser's `[hidden] { display: none }`. Both halves are graded: the stylesheet states `[hidden]`
 * for the whole page, and the wiring cannot show the strip without text whatever it is handed.
 */
describe('the banner', () => {
  const CSS = fs.readFileSync(path.join(PAGE, 'mindmap.css'), 'utf8');

  const fromPage = source => ({ ...makeMap(), source });

  it('is hidden by a stylesheet that outranks nothing', () => {
    expect(CSS).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  it('shows what the map was built from, with words in it', async () => {
    await loadPage({
      search: '?map=m1&from=page',
      map: fromPage({ url: 'https://example.org/a', title: 'Photosynthesis notes' }),
    });

    expect(el('assist-mm-banner').hidden).toBe(false);
    expect(el('assist-mm-banner-text').textContent).toContain('Photosynthesis notes');
  });

  it('falls back to the address when the page had no title', async () => {
    await loadPage({
      search: '?map=m1&from=page',
      map: fromPage({ url: 'https://example.org/a', title: '' }),
    });

    expect(el('assist-mm-banner').hidden).toBe(false);
    expect(el('assist-mm-banner-text').textContent).toContain('https://example.org/a');
  });

  it('stays away when there is nothing to say, rather than showing an empty strip', async () => {
    await loadPage({ search: '?map=m1&from=page', map: fromPage({ url: '  ', title: '' }) });

    expect(el('assist-mm-banner').hidden).toBe(true);
    expect(el('assist-mm-banner-text').textContent).toBe('');
  });

  it('is not shown for a map that did not come from a page', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(el('assist-mm-banner').hidden).toBe(true);
  });

  it('dismisses from the keyboard, and empties itself as it goes', async () => {
    await loadPage({
      search: '?map=m1&from=page',
      map: fromPage({ url: 'https://example.org/a', title: 'Photosynthesis notes' }),
    });

    activate(el('assist-mm-banner-dismiss'));

    expect(el('assist-mm-banner').hidden).toBe(true);
    expect(el('assist-mm-banner-text').textContent).toBe('');
  });

  // Dismiss is inside the strip it removes, and a hidden element cannot hold focus: Chrome drops
  // it on `<body>`, which is the top of the page with the student's place lost.
  it('takes the keyboard out of the strip it is hiding', async () => {
    await loadPage({
      search: '?map=m1&from=page',
      map: fromPage({ url: 'https://example.org/a', title: 'Photosynthesis notes' }),
    });

    activate(el('assist-mm-banner-dismiss'));

    expect(document.activeElement).toBe(el('assist-mm-main'));
  });
});

/*
 * The right dock. The AI panel and study mode were absolutely positioned popovers before this, both
 * able to be open at once, both focus-trapped `dialog`s — so the student could not reach their own
 * map while either was up, and the pair could cover the canvas's zoom cluster between them.
 */
describe('the right dock', () => {
  const tab = name => el(`assist-mm-tab-${name}`);
  const panel = name => el(`assist-mm-panel-${name}`);
  const visiblePanels = () =>
    ['details', 'ai', 'study'].filter(name => panel(name).hidden === false);

  it('mounts the inspector, the AI panel and study mode into their own tabpanels', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(panel('details').contains(mockRegistry.mounts.inspector.host)).toBe(true);
    expect(panel('ai').contains(mockRegistry.mounts.ai.host)).toBe(true);
    expect(panel('study').contains(mockRegistry.mounts.study.host)).toBe(true);
  });

  it('shows exactly one panel, whichever tab is chosen', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    expect(visiblePanels()).toEqual(['details']);

    activate(tab('ai'));
    expect(visiblePanels()).toEqual(['ai']);

    activate(tab('study'));
    expect(visiblePanels()).toEqual(['study']);
  });

  it('moves between the tabs on the arrow keys, with one tab stop in the list', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    tab('details').focus();
    key(tab('details'), { key: 'ArrowRight' });

    expect(document.activeElement).toBe(tab('ai'));
    expect(tab('ai').getAttribute('aria-selected')).toBe('true');
    expect(['details', 'ai', 'study'].map(name => tab(name).tabIndex)).toEqual([-1, 0, -1]);
  });

  it('opens the AI tab from the toolbar, and says so on the button', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const button = el('assist-mm-ai');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('assist-mm-panel-ai');

    activate(button);

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(visiblePanels()).toEqual(['ai']);
    expect(mockRegistry.handles.ai.focusFirst).toHaveBeenCalled();
    // A provider may have been set up in another tab since this page loaded.
    expect(mockRegistry.handles.ai.refresh).toHaveBeenCalled();
  });

  it('closes the dock when the button for the panel already showing is pressed again', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const button = el('assist-mm-study');

    activate(button);
    expect(el('assist-mm-dock').hidden).toBe(false);

    activate(button);

    expect(el('assist-mm-dock').hidden).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('gives Escape back to the toolbar button that opened the panel', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-study'));

    const event = pressAndRead(panel('study'), { key: 'Escape' });

    expect(event.defaultPrevented).toBe(true);
    expect(visiblePanels()).toEqual(['details']);
    expect(document.activeElement).toBe(el('assist-mm-study'));
  });

  it('has no focus trap: Tab out of a panel is the browser’s', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-ai'));

    expect(pressAndRead(panel('ai'), { key: 'Tab' }).defaultPrevented).toBe(false);
  });

  // Details is what Escape goes back TO, and it is a form: the inspector's text, notes, symbol,
  // source and cross-link controls all live in it. Taking the key there pulled a student out of a
  // paragraph they were part way through writing and put them on a tab button.
  it('leaves Escape alone in the Details panel', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const notes = document.createElement('textarea');
    el('assist-mm-inspector-host').appendChild(notes);
    notes.focus();

    const event = pressAndRead(notes, { key: 'Escape' });

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(notes);
    expect(visiblePanels()).toEqual(['details']);
  });

  // The AI panel's paste box and study mode's answer box are text the student is in the middle of.
  it('leaves Escape to a text box wherever in the dock it sits', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-ai'));
    const paste = document.createElement('textarea');
    el('assist-mm-ai-host').appendChild(paste);
    paste.focus();

    const event = pressAndRead(paste, { key: 'Escape' });

    expect(event.defaultPrevented).toBe(false);
    expect(visiblePanels()).toEqual(['ai']);
  });

  // There is no abort on the messaging channel, so a generation the student walked away from would
  // still arrive and write a tree into a map they are no longer looking at.
  it('cancels an in-flight AI request when the student leaves the AI tab', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-ai'));
    expect(mockRegistry.handles.ai.cancel).not.toHaveBeenCalled();

    activate(tab('study'));
    expect(mockRegistry.handles.ai.cancel).toHaveBeenCalledTimes(1);

    // And closing the dock on the AI tab is leaving it too.
    activate(el('assist-mm-ai'));
    activate(el('assist-mm-ai'));
    expect(mockRegistry.handles.ai.cancel).toHaveBeenCalledTimes(2);

    activate(el('assist-mm-ai'));
    activate(el('assist-mm-dock-toggle'));
    expect(mockRegistry.handles.ai.cancel).toHaveBeenCalledTimes(3);
  });

  // The shared event helper prevents the default on mousedown, so a pointer press never focuses
  // the button it lands on: every toggle has to put the keyboard back on itself, or a mouse user
  // who then reaches for Tab starts again at the top of the page.
  it('leaves the keyboard on the toggle that closed a dock, not on the body', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const ai = el('assist-mm-ai');

    activate(ai);
    // The panel took the focus, and the same button now has to take it back.
    activate(ai);

    expect(el('assist-mm-dock').hidden).toBe(true);
    expect(document.activeElement).toBe(ai);

    activate(el('assist-mm-dock-toggle'));
    expect(document.activeElement).toBe(el('assist-mm-dock-toggle'));
  });

  it('hides and shows the outline dock from the toolbar', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const toggle = el('assist-mm-outline-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    activate(toggle);

    expect(el('assist-mm-outline-region').hidden).toBe(true);
    expect(el('assist-mm-separator').hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('Show outline');

    activate(toggle);

    expect(el('assist-mm-outline-region').hidden).toBe(false);
    expect(toggle.textContent).toContain('Hide outline');
  });

  it('opens the outline dock for Ctrl+F rather than focusing a box nobody can see', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-outline-toggle'));
    expect(el('assist-mm-outline-region').hidden).toBe(true);

    key(document.body, { key: 'f', ctrlKey: true });

    expect(el('assist-mm-outline-region').hidden).toBe(false);
    expect(document.activeElement).toBe(el('assist-mm-find'));
  });

  it('takes the questions the AI panel produced to the Study tab', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const questions = [{ question: 'Why?', answer: 'Because.' }];

    mockRegistry.options('ai').onQuestions(questions);

    expect(visiblePanels()).toEqual(['study']);
    expect(mockRegistry.handles.study.startWithQuestions).toHaveBeenCalledWith(questions);
  });
});

/*
 * The layout is a preference the student changes while looking at the map, so the map has to
 * change while they are looking at it. The chooser used to ask the canvas only to re-fit — to the
 * layout it already had — and the picture stayed as it was until the next edit redrew it.
 */
describe('the layout chooser and the picture', () => {
  const boxes = () =>
    new Map(
      [...el('assist-mm-canvas-host').querySelectorAll('.mm-node')].map(group => {
        const box = group.querySelector('rect.mm-node__box');
        return [group.dataset.nodeId, `${box.getAttribute('x')},${box.getAttribute('y')}`];
      })
    );
  const groups = () => [...el('assist-mm-canvas-host').querySelectorAll('.mm-node')];

  function choose(value) {
    const chooser = el('assist-mm-layout');
    chooser.value = value;
    chooser.dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  it('lays the map out again the moment the layout is changed', async () => {
    mockRegistry.realCanvas = true;
    await loadPage({ search: '?map=m1', map: makeMap() });
    const asMap = boxes();
    const drawn = groups();
    expect(asMap.size).toBe(5);

    choose('tree');

    // No waiting: not for the stored preference, and not for the next edit.
    const asTree = boxes();
    expect([...asTree.keys()]).toEqual(expect.arrayContaining([...asMap.keys()]));
    expect([...asTree].filter(([id, at]) => asMap.get(id) !== at).length).toBeGreaterThan(0);
    expect(el('assist-mm-canvas-host').querySelector('svg').dataset.layoutMode).toBe('tree');
    // The same picture, rearranged: nothing is thrown away to do it.
    expect(groups()).toHaveLength(drawn.length);
    for (const group of drawn) {
      expect(group.isConnected).toBe(true);
    }

    choose('map');
    expect(boxes()).toEqual(asMap);
  });

  it('redraws before it fits, so the fit is to the layout that was chosen', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const { redraw, fitToView } = mockRegistry.handles.canvas;

    choose('tree');

    expect(redraw).toHaveBeenCalledTimes(1);
    expect(fitToView).toHaveBeenCalledTimes(1);
    expect(redraw.mock.invocationCallOrder[0]).toBeLessThan(fitToView.mock.invocationCallOrder[0]);
  });
});

/*
 * Below 900px a dock is a sheet laid OVER the canvas. The canvas does not change size, so nothing
 * it watches tells it that the node the student was working on is now under a panel: the page has
 * to say what is covered, and say so again when it is not.
 */
describe('the docks as sheets over the canvas', () => {
  let narrowNow;
  let mediaListeners;
  let realMatchMedia;

  beforeEach(() => {
    narrowNow = true;
    mediaListeners = [];
    realMatchMedia = window.matchMedia;
    window.matchMedia = query => ({
      get matches() {
        return query.includes('max-width: 899px') && narrowNow;
      },
      addEventListener: (type, listener) => mediaListeners.push(listener),
      removeEventListener() {},
    });
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  const covered = () => mockRegistry.handles.canvas.setCovered;
  const lastCovered = () => covered().mock.calls[covered().mock.calls.length - 1][0];

  /** jsdom lays nothing out, so each sheet is told what its box is. */
  function giveBoxes() {
    const dockBox = { left: 540, top: 0, width: 360, height: 600 };
    const outlineBox = { left: 0, top: 0, width: 360, height: 600 };
    el('assist-mm-dock').getBoundingClientRect = () => dockBox;
    el('assist-mm-outline-region').getBoundingClientRect = () => outlineBox;
    return { dockBox, outlineBox };
  }

  it('tells the canvas where the details sheet is when it opens', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const { dockBox } = giveBoxes();

    // Both docks cannot be sheets at once, so the page opened with the details dock shut.
    activate(el('assist-mm-dock-toggle'));

    expect(el('assist-mm-dock').hidden).toBe(false);
    expect(lastCovered()).toBe(dockBox);
  });

  it('tells it where the outline sheet is instead, when that is the one open', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const { outlineBox } = giveBoxes();

    activate(el('assist-mm-dock-toggle'));
    activate(el('assist-mm-outline-toggle'));

    expect(el('assist-mm-outline-region').hidden).toBe(false);
    expect(lastCovered()).toBe(outlineBox);
  });

  it('tells it nothing is covered once the last sheet shuts', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    giveBoxes();

    activate(el('assist-mm-outline-toggle'));

    expect(el('assist-mm-outline-region').hidden).toBe(true);
    expect(el('assist-mm-dock').hidden).toBe(true);
    expect(lastCovered()).toBeNull();
  });

  it('tells it nothing is covered when the window widens and the sheet becomes a column', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    giveBoxes();
    activate(el('assist-mm-dock-toggle'));
    expect(lastCovered()).not.toBeNull();

    narrowNow = false;
    mediaListeners.forEach(listener => listener());

    expect(lastCovered()).toBeNull();
  });

  it('never calls a column a covering: at full width the canvas is resized, not covered', async () => {
    narrowNow = false;
    await loadPage({ search: '?map=m1', map: makeMap() });
    giveBoxes();

    activate(el('assist-mm-ai'));
    activate(el('assist-mm-outline-toggle'));

    expect(covered().mock.calls.length).toBeGreaterThan(0);
    for (const [rect] of covered().mock.calls) {
      expect(rect).toBeNull();
    }
  });
});

describe('the keyboard map', () => {
  it('opens Help from a focused outline row, which is where the student already is', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.tabIndex = 0;
    el('assist-mm-outline-host').appendChild(row);
    row.focus();

    const event = pressAndRead(row, { key: '?' });

    expect(mockRegistry.handles.shortcuts.open).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves ? alone while the student is typing', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const find = el('assist-mm-find');
    find.focus();

    pressAndRead(find, { key: '?' });

    expect(mockRegistry.handles.shortcuts.open).not.toHaveBeenCalled();
  });

  it('takes Ctrl+F to the find box from anywhere that is not a text field', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.tabIndex = 0;
    el('assist-mm-outline-host').appendChild(row);
    row.focus();

    const event = pressAndRead(row, { key: 'f', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('assist-mm-find'));
  });

  it('leaves Ctrl+F to the browser in every text field on the page', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const inspectorNote = document.createElement('textarea');
    el('assist-mm-inspector-host').appendChild(inspectorNote);
    const canvasEditor = document.createElement('input');
    canvasEditor.type = 'text';
    el('assist-mm-canvas-host').appendChild(canvasEditor);

    for (const field of [
      el('assist-mm-title-input'),
      el('assist-mm-find'),
      inspectorNote,
      canvasEditor,
    ]) {
      field.focus();
      expect(pressAndRead(field, { key: 'f', ctrlKey: true }).defaultPrevented).toBe(false);
    }
  });

  it('leaves Ctrl+Z and Ctrl+Y to the text field the student is typing in', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    history.apply('setText', { id: 'arg', text: 'Argument, reworded' });
    const inspectorNote = document.createElement('textarea');
    el('assist-mm-inspector-host').appendChild(inspectorNote);

    for (const field of [el('assist-mm-title-input'), el('assist-mm-find'), inspectorNote]) {
      field.focus();
      expect(pressAndRead(field, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(false);
      expect(pressAndRead(field, { key: 'y', ctrlKey: true }).defaultPrevented).toBe(false);
    }

    // The map's own undo never ran, so the reworded text is still there.
    expect(history.current().nodes.arg.text).toBe('Argument, reworded');
  });

  // The three drags on this page all have a keyboard alternative in the Details panel (SC 2.5.7),
  // and a control a student cannot find is a control that is not there.
  it('takes Alt+M to Move to, bringing the Details panel forward for it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    activate(el('assist-mm-study'));
    expect(el('assist-mm-panel-study').hidden).toBe(false);

    const event = pressAndRead(document.body, { key: 'm', altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(el('assist-mm-panel-details').hidden).toBe(false);
    expect(mockRegistry.handles.inspector.focusMoveTo).toHaveBeenCalledTimes(1);
  });

  it('takes Alt+M on a Mac, where the key types µ rather than m', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    const event = pressAndRead(document.body, { key: 'µ', code: 'KeyM', altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mockRegistry.handles.inspector.focusMoveTo).toHaveBeenCalled();
  });

  it('leaves Alt+M to every text field on the page', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const inspectorNote = document.createElement('textarea');
    el('assist-mm-inspector-host').appendChild(inspectorNote);
    const canvasEditor = document.createElement('input');
    canvasEditor.type = 'text';
    el('assist-mm-canvas-host').appendChild(canvasEditor);

    for (const field of [
      el('assist-mm-title-input'),
      el('assist-mm-find'),
      inspectorNote,
      canvasEditor,
    ]) {
      field.focus();
      expect(pressAndRead(field, { key: 'm', altKey: true }).defaultPrevented).toBe(false);
    }
    expect(mockRegistry.handles.inspector.focusMoveTo).not.toHaveBeenCalled();
  });

  it('leaves Alt+M alone while a dialog is open over the page', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    const event = pressAndRead(document.body, { key: 'm', altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(mockRegistry.handles.inspector.focusMoveTo).not.toHaveBeenCalled();
    dialog.remove();
  });

  it('says why Alt+M cannot act, on screen as well as aloud', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.inspector.focusMoveTo = jest.fn(() => 'Select a node first.');

    pressAndRead(document.body, { key: 'm', altKey: true });

    expect(el('assist-mm-toast').textContent).toBe('Select a node first.');
    expect(spoken).toContain('Select a node first.');
  });

  it('says nothing when Alt+M lands somewhere it can act', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.inspector.focusMoveTo = jest.fn(() => '');

    pressAndRead(document.body, { key: 'm', altKey: true });

    expect(el('assist-mm-toast').hidden).toBe(true);
  });

  it('leaves Alt+M alone in the library, which has no node to move', async () => {
    await loadPage();

    const event = pressAndRead(document.body, { key: 'm', altKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('still undoes the map when the student is not in a text field', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    history.apply('setText', { id: 'arg', text: 'Argument, reworded' });

    key(document.body, { key: 'z', ctrlKey: true });

    expect(history.current().nodes.arg.text).toBe('Argument');
  });
});

describe('the find box', () => {
  const status = () => el('assist-mm-find-status');

  /** A row for the outline stub to be scrolled, the way the real pane renders one. */
  function outlineRow(id) {
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.dataset.id = id;
    row.tabIndex = -1;
    // jsdom has no layout and so no scrollIntoView.
    row.scrollIntoView = jest.fn();
    el('assist-mm-outline-host').appendChild(row);
    return row;
  }

  it('counts matches while the student types and never touches the map', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    const before = history.current();

    typeInto(el('assist-mm-find'), 'evi');
    jest.advanceTimersByTime(300);

    expect(history.current()).toBe(before);
    expect(history.canUndo()).toBe(false);
    expect(spoken).toEqual(['1 match for "evi". Press Enter to go to it.']);
  });

  // The count used to be said and never shown: a sighted student typing in the box watched an
  // outline that did not move and had no way at all to know what they had matched.
  it('shows the count beside the box as well as saying it, and says it once', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    // 'Evidence' and 'Sources'.
    typeInto(el('assist-mm-find'), 'ce');
    jest.advanceTimersByTime(300);

    expect(status().textContent).toBe('2 matches');
    expect(spoken).toHaveLength(1);
    // One live route: the sentence goes through the page's live region, and this is the seen half.
    expect(status().hasAttribute('aria-live')).toBe(false);
    expect(status().getAttribute('role')).toBe(null);
  });

  it('says so when nothing matches, once, and shows that too', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    typeInto(el('assist-mm-find'), 'zzz');
    jest.advanceTimersByTime(300);

    expect(spoken).toEqual(['No node matches "zzz".']);
    expect(status().textContent).toBe('No matches');
  });

  it('clears the count when the box is emptied', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const find = el('assist-mm-find');
    typeInto(find, 'evi');
    jest.advanceTimersByTime(300);
    expect(status().textContent).toBe('1 match');

    find.value = '';
    find.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(status().textContent).toBe('');
  });

  it('moves to the next match on Enter, in outline order, and round the loop', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const find = el('assist-mm-find');
    const selection = mockRegistry.options('outline').selection;

    typeInto(find, 'ce');
    jest.advanceTimersByTime(300);
    spoken = [];

    // 'Evidence' and 'Sources' both contain 'ce', in that outline order.
    key(find, { key: 'Enter' });
    const first = selection.get();
    key(find, { key: 'Enter' });
    const second = selection.get();
    expect(status().textContent).toBe('Match 2 of 2');
    key(find, { key: 'Enter', shiftKey: true });

    expect([first, second]).toEqual(['ev', 'src']);
    expect(selection.get()).toBe('ev');
    expect(status().textContent).toBe('Match 1 of 2');
    expect(spoken).toEqual([
      'Match 1 of 2: Evidence',
      'Match 2 of 2: Sources',
      'Match 1 of 2: Evidence',
    ]);
  });

  /*
   * Enter used to take the keyboard to the outline row, which ended the search: the student had to
   * find their way back to the box before they could ask for the next match. The row is brought
   * into view instead — the canvas pans to the selection on its own — and the caret stays where
   * they are typing, so Enter can be pressed again.
   */
  it('keeps the keyboard in the box and brings the row it chose into view', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const row = outlineRow('ev');
    const find = el('assist-mm-find');

    typeInto(find, 'evidence');
    jest.advanceTimersByTime(300);
    key(find, { key: 'Enter' });

    expect(document.activeElement).toBe(find);
    expect(row.scrollIntoView).toHaveBeenCalled();
    expect(mockRegistry.options('outline').selection.get()).toBe('ev');
  });

  it('opens every collapsed branch over a match, as one undo step', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    // Two branches between the root and the match, both shut.
    history.apply('toggleCollapsed', { id: 'arg' });
    history.apply('toggleCollapsed', { id: makeMap().rootId });
    const steps = () => {
      let count = 0;
      while (history.canUndo()) {
        history.undo();
        count += 1;
      }
      return count;
    };

    typeInto(el('assist-mm-find'), 'evidence');
    jest.advanceTimersByTime(300);
    key(el('assist-mm-find'), { key: 'Enter' });

    expect(history.current().nodes.arg.collapsed).toBe(false);
    expect(history.current().nodes[makeMap().rootId].collapsed).toBe(false);
    // The two collapses the test made, plus ONE entry for the whole reveal.
    expect(steps()).toBe(3);
  });
});

describe('the toast', () => {
  const failSave = () =>
    mockRegistry.options('autosave').onStateChange({
      status: 'error',
      at: null,
      message: 'the database is full',
    });

  it('is mirrored into the live region, so a failed save reaches a screen reader', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    failSave();

    expect(el('assist-mm-toast').hidden).toBe(false);
    expect(el('assist-mm-toast').textContent).toContain('the database is full');
    expect(spoken).toContain('Problem: this map could not be saved — the database is full');
  });

  // A red border is a distinction only a student who can see it and tell it from grey receives
  // (SC 1.4.1). The words have to carry it, in the toast and in the live region alike.
  it('says in words that something went wrong, rather than only turning red', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    failSave();

    expect(el('assist-mm-toast').textContent).toMatch(/^Problem: /);
    expect(el('assist-mm-toast').dataset.kind).toBe('error');
  });

  // The offer to reload appears because another tab changed this map, and goes when the save that
  // made it moot lands. A student standing on it would be dropped on `<body>` by its removal.
  it('takes the keyboard off the Reload button before hiding it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const reload = el('assist-mm-reload');
    reload.hidden = false;
    reload.focus();

    mockRegistry.options('autosave').onStateChange({ status: 'saved', at: 1700000000000 });

    expect(reload.hidden).toBe(true);
    expect(document.activeElement).toBe(el('assist-mm-main'));
  });

  it('leaves a message that is not a failure unprefixed and unmarked', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    mockRegistry.options('file').notify('Copied as Markdown.');

    expect(el('assist-mm-toast').textContent).toBe('Copied as Markdown.');
    expect(el('assist-mm-toast').dataset.kind).toBe('info');
  });
});

describe('what the panes are handed', () => {
  /*
   * The three editing panes repair and refuse things the student never asked them to: a name put
   * back into a field they emptied, a new node discarded rather than followed by another, a drop
   * that could not be made. All of it used to go to the live region alone, where a sighted student
   * never meets it — the map simply snapped back with no word of why.
   */
  it('gives the outline, the canvas and the Details panel the page toast as well', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    for (const pane of ['outline', 'canvas', 'inspector']) {
      spoken = [];
      mockRegistry.options(pane).notify(`${pane} put a name back.`);

      expect(el('assist-mm-toast').hidden).toBe(false);
      expect(el('assist-mm-toast').textContent).toBe(`${pane} put a name back.`);
      // One call, both halves, and the words said exactly once.
      expect(spoken).toEqual([`${pane} put a name back.`]);
    }
  });

  it('gives the File menu the page toast, so a failed export is seen as well as said', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    mockRegistry.options('file').notify('the picture could not be made.', 'error');

    expect(el('assist-mm-toast').textContent).toBe('Problem: the picture could not be made.');
    expect(el('assist-mm-toast').dataset.kind).toBe('error');
  });

  // Alt+R is page-wide. A modal dialog holds focus inside itself, so a voice started underneath
  // the shortcuts list is a voice whose Stop button the student cannot reach; a voice started over
  // the recall question they are reading answers it for them.
  //
  // What is on screen decides it. A practice session left running behind another tab used to kill
  // Alt+R across the whole page with no study interface anywhere to explain why.
  it('holds read-aloud back only while the shortcuts list or the Study tab is on screen', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const { isBlocked } = mockRegistry.options('read');

    expect(isBlocked()).toBe(false);

    mockRegistry.open.shortcuts = true;
    expect(isBlocked()).toBe(true);
    mockRegistry.open.shortcuts = false;

    activate(el('assist-mm-study'));
    expect(isBlocked()).toBe(true);

    // The session is still running; the student is looking at something else.
    mockRegistry.open.study = true;
    activate(el('assist-mm-tab-details'));
    expect(isBlocked()).toBe(false);

    // And a dock closed on the Study tab is not the Study tab on screen either.
    activate(el('assist-mm-study'));
    expect(isBlocked()).toBe(true);
    activate(el('assist-mm-study'));
    expect(el('assist-mm-dock').hidden).toBe(true);
    expect(isBlocked()).toBe(false);

    // The AI tab never blocked it: it is a region with the Stop button beside it in the toolbar.
    activate(el('assist-mm-ai'));
    expect(isBlocked()).toBe(false);
  });

  // The library and the File menu are handed the SAME function: a file picked in either place is
  // stored the same way and says the same thing. `import-flow.js` owns the reading and the words.
  it('gives the library and the File menu one way to open an imported map', async () => {
    await loadPage();

    expect(typeof mockRegistry.options('library').onImport).toBe('function');
    expect(typeof mockRegistry.options('library').notify).toBe('function');
  });

  it('gives the library the map change feed, so another tab shows up without a reload', async () => {
    await loadPage();

    expect(typeof mockRegistry.options('library').subscribeMapsChanged).toBe('function');
    mockRegistry.options('library').subscribeMapsChanged(() => {});
    expect(mockRegistry.mapListeners).toHaveLength(1);
  });

  it('tells read aloud when a panel is open, so Alt+R cannot start speech underneath it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(typeof mockRegistry.options('read').isBlocked).toBe('function');
    expect(mockRegistry.options('read').isBlocked()).toBe(false);
  });

  // ADR 0001: the outline is the editor, so it owns making a node. The canvas's quick-add handles
  // are a second way to ask, not a second way to do it.
  it('sends the canvas’s quick-add handles to the outline’s own creation path', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.outline.addNode = jest.fn(() => ({ id: 'fresh' }));

    const record = mockRegistry.options('canvas').createNode('arg', { asChild: true });

    expect(mockRegistry.handles.outline.addNode).toHaveBeenCalledWith('arg', { asChild: true });
    expect(record).toEqual({ id: 'fresh' });
  });

  it('gives the canvas somewhere to send the keyboard when it takes its editor away', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.dataset.id = 'arg';
    row.tabIndex = -1;
    el('assist-mm-outline-host').appendChild(row);

    mockRegistry.options('canvas').rescueFocus('arg');

    expect(document.activeElement).toBe(row);
  });

  it('falls back to the map region when nothing else will take the keyboard', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    // No row for this node, and a strip that has not stated its tab stop yet.
    for (const control of el('assist-mm-editor').querySelectorAll(
      '[role="toolbar"] [tabindex="0"]'
    )) {
      control.tabIndex = -1;
    }

    mockRegistry.options('canvas').rescueFocus('arg');

    expect(document.activeElement).toBe(el('assist-mm-main'));
  });

  it('goes on to the toolbar when the outline row cannot take the keyboard', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.dataset.id = 'arg';
    row.tabIndex = -1;
    // Chrome refuses focus into a hidden subtree, and the outline dock may be shut. jsdom allows it,
    // so the refusal is what is being stood in for here.
    row.focus = () => {};
    el('assist-mm-outline-host').appendChild(row);

    mockRegistry.options('canvas').rescueFocus('arg');

    expect(document.activeElement).not.toBe(document.body);
    expect(
      el('assist-mm-editor').querySelector('[role="toolbar"]').contains(document.activeElement)
    ).toBe(true);
  });

  it('lets the inspector bring a node it has just moved back into view', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    mockRegistry.options('inspector').reveal('arg');

    expect(mockRegistry.handles.canvas.ensureVisible).toHaveBeenCalledWith('arg');
  });
});

describe('the outline dock separator', () => {
  /** jsdom measures nothing, so the workspace is given a width the way a browser would have one. */
  const workspaceWidth = width => {
    el('assist-mm-layout-grid').getBoundingClientRect = () => ({ left: 0, width });
  };

  const separator = () => el('assist-mm-separator');

  it('caps the outline at half the workspace, and says so in the ARIA range', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    workspaceWidth(1600);

    separator().focus();
    key(separator(), { key: 'End' });

    expect(separator().getAttribute('aria-valuemax')).toBe('800');
    expect(separator().getAttribute('aria-valuenow')).toBe('800');
  });

  // The body does not scroll. A window narrowed after the outline was widened would otherwise
  // leave the right dock off the edge of a page with no way to bring it back.
  it('re-clamps the width when the window narrows under it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    workspaceWidth(1600);
    separator().focus();
    key(separator(), { key: 'End' });
    expect(separator().getAttribute('aria-valuenow')).toBe('800');

    workspaceWidth(700);
    window.dispatchEvent(new window.Event('resize'));

    expect(separator().getAttribute('aria-valuemax')).toBe('350');
    expect(separator().getAttribute('aria-valuenow')).toBe('350');
    expect(el('assist-mm-layout-grid').style.getPropertyValue('--mm-outline-width')).toBe('350px');
  });

  it('stops listening for resizes once the page is going away', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    workspaceWidth(1600);
    separator().focus();
    key(separator(), { key: 'End' });

    window.dispatchEvent(new window.Event('pagehide'));
    workspaceWidth(700);
    window.dispatchEvent(new window.Event('resize'));

    expect(separator().getAttribute('aria-valuenow')).toBe('800');
  });
});

/*
 * Three claims the markup and the wiring cannot make on their own, read out of the stylesheet the
 * way the contrast suite reads the theme tokens.
 */
describe('the stylesheet', () => {
  const CSS = fs.readFileSync(path.join(PAGE, 'mindmap.css'), 'utf8');

  /** The body of the first rule matching a selector, so a claim is graded where it is made. */
  const ruleFor = (selector, from = 0) => {
    const at = CSS.indexOf(`${selector} {`, from);
    expect(at).toBeGreaterThan(-1);
    return CSS.slice(at, CSS.indexOf('}', at));
  };

  // A 6px line is a 6px target, and this one is a drag handle (SC 2.5.8). The line stays thin and
  // the grab area is widened around it.
  // All of the extra width is on the canvas side: the outline dock's own scrollbar sits in the
  // pixels immediately before the handle, and a grab area over it would swallow that scrollbar.
  it('gives the 6px separator a 24px grab area, clear of the outline scrollbar', () => {
    expect(ruleFor('.assist-mm-separator::after')).toContain('inset: 0 -18px 0 0');
  });

  // Below 900px the docks are sheets over the canvas, and at the narrow end a sheet covers the
  // whole of it — including a row of focusable zoom buttons underneath (SC 2.4.11).
  it('lifts the canvas zoom cluster above the dock sheets at sheet widths', () => {
    const narrow = CSS.indexOf('@media (max-width: 899px)');
    expect(narrow).toBeGreaterThan(-1);
    // Through the dock class, not bare: canvas-pane.css is bundled after this file and its own
    // `z-index: 2` would win a tie on source order. Specificity is what no bundler can reorder.
    expect(ruleFor('.assist-mm-canvas .mm-canvas__zoom', narrow)).toContain('z-index: 4');
    expect(ruleFor('.assist-mm-dock', narrow)).toContain('z-index: 3');
  });

  // The stored outline width is clamped in the wiring on every resize; the track caps it as well,
  // so a window narrowed between two events cannot push the right dock off the page.
  it('caps the outline track at half the workspace in the grid itself', () => {
    expect(CSS).toContain('min(var(--mm-outline-width), 50%)');
  });

  /*
   * The toast is centred at the foot of the page and the zoom cluster sits in the bottom-right
   * corner of a canvas that reaches the same foot: a long sentence was drawn across the zoom
   * buttons, and at a narrow width a short one was too. Clearing it vertically is the only way that
   * holds at every width and every length, because the toast grows upwards from its own bottom.
   */
  it('keeps the toast above the canvas zoom cluster at every width', () => {
    const pill = fs.readFileSync(path.join(PAGE, 'canvas-pane.css'), 'utf8');
    const zoomRule = /\.mm-canvas__zoom \{[^}]*\}/.exec(pill)[0];
    // The cluster is inset and padded with the page's own tokens, so the toast can be placed from
    // the same numbers instead of from one typed beside it. It used to read 66px for a cluster that
    // is really 57px tall including its inset: a 9px gap, where the comment claimed 12.
    expect(zoomRule).toContain('bottom: var(--mm-zoom-inset');
    expect(zoomRule).toContain('padding: var(--mm-zoom-padding');
    expect(ruleFor('.assist-mm-toast').replace(/\s+/g, ' ')).toContain(
      'bottom: calc(var(--mm-zoom-inset) + var(--mm-zoom-height) + var(--mm-toast-gap))'
    );

    const token = name => Number(new RegExp(name + ':\\s*([\\d.]+)px').exec(CSS)[1]);
    // The cluster's height as the stylesheet works it out: a button in the cluster's padding inside
    // its 1px border.
    expect(CSS.replace(/\s+/g, ' ')).toContain(
      '--mm-zoom-height: calc(var(--mm-control-height) + 2 * var(--mm-zoom-padding) + 2px)'
    );
    // And a button really is that tall: one line of the page's 14px text at a line height of 1.5,
    // in the button family's 6px padding and 1px border, which clears its own 32px `min-height`.
    expect(token('--mm-control-height')).toBe(Math.round(14 * 1.5) + 12 + 2);
    expect(token('--mm-control-height')).toBeGreaterThanOrEqual(32);
    // What the student actually gets between the toast and the buttons.
    expect(token('--mm-toast-gap')).toBeGreaterThanOrEqual(12);
  });
});

/*
 * The File menu. The menu itself and the three dialogs have their own specs; what belongs to the
 * page is the wiring between them — which callback opens which dialog, that a map with unsaved
 * work is written before the page navigates away from it, and that a save says so out loud.
 */
describe('the File menu', () => {
  const AT = Date.UTC(2026, 8, 5, 9, 14);
  const spokenTime = () =>
    `Saved ${new Date(AT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  /** Put the autosave in a known state, the way a real save would. */
  const reportSaved = () =>
    mockRegistry.options('autosave').onStateChange({ status: 'saved', at: AT, message: null });

  const reportFailure = () =>
    mockRegistry
      .options('autosave')
      .onStateChange({ status: 'error', at: null, message: 'the disk is full' });

  it('mounts the menu into the header slot', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(mockRegistry.mounts.file.host).toBe(el('assist-mm-file-host'));
  });

  it('hands the menu the four map commands, each opening its own dialog', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const menu = mockRegistry.options('file');

    menu.onNew();
    expect(mockRegistry.handles.newMap.open).toHaveBeenCalled();

    menu.onOpen();
    expect(mockRegistry.handles.openMap.open).toHaveBeenCalled();

    menu.onSaveAs();
    expect(mockRegistry.handles.saveAs.open).toHaveBeenCalledWith('Essay plan');
  });

  it('tells the Open dialog which map is on screen, so it can be marked', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(mockRegistry.options('openMap').currentMapId).toBe('m1');
  });

  // A student who cannot see the status line pressed Save and heard nothing at all.
  it('says the save happened, rather than only showing it', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    reportSaved();

    key(document.body, { key: 's', ctrlKey: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalled();
    expect(spoken).toContain(spokenTime());
  });

  it('leaves a failed save to its toast rather than saying a time that never happened', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    reportFailure();

    key(document.body, { key: 's', ctrlKey: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(spoken).not.toContain('Saved Invalid Date');
    expect(el('assist-mm-toast').textContent).toBe(
      'Problem: this map could not be saved — the disk is full'
    );
  });

  // The page's keys are registry entries, so a student who cannot reach a chord can move it. The
  // remap is staged through the same module the page reads, which is the module the page got: the
  // page is imported fresh by `loadPage`, and this import lands in the same registry generation.
  it('saves on the key the student bound instead, and not on the one they replaced', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const { applySavedBindings, stopWatchingBindings } = await import(
      '../../../../src/pages/mind-map/shortcut-bindings.js'
    );
    applySavedBindings({ mm_save: 'Alt+K' });

    key(document.body, { key: 's', ctrlKey: true });
    expect(mockRegistry.handles.autosave.saveNow).not.toHaveBeenCalled();

    key(document.body, { key: 'k', code: 'KeyK', altKey: true });
    expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalled();

    stopWatchingBindings();
  });

  it('opens the save-as dialog on Ctrl+Shift+S, named after the map on screen', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    editorHistory().apply('setTitle', { title: 'Photosynthesis' });

    const event = pressAndRead(document.body, { key: 'S', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mockRegistry.handles.saveAs.open).toHaveBeenCalledWith('Photosynthesis');
    expect(mockRegistry.handles.autosave.saveNow).not.toHaveBeenCalled();
  });

  it('opens the map list on Ctrl+O', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    const event = pressAndRead(document.body, { key: 'o', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mockRegistry.handles.openMap.open).toHaveBeenCalled();
  });

  /*
   * The two keys that put a modal on screen are quiet in three places: over a student who is
   * typing, over a dialog that is already up (a second showModal stacks, and the first still holds
   * its own Escape), and on the library, where there is no map and no dialog to open — taking the
   * browser's own Ctrl+O there would swallow it for nothing.
   */
  describe('the keys that open a dialog', () => {
    const OPENERS = [
      ['Ctrl+O', { key: 'o', ctrlKey: true }, 'openMap'],
      ['Ctrl+Shift+S', { key: 'S', ctrlKey: true, shiftKey: true }, 'saveAs'],
    ];

    it.each(OPENERS)('leaves %s to the field a student is typing in', async (_, init, handle) => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      const event = pressAndRead(el('assist-mm-title-input'), init);

      expect(event.defaultPrevented).toBe(false);
      expect(mockRegistry.handles[handle].open).not.toHaveBeenCalled();
    });

    it.each(OPENERS)('leaves %s alone while a dialog is already up', async (_, init, handle) => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const standing = document.createElement('dialog');
      standing.setAttribute('open', '');
      document.body.appendChild(standing);

      const event = pressAndRead(document.body, init);

      expect(event.defaultPrevented).toBe(false);
      expect(mockRegistry.handles[handle].open).not.toHaveBeenCalled();
      standing.remove();
    });

    it.each(OPENERS)(
      'leaves %s to the browser in the library, where no map is open',
      async (_, init) => {
        await loadPage();

        const event = pressAndRead(document.body, init);

        expect(event.defaultPrevented).toBe(false);
      }
    );
  });

  // A student who has just come back from an editor reaches for Ctrl+S out of habit. The key used
  // to be claimed and then dropped on the floor here, which looks exactly like a save that failed.
  it('answers Ctrl+S in the library rather than swallowing it', async () => {
    await loadPage();

    pressAndRead(document.body, { key: 's', ctrlKey: true });

    const sentence = 'Your maps save themselves. There is nothing to save here.';
    expect(spoken.filter(text => text === sentence)).toHaveLength(1);
    // Seen as well as said: a sighted student pressing Ctrl+S is watching the screen for an answer.
    expect(el('assist-mm-toast').hidden).toBe(false);
    expect(el('assist-mm-toast').textContent).toBe(sentence);
  });

  // Ctrl+S is claimed inside a text box, unlike Ctrl+Z and Ctrl+F: there is nothing a browser does
  // with it in a field, and a student part way through naming a node is exactly who reaches for it.
  it('saves from inside the title box as well', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    pressAndRead(el('assist-mm-title-input'), { key: 's', ctrlKey: true });
    await Promise.resolve();

    expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalled();
  });

  describe('leaving a map that has work only in memory', () => {
    let assign;
    let realLocation;

    beforeEach(() => {
      assign = jest.fn();
      realLocation = window.location;
      delete window.location;
      window.location = { search: '?map=m1', reload: jest.fn(), assign, href: '/mindmap.html' };
    });

    afterEach(() => {
      delete window.location;
      window.location = realLocation;
    });

    /** An autosave with work in memory that a save actually clears. */
    function withUnsavedWork() {
      let dirty = true;
      mockRegistry.handles.autosave.isDirty = () => dirty;
      mockRegistry.handles.autosave.saveNow = jest.fn(() => {
        dirty = false;
      });
    }

    it('writes the open map before starting a new one, and says it was created', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      withUnsavedWork();

      await mockRegistry.options('newMap').onCreate('blank', 'Something else');

      expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalled();
      expect(spoken).toContain('Created Something else.');
      expect(assign).toHaveBeenCalledWith(expect.stringContaining('?map='));
    });

    it('writes the open map before opening another', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      withUnsavedWork();

      await mockRegistry.options('openMap').onOpen('m2');

      expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith('?map=m2');
    });

    // A keystroke landing while the write is out is not in that write. The autosave reports no
    // error — it schedules a follow-up — so a page that only refused on 'error' navigated away
    // from the branch the student had just typed.
    it('stays on the map when a change arrived while the write was out', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      mockRegistry.handles.autosave.isDirty = () => true;
      mockRegistry.handles.autosave.saveNow = jest.fn();

      await mockRegistry.options('openMap').onOpen('m2');

      expect(mockRegistry.handles.autosave.saveNow).toHaveBeenCalledTimes(2);
      expect(assign).not.toHaveBeenCalled();
    });

    // A save that failed and a navigation that went ahead anyway is the branch the student wrote,
    // gone. The autosave has already said why; the page simply stays where it is.
    it('stays on the map when the save it needed did not happen', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      mockRegistry.handles.autosave.isDirty = () => true;
      mockRegistry.handles.autosave.saveNow = jest.fn(reportFailure);

      await mockRegistry.options('openMap').onOpen('m2');

      expect(assign).not.toHaveBeenCalled();
    });

    it('tells the save-as dialog why the copy was not made', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      mockRegistry.handles.autosave.isDirty = () => true;
      mockRegistry.handles.autosave.saveNow = jest.fn(reportFailure);

      await expect(mockRegistry.options('saveAs').onSaveAs('A copy')).rejects.toThrow(
        /changes that are not saved/
      );
      expect(assign).not.toHaveBeenCalled();
    });

    it('writes the copy as a map of its own and opens that', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      await mockRegistry.options('saveAs').onSaveAs('Essay plan, second draft');

      const opened = assign.mock.calls[0][0];
      expect(opened.startsWith('?map=')).toBe(true);
      expect(opened).not.toBe('?map=m1');
    });

    it('goes back to the library when the Open dialog asks', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      await mockRegistry.options('openMap').onGoToLibrary();

      expect(assign).toHaveBeenCalledWith('?');
    });
  });
});

/*
 * A file picked in the library and a file picked in the editor's File menu end here, in one
 * function. The library's own path had no busy state, no refusal for a second pick and a sentence
 * of its own that never mentioned the XMind sheets it had left behind (see `import-flow.js`); this
 * is the half the page owns — storing the map, and carrying the sentence over the navigation.
 */
describe('a file that became a map', () => {
  const SENTENCE =
    "Opened 'Cells', the first of 2 sheets, from XMind: 1 node. The other sheet was not imported.";

  let assign;
  let realLocation;

  beforeEach(() => {
    assign = jest.fn();
    realLocation = window.location;
    delete window.location;
    window.location = { search: '', reload: jest.fn(), assign, href: '/mindmap.html' };
    window.sessionStorage.clear();
  });

  afterEach(() => {
    delete window.location;
    window.location = realLocation;
    window.sessionStorage.clear();
  });

  /** The one hook both surfaces are handed; the library and the editor are two loads of the page. */
  const openImported = (surface = 'library') => mockRegistry.options(surface).onImport;

  it('reaches the same ending from the File menu as from the library', async () => {
    window.location.search = '?map=m1';
    await loadPage({ search: '?map=m1', map: makeMap() });

    await openImported('file')(makeMap(), SENTENCE);

    // A copy of the open map, arriving as a file, is still a new map: never over the one on screen.
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toMatch(/^\?map=/);
    expect(assign.mock.calls[0][0]).not.toBe('?map=m1');
    expect(window.sessionStorage.getItem('assist-mm-import-outcome')).toBe(SENTENCE);
  });

  it('is stored and opened', async () => {
    await loadPage();

    await openImported()(makeMap(), SENTENCE);

    expect(assign).toHaveBeenCalledWith(`?map=${makeMap().id}`);
  });

  // A JSON export carries the id of the map it came from, so importing one without this would
  // quietly write over that map.
  it('never lands on top of a map that is already here', async () => {
    const existing = makeMap();
    await loadPage({ map: existing });

    await openImported()(existing, SENTENCE);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).not.toBe(`?map=${existing.id}`);
    expect(mockRegistry.maps[existing.id]).toBe(existing);
  });

  it('says why in one sentence when the map read but would not store', async () => {
    await loadPage();
    mockRegistry.saveMap = async () => {
      throw new Error('the database is full');
    };

    await expect(openImported()(makeMap(), SENTENCE)).rejects.toThrow(
      "'Essay plan' was read but could not be saved: the database is full"
    );
    expect(assign).not.toHaveBeenCalled();
  });

  /*
   * The sentence used to be announced into a document that `location.assign` replaced a moment
   * later, with no toast at all: the last thing on screen said "Opening Biology.xmind…" and the
   * two sheets left behind were never mentioned to anybody. It travels with the navigation now.
   */
  it('says what came in once the editor is up, and says it once', async () => {
    await loadPage();
    await openImported()(makeMap(), SENTENCE);

    window.location.search = '?map=m1';
    spoken = [];
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(el('assist-mm-toast').hidden).toBe(false);
    expect(el('assist-mm-toast').textContent).toBe(SENTENCE);
    expect(spoken.filter(line => line === SENTENCE)).toEqual([SENTENCE]);
  });

  it('does not say it again on the next load', async () => {
    await loadPage();
    await openImported()(makeMap(), SENTENCE);

    window.location.search = '?map=m1';
    await loadPage({ search: '?map=m1', map: makeMap() });
    spoken = [];
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(spoken).not.toContain(SENTENCE);
    expect(el('assist-mm-toast').hidden).toBe(true);
  });

  // The sentence is about a map on screen. Landing back on the library means no map opened, and a
  // sentence kept for later would turn up beside whichever map was opened next.
  it('drops the sentence rather than keeping it for a map it is not about', async () => {
    await loadPage();
    await openImported()(makeMap(), SENTENCE);

    await loadPage();
    window.location.search = '?map=m1';
    spoken = [];
    await loadPage({ search: '?map=m1', map: makeMap() });

    expect(spoken).not.toContain(SENTENCE);
  });
});

describe('teardown', () => {
  it('destroys every pane exactly once when the page goes away', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    window.dispatchEvent(new window.Event('pagehide'));

    for (const name of [
      'outline',
      'canvas',
      'inspector',
      'file',
      'newMap',
      'openMap',
      'saveAs',
      'ai',
      'read',
      'study',
      'autosave',
      'shortcuts',
    ]) {
      expect(mockRegistry.handles[name].destroy).toHaveBeenCalledTimes(1);
    }
  });

  it('survives a second pagehide without destroying anything twice', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });

    window.dispatchEvent(new window.Event('pagehide'));
    window.dispatchEvent(new window.Event('pagehide'));

    expect(mockRegistry.handles.canvas.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the library view too', async () => {
    await loadPage();

    window.dispatchEvent(new window.Event('pagehide'));

    expect(mockRegistry.handles.library.destroy).toHaveBeenCalledTimes(1);
    expect(mockRegistry.handles.shortcuts.destroy).toHaveBeenCalledTimes(1);
  });

  // `pagehide` fires on the way INTO the back/forward cache; coming back out is `pageshow` with
  // `persisted`. The restored DOM looks like a working editor and is not one — every pane was
  // unsubscribed on the way in — so the page loads again rather than showing a corpse.
  describe('coming back from the back/forward cache', () => {
    let reload;
    let realLocation;

    beforeEach(() => {
      reload = jest.fn();
      realLocation = window.location;
      delete window.location;
      window.location = { search: '', reload, assign: jest.fn(), href: '/mindmap.html' };
    });

    afterEach(() => {
      delete window.location;
      window.location = realLocation;
    });

    const pageshow = persisted =>
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted }));

    it('loads the page again when the editor was torn down', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      window.dispatchEvent(new window.Event('pagehide'));

      pageshow(true);

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('leaves a live page alone on the ordinary first pageshow', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      pageshow(false);

      expect(reload).not.toHaveBeenCalled();
    });

    it('leaves a restored page alone when nothing was torn down', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      pageshow(true);

      expect(reload).not.toHaveBeenCalled();
    });
  });
});

describe('the page with several nodes selected', () => {
  const store = () => mockRegistry.options('outline').selection;

  it('deletes the whole selection from the toolbar, as one undo step', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    store().selectAll(['ev', 'counter'], { source: 'outline' });

    activate(el('assist-mm-delete'));

    expect(history.current().nodes.ev).toBeUndefined();
    expect(history.current().nodes.counter).toBeUndefined();
    expect(spoken).toContain('Deleted 2 nodes. Press Ctrl+Z to undo');

    history.undo();
    expect(history.current().nodes.ev).toBeDefined();
    expect(history.current().nodes.counter).toBeDefined();
  });

  it('still offers Delete when the centre is only part of the selection', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    store().selectAll([ROOT_ID, 'arg'], { source: 'outline' });

    expect(el('assist-mm-delete').getAttribute('aria-disabled')).toBe('false');

    activate(el('assist-mm-delete'));

    expect(editorHistory().current().nodes[ROOT_ID]).toBeDefined();
    expect(editorHistory().current().nodes.arg).toBeUndefined();
    expect(spoken).toContain(
      "Deleted 'Argument' and 2 children. The centre stays where it is. Press Ctrl+Z to undo"
    );
  });

  it('refuses Delete only when the centre is the whole of the selection', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    store().set(ROOT_ID, { source: 'outline' });

    expect(el(`assist-mm-delete-why`).textContent).toBe('The centre of the map cannot be deleted.');
  });

  it('adds a node beside the primary alone, and says nothing about the rest', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.handles.outline.addNode = jest.fn(() => null);
    store().selectAll(['ev', 'counter'], { source: 'outline' });
    const primary = store().get();
    spoken.length = 0;

    activate(el('assist-mm-new-child'));

    expect(mockRegistry.handles.outline.addNode).toHaveBeenCalledWith(primary, {
      asChild: true,
      openEditor: true,
    });
    expect(spoken).toEqual([]);
  });

  it('says the count once when a burst of Shift presses settles', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    spoken.length = 0;

    store().selectAll(['ev'], { source: 'outline' });
    store().selectAll(['ev', 'counter'], { source: 'outline' });
    store().selectAll(['ev', 'counter', 'src'], { source: 'outline' });
    expect(spoken).toEqual([]);

    jest.advanceTimersByTime(200);
    expect(spoken).toEqual(['3 nodes selected.']);
  });

  it('names the node that is left when the set collapses to one', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    store().selectAll(['ev', 'counter'], { source: 'outline' });
    jest.advanceTimersByTime(200);
    spoken.length = 0;

    store().clearToPrimary({ source: 'outline' });
    jest.advanceTimersByTime(200);

    expect(spoken).toEqual(["1 node selected: 'Evidence'."]);
  });

  it('says nothing at all while the student is moving from row to row', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    spoken.length = 0;

    store().set('ev', { source: 'outline' });
    store().set('counter', { source: 'outline' });
    jest.advanceTimersByTime(200);

    expect(spoken).toEqual([]);
  });

  it('leaves the count unsaid when the act that moved the selection has spoken', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    store().selectAll(['ev', 'counter'], { source: 'outline' });
    jest.advanceTimersByTime(200);
    spoken.length = 0;

    // What the outline pane does after a delete: it has its own sentence for what happened.
    store().set('arg', { source: 'outline', said: true });
    jest.advanceTimersByTime(200);

    expect(spoken).toEqual([]);
  });
});

/**
 * Which controls the page's own keys are kept out of.
 *
 * "A text field" used to mean every `input` on the page, so undo, redo, search, Alt+M and the
 * dialogs all went dead while the keyboard was on a colour radio or the Done tick — which is exactly
 * where a student stands when they have just changed something and want it back. A radio has no text
 * to undo and no search to run: the page's keys are the only thing those keys could mean there.
 */
describe('the page keys and the control the keyboard is on', () => {
  /** A control of a given kind, put where the panes put theirs. @returns {HTMLElement} */
  const addControl = (tag, type) => {
    const element = document.createElement(tag);
    if (type) {
      element.type = type;
    }
    if (tag === 'select') {
      const option = document.createElement('option');
      option.textContent = 'One';
      element.appendChild(option);
    }
    el('assist-mm-inspector-host').appendChild(element);
    return element;
  };

  it('undoes and redoes from a radio, a tick, a button, a select and a slider', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    const controls = [
      addControl('input', 'radio'),
      addControl('input', 'checkbox'),
      addControl('button'),
      addControl('select'),
      addControl('input', 'range'),
    ];

    for (const control of controls) {
      history.apply('setText', { id: 'arg', text: `Reworded for ${control.tagName}` });
      control.focus();

      const undone = pressAndRead(control, { key: 'z', ctrlKey: true });
      expect({ on: control.type || control.tagName, prevented: undone.defaultPrevented }).toEqual({
        on: control.type || control.tagName,
        prevented: true,
      });
      expect(history.current().nodes.arg.text).toBe('Argument');

      // Both spellings of redo, from the same control.
      pressAndRead(control, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(history.current().nodes.arg.text).toBe(`Reworded for ${control.tagName}`);

      pressAndRead(control, { key: 'z', ctrlKey: true });
      expect(history.current().nodes.arg.text).toBe('Argument');
      pressAndRead(control, { key: 'y', ctrlKey: true });
      expect(history.current().nodes.arg.text).toBe(`Reworded for ${control.tagName}`);
    }
  });

  it('undoes a colour the student has just chosen, with the keyboard still on the radio', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    // What the Details panel does, and where the keyboard is left afterwards: on the radio.
    const radio = addControl('input', 'radio');
    radio.focus();
    history.apply('setColour', { id: 'arg', colour: 2 });

    pressAndRead(radio, { key: 'z', ctrlKey: true });

    expect(history.current().nodes.arg.colour).toBeNull();
    expect(spoken).toContain('Undone');
  });

  it('still leaves Ctrl+Z, Ctrl+Y and Ctrl+F to a real text box', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const history = editorHistory();
    history.apply('setText', { id: 'arg', text: 'Argument, reworded' });
    const fields = [
      el('assist-mm-title-input'),
      el('assist-mm-find'),
      addControl('textarea'),
      addControl('input', 'email'),
      addControl('input', 'number'),
      addControl('input', 'date'),
      addControl('input', 'password'),
      addControl('input'),
    ];

    for (const field of fields) {
      field.focus();
      const on = field.type || field.tagName;
      expect({
        on,
        prevented: pressAndRead(field, { key: 'z', ctrlKey: true }).defaultPrevented,
      }).toEqual({ on, prevented: false });
      expect(pressAndRead(field, { key: 'y', ctrlKey: true }).defaultPrevented).toBe(false);
      expect(pressAndRead(field, { key: 'f', ctrlKey: true }).defaultPrevented).toBe(false);
    }

    expect(history.current().nodes.arg.text).toBe('Argument, reworded');
  });

  it('opens Help from a radio, and leaves the question mark to a select and a slider', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const radio = addControl('input', 'radio');
    const chooser = addControl('select');
    const slider = addControl('input', 'range');

    // A select answers a typed character with type-ahead and a slider answers the arrows; neither
    // has anything to do with a question mark the page wants for its own help.
    for (const control of [chooser, slider]) {
      control.focus();
      expect(pressAndRead(control, { key: '?' }).defaultPrevented).toBe(false);
      expect(mockRegistry.handles.shortcuts.open).not.toHaveBeenCalled();
    }

    radio.focus();
    expect(pressAndRead(radio, { key: '?' }).defaultPrevented).toBe(true);
    expect(mockRegistry.handles.shortcuts.open).toHaveBeenCalledTimes(1);
  });

  it('takes Alt+M and Ctrl+O from a radio, which holds nothing of the student’s', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const radio = addControl('input', 'radio');
    radio.focus();

    expect(pressAndRead(radio, { key: 'm', altKey: true }).defaultPrevented).toBe(true);
    expect(mockRegistry.handles.inspector.focusMoveTo).toHaveBeenCalledTimes(1);

    expect(pressAndRead(radio, { key: 'o', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(mockRegistry.handles.openMap.open).toHaveBeenCalledTimes(1);
  });
});

describe('Help and a dialog that is already open', () => {
  const openADialog = () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    return dialog;
  };

  it('opens nothing over a dialog that is already up, for either spelling of Help', () => {
    return loadPage({ search: '?map=m1', map: makeMap() }).then(() => {
      const dialog = openADialog();

      expect(pressAndRead(document.body, { key: '?' }).defaultPrevented).toBe(false);
      expect(pressAndRead(document.body, { key: '/', ctrlKey: true }).defaultPrevented).toBe(false);
      expect(mockRegistry.handles.shortcuts.open).not.toHaveBeenCalled();

      // And it is back the moment the dialog goes.
      dialog.remove();
      expect(pressAndRead(document.body, { key: '?' }).defaultPrevented).toBe(true);
      expect(mockRegistry.handles.shortcuts.open).toHaveBeenCalledTimes(1);
    });
  });

  it('still opens Help in the library, where there is no map to guard', async () => {
    await loadPage({ search: '' });

    expect(pressAndRead(document.body, { key: '?' }).defaultPrevented).toBe(true);
    expect(mockRegistry.handles.shortcuts.open).toHaveBeenCalledTimes(1);
  });

  it('names an unnamed node rather than quoting nothing in the count', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    const store = mockRegistry.options('outline').selection;
    editorHistory().apply('setText', { id: 'ev', text: '' });
    store.selectAll(['ev', 'counter'], { source: 'outline' });
    jest.advanceTimersByTime(200);
    spoken.length = 0;

    store.set('ev', { source: 'outline' });
    jest.advanceTimersByTime(200);

    expect(spoken).toEqual(["1 node selected: '(untitled)'."]);
  });
});

describe('focus mode', () => {
  /** The `mountBranchFocus` handle, reached the way the Details panel is given it. */
  const branchFocus = () => mockRegistry.options('inspector').branchFocus;

  /** The map each pane is drawing from. */
  const drawnBy = name => mockRegistry.options(name).history.current();

  /** The whole map, as the Details panel and the File menu are given it. */
  const wholeMap = () => mockRegistry.options('inspector').history.current();

  const crumbs = () =>
    [...document.querySelectorAll('.assist-mm-crumb')].map(control => control.textContent);

  /**
   * Open a map and focus on its one branch, the way a student does: select it, press the key.
   *
   * @returns {Promise<void>}
   */
  async function focusOnArg() {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.options('outline').selection.set('arg', { source: 'outline' });
    key(document.body, { key: 'F', code: 'KeyF', altKey: true, shiftKey: true });
  }

  it('gives the drawing panes the branch and the writing panes the whole map', async () => {
    await focusOnArg();

    for (const pane of ['outline', 'canvas', 'ai', 'read', 'study']) {
      expect(drawnBy(pane).rootId).toBe('arg');
    }
    // The Details panel edits the node and offers the WHOLE map as somewhere to move it to, and an
    // export is of the whole map whatever is on screen.
    for (const pane of ['inspector', 'file']) {
      expect(drawnBy(pane).rootId).toBe(ROOT_ID);
    }
  });

  it('shows only the branch, and the whole map again on the way out', async () => {
    await focusOnArg();

    expect(Object.keys(drawnBy('outline').nodes).sort()).toEqual(['arg', 'counter', 'ev']);

    key(document.body, { key: 'F', code: 'KeyF', altKey: true, shiftKey: true });

    expect(drawnBy('outline').rootId).toBe(ROOT_ID);
    expect(Object.keys(drawnBy('outline').nodes)).toHaveLength(5);
  });

  it('answers the key on a layout where Alt+Shift+F types another character', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.options('outline').selection.set('arg', { source: 'outline' });

    // macOS: Option+Shift+F produces a character, and nothing about `event.key` says F at all.
    key(document.body, { key: 'Ï', code: 'KeyF', altKey: true, shiftKey: true });

    expect(branchFocus().isOn()).toBe(true);
  });

  it('says what it did, and how to get back, on screen and aloud', async () => {
    await focusOnArg();

    expect(el('assist-mm-toast').textContent).toBe(
      "Focused on 'Argument': 3 nodes. Press Escape to see the whole map."
    );
    expect(spoken).toContain("Focused on 'Argument': 3 nodes. Press Escape to see the whole map.");
  });

  it('refuses the centre in words and does not enter', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    spoken.length = 0;

    key(document.body, { key: 'F', code: 'KeyF', altKey: true, shiftKey: true });

    expect(branchFocus().isOn()).toBe(false);
    expect(el('assist-mm-toast').textContent).toBe(
      'Focusing the centre would show the whole map, which is what you are looking at.'
    );
  });

  it('leaves the key to a text box, and to a dialog already on screen', async () => {
    await loadPage({ search: '?map=m1', map: makeMap() });
    mockRegistry.options('outline').selection.set('arg', { source: 'outline' });

    const typed = pressAndRead(el('assist-mm-find'), {
      key: 'F',
      code: 'KeyF',
      altKey: true,
      shiftKey: true,
    });

    expect(typed.defaultPrevented).toBe(false);
    expect(branchFocus().isOn()).toBe(false);

    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    const underModal = pressAndRead(document.body, {
      key: 'F',
      code: 'KeyF',
      altKey: true,
      shiftKey: true,
    });

    expect(underModal.defaultPrevented).toBe(false);
    expect(branchFocus().isOn()).toBe(false);
    dialog.remove();
  });

  describe('the toolbar button', () => {
    it('is pressed while a branch is on screen, and says why it cannot act', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const button = el('assist-mm-focus');

      // The visible word is short, as every button on this strip is; the NAME says what it does —
      // the glyph is `aria-hidden`, so it is not part of it.
      const named = [...button.childNodes]
        .filter(child => child.nodeType !== 1 || child.getAttribute('aria-hidden') !== 'true')
        .map(child => child.textContent)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      expect(named).toBe('Focus on this branch');
      // The centre is what a fresh map selects, so the reason is there to be read.
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.hasAttribute('disabled')).toBe(false);
      expect(el('assist-mm-focus-why').textContent).toBe(
        'Focusing the centre would show the whole map, which is what you are looking at.'
      );

      activate(button);
      expect(branchFocus().isOn()).toBe(false);
      expect(el('assist-mm-toast').textContent).toBe(
        'Focusing the centre would show the whole map, which is what you are looking at.'
      );

      mockRegistry.options('outline').selection.set('arg', { source: 'outline' });
      expect(button.getAttribute('aria-disabled')).toBe('false');
      expect(el('assist-mm-focus-why').textContent).toBe('');

      activate(button);
      expect(branchFocus().isOn()).toBe(true);
      expect(button.getAttribute('aria-pressed')).toBe('true');

      activate(button);
      expect(branchFocus().isOn()).toBe(false);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    it('leaves the toolbar with one tab stop', async () => {
      await focusOnArg();
      const toolbar = document.querySelector('[role="toolbar"]');

      const stops = [...toolbar.querySelectorAll('button, select')].filter(
        control => control.tabIndex === 0
      );

      expect(stops).toHaveLength(1);
    });
  });

  it('fits the picture again on the way in and on the way out', async () => {
    await focusOnArg();

    expect(mockRegistry.handles.canvas.fitToView).toHaveBeenCalledTimes(1);

    branchFocus().leave();

    expect(mockRegistry.handles.canvas.fitToView).toHaveBeenCalledTimes(2);
  });

  describe('the breadcrumb', () => {
    it('walks back to the centre, the step the student is on not a button', async () => {
      await focusOnArg();
      const nav = document.querySelector('nav[aria-label="Focused branch"]');

      expect(nav.hidden).toBe(false);
      expect(crumbs()).toEqual(['Essay plan', 'Argument']);
      expect(nav.querySelector('[aria-current="location"]').textContent).toBe('Argument');
      expect(nav.querySelectorAll('button')).toHaveLength(1);
    });

    it('is away while the whole map is on screen', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });

      expect(document.querySelector('nav[aria-label="Focused branch"]').hidden).toBe(true);
    });
  });

  describe('Escape', () => {
    it('brings the whole map back when nothing nearer has claimed it', async () => {
      await focusOnArg();

      const event = pressAndRead(document.body, { key: 'Escape' });

      expect(event.defaultPrevented).toBe(true);
      expect(branchFocus().isOn()).toBe(false);
      expect(spoken).toContain('Showing the whole map.');
    });

    it('does nothing when something nearer the student has already claimed it', async () => {
      await focusOnArg();
      // What an outline row that dropped a set, or a dock going back to Details, leaves behind.
      const claimed = new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      claimed.preventDefault();
      document.body.dispatchEvent(claimed);

      expect(branchFocus().isOn()).toBe(true);
    });

    it('is the step the outline takes before leaving the pane', async () => {
      await focusOnArg();

      expect(mockRegistry.options('outline').onEscape()).toBe(true);
      expect(branchFocus().isOn()).toBe(false);
      // Nothing to unwind now, so the outline may leave itself.
      expect(mockRegistry.options('outline').onEscape()).toBe(false);
    });
  });

  describe('the find box', () => {
    it('counts the branch, and says how many are outside it', async () => {
      await focusOnArg();
      spoken.length = 0;

      typeInto(el('assist-mm-find'), 'e');
      jest.advanceTimersByTime(300);

      // 'Argument', 'Evidence' and 'Counterpoint' are in the branch; 'Essay plan' and 'Sources'
      // are the two that are not.
      expect(spoken).toEqual([
        '3 matches for "e" in this branch. Press Enter to go to the first. 2 more are outside it: ' +
          'press Escape to see the whole map.',
      ]);
    });

    it('offers the rest of the map when the branch holds no match', async () => {
      await focusOnArg();
      spoken.length = 0;

      typeInto(el('assist-mm-find'), 'sources');
      jest.advanceTimersByTime(300);

      expect(spoken).toEqual([
        'No node in this branch matches "sources". 1 more is outside it: press Escape to see the ' +
          'whole map.',
      ]);
    });
  });

  describe('a change outside the branch', () => {
    it('says so, rather than leaving Ctrl+Z looking broken', async () => {
      await focusOnArg();
      editorHistory().apply('setText', { id: 'src', text: 'Reading list' });
      spoken.length = 0;

      key(document.body, { key: 'z', ctrlKey: true });

      expect(el('assist-mm-toast').textContent).toBe('Undone: a change outside this branch.');
      expect(spoken).toContain('Undone: a change outside this branch.');
      // The map really did change back — which is the whole reason the sentence has to be said.
      expect(wholeMap().nodes.src.text).toBe('Sources');
    });

    it('says only "Undone" when the change was in the branch', async () => {
      await focusOnArg();
      editorHistory().apply('setText', { id: 'ev', text: 'The evidence' });
      spoken.length = 0;

      key(document.body, { key: 'z', ctrlKey: true });

      expect(spoken).toEqual(['Undone']);
    });

    it('says the branch has gone when an undo takes it away', async () => {
      await loadPage({ search: '?map=m1', map: makeMap() });
      const history = editorHistory();
      history.apply('addChild', { parentId: ROOT_ID, node: { id: 'third', text: 'Third' } });
      mockRegistry.options('outline').selection.set('third', { source: 'outline' });
      key(document.body, { key: 'F', code: 'KeyF', altKey: true, shiftKey: true });
      spoken.length = 0;

      key(document.body, { key: 'z', ctrlKey: true });

      expect(branchFocus().isOn()).toBe(false);
      expect(el('assist-mm-toast').textContent).toBe(
        "'Third' is no longer here, so this is the whole map again."
      );
      // Not said twice: "Undone" over the top of it would bury the half that matters.
      expect(spoken).toEqual(["'Third' is no longer here, so this is the whole map again."]);
    });
  });

  describe('what the toolbar refuses inside a branch', () => {
    it('will not delete the top of the branch, and says so in those words', async () => {
      await focusOnArg();

      expect(el('assist-mm-delete-why').textContent).toBe(
        'The top of this branch cannot be deleted from inside it. Press Escape to see the whole map.'
      );
      activate(el('assist-mm-delete'));
      expect(editorHistory().current().nodes.arg).toBeDefined();
    });

    it('will not add a sibling beside it either, and says to add a child instead', async () => {
      await focusOnArg();

      expect(el('assist-mm-new-sibling-why').textContent).toBe(
        'The top of this branch has no siblings here, so add a child instead.'
      );
    });

    it('deletes a node inside the branch as it always did', async () => {
      await focusOnArg();
      mockRegistry.options('outline').selection.set('ev', { source: 'outline' });
      spoken.length = 0;

      activate(el('assist-mm-delete'));

      expect(editorHistory().current().nodes.ev).toBeUndefined();
      expect(spoken).toContain("Deleted 'Evidence'. Press Ctrl+Z to undo");
    });
  });

  it('is taken down with the rest of the page', async () => {
    await focusOnArg();

    window.dispatchEvent(new window.Event('pagehide'));

    expect(document.querySelector('nav[aria-label="Focused branch"]')).toBeNull();
  });
});
