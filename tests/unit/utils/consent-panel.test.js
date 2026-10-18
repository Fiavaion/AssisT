/**
 * @jest-environment jsdom
 *
 * The first-use consent panel (ADR 0006): the first time a student uses a feature that sends
 * something to an outside service, a short panel names the service, says what is sent, and asks.
 *
 * It is a dialog like the extension's others: focus goes in and comes back, Escape means "not
 * now", every control works from the keyboard, and page text never reaches its markup unescaped.
 * One thing is particular to it: it is drawn over a page whose scripts are not ours, so it lives
 * in a closed shadow root, and nothing but the student's own press on a visible Allow is a yes.
 *
 * jsdom cannot make trusted input, so tests pass `acceptsEvent` to stand in for `isTrusted`; the
 * button, focus and visibility rules still apply. `shadowRootForTests` reaches the closed root.
 */

import {
  askForConsent,
  createDeclinedNotice,
  shadowRootForTests,
} from '../../../src/utils/consent-panel.js';
import { CONSENT_STORAGE_KEYS, consentStorageKey } from '../../../src/utils/consent.js';
import { Z } from '../../../src/utils/z-index.js';

const trusted = () => true;

const COVERED_MESSAGE =
  'Allow is not available because something on this page is covering or fading this question. ' +
  'A colour filter or another extension can do this. You can allow Free Dictionary in the ' +
  'AssisT popup instead: choose Advanced options (the gear button), then Your data.';
let stored;

function panel() {
  return document.querySelector('[data-assist-consent-panel]');
}

function root() {
  return shadowRootForTests(panel());
}

function dialog() {
  return root() && root().querySelector('[role="dialog"]');
}

function button(name) {
  return Array.from((root() || document).querySelectorAll('button')).find(
    b => b.textContent.trim() === name
  );
}

function focused() {
  return (root() && root().activeElement) || document.activeElement;
}

function press(key, target = focused() || document.body, init = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
}

function mousedown(target, init = {}) {
  target.dispatchEvent(
    new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      ...init,
    })
  );
}

function noAnswerStored() {
  return CONSENT_STORAGE_KEYS.every(key => !(key in stored));
}

/** Past the next frame, when the panel's status region is filled. */
function afterNextFrame() {
  jest.advanceTimersByTime(100);
}

async function settle() {
  jest.advanceTimersByTime(10);
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  stored = {};
  chrome.storage.local.get = jest.fn(async keys => {
    const out = {};
    [].concat(keys).forEach(key => {
      if (key in stored) {
        out[key] = stored[key];
      }
    });
    return out;
  });
  chrome.storage.local.set = jest.fn(async values => Object.assign(stored, values));
  // An extension page, where the panel itself can ask Chrome for a host (ADR 0009). The tests for
  // a page, where it cannot, remove this.
  chrome.permissions = { request: jest.fn().mockResolvedValue(true) };
  document.body.innerHTML = '<button id="opener">Look up</button>';
  document.getElementById('opener').focus();
});

afterEach(() => {
  if (panel()) {
    press('Escape');
  }
  delete chrome.permissions;
  jest.useRealTimers();
});

describe('what the panel says', () => {
  test('names the service, says what is sent, and offers Allow and Not now', async () => {
    askForConsent('dictionary', { detail: 'dyslexia', acceptsEvent: trusted });
    await settle();

    const text = dialog().textContent;
    expect(text).toMatch(/Free Dictionary/);
    expect(text).toMatch(/the word you selected/);
    expect(text).toMatch(/dyslexia/);
    expect(text).toMatch(/not your name/i);
    expect(button('Allow')).toBeTruthy();
    expect(button('Not now')).toBeTruthy();
  });

  test('shows page text as text, never as markup', async () => {
    askForConsent('dictionary', {
      detail: '<img src=x onerror="window.pwned=1">',
      acceptsEvent: trusted,
    });
    await settle();

    expect(dialog().querySelector('img')).toBeNull();
    expect(dialog().textContent).toContain('<img src=x');
  });

  test('shortens a long selection rather than filling the screen with it', async () => {
    askForConsent('translation', { detail: 'word '.repeat(200), acceptsEvent: trusted });
    await settle();
    const quoted = dialog().querySelector('[data-assist-consent-detail]');
    expect(quoted.textContent.length).toBeLessThan(140);
  });

  test('can say what the detail is when it is a sample, not the whole of it', async () => {
    askForConsent('pageTranslation', {
      detail: 'Week 3 discussion',
      detailLabel: 'This page has 40 passages. The first is:',
      acceptsEvent: trusted,
    });
    await settle();
    expect(dialog().textContent).toMatch(/This page has 40 passages\. The first is:/);
    expect(dialog().textContent).not.toMatch(/This time that is/);
  });
});

describe('asked again after an earlier no, because the student pressed the tool', () => {
  test('says the earlier answer was no and nothing was sent, and still offers Allow', async () => {
    askForConsent('dictation', { declinedBefore: true, acceptsEvent: trusted });
    await settle();
    expect(dialog().textContent).toMatch(/Earlier you chose not to allow this, so nothing was sent/);
    expect(dialog().textContent).toMatch(/voice/);
    expect(button('Allow')).toBeTruthy();
  });
});

describe('a dialog like every other', () => {
  test('is a labelled, described modal dialog, above anything the page can stack', async () => {
    askForConsent('translation', { acceptsEvent: trusted });
    await settle();

    const d = dialog();
    expect(d.getAttribute('aria-modal')).toBe('true');
    const title = root().getElementById(d.getAttribute('aria-labelledby'));
    const body = root().getElementById(d.getAttribute('aria-describedby'));
    expect(title.textContent).toMatch(/MyMemory/);
    expect(body.textContent).toMatch(/text you selected/);
    expect(panel().style.getPropertyValue('z-index')).toBe(String(Z.POINTER));
  });

  test('moves focus in, on the choice that sends nothing', async () => {
    askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();
    expect(focused()).toBe(button('Not now'));
  });

  test('Escape means not now: records a no, closes, and gives focus back', async () => {
    const answer = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    press('Escape');
    await expect(answer).resolves.toBe('declined');
    expect(panel()).toBeNull();
    expect(stored[consentStorageKey('dictionary')].granted).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('opener'));
  });

  test('Not now from the keyboard records a no', async () => {
    const answer = askForConsent('citations', { acceptsEvent: trusted });
    await settle();
    press('Enter', button('Not now'));
    await expect(answer).resolves.toBe('declined');
    expect(stored[consentStorageKey('citations')].granted).toBe(false);
  });

  test('Allow from the keyboard records a yes, closes, and gives focus back', async () => {
    const answer = askForConsent('translation', { acceptsEvent: trusted });
    await settle();
    button('Allow').focus();
    press(' ', button('Allow'));
    await expect(answer).resolves.toBe('granted');
    expect(stored[consentStorageKey('translation')].granted).toBe(true);
    expect(stored[consentStorageKey('translation')].at).toEqual(expect.any(String));
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('opener'));
  });

  test('Allow with the mouse records a yes', async () => {
    const answer = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();
    mousedown(button('Allow'));
    await expect(answer).resolves.toBe('granted');
  });

  test('focus never goes to a feature dialog that is still in the page but not shown', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="stale" role="dialog" aria-modal="true" tabindex="-1" style="display:none"></div>' +
        '<button id="back">Back</button>'
    );
    // jsdom has no layout; Chrome says an element with display:none on it is not rendered.
    document.getElementById('stale').checkVisibility = () => false;
    const answer = askForConsent('dictionary', {
      acceptsEvent: trusted,
      returnFocus: document.getElementById('back'),
    });
    await settle();
    document.getElementById('opener').remove();

    press('Escape');
    await answer;
    expect(document.activeElement).toBe(document.getElementById('back'));
  });

  test('two lookups at once share one panel and one answer', async () => {
    const first = askForConsent('dictionary', { acceptsEvent: trusted });
    const second = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();
    expect(document.querySelectorAll('[data-assist-consent-panel]')).toHaveLength(1);
    mousedown(button('Allow'));
    await expect(first).resolves.toBe('granted');
    await expect(second).resolves.toBe('granted');
  });
});

describe('a yes the page made up is not a yes', () => {
  function watch(answer) {
    const state = { settled: false };
    answer.then(() => {
      state.settled = true;
    });
    return state;
  }

  test('a synthetic click on Allow, by default, records nothing and leaves the panel up', async () => {
    const state = watch(askForConsent('dictionary'));
    await settle();

    mousedown(button('Allow'));
    button('Allow').focus();
    press('Enter', button('Allow'));
    await settle();

    expect(state.settled).toBe(false);
    expect(panel()).not.toBeNull();
    expect(noAnswerStored()).toBe(true);
  });

  test('the panel is in a closed shadow root: the page cannot find, style or click its buttons', async () => {
    askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    expect(panel().shadowRoot).toBeNull();
    expect(document.querySelectorAll('[data-assist-consent-panel] button')).toHaveLength(0);
    expect(root().querySelectorAll('button')).toHaveLength(2);
  });

  test('a style the page planted under the old style id does not replace the panel’s own', async () => {
    const planted = document.createElement('style');
    planted.id = 'assist-consent-styles';
    planted.textContent = 'button { opacity: 0 !important; }';
    document.head.appendChild(planted);

    askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    expect(root().querySelector('style').textContent).toMatch(/\.assist-consent-backdrop/);
    planted.remove();
  });

  test('a right-click or middle-click on Allow is not a yes', async () => {
    const state = watch(askForConsent('dictionary', { acceptsEvent: trusted }));
    await settle();

    mousedown(button('Allow'), { button: 2 });
    mousedown(button('Allow'), { button: 1 });
    await settle();

    expect(state.settled).toBe(false);
    expect(noAnswerStored()).toBe(true);
  });

  test('Enter counts only with focus on Allow inside the panel, and never held down', async () => {
    const state = watch(askForConsent('dictionary', { acceptsEvent: trusted }));
    await settle();

    // Focus is on Not now: an Enter aimed at Allow from anywhere else is not the student's.
    press('Enter', button('Allow'));
    button('Allow').focus();
    press('Enter', button('Allow'), { repeat: true });
    await settle();

    expect(state.settled).toBe(false);
    expect(noAnswerStored()).toBe(true);
  });

  test('restyling or hiding the panel is undone before it can be seen', async () => {
    askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();
    const original = panel().getAttribute('style');

    panel().style.opacity = '0';
    panel().setAttribute('hidden', '');
    panel().className = 'page-made-this-invisible';
    await settle();

    expect(panel().getAttribute('style')).toBe(original);
    expect(panel().hasAttribute('hidden')).toBe(false);
    expect(panel().hasAttribute('class')).toBe(false);
    expect(panel().style.getPropertyValue('opacity')).toBe('1');
    expect(noAnswerStored()).toBe(true);
  });

  test('removing the panel closes it, sends nothing and records nothing', async () => {
    const answer = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    panel().remove();
    await expect(answer).resolves.toBe('declined');
    expect(noAnswerStored()).toBe(true);
  });

  describe('where Chrome reports whether Allow can be seen', () => {
    let reportVisible;
    const realIO = global.IntersectionObserver;
    const realEntry = global.IntersectionObserverEntry;

    beforeEach(() => {
      global.IntersectionObserverEntry = class {};
      global.IntersectionObserverEntry.prototype.isVisible = false;
      global.IntersectionObserver = class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target) {
          reportVisible = isVisible => this.callback([{ target, isVisible }]);
        }
        disconnect() {}
      };
    });

    afterEach(() => {
      global.IntersectionObserver = realIO;
      global.IntersectionObserverEntry = realEntry;
    });

    test('a press on an Allow the page has covered or faded is not a yes', async () => {
      const answer = askForConsent('dictionary', { acceptsEvent: trusted });
      const state = watch(answer);
      await settle();

      reportVisible(false);
      mousedown(button('Allow'));
      await settle();
      expect(state.settled).toBe(false);

      reportVisible(true);
      mousedown(button('Allow'));
      await expect(answer).resolves.toBe('granted');
    });

    // A press before Chrome's first report cannot be judged by a later one: between the press and
    // the report a page can fade Allow's ancestors, take the press, and put them back. So until
    // Chrome has said Allow can be seen, Allow is marked unavailable and the panel says why.
    test('until Chrome has reported, Allow is unavailable and the panel says it is getting ready', async () => {
      askForConsent('dictionary', { acceptsEvent: trusted });
      await settle();
      afterNextFrame();

      expect(button('Allow').getAttribute('aria-disabled')).toBe('true');
      const waiting = root().querySelector('[role="status"]');
      expect(waiting.textContent).toBe('Getting ready…');
      expect(dialog().contains(waiting)).toBe(true);

      reportVisible(true);
      expect(button('Allow').hasAttribute('aria-disabled')).toBe(false);
      expect(dialog().textContent).not.toMatch(/Getting ready/);
    });

    // A status region created and filled in the same task as the panel opens is never announced:
    // a screen reader only hears changes to a region that was already there.
    test('the status region is in place, empty, from the start, and is filled on the next frame', () => {
      askForConsent('dictionary', { acceptsEvent: trusted });

      const status = root().querySelector('[role="status"]');
      expect(dialog().contains(status)).toBe(true);
      expect(status.textContent).toBe('');

      afterNextFrame();
      expect(status.textContent).toBe('Getting ready…');

      reportVisible(true);
      expect(root().querySelector('[role="status"]')).toBe(status);
      expect(status.textContent).toBe('');
    });

    test('a report before the next frame means "Getting ready…" is never shown', () => {
      askForConsent('dictionary', { acceptsEvent: trusted });
      reportVisible(true);
      afterNextFrame();

      expect(root().querySelector('[role="status"]').textContent).toBe('');
    });

    test('a press while getting ready is never a yes, even when a later report says visible', async () => {
      const state = watch(askForConsent('dictionary', { acceptsEvent: trusted }));
      await settle();

      mousedown(button('Allow'));
      reportVisible(true);
      await settle();

      expect(state.settled).toBe(false);
      expect(panel()).not.toBeNull();
      expect(noAnswerStored()).toBe(true);
    });

    test('Not now and Escape work while getting ready', async () => {
      const answer = askForConsent('dictionary', { acceptsEvent: trusted });
      await settle();
      press('Escape');
      await expect(answer).resolves.toBe('declined');
    });

    test('after a visible report, a press is a yes at once, in the same task', async () => {
      const answer = askForConsent('dictionary', { acceptsEvent: trusted });
      await settle();

      reportVisible(true);
      mousedown(button('Allow'));

      expect(panel()).toBeNull();
      await expect(answer).resolves.toBe('granted');
    });

    test('when Chrome never reports, the waiting ends after two seconds and the other guards decide', async () => {
      const answer = askForConsent('dictionary', { acceptsEvent: trusted });
      await settle();

      // settle() has already let 10 ms pass.
      jest.advanceTimersByTime(1980);
      expect(button('Allow').getAttribute('aria-disabled')).toBe('true');
      jest.advanceTimersByTime(10);
      expect(button('Allow').hasAttribute('aria-disabled')).toBe(false);
      expect(dialog().textContent).not.toMatch(/Getting ready/);

      mousedown(button('Allow'));
      await expect(answer).resolves.toBe('granted');
    });

    test('a report that Allow is covered keeps it unavailable past the two seconds', async () => {
      const state = watch(askForConsent('dictionary', { acceptsEvent: trusted }));
      await settle();

      reportVisible(false);
      jest.advanceTimersByTime(3000);
      mousedown(button('Allow'));
      await settle();

      expect(button('Allow').getAttribute('aria-disabled')).toBe('true');
      expect(state.settled).toBe(false);
    });

    // A colour filter or another extension that fades the whole page makes Chrome report Allow as
    // not visible for as long as it is on, so "Getting ready…" would never end.
    test('when Allow is still reported covered after two seconds, the panel says why and where else to allow it', async () => {
      const state = watch(askForConsent('dictionary', { acceptsEvent: trusted }));
      await settle();
      afterNextFrame();

      reportVisible(false);
      // settle() and afterNextFrame() have already let 110 ms pass.
      jest.advanceTimersByTime(1880);
      const status = root().querySelector('[role="status"]');
      expect(status.textContent).toBe('Getting ready…');

      jest.advanceTimersByTime(10);
      expect(status.textContent).toBe(COVERED_MESSAGE);
      expect(button('Allow').getAttribute('aria-disabled')).toBe('true');
      mousedown(button('Allow'));
      await settle();
      expect(state.settled).toBe(false);
      expect(noAnswerStored()).toBe(true);

      // Once nothing covers it and Chrome can see Allow, the question works as usual.
      reportVisible(true);
      expect(status.textContent).toBe('');
      expect(button('Allow').hasAttribute('aria-disabled')).toBe(false);
    });
  });

  test('where Chrome cannot report visibility, there is no waiting at all', async () => {
    askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();
    afterNextFrame();
    expect(button('Allow').hasAttribute('aria-disabled')).toBe(false);
    expect(root().querySelector('[role="status"]').textContent).toBe('');
  });
});

describe('the message after a "not now"', () => {
  test('says plainly that nothing was sent, and why, and offers Allow in place', () => {
    const notice = createDeclinedNotice('dictionary', { onAllowed: jest.fn() });
    document.body.appendChild(notice);
    expect(notice.textContent).toMatch(/nothing was sent/i);
    expect(notice.textContent).toMatch(/Free Dictionary/);
    expect(notice.querySelector('button').textContent).toMatch(/Allow Free Dictionary/);
  });

  test('its Allow does not say yes itself: it opens the panel, where the yes is given', async () => {
    const onAllowed = jest.fn();
    const notice = createDeclinedNotice('dictionary', {
      onAllowed,
      panelOptions: { acceptsEvent: trusted },
    });
    document.body.appendChild(notice);

    press('Enter', notice.querySelector('button'));
    await settle();

    expect(noAnswerStored()).toBe(true);
    expect(onAllowed).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();

    mousedown(button('Allow'));
    await settle();

    expect(stored[consentStorageKey('dictionary')].granted).toBe(true);
    expect(onAllowed).toHaveBeenCalledTimes(1);
  });

  test('a "not now" in that panel leaves the lookup undone', async () => {
    const onAllowed = jest.fn();
    const notice = createDeclinedNotice('dictionary', { onAllowed });
    document.body.appendChild(notice);

    mousedown(notice.querySelector('button'));
    await settle();
    press('Escape');
    await settle();

    expect(onAllowed).not.toHaveBeenCalled();
  });

  test('a service that needs a Chrome host is offered in place too, never sent elsewhere', () => {
    // ADR 0009: the question that comes with a host can be asked from a page (in a window), so the
    // notice no longer sends the student off to the popup.
    const notice = createDeclinedNotice('citationVerification', { onAllowed: jest.fn() });
    document.body.appendChild(notice);
    expect(notice.textContent).toMatch(/Semantic Scholar/);
    expect(notice.querySelector('button').textContent).toBe('Allow Semantic Scholar');
  });
});

describe('a service that needs a Chrome host (ADR 0009)', () => {
  test('in an extension page, Allow asks Chrome for the host in the same press', async () => {
    const answer = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    mousedown(button('Allow'));

    // Asked before anything was awaited: a gesture does not survive an await.
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.dictionaryapi.dev/*'],
    });
    await settle();
    await expect(answer).resolves.toBe('granted');
    expect(stored[consentStorageKey('dictionary')].granted).toBe(true);
  });

  test('in an extension page, a refused Chrome prompt is a no', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    const answer = askForConsent('dictionary', { acceptsEvent: trusted });
    await settle();

    mousedown(button('Allow'));
    await settle();

    await expect(answer).resolves.toBe('declined');
    expect(stored[consentStorageKey('dictionary')].granted).toBe(false);
  });

  describe('from a page, where there is no chrome.permissions', () => {
    let onAnswer;

    function answerFromWindow(message) {
      onAnswer(message, { id: chrome.runtime.id }, () => {});
    }

    beforeEach(() => {
      delete chrome.permissions;
      chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true, request: 'r1' });
      chrome.runtime.onMessage.addListener.mockImplementation(listener => {
        onAnswer = listener;
      });
    });

    test('asks in an extension window instead of drawing a panel the page could reach', async () => {
      const opener = document.getElementById('opener');
      askForConsent('dictionary', { detail: 'dyslexia', returnFocus: opener });
      await settle();

      expect(panel()).toBeNull();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CONSENT_WINDOW_OPEN',
        destination: 'dictionary',
        detail: 'dyslexia',
      });
      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
    });

    test('the answer given in the window is the answer, and the listener goes', async () => {
      const answer = askForConsent('dictionary', {});
      await settle();

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'other', answer: 'granted' });
      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'granted' });

      await expect(answer).resolves.toBe('granted');
      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(onAnswer);
      // The window records the answer itself; the page records nothing.
      expect(noAnswerStored()).toBe(true);
    });

    test('a window closed without an answer is a no, and nothing is recorded', async () => {
      const answer = askForConsent('dictionary', {});
      await settle();

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });

      await expect(answer).resolves.toBe('declined');
      expect(noAnswerStored()).toBe(true);
    });

    function windowStatus() {
      return document.querySelector('[data-assist-consent-window-status]');
    }

    test('while the window asks, the page says where the question is, politely', async () => {
      askForConsent('dictionary', {});
      await settle();
      afterNextFrame();

      const status = windowStatus();
      expect(status.getAttribute('role')).toBe('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent).toMatch(/separate window/);
      expect(status.textContent).toMatch(/Free Dictionary/);

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
      expect(windowStatus()).toBeNull();
    });

    test('asking again while the window is open brings it forward, not a dead tool', async () => {
      // A window that has fallen behind Chrome would otherwise leave the second press doing
      // nothing at all.
      const first = askForConsent('dictionary', {});
      await settle();
      afterNextFrame();

      const second = askForConsent('dictionary', {});
      // Cleared at once and said again on the next frame, so a screen reader hears it on the
      // second press too.
      expect(windowStatus().textContent).toBe('');
      await settle();
      afterNextFrame();

      expect(second).toBe(first);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CONSENT_WINDOW_FOCUS',
        request: 'r1',
      });
      expect(windowStatus().textContent).toMatch(/separate window/);

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'granted' });
      await expect(first).resolves.toBe('granted');
    });

    test('asked from inside an open dialog, the status is said inside it, where it is heard', async () => {
      // aria-modal hides everything outside the dialog from a screen reader, a status included.
      const dialogEl = document.createElement('div');
      dialogEl.setAttribute('role', 'dialog');
      dialogEl.setAttribute('aria-modal', 'true');
      document.body.appendChild(dialogEl);

      askForConsent('dictionary', {});
      await settle();
      afterNextFrame();

      expect(dialogEl.contains(windowStatus())).toBe(true);
      expect(windowStatus().textContent).toMatch(/separate window/);
      // In the dialog's own flow, not laid over it.
      expect(windowStatus().getAttribute('style') || '').not.toMatch(/position:\s*fixed/);

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
    });

    test('on the page itself, the status can be dismissed, so it never has to hide a control', async () => {
      // SC 2.4.11: a fixed note at the bottom of the page could cover what has focus.
      askForConsent('dictionary', {});
      await settle();
      afterNextFrame();

      const dismiss = button('Dismiss');
      expect(dismiss).toBeDefined();
      press('Enter', dismiss);
      expect(windowStatus()).toBeNull();

      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
    });

    test('the notice’s Allow asks in the window saying the earlier answer was no', async () => {
      // The notice only ever shows after a no, so the window must say so, as the panel does.
      const notice = createDeclinedNotice('dictionary', {
        onAllowed: jest.fn(),
        panelOptions: { detail: 'dyslexia' },
      });
      document.body.appendChild(notice);

      press('Enter', notice.querySelector('button'));
      await settle();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONSENT_WINDOW_OPEN',
          destination: 'dictionary',
          detail: 'dyslexia',
          declinedBefore: true,
        })
      );
      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
    });

    test('pressing the notice’s Allow again while the window asks brings the window forward', async () => {
      const notice = createDeclinedNotice('dictionary', { onAllowed: jest.fn() });
      document.body.appendChild(notice);

      press('Enter', notice.querySelector('button'));
      await settle();
      press('Enter', notice.querySelector('button'));
      await settle();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CONSENT_WINDOW_FOCUS',
        request: 'r1',
      });
      answerFromWindow({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'dismissed' });
      await settle();
    });

    test('a window that could not be opened is a no, not a hang', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: false });
      await expect(askForConsent('dictionary', {})).resolves.toBe('declined');
    });

    test('a service with no host (dictation) is still asked in the page', async () => {
      askForConsent('dictation', { acceptsEvent: trusted });
      await settle();
      expect(dialog()).not.toBeNull();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });
});
