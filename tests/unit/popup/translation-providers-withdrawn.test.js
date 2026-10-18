/**
 * @jest-environment jsdom
 *
 * DeepL and Microsoft (Azure) Translator are withdrawn (ADR 0006).
 *
 * The popup used to offer both as translation providers and collect an API key for each, yet no
 * code could call either service: the translation path calls MyMemory only. A student could paste
 * a paid credential into the extension and nothing would ever use it. These tests pin that no
 * surface offers them any more — neither the classic popup markup, its script, nor the registry the
 * Flat view renders from — and that the MyMemory controls a student relies on are still there.
 */

import fs from 'fs';
import path from 'path';

import { toolById } from '../../../src/popup/registry/tool-registry.js';

const POPUP_DIR = path.join(__dirname, '../../../src/popup');
const POPUP_HTML = fs.readFileSync(path.join(POPUP_DIR, 'popup.html'), 'utf8');
const POPUP_JS = fs.readFileSync(path.join(POPUP_DIR, 'popup.js'), 'utf8');

const WITHDRAWN_IDS = [
  'translation-provider',
  'deepl-key-section',
  'deepl-api-key',
  'btn-test-deepl',
  'azure-key-section',
  'azure-api-key',
  'azure-region',
  'btn-test-azure',
];

function popupDocument() {
  return new DOMParser().parseFromString(POPUP_HTML, 'text/html');
}

describe('popup — withdrawn translation providers', () => {
  test('the markup has no DeepL or Azure Translator control', () => {
    const doc = popupDocument();
    for (const id of WITHDRAWN_IDS) {
      expect(doc.getElementById(id)).toBeNull();
    }
    const section = doc.getElementById('translation-section');
    expect(section).not.toBeNull();
    expect(section.textContent).not.toMatch(/deepl|azure|translation provider/i);
    expect(section.querySelector('input[type="password"]')).toBeNull();
  });

  test('the MyMemory controls a student uses are still there', () => {
    const doc = popupDocument();
    expect(doc.getElementById('btn-translate-page')).not.toBeNull();
    expect(doc.getElementById('translation-target-language')).not.toBeNull();
  });

  test('the popup script wires nothing to them', () => {
    for (const id of WITHDRAWN_IDS) {
      expect(POPUP_JS).not.toContain(`'${id}'`);
    }
    expect(POPUP_JS).not.toMatch(/deepl|azure-translator|microsofttranslator|translationApiKeys/i);
    expect(POPUP_JS).not.toContain('updateProviderUI');
  });

  test('the Flat registry declares no provider choice, key test or DeepL keyword', () => {
    const tool = toolById('translation');
    const ids = [...tool.controls, ...tool.actions].map(item => item.id);
    for (const id of WITHDRAWN_IDS) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toEqual(
      expect.arrayContaining(['btn-translate-page', 'translation-target-language'])
    );
    expect(tool.keywords).not.toMatch(/deepl|azure/i);
  });
});
