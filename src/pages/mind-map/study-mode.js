/**
 * Study mode: recall practice over a map, with no AI in it anywhere.
 *
 * ADR 0001 puts the deterministic path first, and this is the clearest case of it. A node with
 * children already is a recall question — "what comes under this?" — so the queue is read out of
 * the tree rather than generated, and it works identically with every provider switched off.
 *
 * The student grades themselves. Nothing compares what they typed against the answer, because a
 * comparison would mark a correct paraphrase wrong and a lucky keyword right, and because the box
 * is optional: thinking the answer is a legitimate way to use this. What they type is never stored.
 *
 * When the AI panel has produced recall questions it hands them here through
 * `startWithQuestions`, and they become the queue for that session. They are stored nowhere either:
 * only a flashcard the student explicitly makes outlives the session.
 *
 * @module pages/mind-map/study-mode
 */

import { SOURCE_TYPES, createCard } from '../../features/flashcards/card-model.js';
import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { inThisBranchSuffix } from './focus-sentences.js';
import { nameOf } from './node-edits.js';

import './study-mode.css';

/** Ids must be unique in the page, and the editor could hold more than one of these. */
let studySerial = 0;

/** A node with no text is still a node the student put there, and still has to be nameable. */
const labelFor = node => (node.text.trim() !== '' ? node.text.trim() : 'this node');

/**
 * The recall questions a branch produces: every node with children, in outline order.
 *
 * @param {Object} map - a validated map, so every id it names is a node it holds.
 * @param {string} fromId - the node to walk from; the caller has checked it is on the map.
 * @returns {Array<{nodeId: string, question: string, answer: string}>}
 */
function studyQueue(map, fromId) {
  const items = [];
  const visit = id => {
    const node = nodeAt(map, id);
    if (node.children.length > 0) {
      items.push({
        nodeId: id,
        question: `What comes under "${labelFor(node)}"?`,
        answer: node.children.map(childId => labelFor(nodeAt(map, childId))).join(', '),
      });
    }
    for (const childId of node.children) {
      visit(childId);
    }
  };
  visit(fromId);
  return items;
}

/**
 * Mount study mode into the right dock's Study tab.
 *
 * It used to be a popover hanging off a toolbar button, which could sit over the AI panel and the
 * canvas zoom cluster at the same time. It is now the contents of a dock tab: an invitation to
 * start while it is idle, the practice itself while a session is running. The dock owns which tab
 * is showing and the page owns Escape, so nothing here traps a student.
 *
 * @param {HTMLElement} host - appended to, not emptied.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} [options.announce]
 * @param {(card: Object) => Promise<{saved: boolean, reason?: string}>} [options.saveFlashcard] -
 *   the flashcard store's `saveCard`; injected so this module stays free of chrome APIs. Omit it
 *   and the flashcard offer simply does not appear.
 * @returns {{
 *   startWithQuestions: (questions: Array<{question: string, answer: string}>) => void,
 *   isActive: () => boolean,
 *   focusFirst: () => void,
 *   destroy: () => void
 * }}
 */
export function mountStudyMode(host, options = {}) {
  const { history, selection, announce = () => {}, saveFlashcard = null } = options;

  studySerial += 1;
  const uid = `mm-study${studySerial}`;
  const cleanups = [];
  const stepCleanups = [];

  const root = document.createElement('div');
  root.className = 'mm-study';

  const intro = document.createElement('div');
  intro.className = 'mm-study__intro';
  const hint = document.createElement('p');
  hint.className = 'mm-study__hint';
  hint.textContent =
    'Practise recall from the selected branch. Every node with children becomes a question, and ' +
    'you grade yourself.';

  const enter = document.createElement('button');
  enter.type = 'button';
  enter.className = 'mm-study__enter';
  enter.dataset.command = 'study';
  enter.textContent = 'Start practice';
  intro.append(hint, enter);

  const panel = document.createElement('section');
  panel.className = 'mm-study__panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Study practice');
  panel.hidden = true;

  const progress = document.createElement('p');
  progress.className = 'mm-study__progress';

  const body = document.createElement('div');
  body.className = 'mm-study__body';

  const leave = document.createElement('button');
  leave.type = 'button';
  leave.className = 'mm-study__leave';
  leave.dataset.command = 'leave';
  leave.textContent = 'Leave study mode';

  panel.append(progress, body, leave);
  root.append(intro, panel);
  host.appendChild(root);

  /** The queue for this session, and how it has been graded so far. */
  let queue = [];
  let at = 0;
  let grades = [];

  function clearStep() {
    for (const cleanup of stepCleanups.splice(0)) {
      cleanup();
    }
    body.replaceChildren();
  }

  function exit(returnFocus) {
    if (panel.hidden) {
      return;
    }
    clearStep();
    panel.hidden = true;
    intro.hidden = false;
    queue = [];
    at = 0;
    grades = [];
    progress.textContent = '';
    if (returnFocus) {
      enter.focus();
    }
  }

  /** Make a flashcard out of one missed item, once. */
  function offerCard(item, button) {
    // A disabled button cannot hold focus, and this one is disabled by the very press that puts
    // focus on it, which would drop a keyboard student out of the summary and on to `<body>`. The
    // summary takes focus instead: it is where the rest of the missed items are, and it is where
    // the announcement about this card is heard.
    const fromButton = document.activeElement === button;
    const summary = button.closest('.mm-study__summary');
    button.disabled = true;
    if (fromButton && summary) {
      summary.focus();
    }
    const card = createCard(
      {
        front: item.question,
        back: item.answer,
        sourceType: SOURCE_TYPES.MINDMAP,
        sourceRef: { mapId: history.current().id, nodeId: item.nodeId },
        tags: ['mind map'],
      },
      Date.now()
    );
    /** The offer is live again, so the student who made it gets it back to try once more. */
    const restore = message => {
      button.disabled = false;
      if (fromButton) {
        button.focus();
      }
      announce(message);
    };

    Promise.resolve(saveFlashcard(card))
      .then(result => {
        if (result && result.saved === false) {
          restore(`That flashcard was not saved: ${result.reason || 'the deck would not take it'}`);
          return;
        }
        button.textContent = 'Flashcard made';
        announce(`Flashcard made: ${item.question}`);
      })
      .catch(error => restore(`That flashcard was not saved: ${error.message}`));
  }

  function showSummary() {
    clearStep();
    const recalled = grades.filter(grade => grade.got).length;
    progress.textContent = `Finished: ${queue.length} question${queue.length === 1 ? '' : 's'}`;

    const summary = document.createElement('div');
    summary.className = 'mm-study__summary';
    summary.tabIndex = -1;

    const score = document.createElement('p');
    score.className = 'mm-study__score';
    score.textContent = `${recalled} of ${queue.length} recalled`;
    summary.appendChild(score);

    const missed = grades.filter(grade => !grade.got);
    if (missed.length > 0) {
      const heading = document.createElement('h3');
      heading.className = 'mm-study__heading';
      heading.textContent = 'What to come back to';
      const list = document.createElement('ul');
      list.className = 'mm-study__missedList';

      for (const grade of missed) {
        const item = document.createElement('li');
        item.className = 'mm-study__missed';
        const text = document.createElement('span');
        text.textContent = grade.item.question;
        item.appendChild(text);

        if (typeof saveFlashcard === 'function') {
          const make = document.createElement('button');
          make.type = 'button';
          make.dataset.command = 'make-card';
          make.textContent = 'Make a flashcard';
          make.setAttribute('aria-label', `Make a flashcard for ${grade.item.question}`);
          item.appendChild(make);
          stepCleanups.push(
            attachAccessibleHandler(make, 'Mind map study flashcard', () =>
              offerCard(grade.item, make)
            )
          );
        }
        list.appendChild(item);
      }
      summary.append(heading, list);
    }

    body.appendChild(summary);
    announce(`${recalled} of ${queue.length} recalled.`);
    summary.focus();
  }

  function showStep() {
    if (at >= queue.length) {
      showSummary();
      return;
    }
    clearStep();
    const item = queue[at];
    progress.textContent = `Question ${at + 1} of ${queue.length}`;

    // The map follows the practice: the outline moves its focus ring and the canvas pans, so the
    // student can see where in their own plan they are being asked about.
    if (hasNode(history.current(), item.nodeId)) {
      selection.set(item.nodeId, { source: 'program' });
    }

    const heading = document.createElement('h3');
    heading.className = 'mm-study__question';
    heading.textContent = item.question;

    const label = document.createElement('label');
    label.className = 'mm-study__answerLabel';
    label.htmlFor = `${uid}-answer`;
    label.textContent = 'Your answer (optional)';
    const answer = document.createElement('textarea');
    answer.className = 'mm-study__answer';
    answer.id = label.htmlFor;
    answer.rows = 2;

    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.dataset.command = 'reveal';
    reveal.textContent = 'Reveal';

    const score = document.createElement('p');
    score.className = 'mm-study__score';
    const recalled = grades.filter(grade => grade.got).length;
    score.textContent =
      grades.length === 0 ? 'Nothing graded yet' : `${recalled} of ${grades.length} so far`;

    body.append(heading, label, answer, reveal, score);

    stepCleanups.push(
      attachAccessibleHandler(reveal, 'Mind map study reveal', () => {
        reveal.remove();
        const answerText = document.createElement('p');
        answerText.className = 'mm-study__answerText';
        answerText.textContent = item.answer;

        const got = document.createElement('button');
        got.type = 'button';
        got.dataset.command = 'got';
        got.textContent = 'Got it';
        const missedIt = document.createElement('button');
        missedIt.type = 'button';
        missedIt.dataset.command = 'missed';
        missedIt.textContent = 'Missed it';

        score.before(answerText, got, missedIt);
        announce(item.answer);

        const grade = wasRecalled => {
          grades.push({ item, got: wasRecalled });
          at += 1;
          showStep();
        };
        stepCleanups.push(
          attachAccessibleHandler(got, 'Mind map study got it', () => grade(true)),
          attachAccessibleHandler(missedIt, 'Mind map study missed it', () => grade(false))
        );
        got.focus();
      })
    );

    reveal.focus();
  }

  /**
   * @param {Array<Object>} items - the questions to practise.
   * @param {{from?: string|null}} [options] - `from` names the node the practice starts at, said only
   *   when the student had more than one node selected and so could not know which it would be.
   */
  function begin(items, { from = null } = {}) {
    if (items.length === 0) {
      announce('There is nothing to practise here: no node under this one has children.');
      return;
    }
    queue = items;
    at = 0;
    grades = [];
    panel.hidden = false;
    // The invitation goes while the practice is on, so the tab holds one thing at a time and there
    // is no second Start button under the question a student is answering.
    intro.hidden = true;
    announce(
      `Study mode: ${items.length} question${items.length === 1 ? '' : 's'}` +
        `${from ? `, from '${from}'` : ''}${inThisBranchSuffix(history.current())}.`
    );
    showStep();
  }

  cleanups.push(
    attachAccessibleHandler(enter, 'Mind map study mode', () => {
      const map = history.current();
      // `hasNode`: the selection can hold an id that came from a file or another module, and
      // `nodes.constructor` would answer as a node and be practised as one.
      const chosen = selection.get();
      const from = hasNode(map, chosen) ? chosen : map.rootId;
      // Where it starts, when there was more than one node to start from: the practice is about one
      // branch, and four marked rows on screen do not say which.
      begin(studyQueue(map, from), {
        from: selection.ids().length > 1 ? nameOf(map.nodes[from].text) : null,
      });
    }),
    attachAccessibleHandler(leave, 'Mind map leave study mode', () => exit(true))
  );

  return {
    /**
     * Practise a list of questions instead of the ones the tree produces.
     *
     * @param {Array<{question: string, answer: string}>} questions
     */
    startWithQuestions(questions) {
      const items = (Array.isArray(questions) ? questions : [])
        .filter(entry => entry && entry.question && entry.answer)
        .map(entry => ({ nodeId: null, question: entry.question, answer: entry.answer }));
      if (items.length === 0) {
        announce('There were no questions to practise.');
        return;
      }
      exit(false);
      begin(items);
    },

    /**
     * @returns {boolean} true while a practice session is running — whether or not the Study tab
     *   is the one showing. The page's own keys read this: Alt+R must not start a voice over a
     *   question the student is part way through answering.
     */
    isActive() {
      return !panel.hidden;
    },

    /** Put the keyboard on whatever this tab is waiting for: Start, or the current step. */
    focusFirst() {
      const first = panel.hidden
        ? enter
        : panel.querySelector('button:not([disabled]), textarea, input:not([disabled])');
      (first || enter).focus();
    },

    destroy() {
      clearStep();
      for (const cleanup of cleanups) {
        cleanup();
      }
      root.remove();
    },
  };
}
