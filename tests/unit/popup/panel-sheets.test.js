/**
 * @jest-environment jsdom
 *
 * Citation Quick View and the dictation statistics, opened the way a student opens them: from
 * Flat, the only face the popup shows.
 *
 * Both used to unfold inline, inside the accordion. The accordion is hidden now (Flat drives it),
 * so pressing either button in Flat changed nothing anyone could see. Each now opens in a dialog of
 * the popup's own, with the keyboard managed on the way in and handed back to Flat's button on the
 * way out, and the panel goes back where it came from.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

jest.mock('../../../src/popup/citation-manager-panel.js', () => ({
  CitationManagerPanel: jest.fn(),
}));

let PopupController;
let CitationManagerPanel;
const initialize = jest.fn(async () => {});

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
  ({ CitationManagerPanel } = await import('../../../src/popup/citation-manager-panel.js'));
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function press(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function escape(element) {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  );
}

/** The dialog named `heading`, or null. */
function dialogNamed(heading) {
  return (
    [...document.querySelectorAll('[role="dialog"]')].find(
      node => document.getElementById(node.getAttribute('aria-labelledby'))?.textContent === heading
    ) || null
  );
}

/** Flat's copy of an accordion button, as the popup draws it. */
function flatCopyOf(id) {
  const copy = document.createElement('button');
  copy.id = `flat-${id}`;
  document.body.appendChild(copy);
  return copy;
}

function mount() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const popup = new PopupController();
  popup.settings = { stt: {} };
  popup.currentTab = { id: 7 };
  return popup;
}

beforeEach(() => {
  jest.clearAllMocks();
  CitationManagerPanel.mockImplementation(() => ({ initialize }));
  chrome.tabs = {
    ...(chrome.tabs || {}),
    sendMessage: jest.fn(async () => ({
      stats: { wordsPerMinute: 42, averageConfidence: 90, totalWords: 120, duration: 3 },
    })),
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Citation Quick View', () => {
  const open = () => {
    const popup = mount();
    popup.setupCitationPanel();
    const panel = document.getElementById('citation-manager-panel');
    const home = panel.parentNode;
    const copy = flatCopyOf('btn-expand-citations');
    press(document.getElementById('btn-expand-citations'));
    return { panel, home, copy };
  };

  test('opens in a dialog the student can see, with the saved citations in it', async () => {
    const { panel } = open();
    await flush();

    const dialog = dialogNamed('Citation Quick View');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(panel)).toBe(true);
    expect(panel.style.display).not.toBe('none');
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  test('Escape closes it, puts the panel back and the keyboard on Flat’s button', async () => {
    const { panel, home, copy } = open();
    await flush();

    escape(dialogNamed('Citation Quick View'));

    expect(dialogNamed('Citation Quick View')).toBeNull();
    expect(panel.parentNode).toBe(home);
    expect(panel.style.display).toBe('none');
    expect(document.activeElement).toBe(copy);
  });

  test('its Close button does the same', async () => {
    const { panel, home, copy } = open();
    await flush();

    const close = [...dialogNamed('Citation Quick View').querySelectorAll('button')].find(
      button => button.textContent.trim() === 'Close'
    );
    press(close);

    expect(dialogNamed('Citation Quick View')).toBeNull();
    expect(panel.parentNode).toBe(home);
    expect(document.activeElement).toBe(copy);
  });

  test('a second press while it is open opens nothing more', async () => {
    open();
    press(document.getElementById('btn-expand-citations'));
    await flush();

    expect(document.querySelectorAll('#citation-quick-view-dialog')).toHaveLength(1);
  });
});

describe('dictation statistics', () => {
  const open = () => {
    const popup = mount();
    popup.setupSTTStats();
    const summary = document.getElementById('stt-stats-summary');
    const home = summary.parentNode;
    const copy = flatCopyOf('stt-show-stats');
    press(document.getElementById('stt-show-stats'));
    return { summary, home, copy };
  };

  test('open in a dialog the student can see, filled from the page', async () => {
    const { summary } = open();
    await flush();

    const dialog = dialogNamed('Dictation statistics');
    expect(dialog).not.toBeNull();
    expect(dialog.contains(summary)).toBe(true);
    expect(summary.style.display).not.toBe('none');
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'GET_STT_STATS' });
    expect(document.getElementById('stt-stats-wpm').textContent).toBe('42');
    expect(document.getElementById('stt-stats-accuracy').textContent).toBe('90%');
  });

  test('Escape closes them and hands the keyboard back to Flat’s button', async () => {
    const { summary, home, copy } = open();
    await flush();

    escape(dialogNamed('Dictation statistics'));

    expect(dialogNamed('Dictation statistics')).toBeNull();
    expect(summary.parentNode).toBe(home);
    expect(summary.style.display).toBe('none');
    expect(document.activeElement).toBe(copy);
  });
});
