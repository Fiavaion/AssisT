/**
 * Which local model answers a request, when the student has not chosen one.
 *
 * A student who switches local AI on from the popup never has to visit AI setup, so there is often
 * no stored model. The project default tag was then sent to Ollama as-is, Ollama had no such model,
 * and the feature quietly served an extractive answer instead. So the choice is made from what
 * Ollama reports it actually has: never an embeddings-only model (Ollama answers those with 400
 * "does not support generate"), and when there is nothing suitable at all the caller is given one
 * plain sentence to show rather than a silent downgrade.
 *
 * The list is cached for a short while: a feature panel can fire several requests in a row and each
 * one would otherwise cost an /api/tags round trip.
 *
 * @module ai/ollama-model-choice
 */

import { filterChatModels, MISSING_CHAT_MODEL_MESSAGE } from '../utils/ollama-models.js';

/** How long an /api/tags answer is trusted. Long enough for a burst, short enough to see a pull. */
export const INSTALLED_MODELS_TTL_MS = 30000;

/**
 * @typedef {Object} ModelChoice
 * @property {string|null} model  The model to ask for, or null to leave the caller's own default
 *                                in place (Ollama is unreachable, and its connection error is the
 *                                honest thing to show).
 * @property {string} [error]     A sentence for the student; when present, do not send a request.
 */

/**
 * @param {Object}   deps
 * @param {Function} deps.listModels  Async, returns {available, models} — i.e. /api/tags, wrapped.
 * @param {number}   [deps.ttlMs]
 * @param {Function} [deps.now]       Clock, injectable for tests.
 * @returns {{chooseModel: Function, installedModels: Function, forget: Function}}
 */
export function createOllamaModelChooser({
  listModels,
  ttlMs = INSTALLED_MODELS_TTL_MS,
  now = () => Date.now(),
}) {
  /** @type {{at: number, status: Object}|null} */
  let cached = null;
  /** @type {Promise<Object>|null} */
  let inFlight = null;

  /** The installed list, from cache when it is fresh. A failed lookup is never cached. */
  async function installedModels() {
    if (cached && now() - cached.at < ttlMs) {
      return cached.status;
    }
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const status = await listModels();
          cached = { at: now(), status };
          return status;
        } finally {
          inFlight = null;
        }
      })();
    }
    return inFlight;
  }

  /**
   * @param {Object}   request
   * @param {string}   [request.storedModel]       The student's own choice from AI setup.
   * @param {Function} [request.resolvePreferred]  Given the installed chat models, return the one
   *                                               that suits this task, or '' for no opinion.
   * @returns {Promise<ModelChoice>}
   */
  async function chooseModel({ storedModel = '', resolvePreferred } = {}) {
    // The student's explicit choice always wins, and is worth no round trip.
    if (storedModel) {
      return { model: storedModel };
    }

    const status = await installedModels();
    if (!status || !status.available) {
      return { model: null };
    }

    const chat = filterChatModels(status.models || []);
    if (chat.length === 0) {
      return { model: null, error: MISSING_CHAT_MODEL_MESSAGE };
    }

    const preferred = resolvePreferred ? resolvePreferred(chat) : '';
    return { model: preferred || chat[0] };
  }

  return {
    chooseModel,
    installedModels,
    /** Drop the cache, e.g. once a model has been installed. */
    forget() {
      cached = null;
    },
  };
}
