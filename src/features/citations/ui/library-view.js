/**
 * Library View Component
 *
 * The shell that composes the citation library: a toolbar (search input, "New citation"
 * button, style switcher) over a diffed, incrementally-reconciled citation list. Subscribes
 * to a citation store and re-renders on every state change.
 *
 * Public API:
 *   createLibraryView(options) -> { el, focusCitation(id), destroy() }
 *
 * Design principles:
 *   - Composes already-built, already-tested components; never re-implements their logic.
 *   - The search input is wired with the native `input` event (text field — not a button).
 *     All other interactive elements use attachAccessibleHandler (mousedown-first, race-safe).
 *   - Style feedback loop prevention: the store subscriber calls switcher.setStyle() which is
 *     programmatic and does NOT fire onChange; onChange -> store.setStyle() -> emit -> setStyle()
 *     is therefore a one-shot path, not a cycle.
 *   - The search input value is overwritten from snapshot.filter when it differs and either the
 *     input is not focused or the filter itself changed, so a typing user is never interrupted but
 *     "All citations" still empties the box it cleared.
 *   - All user-derived strings reach the DOM through child component textContent paths — this
 *     shell never uses innerHTML with data.
 *   - aria-busy on el reflects snapshot.loading without touching any other DOM content.
 *   - No dead code; no TODOs. ES modules.
 */

import { attachAccessibleHandler } from '../../../utils/event-handlers.js';
import { injectCitationStyles } from './citation-styles.js';
import { createCitationList } from './citation-list.js';
import { createStyleSwitcher } from './style-switcher.js';
import { referenceSetFor } from '../citation-styles/index.js';
import { showInfoTray } from '../../../utils/action-tray.js';
import { EXPORT_FORMATS } from '../citation-export.js';
import { TRASH_RETENTION_DAYS } from '../../../config/citation-messages.js';

/** What a restore that found nothing has to say for itself. */
const RESTORE_FAILED = 'That citation was deleted permanently and cannot be restored';

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create the library view shell.
 *
 * @param {Object} [options]
 * @param {Object} options.store             - citation store instance (already init'd by caller)
 * @param {Function} [options.onEditCitation]   - called with citation when Edit is activated
 * @param {Function} [options.onNewCitation]    - called when "New citation" is activated
 * @param {Function} [options.onInsertCitation] - called with citation when Insert is activated
 * @param {Function} [options.onAssignProject] - called with (citation, projectId) when a card's
 *                                                collection picker is used; when absent, cards draw
 *                                                no picker
 * @param {Function} [options.onCopyBibliography] - called with the selected citations when the
 *                                                selection bar's "Copy bibliography" is used; the
 *                                                button is only drawn when this is provided
 * @param {Function} [options.onExportCitations] - called with (format, citations) when a format is
 *                                                chosen for the selection; the menu is only drawn
 *                                                when this is provided
 * @param {Object} [options.sentinel]           - AI Claim Sentinel orchestrator (createCitationSentinel()).
 *                                                Injected ONLY when AI is enabled; when absent, cards
 *                                                render no sentinel badge (no-stub guarantee, AI off).
 * @param {Object} [options.analyser]            - AI source analyser { analyse(citation) }. Injected
 *                                                ONLY when AI is available; when absent, cards render
 *                                                no "Analyse with AI" affordance.
 * @returns {{ el: HTMLDivElement, focusCitation: Function, destroy: Function }}
 */
export function createLibraryView(options = {}) {
  const {
    store,
    onEditCitation,
    onNewCitation,
    onInsertCitation,
    onCopyInText,
    onCopyQuote,
    onAssignProject,
    onCopyBibliography,
    onExportCitations,
    sentinel,
    analyser,
  } = options;

  // ── Inject shared stylesheet (idempotent) ─────────────────────────────────

  injectCitationStyles();

  // ── Build the shell element ───────────────────────────────────────────────

  const el = document.createElement('div');
  el.className = 'assist-cite-root assist-cite-library';

  // ── Build the toolbar ─────────────────────────────────────────────────────

  const toolbar = document.createElement('div');
  toolbar.className = 'assist-cite-toolbar';

  // Search input — text field: use the native 'input' event, not attachAccessibleHandler.
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'assist-cite-toolbar__search';
  searchInput.setAttribute('aria-label', 'Search your citations');
  searchInput.placeholder = 'Search citations…';

  // Track focus state explicitly to guard mid-typing input from being overwritten.
  let searchFocused = false;
  /** The filter the last render drew under, so a render can tell a new filter from a re-emit. */
  let lastFilter = store.getState().filter;
  const searchFocusHandler = () => {
    searchFocused = true;
  };
  const searchBlurHandler = () => {
    searchFocused = false;
  };
  searchInput.addEventListener('focus', searchFocusHandler);
  searchInput.addEventListener('blur', searchBlurHandler);

  const searchInputHandler = e => {
    store.setFilter(e.target.value);
  };
  searchInput.addEventListener('input', searchInputHandler);

  // "New citation" button — button: use attachAccessibleHandler.
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'assist-cite-btn assist-cite-btn--primary';
  newBtn.textContent = 'New citation';

  const newBtnCleanup = attachAccessibleHandler(newBtn, 'New citation', () => {
    if (typeof onNewCitation === 'function') {
      onNewCitation();
    }
  });

  // Style switcher — mount its el into the toolbar.
  const initialStyle = store.getState().style;
  const switcher = createStyleSwitcher({
    style: initialStyle,
    citation: null,
    onChange: id => store.setStyle(id),
  });

  // Sort control — view-local (presentation order, not stored state).
  let sortMode = 'newest';
  const sortLabel = document.createElement('label');
  sortLabel.className = 'assist-cite-toolbar__sort';
  const sortText = document.createElement('span');
  sortText.textContent = 'Sort ';
  const sortSelect = document.createElement('select');
  sortSelect.className = 'assist-cite-btn';
  sortSelect.setAttribute('aria-label', 'Sort citations by');
  for (const [value, label] of [
    ['newest', 'Newest first'],
    ['title', 'Title A–Z'],
    ['author', 'Author A–Z'],
    ['year', 'Year (newest)'],
  ]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sortSelect.appendChild(opt);
  }
  const sortHandler = () => {
    sortMode = sortSelect.value;
    render(store.getState());
  };
  sortSelect.addEventListener('change', sortHandler);
  sortLabel.appendChild(sortText);
  sortLabel.appendChild(sortSelect);

  // "Select all shown" — the head of the multi-select. It reflects what is on screen: ticked when
  // every visible citation is selected, indeterminate when only some are, so it never claims to
  // have selected citations hidden behind a search.
  const selectAllLabel = document.createElement('label');
  selectAllLabel.className = 'assist-cite-toolbar__selectall';
  const selectAllBox = document.createElement('input');
  selectAllBox.type = 'checkbox';
  selectAllBox.className = 'assist-cite-toolbar__selectall-box';
  const selectAllText = document.createElement('span');
  selectAllText.textContent = 'Select all shown';
  // A checkbox is bound with the native 'change' event — the mousedown-first interactive handler
  // calls preventDefault(), which would cancel the tick.
  const selectAllHandler = () => {
    if (selectAllBox.checked) {
      for (const citation of visibleNow) {
        selectedIds.add(String(citation.id));
      }
    } else {
      selectedIds.clear();
    }
    list.setSelected(selectedIds);
    syncSelectionUi();
  };
  selectAllBox.addEventListener('change', selectAllHandler);
  selectAllLabel.appendChild(selectAllBox);
  selectAllLabel.appendChild(selectAllText);

  toolbar.appendChild(searchInput);
  toolbar.appendChild(newBtn);
  toolbar.appendChild(sortLabel);
  toolbar.appendChild(switcher.el);
  toolbar.appendChild(selectAllLabel);

  el.appendChild(toolbar);

  // ── The trash panel ───────────────────────────────────────────────────────
  // Shown instead of the toolbar when the student is looking at what they have removed. It says
  // out loud how long the trash keeps things, because that promise is the whole reason Remove is
  // safe to press.

  const trashPanel = document.createElement('div');
  trashPanel.className = 'assist-cite-trash';
  trashPanel.hidden = true;

  const trashHeading = document.createElement('h2');
  trashHeading.className = 'assist-cite-trash__heading';
  trashHeading.textContent = 'Recently removed';
  trashPanel.appendChild(trashHeading);

  const trashNote = document.createElement('p');
  trashNote.className = 'assist-cite-trash__note';
  trashNote.textContent =
    `Citations you remove wait here for ${TRASH_RETENTION_DAYS} days, then they are deleted ` +
    'permanently. Restore anything you still need.';
  trashPanel.appendChild(trashNote);

  const trashActions = document.createElement('div');
  trashActions.className = 'assist-cite-trash__actions';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'assist-cite-btn assist-cite-btn--primary assist-cite-trash__back';
  backBtn.textContent = 'Back to your library';
  // Switching back hides this panel — with the focus still on this very button, which would leave
  // it on <body>. Focus moves to the search box: the first thing in the library it uncovers.
  const backBtnCleanup = attachAccessibleHandler(backBtn, 'Back to your library', () => {
    store.setView('library');
    searchInput.focus();
  });
  trashActions.appendChild(backBtn);

  const emptyTrashBtn = document.createElement('button');
  emptyTrashBtn.type = 'button';
  emptyTrashBtn.className = 'assist-cite-btn assist-cite-btn--ghost assist-cite-trash__empty';
  emptyTrashBtn.textContent = 'Empty trash';
  const emptyTrashCleanup = attachAccessibleHandler(emptyTrashBtn, 'Empty trash', () =>
    emptyTrashWithConfirm()
  );
  trashActions.appendChild(emptyTrashBtn);

  trashPanel.appendChild(trashActions);
  el.appendChild(trashPanel);

  /** Order the visible citations for display. 'newest' preserves store order (createdAt desc). */
  function sortCitations(citations) {
    const arr = [...citations];
    const familyOf = c => {
      const first = (c.authors && c.authors[0]) || '';
      // Sort by the trailing word when names are "Given Family"; good enough for display order.
      return String(first).trim().split(/\s+/).pop().toLowerCase();
    };
    const yearOf = c => {
      const m = String(c.publicationDate || '').match(/\d{4}/);
      return m ? Number(m[0]) : -Infinity;
    };
    if (sortMode === 'title') {
      arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    } else if (sortMode === 'author') {
      arr.sort((a, b) => familyOf(a).localeCompare(familyOf(b)));
    } else if (sortMode === 'year') {
      arr.sort((a, b) => yearOf(b) - yearOf(a));
    }
    return arr;
  }

  // ── Build the citation list ───────────────────────────────────────────────

  const list = createCitationList({
    style: initialStyle,
    projects: store.getState().projects,
    emptyMessage: 'No saved citations yet. Capture a source to get started.',
  });

  /**
   * The card callbacks for the library. Every key is spelled out here and in the trash bundle
   * below, including the ones that should be off: the list MERGES the options each render passes
   * it, so a key left out would keep whatever the other view set — which is how a citation in the
   * trash would end up with a working Edit button.
   */
  const libraryCardOptions = {
    // Threaded to every card so the Claim Sentinel badge appears and verifies. When `sentinel`
    // is undefined (AI off), the card creates no badge — the deterministic UI is unaffected.
    sentinel,
    // Likewise threaded to every card so the "Analyse with AI" affordance appears. Undefined when
    // AI is unavailable, so the card creates no analyse button.
    analyser,
    onInsert: typeof onInsertCitation === 'function' ? onInsertCitation : undefined,
    onCopyInText: typeof onCopyInText === 'function' ? onCopyInText : undefined,
    onCopyQuote: typeof onCopyQuote === 'function' ? onCopyQuote : undefined,
    onEdit: typeof onEditCitation === 'function' ? onEditCitation : undefined,
    onAssignProject: typeof onAssignProject === 'function' ? onAssignProject : undefined,
    onToggleSelect: toggleSelected,
    onRemove: c => removeWithUndo(c),
    onRestore: undefined,
    onPurge: undefined,
  };

  /**
   * The card callbacks for the trash. A removed citation offers exactly two things — back into the
   * library, or gone for good. Everything else is off: it must not be editable (a student would be
   * editing something they cannot see) and it must not be copyable (a citation in the trash has no
   * business landing in an essay), and with no analyser or sentinel it costs nothing to display.
   */
  const trashCardOptions = {
    sentinel: undefined,
    analyser: undefined,
    onInsert: undefined,
    onCopyInText: undefined,
    onCopyQuote: undefined,
    onEdit: undefined,
    onAssignProject: undefined,
    onToggleSelect: undefined,
    onRemove: undefined,
    onRestore: c => restoreFromTrash(c),
    onPurge: c => purgeWithConfirm(c),
  };

  /**
   * The button on `card` doing the same job as `label`, so focus lands on the action the student
   * was already using, one card along. Falls back to the card's first button.
   * @param {Element|null} card
   * @param {string} label
   * @returns {HTMLElement|null}
   */
  function buttonLabelled(card, label) {
    if (!card) {
      return null;
    }
    const buttons = [...card.querySelectorAll('button')];
    return buttons.find(b => b.textContent === label) || buttons[0] || null;
  }

  /**
   * Plan where focus goes when the card holding it is about to be destroyed.
   *
   * This MUST run BEFORE the store call. The store's refresh emits while the handler is suspended
   * at the await, so by the time it resumes the focused button has already been removed from the
   * document and `document.activeElement` is <body> — there is nothing left to read, and a
   * keyboard user has lost their place in the list.
   * @param {HTMLElement} fallback - where to go when no neighbouring card survives
   * @returns {{neighbour: HTMLElement|null, fallback: HTMLElement}|null} null when focus was not on a card
   */
  function planFocusFromCard(fallback) {
    const active = document.activeElement;
    const card = active && active.closest ? active.closest('.assist-cite-card') : null;
    if (!card) {
      return null;
    }
    const label = active.textContent;
    return {
      neighbour:
        buttonLabelled(card.nextElementSibling, label) ||
        buttonLabelled(card.previousElementSibling, label),
      fallback,
    };
  }

  /** Land a planned focus. A neighbour that went in the same batch takes the fallback. */
  function landFocus(plan) {
    if (!plan) {
      return;
    }
    const target = plan.neighbour && plan.neighbour.isConnected ? plan.neighbour : plan.fallback;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  /**
   * Put the focus back where the reconcile found it.
   *
   * Re-inserting a node that contains `document.activeElement` drops the focus on <body> in Chrome,
   * and the list re-appends every surviving card on every reconcile — so the storage echo that
   * arrives a moment after a Remove, an Undo, a Restore or an Edit save silently took a keyboard
   * student's place in the list, ~200 ms after the correct element had been focused. jsdom does not
   * model that blur, which is why the unit tests never saw it.
   * @param {Element|null} previous - what held the focus before the reconcile, or null
   */
  function restoreFocus(previous) {
    if (
      previous &&
      previous.isConnected &&
      document.activeElement !== previous &&
      typeof previous.focus === 'function'
    ) {
      previous.focus();
    }
  }

  /** The control a student should land on when a card is handed the focus. */
  function firstControlOf(card) {
    if (!card) {
      return null;
    }
    // A button, not the select checkbox that opens the card: landing on a checkbox invites Space
    // to tick something the student never asked to select.
    return card.querySelector('button') || card.querySelector('input, select');
  }

  /**
   * Hand the focus to the card for `id` — the citation that has just arrived in the list, so a
   * keyboard student is put ON their new source rather than back at the top of the library.
   * @param {string} id
   * @param {Array} visible - the citations this render drew, in display order
   */
  function focusArrivedCard(id, visible) {
    const index = visible.findIndex(citation => String(citation.id) === id);
    if (index < 0) {
      return;
    }
    const target = firstControlOf(list.el.querySelectorAll('.assist-cite-card')[index]);
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  /**
   * Hand the focus to one citation's card on the caller's say-so.
   *
   * The render below hands it over by itself when a single citation arrives, but NOT while a dialog
   * is open — and the wizard now writes the record before it closes, so the card appears while the
   * student is still inside the dialog and that guard (rightly) declines. The page calls this once
   * the wizard has closed instead, so a keyboard student lands on the source they just saved rather
   * than back on the button that opened the wizard.
   * @param {string} id - the citation to focus
   */
  function focusCitation(id) {
    focusArrivedCard(String(id), visibleNow);
  }

  /**
   * Ids the list was last drawn with, so a render can tell a citation that has just arrived from
   * one that was already on screen. Null until the first paint — every card is new then, and the
   * first paint must never move the focus.
   * @type {Set<string>|null}
   */
  let renderedIds = null;

  /** The search + collection those ids were drawn under; a change means a different list, not news. */
  let renderedViewKey = null;

  /**
   * Say whether one citation actually came back. `store.restore` answers false when the row is
   * gone — purged in another tab, or by Empty trash inside the undo window — and an Undo that
   * silently does nothing is worse than one that admits it cannot.
   * @param {boolean} restored
   * @param {string} successMessage
   */
  function reportRestore(restored, successMessage) {
    if (restored === false) {
      showInfoTray({ message: RESTORE_FAILED, variant: 'error', duration: 5000 });
      return;
    }
    showInfoTray({ message: successMessage, duration: 3000 });
  }

  /** A title short enough for a tray message. */
  function shortTitleOf(citation) {
    const title = String((citation && citation.title) || 'citation');
    return title.length > 40 ? `${title.slice(0, 40)}…` : title;
  }

  /**
   * Remove a citation the undo-first way (SC 3.3.4 — safety net is undo, not a confirm nag):
   * focus is relocated BEFORE the card is destroyed (never dropped on <body>), the removal is
   * announced via the tray's live region, and one click/keypress brings the citation back.
   *
   * The tray is the FAST path, not the safety net. `store.remove` is a soft delete: the citation
   * is in the trash whether or not this tray survives, and the trash view can restore it for the
   * next 30 days. That matters because the tray is a singleton — removing a second citation
   * replaces this one and discards its pending Undo — and before the trash existed that silently
   * made the first removal permanent.
   * @param {Object} citation
   */
  async function removeWithUndo(citation) {
    const snapshot = { ...citation };
    const plan = planFocusFromCard(searchInput);
    await store.remove(citation.id);
    landFocus(plan);
    showInfoTray({
      message: `Removed “${shortTitleOf(snapshot)}”`,
      actionLabel: 'Undo',
      onAction: async () => {
        const restored = await store.restore(snapshot.id);
        reportRestore(restored, `Restored “${shortTitleOf(snapshot)}” to your library`);
      },
      duration: 8000,
    });
  }

  /**
   * Put a removed citation back into the library, and say so — the card vanishing from the trash
   * is not, on its own, feedback a screen-reader user receives.
   * @param {Object} citation
   */
  async function restoreFromTrash(citation) {
    const snapshot = { ...citation };
    const plan = planFocusFromCard(backBtn);
    const restored = await store.restore(citation.id);
    // A restore that found nothing leaves the card exactly where it was, focus included.
    if (restored !== false) {
      landFocus(plan);
    }
    reportRestore(restored, `Restored “${shortTitleOf(snapshot)}” to your library`);
  }

  /**
   * Destroy one removed citation. This is irreversible, so it asks first — the trash is the safety
   * net for Remove, and nothing sits behind this.
   * @param {Object} citation
   */
  async function purgeWithConfirm(citation) {
    const confirmed = window.confirm(
      `Delete “${shortTitleOf(citation)}” permanently? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    const plan = planFocusFromCard(backBtn);
    await store.purge(citation.id);
    landFocus(plan);
    showInfoTray({ message: `Deleted “${shortTitleOf(citation)}” permanently`, duration: 3000 });
  }

  /** Destroy everything in the trash, after asking. */
  async function emptyTrashWithConfirm() {
    const count = (store.getState().trashed || []).length;
    if (count === 0) {
      return;
    }
    const confirmed = window.confirm(
      `Delete ${count} removed citation${count === 1 ? '' : 's'} permanently? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    const purged = await store.emptyTrash();
    backBtn.focus();
    showInfoTray({
      message: `Deleted ${purged} citation${purged === 1 ? '' : 's'} permanently`,
      duration: 3000,
    });
  }

  // ── Multi-select ──────────────────────────────────────────────────────────
  // Filing, clearing and exporting one card at a time is what sends students back to Zotero, so
  // the library selects in batches. The selection is VIEW state: never persisted, never handed to
  // the store, and never holding a citation the student cannot currently see.

  /** Ids (as strings) of the ticked citations. @type {Set<string>} */
  const selectedIds = new Set();

  /** The citations on screen, in display order — the universe the selection lives in. */
  let visibleNow = [];

  /** What the selection was made under; a different search or collection invalidates it. */
  let selectionFilter = store.getState().filter;
  let selectionProjectId = store.getState().activeProjectId;

  const selectionBar = document.createElement('div');
  selectionBar.className = 'assist-cite-selectbar';
  selectionBar.setAttribute('role', 'toolbar');
  selectionBar.setAttribute('aria-label', 'Actions for the citations you have selected');
  selectionBar.hidden = true;

  const selectionCount = document.createElement('p');
  selectionCount.className = 'assist-cite-selectbar__count';
  selectionCount.setAttribute('aria-live', 'polite');
  selectionBar.appendChild(selectionCount);

  /** "3 citations" / "1 citation" — the same phrasing in every batch message. */
  function countPhrase(n) {
    return `${n} citation${n === 1 ? '' : 's'}`;
  }

  /** The selected citations, in the order they appear on screen. */
  function selectedCitations() {
    return visibleNow.filter(citation => selectedIds.has(String(citation.id)));
  }

  /** Called by each card's checkbox. The card already shows the new state — only the bar follows. */
  function toggleSelected(citation, checked) {
    const id = String(citation.id);
    if (checked) {
      selectedIds.add(id);
    } else {
      selectedIds.delete(id);
    }
    syncSelectionUi();
  }

  /** Drop the whole selection and untick every card. */
  function clearSelection() {
    if (selectedIds.size === 0) {
      return;
    }
    selectedIds.clear();
    list.setSelected(selectedIds);
    syncSelectionUi();
  }

  /**
   * Reflect the selection in the toolbar checkbox and the bar. The bar is unhidden BEFORE the count
   * is written: a live region whose text changes while it is display:none announces nothing, so
   * this order is what makes the count reach a screen reader as the bar appears.
   */
  function syncSelectionUi() {
    const total = visibleNow.length;
    const chosen = selectedIds.size;
    selectAllLabel.hidden = total === 0;
    selectAllBox.checked = chosen > 0 && chosen === total;
    selectAllBox.indeterminate = chosen > 0 && chosen < total;
    selectionBar.hidden = chosen === 0;
    selectionCount.textContent = chosen === 0 ? '' : `${chosen} selected`;
  }

  // File the selection into a collection — the reason multi-select exists: twenty stray captures
  // land in the right essay in one move. One store call for the lot, so the list redraws once.
  let fileSelect = null;
  let fileSelectHandler = null;
  if (typeof onAssignProject === 'function') {
    const fileLabel = document.createElement('label');
    fileLabel.className = 'assist-cite-selectbar__filelabel';
    const fileText = document.createElement('span');
    fileText.textContent = 'File into';
    fileSelect = document.createElement('select');
    fileSelect.className = 'assist-cite-btn assist-cite-selectbar__file';
    // Contains the visible label text, so the visible name is part of the accessible name (SC 2.5.3).
    fileSelect.setAttribute('aria-label', 'File into collection');
    fileSelectHandler = () => {
      const projectId = fileSelect.value;
      fileSelect.value = '';
      if (projectId) {
        fileSelectionInto(projectId);
      }
    };
    fileSelect.addEventListener('change', fileSelectHandler);
    fileLabel.appendChild(fileText);
    fileLabel.appendChild(fileSelect);
    selectionBar.appendChild(fileLabel);
  }

  let copyBibCleanup = null;
  if (typeof onCopyBibliography === 'function') {
    const copyBibBtn = document.createElement('button');
    copyBibBtn.type = 'button';
    copyBibBtn.className = 'assist-cite-btn';
    copyBibBtn.textContent = 'Copy bibliography';
    copyBibCleanup = attachAccessibleHandler(copyBibBtn, 'Copy bibliography', () => {
      const chosen = selectedCitations();
      if (chosen.length > 0) {
        onCopyBibliography(chosen);
      }
    });
    selectionBar.appendChild(copyBibBtn);
  }

  let exportSelect = null;
  let exportSelectHandler = null;
  if (typeof onExportCitations === 'function') {
    const exportLabel = document.createElement('label');
    exportLabel.className = 'assist-cite-selectbar__exportlabel';
    const exportText = document.createElement('span');
    exportText.textContent = 'Export as';
    exportSelect = document.createElement('select');
    exportSelect.className = 'assist-cite-btn assist-cite-selectbar__export';
    exportSelect.setAttribute('aria-label', 'Export as');
    for (const [value, label] of EXPORT_FORMATS) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      exportSelect.appendChild(opt);
    }
    exportSelectHandler = () => {
      const format = exportSelect.value;
      exportSelect.value = '';
      const chosen = selectedCitations();
      if (format && chosen.length > 0) {
        onExportCitations(format, chosen);
      }
    };
    exportSelect.addEventListener('change', exportSelectHandler);
    exportLabel.appendChild(exportText);
    exportLabel.appendChild(exportSelect);
    selectionBar.appendChild(exportLabel);
  }

  const removeSelectedBtn = document.createElement('button');
  removeSelectedBtn.type = 'button';
  removeSelectedBtn.className = 'assist-cite-btn assist-cite-btn--ghost';
  removeSelectedBtn.textContent = 'Remove';
  const removeSelectedCleanup = attachAccessibleHandler(removeSelectedBtn, 'Remove', () =>
    removeSelection()
  );
  selectionBar.appendChild(removeSelectedBtn);

  // Escape is the way out of a selection — the same key that closes every other transient state
  // in the extension, and the one a student reaches for when a bar appears unexpectedly.
  const selectionKeydownHandler = event => {
    if (event.key === 'Escape') {
      clearSelection();
    }
  };
  el.addEventListener('keydown', selectionKeydownHandler);

  /** Keep the bar's collection menu in step with the collections the student actually has. */
  function syncFileOptions(projects) {
    if (!fileSelect) {
      return;
    }
    const wanted = [{ value: '', label: 'Choose a collection…' }].concat(
      (Array.isArray(projects) ? projects : []).map(project => ({
        value: String(project.id),
        label: String(project.name),
      }))
    );
    const same =
      fileSelect.options.length === wanted.length &&
      wanted.every(
        (option, i) =>
          fileSelect.options[i].value === option.value &&
          fileSelect.options[i].textContent === option.label
      );
    if (same) {
      return;
    }
    fileSelect.replaceChildren();
    for (const { value, label } of wanted) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      fileSelect.appendChild(option);
    }
  }

  /**
   * File every selected citation into one collection. The store refiles the batch and refreshes
   * once, so the list redraws a single time however many were selected.
   *
   * The selection is always dropped afterwards. Filing ends the job the student selected FOR, and
   * whether the cards stay on screen depends on which collection is being viewed — leaving the
   * selection to that made the outcome unpredictable from the student's side.
   * @param {string} projectId
   */
  async function fileSelectionInto(projectId) {
    const chosen = selectedCitations();
    if (chosen.length === 0) {
      return;
    }
    await store.refileCitations(
      chosen.map(citation => citation.id),
      projectId
    );
    clearSelection();
    const project = (store.getState().projects || []).find(p => String(p.id) === String(projectId));
    showInfoTray({
      message: project
        ? `Filed ${countPhrase(chosen.length)} in “${project.name}”`
        : `Filed ${countPhrase(chosen.length)}`,
      duration: 3000,
    });
  }

  /**
   * Remove every selected citation. Each one is a soft delete into the trash, exactly as the card's
   * own Remove is — but the student pressed one button, so they get ONE tray whose Undo brings the
   * whole batch back. (The tray is the fast path; the trash is the safety net for all 30 days.)
   */
  async function removeSelection() {
    const chosen = selectedCitations();
    if (chosen.length === 0) {
      return;
    }
    const ids = chosen.map(citation => citation.id);
    // The bar goes when the selection empties, taking the pressed button with it, and every card
    // in the batch is destroyed — so focus is planned here, while the list is still standing, at
    // the first card that is staying. planFocusFromCard is no help: the focus is on the bar, and
    // the neighbouring cards may be in the batch too.
    const focusWasInView = el.contains(document.activeElement);
    const stayingIndex = visibleNow.findIndex(citation => !selectedIds.has(String(citation.id)));
    const stayingCard =
      stayingIndex >= 0 ? list.el.querySelectorAll('.assist-cite-card')[stayingIndex] : null;
    const plan = { neighbour: buttonLabelled(stayingCard, 'Remove'), fallback: searchInput };

    for (const id of ids) {
      await store.remove(id);
    }
    if (focusWasInView) {
      landFocus(plan);
    }

    showInfoTray({
      message: `Removed ${countPhrase(ids.length)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        let restored = 0;
        for (const id of ids) {
          if ((await store.restore(id)) !== false) {
            restored += 1;
          }
        }
        // Say how many came back: some may have been purged (another tab, or Empty trash) since
        // the batch was removed, and a partial undo that looks total is a lie about the library.
        if (restored === ids.length) {
          showInfoTray({ message: `Restored ${countPhrase(restored)}`, duration: 3000 });
        } else {
          showInfoTray({
            message:
              `Restored ${restored} of ${countPhrase(ids.length)} — ` +
              'the rest were deleted permanently',
            variant: 'error',
            duration: 5000,
          });
        }
      },
      duration: 8000,
    });
  }

  el.appendChild(selectionBar);
  el.appendChild(list.el);

  // ── Render function (called by the subscription and once at construction) ─

  /**
   * Sync the view to a state snapshot emitted by the store.
   * @param {Object} snapshot - from store.getState()
   */
  function render(snapshot) {
    // Who holds the focus while the list redraws. Captured before anything is touched: the reconcile
    // moves every surviving card, which in Chrome blurs whatever inside them was focused.
    const active = document.activeElement;
    const heldFocus = active && el.contains(active) ? active : null;

    // Reflect loading state without touching other DOM content.
    if (snapshot.loading) {
      el.setAttribute('aria-busy', 'true');
    } else {
      el.removeAttribute('aria-busy');
    }

    // The trash replaces the toolbar with its own panel: searching, sorting and styling belong to
    // the library, and a removed citation is not being cited.
    const inTrash = snapshot.view === 'trash';
    toolbar.hidden = inTrash;
    trashPanel.hidden = !inTrash;

    if (inTrash) {
      // Nothing on its way out is selectable: the trash cards carry no checkbox, so a selection
      // made in the library must not survive the switch.
      selectedIds.clear();
      visibleNow = [];
      syncSelectionUi();
      const trashed = snapshot.trashed || [];
      emptyTrashBtn.disabled = trashed.length === 0;
      list.setCitations(trashed, {
        ...trashCardOptions,
        style: snapshot.style,
        // A removed citation is in nobody's reference list, so it is formatted on its own.
        referencePool: [],
        projects: [],
        emptyMessage:
          'Nothing in Recently removed. Citations you remove from your library wait here ' +
          `for ${TRASH_RETENTION_DAYS} days.`,
      });
      restoreFocus(heldFocus);
      // The library list is not on screen, so what it last drew is no longer known.
      renderedIds = null;
      renderedViewKey = null;
      return;
    }

    // A different search or collection means a different set on screen, so a selection made under
    // the old one no longer means what the student intended. Sorting and restyling change neither.
    if (
      snapshot.filter !== selectionFilter ||
      String(snapshot.activeProjectId) !== String(selectionProjectId)
    ) {
      selectedIds.clear();
    }
    selectionFilter = snapshot.filter;
    selectionProjectId = snapshot.activeProjectId;

    const visible = sortCitations(store.getVisibleCitations());
    visibleNow = visible;

    // Drop anything that has left the list — removed, filed elsewhere, edited out of the filter.
    // The count must never claim more than the student can see.
    const onScreen = new Set(visible.map(citation => String(citation.id)));
    for (const id of [...selectedIds]) {
      if (!onScreen.has(id)) {
        selectedIds.delete(id);
      }
    }

    // Which citations are new to the list this render, and who owns the focus while it redraws.
    // "New citation saved" hands the focus on: the wizard has just given it back to the button that
    // opened it, and the student's source is now on screen.
    // A citation only counts as ARRIVED when the student did not change what they are looking at:
    // a search or a collection landing on a single match is a different list, not a new source.
    const viewKey = JSON.stringify([snapshot.filter, snapshot.activeProjectId]);
    const sameView = viewKey === renderedViewKey;
    const firstPaint = renderedIds === null;
    const ids = visible.map(citation => String(citation.id));
    const arrived = firstPaint || !sameView ? [] : ids.filter(id => !renderedIds.has(id));
    renderedIds = new Set(ids);
    renderedViewKey = viewKey;
    const focusOwner = heldFocus === newBtn ? null : heldFocus;

    // Update the diffed list and forward the current style so card references reformat. The empty
    // message is search-aware: "no matches" while filtering must never read as "library is empty".
    list.setCitations(visible, {
      ...libraryCardOptions,
      style: snapshot.style,
      // The whole library, not just what is on screen: each card formats itself within its own
      // collection, so a search cannot change the year letter a reference carries.
      referencePool: snapshot.citations,
      // Cards need the current collections so a newly created one is immediately pickable.
      projects: snapshot.projects,
      emptyMessage: snapshot.filter
        ? `No matches for “${snapshot.filter}”. Clear the search to see all your citations.`
        : 'No saved citations yet. Capture a source to get started.',
    });

    // Exactly one new citation, and nobody in the list was using the focus: it belongs on the card
    // that just arrived — a saved new source, or one brought back by Undo or Restore. An open dialog
    // keeps it: a citation added in another tab must not yank the focus out of the wizard.
    const handOver =
      arrived.length === 1 && !focusOwner && !document.querySelector('[role="dialog"]');

    if (handOver) {
      focusArrivedCard(arrived[0], visible);
    } else {
      // The reconcile moves every surviving card, which in Chrome blurs whatever inside them held
      // the focus. Put it back before anything else can notice it went. (Not when the focus is being
      // handed to a new card: restoring it first would announce two elements in a row.)
      restoreFocus(heldFocus);
    }

    // Re-apply the selection: the list may have created fresh cards for citations that were
    // already ticked, and a card's checkbox only knows what it is told.
    list.setSelected(selectedIds);
    syncFileOptions(snapshot.projects);
    syncSelectionUi();

    // Keep the radiogroup in sync when style changed outside this view (programmatic,
    // does NOT fire onChange — no feedback loop).
    switcher.setStyle(snapshot.style);

    // Give the switcher a representative citation for the live preview.
    switcher.setCitation(
      visible[0] || null,
      visible[0] ? referenceSetFor(visible[0], snapshot.citations) : []
    );

    // Mirror the filter into the search box when it has drifted. While the box has focus, only a
    // change to the filter itself counts (All citations or a tag chip, pressed with the mouse, which
    // leaves the focus in the box): an emit for any other reason must not clobber what is typed.
    // Uses an explicit focus flag (set by focus/blur listeners) rather than document.activeElement
    // to ensure reliability in both browsers and jsdom.
    const filterChanged = snapshot.filter !== lastFilter;
    lastFilter = snapshot.filter;
    if ((!searchFocused || filterChanged) && searchInput.value !== snapshot.filter) {
      searchInput.value = snapshot.filter;
    }
  }

  // ── Initial render (before the first emit) ───────────────────────────────

  render(store.getState());

  // ── Subscribe for subsequent changes ──────────────────────────────────────

  const unsubscribe = store.subscribe(render);

  // ── destroy ───────────────────────────────────────────────────────────────

  /**
   * Unsubscribe from the store and tear down all child components.
   * The el is left in place for the caller to remove.
   */
  function destroy() {
    unsubscribe();
    searchInput.removeEventListener('input', searchInputHandler);
    searchInput.removeEventListener('focus', searchFocusHandler);
    searchInput.removeEventListener('blur', searchBlurHandler);
    sortSelect.removeEventListener('change', sortHandler);
    selectAllBox.removeEventListener('change', selectAllHandler);
    el.removeEventListener('keydown', selectionKeydownHandler);
    if (fileSelect) {
      fileSelect.removeEventListener('change', fileSelectHandler);
    }
    if (exportSelect) {
      exportSelect.removeEventListener('change', exportSelectHandler);
    }
    if (copyBibCleanup) {
      copyBibCleanup();
    }
    removeSelectedCleanup();
    newBtnCleanup();
    backBtnCleanup();
    emptyTrashCleanup();
    list.destroy();
    switcher.destroy();
  }

  // ── Public interface ──────────────────────────────────────────────────────

  return { el, focusCitation, destroy };
}
