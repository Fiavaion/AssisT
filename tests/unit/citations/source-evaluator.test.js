/**
 * @jest-environment jsdom
 */

// Mock CitationStorage to avoid Dexie dependency
jest.mock('../../../src/features/citations/citation-storage.js', () => ({
  CitationStorage: {
    get: jest.fn(),
    update: jest.fn(),
  },
}));

import { SourceEvaluator } from '../../../src/features/citations/source-evaluator.js';

describe('Source Evaluator Module', () => {
  describe('evaluateDomain', () => {
    test('should give high score to .edu domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.harvard.edu/research');
      expect(score).toBe(0.9);
    });

    test('should give high score to .ac.uk domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.ox.ac.uk/paper');
      expect(score).toBe(0.9);
    });

    test('should give high score to .gov domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.nih.gov/health');
      expect(score).toBe(0.85);
    });

    test('should give high score to .gov.uk domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.nhs.gov.uk/conditions');
      expect(score).toBe(0.85);
    });

    test('should give medium-high score to .org domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.wikipedia.org/article');
      expect(score).toBe(0.7);
    });

    test('should recognize academic publishers', () => {
      const springerScore = SourceEvaluator.evaluateDomain('https://link.springer.com/article');
      const natureScore = SourceEvaluator.evaluateDomain('https://www.nature.com/articles');

      expect(springerScore).toBe(0.85);
      expect(natureScore).toBe(0.85);
      // Note: jstor.org matches .org first (0.7) before academic publisher check
    });

    test('should recognize news organizations', () => {
      const bbcScore = SourceEvaluator.evaluateDomain('https://www.bbc.com/news');
      const reutersScore = SourceEvaluator.evaluateDomain('https://www.reuters.com/article');

      expect(bbcScore).toBe(0.65);
      expect(reutersScore).toBe(0.65);
    });

    test('should give default score to commercial domains', () => {
      const score = SourceEvaluator.evaluateDomain('https://www.example.com/page');
      expect(score).toBe(0.5);
    });

    test('should handle invalid URLs gracefully', () => {
      const score = SourceEvaluator.evaluateDomain('not-a-valid-url');
      expect(score).toBe(0.5);
    });
  });

  describe('calculateAutoIndicators', () => {
    test('should detect DOI presence', () => {
      const citation = {
        doi: '10.1234/test.123',
        type: 'journal-article',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.hasDOI).toBe(true);
    });

    test('should detect ISBN presence', () => {
      const citation = {
        isbn: '978-0-123456-78-9',
        type: 'book',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.hasISBN).toBe(true);
    });

    test('should detect peer review status', () => {
      const citation = {
        peerReviewed: true,
        type: 'journal-article',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.hasPeerReview).toBe(true);
    });

    test('should detect recent sources (within 5 years)', () => {
      const currentYear = new Date().getFullYear();
      const citation = {
        year: String(currentYear - 2),
        type: 'website',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.isRecentSource).toBe(true);
    });

    test('should detect old sources (over 5 years)', () => {
      const currentYear = new Date().getFullYear();
      const citation = {
        year: String(currentYear - 10),
        type: 'book',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.isRecentSource).toBe(false);
    });

    test('should detect author presence', () => {
      const citation = {
        authors: ['Smith, John'],
        type: 'website',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.hasAuthor).toBe(true);
    });

    test('should not count "Unknown" as valid author', () => {
      const citation = {
        authors: ['Unknown'],
        type: 'website',
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);
      expect(indicators.hasAuthor).toBe(false);
    });

    test('should assign correct source type score', () => {
      const journalCitation = { type: 'journal-article' };
      const websiteCitation = { type: 'website' };
      const socialCitation = { type: 'social-media' };

      expect(SourceEvaluator.calculateAutoIndicators(journalCitation).sourceTypeScore).toBe(1.0);
      expect(SourceEvaluator.calculateAutoIndicators(websiteCitation).sourceTypeScore).toBe(0.5);
      expect(SourceEvaluator.calculateAutoIndicators(socialCitation).sourceTypeScore).toBe(0.3);
    });
  });

  describe('calculateCredibilityScore', () => {
    test('should calculate score for high-quality journal article', () => {
      const citation = {
        type: 'journal-article',
        doi: '10.1234/test',
        peerReviewed: true,
        authors: ['Smith, John'],
        publisher: 'Academic Press',
        year: String(new Date().getFullYear() - 1),
        url: 'https://www.nature.com/articles/123',
      };

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.level.label).toBe('High Quality');
    });

    test('should calculate score for medium-quality website', () => {
      const citation = {
        type: 'website',
        authors: ['Unknown Author'],
        year: String(new Date().getFullYear() - 3),
        url: 'https://www.example.com/article',
      };

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.score).toBeLessThan(75);
    });

    test('should calculate score for low-quality social media', () => {
      const citation = {
        type: 'social-media',
        authors: [],
        url: 'https://twitter.com/user/status/123',
      };

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.score).toBeLessThan(50);
    });

    test('should include CRAAP scores when provided', () => {
      const citation = {
        type: 'website',
        url: 'https://example.com',
      };

      const craapScores = {
        currency: 80,
        relevance: 70,
        authority: 60,
        accuracy: 75,
        purpose: 65,
      };

      const result = SourceEvaluator.calculateCredibilityScore(citation, craapScores);

      expect(result.hasCraapEvaluation).toBe(true);
      expect(result.craapScores).toEqual(craapScores);
      expect(result.breakdown.craapScore).toBeGreaterThan(0);
    });

    test('should return breakdown of scores', () => {
      const citation = {
        type: 'journal-article',
        doi: '10.1234/test',
        url: 'https://springer.com/article',
      };

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.autoScore).toBeGreaterThan(0);
      expect(result.autoIndicators).toBeDefined();
    });
  });

  describe('getBadgeHTML', () => {
    test('should return green badge for high score', () => {
      const badge = SourceEvaluator.getBadgeHTML(85);

      expect(badge).toContain('#4caf50');
      expect(badge).toContain('High Quality');
      expect(badge).toContain('✓');
    });

    test('should return orange badge for medium score', () => {
      const badge = SourceEvaluator.getBadgeHTML(60);

      expect(badge).toContain('#ff9800');
      expect(badge).toContain('Medium Quality');
      expect(badge).toContain('!');
    });

    test('should return red badge for low score', () => {
      const badge = SourceEvaluator.getBadgeHTML(30);

      expect(badge).toContain('#f44336');
      expect(badge).toContain('Low Quality');
      expect(badge).toContain('✗');
    });

    test('should include score in badge', () => {
      const badge = SourceEvaluator.getBadgeHTML(75);

      expect(badge).toContain('75');
    });
  });

  describe('Edge Cases', () => {
    test('should handle citation with minimal data', () => {
      const citation = { type: 'unknown' };

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.score).toBeDefined();
      expect(result.level).toBeDefined();
    });

    test('should handle empty citation object', () => {
      const citation = {};

      const result = SourceEvaluator.calculateCredibilityScore(citation);

      expect(result.score).toBeDefined();
    });

    test('should handle citation with null values', () => {
      const citation = {
        type: 'website',
        doi: null,
        isbn: null,
        authors: null,
      };

      const indicators = SourceEvaluator.calculateAutoIndicators(citation);

      expect(indicators.hasDOI).toBe(false);
      expect(indicators.hasISBN).toBe(false);
      expect(indicators.hasAuthor).toBe(false);
    });
  });
});
