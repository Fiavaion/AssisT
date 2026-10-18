/**
 * @jest-environment jsdom
 *
 * AI panel.
 *
 * The four things worth grading: it is a region in the right dock rather than a popover with a
 * focus trap, so a student can leave it for their own map; with no provider configured it is honest
 * and inert (ADR 0001 — every capability works with AI off, and AI degrades to a message); a
 * generated tree is one undo step, not forty; and nothing a model says reaches the map without
 * being cleaned and capped first, or without the student ticking it.
 */

import { mountAiPanel } from '../../../../src/pages/mind-map/ai-panel.js';
import { ROOT_ID, createSelectionStub, activate, makeHistory } from './pane-fixtures.js';

jest.mock('../../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
  generateWithAI: jest.fn(),
  getUnavailableStatusMessage: availability => `⚠️ ${availability.reason}`,
  extractJsonObject: jest.requireActual('../../../../src/features/shared/ai-feature-client.js')
    .extractJsonObject,
}));

import {
  checkAIAvailable,
  generateWithAI,
  getAIMode,
} from '../../../../src/features/shared/ai-feature-client.js';

const READY_MODE = { aiMode: 'cloud', isOff: false, displayLabel: 'anthropic: haiku-4.5' };
const OFF_MODE = { aiMode: 'off', isOff: true, displayLabel: 'AI Off' };

const available = { available: true, reason: '' };
const unavailable = {
  available: false,
  reason: 'AI is disabled. Enable it in AI Settings.',
  needsWebLLMInit: false,
};

/** Let the mount's status read and any in-flight request settle. */
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('ai panel', () => {
  let host;
  let history;
  let selection;
  let announce;
  let panel;
  let ids;

  const find = selector => host.querySelector(selector);
  const action = name => host.querySelector(`[data-command="${name}"]`);
  /** What the dock does when the AI tab is shown: read the mode, then let the actions answer. */
  const openPanel = async () => {
    await panel.refresh();
    await settle();
  };

  const mount = (extra = {}) => {
    ids = 0;
    panel = mountAiPanel(host, {
      history,
      selection,
      announce,
      newId: () => `gen${(ids += 1)}`,
      ...extra,
    });
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub('arg');
    announce = jest.fn();
    getAIMode.mockResolvedValue(READY_MODE);
    checkAIAvailable.mockResolvedValue(available);
    generateWithAI.mockResolvedValue({ text: '', json: null });
  });

  afterEach(() => {
    panel?.destroy();
    host.remove();
  });

  describe('with no provider configured', () => {
    beforeEach(async () => {
      getAIMode.mockResolvedValue(OFF_MODE);
      checkAIAvailable.mockResolvedValue(unavailable);
      mount();
      await openPanel();
    });

    it('says why in words, not by colour alone', () => {
      expect(find('.mm-ai__status').textContent).toContain('AI is disabled');
    });

    it('disables every action', () => {
      for (const name of ['build-paste', 'suggest', 'explain', 'questions']) {
        expect(action(name).disabled).toBe(true);
      }
    });

    it('offers a way into AI setup', () => {
      const setup = find('.mm-ai__setup');
      expect(setup.hidden).toBe(false);
      activate(setup);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'OPEN_AI_SETUP' });
    });

    /*
     * The service worker may be asleep, restarting, or gone with the extension it belonged to.
     * `sendMessage` then rejects, and a button whose whole job is to open the wizard would look
     * like a button that does nothing at all.
     */
    it('says so when AI setup could not be opened', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated'));

      activate(find('.mm-ai__setup'));
      await settle();

      expect(find('.mm-ai__status').textContent).toContain('AI setup could not be opened');
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('AI setup could not be opened')
      );
    });

    it('leaves the map alone', () => {
      expect(history.canUndo()).toBe(false);
    });
  });

  /*
   * The panel used to be a popover with a toolbar button, `role="dialog"` and a Tab loop, and the
   * whole of that is the defect this block now guards: a student in the AI tab has to be able to
   * walk out of it to their own map, and only one thing may be visible in the dock at a time —
   * which is the dock's business, not the panel's.
   */
  describe('as a dock panel', () => {
    beforeEach(() => mount());

    it('renders its contents into the host, with no button and no popover of its own', () => {
      expect(find('.mm-ai__button')).toBe(null);
      expect(find('.mm-ai__panel')).toBe(null);
      expect(find('.mm-ai')).not.toBe(null);
      expect(find('.mm-ai__status')).not.toBe(null);
      expect(action('suggest')).not.toBe(null);
    });

    it('is not a dialog and holds no focus trap', () => {
      expect(host.querySelector('[role="dialog"]')).toBe(null);

      const stops = [...host.querySelectorAll('button, input, textarea')];
      stops[stops.length - 1].focus();
      const event = new window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      find('.mm-ai').dispatchEvent(event);

      // Nothing was claimed, so the browser's own Tab carries the student out of the panel.
      expect(event.defaultPrevented).toBe(false);
    });

    it('leaves Escape to the page, which owns what closing a dock panel means', () => {
      const event = new window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      find('.mm-ai').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('answers nothing until the dock has asked it what AI is set up', () => {
      for (const name of ['build-paste', 'suggest', 'explain', 'questions']) {
        expect(action(name).disabled).toBe(true);
      }
    });

    it('puts focus on its first live control when the dock opens it', async () => {
      await openPanel();
      panel.focusFirst();
      expect(find('.mm-ai').contains(document.activeElement)).toBe(true);
    });
  });

  describe('building a map', () => {
    it('offers the page button only when the map came from a page', async () => {
      mount();
      await openPanel();
      expect(action('build-page').hidden).toBe(true);
      panel.destroy();

      host.replaceChildren();
      mount({ mapSource: { url: 'https://example.org/a', title: 'A', text: 'Some page text' } });
      await openPanel();
      expect(action('build-page').hidden).toBe(false);
    });

    it('adds a whole generated tree as ONE undo step', async () => {
      generateWithAI.mockResolvedValue({
        text: '',
        json: {
          title: 'Photosynthesis',
          children: [
            { text: 'Light stage', children: [{ text: 'Chlorophyll' }, { text: 'Water split' }] },
            { text: 'Dark stage', children: [] },
          ],
        },
      });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'Notes about photosynthesis';
      activate(action('build-paste'));
      await settle();

      const map = history.current();
      const texts = Object.values(map.nodes).map(node => node.text);
      expect(texts).toEqual(expect.arrayContaining(['Light stage', 'Chlorophyll', 'Dark stage']));

      history.undo();
      expect(Object.values(history.current().nodes).map(node => node.text)).not.toContain(
        'Light stage'
      );
      expect(history.canUndo()).toBe(false);
    });

    it('asks for JSON only and for the source language', async () => {
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'Some notes';
      activate(action('build-paste'));
      await settle();

      const [prompt, , options] = generateWithAI.mock.calls[0];
      expect(prompt).toMatch(/JSON only/i);
      expect(prompt).toMatch(/same language/i);
      expect(options).toMatchObject({ format: 'json', feature: 'mindMap' });
    });

    it('keeps existing children unless the student asks for a replacement', async () => {
      generateWithAI.mockResolvedValue({ text: '', json: { children: [{ text: 'Fresh' }] } });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'text';
      const replace = find('.mm-ai__replace');
      expect(replace.checked).toBe(false);
      activate(action('build-paste'));
      await settle();
      expect(history.current().nodes.arg.children).toContain('ev');

      replace.checked = true;
      find('.mm-ai__paste').value = 'text again';
      activate(action('build-paste'));
      await settle();
      const children = history.current().nodes.arg.children.map(id => history.current().nodes[id]);
      expect(children.map(node => node.text)).toEqual(['Fresh']);
    });

    it('strips control characters and caps node text', async () => {
      generateWithAI.mockResolvedValue({
        text: '',
        json: { children: [{ text: `Bad\u0000text\u001b ${'x'.repeat(400)}` }] },
      });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'text';
      activate(action('build-paste'));
      await settle();

      const added = history.current().nodes.arg.children.map(id => history.current().nodes[id]);
      const generated = added.find(node => node.text.startsWith('Bad'));
        expect(generated.text).not.toMatch(/[\u0000-\u001f\u007f]/);
      expect(generated.text.length).toBeLessThanOrEqual(120);
    });

    it('refuses to grow the map past the node cap', async () => {
      const children = Array.from({ length: 400 }, (_, at) => ({ text: `Node ${at}` }));
      generateWithAI.mockResolvedValue({ text: '', json: { children } });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'text';
      activate(action('build-paste'));
      await settle();
      // Two children were already there; the generation itself is capped at 200.
      expect(history.current().nodes.arg.children.length).toBe(202);
    });

    it('reads a fenced JSON reply when the provider hands back plain text', async () => {
      generateWithAI.mockResolvedValue({
        text: '```json\n{"children":[{"text":"From text"}]}\n```',
        json: null,
      });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'text';
      activate(action('build-paste'));
      await settle();
      const texts = history.current().nodes.arg.children.map(id => history.current().nodes[id].text);
      expect(texts).toContain('From text');
    });

    it('says so, and changes nothing, when the reply makes no sense', async () => {
      generateWithAI.mockResolvedValue({ text: 'sorry, no', json: null });
      mount();
      await openPanel();
      find('.mm-ai__paste').value = 'text';
      activate(action('build-paste'));
      await settle();
      expect(history.canUndo()).toBe(false);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/could not/i));
    });
  });

  /**
   * Nothing a model says reaches the map unchecked: empty nodes, a reply that is not a tree at
   * all, a nesting four levels deep and a reply asking for five hundred nodes are each a way a
   * map could be wrecked by one press. Graded through the panel, because what matters is what
   * ends up in the student's map.
   */
  describe('what a reply is allowed to put in the map', () => {
    /**
     * Build from a reply, replacing what was under the selected node, and read back the tree that
     * actually reached the map.
     *
     * @param {Object} json - the reply's parsed object.
     * @returns {Promise<Array<{text: string, children: Array}>>}
     */
    async function buildFrom(json) {
      generateWithAI.mockResolvedValue({ text: '', json });
      mount();
      await openPanel();
      find('.mm-ai__replace').checked = true;
      find('.mm-ai__paste').value = 'Notes to map';
      activate(action('build-paste'));
      await settle();

      const map = history.current();
      const shape = id =>
        map.nodes[id].children.map(childId => ({
          text: map.nodes[childId].text,
          children: shape(childId),
        }));
      return shape('arg');
    }

    it('keeps the text and the nesting a well-behaved reply gives it', async () => {
      const tree = await buildFrom({
        children: [{ text: 'Causes', children: [{ text: 'Drought' }] }, { text: 'Effects' }],
      });

      expect(tree).toEqual([
        { text: 'Causes', children: [{ text: 'Drought', children: [] }] },
        { text: 'Effects', children: [] },
      ]);
    });

    it('changes nothing when the reply is not a tree at all', async () => {
      const tree = await buildFrom({ children: 'Causes' });

      expect(tree).toEqual([
        { text: 'Evidence', children: [] },
        { text: 'Counterpoint', children: [] },
      ]);
      expect(history.canUndo()).toBe(false);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/no usable nodes/i));
    });

    it('drops a node with no text rather than adding a blank one, and keeps its siblings', async () => {
      const tree = await buildFrom({
        children: [{ text: '   ' }, { text: 'Kept' }, { text: null }, {}],
      });

      expect(tree).toEqual([{ text: 'Kept', children: [] }]);
    });

    it('strips the control characters that would break an ARIA label or a Markdown export', async () => {
      const raw = [
        'Two',
        String.fromCharCode(0),
        String.fromCharCode(9),
        'lines' + String.fromCharCode(10) + 'here  ',
      ].join('');

      const tree = await buildFrom({ children: [{ text: raw }] });

      expect(tree).toEqual([{ text: 'Two lines here', children: [] }]);
    });

    it('caps a single node at 120 characters', async () => {
      const tree = await buildFrom({ children: [{ text: 'x'.repeat(500) }] });

      expect(tree).toHaveLength(1);
      expect(tree[0].text).toHaveLength(120);
    });

    it('stops at three levels, however deep the reply nests', async () => {
      const tree = await buildFrom({
        children: [
          { text: 'L1', children: [{ text: 'L2', children: [{ text: 'L3', children: [{ text: 'L4' }] }] }] },
        ],
      });

      expect(tree[0].children[0].children[0].text).toBe('L3');
      expect(tree[0].children[0].children[0].children).toEqual([]);
    });

    it('spends its node budget across the whole tree, not per level', async () => {
      const wide = Array.from({ length: 150 }, (unused, index) => ({
        text: `Branch ${index}`,
        children: [{ text: 'Child' }],
      }));

      const tree = await buildFrom({ children: wide });

      const count = nodes => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
      expect(count(tree)).toBe(200);
    });
  });

  describe('suggesting sub-points', () => {
    beforeEach(async () => {
      generateWithAI.mockResolvedValue({
        text: '',
        json: { children: [{ text: 'Evidence base' }, { text: 'Counter-argument' }] },
      });
      mount();
      await openPanel();
      activate(action('suggest'));
      await settle();
    });

    it('never inserts a suggestion on its own', () => {
      expect(history.canUndo()).toBe(false);
      expect(host.querySelectorAll('.mm-ai__suggestion').length).toBe(2);
    });

    it('adds only what the student ticked', () => {
      const boxes = [...host.querySelectorAll('.mm-ai__suggestion input')];
      boxes[0].checked = true;
      boxes[1].checked = false;
      activate(host.querySelector('[data-command="add-selected"]'));

      const texts = history.current().nodes.arg.children.map(id => history.current().nodes[id].text);
      expect(texts).toContain('Evidence base');
      expect(texts).not.toContain('Counter-argument');
    });

    it('tells the model what is already there so it does not repeat it', () => {
      const [prompt] = generateWithAI.mock.calls[0];
      expect(prompt).toContain('Evidence');
      expect(prompt).toContain('Essay plan > Argument');
    });
  });

  describe('explaining a node', () => {
    beforeEach(async () => {
      generateWithAI.mockResolvedValue({
        text: '',
        json: { explanation: 'An argument is the claim your essay defends.' },
      });
      mount();
      await openPanel();
    });

    it('previews before it writes anything', async () => {
      activate(action('explain'));
      await settle();
      expect(find('.mm-ai__preview').textContent).toContain('the claim your essay defends');
      expect(history.canUndo()).toBe(false);
    });

    // The selection can name a node that has gone, or an id that came out of an imported file.
    // Every object answers to `constructor`, so an id tested for truthiness would be sent to the
    // model as a node and then written to as one.
    it('falls back to the centre when the selected id is not a node on the map', async () => {
      selection.set('constructor', { source: 'program' });

      activate(action('explain'));
      await settle();
      activate(host.querySelector('[data-command="confirm-explain"]'));

      expect(generateWithAI.mock.calls[0][0]).toContain('Essay plan');
      expect(history.current().nodes[ROOT_ID].notes).toContain('the claim your essay defends');
    });

    it('appends to the notes already there rather than replacing them', async () => {
      history.apply('setNotes', { id: 'arg', notes: 'My own note' });
      activate(action('explain'));
      await settle();
      activate(host.querySelector('[data-command="confirm-explain"]'));

      const notes = history.current().nodes.arg.notes;
      expect(notes.startsWith('My own note')).toBe(true);
      expect(notes).toContain('the claim your essay defends');
    });
  });

  describe('turning a branch into questions', () => {
    it('hands the questions to whoever asked for them and stores none', async () => {
      generateWithAI.mockResolvedValue({
        text: '',
        json: {
          questions: [
            { question: 'What is an argument?', answer: 'The claim you defend.' },
            { question: 'Name one piece of evidence.', answer: 'A cited study.' },
          ],
        },
      });
      const onQuestions = jest.fn();
      mount({ onQuestions });
      await openPanel();
      activate(action('questions'));
      await settle();

      expect(onQuestions).toHaveBeenCalledWith([
        { question: 'What is an argument?', answer: 'The claim you defend.' },
        { question: 'Name one piece of evidence.', answer: 'A cited study.' },
      ]);
      expect(history.canUndo()).toBe(false);
    });
  });

  describe('while a request is running', () => {
    it('shows a busy state and drops the answer when cancelled', async () => {
      let release;
      generateWithAI.mockImplementation(
        () =>
          new Promise(resolve => {
            release = () => resolve({ text: '', json: { children: [{ text: 'Too late' }] } });
          })
      );
      mount();
      await openPanel();
      activate(action('suggest'));
      await settle();
      expect(find('.mm-ai__busy').hidden).toBe(false);

      activate(host.querySelector('[data-command="cancel"]'));
      expect(find('.mm-ai__busy').hidden).toBe(true);

      release();
      await settle();
      expect(host.querySelectorAll('.mm-ai__suggestion').length).toBe(0);
      expect(history.canUndo()).toBe(false);
    });

    it('announces a failure instead of throwing', async () => {
      generateWithAI.mockRejectedValue(new Error('the model refused'));
      mount();
      await openPanel();
      activate(action('suggest'));
      await settle();
      expect(find('.mm-ai__busy').hidden).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('the model refused'));
    });

    // Disabling the button a student is standing on drops focus to `<body>`, which is outside the
    // panel and outside its focus trap: the press appears to do nothing and the next Tab starts
    // again at the top of the page.
    it('keeps focus inside the panel when the action that started it goes dead', async () => {
      generateWithAI.mockImplementation(() => new Promise(() => {}));
      mount();
      await openPanel();
      activate(action('suggest'));
      await settle();

      expect(action('suggest').disabled).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('[data-command="cancel"]'));
    });

    /*
     * The old popover bumped the request ticket as it closed, so a generation the student walked
     * away from could not write to their map afterwards. There is nothing to close now — the dock
     * simply shows another tab — so the dock calls this instead, and it has to do the same job.
     */
    it('drops a reply that arrives after the student left the AI tab, and says so', async () => {
      let release;
      generateWithAI.mockImplementation(
        () =>
          new Promise(resolve => {
            release = () => resolve({ text: '', json: { children: [{ text: 'Too late' }] } });
          })
      );
      mount();
      await openPanel();
      activate(action('suggest'));
      await settle();
      expect(find('.mm-ai__busy').hidden).toBe(false);

      panel.cancel();

      expect(find('.mm-ai__busy').hidden).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/stopped/i));

      release();
      await settle();
      expect(host.querySelectorAll('.mm-ai__suggestion').length).toBe(0);
      expect(history.canUndo()).toBe(false);
    });

    it('says nothing when there was nothing running to stop', async () => {
      mount();
      await openPanel();
      announce.mockClear();

      panel.cancel();

      expect(announce).not.toHaveBeenCalled();
    });

    it('gives focus back to the action it came from when the request ends', async () => {
      generateWithAI.mockImplementation(() => new Promise(() => {}));
      mount();
      await openPanel();
      activate(action('explain'));
      await settle();

      activate(host.querySelector('[data-command="cancel"]'));
      expect(document.activeElement).toBe(action('explain'));
    });
  });
});
