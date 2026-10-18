/**
 * Flashcards companion UI — a small floating card offering due spaced-repetition review, plus a
 * one-click "make a card from what I just highlighted" affordance.
 *
 * Deterministic, no AI: scheduling comes from sr-scheduler.js (SM-2-lite), card content from
 * card-generator.js (fromHighlight). Gated on the companion feature toggle + Canvas host, so it
 * only ever appears where the rest of the C20 companion surfaces do.
 *
 * @module features/flashcards/flashcards-ui
 */

import { createCard, SOURCE_TYPES } from './card-model.js';
import { GRADES, review, dueCards, forecastCounts } from './sr-scheduler.js';
import { fromHighlight } from './card-generator.js';
import { loadCards, saveCard, updateCard } from './flashcards-store.js';
import {
  createCompanionCard,
  companionButton,
  companionStatusRegion,
  isLmsHost,
} from '../companion/companion-ui.js';
import { isCompanionEnabled } from '../companion/companion-settings.js';

const CARD_ID = 'assist-companion-flashcards';
const MIN_SELECTION_WORDS = 8;

let cardHandle = null;
let statusRegion = null;
let reviewQueue = [];

function teardownState() {
  cardHandle = null;
  statusRegion = null;
  reviewQueue = [];
}

/**
 * Gate + mount the floating "cards ready" card when there is at least one due card. Idempotent —
 * a second call while a card is already mounted is a no-op.
 * @returns {Promise<void>}
 */
export async function init() {
  if (cardHandle) {
    return;
  }

  const enabled = await isCompanionEnabled('flashcards');
  if (!enabled || !isLmsHost()) {
    return;
  }

  const cards = await loadCards();
  const now = Date.now();
  const due = dueCards(cards, now);
  if (due.length === 0) {
    return;
  }

  reviewQueue = due;
  renderSummary(cards, now);
}

function renderSummary(cards, now) {
  cardHandle = createCompanionCard({
    id: CARD_ID,
    title: '🃏 Cards ready',
    floating: true,
    onClose: teardownState,
  });

  const { body } = cardHandle;

  const count = reviewQueue.length;
  const summary = document.createElement('p');
  summary.textContent = `${count} card${count === 1 ? '' : 's'} ready to review`;
  body.appendChild(summary);

  const { tomorrow } = forecastCounts(cards, now);
  const forecast = document.createElement('p');
  forecast.textContent = `${tomorrow} more tomorrow`;
  body.appendChild(forecast);

  const footer = document.createElement('div');
  footer.appendChild(companionButton('▶ Review', startReview));
  footer.appendChild(
    companionButton('➕ Card from selection', handleCreateFromSelection, { secondary: true })
  );
  body.appendChild(footer);

  statusRegion = companionStatusRegion(body);

  document.body.appendChild(cardHandle.root);
}

function startReview() {
  advanceReview();
}

function advanceReview() {
  if (!cardHandle) {
    return;
  }
  if (reviewQueue.length === 0) {
    renderCompletion();
    return;
  }
  renderReviewFront(reviewQueue[0]);
}

function renderReviewFront(card) {
  const { body } = cardHandle;
  body.replaceChildren();

  const front = document.createElement('p');
  front.textContent = card.front;
  body.appendChild(front);

  const footer = document.createElement('div');
  footer.appendChild(companionButton('👁 Show answer', () => renderReviewBack(card)));
  body.appendChild(footer);
}

function renderReviewBack(card) {
  const { body } = cardHandle;
  body.replaceChildren();

  const front = document.createElement('p');
  front.textContent = card.front;
  body.appendChild(front);

  const back = document.createElement('p');
  back.textContent = card.back;
  body.appendChild(back);

  const footer = document.createElement('div');
  footer.appendChild(companionButton('Again', () => gradeCard(card, GRADES.AGAIN)));
  footer.appendChild(companionButton('Hard', () => gradeCard(card, GRADES.HARD)));
  footer.appendChild(companionButton('Good', () => gradeCard(card, GRADES.GOOD)));
  footer.appendChild(companionButton('Easy', () => gradeCard(card, GRADES.EASY)));
  body.appendChild(footer);
}

async function gradeCard(card, grade) {
  const now = Date.now();
  const updated = { ...card, srs: review(card.srs, grade, now) };
  await updateCard(updated);

  reviewQueue = reviewQueue.filter(c => c.id !== card.id);
  advanceReview();
}

function renderCompletion() {
  const { body } = cardHandle;
  body.replaceChildren();

  const message = document.createElement('p');
  message.textContent = "Nice work — that's every card for now.";
  body.appendChild(message);

  const footer = document.createElement('div');
  footer.appendChild(companionButton('Close', () => cardHandle?.close()));
  body.appendChild(footer);
}

/** The words the student has selected on the page, or '' where there is no selection. */
function readPageSelection() {
  const selection =
    typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
  return selection ? String(selection.toString()) : '';
}

/**
 * Build a highlight-sourced flashcard from a text selection and save it. Requires at least 8
 * selected words (mirrors card-generator's own cloze-viability floor).
 *
 * The highlight menu passes its own copy of the selected text: it hides itself before the action
 * runs, and hiding clears the page selection, so by the time the card is built `getSelection()`
 * has nothing left in it. With no argument the live selection is read, which is what the floating
 * review card does.
 *
 * `reason` is shown to the student verbatim, by the floating card's status line and by the
 * highlight menu's toast, so it is a sentence rather than a developer's note.
 *
 * @param {string} [selectedText] - the words to make a card from; omit to read the page selection
 * @returns {Promise<{created:boolean, reason?:string}>}
 */
export async function createCardFromSelection(selectedText) {
  const text = typeof selectedText === 'string' ? selectedText : readPageSelection();
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  if (wordCount < MIN_SELECTION_WORDS) {
    return {
      created: false,
      reason: `Select at least ${MIN_SELECTION_WORDS} words, then try again.`,
    };
  }

  const draft = fromHighlight({ text, pageTitle: document.title });
  if (!draft) {
    return { created: false, reason: 'Could not make a card from those words.' };
  }

  const card = createCard(
    {
      front: draft.front,
      back: draft.back,
      sourceType: SOURCE_TYPES.HIGHLIGHT,
      sourceRef: draft.pageTitle || null,
    },
    Date.now()
  );

  const result = await saveCard(card);
  if (!result.saved) {
    return { created: false, reason: result.reason };
  }
  return { created: true };
}

async function handleCreateFromSelection() {
  const result = await createCardFromSelection();
  if (!statusRegion) {
    return;
  }
  statusRegion.textContent = result.created
    ? "Card made — it'll come up for review"
    : result.reason || "Couldn't make a card from that selection";
}

/**
 * Remove the floating flashcards card and reset module state.
 */
export function cleanup() {
  cardHandle?.close();
  teardownState();
}
