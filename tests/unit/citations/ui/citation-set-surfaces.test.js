/**
 * @jest-environment jsdom
 *
 * Every surface that shows a single formatted citation shows it as it will read in its
 * reference list: the card, the wizard's CHECK preview (and the modal that opens it), and the
 * style switcher's preview. A card's list is its collection (or every unfiled citation), so two
 * works by one author in one year read 2020a / 2020b wherever the student sees them.
 *
 * The same surfaces carry the "check capitals" hint for the student's style (the card's chip and
 * a line saying why; the CHECK step's panel).
 */

import { createCitationCard } from '../../../../src/features/citations/ui/citation-card.js';
import { createLibraryView } from '../../../../src/features/citations/ui/library-view.js';
import { createStepRailWizard } from '../../../../src/features/citations/ui/wizard/step-rail-wizard.js';
import { showCitationWizard } from '../../../../src/features/citations/ui/citation-wizard-modal.js';
import { createStyleSwitcher } from '../../../../src/features/citations/ui/style-switcher.js';

jest.mock('../../../../src/utils/action-tray.js', () => ({ showInfoTray: jest.fn() }));

const book = (id, title, extra = {}) => ({
  id,
  type: 'book',
  authors: ['Smith, John'],
  title,
  publisher: 'Pub',
  publicationDate: '2020',
  ...extra,
});
const ANTS = book('a', 'The ants of Africa');
const ZEBRAS = book('z', 'Zebras of the plain');
const ELSEWHERE = book('x', 'Aardvarks at home', { projectId: 'essay-2' });

afterEach(() => {
  document.body.textContent = '';
});

const referenceText = root => root.querySelector('.assist-cite-card__reference').textContent;

describe('the card', () => {
  test('shows the letter its collection gives it', () => {
    const card = createCitationCard(ZEBRAS, { style: 'apa7', referencePool: [ANTS, ZEBRAS] });
    expect(referenceText(card.el)).toBe('Smith, J. (2020b). Zebras of the plain. Pub.');
  });

  test('a work filed in another collection does not letter it', () => {
    const card = createCitationCard(ANTS, { style: 'apa7', referencePool: [ANTS, ELSEWHERE] });
    expect(referenceText(card.el)).toBe('Smith, J. (2020). The ants of Africa. Pub.');
  });

  test('update() re-letters when the pool changes', () => {
    const card = createCitationCard(ANTS, { style: 'harvard', referencePool: [ANTS] });
    card.update(ANTS, { referencePool: [ANTS, ZEBRAS] });
    expect(referenceText(card.el)).toBe('Smith, J. (2020a) The ants of Africa. Pub.');
  });

  test('says in words when the title’s capitals do not match the style', () => {
    const shouting = {
      ...book('s', 'The Effects of Climate Change on Coral Reefs'),
      type: 'journal',
      siteName: 'Nature',
      url: 'https://n.example',
    };
    const card = createCitationCard(shouting, { style: 'harvard', referencePool: [shouting] });
    const hint = card.el.querySelector('.assist-cite-card__hint');
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(
      'Harvard writes article titles in sentence case: check the capitals.'
    );

    card.update(shouting, { style: 'mla9' });
    expect(hint.hidden).toBe(true);
  });
});

describe('the library view hands every card the whole library as its pool', () => {
  test('two works by one author in one year are lettered on their cards', () => {
    const state = {
      citations: [ANTS, ZEBRAS],
      projects: [],
      filter: '',
      activeProjectId: null,
      style: 'apa7',
      loading: false,
      view: 'library',
    };
    const store = {
      subscribe: jest.fn(() => () => {}),
      getState: jest.fn(() => ({ ...state })),
      getVisibleCitations: jest.fn(() => [ZEBRAS]),
      setFilter: jest.fn(),
      setStyle: jest.fn(),
      setView: jest.fn(),
      remove: jest.fn(),
    };
    const view = createLibraryView({ store });
    document.body.appendChild(view.el);
    // Only Zebras is on screen (a search), but its reference list still holds Ants.
    expect(referenceText(view.el)).toBe('Smith, J. (2020b). Zebras of the plain. Pub.');
    view.destroy();
  });
});

describe('the wizard’s CHECK step', () => {
  test('previews the reference with the letter its collection gives it', () => {
    const wiz = createStepRailWizard({
      draft: ANTS,
      style: 'chicago17',
      referencePool: [ANTS, ZEBRAS],
    });
    document.body.appendChild(wiz.el);
    wiz.goToStep('check');
    expect(referenceText(wiz.el)).toBe('Smith, John. 2020a. The ants of Africa. Pub.');
    wiz.destroy();
  });

  test.each([
    // Filed with Aardvarks (2020, same author): lettered against that collection, not the unfiled.
    ['essay-2', 'Smith, J. (2020b). The ants of Africa. Pub.'],
    // Filed in a collection holding nothing else: no letter at all.
    ['essay-3', 'Smith, J. (2020). The ants of Africa. Pub.'],
  ])('a draft filed in %s is previewed against that collection', (projectId, expected) => {
    const wiz = createStepRailWizard({
      draft: { ...ANTS, projectId },
      style: 'apa7',
      referencePool: [ANTS, ZEBRAS, ELSEWHERE],
    });
    document.body.appendChild(wiz.el);
    wiz.goToStep('check');
    expect(referenceText(wiz.el)).toBe(expected);
    wiz.destroy();
  });

  test('the check panel gives the capitals hint for the student’s style', () => {
    const wiz = createStepRailWizard({
      draft: { ...ANTS, title: 'Teaching Reading Across Diverse Primary Classrooms' },
      style: 'apa7',
    });
    document.body.appendChild(wiz.el);
    wiz.goToStep('check');
    expect(wiz.el.querySelector('.assist-cite-reassure').textContent).toContain(
      'APA writes book titles in sentence case: check the capitals.'
    );
    wiz.destroy();
  });

  test('the modal passes the style and the pool through', () => {
    showCitationWizard(ZEBRAS, {
      style: 'harvard',
      referencePool: [ANTS, ZEBRAS],
      initialStep: 'check',
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(referenceText(dialog)).toBe('Smith, J. (2020b) Zebras of the plain. Pub.');
  });
});

describe('the style switcher preview', () => {
  test('previews the representative citation in its list', () => {
    const switcher = createStyleSwitcher({ style: 'apa7' });
    switcher.setCitation(ANTS, [ANTS, ZEBRAS]);
    expect(switcher.el.querySelector('.assist-cite-switcher__preview').textContent).toContain(
      '(2020a)'
    );
  });
});
