/**
 * Shared fixtures for the mind map core suites.
 *
 * Ids are handed in by the caller everywhere in core (core never calls crypto), so the tests use a
 * plain counter. A seeded generator rather than a random one keeps every failure reproducible.
 */

import { createMap, createNode } from '../../../../../src/features/mindMap/core/map-model.js';
import { addChild } from '../../../../../src/features/mindMap/core/map-ops.js';

/** @returns {() => string} a fresh deterministic id source, `n1`, `n2`, … */
export function idSource(prefix = 'n') {
  let seen = 0;
  return () => `${prefix}${++seen}`;
}

/**
 * Build a map from a nested literal: `{ text, notes?, source?, collapsed?, children: [...] }`.
 * The first entry is the root.
 */
export function buildMap(spec, { id = 'm1', title = 'Map' } = {}) {
  const ids = idSource();
  const rootId = ids();
  let map = createMap({ id, title, rootId, rootText: spec.text });
  map = {
    ...map,
    nodes: {
      ...map.nodes,
      [rootId]: { ...map.nodes[rootId], notes: spec.notes || '', collapsed: Boolean(spec.collapsed) }
    }
  };

  const addAll = (parentId, children) => {
    for (const child of children || []) {
      const childId = ids();
      map = addChild(map, {
        parentId,
        node: createNode({
          id: childId,
          text: child.text,
          notes: child.notes || '',
          collapsed: Boolean(child.collapsed),
          colour: child.colour === undefined ? null : child.colour,
          source: child.source || null
        })
      });
      addAll(childId, child.children);
    }
  };
  addAll(rootId, spec.children);
  return map;
}

/** A three-generation map: root → a, b → a1, a2, b1. */
export function sampleMap() {
  return buildMap({
    text: 'Root',
    children: [
      { text: 'Alpha', children: [{ text: 'Alpha one' }, { text: 'Alpha two' }] },
      { text: 'Beta', children: [{ text: 'Beta one' }] }
    ]
  });
}

/** A mulberry32 PRNG — deterministic, so a property-style failure can be replayed. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['plan', 'evidence', 'argument', 'source', 'quote', 'idea', 'note', 'chapter', 'theme', 'question'];

/** A randomly shaped but reproducible map, for round-trip and layout properties. */
export function randomMap(seed, { nodes = 24 } = {}) {
  const random = seededRandom(seed);
  const word = () => WORDS[Math.floor(random() * WORDS.length)];
  const phrase = () => Array.from({ length: 1 + Math.floor(random() * 6) }, word).join(' ');

  const ids = idSource();
  const rootId = ids();
  let map = createMap({ id: `seed-${seed}`, title: phrase(), rootId, rootText: phrase() });
  const pool = [rootId];
  for (let i = 1; i < nodes; i += 1) {
    const parentId = pool[Math.floor(random() * pool.length)];
    const childId = ids();
    map = addChild(map, {
      parentId,
      node: createNode({
        id: childId,
        text: phrase(),
        notes: random() < 0.3 ? `${phrase()}\n${phrase()}` : '',
        source: random() < 0.25 ? { url: `https://example.org/${word()}`, quote: '', title: '' } : null
      })
    });
    pool.push(childId);
  }
  return map;
}
