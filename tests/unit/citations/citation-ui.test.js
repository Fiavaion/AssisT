/**
 * @jest-environment jsdom
 *
 * Regression test for the "Invalid citation: Title is required" bug seen on a fully-populated
 * edit modal. DOMPurify's DOM-clobbering protection strips name="title" from the sanitised
 * markup, so the old FormData(name)-based read dropped the title. getFormData now reads by id.
 */

import { showCitationEditModal } from '../../../src/features/citations/citation-ui.js';

function clickSave(overlay) {
  const saveBtn = overlay.querySelector('.btn-save');
  // Buttons are wired via attachInteractiveHandler, which fires on mousedown.
  saveBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('citation edit modal — save round-trip', () => {
  test('DOMPurify strips name="title" but the field keeps its id and value', async () => {
    const p = showCitationEditModal({ title: 'My Paper', authors: ['Smith, J'], url: 'https://x.test' });
    await new Promise(r => setTimeout(r, 0));

    const overlay = document.querySelector('.citation-modal-overlay');
    const titleInput = overlay.querySelector('#citation-title');

    // The bug condition: the name attribute is gone after sanitisation …
    expect(titleInput.getAttribute('name')).toBeNull();
    // … but the value (and id) survive, which is what the id-based read relies on.
    expect(titleInput.value).toBe('My Paper');

    // Clean up the pending promise (cancel via close).
    overlay.querySelector('.citation-modal-close').dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true })
    );
    await p;
  });

  test('Save resolves with the title for a fully-populated citation', async () => {
    const p = showCitationEditModal({
      title: 'Sharing Detailed Research Data',
      authors: ['Piwowar, Heather A.', 'Day, Roger S.'],
      url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0000308',
      doi: '10.1371/journal.pone.0000308',
      type: 'journal',
      siteName: 'PLOS ONE',
    });
    await new Promise(r => setTimeout(r, 0));

    const overlay = document.querySelector('.citation-modal-overlay');
    clickSave(overlay);

    const result = await p;
    expect(result).not.toBeNull();
    expect(result.title).toBe('Sharing Detailed Research Data');
    expect(result.authors).toEqual(['Piwowar, Heather A.', 'Day, Roger S.']);
    expect(result.url).toContain('journal.pone.0000308');
    expect(result.type).toBe('journal');
  });

  test('Cancel resolves with null', async () => {
    const p = showCitationEditModal({ title: 'X', authors: ['A, B'], url: 'https://y.test' });
    await new Promise(r => setTimeout(r, 0));
    const overlay = document.querySelector('.citation-modal-overlay');
    overlay.querySelector('.btn-cancel').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await expect(p).resolves.toBeNull();
  });
});
