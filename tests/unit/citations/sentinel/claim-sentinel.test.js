/**
 * claim-sentinel tests — orchestrator: caching, deduplication, error recovery.
 * The verifier is injected as a dependency so no real CrossRef calls are made.
 */

import { createCitationSentinel } from '../../../../src/features/citations/sentinel/claim-sentinel.js';

const C1 = { id: 'c1', doi: '10.1000/a', title: 'Paper A' };
const C2 = { id: 'c2', doi: '10.1000/b', title: 'Paper B' };

describe('createCitationSentinel()', () => {
  describe('verify()', () => {
    it('returns the verifier result', async () => {
      const verifier = jest.fn().mockResolvedValue({ status: 'verified', details: {} });
      const s = createCitationSentinel({ verifier });
      const r = await s.verify(C1);
      expect(r.status).toBe('verified');
      expect(verifier).toHaveBeenCalledWith(C1);
    });

    it('caches result — second call does not re-invoke verifier', async () => {
      const verifier = jest.fn().mockResolvedValue({ status: 'verified', details: {} });
      const s = createCitationSentinel({ verifier });
      await s.verify(C1);
      await s.verify(C1);
      expect(verifier).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent in-flight requests — verifier called once', async () => {
      let resolve;
      const promise = new Promise(r => {
        resolve = r;
      });
      const verifier = jest.fn().mockReturnValue(promise);
      const s = createCitationSentinel({ verifier });

      const [r1, r2] = await Promise.all([
        s.verify(C1),
        s.verify(C1),
        resolve({ status: 'flagged', details: {} }),
      ]);

      expect(verifier).toHaveBeenCalledTimes(1);
      expect(r1.status).toBe('flagged');
      expect(r2.status).toBe('flagged');
    });

    it('caches different citations independently', async () => {
      const verifier = jest
        .fn()
        .mockResolvedValueOnce({ status: 'verified', details: {} })
        .mockResolvedValueOnce({ status: 'flagged', details: {} });
      const s = createCitationSentinel({ verifier });
      const r1 = await s.verify(C1);
      const r2 = await s.verify(C2);
      expect(r1.status).toBe('verified');
      expect(r2.status).toBe('flagged');
      expect(verifier).toHaveBeenCalledTimes(2);
    });

    it('returns unverifiable (not a throw) when verifier rejects', async () => {
      const verifier = jest.fn().mockRejectedValue(new Error('boom'));
      const s = createCitationSentinel({ verifier });
      const r = await s.verify(C1);
      expect(r.status).toBe('unverifiable');
    });

    it('caches an error result so a failing verifier is not retried immediately', async () => {
      const verifier = jest.fn().mockRejectedValue(new Error('boom'));
      const s = createCitationSentinel({ verifier });
      await s.verify(C1);
      await s.verify(C1);
      expect(verifier).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus()', () => {
    it('returns null before verify() is called', () => {
      const s = createCitationSentinel({ verifier: jest.fn() });
      expect(s.getStatus('c1')).toBeNull();
    });

    it('returns null while verify() is in flight', () => {
      const verifier = jest.fn().mockReturnValue(new Promise(() => {}));
      const s = createCitationSentinel({ verifier });
      s.verify(C1);
      expect(s.getStatus('c1')).toBeNull();
    });

    it('returns the cached status after verify() resolves', async () => {
      const verifier = jest.fn().mockResolvedValue({ status: 'verified', details: { x: 1 } });
      const s = createCitationSentinel({ verifier });
      await s.verify(C1);
      const cached = s.getStatus('c1');
      expect(cached).not.toBeNull();
      expect(cached.status).toBe('verified');
      expect(cached.details).toEqual({ x: 1 });
    });
  });

  describe('invalidate()', () => {
    it('clears the cache so the next verify() re-invokes the verifier', async () => {
      const verifier = jest.fn().mockResolvedValue({ status: 'verified', details: {} });
      const s = createCitationSentinel({ verifier });
      await s.verify(C1);
      s.invalidate('c1');
      await s.verify(C1);
      expect(verifier).toHaveBeenCalledTimes(2);
    });

    it('getStatus() returns null after invalidate()', async () => {
      const verifier = jest.fn().mockResolvedValue({ status: 'verified', details: {} });
      const s = createCitationSentinel({ verifier });
      await s.verify(C1);
      s.invalidate('c1');
      expect(s.getStatus('c1')).toBeNull();
    });
  });
});
