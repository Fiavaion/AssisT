/**
 * Pure helpers for Ollama: classifying models by capability, sizing their token budgets, and
 * reading what they send back.
 *
 * Embeddings-only models (e.g. nomic-embed-text) cannot serve /api/generate —
 * selecting one yields a 400 "<model> does not support generate" from Ollama.
 * They must therefore be excluded from any text-generation model picker.
 *
 * Lives in src/utils/ so it can be imported by the popup, the service worker,
 * AND the ai-setup page (a web_accessible_resource that may only import from
 * src/pages/ai-setup/ and src/utils/).
 *
 * @module utils/ollama-models
 */

/**
 * Project default chat model, for a graphics card with 8 GB or more. Measured on Ollama 0.33.3 on
 * an 8 GB RTX 3080 Laptop: with thinking off it answers a short question in about a second and
 * writes the tutor's JSON in 136 tokens. A 6.6 GB download.
 */
export const DEFAULT_CHAT_MODEL = 'qwen3.5:9b';

/**
 * What to tell a student to install when nothing they have can generate text, and the model for a
 * computer without a strong graphics card. A 2.5 GB download, and the instruct build answers
 * without a thinking step (the tag is listed on ollama.com/library/qwen3).
 */
export const RECOMMENDED_PULL_MODEL = 'qwen3:4b-instruct-2507-q4_K_M';

/**
 * The model to install for reading images. Measured on Ollama 0.33.3: qwen3.5 described a test
 * image on /api/generate with thinking off in 1.2 seconds, so one download covers text and images.
 */
export const VISION_MODEL = 'qwen3.5:9b';

/**
 * What `latest` points at in the Ollama library, for the families AssisT offers. Checked on
 * ollama.com/library/qwen3.5/tags: latest and 9b carry the same digest (fdf5fd4cd409). A student
 * who ran `ollama pull qwen3.5` has the 9B listed as qwen3.5:latest.
 */
const LIBRARY_LATEST = { 'qwen3.5': 'qwen3.5:9b' };

/** A model name with its tag spelled out, and `latest` resolved where the library says what it is. */
function canonicalTag(name) {
  const lower = name.toLowerCase();
  const [base, tag = 'latest'] = lower.split(':');
  if (tag === 'latest' && LIBRARY_LATEST[base]) {
    return LIBRARY_LATEST[base];
  }
  return `${base}:${tag}`;
}

/**
 * The installed name of exactly the model wanted, or '' when it is not installed. Unlike
 * matchesModelFamily this never takes one size for another; it only knows that `qwen3.5` and
 * `qwen3.5:latest` are the 9B, as the library documents.
 *
 * @param {string[]} installed  Names from /api/tags.
 * @param {string} wanted       The name asked for, with or without a tag.
 * @returns {string}
 */
export function findInstalledTag(installed, wanted) {
  if (!Array.isArray(installed) || typeof wanted !== 'string' || !wanted) {
    return '';
  }
  const want = canonicalTag(wanted);
  return installed.find(m => typeof m === 'string' && canonicalTag(m) === want) || '';
}

/** Installed models that can read images, best first. */
const VISION_FAMILIES = [/^qwen3\.5(?::|$)/i, /^llava(?::|$)/i, /^llama3\.2-vision/i, /^bakllava/i];

/**
 * The installed model to describe an image with, or '' when none can.
 * @param {string[]} models  Installed model names.
 * @returns {string}
 */
export function pickVisionModel(models) {
  if (!Array.isArray(models)) {
    return '';
  }
  for (const family of VISION_FAMILIES) {
    const match = models.find(m => typeof m === 'string' && family.test(m));
    if (match) {
      return match;
    }
  }
  return '';
}

/**
 * Said to the student when Ollama is running but holds no model that can write text, in place of
 * quietly handing back an extractive answer and a badge. One sentence, naming the command and
 * where to type it.
 */
export const MISSING_CHAT_MODEL_MESSAGE = `Local AI is on, but Ollama has no model installed that can write text, so open a terminal and run "ollama pull ${RECOMMENDED_PULL_MODEL}" (or install a model from AssisT's AI setup page) and try again.`;

/**
 * True when an installed model is the one wanted, allowing for the tag.
 *
 * A wanted name is written with the tag the project offers (qwen3.5:9b), while a student has
 * whatever size and quantisation they pulled (qwen3.5:latest). Those are the same model to
 * everyone except an exact-string comparison, and treating them as different is what sent requests
 * to a model nobody had. The family name is compared whole, so qwen3.5 is not read as a qwen3.
 *
 * @param {string} installed  A name from /api/tags, e.g. "qwen3:4b".
 * @param {string} wanted     A name the project asks for, with or without a tag.
 * @returns {boolean}
 */
export function matchesModelFamily(installed, wanted) {
  if (!installed || !wanted || typeof installed !== 'string' || typeof wanted !== 'string') {
    return false;
  }
  const have = installed.toLowerCase();
  const want = wanted.toLowerCase();
  if (have === want || have.startsWith(`${want}:`)) {
    return true;
  }
  return have.split(':')[0] === want.split(':')[0];
}

/**
 * True when a model name denotes an embeddings-only model that cannot generate text.
 * @param {string} name  Ollama model name/tag (e.g. "nomic-embed-text:latest").
 * @returns {boolean}
 */
export function isEmbeddingModel(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  const n = name.toLowerCase();
  const base = n.split(':')[0];
  // *embed* family: nomic-embed-text, mxbai-embed-large, snowflake-arctic-embed, granite-embedding
  if (n.includes('embed')) {
    return true;
  }
  // Sentence-transformer / reranker families that omit "embed" in their name
  if (base.startsWith('bge') || base.startsWith('gte') || base.startsWith('e5-')) {
    return true;
  }
  if (base.includes('minilm')) {
    return true;
  }
  return false;
}

/**
 * Model families that reason before answering: they emit a long hidden monologue first,
 * and it is spent from the same token budget as the answer. Matched on the family name
 * because the tag varies by size and quantisation (qwen3:4b, qwen3:8b-q4_K_M, ...).
 */
const REASONING_FAMILIES =
  /qwen3|deepseek-r1|qwq|exaone-deep|marco-o1|gemma4|granite4|gpt-oss|reasoning|-r1\b/i;

/**
 * Families measured to honour `think: false`: the reply is the answer alone, with no monologue
 * leaked into it. Measured on Ollama 0.33.3 against qwen3.5 (9B): a two-sentence question came back
 * in 53 tokens and the tutor prompt as parseable JSON in 136. qwen3 does NOT belong here (it leaks
 * an untagged monologue) and nor does deepseek-r1 (it ignores the flag). qwen3.6, its successor, is
 * listed on the owner's decision (2026-10-07) without a separate measurement.
 */
const THINK_OFF_FAMILIES = /^qwen3\.[56](?::|$)/i;

/**
 * True when a model answers directly, and cleanly, when told not to think.
 * @param {string} name  Ollama model name/tag.
 * @returns {boolean}
 */
export function answersWithThinkingOff(name) {
  return typeof name === 'string' && THINK_OFF_FAMILIES.test(name);
}

/**
 * Said when a reasoning model still produced no answer after the automatic retry with thinking
 * switched off. Plain, and says what to do next.
 */
export const REASONED_WITHOUT_ANSWER_MESSAGE =
  "The local AI model ran out of room before it finished its answer. Try again, or choose a different model in AssisT's AI settings.";

/**
 * True when a model thinks before it answers. Two consequences follow, and both are bugs
 * when ignored: under a small num_predict the whole allowance goes on thinking and Ollama
 * returns an empty response, and latency is governed by how much the model chooses to
 * reason rather than by its parameter count.
 * @param {string} name  Ollama model name/tag (e.g. "qwen3:8b-q4_K_M").
 * @returns {boolean}
 */
export function isReasoningModel(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return REASONING_FAMILIES.test(name);
}

/** A complete reasoning block, in either spelling these models use. */
const THINK_BLOCK = /<(think|thinking)>[\s\S]*?<\/\1>/gi;

/**
 * A closer with no opener, i.e. everything up to and including the last stray closing tag.
 *
 * This is the ordinary shape, not an edge case: qwen3 and its relatives pre-fill the opening tag
 * into the PROMPT via their chat template, so the reply begins mid-thought and the only tag it ever
 * emits is the closing one. Anything before that tag is thinking by definition, and the answer is
 * whatever follows it.
 */
const THINK_CLOSE_HEAD = /^[\s\S]*<\/(?:think|thinking)>/i;

/**
 * An opener with no closer, i.e. everything from the unclosed tag to the end. This is what a
 * truncated reply looks like: the budget ran out mid-monologue, so the closing tag was never
 * written and a block-only strip leaves the whole trace behind.
 */
const THINK_OPEN_TAIL = /<(?:think|thinking)>[\s\S]*$/i;

/**
 * Remove a reasoning model's monologue from a reply, leaving only the answer.
 *
 * This is the fallback path, not the main one. Current Ollama hands the trace back in its own field
 * and needs no stripping at all (see readOllamaReply); this covers the backends that still emit it
 * in-band, WebLLM and older Ollama among them, where the trace arrives wrapped in tags.
 *
 * Do NOT reach for `think: false` to avoid needing this, except for the families in
 * answersWithThinkingOff. On qwen3 the flag does not stop the model reasoning, it stops Ollama
 * separating the reasoning, and the monologue can then arrive untagged inside the answer where this
 * function is powerless. Measured on Ollama 0.32.9 and 0.33.3 against qwen3:4b.
 *
 * Returns '' when the reply was nothing but thinking - the caller decides what to say about that,
 * because "the model thought until it ran out of room" is a different problem from "the model
 * returned nothing at all".
 *
 * @param {string} text  Raw `response` body from Ollama.
 * @returns {string}  The answer, trimmed, or '' if there was none.
 */
export function stripThinking(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  // Order matters. Take the well-formed blocks out first, so that a tag still standing afterwards
  // is genuinely unpaired and can be read as one of the two half-open shapes rather than as part
  // of a block this pass would have handled.
  return text
    .replace(THINK_BLOCK, '')
    .replace(THINK_CLOSE_HEAD, '')
    .replace(THINK_OPEN_TAIL, '')
    .trim();
}

/**
 * Room, in tokens, for a reasoning model to think before it starts answering. Measured against
 * Ollama 0.32.9: qwen3:4b spent ~330 tokens reasoning on a one-sentence question and qwen3.5 spent
 * 1049. A feature budget of 300 or 600 is therefore consumed entirely by the monologue, and the
 * model is cut off before writing a single word of the answer.
 */
const THINKING_HEADROOM = 1500;

/** Used when a caller names no budget, matching the service worker's own long-standing default. */
const DEFAULT_BUDGET = 500;

/**
 * The number of tokens to allow a model, given what the caller asked for.
 *
 * A reasoning model needs its own budget plus the caller's, because the two come out of one
 * allowance and the thinking is spent first. Raising the ceiling costs nothing when the model
 * finishes early: it stops on its own and reports done_reason "stop".
 *
 * @param {string} model      Resolved Ollama model name.
 * @param {number} [requested] Tokens the caller wants for the answer itself.
 * @returns {number}
 */
export function tokenBudget(model, requested) {
  const asked = typeof requested === 'number' && requested > 0 ? requested : DEFAULT_BUDGET;
  return isReasoningModel(model) ? asked + THINKING_HEADROOM : asked;
}

/**
 * Read what Ollama sent back, separating the answer from the reasoning that preceded it.
 *
 * Ollama keeps a reasoning model's monologue in its own `thinking` field and leaves `response`
 * holding the answer alone. On qwen3 `think: false` does not stop the model reasoning, it stops
 * Ollama separating the reasoning, and the monologue then arrives inside `response`. When it closes
 * with a `</think>` tag the answer after it can still be taken; when the reply was cut off at the
 * token limit with no tag at all, it is monologue and not an answer. `thinkingSentOff` asks for that
 * check, and is set for the retry that sends the flag to a model that may not honour it.
 *
 * `problem` distinguishes the two ways an answer can be missing, because they need different things
 * from the reader: a model that reasoned past its budget needs more room, and a model that returned
 * nothing needs a different prompt or a different model.
 *
 * @param {Object} data  Parsed body of an Ollama /api/generate reply.
 * @param {{wantJson?: boolean, thinkingSentOff?: boolean}} [options]
 * @returns {{answer: string, thinking: string, problem: null|'reasoned-without-answering'|'empty'}}
 */
export function readOllamaReply(data, { wantJson = false, thinkingSentOff = false } = {}) {
  const body = data && typeof data === 'object' ? data : {};
  const thinking = typeof body.thinking === 'string' ? body.thinking.trim() : '';
  const raw = typeof body.response === 'string' ? body.response : '';

  const untaggedMonologue =
    thinkingSentOff && body.done_reason === 'length' && !/<\/?(?:think|thinking)>/i.test(raw);
  if (untaggedMonologue) {
    return { answer: '', thinking, problem: 'reasoned-without-answering' };
  }

  // Still strip inline tags: older Ollama, WebLLM and other backends emit the trace in-band.
  const answer = stripThinking(raw);
  if (answer) {
    return { answer, thinking, problem: null };
  }

  // JSON mode on a reasoning model with thinking left separated files the whole object under
  // `thinking` and leaves `response` empty (measured, Ollama 0.32.9). buildGenerateBody avoids
  // that by switching separation off for JSON requests; this is the defence for a backend that
  // does not honour the flag.
  if (wantJson && thinking) {
    const object = thinking.match(/\{[\s\S]*\}/);
    if (object) {
      try {
        JSON.parse(object[0]);
        return { answer: object[0], thinking, problem: null };
      } catch {
        // Not an object after all; fall through to the honest failure.
      }
    }
  }

  const reasoned = Boolean(thinking) || Boolean(raw.trim());
  return { answer: '', thinking, problem: reasoned ? 'reasoned-without-answering' : 'empty' };
}

/**
 * True when a reply that reasoned without answering should be asked for once more with thinking
 * switched off. Only once: a request that already went out with `think: false` is not repeated.
 *
 * @param {Object} body     The request body that was sent (see buildGenerateBody).
 * @param {string|null} problem  readOllamaReply's verdict on the reply.
 * @returns {boolean}
 */
export function shouldRetryWithThinkingOff(body, problem) {
  return problem === 'reasoned-without-answering' && body?.think !== false;
}

/**
 * Ask Ollama for an answer, retrying once with thinking switched off when a reasoning model
 * thought until it ran out of room. The transport is passed in so the decision can be tested
 * without a network.
 *
 * @param {Object} request
 * @param {string} request.model     Resolved Ollama model name.
 * @param {string} request.prompt
 * @param {Object} [request.options] Caller options, as for buildGenerateBody.
 * @param {Object} [request.profile] Model optimisation profile.
 * @param {(body: Object) => Promise<Object>} request.send  Posts a body to /api/generate and
 *   resolves with the parsed reply.
 * @returns {Promise<{answer: string, thinking: string, problem: null|string, retried: boolean}>}
 */
export async function askOllama({ model, prompt, options = {}, profile = {}, send }) {
  const wantJson = options.format === 'json';
  const body = buildGenerateBody(model, prompt, options, profile);
  const reply = readOllamaReply(await send(body), { wantJson });
  if (!shouldRetryWithThinkingOff(body, reply.problem)) {
    return { ...reply, retried: false };
  }
  const retryBody = buildGenerateBody(model, prompt, { ...options, think: false }, profile);
  const retry = readOllamaReply(await send(retryBody), {
    wantJson,
    thinkingSentOff: !answersWithThinkingOff(model),
  });
  return { ...retry, retried: true };
}

/**
 * The body of an /api/generate request, in one place so that the two facts below cannot drift
 * apart from each other or from the tests that pin them.
 *
 * `think: false` is sent in three cases:
 *  - JSON mode on a reasoning model. Measured on Ollama 0.32.9 and 0.33.3 against qwen3:4b — with
 *    separation left on, the model writes the JSON into `thinking` (or thinks until the budget runs
 *    out) and `response` comes back empty; with the flag the object lands in `response`.
 *  - Any request to a family in answersWithThinkingOff (qwen3.5), which then answers directly.
 *  - When the caller asks (`options.think === false`), as the one automatic retry does.
 * Otherwise, for plain text on qwen3 and deepseek-r1, the flag is not sent: it merges the monologue
 * into the answer. Sending it to a model that cannot think at all is harmless (measured: llama3.2
 * answers normally; it is `think: true` that such a model rejects with a 400).
 *
 * @param {string} model     Resolved Ollama model name.
 * @param {string} prompt
 * @param {Object} [options] Caller options: format, maxTokens, temperature, num_ctx, think.
 * @param {Object} [profile] Model optimisation profile: num_ctx, temperature, top_p, top_k, repeat_penalty.
 * @returns {Object} Ready for JSON.stringify.
 */
export function buildGenerateBody(model, prompt, options = {}, profile = {}) {
  const wantJson = options.format === 'json';
  const thinkOff =
    options.think === false ||
    answersWithThinkingOff(model) ||
    (wantJson && isReasoningModel(model));
  return {
    model,
    prompt,
    stream: false,
    ...(options.format ? { format: options.format } : {}),
    ...(thinkOff ? { think: false } : {}),
    options: {
      num_ctx: options.num_ctx ?? profile.num_ctx,
      temperature: options.temperature ?? profile.temperature,
      num_predict: tokenBudget(model, options.maxTokens),
      top_p: profile.top_p,
      top_k: profile.top_k,
      repeat_penalty: profile.repeat_penalty,
    },
  };
}

/**
 * Filter a list of Ollama model names down to text-generation-capable models,
 * preserving order.
 * @param {string[]} models
 * @returns {string[]}
 */
export function filterChatModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }
  return models.filter(m => typeof m === 'string' && !isEmbeddingModel(m));
}

/**
 * Pick a sensible default chat model from installed models. Prefers the project
 * default, then any installed chat model, and never an embeddings-only model.
 * @param {string[]} models       Installed model names.
 * @param {string}  [preferred=DEFAULT_CHAT_MODEL]
 * @returns {string}  A model name, or '' when no chat model is installed.
 */
export function pickDefaultChatModel(models, preferred = DEFAULT_CHAT_MODEL) {
  const chat = filterChatModels(models);
  if (chat.length === 0) {
    return '';
  }
  return chat.find(m => matchesModelFamily(m, preferred)) || chat[0];
}
