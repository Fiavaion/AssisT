/**
 * The Reading section's own facts.
 *
 * Drift against popup.html is covered generically for every declared section in
 * `section-drift.test.js`. What is left here is what only this section knows: which supports it
 * holds, how the two TTS sub-options relate to Read Aloud, and the default each popup.js handler
 * actually applies.
 */

import { toolsBySection } from '../../../../src/popup/registry/tool-registry.js';

describe('registry — Reading section', () => {
  const tools = toolsBySection('reading');

  it('holds the seven Reading supports', () => {
    expect(tools.map(tool => tool.id)).toEqual([
      'tts',
      'highlight',
      'word-by-word',
      'reading-mode',
      'dyslexia-mode',
      'ocr',
      'maths',
    ]);
  });

  it('marks the two TTS sub-options as depending on Read Aloud', () => {
    // Both are stored under `tts.*` and do nothing with Read Aloud switched off. They are rows of
    // their own in a flat list, which is presentation — the dependency keeps the data honest.
    expect(tools.find(tool => tool.id === 'highlight').dependsOn).toBe('tts');
    expect(tools.find(tool => tool.id === 'word-by-word').dependsOn).toBe('tts');
  });

  it('carries the default each popup.js handler actually applies', () => {
    // Read off the live handlers, not the prototype's mock data — two of these are on by default
    // and a registry that said otherwise would show the switch in the wrong position.
    const defaults = Object.fromEntries(tools.map(tool => [tool.id, tool.state.default]));
    expect(defaults).toEqual({
      tts: false, // popup.js: `this.settings?.tts?.enabled || false`
      highlight: true, // popup.js: `this.settings?.tts?.highlightEnabled ?? true`
      'word-by-word': false, // popup.js: `this.settings?.tts?.wordByWordEnabled || false`
      'reading-mode': false, // popup.js: `this.settings.readingMode.enabled || false`
      'dyslexia-mode': false, // popup.js: `this.settings.dyslexiaMode.enabled || false`
      ocr: true, // popup.js: `this.settings.ocr.enabled !== false`
      maths: false, // popup.js: seeded `{ enabled: false, ... }`
    });
  });

  it('lists the dyslexia variants with syllable first and bionic last', () => {
    // Deliberate ordering: syllable is the default variant, bionic is listed last because the
    // evidence for it is negative (2026-07-02 decision).
    const variants = tools
      .find(tool => tool.id === 'dyslexia-mode')
      .controls.filter(control => control.group === 'dyslexia-variant')
      .map(control => control.id);
    expect(variants).toEqual(['dyslexia-syllable', 'dyslexia-grammar', 'dyslexia-bionic']);
  });
});
