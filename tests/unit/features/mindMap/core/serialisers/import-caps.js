/**
 * The caps every importer shares, asserted once and run against each of them.
 *
 * An importer hands over two builders for its own format, `flat(count)` and `nested(levels)`, each
 * returning a document holding exactly that many nodes, and the suite checks the behaviour at the
 * edge: exactly on the cap opens, one past it is refused with the shared sentence, and a lower cap
 * taken from the options behaves the same way.
 *
 * The defect the size cases guard against was an import that copied the whole map for every node it
 * added: quadratic, so a hundred times slower rather than a little. That is checked as growth, not
 * as a time budget. Ten times the nodes must cost well under the hundred times a quadratic import
 * costs; both sizes are timed on the same machine, each at its fastest of a few runs, so a
 * busy machine slows both and the ratio holds. The one wall-clock check left is a SMOKE ceiling,
 * about ten times what the reference machine takes, for a catastrophe and nothing finer.
 *
 * The same suite holds the other rule every importer shares: whatever the file called its nodes,
 * none of them arrives without a name, because a row with no text has no accessible name.
 */

import {
  MindMapError,
  validateMap,
} from '../../../../../../src/features/mindMap/core/map-model.js';
import { toMarkdown } from '../../../../../../src/features/mindMap/core/serialisers/markdown.js';

export const TOO_MANY_NODES_SENTENCE =
  'This file holds more than 5,000 nodes, which is more than a mind map can show, so it has not been opened.';

export const TOO_DEEP_SENTENCE =
  'This file nests nodes more than 100 levels deep, which is deeper than a mind map can be read, so it has not been opened.';

/** Catastrophic-regression ceiling for one import of the largest file, in ms. Not a benchmark. */
const SMOKE_CEILING_MS = 20000;

/** Ten times the nodes: a linear import costs about 10x, a quadratic one about 100x. */
const GROWTH_LIMIT = 40;

/** The fastest of `runs` timings of `run`, so a pause on a busy machine does not count. */
function fastest(run, runs = 5) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

const refusal = run => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MindMapError);
    return error;
  }
  return { code: null, message: '' };
};

/**
 * @param {Object} spec
 * @param {(document: *, options?: Object) => Object} spec.read - returns the imported map.
 * @param {(count: number) => *} spec.flat - a document of `count` nodes, all but one under the root.
 * @param {(levels: number) => *} spec.nested - a document of `levels` nodes, each inside the last.
 * @param {() => *} spec.unnamed - a document whose nodes have no names, in every way the format
 *   has of writing one.
 * @param {string} [spec.farTooDeep='TOO_DEEP'] - the refusal for six thousand levels. A format
 *   whose nodes are counted before they are nested meets the node cap first.
 */
export function describeImportCaps({ read, flat, nested, unnamed, farTooDeep = 'TOO_DEEP' }) {
  const blankNodes = map => Object.values(map.nodes).filter(node => node.text.trim() === '');

  describe('names', () => {
    it('never returns a node with a blank name, however the file left it unnamed', () => {
      const map = read(unnamed());
      expect(validateMap(map)).toEqual([]);
      expect(blankNodes(map)).toEqual([]);
      expect(map.title.trim()).not.toBe('');
    });

    it('nor from the largest and the deepest file it will open', () => {
      expect(blankNodes(read(flat(5000)))).toEqual([]);
      expect(blankNodes(read(nested(100)))).toEqual([]);
    });
  });

  describe('import caps', () => {
    it('opens exactly five thousand nodes as a map that still exports', () => {
      const document = flat(5000);
      const started = performance.now();
      const map = read(document);
      // SMOKE TEST: a catastrophe only; the growth check below is the real guard.
      expect(performance.now() - started).toBeLessThan(SMOKE_CEILING_MS);
      expect(Object.keys(map.nodes)).toHaveLength(5000);
      expect(validateMap(map)).toEqual([]);
      expect(toMarkdown(map).match(/^\s*- /gm)).toHaveLength(5000);
    });

    it('grows in proportion to the file, not with the square of it', () => {
      const small = flat(500);
      const large = flat(5000);
      read(small); // warm up, so the first timing is not the compiler's
      const growth =
        fastest(() => read(large)) /
        Math.max(
          fastest(() => read(small)),
          0.05
        );
      expect(growth).toBeLessThan(GROWTH_LIMIT);
    });

    it('refuses one node more, with the sentence every importer uses', () => {
      const error = refusal(() => read(flat(5001)));
      expect(error.code).toBe('TOO_MANY_NODES');
      expect(error.message).toBe(TOO_MANY_NODES_SENTENCE);
    });

    it('refuses ten thousand nodes at once, not after reading them', () => {
      const document = flat(10000);
      const started = performance.now();
      expect(refusal(() => read(document)).code).toBe('TOO_MANY_NODES');
      // SMOKE TEST: a catastrophe only.
      expect(performance.now() - started).toBeLessThan(SMOKE_CEILING_MS);
    });

    it('opens exactly a hundred levels as a map that still exports', () => {
      const map = read(nested(100));
      expect(Object.keys(map.nodes)).toHaveLength(100);
      expect(validateMap(map)).toEqual([]);
      expect(toMarkdown(map).match(/^\s*- /gm)).toHaveLength(100);
    });

    it('refuses one level more, with the sentence every importer uses', () => {
      const error = refusal(() => read(nested(101)));
      expect(error.code).toBe('TOO_DEEP');
      expect(error.message).toBe(TOO_DEEP_SENTENCE);
    });

    it('refuses six thousand levels without running out of stack', () => {
      expect(refusal(() => read(nested(6000))).code).toBe(farTooDeep);
    });

    it('takes a lower cap from its options, and never a higher one', () => {
      expect(Object.keys(read(flat(3), { maxNodes: 3 }).nodes)).toHaveLength(3);
      expect(refusal(() => read(flat(4), { maxNodes: 3 })).code).toBe('TOO_MANY_NODES');
      expect(Object.keys(read(nested(2), { maxDepth: 2 }).nodes)).toHaveLength(2);
      expect(refusal(() => read(nested(3), { maxDepth: 2 })).code).toBe('TOO_DEEP');
      expect(refusal(() => read(flat(5001), { maxNodes: 1e9 })).code).toBe('TOO_MANY_NODES');
      expect(refusal(() => read(nested(101), { maxDepth: 1e9 })).code).toBe('TOO_DEEP');
    });
  });
}
