/**
 * @jest-environment jsdom
 *
 * Canvas pane.
 *
 * jsdom has no SVG geometry — no `getScreenCTM`, no `getBBox` — so d3 reads a pointer's position
 * straight from `clientX`/`clientY`. With the view's own transform out of the sum, a client
 * coordinate IS a layout coordinate here, and a drag can be played through the mounted pane:
 * mousedown on the node, mousemove and mouseup on the window, which is where d3-drag listens.
 * What that cannot show is the conversion from a zoomed screen to the layout, which is d3's own.
 *
 * Everything else — the picture, the selection round trip, the collapse toggles, the inline editor
 * and the announcements — is the pane's contract with the outline pane, and is asserted here.
 */

import { createMap } from '../../../../src/features/mindMap/core/map-model.js';
import {
  addChild,
  removeNode,
  toggleCollapsed,
} from '../../../../src/features/mindMap/core/map-ops.js';
import { mountBranchFocus } from '../../../../src/pages/mind-map/branch-focus.js';
import { mountCanvasPane } from '../../../../src/pages/mind-map/canvas-pane.js';
import fs from 'node:fs';
import path from 'node:path';

import {
  ROOT_ID,
  activate,
  createSelectionStub,
  makeHistory,
  makeMap,
  mouse,
  press,
} from './pane-fixtures.js';

/**
 * One button of the zoom cluster, by its accessible name.
 *
 * The two zoom controls carry a glyph and an `aria-label`; Fit's whole label is the word. Looking
 * the buttons up by the name a screen reader would read is the honest way to find them either way.
 */
const zoomButton = (host, label) =>
  [...host.querySelectorAll('.mm-canvas__zoomButton')].find(
    element => (element.getAttribute('aria-label') || element.textContent) === label
  );

const nodeGroup = (host, id) => host.querySelector(`.mm-node[data-node-id="${id}"]`);
const nodeIds = host => [...host.querySelectorAll('.mm-node')].map(g => g.dataset.nodeId);

/** Where a node's box sits in the view, once the pan and the zoom have been applied. */
function centreOnScreen(host, pane, id) {
  const box = nodeGroup(host, id).querySelector('rect.mm-node__box');
  const x = Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2;
  const y = Number(box.getAttribute('y')) + Number(box.getAttribute('height')) / 2;
  const transform = pane
    .getSvgElement()
    .querySelector('.mm-canvas__viewport')
    .getAttribute('transform');
  const [, tx, ty, k] = transform.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
  return { x: Number(tx) + Number(k) * x, y: Number(ty) + Number(k) * y };
}

/** The pane is 900x600 in jsdom (the fallback the module uses when nothing has been laid out). */
const VIEW_CENTRE = { x: 450, y: 300 };

describe('canvas pane — the picture', () => {
  let host;
  let history;
  let selection;
  let announce;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    announce = jest.fn();
    pane = mountCanvasPane(host, { history, selection, announce });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  it('is one labelled image, because the outline is the accessible editor', () => {
    const svg = pane.getSvgElement();
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe(
      'Map canvas, 5 nodes; the outline pane is the keyboard editor'
    );
  });

  it('draws a rounded box and the text for every visible node', () => {
    expect(nodeIds(host).sort()).toEqual([ROOT_ID, 'arg', 'counter', 'ev', 'src'].sort());
    const group = nodeGroup(host, 'arg');
    expect(group.querySelector('rect.mm-node__box').getAttribute('rx')).toBe('8');
    expect(group.querySelector('text.mm-node__text').textContent).toBe('Argument');
  });

  it('wraps long text into one tspan per line, matching the measured box', () => {
    history.apply('setText', {
      id: 'arg',
      text: 'The counterargument deserves a paragraph of its own here',
    });
    const spans = [...nodeGroup(host, 'arg').querySelectorAll('tspan')];
    expect(spans.length).toBeGreaterThan(1);
    spans.forEach(span => expect(span.textContent.length).toBeLessThanOrEqual(28));
  });

  it('fills a node from the resolved branch colour', () => {
    history.apply('setColour', { id: 'arg', colour: 3 });
    const fill = nodeGroup(host, 'arg').querySelector('rect.mm-node__box').getAttribute('fill');
    // Green, and inherited by the child that sets no colour of its own.
    expect(fill).toBe('#087d0c');
    expect(nodeGroup(host, 'ev').querySelector('rect.mm-node__box').getAttribute('fill')).toBe(
      '#087d0c'
    );
  });

  it('prefixes the first line with the symbol when one is set', () => {
    history.apply('setSymbol', { id: 'src', symbol: '📚' });
    expect(nodeGroup(host, 'src').querySelector('tspan').textContent).toBe('📚 Sources');
  });

  it('marks a node that carries a source and a node that is done', () => {
    history.apply('setSource', {
      id: 'src',
      source: { url: 'https://example.org/a', quote: '', title: '' },
    });
    history.apply('setDone', { id: 'counter', done: true });
    expect(nodeGroup(host, 'src').textContent).toContain('\u{1F517}');
    expect(nodeGroup(host, 'counter').textContent).toContain('✓');
  });

  it('draws one edge per parent-child link', () => {
    expect(host.querySelectorAll('path.mm-canvas__edge')).toHaveLength(4);
  });

  it('draws a cross-link as a dashed arrowed path with its label', () => {
    history.apply('addLink', { from: 'ev', to: 'src', label: 'supports' });
    const link = host.querySelector('path.mm-link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('marker-end')).toMatch(/^url\(#mm-link-arrow-\d+\)$/);
    expect(host.querySelector('text.mm-link__label').textContent).toBe('supports');
    expect(host.querySelector('marker path.mm-link__arrow')).not.toBeNull();
  });

  it('records the layout mode on the SVG so an export can match the screen', () => {
    expect(pane.getSvgElement().dataset.layoutMode).toBe('map');
  });
});

describe('canvas pane — selection', () => {
  let host;
  let history;
  let selection;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  it('selects the node the pointer pressed, naming the canvas as the source', () => {
    press(nodeGroup(host, 'ev'));
    expect(selection.get()).toBe('ev');
  });

  it('keeps the pressed node in the document, because the same press starts a drag', () => {
    // Re-rendering here would hand d3-drag an element that is no longer in the document, and the
    // node would refuse to move — the bug this assertion exists to catch.
    const before = nodeGroup(host, 'ev');
    press(before);
    expect(nodeGroup(host, 'ev')).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(before.classList.contains('mm-node--selected')).toBe(true);
  });

  it('marks a selection made anywhere with a ring as well as a heavier stroke', () => {
    selection.set('counter', { source: 'outline' });
    const group = nodeGroup(host, 'counter');
    expect(group.classList.contains('mm-node--selected')).toBe(true);
    expect(group.querySelector('rect.mm-node__ring')).not.toBeNull();
    expect(nodeGroup(host, 'ev').querySelector('rect.mm-node__ring')).toBeNull();
  });
});

describe('canvas pane — collapsing', () => {
  let host;
  let history;
  let announce;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    announce = jest.fn();
    pane = mountCanvasPane(host, { history, selection: createSelectionStub(), announce });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const toggleFor = id => host.querySelector(`button[data-toggle-for="${id}"]`);

  it('gives every parent a real button, not an SVG shape with a role painted on', () => {
    const toggle = toggleFor('arg');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse Argument');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggleFor('ev')).toBeNull();
  });

  it('collapses a branch, hides its children and announces how many went', () => {
    press(toggleFor('arg'));
    expect(history.current().nodes.arg.collapsed).toBe(true);
    expect(nodeIds(host)).not.toContain('ev');
    expect(announce).toHaveBeenCalledWith('Collapsed Argument, 2 hidden nodes');
  });

  it('shows the hidden count in the badge and offers to expand again', () => {
    press(toggleFor('arg'));
    expect(nodeGroup(host, 'arg').querySelector('text.mm-node__badgeText').textContent).toBe('2');
    const toggle = toggleFor('arg');
    expect(toggle.getAttribute('aria-label')).toBe('Expand Argument, 2 hidden nodes');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    press(toggle);
    expect(history.current().nodes.arg.collapsed).toBe(false);
    expect(nodeIds(host)).toContain('ev');
  });

  it('collapses from the keyboard as well as the pointer (SC 2.1.1)', () => {
    activate(toggleFor('arg'));

    expect(history.current().nodes.arg.collapsed).toBe(true);
    expect(announce).toHaveBeenCalledWith('Collapsed Argument, 2 hidden nodes');
  });

  it('keeps a 24 px target however far the map is zoomed out (SC 2.5.8)', () => {
    const sizeOf = id => {
      const toggle = toggleFor(id);
      return [parseFloat(toggle.style.width), parseFloat(toggle.style.height)];
    };
    const zoomOut = () => press(zoomButton(host, 'Zoom out'));

    expect(sizeOf('arg')).toEqual([24, 24]);

    zoomOut();
    zoomOut();
    zoomOut();

    // The badge shrinks with the picture; the thing a finger has to land on does not.
    expect(sizeOf('arg')).toEqual([24, 24]);
  });

  it('backs that size with a floor in the stylesheet, so CSS cannot undercut it', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../../src/pages/mind-map/canvas-pane.css'),
      'utf8'
    );
    const at = css.indexOf('.mm-canvas__toggle {');
    const rule = css.slice(at, css.indexOf('}', at));

    expect(rule).toContain('min-inline-size: 24px');
    expect(rule).toContain('min-block-size: 24px');
  });
});

describe('canvas pane — inline editor', () => {
  let host;
  let history;
  let announce;
  let notified;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    announce = jest.fn();
    // The page's `showToast`: the toast AND the live region. Separate from `announce` here so a
    // sentence that has to be seen cannot pass this suite by only being said.
    notified = jest.fn();
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce,
      notify: notified,
    });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const openOn = id => {
    nodeGroup(host, id).dispatchEvent(mouse('dblclick'));
    return host.querySelector('input.mm-canvas__editor');
  };

  it('opens a focusable input over the node, seeded with its text', () => {
    const input = openOn('src');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Sources');
    expect(input.getAttribute('aria-label')).toBe('Node text');
    expect(document.activeElement).toBe(input);
  });

  it('commits on Enter', () => {
    const input = openOn('src');
    input.value = 'Reading list';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(history.current().nodes.src.text).toBe('Reading list');
    expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
  });

  it('commits on blur', () => {
    const input = openOn('src');
    input.value = 'Bibliography';
    input.dispatchEvent(new window.FocusEvent('blur'));
    expect(history.current().nodes.src.text).toBe('Bibliography');
  });

  // A node with no name is a blank box here and an empty line in every export. The outline's
  // editor refuses one on every way out, and this is the other editor there is.
  describe('a name that was emptied', () => {
    const leave = {
      Enter: input =>
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      blur: input => input.dispatchEvent(new window.FocusEvent('blur')),
    };

    for (const [how, exit] of Object.entries(leave)) {
      for (const typed of ['', '   ']) {
        it(`is not committed on ${how} (${JSON.stringify(typed)}): the node keeps the name it had`, () => {
          const before = history.current();
          const input = openOn('src');
          input.value = typed;

          exit(input);

          expect(history.current()).toBe(before);
          expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
          expect(nodeGroup(host, 'src').querySelector('text.mm-node__text').textContent).toBe(
            'Sources'
          );
          // A repair the student did not ask for, so it is shown as well as said.
          expect(notified).toHaveBeenLastCalledWith("A node needs a name. Kept 'Sources'.");
          expect(announce).not.toHaveBeenCalledWith("A node needs a name. Kept 'Sources'.");
        });
      }
    }

    it('says nothing of the kind when a real name is committed', () => {
      const input = openOn('src');
      input.value = 'Reading list';

      leave.Enter(input);

      expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('needs a name'));
    });
  });

  /**
   * A re-render arrives from outside the editor all the time: an AI generation landing, a change
   * from another tab, an autosave round trip, undo from the toolbar. Every one of them used to take
   * the input away with whatever the student had typed in it, silently. The outline pane carries
   * its value and caret across the same event, and so does this.
   */
  describe('a re-render while the editor is open', () => {
    /** Where the overlay has put the input, and where the node's box now is on screen. */
    const placed = input => ({
      left: parseFloat(input.style.left),
      top: parseFloat(input.style.top),
    });
    const boxOnScreen = id => {
      const box = nodeGroup(host, id).querySelector('rect.mm-node__box');
      const transform = pane
        .getSvgElement()
        .querySelector('.mm-canvas__viewport')
        .getAttribute('transform');
      const [, tx, ty, k] = transform.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
      return {
        left: Number(tx) + Number(k) * Number(box.getAttribute('x')),
        top: Number(ty) + Number(k) * Number(box.getAttribute('y')),
      };
    };

    it('keeps the typed name, the caret and the keyboard, and follows the node', () => {
      const input = openOn('src');
      input.value = 'Reading list';
      input.setSelectionRange(7, 7);
      const before = placed(input);

      // Somebody else's change: a branch arrives beside the node being named, which moves it.
      history.apply('addChild', { parentId: ROOT_ID, node: { id: 'x1', text: 'Extra evidence' } });

      const after = host.querySelector('input.mm-canvas__editor');
      // The same element, so a composition in progress is never interrupted (IME safety).
      expect(after).toBe(input);
      expect(after.isConnected).toBe(true);
      expect(document.activeElement).toBe(after);
      expect(after.value).toBe('Reading list');
      expect(after.selectionStart).toBe(7);
      expect(after.selectionEnd).toBe(7);

      // Moved to where the node is now, not left over the box it used to sit on.
      expect(placed(after)).not.toEqual(before);
      expect(placed(after).left).toBeCloseTo(boxOnScreen('src').left, 3);
      expect(placed(after).top).toBeCloseTo(boxOnScreen('src').top, 3);

      // And it still commits to the node it was opened on.
      after.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(history.current().nodes.src.text).toBe('Reading list');
    });

    it('survives an undo and a redo of a step it had nothing to do with', () => {
      history.apply('setText', { id: 'arg', text: 'Argument one' });
      const input = openOn('src');
      input.value = 'Half typed';
      input.setSelectionRange(4, 9);

      history.undo();
      expect(host.querySelector('input.mm-canvas__editor')).toBe(input);
      expect(input.value).toBe('Half typed');

      history.redo();
      const after = host.querySelector('input.mm-canvas__editor');
      expect(after).toBe(input);
      expect(after.value).toBe('Half typed');
      expect(after.selectionStart).toBe(4);
      expect(after.selectionEnd).toBe(9);
      expect(document.activeElement).toBe(after);
    });

    // A branch going takes its collapse button with it, which puts the input out of order among
    // the overlay's children — and an element moved inside its parent leaves the document for an
    // instant, dropping the keyboard and the caret with it.
    it('holds the keyboard and the caret when a branch beside it is removed', () => {
      const input = openOn('src');
      input.value = 'Reading list';
      input.setSelectionRange(2, 5);

      history.apply('removeNode', { id: 'arg' });

      const after = host.querySelector('input.mm-canvas__editor');
      expect(after).toBe(input);
      expect(document.activeElement).toBe(after);
      expect(after.value).toBe('Reading list');
      expect(after.selectionStart).toBe(2);
      expect(after.selectionEnd).toBe(5);
      expect(host.querySelectorAll('.mm-canvas__toggle')).toHaveLength(1);
    });

    it('says so, once, when the node being named is taken away', () => {
      const input = openOn('src');
      input.value = 'Reading list';

      history.apply('removeNode', { id: 'src' });

      expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
      expect(announce).toHaveBeenLastCalledWith('The node you were naming was removed.');
      expect(
        announce.mock.calls.filter(call => call[0] === 'The node you were naming was removed.')
      ).toHaveLength(1);
      // Nothing was committed anywhere: the node is gone and the typed name went with it.
      expect(Object.values(history.current().nodes).map(node => node.text)).not.toContain(
        'Reading list'
      );
    });

    // A fold from another pane is not a reason to lose the name the student was part way through
    // typing: the field has nowhere to sit any more, but the words are theirs.
    it('keeps what was typed when the node being named goes behind a collapse', () => {
      const input = openOn('ev');
      input.value = 'Half typed';

      history.apply('toggleCollapsed', { id: 'arg' });

      expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
      expect(history.current().nodes.ev.text).toBe('Half typed');
      expect(announce).toHaveBeenLastCalledWith(
        "Kept 'Half typed'. It is inside a folded branch now."
      );
      expect(announce.mock.calls.filter(call => /folded branch/.test(call[0]))).toHaveLength(1);

      // One undo step of its own, so Ctrl+Z takes back the name and leaves the fold alone.
      history.undo();
      expect(history.current().nodes.ev.text).toBe('Evidence');
      expect(history.current().nodes.arg.collapsed).toBe(true);
    });

    it('says so, and commits nothing, when the hidden node had been emptied', () => {
      const input = openOn('ev');
      input.value = '';

      history.apply('toggleCollapsed', { id: 'arg' });

      expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
      expect(announce).toHaveBeenLastCalledWith('The node you were naming is hidden now.');
      expect(history.current().nodes.ev.text).toBe('Evidence');
      expect(history.canRedo()).toBe(false);
    });

    // Keeping a name that had not changed costs no undo step, so nothing re-draws the picture:
    // this pass has to finish the fold itself rather than leave the hidden row on screen.
    it('draws the fold even when the name it kept had not changed', () => {
      const input = openOn('ev');
      input.value = 'Evidence';

      history.apply('toggleCollapsed', { id: 'arg' });

      expect(host.querySelector('[data-node-id="ev"]')).toBeNull();
      expect(
        host.querySelector('.mm-canvas__toggle[data-toggle-for="arg"]').getAttribute('aria-label')
      ).toContain('Expand');
      expect(announce).toHaveBeenLastCalledWith(
        "Kept 'Evidence'. It is inside a folded branch now."
      );

      // The fold is the only step there was: retyping the same name is not an edit.
      history.undo();
      expect(history.current().nodes.arg.collapsed).toBe(false);
    });
  });

  it('abandons the edit on Escape, leaving no undo step behind', () => {
    const input = openOn('src');
    input.value = 'Discarded';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(history.current().nodes.src.text).toBe('Sources');
    expect(history.canUndo()).toBe(false);
    expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
  });

  it('keeps every keystroke to itself, so the page cannot undo the map under the caret', () => {
    const input = openOn('src');
    const seen = [];
    const listener = event => seen.push(event.key);
    document.addEventListener('keydown', listener);

    for (const key of ['z', 'y', 'f']) {
      input.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })
      );
    }
    document.removeEventListener('keydown', listener);

    // Ctrl+Z here has to put back the word the student just deleted, not a step off the map; the
    // page's own handler owns those keys everywhere the editor is not.
    expect(seen).toEqual([]);
  });
});

describe('canvas pane — view controls', () => {
  let host;
  let history;
  let announce;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    announce = jest.fn();
    pane = mountCanvasPane(host, { history, selection: createSelectionStub(), announce });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const button = label => zoomButton(host, label);

  it('offers zoom and fit as named buttons in a labelled group', () => {
    expect(host.querySelector('.mm-canvas__zoom').getAttribute('aria-label')).toBe('Canvas view');
    expect(['Zoom in', 'Zoom out', 'Fit'].every(label => Boolean(button(label)))).toBe(true);
  });

  // The toolbar used to carry a second Fit control. This is the only one now, so it carries the
  // page's id: one target for the wiring, the shortcuts help and the end-to-end spec alike.
  it('is where Fit lives, under the page id', () => {
    expect(button('Fit').id).toBe('assist-mm-fit');
  });

  // The glyphs on the two zoom buttons are decoration; the name is on the button.
  it('names the zoom controls in words rather than by their glyph', () => {
    expect(button('Zoom in').textContent).toBe('+');
    expect(button('Zoom out').textContent).toBe('−');
    expect(button('Zoom in').querySelector('[aria-hidden="true"]')).not.toBe(null);
  });

  it('shows the scale as text between the two zoom controls', () => {
    const level = host.querySelector('.mm-canvas__zoomLevel');
    expect(level.textContent).toBe('100%');
    // Read by the eye only: every change is already spoken through the live region.
    expect(level.getAttribute('aria-hidden')).toBe('true');

    press(button('Zoom in'));

    expect(level.textContent).toBe('130%');
  });

  it('announces the new scale when the student zooms', () => {
    press(button('Zoom in'));
    expect(announce).toHaveBeenCalledWith('Zoom 130 per cent');
    press(button('Zoom out'));
    expect(announce).toHaveBeenLastCalledWith('Zoom 100 per cent');
  });

  it('keeps the zoom transform across a re-render', () => {
    press(button('Zoom in'));
    const viewport = pane.getSvgElement().querySelector('.mm-canvas__viewport');
    const before = viewport.getAttribute('transform');
    expect(before).toContain('scale(1.3)');

    history.apply('setText', { id: 'src', text: 'Reading list' });
    expect(viewport.getAttribute('transform')).toBe(before);
  });

  it('announces a fit', () => {
    press(button('Fit'));
    expect(announce).toHaveBeenCalledWith('Fitted the whole map into the view');
  });

  it('answers the keyboard on every view control (SC 2.1.1)', () => {
    activate(button('Zoom in'));
    expect(announce).toHaveBeenCalledWith('Zoom 130 per cent');

    activate(button('Fit'));
    expect(announce).toHaveBeenLastCalledWith('Fitted the whole map into the view');
  });
});

describe('canvas pane — following a selection made elsewhere', () => {
  let host;
  let history;
  let selection;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const button = label => zoomButton(host, label);
  const centre = id => centreOnScreen(host, pane, id);

  it('pans an off-screen node into the middle when the outline selects it', () => {
    // Zoomed to 3x, a node on the far side of the root is well outside the view.
    for (let step = 0; step < 5; step += 1) {
      press(button('Zoom in'));
    }
    selection.set(ROOT_ID, { source: 'outline' });
    expect(centre('src').x).toBeLessThan(0 + 24);

    selection.set('src', { source: 'outline' });

    expect(centre('src').x).toBeCloseTo(VIEW_CENTRE.x, 3);
    expect(centre('src').y).toBeCloseTo(VIEW_CENTRE.y, 3);
  });

  it('makes the same move when the page asks for it by hand', () => {
    for (let step = 0; step < 5; step += 1) {
      press(button('Zoom in'));
    }
    selection.set(ROOT_ID, { source: 'outline' });

    pane.zoomTo('src');

    expect(centre('src').x).toBeCloseTo(VIEW_CENTRE.x, 3);
    expect(centre('src').y).toBeCloseTo(VIEW_CENTRE.y, 3);
  });

  it('leaves the view alone when the click was on the canvas itself', () => {
    for (let step = 0; step < 5; step += 1) {
      press(button('Zoom in'));
    }
    selection.set(ROOT_ID, { source: 'outline' });
    const before = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');

    selection.set('src', { source: 'canvas' });

    expect(
      pane.getSvgElement().querySelector('.mm-canvas__viewport').getAttribute('transform')
    ).toBe(before);
  });
});

/**
 * The picture is updated, not rebuilt.
 *
 * Every keystroke in the outline is a `setText` on the shared history, and the canvas used to
 * answer each one by throwing the whole picture away and drawing it again. A first attempt patched
 * the label only while the node's box stayed the same size — which, for a box sized from the
 * length of its text, is almost never: 18 of the 25 keystrokes in the name below rebuilt
 * everything. So the invariant is stated on an ordinary name, and on every kind of change: what is
 * on screen for a node belongs to that node for as long as the node is on screen.
 */
describe('canvas pane — the picture is updated, not rebuilt', () => {
  const NAME = 'Reading list for term two';

  let host;
  let history;
  let pane;
  let others;

  const mountOn = (element, over) =>
    mountCanvasPane(element, {
      history: over,
      selection: createSelectionStub(),
      announce: jest.fn(),
      reducedMotion: true,
    });

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    pane = mountOn(host, history);
    others = [];
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
    for (const other of others) {
      other.pane.destroy();
      other.host.remove();
    }
  });

  /** @returns {Map<string, Element>} the `<g>` drawn for every node, by node id. */
  const groups = () => new Map(nodeIds(host).map(id => [id, nodeGroup(host, id)]));

  /** Type a name the way the outline does: one `setText` per character. */
  function typeName(id, afterEach = () => {}) {
    let text = '';
    for (const character of NAME) {
      text += character;
      history.apply('setText', { id, text });
      afterEach(text);
    }
  }

  /**
   * Everything the student can see or press, as markup. The arrowhead's id is per pane by design,
   * so it is the one thing taken out before two panes are compared.
   */
  const picture = element =>
    [
      element.querySelector('.mm-canvas__viewport').outerHTML,
      element.querySelector('.mm-canvas__overlay').innerHTML,
    ]
      .join('\n')
      .replace(/mm-link-arrow-\d+/g, 'mm-link-arrow');

  /** What a pane mounted now, on the map as it stands, would draw. */
  function freshPicture() {
    const freshHost = document.createElement('div');
    document.body.appendChild(freshHost);
    const fresh = mountOn(freshHost, makeHistory(history.current()));
    others.push({ host: freshHost, pane: fresh });
    return picture(freshHost);
  }

  it('is typed into with a name long enough to change the size of its box', () => {
    const widths = new Set();
    typeName('src', () =>
      widths.add(nodeGroup(host, 'src').querySelector('rect.mm-node__box').getAttribute('width'))
    );

    // Otherwise the rest of this block would be proving something about a name pinned at the
    // layout's minimum width, which is how the defect got past its first test.
    expect(widths.size).toBeGreaterThan(5);
  });

  it('keeps every node group across every keystroke of an ordinary name', () => {
    const before = groups();

    typeName('src', text => {
      for (const [id, group] of before) {
        expect({ text, id, same: nodeGroup(host, id) === group }).toEqual({ text, id, same: true });
      }
    });
  });

  it('keeps the connectors and the collapse buttons as well', () => {
    const edges = [...host.querySelectorAll('.mm-canvas__edge')];
    const toggles = [...host.querySelectorAll('.mm-canvas__toggle')];

    typeName('src');

    expect([...host.querySelectorAll('.mm-canvas__edge')]).toEqual(edges);
    expect([...host.querySelectorAll('.mm-canvas__toggle')]).toEqual(toggles);
    edges.forEach((edge, at) => expect(host.querySelectorAll('.mm-canvas__edge')[at]).toBe(edge));
    toggles.forEach((toggle, at) =>
      expect(host.querySelectorAll('.mm-canvas__toggle')[at]).toBe(toggle)
    );
  });

  it('binds nothing again: a drag on a node is the one it was given when it was drawn', () => {
    const bound = [];
    const original = window.EventTarget.prototype.addEventListener;
    window.EventTarget.prototype.addEventListener = function spy(type, ...rest) {
      if (this.classList && this.classList.contains('mm-node')) {
        bound.push(`${type} on ${this.dataset.nodeId}`);
      }
      return original.call(this, type, ...rest);
    };

    try {
      typeName('src');
    } finally {
      window.EventTarget.prototype.addEventListener = original;
    }

    expect(bound).toEqual([]);
  });

  it('ends on the picture a fresh render of the same map would draw', () => {
    typeName('src');
    pane.fitToView();

    expect(picture(host)).toBe(freshPicture());
  });

  it('moves the nodes the longer name pushed aside', () => {
    const x = id => nodeGroup(host, id).querySelector('rect.mm-node__box').getAttribute('x');
    history.apply('addChild', { parentId: 'src', node: { id: 'book', text: 'A book' } });
    const was = x('book');

    typeName('src');

    // 'book' hangs off the node being renamed, so a wider parent has to have moved it.
    expect(x('book')).not.toBe(was);
  });

  it('draws what a fresh render would after every kind of change, not only a rename', () => {
    const changes = [
      () => history.apply('addChild', { parentId: 'src', node: { id: 'book', text: 'A book' } }),
      () => history.apply('setDone', { id: 'book', done: true }),
      () => history.apply('setSymbol', { id: 'arg', symbol: '📚' }),
      () => history.apply('setColour', { id: 'arg', colour: 3 }),
      () => history.apply('addLink', { from: 'ev', to: 'book', label: 'supports' }),
      () => history.apply('moveNode', { id: 'ev', newParentId: 'src', index: 0 }),
      () => history.apply('moveUp', { id: 'src' }),
      () => history.apply('toggleCollapsed', { id: 'src' }),
      () => history.apply('toggleCollapsed', { id: 'src' }),
      () =>
        history.apply('setText', { id: 'ev', text: 'Evidence, at some length, from the archive' }),
      () => history.apply('removeLink', { id: 'ev->book' }),
      () => history.apply('removeNode', { id: 'book' }),
      () => history.apply('removeNode', { id: 'counter' }),
      () => history.undo(),
      () => history.undo(),
    ];

    changes.forEach((change, at) => {
      change();
      pane.fitToView();
      expect({ at, picture: picture(host) }).toEqual({ at, picture: freshPicture() });
    });
  });

  it('takes a node off the picture with its connector and its button', () => {
    history.apply('removeNode', { id: 'arg' });

    expect(nodeIds(host).sort()).toEqual([ROOT_ID, 'src'].sort());
    expect(host.querySelectorAll('.mm-canvas__edge')).toHaveLength(1);
    expect(host.querySelector('.mm-canvas__toggle[data-toggle-for="arg"]')).toBeNull();
  });

  it('draws a node put back by undo', () => {
    history.apply('removeNode', { id: 'src' });
    expect(nodeGroup(host, 'src')).toBeNull();

    history.undo();

    expect(nodeGroup(host, 'src')).not.toBeNull();
  });

  it('keeps the collapse button naming the branch it opens', () => {
    history.apply('setText', { id: 'arg', text: 'Claim' });

    const toggle = host.querySelector('.mm-canvas__toggle[data-toggle-for="arg"]');
    expect(toggle.getAttribute('aria-label')).toBe('Collapse Claim');
  });

  // The button a keyboard student has just pressed used to be thrown away by the render its own
  // press caused, and focus went to the top of the page with it.
  it('leaves the keyboard on the collapse button that was pressed', () => {
    const toggle = host.querySelector('.mm-canvas__toggle[data-toggle-for="arg"]');

    activate(toggle);

    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

/**
 * A dock or a sheet opening takes width off the canvas, and nothing was watching for it: the node
 * the student had selected could end up behind the panel that had just opened, with the map still
 * fitted to a view it no longer has.
 */
describe('canvas pane — when its host changes size', () => {
  let host;
  let history;
  let selection;
  let pane;
  let observers;

  const transform = () =>
    pane.getSvgElement().querySelector('.mm-canvas__viewport').getAttribute('transform');

  /** Report a size change the way the browser does. */
  function resize() {
    for (const observer of observers) {
      observer.callback([], observer);
    }
  }

  beforeEach(() => {
    observers = [];
    global.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) {
        this.targets.push(target);
      }
      disconnect() {
        this.disconnected = true;
      }
    };
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
    jest.useRealTimers();
    delete global.ResizeObserver;
  });

  it('watches the host, and lets go of it on destroy', () => {
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([host]);

    pane.destroy();

    expect(observers[0].disconnected).toBe(true);
  });

  it('waits for the resizing to stop before it moves anything', () => {
    history.apply('addChild', {
      parentId: 'src',
      node: { id: 'wide', text: 'A branch that pushes the map wider than it was' },
    });
    const before = transform();

    resize();
    expect(transform()).toBe(before);

    jest.advanceTimersByTime(500);
    expect(transform()).not.toBe(before);
  });

  it('brings the selected node back into view', () => {
    for (let step = 0; step < 5; step += 1) {
      press(zoomButton(host, 'Zoom in'));
    }
    // Chosen on the canvas, so the pane did not pan to it: this is a node the student is working
    // on that a dock has just covered.
    selection.set('src', { source: 'canvas' });
    expect(centreOnScreen(host, pane, 'src').x).toBeLessThan(24);

    resize();
    jest.advanceTimersByTime(500);

    expect(centreOnScreen(host, pane, 'src').x).toBeCloseTo(VIEW_CENTRE.x, 3);
    expect(centreOnScreen(host, pane, 'src').y).toBeCloseTo(VIEW_CENTRE.y, 3);
  });

  it('fits the whole map when nothing is selected', () => {
    for (let step = 0; step < 5; step += 1) {
      press(zoomButton(host, 'Zoom in'));
    }

    resize();
    jest.advanceTimersByTime(500);

    expect(transform()).toContain('scale(1)');
  });
});

/**
 * Below 900px the docks are sheets laid OVER the canvas. The host does not change size, so nothing
 * above fires, and the node the student is working on is simply under the sheet. The page tells
 * the pane what is covered; the arithmetic is graded on its own in view-geometry.test.js.
 */
describe('canvas pane — when a sheet covers part of it', () => {
  let host;
  let history;
  let selection;
  let pane;

  const viewport = () => pane.getSvgElement().querySelector('.mm-canvas__viewport');
  const transform = () => viewport().getAttribute('transform');

  const mountPane = (options = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn(), ...options });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  /** A sheet over the right 360px of the 900x600 view, as the details dock is. */
  const RIGHT_SHEET = { left: 540, top: 0, width: 360, height: 600 };
  const LEFT_SHEET = { left: 0, top: 0, width: 360, height: 600 };

  it('moves the selected node out from under the sheet, into the middle of what is left', () => {
    mountPane();
    selection.set('ev', { source: 'canvas' });
    expect(centreOnScreen(host, pane, 'ev').x).toBeGreaterThan(540);

    pane.setCovered(RIGHT_SHEET);

    expect(centreOnScreen(host, pane, 'ev').x).toBeCloseTo(270, 3);
    expect(centreOnScreen(host, pane, 'ev').y).toBeCloseTo(300, 3);
  });

  it('leaves the view alone when the selected node is already clear of the sheet', () => {
    mountPane();
    selection.set('ev', { source: 'canvas' });
    const before = transform();

    pane.setCovered(LEFT_SHEET);

    expect(transform()).toBe(before);
  });

  it('fits the map into what is left when nothing is selected', () => {
    mountPane();

    pane.setCovered(LEFT_SHEET);

    for (const id of nodeIds(host)) {
      expect(centreOnScreen(host, pane, id).x).toBeGreaterThan(360);
    }
  });

  it('keeps later moves clear of the sheet for as long as it is open', () => {
    mountPane();
    pane.setCovered(RIGHT_SHEET);

    pane.zoomTo('src');

    expect(centreOnScreen(host, pane, 'src').x).toBeCloseTo(270, 3);
  });

  it('does not move anything when the sheet closes', () => {
    mountPane();
    // Nothing selected, so the open sheet squeezed the whole map to one side: the case in which a
    // pane that re-fitted on close would visibly move.
    pane.setCovered(LEFT_SHEET);
    const before = transform();

    pane.setCovered(null);

    expect(transform()).toBe(before);
  });

  it('has the whole view to work in again once the sheet has closed', () => {
    mountPane();
    pane.setCovered(RIGHT_SHEET);
    pane.setCovered(null);

    pane.zoomTo('ev');

    expect(centreOnScreen(host, pane, 'ev').x).toBeCloseTo(VIEW_CENTRE.x, 3);
  });

  it('eases the move, unless the student asked for less motion', () => {
    mountPane({ reducedMotion: false });
    selection.set('ev', { source: 'canvas' });
    pane.setCovered(RIGHT_SHEET);
    expect(viewport().classList.contains('mm-canvas__viewport--moving')).toBe(true);
    pane.destroy();
    host.remove();

    mountPane({ reducedMotion: true });
    selection.set('ev', { source: 'canvas' });
    pane.setCovered(RIGHT_SHEET);
    expect(viewport().classList.contains('mm-canvas__viewport--moving')).toBe(false);
    expect(centreOnScreen(host, pane, 'ev').x).toBeCloseTo(270, 3);
  });
});

/**
 * A drag, played through the mounted pane: which node the pointer is over, whether the drop is
 * allowed, and what it does to the map. These were three exported helpers tested on their own, with
 * no caller outside this file; the gesture is the public surface, so the gesture is what is graded.
 */
describe('canvas pane — dragging a node onto another', () => {
  let host;
  let history;
  let announce;
  let notified;
  let pane;

  const mountWith = map => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    announce = jest.fn();
    notified = jest.fn();
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce,
      notify: notified,
    });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  /** The middle of a node's box; in jsdom a client coordinate is a layout coordinate. */
  const middleOf = id => {
    const box = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      clientX: Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2,
      clientY: Number(box.getAttribute('y')) + Number(box.getAttribute('height')) / 2,
    };
  };

  function dragTo(id, point, { release = true } = {}) {
    nodeGroup(host, id).dispatchEvent(mouse('mousedown', middleOf(id)));
    window.dispatchEvent(mouse('mousemove', point));
    if (release) {
      window.dispatchEvent(mouse('mouseup', point));
    }
  }

  it('moves the node under the one it was dropped on, last among its children, in one step', () => {
    mountWith(makeMap());
    history.apply('addChild', { parentId: 'src', node: { id: 'book', text: 'A book' } });

    dragTo('ev', middleOf('src'));

    expect(history.current().nodes.src.children).toEqual(['book', 'ev']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Sources'.");
    history.undo();
    expect(history.current().nodes.ev.parentId).toBe('arg');
  });

  it('marks the node under the pointer as the target while the drag is over it', () => {
    mountWith(makeMap());

    dragTo('ev', middleOf('src'), { release: false });

    expect(nodeGroup(host, 'src').classList.contains('mm-node--dropTarget')).toBe(true);
    window.dispatchEvent(mouse('mouseup', middleOf('src')));
    expect(host.querySelector('.mm-node--dropTarget')).toBeNull();
  });

  it('never offers the dragged node to itself', () => {
    mountWith(makeMap());
    const before = history.current();

    // A few pixels: still over its own box, which is the topmost thing under the pointer.
    const { clientX, clientY } = middleOf('ev');
    const nearby = { clientX: clientX + 4, clientY: clientY + 4 };
    dragTo('ev', nearby, { release: false });
    expect(host.querySelector('.mm-node--invalidTarget')).toBeNull();
    expect(host.querySelector('.mm-node--dropTarget')).toBeNull();
    window.dispatchEvent(mouse('mouseup', nearby));

    expect(history.current()).toBe(before);
    // A release with nothing under it is still an answer: silence left the student waiting.
    expect(announce).toHaveBeenLastCalledWith('Nothing moved.');
  });

  /*
   * A click is not a drag that failed. Every pointer reports a pixel or two of travel on a plain
   * click and d3-drag passes all of it on, so a click on a node was a drag that had moved and let
   * go over nothing — and the pane told a student who had not tried to move anything that nothing
   * had moved. Below the threshold nothing follows the pointer and nothing is said.
   */
  it('says nothing when the release barely travelled from the press', () => {
    mountWith(makeMap());
    const before = history.current();
    const { clientX, clientY } = middleOf('ev');
    const nudge = { clientX: clientX + 2, clientY: clientY + 1 };

    dragTo('ev', nudge);

    expect(history.current()).toBe(before);
    expect(announce).not.toHaveBeenCalledWith('Nothing moved.');
    expect(notified).not.toHaveBeenCalled();
    expect(nodeGroup(host, 'ev').hasAttribute('transform')).toBe(false);
  });

  it('refuses a drop into the dragged node’s own branch, and says why', () => {
    mountWith(makeMap());
    const before = history.current();

    dragTo('arg', middleOf('ev'), { release: false });
    expect(nodeGroup(host, 'ev').classList.contains('mm-node--invalidTarget')).toBe(true);
    window.dispatchEvent(mouse('mouseup', middleOf('ev')));

    expect(history.current()).toBe(before);
    // A refusal: all the student sees is the node springing back, so the reason is shown too.
    expect(notified).toHaveBeenLastCalledWith("'Argument' cannot move into its own branch.");
    expect(announce).not.toHaveBeenCalledWith("'Argument' cannot move into its own branch.");
    expect(host.querySelector('.mm-node--invalidTarget')).toBeNull();
  });

  it('puts a node dropped on nothing back where the layout had it', () => {
    mountWith(makeMap());
    const before = history.current();
    const group = nodeGroup(host, 'ev');

    dragTo('ev', { clientX: 5000, clientY: 5000 });

    expect(history.current()).toBe(before);
    expect(announce).toHaveBeenLastCalledWith('Nothing moved.');
    expect(nodeGroup(host, 'ev')).toBe(group);
    expect(group.hasAttribute('transform')).toBe(false);
    expect(group.classList.contains('mm-node--dragging')).toBe(false);
  });

  it('opens a shut branch it is dropped into, so one Ctrl+Z puts the whole drag back', () => {
    const map = toggleCollapsed(
      // A branch has to have something in it to be shut.
      makeHistory().apply('addChild', { parentId: 'src', node: { id: 'book', text: 'A book' } }),
      { id: 'src' }
    );
    mountWith(map);

    dragTo('ev', middleOf('src'));

    expect(history.current().nodes.ev.parentId).toBe('src');
    expect(history.current().nodes.src.collapsed).toBe(false);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Sources' and expanded it.");

    history.undo();
    expect(history.current().nodes.ev.parentId).toBe('arg');
    expect(history.current().nodes.src.collapsed).toBe(true);
    expect(history.canUndo()).toBe(false);
  });
});

/**
 * Reordering by drag.
 *
 * Siblings stack downwards in both layouts — `stack` in layout.js walks one cursor down the column,
 * and the map layout mirrors the left half in x only — so "before" is the top of a target box and
 * "after" is the bottom on every side of every layout. That is the invariant these tests assert:
 * the same two edges, whichever mode and whichever side the target happens to be on.
 */
describe('canvas pane — dragging a node between two siblings', () => {
  let host;
  let history;
  let announce;
  let notified;
  let pane;

  /** root → arg(ev, counter) on the right, src(book, paper) on the left. */
  const orderedMap = () => {
    let map = addChild(makeMap(), { parentId: 'src', node: { id: 'book', text: 'A book' } });
    map = addChild(map, { parentId: 'src', node: { id: 'paper', text: 'A paper' } });
    return map;
  };

  const mountWith = (map = orderedMap(), options = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    announce = jest.fn();
    notified = jest.fn();
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce,
      notify: notified,
      ...options,
    });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const boxOf = id => {
    const rect = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')),
      h: Number(rect.getAttribute('height')),
    };
  };

  /** A point just inside a target's leading (top) edge, its trailing (bottom) edge, or its middle. */
  const zoneOf = (id, where) => {
    const box = boxOf(id);
    const y =
      where === 'leading'
        ? box.y + 1
        : where === 'trailing'
          ? box.y + box.h - 1
          : box.y + box.h / 2;
    return { clientX: box.x + box.w / 2, clientY: y };
  };

  function dragTo(id, point, { release = true } = {}) {
    const box = boxOf(id);
    nodeGroup(host, id).dispatchEvent(
      mouse('mousedown', { clientX: box.x + box.w / 2, clientY: box.y + box.h / 2 })
    );
    window.dispatchEvent(mouse('mousemove', point));
    if (release) {
      window.dispatchEvent(mouse('mouseup', point));
    }
  }

  const hint = () => host.querySelector('.mm-canvas__dropHint');

  it('inserts the node before the sibling whose leading edge it was dropped on', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'leading'));

    expect(history.current().nodes.src.children).toEqual(['book', 'ev', 'paper']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' before 'A paper'.");
  });

  it('inserts it after the sibling whose trailing edge it was dropped on', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'trailing'));

    expect(history.current().nodes.src.children).toEqual(['book', 'paper', 'ev']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' after 'A paper'.");
  });

  it('reads the same two edges in tree mode, where every branch is on one side', () => {
    mountWith(orderedMap(), { getLayoutMode: () => 'tree' });

    dragTo('ev', zoneOf('paper', 'leading'));
    expect(history.current().nodes.src.children).toEqual(['book', 'ev', 'paper']);

    dragTo('ev', zoneOf('book', 'trailing'));
    expect(history.current().nodes.src.children).toEqual(['book', 'ev', 'paper']);
  });

  it('still makes a child of a node dropped on in the middle', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'middle'));

    expect(history.current().nodes.paper.children).toEqual(['ev']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'A paper'.");
  });

  it('reorders in one undo step', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'trailing'));
    history.undo();

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(history.canUndo()).toBe(false);
  });

  it('marks the place between the siblings with a line and a caret, not with a colour', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'leading'), { release: false });

    expect(hint().getAttribute('display')).toBeNull();
    expect(hint().querySelector('path.mm-canvas__dropLine').getAttribute('d')).toMatch(/^M .* L /);
    // A closed triangle: the caret that says which way the node is going in.
    expect(hint().querySelector('path.mm-canvas__dropCaret').getAttribute('d')).toMatch(/Z$/);
    // The box cue means "inside this one", so it must not be showing as well.
    expect(nodeGroup(host, 'paper').classList.contains('mm-node--dropTarget')).toBe(false);

    window.dispatchEvent(mouse('mouseup', zoneOf('paper', 'leading')));
    expect(hint().getAttribute('display')).toBe('none');
  });

  it('keeps the box cue for a drop in the middle, with no line', () => {
    mountWith();

    dragTo('ev', zoneOf('paper', 'middle'), { release: false });

    expect(nodeGroup(host, 'paper').classList.contains('mm-node--dropTarget')).toBe(true);
    expect(hint().getAttribute('display')).toBe('none');
    window.dispatchEvent(mouse('mouseup', zoneOf('paper', 'middle')));
  });

  it('refuses a place beside a node inside the dragged branch, as it refuses one inside it', () => {
    mountWith();
    const before = history.current();

    dragTo('arg', zoneOf('ev', 'leading'), { release: false });
    expect(nodeGroup(host, 'ev').classList.contains('mm-node--invalidTarget')).toBe(true);
    expect(hint().getAttribute('display')).toBe('none');
    window.dispatchEvent(mouse('mouseup', zoneOf('ev', 'leading')));

    expect(history.current()).toBe(before);
    expect(notified).toHaveBeenLastCalledWith("'Argument' cannot move into its own branch.");
  });

  it('offers only "inside" over the centre, which has no siblings', () => {
    mountWith();

    dragTo('ev', zoneOf(ROOT_ID, 'leading'));

    expect(history.current().nodes[ROOT_ID].children).toEqual(['arg', 'src', 'ev']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Essay plan'.");
  });

  it('does nothing, and costs no undo step, when the node is dropped where it already is', () => {
    mountWith();
    const before = history.current();

    dragTo('book', zoneOf('paper', 'leading'));

    expect(history.current()).toBe(before);
    expect(history.canUndo()).toBe(false);
    // Nothing changed, which is exactly why it has to be said: the student aimed and let go.
    expect(announce).toHaveBeenLastCalledWith("'A book' is already there.");
  });
});

/**
 * The quick-add handles.
 *
 * Creation itself belongs to the outline pane (ADR 0001): the page hands this pane a `createNode`
 * that goes through the outline's own Enter and Shift+Enter path, so there is one way to make a
 * node. What is graded here is that the handles are real buttons on the right node, in the right
 * place, that they call that one path, and that the editor they open keeps the outline's rules.
 */
describe('canvas pane — the quick-add handles', () => {
  let host;
  let history;
  let selection;
  let announce;
  let notified;
  let createNode;
  let pane;
  let serial;

  const mountWith = (map = makeMap(), options = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    selection = createSelectionStub();
    announce = jest.fn();
    // The page's `showToast`, which writes the toast AND the live region. Separate mocks, so a
    // sentence that has to be SEEN cannot pass this suite by being said.
    notified = jest.fn();
    serial = 0;
    // Stands in for outline-pane's `addNode`, to the same contract: a mark before the creation, the
    // node selected, and the edit record back so whichever editor is open can discard it blank.
    createNode = jest.fn((id, { asChild } = {}) => {
      const mark = history.mark();
      serial += 1;
      const fresh = `fresh-${serial}`;
      const args = asChild
        ? ['addChild', { parentId: id, node: { id: fresh, text: '' } }]
        : ['addSibling', { siblingId: id, node: { id: fresh, text: '' } }];
      history.apply(args[0], args[1], { mark });
      selection.set(fresh, { source: 'outline' });
      return { id: fresh, original: '', caret: 0, created: true, from: id, mark };
    });
    pane = mountCanvasPane(host, {
      history,
      selection,
      announce,
      notify: notified,
      createNode,
      ...options,
    });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const handle = kind => host.querySelector(`button[data-add-for="${kind}"]`);
  const editorInput = () => host.querySelector('input.mm-canvas__editor');
  const view = () => {
    const attribute = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    const [, tx, ty, k] = attribute.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
    return { tx: Number(tx), ty: Number(ty), k: Number(k) };
  };
  const boxOf = id => {
    const rect = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')),
      h: Number(rect.getAttribute('height')),
    };
  };

  it('shows two named buttons on the selected node and none on any other', () => {
    mountWith();
    expect(handle('child')).toBeNull();

    selection.set('arg', { source: 'canvas' });

    expect(handle('child').tagName).toBe('BUTTON');
    expect(handle('child').getAttribute('aria-label')).toBe("Add a child to 'Argument'");
    expect(handle('sibling').getAttribute('aria-label')).toBe("Add a sibling after 'Argument'");
    expect(host.querySelectorAll('button[data-add-for]')).toHaveLength(2);
  });

  /**
   * A `title` beside an `aria-label` is read twice by a screen reader (the label names the button,
   * the title describes it). The words stay in the name; the glyph is what a sighted student reads,
   * so it has to say which way the new node goes on its own.
   */
  it('carries no title, and says in its glyph which way the new node goes', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });

    for (const kind of ['child', 'sibling']) {
      expect(handle(kind).hasAttribute('title')).toBe(false);
      expect(handle(kind).querySelector('span').getAttribute('aria-hidden')).toBe('true');
    }
    expect(handle('child').textContent).toBe('+\u21b3');
    expect(handle('sibling').textContent).toBe('+\u2193');
  });

  it('offers no sibling handle on the centre, which has no siblings', () => {
    mountWith();

    selection.set(ROOT_ID, { source: 'canvas' });

    expect(handle('child')).not.toBeNull();
    expect(handle('sibling')).toBeNull();
  });

  it('sits outside the node box, on the side its branch runs to', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    const { tx, k } = view();
    const box = boxOf('arg');

    expect(parseFloat(handle('child').style.left)).toBeGreaterThanOrEqual(tx + k * (box.x + box.w));
  });

  it('goes to the outward side of a branch that runs the other way', () => {
    mountWith();
    // 'src' is the second first-level branch, so the map layout puts it on the left.
    selection.set('src', { source: 'canvas' });
    const { tx, k } = view();
    const box = boxOf('src');
    const button = handle('child');
    const right = parseFloat(button.style.left) + parseFloat(button.style.width);

    expect(right).toBeLessThanOrEqual(tx + k * box.x);
  });

  it('keeps a 24 px target however far the map is zoomed out (SC 2.5.8)', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(zoomButton(host, 'Zoom out'));
    press(zoomButton(host, 'Zoom out'));
    press(zoomButton(host, 'Zoom out'));

    expect(parseFloat(handle('child').style.width)).toBe(24);
    expect(parseFloat(handle('child').style.height)).toBe(24);
  });

  it('backs that size with a floor in the stylesheet, so CSS cannot undercut it', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../../src/pages/mind-map/canvas-pane.css'),
      'utf8'
    );
    const at = css.indexOf('.mm-canvas__handle {');
    const rule = css.slice(at, css.indexOf('}', at));

    expect(rule).toContain('min-inline-size: 24px');
    expect(rule).toContain('min-block-size: 24px');
  });

  it('follows the node when the picture is redrawn', () => {
    mountWith();
    selection.set('counter', { source: 'canvas' });
    const button = handle('child');
    const before = button.style.top;

    history.apply('setText', { id: 'ev', text: 'Evidence from the lecture and the seminar notes' });

    // The same button, moved: the overlay is kept up to date, not rebuilt.
    expect(handle('child')).toBe(button);
    expect(button.style.top).not.toBe(before);
  });

  it('comes after the node’s collapse button in the order Tab meets them', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    const order = [...host.querySelectorAll('.mm-canvas__overlay > *')];

    expect(order.indexOf(host.querySelector('button[data-toggle-for="arg"]'))).toBeLessThan(
      order.indexOf(handle('child'))
    );
    expect(order.indexOf(handle('child'))).toBeLessThan(order.indexOf(handle('sibling')));
  });

  it('does not take the keyboard when the selection moves', () => {
    mountWith();
    const svg = pane.getSvgElement();
    svg.focus?.();
    selection.set('arg', { source: 'canvas' });

    expect(document.activeElement).not.toBe(handle('child'));
  });

  it('makes a child through the outline’s path and opens this pane’s editor on it', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });

    press(handle('child'));

    expect(createNode).toHaveBeenCalledWith('arg', { asChild: true });
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter', 'fresh-1']);
    expect(editorInput()).not.toBeNull();
    expect(document.activeElement).toBe(editorInput());
  });

  it('answers the keyboard as well as the pointer (SC 2.1.1)', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });

    activate(handle('sibling'));

    expect(createNode).toHaveBeenCalledWith('arg', { asChild: false });
    expect(history.current().nodes[ROOT_ID].children).toEqual(['arg', 'fresh-1', 'src']);
    expect(editorInput()).not.toBeNull();
  });

  it('throws away a node it made that was never named, with the step that made it', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));

    editorInput().dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(history.canUndo()).toBe(false);
    // Shown as well as said: the box the student was naming disappears from the picture, and
    // `notify` is the only thing that tells a sighted student it was their Escape that did it.
    expect(notified).toHaveBeenCalledWith('New node discarded');
    // `notify` writes the live region too, so a pair with `announce` would say it twice.
    expect(announce).not.toHaveBeenCalledWith('New node discarded');
    // Back where the student pressed, so the pointer and the keyboard leave in the same place.
    expect(selection.get()).toBe('arg');
    expect(document.activeElement).toBe(handle('child'));
  });

  it('throws it away on the way out of an empty field as well', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));

    editorInput().dispatchEvent(new window.FocusEvent('blur'));

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(notified).toHaveBeenCalledWith('New node discarded');
    // A blur is the student going somewhere; the handle does not reach out and take the keyboard.
    expect(document.activeElement).not.toBe(handle('child'));
  });

  // Escape leaves the keyboard nowhere, and putting it back on the handle is the whole point. A
  // student who left the field by pressing something else has already said where they are going.
  it('does not pull the keyboard back out of whatever the student left the field for', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    const elsewhere = zoomButton(host, 'Fit');

    // A real focus change, which is what raises the blur that settles the empty field.
    elsewhere.focus();

    expect(editorInput()).toBeNull();
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('keeps a name and offers another node when Enter commits it', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    const input = editorInput();
    input.value = 'A quotation';
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );

    expect(history.current().nodes['fresh-1'].text).toBe('A quotation');
    expect(createNode).toHaveBeenLastCalledWith('fresh-1', { asChild: false });
    expect(editorInput()).not.toBeNull();
    expect(editorInput().value).toBe('');
  });

  it('keeps the name the student typed when Escape cancels the naming', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    const input = editorInput();
    input.value = 'A quotation';

    input.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );

    // Escape cancels the naming, not the node. The field writes nothing until it commits, so the
    // name has to be written on the way out.
    expect(history.current().nodes['fresh-1'].text).toBe('A quotation');
    expect(announce).toHaveBeenLastCalledWith("Kept 'A quotation'. Press Delete to remove it.");
  });

  it('makes and names a node in one undo step, never leaving a blank one behind', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    const input = editorInput();
    input.value = 'A quotation';
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    history.undo();

    expect(history.current().nodes['fresh-1']).toBeUndefined();
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(history.current().nodes['fresh-1'].text).toBe('A quotation');
  });

  it('finishes and stays put on Ctrl+Enter', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    const input = editorInput();
    input.value = 'A quotation';
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(history.current().nodes['fresh-1'].text).toBe('A quotation');
    expect(createNode).toHaveBeenCalledTimes(1);
    expect(editorInput()).toBeNull();
  });

  /**
   * A node counts as on screen only when its handles are too. A box clear of a sheet whose handles
   * are under it is a node whose only pointer controls the student cannot reach, and nothing else
   * on the page would move the view for it.
   */
  it('counts the handles as part of the node when a sheet comes over the view', () => {
    mountWith();
    selection.set('arg', { source: 'canvas' });
    pane.zoomTo('arg', false);

    const { tx, k } = view();
    const box = boxOf('arg');
    const boxRight = tx + k * (box.x + box.w);
    const button = handle('child');
    const handleRight = parseFloat(button.style.left) + parseFloat(button.style.width);
    // A sheet that clears the box by more than the edge margin, and the handles by less than none.
    const sheetLeft = boxRight + 26;
    expect(handleRight).toBeGreaterThan(sheetLeft);

    const before = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    pane.setCovered({ left: sheetLeft, top: 0, width: 900 - sheetLeft, height: 600 });

    expect(
      pane.getSvgElement().querySelector('.mm-canvas__viewport').getAttribute('transform')
    ).not.toBe(before);
    const moved = handle('child');
    expect(parseFloat(moved.style.left) + parseFloat(moved.style.width)).toBeLessThan(sheetLeft);
  });
});

/**
 * A field the pane has to take away, because the node it belongs to has gone or gone behind a fold.
 *
 * The words the student typed are dealt with by the inline editor's own rules; what is graded here
 * is the keyboard, which Chrome drops on `<body>` when the element holding it is removed. The page
 * hands in a `rescueFocus` that puts it on the nearest thing the student can act on.
 */
/**
 * The handles are 24 screen pixels whatever the zoom (SC 2.5.8), and they are placed in screen
 * pixels for the same reason: a position worked out in the picture's own units and then inflated to
 * the floor lands somewhere else, and where it landed on an ordinary map was on top of the collapse
 * badge. The badge is an existing control, so a handle over it is a regression, not a cosmetic
 * fault: the student aims at "collapse" and makes a node.
 *
 * Where there is no room — and on a map zoomed out to fit there often is none — the handles are not
 * drawn at all. They are an affordance, not a state: Enter, Shift+Enter, the toolbar and Move to…
 * all still make nodes, so nothing is lost and nothing is announced.
 */
describe('canvas pane — the handles never sit on anything else', () => {
  let host;
  let history;
  let selection;
  let pane;

  /** Root, six branches, three children each, two grandchildren each: 61 nodes. */
  function crowdedMap() {
    let map = makeMap();
    for (const id of ['arg', 'src']) {
      map = removeNode(map, { id });
    }
    for (let branch = 0; branch < 6; branch += 1) {
      const top = `b${branch}`;
      map = addChild(map, { parentId: ROOT_ID, node: { id: top, text: `Branch ${branch}` } });
      for (let child = 0; child < 3; child += 1) {
        const mid = `${top}c${child}`;
        map = addChild(map, { parentId: top, node: { id: mid, text: `Point ${branch}.${child}` } });
        for (let leaf = 0; leaf < 2; leaf += 1) {
          map = addChild(map, {
            parentId: mid,
            node: { id: `${mid}l${leaf}`, text: `Note ${branch}.${child}.${leaf}` },
          });
        }
      }
    }
    return map;
  }

  const mountWith = mode => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(crowdedMap());
    selection = createSelectionStub();
    pane = mountCanvasPane(host, {
      history,
      selection,
      announce: jest.fn(),
      createNode: () => null,
      getLayoutMode: () => mode,
    });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const view = () => {
    const attribute = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    const [, tx, ty, k] = attribute.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
    return { tx: Number(tx), ty: Number(ty), k: Number(k) };
  };

  /**
   * Every node box as the student sees it, in the pane's own pixels, except the selected node's own.
   *
   * Its own box is the one rectangle the handles may sit on: it belongs to the node they belong to,
   * and where the column beside the node is taken that box is the only room left (see
   * `placeHandles`). Every other node's box, and every collapse button, is an existing control whose
   * press a handle must never take.
   */
  const otherNodeRects = selectedId => {
    const { tx, ty, k } = view();
    return [...host.querySelectorAll('.mm-node')]
      .filter(group => group.dataset.nodeId !== selectedId)
      .map(group => group.querySelector('rect.mm-node__box'))
      .map(rect => ({
        left: tx + k * Number(rect.getAttribute('x')),
        top: ty + k * Number(rect.getAttribute('y')),
        width: k * Number(rect.getAttribute('width')),
        height: k * Number(rect.getAttribute('height')),
      }));
  };

  /** Every overlay control's drawn box, read back from the inline style that placed it. */
  const overlayRects = selector =>
    [...host.querySelectorAll(selector)]
      .filter(element => !element.hidden)
      .map(element => ({
        element,
        left: parseFloat(element.style.left),
        top: parseFloat(element.style.top),
        width: parseFloat(element.style.width),
        height: parseFloat(element.style.height),
      }));

  const overlaps = (a, b) =>
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height;

  /** Every zoom the student can reach from Fit by pressing Zoom out, Fit included. */
  const zoomSteps = 6;

  for (const mode of ['map', 'tree']) {
    it(`never covers a node, a collapse button or the other handle (${mode} layout)`, () => {
      mountWith(mode);
      const ids = [...host.querySelectorAll('.mm-node')].map(group => group.dataset.nodeId);
      let shownSomewhere = 0;

      for (let step = 0; step < zoomSteps; step += 1) {
        if (step > 0) {
          press(zoomButton(host, 'Zoom out'));
        }
        const scale = view().k;
        for (const id of ids) {
          selection.set(id, { source: 'canvas' });
          const handles = overlayRects('button[data-add-for]');
          const toggles = overlayRects('button.mm-canvas__toggle');
          const boxes = otherNodeRects(id);
          shownSomewhere += handles.length;

          for (const handle of handles) {
            // SC 2.5.8, at every zoom, not only at the one the map opened on.
            expect({ id, scale, w: handle.width, h: handle.height }).toEqual({
              id,
              scale,
              w: 24,
              h: 24,
            });
            for (const other of handles) {
              if (other.element !== handle.element) {
                expect({ id, scale, hit: overlaps(handle, other) }).toEqual({
                  id,
                  scale,
                  hit: false,
                });
              }
            }
            for (const toggle of toggles) {
              expect({ id, scale, hit: overlaps(handle, toggle) }).toEqual({
                id,
                scale,
                hit: false,
              });
            }
            for (const box of boxes) {
              expect({ id, scale, hit: overlaps(handle, box) }).toEqual({ id, scale, hit: false });
            }
          }
        }
      }

      // And the rule is not simply "never show them": a crowded map still has room somewhere.
      expect(shownSomewhere).toBeGreaterThan(0);
    });
  }

  it('takes the handles it cannot place out of the keyboard order as well as off the screen', () => {
    mountWith('map');
    // Zoomed all the way out, a sixty-node map has no room beside anything.
    for (let step = 0; step < 6; step += 1) {
      press(zoomButton(host, 'Zoom out'));
    }
    selection.set('b0c0', { source: 'canvas' });

    const buttons = [...host.querySelectorAll('button[data-add-for]')];
    expect(buttons).toHaveLength(2);
    expect(buttons.map(button => button.hidden)).toEqual([true, true]);
  });

  it('shows them again as soon as the student zooms in far enough to use them', () => {
    mountWith('map');
    for (let step = 0; step < 6; step += 1) {
      press(zoomButton(host, 'Zoom out'));
    }
    selection.set('b0c0', { source: 'canvas' });
    expect(host.querySelector('button[data-add-for]').hidden).toBe(true);

    for (let step = 0; step < 8; step += 1) {
      press(zoomButton(host, 'Zoom in'));
    }

    expect(host.querySelector('button[data-add-for]').hidden).toBe(false);
  });
});

/**
 * How much of a target box means "before", "after" and "inside".
 *
 * The bands are measured on screen, because that is where the student aims. A rule written in the
 * picture's own units gives bands of two and a half pixels on a map zoomed out to fit, which is not
 * a target anybody can hit. Where the box is too short on screen for three usable bands the middle
 * one goes rather than shrinking: reordering siblings is the thing a pointer cannot otherwise do at
 * all, while "make a child" is still one press away in the outline, in the toolbar, in Move to… and
 * at any closer zoom.
 */
describe('canvas pane — the drop bands, measured on screen', () => {
  let host;
  let history;
  let pane;

  /** The centre, a one-line node, a three-line node, and a leaf to drag at them. */
  function bandMap() {
    let map = createMap({ id: 'm2', title: 'Bands', rootId: 'root', rootText: 'Bands' });
    map = addChild(map, { parentId: 'root', node: { id: 'short', text: 'Short' } });
    map = addChild(map, {
      parentId: 'root',
      node: {
        id: 'tall',
        text: 'A heading long enough to wrap onto three separate lines in the measured box',
      },
    });
    map = addChild(map, { parentId: 'root', node: { id: 'spare', text: 'Spare' } });
    return map;
  }

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(bandMap());
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce: jest.fn(),
      createNode: () => null,
    });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const scale = () => {
    const attribute = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    return Number(attribute.match(/scale\(([-\d.]+)\)/)[1]);
  };

  const boxOf = id => {
    const rect = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')),
      h: Number(rect.getAttribute('height')),
    };
  };

  /**
   * What the picture says a drop at this many screen pixels down the target box would do. The drag
   * is abandoned rather than released, so probing the whole height changes nothing.
   */
  function zoneAt(targetId, downScreen) {
    const target = boxOf(targetId);
    const from = boxOf('spare');
    nodeGroup(host, 'spare').dispatchEvent(
      mouse('mousedown', { clientX: from.x + from.w / 2, clientY: from.y + from.h / 2 })
    );
    window.dispatchEvent(
      mouse('mousemove', {
        clientX: target.x + target.w / 2,
        clientY: target.y + downScreen / scale(),
      })
    );

    let zone = null;
    if (nodeGroup(host, targetId).classList.contains('mm-node--dropTarget')) {
      zone = 'into';
    } else {
      const hint = host.querySelector('.mm-canvas__dropHint');
      if (hint.getAttribute('display') !== 'none') {
        const y = Number(
          hint.querySelector('.mm-canvas__dropLine').getAttribute('d').split(' ')[2]
        );
        zone = y < target.y ? 'before' : 'after';
      }
    }
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    return zone;
  }

  /** The bands down a target box, in screen pixels, as names and widths. */
  function bandsOf(targetId) {
    const height = boxOf(targetId).h * scale();
    const runs = [];
    for (let down = 0.5; down < height; down += 1) {
      const zone = zoneAt(targetId, down);
      const last = runs[runs.length - 1];
      if (last && last.zone === zone) {
        last.width += 1;
      } else {
        runs.push({ zone, width: 1 });
      }
    }
    return { height, runs };
  }

  for (const id of ['short', 'tall']) {
    it(`gives every band a target worth aiming at, at every zoom (${id} box)`, () => {
      for (let step = 0; step < 6; step += 1) {
        if (step > 0) {
          press(zoomButton(host, 'Zoom out'));
        }
        const { height, runs } = bandsOf(id);
        const names = runs.map(run => run.zone);
        const where = `${id} at ${Math.round(height)}px`;

        expect({ where, names }).toEqual({
          where,
          names: height >= 24 ? ['before', 'into', 'after'] : ['before', 'after'],
        });
        if (names.length === 3) {
          for (const run of runs) {
            // Sampled at one pixel, so a band with an eight pixel floor measures at least seven.
            expect({ where, zone: run.zone, wide: run.width >= 7 }).toEqual({
              where,
              zone: run.zone,
              wide: true,
            });
          }
        } else {
          // Too short for three: the box is split down the middle, so each half is as big as it can be.
          expect({ where, even: Math.abs(runs[0].width - runs[1].width) <= 1 }).toEqual({
            where,
            even: true,
          });
        }
      }
    });
  }

  it('offers the centre no bands at all, because it has no siblings', () => {
    const height = boxOf('root').h * scale();
    for (let down = 0.5; down < height; down += 1) {
      expect(zoneAt('root', down)).toBe('into');
    }
  });
});

/**
 * A drag the student never finished.
 *
 * d3-drag ends on a mouseup it may never see: the window can lose focus, a touch can be taken over
 * by the browser's own scroll, and Escape is what a student presses when they have changed their
 * mind. Every one of those used to leave the insertion mark, or the box outline, painted on the map
 * until the next drag.
 */
describe('canvas pane — a drag that is abandoned', () => {
  let host;
  let history;
  let announce;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    announce = jest.fn();
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce,
      createNode: () => null,
    });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const boxOf = id => {
    const rect = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      clientX: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
      clientY: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
    };
  };

  const startDragOnto = target => {
    nodeGroup(host, 'ev').dispatchEvent(mouse('mousedown', boxOf('ev')));
    window.dispatchEvent(mouse('mousemove', boxOf(target)));
  };

  const cues = () => ({
    box: Boolean(host.querySelector('.mm-node--dropTarget, .mm-node--invalidTarget')),
    line: host.querySelector('.mm-canvas__dropHint').getAttribute('display') !== 'none',
    dragging: Boolean(host.querySelector('.mm-node--dragging')),
    moved: nodeGroup(host, 'ev').hasAttribute('transform'),
  });

  const abandonments = {
    Escape: () =>
      document.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      ),
    'the window losing focus': () => window.dispatchEvent(new window.Event('blur')),
    'a cancelled pointer': () =>
      pane.getSvgElement().dispatchEvent(new window.Event('pointercancel', { bubbles: true })),
  };

  for (const [how, abandon] of Object.entries(abandonments)) {
    it(`takes every cue off the map on ${how}, and changes nothing`, () => {
      const before = history.current();
      startDragOnto('src');
      expect(cues().box).toBe(true);

      abandon();

      expect(cues()).toEqual({ box: false, line: false, dragging: false, moved: false });
      expect(history.current()).toBe(before);
      expect(announce).not.toHaveBeenCalled();

      // And the release that follows it is not a drop: the drag is over.
      window.dispatchEvent(mouse('mouseup', boxOf('src')));
      expect(history.current()).toBe(before);
      expect(announce).not.toHaveBeenCalled();
    });
  }
});

describe('canvas pane — where the keyboard goes when the editor is taken away', () => {
  let host;
  let history;
  let rescueFocus;
  let pane;

  const mountWith = (map = makeMap()) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    rescueFocus = jest.fn();
    pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce: jest.fn(),
      rescueFocus,
    });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const openOn = id => {
    nodeGroup(host, id).dispatchEvent(mouse('dblclick'));
    return host.querySelector('input.mm-canvas__editor');
  };

  it('sends it to the parent of a node that was removed', () => {
    mountWith();
    openOn('ev');

    history.apply('removeNode', { id: 'ev' });

    expect(rescueFocus).toHaveBeenCalledWith('arg');
  });

  it('sends it to the branch that folded over the node, not to the top of the page', () => {
    mountWith();
    const input = openOn('ev');
    input.value = 'Evidence in full';

    history.apply('toggleCollapsed', { id: 'arg' });

    expect(rescueFocus).toHaveBeenCalledWith('arg');
  });

  it('leaves the keyboard where it is while the node still has a box to sit on', () => {
    mountWith();
    const input = openOn('ev');

    history.apply('setText', { id: 'src', text: 'Reading list' });

    expect(rescueFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
});

describe('canvas pane — lifecycle', () => {
  it('stops rendering and leaves the host empty after destroy', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const history = makeHistory();
    const pane = mountCanvasPane(host, {
      history,
      selection: createSelectionStub(),
      announce: jest.fn(),
    });

    pane.destroy();
    expect(host.querySelector('.mm-canvas')).toBeNull();

    history.apply('setText', { id: 'src', text: 'Still quiet' });
    expect(host.querySelector('.mm-node')).toBeNull();
    host.remove();
  });
});

describe('canvas pane — more than one node at a time', () => {
  let host;
  let history;
  let selection;
  let announce;
  let notified;
  let pane;

  const mountWith = (map = makeMap()) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    notified = jest.fn();
    pane = mountCanvasPane(host, { history, selection, announce, notify: notified });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const ringOf = id => nodeGroup(host, id).querySelector('rect.mm-node__ring');

  const middleOf = id => {
    const box = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      clientX: Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2,
      clientY: Number(box.getAttribute('y')) + Number(box.getAttribute('height')) / 2,
    };
  };

  function dragTo(id, point, { release = true } = {}) {
    nodeGroup(host, id).dispatchEvent(mouse('mousedown', middleOf(id)));
    window.dispatchEvent(mouse('mousemove', point));
    if (release) {
      window.dispatchEvent(mouse('mouseup', point));
    }
  }

  it('adds a node to the set on Ctrl+click and takes it out again', () => {
    mountWith();
    press(nodeGroup(host, 'ev'));
    expect(selection.ids()).toEqual(['ev']);

    nodeGroup(host, 'counter').dispatchEvent(mouse('mousedown', { ctrlKey: true }));
    window.dispatchEvent(mouse('mouseup'));
    expect(selection.ids()).toEqual(['ev', 'counter']);

    nodeGroup(host, 'counter').dispatchEvent(mouse('mousedown', { ctrlKey: true }));
    window.dispatchEvent(mouse('mouseup'));
    expect(selection.ids()).toEqual(['ev']);
  });

  it('treats Shift+click as Ctrl+click, because a range means nothing on a picture', () => {
    mountWith();
    press(nodeGroup(host, 'ev'));

    nodeGroup(host, 'src').dispatchEvent(mouse('mousedown', { shiftKey: true }));
    window.dispatchEvent(mouse('mouseup'));

    expect(selection.ids()).toEqual(['ev', 'src']);
  });

  it('collapses the set back to one node on a plain click', () => {
    mountWith();
    selection.selectAll(['ev', 'counter', 'src'], { source: 'outline' });

    press(nodeGroup(host, 'counter'));

    expect(selection.ids()).toEqual(['counter']);
  });

  it('rings every selected node, and marks the primary with a ring of its own', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    expect(ringOf('ev')).not.toBeNull();
    expect(ringOf('counter')).not.toBeNull();
    expect(ringOf('src')).toBeNull();
    const primary = selection.get();
    const other = primary === 'ev' ? 'counter' : 'ev';
    expect(nodeGroup(host, primary).classList.contains('mm-node--primary')).toBe(true);
    expect(nodeGroup(host, other).classList.contains('mm-node--primary')).toBe(false);
  });

  it('leaves one selected node looking exactly as it always did', () => {
    mountWith();
    selection.set('ev', { source: 'outline' });
    expect(nodeGroup(host, 'ev').classList.contains('mm-node--selected')).toBe(true);
    expect(nodeGroup(host, 'ev').classList.contains('mm-node--primary')).toBe(false);
  });

  it('takes the quick-add handles away while more than one node is selected', () => {
    mountWith();
    selection.set('ev', { source: 'outline' });
    expect(host.querySelectorAll('.mm-canvas__handle').length).toBeGreaterThan(0);

    selection.toggle('counter', { source: 'canvas' });
    expect(host.querySelectorAll('.mm-canvas__handle')).toHaveLength(0);

    selection.clearToPrimary({ source: 'canvas' });
    expect(host.querySelectorAll('.mm-canvas__handle').length).toBeGreaterThan(0);
  });

  it('drags the whole set when one of its nodes is dragged, as one undo step', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    dragTo('ev', middleOf('src'));

    expect(history.current().nodes.src.children).toEqual(['ev', 'counter']);
    expect(announce).toHaveBeenLastCalledWith("Moved 2 nodes into 'Sources'.");
    expect(selection.ids()).toEqual(['ev', 'counter']);

    history.undo();
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
  });

  it('drags only the node under the pointer when it is not in the set', () => {
    mountWith();
    selection.selectAll(['counter', 'src'], { source: 'outline' });

    dragTo('ev', middleOf('src'));

    expect(history.current().nodes.src.children).toEqual(['ev']);
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Sources'.");
  });

  it('never offers a node of the set as the target for the set', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });
    const before = history.current();

    // Dropped on its own neighbour, which is moving too: there is nowhere for the block to land.
    dragTo('ev', middleOf('counter'));

    expect(history.current()).toBe(before);
  });

  it('refuses the whole set when the target is inside one of them, in one sentence', () => {
    mountWith();
    selection.selectAll(['arg', 'src'], { source: 'outline' });

    dragTo('src', middleOf('ev'));

    expect(notified).toHaveBeenLastCalledWith('2 nodes cannot move into their own branch.');
  });

  it('shows every node of the set as moving while the drag is on', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    dragTo('ev', middleOf('src'), { release: false });

    expect(nodeGroup(host, 'ev').classList.contains('mm-node--dragging')).toBe(true);
    expect(nodeGroup(host, 'counter').classList.contains('mm-node--dragging')).toBe(true);
    expect(nodeGroup(host, 'counter').getAttribute('transform')).not.toBeNull();

    window.dispatchEvent(mouse('mouseup', middleOf('src')));
    expect(host.querySelector('.mm-node--dragging')).toBeNull();
    expect(nodeGroup(host, 'counter').getAttribute('transform')).toBeNull();
  });

  it('puts every node of an abandoned set drag back where the layout had it', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });
    dragTo('ev', middleOf('src'), { release: false });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(host.querySelector('.mm-node--dragging')).toBeNull();
    expect(nodeGroup(host, 'ev').getAttribute('transform')).toBeNull();
    expect(nodeGroup(host, 'counter').getAttribute('transform')).toBeNull();
  });

  it('drops a set between two siblings, keeping their order', () => {
    mountWith();
    history.apply('addChild', { parentId: 'src', node: { id: 'book', text: 'A book' } });
    history.apply('addChild', { parentId: 'src', node: { id: 'paper', text: 'A paper' } });
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    const box = nodeGroup(host, 'paper').querySelector('rect.mm-node__box');
    dragTo('ev', {
      clientX: Number(box.getAttribute('x')) + 4,
      clientY: Number(box.getAttribute('y')) + 1,
    });

    expect(history.current().nodes.src.children).toEqual(['book', 'ev', 'counter', 'paper']);
  });

  it('collapses the set to the node being named when the inline editor opens', () => {
    mountWith();
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    nodeGroup(host, 'ev').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );

    expect(selection.ids()).toEqual(['ev']);
    expect(host.querySelector('.mm-canvas__editor')).not.toBeNull();
  });
});

/**
 * Which half of the pointer answers a press.
 *
 * These are written against d3-drag's REAL event contract, because the defect they exist for could
 * not be seen any other way: d3-drag takes the mousedown on the node, calls
 * `stopImmediatePropagation` on it, and then listens for the movement and the release on the WINDOW.
 * So a press is `mousedown` on the group and `mouseup` on the window, never on the group; and a
 * press it refuses (Ctrl, Command, Shift, any button but the left one) reaches no drag at all, which
 * is why the real d3-drag is mounted here rather than a stub of it.
 *
 * jsdom will dispatch whatever it is handed, so none of this PROVES the browser. The proof is the
 * Playwright case "a plain click on an unselected node selects it alone"; these keep the rule from
 * drifting between runs of it.
 */
describe('canvas pane — press and release', () => {
  let host;
  let history;
  let selection;
  let announce;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    pane = mountCanvasPane(host, { history, selection, announce });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const middleOf = id => {
    const box = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      clientX: Number(box.getAttribute('x')) + Number(box.getAttribute('width')) / 2,
      clientY: Number(box.getAttribute('y')) + Number(box.getAttribute('height')) / 2,
    };
  };

  /** The button going down on a node, and nothing else yet. */
  const pressDown = (id, init = {}) =>
    nodeGroup(host, id).dispatchEvent(mouse('mousedown', { ...middleOf(id), ...init }));

  /** The button coming up — on the window, where d3-drag listens for it. */
  const release = (id, init = {}) =>
    window.dispatchEvent(mouse('mouseup', { ...middleOf(id), ...init }));

  /** The pointer moving — on the window, where d3-drag listens for it. */
  const moveTo = id => window.dispatchEvent(mouse('mousemove', middleOf(id)));

  it('selects a node that was not selected the moment the button goes down', () => {
    selection.set('src', { source: 'outline' });

    pressDown('ev');

    // On the press, not on the release: a student who presses and holds sees the node marked.
    expect(selection.ids()).toEqual(['ev']);
    release('ev');
    expect(selection.ids()).toEqual(['ev']);
  });

  it('holds off on a node that is already in a set, and collapses on the release', () => {
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    pressDown('ev');
    // Still the whole set, because this press may be about to drag all of it.
    expect(selection.ids()).toEqual(['ev', 'counter']);

    release('ev');
    expect(selection.ids()).toEqual(['ev']);
  });

  it('never collapses the set when the press turned into a drag', () => {
    selection.selectAll(['ev', 'counter'], { source: 'outline' });

    pressDown('ev');
    moveTo('src');
    release('src');

    expect(selection.ids()).toEqual(['ev', 'counter']);
    expect(history.current().nodes.src.children).toEqual(['ev', 'counter']);
  });

  it('starts no drag at all for a Ctrl, Command or Shift press', () => {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      selection.set('ev', { source: 'outline' });
      pressDown('counter', modifier);
      // A press the drag turned down: the node is in the set, and moving the mouse moves nothing.
      expect(selection.ids()).toEqual(['ev', 'counter']);
      moveTo('src');
      expect(host.querySelector('.mm-node--dragging')).toBeNull();
      expect(nodeGroup(host, 'counter').getAttribute('transform')).toBeNull();
      release('src');
      expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    }
  });

  it('ignores a press that is not the left button', () => {
    selection.set('src', { source: 'outline' });

    pressDown('ev', { button: 1 });
    moveTo('arg');

    // No drag, and the press still means "this node": there is nothing else it could mean.
    expect(selection.ids()).toEqual(['ev']);
    expect(host.querySelector('.mm-node--dragging')).toBeNull();
  });

  it('selects the centre on a press but never drags it, and raises nothing', () => {
    const before = history.current();

    expect(() => {
      pressDown(ROOT_ID);
      moveTo('ev');
      // Checked while the button is still down: the drag never began, so the centre is not marked as
      // moving and it is not offset from where the layout put it. Left to start, the gesture picks
      // the centre up, carries it, refuses every drop it is offered (everything is inside it) and
      // puts it back — a node that visibly moves and then says it cannot.
      expect(host.querySelector('.mm-node--dragging')).toBeNull();
      expect(nodeGroup(host, ROOT_ID).getAttribute('transform')).toBeNull();
      release('ev');
    }).not.toThrow();

    expect(selection.ids()).toEqual([ROOT_ID]);
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('cannot move'));
    expect(history.current()).toBe(before);
  });

  it('drags the rest of a set that holds the centre, and leaves the centre where it is', () => {
    selection.selectAll([ROOT_ID, 'ev'], { source: 'outline' });

    pressDown('ev');
    moveTo('src');
    release('src');

    expect(history.current().nodes.src.children).toEqual(['ev']);
    expect(history.current().nodes[ROOT_ID].parentId).toBeNull();
    expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Sources'.");
  });
});

describe('canvas pane — the field when the map moves under it', () => {
  let host;
  let history;
  let selection;
  let announce;
  let focus;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    // Mounted the way the page mounts it: over the seam, so the pane draws whatever is on screen and
    // writes to the map either way.
    focus = mountBranchFocus(document.createElement('div'), {
      history,
      selection,
      announce,
      notify: announce,
    });
    pane = mountCanvasPane(host, { history: focus.history, selection, announce });
  });

  afterEach(() => {
    pane.destroy();
    focus.destroy();
    host.remove();
  });

  const openOn = id => {
    nodeGroup(host, id).dispatchEvent(mouse('dblclick'));
    return host.querySelector('input.mm-canvas__editor');
  };

  it('follows an undo that changed the node under it', () => {
    const input = openOn('src');
    // Half typed, and never committed: this field writes nothing until it does.
    input.value = 'Mine';
    // Somebody else renames the same node — the field is left alone, as it always has been.
    history.apply('setText', { id: 'src', text: 'Theirs' });
    expect(input.value).toBe('Mine');

    // The student's own step back over that rename. The map is what they asked for.
    history.undo();

    expect(host.querySelector('input.mm-canvas__editor')).toBe(input);
    expect(input.value).toBe('Sources');
  });

  it('leaves a half-typed name alone when the step was somebody else’s', () => {
    const input = openOn('src');
    history.apply('setText', { id: 'arg', text: 'Argument one' });
    input.value = 'Half typed';

    history.undo();

    expect(input.value).toBe('Half typed');
  });

  it('keeps the name when the node leaves the branch rather than the map', () => {
    focus.focusOn('arg');
    const input = openOn('ev');
    input.value = 'The evidence';

    // A real edit: the node moves out of the branch on screen, and is still on the student's map.
    focus.history.apply('outdent', { id: 'ev' });

    expect(host.querySelector('input.mm-canvas__editor')).toBeNull();
    expect(history.current().nodes.ev.text).toBe('The evidence');
    expect(announce).toHaveBeenCalledWith("Kept 'The evidence'. It is outside this branch now.");
    expect(announce).not.toHaveBeenCalledWith('The node you were naming was removed.');
  });

  it('says a node that left the branch with nothing typed is outside it, not removed', () => {
    focus.focusOn('arg');
    openOn('ev').value = '';

    focus.history.apply('outdent', { id: 'ev' });

    expect(announce).toHaveBeenCalledWith('The node you were naming is outside this branch now.');
  });

  it('still says a node that really went was removed', () => {
    focus.focusOn('arg');
    const input = openOn('ev');
    input.value = 'Gone';

    history.apply('removeNode', { id: 'ev' });

    expect(announce).toHaveBeenCalledWith('The node you were naming was removed.');
    expect(history.current().nodes.ev).toBeUndefined();
  });
});

/**
 * A press on the canvas ends the edit the student had going somewhere else.
 *
 * The node groups are pressed through the shared event helper, whose `preventDefault` on mousedown
 * is what stops the browser moving the focus — so the keyboard stayed in the panel the student had
 * just left. A click on a node then selected the new node while the Details panel's Text field still
 * held the caret, and the next Backspace edited THAT field: a rename of the wrong node, silently.
 * The field is blurred before the selection moves, so its own flush-on-blur writes to the node it
 * was showing.
 */
describe('canvas pane — a press that ends an edit elsewhere on the page', () => {
  let host;
  let history;
  let selection;
  let pane;
  let elsewhere;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
    if (elsewhere) {
      elsewhere.remove();
      elsewhere = null;
    }
  });

  /** A field on the page outside the canvas, holding the keyboard: the Details panel, in miniature. */
  const focusOutside = (tag, type = null) => {
    elsewhere = document.createElement(tag);
    if (type) {
      elsewhere.type = type;
    }
    if (tag === 'select') {
      elsewhere.appendChild(document.createElement('option'));
    }
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    return elsewhere;
  };

  /** The pane's own root, which is where the keyboard is put when a field has to give it up. */
  const paneRoot = () => host.querySelector('.mm-canvas');

  for (const [what, tag, type] of [
    ['a text field', 'input', 'text'],
    ['a textarea', 'textarea', null],
    ['the find box', 'input', 'search'],
  ]) {
    it(`blurs ${what} outside the canvas when a node is pressed`, () => {
      const field = focusOutside(tag, type);
      expect(document.activeElement).toBe(field);

      press(nodeGroup(host, 'src'));

      expect(document.activeElement).not.toBe(field);
    });
  }

  /*
   * Where the keyboard LANDS is half the fix. A blur on its own left it on `document.body`, which is
   * nobody: the Details panel's own rescue looks for one of its fields holding the focus and by then
   * none did, so nothing flushed on its behalf, and the student's next Tab started again at the top of
   * the page instead of carrying on from the map they had just pressed.
   */
  it('puts the keyboard on the pane itself rather than dropping it on the document', () => {
    focusOutside('input', 'text');

    press(nodeGroup(host, 'src'));

    expect(document.activeElement).toBe(paneRoot());
    expect(document.activeElement.tagName).not.toBe('BODY');
  });

  it('is reachable by script and not by Tab, so the picture is still not a tab stop', () => {
    expect(paneRoot().tabIndex).toBe(-1);
  });

  // The ring is the keyboard's. A press is the student looking at what they pressed, not asking
  // where they are, so `:focus-visible` carries it and a plain `:focus` draws nothing.
  it('draws its focus ring for the keyboard only', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../../src/pages/mind-map/canvas-pane.css'),
      'utf8'
    );
    const ruleFor = selector => {
      const at = css.indexOf(`${selector} {`);
      expect(at).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };

    expect(ruleFor('.mm-canvas:focus')).toContain('outline: none');
    expect(ruleFor('.mm-canvas:focus-visible')).toContain('outline: 3px solid var(--mm-focus');
  });

  // A select wrote its answer the moment the student chose one: there is nothing pending for a blur
  // to flush, so taking the keyboard off it would be this pane deciding where the student is.
  it('leaves a select outside the canvas holding the keyboard alone', () => {
    const chooser = focusOutside('select');

    press(nodeGroup(host, 'src'));

    expect(document.activeElement).toBe(chooser);
  });

  // The order is the whole point: the field commits against the node it was showing, not the node
  // the press has just selected.
  it('blurs it before the selection changes', () => {
    const field = focusOutside('input', 'text');
    const order = [];
    field.addEventListener('blur', () => order.push('blur'));
    const unsubscribe = selection.subscribe(() => order.push('selection'));

    press(nodeGroup(host, 'src'));
    unsubscribe();

    expect(order).toEqual(['blur', 'selection']);
  });

  it('does the same for a press on the canvas background', () => {
    const field = focusOutside('input', 'text');

    pane.getSvgElement().dispatchEvent(mouse('mousedown'));
    window.dispatchEvent(mouse('mouseup'));

    expect(document.activeElement).not.toBe(field);
  });

  // Only the fields that write what they hold when they lose focus: taking the keyboard off anything
  // else would be this pane deciding where the student is.
  it('leaves a button outside the canvas holding the keyboard alone', () => {
    const button = focusOutside('button');

    press(nodeGroup(host, 'src'));

    expect(document.activeElement).toBe(button);
  });

  // The canvas's own rename field is inside the canvas: a press in it places a caret.
  it('never takes the keyboard out of this pane own inline editor', () => {
    nodeGroup(host, 'src').dispatchEvent(mouse('dblclick'));
    const input = host.querySelector('input.mm-canvas__editor');

    input.dispatchEvent(mouse('mousedown'));

    expect(document.activeElement).toBe(input);
  });
});

/**
 * The inline editor when something else takes it away.
 *
 * Closing it used to suppress the commit: the field was settled before the input was removed, so the
 * blur a removal raises had nothing left to write. Starting a drag elsewhere while renaming threw
 * the typed name away, and a node a quick-add handle had just made stayed on the map with no name at
 * all. Every way out other than Escape now commits by the same rules as Enter.
 */
describe('canvas pane — the field when something else takes it away', () => {
  let host;
  let history;
  let selection;
  let announce;
  let notified;
  let createNode;
  let serial;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    announce = jest.fn();
    notified = jest.fn();
    serial = 0;
    createNode = jest.fn((id, { asChild } = {}) => {
      const mark = history.mark();
      serial += 1;
      const fresh = `fresh-${serial}`;
      history.apply(
        asChild ? 'addChild' : 'addSibling',
        asChild
          ? { parentId: id, node: { id: fresh, text: '' } }
          : { siblingId: id, node: { id: fresh, text: '' } },
        { mark }
      );
      selection.set(fresh, { source: 'outline' });
      return { id: fresh, original: '', caret: 0, created: true, from: id, mark };
    });
    pane = mountCanvasPane(host, { history, selection, announce, notify: notified, createNode });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const openOn = id => {
    nodeGroup(host, id).dispatchEvent(mouse('dblclick'));
    return host.querySelector('input.mm-canvas__editor');
  };
  const editorInput = () => host.querySelector('input.mm-canvas__editor');
  const handle = kind => host.querySelector(`button[data-add-for="${kind}"]`);
  const blank = () =>
    Object.values(history.current().nodes).filter(node => node.text.trim() === '');

  it('commits the typed name when a drag elsewhere on the map closes it', () => {
    const input = openOn('src');
    input.value = 'Reading list';

    press(nodeGroup(host, 'arg'));

    expect(editorInput()).toBeNull();
    expect(history.current().nodes.src.text).toBe('Reading list');
  });

  it('commits the typed name when a double-click opens the field on another node', () => {
    const input = openOn('src');
    input.value = 'Reading list';

    openOn('arg');

    expect(history.current().nodes.src.text).toBe('Reading list');
    expect(editorInput().value).toBe('Argument');
  });

  it('keeps the old name, and says so, when an emptied field is closed that way', () => {
    const before = history.current();
    const input = openOn('src');
    input.value = '   ';

    press(nodeGroup(host, 'arg'));

    expect(history.current()).toBe(before);
    expect(notified).toHaveBeenLastCalledWith("A node needs a name. Kept 'Sources'.");
  });

  it('leaves no nameless node behind when a double-click closes a brand-new field', () => {
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter', 'fresh-1']);

    openOn('src');

    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    expect(blank()).toEqual([]);
    expect(notified).toHaveBeenCalledWith('New node discarded');
  });

  it('keeps a brand-new name, as one undo step, when a drag closes its field', () => {
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    editorInput().value = 'A quotation';

    press(nodeGroup(host, 'src'));

    expect(history.current().nodes['fresh-1'].text).toBe('A quotation');
    history.undo();
    expect(history.current().nodes['fresh-1']).toBeUndefined();
  });

  // The field can also be taken away by the map moving under it. A name is kept in that case; a node
  // that never got one is a blank box, and no way out of this field leaves one of those behind.
  it('throws away a nameless new node when a fold takes its field away', () => {
    selection.set('arg', { source: 'canvas' });
    press(handle('child'));
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter', 'fresh-1']);

    history.apply('toggleCollapsed', { id: 'arg' });

    expect(editorInput()).toBeNull();
    expect(history.current().nodes['fresh-1']).toBeUndefined();
    expect(blank()).toEqual([]);
    expect(notified).toHaveBeenCalledWith('New node discarded');
    // The fold is the student's own step, and discarding the node they never named leaves it alone.
    expect(history.current().nodes.arg.collapsed).toBe(true);
  });
});

/**
 * Zooming with a node selected.
 *
 * The buttons zoomed about the middle of the view, which walks the thing the student has selected
 * off the edge a step at a time: they press Zoom in to look closer at the node they have just
 * chosen, and it leaves the view. The selection is the anchor when there is one.
 */
describe('canvas pane — what the zoom buttons hold still', () => {
  let host;
  let history;
  let selection;
  let pane;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  });

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const view = () => {
    const attribute = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    const [, tx, ty, k] = attribute.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
    return { tx: Number(tx), ty: Number(ty), k: Number(k) };
  };

  it('holds the selected node where it is, at both ends of the zoom', () => {
    // 'canvas' as the source, so the selection itself moves nothing and the zoom is what is graded.
    selection.set('src', { source: 'canvas' });

    for (const label of ['Zoom in', 'Zoom out', 'Zoom out']) {
      const before = centreOnScreen(host, pane, 'src');
      press(zoomButton(host, label));
      const after = centreOnScreen(host, pane, 'src');
      expect(after.x).toBeCloseTo(before.x, 3);
      expect(after.y).toBeCloseTo(before.y, 3);
    }
  });

  it('brings a selected node that has gone off the edge back into the view', () => {
    for (let step = 0; step < 5; step += 1) {
      press(zoomButton(host, 'Zoom in'));
    }
    selection.set('src', { source: 'canvas' });
    expect(centreOnScreen(host, pane, 'src').x).toBeLessThan(0);

    press(zoomButton(host, 'Zoom in'));

    expect(centreOnScreen(host, pane, 'src').x).toBeCloseTo(VIEW_CENTRE.x, 3);
    expect(centreOnScreen(host, pane, 'src').y).toBeCloseTo(VIEW_CENTRE.y, 3);
  });

  it('holds the middle of the view when nothing is selected', () => {
    const before = view();

    press(zoomButton(host, 'Zoom in'));

    const after = view();
    const ratio = after.k / before.k;
    expect(after.tx).toBeCloseTo(VIEW_CENTRE.x - (VIEW_CENTRE.x - before.tx) * ratio, 3);
    expect(after.ty).toBeCloseTo(VIEW_CENTRE.y - (VIEW_CENTRE.y - before.ty) * ratio, 3);
  });
});

/**
 * The quick-add handles when there is no room beside the node.
 *
 * Outside the box is the right place for them, and on an ordinary map fitted to the view it is
 * often taken: a wider sibling below the node reaches into the column the handles would use, so the
 * only two ways of making a node with a pointer disappeared from part of a seventeen-node map. The
 * fallback is the node's own box — the one rectangle that belongs to the selected node and to
 * nothing else — and only where even that cannot hold them are they taken away.
 */
describe('canvas pane — the handles fall back inside the node', () => {
  let host;
  let history;
  let selection;
  let pane;

  /** Root, four branches, three points each: seventeen nodes, which fit the view at life size. */
  function essayMap() {
    let map = makeMap();
    for (const id of ['arg', 'src']) {
      map = removeNode(map, { id });
    }
    for (let branch = 0; branch < 4; branch += 1) {
      const top = `b${branch}`;
      map = addChild(map, { parentId: ROOT_ID, node: { id: top, text: `Branch ${branch}` } });
      for (let point = 0; point < 3; point += 1) {
        map = addChild(map, {
          parentId: top,
          // A longer name on the middle point, so its box reaches into the column beside its sibling.
          node: {
            id: `${top}p${point}`,
            text: point === 1 ? `Point ${branch}.1 in full` : `P${point}`,
          },
        });
      }
    }
    return map;
  }

  const mountWith = (map = essayMap()) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory(map);
    selection = createSelectionStub();
    pane = mountCanvasPane(host, { history, selection, announce: jest.fn() });
  };

  afterEach(() => {
    pane.destroy();
    host.remove();
  });

  const view = () => {
    const attribute = pane
      .getSvgElement()
      .querySelector('.mm-canvas__viewport')
      .getAttribute('transform');
    const [, tx, ty, k] = attribute.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
    return { tx: Number(tx), ty: Number(ty), k: Number(k) };
  };

  const overlaps = (a, b) =>
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height;

  const rectOf = element => ({
    element,
    left: parseFloat(element.style.left),
    top: parseFloat(element.style.top),
    width: parseFloat(element.style.width),
    height: parseFloat(element.style.height),
  });

  const shownRects = selector =>
    [...host.querySelectorAll(selector)].filter(element => !element.hidden).map(rectOf);

  /** A node's box as the student sees it. */
  const boxOnScreen = id => {
    const { tx, ty, k } = view();
    const rect = nodeGroup(host, id).querySelector('rect.mm-node__box');
    return {
      left: tx + k * Number(rect.getAttribute('x')),
      top: ty + k * Number(rect.getAttribute('y')),
      width: k * Number(rect.getAttribute('width')),
      height: k * Number(rect.getAttribute('height')),
    };
  };

  it('offers a handle on every node of a map fitted to the view', () => {
    mountWith();
    const ids = [...host.querySelectorAll('.mm-node')].map(group => group.dataset.nodeId);
    const bare = [];

    for (const id of ids) {
      selection.set(id, { source: 'canvas' });
      if (shownRects('button[data-add-for]').length === 0) {
        bare.push(id);
      }
    }

    expect(bare).toEqual([]);
  });

  it('puts them inside the node own box, clear of each other and of its badge', () => {
    mountWith();
    // A leaf whose wider sibling below reaches into the column outside its box.
    selection.set('b0p0', { source: 'canvas' });
    const box = boxOnScreen('b0p0');
    const shown = shownRects('button[data-add-for]');

    expect(shown).toHaveLength(2);
    for (const handle of shown) {
      expect({ width: handle.width, height: handle.height }).toEqual({ width: 24, height: 24 });
      // Inside the one rectangle that belongs to this node and to nothing else.
      expect(handle.left).toBeGreaterThanOrEqual(box.left);
      expect(handle.left + handle.width).toBeLessThanOrEqual(box.left + box.width);
      for (const toggle of shownRects('button.mm-canvas__toggle')) {
        expect(overlaps(handle, toggle)).toBe(false);
      }
      for (const other of shown) {
        if (other.element !== handle.element) {
          expect(overlaps(handle, other)).toBe(false);
        }
      }
    }
  });

  it('still prefers the room beside the node when there is any', () => {
    mountWith();
    selection.set('b0', { source: 'canvas' });
    const box = boxOnScreen('b0');

    const shown = shownRects('button[data-add-for]');

    expect(shown).toHaveLength(2);
    for (const handle of shown) {
      expect(handle.left).toBeGreaterThanOrEqual(box.left + box.width);
    }
  });

  it('takes them away when even the node own box is too small to hold them', () => {
    mountWith();
    for (let step = 0; step < 6; step += 1) {
      press(zoomButton(host, 'Zoom out'));
    }
    selection.set('b0p0', { source: 'canvas' });

    expect(shownRects('button[data-add-for]')).toHaveLength(0);
  });

  /*
   * The strip of the node left over beside the row. It is the node's own target: a double-click
   * there renames it and a press there starts the drag, so a row that fills the box takes both.
   * Thirteen pixels of it was what the fallback left on a middling box, which is no target at all.
   */
  it('leaves the node at least 24px of its own width wherever it puts the row on it', () => {
    mountWith();
    const ids = [...host.querySelectorAll('.mm-node')].map(group => group.dataset.nodeId);
    let seen = 0;

    for (let step = 0; step < 5; step += 1) {
      if (step > 0) {
        press(zoomButton(host, 'Zoom out'));
      }
      for (const id of ids) {
        selection.set(id, { source: 'canvas' });
        const box = boxOnScreen(id);
        const inside = shownRects('button[data-add-for]').filter(
          handle => handle.left >= box.left && handle.left < box.left + box.width
        );
        if (inside.length === 0) {
          continue;
        }
        seen += 1;
        const end = Math.max(...inside.map(handle => handle.left + handle.width));
        expect(box.left + box.width - end).toBeGreaterThanOrEqual(24);
      }
    }

    // The rule is only worth anything if the placement it governs is really being used.
    expect(seen).toBeGreaterThan(0);
  });

  /*
   * `handlesFit` lets the row sit on the selected node's own BOX. Its badge is not part of that
   * permission: a handle over it takes the press that would have opened the branch, and the node
   * whose branch it is is exactly the node the handles are on.
   */
  it('keeps the row off every collapse badge, the selected node own included', () => {
    mountWith();
    const ids = [...host.querySelectorAll('.mm-node')].map(group => group.dataset.nodeId);

    for (let step = 0; step < 5; step += 1) {
      if (step > 0) {
        press(zoomButton(host, 'Zoom out'));
      }
      for (const id of ids) {
        selection.set(id, { source: 'canvas' });
        for (const handle of shownRects('button[data-add-for]')) {
          for (const toggle of shownRects('button.mm-canvas__toggle')) {
            expect(overlaps(handle, toggle)).toBe(false);
          }
        }
      }
    }
  });

  /**
   * The band the two rules meet in: a parent whose box is drawn wide enough for a 54px row and for
   * nothing else. Its badge is on the last twelve pixels of it, and what would be left of the node
   * itself is a strip too thin to aim at — so the row does not go on this box at all, at any point
   * between 54 and 65 pixels.
   *
   * Short names, so every branch box is the layout's own 80px minimum, and one step of the zoom out
   * from the fitted picture draws them at 61.5.
   */
  it('refuses the node own box to a parent drawn between 54 and 65px wide', () => {
    let map = makeMap();
    for (const id of ['arg', 'src']) {
      map = removeNode(map, { id });
    }
    for (let branch = 0; branch < 4; branch += 1) {
      const top = `b${branch}`;
      map = addChild(map, { parentId: ROOT_ID, node: { id: top, text: `Aim ${branch}` } });
      for (let point = 0; point < 3; point += 1) {
        map = addChild(map, {
          parentId: top,
          node: { id: `${top}p${point}`, text: point === 1 ? 'A point in full' : `P${point}` },
        });
      }
    }
    mountWith(map);
    press(zoomButton(host, 'Zoom out'));

    for (let branch = 0; branch < 4; branch += 1) {
      const id = `b${branch}`;
      selection.set(id, { source: 'canvas' });
      const box = boxOnScreen(id);
      // The band this case is about, stated so the test cannot drift off it silently.
      expect(box.width).toBeGreaterThanOrEqual(54);
      expect(box.width).toBeLessThanOrEqual(65);
      expect(history.current().nodes[id].children).toHaveLength(3);

      for (const handle of shownRects('button[data-add-for]')) {
        expect(overlaps(handle, box)).toBe(false);
        for (const toggle of shownRects('button.mm-canvas__toggle')) {
          expect(overlaps(handle, toggle)).toBe(false);
        }
      }
    }
  });
});
