/**
 * @jest-environment jsdom
 *
 * Text Customization is remembered like every other setting.
 *
 * Font and spacing used to be saved only while an "Apply to all windows" switch was on, and it
 * shipped off. With it off, a change went to the current tab alone and was never stored, so the
 * student's spacing was gone on the next page load and the popup showed the feature off when it was
 * reopened. The switch is withdrawn: every change goes through the normal settings save, and the
 * content script applies the stored choice on every page.
 */

import fs from 'fs';
import path from 'path';

import { toolById } from '../../../src/popup/registry/tool-registry.js';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');
const POPUP_JS = fs.readFileSync(path.join(ROOT, 'src/popup/popup.js'), 'utf8');
const CONTENT_JS = fs.readFileSync(path.join(ROOT, 'src/content/content-simple.js'), 'utf8');
const FEATURE_JS = fs.readFileSync(
  path.join(ROOT, 'src/features/textCustomization/textCustomization.js'),
  'utf8'
);

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/** A chrome.storage.local that keeps what is written, callback or promise style. */
function installStore(initial = {}) {
  const data = structuredClone(initial);
  chrome.storage.local.get = jest.fn((keys, callback) => {
    const names = keys === null || keys === undefined ? Object.keys(data) : [].concat(keys);
    const out = {};
    names.forEach(name => {
      if (name in data) {
        out[name] = structuredClone(data[name]);
      }
    });
    if (typeof callback === 'function') {
      callback(out);
      return undefined;
    }
    return Promise.resolve(out);
  });
  chrome.storage.local.set = jest.fn((payload, callback) => {
    Object.assign(data, structuredClone(payload));
    if (typeof callback === 'function') {
      callback();
      return undefined;
    }
    return Promise.resolve();
  });
  return data;
}

/** The popup opened over whatever is on disk now, with Text Customization set up. */
async function openPopup(data) {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  chrome.tabs.sendMessage = jest.fn().mockResolvedValue({});
  chrome.runtime.sendMessage = jest.fn(async message => {
    if (message.type === 'GET_SETTINGS') {
      return { success: true, data: structuredClone(data.assist_settings || {}) };
    }
    return { success: true };
  });
  const popup = new PopupController();
  popup.currentTab = { id: 7 };
  expect(await popup.loadSettings()).toBe(true);
  popup.setupTextCustomization();
  return popup;
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('Text Customization is remembered', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('stores a font and spacing choice through the normal settings save', async () => {
    const data = installStore({ assist_settings: { tts: { rate: 1.2 } } });
    await openPopup(data);

    const enabled = document.getElementById('text-customization-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    const font = document.getElementById('text-font-family');
    font.value = 'opendyslexic';
    font.dispatchEvent(new Event('change', { bubbles: true }));
    const lines = document.getElementById('text-line-spacing');
    lines.value = '2';
    lines.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    expect(data.assist_settings.textCustomization).toMatchObject({
      enabled: true,
      fontFamily: 'opendyslexic',
      lineSpacing: 2,
    });
    expect(data.assist_settings.tts.rate).toBe(1.2);
    // Nothing is sent to one tab alone any more.
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'LOCAL_TEXT_CUSTOMIZATION' })
    );
  });

  it('shows the stored choice when the popup is opened again', async () => {
    const data = installStore({});
    await openPopup(data);
    const enabled = document.getElementById('text-customization-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    const letters = document.getElementById('text-letter-spacing');
    letters.value = '20';
    letters.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    await openPopup(data);

    expect(document.getElementById('text-customization-enabled').checked).toBe(true);
    expect(document.getElementById('text-letter-spacing').value).toBe('20');
  });
});

describe('the "Apply to all windows" switch is withdrawn', () => {
  it('is gone from the popup markup', () => {
    const doc = new DOMParser().parseFromString(POPUP_HTML, 'text/html');
    expect(doc.getElementById('text-customization-sync')).toBeNull();
    expect(doc.getElementById('text-customization-options').textContent).not.toMatch(
      /all windows/i
    );
  });

  it('is gone from the Flat registry', () => {
    const tool = toolById('text-customization');
    const ids = (tool.controls || []).map(control => control.id);
    expect(ids).not.toContain('text-customization-sync');
    expect(JSON.stringify(tool)).not.toContain('textCustomSync');
  });

  it('leaves no one-tab path behind in the popup, the content script or the feature', () => {
    for (const source of [POPUP_JS, CONTENT_JS, FEATURE_JS]) {
      expect(source).not.toMatch(/LOCAL_TEXT_CUSTOMIZATION|CLEAR_TEXT_CUSTOMIZATION/);
      expect(source).not.toMatch(/textCustomSync|text-customization-sync/);
    }
    expect(FEATURE_JS).not.toMatch(/assistFeatures\.textCustomization/);
  });
});
