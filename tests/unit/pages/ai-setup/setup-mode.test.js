import { resolveAiMode, UNCONFIRMED_MODE } from '../../../../src/pages/ai-setup/setup-mode.js';

describe('resolveAiMode', () => {
  it('resolves to off when nothing has been chosen at all', () => {
    expect(resolveAiMode({ selectedMode: null, modeConfirmed: false })).toBe('off');
  });

  it('resolves to off when only the recommendation pre-selected a mode', () => {
    // initRecommend() pre-selects the recommended mode for the Configure panel. Skipping from
    // there must not leave AI switched on with an unconfigured provider.
    expect(resolveAiMode({ selectedMode: 'cloud', modeConfirmed: false })).toBe('off');
  });

  it('keeps a mode the student explicitly committed to', () => {
    expect(resolveAiMode({ selectedMode: 'cloud', modeConfirmed: true })).toBe('cloud');
    expect(resolveAiMode({ selectedMode: 'local', modeConfirmed: true })).toBe('local');
    expect(resolveAiMode({ selectedMode: 'webllm', modeConfirmed: true })).toBe('webllm');
  });

  it('keeps an explicit choice of off', () => {
    expect(resolveAiMode({ selectedMode: 'off', modeConfirmed: true })).toBe('off');
  });

  it('falls back to off if a confirmation ever arrives without a mode', () => {
    expect(resolveAiMode({ selectedMode: '', modeConfirmed: true })).toBe('off');
    expect(resolveAiMode({ selectedMode: null, modeConfirmed: true })).toBe('off');
  });

  it('resolves to off when called with no state at all', () => {
    expect(resolveAiMode()).toBe(UNCONFIRMED_MODE);
    expect(UNCONFIRMED_MODE).toBe('off');
  });
});
