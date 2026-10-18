/**
 * @jest-environment jsdom
 *
 * Saying an author is an organisation, on the wizard's WHO step.
 *
 * Each author line gets a labelled checkbox in a group of its own, so "Harvard University" can be
 * printed whole instead of as "University, H.". The box is ticked for the organisations a capture
 * or lookup already named; nothing typed by the student is ever ticked for them. A post's account
 * handle is asked for beside the authors, and only for a social-media post.
 */

import { createStepRailWizard } from '../../../../../src/features/citations/ui/wizard/step-rail-wizard.js';

function openWho(draft) {
  const wiz = createStepRailWizard({ draft: { title: 'T', ...draft } });
  wiz.goToStep('who');
  return wiz;
}

/** The labelled control whose own <label> reads exactly this. */
function control(wiz, labelText) {
  const label = [...wiz.el.querySelectorAll('label')].find(l => l.textContent === labelText);
  return label ? wiz.el.querySelector(`#${label.getAttribute('for')}`) : null;
}

function authorsBox(wiz) {
  return control(wiz, 'Author(s)');
}

function typeAuthors(wiz, text) {
  const box = authorsBox(wiz);
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

function organisationGroup(wiz) {
  return wiz.el.querySelector('fieldset.assist-cite-step__organisations');
}

describe('WHO step: which authors are organisations', () => {
  test('one labelled checkbox per author, in a group with a legend, ticked from the record', () => {
    const wiz = openWho({
      authors: ['Harvard University', 'Smith, Jane'],
      extra: { organisationAuthors: ['Harvard University'] },
    });
    const group = organisationGroup(wiz);
    expect(group).not.toBeNull();
    expect(group.hidden).toBe(false);
    expect(group.querySelector('legend').textContent).toMatch(/organisation/i);

    const harvard = control(wiz, 'Harvard University');
    const smith = control(wiz, 'Smith, Jane');
    expect(harvard.type).toBe('checkbox');
    expect(harvard.checked).toBe(true);
    expect(smith.checked).toBe(false);
    // Reachable by keyboard like any other form control.
    expect(harvard.tabIndex).not.toBe(-1);
  });

  test('ticking a box records the organisation on the draft; unticking removes it', () => {
    const wiz = openWho({ authors: ['BBC News', 'Smith, Jane'] });
    const bbc = control(wiz, 'BBC News');
    bbc.checked = true;
    bbc.dispatchEvent(new Event('change', { bubbles: true }));
    expect(wiz.getDraft().extra.organisationAuthors).toEqual(['BBC News']);

    bbc.checked = false;
    bbc.dispatchEvent(new Event('change', { bubbles: true }));
    expect(wiz.getDraft().extra.organisationAuthors).toBeUndefined();
  });

  test('a typed author gets an unticked box; a removed author takes its tick with it', () => {
    const wiz = openWho({
      authors: ['World Health Organization'],
      extra: { organisationAuthors: ['World Health Organization'] },
    });
    typeAuthors(wiz, 'Harvard University\nSmith, Jane');
    // A name the student typed is never guessed to be an organisation.
    expect(control(wiz, 'Harvard University').checked).toBe(false);
    expect(control(wiz, 'World Health Organization')).toBeNull();
    expect(wiz.getDraft().extra.organisationAuthors).toBeUndefined();
  });

  test('the group is hidden while there are no authors', () => {
    const wiz = openWho({ authors: [] });
    expect(organisationGroup(wiz).hidden).toBe(true);
    typeAuthors(wiz, 'BBC News');
    expect(organisationGroup(wiz).hidden).toBe(false);
  });

  test('a ticked organisation prints whole in the saved record', () => {
    const wiz = openWho({ authors: [] });
    typeAuthors(wiz, 'Harvard University');
    const box = control(wiz, 'Harvard University');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const draft = wiz.getDraft();
    expect(draft.authors).toEqual(['Harvard University']);
    expect(draft.extra.organisationAuthors).toEqual(['Harvard University']);
  });
});

describe('WHO step: a post account handle', () => {
  test('asked for only on a social-media post, and saved on the record', () => {
    const website = openWho({ type: 'website', authors: [] });
    const hidden = control(website, 'Account handle');
    expect(hidden && !hidden.closest('.assist-cite-step__field-wrap').hidden).toBe(false);

    const wiz = openWho({ type: 'social_media', authors: ['Gates, Bill'] });
    const handle = control(wiz, 'Account handle');
    expect(handle.closest('.assist-cite-step__field-wrap').hidden).toBe(false);
    handle.value = '@BillGates';
    handle.dispatchEvent(new Event('input', { bubbles: true }));
    expect(wiz.getDraft().extra.handle).toBe('@BillGates');
  });
});
