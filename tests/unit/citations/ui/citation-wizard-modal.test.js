/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/citation-wizard-modal.js — the promise-based wizard adapter.
 */

import { showCitationWizard } from '../../../../src/features/citations/ui/citation-wizard-modal.js';

afterEach(() => {
  document.querySelectorAll('.assist-cite-overlay-backdrop').forEach(el => el.remove());
});

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function navButton(label) {
  return [...document.querySelectorAll('.assist-cite-overlay-backdrop .assist-cite-step__nav button')].find(
    b => b.textContent === label
  );
}

describe('showCitationWizard()', () => {
  test('mounts the wizard inside an overlay', () => {
    showCitationWizard({ title: 'X' });
    const dialog = document.querySelector('.assist-cite-overlay-backdrop [role="dialog"]');
    expect(dialog.querySelector('.assist-cite-wizard')).toBeTruthy();
  });

  test('resolves with the citation when the student saves (from any step)', async () => {
    const promise = showCitationWizard({
      title: 'A Source',
      authors: ['Smith, J.'],
      publicationDate: '2020',
      url: 'https://example.com',
    });
    // Save is available immediately — no need to march through every step.
    fireMousedown(navButton('Save'));
    const result = await promise;
    expect(result).toEqual(expect.objectContaining({ title: 'A Source' }));
    // Overlay is gone after saving.
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeNull();
  });

  test('resolves null when the student cancels', async () => {
    const promise = showCitationWizard({ title: 'X' });
    fireMousedown(navButton('Cancel'));
    await expect(promise).resolves.toBeNull();
    expect(document.querySelector('.assist-cite-overlay-backdrop')).toBeNull();
  });

  test('resolves null when the overlay is dismissed with Escape', async () => {
    const promise = showCitationWizard({ title: 'X' });
    const dialog = document.querySelector('[role="dialog"]');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await expect(promise).resolves.toBeNull();
  });
});

// Review finding: the notice that no passage was captured sat in the dialog but was not part of
// its description, so a screen reader opening the dialog was not told.
describe('showCitationWizard() — the no-passage notice describes the dialog', () => {
  test('aria-describedby points at the notice', () => {
    showCitationWizard({ title: 'X', passageMissing: true });
    const dialog = document.querySelector('.assist-cite-overlay-backdrop [role="dialog"]');
    const ids = (dialog.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const described = ids.map(id => document.getElementById(id)?.textContent || '').join(' ');
    expect(described).toMatch(/^No passage was captured/);
  });

  test('a dialog with no notice has no dangling description', () => {
    showCitationWizard({ title: 'X' });
    const dialog = document.querySelector('.assist-cite-overlay-backdrop [role="dialog"]');
    expect(dialog.hasAttribute('aria-describedby')).toBe(false);
  });
});
