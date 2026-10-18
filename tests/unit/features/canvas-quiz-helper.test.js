/**
 * @jest-environment jsdom
 *
 * The Canvas quiz helper's read-aloud affordance.
 *
 * It used to be the question container itself: a dashed border in the highlight colour, a pointer
 * cursor and a click listener. That is a colour-only cue (SC 1.4.1) and completely unreachable
 * without a pointer (SC 2.1.1) — on a page where a student is being marked. The affordance is now
 * a real button that says what it does, so these press the key, not the mouse.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

let onInit;
jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: (key, defaults, init) => {
    onInit = init;
  },
}));

// canvas.js imports the adapter by module specifier now (Vite bundles it), so the stub goes in
// through jest's module registry rather than by redirecting chrome.runtime.getURL().
jest.mock('../../../src/adapters/canvas-adapter.js', () =>
  require('../../fixtures/quiz-adapter-stub.js')
);

/** Build a Canvas-shaped question in the DOM and the record the adapter would return for it. */
function makeQuestion(number, text) {
  const element = document.createElement('div');
  element.className = 'display_question';
  element.innerHTML = `<div class="question_text">${text}</div>`;
  // A real Canvas question holds the answer radios, which is why the container is not the button.
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = `answer-${number}`;
  element.appendChild(radio);
  // jsdom has no scrollIntoView; reading a question scrolls to it.
  element.scrollIntoView = () => {};
  document.body.appendChild(element);
  return { number, text, element, answers: [] };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const pressKey = (el, key) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

/**
 * Load canvas.js fresh, hand it the stored canvasIntegration branch (the quiz helper on, unless the
 * test says otherwise), and return the module plus the TTS spy.
 */
async function mountQuizHelper(questions, stored = { enabled: true, quizHelper: { enabled: true } }) {
  jest.resetModules();
  // The adapter is only imported on a Canvas page, and #application is what Canvas itself renders.
  document.body.innerHTML = '<div id="application"></div>';
  globalThis.__assistStubQuizQuestions = questions;

  const canvas = require('../../../src/features/lms/canvas.js');
  const readText = jest.fn();
  // All three LMS integrations read aloud through this one injected dependency now; Canvas no longer
  // owns its own copy of it.
  require('../../../src/features/lms/lms-read-aloud.js').initializeLmsReadAloud(readText, {
    enabled: true,
  });

  onInit(stored);
  await settle();

  return { canvas, readText };
}

afterEach(() => {
  delete globalThis.__assistStubQuizQuestions;
  document.body.innerHTML = '';
});

describe('the read-aloud affordance on a quiz question', () => {
  it('is a button that says what it does, not a coloured border', async () => {
    const question = makeQuestion(1, 'What is the capital of Ireland?');
    await mountQuizHelper([question]);

    const button = question.element.querySelector('.assist-quiz-read-btn');
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    // The cue is words, so it survives high contrast, greyscale and colour blindness.
    expect(button.textContent).toMatch(/read/i);
    expect(button.getAttribute('aria-label')).toBe('Read question 1 aloud');
  });

  it('reads the question when the button is pressed with Enter', async () => {
    const question = makeQuestion(1, 'What is the capital of Ireland?');
    const { readText } = await mountQuizHelper([question]);

    pressKey(question.element.querySelector('.assist-quiz-read-btn'), 'Enter');

    expect(readText).toHaveBeenCalledTimes(1);
    expect(readText.mock.calls[0][0]).toContain('What is the capital of Ireland?');
  });

  it('reads the question when the button is pressed with Space', async () => {
    const question = makeQuestion(2, 'Name the longest river in Ireland.');
    const { readText } = await mountQuizHelper([question]);

    pressKey(question.element.querySelector('.assist-quiz-read-btn'), ' ');

    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('reads the question the button belongs to, not the first one', async () => {
    const first = makeQuestion(1, 'First question.');
    const second = makeQuestion(2, 'Second question.');
    const { readText } = await mountQuizHelper([first, second]);

    pressKey(second.element.querySelector('.assist-quiz-read-btn'), 'Enter');

    expect(readText.mock.calls[0][0]).toContain('Second question.');
  });

  it('leaves the answer radios alone: the container is not a button', async () => {
    // A role="button" wrapping the radios would claim the Space press that picks an answer.
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    expect(question.element.getAttribute('role')).toBeNull();
    expect(question.element.getAttribute('tabindex')).toBeNull();
  });

  it('takes its button back off the page on cleanup', async () => {
    const question = makeQuestion(1, 'What is the capital of Ireland?');
    const { canvas, readText } = await mountQuizHelper([question]);

    canvas.canvas_cleanup();

    expect(question.element.querySelector('.assist-quiz-read-btn')).toBeNull();
    expect(readText).not.toHaveBeenCalled();
  });
});

/**
 * The button is the affordance. A second, mouse-only way to do the same thing is not a bonus: it
 * paints a dashed box and a pointer cursor over a quiz a student is being marked on, promising a
 * click to anyone who can see colour and offering nothing to anyone who cannot.
 */
describe('the mouse-only path the button replaced', () => {
  it('does not read the question when the container is clicked', async () => {
    const question = makeQuestion(1, 'What is the capital of Ireland?');
    const { readText } = await mountQuizHelper([question]);

    question.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(readText).not.toHaveBeenCalled();
  });

  it('leaves the container without a pointer cursor promising a click', async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    expect(question.element.style.cursor).toBe('');
  });

  it('paints no colour-only border on the container', async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    expect(question.element.style.border).toBe('');
  });

  it("leaves the host page's spacing alone", async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    expect(question.element.style.padding).toBe('');
    expect(question.element.style.marginBottom).toBe('');
  });

  it('does not repaint the container on hover', async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    question.element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(question.element.style.border).toBe('');
    expect(question.element.style.backgroundColor).toBe('');
  });

  it('still highlights the question it is reading', async () => {
    // The reading highlight is a different thing from the resting cue, and it stays.
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question]);

    pressKey(question.element.querySelector('.assist-quiz-read-btn'), 'Enter');

    expect(question.element.style.border).not.toBe('');
  });
});

/**
 * canvas.js reads the stored branch as it is on disk, so an install from before the quiz helper had
 * options hands it `quizHelper: false` (or `true`) rather than the declared object.
 */
describe('a quiz helper setting stored by an older version', () => {
  it('stored false: nothing crashes and the quiz helper stays off', async () => {
    const question = makeQuestion(1, 'Pick one.');

    await mountQuizHelper([question], { enabled: true, quizHelper: false });

    expect(question.element.querySelector('.assist-quiz-read-btn')).toBeNull();
  });

  it('stored true: the student had it on, and it is on', async () => {
    const question = makeQuestion(1, 'Pick one.');

    await mountQuizHelper([question], { enabled: true, quizHelper: true });

    expect(question.element.querySelector('.assist-quiz-read-btn')).not.toBeNull();
  });

  it('an option the stored object lacks takes its declared default', async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question], { enabled: true, quizHelper: { enabled: true } });

    pressKey(question.element.querySelector('.assist-quiz-read-btn'), 'Enter');

    expect(question.element.style.border).toBe('3px solid #4a90e2');
  });

  it('an option the student chose is the one used', async () => {
    const question = makeQuestion(1, 'Pick one.');
    await mountQuizHelper([question], {
      enabled: true,
      quizHelper: { enabled: true, highlightColor: '#FF6B6B' },
    });

    pressKey(question.element.querySelector('.assist-quiz-read-btn'), 'Enter');

    expect(question.element.style.border).toBe('3px solid #ff6b6b');
  });
});
