/**
 * The cloud models AssisT offers, and what happens to a student whose saved setting names one that
 * has been replaced.
 *
 * Anthropic, checked 2026-10-07 on platform.claude.com/docs/en/about-claude/models/overview and
 * /model-deprecations: the current lineup is Haiku 5.5, Sonnet 5.5 and Opus 5.5 (Fable 5.1 sits
 * above Opus and is left out: the picker's top slot is Opus). Haiku 4.5 retires as soon as
 * 2026-10-15; the 3.x, Sonnet 4, Opus 4 and Opus 4.1 models are already retired.
 *
 * Google, checked the same day on ai.google.dev/gemini-api/docs/models, /deprecations and /pricing:
 * Gemini 2.5 is open only to projects that used it before, 2.0 is shut down, and Google points new
 * projects at gemini-3.8-flash and gemini-3.5-flash-lite, both stable, both with a free tier, both
 * reading images. Gemini 3.1 Pro exists only as a preview, so it is not offered.
 */

import fs from 'fs';
import path from 'path';
import {
  REGISTRY,
  getModelId,
  getFeatureDefault,
  getHardcodedFallbackModels,
  resolveModel,
} from '../../../src/ai/model-registry.js';

const ids = provider => getHardcodedFallbackModels(provider).map(m => m.id);

describe('the Anthropic lineup', () => {
  test('is Haiku 5.5, Sonnet 5.5 and Opus 5.5', () => {
    expect(ids('anthropic')).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  });

  test('defaults to Sonnet 5.5', () => {
    expect(getModelId('anthropic', REGISTRY.anthropic.defaultModel)).toBe('claude-sonnet-5-5');
  });

  // The picker shows only the name, so the price warning has to be in it.
  test('names Opus with its cost, so a student on their own key is not surprised', () => {
    const opus = getHardcodedFallbackModels('anthropic').find(m => m.id === 'claude-opus-5-5');
    expect(opus.name).toMatch(/cost/i);
  });
});

describe('the Gemini lineup', () => {
  test('is the two stable models Google recommends for new projects', () => {
    expect(ids('google')).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });

  test('defaults to Gemini 3.8 Flash', () => {
    expect(getModelId('google', REGISTRY.google.defaultModel)).toBe('gemini-3.8-flash');
  });
});

describe('every feature default is a model on offer', () => {
  test.each(['anthropic', 'google'])('%s', provider => {
    const offered = ids(provider);
    for (const feature of Object.keys(REGISTRY[provider].featureDefaults)) {
      expect(offered).toContain(getModelId(provider, getFeatureDefault(provider, feature)));
    }
  });
});

/**
 * A saved model that is no longer offered resolves to its replacement whenever it is read, so no
 * student is left sending requests to a model that has gone or is about to.
 */
describe('a saved model that has been replaced', () => {
  test.each([
    ['haiku-4.5', 'claude-haiku-5-5'],
    ['claude-haiku-4-5-20251001', 'claude-haiku-5-5'],
    ['claude-haiku-4-5', 'claude-haiku-5-5'],
    ['claude-3-5-haiku-20241022', 'claude-haiku-5-5'],
    ['claude-3-haiku-20240307', 'claude-haiku-5-5'],
    ['sonnet-4.6', 'claude-sonnet-5-5'],
    ['sonnet-4.5', 'claude-sonnet-5-5'],
    ['claude-sonnet-4-6', 'claude-sonnet-5-5'],
    ['claude-sonnet-4-5-20250929', 'claude-sonnet-5-5'],
    ['claude-sonnet-4-5', 'claude-sonnet-5-5'],
    ['claude-sonnet-4-20250514', 'claude-sonnet-5-5'],
    ['claude-3-7-sonnet-20250219', 'claude-sonnet-5-5'],
    ['claude-3-5-sonnet-20241022', 'claude-sonnet-5-5'],
    ['opus-4.7', 'claude-opus-5-5'],
    ['opus-4.6', 'claude-opus-5-5'],
    ['claude-opus-4-7', 'claude-opus-5-5'],
    ['claude-opus-4-6', 'claude-opus-5-5'],
    ['claude-opus-4-1-20250805', 'claude-opus-5-5'],
    ['claude-opus-4-20250514', 'claude-opus-5-5'],
    ['claude-3-opus-20240229', 'claude-opus-5-5'],
  ])('Anthropic %s becomes %s', (saved, current) => {
    expect(resolveModel('anthropic', saved)).toBe(current);
  });

  test.each([
    ['gemini-2.5-flash', 'gemini-3.8-flash'],
    ['gemini-2.5-pro', 'gemini-3.8-flash'],
    ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'],
    ['gemini-2.0-flash', 'gemini-3.8-flash'],
    ['gemini-2.0-flash-lite', 'gemini-3.5-flash-lite'],
    ['gemini-1.5-flash', 'gemini-3.8-flash'],
    ['gemini-1.5-pro', 'gemini-3.8-flash'],
  ])('Gemini %s becomes %s', (saved, current) => {
    expect(resolveModel('google', saved)).toBe(current);
  });

  test('a current model, by key or by id, is left alone', () => {
    expect(resolveModel('anthropic', 'sonnet-5.5')).toBe('claude-sonnet-5-5');
    expect(resolveModel('anthropic', 'claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(resolveModel('google', 'gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
  });

  test('an id the registry has never heard of passes through', () => {
    expect(resolveModel('anthropic', 'claude-fable-5-1')).toBe('claude-fable-5-1');
    expect(resolveModel('openai', 'gpt-4o')).toBe('gpt-4o');
  });
});

/** The old ids live in the registry's replacement table and nowhere else in the source. */
describe('no replaced model is named outside the registry', () => {
  const RETIRED =
    /claude-haiku-4-5|claude-sonnet-4-6|claude-opus-4-[67]|gemini-2\.[05]|gemini-1\.5|'(?:haiku-4\.5|sonnet-4\.6|opus-4\.[67])'/;

  function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(full);
      }
      return /\.(js|html)$/.test(entry.name) ? [full] : [];
    });
  }

  test('src/ holds no replaced model id', () => {
    const srcDir = path.join(__dirname, '../../../src');
    const registry = path.join(srcDir, 'ai', 'model-registry.js');
    const offenders = sourceFiles(srcDir)
      .filter(file => file !== registry)
      .filter(file => RETIRED.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(srcDir, file));
    expect(offenders).toEqual([]);
  });
});
