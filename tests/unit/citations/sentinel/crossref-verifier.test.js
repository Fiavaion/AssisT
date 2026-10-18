/**
 * crossref-verifier tests — input/output pairs for verifyCitation().
 * All CrossRef network calls are mocked; no real HTTP.
 */

import { verifyCitation } from '../../../../src/features/citations/sentinel/crossref-verifier.js';

jest.mock('../../../../src/features/citations/crossref-api.js', () => ({
  fetchDOIMetadata: jest.fn(),
  isValidDOI: jest.fn(),
}));

import { fetchDOIMetadata, isValidDOI } from '../../../../src/features/citations/crossref-api.js';

const VALID_DOI = '10.1000/xyz123';
const BASE_CITATION = {
  id: 'c1',
  title: 'The Effects of Climate Change',
  doi: VALID_DOI,
};

beforeEach(() => {
  jest.clearAllMocks();
  isValidDOI.mockReturnValue(true);
});

describe('verifyCitation()', () => {
  describe('unverifiable — no DOI', () => {
    it('returns unverifiable when doi is absent', async () => {
      isValidDOI.mockReturnValue(false);
      const r = await verifyCitation({ ...BASE_CITATION, doi: undefined });
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('no-doi');
    });

    it('returns unverifiable when doi is an empty string', async () => {
      isValidDOI.mockReturnValue(false);
      const r = await verifyCitation({ ...BASE_CITATION, doi: '' });
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('no-doi');
    });

    it('returns unverifiable when doi fails format validation', async () => {
      isValidDOI.mockReturnValue(false);
      const r = await verifyCitation({ ...BASE_CITATION, doi: 'not-a-doi' });
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('no-doi');
      expect(fetchDOIMetadata).not.toHaveBeenCalled();
    });
  });

  describe('unverifiable — CrossRef lookup failures', () => {
    // The badge checks itself whenever the library draws a card. The student did not ask for
    // that, so it must never open the consent panel (ADR 0006): unanswered means unverified.
    it('never asks the student about CrossRef', async () => {
      fetchDOIMetadata.mockResolvedValue(null);
      await verifyCitation(BASE_CITATION);
      expect(fetchDOIMetadata).toHaveBeenCalledWith(BASE_CITATION.doi, { ask: false });
    });

    it('returns unverifiable when CrossRef returns null (404)', async () => {
      fetchDOIMetadata.mockResolvedValue(null);
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('not-found');
    });

    it('returns unverifiable when CrossRef throws (network error)', async () => {
      fetchDOIMetadata.mockRejectedValue(new Error('network failure'));
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('network-error');
    });

    it('returns unverifiable when CrossRef returns a record with no title', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: '' });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('no-title');
    });

    it('returns unverifiable when the saved citation has no title', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'Climate Change Effects' });
      const r = await verifyCitation({ ...BASE_CITATION, title: '' });
      expect(r.status).toBe('unverifiable');
      expect(r.details.reason).toBe('no-title');
    });
  });

  describe('verified — title matches', () => {
    it('returns verified when CrossRef title exactly matches', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'The Effects of Climate Change' });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('verified');
      expect(r.details.crossrefTitle).toBe('The Effects of Climate Change');
    });

    it('comparison is case-insensitive', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'THE EFFECTS OF CLIMATE CHANGE' });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('verified');
    });

    it('comparison strips punctuation (saved title has colon, CrossRef does not)', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'Effects of Climate Change' });
      const r = await verifyCitation({
        ...BASE_CITATION,
        title: 'Effects of Climate Change: A Study',
      });
      expect(r.status).toBe('verified');
    });

    it('returns verified when CrossRef title contains the saved title (subtitle omitted)', async () => {
      fetchDOIMetadata.mockResolvedValue({
        title: 'The Effects of Climate Change: A Comprehensive Review',
      });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('verified');
    });
  });

  describe('flagged — title mismatch', () => {
    it('returns flagged when CrossRef title is completely different', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'A Completely Different Paper' });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('flagged');
      expect(r.details.crossrefTitle).toBe('A Completely Different Paper');
      expect(r.details.savedTitle).toBe(BASE_CITATION.title);
    });

    it('includes both titles in details so the card can show them', async () => {
      fetchDOIMetadata.mockResolvedValue({ title: 'Unrelated Work' });
      const r = await verifyCitation(BASE_CITATION);
      expect(r.status).toBe('flagged');
      expect(r.details).toHaveProperty('crossrefTitle');
      expect(r.details).toHaveProperty('savedTitle');
    });
  });
});
