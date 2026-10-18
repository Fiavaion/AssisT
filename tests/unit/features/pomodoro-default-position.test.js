/**
 * The pomodoro timer positions itself, so it sits outside the shared corner rails - but its
 * default corner still has to be one the rails leave free, and three places have to agree on
 * what that corner is. They did not: the widget defaulted to bottom-left (on top of the maths
 * rail) while the popup's fallback and its selected option said bottom-right (under the
 * companion cards). This holds all three to one answer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SLOTS } from '../../../src/utils/corner-slots.js';
import { PRODUCTIVITY_TOOLS } from '../../../src/popup/registry/tools/productivity.js';

const DEFAULT_CORNER = 'top-right';
const root = join(__dirname, '..', '..', '..');
const read = relative => readFileSync(join(root, relative), 'utf8');

test('the corner the timer defaults to is one no rail uses', () => {
  const railCorners = new Set(Object.values(SLOTS).map(slot => slot.corner));
  expect(railCorners.has(DEFAULT_CORNER)).toBe(false);
});

test('the feature module defaults to that corner', () => {
  const source = read('src/features/pomodoro/pomodoro.js');
  const declared = [...source.matchAll(/^\s*position: '([a-z-]+)',$/gm)].map(m => m[1]);
  expect(declared.length).toBeGreaterThan(0);
  expect(new Set(declared)).toEqual(new Set([DEFAULT_CORNER]));
});

test('the popup registry and the popup fallback declare the same corner', () => {
  const pomodoro = PRODUCTIVITY_TOOLS.find(tool => tool.id === 'pomodoro');
  const positionControl = pomodoro.controls.find(c => c.id === 'pomodoro-position');
  expect(positionControl.default).toBe(DEFAULT_CORNER);
  expect(positionControl.options.map(o => o.value)).toContain(DEFAULT_CORNER);

  expect(read('src/popup/popup.js')).toContain(
    `positionSelect.value = this.settings.pomodoro.position || '${DEFAULT_CORNER}';`
  );
});

test('the popup preselects that corner, so an untouched menu matches the widget', () => {
  const html = read('src/popup/popup.html');
  const select = html.slice(html.indexOf('id="pomodoro-position"'));
  const selected = select.slice(0, select.indexOf('</select>')).match(/value="([a-z-]+)" selected/);
  expect(selected[1]).toBe(DEFAULT_CORNER);
});
