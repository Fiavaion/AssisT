/**
 * @jest-environment jsdom
 *
 * The translation dialog claims aria-modal="true" but kept none of the promise: Tab walked out
 * of it and onto the highlight menu's buttons behind (SC 2.1.2), closing it dropped focus to
 * the top of the page (SC 2.4.3), and a failed translation was painted into the result box in
 * red with no announcement at all — where a student using a screen reader never heard it.
 */

let openModal;
let closeModal;
let translate;

function modal() {
  return document.getElementById('assist-translation-modal');
}

function focusables() {
  return Array.from(
    modal().querySelectorAll('button:not([disabled]), select, [tabindex]:not([tabindex="-1"])')
  );
}

function press(key, options = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  (document.activeElement || document.body).dispatchEvent(event);
  return event;
}

beforeAll(() => {
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  require('../../../src/features/translation/translation-ui.js');
  openModal = window.assistFeatures.translationUI.openModal;
  closeModal = window.assistFeatures.translationUI.closeModal;
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  document.body.innerHTML = '<p id="para">Dyslexia is a learning disability</p>';
  translate = jest.fn().mockResolvedValue({ translatedText: 'Dislexia', engine: 'mymemory' });
  window.assistFeatures.translation = { translate };
});

afterEach(() => {
  closeModal();
  jest.useRealTimers();
});

describe('translation dialog — keyboard and announcements', () => {
  test('it is a labelled modal with focus moved into it', () => {
    openModal('Dyslexia is a learning disability');
    jest.advanceTimersByTime(200);

    expect(modal().getAttribute('role')).toBe('dialog');
    expect(modal().getAttribute('aria-modal')).toBe('true');
    const label = modal().getAttribute('aria-labelledby');
    expect(modal().querySelector(`#${label}`).textContent).toMatch(/translation/i);
    expect(modal().contains(document.activeElement)).toBe(true);
  });

  test('Tab at the last control wraps back inside instead of leaving', () => {
    openModal('Dyslexia is a learning disability');
    jest.advanceTimersByTime(200);

    const all = focusables();
    all[all.length - 1].focus();
    const event = press('Tab');

    expect(event.defaultPrevented).toBe(true);
    expect(modal().contains(document.activeElement)).toBe(true);
  });

  test('Escape closes it and focus goes back to the text that was selected', () => {
    const para = document.getElementById('para');
    openModal('Dyslexia is a learning disability', null, null, { returnFocus: para });
    jest.advanceTimersByTime(200);

    press('Escape');

    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(para);
  });

  test('a failure is one plain sentence in an alert, with no raw prefix', async () => {
    translate.mockResolvedValue({
      translatedText: null,
      sameLanguage: true,
      error: 'That text is already in the language you picked. Choose another language.',
    });

    openModal('Dyslexia is a learning disability');
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const alert = modal().querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toMatch(/already in English/i);
    expect(alert.textContent).not.toMatch(/^Error:/);
    expect(modal().textContent).not.toMatch(/Error: /);
  });

  test('a successful translation clears the alert', async () => {
    openModal('Dyslexia is a learning disability', null, 'es');
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal().querySelector('[role="alert"]').textContent).toBe('');
    expect(document.getElementById('assist-translation-translated-text').textContent).toBe(
      'Dislexia'
    );
  });
});

describe('translation dialog — after the student said "not now" to MyMemory', () => {
  const DECLINED = {
    translatedText: null,
    consentDeclined: true,
    error: 'Nothing was sent. You chose not to use MyMemory to translate text.',
  };

  async function openAndSettle() {
    openModal('Dyslexia is a learning disability', null, 'es');
    jest.advanceTimersByTime(200);
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  }

  test('says nothing was sent, announced, with Allow in the dialog', async () => {
    translate.mockResolvedValue(DECLINED);
    await openAndSettle();

    const notice = modal().querySelector('[data-assist-consent-notice]');
    expect(notice).not.toBeNull();
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toMatch(/nothing was sent/i);
    expect(notice.querySelector('button').textContent).toMatch(/Allow MyMemory/);
    expect(focusables()).toContain(notice.querySelector('button'));
    // Said once, not twice.
    expect(document.getElementById('assist-translation-message').textContent).toBe('');
    expect(document.getElementById('assist-translation-translated-text').textContent).not.toMatch(
      /Dislexia/
    );
  });

  test('a later translation that works takes the message away', async () => {
    translate.mockResolvedValueOnce(DECLINED);
    await openAndSettle();
    expect(modal().querySelector('[data-assist-consent-notice]')).not.toBeNull();

    translate.mockResolvedValue({ translatedText: 'Dislexia', engine: 'mymemory' });
    document.getElementById('assist-translation-translate-btn').dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }

    expect(modal().querySelector('[data-assist-consent-notice]')).toBeNull();
    expect(document.getElementById('assist-translation-translated-text').textContent).toBe(
      'Dislexia'
    );
  });
});
