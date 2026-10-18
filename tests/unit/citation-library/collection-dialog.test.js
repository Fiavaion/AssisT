/**
 * @jest-environment jsdom
 *
 * The dialog that names a collection — used to create one and to rename one.
 */

import { showCollectionDialog } from '../../../src/pages/citation-library/collection-dialog.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function field(labelText) {
  const label = [...document.querySelectorAll('label')].find(l => l.textContent.includes(labelText));
  return document.getElementById(label.getAttribute('for'));
}

function button(text) {
  return [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === text);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('showCollectionDialog', () => {
  it('opens as a labelled modal dialog with a name and a description box', () => {
    showCollectionDialog({ heading: 'New collection' });

    expect(dialog()).toBeTruthy();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(dialog().getAttribute('aria-label')).toBe('New collection');
    expect(field('Name')).toBeTruthy();
    expect(field('Description')).toBeTruthy();
  });

  it('resolves with the typed name and description', async () => {
    const result = showCollectionDialog({ heading: 'New collection' });

    field('Name').value = 'Essay 1';
    field('Description').value = 'Memory and rehearsal';
    fireMousedown(button('Create'));

    await expect(result).resolves.toEqual({ name: 'Essay 1', description: 'Memory and rehearsal' });
    expect(dialog()).toBeNull();
  });

  it('prefills an existing collection, so renaming is an edit rather than a retype', () => {
    showCollectionDialog({
      heading: 'Rename collection',
      name: 'Old name',
      description: 'Kept',
      submitLabel: 'Save',
    });

    expect(field('Name').value).toBe('Old name');
    expect(field('Description').value).toBe('Kept');
    expect(button('Save')).toBeTruthy();
  });

  it('will not save a collection with no name, and says so where the field is', () => {
    showCollectionDialog({ heading: 'New collection' });

    field('Name').value = '   ';
    fireMousedown(button('Create'));

    const error = document.querySelector('[role="alert"]');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toMatch(/name/i);
    expect(field('Name').getAttribute('aria-invalid')).toBe('true');
    // Still open — nothing was lost.
    expect(dialog()).toBeTruthy();
  });

  it('clears the error as soon as the student starts typing a name', () => {
    showCollectionDialog({ heading: 'New collection' });
    fireMousedown(button('Create'));
    expect(document.querySelector('[role="alert"]').hidden).toBe(false);

    field('Name').value = 'E';
    field('Name').dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.querySelector('[role="alert"]').hidden).toBe(true);
    expect(field('Name').hasAttribute('aria-invalid')).toBe(false);
  });

  it('resolves null when cancelled', async () => {
    const result = showCollectionDialog({ heading: 'New collection' });
    fireMousedown(button('Cancel'));
    await expect(result).resolves.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('resolves null on Escape, so the keyboard way out is the same as the button', async () => {
    const result = showCollectionDialog({ heading: 'New collection' });
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(result).resolves.toBeNull();
  });

  it('submits on Enter from the name field', async () => {
    const result = showCollectionDialog({ heading: 'New collection' });
    field('Name').value = 'Essay 1';
    document
      .querySelector('[role="dialog"] form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await expect(result).resolves.toEqual({ name: 'Essay 1', description: '' });
  });

  describe('a name another collection already has', () => {
    it('is refused, in any case and with stray spaces, with the error on the Name field', () => {
      const result = jest.fn();
      showCollectionDialog({ heading: 'New collection', takenNames: ['Essay'] }).then(result);

      field('Name').value = '  ESSAY ';
      fireMousedown(button('Create'));

      const error = document.querySelector('[role="alert"]');
      expect(error.hidden).toBe(false);
      expect(error.textContent).toMatch(/already/i);
      expect(error.textContent).toContain('Essay');
      expect(field('Name').getAttribute('aria-invalid')).toBe('true');
      expect(field('Name').getAttribute('aria-errormessage')).toBe(error.id);
      expect(document.activeElement).toBe(field('Name'));
      expect(dialog()).toBeTruthy();
    });

    it('does not stop a rename that only changes the case of its own name', async () => {
      // The collection being renamed is not in takenNames: the caller lists only the others.
      const result = showCollectionDialog({
        heading: 'Rename collection',
        name: 'Essay',
        submitLabel: 'Save',
        takenNames: ['Lab report'],
      });

      field('Name').value = 'ESSAY';
      fireMousedown(button('Save'));

      await expect(result).resolves.toEqual({ name: 'ESSAY', description: '' });
    });

    it('lets a different name through', async () => {
      const result = showCollectionDialog({ heading: 'New collection', takenNames: ['Essay'] });
      field('Name').value = 'Essay 2';
      fireMousedown(button('Create'));
      await expect(result).resolves.toEqual({ name: 'Essay 2', description: '' });
    });
  });
});
