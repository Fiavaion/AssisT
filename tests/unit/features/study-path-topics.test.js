/**
 * @jest-environment jsdom
 *
 * Expanding a study-path topic, and ticking one off, from the keyboard.
 *
 * Both controls were plain divs with no role and no tabindex, bound with a mousedown-only helper.
 * A student who navigates by keyboard could reach neither: they could not open a topic to read its
 * objectives, and they could not record that they had finished one — on the feature whose whole
 * purpose is keeping track of what you have studied (SC 2.1.1, SC 4.1.2).
 *
 * The path is generated here without AI: with no provider available the generator falls back to
 * its heuristic, which renders through exactly the same code.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  // getFailureMessage stays real: it IS the wording under test.
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
  generateWithAI: jest.fn(),
  getSuccessStatusMessage: jest.fn(),
  getUnavailableStatusMessage: jest.fn(),
  setAIStatusBar: jest.fn(),
}));
jest.mock('../../../src/utils/ai-badge.js', () => ({ injectAIBadgeStyles: () => {} }));
jest.mock('../../../src/features/companion/profile-addendum.js', () => ({
  getProfileAddendum: async () => '',
}));

const CONTENT = [
  'Photosynthesis is the process by which green plants convert light energy into chemical energy.',
  'Chlorophyll absorbs light in the blue and red parts of the spectrum and reflects green light.',
  'The light-dependent reactions take place in the thylakoid membranes of the chloroplast.',
  'The Calvin cycle fixes carbon dioxide into sugars using the ATP and NADPH made earlier.',
].join(' ');

let spg;
let ai;

beforeAll(async () => {
  ai = await import('../../../src/features/shared/ai-feature-client.js');
  spg = await import('../../../src/features/studyPathGenerator/studyPathGenerator.js');
});

beforeEach(() => {
  // resetMocks empties every mock between tests, so the stubs are set here rather than in the
  // factory above. No provider is available, which is what sends the generator to its heuristic.
  ai.getAIMode.mockResolvedValue({ mode: 'off', displayLabel: 'Off' });
  ai.checkAIAvailable.mockResolvedValue({ available: false, needsApiKey: false });
  ai.getUnavailableStatusMessage.mockReturnValue('AI is off');
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  document.body.innerHTML = '';
});

/** Render a study path and hand back its first topic's parts. */
async function firstTopic() {
  spg.spg_show();
  await spg.spg_generatePath(CONTENT);

  const topic = document.querySelector('.spg-topic');
  return {
    topic,
    toggle: topic.querySelector('.spg-topic-toggle'),
    checkbox: topic.querySelector('input[type="checkbox"]'),
  };
}

/** @param {HTMLElement} element @param {string} key */
function pressKey(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** The name a screen reader would read for a control labelled by a wrapping or `for=` label. */
function accessibleName(input) {
  const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
  return label ? label.textContent.trim() : '';
}

describe('opening a topic', () => {
  it('is a real button that says whether the topic is open', async () => {
    const { toggle } = await firstTopic();

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with Enter', async () => {
    const { topic, toggle } = await firstTopic();

    pressKey(toggle, 'Enter');

    expect(topic.classList.contains('expanded')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens with Space and closes again', async () => {
    const { topic, toggle } = await firstTopic();

    pressKey(toggle, ' ');
    expect(topic.classList.contains('expanded')).toBe(true);

    pressKey(toggle, ' ');
    expect(topic.classList.contains('expanded')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('still opens with the mouse', async () => {
    const { topic, toggle } = await firstTopic();

    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(topic.classList.contains('expanded')).toBe(true);
  });

  it('points at the details it opens', async () => {
    const { topic, toggle } = await firstTopic();

    const details = topic.querySelector('.spg-topic-details');
    expect(details.id).toBeTruthy();
    expect(toggle.getAttribute('aria-controls')).toBe(details.id);
  });
});

describe('ticking a topic off', () => {
  it('is a real checkbox with a label that says what it does', async () => {
    const { topic, checkbox } = await firstTopic();

    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
    const title = topic.querySelector('.spg-topic-title').textContent;
    expect(accessibleName(checkbox)).toContain(title);
  });

  it('records the topic as done when it is ticked', async () => {
    const { topic, checkbox } = await firstTopic();
    const topicId = Number(topic.dataset.id);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(topic.classList.contains('completed')).toBe(true);
    expect(window.assistFeatures.studyPathGenerator.getProgress()[topicId]).toBe(true);
  });

  it('takes it back off when it is unticked', async () => {
    const { topic, checkbox } = await firstTopic();
    const topicId = Number(topic.dataset.id);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(topic.classList.contains('completed')).toBe(false);
    expect(window.assistFeatures.studyPathGenerator.getProgress()[topicId]).toBe(false);
  });

  it('does not open the topic as a side effect of being ticked', async () => {
    const { topic, checkbox } = await firstTopic();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(topic.classList.contains('expanded')).toBe(false);
  });
});
