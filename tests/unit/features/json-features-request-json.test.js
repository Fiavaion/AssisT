/**
 * @jest-environment jsdom
 *
 * The Socratic tutor and the study path both parse a JSON object out of the reply, so both must
 * ask for JSON at the decoder (`format: 'json'`), not only in the prompt's wording.
 *
 * Measured on Ollama 0.33.3 with qwen3:4b and the tutor's own prompt: asked in words alone, the
 * model reasoned for the whole 2,300-token allowance and returned an empty answer (done_reason
 * "length"), which the student saw as "This model spent its whole reply thinking". With
 * `format: 'json'` the same request answered in 9 seconds with a parseable object.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
  generateWithAI: jest.fn(),
  getSuccessStatusMessage: jest.fn(),
  getUnavailableStatusMessage: jest.fn(),
  setAIStatusBar: jest.fn(),
}));

const aiClient = require('../../../src/features/shared/ai-feature-client.js');

const TEXT = [
  'Photosynthesis converts light energy into chemical energy in green plants and algae.',
  'The light-dependent reactions split water and release oxygen in the thylakoid membranes.',
  'The Calvin cycle in the stroma fixes carbon dioxide into sugars using ATP and NADPH.',
  'Light intensity, carbon dioxide and temperature all limit the rate of the process.',
].join(' ');

const FEATURES = [
  {
    name: 'Socratic Tutor',
    module: '../../../src/features/socraticTutor/socraticTutor.js',
    show: 'tutor_show',
    hide: 'tutor_hide',
    run: mod => mod.tutor_analyze(TEXT),
    reply: {
      topic: 'Photosynthesis',
      questions: [{ type: 'comprehension', question: 'Q?', hint: 'H', followUp: 'F' }],
      thinkingPrompt: 'Why?',
    },
  },
  {
    name: 'Study Path Generator',
    module: '../../../src/features/studyPathGenerator/studyPathGenerator.js',
    show: 'spg_show',
    hide: 'spg_hide',
    run: mod => mod.spg_generatePath(`${TEXT} ${TEXT}`),
    reply: {
      title: 'Photosynthesis',
      estimatedHours: 1,
      difficulty: 'easy',
      topics: [{ id: 1, title: 'Light', description: 'd', objectives: [], keyTerms: [] }],
      suggestedOrder: [1],
      tips: [],
    },
  },
];

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe.each(FEATURES)('$name', spec => {
  let mod;

  beforeAll(async () => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
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
    const text = JSON.stringify(spec.reply);
    aiClient.generateWithAI.mockResolvedValue({ text, json: spec.reply, isLocal: true });
  });

  afterEach(() => {
    mod[spec.hide]();
  });

  test("asks the model for JSON with format: 'json'", async () => {
    await mod[spec.show]();
    await spec.run(mod);
    await settle();

    expect(aiClient.generateWithAI).toHaveBeenCalled();
    const options = aiClient.generateWithAI.mock.calls[0][2];
    expect(options.format).toBe('json');
  });
});
