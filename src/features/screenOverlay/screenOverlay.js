/**
 * Screen Colour Overlay
 *
 * A coloured acetate sheet laid over the page for students with visual stress: one fixed,
 * viewport-wide element that multiplies its tint into whatever is underneath. White becomes the
 * tint at the chosen intensity, black stays black, canvas, images and iframes are tinted like
 * everything else, and no element on the page has its own styles touched. That last point is why
 * this is an element and not a stylesheet: Google Docs and Sheets paint the document into a canvas
 * and stack transparent divs over it, so forcing backgrounds paints over the document.
 *
 * @module screenOverlay
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { isTopFrame } from '../../content/utils/frame.js';
import { Z } from '../../utils/z-index.js';

const OVERLAY_ID = 'assist-screen-overlay';

/** @type {Object} Default settings, also the popup's defaults for this tool. */
const DEFAULT_SETTINGS = {
  enabled: false,
  color: '#FFE4C4',
  opacity: 0.3,
};

let screenOverlay_enabled = false;

/** @type {HTMLDivElement|null} The tint element while enabled. */
let screenOverlay_element = null;

/** @type {{color: string, opacity: number}} Current colour and intensity. */
const screenOverlay_settings = { color: DEFAULT_SETTINGS.color, opacity: DEFAULT_SETTINGS.opacity };

/**
 * The tint as it will show over white: the colour blended towards white by (1 - intensity).
 * Under `mix-blend-mode: multiply` this is exactly what a white page turns into.
 * @param {string} hex - '#RRGGBB'
 * @param {number} intensity - 0..1
 * @returns {string} 'rgb(r, g, b)'
 */
function screenOverlay_tint(hex, intensity) {
  const channel = at => parseInt(hex.slice(at, at + 2), 16);
  const blend = value => Math.round(255 - (255 - value) * intensity);
  return `rgb(${blend(channel(1))}, ${blend(channel(3))}, ${blend(channel(5))})`;
}

/**
 * Create the tint element, or recolour the existing one.
 * @returns {void}
 */
function screenOverlay_create() {
  // A page that re-renders its body (Docs, Canvas routes) can drop the sheet; put it back.
  let el = screenOverlay_element || document.getElementById(OVERLAY_ID);
  if (!el?.isConnected) {
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('aria-hidden', 'true');
    (document.body || document.documentElement).appendChild(el);
  }
  const tint = screenOverlay_tint(screenOverlay_settings.color, screenOverlay_settings.opacity);
  el.setAttribute(
    'style',
    `position: fixed; inset: 0; pointer-events: none; z-index: ${Z.OVERLAY}; ` +
      `background-color: ${tint}; mix-blend-mode: multiply;`
  );
  screenOverlay_element = el;
}

/**
 * Remove the tint element.
 * @returns {void}
 */
function screenOverlay_remove() {
  (screenOverlay_element || document.getElementById(OVERLAY_ID))?.remove();
  screenOverlay_element = null;
}

function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_create();
  showToast('🎨 Screen Overlay enabled');
}

function screenOverlay_disable() {
  screenOverlay_enabled = false;
  screenOverlay_remove();
  showToast('Screen Overlay disabled');
}

/**
 * Apply settings from storage.
 * @param {Object} settings - The `screenOverlay` settings object
 * @param {boolean} isInit - Initial load rather than a change
 */
function applySettings(settings, isInit = false) {
  // One sheet for the page: a fixed element in the top document already covers every iframe,
  // and a copy per frame would multiply the tint twice.
  if (!isTopFrame()) {
    return;
  }

  const wasEnabled = screenOverlay_enabled;
  const newEnabled = Boolean(settings.enabled);
  // Anything but #RRGGBB would parse to NaN and drop the tint without a word.
  screenOverlay_settings.color = /^#[0-9a-f]{6}$/i.test(settings.color)
    ? settings.color
    : DEFAULT_SETTINGS.color;
  screenOverlay_settings.opacity = settings.opacity || DEFAULT_SETTINGS.opacity;

  if (newEnabled && !wasEnabled) {
    screenOverlay_enable();
  } else if (!newEnabled && wasEnabled) {
    screenOverlay_disable();
  } else if (newEnabled && !isInit) {
    screenOverlay_create();
  }
}

initFeatureSettings(
  'screenOverlay',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);
