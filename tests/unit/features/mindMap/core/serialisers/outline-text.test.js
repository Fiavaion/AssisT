import { fromOutlineText } from '../../../../../../src/features/mindMap/core/serialisers/outline-text.js';
import { validateMap } from '../../../../../../src/features/mindMap/core/map-model.js';
import { walk } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { idSource } from '../fixtures.js';
import { describeImportCaps } from './import-caps.js';

/** Depth and text, in outline order — all a plain text outline can carry. */
function rows(map) {
  const out = [];
  walk(map, (node, depth) => out.push([depth, node.text]));
  return out;
}

const read = (text, options = {}) => fromOutlineText(text, { ids: idSource(), ...options });

describe('fromOutlineText', () => {
  it('reads a tab-indented outline, the first line as the centre', () => {
    const map = read('Essay plan\n\tIntroduction\n\t\tHook\n\tConclusion\n');
    expect(map.title).toBe('Essay plan');
    expect(rows(map)).toEqual([
      [0, 'Essay plan'],
      [1, 'Introduction'],
      [2, 'Hook'],
      [1, 'Conclusion']
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('reads a space-indented outline the same way, whatever the step', () => {
    const two = read('Essay plan\n  Introduction\n    Hook\n  Conclusion\n');
    const four = read('Essay plan\n    Introduction\n        Hook\n    Conclusion\n');
    const tabs = read('Essay plan\n\tIntroduction\n\t\tHook\n\tConclusion\n');
    expect(rows(two)).toEqual(rows(tabs));
    expect(rows(four)).toEqual(rows(tabs));
  });

  it('strips a leading bullet of every shape a student pastes', () => {
    const map = read(
      ['Centre', '  - dash', '  * star', '  + plus', '  • bullet', '  1. number', '  2) bracket'].join(
        '\n'
      )
    );
    expect(rows(map).map(row => row[1])).toEqual([
      'Centre',
      'dash',
      'star',
      'plus',
      'bullet',
      'number',
      'bracket'
    ]);
  });

  it('ignores blank lines, whitespace-only lines and a lone bullet', () => {
    const map = read('Centre\n\n  One\n   \t \n  -\n  Two\n\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One'],
      [1, 'Two']
    ]);
  });

  it('makes the first line the centre when every line sits at the margin', () => {
    const map = read('Revision plan\nWeek one\nWeek two\n');
    expect(map.nodes[map.rootId].text).toBe('Revision plan');
    expect(rows(map)).toEqual([
      [0, 'Revision plan'],
      [1, 'Week one'],
      [1, 'Week two']
    ]);
  });

  it('accepts Windows line endings and a byte order mark', () => {
    const map = read('﻿Centre\r\n\tOne\r\n\tTwo\r\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One'],
      [1, 'Two']
    ]);
  });

  it('handles ragged indentation without throwing', () => {
    const map = read('Centre\n   One\n      Deep\n    Still deep\n  Two\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One'],
      [2, 'Deep'],
      [2, 'Still deep'],
      [1, 'Two']
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('handles tabs and spaces mixed on the same document without throwing', () => {
    const map = read('Centre\n\tOne\n        Deep\n  Two\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One'],
      [2, 'Deep'],
      [1, 'Two']
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('ignores indentation on the first line, which is the centre whatever its column', () => {
    const map = read('      Centre\n         One\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One']
    ]);
  });

  it('never lets a line climb above the centre', () => {
    const map = read('   Centre\nOne\n  Two\n');
    expect(rows(map)).toEqual([
      [0, 'Centre'],
      [1, 'One'],
      [2, 'Two']
    ]);
    expect(validateMap(map)).toEqual([]);
  });

  it('makes a one-node map from an empty or whitespace-only file', () => {
    for (const text of ['', '   \n\n\t\n']) {
      const map = read(text, { title: 'Nothing' });
      expect(map.title).toBe('Nothing');
      expect(Object.keys(map.nodes)).toHaveLength(1);
      expect(validateMap(map)).toEqual([]);
    }
  });

  it('takes its ids and its map id from the supplied source', () => {
    const map = fromOutlineText('Centre\n\tOne\n', { ids: idSource('k') });
    expect(map.id.startsWith('k')).toBe(true);
    expect(Object.keys(map.nodes).every(id => id.startsWith('k'))).toBe(true);
  });

  it('keeps an explicit id over the generated one', () => {
    expect(read('Centre\n', { id: 'fixed' }).id).toBe('fixed');
  });
});


describe('fromOutlineText, pasted by the thousand', () => {
  describeImportCaps({
    read,
    flat: count =>
      ['Centre', ...Array.from({ length: count - 1 }, (_, at) => `  line ${at}`)].join('\n'),
    nested: levels =>
      Array.from({ length: levels }, (_, at) => `${' '.repeat(at)}level ${at}`).join('\n'),
    unnamed: () => ['-', '  *', '  1.', '  - - ', '\u00a0'].join('\n')
  });
});
