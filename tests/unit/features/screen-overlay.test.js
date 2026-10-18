/**
 * Screen Colour Overlay — a tint over the page, not a rewrite of it.
 *
 * Google Docs and Sheets paint the document into a canvas and lay transparent divs over it.
 * The overlay must tint what is on screen without giving any element a background of its own.
 */

import { Z } from '../../../src/utils/z-index.js';

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));
jest.mock('../../../src/content/utils/frame.js', () => ({ isTopFrame: jest.fn() }));
jest.mock('../../../src/content/utils/storage-utils.js', () => ({ initFeatureSettings: jest.fn() }));

import { isTopFrame } from '../../../src/content/utils/frame.js';
import { initFeatureSettings } from '../../../src/content/utils/storage-utils.js';

const SEPIA = { enabled: true, color: '#FFE4C4', opacity: 0.3 };

function loadFeature() {
  jest.isolateModules(() => {
    require('../../../src/features/screenOverlay/screenOverlay.js');
  });
  const [, , onInit, onChange] = initFeatureSettings.mock.calls[0];
  return { onInit, onChange };
}

const overlay = () => document.getElementById('assist-screen-overlay');

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  isTopFrame.mockReturnValue(true);
});

describe('screen overlay', () => {
  test('enabling adds one fixed, viewport-wide, pointer-transparent element that multiplies over the page', () => {
    const { onInit } = loadFeature();
    onInit(SEPIA);

    const el = overlay();
    expect(el).not.toBeNull();
    expect(el.tagName).toBe('DIV');
    expect(el.style.position).toBe('fixed');
    expect(el.style.pointerEvents).toBe('none');
    expect(el.style.zIndex).toBe(String(Z.OVERLAY));
    expect(el.getAttribute('style')).toMatch(/mix-blend-mode:\s*multiply/);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  test('the tint is the colour blended with white at the chosen intensity', () => {
    const { onInit } = loadFeature();
    onInit(SEPIA);
    expect(overlay().style.backgroundColor).toBe('rgb(255, 247, 237)');
  });

  test('no stylesheet is injected and no page element is restyled', () => {
    const probe = document.createElement('div');
    probe.className = 'content-wrapper';
    probe.style.backgroundColor = 'transparent';
    document.body.appendChild(probe);

    const { onInit } = loadFeature();
    onInit(SEPIA);

    expect(document.querySelectorAll('style').length).toBe(0);
    expect(getComputedStyle(probe).backgroundColor).toBe('transparent');
    expect(probe.style.color).toBe('');
  });

  test('changing colour or intensity while enabled updates the same element', () => {
    const { onInit, onChange } = loadFeature();
    onInit(SEPIA);
    onChange({ enabled: true, color: '#ADD8E6', opacity: 0.5 });

    expect(document.querySelectorAll('#assist-screen-overlay').length).toBe(1);
    expect(overlay().style.backgroundColor).toBe('rgb(214, 236, 243)');
  });

  test('a colour that is not #RRGGBB falls back to the default tint instead of vanishing', () => {
    const { onInit } = loadFeature();
    onInit({ enabled: true, color: 'sepia', opacity: 0.3 });
    expect(overlay().style.backgroundColor).toBe('rgb(255, 247, 237)');
  });

  test('disabling removes the element', () => {
    const { onInit, onChange } = loadFeature();
    onInit(SEPIA);
    onChange({ enabled: false, color: '#FFE4C4', opacity: 0.3 });
    expect(overlay()).toBeNull();
  });

  test('inside an iframe it does nothing — the top frame already covers this one', () => {
    isTopFrame.mockReturnValue(false);
    const { onInit } = loadFeature();
    onInit(SEPIA);
    expect(overlay()).toBeNull();
    expect(document.querySelectorAll('style').length).toBe(0);
  });
});
