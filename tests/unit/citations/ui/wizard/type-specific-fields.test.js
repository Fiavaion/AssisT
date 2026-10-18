/**
 * @jest-environment jsdom
 *
 * The details that belong to one kind of source, in the step-rail wizard's WHERE step.
 *
 * The styles render a chapter from its editors, edition, place and page range, a thesis from its
 * institution and degree, and an article from its page range, so a hand-typed source is only as
 * good as the boxes the wizard offers. Each of these belongs to some source types and not others,
 * so they appear and disappear with the type picker — keeping what a student typed while the
 * wizard is open, and dropping what the saved type has no use for on the way out. None of them is
 * ever covered by the CrossRef verification lock.
 */

import { createStepRailWizard } from '../../../../../src/features/citations/ui/wizard/step-rail-wizard.js';

/** The control whose own <label> reads exactly this. */
function control(wiz, labelText) {
  const label = [...wiz.el.querySelectorAll('label')].find(l => l.textContent === labelText);
  return label ? wiz.el.querySelector(`#${label.getAttribute('for')}`) : null;
}

/** A field counts as offered only when its row is in the tab order and the accessibility tree. */
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

const CHAPTER_FIELDS = ['Editors of the book', 'Edition', 'Place of publication', 'Pages'];
const THESIS_FIELDS = ['University or institution', 'Degree'];

/** A chapter draft with everything the styles need except the chapter-only extras. */
const CHAPTER_DRAFT = {
  type: 'chapter',
  title: 'Drawing as thinking',
  authors: ['Roe, Richard'],
  publicationDate: '2015',
  siteName: 'The Handbook of Art Education',
  publisher: 'Pub House',
};

function openWhere(draft, style) {
  const wiz = createStepRailWizard(style ? { draft, style } : { draft });
  wiz.goToStep('where');
  return wiz;
}

describe('WHERE step — fields that belong to one source type', () => {
  test('a website is offered none of the chapter or thesis fields', () => {
    const wiz = openWhere({ title: 'A page', type: 'website' });
    [...CHAPTER_FIELDS, ...THESIS_FIELDS].forEach(label => {
      expect(isOffered(wiz, label)).toBe(false);
    });
    expect(isOffered(wiz, 'Site or journal name')).toBe(true);
  });

  test('a chapter is offered the book fields, and the container box asks for the book', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    CHAPTER_FIELDS.forEach(label => expect(isOffered(wiz, label)).toBe(true));
    THESIS_FIELDS.forEach(label => expect(isOffered(wiz, label)).toBe(false));
    expect(isOffered(wiz, 'Book title')).toBe(true);
    expect(control(wiz, 'Site or journal name')).toBeNull();
  });

  test('a thesis is offered the institution and the degree, and no book fields', () => {
    const wiz = openWhere({ title: 'A thesis', type: 'thesis' });
    THESIS_FIELDS.forEach(label => expect(isOffered(wiz, label)).toBe(true));
    CHAPTER_FIELDS.forEach(label => expect(isOffered(wiz, label)).toBe(false));
  });

  test('every offered field has an accessible name and is in the tab order', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    [...CHAPTER_FIELDS, 'Book title'].forEach(label => {
      const el = control(wiz, label);
      expect(el.id).toBeTruthy();
      expect(el.disabled).toBe(false);
      expect(el.hasAttribute('tabindex')).toBe(false);
    });
  });
});

describe('WHERE step — what the fields store', () => {
  test('editors typed on one line are stored as a list of "Family, Given"', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    type(wiz, 'Editors of the book', 'Smith, Ann and Jones, Bob');
    expect(wiz.getDraft().extra.editors).toEqual(['Smith, Ann', 'Jones, Bob']);
  });

  test('editors typed one per line are reordered to family name first', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    type(wiz, 'Editors of the book', 'Ann Smith\nBob Jones');
    expect(wiz.getDraft().extra.editors).toEqual(['Smith, Ann', 'Jones, Bob']);
  });

  test('emptying the editors box leaves no editors behind', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    type(wiz, 'Editors of the book', 'Smith, Ann');
    type(wiz, 'Editors of the book', '   ');
    expect(wiz.getDraft().extra.editors).toBeUndefined();
  });

  test('edition, place and pages are stored on extra', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    type(wiz, 'Edition', '2nd');
    type(wiz, 'Place of publication', 'London');
    type(wiz, 'Pages', '10-20');
    const { extra } = wiz.getDraft();
    expect(extra.edition).toBe('2nd');
    expect(extra.place).toBe('London');
    expect(extra.pages).toBe('10-20');
  });

  test('the institution and a listed degree are stored on extra', () => {
    const wiz = openWhere({ title: 'A thesis', type: 'thesis' });
    type(wiz, 'University or institution', 'National College of Art and Design');
    choose(wiz, 'Degree', 'MA dissertation');
    const { extra } = wiz.getDraft();
    expect(extra.institution).toBe('National College of Art and Design');
    expect(extra.thesisType).toBe('MA dissertation');
  });

  test('a degree that is not on the list is typed in its own box', () => {
    const wiz = openWhere({ title: 'A thesis', type: 'thesis' });
    expect(isOffered(wiz, 'Type the degree')).toBe(false);
    choose(wiz, 'Degree', '__other__');
    expect(isOffered(wiz, 'Type the degree')).toBe(true);
    type(wiz, 'Type the degree', 'Practice-based doctorate');
    expect(wiz.getDraft().extra.thesisType).toBe('Practice-based doctorate');
  });

  test('no chapter or thesis key is invented for a website', () => {
    const wiz = openWhere({ title: 'A page', type: 'website' });
    type(wiz, 'Site or journal name', 'Example');
    const { extra } = wiz.getDraft();
    expect(extra.editors).toBeUndefined();
    expect(extra.edition).toBeUndefined();
    expect(extra.place).toBeUndefined();
    expect(extra.institution).toBeUndefined();
    expect(extra.thesisType).toBeUndefined();
  });
});

describe('WHERE step — editing a saved record', () => {
  test('a saved chapter opens with its editors, edition, place and pages in the boxes', () => {
    const wiz = openWhere({
      ...CHAPTER_DRAFT,
      extra: {
        editors: ['Smith, Ann', 'Jones, Bob'],
        edition: '2nd',
        place: 'London',
        pages: '10-20',
      },
    });
    expect(control(wiz, 'Editors of the book').value).toBe('Smith, Ann\nJones, Bob');
    expect(control(wiz, 'Edition').value).toBe('2nd');
    expect(control(wiz, 'Place of publication').value).toBe('London');
    expect(control(wiz, 'Pages').value).toBe('10-20');
  });

  test('a saved thesis opens with its institution and degree selected', () => {
    const wiz = openWhere({
      title: 'Tactile interfaces',
      type: 'thesis',
      extra: { thesisType: 'PhD thesis', institution: 'NCAD' },
    });
    expect(control(wiz, 'University or institution').value).toBe('NCAD');
    expect(control(wiz, 'Degree').value).toBe('PhD thesis');
    expect(isOffered(wiz, 'Type the degree')).toBe(false);
  });

  test('a saved degree that is not on the list opens in the free-text box', () => {
    const wiz = openWhere({
      title: 'Tactile interfaces',
      type: 'thesis',
      extra: { thesisType: 'Practice-based doctorate' },
    });
    expect(control(wiz, 'Degree').value).toBe('__other__');
    expect(isOffered(wiz, 'Type the degree')).toBe(true);
    expect(control(wiz, 'Type the degree').value).toBe('Practice-based doctorate');
  });
});

describe('WHERE step — changing the source type', () => {
  test('switching away and back keeps what was typed', () => {
    const wiz = openWhere(CHAPTER_DRAFT);
    type(wiz, 'Editors of the book', 'Smith, Ann');
    type(wiz, 'Place of publication', 'London');

    wiz.goToStep('what');
    choose(wiz, 'Type', 'website');
    wiz.goToStep('where');
    expect(isOffered(wiz, 'Place of publication')).toBe(false);

    wiz.goToStep('what');
    choose(wiz, 'Type', 'chapter');
    wiz.goToStep('where');
    expect(isOffered(wiz, 'Place of publication')).toBe(true);
    expect(control(wiz, 'Editors of the book').value).toBe('Smith, Ann');
    expect(control(wiz, 'Place of publication').value).toBe('London');
    expect(wiz.getDraft().extra.editors).toEqual(['Smith, Ann']);
  });
});

describe('WHERE step — the page range', () => {
  test('is offered for the source types whose references print one', () => {
    ['chapter', 'journal', 'newspaper'].forEach(sourceType => {
      const wiz = openWhere({ title: 'A source', type: sourceType });
      expect(isOffered(wiz, 'Pages')).toBe(true);
    });
  });

  test('is not offered where a page range means nothing', () => {
    ['website', 'book', 'thesis', 'video'].forEach(sourceType => {
      const wiz = openWhere({ title: 'A source', type: sourceType });
      expect(isOffered(wiz, 'Pages')).toBe(false);
    });
  });

  test('a journal article stores its page range on extra', () => {
    const wiz = openWhere({ title: 'An article', type: 'journal' });
    type(wiz, 'Pages', '357-362');
    expect(wiz.getDraft().extra.pages).toBe('357-362');
  });
});

describe('saving — details the saved type has no use for', () => {
  /** A wizard on the WHERE step whose Save hands the finished citation to onComplete. */
  function savedThrough(draft) {
    const onComplete = jest.fn();
    const wiz = createStepRailWizard({ draft, onComplete });
    wiz.goToStep('where');
    return { wiz, onComplete };
  }

  test('a chapter keeps its editors, edition, place and pages', () => {
    const { wiz, onComplete } = savedThrough({
      ...CHAPTER_DRAFT,
      extra: { editors: ['Smith, Ann'], edition: '2nd', place: 'London', pages: '10-20' },
    });
    wiz.goToStep('check');
    wiz.el.querySelectorAll('.assist-cite-step__nav button').forEach(b => {
      if (b.textContent === 'Save') {
        b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }
    });
    const { extra } = onComplete.mock.calls[0][0];
    expect(extra.editors).toEqual(['Smith, Ann']);
    expect(extra.edition).toBe('2nd');
    expect(extra.place).toBe('London');
    expect(extra.pages).toBe('10-20');
  });

  test('a chapter retyped as a website is saved without the book details', () => {
    const wiz = openWhere({
      ...CHAPTER_DRAFT,
      extra: {
        editors: ['Smith, Ann'],
        edition: '2nd',
        place: 'London',
        chapter: '4',
        pages: '10-20',
      },
    });
    wiz.goToStep('what');
    choose(wiz, 'Type', 'website');
    const { extra } = wiz.getDraft();
    expect(extra.editors).toBeUndefined();
    expect(extra.edition).toBeUndefined();
    expect(extra.place).toBeUndefined();
    expect(extra.chapter).toBeUndefined();
    expect(extra.pages).toBeUndefined();
  });

  test('a thesis retyped as a journal article keeps its pages and loses its degree', () => {
    const wiz = openWhere({
      title: 'Tactile interfaces',
      type: 'thesis',
      extra: { thesisType: 'PhD thesis', institution: 'NCAD', pages: '357-362' },
    });
    wiz.goToStep('what');
    choose(wiz, 'Type', 'journal');
    const { extra } = wiz.getDraft();
    expect(extra.thesisType).toBeUndefined();
    expect(extra.institution).toBeUndefined();
    expect(extra.pages).toBe('357-362');
  });

  test('a book keeps the edition and place its references print', () => {
    const wiz = openWhere({
      title: 'On Growth and Form',
      type: 'book',
      extra: { edition: '2nd', place: 'Cambridge', editors: ['Smith, Ann'] },
    });
    const { extra } = wiz.getDraft();
    expect(extra.edition).toBe('2nd');
    expect(extra.place).toBe('Cambridge');
    expect(extra.editors).toBeUndefined();
  });

  test('the wizard keeps what was pruned, so changing your mind back restores it', () => {
    const wiz = openWhere({
      ...CHAPTER_DRAFT,
      extra: { editors: ['Smith, Ann'], place: 'London', pages: '10-20' },
    });
    wiz.goToStep('what');
    choose(wiz, 'Type', 'website');
    expect(wiz.getDraft().extra.editors).toBeUndefined();

    choose(wiz, 'Type', 'chapter');
    wiz.goToStep('where');
    expect(control(wiz, 'Editors of the book').value).toBe('Smith, Ann');
    expect(control(wiz, 'Place of publication').value).toBe('London');
    const { extra } = wiz.getDraft();
    expect(extra.editors).toEqual(['Smith, Ann']);
    expect(extra.place).toBe('London');
    expect(extra.pages).toBe('10-20');
  });
});

describe('CHECK step — the preview reads back what was typed', () => {
  test('Harvard renders the editor clause, edition, place and pages', () => {
    const wiz = openWhere(CHAPTER_DRAFT, 'harvard');
    type(wiz, 'Editors of the book', 'Smith, Ann and Jones, Bob');
    type(wiz, 'Edition', '2nd');
    type(wiz, 'Place of publication', 'London');
    type(wiz, 'Pages', '10-20');
    wiz.goToStep('check');
    expect(wiz.el.querySelector('.assist-cite-card__reference').textContent).toBe(
      "Roe, R. (2015) 'Drawing as thinking', in Smith, A. and Jones, B. (eds) " +
        'The Handbook of Art Education. 2nd edn. London: Pub House, pp. 10–20.'
    );
  });

  test('Harvard renders the degree and institution of a thesis', () => {
    const wiz = openWhere(
      {
        type: 'thesis',
        title: 'Tactile interfaces',
        authors: ['Nolan, Aoife'],
        publicationDate: '2022',
      },
      'harvard'
    );
    type(wiz, 'University or institution', 'National College of Art and Design');
    choose(wiz, 'Degree', 'PhD thesis');
    wiz.goToStep('check');
    expect(wiz.el.querySelector('.assist-cite-card__reference').textContent).toBe(
      'Nolan, A. (2022) Tactile interfaces. PhD thesis. National College of Art and Design.'
    );
  });
});

describe('WHERE step — the verification lock', () => {
  const VERIFIED_CHAPTER = {
    ...CHAPTER_DRAFT,
    doi: '10.1000/xyz',
    extra: { verified: { source: 'crossref', fields: ['title', 'authors', 'doi'] } },
  };

  test('CrossRef never locks a field it did not supply', () => {
    const wiz = openWhere(VERIFIED_CHAPTER);
    expect(control(wiz, 'DOI').readOnly).toBe(true);
    [...CHAPTER_FIELDS, 'Book title'].forEach(label => {
      expect(control(wiz, label).readOnly).toBe(false);
    });
  });

  test('typing an editor does not take the verified mark off the record', () => {
    const wiz = openWhere(VERIFIED_CHAPTER);
    type(wiz, 'Editors of the book', 'Smith, Ann');
    expect(wiz.getDraft().extra.verified).toEqual({
      source: 'crossref',
      fields: ['title', 'authors', 'doi'],
    });
  });
});
