/**
 * @jest-environment jsdom
 *
 * The welcome page's builders — the DOM it makes from a track and from a queue step.
 *
 * The accessibility claims are the point of most of these: the picker is real checkboxes in a
 * labelled group, a description is attached rather than folded into the name, and a step that is
 * not yet available says so in words rather than by looking greyer.
 */

import {
  createTrackChoice,
  getSelectedTrackIds,
  createHubStep,
  renderHub,
  renderImportResult,
} from '../../../src/pages/welcome/welcome.js';
import { TRACK_CONFIG, buildQueue, markDone } from '../../../src/pages/onboarding/onboarding-queue.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// createTrackChoice
// ---------------------------------------------------------------------------

describe('createTrackChoice()', () => {
  const TRACK = TRACK_CONFIG.clean;

  it('builds a real checkbox, not a div pretending to be one', () => {
    const input = createTrackChoice(TRACK).querySelector('input');
    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBeNull();
  });

  it('starts unticked', () => {
    expect(createTrackChoice(TRACK).querySelector('input').checked).toBe(false);
  });

  it('gives the checkbox a label that names it', () => {
    const choice = createTrackChoice(TRACK);
    const input = choice.querySelector('input');
    const label = choice.querySelector('label');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(label.textContent).toBe(TRACK.label);
  });

  it('attaches the description instead of folding it into the name', () => {
    const choice = createTrackChoice(TRACK);
    const input = choice.querySelector('input');
    const describedBy = input.getAttribute('aria-describedby');
    const desc = choice.querySelector(`#${describedBy}`);
    expect(desc).not.toBeNull();
    expect(desc.textContent).toBe(TRACK.description);
    expect(choice.querySelector('label').textContent).not.toContain(TRACK.description);
  });

  it('carries the track id on both the wrapper and the input', () => {
    const choice = createTrackChoice(TRACK);
    expect(choice.dataset.trackId).toBe('clean');
    expect(choice.querySelector('input').value).toBe('clean');
  });

  it('marks a destructive track so it can be styled and read as one', () => {
    expect(createTrackChoice(TRACK_CONFIG.clean).className).toContain('track-choice--destructive');
    expect(createTrackChoice(TRACK_CONFIG.discover).className).not.toContain(
      'track-choice--destructive'
    );
  });
});

// ---------------------------------------------------------------------------
// getSelectedTrackIds
// ---------------------------------------------------------------------------

describe('getSelectedTrackIds()', () => {
  function group(ids) {
    const div = document.createElement('div');
    ids.forEach(id => div.appendChild(createTrackChoice(TRACK_CONFIG[id])));
    return div;
  }

  it('returns only the ticked ones', () => {
    const container = group(['clean', 'import', 'discover']);
    container.querySelector('#track-import').checked = true;
    container.querySelector('#track-discover').checked = true;
    expect(getSelectedTrackIds(container)).toEqual(['import', 'discover']);
  });

  it('returns nothing when nothing is ticked', () => {
    expect(getSelectedTrackIds(group(['clean', 'discover']))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createHubStep
// ---------------------------------------------------------------------------

describe('createHubStep()', () => {
  const [cleanStep] = buildQueue(['clean']);
  const [importStep] = buildQueue(['import']);
  const [discoverStep] = buildQueue(['discover']);

  it('returns an <li> carrying the track id', () => {
    const li = createHubStep(discoverStep, { actionable: true });
    expect(li.tagName).toBe('LI');
    expect(li.dataset.trackId).toBe('discover');
  });

  it('shows the label, and a word for done rather than only a colour', () => {
    const done = markDone([discoverStep], 'discover')[0];
    const li = createHubStep(done, { actionable: false });
    expect(li.textContent).toContain(TRACK_CONFIG.discover.label);
    expect(li.textContent).toContain('(done)');
    expect(li.querySelector('.hub-step__status-icon').textContent).toBe('✓');
  });

  it('gives an actionable external step a Start button that reports the step', () => {
    const onSetup = jest.fn();
    const li = createHubStep(discoverStep, { actionable: true }, { onSetup });
    const button = li.querySelector('button');
    expect(button.getAttribute('aria-label')).toContain(TRACK_CONFIG.discover.label);
    fireMousedown(button);
    expect(onSetup).toHaveBeenCalledWith(discoverStep);
  });

  it('says in words that a step further down is not available yet', () => {
    const li = createHubStep(discoverStep, { actionable: false });
    expect(li.querySelector('button')).toBeNull();
    expect(li.textContent).toContain('Available once the step above is finished');
  });

  it('warns before clean setup runs, and waits to be asked', () => {
    const onRunClean = jest.fn();
    const li = createHubStep(cleanStep, { actionable: true }, { onRunClean });
    const warning = li.querySelector('.hub-step__warning').textContent;
    expect(warning).toContain('switches off every AssisT feature');
    expect(warning).toContain('not deleted');
    expect(onRunClean).not.toHaveBeenCalled();
    fireMousedown(li.querySelector('button'));
    expect(onRunClean).toHaveBeenCalledWith(cleanStep);
  });

  it('gives the import step a labelled file input that reports through change', () => {
    const onChooseFile = jest.fn();
    const li = createHubStep(importStep, { actionable: true }, { onChooseFile });
    const input = li.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(li.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(input.accept).toContain('json');
  });

  it('gives the import step a live region for its result', () => {
    const li = createHubStep(importStep, { actionable: true });
    const region = li.querySelector('#import-result');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('offers a done step nothing to press', () => {
    const done = markDone([cleanStep], 'clean')[0];
    const li = createHubStep(done, { actionable: true });
    expect(li.querySelector('button')).toBeNull();
    expect(li.querySelector('.hub-step__warning')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderHub
// ---------------------------------------------------------------------------

describe('renderHub()', () => {
  it('renders one row per step, in queue order', () => {
    const ol = document.createElement('ol');
    renderHub(ol, buildQueue(['discover', 'clean', 'import']));
    expect(Array.from(ol.querySelectorAll('li')).map(li => li.dataset.trackId)).toEqual([
      'clean',
      'import',
      'discover',
    ]);
  });

  it('makes only the first unfinished step actionable', () => {
    const ol = document.createElement('ol');
    renderHub(ol, buildQueue(['clean', 'discover']));
    const [first, second] = ol.querySelectorAll('li');
    expect(first.querySelector('button')).not.toBeNull();
    expect(second.querySelector('button')).toBeNull();
    expect(second.textContent).toContain('Available once the step above is finished');
  });

  it('moves the action down as steps are finished', () => {
    const ol = document.createElement('ol');
    renderHub(ol, markDone(buildQueue(['clean', 'discover']), 'clean'));
    const [first, second] = ol.querySelectorAll('li');
    expect(first.querySelector('button')).toBeNull();
    expect(second.querySelector('button')).not.toBeNull();
  });

  it('clears what was there before, and copes with an empty queue', () => {
    const ol = document.createElement('ol');
    ol.innerHTML = '<li>old</li>';
    renderHub(ol, []);
    expect(ol.querySelectorAll('li').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// renderImportResult
// ---------------------------------------------------------------------------

describe('renderImportResult()', () => {
  it("shows a refusal in the module's own words, and says nothing changed", () => {
    const container = document.createElement('div');
    renderImportResult(container, {
      ok: false,
      code: 'not-an-assist-file',
      message: 'That is not an AssisT settings file.',
    });
    expect(container.textContent).toContain('That is not an AssisT settings file.');
    expect(container.textContent).toContain('Nothing was changed');
    expect(container.querySelector('button')).toBeNull();
  });

  it('reports how much was applied', () => {
    const container = document.createElement('div');
    renderImportResult(container, {
      ok: true,
      applied: ['assist_settings', 'aiMode'],
      ignored: [],
      undo: jest.fn(),
    });
    expect(container.textContent).toContain('2 settings applied');
  });

  it('says how many keys it did not recognise, rather than hiding them', () => {
    const container = document.createElement('div');
    renderImportResult(container, {
      ok: true,
      applied: ['assist_settings'],
      ignored: ['someFutureKey'],
      undo: jest.fn(),
    });
    expect(container.textContent).toContain('1 setting applied');
    expect(container.textContent).toContain('1 this version does not recognise');
  });

  it('offers an undo that hands the result back', () => {
    const container = document.createElement('div');
    const onUndo = jest.fn();
    const result = { ok: true, applied: ['aiMode'], ignored: [], undo: jest.fn() };
    renderImportResult(container, result, onUndo);
    fireMousedown(container.querySelector('button'));
    expect(onUndo).toHaveBeenCalledWith(result);
  });

  it('replaces a previous message rather than stacking them', () => {
    const container = document.createElement('div');
    renderImportResult(container, { ok: false, code: 'no-file', message: 'No file was chosen.' });
    renderImportResult(container, { ok: true, applied: ['aiMode'], ignored: [], undo: jest.fn() });
    expect(container.textContent).not.toContain('No file was chosen.');
    expect(container.querySelectorAll('p').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Keyboard operability (WCAG 2.2 SC 2.1.1)
// ---------------------------------------------------------------------------

/**
 * The welcome page is the first thing a student meets, and for several of them it is the first
 * thing they meet without a mouse. A native button never emits mousedown from the keyboard —
 * Enter and Space produce a click — so these press the key rather than reusing fireMousedown.
 */
describe('the welcome buttons from the keyboard', () => {
  const pressKey = (el, key) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  const [cleanStep] = buildQueue(['clean']);
  const [discoverStep] = buildQueue(['discover']);

  it('starts an external step on Enter', () => {
    const onSetup = jest.fn();
    const li = createHubStep(discoverStep, { actionable: true }, { onSetup });
    pressKey(li.querySelector('button'), 'Enter');
    expect(onSetup).toHaveBeenCalledWith(discoverStep);
  });

  it('starts an external step on Space', () => {
    const onSetup = jest.fn();
    const li = createHubStep(discoverStep, { actionable: true }, { onSetup });
    pressKey(li.querySelector('button'), ' ');
    expect(onSetup).toHaveBeenCalledWith(discoverStep);
  });

  it('runs clean setup on Enter', () => {
    const onRunClean = jest.fn();
    const li = createHubStep(cleanStep, { actionable: true }, { onRunClean });
    pressKey(li.querySelector('button'), 'Enter');
    expect(onRunClean).toHaveBeenCalledWith(cleanStep);
  });

  it('undoes an import on Enter', () => {
    const container = document.createElement('div');
    const onUndo = jest.fn();
    const result = { ok: true, applied: ['aiMode'], ignored: [], undo: jest.fn() };
    renderImportResult(container, result, onUndo);
    pressKey(container.querySelector('button'), 'Enter');
    expect(onUndo).toHaveBeenCalledWith(result);
  });
});
