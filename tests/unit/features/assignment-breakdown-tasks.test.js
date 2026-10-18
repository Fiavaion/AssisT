/**
 * @jest-environment jsdom
 *
 * The step checkboxes in the Assignment Breakdown panel.
 *
 * They are custom `role="checkbox"` divs with the tick as their only content, so a screen
 * reader announced "checkbox, not checked" eight times over with nothing to tell the steps
 * apart (WCAG 2.2 SC 4.1.2 Name, Role, Value). The step's own text is right beside them; the
 * checkbox now points at it.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  // getFailureMessage stays real: it IS the wording under test.
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
  generateWithAI: jest.fn(),
  getSuccessStatusMessage: jest.fn(),
  setAIStatusBar: jest.fn(),
}));

const aiClient = require('../../../src/features/shared/ai-feature-client.js');

/** The render is fired without being awaited, so let the microtasks drain. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const LONG_ASSIGNMENT = [
  'Write a 1500 word essay on the causes of the Irish famine.',
  'First, read the three set chapters and take notes.',
  'Next, draft an outline with one paragraph per cause.',
  'Then write the essay and reference every claim.',
  'Finally, proofread it and submit through the portal.',
].join(' ');

describe('the assignment breakdown step checkboxes', () => {
  let mod;

  beforeAll(async () => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mod = await import('../../../src/features/assignmentBreakdown/assignmentBreakdown.js');
  });

  beforeEach(() => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    // No AI configured, so the panel renders its own extractive breakdown — the same markup.
    aiClient.getAIMode.mockResolvedValue({ mode: 'off', isOff: true, displayLabel: 'Off' });
    aiClient.checkAIAvailable.mockResolvedValue({ available: false, needsApiKey: false });
    aiClient.getSuccessStatusMessage.mockReturnValue('');
  });

  afterEach(() => {
    mod.breakdown_hide();
  });

  test('each one is named by the step it ticks off', async () => {
    await mod.breakdown_show();
    await mod.breakdown_analyze(LONG_ASSIGNMENT);
    await settle();

    const checkboxes = Array.from(document.querySelectorAll('.assist-breakdown-task-checkbox'));
    expect(checkboxes.length).toBeGreaterThan(0);

    for (const checkbox of checkboxes) {
      const labelId = checkbox.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = document.getElementById(labelId);
      expect(label).not.toBeNull();
      expect(label.textContent.trim().length).toBeGreaterThan(0);
    }
  });

  test('ticking one from the keyboard leaves the keyboard on it', async () => {
    // Every tick re-renders the whole content area, which destroys the checkbox that was
    // focused. Focus then fell to <body> and the student lost their place in the list.
    await mod.breakdown_show();
    await mod.breakdown_analyze(LONG_ASSIGNMENT);
    await settle();

    const second = document.querySelectorAll('.assist-breakdown-task-checkbox')[1];
    expect(second).toBeDefined();
    const step = second.getAttribute('data-task-step');
    second.focus();

    second.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await settle();

    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(active.classList.contains('assist-breakdown-task-checkbox')).toBe(true);
    expect(active.getAttribute('data-task-step')).toBe(step);
    expect(active.getAttribute('aria-checked')).toBe('true');
  });
});
