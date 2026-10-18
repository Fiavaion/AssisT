/**
 * @jest-environment jsdom
 *
 * The Local AI status line, the popup's spoken channel for Ollama.
 *
 * A screen reader announces a live region when its contents change, so a region that is created
 * and filled in one go usually says nothing: there was no earlier state to change from. The Local
 * AI line was worse still, a bare <span>, so the switch from "Checking…" to the sentence asking for
 * permission to reach Ollama was silent, and a student who cannot see the panel had no way to learn
 * that a permission prompt was waiting (SC 4.1.3).
 */

let PopupController;

beforeAll(async () => {
  // popup.js registers a storage listener as it loads; the shared setup mock has no onChanged.
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

beforeEach(() => {
  // resetMocks wipes the implementations the shared setup gave these, so restore what we need.
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.instructure.com/' }]);
  document.body.innerHTML = '';
});

/** @returns {HTMLElement} the status line of a freshly rendered Local AI panel. */
function localPanelStatus() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  // Deliberately not awaited: the point is what is on screen before any check has answered.
  new PopupController()._renderLocalPanel(container, false);
  return container.querySelector('[role="status"]');
}

describe('the Local AI status line', () => {
  it('is a live region before any text lands in it', () => {
    const status = localPanelStatus();
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });

  it('speaks the permission sentence through that same region', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      available: false,
      needsPermission: true,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    await new PopupController()._renderLocalPanel(container, false);

    const status = container.querySelector('[role="status"]');
    expect(status.textContent).toMatch(/needs your permission/i);
  });

  it('speaks a reachable Ollama through that same region', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      available: true,
      models: ['llama3.2'],
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    await new PopupController()._renderLocalPanel(container, false);

    expect(container.querySelector('[role="status"]').textContent).toMatch(/^Online/);
  });

  it('speaks a failed check through that same region', async () => {
    chrome.runtime.sendMessage.mockRejectedValue(new Error('no worker'));
    const container = document.createElement('div');
    document.body.appendChild(container);

    await new PopupController()._renderLocalPanel(container, false);

    expect(container.querySelector('[role="status"]').textContent).toBe('Could not reach Ollama');
  });
});
