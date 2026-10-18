/**
 * @jest-environment jsdom
 *
 * The eight AI feature panels, driven by keyboard alone.
 *
 * A tester drove all eight in real Chrome days before 1.0.0 and every one of them shut a
 * mouse-free student out: the Socratic Tutor bound Escape to a panel that never held focus, so
 * the key never arrived; Multi-document Compare let Tab walk out onto the page behind it after
 * four presses; five of the eight called `.focus()` on a div with no tabindex, which does
 * nothing; and not one of them handed the keyboard back to the control that opened it.
 *
 * Every panel now goes through the shared `trapFocus` helper, so these cases are the contract:
 * a named modal dialog (SC 4.1.2), focus moved in on open (SC 2.4.3), Tab held inside
 * (SC 2.1.2), Escape out from the keyboard alone (SC 2.1.2), and focus back where it started.
 */

/** Panels share one shape; only the selectors differ. */
const PANELS = [
  {
    name: 'Summarization',
    module: '../../../src/features/summarization/summarization.js',
    show: 'summarization_show',
    hide: 'summarization_hide',
    panelId: 'assist-summarization-panel',
    close: '.assist-summary-close',
    title: /summary/i,
  },
  {
    name: 'Text Simplification',
    module: '../../../src/features/textSimplification/textSimplification.js',
    show: 'simplification_show',
    hide: 'simplification_hide',
    panelId: 'assist-simplification-panel',
    close: '.assist-simplify-close',
    title: /simplified text/i,
  },
  {
    name: 'Assignment Breakdown',
    module: '../../../src/features/assignmentBreakdown/assignmentBreakdown.js',
    show: 'breakdown_show',
    hide: 'breakdown_hide',
    panelId: 'assist-breakdown-panel',
    close: '.assist-breakdown-close',
    title: /assignment breakdown/i,
  },
  {
    name: 'Citation Analyzer',
    module: '../../../src/features/citationAnalyzer/citationAnalyzer.js',
    show: 'citation_show',
    hide: 'citation_hide',
    panelId: 'assist-citation-panel',
    close: '.assist-citation-close',
    title: /citation analyzer/i,
  },
  {
    name: 'Multi-Document Compare',
    module: '../../../src/features/multiDocCompare/multiDocCompare.js',
    show: 'mdc_show',
    hide: 'mdc_hide',
    panelId: 'assist-mdc-panel',
    close: '.mdc-close',
    title: /compare documents/i,
  },
  {
    name: 'Study Path Generator',
    module: '../../../src/features/studyPathGenerator/studyPathGenerator.js',
    show: 'spg_show',
    hide: 'spg_hide',
    panelId: 'assist-spg-panel',
    close: '.spg-close',
    title: /study path/i,
  },
  {
    name: 'Socratic Tutor',
    module: '../../../src/features/socraticTutor/socraticTutor.js',
    show: 'tutor_show',
    hide: 'tutor_hide',
    panelId: 'assist-socratic-tutor-panel',
    close: '.assist-tutor-close',
    title: /socratic tutor/i,
  },
  {
    name: 'Knowledge Graph',
    module: '../../../src/features/knowledgeGraph/knowledgeGraph.js',
    show: 'graph_show',
    hide: 'graph_hide',
    panelId: 'assist-knowledge-graph',
    close: '.kg-close',
    title: /knowledge graph/i,
  },
];

/** trapFocus moves focus in on the next macrotask, so let it run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * jsdom has no layout, so every element reports `offsetParent === null` and the trap's
 * visibility filter throws away all candidates but the active element. That left a list of one,
 * which is simultaneously the first and the last focusable, so Tab was always swallowed and the
 * Tab case below passed no matter what the trap did. Report layout the way a browser does.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.isConnected && this.style.display !== 'none' ? document.body : null;
    },
  });
});

/** @param {HTMLElement} element @param {string} key @param {boolean} [shiftKey] */
function pressKey(element, key, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/**
 * The controls a browser would put in the panel's tab ring, in DOM order — the same set the
 * trap walks.
 * @param {HTMLElement} panel
 * @returns {HTMLElement[]}
 */
function focusablesIn(panel) {
  return Array.from(
    panel.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]),' +
        ' select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/** A panel is open when it is in the document and not display:none. */
function isOpen(panelId) {
  const panel = document.getElementById(panelId);
  return Boolean(panel) && panel.style.display !== 'none';
}

describe.each(PANELS)('$name panel', spec => {
  let mod;
  let trigger;

  beforeAll(async () => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mod = await import(spec.module);
  });

  beforeEach(() => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    trigger = document.createElement('button');
    trigger.id = 'test-opener';
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
  });

  afterEach(() => {
    mod[spec.hide]();
    trigger.remove();
  });

  /** Open it the way the student does: from a focused control. */
  async function open() {
    trigger.focus();
    await mod[spec.show]();
    await settle();
  }

  const panel = () => document.getElementById(spec.panelId);

  test('is a modal dialog named by its own heading', async () => {
    await open();

    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('true');
    const heading = document.getElementById(panel().getAttribute('aria-labelledby'));
    expect(heading).not.toBeNull();
    expect(heading.textContent).toMatch(spec.title);
  });

  test('moves the keyboard into itself on open', async () => {
    await open();

    expect(panel().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  test('wraps Tab and Shift+Tab at its own two ends', async () => {
    await open();

    // The Citation Analyzer opens with its close button alone until results render, so one
    // control is legitimate; both ends are then the same element and Tab must still not leave.
    const controls = focusablesIn(panel());
    expect(controls.length).toBeGreaterThan(0);
    const first = controls[0];
    const last = controls[controls.length - 1];

    last.focus();
    expect(pressKey(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    expect(pressKey(first, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  test('pulls the keyboard back in when the focused control has gone', async () => {
    await open();

    // A re-render (ticking a step, a new answer arriving) destroys the focused control and
    // focus lands on <body>, which is neither end of the dialog's list. That is the case where
    // Tab used to walk out onto the page behind the panel.
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);

    expect(pressKey(document.body, 'Tab').defaultPrevented).toBe(true);
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  test('keeps a control on the page behind it out of the tab ring', async () => {
    await open();

    trigger.focus();

    expect(pressKey(trigger, 'Tab').defaultPrevented).toBe(true);
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  test('closes on Escape before anything has been clicked', async () => {
    await open();

    const escape = pressKey(document.activeElement, 'Escape');

    expect(escape.defaultPrevented).toBe(true);
    expect(isOpen(spec.panelId)).toBe(false);
  });

  test('hands the keyboard back to the control that opened it', async () => {
    await open();

    pressKey(document.activeElement, 'Escape');

    expect(document.activeElement).toBe(trigger);
  });

  test('never leaves the keyboard on the body when the opener has gone', async () => {
    const prose = document.createElement('p');
    prose.id = 'test-prose';
    prose.textContent = 'Some selected page prose.';
    document.body.appendChild(prose);
    const range = document.createRange();
    range.selectNodeContents(prose);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Nothing is focused: the highlight menu activates on mousedown and is gone by now, which
    // is exactly the case that used to drop the student at the top of the page (SC 2.4.3).
    document.body.focus();
    await mod[spec.show]();
    await settle();

    pressKey(document.activeElement, 'Escape');

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(prose);

    prose.remove();
  });
});
