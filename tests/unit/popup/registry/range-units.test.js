/**
 * Every slider's numbers, against the unit it claims and against the control it stands for.
 *
 * A range declares its numbers in the units the setting is STORED in, and `scale` says how many of
 * the units on screen make one of those. Get that pairing wrong and nothing throws: the popup drew
 * a Volume slider reading "1%" at the top of its travel and a "0.7%" highlight opacity, because a
 * fraction was being printed with a percent sign glued to it.
 *
 * So two rules, checked over every range in the registry rather than the ones someone remembered:
 *
 *   1. A control that says percent shows percentage points — whole ones, no more than a hundred of
 *      them. A percent slider whose entire travel is a single point is a stored fraction leaking
 *      onto the screen.
 *   2. The scaled numbers match the real slider in popup.html. Flat drives that slider by writing
 *      the scaled value into it, so a registry claiming units the real control does not have gets
 *      clamped at its max — the student's 70% silently stored as 100%.
 */

import fs from 'fs';
import path from 'path';

import { TOOLS } from '../../../../src/popup/registry/tool-registry.js';

const POPUP_HTML = path.join(__dirname, '../../../../src/popup/popup.html');
const html = fs.readFileSync(POPUP_HTML, 'utf8');

/** Every range control, labelled with the tool it belongs to. */
const ranges = TOOLS.flatMap(tool =>
  (tool.controls || [])
    .filter(control => control.type === 'range')
    .map(control => [`${tool.id} → ${control.id}`, control])
);

/** How many units on screen make one stored unit. */
const scaleOf = control =>
  typeof control.scale === 'number' && control.scale > 0 ? control.scale : 1;

/** The numbers a control puts on screen, from the ones it stores. */
const shown = control => {
  const scale = scaleOf(control);
  return { min: control.min * scale, max: control.max * scale, step: control.step * scale };
};

/**
 * One attribute of the element with this id in popup.html.
 *
 * Deliberately crude string work rather than a parser: the markup is hand-written and stable, and
 * a second HTML parser to keep correct would be worse than the thing it checks. The leading space
 * keeps `min` from matching the tail of some other attribute's name.
 *
 * @param {string} id
 * @param {string} name
 * @returns {string|null} null when there is no such element
 */
function attributeOf(id, name) {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) {
    return null;
  }
  const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
  const marker = ` ${name}="`;
  const from = tag.indexOf(marker);
  if (from === -1) {
    return null;
  }
  return tag.slice(from + marker.length, tag.indexOf('"', from + marker.length));
}

it('has sliders to check', () => {
  expect(ranges.length).toBeGreaterThan(20);
});

describe('a slider that says percent shows percentage points', () => {
  const percentages = ranges.filter(([, control]) => control.unit === '%');

  it('there are some', () => {
    expect(percentages.length).toBeGreaterThan(0);
  });

  it.each(percentages)('%s spans 0 to 100, in whole points', (_where, control) => {
    const { min, max, step } = shown(control);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(100);
    // The defect this exists to stop: a 0–1 fraction shown with a percent sign, so full volume
    // reads "1%". One percentage point of travel is never a real range.
    expect(max).toBeGreaterThan(1);
    expect(Number.isInteger(step)).toBe(true);
  });
});

describe('the scaled numbers are the real slider’s numbers', () => {
  it.each(ranges)('%s matches its control in popup.html', (_where, control) => {
    const { min, max, step } = shown(control);
    expect(attributeOf(control.id, 'min')).not.toBeNull();
    expect(Number(attributeOf(control.id, 'min'))).toBe(min);
    expect(Number(attributeOf(control.id, 'max'))).toBe(max);
    expect(Number(attributeOf(control.id, 'step'))).toBe(step);
  });
});
