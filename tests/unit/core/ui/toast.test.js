/**
 * Toast notification: announced to assistive technology, and readable.
 *
 * Overnight release testing found the reading-feedback toast ("⏸️ Paused", "⏹️ Stopped") was a
 * plain div — no role, no live region, so a screen-reader user got no feedback at all — and its
 * white 14px text on rgba(33, 150, 243, 0.95) measured about 3:1, below WCAG 2.2 SC 1.4.3.
 */

import { showToast } from '../../../../src/core/ui/toast.js';

/** sRGB relative luminance of an [r, g, b] triple (WCAG 2.x definition). */
function luminance([r, g, b]) {
  const channel = value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two [r, g, b] triples. */
function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Parse `rgb(...)`/`rgba(...)`/`white` into {rgb, alpha}. */
function parseColor(value) {
  if (value === 'white') {
    return { rgb: [255, 255, 255], alpha: 1 };
  }
  const parts = value.match(/[\d.]+/g).map(Number);
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
}

/** Composite a translucent colour over an opaque backdrop. */
function over(color, backdrop) {
  return color.rgb.map((channel, i) => color.alpha * channel + (1 - color.alpha) * backdrop[i]);
}

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('announces the message through a single polite live region', async () => {
    await showToast('⏹️ Stopped');

    const live = document.querySelectorAll('[role="status"], [aria-live]');
    expect(live).toHaveLength(1);

    const toast = document.getElementById('assist-toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.getAttribute('aria-atomic')).toBe('true');
    expect(toast.textContent).toBe('⏹️ Stopped');
  });

  test('a second toast does not leave a second live region behind', async () => {
    await showToast('⏸️ Paused');
    await showToast('▶️ Resumed');

    expect(document.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(1);
    expect(document.getElementById('assist-toast').textContent).toBe('▶️ Resumed');
  });

  test('text meets WCAG 1.4.3 contrast over a light and a dark page', async () => {
    await showToast('Speed: 1.4x');

    const toast = document.getElementById('assist-toast');
    const text = parseColor(toast.style.color);
    const background = parseColor(toast.style.backgroundColor);

    for (const page of [
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const ratio = contrastRatio(over(text, over(background, page)), over(background, page));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('keeps its look: blue, bottom-right, above the page', async () => {
    await showToast('Hello');

    const toast = document.getElementById('assist-toast');
    expect(toast.style.position).toBe('fixed');
    expect(toast.style.bottom).toBe('20px');
    expect(toast.style.right).toBe('20px');
    expect(toast.style.zIndex).toBe('100500');
    const { rgb } = parseColor(toast.style.backgroundColor);
    expect(rgb[2]).toBeGreaterThan(rgb[0]); // still blue, not recoloured
  });

  test('removes itself after the duration', async () => {
    await showToast('Gone soon', 1000);
    expect(document.getElementById('assist-toast')).not.toBeNull();

    jest.advanceTimersByTime(1400);
    expect(document.getElementById('assist-toast')).toBeNull();
  });
});
