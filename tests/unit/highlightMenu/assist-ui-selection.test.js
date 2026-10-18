/**
 * @jest-environment jsdom
 *
 * The highlight menu belongs to the page's text, not to AssisT's own UI. Speed Read leaves the
 * page selection in place while it runs, so every press on one of its buttons ended in a
 * document-level mouseup that found that selection and opened the menu over the overlay. The
 * same happened in every other AssisT panel, and selecting words inside a panel opened the menu
 * there too.
 */

function menu() {
  return document.getElementById('assist-highlight-menu');
}

/** Select every word of `element` with a real selection. */
function select(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function mouseUpOn(target) {
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function shiftArrowOn(target) {
  target.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true })
  );
}

/** Mount a stand-in for one of AssisT's surfaces and return the button inside it. */
function mountSurface(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const surface = holder.firstElementChild;
  document.body.appendChild(surface);
  return surface;
}

beforeAll(() => {
  // jsdom has no layout; the menu only needs a rectangle to position itself.
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 10,
    left: 0,
    right: 10,
    width: 10,
    height: 10,
  });
  chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  document.body.innerHTML = '<p id="para">Working memory holds only a little at a time.</p>';
  window.getSelection().removeAllRanges();
});

test('a selection on the page still opens the menu', () => {
  const para = document.getElementById('para');
  select(para);
  mouseUpOn(para);
  expect(menu()).not.toBeNull();
});

describe('pressing a button in an AssisT surface while page text is still selected', () => {
  test.each([
    [
      'the Speed Read overlay',
      '<div id="assist-rsvp-overlay" role="dialog"><div><button>Pause</button></div></div>',
    ],
    [
      'an AssisT dialog',
      '<div id="assist-translation-modal" role="dialog"><button>Translate</button></div>',
    ],
    [
      'the companion dock',
      '<div id="assist-companion-dock"><div><button>Flashcards</button></div></div>',
    ],
    [
      'a panel named only by its class',
      '<div class="assist-sticky-note"><button>Close</button></div>',
    ],
    ['the action tray', '<div class="assist-action-tray"><button>Copy</button></div>'],
    [
      'the consent panel host',
      '<div data-assist-consent-panel="cloud"><button>Allow</button></div>',
    ],
  ])('%s does not open the menu', (_name, html) => {
    select(document.getElementById('para'));
    const button = mountSurface(html).querySelector('button');

    mouseUpOn(button);

    expect(menu()).toBeNull();
  });
});

test('words selected inside an AssisT panel do not open the menu', () => {
  const panel = mountSurface(
    '<section id="assist-summary-panel"><p>A short summary of the reading.</p></section>'
  );
  const text = panel.querySelector('p');
  select(text);

  mouseUpOn(text);
  expect(menu()).toBeNull();

  // Released outside the panel, the selection is still the panel's.
  mouseUpOn(document.body);
  expect(menu()).toBeNull();
});

test('a triple-click on the last paragraph, which Chrome ends inside AssisT UI, opens the menu', () => {
  // Chrome ends a triple-click selection at offset 0 of whatever follows the paragraph; on a
  // course page that is often AssisT's capture bar, appended after the page's own content.
  const para = document.getElementById('para');
  const cite = mountSurface('<div class="assist-capture-bar"><button>Cite</button></div>');
  const range = document.createRange();
  range.setStart(para.firstChild, 0);
  range.setEnd(cite.querySelector('button'), 0);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  mouseUpOn(para);

  expect(menu()).not.toBeNull();
});

test("Reading Mode's copy of the article is page text, so the menu opens there", () => {
  const overlay = mountSurface(
    '<div id="assist-reading-mode-overlay" role="dialog"><article id="assist-reading-mode-content">' +
      '<h1 id="assist-reading-mode-title">Memory</h1><div><p>Working memory is small.</p></div>' +
      '</article><button id="assist-reading-mode-close">Close</button></div>'
  );
  const text = overlay.querySelector('p');
  select(text);
  mouseUpOn(text);
  expect(menu()).not.toBeNull();
});

test('a keyboard selection made while focus is in an AssisT surface does not open the menu', () => {
  select(document.getElementById('para'));
  const button = mountSurface(
    '<div id="assist-rsvp-overlay" role="dialog"><button>Faster</button></div>'
  ).querySelector('button');
  button.focus();

  shiftArrowOn(button);

  expect(menu()).toBeNull();
});

test('a keyboard selection on the page still opens the menu', () => {
  const para = document.getElementById('para');
  select(para);
  shiftArrowOn(para);
  expect(menu()).not.toBeNull();
});
