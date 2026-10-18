/**
 * Step-Rail Wizard
 *
 * The executive-function-aware capture/edit flow for a citation. Five plain-language steps —
 * WHAT / WHO / WHEN / WHERE / CHECK — each asking one question, so a student is never faced with a
 * wall of fields. The draft is pre-filled from whatever the capture step already knows (a DOI/URL
 * lookup, a highlight, a voice note) so nothing is entered twice (SC 3.3.7). The final CHECK step
 * shows the deterministic "Is this right?" reassurance verdict and a live formatted preview, with
 * each issue deep-linking back to the exact step that fixes it.
 *
 * The four bibliographic steps also say, in plain words, where their details came from. When they
 * came back from CrossRef the record carries `extra.verified`, listing the fields CrossRef itself
 * supplied, and exactly those open locked behind the verification badge: an accidental keystroke
 * cannot quietly rewrite the publisher's own record (SC 3.3.4), and a page guess is never dressed
 * up as verified. The badge rides inside the step, after its question and before its fields, so a
 * keyboard user tabbing forward reaches it. Unlocking is one activation, by pointer or keyboard,
 * and the mark comes off the record the moment a locked field really changes — badge and all.
 * Notes, quote, locator, tags, the collection and the type picker are the student's own and are
 * never locked.
 *
 * No confirmation dialogs anywhere: saving just completes (the caller offers an 8-second Undo via
 * the save tray), and Cancel just cancels (SC 3.3.4 — the safety net is undo, not a nag).
 *
 * Save is judged by `validateCitation` — the one rule the store enforces too, so the wizard cannot
 * accept a source the store will refuse; and when the caller supplies `onSave`, the record is
 * written before completion is reported, so a failed write leaves the dialog open with the details
 * still in it rather than closing on a source that was never stored.
 *
 * Public API:
 *   createStepRailWizard({ draft, style, projects, initialStep, onComplete, onCancel, onSave })
 *     -> { el, goToStep(id), getDraft(), destroy() }
 */

import { createBreadcrumb } from './breadcrumb.js';
import { createWizardStep } from './wizard-step.js';
import { createReassurancePanel } from '../reassurance-panel.js';
import { createVerificationBadge } from '../verification-badge.js';
import { injectCitationStyles } from '../citation-styles.js';
import { renderReference } from '../reference-html.js';
import { referenceSetFor } from '../../citation-styles/index.js';
import { normalizeCitation, UI_TYPE_OPTIONS } from '../../citation-types.js';
import { validateCitation } from '../../citation-model.js';
import { VERIFIED_FIELD_KEYS } from '../../crossref-api.js';
import { attachAccessibleHandler } from '../../../../utils/event-handlers.js';

/** The EF step labels shown in the breadcrumb rail. */
const STEP_RAIL = [
  { id: 'what', label: 'What' },
  { id: 'who', label: 'Who' },
  { id: 'when', label: 'When' },
  { id: 'where', label: 'Where' },
  { id: 'notes', label: 'Notes' },
  { id: 'check', label: 'Check' },
];

const STEP_ORDER = STEP_RAIL.map(s => s.id);

/** The steps that describe the source itself, and so carry the provenance line and the lock. */
const BIBLIOGRAPHIC_STEPS = new Set(['what', 'who', 'when', 'where']);

/**
 * What each locked field is called in the provenance sentence: the words on its own label, so the
 * student can match the claim to the box in front of them.
 */
const FIELD_WORDS = Object.freeze({
  title: 'title',
  authors: 'authors',
  publicationDate: 'year',
  url: 'link',
  doi: 'DOI',
  siteName: 'site or journal',
  publisher: 'publisher',
});

/** Plain-language provenance, so where the details came from is never left to a colour. */
const PROVENANCE = Object.freeze({
  page: 'Details read from the page — check them.',
  edited: 'You changed these details, so they are your own now, not CrossRef’s.',
});

/**
 * Name the details the mark actually covers. CrossRef fills in what it holds and no more, so a
 * blanket "details verified" would put its name on whatever the page happened to guess.
 * @param {string[]} keys - the verified field keys, in rail order
 * @returns {string}
 */
function crossrefProvenance(keys) {
  const words = keys.map(key => FIELD_WORDS[key]).filter(Boolean);
  const list =
    words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  const named = list.charAt(0).toUpperCase() + list.slice(1);
  // The sentence doubles as the reason a locked field gives for being read-only, so it also has to
  // name the way out — and say it in words that stay true whether the fields are locked or not.
  return (
    `${named} came back verified against CrossRef, the record the publisher deposited for this ` +
    'DOI. The Verified button locks and unlocks them for editing. The source type is yours to set.'
  );
}

/** Unique id per wizard, so the badge can point at its own provenance sentence. */
let provenanceSeq = 0;

/** The Save button's resting label, restored after a save attempt finishes. */
const SAVE_LABEL = 'Save';

/**
 * The degrees a student is most likely to be citing, worded the way the styles print them: Harvard
 * repeats the words verbatim, and APA/MLA/Chicago read the level out of them. Anything else is
 * typed in the box the last option opens.
 */
const DEGREE_OPTIONS = Object.freeze([
  { value: '', label: 'Not sure yet' },
  { value: 'PhD thesis', label: 'PhD thesis' },
  { value: 'MPhil thesis', label: 'MPhil thesis' },
  { value: 'MA dissertation', label: 'MA dissertation' },
  { value: 'MSc dissertation', label: 'MSc dissertation' },
  { value: 'BA dissertation', label: 'BA dissertation' },
]);

/**
 * Which source types each `extra` detail is kept for when the citation is saved. A chapter retyped
 * as a web page should not carry its editors out with it: nothing will print them, and a stale key
 * is a wrong answer waiting to turn up in an export. The list is deliberately wider than the boxes
 * the WHERE step offers — every style prints an edition and a place of publication for a plain
 * book, so a lookup that filled those in keeps them even though the wizard has no box for them.
 */
const TYPE_ONLY_EXTRAS = Object.freeze([
  { key: 'editors', types: ['chapter'] },
  { key: 'chapter', types: ['chapter'] },
  { key: 'edition', types: ['chapter', 'book'] },
  { key: 'place', types: ['chapter', 'book'] },
  { key: 'institution', types: ['thesis'] },
  { key: 'thesisType', types: ['thesis'] },
  { key: 'pages', types: ['chapter', 'journal', 'newspaper'] },
  { key: 'handle', types: ['social_media'] },
]);

/**
 * The source types one `extra` detail belongs to, read out of the table above so the boxes the
 * wizard offers and the details a save keeps can never disagree.
 * @param {string} key
 * @returns {string[]}
 */
const typesFor = key => TYPE_ONLY_EXTRAS.find(entry => entry.key === key).types;

/** The types whose references print a page range, and so are asked for one. */
const PAGED_TYPES = typesFor('pages');

/**
 * The types printed and shelved as books, and so the ones with an ISBN on the back. A student
 * citing a printed book usually has the ISBN and nothing else to locate it by.
 */
const ISBN_TYPES = Object.freeze(['book', 'chapter']);

/** @param {Object} d @returns {boolean} */
const isChapter = d => d.type === 'chapter';
/** @param {Object} d @returns {boolean} */
const isThesis = d => d.type === 'thesis';
/** @param {Object} d @returns {boolean} */
const hasPages = d => PAGED_TYPES.includes(d.type);
/** @param {Object} d @returns {boolean} */
const hasEdition = d => typesFor('edition').includes(d.type);
/** @param {Object} d @returns {boolean} */
const hasPlace = d => typesFor('place').includes(d.type);
/** @param {Object} d @returns {boolean} */
const hasIsbn = d => ISBN_TYPES.includes(d.type);
/** @param {Object} d @returns {boolean} */
const hasHandle = d => typesFor('handle').includes(d.type);

/**
 * Compare a field the way a student would: the same words in the same order, whether the field
 * holds one string or a list of authors.
 * @param {string|string[]} value
 * @returns {string}
 */
function fieldSignature(value) {
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  return value === undefined || value === null ? '' : String(value);
}

/** Per-wizard sequence, so each notice id is unique on the page. */
let wizardSeq = 0;

/**
 * @param {Object} [options]
 * @param {Object} [options.draft] - prefilled citation (from capture / DOI lookup)
 * @param {Array<{id: string|number, name: string}>} [options.projects] - the student's collections,
 *        offered on the NOTES step so a source can be filed as it is saved. Omitted (or empty) when
 *        there are none yet, in which case no picker is drawn — an empty menu is not a choice.
 * @param {string} [options.style='harvard'] - style id for the CHECK preview and its check
 * @param {Object[]} [options.referencePool] - every saved citation; the CHECK preview formats the
 *        draft within its collection of these, so it carries the year letter it will be copied with
 * @param {Function} [options.onComplete] - called with the finished citation once it is saved (and,
 *        when `onSave` is given, only once that has resolved)
 * @param {Function} [options.onCancel] - called when the user cancels
 * @param {(citation: Object) => Promise<any>} [options.onSave] - stores the citation. Given one,
 *        Save awaits it and reports completion only on success; a rejection keeps the wizard open,
 *        says so in words, and leaves every detail in place. Without one, Save completes straight
 *        away and the caller stores the citation itself.
 * @returns {{ el: HTMLDivElement, goToStep: Function, getDraft: Function, destroy: Function,
 *            noticeId: (string|null) }} `noticeId` names the no-passage notice, when there is one,
 *            for the dialog around the wizard to use as its description
 */
export function createStepRailWizard(options = {}) {
  const { style = 'harvard', onComplete, onCancel, onSave } = options;
  const projects = Array.isArray(options.projects) ? options.projects : [];

  // True from the moment Save starts writing until it has finished, so a second press cannot start
  // a second write of the same source.
  let saving = false;

  injectCitationStyles();

  // Working draft — normalised once so every field has a known shape (authors array, etc.).
  const draft = normalizeCitation(options.draft || {}) || {};
  if (!draft.extra || typeof draft.extra !== 'object') {
    draft.extra = {};
  }

  // Start at the requested step when deep-linked (e.g. a "Fix the year" tray action), else step 1.
  let currentIndex = Math.max(0, STEP_ORDER.indexOf(options.initialStep));
  const completed = new Set();

  // ── Shell ────────────────────────────────────────────────────────────────────

  const el = document.createElement('div');
  el.className = 'assist-cite-root assist-cite-wizard';

  const breadcrumb = createBreadcrumb({ steps: STEP_RAIL, current: 'what' });
  el.appendChild(breadcrumb.el);

  // A voice capture that found nothing to quote says so up front, before the student reaches an
  // empty quote box and wonders whether the words were taken. The flag is the capture's, not the
  // source's, so it leaves the draft here and is never saved.
  // The notice carries an id so the dialog around the wizard can name it as its description.
  let noticeId = null;
  if (draft.passageMissing) {
    const notice = document.createElement('p');
    noticeId = `assist-cite-wizard-notice-${++wizardSeq}`;
    notice.id = noticeId;
    notice.className = 'assist-cite-step__help assist-cite-wizard__notice';
    notice.textContent =
      'No passage was captured. Select the text you want to quote, then say “cite this” again, ' +
      'or type the quote on the Notes step.';
    el.appendChild(notice);
  }
  delete draft.passageMissing;

  const stepHost = document.createElement('div');
  stepHost.className = 'assist-cite-wizard__host';
  el.appendChild(stepHost);

  // ── Verification lock ─────────────────────────────────────────────────────────

  // The mark crossref-api leaves on the metadata it returns, naming the fields it supplied.
  // Anything else — a page scrape, a hand-typed entry — is not verified, and the wizard must not
  // imply otherwise.
  const verifiedMark = draft.extra && draft.extra.verified;
  const fromPage = Boolean(draft.extra && draft.extra.source === 'page');

  // Only the fields CrossRef actually supplied on the lookup are locked and claimed; the rest are
  // page guesses, and locking those behind "verified" would be putting CrossRef's name on them.
  // A record saved before the lookup recorded that list vouched for the whole set.
  const lockedKeys = Array.isArray(verifiedMark?.fields)
    ? VERIFIED_FIELD_KEYS.filter(key => verifiedMark.fields.includes(key))
    : [...VERIFIED_FIELD_KEYS];

  // A record is verified only when CrossRef itself said so, and only while it still vouches for a
  // field: a mark covering nothing has nothing to lock and nothing to claim.
  const isVerified =
    Boolean(verifiedMark && verifiedMark.source === 'crossref') && lockedKeys.length > 0;

  // The values the mark vouches for. A field that leaves this baseline is no longer CrossRef's.
  const verifiedBaseline = new Map(lockedKeys.map(key => [key, fieldSignature(draft[key])]));

  let badge = null;
  let provenanceEl = null;
  let provenanceText = null;
  let statusEl = null;
  const lockedControls = [];

  /**
   * Put the reason a field is read-only on the field itself: "Title, read only" is followed by the
   * sentence that names CrossRef and the badge that undoes it. Removed on unlock, so an editable
   * field never carries an explanation for a lock that is not there.
   * @param {boolean} locked
   */
  function describeLock(locked) {
    for (const control of lockedControls) {
      const ids = (control.getAttribute('aria-describedby') || '')
        .split(' ')
        .filter(id => id && id !== provenanceText.id);
      if (locked) {
        ids.push(provenanceText.id);
      }
      if (ids.length > 0) {
        control.setAttribute('aria-describedby', ids.join(' '));
      } else {
        control.removeAttribute('aria-describedby');
      }
    }
  }

  /**
   * Take the mark off the record the moment a verified field actually changes, rather than
   * quietly at save time: a badge that still says "Verified" over a retyped title is a lie. The
   * badge goes with it — a control whose only remaining job is to say it does nothing is a trap
   * in the tab order — while the sentence stays and says what happened.
   */
  function dropVerification() {
    delete draft.extra.verified;
    badge.setVerified(false); // fields become editable again
    describeLock(false);
    badge.el.remove();
    provenanceText.textContent = PROVENANCE.edited;
    statusEl.textContent = PROVENANCE.edited;
  }

  // ── Input steps (WHAT/WHO/WHEN/WHERE) ─────────────────────────────────────────

  const onFieldChange = (key, value) => {
    if (key.startsWith('extra.')) {
      // Book-chapter and thesis details live on `extra`, and an emptied box means the detail is
      // gone rather than blank — no style should print "  edn." for an edition nobody gave. None
      // of these keys is one CrossRef vouches for, so none of them can cost a record its mark.
      const extraKey = key.slice('extra.'.length);
      const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();
      if (empty) {
        delete draft.extra[extraKey];
      } else {
        draft.extra[extraKey] = value;
      }
      return;
    }

    if (key === 'authors' || key === 'tags') {
      draft[key] = Array.isArray(value) ? value : [];
    } else if (key === 'projectId') {
      // "No collection" is an absence, not an empty-string collection that matches nothing.
      draft.projectId = value ? value : null;
    } else {
      draft[key] = value;
    }

    if (
      badge &&
      badge.isVerified() &&
      lockedKeys.includes(key) &&
      fieldSignature(draft[key]) !== verifiedBaseline.get(key)
    ) {
      dropVerification();
    }
  };

  /**
   * The NOTES-step fields that organise a source rather than describe it: which collection it
   * belongs to, and the student's own tags. The collection picker is only built when there is at
   * least one collection to pick — the library rail is where the first one is made.
   * @returns {Array<Object>}
   */
  function organiseFields() {
    const fields = [];
    if (projects.length > 0) {
      fields.push({
        key: 'projectId',
        label: 'Collection',
        type: 'select',
        options: [
          { value: '', label: 'No collection' },
          ...projects.map(p => ({ value: String(p.id), label: String(p.name) })),
        ],
        hint: 'Which assignment or module this source is for.',
      });
    }
    fields.push({
      key: 'tags',
      label: 'Tags',
      type: 'tags',
      placeholder: 'e.g. memory, ADHD',
      hint: 'Separate tags with commas. Your own words for finding this again.',
    });
    return fields;
  }

  const inputSteps = {
    what: createWizardStep({
      id: 'what',
      legend: 'What is the source?',
      help: 'Start with its title and what kind of thing it is.',
      draft,
      onChange: onFieldChange,
      fields: [
        {
          key: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          placeholder: 'e.g. The Origin of Species',
          hint: 'The name of the page, article, or book.',
        },
        {
          key: 'type',
          label: 'Type',
          type: 'select',
          options: UI_TYPE_OPTIONS,
          hint: 'What kind of source is it?',
        },
      ],
    }),
    who: createWizardStep({
      id: 'who',
      legend: 'Who is behind it?',
      help: 'The author or authors. It is fine to leave this blank if no one is named.',
      draft,
      onChange: onFieldChange,
      fields: [
        {
          key: 'authors',
          label: 'Author(s)',
          type: 'authors',
          placeholder: 'e.g. Darwin, Charles',
          hint: 'One author per line.',
          organisationsKey: 'extra.organisationAuthors',
        },
        {
          key: 'extra.handle',
          label: 'Account handle',
          placeholder: 'e.g. @BillGates',
          hint: 'The @name the post was made from.',
          showWhen: hasHandle,
        },
      ],
    }),
    when: createWizardStep({
      id: 'when',
      legend: 'When was it published?',
      help: 'A year is enough. Leave it blank if you cannot find one.',
      draft,
      onChange: onFieldChange,
      fields: [
        {
          key: 'publicationDate',
          label: 'Year published',
          type: 'text',
          placeholder: 'e.g. 2021',
          hint: 'Just the year, or a full date if you have it.',
        },
      ],
    }),
    where: createWizardStep({
      id: 'where',
      legend: 'Where can it be found?',
      help: 'A link or DOI lets a reader get to the source.',
      draft,
      onChange: onFieldChange,
      fields: [
        {
          key: 'url',
          label: 'Link (URL)',
          type: 'text',
          placeholder: 'e.g. https://example.com/article',
          hint: 'Where you found it online.',
        },
        {
          key: 'doi',
          label: 'DOI',
          type: 'text',
          placeholder: 'e.g. 10.1037/0003-066X.59.1.29',
          hint: 'For journal articles, if it has one.',
        },
        {
          key: 'isbn',
          label: 'ISBN',
          type: 'text',
          placeholder: 'e.g. 978-0-14-103805-8',
          hint: 'The number by the barcode on the back of the book, if you have it.',
          showWhen: hasIsbn,
        },
        {
          // One box, two questions: for a chapter it is the book the chapter sits in, which is
          // what every style italicises, so it asks for that in as many words.
          key: 'siteName',
          label: d => (isChapter(d) ? 'Book title' : 'Site or journal name'),
          type: 'text',
          placeholder: d => (isChapter(d) ? 'e.g. The Handbook of Art Education' : 'e.g. Nature'),
          hint: d => (isChapter(d) ? 'The whole book your chapter is in.' : ''),
        },
        {
          key: 'extra.editors',
          label: 'Editors of the book',
          type: 'names',
          placeholder: 'e.g. Smith, Ann',
          hint: 'The people who put the book together, one per line — not the person who wrote your chapter.',
          showWhen: isChapter,
        },
        {
          key: 'extra.edition',
          label: 'Edition',
          type: 'text',
          placeholder: 'e.g. 2nd',
          hint: 'Only if the book says one, like 2nd or Revised.',
          showWhen: hasEdition,
        },
        {
          key: 'extra.place',
          label: 'Place of publication',
          type: 'text',
          placeholder: 'e.g. London',
          hint: 'The city printed near the front of the book.',
          showWhen: hasPlace,
        },
        {
          key: 'publisher',
          label: 'Publisher',
          type: 'text',
          placeholder: 'e.g. Oxford University Press',
        },
        {
          key: 'extra.pages',
          label: 'Pages',
          type: 'text',
          placeholder: 'e.g. 357-362',
          hint: 'The first and last page of your chapter or article.',
          showWhen: hasPages,
        },
        {
          key: 'extra.institution',
          label: 'University or institution',
          type: 'text',
          placeholder: 'e.g. National College of Art and Design',
          hint: 'Where the thesis was submitted.',
          showWhen: isThesis,
        },
        {
          key: 'extra.thesisType',
          label: 'Degree',
          type: 'select-other',
          options: DEGREE_OPTIONS,
          otherLabel: 'Something else',
          otherFieldLabel: 'Type the degree',
          otherPlaceholder: 'e.g. Practice-based doctorate',
          hint: 'What the thesis was written for. Pick “Something else” to type your own.',
          showWhen: isThesis,
        },
      ],
    }),
    notes: createWizardStep({
      id: 'notes',
      legend: 'What did it say?',
      help: 'Optional — capture the exact words and where they live now, so you never have to hunt for them at a deadline.',
      draft,
      onChange: onFieldChange,
      fields: [
        {
          key: 'quote',
          label: 'The source’s exact words',
          type: 'textarea',
          placeholder: 'Paste or type the sentence you might quote.',
          hint: 'Kept marked as a quote — these are not your words.',
        },
        {
          key: 'locator',
          label: 'Page or spot',
          type: 'text',
          placeholder: 'e.g. 24, pp. 3-4, or 02:15',
          hint: 'Where in the source — a page, paragraph, or timestamp.',
        },
        {
          key: 'notes',
          label: 'Why you saved it (your words)',
          type: 'textarea',
          placeholder: 'e.g. Backs up my point about rehearsal and memory.',
          hint: 'Your own words — a safe starting point when you paraphrase.',
        },
        ...organiseFields(),
      ],
    }),
  };

  // ── Provenance line (+ the lock, when there is something to lock) ─────────────

  if (isVerified || fromPage) {
    provenanceEl = document.createElement('div');
    provenanceEl.className = 'assist-cite-wizard__provenance';

    provenanceText = document.createElement('p');
    provenanceText.className = 'assist-cite-wizard__provenance-text assist-cite-step__help';
    provenanceText.id = `assist-cite-provenance-${++provenanceSeq}`;
    provenanceText.textContent = isVerified ? crossrefProvenance(lockedKeys) : PROVENANCE.page;

    if (isVerified) {
      // The row itself moves between steps, so it is no good as a live region. This one never
      // leaves the tree and is written to exactly once, when an edit takes the mark off — the
      // student is typing in a field at that moment and would never see the row change. A record
      // read off the page has no such change to announce, so it gets no live region.
      statusEl = document.createElement('p');
      statusEl.className = 'assist-cite-sr-only assist-cite-wizard__provenance-status';
      statusEl.setAttribute('role', 'status');
      statusEl.setAttribute('aria-live', 'polite');
      el.appendChild(statusEl);

      // The lock manages the bibliographic controls wherever they live in the rail; the NOTES step
      // holds none of these keys, so the student's own material is never locked.
      for (const step of Object.values(inputSteps)) {
        for (const key of lockedKeys) {
          const control = step.getControl(key);
          if (control) {
            lockedControls.push(control);
          }
        }
      }
      badge = createVerificationBadge({
        verified: true,
        controls: lockedControls,
        onLock: () => describeLock(true),
        onUnlock: () => describeLock(false),
      });
      badge.el.setAttribute('aria-describedby', provenanceText.id);
      provenanceEl.appendChild(badge.el);
      // The badge starts locked without transitioning, so onLock never fired for this first state.
      describeLock(true);
    }

    provenanceEl.appendChild(provenanceText);
  }

  // ── CHECK step (reassurance + live preview) ───────────────────────────────────

  const checkEl = document.createElement('section');
  checkEl.className = 'assist-cite-step';
  checkEl.setAttribute('aria-labelledby', 'assist-cite-check-legend');

  const checkLegend = document.createElement('h2');
  checkLegend.className = 'assist-cite-step__legend';
  checkLegend.id = 'assist-cite-check-legend';
  checkLegend.tabIndex = -1;
  checkLegend.textContent = 'Is this right?';
  checkEl.appendChild(checkLegend);

  const checkHelp = document.createElement('p');
  checkHelp.className = 'assist-cite-step__help';
  checkHelp.textContent = 'Here is how your citation will read. Fix anything flagged, or save it.';
  checkEl.appendChild(checkHelp);

  const reassurance = createReassurancePanel({ style, onFix: stepId => goToStep(stepId) });
  checkEl.appendChild(reassurance.el);

  const previewLabel = document.createElement('p');
  previewLabel.className = 'assist-cite-step__help';
  previewLabel.textContent = 'Preview:';
  checkEl.appendChild(previewLabel);

  const previewEl = document.createElement('p');
  previewEl.className = 'assist-cite-card__reference';
  previewEl.setAttribute('aria-live', 'polite');
  checkEl.appendChild(previewEl);

  /** Refresh the CHECK step from the current draft. */
  function refreshCheck() {
    reassurance.update(draft);
    // Italics and all, through the same helper the library card uses: the preview a student
    // reviews on CHECK is the reference they are about to paste, not a flattened copy of it.
    // Within the collection the draft is filed in (which the NOTES step can change).
    renderReference(previewEl, draft, style, referenceSetFor(draft, options.referencePool));
  }

  // ── Navigation bar ─────────────────────────────────────────────────────────

  const nav = document.createElement('div');
  nav.className = 'assist-cite-step__nav';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'assist-cite-btn assist-cite-btn--ghost';
  cancelBtn.textContent = 'Cancel';

  const rightGroup = document.createElement('div');
  rightGroup.style.display = 'flex';
  rightGroup.style.gap = '8px';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'assist-cite-btn';
  backBtn.textContent = 'Back';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'assist-cite-btn';
  nextBtn.textContent = 'Next';

  // Save is always available — you can finish the moment the citation is good enough, without
  // marching through every step (the title is the only hard requirement).
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'assist-cite-btn assist-cite-btn--primary';
  saveBtn.textContent = SAVE_LABEL;

  rightGroup.appendChild(backBtn);
  rightGroup.appendChild(nextBtn);
  rightGroup.appendChild(saveBtn);
  nav.appendChild(cancelBtn);
  nav.appendChild(rightGroup);

  // ── Why a save did not happen ────────────────────────────────────────────────

  // One live region for a refused save, between the step and the buttons: it never moves with the
  // rail, and it sits where the student is looking when they press Save. It says what happened;
  // each field says what to fix, beside the box, tied on with aria-invalid + aria-describedby — so
  // the two announcements carry different sentences rather than repeating one.
  const problemSummary = document.createElement('p');
  problemSummary.className = 'assist-cite-step__error assist-cite-wizard__problems';
  problemSummary.setAttribute('role', 'alert');
  problemSummary.tabIndex = -1;
  problemSummary.hidden = true;
  el.appendChild(problemSummary);

  el.appendChild(nav);

  // ── Rendering ────────────────────────────────────────────────────────────────

  /** Mount the step at currentIndex, refresh it from the draft, sync rail + nav + focus. */
  function renderCurrentStep() {
    const id = STEP_ORDER[currentIndex];

    // Swap the mounted step.
    while (stepHost.firstChild) {
      stepHost.removeChild(stepHost.firstChild);
    }

    let legendToFocus;
    if (id === 'check') {
      refreshCheck();
      stepHost.appendChild(checkEl);
      legendToFocus = checkLegend;
    } else {
      const step = inputSteps[id];
      step.refresh(draft); // re-populate from the latest draft (prefill + back-and-forth)
      stepHost.appendChild(step.el);
      legendToFocus = step.el.querySelector('.assist-cite-step__legend');
    }

    // The provenance line belongs to the source's own fields; NOTES and CHECK are not its business.
    // On the steps it governs it sits inside the step, straight after the question and ahead of the
    // fields, so tabbing forward from the legend reaches the unlock control before the locked boxes
    // rather than never at all.
    if (provenanceEl) {
      if (BIBLIOGRAPHIC_STEPS.has(id)) {
        const stepRoot = legendToFocus.parentNode;
        stepRoot.insertBefore(
          provenanceEl,
          stepRoot.querySelector('.assist-cite-step__field-wrap')
        );
      } else {
        provenanceEl.remove();
      }
    }

    // Rail.
    breadcrumb.setCurrent(id);
    breadcrumb.setCompleted(completed);

    // Nav: Save is always available; Next advances through the optional steps and is hidden on the
    // final CHECK step.
    backBtn.hidden = currentIndex === 0;
    nextBtn.hidden = id === 'check';

    // Move focus to the step's question so it is announced (orientation before action).
    if (legendToFocus) {
      legendToFocus.focus();
    }
  }

  // ── Navigation actions ───────────────────────────────────────────────────────

  function goNext() {
    const id = STEP_ORDER[currentIndex];
    // Validate the current input step before advancing (only WHAT has a required field).
    const step = inputSteps[id];
    if (step) {
      const { valid } = step.validate();
      if (!valid) {
        return; // stay put; validate() has surfaced + focused the error
      }
    }
    completed.add(id);
    currentIndex = Math.min(currentIndex + 1, STEP_ORDER.length - 1);
    renderCurrentStep();
  }

  /** Clear a refused save: no summary, and nothing left marked invalid. */
  function clearProblems() {
    problemSummary.hidden = true;
    problemSummary.textContent = '';
    for (const step of Object.values(inputSteps)) {
      step.clearErrors();
    }
  }

  /**
   * Refuse a save in a way the student can act on: the sentence for each problem beside the box
   * that fixes it, a plain statement above the buttons that nothing was saved, and focus on the
   * first problem — never a closed dialog and a lost source.
   * @param {Array<{field: string, message: string}>} problems
   */
  function showProblems(problems) {
    clearProblems();

    let first = null;
    // A problem about a field no step has a box for has nowhere to be shown but the summary —
    // saying it there is the difference between a message and another silent refusal.
    const homeless = [];
    for (const { field, message } of problems) {
      const owner = STEP_ORDER.find(id => inputSteps[id] && inputSteps[id].hasField(field));
      if (owner) {
        inputSteps[owner].showError(field, message);
        if (!first) {
          first = { step: owner, field };
        }
      } else {
        homeless.push(message);
      }
    }

    const count = problems.length;
    const lead =
      count === 1
        ? 'Not saved yet — there is one thing to fix first.'
        : `Not saved yet — there are ${count} things to fix first.`;
    problemSummary.textContent = [lead, ...homeless].join(' ');
    problemSummary.hidden = false;

    if (first) {
      goToStep(first.step);
      inputSteps[first.step].focusField(first.field);
    } else {
      problemSummary.focus();
    }
  }

  /**
   * Write the record through the caller's `onSave` and report completion only once it is stored.
   * Never rejects: a failure is shown here and the wizard stays open with everything still in it.
   * @param {Object} citation
   * @returns {Promise<void>}
   */
  async function commit(citation) {
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await onSave(citation);
      if (typeof onComplete === 'function') {
        onComplete(citation);
      }
    } catch (error) {
      console.error('[step-rail-wizard] could not save the citation:', error);
      problemSummary.textContent =
        'Not saved — something went wrong storing this source. Everything you typed is still ' +
        'here, so you can press Save again.';
      problemSummary.hidden = false;
      problemSummary.focus();
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = SAVE_LABEL;
    }
  }

  /**
   * Save from any step, judged by `validateCitation` — the SAME rule the store enforces, so a
   * citation the wizard accepts can never be refused after the dialog has closed. A title is all
   * it asks for; a missing author, year or link is the CHECK step's business to mention, not a
   * reason to throw a source away.
   *
   * When the caller supplies `onSave`, the record is written BEFORE completion is reported, and a
   * failed write keeps the dialog open: a dialog that closes on a write that did not happen is
   * exactly the shape of silent data loss this replaced.
   */
  function save() {
    if (saving) {
      return;
    }
    const citation = getDraft();
    const { valid, problems } = validateCitation(citation);
    if (!valid) {
      showProblems(problems);
      return;
    }
    clearProblems();
    if (typeof onSave !== 'function') {
      if (typeof onComplete === 'function') {
        onComplete(citation);
      }
      return;
    }
    commit(citation);
  }

  function goBack() {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderCurrentStep();
    }
  }

  /**
   * Jump directly to a step by id (used by the reassurance panel's "Fix the …" deep-links).
   * Always allowed — these jumps move the student to the field that resolves a flagged issue.
   * @param {string} id
   */
  function goToStep(id) {
    const idx = STEP_ORDER.indexOf(id);
    if (idx === -1) {
      return;
    }
    currentIndex = idx;
    renderCurrentStep();
  }

  /**
   * The finished citation: a normalised copy of the working draft, carrying only the details its
   * source type has a use for. The working draft keeps the rest for as long as the wizard is open,
   * so a type picked by mistake — or picked to see what it looked like — costs nothing.
   * @returns {Object}
   */
  function getDraft() {
    const citation = normalizeCitation({ ...draft });
    // The modal's "this is an edit" marker is the wizard's own bookkeeping, not part of the record.
    delete citation._isEdit;
    for (const { key, types } of TYPE_ONLY_EXTRAS) {
      if (!types.includes(citation.type)) {
        delete citation.extra[key];
      }
    }
    return citation;
  }

  const cancelCleanup = attachAccessibleHandler(cancelBtn, 'Cancel', () => {
    if (typeof onCancel === 'function') {
      onCancel();
    }
  });
  const backCleanup = attachAccessibleHandler(backBtn, 'Back', goBack);
  const nextCleanup = attachAccessibleHandler(nextBtn, 'Next', goNext);
  const saveCleanup = attachAccessibleHandler(saveBtn, 'Save citation', save);

  // Initial paint.
  renderCurrentStep();

  function destroy() {
    cancelCleanup();
    backCleanup();
    nextCleanup();
    saveCleanup();
    if (badge) {
      badge.destroy();
    }
    Object.values(inputSteps).forEach(s => s.destroy());
    reassurance.destroy();
    breadcrumb.destroy();
  }

  return { el, goToStep, getDraft, destroy, noticeId };
}

export default { createStepRailWizard };
