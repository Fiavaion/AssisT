/**
 * @jest-environment jsdom
 *
 * The keyboard map is the whole product on this page, so the list of keys has to be reachable from
 * the keyboard itself and has to hand focus back where it came from.
 */

import {
  chordParts,
  mountShortcutsDialog,
} from '../../../../src/pages/mind-map/shortcuts-dialog.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(value) {
    this.open = false;
    this.returnValue = value === undefined ? '' : value;
    this.dispatchEvent(new Event('close'));
  };
});

let host;
let dialog;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  dialog = mountShortcutsDialog(host);
});

afterEach(() => {
  dialog.destroy();
  host.remove();
  document.body.innerHTML = '';
});

const element = () => host.querySelector('dialog');

it('lists the keys the page actually binds', () => {
  const text = element().textContent;

  for (const key of ['Ctrl+Z', 'Ctrl+S', 'F2', 'Alt+Up', 'Shift+Enter', 'Escape']) {
    expect(text).toContain(key);
  }
});

it('says what beta means, and where to say something about it', () => {
  const note = element().querySelector('.assist-mm-shortcuts__beta');

  // Three things a student needs: it works, it will change, and there is somewhere to tell us.
  expect(note.textContent).toMatch(/beta/i);
  expect(note.textContent).toMatch(/change/i);

  const link = note.querySelector('a');
  expect(link.getAttribute('href')).toBe(
    'https://github.com/Fiavaion/AssisT/issues/new?template=bug_report.md'
  );
  // A new tab, said in the link's own name rather than left as a surprise (SC 3.2.5).
  expect(link.target).toBe('_blank');
  expect(link.rel).toContain('noopener');
  expect(link.textContent).toMatch(/new tab/i);
});

it('is closed until it is asked for', () => {
  expect(element().open).toBe(false);
  expect(dialog.isOpen()).toBe(false);

  dialog.open();

  expect(element().open).toBe(true);
  expect(dialog.isOpen()).toBe(true);
});

// Focus on Close scrolled the dialog to its foot, so it opened with the title and the first groups
// out of sight; and a list scrolled down last time opened there again.
it('opens at its title, with focus on Close', () => {
  const close = element().querySelector('[data-command="close"]');
  const focus = jest.spyOn(close, 'focus');
  element().scrollTop = 400;

  dialog.open();

  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(document.activeElement).toBe(close);
  expect(element().scrollTop).toBe(0);
});

it('gives focus back to whatever opened it', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();

  dialog.open();
  element().dispatchEvent(new Event('close'));

  expect(document.activeElement).toBe(opener);
});

it('closes from its own button', () => {
  dialog.open();

  element()
    .querySelector('[data-command="close"]')
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  expect(element().open).toBe(false);
});

it('closes from the keyboard, which is the only way half its readers can reach it', () => {
  dialog.open();
  const close = element().querySelector('[data-command="close"]');

  close.focus();
  close.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );

  expect(element().open).toBe(false);
});

it('is titled, so a screen reader names the window', () => {
  const labelledBy = element().getAttribute('aria-labelledby');

  expect(element().querySelector(`#${labelledBy}`).textContent).toMatch(/shortcut/i);
});

it('empties the host on destroy', () => {
  dialog.destroy();

  expect(host.innerHTML).toBe('');
});

it('says what Shift+Enter does while a node is being written, because that is where it is pressed', () => {
  const heading = [...element().querySelectorAll('.assist-mm-shortcuts__group')].find(
    group => group.textContent === 'Writing a node'
  );
  const pairs = [...heading.nextElementSibling.querySelectorAll('dt')].map(term => [
    term.textContent,
    term.nextElementSibling.textContent,
  ]);

  expect(pairs).toContainEqual(['Shift+Enter', 'Finish, and start a new node inside this one']);
});

it('writes down the keys that choose more than one node, and what the canvas does', () => {
  const groups = [...element().querySelectorAll('.assist-mm-shortcuts__group')].map(
    heading => heading.textContent
  );
  expect(groups).toContain('Choosing more than one node');

  const keys = [...element().querySelectorAll('dt')].map(term => term.textContent);
  expect(keys).toEqual(
    expect.arrayContaining([
      'Shift+Up and Shift+Down',
      'Ctrl+Up and Ctrl+Down',
      'Ctrl+Space, or Ctrl+click on a row',
      'Ctrl+A',
      'Shift+Home and Shift+End',
      'Ctrl+click on the canvas',
    ])
  );

  // Shift+click on the canvas is deliberately not a range, and the list says so.
  expect(element().textContent).toContain(
    'Shift+click does the same, because "everything in between" only means something in the outline'
  );
  // There is a second way to toggle a row, because Ctrl+Space is the input-method switch on many
  // systems and a student whose keyboard eats it must still be able to build a set.
  expect(element().textContent).toContain(
    'Use the click where Ctrl+Space belongs to your keyboard layout'
  );

  // The keys that act on the whole set are listed as themselves, rather than as "everything above":
  // Enter, Shift+Enter and F2 are in the same group and act on one node.
  const acts = [...element().querySelectorAll('dd')].map(entry => entry.textContent);
  expect(acts).toContain(
    'With several nodes selected, these act on all of them at once, and one Ctrl+Z takes the lot back'
  );
  expect(acts).toContain(
    'Always the one node you are on. With several selected, the rest are dropped and you are told so'
  );
  expect(element().textContent).not.toContain('Everything in this list');
});

/*
 * A term like "Shift+Home and Shift+End" was one chip, so the key column grew to the widest term and
 * squeezed every description onto three or four lines. Each chord is now its own chip that never
 * breaks, and the words between chords are text the line can wrap at.
 */
describe('a term is drawn as chords and the words between them', () => {
  it('splits two chords at "and"', () => {
    expect(chordParts('Shift+Home and Shift+End')).toEqual([
      { chord: 'Shift+Home' },
      { text: ' and ' },
      { chord: 'Shift+End' },
    ]);
  });

  it('keeps the words after a chord as text', () => {
    expect(chordParts('Ctrl+click on the canvas')).toEqual([
      { chord: 'Ctrl+click' },
      { text: ' on the canvas' },
    ]);
  });

  it('reads a list of chords, a single key and a lone symbol', () => {
    expect(chordParts('Enter, Shift+Enter and F2')).toEqual([
      { chord: 'Enter' },
      { text: ', ' },
      { chord: 'Shift+Enter' },
      { text: ' and ' },
      { chord: 'F2' },
    ]);
    expect(chordParts('?')).toEqual([{ chord: '?' }]);
    expect(
      chordParts('Tab, Shift+Tab, Alt+Up, Alt+Down, Delete, Space, Left, Right and Alt+M').filter(
        part => part.chord
      )
    ).toHaveLength(9);
  });

  it('does not take the start of an ordinary word for a key', () => {
    expect(chordParts('Drag any selected node')).toEqual([{ text: 'Drag any selected node' }]);
    expect(chordParts('Left and Right, on the divider between the outline and the map')).toEqual([
      { chord: 'Left' },
      { text: ' and ' },
      { chord: 'Right' },
      { text: ', on the divider between the outline and the map' },
    ]);
  });

  it('draws one chip per chord, and the term still reads as written', () => {
    const term = [...element().querySelectorAll('dt')].find(
      dt => dt.textContent === 'Shift+Home and Shift+End'
    );
    expect([...term.querySelectorAll('kbd')].map(key => key.textContent)).toEqual([
      'Shift+Home',
      'Shift+End',
    ]);
  });

  // Ctrl+/ is the shipped key for this list, and "/" is not a key the term splitter knows: drawn
  // through it, the chord would lose its chip.
  it('keeps a key from Settings as one chip, however it is written', () => {
    const term = element().querySelector('dt[data-shortcut-key="mm_shortcuts_help"]');
    expect(term.textContent).toBe('Ctrl+/');
    expect(term.querySelectorAll('kbd')).toHaveLength(1);
    expect(term.querySelector('kbd').textContent).toBe(term.textContent);
  });
});
