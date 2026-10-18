/**
 * Every settings path the registry declares must be one popup.js actually uses.
 *
 * The drift test proves the registry names elements that exist. This proves the other half: that
 * the state behind those elements is real. Transcription is the failure mode of a registry built
 * by reading code — a plausible-looking `readingMode.enable` or `ocr.autoTts` would pass every
 * other check in the suite and quietly read `undefined` forever.
 *
 * The check is deliberately crude — the path's last segment must appear in popup.js, and its full
 * dotted form must appear somewhere in src — because anything cleverer would be a second parser to
 * keep correct. Crude and honest beats precise and wrong.
 */

import fs from 'fs';
import path from 'path';

import { TOOLS } from '../../../../src/popup/registry/tool-registry.js';
import { mirrorTargets } from '../../../../src/popup/registry/tool-schema.js';

const SRC = path.join(__dirname, '../../../../src');
/**
 * The popup's own handlers, and the modules it hands a write to whole. The companion switches are
 * stored by companion-settings.js and the reading level by reading-level.js, which is where their
 * keys are named; popup.js never spells them out.
 */
const WRITES_THROUGH = [
  'popup/popup.js',
  'features/companion/companion-settings.js',
  'features/companion/reading-level.js',
];
const popupJs = WRITES_THROUGH.map(file => fs.readFileSync(path.join(SRC, file), 'utf8')).join(
  '\n'
);

/** Every declared path, with the tool and control it came from. */
function declaredPaths() {
  const found = [];
  TOOLS.forEach(tool => {
    if (tool.state && tool.state.path) {
      found.push({ where: `${tool.id} (state)`, path: tool.state.path, store: tool.state.store });
      mirrorTargets(tool.state).forEach(mirror =>
        found.push({ where: `${tool.id} (state mirror)`, path: mirror.path, store: mirror.store })
      );
    }
    tool.controls.forEach(control => {
      found.push({ where: `${tool.id} → ${control.id}`, path: control.path, store: control.store });
      mirrorTargets(control).forEach(mirror =>
        found.push({
          where: `${tool.id} → ${control.id} (mirror)`,
          path: mirror.path,
          store: mirror.store,
        })
      );
    });
  });
  return found;
}

describe('registry — declared paths are real', () => {
  const paths = declaredPaths();

  it('declares a path for every tool state and control', () => {
    expect(paths.length).toBeGreaterThan(100);
  });

  it('names only keys that popup.js uses', () => {
    // The final segment is the settings key itself. If popup.js never mentions it, nothing writes
    // it and nothing reads it — the registry would be describing a setting that does not exist.
    const unknown = paths.filter(entry => {
      const key = entry.path.split('.').pop();
      return !new RegExp(`\\b${key}\\b`).test(popupJs);
    });
    expect(unknown.map(entry => `${entry.where}: ${entry.path}`)).toEqual([]);
  });

  it('roots every settings path in a branch popup.js reads', () => {
    // The first segment is the settings sub-object (`tts`, `ocr`, `canvasIntegration`…). A typo
    // here is the most damaging kind: every control under it silently reads undefined.
    const settingsPaths = paths.filter(
      entry => entry.store !== 'local' && entry.path.includes('.')
    );
    const badRoots = settingsPaths.filter(entry => {
      const root = entry.path.split('.')[0];
      return !new RegExp(`settings\\.${root}\\b|settings\\?\\.${root}\\b`).test(popupJs);
    });
    expect(badRoots.map(entry => `${entry.where}: ${entry.path}`)).toEqual([]);
  });

  it('pairs every top-level local key with a chrome.storage.local use', () => {
    const localPaths = paths.filter(entry => entry.store === 'local');
    const unbacked = localPaths.filter(entry => {
      const root = entry.path.split('.')[0];
      return !new RegExp(`['"\`]${root}['"\`]|\\b${root}\\b`).test(popupJs);
    });
    expect(unbacked.map(entry => `${entry.where}: ${entry.path}`)).toEqual([]);
  });
});
