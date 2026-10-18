/**
 * @jest-environment jsdom
 *
 * What the eight AI feature panels tell the student when a request fails.
 *
 * The service worker now rejects LOCAL_LLM_GENERATE with a plain sentence naming the model to
 * pull and where. Every panel used to swallow it and quietly show an extractive "Basic" result,
 * so a tester with Ollama running and fifteen models installed got the basic answer and no
 * explanation. A silent downgrade is a broken feature the student cannot diagnose.
 *
 * So: the sentence goes in the panel's own status region, which is a live region and announces
 * it once, and any on-device result that stands in for the AI one says in words that it is
 * standing in. Never a stack, never a DOMException, never "undefined".
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

const aiClient = require('../../../src/features/shared/ai-feature-client.js');

const MESSAGE = 'No suitable local model is installed. Run: ollama pull qwen3:8b in a terminal.';

/** The stand-in wording every panel uses when it answers without AI. */
const FALLBACK_NOTE = /without AI/i;

const TEXT = [
  'The Great Famine of the 1840s reshaped Ireland for a century afterwards.',
  'Potato blight destroyed the staple crop, and relief policy failed to meet the scale of it.',
  'Emigration continued long after the blight had passed, and the population never recovered.',
  'Historians still argue over how much of the death toll was avoidable at the time.',
].join(' ');

const PANELS = [
  {
    name: 'Summarization',
    module: '../../../src/features/summarization/summarization.js',
    show: 'summarization_show',
    hide: 'summarization_hide',
    panelId: 'assist-summarization-panel',
    run: mod => mod.summarization_summarize(TEXT),
    fallbackNote: true,
  },
  {
    name: 'Text Simplification',
    module: '../../../src/features/textSimplification/textSimplification.js',
    show: 'simplification_show',
    hide: 'simplification_hide',
    panelId: 'assist-simplification-panel',
    run: mod => mod.simplification_simplify(TEXT),
    fallbackNote: true,
  },
  {
    name: 'Assignment Breakdown',
    module: '../../../src/features/assignmentBreakdown/assignmentBreakdown.js',
    show: 'breakdown_show',
    hide: 'breakdown_hide',
    panelId: 'assist-breakdown-panel',
    run: mod => mod.breakdown_analyze(TEXT),
    fallbackNote: true,
  },
  {
    name: 'Citation Analyzer',
    module: '../../../src/features/citationAnalyzer/citationAnalyzer.js',
    show: 'citation_show',
    hide: 'citation_hide',
    panelId: 'assist-citation-panel',
    run: mod => mod.citation_runAnalysis(TEXT),
    fallbackNote: true,
  },
  {
    name: 'Multi-Document Compare',
    module: '../../../src/features/multiDocCompare/multiDocCompare.js',
    show: 'mdc_show',
    hide: 'mdc_hide',
    panelId: 'assist-mdc-panel',
    run: mod => {
      mod.mdc_addDocument(TEXT, 'First source');
      mod.mdc_addDocument(`${TEXT} A second reading disagrees on the relief policy.`, 'Second');
      return mod.mdc_compareDocuments();
    },
    fallbackNote: true,
  },
  {
    name: 'Study Path Generator',
    module: '../../../src/features/studyPathGenerator/studyPathGenerator.js',
    show: 'spg_show',
    hide: 'spg_hide',
    panelId: 'assist-spg-panel',
    run: mod => mod.spg_generatePath(`${TEXT} ${TEXT}`),
    fallbackNote: true,
  },
  {
    name: 'Socratic Tutor',
    module: '../../../src/features/socraticTutor/socraticTutor.js',
    show: 'tutor_show',
    hide: 'tutor_hide',
    panelId: 'assist-socratic-tutor-panel',
    run: mod => mod.tutor_analyze(TEXT),
    fallbackNote: true,
  },
  {
    name: 'Knowledge Graph',
    module: '../../../src/features/knowledgeGraph/knowledgeGraph.js',
    show: 'graph_show',
    hide: 'graph_hide',
    panelId: 'assist-knowledge-graph',
    run: mod => mod.graph_build(TEXT),
    fallbackNote: true,
  },
];

/** Renders are fired without being awaited, so let the microtasks drain. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe.each(PANELS)('$name failures', spec => {
  let mod;

  beforeAll(async () => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mod = await import(spec.module);
  });

  beforeEach(() => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    aiClient.getAIMode.mockResolvedValue({
      mode: 'local',
      isLocal: true,
      isCloud: false,
      isOff: false,
      modelKey: 'local',
      displayLabel: 'Ollama',
    });
    aiClient.checkAIAvailable.mockResolvedValue({ available: true });
    aiClient.getSuccessStatusMessage.mockReturnValue('done');
    aiClient.getUnavailableStatusMessage.mockReturnValue('unavailable');
  });

  afterEach(() => {
    mod[spec.hide]();
  });

  const panel = () => document.getElementById(spec.panelId);

  /** The live region the panel announces failures through. */
  const liveRegion = () =>
    panel().querySelector('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])');

  /** Drive the panel's request with `failure` thrown from every AI route. */
  async function runWith(failure) {
    aiClient.generateWithAI.mockRejectedValue(failure);
    chrome.runtime.sendMessage = jest
      .fn()
      .mockResolvedValue({ success: false, error: failure.message });

    await mod[spec.show]();
    try {
      await spec.run(mod);
    } catch {
      /* some panels rethrow; the panel still has to explain itself */
    }
    await settle();
  }

  test('shows the reason the request failed, in a region that announces it', async () => {
    await runWith(new Error(MESSAGE));

    const region = liveRegion();
    expect(region).not.toBeNull();
    expect(region.textContent).toContain(MESSAGE);
  });

  test('never shows the student "undefined" or a DOMException', async () => {
    await runWith(new DOMException('The operation was aborted.', 'AbortError'));

    const text = panel().textContent;
    expect(text).not.toMatch(/undefined/);
    expect(text).not.toMatch(/DOMException/);
    expect(liveRegion().textContent.trim().length).toBeGreaterThan(0);
  });

  /** Elements actually on screen whose text matches `pattern`. */
  function shownMatching(pattern) {
    return Array.from(panel().querySelectorAll('*')).filter(
      el =>
        el.children.length === 0 &&
        pattern.test(el.textContent) &&
        !el.hidden &&
        el.style.display !== 'none'
    );
  }

  if (spec.fallbackNote) {
    test('says in words that the result it fell back to was made without AI', async () => {
      await runWith(new Error(MESSAGE));

      // The wording has to be on screen, not merely present in a hidden node.
      expect(shownMatching(FALLBACK_NOTE).length).toBeGreaterThan(0);
    });
  }

  if (spec.name === 'Knowledge Graph') {
    test('does not claim it worked without AI when the AI answered', async () => {
      aiClient.generateWithAI.mockResolvedValue({
        text: '',
        json: {
          nodes: [
            { id: 1, label: 'Famine', type: 'concept' },
            { id: 2, label: 'Blight', type: 'concept' },
          ],
          edges: [{ source: 1, target: 2, label: 'caused by' }],
        },
      });

      await mod[spec.show]();
      await mod.graph_build(TEXT);
      await settle();

      expect(shownMatching(FALLBACK_NOTE)).toHaveLength(0);
    });
  }
});
