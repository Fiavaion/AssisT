/**
 * @jest-environment jsdom
 *
 * Starting a map.
 *
 * The library and the File menu both start maps, and a student who learns the dialog in one place
 * must meet the same dialog in the other. So there is one of it, mounted by whichever view is on
 * screen — and this suite is where its keyboard, its focus and its refusal to create an untitled
 * map are graded, once.
 */

import { TEMPLATES } from '../../../../src/features/mindMap/core/templates.js';
import { mountNewMapDialog } from '../../../../src/pages/mind-map/new-map-dialog.js';

// jsdom 20 ships HTMLDialogElement without its methods. The page uses the real element, so the
// suite supplies the two the browser already has.
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
let onCreate;

function mount(overrides = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  onCreate = overrides.onCreate || jest.fn().mockResolvedValue(undefined);
  dialog = mountNewMapDialog(host, { onCreate });
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

const element = () => host.querySelector('dialog[data-dialog="new"]');
const form = () => element().querySelector('form');
const titleInput = () => host.querySelector('#assist-mm-new-input');
const hint = () => element().querySelector('.assist-mm-dialog__hint');
const submit = () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

/** Activate a control the way a keyboard student does: Enter on the focused element. */
function pressEnter(element_) {
  element_.focus();
  element_.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

describe('the dialog', () => {
  it('is a named modal that nothing opens by itself', () => {
    mount();

    expect(element().getAttribute('aria-labelledby')).toBe('assist-mm-new-title');
    expect(element().querySelector('#assist-mm-new-title').textContent).toBe('Start a new map');
    expect(element().open).toBe(false);
  });

  it('offers every template with what it is for', () => {
    mount();
    dialog.open();

    const choices = [...element().querySelectorAll('input[type="radio"]')];
    expect(choices.map(choice => choice.value)).toEqual(TEMPLATES.map(template => template.id));
    expect(choices[0].checked).toBe(true);
    expect(element().textContent).toContain(TEMPLATES[1].description);
  });

  it('opens onto the title box, which is where the student has something to say', () => {
    mount();
    dialog.open();

    expect(element().open).toBe(true);
    expect(document.activeElement).toBe(titleInput());
  });

  it('starts empty each time, rather than showing the last title and the last complaint', async () => {
    mount({ onCreate: jest.fn().mockRejectedValue(new Error('The disk is full')) });
    dialog.open();
    titleInput().value = 'First try';
    submit();
    await flush();
    expect(hint().textContent).toBe('The disk is full');

    dialog.close();
    dialog.open();

    expect(titleInput().value).toBe('');
    expect(hint().textContent).toBe('');
  });
});

describe('creating', () => {
  it('builds the chosen template under the typed title', async () => {
    mount();
    dialog.open();
    titleInput().value = 'Romanticism essay';
    element().querySelector('input[value="essay-plan"]').checked = true;

    submit();
    await flush();

    expect(onCreate).toHaveBeenCalledWith('essay-plan', 'Romanticism essay');
    expect(element().open).toBe(false);
  });

  it('trims the title rather than storing the spaces around it', async () => {
    mount();
    dialog.open();
    titleInput().value = '  Cell biology  ';

    submit();
    await flush();

    expect(onCreate).toHaveBeenCalledWith(TEMPLATES[0].id, 'Cell biology');
  });

  // The box carries no `required`: the browser's bubble would answer an empty box and this
  // handler a box holding two spaces, which is two refusals worded differently. One path answers
  // both, so both are graded.
  it.each([
    ['nothing at all', ''],
    ['nothing but spaces', '   ']
  ])('asks for a title when given %s, rather than making a map nobody can find', async (_, typed) => {
    mount();
    dialog.open();
    titleInput().value = typed;

    submit();
    await flush();

    expect(onCreate).not.toHaveBeenCalled();
    expect(hint().textContent).toBe('Give the map a title so you can find it again.');
    expect(document.activeElement).toBe(titleInput());
    expect(element().open).toBe(true);
  });

  it('leaves the browser no second opinion to give about an empty box', () => {
    mount();

    expect(titleInput().required).toBe(false);
  });

  // The page's toast and live region are behind the modal, where nobody hears them. The hint is
  // the only thing that can speak here, so it is a live region and the box points at it.
  it('speaks the refusal rather than only printing it', async () => {
    mount({ onCreate: jest.fn().mockRejectedValue(new Error('The database is closed')) });
    dialog.open();
    titleInput().value = 'Romanticism essay';

    submit();
    await flush();

    expect(hint().getAttribute('role')).toBe('status');
    expect(titleInput().getAttribute('aria-describedby')).toBe(hint().id);
    expect(document.activeElement).toBe(titleInput());
  });

  it('keeps the dialog and the typing when the map could not be made', async () => {
    mount({ onCreate: jest.fn().mockRejectedValue(new Error('The database is closed')) });
    dialog.open();
    titleInput().value = 'Romanticism essay';

    submit();
    await flush();

    expect(hint().textContent).toBe('The database is closed');
    expect(element().open).toBe(true);
    expect(titleInput().value).toBe('Romanticism essay');
  });
});

describe('leaving', () => {
  it('cancels from the keyboard and gives focus back to whatever opened it', () => {
    mount();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    dialog.open();
    pressEnter(element().querySelector('[data-command="cancel"]'));

    expect(element().open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onCreate).not.toHaveBeenCalled();
  });

  // Escape closes a modal by itself, and the browser does not put focus back for us: without this
  // the student lands on `<body>` with their place in the page lost.
  it('gives focus back when Escape closed it', () => {
    mount();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    dialog.open();
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
