/**
 * @jest-environment jsdom
 *
 * Study mode.
 *
 * The point of this module is that it needs no AI at all: a tree of nodes with children already
 * IS a deck of recall questions, and reading one out of the map is arithmetic, not generation. So
 * the queue is graded for being deterministic, the grading for being the student's own judgement
 * rather than a string comparison, and the whole thing for being reachable from the keyboard with
 * focus landing somewhere sensible at every step.
 */

import { mountStudyMode } from '../../../../src/pages/mind-map/study-mode.js';
import { SOURCE_TYPES } from '../../../../src/features/flashcards/card-model.js';
import { createSelectionStub, activate, makeHistory } from './pane-fixtures.js';

describe('study mode', () => {
  let host;
  let history;
  let selection;
  let announce;
  let saveFlashcard;
  let study;

  const find = selector => host.querySelector(selector);
  const action = name => host.querySelector(`[data-command="${name}"]`);
  const question = () => find('.mm-study__question').textContent;
  const enter = () => activate(action('study'));

  const mount = () => {
    study = mountStudyMode(host, { history, selection, announce, saveFlashcard });
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    announce = jest.fn();
    saveFlashcard = jest.fn().mockResolvedValue({ saved: true });
    mount();
  });

  afterEach(() => {
    study?.destroy();
    host.remove();
  });

  describe('entering and leaving', () => {
    it('invites the student to start, and shows the practice only once they have', () => {
      expect(action('study')).not.toBe(null);
      expect(find('.mm-study__intro').hidden).toBe(false);
      expect(find('.mm-study__panel').hidden).toBe(true);

      enter();

      expect(find('.mm-study__panel').hidden).toBe(false);
      // One thing in the tab at a time: no Start button under the question being answered.
      expect(find('.mm-study__intro').hidden).toBe(true);
    });

    it('starts at the centre when the selection names something that is not a node', () => {
      selection.set('constructor', { source: 'program' });

      enter();

      expect(question()).toBe('What comes under "Essay plan"?');
    });

    it('says whether a session is running, so the page can hold Alt+R back while one is', () => {
      expect(study.isActive()).toBe(false);
      enter();
      expect(study.isActive()).toBe(true);
      activate(action('leave'));
      expect(study.isActive()).toBe(false);
    });

    it('names the practice as a group so a screen reader can say what it is', () => {
      enter();
      const panel = find('.mm-study__panel');
      expect(panel.hidden).toBe(false);
      expect(panel.getAttribute('role')).toBe('group');
      expect(panel.getAttribute('aria-label')).toBe('Study practice');
    });

    // The dock owns Escape: it takes the student back to Details and to the toolbar button they
    // came from. A second Escape here would end their practice session behind that.
    it('leaves Escape to the page rather than ending the session on it', () => {
      enter();
      const event = new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      find('.mm-study__panel').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(study.isActive()).toBe(true);
    });

    it('leaves from its own button, and gives focus back to the invitation', () => {
      enter();
      activate(action('leave'));
      expect(find('.mm-study__panel').hidden).toBe(true);
      expect(find('.mm-study__intro').hidden).toBe(false);
      expect(document.activeElement).toBe(action('study'));
    });

    it('puts focus where the tab is waiting when the dock opens it', () => {
      study.focusFirst();
      expect(document.activeElement).toBe(action('study'));
    });

    it('says so and stays shut when there is nothing to practise', () => {
      selection.set('ev', { source: 'outline' });
      enter();
      expect(find('.mm-study__panel').hidden).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/nothing to practise/i));
    });
  });

  describe('the deterministic queue', () => {
    it('asks what comes under every node that has children, in outline order', () => {
      enter();
      expect(question()).toBe('What comes under "Essay plan"?');
      expect(find('.mm-study__progress').textContent).toBe('Question 1 of 2');

      activate(action('reveal'));
      activate(action('got'));
      expect(question()).toBe('What comes under "Argument"?');
    });

    it('walks only the selected branch when one is selected', () => {
      selection.set('arg', { source: 'outline' });
      enter();
      expect(question()).toBe('What comes under "Argument"?');
      expect(find('.mm-study__progress').textContent).toBe('Question 1 of 1');
    });

    it('hides the children until Reveal, then shows them', () => {
      selection.set('arg', { source: 'outline' });
      enter();
      expect(find('.mm-study__answerText')).toBe(null);

      activate(action('reveal'));
      expect(find('.mm-study__answerText').textContent).toBe('Evidence, Counterpoint');
    });

    it('never grades what the student typed — they grade themselves', () => {
      selection.set('arg', { source: 'outline' });
      enter();
      find('.mm-study__answer').value = 'complete nonsense';
      activate(action('reveal'));
      activate(action('got'));
      expect(find('.mm-study__summary').textContent).toContain('1 of 1 recalled');
    });

    it('names an empty node rather than quoting an empty string', () => {
      history.apply('setText', { id: 'arg', text: '  ' });
      selection.set('arg', { source: 'outline' });

      enter();

      expect(question()).toBe('What comes under "this node"?');
    });

    // No AI and no clock: the deck is read out of the tree, so the same map practises the same way
    // every time. A student who leaves a session and comes back has not been given a new deck.
    it('is the same practice every time, for the same map', () => {
      const walk = () => {
        // A session selects each node as it asks about it, so the branch is stated afresh: what is
        // being graded is the deck, not where the last session left the student.
        selection.set(history.current().rootId, { source: 'outline' });
        enter();
        const first = question();
        activate(action('reveal'));
        activate(action('got'));
        const second = question();
        activate(action('leave'));
        return [first, second];
      };

      expect(walk()).toEqual(walk());
    });
  });

  describe('scoring', () => {
    beforeEach(() => {
      enter();
      activate(action('reveal'));
      activate(action('got'));
      activate(action('reveal'));
      activate(action('missed'));
    });

    it('sums the self-grades at the end', () => {
      expect(find('.mm-study__summary').textContent).toContain('1 of 2 recalled');
    });

    it('lists what was missed and offers a flashcard for it', async () => {
      const missed = [...host.querySelectorAll('.mm-study__missed')];
      expect(missed.length).toBe(1);
      expect(missed[0].textContent).toContain('What comes under "Argument"?');

      activate(missed[0].querySelector('button'));
      await Promise.resolve();
      await Promise.resolve();

      expect(saveFlashcard).toHaveBeenCalledTimes(1);
      const card = saveFlashcard.mock.calls[0][0];
      expect(card.front).toBe('What comes under "Argument"?');
      expect(card.back).toBe('Evidence, Counterpoint');
      expect(card.sourceType).toBe(SOURCE_TYPES.MINDMAP);
      expect(card.sourceRef).toEqual({ mapId: 'm1', nodeId: 'arg' });
      expect(card.tags).toEqual(['mind map']);
      expect(card.id).toEqual(expect.any(String));
    });

    it('does not offer the same card twice', async () => {
      const button = host.querySelector('.mm-study__missed button');
      activate(button);
      await Promise.resolve();
      await Promise.resolve();
      expect(button.disabled).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/flashcard/i));
    });

    it('says why when the card could not be saved', async () => {
      saveFlashcard.mockResolvedValue({ saved: false, reason: 'card limit reached (500)' });
      activate(host.querySelector('.mm-study__missed button'));
      await Promise.resolve();
      await Promise.resolve();
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('card limit reached'));
    });

    // The press that makes the card is the press that disables the button, and a disabled button
    // cannot hold focus: the browser drops it on `<body>`, out of the panel entirely.
    it('moves focus to the summary rather than losing it with the button', async () => {
      const button = host.querySelector('.mm-study__missed button');
      activate(button);
      expect(button.disabled).toBe(true);
      expect(document.activeElement).toBe(find('.mm-study__summary'));

      await Promise.resolve();
      await Promise.resolve();
      expect(document.activeElement).toBe(find('.mm-study__summary'));
    });

    it('hands focus back to the offer when the save failed and it is live again', async () => {
      saveFlashcard.mockResolvedValue({ saved: false, reason: 'card limit reached (500)' });
      const button = host.querySelector('.mm-study__missed button');
      activate(button);
      await Promise.resolve();
      await Promise.resolve();

      expect(button.disabled).toBe(false);
      expect(document.activeElement).toBe(button);
    });
  });

  describe('questions from the AI panel', () => {
    it('uses them as the queue instead of the "what comes under" form', () => {
      study.startWithQuestions([
        { question: 'Why does the counter-argument matter?', answer: 'It tests the claim.' },
        { question: 'Name one source.', answer: 'The 2019 review.' },
      ]);

      expect(find('.mm-study__panel').hidden).toBe(false);
      expect(question()).toBe('Why does the counter-argument matter?');
      activate(action('reveal'));
      expect(find('.mm-study__answerText').textContent).toBe('It tests the claim.');
    });

    it('offers a flashcard for a missed AI question with no node behind it', async () => {
      study.startWithQuestions([{ question: 'Why?', answer: 'Because.' }]);
      activate(action('reveal'));
      activate(action('missed'));
      activate(host.querySelector('.mm-study__missed button'));
      await Promise.resolve();
      await Promise.resolve();

      const card = saveFlashcard.mock.calls[0][0];
      expect(card.front).toBe('Why?');
      expect(card.sourceRef).toEqual({ mapId: 'm1', nodeId: null });
    });
  });

  describe('the keyboard', () => {
    it('moves focus to the action each step is waiting for', () => {
      selection.set('arg', { source: 'outline' });
      enter();
      expect(document.activeElement).toBe(action('reveal'));

      activate(action('reveal'));
      expect(document.activeElement).toBe(action('got'));

      activate(action('got'));
      expect(find('.mm-study__summary').getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(find('.mm-study__summary'));
    });

    it('selects the node being practised so the map follows along', () => {
      const seen = [];
      selection.subscribe((id, meta) => seen.push([id, meta.source]));
      enter();
      expect(seen[0]).toEqual(['m1-root', 'program']);
    });
  });
});

/**
 * Practice with several nodes selected.
 *
 * The practice is about one branch, and with four rings on screen nothing else says which of them it
 * took — so it says where it started.
 */
describe('study mode when the student had chosen several nodes', () => {
  let host;
  let history;
  let selection;
  let announce;
  let study;

  const enter = () => activate(host.querySelector('[data-command="study"]'));

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    study = mountStudyMode(host, {
      history,
      selection,
      announce,
      saveFlashcard: jest.fn().mockResolvedValue({ saved: true }),
    });
  });

  afterEach(() => {
    study?.destroy();
    host.remove();
  });

  it('says how many questions there are and which node they came from', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });

    enter();

    expect(announce).toHaveBeenCalledWith("Study mode: 1 question, from 'Argument'.");
  });

  it('names an unnamed node rather than quoting nothing', () => {
    history.apply('setText', { id: 'arg', text: '' });
    selection.selectAll(['arg', 'src'], { source: 'outline' });

    enter();

    expect(announce).toHaveBeenCalledWith("Study mode: 1 question, from '(untitled)'.");
  });

  it('says nothing about where it started when one node was selected', () => {
    selection.set('arg', { source: 'outline' });

    enter();

    expect(announce).toHaveBeenCalledWith('Study mode: 1 question.');
  });
});
