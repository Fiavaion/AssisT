/**
 * What `toFreeMind`, `toOPML` and `toSVG` write is XML, and whatever opens it (FreeMind,
 * Freeplane, XMind, Coggle, an outliner, the browser drawing the picture for a PNG) reads it with a
 * conformant parser that rejects the whole file on one forbidden character. `core/` may not use a
 * DOM, but this suite runs in jsdom, so the output is put through a real parser here rather than
 * judged by the scanner that shares its author's assumptions.
 *
 * jsdom's parser is more forgiving than a browser's about the characters XML 1.0 forbids, so every
 * output is also checked against the Char production directly.
 *
 * The maps are generated from a seed, so a failure names the seed and can be replayed.
 */

import {
  fromFreeMind,
  toFreeMind,
} from '../../../../../../src/features/mindMap/core/serialisers/freemind.js';
import {
  createMap,
  createNode,
  validateMap,
} from '../../../../../../src/features/mindMap/core/map-model.js';
import { addChild, addLink, walk } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { layoutMap } from '../../../../../../src/features/mindMap/core/layout.js';
import { fromOPML, toOPML } from '../../../../../../src/features/mindMap/core/serialisers/opml.js';
import { toSVG } from '../../../../../../src/features/mindMap/core/serialisers/svg.js';
import { idSource, seededRandom } from '../fixtures.js';

const parseError = xml => {
  const found = new DOMParser()
    .parseFromString(xml, 'application/xml')
    .getElementsByTagName('parsererror');
  return found.length === 0 ? null : found[0].textContent;
};

/**
 * XML 1.0's Char production: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF].
 * Iterating a string by code point yields a lone surrogate as itself, so one is caught here too.
 *
 * @returns {string[]} the code points the document may not contain, as U+XXXX.
 */
const forbiddenIn = xml =>
  Array.from(xml)
    .map(character => character.codePointAt(0))
    .filter(
      code =>
        !(
          code === 0x9 ||
          code === 0xa ||
          code === 0xd ||
          (code >= 0x20 && code <= 0xd7ff) ||
          (code >= 0xe000 && code <= 0xfffd) ||
          code >= 0x10000
        )
    )
    .map(code => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`);

/** Every XML document a map can be written as, by the name of what wrote it. */
const writers = {
  toFreeMind,
  toOPML,
  'toSVG (map)': map => toSVG(map, layoutMap(map, { mode: 'map' })),
  'toSVG (tree, dark)': map => toSVG(map, layoutMap(map, { mode: 'tree' }), { theme: 'dark' }),
};

/** @returns {Array} every fault found, each naming its writer; empty when all the output is sound. */
const faultsIn = map =>
  Object.entries(writers).flatMap(([name, write]) => {
    const xml = write(map);
    return [
      ...[parseError(xml)].filter(Boolean).map(error => [name, error]),
      ...forbiddenIn(xml).map(code => [name, code]),
    ];
  });

/** Text a student could plausibly paste, and text only an attacker would. */
const HOSTILE = [
  'soft\u000bbreak from a word processor',
  'form\u000cfeed',
  'nul\u0000 and \u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008 and \u000e\u001f',
  'lone high \ud83d surrogate',
  'lone low \udca1 surrogate',
  'reversed \udca1\ud83d pair',
  'non-characters \ufffe \uffff',
  ']]> ends a CDATA section',
  '<![CDATA[ opens one',
  '<script>alert(1)</script>',
  '<!-- comment --> <?pi?> <!DOCTYPE x [<!ENTITY a "b">]>',
  '"double" and \'single\' quotes',
  '&amp; already escaped, &#0; spelled out, &lol9; undefined',
  'astral \u{1f4a1}\u{1f9e0}\u{10ffff}',
  'right-to-left \u200f\u202e\u05e9\u05dc\u05d5\u05dd\u202c mark',
  'tab\there',
  'carriage\rreturn',
  'trailing backslash \\',
  'del \u007f and c1 \u0085\u009f',
  'line\u2028separator\u2029paragraph',
  '\u00a0non-breaking\u00a0',
  'plain words',
  '',
];

const SYMBOLS = [
  '\u2b50',
  '\u2757',
  '\u2753',
  '\u{1f4a1}',
  '\u26a0\ufe0f',
  '\u{1f511}',
  '\u270d\ufe0f',
  '\u{1f517}',
];

const HOSTILE_SYMBOLS = ['constructor', '\u0000', '\ud83d', '<icon/>', '"', '\u{1f389}'];

const LINKS = [
  'https://example.org/a?b=1&c=<2>',
  'http://a b/c',
  'mailto:tutor@example.ac.uk',
  'https://example.org/\u000b\u0001"quoted"',
  'HTTPS://EXAMPLE.ORG/\u{1f4a1}',
  'javascript:alert(1)',
  'java\tscript:alert(1)',
  'file:///C:/secret.txt',
  'data:text/html,<script>',
  '  https://example.org/padded  ',
];

/** What XML 1.0 cannot carry, stated independently of the implementation under test. */
const carried = value =>
  Array.from(value)
    .filter(character => {
      const code = character.codePointAt(0);
      if (code === 0x9 || code === 0xa || code === 0xd) {
        return true;
      }
      return (
        code >= 0x20 && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff
      );
    })
    .join('');

/** A note is written one paragraph per line, and a paragraph does not keep its outer spaces. */
const noteCarried = notes => {
  const lines = carried(notes)
    .split('\n')
    .map(line => line.trim());
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
};

const linkCarried = url => {
  const allowed = /^(?:https?|mailto):/i.test(url.replace(/[\u0000-\u0020\u007f]/g, ''));
  return allowed ? carried(url).trim() : null;
};

function hostileMap(seed) {
  const random = seededRandom(seed);
  const pick = list => list[Math.floor(random() * list.length)];
  const phrase = () => `${pick(HOSTILE)} ${pick(HOSTILE)}`;
  const ids = idSource();
  const rootId = ids();
  let map = createMap({ id: `hostile-${seed}`, title: phrase(), rootId, rootText: phrase() });
  const pool = [rootId];
  const size = 4 + Math.floor(random() * 12);
  for (let at = 1; at < size; at += 1) {
    const id = ids();
    map = addChild(map, {
      parentId: pick(pool),
      node: createNode({
        id,
        text: phrase(),
        notes: random() < 0.6 ? `${phrase()}\n${phrase()}\n\n${phrase()}` : '',
        collapsed: random() < 0.3,
        colour: random() < 0.5 ? Math.floor(random() * 8) : null,
        symbol: random() < 0.5 ? pick(SYMBOLS) : random() < 0.5 ? pick(HOSTILE_SYMBOLS) : null,
        done: random() < 0.3,
        source: random() < 0.6 ? { url: pick(LINKS), quote: '', title: '' } : null,
      }),
    });
    pool.push(id);
  }
  for (let at = 0; at < 3; at += 1) {
    const from = pick(pool);
    const to = pick(pool);
    if (from !== to && !map.links.some(link => link.id === `${from}->${to}`)) {
      map = addLink(map, { from, to });
    }
  }
  return map;
}

/**
 * A name that is blank once the file has carried it comes back as the importers' placeholder, and
 * a blank centre as the name the import was given, which here is the default.
 */
const nameCarried = (text, depth) =>
  carried(text).trim() !== '' ? carried(text) : depth === 0 ? 'Imported map' : '(untitled)';

/** Every field ADR 0003 says survives `.mm`, as the file can carry it. */
function expected(map) {
  const rows = [];
  const position = {};
  walk(map, (node, depth) => {
    position[node.id] = rows.length;
    rows.push({
      depth,
      text: nameCarried(node.text, depth),
      notes: noteCarried(node.notes),
      // The centre always draws with a colour, so an importer gives it the first when none is set.
      colour: node.colour,
      symbol: SYMBOLS.includes(node.symbol) ? node.symbol : null,
      done: node.done,
      collapsed: node.collapsed,
      url: node.source ? linkCarried(node.source.url) : null,
    });
  });
  return {
    rows,
    links: map.links.map(link => [position[link.from], position[link.to]]).sort(),
  };
}

function actual(map) {
  const rows = [];
  const position = {};
  walk(map, (node, depth) => {
    position[node.id] = rows.length;
    rows.push({
      depth,
      text: node.text,
      notes: node.notes,
      colour: node.colour,
      symbol: node.symbol,
      done: node.done,
      collapsed: node.collapsed,
      url: node.source ? node.source.url : null,
    });
  });
  return {
    rows,
    links: map.links.map(link => [position[link.from], position[link.to]]).sort(),
  };
}

const SEEDS = Array.from({ length: 300 }, (_unused, at) => 7000 + at);

describe('every XML writer writes what a conformant parser accepts', () => {
  it('for the soft line break a paste from a word processor carries', () => {
    const map = createMap({ id: 'm', title: 'T', rootId: 'r', rootText: 'one\u000btwo' });
    const xml = toFreeMind(map);
    expect(parseError(xml)).toBeNull();
    expect(fromFreeMind(xml, { ids: idSource() }).nodes.n1.text).toBe('onetwo');
  });

  it('for a map whose title carries that soft line break, which is the picture a PNG is drawn from', () => {
    const map = createMap({ id: 'm', title: 'Week\u000b4', rootId: 'r', rootText: 'Week\u000b4' });
    const svg = toSVG(map, layoutMap(map));
    expect(forbiddenIn(svg)).toEqual([]);
    expect(svg).toContain('>Week4</title>');
    expect(svg).toContain('>Week 4</tspan>');
    expect(faultsIn(map)).toEqual([]);
  });

  it('and the check itself sees a forbidden character and a lone surrogate', () => {
    expect(forbiddenIn('a\u000bb\ud83dc\ufffed\u{1f4a1}\te')).toEqual([
      'U+000B',
      'U+D83D',
      'U+FFFE',
    ]);
  });

  it('for every hostile string, in a label, a note and a link', () => {
    for (const value of HOSTILE) {
      let map = createMap({ id: 'm', title: value, rootId: 'r', rootText: value });
      map = addChild(map, {
        parentId: 'r',
        node: createNode({
          id: 'c',
          text: value,
          notes: value,
          source: { url: `https://example.org/${value}`, quote: value, title: value },
        }),
      });
      expect([value, faultsIn(map)]).toEqual([value, []]);
    }
  });

  it('for three hundred generated maps, which then read back with every surviving field intact', () => {
    for (const seed of SEEDS) {
      const map = hostileMap(seed);
      expect([seed, faultsIn(map)]).toEqual([seed, []]);

      const back = fromFreeMind(toFreeMind(map), { ids: idSource('r') });
      expect(validateMap(back)).toEqual([]);
      expect(() => structuredClone(back)).not.toThrow();
      expect([seed, actual(back)]).toEqual([seed, expected(map)]);
    }
  });

  it('and no importer hands back a node without a name from any of them', () => {
    const blank = map => Object.values(map.nodes).filter(node => node.text.trim() === '');
    for (const seed of SEEDS) {
      const map = hostileMap(seed);
      expect([seed, blank(fromFreeMind(toFreeMind(map), { ids: idSource('r') }))]).toEqual([
        seed,
        [],
      ]);
      expect([seed, blank(fromOPML(toOPML(map), { ids: idSource('r') }))]).toEqual([seed, []]);
    }
  });

  it('and the real parser reads the same labels out of the file as the importer does', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const xml = toFreeMind(hostileMap(seed));
      const parsed = new DOMParser().parseFromString(xml, 'application/xml');
      const labels = Array.from(parsed.getElementsByTagName('node'), node =>
        node.getAttribute('TEXT')
      );
      const back = fromFreeMind(xml, { ids: idSource('r') });
      const read = [];
      walk(back, node => read.push(node.text));
      expect([seed, read]).toEqual([seed, labels.map((label, at) => nameCarried(label, at))]);
    }
  });
});
