/**
 * Companion UI kit — shared card/panel primitives and page detection for the companion features.
 *
 * Every companion surface builds on these so the WCAG behaviour (focus-visible, forced-colors,
 * reduced-motion, word+icon signalling, Z scale) is implemented once. Feature modules stay
 * presentation-thin and individually revertable.
 *
 * @module features/companion/companion-ui
 */

import { Z } from '../../utils/z-index.js';
import {
  CORNER,
  EDGE_INSET,
  SLOT_GAP,
  onRailChange,
  railExtent,
} from '../../utils/corner-slots.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { dockExtent } from './chip-dock.js';

const STYLE_ID = 'assist-companion-styles';

/**
 * Shortest a floating card is ever squeezed to, in px. Below this there is no room for a heading,
 * a sentence and the button that dismisses it, and a card too short to read is no better than one
 * off the edge of the screen.
 */
const MIN_FLOATING_CARD_HEIGHT = 120;

export function injectCompanionStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  // Follow the bottom rails: when a control below the cards appears or goes away, the cards move
  // with it instead of covering it or leaving a hole. A narrow viewport makes a card as wide as the
  // page, so the chip dock on the left counts as "below" too. Registering the same function twice
  // is a no-op, so this is safe on every re-injection.
  onRailChange(CORNER.BOTTOM_RIGHT, restackFloatingCards);
  onRailChange(CORNER.BOTTOM_LEFT, restackFloatingCards);
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .assist-companion-card {
      position: relative;
      box-sizing: border-box;
      margin: 12px 0;
      padding: 14px 16px;
      border: 1px solid #c9d4d2;
      border-radius: 10px;
      background: #f7faf9;
      color: #1f2933;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      max-width: 720px;
    }
    /* A floating card scrolls inside its body, never as a whole: the header carries the close
       button, and a card whose own header scrolls out of reach is a card a student cannot shut. */
    .assist-companion-card--floating {
      position: fixed;
      right: ${EDGE_INSET}px;
      bottom: ${EDGE_INSET}px;
      width: min(360px, calc(100% - ${EDGE_INSET * 2}px));
      max-height: min(70vh, calc(100vh - ${EDGE_INSET * 2}px), 560px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin: 0;
      box-shadow: 0 8px 28px rgba(31, 41, 51, 0.25);
      z-index: ${Z.CONTROLS};
    }
    .assist-companion-card--floating .assist-companion-card__header {
      flex: 0 0 auto;
    }
    .assist-companion-card--floating .assist-companion-card__body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    /* A first-run hint has to stay out of the way of the text it is talking about: short enough
       that it cannot cover the passage a student is reading, even on a 320px-wide screen. */
    .assist-companion-card--compact {
      width: min(300px, calc(100% - ${EDGE_INSET * 2}px));
      max-height: max(${MIN_FLOATING_CARD_HEIGHT}px, 25vh);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    .assist-companion-card--compact .assist-companion-card__title {
      font-size: 14px;
    }
    .assist-companion-card__header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .assist-companion-card__title {
      font-weight: 600;
      font-size: 15px;
      margin: 0;
      flex: 1;
    }
    .assist-companion-card__close {
      border: 1px solid #c9d4d2;
      background: #ffffff;
      color: #1f2933;
      border-radius: 6px;
      padding: 2px 9px;
      font-size: 14px;
      cursor: pointer;
    }
    .assist-companion-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #4e6f78;
      background: #4e6f78;
      color: #ffffff;
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin: 4px 8px 4px 0;
    }
    .assist-companion-btn--secondary {
      background: #ffffff;
      color: #33525b;
    }
    .assist-companion-btn:focus-visible,
    .assist-companion-card__close:focus-visible {
      outline: 3px solid #1f6feb;
      outline-offset: 2px;
    }
    .assist-companion-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .assist-companion-chip--calm { background: #e3efe6; color: #23513a; border-color: #b9d6c2; }
    .assist-companion-chip--info { background: #e4edf7; color: #234a72; border-color: #bcd2ea; }
    .assist-companion-chip--attention { background: #f7ecdc; color: #6b4a12; border-color: #e2cda4; }
    .assist-companion-status {
      margin-top: 8px;
      font-size: 13px;
    }
    @media (prefers-reduced-motion: no-preference) {
      .assist-companion-card--floating { animation: assist-companion-in 160ms ease-out; }
      @keyframes assist-companion-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: none; }
      }
    }
    @media (forced-colors: active) {
      .assist-companion-card, .assist-companion-btn, .assist-companion-chip,
      .assist-companion-card__close {
        border: 1px solid ButtonText;
        forced-color-adjust: auto;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Restack every floating companion card so simultaneously-open cards never cover each other
 * (SC 2.4.11 Focus Not Obscured): the first sits at the base offset, each further card above it.
 *
 * The cards are a lane rather than fixed slots - there can be any number of them, at any
 * height - but they use the same gap as every other floating control and start above
 * whatever else the bottom-right rail is carrying, which is the text statistics badge when
 * it is on screen (see src/utils/corner-slots.js).
 */
export function restackFloatingCards() {
  const cards = document.querySelectorAll('.assist-companion-card--floating');
  // Clear both bottom corners: a card is a wide surface and on a narrow viewport it reaches the
  // left edge, where the chip dock is.
  let bottom = Math.max(railExtent(CORNER.BOTTOM_RIGHT), dockExtent());
  const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 0;

  for (const card of cards) {
    const fit = fitFloatingCard(bottom, card.offsetHeight || 0, viewportHeight);
    card.style.maxHeight = fit.maxHeight === null ? '' : `${fit.maxHeight}px`;
    card.style.bottom = `${fit.bottom}px`;
    bottom = fit.bottom + fit.height + SLOT_GAP;
  }
}

/**
 * Where a floating card sits, and how tall it may be, so that all of it is on screen.
 *
 * A fixed card placed above the controls at the bottom of a small window runs off the TOP of the
 * screen, and nothing can scroll it back: overnight release testing at 640x400 found the first-run
 * study tip at y = -102 with its heading and its close button unreachable. So the card is capped to
 * the room actually left above whatever is below it - it scrolls inside its own body instead of
 * growing - and if it is still too tall for the room, it comes down the screen rather than off it.
 *
 * Pure, because the case that matters is the one jsdom cannot produce: real heights in a real
 * window.
 *
 * @param {number} base - offset from the bottom edge the card would like, in px
 * @param {number} cardHeight - the card's measured height, in px
 * @param {number} viewportHeight - in px; 0 when nothing can be measured
 * @returns {{bottom: number, height: number, maxHeight: number|null}} where to put it, the height
 *   it will end up with, and the cap to apply (null to leave the stylesheet's own cap alone)
 */
export function fitFloatingCard(base, cardHeight, viewportHeight) {
  if (!viewportHeight) {
    return { bottom: base, height: cardHeight, maxHeight: null };
  }
  const room = Math.max(MIN_FLOATING_CARD_HEIGHT, viewportHeight - base - EDGE_INSET);
  const height = Math.min(cardHeight, room);
  const highest = Math.max(EDGE_INSET, viewportHeight - height - EDGE_INSET);
  return {
    bottom: Math.min(base, highest),
    height,
    maxHeight: cardHeight > room ? room : null,
  };
}

/**
 * Build a companion card. Word+icon in the title (never colour alone); the close button is
 * keyboard-accessible and returns focus to the element focused before the card appeared.
 *
 * @param {Object} opts
 * @param {string} opts.id - Unique DOM id; an existing card with the same id is replaced
 * @param {string} opts.title - Visible title (include the icon in the string)
 * @param {boolean} [opts.floating=false] - Fixed-position bottom-right instead of in-flow
 * @param {boolean} [opts.compact=false] - Narrow, short card for a hint rather than a panel
 * @param {boolean} [opts.escapeCloses=false] - Escape closes the card as well as the close button
 * @param {() => void} [opts.onClose]
 * @returns {{root: HTMLElement, body: HTMLElement, close: () => void}}
 */
export function createCompanionCard({
  id,
  title,
  floating = false,
  compact = false,
  escapeCloses = false,
  onClose,
}) {
  injectCompanionStyles();
  document.getElementById(id)?.remove();

  const previousFocus = document.activeElement;
  const root = document.createElement('section');
  root.id = id;
  root.className =
    'assist-companion-card' +
    (floating ? ' assist-companion-card--floating' : '') +
    (compact ? ' assist-companion-card--compact' : '');
  root.setAttribute('aria-label', title);

  const header = document.createElement('div');
  header.className = 'assist-companion-card__header';

  const heading = document.createElement('p');
  heading.className = 'assist-companion-card__title';
  heading.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'assist-companion-card__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', `Close ${title}`);

  const body = document.createElement('div');
  body.className = 'assist-companion-card__body';

  const onKeydown = event => {
    if (event.key === 'Escape') {
      close();
    }
  };

  const close = () => {
    if (escapeCloses) {
      document.removeEventListener('keydown', onKeydown);
    }
    root.remove();
    if (floating) {
      restackFloatingCards();
    }
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    if (onClose) {
      onClose();
    }
  };
  attachAccessibleHandler(closeBtn, `Close ${title}`, close);
  if (escapeCloses) {
    document.addEventListener('keydown', onKeydown);
  }

  header.appendChild(heading);
  header.appendChild(closeBtn);
  root.appendChild(header);
  root.appendChild(body);

  if (floating && typeof requestAnimationFrame === 'function') {
    // Callers append the card right after creating it; restack once it is in the DOM.
    requestAnimationFrame(restackFloatingCards);
  }

  return { root, body, close };
}

/**
 * A companion action button (accessible handler attached).
 * @param {string} label - Visible text (include icon in the string)
 * @param {() => void} handler
 * @param {{secondary?: boolean}} [opts]
 * @returns {HTMLButtonElement}
 */
export function companionButton(label, handler, opts = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `assist-companion-btn${opts.secondary ? ' assist-companion-btn--secondary' : ''}`;
  btn.textContent = label;
  attachAccessibleHandler(btn, label, handler);
  return btn;
}

/**
 * A polite live region inside a card for status updates.
 * @param {HTMLElement} parent
 * @returns {HTMLElement}
 */
export function companionStatusRegion(parent) {
  const region = document.createElement('p');
  region.className = 'assist-companion-status';
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  parent.appendChild(region);
  return region;
}

// ---- Page detection ----

const host = () => location.hostname;

export const isCanvasHost = () =>
  /(\.|^)instructure\.com$/.test(host()) || /(\.|^)canvas\.[^.]+$/.test(host());

/** Any LMS host the extension injects into by default — not Canvas-specific. */
export const isLmsHost = () =>
  isCanvasHost() ||
  /(\.|^)moodle\.org$/.test(host()) ||
  /(\.|^)moodlecloud\.com$/.test(host()) ||
  host() === 'classroom.google.com' ||
  host() === 'docs.google.com';
