/**
 * @jest-environment jsdom
 *
 * A Text Customization choice the popup stored is applied on a page that opens afterwards, with no
 * message from the popup: the content script reads it from assist_settings when it loads.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function loadPageWith(assistSettings) {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  chrome.storage.local.get = jest.fn((keys, callback) => {
    const out = { assist_settings: structuredClone(assistSettings) };
    if (typeof callback === 'function') {
      callback(out);
      return undefined;
    }
    return Promise.resolve(out);
  });
  jest.isolateModules(() => {
    require('../../../src/features/textCustomization/textCustomization.js');
  });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<p>Reading for this week.</p>';
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

test('a stored choice is applied to a newly opened page', async () => {
  loadPageWith({
    textCustomization: {
      enabled: true,
      fontFamily: 'opendyslexic',
      lineSpacing: 2,
      letterSpacing: 0.2,
      wordSpacing: 0.16,
      paragraphSpacing: 2,
    },
  });
  await settle();

  const style = document.getElementById('assist-text-customization');
  expect(style).not.toBeNull();
  expect(style.textContent).toMatch(/OpenDyslexic/i);
});

test('a page opened with the feature off is left alone', async () => {
  loadPageWith({ textCustomization: { enabled: false, fontFamily: 'opendyslexic' } });
  await settle();

  expect(document.getElementById('assist-text-customization')).toBeNull();
});
