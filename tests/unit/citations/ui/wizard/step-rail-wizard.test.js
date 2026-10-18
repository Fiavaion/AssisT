/**
 * @jest-environment jsdom
 *
 * Unit tests for wizard/step-rail-wizard.js — the 5-step EF capture/edit flow.
 */

import { createStepRailWizard } from '../../../../../src/features/citations/ui/wizard/step-rail-wizard.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** Find a nav button by its visible label. */
function navButton(wiz, label) {
  return [...wiz.el.querySelectorAll('.assist-cite-step__nav button')].find(
    b => b.textContent === label
  );
}

function currentLegend(wiz) {
  return wiz.el.querySelector('.assist-cite-wizard__host .assist-cite-step__legend').textContent;
}

const COMPLETE_DRAFT = {
  title: 'A Complete Source',
  authors: ['Smith, Jane'],
  publicationDate: '2021',
  url: 'https://example.com/x',
  siteName: 'Example',
  type: 'website',
};

describe('createStepRailWizard()', () => {
  test('opens on the WHAT step with the rail and no Back button', () => {
    const wiz = createStepRailWizard();
    expect(currentLegend(wiz)).toContain('What is the source?');
    expect(wiz.el.querySelector('.assist-cite-breadcrumb')).toBeTruthy();
    expect(navButton(wiz, 'Back').hidden).toBe(true);
    expect(navButton(wiz, 'Next')).toBeTruthy();
  });

  test('blocks Next from WHAT when the required title is empty', () => {
    const wiz = createStepRailWizard();
    fireMousedown(navButton(wiz, 'Next'));
    // Still on WHAT, error shown.
    expect(currentLegend(wiz)).toContain('What is the source?');
    expect(wiz.el.querySelector('[role="alert"]').hidden).toBe(false);
  });

  test('prefills fields from the draft and advances when valid (redundant-entry avoidance)', () => {
    const wiz = createStepRailWizard({ draft: { title: 'Captured Title' } });
    const titleInput = wiz.el.querySelector('input');
    expect(titleInput.value).toBe('Captured Title');
    fireMousedown(navButton(wiz, 'Next'));
    expect(currentLegend(wiz)).toContain('Who is behind it?');
    // WHAT is now a completed rail step.
    const what = wiz.el.querySelector('.assist-cite-breadcrumb__step');
    expect(what.classList.contains('assist-cite-breadcrumb__step--done')).toBe(true);
  });

  test('live edits flow into the draft and show up in the CHECK preview', () => {
    const wiz = createStepRailWizard({ style: 'harvard' });
    const titleInput = wiz.el.querySelector('input');
    titleInput.value = 'Typed Title';
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    wiz.goToStep('check');
    const preview = wiz.el.querySelector('.assist-cite-card__reference');
    expect(preview.textContent).toContain('Typed Title');
  });

  test('CHECK shows the reassurance verdict for the current draft', () => {
    const wiz = createStepRailWizard({ draft: COMPLETE_DRAFT });
    wiz.goToStep('check');
    const panel = wiz.el.querySelector('.assist-cite-reassure');
    expect(panel.classList.contains('assist-cite-reassure--green')).toBe(true);
  });

  test('a reassurance "Fix the year" deep-link jumps to the WHEN step', () => {
    // Title present (so green-ish) but no year → an amber "Fix the year" link.
    const wiz = createStepRailWizard({ draft: { title: 'No Year Source', url: 'https://x.com' } });
    wiz.goToStep('check');
    const fixYear = [...wiz.el.querySelectorAll('.assist-cite-reassure__fix')].find(b =>
      /fix the year/i.test(b.textContent)
    );
    expect(fixYear).toBeTruthy();
    fireMousedown(fixYear);
    expect(currentLegend(wiz)).toContain('When was it published?');
  });

  test('Back returns to the previous step without validation', () => {
    const wiz = createStepRailWizard({ draft: { title: 'T' } });
    fireMousedown(navButton(wiz, 'Next')); // -> who
    fireMousedown(navButton(wiz, 'Back')); // -> what
    expect(currentLegend(wiz)).toContain('What is the source?');
  });

  test('Save on CHECK calls onComplete with the normalised draft', () => {
    const onComplete = jest.fn();
    const wiz = createStepRailWizard({ draft: COMPLETE_DRAFT, onComplete });
    wiz.goToStep('check');
    fireMousedown(navButton(wiz, 'Save'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'A Complete Source', authors: ['Smith, Jane'] })
    );
  });

  test('Save is available from step 1 and completes without marching through every step', () => {
    const onComplete = jest.fn();
    const wiz = createStepRailWizard({ draft: { title: 'Quick One' }, onComplete });
    // Still on WHAT — Save finishes immediately.
    expect(currentLegend(wiz)).toContain('What is the source?');
    fireMousedown(navButton(wiz, 'Save'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toEqual(expect.objectContaining({ title: 'Quick One' }));
  });

  test('Save with an empty title routes to WHAT and shows the error instead of completing', () => {
    const onComplete = jest.fn();
    const wiz = createStepRailWizard({ onComplete });
    wiz.goToStep('where'); // jump away from the title field
    fireMousedown(navButton(wiz, 'Save'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(currentLegend(wiz)).toContain('What is the source?');
    expect(wiz.el.querySelector('[role="alert"]').hidden).toBe(false);
  });

  test('initialStep opens the wizard at the requested step (deep-linked fix)', () => {
    const wiz = createStepRailWizard({ draft: { title: 'X' }, initialStep: 'when' });
    expect(currentLegend(wiz)).toContain('When was it published?');
    // Next is still present (not the final step); Back is available.
    expect(navButton(wiz, 'Back').hidden).toBe(false);
  });

  test('Next is hidden on the CHECK step (Save is the action there)', () => {
    const wiz = createStepRailWizard({ draft: COMPLETE_DRAFT });
    wiz.goToStep('check');
    expect(navButton(wiz, 'Next').hidden).toBe(true);
    expect(navButton(wiz, 'Save').hidden).toBe(false);
  });

  test('Cancel calls onCancel and never shows a confirm dialog', () => {
    const onCancel = jest.fn();
    const wiz = createStepRailWizard({ onCancel });
    fireMousedown(navButton(wiz, 'Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('getDraft returns the current working citation', () => {
    const wiz = createStepRailWizard({ draft: { title: 'Draft Title' } });
    expect(wiz.getDraft().title).toBe('Draft Title');
  });

  test('destroy() tears down without throwing', () => {
    const wiz = createStepRailWizard({ draft: COMPLETE_DRAFT });
    expect(() => wiz.destroy()).not.toThrow();
  });
});

describe('filing a citation from the wizard', () => {
  const PROJECTS = [
    { id: 1, name: 'Essay 1' },
    { id: 2, name: 'Dissertation' },
  ];

  /** Walk to the Notes step, where a citation is filed and tagged. */
  function openNotes(options = {}) {
    const wiz = createStepRailWizard({ draft: COMPLETE_DRAFT, ...options });
    wiz.goToStep('notes');
    return wiz;
  }

  function collectionSelect(wiz) {
    return [...wiz.el.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent === 'Essay 1')
    );
  }

  test('offers every collection plus an explicit "no collection" choice', () => {
    const wiz = openNotes({ projects: PROJECTS });
    const select = collectionSelect(wiz);
    expect(select).toBeTruthy();
    expect([...select.options].map(o => o.textContent)).toEqual([
      'No collection',
      'Essay 1',
      'Dissertation',
    ]);
  });

  test('saves the chosen collection onto the citation', () => {
    let saved = null;
    const wiz = openNotes({ projects: PROJECTS, onComplete: c => (saved = c) });
    const select = collectionSelect(wiz);
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fireMousedown(navButton(wiz, 'Save'));
    expect(String(saved.projectId)).toBe('2');
  });

  test('an existing citation opens showing the collection it is already in', () => {
    const wiz = openNotes({ projects: PROJECTS, draft: { ...COMPLETE_DRAFT, projectId: '1' } });
    expect(collectionSelect(wiz).value).toBe('1');
  });

  test('choosing "no collection" clears it rather than saving an empty string', () => {
    let saved = null;
    const wiz = openNotes({
      projects: PROJECTS,
      draft: { ...COMPLETE_DRAFT, projectId: '1' },
      onComplete: c => (saved = c),
    });
    const select = collectionSelect(wiz);
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fireMousedown(navButton(wiz, 'Save'));
    expect(saved.projectId).toBeNull();
  });

  test('saves typed tags as an array', () => {
    let saved = null;
    const wiz = openNotes({ projects: PROJECTS, onComplete: c => (saved = c) });
    const tagInput = [...wiz.el.querySelectorAll('input')].find(i =>
      (i.placeholder || '').includes('memory')
    );
    expect(tagInput).toBeTruthy();
    tagInput.value = 'memory, ADHD';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    fireMousedown(navButton(wiz, 'Save'));
    expect(saved.tags).toEqual(['memory', 'ADHD']);
  });

  test('with no collections yet, the picker is not offered at all', () => {
    const wiz = openNotes({ projects: [] });
    expect(collectionSelect(wiz)).toBeUndefined();
  });
});


describe('a capture that took no passage', () => {
  const NOTICE = /No passage was captured\. Select the text you want to quote, then say .cite this. again, or type the quote/;

  test('says so where the student starts, and keeps the flag out of the saved record', () => {
    const wiz = createStepRailWizard({
      draft: { title: 'A page', url: 'https://example.com/x', passageMissing: true },
    });

    expect(wiz.el.textContent).toMatch(NOTICE);
    expect(wiz.getDraft()).not.toHaveProperty('passageMissing');
  });

  test('says nothing of the kind when a passage was captured', () => {
    const wiz = createStepRailWizard({ draft: { title: 'A page', quote: 'Words.' } });
    expect(wiz.el.textContent).not.toMatch(/No passage was captured/);
  });
});
