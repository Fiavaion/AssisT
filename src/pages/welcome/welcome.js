/**
 * The welcome page — AssisT's front door on first install.
 *
 * It asks one question, "which guides would you like to complete?", and then runs the ones the
 * student picked, in order, one at a time. Two of the four are carried out here (clean setup and
 * import); the other two are existing pages that leave and come back through the resume protocol
 * in `onboarding-queue.js`. Every queue then ends with one more step, not a guide the student
 * picks: what AssisT may send to online services (`consent-step.js`, ADR 0006).
 *
 * TWO THINGS ARE DELIBERATE AND EASY TO UNDO BY ACCIDENT:
 *
 * 1. The picker is real checkboxes in a fieldset, not clickable divs with `role="checkbox"`. A
 *    real checkbox brings its own keyboard behaviour, its own announcement, and works when a
 *    script fails; the legend names the group. They are wired with `addEventListener('change')` —
 *    the documented exception to the project's event-handler standard, because
 *    `attachInteractiveHandler` calls `preventDefault` on mousedown and a checkbox would never
 *    flip. The same applies to the file input on the import step. Buttons use the standard
 *    handlers.
 *
 * 2. Only the first unfinished step is actionable. The queue orders bulk tracks before configuring
 *    ones so that "clean setup and discover your tools" cannot wipe the answers the student just
 *    gave; letting them run the steps in any order would give that ordering away again.
 *
 * @module pages/welcome/welcome
 */

import {
  TRACK_CONFIG,
  TRACK_ORDER,
  buildQueue,
  saveQueue,
  loadQueue,
  markDone,
  nextStep,
  isComplete,
  remainingCount,
  selectionWarning,
} from '../onboarding/onboarding-queue.js';
import { applyCleanSetup } from '../onboarding/clean-setup.js';
import { importSettingsFromFile } from '../../utils/settings-portability.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import {
  CONSENT_STEP_ID,
  withConsentStep,
  loadConsentChoices,
  createConsentPanel,
  confirmConsentChoices,
  describeConsentResult,
} from './consent-step.js';

/** The queue this page is currently working through. */
let currentQueue = [];

/**
 * The services the consent step lists, read from storage before each render of the checklist:
 * the steps before it change what is switched on, so it is worked out when it is reached.
 */
let consentChoices = [];

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

/**
 * One track as a real checkbox with a label and a description.
 *
 * The label is the accessible name and the description is attached with `aria-describedby`, so a
 * screen reader announces the short name first and the explanation after, rather than one long
 * run-on name.
 *
 * @param {{id: string, label: string, description: string, destructive?: boolean}} track
 * @returns {HTMLElement}
 */
export function createTrackChoice(track) {
  const wrapper = document.createElement('div');
  wrapper.className = 'track-choice' + (track.destructive ? ' track-choice--destructive' : '');
  wrapper.dataset.trackId = track.id;

  const inputId = `track-${track.id}`;
  const descId = `${inputId}-desc`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'track-choice__input';
  input.id = inputId;
  input.value = track.id;
  input.dataset.trackId = track.id;
  input.setAttribute('aria-describedby', descId);

  const label = document.createElement('label');
  label.className = 'track-choice__label';
  label.setAttribute('for', inputId);
  label.textContent = track.label;

  const desc = document.createElement('p');
  desc.className = 'track-choice__desc';
  desc.id = descId;
  desc.textContent = track.description;

  wrapper.appendChild(input);
  wrapper.appendChild(label);
  wrapper.appendChild(desc);
  return wrapper;
}

/**
 * The track ids currently ticked.
 *
 * @param {HTMLElement} container
 * @returns {string[]}
 */
export function getSelectedTrackIds(container) {
  const checked = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked)
    .map(input => input.dataset.trackId || input.value)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

/**
 * The panel a pending step offers: a button to leave for an external guide, the confirmation for
 * clean setup, the file chooser for import, or the questions about online services.
 *
 * @param {Object} step
 * @param {Object} handlers
 * @param {{consentChoices?: Array}} [options]
 * @returns {HTMLElement|null}
 */
function createStepPanel(step, handlers, options = {}) {
  const panel = document.createElement('div');
  panel.className = 'hub-step__panel';

  if (step.trackId === CONSENT_STEP_ID) {
    panel.appendChild(
      createConsentPanel(options.consentChoices || [], {
        onSave: answers => {
          if (handlers.onSaveConsent) {
            handlers.onSaveConsent(answers, step);
          }
        },
      })
    );
    return panel;
  }

  if (step.kind === 'external') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-setup';
    button.textContent = 'Start';
    button.setAttribute('aria-label', `Start ${step.label}`);
    attachAccessibleHandler(button, `Start ${step.label}`, () => {
      if (handlers.onSetup) {
        handlers.onSetup(step);
      }
    });
    panel.appendChild(button);
    return panel;
  }

  if (step.trackId === 'clean') {
    // Destructive, so it says what it will do and waits to be asked. Nothing is written until this
    // button is pressed.
    const warning = document.createElement('p');
    warning.className = 'hub-step__warning';
    warning.textContent =
      'This switches off every AssisT feature straight away, read aloud included. Your citations, notes and highlights are not deleted, and you can switch anything back on from the popup.';
    panel.appendChild(warning);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-destructive';
    button.textContent = 'Switch everything off';
    attachAccessibleHandler(button, 'Switch everything off', () => {
      if (handlers.onRunClean) {
        handlers.onRunClean(step);
      }
    });
    panel.appendChild(button);
    return panel;
  }

  if (step.trackId === 'import') {
    const label = document.createElement('label');
    label.className = 'hub-step__file-label';
    label.setAttribute('for', 'import-file-input');
    label.textContent = 'Choose your settings file';
    panel.appendChild(label);

    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'import-file-input';
    input.className = 'hub-step__file-input';
    input.accept = 'application/json,.json';
    // A file input is like a checkbox: it reports through `change`, and the standard interactive
    // handler's preventDefault on mousedown would stop the file picker opening at all.
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file && handlers.onChooseFile) {
        handlers.onChooseFile(file, step);
      }
    });
    panel.appendChild(input);
    return panel;
  }

  return null;
}

/**
 * The way out of a step: skip it, or go back to what came before.
 *
 * A student who ticked "import settings" and then found they had no file to import was stuck on
 * this page — the file input was the only control the step offered, and every guide behind it
 * said it was waiting. A step with no way past it is a trap, so every step in hand gets both.
 *
 * @param {Object} step
 * @param {{previousLabel?: string|null}} options
 * @param {{onSkip?: Function, onBack?: Function}} handlers
 * @returns {HTMLElement}
 */
function createStepNav(step, options, handlers) {
  const nav = document.createElement('div');
  nav.className = 'hub-step__nav';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn btn-text btn-back-step';
  back.textContent = 'Back';
  // Named, because "Back" on its own tells a screen-reader user nothing about where it goes.
  back.setAttribute(
    'aria-label',
    options.previousLabel ? `Back to ${options.previousLabel}` : 'Back to the guide picker'
  );
  attachAccessibleHandler(back, back.getAttribute('aria-label'), () => {
    if (handlers.onBack) {
      handlers.onBack(step);
    }
  });
  nav.appendChild(back);

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn btn-text btn-skip-step';
  skip.textContent = 'Skip this step';
  skip.setAttribute('aria-label', `Skip ${step.label}`);
  attachAccessibleHandler(skip, `Skip ${step.label}`, () => {
    if (handlers.onSkip) {
      handlers.onSkip(step);
    }
  });
  nav.appendChild(skip);

  return nav;
}

/**
 * One row of the checklist.
 *
 * @param {{trackId: string, label: string, kind: string, status: string, skipped?: boolean, url?: string}} step
 * @param {{actionable?: boolean, previousLabel?: string|null, consentChoices?: Array}} [options]
 * @param {{onSetup?: Function, onRunClean?: Function, onChooseFile?: Function, onSaveConsent?: Function, onSkip?: Function, onBack?: Function}} [handlers]
 * @returns {HTMLLIElement}
 */
export function createHubStep(step, options = {}, handlers = {}) {
  const done = step.status === 'done';
  const skipped = done && step.skipped === true;
  const li = document.createElement('li');
  li.className =
    'hub-step' + (done ? ' hub-step--done' : '') + (skipped ? ' hub-step--skipped' : '');
  li.dataset.trackId = step.trackId;

  // Icon and word, never colour alone (SC 1.4.1).
  const icon = document.createElement('span');
  icon.className = 'hub-step__status-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = skipped ? '–' : done ? '✓' : '○';
  li.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'hub-step__body';

  const label = document.createElement('span');
  label.className = 'hub-step__label';
  label.textContent = step.label;
  if (done) {
    const srDone = document.createElement('span');
    srDone.className = 'sr-only';
    srDone.textContent = skipped ? ' (skipped)' : ' (done)';
    label.appendChild(srDone);
  }
  body.appendChild(label);

  const config = TRACK_CONFIG[step.trackId];
  if (config && !done) {
    const desc = document.createElement('p');
    desc.className = 'hub-step__desc';
    desc.textContent = config.description;
    body.appendChild(desc);
  }

  if (!done) {
    if (options.actionable) {
      const panel = createStepPanel(step, handlers, options);
      if (panel) {
        body.appendChild(panel);
      }
      body.appendChild(createStepNav(step, options, handlers));
    } else {
      const waiting = document.createElement('p');
      waiting.className = 'hub-step__waiting';
      waiting.textContent = 'Available once the step above is finished.';
      body.appendChild(waiting);
    }
  }

  // Where an import reports back — kept out of the panel so it survives the panel being replaced.
  if (step.trackId === 'import') {
    const result = document.createElement('div');
    result.className = 'hub-step__result';
    result.id = 'import-result';
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    body.appendChild(result);
  }

  li.appendChild(body);
  return li;
}

/**
 * Draw the whole checklist. Only the first unfinished step is actionable.
 *
 * @param {HTMLElement} container
 * @param {Array} queue
 * @param {Object} handlers
 * @param {{consentChoices?: Array}} [extras] - what the consent step lists
 */
export function renderHub(container, queue, handlers = {}, extras = {}) {
  const next = nextStep(queue);
  container.innerHTML = '';
  queue.forEach((step, index) => {
    container.appendChild(
      createHubStep(
        step,
        {
          actionable: !!next && next.trackId === step.trackId,
          previousLabel: index > 0 ? queue[index - 1].label : null,
          consentChoices: extras.consentChoices,
        },
        handlers
      )
    );
  });
}

/**
 * What to show after an import attempt, success or failure.
 *
 * The module's own wording is used verbatim on failure: those messages are written for a student
 * to read and rephrasing them here would put a second, drifting copy in the codebase.
 *
 * @param {HTMLElement} container - the step's result region
 * @param {Object} result - a result from `importSettingsFromFile`
 * @param {Function} [onUndo]
 */
export function renderImportResult(container, result, onUndo) {
  container.innerHTML = '';

  const message = document.createElement('p');
  message.className = result.ok ? 'import-result import-result--ok' : 'import-result';

  if (!result.ok) {
    message.textContent = `Nothing was changed. ${result.message}`;
    container.appendChild(message);
    return;
  }

  const applied = result.applied.length;
  const ignored = result.ignored.length;
  message.textContent =
    `Your settings were restored — ${applied} ${applied === 1 ? 'setting' : 'settings'} applied` +
    (ignored > 0 ? `, ${ignored} this version does not recognise were skipped.` : '.');
  container.appendChild(message);

  if (typeof result.undo === 'function' && onUndo) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'btn btn-text btn-undo';
    undoBtn.textContent = 'Undo this import';
    attachAccessibleHandler(undoBtn, 'Undo this import', () => onUndo(result));
    container.appendChild(undoBtn);
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/**
 * Say something through the page's live region.
 * @param {string} message
 */
function announce(message) {
  const region = document.getElementById('welcome-status');
  if (!region) {
    return;
  }
  // Clearing first makes an assistive technology re-read a message identical to the last one.
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/**
 * Announce where the student is up to.
 * @param {Array} queue
 */
function announceProgress(queue) {
  if (isComplete(queue)) {
    announce('All steps finished. AssisT is ready.');
    return;
  }
  const step = nextStep(queue);
  const position = queue.length - remainingCount(queue) + 1;
  announce(`Step ${position} of ${queue.length}: ${step.label}.`);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/**
 * Put focus on the heading of a view the page has just swapped in.
 *
 * Swapping the picker for the checklist replaced everything that had focus, so focus fell back to
 * the document: the page silently scrolled away and a keyboard or screen-reader user had to tab
 * in from the very top to find out what had happened. The heading is not in the tab order
 * (tabindex -1), so taking focus here costs nothing afterwards.
 *
 * @param {string} headingId
 */
function focusViewHeading(headingId) {
  const heading = document.getElementById(headingId);
  if (!heading || typeof heading.focus !== 'function') {
    return;
  }
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
  }
  heading.focus();
  if (typeof heading.scrollIntoView === 'function') {
    heading.scrollIntoView({ block: 'start' });
  }
}

/**
 * @param {{focus?: boolean}} [options] - focus the heading; off on first paint, because a page
 *   that grabs focus as it loads skips the student past the skip link.
 */
function showIntentView(options = {}) {
  document.getElementById('view-intent')?.removeAttribute('hidden');
  document.getElementById('view-hub')?.setAttribute('hidden', '');
  if (options.focus) {
    focusViewHeading('intent-heading');
  }
}

/**
 * Show the checklist for a queue, and remember it as the one being worked through.
 * @param {Array} queue
 * @returns {Promise<void>}
 */
async function showHubView(queue) {
  currentQueue = queue;
  document.getElementById('view-intent')?.setAttribute('hidden', '');
  document.getElementById('view-hub')?.removeAttribute('hidden');

  const checklist = document.getElementById('hub-checklist');
  if (checklist) {
    await refreshConsentChoices();
    renderHub(checklist, queue, hubHandlers(), { consentChoices });
  }

  await refreshCompletion(queue);
  focusViewHeading('hub-heading');
  announceProgress(queue);
}

/**
 * The one set of handlers every render of the checklist uses.
 * @returns {Object}
 */
function hubHandlers() {
  return {
    onSetup: handleSetupStep,
    onRunClean: handleRunClean,
    onChooseFile: handleChooseFile,
    onSaveConsent: handleSaveConsent,
    onSkip: handleSkipStep,
    onBack: handleBackStep,
  };
}

/**
 * Show the finished panel once nothing is left, and record that onboarding is done.
 *
 * This page owns `onboardingComplete`, including for the student who picked no guides at all:
 * an empty queue is a finished onboarding, not an abandoned one.
 *
 * @param {Array} queue
 * @returns {Promise<void>}
 */
async function refreshCompletion(queue) {
  const panel = document.getElementById('hub-complete');
  if (!panel) {
    return;
  }
  if (!isComplete(queue)) {
    panel.setAttribute('hidden', '');
    return;
  }
  panel.removeAttribute('hidden');
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({ onboardingComplete: true });
  }
}

/**
 * Redraw the checklist after a step has changed, save the queue, and put focus somewhere sensible.
 *
 * Finishing a step destroys the control that was just pressed. Left alone, focus falls back to the
 * document and a keyboard or screen-reader user has to tab in from the top of the page again, so
 * the newly available control takes it instead.
 *
 * @returns {Promise<void>}
 */
async function refreshHub() {
  await saveQueue(currentQueue);
  const checklist = document.getElementById('hub-checklist');
  if (checklist) {
    await refreshConsentChoices();
    renderHub(checklist, currentQueue, hubHandlers(), { consentChoices });
  }
  await refreshCompletion(currentQueue);
  focusNextControl();
}

/**
 * Move focus to whatever the student can do next: the control on the newly available step, or the
 * finish button once there is nothing left. On the consent step that is the first question, not
 * "Allow all" above it: answering everything at once is offered, never the default path.
 */
function focusNextControl() {
  const next = nextStep(currentQueue);
  const target = next
    ? document.querySelector(
        `#hub-checklist li[data-track-id="${next.trackId}"] .hub-step__panel button:not(.consent-step__bulk-button),` +
          ` #hub-checklist li[data-track-id="${next.trackId}"] .hub-step__panel input,` +
          ` #hub-checklist li[data-track-id="${next.trackId}"] .hub-step__nav button`
      )
    : document.getElementById('btn-finish');
  if (target && typeof target.focus === 'function') {
    target.focus();
  }
}

/**
 * Work out what the consent step lists, when it is the step in hand. Earlier steps change what is
 * switched on, so it is read at the moment the step is reached, not when the queue was built.
 * @returns {Promise<void>}
 */
async function refreshConsentChoices() {
  const next = nextStep(currentQueue);
  if (!next || next.trackId !== CONSENT_STEP_ID) {
    return;
  }
  try {
    consentChoices = await loadConsentChoices();
  } catch (error) {
    console.error('[AssisT] Could not read what to ask about:', error);
    consentChoices = [];
  }
}

// ---------------------------------------------------------------------------
// Step handlers
// ---------------------------------------------------------------------------

/**
 * Leave for an external guide, which will send the student back here when it finishes.
 * @param {{url: string}} step
 */
function handleSetupStep(step) {
  if (!step.url) {
    return;
  }
  const base =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL(step.url)
      : step.url;
  window.location.href = `${base}?onboarding=1`;
}

/**
 * Switch everything off, then move on.
 * @param {{trackId: string}} step
 * @returns {Promise<void>}
 */
async function handleRunClean(step) {
  const { toolsOff } = await applyCleanSetup();
  currentQueue = markDone(currentQueue, step.trackId);
  await refreshHub();
  announce(`${toolsOff} features switched off. Nothing is on until you switch it on.`);
}

/**
 * Read a settings file and apply it. A refused file changes nothing and leaves the step open, so
 * the student can try a different one.
 *
 * @param {File} file
 * @param {{trackId: string}} step
 * @returns {Promise<void>}
 */
async function handleChooseFile(file, step) {
  const result = await importSettingsFromFile(file);
  const region = document.getElementById('import-result');

  if (!result.ok) {
    if (region) {
      renderImportResult(region, result);
    }
    announce(`Nothing was changed. ${result.message}`);
    return;
  }

  currentQueue = markDone(currentQueue, step.trackId);
  await refreshHub();

  const after = document.getElementById('import-result');
  if (after) {
    renderImportResult(after, result, handleUndoImport);
  }
  announce(`Your settings were restored — ${result.applied.length} applied.`);
}

/**
 * Save the answers to the consent step, then move on.
 *
 * Not async on purpose: `confirmConsentChoices` makes the one Chrome permission request before it
 * returns, and it has to, because Chrome only shows its prompt inside the click's user gesture.
 * Nothing may be awaited ahead of it.
 *
 * @param {Object<string, boolean>} answers
 * @param {{trackId: string}} step
 * @returns {Promise<void>}
 */
function handleSaveConsent(answers, step) {
  return confirmConsentChoices(answers).then(async result => {
    currentQueue = markDone(currentQueue, step.trackId);
    await refreshHub();
    announce(describeConsentResult(result));
  });
}

/**
 * Put the settings back as they were and re-open the import step, so another file can be tried.
 * @param {{undo: Function}} result
 * @returns {Promise<void>}
 */
async function handleUndoImport(result) {
  await result.undo();
  currentQueue = currentQueue.map(step =>
    step.trackId === 'import' ? { ...step, status: 'pending' } : step
  );
  await refreshHub();
  announce('Import undone. Your settings are back as they were, and you can choose another file.');
}

/**
 * Mark a step as deliberately passed over.
 *
 * It counts as finished, because the queue's whole job is to decide what is still in the way and
 * a skipped step is not in the way. It is flagged so the checklist can say "skipped" rather than
 * claim the student did something they did not.
 *
 * @param {Array} queue
 * @param {string} trackId
 * @returns {Array}
 */
function markStepSkipped(queue, trackId) {
  return queue.map(step =>
    step.trackId === trackId ? { ...step, status: 'done', skipped: true } : { ...step }
  );
}

/**
 * Put a step back in the way, so it can be done after all.
 *
 * @param {Array} queue
 * @param {string} trackId
 * @returns {Array}
 */
function reopenStep(queue, trackId) {
  return queue.map(step =>
    step.trackId === trackId ? { ...step, status: 'pending', skipped: false } : { ...step }
  );
}

/**
 * Pass over the step in hand and move on to the next one.
 *
 * @param {{trackId: string, label: string}} step
 * @returns {Promise<void>}
 */
async function handleSkipStep(step) {
  currentQueue = markStepSkipped(currentQueue, step.trackId);
  await refreshHub();
  announce(`${step.label} skipped. You can do it later from the extension popup.`);
}

/**
 * Go back: to the step before this one if there is one, otherwise out to the guide picker.
 *
 * @param {{trackId: string}} step
 * @returns {Promise<void>}
 */
async function handleBackStep(step) {
  const index = currentQueue.findIndex(item => item.trackId === step.trackId);

  if (index <= 0) {
    await saveQueue(currentQueue);
    showIntentView({ focus: true });
    announce('Back to the guides. Change what you picked, then choose Continue.');
    return;
  }

  const previous = currentQueue[index - 1];
  currentQueue = reopenStep(currentQueue, previous.trackId);
  await refreshHub();
  announce(`Back to ${previous.label}.`);
}

// ---------------------------------------------------------------------------
// Picker wiring
// ---------------------------------------------------------------------------

/**
 * Show or hide the note about a selection that contradicts itself.
 */
function refreshSelectionWarning() {
  const group = document.getElementById('track-choices');
  const note = document.getElementById('selection-warning');
  if (!group || !note) {
    return;
  }
  const warning = selectionWarning(getSelectedTrackIds(group));
  if (warning) {
    note.textContent = warning;
    note.removeAttribute('hidden');
  } else {
    note.textContent = '';
    note.setAttribute('hidden', '');
  }
}

/**
 * Build the checkbox for every track.
 */
function mountPicker() {
  const group = document.getElementById('track-choices');
  if (!group) {
    return;
  }
  group.innerHTML = '';
  TRACK_ORDER.forEach(trackId => {
    const track = TRACK_CONFIG[trackId];
    if (!track) {
      return;
    }
    const choice = createTrackChoice(track);
    // Checkboxes report through `change` — see the module header.
    choice
      .querySelector('input[type="checkbox"]')
      .addEventListener('change', refreshSelectionWarning);
    group.appendChild(choice);
  });
}

/**
 * Build the queue from what is ticked and start working through it. Ticking nothing is a valid
 * answer: the queue then holds only the consent step, which every student is asked (ADR 0006) and
 * which tells a student with nothing to be asked about that nothing leaves the computer.
 *
 * @returns {Promise<void>}
 */
async function handleContinue() {
  const group = document.getElementById('track-choices');
  const queue = withConsentStep(buildQueue(group ? getSelectedTrackIds(group) : []));
  await saveQueue(queue);
  await showHubView(queue);
}

/**
 * Close the tab once the student is finished.
 */
function handleFinish() {
  // `refreshCompletion` has already recorded that onboarding is done — this button only closes.
  if (typeof window !== 'undefined' && window.close) {
    window.close();
  }
}

function wireButtons() {
  const continueBtn = document.getElementById('btn-continue');
  if (continueBtn) {
    attachAccessibleHandler(continueBtn, 'Continue', () => {
      handleContinue();
    });
  }

  const finishBtn = document.getElementById('btn-finish');
  if (finishBtn) {
    attachAccessibleHandler(finishBtn, 'Open AssisT', () => {
      handleFinish();
    });
  }
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

/**
 * Decide what to show on load.
 *
 * `?resume=1&done=<trackId>` — an external guide has finished and sent the student back.
 * Anything else — start at the picker.
 *
 * @returns {Promise<void>}
 */
async function handleResume() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('resume') !== '1') {
    showIntentView();
    return;
  }

  let queue = await loadQueue();
  if (!Array.isArray(queue) || queue.length === 0) {
    showIntentView();
    return;
  }
  // A queue saved before the consent step existed still ends with it.
  queue = withConsentStep(queue);

  const doneId = params.get('done');
  if (doneId) {
    queue = markDone(queue, doneId);
    await saveQueue(queue);
  }

  await showHubView(queue);
}

/**
 * @returns {Promise<void>}
 */
async function init() {
  mountPicker();
  wireButtons();
  await handleResume();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
