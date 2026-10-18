/**
 * @jest-environment jsdom
 *
 * What the popup shows the moment it opens, and what it shows when it cannot open properly.
 *
 * Two findings from overnight release testing sit together here because they are the same mistake
 * seen twice: the popup showing a state it has not actually read.
 *
 *   - "Show Text Stats" is on screen from the first paint but was only ever synced inside
 *     loadModalSettings(), which runs when the gear is pressed. So it opened OFF whatever the
 *     student had saved, the badge stayed on their pages beside it, and switching it off took two
 *     presses — the first only brought the switch into line with storage.
 *   - When the settings fetch fails there is nothing to sync from at all. The popup came up
 *     looking completely normal with every control dead, and the only word about it was one line
 *     in the status bar at the bottom.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/** @returns {Object} a controller over the real popup markup */
function mountPopup() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  localStorage.clear();
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  return new PopupController();
}

describe('the Show Text Stats switch', () => {
  it('shows what was saved, without the gear ever being opened', () => {
    const popup = mountPopup();
    popup.settings = { ui_overlay: { show_text_stats_badge: true } };
    popup.setupEventListeners();

    expect(document.getElementById('main-text-stats-toggle').checked).toBe(true);
  });

  it('shows OFF when nothing has been saved, which is the default', () => {
    const popup = mountPopup();
    popup.settings = {};
    popup.setupEventListeners();

    expect(document.getElementById('main-text-stats-toggle').checked).toBe(false);
  });

  it('turns off on ONE press when it was saved on', () => {
    const popup = mountPopup();
    popup.settings = { ui_overlay: { show_text_stats_badge: true } };
    popup.setupEventListeners();

    const toggle = document.getElementById('main-text-stats-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(popup.settings.ui_overlay.show_text_stats_badge).toBe(false);
  });

  it('mirrors the saved state into the keys the page reads, at first paint', () => {
    const popup = mountPopup();
    popup.settings = { ui_overlay: { show_text_stats_badge: true } };
    popup.setupEventListeners();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ textStatsBadgeVisible: true })
    );
  });
});

describe('when the settings cannot be fetched', () => {
  /** @param {*} response what GET_SETTINGS answers, or an Error to reject with */
  function answerWith(response) {
    chrome.runtime.sendMessage = jest.fn(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
    );
  }

  it('does not crash, and says so where it can be seen', async () => {
    const popup = mountPopup();
    answerWith({ success: false });
    await popup.initialize();

    const banner = document.getElementById('settings-failure-banner');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toMatch(/could not load its settings/i);
    expect(document.querySelector('.popup-container').firstElementChild).toBe(banner);
  });

  it('says the same when the service worker cannot be reached at all', async () => {
    const popup = mountPopup();
    answerWith(new Error('Could not establish connection.'));
    await popup.initialize();

    expect(document.getElementById('settings-failure-banner')).not.toBeNull();
  });

  it('disables the controls rather than leaving dead ones on screen', async () => {
    const popup = mountPopup();
    answerWith({ success: false });
    await popup.initialize();

    expect(document.getElementById('tts-enabled').disabled).toBe(true);
    expect(document.getElementById('btn-options-compact').disabled).toBe(true);
    // Except the one way out.
    expect(document.querySelector('.settings-failure__retry').disabled).toBe(false);
  });

  it('offers a Retry that builds the popup when the worker answers', async () => {
    const popup = mountPopup();
    answerWith({ success: false });
    await popup.initialize();

    answerWith({ success: true, data: { ui_overlay: {} } });
    await popup.retrySettings();

    expect(document.getElementById('settings-failure-banner')).toBeNull();
    expect(document.getElementById('tts-enabled').disabled).toBe(false);
    expect(popup.isInitialized).toBe(true);
  });

  it('tries once on its own after a pause, because a sleeping worker wakes up', async () => {
    jest.useFakeTimers();
    const popup = mountPopup();
    answerWith(new Error('Could not establish connection.'));
    await popup.initialize();

    answerWith({ success: true, data: { ui_overlay: {} } });
    jest.advanceTimersByTime(1200);
    jest.useRealTimers();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.getElementById('settings-failure-banner')).toBeNull();
  });

  it('keeps the banner when the retry fails too, with the button usable again', async () => {
    const popup = mountPopup();
    answerWith({ success: false });
    await popup.initialize();
    await popup.retrySettings();

    expect(document.getElementById('settings-failure-banner')).not.toBeNull();
    expect(document.querySelector('.settings-failure__retry').disabled).toBe(false);
  });
});
