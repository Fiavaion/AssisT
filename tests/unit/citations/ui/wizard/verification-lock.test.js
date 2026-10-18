/**
 * @jest-environment jsdom
 *
 * Unit tests for the verification lock mounted in the step-rail wizard.
 *
 * A citation whose details came back from CrossRef opens with those fields locked and a badge
 * that says so; the student can unlock, edit, and re-lock. The moment a locked field actually
 * changes the mark comes off — the details are the student's own from then on, not CrossRef's.
 *
 * SC 1.4.1 — the provenance is stated in words, never by colour alone.
 * SC 2.1.1 — the badge is operable from the keyboard (Enter as well as pointer).
 * SC 3.3.4 — error prevention: a verified record cannot be edited by accident.
 */

import { createStepRailWizard } from '../../../../../src/features/citations/ui/wizard/step-rail-wizard.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function fireEnter(el) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

function navButton(wiz, label) {
  return [...wiz.el.querySelectorAll('.assist-cite-step__nav button')].find(
    b => b.textContent === label
  );
}

function badgeEl(wiz) {
  return wiz.el.querySelector('.assist-cite-verify');
}

function provenance(wiz) {
  return wiz.el.querySelector('.assist-cite-wizard__provenance');
}

function statusEl(wiz) {
  return wiz.el.querySelector('.assist-cite-wizard__provenance-status');
}

function stepEl(wiz) {
  return wiz.el.querySelector('.assist-cite-wizard__host .assist-cite-step');
}

function firstFieldOfStep(wiz) {
  return stepEl(wiz).querySelector('.assist-cite-step__field');
}

function provenanceText(wiz) {
  const el = wiz.el.querySelector('.assist-cite-wizard__provenance-text');
  return el ? el.textContent : '';
}

/** The control of the mounted step whose label starts with `labelText`. */
function fieldByLabel(wiz, labelText) {
  const label = [...wiz.el.querySelectorAll('.assist-cite-step__label')].find(l =>
    l.textContent.startsWith(labelText)
  );
  return label ? wiz.el.querySelector(`#${label.getAttribute('for')}`) : null;
}

function typeInto(control, value) {
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

const BASE = {
  title: 'Attention Is All You Need',
  authors: ['Vaswani, Ashish'],
  publicationDate: '2017',
  url: 'https://example.org/paper',
  siteName: 'NeurIPS',
  publisher: 'Curran',
  doi: '10.1000/xyz123',
  type: 'journal',
};

const VERIFIED = {
  ...BASE,
  extra: { verified: { source: 'crossref', at: '2026-09-04T10:00:00.000Z' } },
};

const FROM_PAGE = { ...BASE, extra: { source: 'page' } };

// ── Unverified records ────────────────────────────────────────────────────────

describe('a record that CrossRef never verified', () => {
  test('shows no verification badge', () => {
    const wiz = createStepRailWizard({ draft: FROM_PAGE });
    expect(badgeEl(wiz)).toBeNull();
  });

  test('leaves every field editable', () => {
    const wiz = createStepRailWizard({ draft: FROM_PAGE });
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(false);
  });

  test('says in plain words that the details came off the page', () => {
    const wiz = createStepRailWizard({ draft: FROM_PAGE });
    expect(provenanceText(wiz)).toMatch(/read from the page/i);
  });

  test('says nothing about provenance for a blank manual entry', () => {
    const wiz = createStepRailWizard();
    expect(provenance(wiz)).toBeNull();
  });

  test('ignores a mark that vouches for no field at all', () => {
    const wiz = createStepRailWizard({
      draft: { ...BASE, extra: { verified: { source: 'crossref', fields: [] } } },
    });
    expect(badgeEl(wiz)).toBeNull();
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(false);
  });

  test('ignores a verification mark from anywhere but CrossRef', () => {
    const wiz = createStepRailWizard({ draft: { ...BASE, extra: { verified: { source: 'me' } } } });
    expect(badgeEl(wiz)).toBeNull();
  });
});

// ── Verified records open locked ─────────────────────────────────────────────

describe('a CrossRef-verified record', () => {
  test('shows the badge in its verified, locked state', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const badge = badgeEl(wiz);
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    expect(badge.querySelector('.assist-cite-verify__word').textContent).toBe('Verified');
    expect(badge.getAttribute('aria-label')).toMatch(/unlock/i);
  });

  test('names CrossRef as the source of the details', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    expect(provenanceText(wiz)).toMatch(/verified against CrossRef/i);
  });

  test('describes the badge by that sentence', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const describedBy = badgeEl(wiz).getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(wiz.el.querySelector(`#${describedBy}`).textContent).toMatch(/CrossRef/i);
  });

  test('locks the bibliographic fields on every step that holds one', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(true);

    fireMousedown(navButton(wiz, 'Next')); // WHO
    expect(fieldByLabel(wiz, 'Author(s)').readOnly).toBe(true);

    fireMousedown(navButton(wiz, 'Next')); // WHEN
    expect(fieldByLabel(wiz, 'Year published').readOnly).toBe(true);

    fireMousedown(navButton(wiz, 'Next')); // WHERE
    expect(fieldByLabel(wiz, 'Link (URL)').readOnly).toBe(true);
    expect(fieldByLabel(wiz, 'DOI').readOnly).toBe(true);
    expect(fieldByLabel(wiz, 'Site or journal name').readOnly).toBe(true);
    expect(fieldByLabel(wiz, 'Publisher').readOnly).toBe(true);
  });

  test('never locks the student’s own material on the NOTES step', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    ['Next', 'Next', 'Next', 'Next'].forEach(() => fireMousedown(navButton(wiz, 'Next')));
    expect(fieldByLabel(wiz, 'Why you saved it').readOnly).toBe(false);
    expect(fieldByLabel(wiz, 'Tags').readOnly).toBe(false);
    expect(fieldByLabel(wiz, 'Page or spot').readOnly).toBe(false);
  });

  test('takes the provenance row off the steps it does not govern', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    expect(provenance(wiz)).toBeTruthy();
    ['Next', 'Next', 'Next', 'Next'].forEach(() => fireMousedown(navButton(wiz, 'Next')));
    expect(provenance(wiz)).toBeNull(); // NOTES
    wiz.goToStep('check');
    expect(provenance(wiz)).toBeNull();
    wiz.goToStep('what');
    expect(provenance(wiz)).toBeTruthy();
  });

  test('says that the source type is the student’s own to set', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    expect(provenanceText(wiz)).toMatch(/type is yours to set/i);
  });

  test('names the details it is vouching for, rather than all of them', () => {
    const wiz = createStepRailWizard({
      draft: { ...BASE, extra: { verified: { source: 'crossref', fields: ['title', 'authors'] } } },
    });
    expect(provenanceText(wiz)).toMatch(/title and authors/i);
    expect(provenanceText(wiz)).not.toMatch(/site or journal/i);
    expect(provenanceText(wiz)).not.toMatch(/year/i);
  });
});

// ── Reaching the badge ───────────────────────────────────────────────────────

describe('reaching the unlock control', () => {
  test('sits inside the step, after its question and before its first field', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const step = stepEl(wiz);
    const legend = step.querySelector('.assist-cite-step__legend');
    const badge = badgeEl(wiz);
    expect(step.contains(badge)).toBe(true);
    expect(legend.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      badge.compareDocumentPosition(firstFieldOfStep(wiz)) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test('moves with the student to every step it governs', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    ['who', 'when', 'where'].forEach(id => {
      wiz.goToStep(id);
      expect(stepEl(wiz).contains(badgeEl(wiz))).toBe(true);
    });
  });
});

// ── Why a field is read only ─────────────────────────────────────────────────

describe('a locked field', () => {
  test('is described by the sentence that explains the lock', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const title = fieldByLabel(wiz, 'Title');
    const sentenceId = wiz.el.querySelector('.assist-cite-wizard__provenance-text').id;
    expect(title.getAttribute('aria-describedby').split(' ')).toContain(sentenceId);
  });

  test('gives the way out as well as the reason', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const ids = fieldByLabel(wiz, 'Title').getAttribute('aria-describedby').split(' ');
    const reason = ids.map(id => wiz.el.querySelector('#' + id).textContent).join(' ');
    expect(reason).toMatch(/verified against CrossRef/i);
    expect(reason).toMatch(/Verified button/i);
  });

  test('drops that reason once it is unlocked, and regains it when re-locked', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const title = fieldByLabel(wiz, 'Title');
    const sentenceId = wiz.el.querySelector('.assist-cite-wizard__provenance-text').id;
    fireMousedown(badgeEl(wiz));
    expect(title.getAttribute('aria-describedby').split(' ')).not.toContain(sentenceId);
    fireMousedown(badgeEl(wiz));
    expect(title.getAttribute('aria-describedby').split(' ')).toContain(sentenceId);
  });

  test('keeps its own hint alongside the reason', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const ids = fieldByLabel(wiz, 'Title').getAttribute('aria-describedby').split(' ');
    expect(ids.length).toBeGreaterThan(1);
    expect(wiz.el.querySelector('#' + ids[0]).textContent).toMatch(/name of the page/i);
  });

  test('a field CrossRef never supplied is neither locked nor explained away', () => {
    const wiz = createStepRailWizard({
      draft: { ...BASE, extra: { verified: { source: 'crossref', fields: ['title', 'authors'] } } },
    });
    wiz.goToStep('where');
    const publisher = fieldByLabel(wiz, 'Publisher');
    expect(publisher.readOnly).toBe(false);
    expect(publisher.getAttribute('aria-describedby') || '').not.toMatch(/provenance/);
    wiz.goToStep('what');
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(true);
  });

  test('editing a field the mark never covered leaves the mark alone', () => {
    const saved = jest.fn();
    const wiz = createStepRailWizard({
      draft: { ...BASE, extra: { verified: { source: 'crossref', fields: ['title'] } } },
      onComplete: saved,
    });
    wiz.goToStep('where');
    typeInto(fieldByLabel(wiz, 'Publisher'), 'A publisher I found myself');
    fireMousedown(navButton(wiz, 'Save'));
    expect(saved.mock.calls[0][0].extra.verified.source).toBe('crossref');
  });

  test('a record saved before field-level provenance locks all of them', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    wiz.goToStep('where');
    expect(fieldByLabel(wiz, 'Publisher').readOnly).toBe(true);
  });
});

// ── Unlocking and re-locking ─────────────────────────────────────────────────

describe('unlocking a verified record', () => {
  test('activating the badge makes the fields editable', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    fireMousedown(badgeEl(wiz));
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(false);
    expect(badgeEl(wiz).getAttribute('aria-pressed')).toBe('false');
    expect(badgeEl(wiz).querySelector('.assist-cite-verify__word').textContent).toMatch(/editing/i);
  });

  test('is operable from the keyboard alone', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    fireEnter(badgeEl(wiz));
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(false);
  });

  test('activating it again locks the fields back down', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    fireMousedown(badgeEl(wiz));
    fireMousedown(badgeEl(wiz));
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(true);
    expect(badgeEl(wiz).getAttribute('aria-pressed')).toBe('true');
  });
});

// ── What the save carries ────────────────────────────────────────────────────

describe('what the save carries', () => {
  test('keeps the CrossRef mark when nothing was changed', () => {
    const saved = jest.fn();
    const wiz = createStepRailWizard({ draft: VERIFIED, onComplete: saved });
    fireMousedown(badgeEl(wiz)); // unlock, then think better of it
    fireMousedown(navButton(wiz, 'Save'));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][0].extra.verified).toEqual({
      source: 'crossref',
      at: '2026-09-04T10:00:00.000Z',
    });
  });

  test('drops the mark when a locked field is edited after unlocking', () => {
    const saved = jest.fn();
    const wiz = createStepRailWizard({ draft: VERIFIED, onComplete: saved });
    fireMousedown(badgeEl(wiz));
    typeInto(fieldByLabel(wiz, 'Title'), 'Attention Is All You Need (my version)');
    fireMousedown(navButton(wiz, 'Save'));
    expect(saved.mock.calls[0][0].extra.verified).toBeUndefined();
  });

  test('says so the moment the edit happens, rather than silently at save', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    fireMousedown(badgeEl(wiz));
    typeInto(fieldByLabel(wiz, 'Title'), 'Something else entirely');
    expect(provenanceText(wiz)).toMatch(/your own/i);
    expect(fieldByLabel(wiz, 'Title').readOnly).toBe(false);
  });

  test('announces that change, since the student is typing elsewhere when it happens', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const status = statusEl(wiz);
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    fireMousedown(badgeEl(wiz));
    typeInto(fieldByLabel(wiz, 'Title'), 'Something else entirely');
    expect(status.textContent).toMatch(/your own/i);
  });

  test('keeps that live region mounted and unhidden on every step', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    ['what', 'who', 'when', 'where', 'notes', 'check'].forEach(id => {
      wiz.goToStep(id);
      const status = statusEl(wiz);
      expect(status).toBeTruthy();
      expect(status.hidden).toBe(false);
    });
  });

  test('takes the badge away once the mark is gone, rather than leaving a dead control', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    fireMousedown(badgeEl(wiz));
    typeInto(fieldByLabel(wiz, 'Title'), 'Something else entirely');
    expect(badgeEl(wiz)).toBeNull();
    expect(provenanceText(wiz)).toMatch(/your own/i);
    wiz.goToStep('where');
    expect(badgeEl(wiz)).toBeNull();
    expect(fieldByLabel(wiz, 'Publisher').readOnly).toBe(false);
  });

  test('leaves no orphaned reason on the fields it stops governing', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const title = fieldByLabel(wiz, 'Title');
    const sentenceId = wiz.el.querySelector('.assist-cite-wizard__provenance-text').id;
    fireMousedown(badgeEl(wiz));
    typeInto(title, 'Something else entirely');
    expect(title.getAttribute('aria-describedby').split(' ')).not.toContain(sentenceId);
  });

  test('keeps the mark when the student only adds notes and tags', () => {
    const saved = jest.fn();
    const wiz = createStepRailWizard({ draft: VERIFIED, onComplete: saved });
    ['Next', 'Next', 'Next', 'Next'].forEach(() => fireMousedown(navButton(wiz, 'Next')));
    typeInto(fieldByLabel(wiz, 'Why you saved it'), 'Backs up my point about attention.');
    typeInto(fieldByLabel(wiz, 'Tags'), 'transformers, memory');
    fireMousedown(navButton(wiz, 'Save'));
    const result = saved.mock.calls[0][0];
    expect(result.extra.verified.source).toBe('crossref');
    expect(result.notes).toBe('Backs up my point about attention.');
    expect(result.tags).toEqual(['transformers', 'memory']);
  });

  test('does not touch the caller’s draft object', () => {
    const draft = { ...VERIFIED, extra: { verified: { source: 'crossref', at: 'x' } } };
    const wiz = createStepRailWizard({ draft, onComplete: () => {} });
    fireMousedown(badgeEl(wiz));
    typeInto(fieldByLabel(wiz, 'Title'), 'Changed');
    expect(draft.extra.verified).toEqual({ source: 'crossref', at: 'x' });
  });
});

// ── Teardown ─────────────────────────────────────────────────────────────────

describe('destroy()', () => {
  test('leaves the badge inert', () => {
    const wiz = createStepRailWizard({ draft: VERIFIED });
    const badge = badgeEl(wiz);
    const title = fieldByLabel(wiz, 'Title');
    wiz.destroy();
    fireMousedown(badge);
    expect(title.readOnly).toBe(true);
  });
});
