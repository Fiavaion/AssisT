/**
 * @jest-environment jsdom
 *
 * The Azure Speech engine is withdrawn.
 *
 * Its engine module was removed as unreachable, yet the popup still offered "Azure Speech (Cloud)"
 * as a recognition engine and listed a stored Azure Speech key under "Your data". A student could
 * choose it, or keep a key for it, and nothing would ever use either. Web Speech dictation is the
 * engine dictation actually runs on, and it stays.
 */

import fs from 'fs';
import path from 'path';

import { toolById } from '../../../src/popup/registry/tool-registry.js';

const ROOT = path.join(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const POPUP_HTML = read('src/popup/popup.html');

describe('popup — withdrawn Azure Speech engine', () => {
  test('the recognition engine choice offers no Azure option, and keeps Web Speech', () => {
    const doc = new DOMParser().parseFromString(POPUP_HTML, 'text/html');
    const values = [...doc.querySelectorAll('#stt-engine option')].map(option => option.value);
    expect(values).not.toContain('azure');
    expect(values).toEqual(expect.arrayContaining(['auto', 'web-speech']));
  });

  test('the Flat registry offers no Azure option', () => {
    const engine = toolById('stt').controls.find(control => control.id === 'stt-engine');
    expect(engine.options.map(option => option.value)).not.toContain('azure');
  });

  test('no popup script names Azure Speech any more', () => {
    for (const file of ['src/popup/popup.js', 'src/popup/your-data.js']) {
      expect(read(file)).not.toMatch(/azure/i);
    }
  });

  test('the legacy-key sweep no longer carries an Azure Speech key forward', () => {
    const source = read('src/core/storage/secure-key-storage.js');
    const providers = source.match(/const providers = \[([^\]]*)\]/)[1];
    expect(providers).not.toMatch(/azure/);
  });

  test('stored Azure Speech keys are deleted on update', () => {
    const worker = read('src/background/service-worker.js');
    expect(worker).toMatch(/await withdrawAzureSpeech\(\)/);
    expect(worker).toMatch(/await forgetTextCustomizationSyncSwitch\(\)/);
  });
});
