/**
 * The compact header's overflow menu.
 *
 * The header used to spend a row on six icon buttons. Under Flat that row is competing for space
 * with twenty-seven supports in a 340px column, so four of the six fold away behind one trigger
 * and Settings stays out where it is reached in a single press.
 *
 * Folding things away is only an improvement if the menu is as operable as the buttons were, so
 * this module is almost entirely focus management. It follows the menu-button pattern: the items
 * are out of the tab order and reached with the arrows, opening moves focus into the menu, and
 * every route out of it — Escape, Tab, a press elsewhere — closes it and leaves focus somewhere a
 * student can see. Escape in particular puts focus back on the trigger they pressed, because the
 * one thing worse than a row of six buttons is a menu that drops focus on the body.
 *
 * The listeners that watch the whole document exist only while the menu is open, and they watch in
 * the capture phase: the shared handler utility stops propagation on mousedown, so a bubble-phase
 * listener would never hear a press on any other control in the popup and the menu would sit open
 * behind whatever the student pressed next.
 */

import { attachAccessibleHandler } from '../utils/event-handlers.js';
import { Z } from '../utils/z-index.js';

/** Keys that open the menu from the trigger, and where each one lands. */
const OPEN_KEYS = { ArrowDown: 'first', ArrowUp: 'last' };

/**
 * Wire a trigger button to a menu.
 *
 * @param {Object} options
 * @param {HTMLElement|null} options.trigger - The button that opens the menu
 * @param {HTMLElement|null} options.menu - The element with `role="menu"`
 * @returns {{isOpen: function(): boolean, open: function(string=): void,
 *   close: function(Object=): void, toggle: function(): void, destroy: function(): void}}
 */
export function createHeaderMenu({ trigger, menu }) {
  // The classic header has no menu at all, and this module is constructed on both paths.
  if (!trigger || !menu) {
    return {
      isOpen: () => false,
      open() {},
      close() {},
      toggle() {},
      destroy() {},
    };
  }

  let open = false;

  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-controls', menu.id);
  trigger.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
  // The menu overhangs the sticky bar Flat puts directly beneath this header.
  menu.style.zIndex = String(Z.MODAL);

  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
  items().forEach(item => item.setAttribute('tabindex', '-1'));

  /** Focus an item by position, wrapping at both ends. */
  function focusAt(index) {
    const all = items();
    if (all.length === 0) {
      return;
    }
    all[(index + all.length) % all.length].focus();
  }

  function focusedIndex() {
    return items().indexOf(document.activeElement);
  }

  function onDocumentMouseDown(event) {
    if (menu.contains(event.target) || trigger.contains(event.target)) {
      return;
    }
    closeMenu({ refocus: false });
  }

  function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') {
      return;
    }
    // Consumed here so Escape does not also travel on and close something behind the menu.
    event.preventDefault();
    event.stopPropagation();
    closeMenu({ refocus: true });
  }

  function openMenu(landOn = 'first') {
    if (!open) {
      open = true;
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onDocumentMouseDown, true);
      document.addEventListener('keydown', onDocumentKeyDown, true);
    }
    focusAt(landOn === 'last' ? items().length - 1 : 0);
  }

  function closeMenu({ refocus = false } = {}) {
    if (!open) {
      return;
    }
    open = false;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    if (refocus) {
      trigger.focus();
    }
  }

  function toggle() {
    if (open) {
      closeMenu({ refocus: true });
    } else {
      openMenu('first');
    }
  }

  // Pointer and Enter/Space both toggle; the arrows get their own handler below so they can choose
  // which end of the menu to land on.
  const detachTrigger = attachAccessibleHandler(trigger, 'Header More Menu', toggle, {
    // The button's own hover style says enough, and a scaled trigger under an open menu wobbles
    // the thing the menu is anchored to.
    enableVisualFeedback: false,
  });

  const onTriggerKeyDown = event => {
    const landing = OPEN_KEYS[event.key];
    if (!landing) {
      return;
    }
    event.preventDefault();
    openMenu(landing);
  };
  trigger.addEventListener('keydown', onTriggerKeyDown);

  const onMenuKeyDown = event => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(focusedIndex() + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(focusedIndex() - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items().length - 1);
        break;
      case ' ':
        // A link does not activate on Space the way a button does, and inside a menu every item
        // has to answer to the same keys. The button items handle Space themselves.
        if (event.target.tagName === 'A') {
          event.preventDefault();
          event.target.click();
        }
        break;
      case 'Tab':
        // Not prevented: the menu closes and focus carries on out of the header as it would have.
        closeMenu({ refocus: false });
        break;
      default:
        break;
    }
  };
  menu.addEventListener('keydown', onMenuKeyDown);

  return {
    isOpen: () => open,
    open: openMenu,
    close: closeMenu,
    toggle,
    destroy() {
      closeMenu({ refocus: false });
      detachTrigger();
      trigger.removeEventListener('keydown', onTriggerKeyDown);
      menu.removeEventListener('keydown', onMenuKeyDown);
    },
  };
}

export default { createHeaderMenu };
