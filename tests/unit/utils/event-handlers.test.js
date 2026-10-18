/**
 * Unit tests for the shared event-handler utilities.
 *
 * Two contracts are pinned here:
 *  1. The DEFAULT behaviour (mousedown + preventDefault + stopPropagation) that the whole
 *     extension depends on. Any drift breaks every button in the product.
 *  2. The `allowTextSelection` opt-out used by inline text inside host pages, where
 *     preventDefault would cancel the student's own text selection.
 */

import {
  attachInteractiveHandler,
  attachQuietHandler,
  attachHandlerBatch,
  attachAccessibleHandler,
  attachAccessibleDelegatedHandler,
  isChord,
} from '../../../src/utils/event-handlers.js';

/** Dispatch a real event and report whether default/propagation were blocked. */
function fire(element, type, init = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  let propagated = false;
  const onParent = () => {
    propagated = true;
  };
  document.body.addEventListener(type, onParent);
  element.dispatchEvent(event);
  document.body.removeEventListener(type, onParent);
  return { event, defaultPrevented: event.defaultPrevented, propagated };
}

/** Put a real, non-collapsed selection across the given node's contents. */
function selectContentsOf(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('attachInteractiveHandler — default behaviour (unchanged)', () => {
  let button;

  beforeEach(() => {
    document.body.innerHTML = '<button id="btn">Play</button>';
    button = document.getElementById('btn');
    window.getSelection().removeAllRanges();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('activates on mousedown', () => {
    const handler = jest.fn();
    attachInteractiveHandler(button, 'Play', handler);

    fire(button, 'mousedown');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('does NOT activate on click', () => {
    const handler = jest.fn();
    attachInteractiveHandler(button, 'Play', handler);

    fire(button, 'click');

    expect(handler).not.toHaveBeenCalled();
  });

  test('prevents default and stops propagation on mousedown', () => {
    attachInteractiveHandler(button, 'Play', () => {});

    const { defaultPrevented, propagated } = fire(button, 'mousedown');

    expect(defaultPrevented).toBe(true);
    expect(propagated).toBe(false);
  });

  test('activates even while text is selected (buttons must not be selection-gated)', () => {
    const handler = jest.fn();
    attachInteractiveHandler(button, 'Play', handler);
    selectContentsOf(button);

    fire(button, 'mousedown');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('adds hover feedback listeners and cleanup removes every listener', () => {
    const handler = jest.fn();
    const removeSpy = jest.spyOn(button, 'removeEventListener');
    const cleanup = attachInteractiveHandler(button, 'Play', handler);

    fire(button, 'mouseenter');
    expect(button.style.transform).toBe('scale(1.05)');

    cleanup();

    const removed = removeSpy.mock.calls.map(call => call[0]).sort();
    expect(removed).toEqual(['mousedown', 'mouseenter', 'mouseleave']);

    fire(button, 'mousedown');
    expect(handler).toHaveBeenCalledTimes(0);
  });

  test('missing element returns a no-op cleanup and does not throw', () => {
    const cleanup = attachInteractiveHandler(null, 'Nothing', jest.fn());
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  test('handler errors are caught, not thrown at the caller', () => {
    attachInteractiveHandler(button, 'Boom', () => {
      throw new Error('boom');
    });

    expect(() => fire(button, 'mousedown')).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  test('attachQuietHandler keeps mousedown semantics without visual feedback', () => {
    const handler = jest.fn();
    attachQuietHandler(button, 'Close', handler);

    fire(button, 'mouseenter');
    expect(button.style.transform).toBe('');

    const { defaultPrevented } = fire(button, 'mousedown');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(defaultPrevented).toBe(true);
  });
});

describe('attachInteractiveHandler — allowTextSelection', () => {
  let span;
  let handler;

  beforeEach(() => {
    document.body.innerHTML = '<p id="para">before <span id="mark">highlighted text</span> after</p>';
    span = document.getElementById('mark');
    handler = jest.fn();
    window.getSelection().removeAllRanges();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('activates on click, not on mousedown', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    fire(span, 'mousedown');
    expect(handler).not.toHaveBeenCalled();

    fire(span, 'click');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('never prevents default — text selection must survive', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const down = fire(span, 'mousedown');
    const up = fire(span, 'mouseup');
    const click = fire(span, 'click');

    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
    expect(click.defaultPrevented).toBe(false);
  });

  test('stops the activating click from propagating to the host page', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const { propagated } = fire(span, 'click');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(propagated).toBe(false);
  });

  test('does NOT activate when a selection intersects the element', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });
    selectContentsOf(span.firstChild);

    const { propagated } = fire(span, 'click');

    expect(handler).not.toHaveBeenCalled();
    // The student keeps their selection AND the page keeps its click.
    expect(propagated).toBe(true);
    expect(String(window.getSelection())).toBe('highlighted text');
  });

  test('does NOT activate when a selection starting outside ends inside the element', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const para = document.getElementById('para');
    const range = document.createRange();
    range.setStart(para.firstChild, 0);
    range.setEnd(span.firstChild, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fire(span, 'click');

    expect(handler).not.toHaveBeenCalled();
  });

  test('still activates when the selection is elsewhere on the page', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const other = document.createElement('p');
    other.textContent = 'unrelated paragraph';
    document.body.appendChild(other);
    selectContentsOf(other.firstChild);

    fire(span, 'click');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('a collapsed (caret-only) selection does not block activation', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const range = document.createRange();
    range.setStart(span.firstChild, 3);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    fire(span, 'click');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('cleanup removes the click listener — no leak', () => {
    const cleanup = attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    cleanup();
    fire(span, 'click');

    expect(handler).not.toHaveBeenCalled();
  });

  test('handler errors are still caught', () => {
    attachInteractiveHandler(
      span,
      'Annotation Highlight',
      () => {
        throw new Error('boom');
      },
      { allowTextSelection: true }
    );

    expect(() => fire(span, 'click')).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  test('allowTextSelection: false is byte-identical to the default', () => {
    attachInteractiveHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: false,
    });

    const down = fire(span, 'mousedown');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(true);
    expect(down.propagated).toBe(false);

    fire(span, 'click');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('attachHandlerBatch forwards the option to every element', () => {
    document.body.innerHTML =
      '<p><span id="a">one</span><span id="b">two</span></p>';
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const handlerA = jest.fn();
    const handlerB = jest.fn();

    const cleanup = attachHandlerBatch(
      [
        { element: a, label: 'A', handler: handlerA },
        { element: b, label: 'B', handler: handlerB },
      ],
      { allowTextSelection: true }
    );

    fire(a, 'click');
    fire(b, 'click');
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);

    cleanup();
    fire(a, 'click');
    fire(b, 'click');
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});

describe('attachAccessibleHandler', () => {
  let span;
  let handler;

  beforeEach(() => {
    document.body.innerHTML = '<p id="para">before <span id="mark" tabindex="0">highlighted text</span></p>';
    span = document.getElementById('mark');
    handler = jest.fn();
    window.getSelection().removeAllRanges();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  function key(element, k) {
    const event = new window.KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event;
  }

  test('default: mousedown plus Enter/Space keyboard activation', () => {
    attachAccessibleHandler(span, 'Submit', handler);

    fire(span, 'mousedown');
    key(span, 'Enter');
    key(span, ' ');

    expect(handler).toHaveBeenCalledTimes(3);
  });

  test('allowTextSelection: keyboard activation is untouched (SC 2.1.1)', () => {
    attachAccessibleHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    const enter = key(span, 'Enter');
    const space = key(span, ' ');

    expect(handler).toHaveBeenCalledTimes(2);
    // Space must not scroll the page when it activates the element.
    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true);
  });

  test('allowTextSelection: keyboard activation works even with text selected', () => {
    attachAccessibleHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });
    selectContentsOf(span.firstChild);

    key(span, 'Enter');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('cleanup removes both pointer and keyboard listeners', () => {
    const cleanup = attachAccessibleHandler(span, 'Annotation Highlight', handler, {
      allowTextSelection: true,
    });

    cleanup();
    fire(span, 'click');
    key(span, 'Enter');

    expect(handler).not.toHaveBeenCalled();
  });

  test('other keys do nothing', () => {
    attachAccessibleHandler(span, 'Submit', handler);

    key(span, 'a');

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('attachAccessibleDelegatedHandler', () => {
  let list;
  let handler;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="list">
        <div class="card" data-id="c1" tabindex="0">
          <span class="label">A paper</span>
          <button class="act" data-action="copy"><span aria-hidden="true">C</span></button>
        </div>
      </div>`;
    list = document.getElementById('list');
    handler = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  function key(element, k) {
    const event = new window.KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event;
  }

  test('activates on click, on Enter and on Space', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);
    const button = list.querySelector('.act');

    fire(button, 'click');
    key(button, 'Enter');
    key(button, ' ');

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls.every(([, target]) => target === button)).toBe(true);
  });

  test('Enter and Space prevent default, so a native button is not activated twice', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);
    const button = list.querySelector('.act');

    expect(key(button, 'Enter').defaultPrevented).toBe(true);
    expect(key(button, ' ').defaultPrevented).toBe(true);
  });

  test('activates from a child of the target and stops propagation', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);
    const icon = list.querySelector('.act span');

    const { propagated } = fire(icon, 'click');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toBe(list.querySelector('.act'));
    expect(propagated).toBe(false);
  });

  test('a selector list resolves to the nearest match, not the outer one', () => {
    attachAccessibleDelegatedHandler(list, '.act, .card', 'List', handler);

    fire(list.querySelector('.act'), 'click');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1].className).toBe('act');

    key(list.querySelector('.card'), 'Enter');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][1].className).toBe('card');
  });

  test('ignores other keys and events outside the selector', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);

    key(list.querySelector('.act'), 'a');
    fire(list.querySelector('.label'), 'click');

    expect(handler).not.toHaveBeenCalled();
  });

  test('cleanup removes both the click and the keydown listener', () => {
    const cleanup = attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);
    const button = list.querySelector('.act');

    cleanup();
    fire(button, 'click');
    key(button, 'Enter');

    expect(handler).not.toHaveBeenCalled();
  });

  test('works for elements added after attachment', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', handler);
    list.innerHTML = '<div class="card"><button class="act">Later</button></div>';

    key(list.querySelector('.act'), 'Enter');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('missing container returns a no-op cleanup and does not throw', () => {
    const cleanup = attachAccessibleDelegatedHandler(null, '.act', 'Action', handler);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  test('handler errors are caught, not thrown at the caller', () => {
    attachAccessibleDelegatedHandler(list, '.act', 'Action', () => {
      throw new Error('boom');
    });

    expect(() => fire(list.querySelector('.act'), 'click')).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('isChord', () => {
  const press = (key, code) => new window.KeyboardEvent('keydown', { key, code });

  it('matches the letter a Latin layout puts on the key', () => {
    expect(isChord(press('m', 'KeyM'), 'KeyM', 'm')).toBe(true);
    expect(isChord(press('M', 'KeyM'), 'KeyM', 'm')).toBe(true);
  });

  it('matches the physical key when Alt turned the letter into something else', () => {
    // What macOS actually delivers: Option+M is µ, Option+R is ®, Option+Shift+F is Ï. Every Alt
    // shortcut on the mind map page matched on `event.key` alone, so all of them were dead there.
    expect(isChord(press('µ', 'KeyM'), 'KeyM', 'm')).toBe(true);
    expect(isChord(press('®', 'KeyR'), 'KeyR', 'r')).toBe(true);
    expect(isChord(press('Ï', 'KeyF'), 'KeyF', 'f')).toBe(true);
  });

  it('matches nothing else', () => {
    expect(isChord(press('n', 'KeyN'), 'KeyM', 'm')).toBe(false);
    expect(isChord(press('Enter', 'Enter'), 'KeyM', 'm')).toBe(false);
  });
});
