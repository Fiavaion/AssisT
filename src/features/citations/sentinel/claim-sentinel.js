/**
 * Citation Sentinel Orchestrator
 *
 * Manages per-citation verification state: deduplicates concurrent requests, caches
 * results with a TTL, and surfaces a synchronous getStatus() for renders that can't
 * await a promise.
 *
 * Public API:
 *   createCitationSentinel([{ verifier }])
 *     -> { verify(citation): Promise<{status, details}>, getStatus(id), invalidate(id) }
 *
 * Statuses returned by verify():
 *   'verified'     — CrossRef confirmed the source
 *   'flagged'      — CrossRef found a different title under that DOI
 *   'unverifiable' — no DOI, network failure, or CrossRef 404
 */

import { verifyCitation } from './crossref-verifier.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @param {Object} [options]
 * @param {Function} [options.verifier] - injectable for testing (defaults to verifyCitation)
 * @returns {{ verify: Function, getStatus: Function, invalidate: Function }}
 */
export function createCitationSentinel({ verifier = verifyCitation } = {}) {
  // Map<id, { status, details, ts, promise }>
  // While in-flight: { promise, ts }. When settled: { status, details, ts, promise: null }.
  const _cache = new Map();

  async function verify(citation) {
    const id = String(citation.id || '');
    const cached = _cache.get(id);

    if (cached && cached.promise) {
      return cached.promise;
    }

    if (cached && cached.status && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { status: cached.status, details: cached.details };
    }

    const promise = verifier(citation)
      .then(result => {
        _cache.set(id, {
          status: result.status,
          details: result.details,
          ts: Date.now(),
          promise: null,
        });
        return result;
      })
      .catch(() => {
        const fallback = { status: 'unverifiable', details: { reason: 'error' } };
        _cache.set(id, { ...fallback, ts: Date.now(), promise: null });
        return fallback;
      });

    _cache.set(id, { promise, ts: Date.now() });
    return promise;
  }

  function getStatus(id) {
    const cached = _cache.get(String(id || ''));
    if (!cached || cached.promise) {
      return null;
    }
    return { status: cached.status, details: cached.details };
  }

  function invalidate(id) {
    _cache.delete(String(id || ''));
  }

  return { verify, getStatus, invalidate };
}

export default { createCitationSentinel };
