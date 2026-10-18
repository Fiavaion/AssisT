/**
 * The debug switch has to be off in a build nobody configured, or the redaction pass that put the
 * student's words behind it achieved nothing.
 */

import {
  debugLog,
  isDebugLoggingEnabled,
  setDebugLoggingForTests,
} from '../../../src/utils/debug-log.js';

describe('debugLog', () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    setDebugLoggingForTests(false);
  });

  afterEach(() => {
    spy.mockRestore();
    setDebugLoggingForTests(false);
  });

  test('is off in a build where nobody turned debug mode on', () => {
    expect(isDebugLoggingEnabled()).toBe(false);
    debugLog('[STT] Inserted text:', 'the whole essay');
    expect(spy).not.toHaveBeenCalled();
  });

  test('prints once the student has turned debug mode on', () => {
    setDebugLoggingForTests(true);
    debugLog('[STT] Inserted text:', 'the whole essay');
    expect(spy).toHaveBeenCalledWith('[STT] Inserted text:', 'the whole essay');
  });
});
