/**
 * @jest-environment jsdom
 *
 * A failed dictionary lookup has two genuinely different causes, and telling them apart is the
 * point of this code path. During an api.dictionaryapi.dev outage the modal reported every
 * failure as "Word Not Found" with the raw text "signal timed out" — telling a student their
 * correctly-spelled word did not exist. These tests lock the distinction so it cannot come back.
 */

import { describeDictionaryFailure } from '../../../src/features/dictionary/dictionary.js';

const timeout = () => {
  const err = new Error('signal timed out');
  err.kind = 'unreachable';
  return err;
};

const missing = () => {
  const err = new Error('No definition found for "asdfgh"');
  err.kind = 'not-found';
  return err;
};

describe('describeDictionaryFailure', () => {
  describe('when the service could not be reached', () => {
    it('does not claim the word was not found', () => {
      const { heading, unreachable, kind } = describeDictionaryFailure('signal', timeout());

      expect(kind).toBe('unreachable');
      expect(unreachable).toBe(true);
      expect(heading).toBe('Dictionary Unavailable');
      expect(heading).not.toMatch(/not found/i);
    });

    it('tells the student explicitly that their spelling was not the problem', () => {
      const { body } = describeDictionaryFailure('signal', timeout());

      expect(body).toMatch(/nothing to do with how you spelled/i);
      expect(body).toContain('signal');
    });

    it('never surfaces the raw technical message to the student', () => {
      const { body, detail } = describeDictionaryFailure('signal', timeout());

      expect(body).not.toMatch(/signal timed out/);
      expect(detail).toBe('signal timed out'); // kept for the console only
    });
  });

  describe('when the word genuinely has no entry', () => {
    it('says so, and suggests checking the spelling', () => {
      const { kind, unreachable, heading, body } = describeDictionaryFailure('asdfgh', missing());

      expect(kind).toBe('not-found');
      expect(unreachable).toBe(false);
      expect(heading).toBe('Word Not Found');
      expect(body).toMatch(/check the spelling/i);
    });
  });

  describe('failing safely', () => {
    it('treats an unclassified error as unreachable, not as a missing word', () => {
      // Failing towards "our fault" is the deliberate choice: a wrong "not found" damages
      // confidence, a wrong "unavailable" only costs a retry.
      const { kind } = describeDictionaryFailure('signal', new Error('Failed to fetch'));

      expect(kind).toBe('unreachable');
    });

    it('handles a bare string error', () => {
      const { kind, detail } = describeDictionaryFailure('signal', 'boom');

      expect(kind).toBe('unreachable');
      expect(detail).toBe('boom');
    });

    it('handles a missing error object without throwing', () => {
      expect(() => describeDictionaryFailure('signal', undefined)).not.toThrow();
      expect(describeDictionaryFailure('signal', undefined).detail).toBe('unknown error');
    });

    it('neutralises markup in the looked-up word', () => {
      const { body } = describeDictionaryFailure('<img src=x onerror=alert(1)>', timeout());

      expect(body).not.toMatch(/<img/i);
      expect(body).not.toMatch(/onerror/i);
    });
  });
});
