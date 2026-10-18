/**
 * @jest-environment jsdom
 *
 * Saving from the citation wizard: what it accepts, and what happens when it cannot save.
 *
 * The blocker this covers: Save handed the citation to the caller, the dialog closed, and the store
 * then refused the record on rules the wizard had never mentioned — a book with a title and no
 * ISBN box to fill, a source whose author the wizard said was "fine to leave blank". The student
 * saw a dialog close and nothing else: no message, no card, focus on the body, and the source gone.
 *
 * So two things are checked here. The wizard judges a save by exactly the rule the store enforces
 * (validateCitation), and when the caller gives it an `onSave`, the dialog cannot close on a write
 * that did not happen.
 */

import { createStepRailWizard } from '../../../../../src/features/citations/ui/wizard/step-rail-wizard.js';
import { formatReference } from '../../../../../src/features/citations/citation-styles/index.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** The Save button by role rather than label — its label changes while a write is in flight. */
function saveButton(wiz) {
  return wiz.el.querySelector('.assist-cite-step__nav .assist-cite-btn--primary');
}

function save(wiz) {
  fireMousedown(saveButton(wiz));
}

/**
 * A wizard in the document, so focus moves for real. Torn down after each test.
 * @param {Object} [options]
 * @returns {Object} the wizard
 */
function mountWizard(options = {}) {
  const wiz = createStepRailWizard(options);
  document.body.appendChild(wiz.el);
  open.push(wiz);
  return wiz;
}

/** Every wizard mounted by the current test. */
const open = [];

afterEach(() => {
  while (open.length > 0) {
    open.pop().destroy();
  }
  document.body.textContent = '';
});

/** Let every queued microtask and timer callback run. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** The control whose own <label> reads exactly this. */
function control(wiz, labelText) {
  const label = [...wiz.el.querySelectorAll('label')].find(
    l => l.textContent === labelText || l.textContent === `${labelText} (required)`
  );
  return label ? wiz.el.querySelector(`#${label.getAttribute('for')}`) : null;
}

function isOffered(wiz, labelText) {
  const el = control(wiz, labelText);
  return Boolean(el) && !el.closest('.assist-cite-step__field-wrap').hidden;
}

function type(wiz, labelText, value) {
  const el = control(wiz, labelText);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(wiz, labelText, value) {
  const el = control(wiz, labelText);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The live region that says a save did not happen. */
function summary(wiz) {
  return wiz.el.querySelector('.assist-cite-wizard__problems');
}

// ── What the wizard accepts ───────────────────────────────────────────────────

describe('what the wizard will save', () => {
  test('a printed book with nothing but a title is saved, not discarded', () => {
    const onComplete = jest.fn();
    const wiz = mountWizard({
      draft: { title: 'On Growth and Form', type: 'book' },
      onComplete,
    });

    save(wiz);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'On Growth and Form', type: 'book' })
    );
    expect(summary(wiz).hidden).toBe(true);
  });

  test('the source types that used to vanish on save all save now', () => {
    ['book', 'chapter', 'thesis', 'other', 'pdf'].forEach(sourceType => {
      const onComplete = jest.fn();
      const wiz = mountWizard({ draft: { title: 'A source', type: sourceType }, onComplete });
      save(wiz);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  test('the quote, the page and the note typed on the Notes step reach the saved citation', () => {
    const onComplete = jest.fn();
    const wiz = mountWizard({ draft: { title: 'Thinking, Fast and Slow' }, onComplete });
    wiz.goToStep('notes');

    type(wiz, 'The source’s exact words', 'Nothing in life is as important as you think it is.');
    type(wiz, 'Page or spot', '402');
    type(wiz, 'Why you saved it (your words)', 'For the focusing-illusion paragraph.');
    save(wiz);

    expect(onComplete.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        quote: 'Nothing in life is as important as you think it is.',
        locator: '402',
        notes: 'For the focusing-illusion paragraph.',
      })
    );
  });

  test('the wizard’s own edit marker is not part of the saved record', () => {
    const onComplete = jest.fn();
    const wiz = mountWizard({
      draft: { title: 'An edit', url: 'https://example.test/x', _isEdit: true },
      onComplete,
    });

    save(wiz);

    expect(onComplete.mock.calls[0][0]._isEdit).toBeUndefined();
  });
});

// ── A save that cannot go through ─────────────────────────────────────────────

describe('a save the wizard cannot complete', () => {
  test('an empty title keeps the wizard open, says so, and lands on the title box', () => {
    const onComplete = jest.fn();
    const wiz = mountWizard({ onComplete });
    wiz.goToStep('where'); // away from the title field

    save(wiz);

    expect(onComplete).not.toHaveBeenCalled();

    // The summary says nothing was saved …
    expect(summary(wiz).hidden).toBe(false);
    expect(summary(wiz).getAttribute('role')).toBe('alert');
    expect(summary(wiz).textContent).toMatch(/not saved/i);

    // … the title field carries the sentence that fixes it …
    const titleInput = control(wiz, 'Title');
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = titleInput.getAttribute('aria-describedby').split(' ');
    const message = describedBy
      .map(id => wiz.el.querySelector(`#${id}`))
      .find(el => el && el.getAttribute('role') === 'alert' && !el.hidden);
    expect(message.textContent).toMatch(/title/i);

    // … and focus is on the box that fixes it.
    expect(document.activeElement).toBe(titleInput);
  });

  test('fixing the title and saving again clears the message and completes', () => {
    const onComplete = jest.fn();
    const wiz = mountWizard({ onComplete });
    save(wiz);
    expect(onComplete).not.toHaveBeenCalled();

    type(wiz, 'Title', 'Now it has one');
    save(wiz);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(summary(wiz).hidden).toBe(true);
    expect(control(wiz, 'Title').hasAttribute('aria-invalid')).toBe(false);
  });
});

// ── Storing before closing ────────────────────────────────────────────────────

describe('onSave — the record is stored before the wizard reports completion', () => {
  test('completion is reported only after the write has resolved', async () => {
    const order = [];
    let release;
    const onSave = jest.fn(
      () =>
        new Promise(resolve => {
          release = () => {
            order.push('stored');
            resolve('42');
          };
        })
    );
    const onComplete = jest.fn(() => order.push('completed'));
    const wiz = mountWizard({ draft: { title: 'A book', type: 'book' }, onSave, onComplete });

    save(wiz);
    await flush();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    release();
    await flush();

    expect(order).toEqual(['stored', 'completed']);
    expect(onComplete.mock.calls[0][0]).toEqual(expect.objectContaining({ title: 'A book' }));
  });

  test('a failed write keeps the wizard open with everything still in it', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onSave = jest.fn(() => Promise.reject(new Error('Citation RPC timed out: CIT_ADD')));
    const onComplete = jest.fn();
    const wiz = mountWizard({
      draft: { title: 'A book', type: 'book', quote: 'Exact words.' },
      onSave,
      onComplete,
    });

    save(wiz);
    await flush();

    expect(onComplete).not.toHaveBeenCalled();
    expect(summary(wiz).hidden).toBe(false);
    expect(summary(wiz).textContent).toMatch(/not saved/i);
    // Plain words, not the thrown message.
    expect(summary(wiz).textContent).not.toMatch(/RPC|CIT_ADD|Error/);
    expect(document.activeElement).toBe(summary(wiz));
    // Nothing was thrown away: the draft is still there to try again with.
    expect(wiz.getDraft()).toEqual(expect.objectContaining({ quote: 'Exact words.' }));
    expect(saveButton(wiz).disabled).toBe(false);

    consoleError.mockRestore();
  });

  test('a second press while the write is in flight does not store the source twice', async () => {
    let resolveWrite;
    const onSave = jest.fn(() => new Promise(resolve => (resolveWrite = resolve)));
    const wiz = mountWizard({ draft: { title: 'A book' }, onSave });

    save(wiz);
    await flush();
    const saveBtn = saveButton(wiz);
    expect(saveBtn.disabled).toBe(true);
    saveBtn.disabled = false; // even if something re-enables it, the guard holds
    save(wiz);
    await flush();

    expect(onSave).toHaveBeenCalledTimes(1);

    resolveWrite('1');
    await flush();
  });

  test('a refused title never reaches the store', () => {
    const onSave = jest.fn();
    const wiz = mountWizard({ onSave });

    save(wiz);

    expect(onSave).not.toHaveBeenCalled();
  });
});

// ── The boxes a book-like source needs ────────────────────────────────────────

describe('WHERE step — the details a book has', () => {
  test('a book and a chapter are offered an ISBN box', () => {
    ['book', 'chapter'].forEach(sourceType => {
      const wiz = mountWizard({ draft: { title: 'A source', type: sourceType } });
      wiz.goToStep('where');
      expect(isOffered(wiz, 'ISBN')).toBe(true);
    });
  });

  test('sources that carry no ISBN are not asked for one', () => {
    ['website', 'journal', 'thesis', 'video', 'newspaper'].forEach(sourceType => {
      const wiz = mountWizard({ draft: { title: 'A source', type: sourceType } });
      wiz.goToStep('where');
      expect(isOffered(wiz, 'ISBN')).toBe(false);
    });
  });

  test('a typed ISBN is stored on the citation', () => {
    const wiz = mountWizard({ draft: { title: 'A Book', type: 'book' } });
    wiz.goToStep('where');
    type(wiz, 'ISBN', '978-0-14-103805-8');

    expect(wiz.getDraft().isbn).toBe('978-0-14-103805-8');
  });

  test('a book is offered the edition and place its references print', () => {
    const wiz = mountWizard({ draft: { title: 'A Book', type: 'book' } });
    wiz.goToStep('where');

    expect(isOffered(wiz, 'Edition')).toBe(true);
    expect(isOffered(wiz, 'Place of publication')).toBe(true);

    type(wiz, 'Edition', '2nd');
    type(wiz, 'Place of publication', 'Cambridge');
    const { extra } = wiz.getDraft();
    expect(extra.edition).toBe('2nd');
    expect(extra.place).toBe('Cambridge');
  });

  test('a source with no edition is not asked for one', () => {
    ['website', 'journal', 'thesis', 'newspaper'].forEach(sourceType => {
      const wiz = mountWizard({ draft: { title: 'A source', type: sourceType } });
      wiz.goToStep('where');
      expect(isOffered(wiz, 'Edition')).toBe(false);
      expect(isOffered(wiz, 'Place of publication')).toBe(false);
    });
  });

  test('switching a book to a website takes the edition and place away again', () => {
    const wiz = mountWizard({ draft: { title: 'A Book', type: 'book' } });
    wiz.goToStep('where');
    type(wiz, 'Edition', '2nd');

    wiz.goToStep('what');
    choose(wiz, 'Type', 'website');
    wiz.goToStep('where');

    expect(isOffered(wiz, 'Edition')).toBe(false);
    expect(wiz.getDraft().extra.edition).toBeUndefined();
  });
});

// ── What a sparse record looks like once it is saved ──────────────────────────

describe('a title-only source still formats in every style', () => {
  const STYLES = ['harvard', 'apa7', 'mla9', 'chicago17'];
  const TYPES = ['website', 'book', 'chapter', 'journal', 'thesis', 'other', 'pdf', 'newspaper'];

  test('no style throws on a source with no author, year or link', () => {
    STYLES.forEach(style => {
      TYPES.forEach(sourceType => {
        const wiz = mountWizard({ draft: { title: 'A source', type: sourceType }, style });
        const citation = wiz.getDraft();
        expect(() => formatReference(citation, style)).not.toThrow();
        expect(formatReference(citation, style)).toContain('A source');
      });
    });
  });

  test('the CHECK preview says in words what a missing author and year will print as', () => {
    const wiz = mountWizard({ draft: { title: 'A Borrowed Book', type: 'book' } });
    wiz.goToStep('check');

    // No author: the title takes the author's place (STYLE-RULES.md); never "Anon.".
    const reference = wiz.el.querySelector('.assist-cite-card__reference').textContent;
    expect(reference).toMatch(/^A Borrowed Book \(no date\)/);
    expect(reference).not.toContain('Anon');
  });
});

// ── The CHECK preview is the reference, not a flattened copy of it ────────────

describe('the CHECK preview shows what the reference will look like', () => {
  const BOOK = {
    title: 'Thinking, Fast and Slow',
    type: 'book',
    authors: ['Kahneman, Daniel'],
    publisher: 'Penguin',
    publicationDate: '2011',
  };

  /** The preview paragraph on the CHECK step. */
  function preview(wiz) {
    wiz.goToStep('check');
    return wiz.el.querySelector('.assist-cite-card__reference');
  }

  test('the parts the style italicises are real italics, as on the card', () => {
    const italics = [...preview(mountWizard({ draft: BOOK })).querySelectorAll('em')].map(
      node => node.textContent
    );
    expect(italics).toContain('Thinking, Fast and Slow');
  });

  test('the plain reading of the preview is unchanged by the markup', () => {
    const text = preview(mountWizard({ draft: BOOK })).textContent;
    expect(text).toBe(formatReference(BOOK, 'harvard'));
  });

  test('markup in a scraped title is shown as text, never rendered', () => {
    const el = preview(
      mountWizard({ draft: { ...BOOK, title: '<img src=x onerror="alert(1)">Scraped' } })
    );
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
    for (const node of el.querySelectorAll('*')) {
      expect(node.attributes).toHaveLength(0);
    }
  });
});
