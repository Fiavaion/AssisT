/**
 * Tests for Ollama model classification helpers.
 *
 * Regression guard: an embeddings-only model (e.g. nomic-embed-text) must never
 * be offered or auto-selected in a text-generation picker — Ollama returns a 400
 * "<model> does not support generate" when one is used for /api/generate.
 */

import {
  isEmbeddingModel,
  filterChatModels,
  pickDefaultChatModel,
  isReasoningModel,
  stripThinking,
  readOllamaReply,
  tokenBudget,
  buildGenerateBody,
  matchesModelFamily,
  MISSING_CHAT_MODEL_MESSAGE,
  RECOMMENDED_PULL_MODEL,
  REASONED_WITHOUT_ANSWER_MESSAGE,
  answersWithThinkingOff,
  shouldRetryWithThinkingOff,
  askOllama,
  DEFAULT_CHAT_MODEL,
  VISION_MODEL,
  pickVisionModel,
  findInstalledTag,
} from '../../../src/utils/ollama-models.js';

describe('isEmbeddingModel', () => {
  test.each([
    'nomic-embed-text:latest',
    'nomic-embed-text',
    'mxbai-embed-large',
    'snowflake-arctic-embed2',
    'granite-embedding:278m',
    'bge-m3',
    'bge-large:latest',
    'gte-large',
    'all-minilm:latest',
  ])('flags embeddings-only model %s', name => {
    expect(isEmbeddingModel(name)).toBe(true);
  });

  test.each([
    'qwen3:8b-q4_K_M',
    'llama3.1:8b-instruct-q4_K_M',
    'mistral:7b-instruct',
    'gemma3:4b',
    'phi3:mini',
    'llava:latest',
    'llama3.2:3b',
    'deepseek-r1:8b',
  ])('does not flag chat-capable model %s', name => {
    expect(isEmbeddingModel(name)).toBe(false);
  });

  test('returns false for empty / non-string input', () => {
    expect(isEmbeddingModel('')).toBe(false);
    expect(isEmbeddingModel(null)).toBe(false);
    expect(isEmbeddingModel(undefined)).toBe(false);
    expect(isEmbeddingModel(42)).toBe(false);
  });
});

describe('isReasoningModel', () => {
  test.each([
    'qwen3:8b-q4_K_M',
    'qwen3:4b',
    'deepseek-r1:8b',
    'qwq:32b',
    'exaone-deep:7.8b',
    'marco-o1:latest',
    'qwen3.5:9b',
    'gemma4:e4b',
    'granite4:tiny-h',
    'gpt-oss:20b',
  ])('flags reasoning model %s', name => {
    expect(isReasoningModel(name)).toBe(true);
  });

  test.each([
    'llama3.2:3b',
    'llama3.1:8b-instruct-q4_K_M',
    'mistral:7b-instruct',
    'gemma3:4b',
    'phi3:mini',
    'llava:latest',
    'nomic-embed-text:latest',
  ])('does not flag ordinary model %s', name => {
    expect(isReasoningModel(name)).toBe(false);
  });

  test('matches case-insensitively, since pickers vary in casing', () => {
    expect(isReasoningModel('QwQ:32B')).toBe(true);
  });

  test('returns false for empty / non-string input', () => {
    expect(isReasoningModel('')).toBe(false);
    expect(isReasoningModel(null)).toBe(false);
    expect(isReasoningModel(undefined)).toBe(false);
    expect(isReasoningModel(42)).toBe(false);
  });
});

describe('filterChatModels', () => {
  test('removes embeddings-only models, keeps chat models in order', () => {
    const input = [
      'qwen3:8b-q4_K_M',
      'nomic-embed-text:latest',
      'llama3.2:3b',
      'mxbai-embed-large',
    ];
    expect(filterChatModels(input)).toEqual(['qwen3:8b-q4_K_M', 'llama3.2:3b']);
  });

  test('returns [] for non-array input', () => {
    expect(filterChatModels(null)).toEqual([]);
    expect(filterChatModels(undefined)).toEqual([]);
  });

  test('returns [] when only embeddings models are installed', () => {
    expect(filterChatModels(['nomic-embed-text:latest', 'bge-m3'])).toEqual([]);
  });
});

describe('pickDefaultChatModel', () => {
  test('prefers the project default qwen3.5 when installed', () => {
    const models = ['llama3.2:3b', 'qwen3:4b', 'qwen3.5:9b', 'nomic-embed-text:latest'];
    expect(pickDefaultChatModel(models)).toBe('qwen3.5:9b');
  });

  test('matches the preferred model by base name regardless of tag', () => {
    const models = ['nomic-embed-text', 'qwen3:4b', 'qwen3.5:latest'];
    expect(pickDefaultChatModel(models)).toBe('qwen3.5:latest');
  });

  test('falls back to the first chat model when the preferred is absent', () => {
    const models = ['nomic-embed-text:latest', 'mistral:7b-instruct', 'llama3.2:3b'];
    expect(pickDefaultChatModel(models)).toBe('mistral:7b-instruct');
  });

  test('returns "" when no chat model is installed', () => {
    expect(pickDefaultChatModel(['nomic-embed-text:latest'])).toBe('');
    expect(pickDefaultChatModel([])).toBe('');
  });

  test('honours an explicit preferred override', () => {
    const models = ['llama3.2:3b', 'mistral:7b-instruct'];
    expect(pickDefaultChatModel(models, 'mistral')).toBe('mistral:7b-instruct');
  });
});

describe('stripThinking', () => {
  test('removes a closed think block and keeps the answer', () => {
    const out = stripThinking(
      '<think>Let me consider this.</think>A bibliography is a list of sources.'
    );
    expect(out).toBe('A bibliography is a list of sources.');
  });

  test('removes a think block that never closed, which is what truncation produces', () => {
    // The budget runs out mid-monologue, so no closing tag is ever emitted. This is the case that
    // reached a user: the whole reasoning trace was shown as if it were the answer.
    const out = stripThinking(
      '<think>Okay, the user wants me to explain what a bibliography is. Wait,'
    );
    expect(out).toBe('');
  });

  test('drops a trailing unclosed block but keeps text that came before it', () => {
    const out = stripThinking('A bibliography lists your sources.<think>Should I add more detail');
    expect(out).toBe('A bibliography lists your sources.');
  });

  test('removes several blocks in one response', () => {
    const out = stripThinking('<think>first</think>Answer one.<think>second</think> Answer two.');
    expect(out).toBe('Answer one. Answer two.');
  });

  test('handles the <thinking> spelling and mixed case', () => {
    expect(stripThinking('<thinking>hmm</thinking>Done.')).toBe('Done.');
    expect(stripThinking('<THINK>hmm</THINK>Done.')).toBe('Done.');
  });

  test('leaves ordinary text untouched', () => {
    const plain = 'A bibliography is a list of the sources you used.';
    expect(stripThinking(plain)).toBe(plain);
  });

  test('does not eat text that merely mentions thinking', () => {
    const plain = 'Critical thinking matters when you think about sources.';
    expect(stripThinking(plain)).toBe(plain);
  });

  test('returns an empty string for empty or non-string input', () => {
    expect(stripThinking('')).toBe('');
    expect(stripThinking(null)).toBe('');
    expect(stripThinking(undefined)).toBe('');
    expect(stripThinking(42)).toBe('');
  });
});

describe('stripThinking — a closing tag with no opener', () => {
  // qwen3's chat template pre-fills the opening <think> into the PROMPT, so the model's output
  // begins mid-thought and only ever emits the closer. This reached a user: the whole monologue
  // was shown as the answer even though the real answer sat right after the tag.
  test('treats everything before an orphan closing tag as thinking', () => {
    const out = stripThinking(
      'Okay, the user wants me to explain what a bibliography is. Done. </think> ' +
        'A bibliography is a list of sources you used while researching your work.'
    );
    expect(out).toBe('A bibliography is a list of sources you used while researching your work.');
  });

  test('keeps a multi-sentence answer after an orphan closer intact', () => {
    const out = stripThinking('thinking aloud</think>First sentence. Second sentence.');
    expect(out).toBe('First sentence. Second sentence.');
  });

  test('uses the last orphan closer, so no monologue survives', () => {
    const out = stripThinking('one</think>two</think>The answer.');
    expect(out).toBe('The answer.');
  });

  test('an orphan closer with nothing after it leaves no answer', () => {
    expect(stripThinking('all of this was thinking</think>')).toBe('');
  });

  test('handles the orphan closer in the <thinking> spelling', () => {
    expect(stripThinking('musing</thinking>Answer.')).toBe('Answer.');
  });

  test('still removes a complete block that precedes an orphan closer', () => {
    expect(stripThinking('<think>a</think>b</think>Answer.')).toBe('Answer.');
  });
});

/**
 * The fixtures below are real Ollama 0.32.9 replies, captured from qwen3:4b rather than invented.
 * Three earlier attempts at this bug all failed on guessed response shapes, so these are recorded
 * verbatim and the reply reader is written against them.
 */
describe('readOllamaReply', () => {
  test('reads a completed answer, with the thinking kept out of it', () => {
    // Captured: think omitted, num_predict 1200, done_reason "stop".
    const reply = readOllamaReply({
      response:
        'A bibliography is a list of all the books, articles, websites, and other sources you ' +
        'used when researching or writing something. It helps readers find those sources easily.',
      thinking: 'Okay, the user wants a simple explanation. I should avoid jargon.',
      done_reason: 'stop',
    });
    expect(reply.problem).toBeNull();
    expect(reply.answer).toMatch(/^A bibliography is a list of all the books/);
    expect(reply.answer).not.toMatch(/Okay, the user/);
  });

  test('reports reasoning that never reached an answer, rather than showing the reasoning', () => {
    // Captured: think omitted, num_predict 150, done_reason "length". Ollama put the monologue in
    // its own field and left response empty, so there is genuinely no answer to show.
    const reply = readOllamaReply({
      response: '',
      thinking: 'Okay, the user wants a simple explanation of what a bibliography is—just one or ',
      done_reason: 'length',
    });
    expect(reply.answer).toBe('');
    expect(reply.problem).toBe('reasoned-without-answering');
  });

  test('still strips an inline trace, for backends that do not separate it', () => {
    const reply = readOllamaReply({
      response: 'thinking aloud here</think>A bibliography is a list of your sources.',
    });
    expect(reply.answer).toBe('A bibliography is a list of your sources.');
    expect(reply.problem).toBeNull();
  });

  test('distinguishes a model that said nothing at all', () => {
    expect(readOllamaReply({ response: '', thinking: '' }).problem).toBe('empty');
    expect(readOllamaReply({}).problem).toBe('empty');
    expect(readOllamaReply(null).problem).toBe('empty');
  });
});

describe('tokenBudget', () => {
  test('leaves an ordinary model on the budget it was given', () => {
    expect(tokenBudget('llama3.2:3b', 300)).toBe(300);
    expect(tokenBudget('mistral:latest', 150)).toBe(150);
  });

  test('adds room for the monologue a reasoning model produces first', () => {
    // Measured: qwen3.5 spent 1049 tokens reasoning before writing a two-sentence answer, so a
    // 300-token feature budget cannot reach an answer at all without headroom.
    expect(tokenBudget('qwen3:4b', 300)).toBeGreaterThan(1300);
    expect(tokenBudget('qwen3.5:latest', 150)).toBeGreaterThan(1300);
  });

  test('keeps the caller ahead of the floor when it asks for more', () => {
    expect(tokenBudget('qwen3:4b', 4000)).toBe(4000 + 1500);
  });

  test('falls back to a sane budget when none was given', () => {
    expect(tokenBudget('llama3.2:3b')).toBe(500);
    expect(tokenBudget('llama3.2:3b', null)).toBe(500);
  });
});

/**
 * JSON mode and reasoning models, measured on Ollama 0.32.9. With thinking left separated, a
 * qwen3 model in format:'json' puts the ENTIRE JSON object in the thinking field and returns an
 * empty response with done_reason "stop". With think:false the grammar forces the JSON straight
 * into response in under a second and there is no monologue for it to merge with. So the
 * think:false rule has one precise exception: JSON mode wants it, text mode must never send it.
 */
describe('buildGenerateBody', () => {
  const profile = { num_ctx: 2048, temperature: 0.7, top_p: 0.9, top_k: 40, repeat_penalty: 1.1 };

  test('never sends think:false for plain text, even on a reasoning model', () => {
    const body = buildGenerateBody('qwen3:4b', 'Hello', {}, profile);
    expect(body).not.toHaveProperty('think');
    expect(body).not.toHaveProperty('format');
  });

  test('sends think:false in JSON mode on a reasoning model', () => {
    const body = buildGenerateBody('qwen3:4b', 'Hello', { format: 'json' }, profile);
    expect(body.format).toBe('json');
    expect(body.think).toBe(false);
  });

  test('leaves an ordinary model alone in JSON mode', () => {
    const body = buildGenerateBody('llama3.2:3b', 'Hello', { format: 'json' }, profile);
    expect(body.format).toBe('json');
    expect(body).not.toHaveProperty('think');
  });

  test('applies the reasoning headroom to num_predict and honours overrides', () => {
    const body = buildGenerateBody(
      'qwen3:4b',
      'Hello',
      { maxTokens: 300, temperature: 0.2, num_ctx: 4096 },
      profile
    );
    expect(body.options.num_predict).toBe(tokenBudget('qwen3:4b', 300));
    expect(body.options.temperature).toBe(0.2);
    expect(body.options.num_ctx).toBe(4096);
    expect(body.options.top_k).toBe(40);
  });

  test('sends think:false for plain text on qwen3.5, which honours it', () => {
    // Measured on Ollama 0.33.3: qwen3.5 with think:false wrote a clean 53-token answer, and the
    // tutor prompt came back as parseable JSON in 136 tokens. Left thinking, the same tutor
    // request spent 1840 tokens and 49 seconds.
    expect(buildGenerateBody('qwen3.5:9b', 'Hello', {}, profile).think).toBe(false);
    expect(buildGenerateBody('qwen3.5:latest', 'Hello', {}, profile).think).toBe(false);
  });

  test('sends think:false when the caller asks for it, as the retry does', () => {
    const body = buildGenerateBody('qwen3:4b', 'Hello', { think: false }, profile);
    expect(body.think).toBe(false);
  });

  test('carries model, prompt and stream:false', () => {
    const body = buildGenerateBody('mistral:latest', 'Hi', {}, profile);
    expect(body).toMatchObject({ model: 'mistral:latest', prompt: 'Hi', stream: false });
  });
});

describe('readOllamaReply — JSON that landed in the thinking field', () => {
  // Captured: qwen3:4b, format:'json', think omitted. done_reason "stop", response "".
  const captured = {
    response: '',
    thinking:
      '{\n  "term": "bibliography",\n  "definition": "A list of sources used in the research or writing of a document."\n}',
    done_reason: 'stop',
  };

  test('salvages the object when the caller asked for JSON', () => {
    const reply = readOllamaReply(captured, { wantJson: true });
    expect(reply.problem).toBeNull();
    expect(JSON.parse(reply.answer).term).toBe('bibliography');
  });

  test('does not treat thinking as an answer when the caller wanted text', () => {
    const reply = readOllamaReply(captured);
    expect(reply.answer).toBe('');
    expect(reply.problem).toBe('reasoned-without-answering');
  });

  test('still reports a real failure when thinking holds no object', () => {
    const reply = readOllamaReply(
      { response: '', thinking: 'Hmm, the user wants' },
      { wantJson: true }
    );
    expect(reply.problem).toBe('reasoned-without-answering');
  });
});

describe('matchesModelFamily', () => {
  test('matches an exact name and a tagged variant of it', () => {
    expect(matchesModelFamily('llama3.1:8b', 'llama3.1:8b')).toBe(true);
    expect(matchesModelFamily('llama3.1:8b', 'llama3.1')).toBe(true);
  });

  test('matches across quantisations of the same family, which is the whole point', () => {
    // The project's preferred tag is qwen3:8b-q4_K_M; an ordinary machine has qwen3:4b.
    expect(matchesModelFamily('qwen3:4b', 'qwen3:8b-q4_K_M')).toBe(true);
  });

  test('does not confuse a neighbouring family with the one asked for', () => {
    expect(matchesModelFamily('qwen3.5:latest', 'qwen3')).toBe(false);
    expect(matchesModelFamily('llama3.2:3b', 'llama3.1:8b')).toBe(false);
  });

  test('is unmoved by junk', () => {
    expect(matchesModelFamily(null, 'qwen3')).toBe(false);
    expect(matchesModelFamily('qwen3:4b', '')).toBe(false);
  });
});

describe('MISSING_CHAT_MODEL_MESSAGE', () => {
  test('is one plain sentence naming a real model to pull and where to pull it', () => {
    expect(MISSING_CHAT_MODEL_MESSAGE).toContain(`ollama pull ${RECOMMENDED_PULL_MODEL}`);
    expect(MISSING_CHAT_MODEL_MESSAGE).toMatch(/terminal/i);
    expect(MISSING_CHAT_MODEL_MESSAGE.trim().endsWith('.')).toBe(true);
    expect(MISSING_CHAT_MODEL_MESSAGE).not.toMatch(/\.\s/); // one sentence, not a paragraph
  });

  test('recommends a model Ollama can actually generate with', () => {
    expect(filterChatModels([RECOMMENDED_PULL_MODEL])).toEqual([RECOMMENDED_PULL_MODEL]);
  });
});

describe('the models AssisT names', () => {
  test('the default is qwen3.5 (9B), and the small model answers without a thinking step', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('qwen3.5:9b');
    expect(RECOMMENDED_PULL_MODEL).toBe('qwen3:4b-instruct-2507-q4_K_M');
  });

  test('qwen3.5 is the vision model: measured to describe an image with thinking off', () => {
    expect(VISION_MODEL).toBe('qwen3.5:9b');
  });
});

describe('pickVisionModel', () => {
  test('prefers qwen3.5, then the older vision models', () => {
    expect(pickVisionModel(['llava:latest', 'qwen3.5:latest'])).toBe('qwen3.5:latest');
    expect(pickVisionModel(['qwen3:4b', 'llava:latest'])).toBe('llava:latest');
    expect(pickVisionModel(['llama3.2-vision:latest'])).toBe('llama3.2-vision:latest');
    expect(pickVisionModel(['bakllava:7b'])).toBe('bakllava:7b');
  });

  test('returns "" when nothing installed can read images', () => {
    expect(pickVisionModel(['qwen3:4b', 'llama3.2:3b', 'nomic-embed-text:latest'])).toBe('');
    expect(pickVisionModel([])).toBe('');
    expect(pickVisionModel(undefined)).toBe('');
  });
});

describe('findInstalledTag', () => {
  test("finds the 9B under Ollama's latest alias, which is how most students pulled it", () => {
    expect(findInstalledTag(['qwen3:4b', 'qwen3.5:latest'], 'qwen3.5:9b')).toBe('qwen3.5:latest');
    expect(findInstalledTag(['qwen3.5'], 'qwen3.5:9b')).toBe('qwen3.5');
  });

  test('and the other way round, and on an exact tag', () => {
    expect(findInstalledTag(['qwen3.5:9b'], 'qwen3.5')).toBe('qwen3.5:9b');
    expect(findInstalledTag(['QWEN3.5:9B'], 'qwen3.5:9b')).toBe('QWEN3.5:9B');
    expect(findInstalledTag(['llama3.2:latest'], 'llama3.2')).toBe('llama3.2:latest');
  });

  test('never treats a different size as the same model', () => {
    expect(findInstalledTag(['qwen3.5:latest'], 'qwen3.5:27b')).toBe('');
    expect(findInstalledTag(['qwen3:4b'], 'qwen3:4b-instruct-2507-q4_K_M')).toBe('');
    expect(findInstalledTag([], 'qwen3.5:9b')).toBe('');
    expect(findInstalledTag(undefined, 'qwen3.5:9b')).toBe('');
  });
});

describe('answersWithThinkingOff', () => {
  test.each(['qwen3.5:9b', 'qwen3.5:latest', 'qwen3.5:27b', 'QWEN3.5:9B'])(
    'is true for %s, measured to answer cleanly with think:false',
    name => expect(answersWithThinkingOff(name)).toBe(true)
  );

  // Owner decision 2026-10-07: qwen3.6 is treated like qwen3.5, without a separate measurement.
  test.each(['qwen3.6', 'qwen3.6:latest', 'qwen3.6:27b'])(
    'is true for %s, the successor to qwen3.5',
    name => expect(answersWithThinkingOff(name)).toBe(true)
  );

  test.each(['qwen3:4b', 'qwen3:8b-q4_K_M', 'qwen3.65:4b', 'deepseek-r1:7b', 'llama3.2:3b', '', null])(
    'is false for %s, which leaks or ignores the flag',
    name => expect(answersWithThinkingOff(name)).toBe(false)
  );
});

/**
 * The retry, measured on Ollama 0.33.3. With thinking left on, qwen3:4b spent all 2300 tokens of
 * the tutor prompt thinking (done_reason "length", empty response). Sent again with think:false
 * the reply either ends its monologue with a closing tag and then answers (plain prompt: separable)
 * or runs to the limit with an untagged monologue (tutor prompt in text mode: not an answer).
 */
describe('shouldRetryWithThinkingOff', () => {
  test('retries a reply that reasoned without answering, once', () => {
    expect(shouldRetryWithThinkingOff({}, 'reasoned-without-answering')).toBe(true);
    expect(shouldRetryWithThinkingOff({ think: false }, 'reasoned-without-answering')).toBe(false);
  });

  test('does not retry a good reply or a model that said nothing', () => {
    expect(shouldRetryWithThinkingOff({}, null)).toBe(false);
    expect(shouldRetryWithThinkingOff({}, 'empty')).toBe(false);
  });
});

describe('readOllamaReply — a reply sent with thinking forced off', () => {
  const opts = { thinkingSentOff: true };

  test('takes the answer after a monologue that closed its tag (qwen3:4b, captured)', () => {
    const reply = readOllamaReply(
      {
        response:
          'Okay, the user wants two sentences.\n- No extra info? Skipped sunsets, good.\n\n' +
          'Done! This should hit the mark.\n</think>\n\nSunlight is made of all colors, but blue ' +
          'light bounces off tiny air particles more than the other colors.',
        done_reason: 'stop',
      },
      opts
    );
    expect(reply.problem).toBeNull();
    expect(reply.answer).toMatch(/^Sunlight is made of all colors/);
  });

  test('takes the answer after a tagged block (deepseek-r1 ignores the flag, captured)', () => {
    const reply = readOllamaReply(
      {
        response: '<think> Okay, so I need to explain.</think>\n\nThe sky is blue.',
        done_reason: 'stop',
      },
      opts
    );
    expect(reply.answer).toBe('The sky is blue.');
  });

  test('refuses an untagged monologue cut off at the limit (qwen3:4b tutor, captured)', () => {
    const reply = readOllamaReply(
      {
        response: 'We are generating 3 Socratic questions based on the given text about photo',
        done_reason: 'length',
      },
      opts
    );
    expect(reply.answer).toBe('');
    expect(reply.problem).toBe('reasoned-without-answering');
  });

  test('keeps an ordinary reply that stopped on its own', () => {
    const reply = readOllamaReply({ response: 'The sky is blue.', done_reason: 'stop' }, opts);
    expect(reply.answer).toBe('The sky is blue.');
  });
});

describe('askOllama', () => {
  const RAN_OUT = { response: '', thinking: 'Okay, let me think about photosynthesis...', done_reason: 'length' };
  const TAGGED = {
    response: 'Done thinking.\n</think>\n\nSunlight is made of all colors.',
    done_reason: 'stop',
  };
  const UNTAGGED_CUT_OFF = {
    response: 'We are generating 3 Socratic questions based on the given text',
    done_reason: 'length',
  };

  function transport(...replies) {
    return jest.fn(async () => replies.shift());
  }

  test('asks once when the first reply answers', async () => {
    const send = transport({ response: 'The sky is blue.', done_reason: 'stop' });
    const reply = await askOllama({ model: 'qwen3:4b', prompt: 'Hi', send });
    expect(reply).toMatchObject({ answer: 'The sky is blue.', problem: null, retried: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).not.toHaveProperty('think');
  });

  test('asks once more with thinking off when the model ran out of room thinking', async () => {
    const send = transport(RAN_OUT, TAGGED);
    const reply = await askOllama({ model: 'qwen3:4b', prompt: 'Hi', send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].think).toBe(false);
    expect(reply).toMatchObject({ answer: 'Sunlight is made of all colors.', problem: null });
    expect(reply.retried).toBe(true);
  });

  test('reports the problem, never the monologue, when the retry is cut off too', async () => {
    const send = transport(RAN_OUT, UNTAGGED_CUT_OFF);
    const reply = await askOllama({ model: 'qwen3:4b', prompt: 'Hi', send });
    expect(reply.answer).toBe('');
    expect(reply.problem).toBe('reasoned-without-answering');
  });

  test('does not ask again when thinking was already off', async () => {
    const send = transport(RAN_OUT);
    const reply = await askOllama({
      model: 'qwen3:4b',
      prompt: 'Hi',
      options: { format: 'json' },
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(reply.problem).toBe('reasoned-without-answering');
  });

  test('does not ask again for a model that returned nothing at all', async () => {
    const send = transport({ response: '', done_reason: 'stop' });
    const reply = await askOllama({ model: 'llama3.2:3b', prompt: 'Hi', send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(reply.problem).toBe('empty');
  });
});

describe('REASONED_WITHOUT_ANSWER_MESSAGE', () => {
  test('is plain and says what to do', () => {
    expect(REASONED_WITHOUT_ANSWER_MESSAGE).not.toMatch(/spent its whole reply/);
    expect(REASONED_WITHOUT_ANSWER_MESSAGE).toMatch(/try again/i);
    expect(REASONED_WITHOUT_ANSWER_MESSAGE).toMatch(/AI settings/);
    expect(REASONED_WITHOUT_ANSWER_MESSAGE.trim().endsWith('.')).toBe(true);
  });
});
