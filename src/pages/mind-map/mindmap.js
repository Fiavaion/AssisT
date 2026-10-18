/**
 * The mind map page: the library when no map is named in the URL, the editor when one is.
 *
 * This file is wiring only. The model, the operations, the history and the layout are plain
 * JavaScript under `src/features/mindMap/core/` (ADR 0001), the store is `mindmap-db.js`, and each
 * pane is its own module mounted over one shared history and one shared selection — so undo,
 * autosave and the keyboard map are written once and both views inherit them.
 *
 * Adding a pane is one import and one line in `mountEditorModules`.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { applySettingWrites } from '../../utils/setting-writes.js';
import { loadAndApplyTheme } from '../../popup/theme.js';
import { saveCard } from '../../features/flashcards/flashcards-store.js';

import { isBranchView } from '../../features/mindMap/core/branch-view.js';
import { createHistory } from '../../features/mindMap/core/history.js';
import { MindMapError } from '../../features/mindMap/core/map-model.js';
import { pathTo, setTitle, subtreeIds, walk } from '../../features/mindMap/core/map-ops.js';
import { templateById } from '../../features/mindMap/core/templates.js';
import {
  deleteMap,
  getMap,
  listMaps,
  onMapsChanged,
  saveMap,
} from '../../features/mindMap/mindmap-db.js';

import { createAutosave } from './autosave.js';
import { createSelection } from './selection.js';
import { mountBranchFocus } from './branch-focus.js';
import { mountAiPanel } from './ai-panel.js';
import { mountReadAloud } from './read-aloud.js';
import { mountStudyMode } from './study-mode.js';
import { mountLibraryView } from './library-view.js';
import { mountOutlinePane } from './outline-pane.js';
import { mountShortcutsDialog } from './shortcuts-dialog.js';
import { consumesKey, isTextField } from './text-fields.js';
import {
  matchesBinding,
  matchesBindingWithShift,
  stopWatchingBindings,
  watchBindings,
} from './shortcut-bindings.js';
import { mountCanvasPane } from './canvas-pane.js';
import { mountInspector } from './inspector.js';
import { mountFileMenu } from './file-menu.js';
import {
  SELECT_A_NODE_FIRST,
  centreNotDeletedSentence,
  deletedNodesSentence,
  effectiveSet,
  nameOf,
  noSiblingsSentence,
} from './node-edits.js';
import { findCountSentence, outsideBranchSentence } from './focus-sentences.js';
import { rememberImportOutcome, takeImportOutcome } from './import-flow.js';
import { mountNewMapDialog } from './new-map-dialog.js';
import { mountOpenMapDialog } from './open-map-dialog.js';
import { mountSaveAsDialog } from './save-as-dialog.js';

/** Quiet time after the last change before the map is written. */
const AUTOSAVE_MS = 600;

/** Quiet time after the last selection change before the count is read out. */
const COUNT_SETTLE_MS = 150;

/** How long a failure stays on screen. */
const TOAST_MS = 8000;

/** Outline dock width in pixels: the floor, the step an arrow key takes, and the ceiling's share. */
const WIDTH_MIN = 240;
const WIDTH_STEP = 16;
const WIDTH_SHARE = 0.5;

/** The right dock's tabs, in the order they are shown. */
const DOCK_TABS = ['details', 'ai', 'study'];

const el = id => document.getElementById(id);
const newId = () => crypto.randomUUID();

const live = el('assist-mm-live');
const status = el('assist-mm-status');
const toast = el('assist-mm-toast');
const reloadButton = el('assist-mm-reload');
const libraryHost = el('assist-mm-library-host');
const editorHost = el('assist-mm-editor');
const titleInput = el('assist-mm-title-input');
const titleStatic = el('assist-mm-title-static');
const banner = el('assist-mm-banner');
const findInput = el('assist-mm-find');
const findStatus = el('assist-mm-find-status');
const separator = el('assist-mm-separator');
const layoutGrid = el('assist-mm-layout-grid');
const layoutSelect = el('assist-mm-layout');

const shortcuts = mountShortcutsDialog(el('assist-mm-dialog-host'));

/** Everything the editor holds while a map is open; null in the library. */
let editor = null;

/** The library list, mounted instead of the editor when no map is named; null in the editor. */
let library = null;

let toastTimer = null;

/** Set once `teardownEditor` has run, so a second `pagehide` cannot destroy a pane twice. */
let tornDown = false;

/**
 * Say something in the page's live region. Re-setting the same text would say nothing, so the
 * region is cleared first — a student who deletes two nodes in a row needs to hear both.
 * @param {string} text
 */
function announce(text) {
  live.textContent = '';
  live.textContent = text;
}

/**
 * @param {string} text
 * @param {{warn?: boolean}} [options]
 */
function setStatus(text, { warn = false } = {}) {
  status.textContent = text;
  status.classList.toggle('assist-mm-status--warn', warn);
}

/**
 * Show a message that has to be noticed — a save that did not happen, a file that did not arrive.
 *
 * The toast is hidden until there is something to say, and text written into a hidden `role="status"`
 * is text a screen reader never hears. So every toast is said in the live region as well: the
 * sighted student sees it, everyone else is told it, and neither depends on the other.
 *
 * A failure says so in words. `data-kind` is there for the stylesheet, but a red border is a
 * distinction only a sighted student who can tell red from grey receives (SC 1.4.1), so the prefix
 * carries it too — in the toast and in the live region alike.
 *
 * @param {string} text
 * @param {'info'|'error'} [kind]
 */
function showToast(text, kind = 'info') {
  const message = kind === 'error' ? `Problem: ${text}` : text;
  toast.dataset.kind = kind;
  toast.textContent = message;
  toast.hidden = false;
  announce(message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, TOAST_MS);
}

/**
 * Show the strip under the header, or leave it away.
 *
 * An empty banner is a strip of colour with a Dismiss button in it and nothing to dismiss, which
 * is what this page shipped: `.assist-mm-banner` set `display: flex`, and an author rule beats the
 * browser's own `[hidden] { display: none }` at equal specificity, so the element was drawn
 * whatever its `hidden` attribute said. The stylesheet now states `[hidden]` for the whole page,
 * and this is the only way the banner is ever written to — so it cannot be shown without words in
 * it, whatever a caller passes.
 *
 * @param {string} text - blank hides the banner.
 */
function showBanner(text) {
  const message = String(text || '').trim();
  if (message === '') {
    // Dismiss is inside the strip it removes, so the press that hides it would leave the keyboard
    // nowhere. The main region takes it: it is where the map is, and Tab carries on from there.
    rescueFocus(banner, el('assist-mm-main'));
  }
  el('assist-mm-banner-text').textContent = message;
  banner.hidden = message === '';
}

/**
 * Take the keyboard out of something about to be hidden.
 *
 * A hidden element cannot hold focus: Chrome drops it on `<body>`, which is the top of the page
 * with the student's place lost. Every control on this page that hides the thing it is standing in
 * — the banner's own Dismiss button, the Reload button an autosave takes away, a dock closing on a
 * resize — calls this on the way.
 *
 * @param {HTMLElement} container - hidden, or about to be.
 * @param {HTMLElement} fallback - where the keyboard goes if it was inside.
 */
function rescueFocus(container, fallback) {
  if (container.contains(document.activeElement)) {
    fallback.focus();
  }
}

/**
 * Ask an element to take the keyboard, and say whether it did.
 *
 * Asked rather than assumed: Chrome refuses focus into a hidden subtree, so a `focus()` on a row in
 * a shut dock leaves the keyboard exactly where it was — which, when the element it was on has just
 * been removed, is `<body>`.
 *
 * @param {HTMLElement|null} element
 * @returns {boolean}
 */
function takeFocus(element) {
  if (!element) {
    return false;
  }
  element.focus();
  return document.activeElement === element;
}

/** @param {string} id - the map to open, by reloading the page at its URL. */
function openMap(id) {
  location.assign(`?map=${encodeURIComponent(id)}`);
}

/** The library is this page with no map named in the address. */
function goToLibrary() {
  location.assign('?');
}

// ── The library ─────────────────────────────────────────────────────────────

/**
 * @param {string} templateId
 * @param {string} title
 * @returns {Promise<string>} the new map's id
 */
async function createFromTemplate(templateId, title) {
  const template = templateById(templateId);
  if (!template) {
    throw new Error('That template is no longer available.');
  }
  const stored = await saveMap(template.build(title, newId));
  return stored.id;
}

/**
 * @param {string} id
 * @param {string} title
 * @returns {Promise<void>}
 */
async function renameMap(id, title) {
  const map = await getMap(id);
  if (!map) {
    throw new Error('That map is no longer here.');
  }
  await saveMap(setTitle(map, { title }));
}

/**
 * Store a map that came from a file, never over one already here.
 *
 * A JSON export carries the id of the map it came from, so importing one without this would
 * silently overwrite that map. A file always arrives as a new map.
 *
 * @param {Object} map
 * @returns {Promise<string>} the stored map's id
 */
async function storeImported(map) {
  const fresh = (await getMap(map.id)) ? { ...map, id: newId() } : map;
  const stored = await saveMap(fresh);
  return stored.id;
}

/**
 * Open the map a file became — the one ending for both ways in.
 *
 * The editor's File menu and the library's Import button hand their map here. Leaving a map that
 * has unsaved changes writes it first, and a write that fails keeps the student where they are
 * rather than losing the branch they just typed; from the library there is no map to save.
 *
 * The sentence saying what came in cannot be said here: opening the new map replaces this page, so
 * a live region written now is read by nobody. It travels with the navigation instead, and `start`
 * shows it once the editor is up.
 *
 * @param {Object} map - as an importer built it.
 * @param {string} sentence - what to tell the student once the map is on screen.
 * @returns {Promise<void>}
 * @throws {MindMapError} when the map could not be stored, in words the student can read.
 */
async function openImported(map, sentence) {
  if (editor) {
    try {
      await requireSaved();
    } catch {
      // The autosave has already said why, in the status line and in a toast.
      return;
    }
  }
  let id;
  try {
    id = await storeImported(map);
  } catch (problem) {
    // A file that read and then would not store is a file the student watched disappear.
    throw new MindMapError(
      'NOT_STORED',
      `'${map.title}' was read but could not be saved: ${problem.message}`
    );
  }
  rememberImportOutcome(sentence);
  openMap(id);
}

function openLibrary() {
  document.title = 'AssisT — Your mind maps';
  titleStatic.textContent = 'Your mind maps';
  titleStatic.hidden = false;
  titleInput.hidden = true;
  libraryHost.hidden = false;
  editorHost.hidden = true;

  library = mountLibraryView(libraryHost, {
    listMaps,
    deleteMap,
    renameMap,
    createFromTemplate,
    onImport: openImported,
    onOpen: openMap,
    announce,
    notify: showToast,
    // A capture from a page, or an edit in another tab, writes to the database this list came from.
    subscribeMapsChanged: onMapsChanged,
  });

  setStatus('');
}

// ── The editor ──────────────────────────────────────────────────────────────

/**
 * @param {number} at - epoch ms
 * @returns {string} the status line's own words, so the screen and the live region agree.
 */
const savedAt = at =>
  `Saved ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

/**
 * Write the map now, and say so.
 *
 * Ctrl+S and the File menu's Save both come here. The autosave already puts the outcome in the
 * status line, but a status line is not read out: a student who cannot see it pressed Save and
 * heard nothing at all. A failure announces itself through its toast, so only success is said here.
 *
 * @returns {Promise<void>}
 */
async function saveNow() {
  await editor.autosave.saveNow();
  if (editor.saveState.status !== 'error') {
    announce(savedAt(editor.saveState.at));
  }
}

/**
 * Write anything held only in memory before this page goes somewhere else.
 *
 * Every File menu command that leaves this map — New, Open, Save as, Import — comes through here.
 * `pagehide` flushes the autosave on the way out, but a save that fails there fails silently on a
 * page already going, so a map that could not be written is one the student keeps looking at.
 *
 * @returns {Promise<void>}
 * @throws {Error} when the map could not be written, so no caller navigates away from it.
 */
async function requireSaved() {
  if (!editor.autosave.isDirty()) {
    return;
  }
  await editor.autosave.saveNow();
  if (editor.autosave.isDirty()) {
    // A keystroke that landed while the write was out is not on disk: the autosave folds it into
    // a follow-up rather than into the write already in flight. One more pass catches up with a
    // student who has stopped typing; a second still-dirty answer is a refusal, not a third try.
    await editor.autosave.saveNow();
  }
  if (editor.saveState.status === 'error' || editor.autosave.isDirty()) {
    const reason =
      editor.saveState.status === 'error'
        ? editor.saveState.message
        : 'the last change has not been written yet';
    throw new Error(
      `This map has changes that are not saved (${reason}), so it is staying on screen.`
    );
  }
}

/**
 * Write the open map again as a map of its own.
 *
 * A fresh map id and the student's title. The node ids are left as they are: nothing outside a map
 * refers to them, and renumbering would only make the copy harder to line up against the original.
 *
 * @param {string} title
 * @returns {Promise<string>} the copy's id
 */
async function saveCopy(title) {
  const copy = setTitle(
    { ...editor.history.current(), id: newId(), createdAt: Date.now() },
    { title }
  );
  const stored = await saveMap(copy);
  return stored.id;
}

/**
 * Mount every pane over one history and one selection.
 *
 * This is the seam: a new pane is one import at the top of this file and one entry here.
 *
 * @param {Object} context
 * @param {Object} context.history - the REAL history: every write, the autosave and the exports.
 * @param {Object} context.view - the branch-focus handle. `view.history` is the same contract over
 *   whatever is on screen, and it is what every pane that DRAWS the map is given, so that focusing
 *   on one branch needs no pane to know focus mode exists.
 * @param {Object} context.selection
 * @param {() => 'map'|'tree'} context.getLayoutMode
 * @param {boolean} context.reducedMotion
 * @param {string} context.mapId - the map on screen, marked in the Open dialog's list.
 * @param {Object|null} context.mapSource - the page the map was built from, for AI generation.
 * @param {Object} context.settings - the stored `assist_settings`, read once when the map opened.
 * @returns {Object} every mounted pane by name. The page keeps all of them: the canvas because it
 *   fits the view and hands the File menu its picture, and the rest because a page that mounts a
 *   dozen things and remembers one cannot take any of them down again.
 */
function mountEditorModules({
  history,
  view,
  selection,
  getLayoutMode,
  reducedMotion,
  mapId,
  mapSource,
  settings,
}) {
  const outline = mountOutlinePane(el('assist-mm-outline-host'), {
    history: view.history,
    selection,
    announce,
    // A repair or a refusal this pane makes is a change to the student's own words that nothing on
    // screen explains, so those two sentences are shown as well as said.
    notify: showToast,
    newId,
    // Escape unwinds what is nearest first: a set, then the branch the student has narrowed down
    // to, and only then the outline itself.
    onEscape: () => {
      if (!view.isOn()) {
        return false;
      }
      view.leave();
      return true;
    },
  });

  const canvas = mountCanvasPane(el('assist-mm-canvas-host'), {
    history: view.history,
    selection,
    announce,
    // The name it puts back, and the drop it refuses: a node springing back to where it was is not
    // an explanation, and the live region is not read by the student watching it happen.
    notify: showToast,
    getLayoutMode,
    reducedMotion,
    // The outline is the editor (ADR 0001), so it owns making a node. The canvas's quick-add handles
    // are a second way to ASK, not a second way to do it.
    createNode: (id, addOptions) => outline.addNode(id, addOptions),
    rescueFocus: sendKeyboardTo,
  });

  // The REAL history, not the view: the Details panel edits the node the student has selected, and
  // "Move to…" has to offer the WHOLE map as a destination. Sending a node out of the branch you are
  // working on is a legitimate thing to want, and the view says where it went afterwards.
  const inspector = mountInspector(el('assist-mm-inspector-host'), {
    history,
    selection,
    announce,
    // The name the Text field puts back when it is emptied: seen as well as said.
    notify: showToast,
    // A node moved from the Details panel usually lands somewhere the student cannot see from here.
    reveal: id => canvas.ensureVisible(id),
    branchFocus: view,
  });

  // The File menu's four map commands are dialogs and a write; the menu owns neither, so they are
  // mounted here and handed to it as callbacks. Each one that leaves this map saves it first, and
  // a save that fails keeps the student where they are rather than losing the branch they wrote.
  const dialogHost = el('assist-mm-dialog-host');

  const newMapDialog = mountNewMapDialog(dialogHost, {
    onCreate: async (templateId, title) => {
      await requireSaved();
      const id = await createFromTemplate(templateId, title);
      announce(`Created ${title}.`);
      openMap(id);
    },
  });

  const openMapDialog = mountOpenMapDialog(dialogHost, {
    listMaps,
    currentMapId: mapId,
    onOpen: async id => {
      try {
        await requireSaved();
      } catch {
        // The autosave has already said why, in the status line and in a toast.
        return;
      }
      openMap(id);
    },
    onGoToLibrary: async () => {
      try {
        await requireSaved();
      } catch {
        return;
      }
      goToLibrary();
    },
  });

  const saveAsDialog = mountSaveAsDialog(dialogHost, {
    onSaveAs: async title => {
      await requireSaved();
      openMap(await saveCopy(title));
    },
  });

  // The real history again: an export is of the whole map, whatever is on screen.
  const fileMenu = mountFileMenu(el('assist-mm-file-host'), {
    history,
    getSvgElement: () => canvas.getSvgElement(),
    announce,
    // An export that failed is a file that never arrived; saying it in the live region alone would
    // leave everyone else looking at an unchanged screen.
    notify: showToast,
    onImport: openImported,
    onNew: () => newMapDialog.open(),
    onOpen: () => openMapDialog.open(),
    onSave: () => saveNow(),
    onSaveAs: () => saveAsDialog.open(history.current().title),
  });

  // The three additive tools. Every one of them is optional: the map is built, edited, saved and
  // exported without any of them, and the AI panel says so in words when no provider is set up.
  // Two of them are dock tabs and the third is a pair of toolbar buttons.

  // Study mode is mounted last, but the AI panel needs to hand it the questions it produces. No
  // panel can be pressed before this function returns, so the reference is always filled in by the
  // time the closure runs.
  const tools = {};

  const ai = mountAiPanel(el('assist-mm-ai-host'), {
    history: view.history,
    selection,
    announce,
    mapSource,
    newId,
    // The questions are useless in the tab the student cannot see, and leaving focus in the AI
    // panel as it is hidden would put them on `<body>`. The Study tab comes forward and takes the
    // keyboard with it; `startWithQuestions` then moves it on to the first question.
    onQuestions: list => {
      editor.dock.showTab('study', { focus: true });
      tools.study.startWithQuestions(list);
    },
  });

  const readAloud = mountReadAloud(el('assist-mm-read-host'), {
    history: view.history,
    selection,
    announce,
    getSettings: () => settings,
    // Alt+R is a page-wide key. A voice that starts over a question the student is reading, or
    // underneath the modal shortcuts list, is a voice whose stop button they cannot find.
    //
    // What is on screen decides it, not what is merely still going on: a practice session the
    // student has tabbed away from used to leave Alt+R dead across the whole page, with nothing
    // anywhere to say why. So the block lasts exactly as long as the Study tab is the one showing.
    isBlocked: () => Boolean(editor.dock?.isShowing('study')) || shortcuts.isOpen(),
  });

  tools.study = mountStudyMode(el('assist-mm-study-host'), {
    history: view.history,
    selection,
    announce,
    saveFlashcard: saveCard,
  });

  return {
    outline,
    canvas,
    inspector,
    fileMenu,
    newMapDialog,
    openMapDialog,
    saveAsDialog,
    ai,
    readAloud,
    study: tools.study,
  };
}

/**
 * The student's stored settings. Read once when a map opens: the layout, and the TTS voice the
 * read-aloud tool speaks in, both come out of the same object.
 *
 * @returns {Promise<Object>} `assist_settings`, or an empty object when it cannot be read.
 */
async function readSettings() {
  try {
    const stored = await chrome.storage.local.get('assist_settings');
    return stored?.assist_settings || {};
  } catch {
    return {};
  }
}

/**
 * Open a map in the editor.
 * @param {string} mapId
 * @param {{fromPage: boolean}} options
 * @returns {Promise<void>}
 */
async function openEditor(mapId, { fromPage }) {
  const map = await getMap(mapId);
  if (!map) {
    libraryHost.hidden = true;
    editorHost.hidden = true;
    titleStatic.textContent = 'That map is not here';
    setStatus(
      'The map in this address has been deleted. Open the library to see the maps you have.',
      {
        warn: true,
      }
    );
    announce('That map could not be found.');
    return;
  }

  document.title = `AssisT — ${map.title}`;
  libraryHost.hidden = true;
  editorHost.hidden = false;
  titleStatic.hidden = true;
  titleInput.hidden = false;
  titleInput.value = map.title;

  const history = createHistory(map, { now: () => Date.now() });
  // Given the history, so a node the map loses — to an undo, an import, a delete in another pane —
  // is never left in the selection for a pane to draw a ring round.
  const selection = createSelection(map.rootId, { history });
  // Mounted before the panes, so its one subscription to the history runs before theirs: a pane is
  // never asked to draw a branch the map has just lost.
  const view = mountBranchFocus(el('assist-mm-crumbs-host'), {
    history,
    selection,
    announce,
    notify: showToast,
    rescueFocus: sendKeyboardTo,
  });
  const settings = await readSettings();
  let layoutMode = settings.mindMap?.layout === 'tree' ? 'tree' : 'map';
  layoutSelect.value = layoutMode;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const autosave = createAutosave({
    delay: AUTOSAVE_MS,
    save: async () => {
      const stored = await saveMap(history.current());
      editor.lastSavedAt = stored.updatedAt;
      return stored;
    },
    onStateChange: state => {
      // Kept so Ctrl+S and the File menu can say what happened; the autosave reports its outcome
      // once, and a caller that read the status line back out of the DOM would be reading a string
      // written for the eye.
      editor.saveState = state;
      if (state.status === 'saving') {
        setStatus('Saving…');
        return;
      }
      if (state.status === 'saved') {
        setStatus(savedAt(state.at));
        // The offer to reload goes when there is nothing left to reload for, and a student may be
        // standing on it: it appeared because another tab changed this map under them.
        rescueFocus(reloadButton, el('assist-mm-main'));
        reloadButton.hidden = true;
        return;
      }
      if (state.status === 'error') {
        setStatus(`Not saved: ${state.message}`, { warn: true });
        showToast(`this map could not be saved — ${state.message}`, 'error');
        return;
      }
      setStatus('Unsaved changes');
    },
  });

  editor = {
    mapId,
    history,
    view,
    selection,
    autosave,
    panes: null,
    dock: null,
    separator: null,
    toolbar: null,
    lastSavedAt: map.updatedAt,
    saveState: { status: 'saved', at: map.updatedAt, message: null },
  };

  editor.panes = mountEditorModules({
    history,
    view,
    selection,
    getLayoutMode: () => layoutMode,
    reducedMotion,
    mapId,
    mapSource: map.source,
    settings,
  });

  history.subscribe(() => {
    autosave.markDirty();
    refreshToolbar();
    if (titleInput.value !== history.current().title) {
      titleInput.value = history.current().title;
    }
  });
  selection.subscribe(refreshToolbar);
  selection.subscribe(sayCount);
  refreshToolbar();

  if (fromPage && map.source) {
    // A map built from a page that named neither itself nor its address has nothing to say here,
    // and "Built from ." is worse than no banner at all.
    const from = String(map.source.title || map.source.url || '').trim();
    showBanner(from === '' ? '' : `Built from ${from}. Headings became branches.`);
    // Drop the flag so a reload does not show the banner a second time.
    window.history.replaceState({}, '', `?map=${encodeURIComponent(mapId)}`);
  }

  setStatus(savedAt(map.updatedAt));

  /** Layout is a preference, so it is stored the moment it changes. */
  layoutSelect.addEventListener('change', async () => {
    layoutMode = layoutSelect.value === 'tree' ? 'tree' : 'map';
    // The picture first, and before the write is awaited: the student is looking at the map, and
    // a preference that could not be stored is no reason to leave it as it was. The mode is not
    // part of the map, so no history change tells the canvas: it has to be asked.
    editor.panes.canvas.redraw();
    editor.panes.canvas.fitToView();
    await applySettingWrites([{ path: 'mindMap.layout', value: layoutMode }]);
    announce(
      layoutMode === 'tree' ? 'Layout: tree, left to right' : 'Layout: map, branches both ways'
    );
  });

  titleInput.addEventListener('change', () => {
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.value = history.current().title;
      return;
    }
    history.apply('setTitle', { title });
    document.title = `AssisT — ${title}`;
  });
  titleInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInput.blur();
    }
  });
}

/** How many nodes were selected when the count was last read out. */
let saidCount = 1;

let countTimer = null;

/**
 * Say how many nodes are selected, once the keys have settled.
 *
 * Held Shift+Down is a burst of selection changes and reading every one of them out would bury the
 * student in numbers, so the count waits for the last of them. It is said only when it crosses
 * between one node and several: a student moving from row to row with the arrows already knows where
 * they are, and being told "1 node selected" on every press would be noise. Through the live region
 * alone, never a toast: a selection is not an outcome.
 *
 * @param {string|null} id - the primary, as the store reports it.
 * @param {{said?: boolean}} meta - `said` when the act that moved the selection has already
 *   announced what it did, and a count over the top of it would be a second thing to read.
 */
function sayCount(id, meta) {
  clearTimeout(countTimer);
  if (meta && meta.said) {
    saidCount = editor?.selection.ids().length ?? 1;
    return;
  }
  countTimer = setTimeout(() => {
    const ids = editor?.selection.ids() || [];
    const was = saidCount;
    saidCount = ids.length;
    if (ids.length > 1) {
      announce(`${ids.length} nodes selected.`);
      return;
    }
    if (was > 1 && ids.length === 1) {
      const node = editor.history.current().nodes[ids[0]];
      announce(`1 node selected: '${nameOf(node && node.text)}'.`);
    }
  }, COUNT_SETTLE_MS);
}

/**
 * Why each toolbar command cannot act, or '' when it can.
 *
 * Delete acts on the whole selection, so its reason is about the whole selection: a set that holds
 * the centre and three branches can still be deleted, and only a selection that is nothing but the
 * centre cannot. New child, New sibling and rename act on the primary alone and say nothing special
 * about the rest — the student asked to add one node, not four.
 *
 * Asked of what is on SCREEN, not of the whole map. Focused on one branch, the top of that branch is
 * the node these rules fall on — it has no siblings here, and deleting the thing you are looking at
 * from inside it is not a thing this can do — and each sentence says so in those words rather than
 * calling it the centre of the map, which it is not.
 *
 * @returns {Object<string, string>} keyed by button id.
 */
function toolbarReasons() {
  const { history, selection, view } = editor;
  const map = view.history.current();
  const branch = isBranchView(map);
  const selected = selection.get();
  const nothingChosen = selected ? '' : SELECT_A_NODE_FIRST;
  const isRoot = selected === map.rootId;
  const nothingToDelete = selection.ids().every(id => id === map.rootId);
  return {
    'assist-mm-undo': history.canUndo() ? '' : 'Nothing to undo yet.',
    'assist-mm-redo': history.canRedo() ? '' : 'Nothing to redo.',
    'assist-mm-new-child': nothingChosen,
    'assist-mm-new-sibling': nothingChosen || (isRoot ? noSiblingsSentence(branch) : ''),
    'assist-mm-delete': nothingChosen || (nothingToDelete ? centreNotDeletedSentence(branch) : ''),
    'assist-mm-focus': view.reason(),
  };
}

/**
 * Say what each toolbar command can do now.
 *
 * `aria-disabled` rather than `disabled`: a disabled button is out of the tab order, so a student
 * driving the toolbar from the keyboard never reaches the control that is refusing them and is
 * never told why. Every reason is written into the span the button describes itself by, which is
 * also where `wireToolbarCommand` reads it back from — one sentence, in one place.
 */
function refreshToolbar() {
  for (const [id, reason] of Object.entries(toolbarReasons())) {
    el(id).setAttribute('aria-disabled', String(reason !== ''));
    el(`${id}-why`).textContent = reason;
  }
  // The one command here that is a state rather than an act: pressed while a branch is on screen.
  el('assist-mm-focus').setAttribute('aria-pressed', String(editor.view.isOn()));
}

/**
 * Wire one toolbar command. A press it cannot answer says why and does nothing else.
 *
 * The span the button is described by is visually hidden, so it tells a screen reader why and tells
 * a student looking at the button nothing. The refusal is a toast for that reason: seen, and said.
 *
 * @param {string} id - the button's element id.
 * @param {string} label - for the shared handler's logging.
 * @param {() => void} run
 */
function wireToolbarCommand(id, label, run) {
  attachAccessibleHandler(el(id), label, () => {
    const reason = el(`${id}-why`).textContent;
    if (reason) {
      showToast(reason);
      return;
    }
    run();
  });
}

/**
 * Add a node beside or inside the selected one, and put the student in it.
 *
 * Through the outline pane, which is the editor (ADR 0001) and owns making a node: the mark before
 * the creation, a shut branch opened as part of the same edit, the blank one discarded if the student
 * changes their mind, and the naming folded into the creation so one Ctrl+Z undoes the lot. This
 * button used to apply the ops itself with the literal text 'New node' and then tell the student to
 * go and press F2 — a third way to make a node, keeping none of those rules.
 *
 * The editor opens on the outline row rather than on the canvas, because that is where this button
 * sent them before and the toolbar is not on the canvas; the row has to be on screen to be typed in.
 *
 * @param {boolean} asChild
 */
function addNode(asChild) {
  editor.dock?.showOutline();
  editor.panes.outline.addNode(editor.selection.get(), { asChild, openEditor: true });
}

/**
 * Delete every selected node, as one undo step.
 *
 * The centre is taken out of the selection first and the effective set is taken of what is left, so
 * a student who selected the whole outline still empties it; a selection that is nothing but the
 * centre is refused by the toolbar's own reason before this runs.
 */
function deleteSelected() {
  const { selection, view } = editor;
  // What is on screen: focused on a branch, its own top node is the one that cannot go, and the
  // toolbar has already refused with that sentence before this runs.
  const history = view.history;
  const map = history.current();
  // `effectiveSet` asks the map about every id: the selection starts on the rootId of a map that came
  // off disk or out of a file, so an id is only ever as trustworthy as that file.
  const chosen = selection.ids();
  const going = effectiveSet(
    map,
    chosen.filter(id => id !== map.rootId)
  );
  if (going.length === 0) {
    return;
  }
  const hadCentre = chosen.includes(map.rootId);
  const buried = going.reduce((total, id) => total + subtreeIds(map, id).length - 1, 0);

  // Chosen before the removal: the store prunes itself the moment the map changes, and a selection
  // already standing on a surviving node gives it nothing to repair.
  selection.set(map.nodes[going[0]].parentId, { source: 'program', said: true });
  const text = going.length === 1 ? map.nodes[going[0]].text : null;
  if (going.length === 1) {
    history.apply('removeNode', { id: going[0] });
  } else {
    history.applyBatch(
      going.map(id => ({ op: 'removeNode', args: { id } })),
      { name: 'removeNodes' }
    );
  }
  announce(
    deletedNodesSentence({
      count: going.length,
      buried,
      hadCentre,
      text,
      branch: isBranchView(map),
    })
  );
}

/** Quiet time before the find box counts what the student has typed so far. */
const FIND_DEBOUNCE_MS = 300;

/** Which of the current matches the find box is sitting on; -1 before the first jump. */
let findAt = -1;

let findTimer = null;

/**
 * The nodes of a map whose text contains the find term, in outline order.
 *
 * Outline order rather than `Object.values` order: "next match" has to mean the next one down the
 * outline the student is looking at, not the next one the map happens to hold in its node table.
 *
 * @param {Object} map
 * @returns {Array<Object>} the matching nodes; empty when the box is empty.
 */
function matchesIn(map) {
  const needle = findInput.value.trim().toLowerCase();
  if (needle === '') {
    return [];
  }
  const matches = [];
  walk(map, node => {
    if (node.text.toLowerCase().includes(needle)) {
      matches.push(node);
    }
  });
  return matches;
}

/**
 * The matches in what is on screen. Find searches what the student can see: focused on one branch,
 * it searches that branch, and says so.
 *
 * @returns {Array<Object>}
 */
const findMatches = () => matchesIn(editor.view.history.current());

/**
 * Write the short form of what the box found into the line under it, or clear the line.
 *
 * The seen half of the news only. `showToast` writes both halves because a toast is hidden until
 * there is something in it; this line is always on screen, and the sentence it stands for has
 * already gone to the live region through `announce`. A second live route here would say the count
 * twice — see the comment on the element in mindmap.html.
 *
 * @param {string} text - '' clears it.
 */
function setFindStatus(text) {
  findStatus.textContent = text;
}

/**
 * Say how many nodes the term matches, and show it, and nothing else.
 *
 * Typing must never change the map. The box used to jump — and jumping opened collapsed branches —
 * so a student searching for "evidence" rewrote their own outline five keystrokes deep and then had
 * five undo steps to climb back out of. Counting is the whole of what a keystroke does now; moving
 * is Enter, which the student asked for.
 *
 * The count was only ever said, which left a sighted student typing into a box that answered
 * nothing: the outline does not move while they type, by design. The sentence is still what is
 * said — it carries the term, and where the matches outside a focused branch are — and the line
 * under the box carries the number.
 */
function countMatches() {
  const term = findInput.value.trim();
  findAt = -1;
  if (term === '') {
    setFindStatus('');
    return;
  }
  const here = findMatches().length;
  const branch = editor.view.isOn();
  // The rest of the map is counted too, but only while part of it is out of sight: a word a student
  // cannot find in the branch they are working on is usually in the half of the map they hid, and
  // being told "no match" would be the wrong answer to what they asked.
  const elsewhere = branch ? matchesIn(editor.history.current()).length - here : 0;
  setFindStatus(here === 0 ? 'No matches' : here === 1 ? '1 match' : `${here} matches`);
  announce(findCountSentence({ term, here, elsewhere, branch }));
}

/**
 * Go to the next match, or the previous one.
 *
 * A match inside a collapsed branch is no use hidden, so the ancestors are opened on the way — as
 * ONE history entry, because opening four branches to show one node is one thing the student did
 * and has to cost them one Ctrl+Z.
 *
 * The keyboard stays in the box. It used to be moved to the outline row, which ended the search at
 * the first match: Enter is how the student asks for the NEXT one, and they had to find their way
 * back to the box before they could press it again. Both panes show where they have been taken to
 * instead — the row is scrolled into view here, and the canvas pans to a selection it did not make
 * itself — so nothing about the match depends on where the caret is.
 *
 * @param {number} step - +1 for the next match, -1 for the previous one.
 */
function gotoMatch(step) {
  const { selection, view } = editor;
  const history = view.history;
  const matches = findMatches();
  if (matches.length === 0) {
    countMatches();
    return;
  }
  findAt = (((findAt + step) % matches.length) + matches.length) % matches.length;
  const match = matches[findAt];

  // The match itself is left as the student had it: it is the ancestors that were hiding it.
  const reveal = pathTo(history.current(), match.id)
    .slice(0, -1)
    .filter(id => history.current().nodes[id].collapsed)
    .map(id => ({ op: 'toggleCollapsed', args: { id } }));
  if (reveal.length > 0) {
    history.applyBatch(reveal, { name: 'reveal' });
  }

  selection.set(match.id, { source: 'program' });
  setFindStatus(`Match ${findAt + 1} of ${matches.length}`);
  announce(`Match ${findAt + 1} of ${matches.length}: ${match.text}`);
  revealOutlineRow(match.id);
}

/**
 * A node's row in the outline, or null: a node inside a folded branch is not drawn one.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
const outlineRow = id =>
  [...el('assist-mm-outline-host').querySelectorAll('[role="treeitem"]')].find(
    row => row.dataset.id === id
  ) || null;

/**
 * Scroll a node's outline row into view without taking the keyboard off whatever has it.
 *
 * The outline scrolls its own row for a selection it has focus in; a selection made from the find
 * box, where the caret stays, leaves the row wherever the list happens to be scrolled to. A node
 * with no row has nothing to scroll — and the fold that was hiding it was opened on the way here.
 *
 * @param {string} id
 */
function revealOutlineRow(id) {
  // jsdom has no layout and so no `scrollIntoView`; in a browser it is always there.
  outlineRow(id)?.scrollIntoView?.({ block: 'nearest' });
}

/**
 * Put the keyboard on a node's outline row.
 *
 * The outline only moves focus for a selection when it already had focus, which is right — a
 * read-aloud walking the tree must not drag the caret out of whatever the student is typing. This
 * is for the other case: a control the page has had to take away from under the keyboard, where the
 * row is the nearest thing the student can carry on from.
 *
 * @param {string} id
 * @returns {boolean} true when there was a row to put it on. A node inside a folded branch has no
 *   row, and the caller then has somewhere else to send the keyboard.
 */
function focusOutlineRow(id) {
  const row = outlineRow(id);
  return row ? takeFocus(row) : false;
}

/**
 * Put the keyboard somewhere sensible for a node whose control has just been taken away.
 *
 * A field the canvas has to remove, or a trail button that goes as the student walks up it, cannot
 * keep the keyboard: Chrome drops it on `<body>`, which is the top of the page with the student's
 * place lost. The node's outline row is the nearest thing they can act on; the map region is where
 * Tab carries on from if that row is not on screen.
 *
 * The first of these that will take it. Each can refuse: the node's own outline row when the outline
 * dock is shut, the toolbar's roving stop before the strip has stated one. The map region is last
 * because it is never hidden, so the keyboard is never left on `<body>`.
 *
 * @param {string} id
 */
function sendKeyboardTo(id) {
  const places = [
    () => focusOutlineRow(id),
    () => takeFocus(editorHost.querySelector('[role="toolbar"] [tabindex="0"]')),
    () => takeFocus(el('assist-mm-main')),
  ];
  for (const place of places) {
    if (place()) {
      return;
    }
  }
}

// ── Page-wide wiring ────────────────────────────────────────────────────────

/** True when a modal is already on screen, and `showModal` would stack a second one over it. */
const modalIsOpen = () => Boolean(document.querySelector('dialog[open]'));

/**
 * May a keystroke put a modal on screen right now?
 *
 * Three ways it may not. There is no map open, and the library has neither dialog — taking the
 * key there would swallow the browser's own Ctrl+O for nothing. The student is typing, and a modal
 * over a half-written node is a modal they did not ask for. Or a dialog is already up, and
 * `showModal` would stack a second one over it with the first still holding its own Escape.
 *
 * Any `<dialog open>` counts: the shortcuts list, the three File menu dialogs, and whatever a
 * later slice adds. A page that had to be told each new dialog's name would forget one.
 *
 * @param {EventTarget} target - what the keystroke was aimed at.
 * @returns {boolean}
 */
function canOpenDialog(target) {
  // `editor.panes` rather than `editor`: the page-wide keys are bound before a map is read, so
  // there is a window in which an editor exists and the dialogs it owns do not.
  return Boolean(editor?.panes) && !isTextField(target) && !modalIsOpen();
}

function wirePage() {
  attachAccessibleHandler(el('assist-mm-help'), 'Shortcuts', () => shortcuts.open(), {
    enableVisualFeedback: false,
  });
  attachAccessibleHandler(el('assist-mm-banner-dismiss'), 'Dismiss banner', () => showBanner(''), {
    enableVisualFeedback: false,
  });

  document.addEventListener('keydown', event => {
    // Every chord below is the one the STUDENT has bound, asked of the registry rather than spelled
    // out here, so a remap in Settings reaches this page — and reaches it while it is open.
    const editingKey =
      matchesBinding(event, 'mm_undo') ||
      matchesBindingWithShift(event, 'mm_undo') ||
      matchesBinding(event, 'mm_redo') ||
      matchesBinding(event, 'mm_find');
    if (editingKey && isTextField(event.target)) {
      // Let the browser undo the typing, or search the text. Nothing is prevented, so the box
      // behaves as any other box on any other page.
      return;
    }
    if (matchesBinding(event, 'mm_undo') || matchesBindingWithShift(event, 'mm_undo')) {
      event.preventDefault();
      if (editor) {
        // Undo's chord with Shift added is the second spelling of Redo, the way every editor has
        // it. It exists only while Undo's own chord carries no Shift of its own.
        stepHistory(!event.shiftKey);
      }
      return;
    }
    if (matchesBinding(event, 'mm_redo')) {
      event.preventDefault();
      if (editor) {
        stepHistory(false);
      }
      return;
    }
    if (matchesBinding(event, 'mm_save_as')) {
      if (!canOpenDialog(event.target)) {
        return;
      }
      event.preventDefault();
      editor.panes.saveAsDialog.open(editor.history.current().title);
      return;
    }
    if (matchesBinding(event, 'mm_save')) {
      // Save is claimed in text boxes too, unlike Undo and Find: there is nothing a browser does
      // with it in a field, and a student part way through naming a node is exactly who reaches for
      // it. It is the one deliberate exception to "no chord fires while a node name is being typed".
      event.preventDefault();
      if (!editor) {
        // The library has nothing to write. Taking the key and then doing nothing looks exactly
        // like a save that failed, so it says what it did instead — on screen as well as aloud.
        showToast('Your maps save themselves. There is nothing to save here.');
        return;
      }
      saveNow();
      return;
    }
    if (matchesBinding(event, 'mm_open_map')) {
      if (!canOpenDialog(event.target)) {
        return;
      }
      event.preventDefault();
      editor.panes.openMapDialog.open();
      return;
    }
    if (matchesBinding(event, 'mm_find')) {
      // One search key, two searches: the map's find box in the editor, the title filter in the
      // library. Bound once here so neither view can claim the key out from under the other.
      event.preventDefault();
      if (editor) {
        // The find box lives in the outline dock, and focusing a hidden box does nothing at all.
        editor.dock?.showOutline();
        findInput.focus();
        findInput.select();
        return;
      }
      libraryHost.querySelector('.assist-mm-library__search')?.focus();
      return;
    }
    if (matchesBinding(event, 'mm_move_node')) {
      // Every drag on this page has a keyboard alternative in the Details panel (SC 2.5.7), and one
      // a student cannot find is one that is not there. The same guard the dialog keys use: not in
      // the library, which has no node to move; not in a text box, where taking the key would pull
      // the student out of a half-written node and commit or discard it; and not under a modal,
      // where it would change a tab behind something the student cannot see past.
      if (!canOpenDialog(event.target)) {
        return;
      }
      event.preventDefault();
      // "Move to…" lives in the Details panel, which may be behind another tab or a shut dock.
      editor.dock?.showTab('details');
      // A key that does nothing and says nothing is indistinguishable from a broken one. The reason
      // is said once, on screen and aloud together, because the panel it is in may be new to them.
      const reason = editor.panes.inspector.focusMoveTo();
      if (reason) {
        showToast(reason);
      }
      return;
    }
    if (matchesBinding(event, 'mm_focus_branch')) {
      // Show one branch and nothing else. The same guard the dialog keys and "Move to…" use — not
      // in the library, which has no branch; not in a text box, where changing what is on screen
      // would take the row being typed in out of the document under the student's caret; and not
      // under a modal, where the map would change behind something they cannot see past.
      if (!canOpenDialog(event.target)) {
        return;
      }
      event.preventDefault();
      const reason = editor.view.reason();
      if (reason) {
        // A key that does nothing and says nothing cannot be told from a broken one.
        showToast(reason);
        return;
      }
      editor.view.toggle();
      return;
    }
    // Both spellings of Help are guarded by `modalIsOpen` rather than by `canOpenDialog`: a second
    // modal over the first is the fault being fixed, but the library has no map open and `?` has to
    // keep working there (SC 3.2.6 is about help being in the same place wherever it appears). Help
    // is not reachable from inside a dialog, and no route is added here to make it so. A text box is
    // its own guard either way: a modal over a half-written node is one the student did not ask for.
    if (matchesBinding(event, 'mm_shortcuts_help')) {
      if (isTextField(event.target) || modalIsOpen()) {
        return;
      }
      event.preventDefault();
      shortcuts.open();
      return;
    }
    // '?' stays bound directly: it carries no modifier, so it cannot be a registry binding, and it
    // is the spelling every other application uses for "show me the keys". The shortcuts list says
    // so, so nobody goes looking for it in Settings.
    if (event.key === '?' && !consumesKey(event.target, '?') && !modalIsOpen()) {
      event.preventDefault();
      shortcuts.open();
    }
  });
}

/**
 * Escape: the whole map back, when nothing nearer the student wanted the key.
 *
 * Its own listener, and bound from `wireEditor` rather than from `wirePage`, because that is what
 * puts it LAST. A `document` listener runs in the order it was added, and the panes add theirs as
 * they mount — so this one arrives after the canvas's "abandon this drag" and sees that it took the
 * key. Everything else nearer the student claims it the same way: an inline editor stops the
 * keystroke at its own input, a modal closes itself (and `canOpenDialog` keeps this away while one
 * is up), the dock goes back to Details, and an outline row drops a set and then leaves the focused
 * branch — each by preventing the default. What arrives here unclaimed is a student on the canvas,
 * the toolbar or the trail asking for their whole map back.
 */
function wireEscape() {
  document.addEventListener('keydown', event => {
    if (
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      !canOpenDialog(event.target) ||
      !editor.view.isOn()
    ) {
      return;
    }
    event.preventDefault();
    editor.view.leave();
  });
}

/**
 * Undo or redo, and say which — including when what changed is out of sight.
 *
 * A student focused on one branch who presses Ctrl+Z and sees nothing happen has to be told that
 * something really did change, or they press it again and take back a second thing they cannot see.
 * The view is what knows: a step that left the branch on screen exactly as it was hands back the
 * very same view object, because that is how the derivation is memoised.
 *
 * @param {boolean} undone - true to undo, false to redo.
 */
function stepHistory(undone) {
  const shown = editor.view.history.current();
  const wasFocused = editor.view.isOn();
  const could = undone ? editor.history.canUndo() : editor.history.canRedo();
  if (undone) {
    editor.history.undo();
  } else {
    editor.history.redo();
  }
  if (wasFocused && !editor.view.isOn()) {
    // The step took the branch itself away, and the view has already said so — on screen and aloud.
    return;
  }
  if (could && editor.view.isOn() && editor.view.history.current() === shown) {
    showToast(outsideBranchSentence(undone));
    return;
  }
  announce(undone ? 'Undone' : 'Redone');
}

/** The editor's own keys, bound once a map is open. */
function wireEditor() {
  wireToolbarCommand('assist-mm-undo', 'Undo', () => stepHistory(true));
  wireToolbarCommand('assist-mm-redo', 'Redo', () => stepHistory(false));
  wireToolbarCommand('assist-mm-new-child', 'New child', () => addNode(true));
  wireToolbarCommand('assist-mm-new-sibling', 'New sibling', () => addNode(false));
  wireToolbarCommand('assist-mm-delete', 'Delete node', deleteSelected);
  wireToolbarCommand('assist-mm-focus', 'Focus on this branch', () => editor.view.toggle());
  attachAccessibleHandler(reloadButton, 'Reload map', () => location.reload());

  findInput.addEventListener('input', () => {
    clearTimeout(findTimer);
    // An emptied box is answered at once rather than a third of a second later: the search is over,
    // and a count left standing beside an empty field is a count of nothing.
    if (findInput.value.trim() === '') {
      countMatches();
      return;
    }
    findTimer = setTimeout(countMatches, FIND_DEBOUNCE_MS);
  });
  findInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    // The count may still be pending behind the debounce; going somewhere makes it moot.
    clearTimeout(findTimer);
    gotoMatch(event.shiftKey ? -1 : 1);
  });

  window.addEventListener('beforeunload', event => {
    if (editor?.autosave.isDirty()) {
      editor.autosave.saveNow();
      event.preventDefault();
      event.returnValue = '';
    }
  });

  onMapsChanged(change => {
    if (!editor || change.mapId !== editor.mapId || change.updatedAt <= editor.lastSavedAt) {
      return;
    }
    if (editor.autosave.isDirty()) {
      setStatus('Another tab changed this map. Your changes here are not saved yet.', {
        warn: true,
      });
      reloadButton.hidden = false;
      announce('Another tab changed this map.');
      return;
    }
    announce('This map was changed in another tab. Loading the newer version.');
    location.reload();
  });

  // Entering or leaving a branch is a different picture of a different size, and no change to the
  // map has told the canvas about it. Centred and fitted both ways, so the branch arrives whole.
  editor.view.subscribe(() => {
    refreshToolbar();
    editor.panes.canvas.fitToView();
  });

  wireEscape();

  editor.dock = wireDock();
  editor.separator = wireSeparator();
  editor.toolbar = wireToolbar();
}

/**
 * The toolbar as one control (WAI-ARIA APG).
 *
 * `role="toolbar"` is a promise about the keyboard: one tab stop for the whole strip, and the
 * arrow keys to move along it. Without it a student had eleven stops to Tab past before reaching
 * the map, and the promise the role makes to a screen reader was not kept.
 *
 * The layout select is one of those stops, and the one control here with a use of its own for the
 * arrow keys: a closed select changes its value on Up and Down. A key the contained control
 * consumes is not the toolbar's to take (APG), so those two are the select's — they are not rove
 * keys here, and no control on the strip is given them. Left and Right a select also changes on
 * Windows, but they are the strip's, and handing all four over made the select the end of the
 * line: every control after it was unreachable by arrow, and the two keys that should have walked
 * past it redrew the map instead. They rove, and the press is taken so the value cannot change.
 *
 * @returns {{destroy: () => void}}
 */
function wireToolbar() {
  const toolbar = editorHost.querySelector('[role="toolbar"]');
  const CONTROLS = 'button, select';

  /** Every control on the strip as it stands: read aloud mounts its own into a slot here. */
  const everyControl = () => [...toolbar.querySelectorAll(CONTROLS)];

  // A control nobody can focus must not hold the strip's only tab stop: read aloud's Stop button
  // is `disabled` while nothing is being read, and the arrow keys would stop dead on it. The
  // toolbar's own commands say `aria-disabled` instead, precisely so they stay reachable.
  const controls = () =>
    everyControl().filter(control => !control.disabled && !control.closest('[hidden]'));

  /** The control the strip offers Tab, so it can be restated when the strip changes under it. */
  let stop = null;

  /**
   * Every control but one is taken out of the tab order — the ones that cannot be focused now
   * included. A disabled button left at the browser's own 0 comes back as a second way into the
   * strip the moment it is enabled, before anything here has had a chance to notice.
   *
   * @param {HTMLElement} next - the one control the strip offers Tab.
   */
  function setStop(next) {
    stop = next || null;
    for (const control of everyControl()) {
      control.tabIndex = control === stop ? 0 : -1;
    }
  }

  /**
   * Keep the one tab stop on a control that can take it.
   *
   * Read aloud's Stop button disables itself the moment the voice finishes, and the toolbar's own
   * commands come and go with the panels. A tab stop left on a control nobody can focus is a
   * toolbar Tab walks straight past — a strip of commands with no way in at all (SC 2.1.1). A
   * control that has only just arrived is restated too: it arrives at the browser's 0.
   */
  const restate = () => {
    const all = controls();
    setStop(all.includes(stop) ? stop : all[0]);
  };
  // `tabindex` is not watched, so setStop cannot set this off again.
  const watcher = new MutationObserver(restate);
  watcher.observe(toolbar, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'hidden'],
  });

  const onFocusIn = event => {
    const control = event.target.closest?.(CONTROLS);
    if (control && toolbar.contains(control)) {
      setStop(control);
    }
  };

  const onKeyDown = event => {
    const all = controls();
    const at = all.indexOf(event.target);
    if (at === -1) {
      return;
    }
    // Up and Down are deliberately not here: they are the layout select's own keys, and a key the
    // strip does not claim is left to whichever control has focus — which is nothing at all on a
    // button.
    const steps = {
      ArrowRight: () => all[(at + 1) % all.length],
      ArrowLeft: () => all[(at - 1 + all.length) % all.length],
      Home: () => all[0],
      End: () => all[all.length - 1],
    };
    const step = steps[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = step();
    setStop(next);
    next.focus();
  };

  toolbar.addEventListener('focusin', onFocusIn);
  toolbar.addEventListener('keydown', onKeyDown);
  setStop(controls()[0]);

  return {
    destroy() {
      watcher.disconnect();
      toolbar.removeEventListener('focusin', onFocusIn);
      toolbar.removeEventListener('keydown', onKeyDown);
    },
  };
}

/**
 * The two docks: the outline on the left, the tabbed panel on the right.
 *
 * Details, AI and Study were three separate things before this: two absolutely positioned popovers
 * hanging off toolbar buttons — each a focus-trapped `dialog`, so a student could not reach their
 * own map while either was open — and an inspector boxed into a third column. They are three tabs
 * over one panel now. Only one is visible, none of them traps the keyboard, and neither dock can
 * cover the canvas or its zoom cluster: they are columns of the grid, not panels floating over it.
 *
 * Below 900px they are sheets over the canvas instead, one at a time, because two columns and a
 * canvas do not fit in 320px and the canvas must keep the viewport. A sheet does not resize the
 * canvas, so the canvas cannot see it arrive: `sync` tells it what is covered, and the canvas moves
 * the node the student was working on out from under it.
 *
 * @returns {{
 *   showTab: (name: string, options?: Object) => void,
 *   showOutline: () => void,
 *   isShowing: (name: string) => boolean,
 *   destroy: () => void
 * }}
 */
function wireDock() {
  const dock = el('assist-mm-dock');
  const outlineRegion = el('assist-mm-outline-region');
  const outlineToggle = el('assist-mm-outline-toggle');
  const dockToggle = el('assist-mm-dock-toggle');
  const tabList = dock.querySelector('[role="tablist"]');
  const tabs = new Map(DOCK_TABS.map(name => [name, el(`assist-mm-tab-${name}`)]));
  const panels = new Map(DOCK_TABS.map(name => [name, el(`assist-mm-panel-${name}`)]));
  const toolbarToggles = new Map([
    ['ai', el('assist-mm-ai')],
    ['study', el('assist-mm-study')],
  ]);
  const narrow = window.matchMedia('(max-width: 899px)');
  const cleanups = [];

  let current = 'details';
  let dockOpen = true;
  let outlineOpen = true;

  /** The toolbar button a panel was opened from, so Escape can put the student back on it. */
  let opener = null;

  /**
   * Leaving the AI tab abandons whatever it had in flight.
   *
   * There is no abort on the messaging channel, so a generation the student walked away from would
   * otherwise still arrive and write a tree into their map from a panel they cannot see. The panel
   * drops the reply and says so if there was one; this is what the old popover did when it closed.
   *
   * @param {string} nextName - the tab about to be shown.
   * @param {boolean} nextOpen - whether the dock will be open at all.
   */
  function cancelAiIfLeaving(nextName, nextOpen) {
    if (current === 'ai' && (nextName !== 'ai' || !nextOpen)) {
      editor.panes.ai.cancel();
    }
  }

  const setLabel = (button, text) => {
    button.querySelector('.assist-mm-button__label').textContent = text;
  };

  function sync() {
    for (const [name, tab] of tabs) {
      const chosen = name === current;
      tab.setAttribute('aria-selected', String(chosen));
      // One tab stop for the whole tablist; the arrow keys move between the tabs inside it.
      tab.tabIndex = chosen ? 0 : -1;
      panels.get(name).hidden = !chosen;
    }
    for (const [name, button] of toolbarToggles) {
      button.setAttribute('aria-pressed', String(dockOpen && current === name));
    }
    dock.hidden = !dockOpen;
    dockToggle.setAttribute('aria-expanded', String(dockOpen));
    setLabel(dockToggle, dockOpen ? 'Hide details' : 'Show details');
    outlineRegion.hidden = !outlineOpen;
    separator.hidden = !outlineOpen;
    outlineToggle.setAttribute('aria-expanded', String(outlineOpen));
    setLabel(outlineToggle, outlineOpen ? 'Hide outline' : 'Show outline');
    layoutGrid.dataset.outline = outlineOpen ? 'open' : 'closed';
    layoutGrid.dataset.dock = dockOpen ? 'open' : 'closed';
    // Nothing may be hidden out from under the keyboard. A press always leaves focus on the button
    // that did it, but a window narrowed to sheet width closes a dock nobody pressed anything to
    // close, and focus inside it would go to `<body>` — the top of the page, place lost.
    if (dock.hidden) {
      rescueFocus(dock, dockToggle);
    }
    if (outlineRegion.hidden) {
      rescueFocus(outlineRegion, outlineToggle);
    }
    // Read after the sheet is shown, so the box is the one it has now. As a column it covers
    // nothing: the canvas is narrower instead, and watches its own size for that.
    const sheet = !narrow.matches ? null : dockOpen ? dock : outlineOpen ? outlineRegion : null;
    editor.panes.canvas.setCovered(sheet ? sheet.getBoundingClientRect() : null);
  }

  /**
   * @param {'details'|'ai'|'study'} name
   * @param {{focus?: boolean, from?: HTMLElement|null}} [options] - `from` is the control focus
   *   goes back to when the student presses Escape inside the panel.
   */
  function showTab(name, { focus = false, from = null } = {}) {
    cancelAiIfLeaving(name, true);
    current = name;
    dockOpen = true;
    // One sheet at a time when they are sheets: two of them over a 320px canvas is a pile.
    if (narrow.matches) {
      outlineOpen = false;
    }
    opener = from;
    sync();
    if (name === 'ai') {
      // A provider may have been configured in another tab since this page loaded.
      editor.panes.ai.refresh();
    }
    if (!focus) {
      return;
    }
    const pane = name === 'ai' ? editor.panes.ai : name === 'study' ? editor.panes.study : null;
    if (pane) {
      pane.focusFirst();
    } else {
      panels.get(name).focus();
    }
  }

  /**
   * @param {boolean} open
   * @param {{moveFocus?: boolean}} [options] - `moveFocus` puts the keyboard on the toggle, which
   *   is right when the toggle is what was pressed and wrong when the outline was opened on the
   *   way to something inside it.
   */
  function setOutlineOpen(open, { moveFocus = true } = {}) {
    outlineOpen = open;
    if (open && narrow.matches) {
      dockOpen = false;
    }
    sync();
    if (moveFocus) {
      // The shared event helper answers `mousedown` and prevents its default, so a pointer press
      // never focuses the button it lands on. Every one of these toggles puts the keyboard back on
      // itself, so the pointer and the keyboard leave the student in the same place.
      outlineToggle.focus();
    }
    announce(open ? 'Outline shown' : 'Outline hidden');
  }

  for (const [name, button] of toolbarToggles) {
    cleanups.push(
      attachAccessibleHandler(button, `Mind map ${name} panel`, () => {
        if (dockOpen && current === name) {
          // Pressing the button a panel is already showing under puts the canvas back, and the
          // keyboard comes back to the button, which now reads as not pressed.
          cancelAiIfLeaving(current, false);
          dockOpen = false;
          opener = null;
          sync();
          button.focus();
          return;
        }
        showTab(name, { focus: true, from: button });
      })
    );
  }

  cleanups.push(
    attachAccessibleHandler(outlineToggle, 'Mind map outline dock', () =>
      setOutlineOpen(!outlineOpen)
    ),
    attachAccessibleHandler(dockToggle, 'Mind map details dock', () => {
      cancelAiIfLeaving(current, !dockOpen);
      dockOpen = !dockOpen;
      if (dockOpen && narrow.matches) {
        outlineOpen = false;
      }
      opener = null;
      sync();
      dockToggle.focus();
    })
  );

  for (const [name, tab] of tabs) {
    cleanups.push(
      attachAccessibleHandler(tab, `Mind map ${name} tab`, () => {
        showTab(name);
        tab.focus();
      })
    );
  }

  /** The tablist's own keys: the arrows move between tabs, Home and End go to the ends. */
  const onTabKeydown = event => {
    const order = [...tabs.keys()];
    const at = order.indexOf(current);
    const moves = {
      ArrowRight: () => order[(at + 1) % order.length],
      ArrowLeft: () => order[(at - 1 + order.length) % order.length],
      Home: () => order[0],
      End: () => order[order.length - 1],
    };
    if (!moves[event.key]) {
      return;
    }
    event.preventDefault();
    const next = moves[event.key]();
    showTab(next);
    tabs.get(next).focus();
  };
  tabList.addEventListener('keydown', onTabKeydown);
  cleanups.push(() => tabList.removeEventListener('keydown', onTabKeydown));

  /**
   * Escape in the AI or Study panel goes back to Details and puts the student on the button that
   * brought them here. Nothing is trapped, so this is a courtesy rather than the only way out —
   * Tab still leads to the canvas and the rest of the page.
   *
   * Two things it must keep its hands off. Details is not a panel anybody was sent into, it is
   * what Escape goes back TO, and it is a form: taking the key there would pull a student out of
   * the notes they are writing. And a text box may want Escape for itself wherever it sits, so the
   * key is left to the field the way Ctrl+Z and Ctrl+F are.
   */
  const onDockKeydown = event => {
    if (event.key !== 'Escape' || current === 'details' || isTextField(event.target)) {
      return;
    }
    event.preventDefault();
    const back = opener && opener.isConnected ? opener : tabs.get('details');
    showTab('details');
    back.focus();
  };
  dock.addEventListener('keydown', onDockKeydown);
  cleanups.push(() => dock.removeEventListener('keydown', onDockKeydown));

  /**
   * Coming down to sheet width with both docks open would bury the canvas under both of them. In
   * either direction a dock has just changed between a column and a sheet, which `sync` restates.
   */
  const onNarrowChange = () => {
    if (narrow.matches && outlineOpen && dockOpen) {
      cancelAiIfLeaving(current, false);
      dockOpen = false;
    }
    sync();
  };
  if (typeof narrow.addEventListener === 'function') {
    narrow.addEventListener('change', onNarrowChange);
    cleanups.push(() => narrow.removeEventListener('change', onNarrowChange));
  }

  onNarrowChange();

  return {
    showTab,

    /** Bring the outline back if it is away. The find box lives in it, and Ctrl+F goes there. */
    showOutline() {
      if (!outlineOpen) {
        setOutlineOpen(true, { moveFocus: false });
      }
    },

    /**
     * @param {string} name
     * @returns {boolean} true when that tab is the one on screen. Read aloud asks: what is in
     *   front of the student decides whether Alt+R may start a voice, not what is still running
     *   somewhere behind them.
     */
    isShowing(name) {
      return dockOpen && current === name;
    },

    destroy() {
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}

/**
 * Take the page down: every pane, the autosave and the shortcuts dialog.
 *
 * Each `mount*` hands back a `destroy()` that unsubscribes from the history and the selection,
 * releases its event handlers and takes its DOM away. The page used to keep only the canvas handle
 * and drop the rest, which left the read-aloud engine talking, the AI panel's reply still able to
 * write into a map nobody is looking at, and a document-level Alt+R listener per mount.
 *
 * Safe to call twice: `pagehide` fires for a close, for a navigation away and for the page going
 * INTO the back/forward cache, and the last of those can be followed by another. Coming back out
 * of that cache is `pageshow` with `event.persisted`, which is handled separately — a torn-down
 * editor must never be shown.
 */
function teardownEditor() {
  if (tornDown) {
    return;
  }
  tornDown = true;
  const panes = editor ? Object.values(editor.panes || {}) : [];
  const handles = [
    ...panes,
    editor?.view,
    editor?.autosave,
    editor?.dock,
    editor?.separator,
    editor?.toolbar,
    library,
    shortcuts,
  ];
  for (const handle of handles) {
    handle?.destroy();
  }
  editor?.selection?.destroy();
  stopWatchingBindings();
  clearTimeout(findTimer);
  clearTimeout(toastTimer);
  clearTimeout(countTimer);
}

/**
 * The keyboard-operable dock divider.
 *
 * Pixels, not a percentage of the editor: the outline is a column of text, so what it needs is a
 * width it can hold a line of an outline in, not a share of however wide the screen happens to be.
 * The ceiling is half the workspace, so the canvas is never squeezed out by the pane describing it.
 *
 * @returns {{destroy: () => void}}
 */
function wireSeparator() {
  let width = Number(separator.getAttribute('aria-valuenow'));

  /** Half the workspace, or the markup's ceiling before the page has been laid out (jsdom, tests). */
  const maxWidth = () =>
    Math.max(
      WIDTH_MIN,
      Math.round(layoutGrid.getBoundingClientRect().width * WIDTH_SHARE) ||
        Number(separator.getAttribute('aria-valuemax'))
    );

  const setWidth = next => {
    const max = maxWidth();
    width = Math.min(max, Math.max(WIDTH_MIN, Math.round(next)));
    layoutGrid.style.setProperty('--mm-outline-width', `${width}px`);
    separator.setAttribute('aria-valuemax', String(max));
    separator.setAttribute('aria-valuenow', String(width));
    separator.setAttribute('aria-valuetext', `${width} pixels`);
  };

  separator.addEventListener('keydown', event => {
    const keys = {
      ArrowLeft: () => setWidth(width - WIDTH_STEP),
      ArrowRight: () => setWidth(width + WIDTH_STEP),
      Home: () => setWidth(WIDTH_MIN),
      End: () => setWidth(maxWidth()),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    }
  });

  separator.addEventListener('pointerdown', event => {
    separator.setPointerCapture(event.pointerId);
    const drag = move => {
      setWidth(move.clientX - layoutGrid.getBoundingClientRect().left);
    };
    const stop = () => {
      separator.removeEventListener('pointermove', drag);
      separator.removeEventListener('pointerup', stop);
    };
    separator.addEventListener('pointermove', drag);
    separator.addEventListener('pointerup', stop);
  });

  // A window narrowed after the outline was widened leaves a dock that no longer fits, and the
  // body does not scroll: the right dock would go off the edge of the page with no way back to it.
  // The ceiling is half the workspace, so re-stating the width against the new one is the whole fix.
  const onResize = () => setWidth(width);
  window.addEventListener('resize', onResize);

  // The markup's ceiling is a guess made before the page had a width. Stating the width once now
  // replaces it with half of the workspace this student actually has.
  setWidth(width);

  return {
    destroy() {
      window.removeEventListener('resize', onResize);
    },
  };
}

async function start() {
  const theme = await loadAndApplyTheme();
  document.documentElement.dataset.assistMmTheme = theme.theme;

  // The shipped chords are live from the first paint; this reads the student's own over them and
  // then follows storage, so a remap made in Settings reaches an editor that is already open.
  watchBindings();

  wirePage();

  // The library and the editor are two loads of this page, never two states of one: opening a map
  // navigates. So one teardown on the way out covers both, and `pagehide` is the event that fires
  // for a close, a navigation and a tab discarded under memory pressure alike.
  window.addEventListener('pagehide', teardownEditor);

  // Going back to a page that was put in the back/forward cache restores it whole — DOM, timers
  // and all — and fires `pageshow` with `persisted` set. But `pagehide` tore this editor down on
  // the way in: the panes are unsubscribed and their handlers released, so what the student would
  // be looking at is a picture of a map that no longer answers anything they do to it. Loading it
  // again is the honest answer, and it costs one read of a local database.
  window.addEventListener('pageshow', event => {
    if (event.persisted && tornDown) {
      location.reload();
    }
  });

  const params = new URLSearchParams(location.search);
  const mapId = params.get('map');
  // Taken whichever way this load goes, so a sentence about a map cannot turn up later beside a
  // different one. It is only worth showing when the map it is about is on screen.
  const imported = takeImportOutcome();
  if (!mapId) {
    openLibrary();
    return;
  }
  await openEditor(mapId, { fromPage: params.get('from') === 'page' });
  // Wired only once a map is actually open, so a toolbar button cannot reach a half-built editor.
  if (editor) {
    wireEditor();
    if (imported) {
      // The import happened on the page before this one: this is the first moment its outcome can
      // be both seen and heard, so it is said here rather than shouted at a document on its way out.
      showToast(imported);
    }
  }
}

start();
