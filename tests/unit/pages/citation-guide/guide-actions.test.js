/**
 * @jest-environment jsdom
 *
 * The guide's one piece of behaviour: opening the real library from the page.
 *
 * It goes through the service worker rather than opening a tab itself, because that is the route
 * every other entry point to the library already takes — one place decides where the library
 * lives. The failure path matters as much as the happy one: a student who presses the button and
 * gets nothing must be told, not left wondering.
 */

const PAGE = `
  <button id="btn-guide-open-library" type="button">Open your citation library</button>
  <p id="guide-status" role="status" aria-live="polite"></p>
  <button id="btn-guide-open-library-footer" type="button">Open your citation library</button>
`;

/** Mount the page fresh and hand back its module. */
async function mountPage() {
  jest.resetModules();
  document.body.innerHTML = PAGE;
  return import('../../../../src/pages/citation-guide/guide.js');
}

/** The mousedown-first activation the shared handler listens for. */
function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** Let the handler's promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  chrome.runtime.sendMessage.mockResolvedValue({ success: true });
});

describe('openCitationLibrary()', () => {
  it('asks the service worker to open the library', async () => {
    const { openCitationLibrary } = await mountPage();
    await expect(openCitationLibrary()).resolves.toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_CITATION_LIBRARY' });
  });

  it('reports failure rather than throwing at the page', async () => {
    const { openCitationLibrary } = await mountPage();
    chrome.runtime.sendMessage.mockRejectedValue(new Error('no receiving end'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(openCitationLibrary()).resolves.toBe(false);
  });
});

describe('the page as mounted', () => {
  it('wires both buttons', async () => {
    await mountPage();
    press(document.getElementById('btn-guide-open-library'));
    await settle();
    press(document.getElementById('btn-guide-open-library-footer'));
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('says so in the live region when the library cannot be opened', async () => {
    await mountPage();
    chrome.runtime.sendMessage.mockRejectedValue(new Error('no receiving end'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    press(document.getElementById('btn-guide-open-library'));
    await settle();

    expect(document.getElementById('guide-status').textContent).toMatch(/could not open/i);
  });

  it('leaves the live region silent when it worked', async () => {
    await mountPage();
    press(document.getElementById('btn-guide-open-library'));
    await settle();
    expect(document.getElementById('guide-status').textContent).toBe('');
  });

  it('mounts without either button present', async () => {
    jest.resetModules();
    document.body.innerHTML = '<p>nothing here</p>';
    const { initGuide } = await import('../../../../src/pages/citation-guide/guide.js');
    expect(() => initGuide()()).not.toThrow();
  });

  it('takes its handlers off again when cleaned up', async () => {
    const { initGuide } = await mountPage();
    const cleanup = initGuide();
    cleanup();
    // The module's own init is still bound; the second binding is the one just released, so a
    // press must produce exactly one message rather than two.
    press(document.getElementById('btn-guide-open-library'));
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
