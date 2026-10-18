/**
 * Custom Cursor — the replacement cursor must keep tracking on pages that own the pointer.
 *
 * Google Docs stops mousemove propagation at its editor, so a bubble-phase listener on
 * `document` never fires: the system cursor is hidden and the replacement never moves.
 */

jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: jest.fn(),
}));

import { initFeatureSettings } from '../../../src/content/utils/storage-utils.js';

const CROSSHAIR = { enabled: true, size: 32, style: 'crosshair', color: '#ff0000' };

function loadFeature() {
  jest.isolateModules(() => {
    require('../../../src/features/customCursor/custom-cursor.js');
  });
  const [, , onInit, onChange] = initFeatureSettings.mock.calls[0];
  return { onInit, onChange };
}

const cursor = () => document.getElementById('assist-custom-cursor');

/** A page element that swallows mousemove the way a canvas editor does. */
function greedyTarget() {
  const el = document.createElement('div');
  el.addEventListener('mousemove', e => e.stopPropagation());
  document.body.appendChild(el);
  return el;
}

function moveOver(el, x, y) {
  el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.style.cursor = '';
});

describe('custom cursor', () => {
  test('tracks the pointer even when the page stops mousemove propagation', () => {
    const { onInit } = loadFeature();
    onInit(CROSSHAIR);

    moveOver(greedyTarget(), 200, 150);

    expect(cursor().style.left).toBe('184px');
    expect(cursor().style.top).toBe('134px');
  });

  test('hides the system cursor while enabled and restores it when disabled', () => {
    const { onInit, onChange } = loadFeature();
    onInit(CROSSHAIR);
    expect(document.getElementById('assist-cursor-hide-style')).not.toBeNull();
    expect(document.body.style.cursor).toBe('none');

    onChange({ ...CROSSHAIR, enabled: false });
    expect(cursor()).toBeNull();
    expect(document.getElementById('assist-cursor-hide-style')).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  test('switching off leaves no empty style attribute on the body', () => {
    const { onInit, onChange } = loadFeature();
    document.body.removeAttribute('style');

    onInit(CROSSHAIR);
    onChange({ ...CROSSHAIR, enabled: false });

    // `style.cursor = ''` empties the declaration but leaves `style=""` sitting on the
    // page's body, which is a leftover the student cannot clear without a reload.
    expect(document.body.hasAttribute('style')).toBe(false);
  });

  test('switching off keeps inline styles the page set for itself', () => {
    const { onInit, onChange } = loadFeature();
    document.body.setAttribute('style', 'background-color: red;');

    onInit(CROSSHAIR);
    onChange({ ...CROSSHAIR, enabled: false });

    expect(document.body.style.backgroundColor).toBe('red');
    expect(document.body.style.cursor).toBe('');
  });

  test('a size change while enabled repositions with the new size', () => {
    const { onInit, onChange } = loadFeature();
    onInit(CROSSHAIR);
    onChange({ ...CROSSHAIR, size: 48 });

    moveOver(greedyTarget(), 100, 100);

    expect(cursor().style.left).toBe('76px');
    expect(cursor().style.top).toBe('76px');
    expect(cursor().style.width).toBe('48px');
  });

  test('the listener is removed with the same capture option it was added with', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const { onInit, onChange } = loadFeature();
    onInit(CROSSHAIR);
    onChange({ ...CROSSHAIR, enabled: false });

    const added = add.mock.calls.find(([type]) => type === 'mousemove');
    const removed = remove.mock.calls.find(([type]) => type === 'mousemove');
    expect(added[2]).toEqual(expect.objectContaining({ capture: true }));
    expect(removed[1]).toBe(added[1]);
    expect(removed[2]).toBe(added[2]);
    add.mockRestore();
    remove.mockRestore();
  });
});
