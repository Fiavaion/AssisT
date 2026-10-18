/**
 * The grammar colour key.
 *
 * Grammar colours give each part of speech a tint and an underline style, and neither means
 * anything until the page says which is which. While the option is on, a small labelled region
 * names each part of speech beside a sample painted exactly as the page's words are, and says the
 * underline style in words for a student who cannot tell the lines apart by sight.
 *
 * The key takes a slot on the bottom-right rail (src/utils/corner-slots.js), above the text
 * statistics badge and below the companion cards, so it never lands on another AssisT control.
 * It can be folded to a single button and the choice is remembered in chrome.storage.local
 * under its own key, not in assist_settings: a write there re-runs the whole page transform.
 * Folding, not closing, is the dismissal, so the key is always one press away.
 *
 * @module content/features/dyslexia-grammar-legend
 */

import { Z } from '../../utils/z-index.js';
import { CORNER, layoutRail, placeInRail, releaseFromRail } from '../../utils/corner-slots.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

const LEGEND_ID = 'assist-grammar-legend';
const STYLE_ID = `${LEGEND_ID}-styles`;
const LIST_ID = `${LEGEND_ID}-list`;
const TITLE_ID = `${LEGEND_ID}-title`;
const SLOT_ID = 'grammar-legend';

/** chrome.storage.local key holding whether the student folded the key away. */
export const GRAMMAR_LEGEND_COLLAPSED_KEY = 'dyslexiaGrammarLegendCollapsed';

/**
 * Width of the underline that carries a part of speech. Chrome paints a `double` border narrower
 * than 3px as one solid line, which made the verb's cue identical to the noun's.
 */
export const GRAMMAR_UNDERLINE_WIDTH = '3px';

/** At or below this width the key starts folded unless the student has said otherwise. */
const NARROW_VIEWPORT_PX = 480;

const ROWS = [
  ['noun', 'Noun'],
  ['verb', 'Verb'],
  ['adjective', 'Adjective'],
  ['adverb', 'Adverb'],
];

/**
 * The key's own surface, one per kind of page. The text colours are the body text colours the
 * grammar tints are graded against, so a sample label reads at 4.5:1 on its tint; every ratio is
 * asserted in tests/unit/dyslexia/grammar-legend.test.js.
 */
export const GRAMMAR_LEGEND_SURFACES = Object.freeze({
  light: Object.freeze({
    background: 'rgb(255, 255, 255)',
    text: 'rgb(32, 33, 34)',
    border: 'rgb(95, 99, 104)',
    focus: 'rgb(21, 87, 176)',
  }),
  dark: Object.freeze({
    background: 'rgb(24, 24, 27)',
    text: 'rgb(234, 236, 240)',
    border: 'rgb(150, 154, 160)',
    focus: 'rgb(125, 177, 255)',
  }),
});

/**
 * Paint one part-of-speech cue: the tint behind the word and the underline in the category's
 * accent and line style. Used for the page's words and for the key's samples, so the two can
 * never drift apart.
 *
 * @param {HTMLElement} element
 * @param {{tint: string, accent: string, line: string}} style
 */
export function paintGrammarCue(element, style) {
  element.style.backgroundColor = style.tint;
  element.style.borderBottom = `${GRAMMAR_UNDERLINE_WIDTH} ${style.line} ${style.accent}`;
  element.style.padding = '0 2px';
  element.style.borderRadius = '2px';
}

// No fixed heights and no !important, so a student's own text-spacing overrides grow the box
// instead of clipping the words (SC 1.4.12).
const LEGEND_CSS = `
#${LEGEND_ID} {
  box-sizing: border-box;
  max-width: min(18rem, calc(100% - 32px));
  margin: 0;
  padding: 4px 8px;
  background: var(--assist-grammar-legend-bg);
  color: var(--assist-grammar-legend-text);
  border: 1px solid var(--assist-grammar-legend-border);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
  text-align: start;
}
#${LEGEND_ID} .assist-grammar-legend__toggle {
  display: flex;
  align-items: center;
  gap: 0.5em;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0 4px;
  background: transparent;
  color: inherit;
  border: 0;
  font: inherit;
  cursor: pointer;
}
#${LEGEND_ID} .assist-grammar-legend__toggle:focus-visible {
  outline: 3px solid var(--assist-grammar-legend-focus);
  outline-offset: 2px;
}
#${LEGEND_ID} .assist-grammar-legend__list {
  list-style: none;
  margin: 0 0 4px;
  padding: 0 4px;
}
#${LEGEND_ID} .assist-grammar-legend__list[hidden] {
  display: none;
}
#${LEGEND_ID} .assist-grammar-legend__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5em;
  margin: 0.25em 0;
}
#${LEGEND_ID} .assist-grammar-legend__sample {
  color: var(--assist-grammar-legend-text);
  font-weight: inherit;
}
`;

let legend = null;
let toggleButton = null;
let listElement = null;
let collapsed = false;
let cleanups = [];
// Bumped by every mount and unmount, so a mount still waiting on storage when the student turns
// the option off never puts the key back afterwards.
let generation = 0;

async function readCollapsed() {
  try {
    const stored = await chrome.storage.local.get(GRAMMAR_LEGEND_COLLAPSED_KEY);
    return stored ? stored[GRAMMAR_LEGEND_COLLAPSED_KEY] : undefined;
  } catch {
    return undefined;
  }
}

async function storeCollapsed(value) {
  try {
    await chrome.storage.local.set({ [GRAMMAR_LEGEND_COLLAPSED_KEY]: value });
  } catch {
    // The fold still applies on this page; remembering it is a convenience.
  }
}

function applyCollapsedState() {
  toggleButton.setAttribute('aria-expanded', String(!collapsed));
  listElement.hidden = collapsed;
  toggleButton.querySelector('.assist-grammar-legend__chevron').textContent = collapsed ? '▸' : '▾';
  // The key changed size, so the rail and the cards stacked above it have to follow.
  layoutRail(CORNER.BOTTOM_RIGHT);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = LEGEND_CSS;
  (document.head || document.documentElement).appendChild(style);
}

function buildLegend(styles, variant) {
  const surface = GRAMMAR_LEGEND_SURFACES[variant] || GRAMMAR_LEGEND_SURFACES.light;

  const section = document.createElement('section');
  section.id = LEGEND_ID;
  section.className = 'assist-grammar-legend';
  section.setAttribute('aria-labelledby', TITLE_ID);
  section.dataset.surface = variant;
  section.style.zIndex = String(Z.CONTROLS);
  section.style.setProperty('--assist-grammar-legend-bg', surface.background);
  section.style.setProperty('--assist-grammar-legend-text', surface.text);
  section.style.setProperty('--assist-grammar-legend-border', surface.border);
  section.style.setProperty('--assist-grammar-legend-focus', surface.focus);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'assist-grammar-legend__toggle';
  button.setAttribute('aria-controls', LIST_ID);
  const chevron = document.createElement('span');
  chevron.className = 'assist-grammar-legend__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.id = TITLE_ID;
  title.textContent = 'Grammar colours key';
  button.append(chevron, title);

  const list = document.createElement('ul');
  list.id = LIST_ID;
  list.className = 'assist-grammar-legend__list';
  for (const [category, name] of ROWS) {
    const style = styles[category];
    const row = document.createElement('li');
    row.dataset.category = category;
    const sample = document.createElement('span');
    sample.className = 'assist-grammar-legend__sample';
    sample.textContent = name;
    paintGrammarCue(sample, style);
    const line = document.createElement('span');
    line.textContent = `${style.line} underline`;
    row.append(sample, line);
    list.appendChild(row);
  }

  section.append(button, list);
  return { section, button, list };
}

function removeLegend() {
  cleanups.forEach(cleanup => cleanup());
  cleanups = [];
  if (legend) {
    releaseFromRail(SLOT_ID);
    legend.remove();
  }
  document.getElementById(STYLE_ID)?.remove();
  legend = null;
  toggleButton = null;
  listElement = null;
}

/**
 * Put the key on the page, folded or open as the student last left it.
 *
 * @param {{styles: Readonly<Object<string, {tint: string, accent: string, line: string}>>,
 *   variant: 'light'|'dark'}} options - the grammar set the page's words were painted with, and
 *   which kind of page it is
 * @returns {Promise<void>}
 */
export async function mountGrammarLegend({ styles, variant }) {
  const ticket = ++generation;
  const remembered = await readCollapsed();
  if (ticket !== generation || !document.body) {
    return;
  }

  removeLegend();
  collapsed =
    typeof remembered === 'boolean'
      ? remembered
      : (window.innerWidth || 0) > 0 && window.innerWidth <= NARROW_VIEWPORT_PX;

  ensureStyles();
  const { section, button, list } = buildLegend(styles, variant);
  legend = section;
  toggleButton = button;
  listElement = list;
  document.body.appendChild(section);
  placeInRail(section, SLOT_ID);
  applyCollapsedState();

  cleanups.push(
    attachAccessibleHandler(button, 'Grammar colours key toggle', () => {
      collapsed = !collapsed;
      applyCollapsedState();
      storeCollapsed(collapsed);
    })
  );
}

/** Take the key off the page, including one still waiting to mount. */
export function unmountGrammarLegend() {
  generation++;
  removeLegend();
}
