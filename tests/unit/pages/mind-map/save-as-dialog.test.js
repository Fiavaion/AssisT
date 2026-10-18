/**
 * @jest-environment jsdom
 *
 * Save as: a copy of the map under a new name.
 *
 * The dialog names the copy and nothing else. Where the copy is written, and what happens to the
 * map it was taken from, belong to the page — so this suite grades the name that comes out, the
 * prefill a student edits rather than types from scratch, and the way out.
 */

import { mountSaveAsDialog } from '../../../../src/pages/mind-map/save-as-dialog.js';

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

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let host;
let dialog;
let onSaveAs;

function mount(overrides = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  onSaveAs = overrides.onSaveAs || jest.fn().mockResolvedValue(undefined);
  dialog = mountSaveAsDialog(host, { onSaveAs });
}

afterEach(() => {
  if (dialog) {
    dialog.destroy();
    dialog = null;
  }
  if (host) {
    host.remove();
  }
  document.body.innerHTML = '';
});

const element = () => host.querySelector('dialog[data-dialog="save-as"]');
const titleInput = () => host.querySelector('#assist-mm-save-as-input');
const hint = () => element().querySelector('.assist-mm-dialog__hint');
const submit = () =>
  element()
    .querySelector('form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

function pressEnter(target) {
  target.focus();
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

describe('the dialog', () => {
  it('is a named modal that nothing opens by itself', () => {
    mount();

    expect(element().getAttribute('aria-labelledby')).toBe('assist-mm-save-as-title');
    expect(element().querySelector('#assist-mm-save-as-title').textContent).toBe('Save a copy');
    expect(element().open).toBe(false);
  });

  // A student saving a copy is nearly always naming a version of what they have, so the name they
  // start from is the one they already chose with a word on the end.
  it('prefills the name from the map it was opened over, selected ready to be replaced', () => {
    mount();

    dialog.open('Essay plan');

    expect(titleInput().value).toBe('Essay plan copy');
    expect(document.activeElement).toBe(titleInput());
    expect(titleInput().selectionStart).toBe(0);
    expect(titleInput().selectionEnd).toBe('Essay plan copy'.length);
  });

  it('prefills again from the map it is opened over the next time', () => {
    mount();

    dialog.open('Essay plan');
    dialog.close();
    dialog.open('Lecture notes');

    expect(titleInput().value).toBe('Lecture notes copy');
    expect(hint().textContent).toBe('');
  });
});

describe('saving the copy', () => {
  it('hands the typed name over and closes', async () => {
    mount();
    dialog.open('Essay plan');
    titleInput().value = 'Essay plan, second draft';

    submit();
    await flush();

    expect(onSaveAs).toHaveBeenCalledWith('Essay plan, second draft');
    expect(element().open).toBe(false);
  });

  it('trims the name rather than storing the spaces around it', async () => {
    mount();
    dialog.open('Essay plan');
    titleInput().value = '  Second draft  ';

    submit();
    await flush();

    expect(onSaveAs).toHaveBeenCalledWith('Second draft');
  });

  // No `required` on the box, for the reason given in the new-map dialog's spec: one handler
  // answers an empty box and a box holding two spaces in the same words.
  it.each([
    ['nothing at all', ''],
    ['nothing but spaces', '  ']
  ])('asks for a name when given %s, rather than writing a copy nobody can find', async (_, typed) => {
    mount();
    dialog.open('Essay plan');
    titleInput().value = typed;

    submit();
    await flush();

    expect(onSaveAs).not.toHaveBeenCalled();
    expect(hint().textContent).toBe('Give the copy a title so you can find it again.');
    expect(document.activeElement).toBe(titleInput());
    expect(element().open).toBe(true);
  });

  it('leaves the browser no second opinion to give about an empty box', () => {
    mount();

    expect(titleInput().required).toBe(false);
  });

  it('speaks the refusal rather than only printing it', async () => {
    mount({ onSaveAs: jest.fn().mockRejectedValue(new Error('The database is closed')) });
    dialog.open('Essay plan');

    submit();
    await flush();

    expect(hint().getAttribute('role')).toBe('status');
    expect(titleInput().getAttribute('aria-describedby')).toBe(hint().id);
    expect(document.activeElement).toBe(titleInput());
  });

  it('keeps the dialog and the typing when the copy could not be written', async () => {
    mount({ onSaveAs: jest.fn().mockRejectedValue(new Error('The database is closed')) });
    dialog.open('Essay plan');

    submit();
    await flush();

    expect(hint().textContent).toBe('The database is closed');
    expect(element().open).toBe(true);
    expect(titleInput().value).toBe('Essay plan copy');
  });
});

describe('leaving', () => {
  it('cancels from the keyboard and gives focus back to whatever opened it', () => {
    mount();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    dialog.open('Essay plan');
    pressEnter(element().querySelector('[data-command="cancel"]'));

    expect(element().open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onSaveAs).not.toHaveBeenCalled();
  });

  it('gives focus back when Escape closed it', () => {
    mount();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    dialog.open('Essay plan');
    element().close();

    expect(document.activeElement).toBe(opener);
  });

  it('takes itself and its listeners away', () => {
    mount();

    dialog.destroy();
    dialog = null;

    expect(host.innerHTML).toBe('');
  });
});
