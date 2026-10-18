/**
 * Citation Card Component
 *
 * A presentational leaf component rendering one citation as an <li> in the library view.
 * Owned by the library-view; the card knows nothing about storage or the store.
 *
 * Public API:
 *   createCitationCard(citation, options) -> { id, el, update(citation, options),
 *                                               setSelected(bool), destroy() }
 *
 * Design principles:
 *   - All user-derived strings via textContent, with ONE exception: the formatted reference,
 *     which carries the style's italics and goes through the shared renderReference in
 *     reference-html.js (<em>/<i> only, no attributes). Nothing else ever touches innerHTML.
 *   - Every reassurance state pairs colour with an icon + word — never colour alone (SC 1.4.1).
 *   - Buttons wired via attachAccessibleHandler (mousedown plus Enter/Space; stopPropagation
 *     prevents races with document-level listeners). The
 *     selection checkbox and the collection picker bind their native 'change' event instead.
 *   - destroy() runs all cleanup functions and removes el from the DOM.
 *   - update() patches in place — never rebuilds el or sets innerHTML on the whole card.
 */

import { normalizeCitation, TYPE_LABELS } from '../citation-types.js';
import { assessCitation, FIELDS, LEVELS } from '../reassurance-engine.js';
import { parseAuthor, formatLocator, markOrganisations } from '../citation-styles/shared.js';
import { getYear } from '../citation-styles/shared.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';
import { renderReference } from './reference-html.js';
import { referenceSetFor } from '../citation-styles/index.js';
import { createClaimSentinelBadge } from './claim-sentinel-badge.js';

// ── Sentinel helpers ──────────────────────────────────────────────────────────

/**
 * Map a sentinel verifier status to the badge's state vocabulary.
 * @param {string} status - 'verified' | 'flagged' | 'unverifiable'
 * @returns {string} badge state
 */
function sentinelStatusToBadgeState(status) {
  if (status === 'verified') {
    return 'supported';
  }
  if (status === 'flagged') {
    return 'unsupported';
  }
  return 'unchecked';
}

// ── Chip configuration ────────────────────────────────────────────────────────

/** Icon + word pair for each reassurance level. Never colour alone (SC 1.4.1). */
const CHIP_CONFIG = Object.freeze({
  green: { icon: '✓', word: 'Looks right' },
  amber: { icon: '!', word: 'Check this' },
  red: { icon: '✕', word: 'Needs fixing' },
});

/**
 * Maps the AI analyser's credibility signal to a card chip (colour + icon + word).
 * The words are plain-language and non-judgemental — this is a teaching affordance, not a verdict.
 */
const SIGNAL_CONFIG = Object.freeze({
  high: { level: 'green', icon: '✓', word: 'Strong source' },
  medium: { level: 'amber', icon: '!', word: 'Use with care' },
  low: { level: 'red', icon: '✕', word: 'Weak source' },
  unknown: { level: 'amber', icon: '?', word: 'Unclear' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A signature of the fields the AI analyser actually reads. Used to decide whether a prior analysis
 * is still valid after update(): the list re-runs update() on every store emit (filter/add/style),
 * so we must NOT discard a result unless the underlying metadata genuinely changed.
 * @param {Object} c - normalised citation
 * @returns {string}
 */
function analysisSignature(c) {
  return JSON.stringify([
    c.title || '',
    (c.authors || []).join('|'),
    c.type || '',
    c.siteName || c.publisher || '',
    c.publicationDate || '',
    c.doi || '',
    c.url || '',
  ]);
}

/**
 * Build the meta line tokens from a normalised citation.
 * Tokens that are empty are omitted; remaining are joined with ' · '.
 * @param {Object} c - normalised citation
 * @returns {string}
 */
function buildMeta(c) {
  // An organisation author reads whole ("World Health Organization"), as the styles print it.
  const firstAuthor = c.authors && c.authors.length > 0 ? markOrganisations(c).authors[0] : '';
  const family = firstAuthor ? parseAuthor(firstAuthor).family : '';
  const year = getYear(c, 'no date');
  const typeLabel = TYPE_LABELS[c.type] || '';
  const siteName = c.siteName || '';
  return [family, year, typeLabel, siteName].filter(Boolean).join(' · ');
}

/**
 * Apply the correct chip class and update icon + word in place.
 * @param {HTMLElement} chip - the <span class="assist-cite-chip …"> element
 * @param {string} level - 'green' | 'amber' | 'red'
 */
function applyChip(chip, level) {
  const cfg = CHIP_CONFIG[level] || CHIP_CONFIG.amber;

  // Swap the level modifier class.
  for (const lvl of ['green', 'amber', 'red']) {
    chip.classList.remove(`assist-cite-chip--${lvl}`);
  }
  chip.classList.add(`assist-cite-chip--${level}`);

  // The icon span is always first; the word text node is always second.
  const iconEl = chip.querySelector('.assist-cite-chip__icon');
  const wordEl = chip.querySelector('.assist-cite-chip__word');
  if (iconEl) {
    iconEl.textContent = cfg.icon;
  }
  if (wordEl) {
    wordEl.textContent = cfg.word;
  }
}

/**
 * Create and wire a single action button. Returns { el, cleanup }.
 * @param {string} label - visible label and debug label
 * @param {string[]} extraClasses - additional CSS classes
 * @param {Function} cb - callback receiving the citation object
 * @param {Object} citationRef - mutable reference bag { current: citation }
 * @returns {{ el: HTMLButtonElement, cleanup: Function }}
 */
function makeButton(label, extraClasses, cb, citationRef) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('assist-cite-btn', ...extraClasses);
  btn.textContent = label;
  // Accessible handler = mousedown (race-safe) PLUS Enter/Space keyboard activation (SC 2.1.1).
  const cleanup = attachAccessibleHandler(btn, label, () => cb(citationRef.current));
  return { el: btn, cleanup };
}

/** Per-card sequence, so each collection picker can carry its own id for its <label for>. */
let cardSeq = 0;

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a citation card component.
 *
 * @param {Object} citation - raw or normalised citation
 * @param {Object} [options]
 * @param {string} [options.style='harvard'] - formatting style id
 * @param {Object[]} [options.referencePool] - every citation the view holds; the card formats its
 *                                      reference within its own collection of these, so the year
 *                                      letter matches the reference list the student will copy
 * @param {Function} [options.onInsert] - called with citation when Insert is clicked
 * @param {Function} [options.onEdit]   - called with citation when Edit is clicked
 * @param {Function} [options.onRemove] - called with citation when Remove is clicked
 * @param {Function} [options.onRestore] - trash only: called with citation when Restore is clicked
 * @param {Function} [options.onPurge] - trash only: called with citation when Delete permanently is
 *                                      clicked
 * @param {Array} [options.projects] - the student's collections, used to populate the filing picker
 * @param {Function} [options.onToggleSelect] - called with (citation, checked) when the student
 *                                      ticks this card for a bulk action. The checkbox is only drawn
 *                                      when this is provided, so the trash view has none.
 * @param {Function} [options.onAssignProject] - called with (citation, projectId) when the student
 *                                      files this citation from the card. The picker is only drawn
 *                                      when this is provided; an empty projectId means "unfile".
 * @param {Object} [options.sentinel] - CrossRef verification orchestrator (badge shown only when set)
 * @param {Object} [options.analyser] - AI analyser { analyse(citation) -> Promise<result> }; injected
 *                                      ONLY when AI is available. When absent, no "Analyse with AI"
 *                                      affordance is created (no-stub guarantee — deterministic card
 *                                      works fully with AI off).
 * @returns {{ id: string, el: HTMLLIElement, update: Function, setSelected: Function,
 *             destroy: Function }}
 */
export function createCitationCard(citation, options = {}) {
  let opts = { style: 'harvard', ...options };

  // Normalise once at creation; a malformed record must never crash render.
  let c = normalizeCitation(citation) || {};

  // Mutable ref so button handlers always close over the CURRENT citation.
  const citationRef = { current: c };

  // ── Build the skeleton ──────────────────────────────────────────────────────

  const el = document.createElement('li');
  el.className = 'assist-cite-card';

  // Head section: title
  const head = document.createElement('div');
  head.className = 'assist-cite-card__head';

  // Selection checkbox — drawn only when the view wants multi-select (the trash does not). A
  // checkbox is a form control, so it is bound with the native 'change' event: the mousedown-first
  // interactive handler calls preventDefault(), which would cancel the tick.
  const selectBox = document.createElement('input');
  selectBox.type = 'checkbox';
  selectBox.className = 'assist-cite-card__select';
  const selectChangeHandler = () => {
    if (typeof opts.onToggleSelect === 'function') {
      opts.onToggleSelect(citationRef.current, selectBox.checked);
    }
  };
  selectBox.addEventListener('change', selectChangeHandler);

  const titleEl = document.createElement('h3');
  titleEl.className = 'assist-cite-card__title';
  titleEl.textContent = c.title || '';
  head.appendChild(titleEl);

  el.appendChild(head);

  /**
   * Mount, name, or remove the selection checkbox for the current citation + options. Each box
   * carries its own citation's title so a screen-reader user moving down the list can tell one
   * from the next; an untitled record still gets a usable name rather than a bare "Select".
   */
  function syncSelect() {
    if (typeof opts.onToggleSelect !== 'function') {
      if (selectBox.parentNode) {
        selectBox.checked = false;
        selectBox.remove();
      }
      return;
    }
    if (!selectBox.parentNode) {
      head.insertBefore(selectBox, titleEl);
    }
    selectBox.setAttribute('aria-label', c.title ? `Select ${c.title}` : 'Select this citation');
  }

  syncSelect();

  /**
   * Tick or untick this card from the outside (the view owns the selection). Never fires
   * onToggleSelect — setting `checked` in script does not dispatch a change event.
   * @param {boolean} selected
   */
  function setSelected(selected) {
    selectBox.checked = !!selected;
  }

  // Meta line
  const metaEl = document.createElement('p');
  metaEl.className = 'assist-cite-card__meta';
  metaEl.textContent = buildMeta(c);
  el.appendChild(metaEl);

  // Formatted reference, as it reads in the card's own reference list (its collection).
  const refEl = document.createElement('p');
  refEl.className = 'assist-cite-card__reference';
  const paintReference = () =>
    renderReference(refEl, c, opts.style, referenceSetFor(c, opts.referencePool));
  paintReference();
  el.appendChild(refEl);

  // ── Reading capture: the source's words + the student's own note ────────────
  // The quote stays visibly flagged as "not your words" from capture to insertion (attribution
  // firewall); the note answers "why did I save this?" — the working-memory prosthetic. Both are
  // hidden (not removed) when empty so update() can toggle them cheaply.
  const quoteWrap = document.createElement('figure');
  quoteWrap.className = 'assist-cite-card__quotewrap';

  const quoteLabel = document.createElement('figcaption');
  quoteLabel.className = 'assist-cite-card__quotelabel';
  quoteWrap.appendChild(quoteLabel);

  const quoteEl = document.createElement('blockquote');
  quoteEl.className = 'assist-cite-card__quote';
  quoteWrap.appendChild(quoteEl);
  el.appendChild(quoteWrap);

  const noteEl = document.createElement('p');
  noteEl.className = 'assist-cite-card__note';
  el.appendChild(noteEl);

  /** Sync the quote figure + note line from the current citation. */
  function syncReadingCapture() {
    const quote = String(c.quote || '').trim();
    const locator = String(c.locator || '').trim();
    if (quote) {
      quoteLabel.textContent = locator
        ? `The source’s words (${formatLocator(locator, { pageLabels: true })}) — not yours:`
        : 'The source’s words — not yours:';
      quoteEl.textContent = quote;
      quoteWrap.hidden = false;
    } else {
      quoteWrap.hidden = true;
      quoteEl.textContent = '';
    }
    const note = String(c.notes || '').trim();
    if (note) {
      noteEl.textContent = `Your note: ${note}`;
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
      noteEl.textContent = '';
    }
  }
  syncReadingCapture();

  // Badges row — reassurance chip + optional AI Claim Sentinel badge
  const badgesEl = document.createElement('div');
  badgesEl.className = 'assist-cite-card__badges';

  const assessment = assessCitation(c, { style: opts.style });
  const chipCfg = CHIP_CONFIG[assessment.level] || CHIP_CONFIG.amber;

  const chip = document.createElement('span');
  chip.className = `assist-cite-chip assist-cite-chip--${assessment.level}`;

  const iconEl = document.createElement('span');
  iconEl.className = 'assist-cite-chip__icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = chipCfg.icon;
  chip.appendChild(iconEl);

  const wordEl = document.createElement('span');
  wordEl.className = 'assist-cite-chip__word';
  wordEl.textContent = chipCfg.word;
  chip.appendChild(wordEl);

  badgesEl.appendChild(chip);

  // The "check capitals" hint, in words: the chip alone says only "Check this". Advice, never a
  // block — nothing on the card waits on it.
  const hintEl = document.createElement('p');
  hintEl.className = 'assist-cite-card__note assist-cite-card__hint';

  /** Show the style's capitals hint when the verdict carries one; hide the line otherwise. */
  function syncHint(verdict) {
    const hint = verdict.reasons.find(r => r.field === FIELDS.TITLE && r.level === LEVELS.AMBER);
    hintEl.textContent = hint ? hint.message : '';
    hintEl.hidden = !hint;
  }
  syncHint(assessment);

  // Sentinel badge — CrossRef verification only applies to citations WITH a DOI, so the badge is
  // shown for those only. createClaimSentinelBadge returns el:null when AI is off (no-stub). For a
  // DOI-less source (most web pages) the badge is never mounted, sparing the card a noisy
  // "Not checked". syncSentinel() mounts/verifies or removes it as the citation's DOI changes.
  const sentinelBadge = createClaimSentinelBadge({ available: !!opts.sentinel });

  el.appendChild(badgesEl);
  el.appendChild(hintEl);

  /**
   * Kick off async sentinel verification for the current citation `c`.
   * Sets the badge to 'checking' immediately, then resolves to the correct state.
   * No-op when no sentinel is configured or the citation has no DOI.
   */
  function triggerSentinel() {
    if (!opts.sentinel || !sentinelBadge.el || !c.doi) {
      return;
    }
    sentinelBadge.setState('checking');
    opts.sentinel
      .verify(c)
      .then(result => sentinelBadge.setState(sentinelStatusToBadgeState(result.status)))
      .catch(() => sentinelBadge.setState('unchecked'));
  }

  /** Mount + verify the sentinel badge for a DOI-bearing citation; remove it otherwise. */
  function syncSentinel() {
    if (!sentinelBadge.el) {
      return;
    }
    if (opts.sentinel && c.doi) {
      if (!sentinelBadge.el.parentNode) {
        badgesEl.appendChild(sentinelBadge.el);
      }
      triggerSentinel();
    } else if (sentinelBadge.el.parentNode) {
      sentinelBadge.el.remove();
    }
  }

  syncSentinel();

  // ── AI analysis panel (optional; only when an analyser is injected — i.e. AI available) ──
  // A live region so a screen reader announces the assessment when it lands. Stays empty + hidden
  // until the student asks for it. All model text reaches the DOM via textContent only — the model
  // output is untrusted, so it is NEVER set as innerHTML.
  let analyseBtn = null;
  let analyseCleanup = null;
  // Signature of the citation the displayed analysis belongs to; null when no result is shown.
  let analysedSig = null;
  const analysisPanel = document.createElement('div');
  analysisPanel.className = 'assist-cite-card__analysis';
  analysisPanel.setAttribute('role', 'status');
  analysisPanel.setAttribute('aria-live', 'polite');
  analysisPanel.hidden = true;
  if (opts.analyser) {
    el.appendChild(analysisPanel);
  }

  /** Empty the panel and hide it (fresh state, and whenever the citation changes under it). */
  function clearAnalysis() {
    analysisPanel.replaceChildren();
    analysisPanel.hidden = true;
    analysisPanel.removeAttribute('aria-busy');
    analysedSig = null;
  }

  /** Show the in-progress state while the model runs. */
  function showAnalysisLoading() {
    analysisPanel.replaceChildren();
    const p = document.createElement('p');
    p.className = 'assist-cite-card__analysis-summary';
    p.textContent = 'Looking at this source with AI…';
    analysisPanel.appendChild(p);
    analysisPanel.hidden = false;
    analysisPanel.setAttribute('aria-busy', 'true');
  }

  /** Render a friendly, non-blocking error — the deterministic card is unaffected. */
  function renderAnalysisError() {
    analysisPanel.replaceChildren();
    const p = document.createElement('p');
    p.className = 'assist-cite-card__analysis-summary';
    p.textContent = 'Sorry — could not analyse this source right now. Please try again.';
    analysisPanel.appendChild(p);
    analysisPanel.hidden = false;
    analysisPanel.removeAttribute('aria-busy');
  }

  /**
   * Render the analyser result: a signal chip (colour + icon + word) over a plain-language summary
   * and the considerations as a list, so the student sees WHY — the teaching goal of the feature.
   * @param {{available:boolean, reason?:string, signal?:string, summary?:string, considerations?:string[]}} result
   */
  function renderAnalysis(result) {
    analysisPanel.replaceChildren();
    analysisPanel.removeAttribute('aria-busy');
    analysisPanel.hidden = false;

    if (!result || result.available === false) {
      const p = document.createElement('p');
      p.className = 'assist-cite-card__analysis-summary';
      p.textContent =
        result && result.reason
          ? `AI analysis isn’t available: ${result.reason}`
          : 'AI analysis isn’t available right now.';
      analysisPanel.appendChild(p);
      return;
    }

    const cfg = SIGNAL_CONFIG[result.signal] || SIGNAL_CONFIG.unknown;

    const chip = document.createElement('span');
    chip.className = `assist-cite-chip assist-cite-chip--${cfg.level}`;
    const cIcon = document.createElement('span');
    cIcon.className = 'assist-cite-chip__icon';
    cIcon.setAttribute('aria-hidden', 'true');
    cIcon.textContent = cfg.icon;
    const cWord = document.createElement('span');
    cWord.className = 'assist-cite-chip__word';
    cWord.textContent = cfg.word;
    chip.appendChild(cIcon);
    chip.appendChild(cWord);
    analysisPanel.appendChild(chip);

    if (result.summary) {
      const p = document.createElement('p');
      p.className = 'assist-cite-card__analysis-summary';
      p.textContent = result.summary;
      analysisPanel.appendChild(p);
    }

    if (Array.isArray(result.considerations) && result.considerations.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'assist-cite-card__analysis-list';
      for (const point of result.considerations) {
        const li = document.createElement('li');
        li.textContent = String(point);
        ul.appendChild(li);
      }
      analysisPanel.appendChild(ul);
    }

    // Bind this result to the current metadata so a re-render (filter/style change) keeps it,
    // while a genuine metadata edit discards it (see update()).
    analysedSig = analysisSignature(c);
  }

  /**
   * Run the on-demand AI analysis for the CURRENT citation. Disables the button while in flight,
   * relabels it for re-runs, and degrades gracefully on error. No-op when no analyser is injected.
   */
  async function runAnalysis() {
    if (!opts.analyser || !analyseBtn) {
      return;
    }
    analyseBtn.disabled = true;
    analyseBtn.textContent = 'Analysing…';
    showAnalysisLoading();
    try {
      const result = await opts.analyser.analyse(c);
      renderAnalysis(result);
    } catch {
      renderAnalysisError();
    } finally {
      analyseBtn.disabled = false;
      analyseBtn.textContent = 'Re-analyse with AI';
    }
  }

  // ── Filing: which collection this source belongs to ─────────────────────────
  // Filing after the fact matters as much as filing at capture: a source is usually saved while
  // reading, before the student knows which essay it is for. This is a one-step change on the card
  // itself, so nobody has to reopen the six-step wizard to move something.
  // A <select> is a form control, so it is wired with the native 'change' event, never the
  // mousedown-first interactive handler (which would swallow the pick).
  const collectionWrap = document.createElement('div');
  collectionWrap.className = 'assist-cite-card__collection';

  const collectionId = `assist-cite-collection-${++cardSeq}`;

  const collectionLabel = document.createElement('label');
  collectionLabel.className = 'assist-cite-card__collection-label';
  collectionLabel.setAttribute('for', collectionId);
  collectionLabel.textContent = 'Collection';

  const collectionSelect = document.createElement('select');
  collectionSelect.id = collectionId;
  collectionSelect.className = 'assist-cite-btn assist-cite-card__collection-select';

  const collectionChangeHandler = () => {
    if (typeof opts.onAssignProject === 'function') {
      opts.onAssignProject(citationRef.current, collectionSelect.value);
    }
  };
  collectionSelect.addEventListener('change', collectionChangeHandler);

  collectionWrap.appendChild(collectionLabel);
  collectionWrap.appendChild(collectionSelect);

  /**
   * Mount, fill, or remove the collection picker for the current citation + options. The picker's
   * accessible name carries the citation's title so a screen-reader user moving down a list of
   * cards can tell one picker from the next (the visible "Collection" text is contained in it,
   * satisfying SC 2.5.3).
   */
  function syncCollection() {
    if (typeof opts.onAssignProject !== 'function') {
      if (collectionWrap.parentNode) {
        collectionWrap.remove();
      }
      return;
    }
    if (!collectionWrap.parentNode) {
      el.insertBefore(collectionWrap, actionsEl);
    }

    const projects = Array.isArray(opts.projects) ? opts.projects : [];
    const wanted = [{ value: '', label: 'No collection' }].concat(
      projects.map(p => ({ value: String(p.id), label: String(p.name) }))
    );
    const same =
      collectionSelect.options.length === wanted.length &&
      wanted.every(
        (option, i) =>
          collectionSelect.options[i].value === option.value &&
          collectionSelect.options[i].textContent === option.label
      );
    if (!same) {
      collectionSelect.replaceChildren();
      for (const { value, label } of wanted) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        collectionSelect.appendChild(option);
      }
    }

    const filed = c.projectId === undefined || c.projectId === null ? '' : String(c.projectId);
    collectionSelect.value = filed;
    collectionSelect.setAttribute(
      'aria-label',
      `Collection for ${c.title ? `“${c.title}”` : 'this citation'}`
    );
  }

  // Actions row — only render buttons whose callbacks were provided
  const actionsEl = document.createElement('div');
  actionsEl.className = 'assist-cite-card__actions';

  /**
   * Card action definitions. `present(c, opts)` decides whether the button should exist for the
   * current citation + options — copy-quote only makes sense when there IS a captured quote.
   * Order here is DOM order.
   */
  const BUTTON_DEFS = [
    {
      key: 'insert',
      label: 'Copy reference',
      classes: ['assist-cite-btn--primary'],
      present: o => !!o.onInsert,
    },
    {
      key: 'copyInText',
      label: 'Copy in-text',
      classes: [],
      present: o => !!o.onCopyInText,
    },
    {
      key: 'copyQuote',
      label: 'Copy quote + citation',
      classes: [],
      present: (o, cit) => !!o.onCopyQuote && !!String(cit.quote || '').trim(),
    },
    { key: 'edit', label: 'Edit', classes: [], present: o => !!o.onEdit },
    {
      key: 'remove',
      label: 'Remove',
      classes: ['assist-cite-btn--ghost'],
      present: o => !!o.onRemove,
    },
    // The two trash-only actions. A card in the trash gets these INSTEAD of the others: the trash
    // view passes no edit/copy/remove callbacks, so a removed citation cannot be edited or cited
    // by accident while it is on its way out.
    {
      key: 'restore',
      label: 'Restore',
      classes: ['assist-cite-btn--primary'],
      present: o => !!o.onRestore,
    },
    {
      key: 'purge',
      label: 'Delete permanently',
      classes: ['assist-cite-btn--ghost'],
      present: o => !!o.onPurge,
    },
  ];

  /** Track button elements and their cleanups so update() can rewire them. */
  const buttons = {};

  function callbackFor(key) {
    return opts[`on${key.charAt(0).toUpperCase() + key.slice(1)}`];
  }

  /** Mount, remove, or rewire each defined button to match the current citation + options. */
  function syncButtons() {
    for (const def of BUTTON_DEFS) {
      const shouldExist = def.present(opts, c);
      const cb = callbackFor(def.key);
      const existing = buttons[def.key];

      if (!shouldExist && existing) {
        existing.cleanup();
        existing.el.remove();
        buttons[def.key] = null;
      } else if (shouldExist && !existing) {
        const { el: btnEl, cleanup } = makeButton(def.label, def.classes, cb, citationRef);
        buttons[def.key] = { el: btnEl, cleanup };
        // Keep DOM order stable: insert before the first later-defined button already mounted.
        const laterMounted = BUTTON_DEFS.slice(BUTTON_DEFS.indexOf(def) + 1)
          .map(d => buttons[d.key])
          .find(Boolean);
        actionsEl.insertBefore(btnEl, laterMounted ? laterMounted.el : null);
      } else if (shouldExist && existing) {
        existing.cleanup();
        const cleanup = attachAccessibleHandler(existing.el, def.label, () =>
          cb(citationRef.current)
        );
        buttons[def.key] = { el: existing.el, cleanup };
      }
    }
  }

  syncButtons();

  // "Analyse with AI" — only when an analyser is injected. Sits with the other actions; its result
  // lands in the analysis panel above. cb ignores its arg and reads the live citation via closure.
  if (opts.analyser) {
    const { el: btnEl, cleanup } = makeButton(
      'Analyse with AI',
      ['assist-cite-btn--ai'],
      () => runAnalysis(),
      citationRef
    );
    analyseBtn = btnEl;
    analyseCleanup = cleanup;
    actionsEl.appendChild(btnEl);
  }

  el.appendChild(actionsEl);

  syncCollection();

  // ── update() ───────────────────────────────────────────────────────────────

  /**
   * Patch the existing DOM in place with new citation data and/or options.
   * Does NOT rebuild el or set innerHTML on the whole card.
   * @param {Object} nextCitation
   * @param {Object} [nextOptions]
   */
  function update(nextCitation, nextOptions = {}) {
    // Merge options; only provided keys override.
    opts = { ...opts, ...nextOptions };

    c = normalizeCitation(nextCitation) || {};
    citationRef.current = c;

    // Patch text nodes.
    titleEl.textContent = c.title || '';
    metaEl.textContent = buildMeta(c);
    paintReference();
    syncReadingCapture();

    // Patch the reassurance chip and its capitals hint in place.
    const next = assessCitation(c, { style: opts.style });
    applyChip(chip, next.level);
    syncHint(next);

    // Re-sync the sentinel: mount/verify or remove it as the updated citation's DOI dictates.
    syncSentinel();

    // Only discard a shown analysis when the analysed metadata actually changed — the list calls
    // update() on every store emit (filter/add/style), and wiping a valid result each time would
    // lose it and force a needless (paid) re-run. A transient loading/error message (analysedSig
    // null) is always cleared.
    if (analysedSig === null || analysisSignature(c) !== analysedSig) {
      if (analyseBtn) {
        analyseBtn.textContent = 'Analyse with AI';
        analyseBtn.disabled = false;
      }
      clearAnalysis();
    }

    // Mount/remove/rewire buttons to match the new citation + options (e.g. a quote appearing
    // makes "Copy quote + citation" appear; a removed callback removes its button).
    syncButtons();

    // Keep the filing picker in step: a collection created elsewhere must appear here, and a
    // citation moved elsewhere must show where it now lives.
    syncCollection();

    // Rename (or remove) the selection checkbox for the citation now on the card. Its ticked state
    // belongs to the view, which re-applies it through setSelected() after every reconcile.
    syncSelect();
  }

  // ── destroy() ──────────────────────────────────────────────────────────────

  /**
   * Remove all event handlers and detach el from its parent.
   */
  function destroy() {
    for (const def of BUTTON_DEFS) {
      if (buttons[def.key]) {
        buttons[def.key].cleanup();
        buttons[def.key] = null;
      }
    }
    if (analyseCleanup) {
      analyseCleanup();
      analyseCleanup = null;
    }
    collectionSelect.removeEventListener('change', collectionChangeHandler);
    selectBox.removeEventListener('change', selectChangeHandler);
    el.remove();
  }

  // ── Return the component interface ─────────────────────────────────────────

  return {
    id: String(c.id || ''),
    el,
    update,
    setSelected,
    destroy,
  };
}
