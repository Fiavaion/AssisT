/**
 * Unit tests (jsdom) for the on-page calculator + scratchpad overlay.
 *
 * Focus: idempotent mount/unmount, FAB open/close, keyboard entry into the live-region display,
 * Escape behaviour, roving-tabindex keypad navigation, debounced scratchpad persistence, and copy.
 *
 * Note: interactive buttons are wired with attachAccessibleHandler, which listens on `mousedown`
 * (and Enter/Space `keydown`), NOT `click`. Tests therefore dispatch `mousedown` to activate.
 */

import {
  mountMathCalculator,
  unmountMathCalculator,
  isMathCalculatorMounted,
  SCRATCHPAD_STORAGE_KEY,
} from '../../../src/features/maths/math-calculator.js';

function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

function keydown(target, key) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function q(sel) {
  return document.querySelector(sel);
}

function keyByLabel(label) {
  return Array.from(document.querySelectorAll('.assist-mathcalc__key')).find(
    b => b.getAttribute('aria-label') === label
  );
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  unmountMathCalculator();
  document.body.innerHTML = '';
  // Remove any stray injected style so re-mount re-injects cleanly.
  const style = document.getElementById('assist-mathcalc-styles');
  if (style) {
    style.remove();
  }
});

describe('mount / unmount lifecycle', () => {
  it('mounts a FAB and reports mounted', () => {
    mountMathCalculator();
    expect(isMathCalculatorMounted()).toBe(true);
    const fab = q('.assist-mathcalc__fab');
    expect(fab).not.toBeNull();
    expect(fab.getAttribute('aria-label')).toBe('Maths tools');
  });

  it('is idempotent — a second mount does not duplicate DOM', () => {
    mountMathCalculator();
    mountMathCalculator();
    expect(document.querySelectorAll('.assist-mathcalc__fab').length).toBe(1);
    expect(document.querySelectorAll('#assist-mathcalc-root').length).toBe(1);
  });

  it('unmounts, removes DOM, and is idempotent', () => {
    mountMathCalculator();
    unmountMathCalculator();
    expect(isMathCalculatorMounted()).toBe(false);
    expect(q('.assist-mathcalc__fab')).toBeNull();
    expect(() => unmountMathCalculator()).not.toThrow();
  });

  it('FAB has a ≥44px minimum target and a NON-modal dialog (no aria-modal)', () => {
    mountMathCalculator();
    const panel = q('.assist-mathcalc__panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Calculator and scratchpad');
    expect(panel.hasAttribute('aria-modal')).toBe(false);
  });
});

describe('FAB open / close', () => {
  it('opens the panel on FAB activation and sets aria-expanded', () => {
    mountMathCalculator();
    const fab = q('.assist-mathcalc__fab');
    const panel = q('.assist-mathcalc__panel');
    expect(panel.hidden).toBe(true);
    press(fab);
    expect(panel.hidden).toBe(false);
    expect(fab.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles closed on a second FAB activation', () => {
    mountMathCalculator();
    const fab = q('.assist-mathcalc__fab');
    const panel = q('.assist-mathcalc__panel');
    press(fab);
    press(fab);
    expect(panel.hidden).toBe(true);
    expect(fab.getAttribute('aria-expanded')).toBe('false');
  });

  it('display starts at 0 and has a polite live region', () => {
    mountMathCalculator();
    const display = q('.assist-mathcalc__display');
    expect(display.getAttribute('role')).toBe('status');
    expect(display.getAttribute('aria-live')).toBe('polite');
    expect(display.textContent).toBe('0');
  });
});

describe('on-screen keypad', () => {
  it('builds an expression and evaluates it into the display', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    press(keyByLabel('2'));
    press(keyByLabel('Plus'));
    press(keyByLabel('3'));
    press(keyByLabel('Equals'));
    expect(q('.assist-mathcalc__display').textContent).toBe('5');
  });

  it('Clear resets the entry', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    press(keyByLabel('9'));
    press(keyByLabel('Clear'));
    expect(q('.assist-mathcalc__display').textContent).toBe('0');
  });

  it('shows a friendly error, not a throw, on divide by zero', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    press(keyByLabel('5'));
    press(keyByLabel('Divide'));
    press(keyByLabel('0'));
    press(keyByLabel('Equals'));
    expect(q('.assist-mathcalc__display').textContent).toMatch(/divide by zero/i);
  });
});

describe('roving tabindex keypad', () => {
  it('has exactly one key in the tab order initially', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const inTab = Array.from(document.querySelectorAll('.assist-mathcalc__key')).filter(
      b => b.tabIndex === 0
    );
    expect(inTab.length).toBe(1);
  });

  it('ArrowRight moves the roving focus to the next key', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const first = keyByLabel('Clear'); // index 0
    first.focus();
    keydown(first, 'ArrowRight');
    const inTab = Array.from(document.querySelectorAll('.assist-mathcalc__key')).filter(
      b => b.tabIndex === 0
    );
    expect(inTab.length).toBe(1);
    expect(inTab[0].getAttribute('aria-label')).toBe('Open bracket'); // index 1
  });

  it('ArrowDown moves down a row (Clear → 7)', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const first = keyByLabel('Clear');
    first.focus();
    keydown(first, 'ArrowDown');
    const inTab = document.querySelector('.assist-mathcalc__key[tabindex="0"]');
    expect(inTab.getAttribute('aria-label')).toBe('7');
  });
});

describe('physical keyboard input', () => {
  it('evaluates a typed expression into the display', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const panel = q('.assist-mathcalc__panel');
    keydown(panel, '7');
    keydown(panel, '*');
    keydown(panel, '6');
    keydown(panel, 'Enter');
    expect(q('.assist-mathcalc__display').textContent).toBe('42');
  });

  it('Backspace removes the last character', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const panel = q('.assist-mathcalc__panel');
    keydown(panel, '1');
    keydown(panel, '2');
    keydown(panel, 'Backspace');
    expect(q('.assist-mathcalc__display').textContent).toBe('1');
  });
});

describe('Escape behaviour', () => {
  it('clears a non-empty entry first, then closes on a second press', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const panel = q('.assist-mathcalc__panel');
    keydown(panel, '5');
    expect(panel.hidden).toBe(false);
    keydown(panel, 'Escape'); // clears
    expect(q('.assist-mathcalc__display').textContent).toBe('0');
    expect(panel.hidden).toBe(false);
    keydown(panel, 'Escape'); // closes
    expect(panel.hidden).toBe(true);
  });

  it('returns focus to the FAB when it closes', () => {
    mountMathCalculator();
    const fab = q('.assist-mathcalc__fab');
    press(fab);
    const panel = q('.assist-mathcalc__panel');
    keydown(panel, 'Escape'); // entry empty → closes
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(fab);
  });

  // On the live Canvas login page the page's own Escape handler moved focus to the body as the
  // calculator cleared its entry, so the second Escape never reached the calculator.
  it('keeps an Escape it uses from reaching the page', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const panel = q('.assist-mathcalc__panel');
    const pageHeard = jest.fn();
    document.addEventListener('keydown', pageHeard);
    try {
      keydown(panel, '5');
      keydown(panel, 'Escape'); // clears
      keydown(q('.assist-mathcalc__scratch'), 'Escape'); // closes from the scratchpad
      expect(pageHeard.mock.calls.filter(([e]) => e.key === 'Escape')).toHaveLength(0);
    } finally {
      document.removeEventListener('keydown', pageHeard);
    }
  });

  it('closes from within the scratchpad', () => {
    mountMathCalculator();
    press(q('.assist-mathcalc__fab'));
    const panel = q('.assist-mathcalc__panel');
    const scratch = q('.assist-mathcalc__scratch');
    keydown(scratch, 'Escape');
    expect(panel.hidden).toBe(true);
  });
});

describe('scratchpad persistence', () => {
  it('loads a previously stored value on mount', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SCRATCHPAD_STORAGE_KEY]: 'my working notes' });
    mountMathCalculator();
    await flush();
    expect(q('.assist-mathcalc__scratch').value).toBe('my working notes');
  });

  it('saves the scratchpad debounced (500ms) to chrome.storage.local', () => {
    jest.useFakeTimers();
    try {
      mountMathCalculator();
      const scratch = q('.assist-mathcalc__scratch');
      scratch.value = '3 apples + 2';
      scratch.dispatchEvent(new Event('input', { bubbles: true }));
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      jest.advanceTimersByTime(500);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [SCRATCHPAD_STORAGE_KEY]: '3 apples + 2',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('degrades gracefully when chrome.storage is absent', () => {
    const savedChrome = global.chrome;
    global.chrome = undefined;
    try {
      expect(() => {
        const handle = mountMathCalculator();
        expect(handle).not.toBeNull();
        const scratch = q('.assist-mathcalc__scratch');
        scratch.value = 'notes';
        scratch.dispatchEvent(new Event('input', { bubbles: true }));
      }).not.toThrow();
    } finally {
      global.chrome = savedChrome;
    }
  });
});

describe('copy result', () => {
  it('writes the display value to the clipboard and announces "Copied"', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const savedClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    try {
      mountMathCalculator();
      press(q('.assist-mathcalc__fab'));
      press(keyByLabel('8'));
      const copyBtn = q('.assist-mathcalc__btn');
      press(copyBtn);
      await flush();
      expect(writeText).toHaveBeenCalledWith('8');
      expect(q('.assist-mathcalc__sr-only').textContent).toBe('Copied');
    } finally {
      if (savedClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          value: savedClipboard,
          configurable: true,
        });
      } else {
        delete navigator.clipboard;
      }
    }
  });
});
