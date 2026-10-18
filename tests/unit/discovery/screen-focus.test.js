/**
 * @jest-environment jsdom
 *
 * Where focus goes when the discovery quiz swaps one screen for another.
 *
 * "Retake quiz" used to leave focus on BODY with the page still scrolled to the bottom of the
 * results, so a keyboard or screen-reader user was told nothing had happened and a sighted one
 * was looking at the wrong part of the page. `showScreen` did call `focus()` on the new screen's
 * heading, but a heading is not focusable without `tabindex="-1"`, so the call did nothing at all.
 */

import fs from 'fs';
import path from 'path';

const PAGE = fs.readFileSync(
  path.join(__dirname, '../../../src/pages/discovery/discovery.html'),
  'utf8'
);

/** The page's markup, without the module script jsdom would not run anyway. */
function pageBody() {
  const body = PAGE.slice(PAGE.indexOf('<body>') + 6, PAGE.indexOf('</body>'));
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
}

/** Mount the real page markup and boot the controller against it. */
async function mountPage() {
  jest.resetModules();
  document.body.innerHTML = pageBody();
  await import('../../../src/pages/discovery/discovery.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

/**
 * Each mount imports a fresh copy of the page module, and every copy registers listeners on the one
 * shared document. Without removing them, a later test's key presses also drive every earlier
 * quiz against the same DOM.
 */
const documentListeners = [];
const addDocumentListener = document.addEventListener.bind(document);
document.addEventListener = (type, listener, options) => {
  documentListeners.push([type, listener, options]);
  addDocumentListener(type, listener, options);
};

afterEach(() => {
  for (const [type, listener, options] of documentListeners.splice(0)) {
    document.removeEventListener(type, listener, options);
  }
});

beforeEach(() => {
  // jsdom implements no scrolling at all; the page's call is what we are checking for.
  Element.prototype.scrollIntoView = jest.fn();
});

describe('discovery screen changes', () => {
  it('leaves focus alone on first paint', async () => {
    await mountPage();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new screen heading when the quiz starts', async () => {
    await mountPage();
    document.getElementById('btn-start').click();

    expect(document.activeElement).toBe(document.getElementById('question-heading'));
    expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
  });

  it('puts focus on the intro heading when the quiz is retaken', async () => {
    await mountPage();
    document.getElementById('btn-start').click();
    document.getElementById('btn-retake').click();

    expect(document.activeElement).toBe(document.getElementById('welcome-heading'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('scrolls the screen it moved to into view', async () => {
    await mountPage();
    Element.prototype.scrollIntoView.mockClear();

    document.getElementById('btn-start').click();
    document.getElementById('btn-retake').click();

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('keeps the headings out of the tab order', async () => {
    await mountPage();
    document.getElementById('btn-start').click();

    const focusables = Array.from(
      document.querySelectorAll('[tabindex]:not([tabindex="-1"])')
    ).filter(el => /^H[1-6]$/.test(el.tagName));
    expect(focusables).toEqual([]);
  });
});

describe('the Help link during the quiz', () => {
  // The quiz binds Enter on the whole document to "Next". Enter on the Help link has to open Help
  // and nothing else, or asking for help would silently skip the student past a question.
  it('does not advance the question when Enter is pressed on it', async () => {
    await mountPage();
    document.getElementById('btn-start').click();
    const heading = document.getElementById('question-heading');

    // Answer the first question, so Enter anywhere else would move on.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.getElementById('btn-next').disabled).toBe(false);
    const before = heading.textContent;

    const help = document.querySelector('[data-destination="help"]');
    help.focus();
    help.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(heading.textContent).toBe(before);
  });

  it('leaves Enter advancing the quiz from the answers themselves', async () => {
    await mountPage();
    document.getElementById('btn-start').click();
    const heading = document.getElementById('question-heading');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const before = heading.textContent;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(heading.textContent).not.toBe(before);
  });
});

describe('Enter on the quiz buttons', () => {
  // A browser answers Enter on a focused button with keydown and then a click on that button. The
  // quiz also binds Enter on the whole document to "Next", so Enter on Next moved on twice and
  // skipped a question, and Enter on Back moved on and then back again, going nowhere.

  /** What a browser does for Enter on a focused button: keydown, then the button's own click. */
  function pressEnterOn(button) {
    button.focus();
    const keydown = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button.dispatchEvent(keydown);
    if (!keydown.defaultPrevented) {
      button.click();
    }
  }

  async function startAndAnswer() {
    await mountPage();
    const { state } = await import('../../../src/pages/discovery/discovery.js');
    document.getElementById('btn-start').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    return state;
  }

  it('Enter on Next moves on exactly one question', async () => {
    const state = await startAndAnswer();
    expect(state.currentQuestion).toBe(0);

    pressEnterOn(document.getElementById('btn-next'));

    expect(state.currentQuestion).toBe(1);
  });

  it('Enter on Back goes back, even with an answer chosen', async () => {
    const state = await startAndAnswer();
    pressEnterOn(document.getElementById('btn-next'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const at = state.currentQuestion;

    pressEnterOn(document.getElementById('btn-back'));

    expect(state.currentQuestion).toBe(at - 1);
  });
});
