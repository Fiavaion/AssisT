/**
 * @jest-environment jsdom
 *
 * Tests for the compact header's overflow menu.
 *
 * The row this menu replaces was six always-visible buttons. Folding four of them away is only an
 * improvement if the menu is at least as operable as the buttons were, so the focus contract is
 * the substance of this file: opening moves focus INTO the menu, the arrows stay inside it,
 * Escape puts focus back on the trigger the student pressed, and every way out closes it. A menu
 * that strands focus is worse than the row it replaced.
 */

import { createHeaderMenu } from '../../../src/popup/header-menu.js';
import { Z } from '../../../src/utils/z-index.js';

/** The trigger, the menu, and something outside both to click on. */
function setup() {
  document.body.innerHTML = `
    <button id="trigger">More</button>
    <div id="menu">
      <button role="menuitem" id="one">One</button>
      <button role="menuitem" id="two">Two</button>
      <a role="menuitem" id="three" href="https://example.test">Three</a>
    </div>
    <button id="outside">Outside</button>
  `;
  const trigger = document.getElementById('trigger');
  const menu = document.getElementById('menu');
  return { trigger, menu, controller: createHeaderMenu({ trigger, menu }) };
}

/** Press a key on whatever currently holds focus. */
function press(key, target = document.activeElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** A real mousedown, which is the event the shared handler utility listens for. */
function mousedown(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('the closed state', () => {
  it('starts closed, hidden, and says so on the trigger', () => {
    const { trigger, menu, controller } = setup();
    expect(controller.isOpen()).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-controls')).toBe('menu');
  });

  it('takes its stacking order from the shared scale, not a number of its own', () => {
    const { menu } = setup();
    expect(menu.style.zIndex).toBe(String(Z.MODAL));
  });

  it('keeps the items out of the tab order so the trigger is the single stop', () => {
    const { menu } = setup();
    menu.querySelectorAll('[role="menuitem"]').forEach(item => {
      expect(item.getAttribute('tabindex')).toBe('-1');
    });
  });
});

describe('opening', () => {
  it('shows the menu, updates the trigger, and moves focus to the first item', () => {
    const { trigger, menu, controller } = setup();
    controller.open();
    expect(controller.isOpen()).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement.id).toBe('one');
  });

  it('opens on a press of the trigger and closes on a second press', () => {
    const { trigger, controller } = setup();
    mousedown(trigger);
    expect(controller.isOpen()).toBe(true);
    mousedown(trigger);
    expect(controller.isOpen()).toBe(false);
  });

  it('opens from the keyboard on Enter and on Space', () => {
    const { trigger, controller } = setup();
    press('Enter', trigger);
    expect(controller.isOpen()).toBe(true);
    controller.close();
    press(' ', trigger);
    expect(controller.isOpen()).toBe(true);
  });

  it('opens onto the last item when opened with Up, as a menu button should', () => {
    const { trigger, controller } = setup();
    press('ArrowUp', trigger);
    expect(controller.isOpen()).toBe(true);
    expect(document.activeElement.id).toBe('three');
  });

  it('opens onto the first item when opened with Down', () => {
    const { trigger } = setup();
    press('ArrowDown', trigger);
    expect(document.activeElement.id).toBe('one');
  });
});

describe('moving around inside', () => {
  it('walks down and wraps to the top', () => {
    const { controller } = setup();
    controller.open();
    press('ArrowDown');
    expect(document.activeElement.id).toBe('two');
    press('ArrowDown');
    expect(document.activeElement.id).toBe('three');
    press('ArrowDown');
    expect(document.activeElement.id).toBe('one');
  });

  it('walks up and wraps to the bottom', () => {
    const { controller } = setup();
    controller.open();
    press('ArrowUp');
    expect(document.activeElement.id).toBe('three');
  });

  it('jumps to the ends with Home and End', () => {
    const { controller } = setup();
    controller.open();
    press('End');
    expect(document.activeElement.id).toBe('three');
    press('Home');
    expect(document.activeElement.id).toBe('one');
  });

  it('does not scroll the popup while arrowing', () => {
    const { controller } = setup();
    controller.open();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
  });
});

describe('closing', () => {
  it('returns focus to the trigger on Escape', () => {
    const { trigger, controller } = setup();
    controller.open();
    press('Escape');
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a press outside without stealing focus back', () => {
    const { controller } = setup();
    controller.open();
    mousedown(document.getElementById('outside'));
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement.id).not.toBe('trigger');
  });

  it('stays open for a press on the menu itself', () => {
    const { controller } = setup();
    controller.open();
    mousedown(document.getElementById('two'));
    expect(controller.isOpen()).toBe(true);
  });

  it('closes on Tab and lets focus carry on out', () => {
    const { controller } = setup();
    controller.open();
    const event = press('Tab');
    expect(controller.isOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the trigger saying closed', () => {
    const { trigger, controller } = setup();
    controller.open();
    controller.close();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('destroy', () => {
  it('closes and stops listening', () => {
    const { trigger, controller } = setup();
    controller.open();
    controller.destroy();
    expect(controller.isOpen()).toBe(false);
    mousedown(trigger);
    expect(controller.isOpen()).toBe(false);
  });
});

describe('a missing element', () => {
  it('is survivable — the classic header has no menu at all', () => {
    document.body.innerHTML = '';
    const controller = createHeaderMenu({ trigger: null, menu: null });
    expect(controller.isOpen()).toBe(false);
    expect(() => {
      controller.open();
      controller.close();
      controller.destroy();
    }).not.toThrow();
  });
});

describe('a link among the buttons', () => {
  it('activates on Space, which a link would otherwise ignore', () => {
    const { controller } = setup();
    const link = document.getElementById('three');
    const activated = jest.fn(event => event.preventDefault());
    link.addEventListener('click', activated);

    controller.open();
    press('End');
    expect(document.activeElement).toBe(link);
    press(' ');

    expect(activated).toHaveBeenCalled();
  });
});
