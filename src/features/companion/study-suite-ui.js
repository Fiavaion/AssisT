/**
 * Study-suite discovery — a one-time tip that teaches the select-text study tools.
 *
 * The AI study suite (Summarize, Simplify, Socratic Tutor, Assignment Breakdown, Knowledge Graph,
 * Compare, Study Path) has always been reachable only from the text-selection menu, so students
 * who never highlight text never learn it exists. This shows a single dismissible card the first
 * time the student lands on an LMS page, then never again.
 *
 * It is deliberately small. The first version was a 360x420px panel listing all six tools, and
 * overnight release testing found it sitting over the right-hand end of the body text until the
 * student pressed "Got it" — a hint about reading that stopped them reading. It is now a compact
 * card (a quarter of the viewport height at most), closes on Escape as well as its buttons, and
 * never appears inside an iframe, where it would land inside someone's embedded content.
 *
 * @module features/companion/study-suite-ui
 */

import { isCompanionEnabled } from './companion-settings.js';
import { createCompanionCard, companionButton, isLmsHost } from './companion-ui.js';
import { isTopFrame } from '../../content/utils/frame.js';

const CARD_ID = 'assist-companion-study-tip';
const SEEN_KEY = 'companionStudyTipSeen';

/** Named in the hint so a student knows what to look for, short enough to stay one sentence. */
const TOOL_NAMES = 'Summarize, Simplify, Tutor, Tasks, Graph and Study path';

/** The live card's own close(), so cleanup() takes its Escape listener down with it. */
let closeCard = null;
/** False only while cleanup() is closing the card: a page teardown is not a dismissal. */
let dismissalCountsAsSeen = true;

export async function init() {
  if (!isTopFrame()) {
    return;
  }
  if (!(await isCompanionEnabled('studySuite')) || !isLmsHost()) {
    return;
  }
  if (document.getElementById(CARD_ID)) {
    return;
  }

  const stored = await chrome.storage.local.get(SEEN_KEY);
  if (stored[SEEN_KEY]) {
    return;
  }

  const { root, body, close } = createCompanionCard({
    id: CARD_ID,
    title: '✨ Did you know?',
    floating: true,
    compact: true,
    escapeCloses: true,
    // However it goes away - "Got it", the close button or Escape - it should not come back.
    onClose: () => {
      closeCard = null;
      if (dismissalCountsAsSeen) {
        chrome.storage.local.set({ [SEEN_KEY]: true });
      }
    },
  });
  closeCard = close;

  const intro = document.createElement('p');
  intro.style.margin = '0 0 6px';
  intro.textContent = `Select any text on this page for study tools: ${TOOL_NAMES}.`;
  body.appendChild(intro);

  body.appendChild(companionButton('👍 Got it', close));

  document.body.appendChild(root);
}

export function cleanup() {
  // close() rather than remove(): it also takes the Escape listener off the document. An SPA
  // navigation is not the student dismissing the tip, so it must not count as seen.
  dismissalCountsAsSeen = false;
  try {
    closeCard?.();
  } finally {
    dismissalCountsAsSeen = true;
  }
  closeCard = null;
  document.getElementById(CARD_ID)?.remove();
}
