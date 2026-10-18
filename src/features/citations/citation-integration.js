/**
 * Citation Integration Module
 *
 * Main entry point for citation functionality in content script
 * Coordinates metadata extraction, storage, UI, and CrossRef API
 *
 * Exposed to window.assistFeatures.citation for message handlers
 */

import { extractMetadata, mergeMetadata, isPDF, extractPDFMetadata } from './metadata-extractor.js';
import {
  CitationStorageRPC as CitationStorage,
  ProjectStorageRPC as ProjectStorage,
  CitationMigrationRPC,
} from './citation-rpc.js';
import { showMigrationPrompt } from './ui/migration-prompt.js';
import { showSuccessToast, showErrorToast } from './citation-toast.js';
import { enrichMetadataWithDOI } from './crossref-api.js';
import { normalizeCitation } from './citation-types.js';
import { showSaveTray, showInfoTray } from '../../utils/action-tray.js';
import { showCitationWizard } from './ui/citation-wizard-modal.js';
import { createCitationStore, STYLE_KEY } from './citation-store.js';
import { createCitationVoiceTrigger } from './capture/citation-voice-trigger.js';
import { createCaptureButtons } from './capture/citation-capture-buttons.js';
import { createVoiceCaptureSession } from './capture/voice-capture-session.js';
import { assessCitation, FIELDS } from './reassurance-engine.js';

/** Maps a flagged reassurance field to the wizard step that fixes it (for the tray's "Fix" link). */
const FIELD_STEP = {
  [FIELDS.TITLE]: 'what',
  [FIELDS.AUTHOR]: 'who',
  [FIELDS.YEAR]: 'when',
  [FIELDS.LINK]: 'where',
  [FIELDS.CONTAINER]: 'where',
};

// Lazily-created store backing the library overlay. Reads/writes go through the RPC client to the
// canonical store in the shared offscreen document (extension origin) — NOT a page-origin Dexie DB,
// which is what used to silo citations per website. The cross-context index projection is driven by
// the offscreen handler, so this realm only listens for its chrome.storage.onChanged signal (wired
// in createCitationStore) — it must NOT call initCitationIndex here (the DB no longer lives here).
let _store = null;
function getStore() {
  if (!_store) {
    _store = createCitationStore();
    _store.init();
  }
  return _store;
}

/**
 * Open the citation library — the full-page library in its own tab.
 *
 * The library page owns every citation surface (list, projects/tags sidebar, import/export,
 * dedupe, add-by-DOI, copy bibliography, essay reference check) and mounts the AI affordances
 * itself, so this is a straight hand-off to the service worker.
 * @returns {Promise<void>}
 */
export async function openLibrary() {
  await maybeOfferMigration();
  chrome.runtime.sendMessage({ type: 'OPEN_CITATION_LIBRARY' });
}

/**
 * First time the library is opened after the canonical store comes online, offer the migration
 * choice (start fresh / best-effort import). Resolves once the student chooses or dismisses; an
 * import lands before the library reads, so recovered stubs appear immediately. Never blocks the
 * library — any failure is logged and the library still opens.
 */
async function maybeOfferMigration() {
  try {
    const status = await CitationMigrationRPC.getStatus();
    if (status && status.done) {
      return;
    }
    await showMigrationPrompt({ migration: CitationMigrationRPC });
  } catch (err) {
    console.warn('[citation-integration] migration prompt skipped:', err);
  }
}

/**
 * The student's citation style, for the wizard's preview and the save tray's check. Undefined when
 * it cannot be read, so each surface falls back to its own default.
 * @returns {Promise<string|undefined>}
 */
async function readStyle() {
  try {
    const stored = await chrome.storage.local.get(STYLE_KEY);
    return stored ? stored[STYLE_KEY] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a wizard opened from this page needs to preview the reference the student will copy: their
 * style, and every saved citation, so the preview carries the year letter its collection gives it.
 * A pool that cannot be read previews the citation on its own.
 * @returns {Promise<{style: (string|undefined), referencePool: Object[]}>}
 */
async function wizardContext() {
  let referencePool = [];
  try {
    const all = await CitationStorage.getAll();
    referencePool = Array.isArray(all) ? all : [];
  } catch (err) {
    console.warn('[citation-integration] the preview has no library to letter against:', err);
  }
  return { style: await readStyle(), referencePool };
}

/** The tail of the chain of saves from this page; each waits for the one before it. */
let lastSave = Promise.resolve();

/**
 * Run a duplicate check and its write after every earlier one from this page has finished. A
 * failed save rejects for its own caller and never blocks the saves queued behind it.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function oneSaveAtATime(task) {
  const run = lastSave.then(task);
  lastSave = run.catch(() => {});
  return run;
}

/**
 * Save citation from current page.
 *
 * Default flow is ONE-CLICK ("quick"): extract → normalise → save immediately → show a
 * non-blocking tray with Undo + Edit. This replaces the old forced confirm-modal-on-save,
 * which research showed adds friction for neurodivergent users. Pass `{ mode: 'review' }`
 * to open the edit modal before saving.
 *
 * @param {string} [selectedText] - Optional selected text to pre-fill as excerpt in notes
 * @param {{mode?: 'quick'|'review'}} [options]
 * @returns {Promise<Object|null>} - Saved citation, the existing duplicate, or null if cancelled
 */
export async function saveCitationFromCurrentPage(selectedText = '', options = {}) {
  const mode = options.mode === 'review' ? 'review' : 'quick';
  try {
    // Extract metadata from current page
    let citationData;
    if (isPDF()) {
      citationData = extractPDFMetadata();
    } else {
      const metadata = extractMetadata(document);
      citationData = mergeMetadata(metadata, window.location.href);
    }

    // Keep the highlighted text as the source's exact words — a first-class quote, not a note,
    // so it stays visibly "not your words" all the way to insertion (attribution firewall).
    if (selectedText && selectedText.trim()) {
      citationData.quote = selectedText.trim();
    }

    // Enrich with DOI if available
    if (citationData.doi) {
      citationData = await enrichMetadataWithDOI(citationData, citationData.doi);
    }

    // Normalise so journal fields / canonical type survive the save.
    citationData = normalizeCitation(citationData);

    // Duplicate check — NON-blocking: inform and offer to edit, never throw. The check and the
    // write are one step, taken one press at a time, so a second press sees the record the first
    // one stored instead of passing the check alongside it. In review mode the step includes the
    // wizard: a second press waits for it, then finds the record it saved (or, if the student
    // cancelled, saves its own).
    const saved = await oneSaveAtATime(async () => {
      const existing = await CitationStorage.getByURL(citationData.url);
      if (existing.length > 0) {
        return { existing: existing[0] };
      }
      if (mode === 'review') {
        return { reviewId: await reviewBeforeSaving(citationData) };
      }
      return { citationId: await CitationStorage.add(citationData) };
    });
    if (saved.existing) {
      offerAlreadySavedTray(saved.existing, citationData.quote);
      return saved.existing;
    }

    if (mode === 'review') {
      if (saved.reviewId === null) {
        return null; // user cancelled — not an error
      }
      const reviewSaved = await CitationStorage.get(saved.reviewId);
      await showSavedTray(reviewSaved);
      return reviewSaved;
    }

    // Quick mode: already saved above; offer Undo / Edit.
    const savedCitation = await CitationStorage.get(saved.citationId);
    await showSavedTray(savedCitation);
    return savedCitation;
  } catch (error) {
    console.error('[Citation] Save failed:', error);
    showErrorToast(`Failed to save citation: ${error.message}`, 4000);
    throw error;
  }
}

/**
 * Review mode: the wizard opens on the page's metadata and stores the record itself, so a write
 * that fails keeps the dialog — and the source — instead of closing on a save that never happened.
 * @param {Object} citationData - the normalised page metadata
 * @returns {Promise<string|null>} the stored id, or null when the student cancelled
 */
async function reviewBeforeSaving(citationData) {
  let reviewId = null;
  const edited = await showCitationWizard(citationData, {
    ...(await wizardContext()),
    onSave: async next => {
      reviewId = await CitationStorage.add(normalizeCitation({ ...citationData, ...next }));
    },
  });
  return edited ? reviewId : null;
}

/**
 * The tray for a page that is already in the library.
 *
 * With words highlighted, the one action ADDS them to the source that is already saved — pressing
 * Alt+C with a second quote selected used to say "Already saved for this page" and drop the
 * selection, which left no way to keep a second quote but retyping it. With nothing highlighted
 * the action is still Edit.
 *
 * Never saves a second source for the same page: the existing record is updated in place.
 * @param {Object} existing - the citation already stored for this URL
 * @param {string} [quote] - the words the student had highlighted, if any
 */
function offerAlreadySavedTray(existing, quote) {
  const words = (quote || '').trim();
  if (!words) {
    showInfoTray({
      message: 'Already saved for this page',
      actionLabel: 'Edit',
      onAction: () => openEditFor(existing),
    });
    return;
  }
  showInfoTray({
    message: 'Already saved for this page',
    actionLabel: 'Add quote',
    actionAriaLabel: 'Add the highlighted words to the source already saved',
    onAction: () => addQuoteToSaved(existing, words),
  });
}

/**
 * Add highlighted words to a saved source as the source's exact words.
 *
 * The student's existing quote is kept — a second quote is appended to it, never written over —
 * and words already held are recognised rather than stored twice.
 * @param {Object} existing - the stored citation
 * @param {string} words - the highlighted text, already trimmed
 */
async function addQuoteToSaved(existing, words) {
  const current = (existing.quote || '').trim();
  if (current.includes(words)) {
    showInfoTray({ message: 'Those words are already saved with this source' });
    return;
  }
  const quote = current ? `${current}\n\n${words}` : words;
  try {
    await CitationStorage.update(existing.id, { quote });
    showInfoTray({ message: 'Quote added to the source you already saved' });
  } catch (err) {
    console.error('[Citation] Adding the quote failed:', err);
    showErrorToast(`Could not add the quote: ${err.message}`, 3500);
  }
}

/**
 * Resolve a friendly destination name for a saved citation (project name or "Library").
 * @param {Object} citation
 * @returns {Promise<string>}
 */
async function resolveProjectName(citation) {
  if (!citation || !citation.projectId) {
    return 'Library';
  }
  try {
    const project = await ProjectStorage.get(citation.projectId);
    return project && project.name ? project.name : 'Library';
  } catch {
    return 'Library';
  }
}

/**
 * Show the post-save tray (Undo deletes the just-saved citation; Edit opens the modal).
 * @param {Object} saved
 */
async function showSavedTray(saved) {
  if (!saved) {
    showSuccessToast('Citation saved', 2500);
    return;
  }
  const projectName = await resolveProjectName(saved);

  // Inline reassurance: green = done in one click; amber/red = a one-click "Fix" that opens the
  // wizard at the exact field that needs work (the step-rail as the guided fix path).
  const verdict = assessCitation(saved, { style: await readStyle() });
  const headline = verdict.reasons[0] ? verdict.reasons[0].message : '';
  const firstProblem = verdict.reasons.find(r => r.level !== 'green');
  const fixStep = firstProblem ? FIELD_STEP[firstProblem.field] : undefined;

  showSaveTray({
    title: saved.title,
    projectName,
    level: verdict.level,
    statusMessage: headline,
    editLabel: verdict.level === 'green' ? 'Edit' : 'Fix',
    itemNoun: 'citation',
    onUndo: async () => {
      try {
        // Destroyed, not soft-deleted. Undo here means "I did not mean to save this" — a citation
        // the student never wanted has no business waiting 30 days in Recently removed for them to
        // clear by hand. (Remove from the library is the other case, and stays a soft delete.)
        await CitationStorage.purge(saved.id);
        showInfoTray({ message: 'Citation removed' });
      } catch (err) {
        console.error('[Citation] Undo failed:', err);
        showErrorToast('Could not undo — please remove it from your library.', 3500);
      }
    },
    onEdit: () => openEditFor(saved, fixStep),
  });
}

/**
 * Open the wizard for an existing citation and persist any changes.
 * @param {Object} citation - existing (saved) citation with an id
 * @param {string} [step] - wizard step to open at (e.g. the field a "Fix" link targets)
 */
async function openEditFor(citation, step) {
  // The write happens inside the dialog (`onSave`): a failure is reported there, with the student's
  // edits still on screen to try again, instead of a closed dialog and a toast about lost work.
  const edited = await showCitationWizard(
    { ...citation, _isEdit: true },
    {
      ...(await wizardContext()),
      initialStep: step,
      onSave: next =>
        CitationStorage.update(citation.id, normalizeCitation({ ...citation, ...next })),
    }
  );
  if (edited) {
    showSuccessToast('Citation updated', 2500);
  }
}

/**
 * Capture a citation from the current page (and any active text selection), opening the step-rail
 * wizard prefilled so the student reviews before saving. This is the "Cite this source" entry point.
 * @returns {Promise<Object|null>}
 */
export async function captureFromSelection() {
  const selection =
    typeof window !== 'undefined' && window.getSelection ? window.getSelection().toString() : '';
  // One-click capture: save immediately with the page's metadata, then the tray shows the
  // reassurance verdict + a one-click Fix. The wizard is the opt-in fix/edit path, never a toll gate.
  return saveCitationFromCurrentPage(selection, { mode: 'quick' });
}

/**
 * Map a capture draft (highlight or voice snapshot) to a wizard prefill.
 * @param {Object} draft
 * @returns {Object}
 */
function draftToPrefill(draft) {
  const prefill = { url: draft.url || '', title: draft.title || '' };
  const quote = draft.quotedText || draft.paragraph || '';
  if (quote) {
    prefill.quote = String(quote).trim();
  }
  // The wizard says so, rather than show an empty quote box as if a passage had been taken.
  if (draft.passageMissing) {
    prefill.passageMissing = true;
  }
  return prefill;
}

/**
 * Open the wizard for a captured draft and persist it on save, then say where it went (or that
 * nothing was saved), so a capture started by voice does not end in silence.
 * @param {Object} draft
 */
async function openWizardForDraft(draft) {
  const saved = await showCitationWizard(draftToPrefill(draft), {
    ...(await wizardContext()),
    onSave: citation => getStore().add(citation),
  });
  if (saved) {
    showInfoTray({
      message: 'Saved to your citation library',
      actionLabel: 'Open library',
      actionAriaLabel: 'Open your citation library',
      onAction: () => openLibrary(),
    });
  } else {
    showInfoTray({ message: 'Nothing was saved. The citation form was closed.' });
  }
}

/**
 * Build the STT citation-trigger callback. Bind it to the live STT controller
 * (`controller.onCitationTrigger = citation.getVoiceTrigger()`) to enable hands-free capture: a
 * spoken trigger phrase snapshots the reading spot and opens the wizard, and the phrase itself is
 * suppressed from the dictated text.
 * @returns {(text: string) => boolean}
 */
export function getVoiceTrigger() {
  return createCitationVoiceTrigger({ onDraft: openWizardForDraft }).onCitationTrigger;
}

/** chrome.storage.local key holding the extension settings. */
const SETTINGS_KEY = 'assist_settings';

/** Live capture-bar component (null when not mounted). */
let _captureButtons = null;

/** The bar's Voice capture session (null when the bar is not mounted). */
let _voiceSession = null;

/** The page's voice-typing feature, when the STT module has published it. */
function dictationFeature() {
  return (window.assistFeatures && window.assistFeatures.stt) || null;
}

/**
 * Whether the citation manager is enabled. Default ON from 1.0: the capture bar shows unless the
 * student has explicitly turned it off (`citation.enabled === false`), so a fresh install — where
 * `citation` defaults to enabled — surfaces the feature. Matches the popup toggle, which defaults on
 * the same way.
 * @param {Object} [settings] - the assist_settings object
 * @returns {boolean}
 */
export function citationEnabledFrom(settings) {
  return ((settings && settings.citation) || {}).enabled !== false;
}

/**
 * Mount the in-page capture bar once. "Cite this source" snapshots the current page (deterministic,
 * no STT) into the wizard; the voice toggle turns on a voice-capture session, which listens for the
 * trigger phrase whether or not voice typing is running (see capture/voice-capture-session.js).
 */
function mountCaptureBar() {
  if (typeof document === 'undefined') {
    return;
  }
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mountCaptureBar, { once: true });
    return;
  }
  if (_captureButtons) {
    return; // idempotent
  }
  // createCaptureButtons() docks the bar itself — the chip dock is its parent, so there is no
  // host wrapper of our own to append (see src/features/companion/chip-dock.js).
  _captureButtons = createCaptureButtons({
    onCiteSource: () => captureFromSelection(),
    onToggleVoice: () => _voiceSession.toggle(),
  });
  const buttons = _captureButtons;
  _voiceSession = createVoiceCaptureSession({
    getDictation: () => dictationFeature()?.controller || null,
    onTrigger: getVoiceTrigger(),
    onChange: ({ listening, message }) => {
      buttons.setVoiceActive(listening);
      buttons.setVoiceStatus(message);
    },
    returnFocus: () => buttons.el.querySelector('[aria-pressed]'),
    language: () => dictationFeature()?.settings?.language,
  });
}

/** Remove the capture bar and stop voice capture (so a disabled feature can't capture). */
function unmountCaptureBar() {
  if (_voiceSession) {
    _voiceSession.stop();
    _voiceSession = null;
  }
  if (_captureButtons) {
    _captureButtons.destroy();
    _captureButtons = null;
  }
}

/** Show or hide the capture bar to match the citation-manager enabled state. */
function applyCitationEnabled(enabled) {
  if (enabled) {
    mountCaptureBar();
  } else {
    unmountCaptureBar();
  }
}

/**
 * Get citation count for current URL
 * @returns {Promise<number>}
 */
export async function getCitationCountForCurrentPage() {
  const citations = await CitationStorage.getByURL(window.location.href);
  return citations.length;
}

/**
 * Check if current page has citation
 * @returns {Promise<boolean>}
 */
export async function hasCurrentPageCitation() {
  return await CitationStorage.exists(window.location.href);
}

/**
 * Get all citations for current URL
 * @returns {Promise<Array>}
 */
export async function getCitationsForCurrentPage() {
  return await CitationStorage.getByURL(window.location.href);
}

/**
 * Get all citations from storage
 * @returns {Promise<Array>}
 */
export async function getAllCitations() {
  return await CitationStorage.getAll();
}

/**
 * Get all projects from storage
 * @returns {Promise<Array>}
 */
export async function getAllProjects() {
  return await ProjectStorage.getAll();
}

/**
 * Initialize citation feature
 */
export function initCitation() {
  console.log('[Citation] Initializing citation feature');

  // Expose API to window.assistFeatures
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.citation = {
    saveCitationFromCurrentPage,
    captureFromSelection,
    getVoiceTrigger,
    getCitationCountForCurrentPage,
    hasCurrentPageCitation,
    getCitationsForCurrentPage,
    getAllCitations,
    getAllProjects,
    openLibrary,
  };

  // The capture bar is only shown when the citation manager is enabled in Settings, and it follows
  // the toggle live — turning the feature off in the popup removes the bar immediately.
  if (chrome && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
    chrome.storage.local.get(SETTINGS_KEY, result => {
      applyCitationEnabled(citationEnabledFrom(result && result[SETTINGS_KEY]));
    });
    if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[SETTINGS_KEY]) {
          applyCitationEnabled(citationEnabledFrom(changes[SETTINGS_KEY].newValue));
        }
      });
    }
  }

  console.log('[Citation] Citation feature initialized');
}

export default {
  initCitation,
  saveCitationFromCurrentPage,
  captureFromSelection,
  getVoiceTrigger,
  getCitationCountForCurrentPage,
  hasCurrentPageCitation,
  getCitationsForCurrentPage,
  getAllCitations,
  getAllProjects,
  openLibrary,
};
