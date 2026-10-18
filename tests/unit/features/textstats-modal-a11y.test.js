/**
 * @jest-environment jsdom
 *
 * The "Detailed Statistics" dialog behind the text-stats badge.
 *
 * Overnight release testing found Escape dead on it: the full-screen overlay stayed
 * `display: flex` and then swallowed every click on the page behind it, so the student was
 * locked out of the article until they found the one close button (SC 2.1.2 No Keyboard Trap).
 * The dialog also never trapped Tab or handed the keyboard back on close.
 *
 * Each assertion below is one of those, so the overlay cannot go back to being a trap.
 */

jest.mock('../../../src/utils/keyboard-shortcuts.js', () => ({
  registerShortcut: jest.fn(),
}));
jest.mock('../../../src/utils/corner-slots.js', () => ({
  placeInRail: jest.fn(),
  releaseFromRail: jest.fn(),
}));

let TextStatsUI;
let ui;

/** trapFocus moves focus in on the next macrotask, so let it run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** @param {HTMLElement} element @param {string} key @returns {KeyboardEvent} */
function pressKey(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** @param {HTMLElement} element */
function pressPointer(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const modal = () => document.getElementById('assist-textstats-modal');
const trigger = () => document.getElementById('assist-textstats-details');

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ TextStatsUI } = await import('../../../src/features/textStats/textStats-ui.js'));
});

beforeEach(async () => {
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  document.body.innerHTML = '<p>Some page text to count.</p>';

  ui = new TextStatsUI();
  await ui.initialize({ enabled: true, badgeVisible: true, autoUpdate: false });
});

afterEach(() => {
  ui.destroy();
});

/** Open it the way a student does: Enter on the badge's "View Details" button. */
async function openFromBadge() {
  trigger().focus();
  pressKey(trigger(), 'Enter');
  await settle();
}

describe('the detailed statistics dialog', () => {
  test('is a modal dialog named by its own heading', async () => {
    await openFromBadge();

    expect(modal().getAttribute('role')).toBe('dialog');
    expect(modal().getAttribute('aria-modal')).toBe('true');
    const heading = document.getElementById(modal().getAttribute('aria-labelledby'));
    expect(heading.textContent).toMatch(/detailed statistics/i);
  });

  test('moves the keyboard onto its close button', async () => {
    await openFromBadge();

    expect(document.activeElement.id).toBe('assist-textstats-modal-close');
  });

  test('keeps Tab inside itself', async () => {
    await openFromBadge();

    expect(pressKey(document.activeElement, 'Tab').defaultPrevented).toBe(true);
    expect(modal().contains(document.activeElement)).toBe(true);
  });

  test('closes on Escape and hands the keyboard back to the badge button', async () => {
    await openFromBadge();

    const escape = pressKey(document.activeElement, 'Escape');

    expect(escape.defaultPrevented).toBe(true);
    expect(modal().style.display).toBe('none');
    expect(document.activeElement).toBe(trigger());
  });

  test('closes on the Done button and hands the keyboard back', async () => {
    await openFromBadge();

    pressKey(document.getElementById('assist-textstats-modal-done'), 'Enter');

    expect(modal().style.display).toBe('none');
    expect(document.activeElement).toBe(trigger());
  });

  test('closes on a press on the backdrop, but not on a press inside the panel', async () => {
    await openFromBadge();

    pressPointer(document.getElementById('assist-textstats-modal-title'));
    expect(modal().style.display).toBe('flex');

    pressPointer(modal());
    expect(modal().style.display).toBe('none');
  });

  test('reopening after Escape works, and the keyboard comes back a second time', async () => {
    await openFromBadge();
    pressKey(document.activeElement, 'Escape');

    await openFromBadge();
    expect(modal().style.display).toBe('flex');
    expect(document.activeElement.id).toBe('assist-textstats-modal-close');

    pressKey(document.activeElement, 'Escape');
    expect(document.activeElement).toBe(trigger());
  });

  test('a press opens it, and Escape still hands the keyboard back to that button', async () => {
    // The mouse path, which is the one real Chrome failed on: the shared event helper calls
    // preventDefault() on mousedown, so the browser never focuses the trigger, and trapFocus then
    // "restored" focus to BODY — the student was dropped at the top of the page (SC 2.4.3).
    expect(document.activeElement).toBe(document.body);
    pressPointer(trigger());
    await settle();
    expect(modal().style.display).toBe('flex');

    pressKey(document.activeElement, 'Escape');

    expect(modal().style.display).toBe('none');
    expect(document.activeElement.id).toBe('assist-textstats-details');
  });

  test('the keyboard goes to the badge when the button it was opened from has gone', async () => {
    await openFromBadge();
    // The badge rewrites its own markup as the figures change, so the button the dialog was opened
    // from may not be the one on screen when it closes — and may not be there at all.
    document.getElementById('assist-textstats-content').remove();

    pressKey(document.activeElement, 'Escape');

    expect(document.activeElement.id).toBe('assist-textstats-badge');
    expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
  });

  test('a second open while it is already open does not stack a second focus trap', async () => {
    await openFromBadge();
    ui.showModal();
    await settle();

    ui.hideModal();

    expect(modal().style.display).toBe('none');
    expect(document.activeElement).toBe(trigger());
  });
});
