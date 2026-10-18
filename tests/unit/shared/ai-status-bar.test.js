/**
 * @jest-environment jsdom
 *
 * The AI status line in the eight AI panels.
 *
 * When Browser AI still needs setting up, the status line offers a way to the AI settings. It used
 * to do that with a bare click listener on the line itself: no role, no tab stop, no keyboard path
 * (WCAG 2.1.1), and the listener stayed on after the line had moved on to another message. The
 * offer is now a real control inside the line, which keeps its own role="status" so the message is
 * still announced. Anything that rewrites the line, including the next setAIStatusBar call, takes
 * the control away with it.
 */

import fs from 'fs';
import path from 'path';

import {
  setAIStatusBar,
  checkAIAvailable,
} from '../../../src/features/shared/ai-feature-client.js';

const NEEDS_SETUP = {
  available: false,
  reason: 'Browser AI model not loaded. Open AI settings to finish setting up.',
  needsApiKey: false,
  needsOllama: false,
  needsWebLLMInit: true,
};
const OLLAMA_DOWN = {
  available: false,
  reason: 'Ollama is not running.',
  needsApiKey: false,
  needsOllama: true,
  needsWebLLMInit: false,
};

let bar;

function press(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function openSetupCalls() {
  return chrome.runtime.sendMessage.mock.calls.filter(([m]) => m?.action === 'OPEN_AI_SETUP');
}

beforeEach(() => {
  document.body.innerHTML = '<div class="assist-summary-status" role="status"></div>';
  bar = document.querySelector('.assist-summary-status');
  chrome.runtime.sendMessage.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('when Browser AI needs setting up', () => {
  it('offers a focusable control, and the line stays a status message', () => {
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');

    const control = bar.querySelector('[role="button"]');
    expect(control).not.toBeNull();
    expect(control.getAttribute('tabindex')).toBe('0');
    expect(control.hasAttribute('data-assist-clickable')).toBe(true);
    expect(control.textContent).toContain('Browser AI model not loaded');
    expect(bar.getAttribute('role')).toBe('status');
    expect(bar.className).toBe('assist-summary-status visible');
  });

  it.each(['Enter', ' '])('opens the AI settings from the keyboard (%p)', key => {
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');

    press(bar.querySelector('[role="button"]'), key);

    expect(openSetupCalls()).toHaveLength(1);
  });

  it('opens the AI settings once per press, however often the line was redrawn', () => {
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');

    const controls = bar.querySelectorAll('[role="button"]');
    expect(controls).toHaveLength(1);
    press(controls[0], 'Enter');

    expect(openSetupCalls()).toHaveLength(1);
  });
});

describe('when there is nothing to set up', () => {
  it('shows the message with no control, tab stop or handler', () => {
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');
    const old = bar.querySelector('[role="button"]');

    setAIStatusBar(bar, OLLAMA_DOWN, 'assist-summary-status');

    expect(bar.textContent).toContain('Ollama is not running.');
    expect(bar.querySelector('[role="button"], [tabindex], [data-assist-clickable]')).toBeNull();
    expect(bar.hasAttribute('tabindex')).toBe(false);
    press(old, 'Enter');
    press(bar, 'Enter');
    expect(openSetupCalls()).toHaveLength(0);
  });

  it('loses the control when a panel writes its own message into the line', () => {
    setAIStatusBar(bar, NEEDS_SETUP, 'assist-summary-status');

    bar.textContent = 'Summary complete';

    expect(bar.querySelector('[role="button"]')).toBeNull();
  });
});

describe('the eight AI panels style the control', () => {
  const PANELS = [
    ['assignmentBreakdown/assignmentBreakdown.js', 'assist-breakdown-status'],
    ['citationAnalyzer/citationAnalyzer.js', 'assist-citation-status'],
    ['knowledgeGraph/knowledgeGraph.js', 'kg-status'],
    ['multiDocCompare/multiDocCompare.js', 'mdc-status'],
    ['socraticTutor/socraticTutor.js', 'assist-tutor-status'],
    ['studyPathGenerator/studyPathGenerator.js', 'spg-status'],
    ['summarization/summarization.js', 'assist-summary-status'],
    ['textSimplification/textSimplification.js', 'assist-simplify-status'],
  ];

  it.each(PANELS)('%s underlines it on hover and shows where focus is', (file, statusClass) => {
    const source = fs.readFileSync(path.join(__dirname, '../../../src/features', file), 'utf8');
    const call = new RegExp(`setAIStatusBar\\([^)]*'${statusClass}'\\)`);
    expect(source).toMatch(call);
    expect(source).toContain(`.${statusClass} [data-assist-clickable]:hover`);
    expect(source).toContain(`.${statusClass} [data-assist-clickable]:focus-visible`);
  });
});

describe('checkAIAvailable in cloud mode', () => {
  const CLOUD = { isCloud: true, isWebLLM: false, isGemini: false, isLocal: false, isOff: false };

  it("passes on the router's reason when the key is there but something else is missing", async () => {
    const reason = 'Chrome has not given AssisT access to Anthropic (Claude), so nothing was sent.';
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      available: false,
      needsApiKey: false,
      needsHostPermission: true,
      reason,
    });

    const availability = await checkAIAvailable(CLOUD);

    expect(availability).toMatchObject({ available: false, needsApiKey: false, reason });
  });

  it('still asks for a key when there is none', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      available: false,
      needsApiKey: true,
      reason: 'API key not configured',
    });

    await expect(checkAIAvailable(CLOUD)).resolves.toMatchObject({ needsApiKey: true });
  });
});
