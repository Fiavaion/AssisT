/**
 * AI help for a mind map — the layer on top of a tool that already works without it.
 *
 * ADR 0001 is explicit: deterministic first, AI second. Nothing here is needed to build, edit,
 * export or study a map. With no provider configured the button still appears, the panel still
 * opens, and it says in words why each action is unavailable and where to fix it — a disabled
 * control with no stated reason is a dead end, and colour alone would not carry it (SC 1.4.1).
 *
 * Four things a model can usefully do to an outline:
 *   - build a first draft of a tree from a page or from pasted text;
 *   - suggest sub-points for one node;
 *   - explain one node in plain language, into its notes;
 *   - turn a branch into recall questions for study mode.
 *
 * Two rules run through all of them. Nothing a model returns reaches the map unsanitised or
 * uncapped — the text is stripped of control characters, trimmed to a node's length and the whole
 * generation is capped, because a model that ignores its instructions must not be able to bury a
 * student's map. And nothing arrives without a student's press: suggestions are a checklist, an
 * explanation is a preview with a Confirm, and a generated tree is ONE undo step so a single
 * Ctrl+Z takes it all back out again.
 *
 * @module pages/mind-map/ai-panel
 */

import {
  checkAIAvailable,
  extractJsonObject,
  generateWithAI,
  getAIMode,
  getUnavailableStatusMessage,
} from '../../features/shared/ai-feature-client.js';
import { pathTo } from '../../features/mindMap/core/map-ops.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import './ai-panel.css';

/** Feature name for model routing and for the service worker's logs. */
const FEATURE = 'mindMap';

/** Longest source text sent to a model; the page extractor already trims to 12000. */
const MAX_SOURCE = 12000;

/** Longest text any single generated node may carry into the map. */
const MAX_NODE_TEXT = 120;

/** Longest explanation written into a node's notes. */
const MAX_NOTES = 1200;

/** Longest single question or answer kept from a reply. */
const MAX_QUESTION = 300;

/** Deepest a generated tree may go under the node it is added to. */
const MAX_DEPTH = 3;

/** Most nodes one generation may add, whatever the model returns. */
const MAX_NODES = 200;

/** Most questions kept from one reply. */
const MAX_QUESTIONS = 20;

/** Ids must be unique in the page, and the editor could hold more than one panel. */
let panelSerial = 0;

/**
 * Everything a model says is untrusted text. Control characters would break the outline's ARIA
 * labels and the exported Markdown, so they go before anything else does.
 *
 * @param {*} value
 * @param {number} max
 * @returns {string} trimmed, single-spaced, at most `max` characters.
 */
function clean(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Like {@link clean} but keeps paragraph breaks, for prose going into a notes field. */
function cleanProse(value, max) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/**
 * Take the reply's `json`, or dig an object out of its text when the provider handed back prose.
 *
 * @param {{text: string, json: Object|null}} reply
 * @returns {Object|null}
 */
function objectFrom(reply) {
  if (reply && reply.json && typeof reply.json === 'object') {
    return reply.json;
  }
  return extractJsonObject(reply ? reply.text : '');
}

/**
 * Turn a model's nested `children` into a shape the map can take: cleaned text, no empty nodes,
 * capped depth and a hard ceiling on how many nodes one press can add.
 *
 * @param {*} raw - the reply's `children` array.
 * @returns {Array<{text: string, children: Array}>}
 */
function normaliseTree(raw) {
  let budget = MAX_NODES;

  const take = (children, depth) => {
    const kept = [];
    for (const child of Array.isArray(children) ? children : []) {
      if (budget <= 0) {
        break;
      }
      const text = clean(child && child.text, MAX_NODE_TEXT);
      if (text === '') {
        continue;
      }
      budget -= 1;
      kept.push({
        text,
        children: depth < MAX_DEPTH ? take(child && child.children, depth + 1) : [],
      });
    }
    return kept;
  };

  return take(raw, 1);
}

/**
 * The ops that put a normalised tree under a parent, in outline order.
 *
 * @param {Array<{text: string, children: Array}>} tree
 * @param {string} parentId
 * @param {() => string} newId
 * @returns {Array<{op: string, args: Object}>}
 */
function stepsForTree(tree, parentId, newId) {
  const steps = [];
  const add = (children, under) => {
    for (const child of children) {
      const id = newId();
      steps.push({ op: 'addChild', args: { parentId: under, node: { id, text: child.text } } });
      add(child.children, id);
    }
  };
  add(tree, parentId);
  return steps;
}

/** The node's place in the map, as the model needs to see it: `Root > Branch > Node`. */
function pathText(map, id) {
  return pathTo(map, id)
    .map(ancestorId => map.nodes[ancestorId].text || '(untitled)')
    .join(' > ');
}

/** A branch as an indented outline, so a model can read the shape as well as the words. */
function branchOutline(map, id, depth = 0, lines = []) {
  const node = map.nodes[id];
  lines.push(`${'  '.repeat(depth)}- ${node.text || '(untitled)'}`);
  for (const childId of node.children) {
    branchOutline(map, childId, depth + 1, lines);
  }
  return lines.join('\n');
}

/** Every prompt says the same two things, so no reply can be prose and none can change language. */
const RULES =
  'Reply with JSON only: no explanation, no code fence, nothing before or after the object. ' +
  'Write every piece of text in the same language as the source below.';

/**
 * Mount the AI panel into the right dock's AI tab.
 *
 * It used to be a popover with a toolbar button of its own, a `role="dialog"` and a focus trap,
 * which meant a student could not reach their own map while it was open and that it could sit on
 * top of study mode and the canvas zoom cluster at the same time. It is now a plain region: the
 * dock owns which tab is showing, the page owns Escape, and Tab leads out of here to the canvas.
 *
 * @param {HTMLElement} host - appended to, not emptied.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} [options.announce]
 * @param {{url: string, title: string, text?: string}|null} [options.mapSource] - the page the map
 *   was built from; its `text` is what "Build a map from this page" reads.
 * @param {() => string} [options.newId] - id source for generated nodes.
 * @param {(questions: Array<{question: string, answer: string}>) => void} [options.onQuestions] -
 *   handed the recall questions; study mode takes them as its queue. They are stored nowhere.
 * @returns {{refresh: () => Promise<void>, focusFirst: () => void, cancel: () => void,
 *   destroy: () => void}}
 */
export function mountAiPanel(host, options = {}) {
  const {
    history,
    selection,
    announce = () => {},
    mapSource = null,
    onQuestions = null,
    newId = () => crypto.randomUUID(),
  } = options;

  panelSerial += 1;
  const uid = `mm-ai${panelSerial}`;
  const cleanups = [];

  const root = document.createElement('div');
  root.className = 'mm-ai';
  // Not a tab stop: somewhere for focus to land when the control it was on goes away, and nothing
  // more. A student tabbing through the dock never stops here.
  root.tabIndex = -1;

  const status = document.createElement('p');
  status.className = 'mm-ai__status';
  status.setAttribute('role', 'status');
  status.textContent = 'Checking what AI is set up…';

  const setup = document.createElement('button');
  setup.type = 'button';
  setup.className = 'mm-ai__setup';
  setup.textContent = 'Open AI setup';
  setup.hidden = true;

  // ---- build a map -------------------------------------------------------
  const buildSection = document.createElement('section');
  buildSection.className = 'mm-ai__section';
  const buildHeading = document.createElement('h3');
  buildHeading.className = 'mm-ai__heading';
  buildHeading.textContent = 'Build a map';
  const pasteLabel = document.createElement('label');
  pasteLabel.htmlFor = `${uid}-paste`;
  pasteLabel.textContent = 'Paste text to map';
  const paste = document.createElement('textarea');
  paste.id = `${uid}-paste`;
  paste.className = 'mm-ai__paste';
  paste.rows = 3;

  const replaceRow = document.createElement('div');
  replaceRow.className = 'mm-ai__check';
  const replace = document.createElement('input');
  replace.type = 'checkbox';
  replace.id = `${uid}-replace`;
  replace.className = 'mm-ai__replace';
  const replaceLabel = document.createElement('label');
  replaceLabel.htmlFor = replace.id;
  replaceLabel.textContent = 'Replace current children';
  replaceRow.append(replace, replaceLabel);

  const buildFromPage = document.createElement('button');
  buildFromPage.type = 'button';
  buildFromPage.className = 'mm-ai__action';
  buildFromPage.dataset.command = 'build-page';
  buildFromPage.textContent = 'Build a map from this page';
  buildFromPage.hidden = !(
    mapSource &&
    typeof mapSource.text === 'string' &&
    mapSource.text.trim()
  );

  const buildFromPaste = document.createElement('button');
  buildFromPaste.type = 'button';
  buildFromPaste.className = 'mm-ai__action';
  buildFromPaste.dataset.command = 'build-paste';
  buildFromPaste.textContent = 'Build a map from the text above';

  buildSection.append(buildHeading, pasteLabel, paste, replaceRow, buildFromPage, buildFromPaste);

  // ---- the selected node -------------------------------------------------
  const nodeSection = document.createElement('section');
  nodeSection.className = 'mm-ai__section';
  const nodeHeading = document.createElement('h3');
  nodeHeading.className = 'mm-ai__heading';
  nodeHeading.textContent = 'The selected node';

  const makeAction = (name, label) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'mm-ai__action';
    element.dataset.command = name;
    element.textContent = label;
    return element;
  };
  const suggest = makeAction('suggest', 'Suggest sub-points');
  const explain = makeAction('explain', 'Explain this');
  const questions = makeAction('questions', 'Turn into questions');
  nodeSection.append(nodeHeading, suggest, explain, questions);

  // ---- results and busy state --------------------------------------------
  const result = document.createElement('div');
  result.className = 'mm-ai__result';

  const busy = document.createElement('div');
  busy.className = 'mm-ai__busy';
  busy.hidden = true;
  const busyText = document.createElement('p');
  busyText.className = 'mm-ai__busyText';
  busyText.textContent = 'Working…';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.command = 'cancel';
  cancel.dataset.action = 'cancel';
  cancel.textContent = 'Cancel';
  busy.append(busyText, cancel);

  root.append(status, setup, buildSection, nodeSection, result, busy);
  host.appendChild(root);

  const actions = [buildFromPage, buildFromPaste, suggest, explain, questions];

  // Nothing is live until the panel has been told what AI is set up. The dock calls `refresh()`
  // each time the AI tab is shown, and an action that answered before that could only fail.
  for (const element of actions) {
    element.disabled = true;
  }

  // ---- availability ------------------------------------------------------

  let modeInfo = null;
  let availability = null;

  /** Read the AI mode afresh: the student may have configured a provider since the page loaded. */
  async function refreshStatus() {
    try {
      modeInfo = await getAIMode(FEATURE);
      availability = await checkAIAvailable(modeInfo);
    } catch (error) {
      modeInfo = null;
      availability = { available: false, reason: error.message, needsWebLLMInit: false };
    }
    const ready = Boolean(availability && availability.available);
    status.textContent = ready
      ? `AI ready: ${modeInfo.displayLabel}`
      : getUnavailableStatusMessage(availability);
    setup.hidden = ready;
    for (const element of actions) {
      element.disabled = !ready;
    }
  }

  // ---- running a request -------------------------------------------------

  /**
   * The request the panel is waiting for. Cancelling bumps it, so a reply that arrives afterwards
   * finds its ticket stale and is dropped — there is no abort on the messaging channel, and a
   * cancelled generation must not be able to write to the map.
   */
  let ticket = 0;

  /** The action the request was started from, so focus can go back where it came from. */
  let startedFrom = null;

  /**
   * Show or hide the busy state, and carry the focus across it.
   *
   * A disabled button cannot hold focus and a hidden one cannot either: the browser drops focus on
   * `<body>`, at the top of the page and nowhere near the panel. So pressing "Suggest sub-points"
   * used to leave a keyboard student nowhere, and the reply arriving put them nowhere a second
   * time. Cancel is live for exactly as long as the actions are not, so focus rides out to Cancel
   * and back to the button that started the request.
   *
   * @param {boolean} running
   */
  function setBusy(running) {
    // Read before anything is hidden or disabled: that is what moves focus off the element.
    const focused = document.activeElement;
    const fromAction = actions.includes(focused);
    const fromCancel = focused === cancel;

    busy.hidden = !running;
    for (const element of actions) {
      element.disabled = running || !(availability && availability.available);
    }

    if (running) {
      if (fromAction) {
        startedFrom = focused;
        cancel.focus();
      }
      return;
    }
    if (fromCancel) {
      // The panel itself is the fallback: it can always take focus, and it is where the reply is.
      (startedFrom && !startedFrom.disabled ? startedFrom : root).focus();
    }
    startedFrom = null;
  }

  /**
   * Ask the model, and hand the parsed object to `use` only if the student is still waiting.
   *
   * @param {Object} request
   * @param {string} request.prompt
   * @param {number} request.maxTokens
   * @param {string} request.taskType
   * @param {(payload: Object) => void} request.use
   */
  async function run({ prompt, maxTokens, taskType, use }) {
    if (!availability || !availability.available) {
      announce(getUnavailableStatusMessage(availability || { reason: 'AI is not set up.' }));
      return;
    }
    const mine = ticket + 1;
    ticket = mine;
    setBusy(true);
    announce('Asking the AI. This can take a moment.');

    try {
      const reply = await generateWithAI(prompt, modeInfo, {
        format: 'json',
        maxTokens,
        feature: FEATURE,
        taskType,
      });
      if (mine !== ticket) {
        return;
      }
      const payload = objectFrom(reply);
      if (!payload) {
        announce('The AI reply could not be read, so nothing was changed.');
        return;
      }
      use(payload);
    } catch (error) {
      if (mine === ticket) {
        announce(`The AI could not answer: ${error.message}`);
      }
    } finally {
      if (mine === ticket) {
        setBusy(false);
      }
    }
  }

  // ---- the four actions --------------------------------------------------

  /**
   * The node every action here works on.
   *
   * `Object.hasOwn`, not a truthiness test: a selection can hold an id that came out of an imported
   * file or from another module, and every object answers to `constructor` — which would be read as
   * a node, sent to a model as one, and written to as one. Nothing here is worth that, and the
   * centre is the honest fallback the panel already used for an empty selection.
   *
   * @returns {string} an id the map holds.
   */
  const selectedId = () => {
    const map = history.current();
    const chosen = selection.get();
    return chosen && Object.hasOwn(map.nodes, chosen) ? chosen : map.rootId;
  };

  /** Handlers belonging to whatever the result area is showing; dropped when it is replaced. */
  const resultCleanups = [];

  function clearResult() {
    for (const cleanup of resultCleanups.splice(0)) {
      cleanup();
    }
    result.replaceChildren();
  }

  /** How many nodes a normalised tree holds, so the announcement can say what arrived. */
  const countTree = tree => tree.reduce((total, child) => total + 1 + countTree(child.children), 0);

  /** Add the generated tree under the selected node, as one step the student can undo in one press. */
  function applyTree(tree) {
    const map = history.current();
    const parentId = selectedId();
    const steps = [];
    if (replace.checked) {
      for (const childId of map.nodes[parentId].children) {
        steps.push({ op: 'removeNode', args: { id: childId } });
      }
    }
    steps.push(...stepsForTree(tree, parentId, newId));
    history.applyBatch(steps, { name: 'generate' });
    announce(
      `Added ${countTree(tree)} node${countTree(tree) === 1 ? '' : 's'} under ${
        map.nodes[parentId].text || 'the selected node'
      }. Press Ctrl+Z to undo.`
    );
  }

  function buildFrom(text) {
    const source = clean(text, MAX_SOURCE);
    if (source === '') {
      announce('There is no text to map. Paste some text first.');
      return;
    }
    clearResult();
    run({
      maxTokens: 1200,
      taskType: 'mindMapBuild',
      prompt: [
        'Build a mind map outline from the text below for a student who is planning or revising.',
        RULES,
        'Use exactly this shape: {"title": "...", "children": [{"text": "...", "children": []}]}',
        `Rules: at most ${MAX_DEPTH} levels of children, at most 40 nodes in total, and each "text" at most 8 words.`,
        '',
        'SOURCE:',
        source,
      ].join('\n'),
      use: payload => {
        const tree = normaliseTree(payload.children);
        if (tree.length === 0) {
          announce('The AI returned no usable nodes, so nothing was changed.');
          return;
        }
        applyTree(tree);
      },
    });
  }

  function showSuggestions(list) {
    clearResult();
    const heading = document.createElement('h4');
    heading.className = 'mm-ai__heading';
    heading.textContent = 'Tick the ones to add';
    const listElement = document.createElement('ul');
    listElement.className = 'mm-ai__list';

    const boxes = list.map((text, at) => {
      const item = document.createElement('li');
      item.className = 'mm-ai__suggestion';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = `${uid}-suggestion-${at}`;
      const label = document.createElement('label');
      label.htmlFor = box.id;
      label.textContent = text;
      item.append(box, label);
      listElement.appendChild(item);
      return { box, text };
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.dataset.command = 'add-selected';
    add.textContent = 'Add selected';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.dataset.command = 'discard';
    discard.textContent = 'Discard';

    result.append(heading, listElement, add, discard);

    resultCleanups.push(
      attachAccessibleHandler(add, 'Mind map add suggestions', () => {
        const chosen = boxes.filter(entry => entry.box.checked).map(entry => entry.text);
        if (chosen.length === 0) {
          announce('Nothing was ticked, so nothing was added.');
          return;
        }
        const parentId = selectedId();
        history.applyBatch(
          chosen.map(text => ({
            op: 'addChild',
            args: { parentId, node: { id: newId(), text } },
          })),
          { name: 'generate' }
        );
        announce(
          `Added ${chosen.length} sub-point${chosen.length === 1 ? '' : 's'}. Press Ctrl+Z to undo.`
        );
        clearResult();
        suggest.focus();
      }),
      attachAccessibleHandler(discard, 'Mind map discard suggestions', () => {
        clearResult();
        announce('Suggestions discarded.');
        suggest.focus();
      })
    );

    boxes[0].box.focus();
  }

  function askForSuggestions() {
    const map = history.current();
    const id = selectedId();
    const node = map.nodes[id];
    const existing = node.children.map(childId => map.nodes[childId].text).filter(Boolean);
    clearResult();
    run({
      maxTokens: 400,
      taskType: 'mindMapSuggest',
      prompt: [
        "Suggest between 3 and 6 sub-points for one node of a student's mind map.",
        RULES,
        'Use exactly this shape: {"children": [{"text": "..."}]}',
        'Each "text" is at most 8 words. Do not repeat anything already listed under "Already there".',
        '',
        `SOURCE — path from the root: ${pathText(map, id)}`,
        `Already there: ${existing.length ? existing.join(', ') : '(nothing yet)'}`,
      ].join('\n'),
      use: payload => {
        const list = normaliseTree(payload.children)
          .map(child => child.text)
          .slice(0, 6);
        if (list.length === 0) {
          announce('The AI suggested nothing usable.');
          return;
        }
        showSuggestions(list);
        announce(
          `${list.length} suggestion${list.length === 1 ? '' : 's'}. Tick the ones you want, then ` +
            'choose Add selected.'
        );
      },
    });
  }

  function showExplanation(explanation) {
    clearResult();
    const preview = document.createElement('p');
    preview.className = 'mm-ai__preview';
    preview.textContent = explanation;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.dataset.command = 'confirm-explain';
    confirm.textContent = 'Add to notes';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.dataset.command = 'discard';
    discard.textContent = 'Discard';
    result.append(preview, confirm, discard);

    resultCleanups.push(
      attachAccessibleHandler(confirm, 'Mind map keep explanation', () => {
        const id = selectedId();
        const node = history.current().nodes[id];
        if (!node) {
          return;
        }
        // Appended, never written over: the notes are the student's, and the explanation is
        // something they asked for beside them.
        const notes = node.notes ? `${node.notes}\n\n${explanation}` : explanation;
        history.apply('setNotes', { id, notes });
        announce('The explanation was added to the notes. Press Ctrl+Z to undo.');
        clearResult();
        explain.focus();
      }),
      attachAccessibleHandler(discard, 'Mind map discard explanation', () => {
        clearResult();
        announce('Explanation discarded.');
        explain.focus();
      })
    );

    confirm.focus();
  }

  function askForExplanation() {
    const map = history.current();
    const id = selectedId();
    clearResult();
    run({
      maxTokens: 300,
      taskType: 'mindMapExplain',
      prompt: [
        "Explain one node of a student's mind map in plain language.",
        RULES,
        'Use exactly this shape: {"explanation": "..."}',
        'Two or three sentences. No jargon unless you explain it in the same sentence.',
        '',
        `SOURCE — path from the root: ${pathText(map, id)}`,
      ].join('\n'),
      use: payload => {
        const explanation = cleanProse(payload.explanation, MAX_NOTES);
        if (explanation === '') {
          announce('The AI returned no explanation.');
          return;
        }
        showExplanation(explanation);
        announce('An explanation is ready. Read it, then choose Add to notes.');
      },
    });
  }

  function askForQuestions() {
    const map = history.current();
    const id = selectedId();
    clearResult();
    run({
      maxTokens: 800,
      taskType: 'mindMapQuestions',
      prompt: [
        'Write recall questions a student can use to test themselves on this branch of their mind map.',
        RULES,
        'Use exactly this shape: {"questions": [{"question": "...", "answer": "..."}]}',
        'Between 3 and 10 questions. Each answer is at most 25 words.',
        '',
        'SOURCE — the branch as an outline:',
        branchOutline(map, id),
      ].join('\n'),
      use: payload => {
        const list = (Array.isArray(payload.questions) ? payload.questions : [])
          .map(entry => ({
            question: clean(entry && entry.question, MAX_QUESTION),
            answer: clean(entry && entry.answer, MAX_QUESTION),
          }))
          .filter(entry => entry.question !== '' && entry.answer !== '')
          .slice(0, MAX_QUESTIONS);

        if (list.length === 0) {
          announce('The AI returned no usable questions.');
          return;
        }
        if (typeof onQuestions === 'function') {
          onQuestions(list);
        }
        announce(
          `${list.length} question${list.length === 1 ? '' : 's'} ${
            list.length === 1 ? 'is' : 'are'
          } ready in study mode.`
        );
      },
    });
  }

  // ---- focus -------------------------------------------------------------

  const FOCUSABLE = 'button, input, textarea, select, a[href]';

  /** The stops a Tab may land on right now: nothing disabled, nothing inside a hidden block. */
  const focusStops = () =>
    [...root.querySelectorAll(FOCUSABLE)].filter(
      element => !element.disabled && !element.closest('[hidden]')
    );

  cleanups.push(
    attachAccessibleHandler(setup, 'Mind map AI setup', () => {
      // The service worker may be restarting, or gone with an extension that was reloaded under
      // this page: `sendMessage` then rejects, or throws outright when there is no extension
      // context left at all. Either way the wizard did not open, and a button that appears to do
      // nothing is the worst answer available. Said in the panel and in the page's live region,
      // because the panel's own line is behind whichever tab the student is looking at.
      const failed = () => {
        const message =
          'AI setup could not be opened. Open the AssisT popup and set AI up from there.';
        status.textContent = message;
        announce(message);
      };
      try {
        Promise.resolve(chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' })).catch(failed);
      } catch {
        failed();
      }
    }),
    attachAccessibleHandler(cancel, 'Mind map AI cancel', () => {
      ticket += 1;
      // `setBusy` puts focus back on the action this request was started from.
      setBusy(false);
      announce('Stopped. Nothing was changed.');
    }),
    attachAccessibleHandler(buildFromPage, 'Mind map build from page', () =>
      buildFrom(mapSource && mapSource.text)
    ),
    attachAccessibleHandler(buildFromPaste, 'Mind map build from pasted text', () =>
      buildFrom(paste.value)
    ),
    attachAccessibleHandler(suggest, 'Mind map suggest sub-points', askForSuggestions),
    attachAccessibleHandler(explain, 'Mind map explain node', askForExplanation),
    attachAccessibleHandler(questions, 'Mind map turn into questions', askForQuestions)
  );

  return {
    /**
     * Read the AI mode again. The dock calls this every time the AI tab is shown, because a student
     * can configure a provider in another tab while this page is open.
     *
     * @returns {Promise<void>}
     */
    refresh() {
      return refreshStatus();
    },

    /** Put the keyboard on the first thing in the panel that can be used. */
    focusFirst() {
      const stops = focusStops();
      (stops.length > 0 ? stops[0] : root).focus();
    },

    /**
     * Abandon whatever is in flight. The dock calls this when the student leaves the AI tab.
     *
     * There is no abort on the messaging channel, so the ticket is bumped and the reply is dropped
     * when it arrives: a panel nobody is looking at must never write to the map behind the student.
     * It is said out loud, because a request that was running and then was not is something they
     * asked for and heard nothing about.
     */
    cancel() {
      if (busy.hidden) {
        return;
      }
      ticket += 1;
      setBusy(false);
      announce('The AI request was stopped because you left the AI panel. Nothing was changed.');
    },

    destroy() {
      ticket += 1;
      clearResult();
      for (const cleanup of cleanups) {
        cleanup();
      }
      root.remove();
    },
  };
}
