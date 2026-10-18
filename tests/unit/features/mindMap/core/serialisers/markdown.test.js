import { fromMarkdown, toMarkdown } from '../../../../../../src/features/mindMap/core/serialisers/markdown.js';
import { validateMap } from '../../../../../../src/features/mindMap/core/map-model.js';
import { setDone, walk } from '../../../../../../src/features/mindMap/core/map-ops.js';
import { buildMap, idSource, randomMap, sampleMap } from '../fixtures.js';
import { describeImportCaps } from './import-caps.js';

/** The shape a lossless markdown round-trip must preserve: text, notes, structure, source URL. */
function outline(map) {
  const rows = [];
  walk(map, (node, depth) => {
    rows.push({
      depth,
      text: node.text,
      notes: node.notes,
      url: node.source ? node.source.url : null
    });
  });
  return { title: map.title, source: map.source ? map.source.url : null, rows };
}

const roundTrip = map => fromMarkdown(toMarkdown(map), { ids: idSource('r') });

describe('toMarkdown', () => {
  it('writes the title as a heading and the tree as nested bullets', () => {
    expect(toMarkdown(sampleMap())).toBe(
      [
        '# Map',
        '',
        '- Root',
        '  - Alpha',
        '    - Alpha one',
        '    - Alpha two',
        '  - Beta',
        '    - Beta one',
        ''
      ].join('\n')
    );
  });

  it('writes notes as quoted lines under their bullet, one per line', () => {
    const map = buildMap({ text: 'Root', children: [{ text: 'Child', notes: 'first\nsecond' }] });
    expect(toMarkdown(map)).toContain('  - Child\n    > first\n    > second\n');
  });

  it('writes a node source as a trailing src link', () => {
    const map = buildMap({
      text: 'Root',
      children: [{ text: 'Quoted', source: { url: 'https://example.org/a', quote: 'q', title: 't' } }]
    });
    expect(toMarkdown(map)).toContain('- Quoted [src](https://example.org/a)');
  });

  it('folds a node whose text spans lines onto one bullet', () => {
    // A bullet is a line. Text carrying a newline would otherwise write a second, unindented line
    // that reads back as prose between the bullets, losing the node's words.
    const map = buildMap({ text: 'Root', children: [{ text: 'First line\n\n  second line' }] });

    expect(toMarkdown(map)).toContain('  - First line second line\n');
  });

  it('writes the map source under the heading', () => {
    const map = { ...sampleMap(), source: { url: 'https://example.org/page', title: 'Page' } };
    expect(toMarkdown(map).split('\n')[1]).toBe('[src](https://example.org/page)');
  });
});

describe('fromMarkdown', () => {
  it('reads a heading and bullets back into a map', () => {
    const map = fromMarkdown('# Essay\n\n- Root\n  - One\n  - Two\n', { ids: idSource() });
    expect(map.title).toBe('Essay');
    expect(map.nodes[map.rootId].text).toBe('Root');
    expect(map.nodes[map.rootId].children).toHaveLength(2);
    expect(validateMap(map)).toEqual([]);
  });

  it('accepts tabs, four spaces, asterisks and Windows line endings', () => {
    const tabs = fromMarkdown('# T\r\n\r\n* Root\r\n\t* One\r\n\t\t* Deep\r\n', { ids: idSource() });
    const spaces = fromMarkdown('# T\n\n- Root\n    - One\n        - Deep\n', { ids: idSource() });
    expect(outline(tabs).rows).toEqual(outline(spaces).rows);
    expect(outline(tabs).rows.map(row => row.depth)).toEqual([0, 1, 2]);
  });

  it('accepts an inconsistent indent step', () => {
    const map = fromMarkdown('# T\n\n- Root\n   - One\n      - Deep\n   - Two\n', { ids: idSource() });
    expect(outline(map).rows.map(row => [row.depth, row.text])).toEqual([
      [0, 'Root'],
      [1, 'One'],
      [2, 'Deep'],
      [1, 'Two']
    ]);
  });

  it('makes a root from the title when the file has several top-level bullets', () => {
    const map = fromMarkdown('# Revision\n\n- One\n- Two\n', { ids: idSource() });
    expect(map.nodes[map.rootId].text).toBe('Revision');
    expect(map.nodes[map.rootId].children).toHaveLength(2);
    expect(validateMap(map)).toEqual([]);
  });

  it('makes a one-node map from an empty document', () => {
    const map = fromMarkdown('', { title: 'Nothing', ids: idSource() });
    expect(map.title).toBe('Nothing');
    expect(Object.keys(map.nodes)).toHaveLength(1);
    expect(validateMap(map)).toEqual([]);
  });

  it('falls back to the supplied title when the file has no heading', () => {
    const map = fromMarkdown('- Root\n  - One\n', { title: 'Given', ids: idSource() });
    expect(map.title).toBe('Given');
    expect(map.nodes[map.rootId].text).toBe('Root');
  });

  it('ignores blank lines and text that is not a bullet', () => {
    const map = fromMarkdown('# T\n\nsome prose\n\n- Root\n\n  - One\n\nmore prose\n', { ids: idSource() });
    expect(outline(map).rows.map(row => row.text)).toEqual(['Root', 'One']);
  });

  it('takes its ids and its map id from the supplied source', () => {
    const map = fromMarkdown('# T\n\n- Root\n  - One\n', { ids: idSource('k') });
    expect(map.id.startsWith('k')).toBe(true);
    expect(Object.keys(map.nodes).every(id => id.startsWith('k'))).toBe(true);
  });

  it('keeps an explicit id over the generated one', () => {
    expect(fromMarkdown('- Root\n', { id: 'fixed', ids: idSource() }).id).toBe('fixed');
  });
});

describe('markdown round trip', () => {
  it('preserves text, notes, structure and source urls', () => {
    const map = {
      ...buildMap({
        text: 'Root',
        children: [
          { text: 'Alpha', notes: 'why it matters\nand a second line', children: [{ text: 'Deep' }] },
          { text: 'Beta', source: { url: 'https://example.org/b', quote: '', title: '' } }
        ]
      }),
      source: { url: 'https://example.org/start', title: 'Start' }
    };
    expect(outline(roundTrip(map))).toEqual(outline(map));
  });

  it('preserves generated maps', () => {
    for (const seed of [11, 12, 13, 14]) {
      const map = randomMap(seed, { nodes: 18 });
      expect(outline(roundTrip(map))).toEqual(outline(map));
    }
  });

  it('keeps the words of a node whose text spans lines', () => {
    const map = buildMap({ text: 'Root', children: [{ text: 'First line\nsecond line' }] });

    expect(outline(roundTrip(map)).rows[1].text).toBe('First line second line');
  });

  it('survives a second pass unchanged', () => {
    const map = randomMap(21, { nodes: 12 });
    const once = toMarkdown(roundTrip(map));
    expect(toMarkdown(roundTrip(fromMarkdown(once, { ids: idSource('s') })))).toBe(once);
  });
});

describe('markdown task lists', () => {
  const done = (map, text) =>
    setDone(map, { id: Object.keys(map.nodes).find(id => map.nodes[id].text === text), done: true });

  const doneRows = map => {
    const out = [];
    walk(map, node => out.push([node.text, node.done]));
    return out;
  };

  it('writes a done node as a ticked task list item', () => {
    const map = done(buildMap({ text: 'Root', children: [{ text: 'Write it' }] }), 'Write it');
    expect(toMarkdown(map)).toContain('  - [x] Write it\n');
  });

  it('writes the undone siblings of a done node as empty boxes, so the list is consistent', () => {
    const map = done(
      buildMap({ text: 'Root', children: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }] }),
      'Two'
    );
    const text = toMarkdown(map);
    expect(text).toContain('  - [ ] One\n');
    expect(text).toContain('  - [x] Two\n');
    expect(text).toContain('  - [ ] Three\n');
    expect(text).toContain('- Root\n');
  });

  it('leaves a subtree with no done node as plain bullets', () => {
    expect(toMarkdown(sampleMap())).not.toContain('[ ]');
  });

  it('does not put a box on a cousin of a done node', () => {
    const map = done(
      buildMap({
        text: 'Root',
        children: [
          { text: 'Alpha', children: [{ text: 'Ticked' }] },
          { text: 'Beta', children: [{ text: 'Untouched' }] }
        ]
      }),
      'Ticked'
    );
    expect(toMarkdown(map)).toContain('    - Untouched\n');
  });

  it('reads a tick, an upper case tick and an empty box back', () => {
    const map = fromMarkdown('# T\n\n- Root\n  - [x] one\n  - [X] two\n  - [ ] three\n', {
      ids: idSource()
    });
    expect(doneRows(map)).toEqual([
      ['Root', false],
      ['one', true],
      ['two', true],
      ['three', false]
    ]);
  });

  it('keeps a node whose text is literally a checkbox out of the ticks', () => {
    const map = buildMap({ text: 'Root', children: [{ text: '[x] not a task' }] });
    const back = fromMarkdown(toMarkdown(map), { ids: idSource('r') });
    expect(doneRows(back)).toEqual([
      ['Root', false],
      ['[x] not a task', false]
    ]);
  });

  it('round trips the done tick', () => {
    const map = done(
      buildMap({ text: 'Root', children: [{ text: 'One' }, { text: 'Two' }] }),
      'One'
    );
    expect(doneRows(roundTrip(map))).toEqual(doneRows(map));
  });

  describe('a node whose own words begin with a checkbox', () => {
    const texts = ['[x] bought', '[ ] not bought', '[X] shouted', '[x]', '[ ]tight', '[y] no box'];
    const literal = () => buildMap({ text: 'Root', children: texts.map(text => ({ text })) });

    it('round trips exactly when nothing is ticked', () => {
      expect(doneRows(roundTrip(literal()))).toEqual(doneRows(literal()));
    });

    it('round trips exactly beside a ticked sibling, and when it is itself ticked', () => {
      const map = done(done(literal(), '[ ] not bought'), '[x]');
      expect(doneRows(roundTrip(map))).toEqual(doneRows(map));
    });

    it('round trips exactly on the centre', () => {
      const map = buildMap({ text: '[x] the centre', children: [{ text: 'One' }] });
      expect(doneRows(roundTrip(map))).toEqual(doneRows(map));
    });

    it('is written behind a box of its own, which is what protects it', () => {
      const map = buildMap({ text: 'Root', children: [{ text: '[x] bought' }] });
      expect(toMarkdown(map)).toContain('  - [ ] [x] bought');
    });
  });
});

describe('fromMarkdown, by the thousand', () => {
  describeImportCaps({
    read: (text, options = {}) => fromMarkdown(text, { ids: idSource(), ...options }),
    flat: count =>
      ['# T', '', '- Centre', ...Array.from({ length: count - 1 }, (_, at) => `  - n${at}`)].join(
        '\n'
      ),
    nested: levels =>
      Array.from({ length: levels }, (_, at) => `${' '.repeat(at)}- level ${at}`).join('\n'),
    unnamed: () =>
      ['- [ ]', '  - [x]', '  -', '  - [ ] ', '  - [src](https://example.org/a)'].join('\n')
  });

  it('names a bullet that is only a checkbox, and keeps its tick', () => {
    const map = fromMarkdown('# T\n\n- Centre\n  - [x]\n', { ids: idSource() });
    const [child] = map.nodes[map.rootId].children.map(id => map.nodes[id]);
    expect(child).toMatchObject({ text: '(untitled)', done: true });
  });

  it('keeps a src link only when it is safe to follow', () => {
    const map = fromMarkdown(
      [
        '# T',
        '[src](javascript:location=name)',
        '',
        '- Root',
        '  - ok [src](https://example.org/a)',
        '  - bad [src](JavaScript:location=name)',
        '  - data [src](data:text/html,x)'
      ].join('\n'),
      { ids: idSource() }
    );
    const sourceOf = text => Object.values(map.nodes).find(node => node.text === text).source;
    expect(map.source).toBeNull();
    expect(sourceOf('ok')).toEqual({ url: 'https://example.org/a', quote: '', title: '' });
    expect(sourceOf('bad')).toBeNull();
    expect(sourceOf('data')).toBeNull();
  });

  it('counts the root it makes from the title against the cap', () => {
    const several = Array.from({ length: 5000 }, (_, at) => `- n${at}`).join('\n');
    expect(() => fromMarkdown(several, { ids: idSource() })).toThrow(
      expect.objectContaining({ code: 'TOO_MANY_NODES' })
    );
  });
});
