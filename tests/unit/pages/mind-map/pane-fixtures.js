/**
 * Shared fixtures for the mind map editor pane tests.
 *
 * The panes are built against a real `createHistory` — undo, coalescing and the subscription are
 * the contract they hold with the outline pane, and a mock of those would only prove the mock. The
 * selection store is real for the same reason: it holds an ordered set with a primary, and every
 * pane now asks it what is in that set.
 */

import { createHistory } from '../../../../src/features/mindMap/core/history.js';
import { createSelection } from '../../../../src/pages/mind-map/selection.js';
import { createMap } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild } from '../../../../src/features/mindMap/core/map-ops.js';

export const ROOT_ID = 'm1-root';

/**
 * An essay-plan map: a root with two branches, one of which has two children.
 *
 * @returns {Object} a valid map.
 */
export function makeMap() {
  let map = createMap({ id: 'm1', title: 'Essay plan', rootText: 'Essay plan' });
  map = addChild(map, { parentId: ROOT_ID, node: { id: 'arg', text: 'Argument' } });
  map = addChild(map, { parentId: 'arg', node: { id: 'ev', text: 'Evidence' } });
  map = addChild(map, { parentId: 'arg', node: { id: 'counter', text: 'Counterpoint' } });
  map = addChild(map, { parentId: ROOT_ID, node: { id: 'src', text: 'Sources' } });
  return map;
}

/**
 * @param {Object} [map] - defaults to {@link makeMap}.
 * @returns {Object} a real history instance with a clock the test drives.
 */
export function makeHistory(map = makeMap()) {
  let clock = 0;
  const history = createHistory(map, { now: () => (clock += 1000) });
  return history;
}

/**
 * The real selection store, which is an ordered set with a primary and an anchor.
 *
 * Stubbed to three methods while it held one id; a stub of the set would only prove the stub — the
 * panes now ask it which nodes are in the selection and get it to extend, toggle and collapse one,
 * and those are the answers the pane tests are about.
 *
 * @param {string|null} [initial]
 * @param {{history?: Object}} [options] - with a history, the store prunes itself after every change
 *   to the map, exactly as it does on the page.
 * @returns {Object} a `createSelection` instance.
 */
export function createSelectionStub(initial = null, options = {}) {
  return createSelection(initial, options);
}

/** A mouse event d3-drag can read: it reaches for `event.view` and throws on a bare MouseEvent. */
export const mouse = (type, init = {}) =>
  new window.MouseEvent(type, { bubbles: true, cancelable: true, view: window, ...init });

/**
 * Activate a control the way a keyboard student does: Enter on the focused element.
 *
 * `element.click()` proves nothing here. The shared event helper binds `mousedown` and `keydown`,
 * never `click`, so a dispatched click would run no handler at all — and a button that only a
 * pointer can reach is the defect this helper exists to catch.
 */
export function activate(element) {
  element.focus();
  element.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

/** Press an element the way the shared event helper listens for it. */
export function press(element) {
  element.dispatchEvent(mouse('mousedown'));
  // d3-drag arms a window-level gesture on mousedown; releasing keeps one test from leaking a
  // half-finished drag into the next.
  window.dispatchEvent(mouse('mouseup'));
}
