/**
 * Text Statistics Engine Tests
 *
 * Comprehensive unit tests for text analysis algorithms
 */

import { TextStats } from '../../src/features/textStats/textStats.js';

describe('TextStats', () => {
  let textStats;

  beforeEach(() => {
    textStats = new TextStats();
  });

  describe('Initialization', () => {
    test('should initialize with default values', async () => {
      await textStats.initialize();
      expect(textStats.enabled).toBe(true);
      expect(textStats.targetWordCount).toBe(0);
      expect(textStats.readingSpeed).toBe(225);
    });

    test('should initialize with custom settings', async () => {
      await textStats.initialize({
        enabled: false,
        targetWordCount: 500,
        readingSpeed: 250
      });
      expect(textStats.enabled).toBe(false);
      expect(textStats.targetWordCount).toBe(500);
      expect(textStats.readingSpeed).toBe(250);
    });
  });

  describe('countWords()', () => {
    test('should count words correctly', () => {
      expect(textStats.countWords('Hello world')).toBe(2);
      expect(textStats.countWords('One two three four five')).toBe(5);
    });

    test('should handle multiple spaces', () => {
      expect(textStats.countWords('Hello    world')).toBe(2);
      expect(textStats.countWords('  Leading and trailing  ')).toBe(3);
    });

    test('should filter punctuation-only strings', () => {
      expect(textStats.countWords('Hello, world!')).toBe(2);
      expect(textStats.countWords('Test... another test')).toBe(3);
    });

    test('should handle empty strings', () => {
      expect(textStats.countWords('')).toBe(0);
      expect(textStats.countWords('   ')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.countWords(null)).toBe(0);
      expect(textStats.countWords(undefined)).toBe(0);
    });

    test('should handle contractions', () => {
      expect(textStats.countWords("Don't can't won't")).toBe(3);
    });

    test('should handle numbers', () => {
      expect(textStats.countWords('123 456 789')).toBe(3);
      expect(textStats.countWords('There are 5 apples')).toBe(4);
    });
  });

  describe('countCharacters()', () => {
    test('should count characters with spaces', () => {
      expect(textStats.countCharacters('Hello world', true)).toBe(11);
      expect(textStats.countCharacters('Test', true)).toBe(4);
    });

    test('should count characters without spaces', () => {
      expect(textStats.countCharacters('Hello world', false)).toBe(10);
      expect(textStats.countCharacters('A B C', false)).toBe(3);
    });

    test('should handle empty strings', () => {
      expect(textStats.countCharacters('', true)).toBe(0);
      expect(textStats.countCharacters('', false)).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.countCharacters(null, true)).toBe(0);
      expect(textStats.countCharacters(undefined, false)).toBe(0);
    });

    test('should handle newlines and tabs', () => {
      expect(textStats.countCharacters('Hello\nWorld', true)).toBe(11);
      expect(textStats.countCharacters('Hello\nWorld', false)).toBe(10);
    });
  });

  describe('countSentences()', () => {
    test('should count sentences with periods', () => {
      expect(textStats.countSentences('Hello world. How are you?')).toBe(2);
      expect(textStats.countSentences('One. Two. Three.')).toBe(3);
    });

    test('should count sentences with multiple terminators', () => {
      expect(textStats.countSentences('Hello! How are you? Fine.')).toBe(3);
    });

    test('should handle sentence without trailing terminator', () => {
      expect(textStats.countSentences('Hello world')).toBe(1);
    });

    test('should handle empty strings', () => {
      expect(textStats.countSentences('')).toBe(0);
      expect(textStats.countSentences('   ')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.countSentences(null)).toBe(0);
      expect(textStats.countSentences(undefined)).toBe(0);
    });

    test('should handle multiple spaces after terminators', () => {
      expect(textStats.countSentences('First.   Second.    Third.')).toBe(3);
    });
  });

  describe('countParagraphs()', () => {
    test('should count paragraphs separated by double newlines', () => {
      const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      expect(textStats.countParagraphs(text)).toBe(3);
    });

    test('should handle single paragraph', () => {
      expect(textStats.countParagraphs('Single paragraph.')).toBe(1);
    });

    test('should ignore single newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      expect(textStats.countParagraphs(text)).toBe(1);
    });

    test('should handle empty strings', () => {
      expect(textStats.countParagraphs('')).toBe(0);
      expect(textStats.countParagraphs('   ')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.countParagraphs(null)).toBe(0);
      expect(textStats.countParagraphs(undefined)).toBe(0);
    });

    test('should handle paragraphs with extra whitespace', () => {
      const text = 'Para 1.\n\n\nPara 2.\n  \n  \nPara 3.';
      expect(textStats.countParagraphs(text)).toBe(3);
    });
  });

  describe('estimateReadingTime()', () => {
    test('should estimate reading time at 225 WPM', () => {
      const text = 'word '.repeat(225); // 225 words
      expect(textStats.estimateReadingTime(text)).toBe(1.0);
    });

    test('should estimate reading time for longer text', () => {
      const text = 'word '.repeat(450); // 450 words
      expect(textStats.estimateReadingTime(text)).toBe(2.0);
    });

    test('should round to 1 decimal place', () => {
      const text = 'word '.repeat(112); // ~0.5 minutes
      expect(textStats.estimateReadingTime(text)).toBe(0.5);
    });

    test('should handle empty text', () => {
      expect(textStats.estimateReadingTime('')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.estimateReadingTime(null)).toBe(0);
      expect(textStats.estimateReadingTime(undefined)).toBe(0);
    });

    test('should use custom reading speed', () => {
      textStats.setReadingSpeed(200);
      const text = 'word '.repeat(200); // 200 words
      expect(textStats.estimateReadingTime(text)).toBe(1.0);
    });
  });

  describe('countUniqueWords()', () => {
    test('should count unique words (case-insensitive)', () => {
      expect(textStats.countUniqueWords('Hello world hello')).toBe(2);
      expect(textStats.countUniqueWords('The the THE')).toBe(1);
    });

    test('should handle punctuation', () => {
      expect(textStats.countUniqueWords('Hello, world! Hello.')).toBe(2);
    });

    test('should handle empty strings', () => {
      expect(textStats.countUniqueWords('')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.countUniqueWords(null)).toBe(0);
      expect(textStats.countUniqueWords(undefined)).toBe(0);
    });

    test('should handle contractions', () => {
      expect(textStats.countUniqueWords("don't can't don't")).toBe(2);
    });
  });

  describe('calculateAverageWordLength()', () => {
    test('should calculate average word length', () => {
      // 'cat' (3) + 'dog' (3) = 6 / 2 = 3.0
      expect(textStats.calculateAverageWordLength('cat dog')).toBe(3.0);
    });

    test('should round to 1 decimal place', () => {
      // 'I' (1) + 'am' (2) + 'here' (4) = 7 / 3 = 2.33... → 2.3
      expect(textStats.calculateAverageWordLength('I am here')).toBe(2.3);
    });

    test('should handle empty strings', () => {
      expect(textStats.calculateAverageWordLength('')).toBe(0);
    });

    test('should handle null/undefined', () => {
      expect(textStats.calculateAverageWordLength(null)).toBe(0);
      expect(textStats.calculateAverageWordLength(undefined)).toBe(0);
    });

    test('should ignore punctuation', () => {
      expect(textStats.calculateAverageWordLength('Hello, world!')).toBe(5.0);
    });
  });

  describe('analyzeText()', () => {
    test('should return complete statistics object', () => {
      const text = 'Hello world. How are you?\n\nI am fine.';
      const stats = textStats.analyzeText(text);

      expect(stats).toHaveProperty('words');
      expect(stats).toHaveProperty('characters');
      expect(stats).toHaveProperty('charactersNoSpaces');
      expect(stats).toHaveProperty('sentences');
      expect(stats).toHaveProperty('paragraphs');
      expect(stats).toHaveProperty('readingTime');
      expect(stats).toHaveProperty('uniqueWords');
      expect(stats).toHaveProperty('averageWordLength');
      expect(stats).toHaveProperty('timestamp');
    });

    test('should have correct values', () => {
      const text = 'Hello world';
      const stats = textStats.analyzeText(text);

      expect(stats.words).toBe(2);
      expect(stats.characters).toBe(11);
      expect(stats.charactersNoSpaces).toBe(10);
      expect(stats.sentences).toBe(1);
      expect(stats.paragraphs).toBe(1);
      expect(stats.uniqueWords).toBe(2);
    });

    test('should include ISO timestamp', () => {
      const stats = textStats.analyzeText('Test');
      expect(stats.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('calculateProgress()', () => {
    test('should return "none" status when no target set', () => {
      textStats.setTargetWordCount(0);
      const progress = textStats.calculateProgress(100);

      expect(progress.percentage).toBe(0);
      expect(progress.remaining).toBe(0);
      expect(progress.status).toBe('none');
    });

    test('should calculate progress correctly', () => {
      textStats.setTargetWordCount(100);
      const progress = textStats.calculateProgress(50);

      expect(progress.percentage).toBe(50);
      expect(progress.remaining).toBe(50);
      expect(progress.status).toBe('under');
    });

    test('should show "target" status when reached', () => {
      textStats.setTargetWordCount(100);
      const progress = textStats.calculateProgress(100);

      expect(progress.percentage).toBe(100);
      expect(progress.remaining).toBe(0);
      expect(progress.status).toBe('target');
    });

    test('should show "over" status when exceeded by 10%', () => {
      textStats.setTargetWordCount(100);
      const progress = textStats.calculateProgress(120);

      expect(progress.percentage).toBe(100); // Capped at 100
      expect(progress.remaining).toBe(-20);
      expect(progress.status).toBe('over');
    });
  });

  describe('Settings', () => {
    test('should enable/disable engine', () => {
      textStats.enable();
      expect(textStats.enabled).toBe(true);

      textStats.disable();
      expect(textStats.enabled).toBe(false);
    });

    test('should set reading speed', () => {
      textStats.setReadingSpeed(200);
      expect(textStats.readingSpeed).toBe(200);
    });

    test('should clamp invalid reading speeds', () => {
      textStats.setReadingSpeed(10); // Too low
      expect(textStats.readingSpeed).toBe(225); // Default

      textStats.setReadingSpeed(2000); // Too high
      expect(textStats.readingSpeed).toBe(225); // Default
    });

    test('should set target word count', () => {
      textStats.setTargetWordCount(500);
      expect(textStats.targetWordCount).toBe(500);
    });

    test('should handle negative target word count', () => {
      textStats.setTargetWordCount(-100);
      expect(textStats.targetWordCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long text', () => {
      const text = 'word '.repeat(10000); // 10,000 words
      const stats = textStats.analyzeText(text);
      expect(stats.words).toBe(10000);
      expect(stats.readingTime).toBe(44.4); // 10000 / 225 = 44.44
    });

    test('should handle text with only punctuation', () => {
      const stats = textStats.analyzeText('... !!! ???');
      expect(stats.words).toBe(0);
      expect(stats.sentences).toBeGreaterThan(0);
    });

    test('should handle text with emoji', () => {
      const stats = textStats.analyzeText('Hello 👋 world 🌍');
      expect(stats.words).toBe(2);
    });

    test('should handle text with URLs', () => {
      const stats = textStats.analyzeText('Visit https://example.com today');
      expect(stats.words).toBe(3);
    });

    test('should handle text with special characters', () => {
      const stats = textStats.analyzeText('Test @#$% test');
      expect(stats.words).toBe(2);
    });
  });
});
